---
id: share-groups-e-alternativas
title: "Share groups e alternativas"
summary: "Semântica de fila dentro do Kafka com o KIP-932, e a comparação honesta com RabbitMQ, SQS, Pulsar e Flink — por caso de uso, não por hype."
estimatedMinutes: 40
references:
  - title: "KIP-932: Queues for Kafka"
    url: https://cwiki.apache.org/confluence/display/KAFKA/KIP-932%3A+Queues+for+Kafka
  - title: "Apache Kafka — Documentation"
    url: https://kafka.apache.org/documentation/
  - title: "Apache Flink — Documentation"
    url: https://nightlies.apache.org/flink/flink-docs-stable/
---

## O buraco que o Kafka tinha

O consumer group amarra **uma partição a um consumidor** (marco 04). Isso é o que dá
ordem e é o que impede o Kafka de ser uma fila de tarefas decente:

- O paralelismo tem teto no número de partições.
- Uma mensagem lenta **bloqueia** as que estão atrás dela na mesma partição.
- Não existe ack individual: o offset é uma posição, não um conjunto de mensagens
  concluídas.

Para "enviar comprovante por e-mail", nada disso é desejável. Você quer 50 workers
puxando tarefas, cada um confirmando a sua, sem ordem nenhuma. Historicamente, a
resposta era: use SQS ou RabbitMQ para isso.

## Share groups (KIP-932)

O **share group** traz semântica de fila para dentro do Kafka. As diferenças que
importam:

| | Consumer group | Share group |
| --- | --- | --- |
| Partição por consumidor | uma só | **vários consumidores na mesma partição** |
| Confirmação | offset (posição) | **ack por registro** |
| Paralelismo máximo | nº de partições | independente das partições |
| Ordem | garantida por partição | **não garantida** |
| Mensagem problemática | bloqueia a partição | é liberada e reentregue, com contador |

Cada registro entregue tem um estado (adquirido, confirmado, liberado, rejeitado) e um
tempo de aquisição: se o consumidor não confirmar, o registro volta a ficar disponível
para outro. É o modelo de fila clássico, com o log do Kafka por baixo — o que preserva a
retenção e o replay.

**Maturidade exige cautela.** É um recurso recente e a semântica de fila dentro de um log
tem cantos que ainda estão sendo lapidados. O conselho para uma fintech: use para carga
tolerante a reprocessamento e sem ordem (notificação, e-mail, geração de comprovante), e
não migre o caminho do dinheiro para ele antes de ter operação real acumulada. O
consumer group tradicional continua sendo o caminho para o que é crítico.

O valor real, quando amadurecer, é **uma tecnologia a menos**: hoje muita empresa opera
Kafka *e* SQS/RabbitMQ porque precisa dos dois modelos.

## Kafka vs RabbitMQ vs SQS vs Pulsar

Sem torcida, por característica que decide:

**RabbitMQ** — roteamento sofisticado (exchanges, topic/fanout/headers), ack por mensagem,
prioridade, TTL por fila. A mensagem some ao ser confirmada: **não há replay**. Escolha
quando o roteamento é complexo e o histórico é irrelevante. Não escolha quando você
precisa reprocessar ou quando vários consumidores independentes precisam do mesmo fluxo.

**SQS** — fila gerenciada, operação praticamente zero, escala elástica, DLQ nativa. Sem
replay, sem ordem (exceto FIFO, com limite de throughput), retenção máxima curta.
Escolha para fila de tarefas em AWS quando você não quer operar nada. É frequentemente a
escolha certa e a que engenheiros rejeitam por ser pouco interessante.

**Pulsar** — separa computação de armazenamento (brokers sem estado + BookKeeper), tem
multi-tenancy e geo-replicação nativas e suporta os dois modelos de consumo. Tecnicamente
elegante; o ecossistema e a base de conhecimento contratável são menores. É uma decisão
de "quem vai operar isso em 3 anos" tanto quanto técnica.

**Kafka** — replay, retenção longa, múltiplos consumidores independentes, ordem por
chave, ecossistema enorme (Connect, Streams, Schema Registry). Custa operação e, sem
share groups, é ruim como fila de tarefas.

### Streams vs Flink vs ksqlDB

- **Kafka Streams** — biblioteca dentro da sua app, só Java, só Kafka como fonte e
  destino. Nada para operar além da sua aplicação.
- **Flink** — cluster de processamento próprio, várias fontes e destinos, checkpointing
  robusto, tratamento de event time mais rico, SQL maduro, e escala para volumes que o
  Streams não alcança confortavelmente. Custa um cluster e uma especialidade.
- **ksqlDB** — SQL sobre streams, ótimo para exploração e transformação simples; a lógica
  vive em SQL, o que é uma vantagem até virar uma desvantagem de testabilidade e
  versionamento.

Critério: comece por Streams se a sua fonte e destino são Kafka e a equipe é Java. Vá
para Flink quando precisar de várias fontes, de escala grande, ou de semântica de tempo
que o Streams não dá. Não escolha Flink porque é mais poderoso — escolha porque um
requisito concreto exigiu.

## Exemplo numa fintech

O `pix-stream` tem dois fluxos com necessidades opostas, e tratá-los igual é o erro:

- **`payments.authorized`** — ordem por conta, replay para reconciliação D+1, três
  consumidores independentes. É Kafka com consumer group, e as partições são
  dimensionadas pela ordem que se quer.
- **Envio de comprovante** — sem ordem, sem replay, tolerante a atraso, e o volume varia
  10× entre madrugada e pico. Forçar isso num tópico particionado é gastar partição e
  paralelismo travado para resolver um problema que não existe. Aqui, share group (ou
  SQS) é a resposta.

A frase para levar: **partição é um recurso caro que compra ordem.** Se você não precisa
da ordem, não pague por ela.

## Hands-on

**Quiz.** Este marco é comparativo e não tem laboratório próprio — a avaliação é a
capacidade de escolher.

**Exercício de decisão** (opcional, e vale mais que um laboratório). Para cada caso
abaixo, escolha a tecnologia, escreva **duas linhas** de justificativa e diga qual seria a
segunda opção:

1. Notificar o app do cliente quando o pagamento é aprovado. Perda ocasional é tolerável;
   volume 10× no pico.
2. Ledger que precisa reprocessar 90 dias após um bug de cálculo de tarifa.
3. Roteamento de eventos para 12 destinos, cada um com um filtro diferente de conteúdo.
4. Agregação de TPV por janela de 1 minuto, alimentando um painel executivo.
5. Fila de geração de PDF de extrato: uma tarefa leva 30 segundos, o volume é irregular e
   uma falha exige tentar de novo sem bloquear as outras.

O caso 5 é o que separa quem entendeu: numa partição, a tarefa de 30 segundos bloqueia
tudo atrás dela.

## Principais aprendizados

- Share groups dão ack por registro e paralelismo desacoplado das partições — semântica
  de fila com o log por baixo, ainda para usar com cautela no caminho do dinheiro.
- RabbitMQ é roteamento sem replay; SQS é operação zero sem replay; Pulsar é elegante com
  ecossistema menor; Kafka é replay e múltiplos consumidores ao custo de operação.
- Streams para fonte e destino Kafka em Java; Flink quando um requisito concreto de
  fonte, escala ou tempo exigir.
- Partição compra ordem e é cara: fila de tarefas sem ordem não deveria pagar por ela.
