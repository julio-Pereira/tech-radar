---
id: streams-pubsub-e-quando-e-kafka
title: "Streams, Pub/Sub e quando é Kafka"
summary: "Pub/Sub é fire-and-forget; Streams é um log com grupos de consumo; Kafka é um log replicado e retido pelo tempo que você configurar. Escolher errado é perder mensagem ou pagar uma plataforma de que você não precisa. Pub/Sub e sharded Pub/Sub; XADD com MAXLEN; grupos de consumo, PEL, XACK e XAUTOCLAIM; dead-letter feito à mão; o consumidor idempotente; a durabilidade do stream; a tabela de decisão. Medido nos dois motores: o Pub/Sub perdeu as 50 mensagens publicadas durante um reinício, o Stream entregou todas, e um consumidor atrasado perdeu 9.000 de 10.050 para um MAXLEN de 1.000."
estimatedMinutes: 60
reviewedAt: 2026-11-20
reviewEvery: 6m
competencies: [arquitetura, confiabilidade]
references:
  - title: "Redis — Streams"
    url: https://redis.io/docs/latest/develop/data-types/streams/
  - title: "Redis — Pub/Sub"
    url: https://redis.io/docs/latest/develop/interact/pubsub/
  - title: "Valkey — Streams"
    url: https://valkey.io/topics/streams-intro/
---

## Três coisas com o mesmo nome de "mensageria"

As três entregam mensagens e prometem coisas muito diferentes:

- **Pub/Sub:** o servidor repassa a mensagem a quem está assinando **naquele instante**, e esquece. Não há
  histórico, não há confirmação, e quem não estava conectado não recebe. É no máximo uma vez;
- **Streams:** um *log* dentro de uma chave. A mensagem fica guardada, cada uma tem um id, e grupos de consumo
  dividem o trabalho e confirmam o que processaram. É pelo menos uma vez;
- **Kafka:** um *log* particionado, replicado entre *brokers* e retido pelo tempo ou tamanho que você configurar, com
  ordem por partição e *replay* a partir de qualquer posição (`kafka/01` e `/02`).

Escolher errado custa caro nos dois sentidos. Pub/Sub onde a mensagem não pode se perder perde mensagem. Kafka onde um
Stream bastava é uma plataforma a operar.

## Pub/Sub: no máximo uma vez

`PUBLISH canal mensagem` (O(N+M) nos assinantes) entrega a todos os conectados em `SUBSCRIBE canal` e devolve
quantos receberam. Uma conexão em modo de assinatura só recebe mensagens. Não há nada guardado para quem chegar
depois.

O laboratório publicou 150 mensagens. As 50 do meio foram publicadas enquanto o assinante reiniciava, como num
*deploy*. Nos dois motores, o Pub/Sub entregou 100. As 50 do reinício não chegaram a ninguém e não deixaram
rastro.

> **Armadilha.** Usar Pub/Sub para notificar "Pix recebido". O consumidor que estava reiniciando durante o
> *deploy* nunca vê a mensagem, e nada indica que ela se perdeu. O cliente recebe o dinheiro e não recebe a
> notificação. Mensagem que não pode se perder não vai por Pub/Sub.

No *cluster* do marco 11, o `PUBLISH` comum é repassado a **todos** os nós, porque o assinante pode estar em
qualquer um. O ***sharded* Pub/Sub** (`SSUBSCRIBE` e `SPUBLISH`, Redis 7.0+ e Valkey 7.2+) liga o canal a um
*slot*, como uma chave, e a mensagem fica no nó dono do *slot*. Ele escala e continua sendo no máximo uma vez.

O Pub/Sub é a ferramenta certa quando perder é aceitável: invalidar um cache local, avisar que uma configuração
mudou (o consumidor também relê ao subir), atualizar um painel ao vivo.

## Streams: um log com grupos de consumo

`XADD ntf:pix * pix_id E2E... valor 1500` (O(1)) acrescenta uma entrada e devolve o id, `<milissegundos>-<sequência>`.
A entrada fica na chave até ser cortada.

Os **grupos de consumo** dividem o stream entre consumidores:

