---
id: contratos-e-schema
title: "Contratos, schema e evolução"
summary: "O evento é API pública: compatibilidade de schema, o campo obrigatório que vira incidente, e como representar dinheiro num evento."
estimatedMinutes: 50
references:
  - title: "Confluent — Schema Registry Documentation"
    url: https://docs.confluent.io/platform/current/schema-registry/index.html
  - title: "Apache Avro — Specification"
    url: https://avro.apache.org/docs/current/specification/
  - title: "Martin Fowler — What do you mean by Event-Driven?"
    url: https://martinfowler.com/articles/201701-event-driven.html
---

## O evento é API pública

Um endpoint REST tem versão, documentação, dono e processo de depreciação. Um tópico
Kafka, na maioria das empresas, tem um nome que alguém escolheu numa quinta-feira.

Isso é um erro de categoria. O evento é **mais** público que o endpoint: você sabe quem
chama a sua API (está no log de acesso), mas não sabe quem consome o seu tópico — o
consumo é anônimo e assíncrono, e três squads podem depender de um campo sem você
saber. Mudar o schema é mudar um contrato com consumidores invisíveis.

### Três tipos de evento

A escolha é de acoplamento, e ela decide quanto dado trafega:

- **Event notification** — "aconteceu X, id 123". Payload mínimo; o consumidor volta na
  origem para buscar detalhes. Acoplamento baixo no dado, alto no tempo (a API de origem
  precisa estar no ar) — e um pico de eventos vira um pico de chamadas de volta.
- **Event-carried state transfer** — o evento carrega o estado necessário. O consumidor
  não precisa perguntar nada. É o padrão que faz o assíncrono realmente desacoplar, e o
  custo é payload maior e dado potencialmente desatualizado.
- **Event sourcing** — o log de eventos **é** a fonte da verdade; o estado é derivado.
  Poderoso e caro; exige disciplina de versionamento por toda a vida do sistema.

Para o `pix-stream`, **event-carried state transfer** é o padrão: o antifraude precisa
decidir sem chamar de volta o `pix-gateway`, senão o desacoplamento foi só aparente.

### Nomeação e ownership

Convenção que sobrevive: `<domínio>.<entidade>.<fato-no-passado>` —
`payments.initiated`, `payments.authorized`, `ledger.entry.posted`. Fato no passado,
sempre: `payment.created`, nunca `create.payment` (isso é comando, e comando disfarçado
de evento é o antipadrão do marco 14).

E o que quase ninguém escreve: **quem é o dono do tópico e quem revisa mudança de
schema**. Sem dono, o schema evolui por quem chegou primeiro no PR. O `CODEOWNERS` do
repositório de schemas é um artefato de governança barato e eficaz.

## Schema Registry e compatibilidade

O Schema Registry guarda os schemas versionados por *subject* (tipicamente
`<tópico>-value`). O producer registra e envia no payload apenas um **ID de 4 bytes** +
os dados binários; o consumidor busca o schema pelo ID e desserializa. Dois ganhos:
payload menor que JSON e validação no momento de registrar.

**Os modos de compatibilidade são a parte que importa**, e a confusão entre eles é a
origem da maioria dos incidentes de schema:

| Modo | Significa | Permite | Proíbe |
| --- | --- | --- | --- |
| `BACKWARD` | consumidor **novo** lê dado **velho** | remover campo; adicionar campo **com default** | adicionar campo obrigatório |
| `FORWARD` | consumidor **velho** lê dado **novo** | adicionar campo; remover campo com default | remover campo obrigatório |
| `FULL` | as duas | só mudanças com default | o resto |
| `NONE` | nada é verificado | tudo | nada — e você vai se arrepender |

`BACKWARD` é o padrão e o certo para a maioria: você atualiza os **consumidores
primeiro**, depois os producers. `FORWARD` inverte a ordem de deploy. `FULL` é o que
uma fintech usa nos tópicos que atravessam squads, porque não dá para coordenar a ordem
de deploy de quatro times.

**Campo obrigatório novo = incidente.** É a regra a decorar. Um campo sem default
quebra todo consumidor que ainda não conhece o schema novo — e como o consumo é
assíncrono, a quebra aparece minutos ou horas depois do deploy, longe da causa. A forma
correta de adicionar um campo obrigatório de fato:

1. Adicione **com default** (`null` ou um valor neutro). Compatível, ninguém quebra.
2. Faça todos os producers começarem a preenchê-lo.
3. Espere a retenção do tópico passar, para que não exista mais dado antigo sem o campo.
4. Só então torne-o obrigatório na *aplicação* — a validação de negócio, não no schema.

