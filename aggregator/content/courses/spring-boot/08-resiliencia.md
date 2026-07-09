---
id: resiliencia
title: "Resiliência: timeouts, retry e circuit breaker"
summary: "A hierarquia da resiliência — timeout primeiro, retry só no idempotente, circuit breaker e bulkhead com Resilience4j — e fallbacks que não mentem."
estimatedMinutes: 40
references:
  - title: "Resilience4j Documentation"
    url: https://resilience4j.readme.io/docs
  - title: "Spring Framework — RestClient"
    url: https://docs.spring.io/spring-framework/reference/integration/rest-clients.html
  - title: "Release It! — Stability Patterns (Michael Nygard)"
    url: https://pragprog.com/titles/mnee2/release-it-second-edition/
---

## A hierarquia: timeout é o alicerce

Toda dependência de rede falha ou trava. A resiliência tem uma ordem de prioridade, e
o primeiro degrau é **timeout** — sem ele, nada mais importa. Uma chamada HTTP sem
timeout que trava prende a thread (ou a conexão do pool) *para sempre*; some algumas
delas e o serviço inteiro congela por uma dependência lenta. Configure **connect** e
**read** timeout em **todo** client, inclusive o novo `RestClient` do Boot 4:

```java
@Bean
RestClient pspClient(RestClient.Builder builder) {
    var factory = new SimpleClientHttpRequestFactory();
    factory.setConnectTimeout(Duration.ofSeconds(2));
    factory.setReadTimeout(Duration.ofSeconds(5));
    return builder.baseUrl(props.baseUrl())
                  .requestFactory(factory)
                  .build();
}
```

"O default deve estar bom" é a frase que precede o incidente: vários clients HTTP têm
timeout **infinito** por padrão. Torne-o explícito.

## Retry — mas só no que é idempotente

Retry com **backoff exponencial + jitter** recupera falhas transitórias (um blip de
rede, um `503` momentâneo). O backoff evita marteladas; o **jitter** (aleatoriedade)
evita que mil clients repitam em uníssono e derrubem o serviço que estava se
recuperando — o *thundering herd*.

A regra de ouro é a que dá dinheiro: **só faça retry de operação idempotente**. Repetir
um `GET` de cotação: seguro. Repetir um `POST` que debita uma conta, quando você não
sabe se a primeira tentativa chegou a executar: você pode **debitar duas vezes**. Ou a
operação tem `Idempotency-Key` (marco 06) e é segura para repetir, ou você **não** faz
retry dela. Retry cego em operação de escrita é uma fábrica de débito duplicado.

## Circuit breaker e bulkhead

Quando uma dependência está *consistentemente* falhando, continuar tentando (mesmo com
timeout) desperdília recursos e piora a saturação. O **circuit breaker** monitora a taxa
de falha; ao ultrapassar um limite, ele **abre** e passa a **falhar rápido** por um
tempo, sem nem chamar o serviço morto — dando a ele espaço para se recuperar. Depois,
entra em *half-open* e testa com poucas chamadas antes de fechar de novo.

O **bulkhead** isola recursos: um pool de concorrência separado por dependência, para
que o PSP-A lento não consuma todas as threads e afunde também as chamadas ao PSP-B. É
o anteparo estanque de um navio — um compartimento inunda, o barco não afunda.

Com Resilience4j (integração idiomática no Boot), é declarativo:

```java
@CircuitBreaker(name = "psp", fallbackMethod = "queueForLater")
@Retry(name = "psp")   // configurado só para chamadas idempotentes
public PaymentResult route(PaymentRequest req) {
    return pspClient.post().body(req).retrieve().body(PaymentResult.class);
}

private PaymentResult queueForLater(PaymentRequest req, Throwable t) {
    return PaymentResult.accepted(outbox.enqueue(req)); // honesto: "aceito, vou processar"
}
```

## Fallbacks honestos

Um fallback nunca deve **mentir**. Retornar "pagamento concluído" quando o PSP está fora
é fraude acidental. Um fallback honesto ou entrega dado *degradado e rotulado* (uma
cotação em cache, marcada como "pode estar desatualizada"), ou muda o modo de operação
de forma transparente — enfileira a intenção para processar quando a dependência voltar
e responde `202 Accepted`, nunca `200` com um resultado inventado. Em fintech, o fallback
errado custa dinheiro real.

## Exemplo numa fintech

São **23h59 do dia de vencimento** e o PSP está degradado — respondendo, mas lento e com
erros intermitentes. O **pix-gateway** precisa de: **read timeout** de 5s (não deixa a
thread pendurada), **retry com jitter só nas confirmações idempotentes**, **circuit
breaker** que abre quando o PSP passa de 50% de erro (para de martelar o serviço caído),
e um **fallback honesto** que enfileira a iniciação no outbox e responde `202` — o
pagamento entra numa fila durável para quando o PSP voltar, em vez de falhar de vez ou,
pior, fingir sucesso.

## Mão na massa

**Desafio — client de PSP resiliente.** Implemente o `RestClient` do PSP com
connect/read timeout, `@Retry` (backoff + jitter, só na operação idempotente) e
`@CircuitBreaker` com fallback para o outbox. Escreva um teste com **WireMock**
simulando: (a) latência acima do read timeout, (b) `503` transitório que o retry
recupera, (c) falhas contínuas que abrem o circuito — e verifique que, com o circuito
aberto, o fallback responde `202` sem chamar o PSP.

## Principais aprendizados

- **Timeout primeiro**: connect + read explícitos em todo client (inclusive
  `RestClient`). Default costuma ser infinito.
- **Retry só no idempotente**, com backoff + jitter; retry cego em escrita = débito
  duplicado.
- **Circuit breaker** para falhar rápido e poupar o serviço caído; **bulkhead** para
  isolar dependências.
- **Fallback honesto**: degradar rotulado ou enfileirar (`202`), **nunca** fingir
  sucesso.
