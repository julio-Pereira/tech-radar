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

1. Numa tabela `idempotency_keys` com **unique constraint** na chave, **insere a chave
   primeiro**, antes de qualquer efeito, na mesma transação do processamento.
2. Se a inserção **suceder**, processa e **persiste a resposta** associada à chave.
3. Se a inserção **violar a unique constraint**, a operação já foi feita: retorna a
   **resposta persistida**, sem reprocessar.

A ordem é o que importa. O atalho tentador — "consulta a chave; se não existe, processa e
grava" — tem uma janela entre a consulta e a gravação: duas requisições simultâneas
consultam, as duas não acham nada, **as duas processam** (o PSP é chamado duas vezes) e só
a segunda gravação colide, tarde demais. Inserindo primeiro, a colisão acontece *antes*
do efeito:

```java
public PaymentResponse initiate(String idemKey, PaymentRequest req) {
    try {
        return tx.execute(status -> {
            // 1. reserva a chave ANTES de qualquer efeito. Uma segunda requisição com a
            //    mesma chave fica bloqueada neste INSERT até a primeira terminar.
            jdbc.update("insert into idempotency_keys (idempotency_key) values (?)", idemKey);
            PaymentResponse resp = process(req);                       // 2. o efeito
            jdbc.update("update idempotency_keys set response_body = ?::jsonb where idempotency_key = ?",
                    json.writeValueAsString(resp), idemKey);           // 3. a resposta, gravada
            return resp;
        });
    } catch (DuplicateKeyException alreadyDone) {
        // 4. a chave já existia: a transação acima foi desfeita sem processar nada.
        //    A resposta da primeira requisição é lida fora dela, numa leitura nova.
        String body = jdbc.queryForObject(
                "select response_body::text from idempotency_keys where idempotency_key = ?",
                String.class, idemKey);
        return json.readValue(body, PaymentResponse.class);
    }
}
```

(`tx` é um `TransactionTemplate`, `jdbc` um `JdbcTemplate` e `json` o `JsonMapper` do
Jackson 3 — todos injetados pelo Boot. A transação é explícita, e não `@Transactional`,
porque a leitura do passo 4 precisa acontecer **depois** do rollback da tentativa que
colidiu, fora dela.)

A unique constraint é o coração, e o Postgres faz o resto: com duas requisições
**simultâneas** com a mesma chave, o `INSERT` da segunda **espera** a transação da
primeira terminar. Se ela comitou, a segunda colide (`DuplicateKeyException`), não
processa nada e devolve a resposta gravada — byte a byte a mesma. Se a primeira falhou e
fez rollback, a chave não existe mais e a segunda processa normalmente, como deve ser.

```
  req A (key K)             Postgres              req B (key K)
  INSERT K ─────────▶  K reservada, tx A
                       aberta            ◀──────── INSERT K
  process():                                       bloqueado,
    pagamento + outbox                             esperando tx A
  UPDATE response_body
  COMMIT ───────────▶  K comitada ────────▶ DuplicateKeyException
                                           rollback: nada processado
  ◀── 201 {paymentId: P}                   SELECT response_body
                                           ◀── 201 {paymentId: P}
```

Idempotência de verdade se apoia numa garantia do banco, não num `if` na aplicação.

## O problema do dual-write

Agora complique: ao processar o pagamento você precisa **gravar no banco** *e*
**publicar um evento** (`PaymentInitiated`) no Kafka para o antifraude e a conciliação
(o processo que confere cada pagamento registrado contra o que o PSP de fato liquidou).
Fazer os dois "juntos" é impossível de forma atômica — banco e Kafka são sistemas
distintos, sem transação compartilhada. Se você commita no banco e o `kafkaTemplate.send`
falha, o evento some. Se publica antes e o banco faz rollback, você anuncia um pagamento
que não existe. Isso é o **dual-write problem**, e "só chamar os dois em sequência" é a
armadilha que gera inconsistência silenciosa em produção.

## Transactional Outbox

A solução: **uma escrita só**. Na mesma transação do banco que grava o pagamento, você
insere o evento numa tabela `outbox`. Como é a *mesma* transação, ou os dois persistem
ou nenhum — atômico de verdade. Depois, um **relay** — um processo de fundo que só
repassa — lê o outbox e publica no Kafka, marcando o que já enviou:

```
            ┌─────────── uma transação ───────────┐
  initiate ─┤  INSERT payments  +  INSERT outbox  ├─ COMMIT
            └─────────────────────────────────────┘
                              │
          relay (@Scheduled, a cada 500 ms, sem transação)
                              │
   SELECT pendentes ─▶ kafka.send(...).get() ─▶ ack do broker
                                                     │
        UPDATE outbox SET published_at ◀─────────────┘
        (transação curta, só depois do ack)

  broker fora: o send falha, nada é marcado, e o evento
  espera no banco pela próxima rodada
```

```java
@Transactional
public void initiate(PaymentRequest req) {
    Payment p = payments.save(new Payment(req));            // 1
    outbox.save(new OutboxEvent("PaymentInitiated", p));    // 2 — mesma transação
}   // commit atômico dos dois
```

