---
id: producer
title: "Producer por dentro"
summary: "O caminho de uma mensagem até o broker, os botões que decidem durabilidade e latência, e por que a escolha da chave é uma decisão de arquitetura."
estimatedMinutes: 50
references:
  - title: "Apache Kafka — Producer Configs"
    url: https://kafka.apache.org/documentation/#producerconfigs
  - title: "Spring for Apache Kafka — Sending Messages"
    url: https://docs.spring.io/spring-kafka/reference/kafka/sending-messages.html
  - title: "franz-go — Producing"
    url: https://github.com/twmb/franz-go
---

## O caminho de uma mensagem

`send()` **não** manda nada para a rede. Ele coloca a mensagem numa fila em memória e
retorna. Entender esses cinco passos explica quase toda config do producer:

1. **Serialização** — chave e valor viram bytes (marco 07 troca isso por Avro).
2. **Particionador** — decide a partição. Com chave: `hash(chave) % nº de partições`.
   Sem chave: lotes distribuídos entre as partições (*sticky*), não round-robin por
   mensagem.
3. **Acumulador** — a mensagem entra num buffer por partição (`buffer.memory`). Se o
   buffer encheu, `send()` **bloqueia** até `max.block.ms` e então lança. Esse é o
   backpressure do producer, e quase ninguém sabe que ele existe até o incidente.
4. **Batch** — um lote fecha quando atinge `batch.size` **ou** quando `linger.ms`
   expira, o que vier primeiro. O lote é comprimido inteiro.
5. **Sender** — uma thread de I/O envia os lotes, até `max.in.flight.requests.per.connection`
   requisições simultâneas por broker, e trata retry.

O ponto que muda o desenho do seu código: **o resultado real chega depois**. Um
`send()` que "funcionou" não significa nada.

## Os botões que importam

### Durabilidade

`acks=0` é fire-and-forget (telemetria, no máximo). `acks=1` confirma quando o líder
gravou — e perde a mensagem se o líder morrer antes de replicar. `acks=all` espera o
ISR, e só ele, junto com `min.insync.replicas=2` do marco 02, sustenta "não perdi
dinheiro".

`enable.idempotence=true` (padrão desde a série 3.x) resolve **um** problema
específico: o retry interno duplicando a mensagem no log. O producer numera as
mensagens por partição e o broker descarta a repetida. É importante entender o escopo:

- **Resolve:** retry do producer gerando registro duplicado no log.
- **Não resolve:** você chamar `send()` duas vezes porque a sua aplicação reprocessou
  a requisição. Isso é idempotência de negócio, e mora na chave de idempotência no
  banco — a ponte com o marco de idempotência da trilha Spring Boot, e o assunto do
  marco 05.

Idempotência exige `acks=all`, `retries>0` e `max.in.flight<=5`.

### Latência × throughput

`linger.ms` é o tempo que o producer **espera de propósito** para juntar mais
mensagens no lote. `linger.ms=0` (padrão) manda assim que a thread de I/O estiver
livre. Subir para 5–20ms costuma multiplicar o throughput e reduzir a carga do broker,
ao custo de alguns milissegundos no p50 — e frequentemente **melhora** o p99, porque o
broker está menos sobrecarregado. É contraintuitivo o bastante para virar o desafio
deste marco.

`batch.size` é o teto em bytes por lote. `compression.type` (`zstd` ou `lz4` como
padrões razoáveis hoje) atua sobre o lote — lote maior comprime melhor.

### Ordem

Com `enable.idempotence=true`, `max.in.flight<=5` mantém ordem mesmo com retry,
porque o broker usa a numeração para reordenar. **Sem** idempotência, `max.in.flight>1`
com retry reordena mensagens: o lote 2 pode chegar antes do lote 1 reenviado. Esse é o
bug mais silencioso do Kafka — funciona meses até a primeira rede ruim.

`delivery.timeout.ms` é o prazo total (fila + envio + retries). Ele é o botão que
importa; `retries` sozinho é quase sempre a config errada de mexer.

## A chave é uma decisão de arquitetura

Escolher a chave é escolher, ao mesmo tempo:

- **A ordem que existe.** Mensagens com a mesma chave vão para a mesma partição e são
  ordenadas entre si. Tudo o mais não tem ordem.
