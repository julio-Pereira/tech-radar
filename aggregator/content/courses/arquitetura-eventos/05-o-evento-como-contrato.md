---
id: evento-como-contrato
title: "O evento como contrato público"
summary: "Granularidade magro × gordo, o envelope canônico com a pergunta que cada campo responde num incidente, e a política de evolução — porque o schema é a decisão de acoplamento, não a ferramenta."
estimatedMinutes: 55
references:
  - title: "Martin Fowler — What do you mean by Event-Driven? (event-carried state transfer)"
    url: https://martinfowler.com/articles/201701-event-driven.html
  - title: "CloudEvents — Specification"
    url: https://github.com/cloudevents/spec
  - title: "Microservices.io — Domain event"
    url: https://microservices.io/patterns/data/domain-event.html
---

## Granularidade: magro ou gordo

A primeira decisão de um evento não é o nome, é **quanto ele carrega**.

**Evento magro** (event notification) leva ids e pouco mais: `{paymentId, accountId}`. É
pequeno, muda pouco e não espalha dado. O preço é que o consumidor precisa **chamar você de
volta** para saber o resto — e aí o acoplamento temporal que o marco 01 dizia ter sido
removido volta pela porta dos fundos: se o produtor está fora do ar, o consumidor trava.

**Evento gordo** (event-carried state transfer) leva o estado necessário para decidir:
valor, moeda, conta, resultado do risco. O consumidor fica autônomo — funciona mesmo com o
produtor fora do ar, e é o que permite reprocessar histórico sem consultar ninguém. O preço
é duplicação de dado, payload maior e **PII espalhada** por todos os lugares por onde o
evento passa: DLQ, data lake, log de consumidor, backup.

A tabela de decisão:

| Critério | Prefira magro | Prefira gordo |
| --- | --- | --- |
| Consumidor precisa decidir sozinho | não | **sim** |
| Dado muda depois da emissão | **sim** (busca o atual) | não (a foto congela) |
| Contém PII | **sim** | não, ou só com referência |
| Volume muito alto | **sim** | avalie custo |
| Consumidor externo à empresa | avalie | **sim** (não dê acesso à sua API) |

O erro comum não é escolher errado: é **não escolher**, e ir engordando o evento campo a
campo até ele ser o objeto de domínio inteiro serializado — o que já reprova pelo marco 02.

## O envelope canônico

Tudo que não é payload, padronizado. Cada campo existe porque responde a uma pergunta que
alguém faz **durante um incidente**:

| Campo | Pergunta que ele responde |
| --- | --- |
| `eventId` | já processei este exato evento? (a chave do inbox, marco 08) |
| `type` | o que é isto, sem abrir o payload? |
| `version` | qual formato estou lendo? |
| `occurredAt` | quando o fato aconteceu — não quando chegou |
| `producer` | quem publicou, para eu saber a quem perguntar |
| `correlationId` | de qual caso inteiro este evento faz parte? |
| `causationId` | qual evento ou comando causou este? |
| `tenant` | de quem é este dado, para isolamento e LGPD |
| `partitionKey` | qual a unidade de ordem — quase sempre a conta |

Dois pares merecem atenção. **`occurredAt` × momento da chegada**: a diferença entre os dois
é a idade do evento, e ela é uma das métricas que só existem em EDA (marco 11). E
**`correlationId` × `causationId`**: o primeiro dá o caso, o segundo dá a aresta. Com os
dois você reconstrói a árvore causal de um pagamento; com só o primeiro você tem uma lista.

Deixar cada squad inventar o próprio envelope é a decisão que se paga no primeiro incidente
que atravessa dois times, quando não há como correlacionar nada.

## Evolução: adicionar é barato, remover é incidente

Aqui vale a política, não a ferramenta. A mecânica de Schema Registry e compatibilidade
está em `kafka/07`; o que este marco define é **quando** cada movimento é legítimo.

- **Adicionar campo opcional** — barato, sempre permitido. É o movimento padrão.
- **Adicionar campo obrigatório** — quebra consumidor antigo. Vira opcional com default, e
  a obrigatoriedade chega numa versão futura, depois que todo mundo migrou.
- **Renomear** — é remover e adicionar. Não existe rename barato num contrato público.
- **Remover** — só depois de provar que ninguém lê. Se você não sabe quem lê, você não pode
  remover, e isso é uma consequência do acoplamento de dados do marco 01.
- **Mudar semântica sem mudar o schema** — o pior de todos, porque nenhuma ferramenta pega.
  `amount` que passa a ser líquido em vez de bruto tem o mesmo tipo e destrói a
  contabilidade de quem consome.

**Quando criar `V2` do evento** em vez de evoluir: quando a mudança altera o significado do
fato, quando o número de campos opcionais "temporários" passou de dois, ou quando você
precisaria de um campo obrigatório agora. `V2` custa publicar os dois por um período, com
data de fim escrita.

## PII no evento

Minimização desde o design é mais eficaz que qualquer criptografia: o campo que não existe
não vaza na DLQ, no data lake, no log do consumidor nem no trace — resolve em todos os
lugares de uma vez (é a lição de `kafka/13`, aqui aplicada ao desenho e não à operação).

