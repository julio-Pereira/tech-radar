---
id: coroutines-fundamentos
title: "Coroutines: fundamentos"
summary: "Coroutine é computação suspensível; quem bloqueia a thread dentro dela anula tudo. O que o compilador faz com suspend, launch × async, dispatchers e withContext, o cliente bloqueante que prende o Dispatchers.Default (medido: 200 entregas em 10 s × 10 mil em 2,8 s), BlockHound acusando o bloqueio, tempo virtual para provar prazo, Semaphore por recebedor, e coroutines × virtual threads × goroutines numa tabela conferida."
estimatedMinutes: 65
reviewedAt: 2026-11-09
reviewEvery: 6m
competencies: [performance, confiabilidade]
references:
  - title: "Kotlin: Coroutines guide"
    url: https://kotlinlang.org/docs/coroutines-guide.html
  - title: "Kotlin: Coroutine context and dispatchers"
    url: https://kotlinlang.org/docs/coroutine-context-and-dispatchers.html
  - title: "kotlinx-coroutines-test"
    url: https://github.com/Kotlin/kotlinx.coroutines/tree/master/kotlinx-coroutines-test
  - title: "BlockHound"
    url: https://github.com/reactor/BlockHound
---

## `suspend` e o que o compilador faz com ele

Uma função `suspend` pode **parar no meio e continuar depois** sem prender a thread em que estava.
Quando ela chama outra função `suspend` que precisa esperar (uma resposta HTTP, um `delay`), a
coroutine devolve a thread para o *dispatcher*, e a execução continua mais tarde, talvez em outra
thread, a partir daquele ponto.

O compilador faz isso com uma transformação chamada *continuation-passing style*, sem nenhuma mágica
na JVM:

- toda função `suspend` ganha um parâmetro escondido, a **`Continuation`**: o objeto que sabe
  continuar a execução;
- o corpo vira uma **máquina de estados**, com um estado para cada ponto de suspensão, e as variáveis
  locais que atravessam uma suspensão viram campos desse objeto;
- quando a função suspende, ela devolve o marcador `COROUTINE_SUSPENDED`. Quem a retoma chama a
  `Continuation` com o resultado.

Duas consequências práticas. A coroutine parada custa um objeto no heap, não uma pilha: medido no JDK
25, 100 mil coroutines rasas (um só nível de suspensão) ocuparam ~370 B cada; cada função `suspend`
a mais na cadeia acrescenta outro objeto de *continuation*. E `suspend` tem **cor**: uma função comum não
chama uma função `suspend`, e a palavra se propaga pela base de código. É o preço do modelo, e a
comparação com *virtual threads* gira em torno dele.

## `launch` × `async`, e as pontes

| Construtor | Devolve | Para quê |
| --- | --- | --- |
| `launch { ... }` | `Job` | fazer algo sem valor de volta (disparar uma entrega) |
| `async { ... }` | `Deferred<T>`, com `await()` | calcular um valor em paralelo |
| `coroutineScope { ... }` | o valor do bloco | abrir um escopo dentro de uma função `suspend` |
| `runBlocking { ... }` | o valor do bloco, **bloqueando** a thread | só em `main` e em teste |

O `async` só dá paralelismo se os dois começarem antes do primeiro `await`. Em tempo virtual:

```kotlin
coroutineScope {
    val a = async { delay(1000); 1 }
    val b = async { delay(1000); 2 }
    a.await() + b.await()            // 1.000 ms
}
coroutineScope {
    val a = async { delay(1000); 1 }.await()   // espera aqui
    val b = async { delay(1000); 2 }.await()   // 2.000 ms no total
    a + b
}
```

`runBlocking` é a ponte do mundo bloqueante para o suspenso, e bloqueia a thread que o chama. Dentro de
um *controller*, ele prende a thread da requisição até a coroutine acabar, e não há ganho nenhum. No
servidor, o *framework* chama o seu código `suspend` direto (marco 08).

## *Dispatchers* e `withContext`

O *dispatcher* decide **em que threads** a coroutine roda:

- **`Dispatchers.Default`:** tantas threads quanto núcleos, com no mínimo 2 (num *pod* de 1 vCPU, são
  2). É para CPU.
- **`Dispatchers.IO`:** um *pool* elástico, com limite padrão de 64 threads (ou o número de núcleos,
  se for maior). É para chamada que bloqueia de verdade, como JDBC, arquivo ou um SDK sem versão
  assíncrona.
