---
id: concorrencia-estruturada-e-cancelamento
title: "Concorrência estruturada e cancelamento"
summary: "Em concorrência estruturada, nenhuma coroutine vive mais que o escopo que a criou, e o cancelamento é cooperativo. coroutineScope × supervisorScope, o catch (e: Exception) que engole o cancelamento (o laço cancelado que roda as 50 voltas), o laço de CPU que ignora o withTimeout, NonCancellable, GlobalScope, o handler que só vale na raiz, e 10 mil requisições canceladas sem uma coroutine viva no fim."
estimatedMinutes: 60
reviewedAt: 2026-11-09
reviewEvery: 6m
competencies: [confiabilidade]
references:
  - title: "Kotlin: Cancellation and timeouts"
    url: https://kotlinlang.org/docs/cancellation-and-timeouts.html
  - title: "Kotlin: Coroutine exceptions handling"
    url: https://kotlinlang.org/docs/exception-handling.html
  - title: "kotlinx-coroutines-debug (DebugProbes)"
    url: https://github.com/Kotlin/kotlinx.coroutines/tree/master/kotlinx-coroutines-debug
---

## A regra: o escopo é dono das filhas

Toda coroutine nasce dentro de um **escopo**, e, em regra, o `Job` dela vira filho do `Job` do escopo.
As exceções quebram a estrutura de propósito: o `GlobalScope` e um `Job` próprio passado ao `launch`.
Dentro da regra, saem três garantias, que valem sem nenhum código a mais:

- **O escopo espera as filhas.** `coroutineScope { launch { ... }; launch { ... } }` só termina
  quando as duas terminam. Nenhuma coroutine "escapa" da função que a criou.
- **Cancelar o pai cancela as filhas.** Se o cliente desiste da requisição, o cancelamento desce pela
  árvore inteira.
- **Falha de uma filha sobe.** A exceção cancela o pai e, com ele, as irmãs.

Isso é **concorrência estruturada**: o tempo de vida das coroutines segue a estrutura do código, como
o de uma variável local segue o bloco. É o que o `StructuredTaskScope` tenta trazer ao Java (ainda em
*preview*, `concorrencia-e-recursos/06`) e o que o `errgroup` com `context` faz à mão em Go
(`go-fintech/06`).

## `coroutineScope` × `supervisorScope`

A terceira garantia nem sempre é a desejada. A consulta de status do `pix-status` busca três fontes: o
ledger, que é obrigatório, e o antifraude e o DICT, que são opcionais. Uma falha no antifraude não
deveria derrubar a resposta.

| Escopo | Uma filha falha | Uso |
| --- | --- | --- |
| `coroutineScope` | as irmãs são canceladas e a exceção sobe | tudo ou nada: as partes só valem juntas |
| `supervisorScope` | as irmãs continuam; a falha de um `async` vai para quem chama `await`, e a de um `launch` vai para o *handler* (ou, sem ele, para o *uncaught handler* da thread) | partes independentes |

Testado, com uma filha que falha em 10 ms e outra que espera 1 s: no `coroutineScope`, a segunda é
cancelada e a exceção sobe; no `supervisorScope`, a segunda termina normalmente.

O agregador combina os dois: o ledger roda no escopo de fora, um `coroutineScope`, e as opcionais rodam
num `supervisorScope`, cada uma com `withTimeoutOrNull` para não segurar a resposta. Medido em tempo
virtual:

- o cliente cancela aos 150 ms, e as **três** chamadas filhas recebem o cancelamento aos 150 ms;
- o antifraude falha, e o status sai com `antifraude = null` e as outras duas preenchidas;
- o ledger falha (50 ms depois do início da consulta), e as duas opcionais são canceladas no mesmo
  instante.

## `CancellationException`: a exceção que precisa passar

O cancelamento é **cooperativo**. Cancelar um `Job` marca o pedido, e a coroutine só para quando chega
a um ponto de suspensão cancelável (`delay`, `await`, `send`, um `withContext`), quando chama
`ensureActive()` ou `yield()`, ou quando confere `isActive` e sai por conta própria. No ponto de
suspensão, a função lança **`CancellationException`**, e é a propagação dessa exceção que desmonta a
pilha da coroutine.

O bug clássico é o `catch` genérico:

```kotlin
while (voltas < 50) {
    try { delay(100); voltas++ }
    catch (e: Exception) { log.warn("falhou", e); voltas++ }   // engole o cancelamento
}
```

Testado em tempo virtual: cancelada aos 250 ms, essa coroutine roda as **50** voltas até o fim. Cada
`delay` lança `CancellationException` (que é uma `Exception`), o `catch` a engole, e o laço segue. O
mesmo vale para `runCatching { }` em volta de código suspenso, que captura `Throwable`. Há três
formas certas:

- capturar `CancellationException` antes e relançar: `catch (e: CancellationException) { throw e }`;
- capturar só a exceção específica (`IOException`, `ErroTransitorio`), desde que ela não seja um
  supertipo de `CancellationException`. A `CancellationException` do Kotlin é a de
  `java.util.concurrent`, que herda de `IllegalStateException` e de `RuntimeException`: testado, um
  `catch (e: IllegalStateException)` no mesmo laço também roda as 50 voltas;
- chamar `currentCoroutineContext().ensureActive()` no `catch`, que relança se o *job* foi cancelado.
  Com isso, a mesma coroutine para em 2 voltas.

O *linter* do `pix-status` acusa o `catch` de `Exception`, `Throwable`, `RuntimeException` ou
`IllegalStateException` que não faz nenhuma dessas três coisas. Ele não cobre o `runCatching`, que fica
para a revisão de código: em código suspenso, use a `runCatchingNaoCancelamento` do agregador.

### O laço que não coopera

Um laço de CPU sem ponto de suspensão nunca vê o cancelamento. Testado no `Dispatchers.Default`, com um
laço de 300 ms dentro de `withTimeoutOrNull(50)`:

- sem nada, o bloco **termina** e devolve o valor, depois de 300 ms. Ele devolve o valor porque nunca
  suspendeu; com uma suspensão antes do laço (o caso real: busca os dados, depois calcula), o
  resultado foi `null`, mas também só depois de 300 ms. Nos dois casos, o prazo foi perdido;
- com `ensureActive()` dentro do laço, o resultado é `null` em 52 ms.

Em processamento longo (um lote, uma conciliação), chame `ensureActive()` ou `yield()` a cada iteração
ou bloco.

O mesmo vale para chamada **bloqueante**: o cancelamento de uma coroutine não interrompe a thread.
Testado no `Dispatchers.IO`, um `Thread.sleep(300)` dentro de `withTimeoutOrNull(50)` só voltou em
312 ms. Com `runInterruptible(Dispatchers.IO) { ... }`, o cancelamento vira um `interrupt` na thread,
e o resultado foi `null` em 52 ms. Isso serve para código que responde a `interrupt`; um *driver* JDBC
que não responde precisa do *timeout* do próprio *driver*.

## Prazo, limpeza, escopos órfãos e o *handler*

- **`withTimeout` × `withTimeoutOrNull`.** O primeiro lança `TimeoutCancellationException`, o segundo
  devolve `null`. Como a `TimeoutCancellationException` é uma `CancellationException`, um
  `withTimeout` estourado dentro de `launch` cancela a coroutine **em silêncio**: testado, o código
  depois dele não roda, o *job* termina cancelado, e o `CoroutineExceptionHandler` não é chamado. Use
  `withTimeoutOrNull` quando o prazo é um resultado possível, e trate-o.
- **`NonCancellable` para limpeza.** Dentro de um `finally` de uma coroutine cancelada, qualquer
  função suspensa cancelável lança de novo. Para liberar um recurso que precisa suspender (devolver
  uma conexão, gravar a auditoria), use `withContext(NonCancellable) { ... }`, e só em `withContext`:
  num `launch` ou `async`, ele tira a coroutine da árvore.
- **`GlobalScope` é vazamento.** Uma coroutine lançada nele não tem pai: ninguém a espera, ninguém a
  cancela, e o erro dela não chega a quem chamou: vai só para o *uncaught exception handler* da thread
  (um *stack trace* no log). O mesmo vale para `CoroutineScope(Dispatchers.IO)`
  criado e esquecido dentro de um método.
- **O escopo segue o ciclo de vida.** O escopo de um *bean* nasce com ele e é cancelado no
  `@PreDestroy`. O escopo de uma requisição é o da própria função `suspend` do *controller* (marco 08).
- **`CoroutineExceptionHandler` só vale para quem não tem a quem entregar a exceção.** Ele é chamado
  numa coroutine raiz (lançada direto num escopo, com `Job` ou `SupervisorJob`) e numa filha direta de
  um `supervisorScope` ou `SupervisorJob`. Numa filha comum, de `coroutineScope` ou de `Job`, ele é
  ignorado, e a exceção sobe para o pai. No `async`, não tem efeito: a exceção vai para quem chama
  `await`. Testado: `launch(handler) { error("boom") }` dentro de um `coroutineScope` não chama o
  *handler*, e o `coroutineScope` lança `boom`; dentro de um `supervisorScope`, o *handler* é chamado.

## Vazamento: contar o que ficou vivo