O passo 3 é o que ninguém tem paciência de esperar, e é o que separa a migração
tranquila do rollback às 2h.

## Dinheiro no evento

Nunca `float`. Nunca `double`. `0.1 + 0.2` não é `0.3` em ponto flutuante binário, e
essa diferença acumulada em milhões de lançamentos vira uma conciliação que não fecha.

Duas representações defensáveis:

```json
{ "amount": { "value": 15075, "currency": "BRL", "scale": 2 } }
```

**Inteiro na menor unidade** (`15075` centavos = R$ 150,75), com a moeda e a escala
explícitas. É o padrão do `pix-stream` e o mesmo `Money{Amount int64, Currency string}`
da trilha `go-fintech`. Rápido, exato, e o `scale` evita a suposição errada sobre moedas
que não têm 2 casas.

**String decimal** (`"150.75"`) para casos que precisam de escala variável — juros,
câmbio, fração de centavo. Preserva a precisão no transporte; o consumidor converte para
`BigDecimal`/`decimal.Decimal`. Mais legível, um pouco maior, e imune a intérprete de
JSON que converte número para double sozinho — o que acontece com mais frequência do
que se imagina.

O erro fatal é misturar as duas no mesmo domínio, ou omitir a moeda porque "é tudo BRL".
A empresa que opera em uma moeda hoje opera em duas depois de uma aquisição, e o evento
sem `currency` é irrecuperável.

## Exemplo numa fintech

Contrato estável entre squads e com parceiros, e o evento como **registro auditável de
intenção**: `payments.initiated` diz o que o cliente pediu, com timestamp e schema
versionado. Se a autorização depois divergiu, o par de eventos conta a história inteira
— e conta melhor do que uma tabela que foi sobrescrita.

A consequência de governança é que o schema entra no fluxo de mudança regulado: alterar
`payments.authorized` é uma mudança de contrato, com PR, revisor do time dono e registro.
No `fin-platform`, os schemas vivem num repositório próprio com `CODEOWNERS`, e o
pipeline **falha** se a compatibilidade quebrar — o que torna a regra automática em vez
de cultural.

## Hands-on

**Tutorial — Avro no `pix-stream`.** Suba um Schema Registry no Compose, defina o
schema Avro de `PaymentInitiated` (com `Money` como record aninhado), configure producer
e consumidor com o serializador Avro e publique. Depois:

1. Inspecione o payload bruto com `kafka-console-consumer` sem o desserializador Avro.
   Encontre o *magic byte* e os 4 bytes do schema ID no começo.
2. Consulte o schema pela API do registry: `curl localhost:8081/schemas/ids/1`.
3. Defina o subject como `FULL` e `git commit`.

**Desafio — evoluir sem quebrar.** Adicione ao evento um campo `canal` (`APP`, `PIX_QR`,
`API_PARCEIRO`), que o negócio descreve como **obrigatório**.

**Invariante testável**, e é isto que o desafio cobra:

1. Um teste que pega o schema **antigo** e o **novo** e afirma compatibilidade
   `FULL` — usando o endpoint `/compatibility/subjects/{s}/versions/latest` do registry,
   não a sua opinião.
2. Um consumidor rodando com o schema **v1** que continua processando eventos escritos
   com **v2**, sem exceção e sem perder os campos que ele conhece. Deixe-o rodando
   enquanto o producer novo publica — o teste é a ausência de erro.
3. Um teste que tenta adicionar `canal` **sem default** e afirma que o registry
   **rejeita**. Provar o bloqueio é tão importante quanto provar o sucesso.

Depois, escreva o plano de 4 passos (da seção "campo obrigatório novo") para tornar
`canal` realmente obrigatório, com o prazo em dias baseado na retenção do seu tópico.

**Checagem.** (a) `BACKWARD` — você atualiza producer ou consumidor primeiro? (b) Por
que adicionar campo obrigatório quebra o consumidor **horas** depois do deploy? (c) Por
que `float` para dinheiro no evento é pior do que no banco? (d) Você não sabe quem
consome o seu tópico — como descobre antes de mudar o schema?

## Principais aprendizados

- O evento é API pública com consumidores invisíveis; nome, dono e processo de mudança
  são parte do design, não burocracia.
- `BACKWARD` atualiza consumidor primeiro, `FORWARD` producer primeiro, `FULL` é o que
  atravessa squads sem coordenar deploy.
- Campo obrigatório novo é incidente: adicione com default, preencha, espere a retenção,
  e só então exija na aplicação.
- Dinheiro é inteiro na menor unidade (com moeda e escala) ou string decimal — nunca
  float, e nunca sem `currency`.