- **`Dispatchers.Main`:** a thread de interface do Android e das telas de *desktop*. Num servidor ele
  não existe, e usá-lo falha.

`withContext(Dispatchers.IO) { jdbc.query(...) }` troca de *dispatcher* só para aquele bloco e devolve o
valor; não cria concorrência. `Dispatchers.IO.limitedParallelism(10)` cria uma vista com no máximo 10
threads, que serve para isolar um recurso: o *driver* legado nunca ocupa mais que 10 threads, e não
esvazia o IO para o resto do serviço.

## Bloquear dentro de coroutine anula tudo

`Thread.sleep`, uma chamada JDBC ou `HttpClient.send` dentro de uma coroutine no `Default` **prendem a
thread**, e com 4 núcleos o serviço tem 4 threads. Medido no `pix-status`, com um recebedor de teste
que responde em 200 ms:

| Cliente | Entregas | Threads | Tempo |
| --- | ---: | --- | ---: |
| `HttpClient.send` (bloqueante) em `Dispatchers.Default` | 200 | 4 do `Default` | 10,1 s |
| `sendAsync(...).await()` (suspenso), limite de 50 por recebedor | 10.000 | 2 do *dispatcher* + 2 do `HttpClient` (executor fixo) | 2,8 s |

A conta do bloqueante é a de qualquer *pool*: 200 × 0,2 s ÷ 4 = 10 s. Para 10 mil entregas, seriam
~500 s. O suspenso fez 50 vezes mais entregas com o mesmo número de threads, porque nenhuma delas fica
esperando a resposta. O executor do `HttpClient` precisa ser fixado
(`HttpClient.newBuilder().executor(...)`): sem isso, o cliente do JDK completa as respostas num *pool*
próprio que cresce conforme a carga, e a revisão deste marco contou 225 threads nele no mesmo teste.

Como pegar o bloqueio: o **BlockHound** (`spring-boot/13`) tem integração com coroutines no
`kotlinx-coroutines-debug`. Instalado no teste, um `Thread.sleep` dentro de
`withContext(Dispatchers.Default)` lança `BlockingOperationError: Blocking call!
java.lang.Thread.sleepNanos0`, e o mesmo `sleep` em `Dispatchers.IO` passa, porque o IO existe para
isso.

## Testar com tempo virtual

`runTest`, do `kotlinx-coroutines-test`, roda a coroutine num relógio virtual: `delay` não espera, só
adianta o relógio. Um prazo de 5 s contra um recebedor que demora 10 s se prova em milissegundos:

```kotlin
@Test fun `prazo de 5 s`() = runTest {
    val lento = Transporte { _, _ -> delay(10.seconds); 200 }
    val r = EntregaSuspensa(lento, prazo = 5.seconds).entregar(url, "{}")
    assertThat(r).isEqualTo(ResultadoEntrega.Expirou)
    assertThat(currentTime).isEqualTo(5_000)          // medido: 5 ms de tempo real
}
```

## Coroutines × *virtual threads* × goroutines

A pergunta de entrevista é "por que coroutines se o Java 21 tem *virtual threads*?". A resposta está na
tabela. A memória foi medida com 100 mil unidades paradas: coroutines e *virtual threads* no JDK 25,
goroutines no Go 1.24.

| | Coroutine (Kotlin) | *Virtual thread* (Java) | Goroutine (Go) |
| --- | --- | --- | --- |
| o que é | objeto de *continuation*, máquina de estados gerada pelo compilador | `Thread`, com a pilha copiada para o heap ao bloquear | pilha própria, que cresce e encolhe |
| memória parada | ~370 B | ~994 B | ~2,7 KB (2 KB de pilha) |
| quem escalona | o *dispatcher* (biblioteca) | `ForkJoinPool` do JDK (`concorrencia-e-recursos/06`) | o *runtime* do Go |
| preempção por tempo | não; só nos pontos de suspensão | não; só ao bloquear | sim, assíncrona desde o Go 1.14 |
| código bloqueante | prende a thread do *dispatcher* | desmonta na maioria das esperas; I/O de arquivo e chamada nativa prendem a *carrier* | o *runtime* lida com a *syscall* |
| cor na função | sim: `suspend` | não | não |
| cancelamento | estruturado, pela hierarquia de `Job` (marco 06) | `interrupt` cooperativo; `StructuredTaskScope` ainda em *preview* | `context.Context` passado à mão (`go-fintech/06`) |