- `XGROUP CREATE ntf:pix app $ MKSTREAM` cria o grupo `app`, que começa a ler a partir das próximas entradas;
- `XREADGROUP GROUP app consumidor-1 COUNT 100 STREAMS ntf:pix >` (O(M) nas devolvidas) entrega ao consumidor
  entradas que ninguém do grupo recebeu;
- cada entrada entregue entra na **PEL** (*pending entries list*) do grupo, com o consumidor que a recebeu, o
  instante e a **contagem de entregas**;
- `XACK ntf:pix app <id>` (O(1)) tira a entrada da PEL: ela foi processada.

Uma entrada entregue e não confirmada fica na PEL. Se o consumidor morre, ela fica lá, órfã. `XPENDING` (O(N) nas
devolvidas) mostra o que está pendente. `XAUTOCLAIM ntf:pix app consumidor-2 30000 0-0 COUNT 50` (O(1) com `COUNT`
pequeno) transfere para o `consumidor-2` as entradas que estão ociosas há mais de 30 s, e incrementa a contagem de
entregas de cada uma.

No laboratório, o consumidor A leu 100 notificações, processou e confirmou 30, processou mais 10 e morreu antes do
`XACK`. A PEL ficou com 70 entradas. O consumidor B, depois do tempo de ociosidade, reivindicou as 70 com
`XAUTOCLAIM`: 60 eram novas, e 10 eram repetições das que A já tinha processado. O efeito idempotente descartou as
10, a PEL terminou vazia, e houve exatamente 100 notificações, nos dois motores e nos dois clientes.

### O consumidor idempotente

As 10 repetições do laboratório não são um defeito: são a garantia. "Pelo menos uma vez" quer dizer que a mesma
entrada pode chegar duas vezes, sempre que um consumidor morre entre o efeito e o `XACK`. O consumidor tem de ser
idempotente pelo id do negócio (o identificador fim a fim do Pix), e não pelo id da entrada no stream, porque o
produtor também pode repetir um `XADD`. É o marco 05 aplicado ao consumo, e o inbox de `arquitetura-eventos/08`
quando o efeito é no banco.

### Dead-letter, feito à mão

Uma mensagem venenosa (que falha sempre) volta à PEL a cada falha e é reentregue para sempre. Os Streams não têm
*dead-letter* nativo, e o `fin-kv` faz assim: antes de processar, o consumidor lê a contagem de entregas com
`XPENDING`. Se ela passou de K, ele copia a entrada para `ntf:pix:dlq` com o id original, a contagem e o erro, e dá
`XACK` na original. No laboratório, com K = 3, a mensagem com valor inválido foi para a *dead-letter* com `entregas=3`,
a mensagem boa foi processada, e a PEL terminou vazia.

## O corte, e quanto replay ele permite

Um stream sem corte cresce até o `maxmemory`. O corte é feito no `XADD` ou no `XTRIM`:

- `MAXLEN = 1000` guarda exatamente as 1.000 entradas mais recentes;
- `MAXLEN ~ 1000` corta só nós inteiros da estrutura interna, e por isso é mais barato. Ele guarda **pelo menos**
  1.000;
- `MINID` corta pelo id, o que equivale a cortar por tempo.

O corte é a janela de *replay*: quanto do passado ainda está lá para quem precisar reler. Com 10.050 entradas
gravadas, o `MAXLEN = 1000` guardou 1.000, e o `MAXLEN ~ 1000` guardou 1.050. Um consumidor atrasado, que não tinha
lido nada, recebeu só o que restava e perdeu 9.050 e 9.000 entradas, nos dois motores. Elas foram cortadas antes de
ele ler, e o grupo de consumo não impediu isso. Para dimensionar o corte, divida-o pela taxa de produção. Um `MAXLEN`
de 100 mil, com 500 notificações por segundo no pico, guarda pouco mais de 3 minutos de pico.