- **O balanceamento.** A distribuição das chaves é a distribuição da carga.
- **O agrupamento de estado** em Kafka Streams e no compaction (marcos 09 e 02).

Numa fintech a chave quase sempre é a **conta**, não a transação. Chave por transação
(`paymentId`) dá distribuição perfeita e **ordem nenhuma que sirva**: débito e estorno
da mesma conta caem em partições diferentes e podem ser processados fora de ordem.
Chave por conta ordena o que importa.

O custo é a **partição quente**: se um cliente é 30% do volume, uma partição é 30% da
carga e nenhuma quantidade de consumidores resolve. Mitigações (chave composta com
sufixo, tópico dedicado para o cliente gigante) e seu preço em ordem estão no marco 06.

## O pecado do `send()` sem callback

```java
kafkaTemplate.send("payments.initiated", accountId, event); // erro assíncrono perdido
```

O broker fora do ar, o tópico inexistente, a mensagem maior que `max.request.size` —
tudo isso volta **depois**, no `Future`/callback. Ignorá-lo é aceitar perder pagamento
em silêncio. Trate o resultado sempre:

```java
kafkaTemplate.send("payments.initiated", accountId, event)
    .whenComplete((result, ex) -> {
        if (ex != null) {
            // marca o registro do outbox como pendente para o relay tentar de novo
            outbox.markFailed(event.id(), ex);
        }
    });
```

Em Go, com `franz-go`, o mesmo contrato aparece explícito na assinatura:

```go
cl.Produce(ctx, rec, func(r *kgo.Record, err error) {
    if err != nil {
        outbox.MarkFailed(ctx, eventID, err) // nunca ignore este err
    }
})
```

E a observação honesta: se o "tratar o erro" da sua callback for complicado, é sinal
de que a escrita deveria estar num **outbox** transacional junto com a mudança de
estado no banco — é o padrão do marco 08, e a razão de ele existir.

## Exemplo numa fintech

`acks=1` é a config que perde dinheiro em silêncio: 99,99% das vezes funciona, e o
0,01% coincide com a falha de broker que você não vai correlacionar com o pagamento
sumido. O padrão do `pix-stream` é `acks=all` + `enable.idempotence=true` +
`min.insync.replicas=2`, chave `accountId`, `compression.type=zstd`, e todo `send()`
com callback ligado ao outbox.

## Hands-on

**Tutorial — producer do `pix-stream` nas duas linguagens.** Publique
`payments.initiated` com as configs de fintech acima, em Spring Kafka e em Go
(`franz-go`), contra o mesmo tópico. Comparar as duas APIs é o objetivo: o Spring
esconde o producer atrás do `KafkaTemplate`, o Go deixa o protocolo à mostra — as duas
falam com o mesmo broker do mesmo jeito. Termine com `git commit`.

**Desafio — medir `linger.ms`.** Com `kafka-producer-perf-test.sh` ou um loop próprio,
produza 100k mensagens com `linger.ms=0` e depois com `linger.ms=20`, mantendo o resto
igual. Registre p50, p99 e throughput dos dois. Escreva **cinco linhas** explicando o
resultado — em particular, se o p99 piorou ou melhorou com o linger maior, e por quê.

**Invariante testável.** Um teste que produz com `acks=all` e `min.insync.replicas=2`,
derruba dois dos três brokers e afirma que o `send()` **falha** — nada de sucesso
silencioso.

**Checagem.** (a) `enable.idempotence=true` impede que o mesmo pagamento apareça duas
vezes no tópico se a sua API reprocessar a requisição HTTP? (b) Por que
`max.in.flight=5` com retry pode reordenar mensagens **sem** idempotência? (c) Chave
`paymentId` ou `accountId` para ordenar débito e estorno — e o que você perde na
escolha?

## Principais aprendizados

- `send()` só enfileira; durabilidade e erro chegam depois, e ignorar o callback é
  perder pagamento em silêncio.
- `acks=all` + `enable.idempotence` + `min.insync.replicas=2` é o piso de fintech;
  idempotência do producer resolve retry interno, não reprocessamento da aplicação.
- `linger.ms` troca alguns ms de p50 por throughput — e muitas vezes melhora o p99,
  porque alivia o broker.
- A chave define ordem, balanceamento e partição quente ao mesmo tempo: numa fintech,
  quase sempre a conta, nunca a transação.