O resumo para a entrevista: *virtual threads* tornam barato o código bloqueante que já existe, sem mudar
uma linha (`spring-boot/07`). Coroutines pedem `suspend` em toda a cadeia, e dão em troca **concorrência
estruturada**: cancelamento, prazo e falha propagados pela árvore de coroutines (marco 06), e `Flow`
com *backpressure* (marco 07). Goroutines têm o modelo mais simples de escrever, e deixam o
cancelamento e o vazamento para a disciplina com `context`.

## Exemplo numa fintech

O `pix-status` entregava 10 mil *webhooks* por minuto num pico. A primeira versão usava o cliente
HTTP bloqueante dentro de `launch` no `Dispatchers.Default`, porque "é coroutine, é leve". Com 4
núcleos e recebedores respondendo em 200 ms, o serviço entregava ~20 por segundo, a fila crescia, e o
*health check*, que rodava no mesmo *dispatcher*, começou a expirar. O pod foi reiniciado em laço.
Trocar o cliente pelo `sendAsync().await()`, com um `Semaphore` por recebedor, resolveu sem mudar o
número de pods.

## Hands-on

**Tutorial.** Acrescente ao `pix-status` o `kotlinx-coroutines-core` 1.10.2 (a versão do Boot 4.1.2),
o `kotlinx-coroutines-test` e o `kotlinx-coroutines-debug`, e escreva o recebedor de teste: um
`HttpServer` do JDK que responde 200 depois de 200 ms, com *virtual threads* no executor e um contador
de pico de conexões por caminho.

**Desafio.** O cliente de *webhook* suspenso: `Transporte` como `fun interface` `suspend`, a versão
HTTP com `sendAsync(...).await()`, e `EntregaSuspensa` com `withTimeout` e um `Semaphore` por
recebedor, devolvendo `Entregue`, `Recusada` ou `Expirou`.

**Invariantes testáveis**

1. **Sem bloqueio.** 10 mil entregas para 100 recebedores, com o recebedor respondendo em 200 ms,
   terminam em menos de 15 s com **2 threads** de *dispatcher* e o `HttpClient` com executor fixo de 2
   threads (medido: 2,8 s), todas `Entregue(200)`. Um segundo
   teste instala o BlockHound e prova que um `Thread.sleep` em `Dispatchers.Default` lança
   `BlockingOperationError`.
2. **Prazo em tempo virtual.** Com um transporte que demora 10 s e prazo de 5 s, o resultado é
   `Expirou`, `currentTime` é exatamente 5.000 e o teste leva menos de 2 s de tempo real.
3. **Limite por recebedor.** Com limite de 7 e mil entregas para o mesmo recebedor, o pico de
   entregas simultâneas é exatamente 7, medido por um contador de pico. No teste HTTP, o pico medido
   no próprio recebedor nunca passa do limite.

**Complemento.** Rode o teste 1 com o cliente bloqueante em `Dispatchers.IO` e em
`Dispatchers.IO.limitedParallelism(16)`, e explique os tempos pelo número de threads. Depois meça a
memória de 100 mil coroutines suspensas e de 100 mil *virtual threads* paradas no seu JDK.

**Checagem**

1. O que o compilador gera para uma função `suspend`, e por que uma coroutine parada custa menos que
   uma pilha?
2. Por que `async { }.await()` logo em seguida não dá paralelismo?
3. Qual *dispatcher* para JDBC e qual para cálculo, e o que `limitedParallelism` acrescenta?
4. Em que coroutines e *virtual threads* diferem no cancelamento, e qual delas pede mudança no
   código existente?

## Principais aprendizados

- `suspend` vira *continuation* e máquina de estados; a coroutine parada é um objeto, e a palavra tem
  cor.
- `launch` para disparar, `async` para valor em paralelo (todos os `async` antes do primeiro `await`),
  `runBlocking` só em `main` e teste.
- `Default` para CPU, `IO` para bloqueio de verdade, `limitedParallelism` para isolar um recurso;
  `Main` não existe no servidor.
- Bloquear no `Default` derruba o serviço: 200 entregas em 10 s contra 10 mil em 2,8 s. BlockHound
  acusa.
- Tempo virtual (`runTest`) prova prazo em milissegundos; `Semaphore` limita por recebedor.
- *Virtual threads* barateiam o código bloqueante que já existe; coroutines cobram `suspend` e dão
  concorrência estruturada.
