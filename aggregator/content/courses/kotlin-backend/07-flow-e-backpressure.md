---
id: flow-e-backpressure
title: "Flow e backpressure"
summary: "Flow é um stream frio e sequencial, com backpressure por suspensão. Frio × SharedFlow e StateFlow quentes, buffer × conflate medidos, flowOn e o contexto, exceções no fluxo, Channel × Flow, a ponte com o Reactor (o request(5) que produz exatamente 5), e o pipeline de eventos para webhooks com ordem por pagamento, retry com backoff e DLQ que não para o fluxo."
estimatedMinutes: 55
reviewedAt: 2026-11-09
reviewEvery: 12m
competencies: [confiabilidade, performance]
references:
  - title: "Kotlin: Asynchronous Flow"
    url: https://kotlinlang.org/docs/flow.html
  - title: "Kotlin: Channels"
    url: https://kotlinlang.org/docs/channels.html
  - title: "kotlinx-coroutines-reactor"
    url: https://github.com/Kotlin/kotlinx.coroutines/tree/master/reactive/kotlinx-coroutines-reactor
---

## `Flow`: frio, sequencial, com *backpressure* por suspensão

Um `Flow<T>` é uma sequência de valores produzida de forma assíncrona. Três propriedades o definem:

- **Frio.** `flow { ... }` não faz nada até alguém chamar `collect`, e cada coletor executa o bloco de
  novo, do começo. Testado: o mesmo `flow` coletado duas vezes executou o bloco duas vezes.
- **Sequencial.** O `emit` só volta depois que o coletor terminou de processar o valor. Produtor e
  coletor rodam na mesma coroutine, um de cada vez.
- ***Backpressure* por suspensão.** Como o `emit` suspende até o coletor terminar, um produtor rápido
  nunca passa de um consumidor lento. Não há protocolo de pedido: a suspensão é o protocolo.

No Reactor (`spring-boot/13`), o *backpressure* é explícito: o `Subscriber` pede `request(n)` e o
`Publisher` nunca manda mais que isso. No `Flow`, o mesmo efeito vem de graça, porque `emit` é uma
função `suspend`.

## `buffer`, `conflate` e o produtor desacoplado

Às vezes o produtor e o consumidor precisam andar em paralelo: o produtor lê do *broker* enquanto o
consumidor entrega o *webhook*. Os operadores que fazem isso põem um `Channel` no meio:

| Operador | Comportamento | Medido (200 itens, consumidor de 10 ms) |
| --- | --- | --- |
| nenhum | o produtor espera o consumidor a cada item | no máximo **1** pendente |
| `buffer(16)` | o produtor adianta até 16 itens, depois suspende | no máximo **18** pendentes (16 no *buffer*, 1 em processamento, 1 sendo emitido) |
| `conflate()` | guarda só o mais recente; o consumidor pula os intermediários | 10 emitidos a cada 10 ms, consumidor de 35 ms: coletou `[0, 3, 6, 9]` |

`buffer` é para quando todo item importa e o limite de memória precisa ser conhecido. `conflate` é
para quando só o último importa: o estado atual de um pagamento, uma cotação. `debounce(300.ms)`
espera uma pausa antes de emitir, para eventos em rajada.

`flatMapMerge(concurrency = 8) { ... }` processa até 8 *flows* internos ao mesmo tempo. É o `flatMap`
com limite do Reactor, com a mesma consequência: a ordem de saída deixa de ser a de entrada.

## Frio × quente: `SharedFlow` e `StateFlow`

Um fluxo **quente** existe independente de quem coleta:

- **`SharedFlow`** transmite cada valor para todos os coletores ativos, com `replay` opcional para quem
  chega depois. `shareIn(escopo, SharingStarted.Eagerly, replay = 3)` transforma um fluxo frio em
  quente. Testado: o mesmo fluxo, compartilhado entre dois coletores, executou o bloco uma vez só.
- **`StateFlow`** é um `SharedFlow` com valor atual (`value`) e `conflate` embutido. Quem coleta recebe
  o estado atual e depois as mudanças, nunca o histórico. É o modelo de "estado do pagamento".

Fluxo quente precisa de escopo dono (`shareIn(escopo, ...)`): um escopo que vive para sempre é o
`GlobalScope` do marco 06 com outro nome.

## `flowOn`, exceções e `Channel`

**`flowOn(Dispatchers.IO)`** muda o *dispatcher* só do que vem **antes** dele (o *upstream*). Testado:
com `flow { emit(...) }.map { ... }.flowOn(Dispatchers.IO).collect { ... }`, o `emit` e o `map` rodaram
numa thread `DefaultDispatcher-worker` (o IO e o Default compartilham as threads), e o `collect`, na
thread de quem chamou. Não use `withContext` dentro do `flow { }` para trocar o contexto do `emit`: o
`Flow` proíbe, e lança `IllegalStateException`.

**Exceções.** O operador `catch { e -> ... }` pega o que acontece **antes** dele, e pode emitir um valor
de recuperação. `retryWhen { causa, tentativa -> ... }` refaz a assinatura do fluxo inteiro, que é o
certo para "reconectar ao *broker*", não para "repetir a entrega de um item". O erro de um item se
trata dentro do processamento do item, como no pipeline abaixo.

**`Channel` × `Flow`.** `Channel` é uma fila entre coroutines: quente, cada valor consumido por **um**
receptor, com capacidade configurável. `Flow` é a descrição de uma sequência. Use `Channel` para
distribuir trabalho entre coroutines (as filas por partição, abaixo), e `Flow` para descrever o fluxo
de dados.

## A ponte com o Reactor