Em Go, o `goleak` confere que nenhuma goroutine sobreviveu ao teste (`go-fintech/07`). O equivalente
em Kotlin é o **`DebugProbes`** do `kotlinx-coroutines-debug`: `DebugProbes.install()` passa a
registrar as coroutines criadas, e `DebugProbes.dumpCoroutinesInfo()` lista as vivas. Medido: 10 mil
consultas de status lançadas, com as três fontes demorando 60 s, deram **40 mil** coroutines vivas no
meio (quatro por consulta). Depois de cancelar as 10 mil, sobraram **zero**.

## Exemplo numa fintech

O aplicativo chama a consulta de status, que dispara três buscas. O usuário fecha a tela, e o cliente
HTTP cancela a requisição. Numa primeira versão, as três buscas eram lançadas num
`CoroutineScope(Dispatchers.IO)` criado no serviço, e não no escopo da requisição. O cancelamento não
chegava a elas, que seguiam rodando até o prazo de 10 s do ledger. Em horário de pico, metade das
conexões do *pool* do ledger estava ocupada por respostas que ninguém ia ler. A correção foi apagar o
escopo criado à mão e usar `coroutineScope { }` na própria função `suspend`.

## Hands-on

**Tutorial.** Reproduza em tempo virtual o laço com `catch (e: Exception)` que roda as 50 voltas
depois do cancelamento, e a versão com `ensureActive()` no `catch`, que para em 2.

**Desafio.** O agregador de status do `pix-status`: ledger obrigatório no `coroutineScope`,
antifraude e DICT opcionais num `supervisorScope`, cada um com `withTimeoutOrNull` de 300 ms, e uma
`runCatchingNaoCancelamento` que deixa a `CancellationException` passar.

**Invariantes testáveis**

1. **O cancelamento desce.** Com as três fontes demorando 10 s, o cliente cancela aos 150 ms (tempo
   virtual), e as três fontes registram o cancelamento aos 150 ms.
2. **Opcional não derruba, obrigatória sim.** A falha do antifraude dá um status com
   `antifraude = null` e as outras duas preenchidas. A falha do ledger propaga a exceção e cancela as
   duas opcionais no mesmo instante. Uma opcional que demora 5 s vira `null` aos 300 ms.
3. **Nenhum `catch` genérico engole cancelamento.** Uma regra lê `src/main/kotlin` com a PSI do
   compilador e acusa todo `catch` de `Exception`, `Throwable`, `RuntimeException` ou
   `IllegalStateException` que não relança, não chama `ensureActive()` e não vem depois de um `catch`
   de `CancellationException`. Prove a regra com uma *fixture* de seis variantes: ela acusa as duas que
   engolem (`Exception` e `IllegalStateException`).
4. **Nada vivo depois de cancelar.** Com `DebugProbes`, 10 mil consultas canceladas no meio deixam
   **zero** coroutines vivas.

**Complemento.** Escreva a liberação de um recurso suspenso num `finally` sem `NonCancellable`, veja a
`CancellationException` na limpeza, e corrija. Depois troque o `coroutineScope` do agregador por um
`CoroutineScope(Job())` criado na função (com o *dispatcher* de teste herdado, para continuar em tempo
virtual) e rode o invariante 1: as fontes não recebem o cancelamento.

**Checagem**

1. Quais são as três garantias da concorrência estruturada, e qual delas o `supervisorScope` muda?
2. Por que um `catch (e: Exception)` em volta de um `delay` impede o cancelamento, e quais as três
   formas certas de escrevê-lo?
3. O que acontece com um `withTimeout` estourado dentro de um `launch`, e por que o *handler* não vê?
4. Como provar, num teste, que nenhuma coroutine sobreviveu ao cancelamento?

## Principais aprendizados

- O escopo espera as filhas, cancelar o pai cancela as filhas, e falha de filha sobe. Nada escapa da
  função que criou a coroutine.
- `coroutineScope` é tudo ou nada; `supervisorScope` isola as partes independentes.
- `CancellationException` precisa passar: relance-a, capture o específico (nunca um supertipo dela,
  como `IllegalStateException`) ou chame `ensureActive()`. O *linter* acusa o resto.
- Laço de CPU não vê o cancelamento sem `ensureActive()`/`yield()`; chamada bloqueante só vê com
  `runInterruptible`; limpeza que suspende usa `withContext(NonCancellable)`.
- `GlobalScope` e escopo criado à mão são vazamento; o *handler* vale na raiz e nas filhas diretas de
  um supervisor; o `withTimeout` estourado num `launch` cancela em silêncio.
- `DebugProbes` é o `goleak` das coroutines: 40 mil vivas no meio, zero depois.