> **Diferença Redis × Valkey.** Os Streams do Redis ganharam comandos que o Valkey 9.1 não tem:
>
> - **Redis 8.2:** `XADD` e `XTRIM` com `ACKED`, que só corta entradas confirmadas por todos os grupos. No
>   laboratório, 5.000 `XADD ACKED MAXLEN 1000` sem ninguém ter lido deixaram as 5.000. Nada se perdeu, e o stream
>   cresceu. Também chegaram `KEEPREF` e `DELREF`, `XACKDEL` e `XDELEX`;
> - **Redis 8.4:** `XREADGROUP ... CLAIM min-idle`, que entrega na mesma chamada as entradas novas e as pendentes
>   ociosas;
> - **Redis 8.6:** o produtor idempotente: `XADD ... IDMP produtor id`, configurado por `XCFGSET`;
> - **Redis 8.8:** `XNACK`, que devolve à PEL, sem confirmar, entradas que o consumidor reivindicou.
>
> O `fin-kv` usa só o que existe nos dois motores: `XAUTOCLAIM`, `XPENDING` e o corte por `MAXLEN`.

## A durabilidade do stream é a do Redis

O stream mora numa chave, e uma entrada confirmada pelo `XADD` está tão segura quanto qualquer escrita no Redis. Ela
pode se perder na janela do AOF num *crash* (marco 09) e no *failover* para uma réplica atrasada (marco 10). Com
`noeviction`, ela não é descartada por memória. Com uma política de *eviction*, o stream inteiro pode ser.

Por isso a fonte da verdade de um evento de negócio não é o Stream. É o *log* durável de onde ele veio.

## Exemplo numa fintech

A notificação de **Pix recebido** chega ao app do cliente em três passos:

1. o evento de crédito sai do `ledger-core` pelo *outbox* e entra no `pix-stream`, no Kafka, retido por dias e
   replicado. Essa é a fonte da verdade;
2. um serviço lê o tópico e faz `XADD ntf:pix MAXLEN ~ 100000` no Redis;
3. os notificadores leem em grupo de consumo, mandam o *push* com o identificador fim a fim como chave de
   idempotência, e confirmam com `XACK`. Um *job* com `XAUTOCLAIM` recupera o que ficou órfão, e o que falha três
   vezes vai para a *dead-letter*.

Por que não ler direto do Kafka? Porque o notificador é um serviço pequeno, com vários consumidores que entram e
saem a cada *deploy*. O grupo de consumo do Stream reparte o trabalho por mensagem, sem *rebalance* de partição, e
a PEL dá a reentrega por mensagem. Por que não pôr tudo no Stream? Porque, se o Redis perder dados, o serviço
relê o Kafka a partir do *offset* certo, e as notificações perdidas voltam. O Stream é a fila de trabalho. O Kafka é
o registro.

## A tabela de decisão

| Critério | Pub/Sub | Streams | Kafka |
| --- | --- | --- | --- |
| entrega | no máximo uma vez | pelo menos uma vez (PEL e `XACK`) | pelo menos uma vez, ou exatamente uma com transações (`kafka/05`) |
| retenção | nenhuma | até o corte (`MAXLEN`/`MINID`) e a memória | por tempo ou tamanho, em disco |
| *replay* | não | dentro do corte | a partir de qualquer *offset* retido |
| ordem | por canal, para quem está conectado | por stream | por partição |
| escala | um nó por canal (*sharded*: por *slot*) | uma chave num nó | partições em vários *brokers* |
| durabilidade | nenhuma | a do Redis (marcos 09 e 10) | replicação entre *brokers* |
| operação | nada a mais | o Redis que você já tem | um *cluster* a operar |

O ADR do `fin-kv` aplica a tabela aos três fluxos de mensagem do `fin-platform`:

- **invalidação de cache local:** Pub/Sub. Perder uma invalidação custa uma leitura velha até o TTL;
- **notificação de Pix recebido:** Streams, com o Kafka como fonte;
- **eventos de liquidação e do razão:** Kafka. São a verdade e precisam de *replay* por dias.

## Hands-on

**Tutorial.** Escreva o produtor e um grupo de consumo, em Go e em Java:

```go
rdb.XAdd(ctx, &redis.XAddArgs{Stream: "ntf:pix", MaxLen: 100_000, Approx: true,
    Values: map[string]any{"pix_id": e2e, "valor": centavos}})
msgs, _ := rdb.XReadGroup(ctx, &redis.XReadGroupArgs{Group: "app", Consumer: "n-1",
    Streams: []string{"ntf:pix", ">"}, Count: 100, Block: 2 * time.Second}).Result()
órfãs, prox, _ := rdb.XAutoClaim(ctx, &redis.XAutoClaimArgs{Stream: "ntf:pix", Group: "app",
    Consumer: "n-1", MinIdle: 30 * time.Second, Start: "0-0", Count: 50}).Result()
```

```java
var msgs = cmd.xreadgroup(Consumer.from("app", "n-1"), XReadArgs.Builder.count(100).block(2000),
        XReadArgs.StreamOffset.lastConsumed("ntf:pix"));
ClaimedMessages<String, String> orfas = cmd.xautoclaim("ntf:pix",
        XAutoClaimArgs.Builder.xautoclaim(Consumer.from("app", "n-1"), Duration.ofSeconds(30), "0-0").count(50));
```

**Desafio.** O notificador confiável: grupo de consumo, recuperação das órfãs, *dead-letter* e efeito idempotente
pelo identificador fim a fim.

**Invariantes testáveis**

Rodam contra o Redis **e** o Valkey. No laboratório desta trilha, todos os testáveis foram provados em Go; em Java, os de número 1 e 3.

1. Matando um consumidor no meio do processamento, toda mensagem é entregue a outro via `XAUTOCLAIM`, e o efeito é
   único.
2. A mensagem que falha K vezes vai para o stream de *dead-letter* com a contagem de entregas.
3. O mesmo cenário com Pub/Sub perde as mensagens publicadas durante o reinício. O teste **demonstra** a perda.
4. O stream respeita o `MAXLEN` declarado, e o teste mede quanto *replay* esse corte permite e quanto um consumidor
   atrasado perde.
5. O ADR aplica a tabela de decisão aos três fluxos de mensagem do `fin-platform`.

**Complemento.** Derrube o Redis sem persistência no meio do fluxo e reconstrua o stream a partir do *offset*
registrado do tópico Kafka. Quantas notificações saem duplicadas, e o que impede que o cliente as veja duas vezes?

**Checagem**

1. O que o Pub/Sub garante, e o que acontece com a mensagem publicada enquanto o assinante reinicia?
2. O que é a PEL, e como o `XAUTOCLAIM` recupera uma mensagem órfã?
3. Quanto *replay* um `MAXLEN ~ 100000` permite, e o que acontece com um grupo de consumo atrasado além do corte?
4. Quando a mensagem deve ir para o Kafka, e não para um Stream?

> **Reencontro — `kafka/10`; `arquitetura-eventos/08`; `aws-para-backend/05`; `azure-para-backend/05`.** O
> grupo de consumo do Stream reparte por mensagem, como os *share groups* e as alternativas de `kafka/10`. O
> consumidor idempotente e o inbox são os de `arquitetura-eventos/08`. A PEL com reentrega após ociosidade é o
> *visibility timeout* do SQS de `aws-para-backend/05`. E a contagem de entregas com *dead-letter* é o que o Service
> Bus de `azure-para-backend/05` dá pronto, e que aqui é feito à mão.

## Principais aprendizados

- Pub/Sub é no máximo uma vez: perdeu as 50 mensagens publicadas durante o reinício. Serve só onde perder é
  aceitável.
- Streams é um *log* com grupos de consumo: PEL, `XACK` e `XAUTOCLAIM` dão pelo menos uma vez, e o consumidor tem de ser
  idempotente pelo id do negócio.
- A *dead-letter* é feita à mão, com a contagem de entregas do `XPENDING`.
- O corte é a janela de *replay*. Um consumidor atrasado além dele perde o que foi cortado, e o grupo não o protege.
  `ACKED` (Redis 8.2+) muda isso, e o Valkey não tem.
- A durabilidade do stream é a do Redis. A fonte da verdade de um evento de negócio é o *log* durável de onde ele veio.
- Kafka quando o evento é a verdade, precisa de *replay* por dias ou de escala por partição.