Na prática: **referência em vez de valor**. O evento carrega `accountId` opaco; quem precisa
do CPF chama um serviço que registra o acesso. O conflito com log imutável — a LGPD manda
apagar, o registro contábil manda guardar — se resolve com crypto-shredding, e a decisão de
qual chave protege qual titular é de arquitetura, não de infraestrutura.

E boa parte da PII está no evento por acidente: alguém copiou o objeto de domínio inteiro.

## Ownership e catálogo

Um contrato sem dono não é contrato. Cada evento precisa de:

- **Um dono** — o contexto que o publica, com um nome de time atrás.
- **Um catálogo** — onde vive a documentação. O `EVENTOS.md` do marco 03 é a semente; em
  escala vira um catálogo navegável, gerado do schema.
- **Um caminho de aprovação** — quem aprova uma mudança, e como um consumidor é avisado.
- **Uma lista de consumidores conhecidos** — incompleta por natureza, e ainda assim o
  documento mais útil que existe quando você precisa mudar algo.

O critério de sucesso é simples: **um consumidor novo descobre o evento sem perguntar no
Slack**. Se não descobre, o catálogo é decorativo.

## Exemplo numa fintech

`PaymentAuthorized` é consumido por quatro squads internos e por um parceiro externo. O
squad de antifraude precisa adicionar `riskScore` ao evento — e alguém escreve o campo como
obrigatório, porque "todo pagamento tem score".

O deploy passa. Os testes passam. Nada acontece por horas — os consumidores continuam lendo
as mensagens antigas, que já estão no tópico. Quando a primeira mensagem no formato novo
chega ao consumidor do parceiro, que roda um cliente antigo, ele para. O alerta que dispara
é "lag crescendo", a três saltos de distância da causa.

Duas lições. A primeira é a política: campo novo nasce opcional, sempre. A segunda é sobre
o modo de falha — diferente de uma API síncrona, onde a quebra é imediata e óbvia, aqui ela
aparece **longe da causa e depois**, exatamente quando correlacionar é mais difícil. É o que
torna a disciplina de contrato mais importante em EDA do que em REST, e não menos.

## Hands-on

**Tutorial — o catálogo do `fin-flow`.**

1. Pegue o `EVENTOS.md` do marco 03. Para cada evento, defina o envelope completo com os
   nove campos, e escreva o payload mínimo.
2. Para cada evento, decida magro ou gordo e **escreva a justificativa** usando a tabela de
   critérios. Uma linha por decisão.
3. Marque todo campo que contém PII e substitua por referência opaca onde possível.
4. Declare o dono e os consumidores conhecidos de cada evento.
5. Escreva a política de evolução do repositório numa seção: o que é permitido sem aviso, o
   que exige aviso, o que exige `V2`.
6. `git commit -m "docs: catálogo de eventos com envelope e política de evolução"`.

**Desafio — o evento mal modelado.** Dado este evento, reescreva-o e justifique **cada**
mudança:

```json
{
  "event": "AuthorizePayment",
  "cpf": "123.456.789-00",
  "nome": "Maria Silva",
  "valor": 150.75,
  "conta": {"id": "acc-1", "saldo": 5000.00, "limite": 2000.00},
  "ts": "2026-08-15 14:30"
}
```

São pelo menos sete problemas. Encontre todos antes de olhar a lista dos aprendizados.

**Invariantes testáveis**

1. Todo evento do catálogo tem os nove campos do envelope, e nenhum campo do envelope está
   repetido dentro do payload.
2. Nenhum campo de PII aparece por valor sem uma justificativa escrita ao lado.
3. Toda decisão magro/gordo cita pelo menos um critério da tabela — não "achamos melhor".
4. Um teste de compatibilidade falha se um campo obrigatório for adicionado a um evento
   existente (o gate de CI é assunto do marco 12).

**Complemento.** Escreva o parágrafo que você mandaria aos consumidores anunciando uma
mudança de contrato: o que muda, quando, o que eles precisam fazer e até quando a versão
antiga vive. Se o parágrafo é difícil de escrever, a mudança provavelmente é maior do que
você pensou.

**Checagem**

1. Qual acoplamento o evento magro devolve, e qual custo o gordo cobra em troca?
2. Que pergunta cada um dos nove campos do envelope responde durante um incidente?
3. Por que "mudar semântica sem mudar o schema" é a pior evolução possível?
4. Por que a quebra de contrato num sistema de eventos aparece longe da causa, e o que isso
   exige da sua disciplina?

## Principais aprendizados

- Magro devolve acoplamento de disponibilidade; gordo dá autonomia e espalha duplicação e
  PII. O erro comum é não escolher e engordar o evento campo a campo.
- O envelope existe para responder perguntas de incidente: `eventId` é a chave do inbox,
  `correlationId` dá o caso e `causationId` dá a aresta da árvore causal.
- Adicionar campo opcional é barato; obrigatório quebra; renomear é remover e adicionar; e
  mudar semântica sem mudar schema é o que nenhuma ferramenta pega.
- PII se resolve por minimização no design — referência em vez de valor —, porque o campo
  que não existe não vaza em nenhum dos lugares por onde o evento passa.
- Um contrato sem dono e sem catálogo não é contrato. O critério é o consumidor novo
  descobrir o evento sem perguntar no Slack.
