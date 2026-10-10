---
id: apis-como-contrato
title: "APIs como contrato"
summary: "A API é o produto que sobrevive ao código que a implementa; o contrato é o artefato que o CI deve proteger. gRPC × REST × evento por critério, e o que de fato é breaking change."
estimatedMinutes: 60
references:
  - title: "RFC 9457 — Problem Details for HTTP APIs"
    url: https://www.rfc-editor.org/rfc/rfc9457
  - title: "OpenAPI Specification"
    url: https://spec.openapis.org/oas/latest.html
  - title: "oasdiff — OpenAPI diff and breaking changes"
    url: https://github.com/oasdiff/oasdiff
  - title: "Buf — breaking change detection"
    url: https://buf.build/docs/breaking/overview/
---

## API-first: contrato antes da implementação

Escrever o OpenAPI (ou o `.proto`) **antes** do código força decisões de modelagem antes de uma
linha de implementação existir para defender o design errado por inércia ("já está feito, vamos
manter"). O contrato vira o artefato que dois times — consumidor e provedor — concordam **antes**
de qualquer um escrever código, e é o que o CI protege dali em diante.

## Recursos, paginação, idempotência, erro

**Recursos** nomeiam substantivos, não verbos: `/payments`, não `/createPayment`. **Paginação por
cursor** (um token opaco que aponta "a partir daqui") é a escolha correta para qualquer listagem que
muda enquanto é paginada — `OFFSET` quebra sob inserção concorrente, pulando ou repetindo itens.

**`Idempotency-Key`** em todo `POST` que cria recurso financeiro: o cliente gera uma chave única por
tentativa lógica, o servidor a guarda e devolve a **mesma resposta** se a chave repetir — sem isso,
um retry de rede (o cliente nunca sabe se o `POST` chegou) vira débito duplicado.

**RFC 9457** (Problem Details, que obsoleta a RFC 7807) padroniza o corpo de erro:
`application/problem+json` com `type`, `title`, `status`, `detail`, `instance`. Erro estruturado
substitui a prática de cada endpoint inventar seu próprio formato de erro, que obriga todo cliente
a tratar erro endpoint por endpoint.

## O que é *breaking*, e o que não é

Mudança **compatível**: adicionar um campo opcional na resposta, adicionar um endpoint novo,
adicionar um valor a um enum **se o contrato já documentava que o cliente deve tolerar valores
desconhecidos**. Mudança **incompatível**: remover ou renomear um campo, mudar o tipo de um campo,
tornar opcional algo que era obrigatório **na resposta** (o cliente pode depender da presença),
tornar obrigatório algo que era opcional **na requisição** (o cliente antigo para de enviar e
quebra). A tabela de regras exatas vive na documentação do `oasdiff` e é o que o CI consulta — não
decoreba.

## gRPC × REST × evento: critério, não preferência

| Critério | REST/HTTP | gRPC | Evento |
| --- | --- | --- | --- |
| Consumidor é navegador ou parceiro externo público | sim | raro (precisa de gRPC-Web ou gateway) | não aplicável |
| Latência interna crítica, muitas chamadas pequenas | aceitável | melhor (HTTP/2, binário) | não aplicável (assíncrono) |
| Streaming bidirecional | limitado | nativo | nativo (por natureza) |
| Evolução de schema | por versão de endpoint | por número de campo no `.proto` | por contrato de evento (`arquitetura-eventos/05`) |
| Acoplamento temporal aceitável | sim, é síncrono | sim, é síncrono | não — é o ponto |

A pergunta que decide não é "qual é mais rápido" — é "quem consome, o que o consumidor tolera de
acoplamento temporal, e como o schema evolui". Para um parceiro externo (TPP do Open Finance),
REST com OpenAPI público é a escolha quase sempre certa; para comunicação interna de alto volume
entre serviços do mesmo time, gRPC ganha; para o que não precisa de resposta imediata, evento.

**Evolução de `.proto`**: o número de campo (`= 1`, `= 2`) nunca pode ser reutilizado, mesmo depois
de remover o campo original — um consumidor antigo que ainda espera o tipo antigo naquele número
interpretaria o novo campo com o tipo errado, silenciosamente. `buf breaking` verifica isso no CI.

## *Deadline* propagado, e BFF

*Deadline* (não apenas timeout local) propagado de ponta a ponta: se o cliente dá 300 ms para a
chamada inteira, e o primeiro salto já consumiu 100 ms, o segundo salto deveria saber que só tem
200 ms, não os 300 ms completos — do contrário, um salto profundo na cadeia pode estourar o
orçamento do cliente sem nunca saber que já devia ter desistido. **BFF** (Backend for Frontend)
agrega várias chamadas internas numa resposta moldada para um cliente específico (app mobile, web)
— não é um padrão de autenticação nem de autorização, é um padrão de agregação e formato.

> **Reencontro — `go-fintech/05`.** A implementação de gRPC em Go, com os detalhes de código-gerado
> e streaming, é daquele marco; aqui é o critério de **quando** usar gRPC, não o como. E
> `arquitetura-eventos/05` já tratou o evento como contrato versionado — a mesma disciplina de
> `oasdiff`/`buf` aplicada a Kafka.

## Exemplo numa fintech

Evoluir a API de iniciação de pagamento de v1 para v2 sem quebrar os TPPs que já integraram: v2
adiciona um campo opcional `metadata` (compatível), mas também quer tornar `description`
obrigatório na requisição (incompatível para quem não envia) — a saída é uma política de
depreciação: v1 continua servida com `Sunset` declarado, v2 aceita as duas formas por um período de
transição, e só depois do prazo de depreciação a obrigatoriedade é de fato imposta.

## Hands-on

**Tutorial.** Escreva o OpenAPI da iniciação de pagamento v1 e um *ruleset* do `spectral`: todo
`POST` exige `Idempotency-Key`; toda listagem usa cursor, nunca `offset`; todo erro segue
`application/problem+json`.

**Desafio.** Introduza três mudanças incompatíveis (remover um campo, mudar o tipo de um campo,
tornar um campo opcional em obrigatório na requisição) e uma mudança aditiva; rode `oasdiff` no CI.

**Invariantes testáveis**

1. As 3 mudanças incompatíveis plantadas quebram o CI (`oasdiff breaking` com `--fail-on ERR`).
2. A mudança aditiva passa sem erro.
3. Reutilizar um número de campo já removido no `.proto` é detectado por `buf breaking`.
4. Com um *deadline* de 300 ms definido no cliente, o serviço a jusante recebe, no máximo, o tempo
   restante depois do primeiro salto — nunca o orçamento completo original.

**Complemento.** Escreva a política de depreciação da v1: data de `Sunset`, o cabeçalho que a
sinaliza, e o canal pelo qual os TPPs são avisados.

**Checagem**

1. O que torna uma mudança de API *breaking*, e dê um exemplo que parece inofensivo mas não é.
2. Por que o número de campo de um `.proto` nunca pode ser reutilizado, mesmo após remover o
   campo original?
3. Quando gRPC é a escolha certa, e quando REST continua sendo?
4. O que `Idempotency-Key` resolve que um `POST` comum não resolve?

## Principais aprendizados

- Contrato antes da implementação evita defender um design ruim só porque "já está feito" — o
  artefato que o CI protege é o OpenAPI ou o `.proto`, não o código.
- `Idempotency-Key` em todo `POST` financeiro é o que evita débito duplicado quando o cliente não
  sabe se a chamada anterior chegou.
- *Breaking* ou não depende de direção: campo opcional virando obrigatório é incompatível na
  requisição e inofensivo na resposta — a mesma mudança, efeito oposto conforme o lado.
- gRPC × REST × evento é critério de consumidor, acoplamento temporal tolerado e evolução de
  schema — não preferência de time nem benchmark de velocidade.
- *Deadline* propagado (não timeout local isolado) evita que um salto profundo numa cadeia gaste
  um orçamento de latência que o cliente já esgotou.