No WebFlux, o `kotlinx-coroutines-reactor` liga os dois mundos: `flux.asFlow()` e `flow.asFlux()`. O
*backpressure* atravessa a ponte. Testado: um `Flow` de mil itens exposto como `Flux`, com um assinante
que pediu `request(5)` e parou, recebeu **5** itens, e o `Flow` produziu **5**. A ponte traduz o pedido
do Reactor em suspensão do `emit`. O marco 08 usa essa ponte nos *controllers* `suspend`.

## O pipeline de eventos para *webhooks*

O `pix-status` consome um fluxo de mudanças de estado e entrega um *webhook* por mudança. Três
exigências:

- **Ordem por pagamento.** `AUTORIZADO` não pode chegar depois de `LIQUIDADO`.
- **Concorrência entre pagamentos.** Um recebedor lento num pagamento não segura os outros.
- **Erro de item não para o fluxo.** Erro transitório (503, *timeout*) se repete com *backoff*; erro
  permanente (410, 422) vai direto para a DLQ (`kafka/08`); retries esgotados também.

A ordem por chave com paralelismo entre chaves é o mesmo desenho das partições do Kafka (`kafka/06`):
cada pagamento cai sempre na mesma de K filas (`Channel` com capacidade limitada), e cada fila é
consumida por uma coroutine só.

```kotlin
suspend fun processarPorPagamento(eventos: Flow<MudancaDeEstado>, particoes: Int, buffer: Int = 16,
                                  processar: suspend (MudancaDeEstado) -> Unit) = coroutineScope {
    val filas = List(particoes) { Channel<MudancaDeEstado>(buffer) }
    filas.forEach { fila -> launch { for (ev in fila) processar(ev) } }
    try {
        eventos.collect { ev -> filas[ev.pagamentoId.hashCode().absoluteValue % particoes].send(ev) }
    } finally {
        filas.forEach { it.close() }
    }
}
```

O `send` numa fila cheia suspende o `collect`, e o *backpressure* chega até a origem. O retry fica
dentro do `processar` de cada item. Testado em tempo virtual:

- o item que falha 2 vezes com erro transitório é entregue na terceira, depois de 100 + 200 ms;
- o item com erro permanente vai para a DLQ na primeira tentativa;
- o item que falha sempre esgota as 4 tentativas (100 + 200 + 400 ms) e vai para a DLQ;
- os itens seguintes são entregues normalmente.

## Exemplo numa fintech

Uma primeira versão do pipeline usou `flatMapMerge(concurrency = 32)` direto sobre o fluxo de eventos,
para ganhar vazão. Funcionou nos testes, que tinham um evento por pagamento. Em produção, dois eventos
do mesmo pagamento (autorizado e liquidado, com milissegundos de diferença) foram entregues fora de
ordem, e o recebedor, que processava o último estado recebido, gravou o pagamento como "autorizado"
para sempre. A versão por partição preserva a ordem por pagamento e mantém a concorrência entre eles.

## Hands-on

**Tutorial.** Meça em tempo virtual os pendentes máximos de um produtor de 200 itens com consumidor de
10 ms: sem `buffer`, com `buffer(16)` e com `conflate()`.

**Desafio.** O pipeline de eventos para *webhooks*: `processarPorPagamento` com K filas limitadas e
`entregarComRetry` com *backoff* exponencial (100, 200, 400 ms), DLQ para erro permanente e para
retries esgotados.

**Invariantes testáveis**

1. **Pendentes limitados.** Com consumidor lento, o produtor nunca tem mais de 1 item pendente sem
   `buffer`, e no máximo B + 2 com `buffer(B)`, medido por contadores de produzidos e consumidos.
2. **Ordem por pagamento, concorrência entre pagamentos.** Mil eventos de 50 pagamentos, intercalados
   com semente fixa, processados com 8 partições e atrasos aleatórios. Cada pagamento chega em ordem
   (1, 2, 3, ...), e o pico de concorrência fica entre 2 e 8 (medido: 8).
3. **Erro de item não para o fluxo.** Num lote de cinco itens, o transitório é entregue na terceira
   tentativa, o permanente vai para a DLQ com uma tentativa só, o que falha sempre vai para a DLQ
   depois de 4, e os outros são entregues. O tempo virtual total é exatamente 300 + 700 ms.

**Complemento.** Troque o `processarPorPagamento` por `flatMapMerge(concurrency = 8)` e rode o
invariante 2: a ordem por pagamento quebra (medido: 31 dos 50 pagamentos fora de ordem). Depois exponha o fluxo como `Flux` com `asFlux()`, assine
com `request(5)` e confira que o `Flow` produziu só 5.

**Checagem**

1. Por que o `Flow` tem *backpressure* sem um `request(n)`, e o que muda com `buffer`?
2. Quando `conflate` é o certo, e quando ele perde dado que importa?
3. Qual a diferença entre um `Flow` frio, um `SharedFlow` e um `StateFlow`?
4. Como preservar a ordem por pagamento sem processar tudo em série?

## Principais aprendizados

- `Flow` é frio e sequencial; o `emit` suspende até o coletor terminar, e isso é o *backpressure*.
- `buffer(B)` desacopla com limite conhecido; `conflate` guarda o último; `flatMapMerge` paraleliza e
  perde a ordem.
- `SharedFlow` e `StateFlow` são quentes e precisam de escopo dono.
- `flowOn` muda o contexto do *upstream*; `catch` pega o que vem antes; o erro de um item se trata no
  item.
- A ponte `asFlux`/`asFlow` leva o `request(n)` do Reactor para a suspensão do `Flow`.
- Ordem por chave e paralelismo entre chaves: partições com `Channel` limitado, como no Kafka.
