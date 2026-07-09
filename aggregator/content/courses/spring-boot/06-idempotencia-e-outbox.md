---
id: idempotencia-e-outbox
title: "Idempotência e Transactional Outbox"
summary: "Idempotency-Key no padrão Stripe, o problema do dual-write e o outbox pattern com relay para Kafka — garantindo que um webhook reenviado não credite duas vezes."
estimatedMinutes: 45
references:
  - title: "Stripe — Idempotent Requests"
    url: https://docs.stripe.com/api/idempotent_requests
  - title: "microservices.io — Transactional Outbox"
    url: https://microservices.io/patterns/data/transactional-outbox.html
  - title: "Spring for Apache Kafka Reference"
    url: https://docs.spring.io/spring-kafka/reference/
---

## Por que idempotência é inegociável em pagamentos

A rede mente. Um cliente envia `POST /payments`, o gateway processa, mas a resposta se
perde no caminho; o cliente **reenvia**. Um PSP dispara um webhook de confirmação e, não
recebendo `200` a tempo, **reenvia 3 vezes**. Sem defesa, cada retransmissão vira um
débito ou um crédito extra — dinheiro criado ou destruído. Uma operação é **idempotente**
quando executá-la N vezes tem o mesmo efeito de executá-la uma vez.

## Idempotency-Key no padrão Stripe

O cliente gera uma chave única por *intenção* (um UUID por pagamento pretendido) e a
envia no header `Idempotency-Key`. O servidor:

1. Numa tabela `idempotency_keys` com **unique constraint** na chave, tenta inserir a
   chave **na mesma transação** do processamento.
2. Se a inserção **suceder**, processa e **persiste a resposta** associada à chave.
3. Se a inserção **violar a unique constraint**, a operação já foi feita: retorna a
   **resposta persistida**, sem reprocessar.

```java
@Transactional
public PaymentResponse initiate(String idemKey, PaymentRequest req) {
    return idempotencyStore.find(idemKey)
        .map(IdempotencyRecord::response)          // já processado → devolve o mesmo
        .orElseGet(() -> {
            PaymentResponse resp = process(req);   // primeira vez → processa
            idempotencyStore.save(idemKey, resp);  // unique constraint protege corrida
            return resp;
        });
}
```

A unique constraint é o coração: mesmo com duas requisições **simultâneas** com a mesma
chave, o banco deixa só uma inserir; a outra colide, faz rollback e reentrega a resposta
gravada. Idempotência de verdade se apoia numa garantia do banco, não num `if` na
aplicação.

## O problema do dual-write

Agora complique: ao processar o pagamento você precisa **gravar no banco** *e*
**publicar um evento** (`PaymentInitiated`) no Kafka para o antifraude e a conciliação.
Fazer os dois "juntos" é impossível de forma atômica — banco e Kafka são sistemas
distintos, sem transação compartilhada. Se você commita no banco e o `kafkaTemplate.send`
falha, o evento some. Se publica antes e o banco faz rollback, você anuncia um pagamento
que não existe. Isso é o **dual-write problem**, e "só chamar os dois em sequência" é a
armadilha que gera inconsistência silenciosa em produção.

## Transactional Outbox

A solução: **uma escrita só**. Na mesma transação do banco que grava o pagamento, você
insere o evento numa tabela `outbox`. Como é a *mesma* transação, ou os dois persistem
ou nenhum — atômico de verdade. Depois, um **relay** assíncrono lê o outbox e publica no
Kafka, marcando o que já enviou.

```java
@Transactional
public void initiate(PaymentRequest req) {
    Payment p = payments.save(new Payment(req));            // 1
    outbox.save(new OutboxEvent("PaymentInitiated", p));    // 2 — mesma transação
}   // commit atômico dos dois
```

```java
@Scheduled(fixedDelay = 500)
@Transactional
public void relay() {
    for (OutboxEvent e : outbox.findUnpublishedBatch(100)) {
        kafka.send("payments", e.aggregateId(), e.payload());
        e.markPublished();
    }
}
```

Duas verdades para internalizar:

- **Semântica de entrega é at-least-once.** O relay pode crashar entre o `send` e o
  `markPublished` e reenviar o evento. Portanto o **consumidor tem que ser idempotente**
  — mesma disciplina do início do marco, agora do outro lado do fio. Exactly-once
  distribuído é caro e quase sempre desnecessário; at-least-once + consumidor idempotente
  é o padrão da indústria.
- O outbox **desacopla** a transação de negócio da disponibilidade do Kafka: se o broker
  cair, os eventos acumulam no banco e drenam quando ele voltar. Sua API não fica refém
  da fila.

## Exemplo numa fintech

O **pix-gateway** recebe o webhook de confirmação do PSP. A `Idempotency-Key` do webhook
garante que 3 reentregas creditem a conta **uma vez**. Ao confirmar, o gateway grava o
pagamento e enfileira `PaymentConfirmed` no outbox, na mesma transação; o relay entrega
ao Kafka, de onde o antifraude e a conciliação consomem — cada um idempotente, imune a
reentregas. Nenhum crédito duplicado, nenhum evento perdido. É o mesmo conceito de
idempotência do quiz da trilha `go-fintech`, agora sobre JPA + Kafka.

## Mão na massa

**Tutorial — outbox mínimo.** Modele a tabela `outbox`, faça `initiate` gravar
pagamento + evento na mesma transação, e um `@Scheduled` relay que publica e marca como
enviado.

**Desafio — replay de Idempotency-Key.** Escreva um teste (Testcontainers Postgres +
Kafka) que envia o **mesmo** `Idempotency-Key` duas vezes concorrentemente e verifica:
(a) só um débito ocorreu, (b) as duas respostas HTTP são idênticas, (c) exatamente um
evento foi publicado. Force o relay a crashar entre `send` e `markPublished` e prove que
o consumidor idempotente absorve a reentrega.

## Principais aprendizados

- Idempotência se apoia numa **unique constraint** do banco, não num `if`; guarde e
  reentregue a resposta associada à `Idempotency-Key`.
- **Dual-write** (banco + Kafka) não é atômico; sequência ingênua gera inconsistência
  silenciosa.
- **Outbox**: uma escrita transacional (negócio + evento) e um relay assíncrono. Entrega
  **at-least-once** → o consumidor **precisa** ser idempotente.
- O outbox desacopla sua API da disponibilidade do broker.
