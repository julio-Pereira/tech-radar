---
id: kafka-connect
title: "Kafka Connect"
summary: "Integração declarativa sem código: workers, tasks, SMTs, sink idempotente, e por que escrever conector caseiro é quase sempre erro."
estimatedMinutes: 45
references:
  - title: "Apache Kafka — Kafka Connect"
    url: https://kafka.apache.org/documentation/#connect
  - title: "Confluent — Single Message Transforms"
    url: https://docs.confluent.io/platform/current/connect/transforms/overview.html
  - title: "Debezium — Connectors"
    url: https://debezium.io/documentation/reference/stable/connectors/
---

## Integração como configuração

Connect é um framework para mover dados **entre o Kafka e sistemas externos**, sem
escrever código: você faz um `POST` de um JSON com a configuração e o conector começa a
rodar.

- **Source** — traz dado de fora para o Kafka (CDC de banco, arquivos, APIs).
- **Sink** — leva dado do Kafka para fora (banco analítico, S3, Elasticsearch).

A arquitetura:

- **Worker** — o processo. Em **modo distribuído**, vários workers formam um grupo (o
  mesmo mecanismo de consumer group) e dividem o trabalho, com rebalance quando um cai.
  Modo standalone existe e serve para testes.
- **Connector** — a configuração lógica de uma integração.
- **Task** — a unidade de paralelismo. `tasks.max` define o teto, mas o conector decide
  quantas cria de fato — e para um sink o limite real continua sendo o número de
  partições. Pedir `tasks.max: 20` num tópico de 6 partições não dá 20 tarefas.
- **Converter** — como a mensagem é serializada (`AvroConverter` com Schema Registry, do
  marco 07). Converter mal configurado é a causa nº 1 de conector que não sobe, e o erro
  costuma ser ilegível.

O estado (offsets, configurações, status) vive em **tópicos internos** do Kafka, não em
disco local — é isso que torna o worker descartável e o modo distribuído confiável.

## SMTs: transformação de uma mensagem

**Single Message Transforms** são transformações leves aplicadas por mensagem, na
configuração: renomear campo, extrair um campo do payload para a chave, mascarar valor,
rotear por tópico, adicionar timestamp.

```json
"transforms": "mascarar,rotear",
"transforms.mascarar.type": "org.apache.kafka.connect.transforms.MaskField$Value",
"transforms.mascarar.fields": "cpf,pan",
"transforms.rotear.type": "org.apache.kafka.connect.transforms.TimestampRouter"
```

O limite é a definição: **uma mensagem por vez, sem estado**. Não há join, não há
agregação, não há lookup externo. Quando você começa a encadear seis SMTs para simular
lógica, o trabalho pertence ao Streams (marco 09) ou a um consumidor.

O uso mais valioso numa fintech é o **mascaramento na borda**: o `MaskField` remove PII
antes de o dado chegar ao data lake, o que é bem mais fácil do que apagá-lo depois
(marco 13).

## Idempotência do sink e tratamento de erro

Connect é **at-least-once** por padrão. O worker pode entregar ao destino e morrer antes
de commitar o offset — e o corolário é o de sempre nesta trilha: **o sink precisa ser
idempotente**.

Para um sink JDBC, isso significa `insert.mode=upsert` com `pk.fields` definindo a chave
de negócio. Sem isso, um replay duplica linhas na base analítica e o relatório passa a
divergir do ledger — um erro que costuma ser descoberto semanas depois, pela contabilidade.

Para tolerar replay, o mesmo raciocínio do marco 05: a chave precisa vir do **evento**
(`paymentId`), nunca ser gerada no momento da escrita.

O tratamento de erro é declarativo e vale configurar sempre:

```properties
errors.tolerance=all
errors.deadletterqueue.topic.name=connect.dlq.payments
errors.deadletterqueue.context.headers.enable=true
errors.log.enable=true
```

`errors.tolerance=all` sem DLQ configurada é **descartar mensagem em silêncio** — a pior
combinação possível, e ela é fácil de escrever por acidente. Os headers de contexto são o
que torna a DLQ investigável: eles dizem de qual tópico, partição e offset veio a
mensagem e qual exceção ocorreu.

## O antipadrão do conector caseiro