```java
@Scheduled(fixedDelay = 500)
void relay() throws Exception {             // sem @Transactional: nenhuma conexão presa no I/O
    for (OutboxEvent e : outbox.findTop100ByPublishedAtIsNullOrderByCreatedAt()) {
        kafka.send("payments.initiated", e.aggregateId().toString(), e.payload())
             .get(5, TimeUnit.SECONDS);      // espera o ack do broker; falha = exceção, lote para
        outbox.markPublished(e.id(), Instant.now());   // transação curta, só depois do ack
    }
}
```

Dois detalhes que um relay ingênuo erra:

- **Esperar o ack.** O *ack* é a confirmação do broker de que gravou a mensagem.
  `kafka.send` é assíncrono: devolve um `CompletableFuture` antes de o broker confirmar. Marcar como publicado sem esperar o `get` é perder o evento em
  silêncio quando o broker recusa. Com o `get`, uma falha vira exceção, o lote para e o
  evento fica pendente para a próxima rodada.
- **Não segurar transação durante o I/O.** Um `@Transactional` no método inteiro
  prenderia uma conexão do pool enquanto o relay espera o Kafka — o mesmo erro do
  marco 05. Aqui, cada `markPublished` é uma atualização curta, com transação própria,
  só depois do ack:

```java
interface OutboxRepository extends JpaRepository<OutboxEvent, UUID> {
    List<OutboxEvent> findTop100ByPublishedAtIsNullOrderByCreatedAt();

    @Modifying @Transactional
    @Query("update OutboxEvent e set e.publishedAt = :at where e.id = :id")
    void markPublished(@Param("id") UUID id, @Param("at") Instant at);
}
```

O `@Scheduled` só roda com `@EnableScheduling` numa classe de configuração (a própria
`PixGatewayApplication` serve).

Duas verdades para internalizar:

- **Semântica de entrega é at-least-once** — "pelo menos uma vez": nenhum evento se
  perde, mas algum pode chegar duplicado. O relay pode crashar entre o ack do `send` e
  o `markPublished` e reenviar o evento. Portanto o **consumidor tem que ser idempotente**
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

**Tutorial — outbox mínimo.** Adicione o Kafka ao pix-gateway (o Jackson já vem com o
starter web):

```xml
<dependency>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-kafka</artifactId>
</dependency>
```

Crie as tabelas numa segunda migração, `V2__idempotency_and_outbox.sql`:

```sql
CREATE TABLE outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_id UUID NOT NULL,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ
);
CREATE TABLE idempotency_keys (
    idempotency_key TEXT PRIMARY KEY,
    response_body JSONB,                 -- NULL enquanto a primeira requisição processa
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`response_body` precisa aceitar `NULL`: a chave é inserida no passo 1, antes de existir
resposta. Na entidade `OutboxEvent`, guarde `payload` como uma `String` com o JSON já
serializado e mapeie-a com `@JdbcTypeCode(SqlTypes.JSON)`, para o Hibernate gravá-la na
coluna `JSONB`. Por ser `String`, o relay a publica com o serializador padrão do Kafka no
Boot (`StringSerializer`), sem configuração extra.

Faça `initiate` gravar pagamento + evento na mesma transação, e um `@Scheduled` relay
que publica e marca como enviado. O controller passa a ler o header e a responder
`201 Created` — o teste `initiate_returns501` do marco 01 cumpriu seu papel e sai:

```java
@PostMapping
ResponseEntity<PaymentResponse> initiate(@RequestHeader("Idempotency-Key") String idemKey,
                                         @RequestBody PaymentRequest req) {
    return ResponseEntity.status(HttpStatus.CREATED).body(service.initiate(idemKey, req));
}
```

**Desafio — replay de Idempotency-Key.** Escreva um teste (Testcontainers Postgres +
Kafka) que envia o **mesmo** `Idempotency-Key` duas vezes concorrentemente e verifica:
(a) só um débito ocorreu, (b) as duas respostas HTTP são idênticas, (c) exatamente um
evento foi publicado. Force o relay a crashar entre `send` e `markPublished` e prove que
o consumidor idempotente absorve a reentrega.

Se você chega neste marco sem ainda ter lido o 11 (onde Testcontainers é ensinado em
detalhe), este é o esqueleto mínimo para subir Postgres e Kafka juntos no teste. O Kafka
pede mais um artefato de teste, `org.testcontainers:testcontainers-kafka`:

```java
import org.testcontainers.kafka.KafkaContainer;
import org.testcontainers.postgresql.PostgreSQLContainer;

@Container @ServiceConnection static PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:17-alpine");
@Container @ServiceConnection static KafkaContainer kafka = new KafkaContainer("apache/kafka:4.3.1");
```

Acrescente o mesmo `KafkaContainer`, como `@Bean @ServiceConnection`, à
`TestcontainersConfiguration` do marco 04 — a aplicação agora precisa de um broker para
subir nos outros testes também.

## Principais aprendizados

- Idempotência se apoia numa **unique constraint** do banco, não num `if`: **insira a
  chave antes do efeito**, guarde e reentregue a resposta associada à `Idempotency-Key`.
- **Dual-write** (banco + Kafka) não é atômico; sequência ingênua gera inconsistência
  silenciosa.
- **Outbox**: uma escrita transacional (negócio + evento) e um relay assíncrono que
  espera o ack do broker e não segura transação durante o I/O. Entrega
  **at-least-once** → o consumidor **precisa** ser idempotente.
- O outbox desacopla sua API da disponibilidade do broker.