O reflexo comum ao ver Connect é: "isso eu escrevo em duas horas com um consumidor". Para
o caso feliz, é verdade. O que você escreve em duas horas não tem:

- Gestão de offset com rebalance e recuperação de falha.
- Paralelismo por task e redistribuição quando um worker cai.
- DLQ, política de erro, retry com backoff.
- Métricas JMX padronizadas e API de status.
- Conversão de schema e integração com o Schema Registry.
- Alguém mantendo quando o driver do destino mudar.

Escrever conector faz sentido quando **não existe** um mantido para o seu destino. Antes
disso, a pergunta é: por que o meu caso é diferente de todos os que usam o conector
oficial? Frequentemente a resposta honesta é "não é, eu só não quis ler a documentação".

O contraponto justo: Connect é mais uma peça para operar (workers, memória, rebalance) e
o debug pode ser frustrante — erro de converter, sobretudo. Para **uma** integração
simples num sistema pequeno, um consumidor pode ser a escolha certa. A partir da terceira
integração, Connect ganha.

## Exemplo numa fintech

**Trilha de auditoria replicada para storage frio com retenção regulatória.** O conflito
do marco 02 volta: o regulador quer anos de histórico, o broker não é lugar para isso.

O desenho no `pix-stream`:

1. Sink S3/GCS a partir de `payments.authorized`, particionado por data, formato Parquet.
2. SMT mascarando PII antes da escrita — o data lake **não** recebe CPF nem PAN.
3. Retenção de 7 dias no tópico, anos no storage frio com política de imutabilidade
   (*object lock*), que é o que satisfaz "não pode ser alterado".
4. Sink JDBC para o Postgres analítico com `insert.mode=upsert` e `pk.fields=payment_id`,
   tolerante a replay.

O ganho de conformidade: o dado quente fica onde é rápido, o dado regulatório fica onde é
barato e imutável, e a passagem entre os dois é configuração versionada em Git — não um
script que alguém roda.

## Hands-on

**Desafio — sink idempotente para o Postgres analítico.**

1. Suba um worker Connect em modo distribuído no Compose, junto com um Postgres.
2. Configure o JDBC Sink de `payments.authorized` com `insert.mode=upsert`,
   `pk.mode=record_value` e `pk.fields=payment_id`.
3. Adicione um SMT que **mascare** o CPF antes da escrita.
4. Configure DLQ com `errors.tolerance=all` e headers de contexto.

**Invariantes testáveis:**

1. Produza 5.000 eventos. `SELECT count(*)` = 5.000.
2. **Reprocesse do offset zero** (reset do grupo do conector). `SELECT count(*)`
   continua **5.000** — é o teste de idempotência, e é o motivo do `upsert`.
3. Injete um evento com payload inválido no meio: ele vai para a DLQ, o conector
   **continua rodando**, e os headers da mensagem na DLQ dizem tópico, partição, offset e
   exceção.
4. `SELECT cpf FROM pagamentos_analytics LIMIT 10` retorna apenas valores mascarados —
   nenhum CPF em claro chegou ao destino.

**Complemento — o teste que revela o descarte silencioso.** Configure
`errors.tolerance=all` **sem** DLQ, injete 10 mensagens inválidas e conte quantas
aparecem em algum lugar. A resposta é zero, e nada no log de nível normal indica perda.
Escreva 3 linhas sobre por que essa é a configuração mais perigosa do Connect.

**Checagem.** (a) Por que `tasks.max: 20` num tópico de 6 partições não dá 20 tarefas
num sink? (b) O que um SMT **não** consegue fazer? (c) Por que um sink JDBC sem
`insert.mode=upsert` quebra o relatório depois de um replay? (d) Quando escrever um
conector caseiro é defensável?

## Principais aprendizados

- Connect é integração como configuração: workers em modo distribuído, tasks limitadas
  pelas partições, e estado em tópicos internos.
- SMT é uma mensagem sem estado — mascarar PII na borda é seu melhor uso; lógica com
  estado pertence ao Streams.
- Connect é at-least-once: sink idempotente com `upsert` e chave vinda do evento, senão o
  replay duplica no destino.
- `errors.tolerance=all` sem DLQ descarta em silêncio; conector caseiro só quando não
  existe um mantido.
