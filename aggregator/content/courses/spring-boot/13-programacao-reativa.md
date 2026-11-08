---
id: programacao-reativa
title: "Programação reativa a fundo"
summary: "Reativo é um contrato de backpressure e de não bloquear; quebre um dos dois e você tem o pior dos mundos. Montagem × assinatura, publishOn × subscribeOn, flatMap com limite e o erro que some, backpressure com buffer limitado, o trace_id que se perde na troca de thread, BlockHound e StepVerifier — e quando não usar."
estimatedMinutes: 65
reviewedAt: 2026-11-08
reviewEvery: 12m
competencies: [performance, confiabilidade]
references:
  - title: "Reactor Core Reference Guide"
    url: https://projectreactor.io/docs/core/release/reference/
  - title: "Reactive Streams Specification for the JVM"
    url: https://github.com/reactive-streams/reactive-streams-jvm
  - title: "BlockHound"
    url: https://github.com/reactor/BlockHound
  - title: "Micrometer Context Propagation"
    url: https://github.com/micrometer-metrics/context-propagation
---

## *Reactive Streams* em uma página

O Reactor implementa a especificação *Reactive Streams*, que cabe em quatro interfaces: um
`Publisher` produz; um `Subscriber` consome; a `Subscription` liga os dois; e o `Processor` é os dois
ao mesmo tempo. O contrato que importa é um só: **o `Subscriber` pede, com `request(n)`, e o
`Publisher` nunca manda mais do que foi pedido.** Isso é *backpressure*: quem consome dita o ritmo de
quem produz.

O Reactor dá dois tipos sobre esse contrato: **`Mono`**, de 0 ou 1 elemento (uma chamada HTTP, uma
linha do banco), e **`Flux`**, de 0 a N (um *stream* de eventos, um lote de consultas).

## Montagem e assinatura

Um `Mono` ou `Flux` é a descrição de um trabalho. Nada acontece até alguém **assinar**
(`subscribe`, ou `block` num teste). E cada assinatura executa tudo de novo: um
`Mono.fromCallable(() -> chamarPsp())` montado uma vez e assinado duas vezes chama o PSP **duas**
vezes. Medido: montado, zero chamadas; depois de dois `block()`, duas.

A consequência prática é que guardar um `Mono` num campo não guarda o resultado, guarda a receita.
Para reaproveitar um resultado, use `cache()`, sabendo o que isso significa para dados que mudam.

## Operadores que importam

- **`map`:** transformação síncrona de cada elemento. Nunca coloque I/O dentro dele.
- **`flatMap`:** cada elemento vira um `Publisher`, e os resultados se misturam **na ordem em que
  terminam**. O segundo argumento é a **concorrência**: `flatMap(f, 4)` mantém no máximo 4 em voo.
  Sem ele, o padrão é 256.
- **`concatMap`:** como o `flatMap`, mas um de cada vez e **na ordem de origem**. Medido, com atrasos
  de 150, 50 e 100 ms para os elementos 3, 1 e 2: o `flatMap` entregou `[1, 2, 3]`, e o `concatMap`
  entregou `[3, 1, 2]`.
- **`zip`:** combina o n-ésimo elemento de cada fonte, quando todos chegaram (no `Mono.zip`, o único).
- **`timeout(Duration)`:** falha com `TimeoutException` se nada chegar no prazo.
- **`retryWhen(Retry.backoff(n, d))`:** reassina com espera exponencial, com *jitter* de 50% por
  padrão. Retry só no idempotente (`spring-boot/08`).

## *Schedulers*: `publishOn` × `subscribeOn`

Por padrão, o código roda na thread de quem emitiu o sinal, até algo mudar isso. Três coisas mudam:
os dois operadores abaixo e os **operadores de tempo** (`delay`, `delayElement`, `interval`, `timeout`,
o *backoff* do `retryWhen`), que emitem no `Schedulers.parallel()`.

- **`subscribeOn(s)`** muda onde a **fonte** roda, o início da cadeia, não importa onde ele esteja
  escrito. Com vários, vale o mais próximo da fonte; e numa fonte que emite na própria thread (um
  `interval`, a resposta do `WebClient` no Netty), ele não move as emissões.
- **`publishOn(s)`** muda onde roda tudo o que vem **depois** dele.

Medido num `Flux.just(1)` com um `doOnNext` antes do `publishOn(parallel)`, um entre os dois, e um
depois do `subscribeOn(boundedElastic)`: as threads foram `boundedElastic`, `parallel` e `parallel`.
O `subscribeOn` escrito por último decidiu onde a fonte rodou.

Os *schedulers* prontos: **`parallel()`**, com uma thread por núcleo, para CPU; e **`boundedElastic()`**,
um *pool* que cresce sob demanda até 10 threads por núcleo, para encaixar código bloqueante que não
tem versão reativa. O *event loop* do WebFlux é outro *pool*, o do Reactor Netty (`reactor-http-nio`),
mas as regras são as mesmas: as duas são threads que não podem bloquear.

## Bloqueio no *event loop*

O WebFlux atende todas as conexões com poucas threads (`spring-boot/07`). Uma chamada bloqueante
dentro de um `map` (um JDBC escondido, um `Thread.sleep`, um cliente HTTP síncrono) segura uma dessas
threads, e todo cliente que depende dela espera junto.

Medido: 8 "consultas" de 200 ms com `Thread.sleep`, cada uma num `Mono` com `publishOn` para um
*scheduler* de 2 threads dentro de um `flatMap`, levaram ~843 ms: as 8 rodaram de 2 em 2 (8 × 200 / 2).
As mesmas 8, como `Mono.fromCallable(...)` com `subscribeOn(boundedElastic())`, levaram ~209 ms,
porque o `boundedElastic` tinha threads para as 8. O código bloqueante que não pode ser trocado vai
para o `boundedElastic`, nunca para o *event loop*.

O **BlockHound** detecta isso em teste: instalado, ele instrumenta o JDK e lança
`BlockingOperationError: Blocking call! java.lang.Thread.sleepNanos0` quando uma thread marcada como
não bloqueante bloqueia. Ele só acusa o que o teste executa numa dessas threads (`parallel`, Netty):
o mesmo bloqueio na `main` ou no `boundedElastic` passa. Por isso o *stub* de teste emite via
`Mono.delay`. Dois cuidados, conferidos no JDK 25 com o BlockHound 1.0.18:

- **Ele só sobe com `-XX:+AllowRedefinitionToAddDeleteMethods`.** Sem a flag, a instalação falha com
  `IllegalStateException`. Com ela, a JVM avisa que a flag está *deprecated* desde o JDK 13 e pode
  ser removida. É um risco de compatibilidade a acompanhar a cada versão do JDK.
- **Instale-o antes de qualquer thread do Reactor existir**, num bloco `static` da classe de teste ou
  com o `blockhound-junit-platform`, que instala no início da execução. Ele vale para o processo
  inteiro e não desinstala, e instalado no meio da suíte acusa como bloqueio a própria espera
  ociosa das threads `parallel` já criadas. Isso mata *workers* e quebra testes que não têm nada a
  ver: na conferência, um teste de `trace_id` passou a travar, e uma revisão independente
  reproduziu o mesmo travamento num `flatMap` sem bloqueio nenhum. Instalado num `static`, o teste
  do BlockHound e o de `trace_id` passaram na mesma JVM. Rodar o *surefire* com
  `reuseForks=false`, uma JVM por classe, é uma proteção a mais, não o requisito.

## Erro como sinal, e o erro que some

No Reactor, erro é um sinal terminal: depois de um `onError`, a sequência acabou.

- **`onErrorResume(e -> fallback)`** troca o erro por outra sequência.
- **`onErrorMap(e -> novo)`** traduz o erro, por exemplo de uma exceção de infraestrutura para uma de
  domínio.

Onde o tratamento fica muda o resultado. Num `Flux.just(1, 2, 3).flatMap(...)` em que o PSP 2 falha:

- com o `onErrorResume` **fora** do `flatMap`, o resultado foi `[1, -1]`. O erro terminou a sequência
  inteira, e o 3 nunca chegou;
- com o `onErrorResume` **dentro** do `flatMap`, no `Mono` de cada PSP, o resultado foi `[1, 3]`. Só a
  chamada que falhou foi tratada.

Num lote, a falha de um item não pode derrubar os outros: o tratamento vai dentro.

## *Backpressure* com produtor rápido

O contrato `request(n)` protege quem consome, mas só se a fonte o respeitar. Uma fonte de tempo (um
`Flux.interval`, eventos que chegam de fora) não espera pedido, e o operador escolhe o que fazer com o
excesso:

- **`onBackpressureBuffer(16)`** guarda até 16 e, depois disso, falha com `OverflowException`, em vez
  de deixar a memória crescer. Medido com produtor a 1 item/ms e consumidor a 1 item/20 ms: o
  estouro acontece no 17º item, mas o assinante só recebe o erro depois de drenar os 16 guardados,
  o que, com esse consumidor, levou algumas centenas de milissegundos. Um
  `onBackpressureBuffer()` sem limite é um vazamento com prazo.
- **`onBackpressureDrop`** descarta o que não foi pedido; para contar, passe um consumidor
  (`onBackpressureDrop(x -> descartados.increment())`).
- **`limitRate(10)`** pede aos poucos: num `Flux.range(1, 100)`, os pedidos foram de 10 e depois de 8
  em 8 (reabastece com n − n/4), em vez de pedir tudo de uma vez.

## Contexto reativo e o `trace_id`

Um `ThreadLocal` não atravessa a troca de thread: o `trace_id` que estava no MDC da thread do pedido
não está na thread `parallel` onde o `flatMap` continua. Medido: sem nada, o log dentro do `flatMap`
saiu com `trace=null`. O Reactor carrega dados num **`Context`** próprio, escrito com `contextWrite`.
Com a biblioteca **Micrometer Context Propagation**, um `ThreadLocalAccessor` registrado e
`Hooks.enableAutomaticContextPropagation()`, o `ThreadLocal` é restaurado a cada operador. O mesmo log
saiu com `trace=abc123`. No Spring Boot, isso **não vem ligado**: a propriedade
`spring.reactor.context-propagation` tem o padrão `limited`, que só restaura os `ThreadLocal`s em
`handle` e `tap`. Com `spring.reactor.context-propagation=auto`, o Boot chama o *hook*, e o `trace_id` do
Micrometer Tracing (`spring-boot/10`) aparece nos logs emitidos dentro de um `flatMap`.

## `WebClient`, R2DBC e testes

O **`WebClient`** é o cliente HTTP reativo. *Timeout* de resposta no conector e `timeout()` no `Mono`
são as duas camadas; nenhuma das duas existe por padrão. O **R2DBC** é o acesso reativo a banco, com
limites reais: transação via `TransactionalOperator` ou `@Transactional` sobre um
`ReactiveTransactionManager`, *pool* próprio (`r2dbc-pool`), e menos
maturidade que o JDBC em *drivers* e ferramentas. Ele só vale quando todo o caminho é reativo.

O **`StepVerifier`**, do `reactor-test`, assina e confere cada sinal. Com
**`StepVerifier.withVirtualTime`**, o tempo é simulado: um `timeout` de 2 s é provado sem esperar 2 s.
Um `retryWhen` com *backoff* de 1, 2 e 4 s (com `jitter(0)`, para esperas exatas) também, em
milissegundos de teste.

## Quando não usar

Desde o Java 21, *virtual threads* resolvem o I/O bloqueante com código imperativo: o MVC com
`spring.threads.virtual.enabled=true` atende milhares de requisições concorrentes com `try`/`catch`,
`ThreadLocal` e JDBC normais (`spring-boot/07`, `concorrencia-e-recursos/06`). O gargalo passa a ser
o *pool* de conexões (o Hikari tem 10 por padrão), não as threads (`concorrencia-e-recursos/07`). O reativo continua
fazendo sentido quando o problema é o **fluxo**:
- *streaming* com *backpressure* de ponta a ponta;
- um consumidor que dita o ritmo de um produtor (o consumo do Kafka, `kafka/04`);
- composição de muitas fontes assíncronas com operadores.

Para "o endpoint chama três serviços e o banco", *virtual threads* entregam a escala com menos custo
de manutenção. Em Kotlin, o mesmo papel do `Flux` é do `Flow` (`kotlin-backend/07`).

## Exemplo numa fintech

O *fan-out* do `pix-gateway` para três PSPs foi reescrito com `Flux.merge` sobre o `WebClient`. Num
dia, um PSP ficou lento, e o serviço inteiro parou de responder, inclusive para os clientes que nem
usavam aquele PSP. A causa não era o PSP lento: dentro de um `map`, um *helper* consultava a tabela de
tarifas por JDBC, e essa chamada bloqueante segurava as poucas threads do *event loop* enquanto o
banco disputava conexões com o tráfego acumulado. O BlockHound, ligado na suíte de teste e com um
teste que exercitasse aquele `map` numa thread `parallel`, teria reprovado o *merge*.

## Hands-on

**Tutorial.** Reescreva o *fan-out* do marco 07 com `WebClient` e `Flux.merge`. Reproduza as
medições deste marco: montagem × assinatura, as threads de `publishOn` × `subscribeOn`, `flatMap` ×
`concatMap`, e o `onErrorResume` dentro e fora do `flatMap`.

**Desafio.** A consulta de status em lote: para uma lista de pagamentos, consultar o status no PSP com
no máximo N chamadas em voo e *timeout* de 2 s por chamada. Uma chamada que estoura o *timeout* vira
`DESCONHECIDO`, sem derrubar o lote.

**Invariantes testáveis**

1. Nunca mais de N chamadas em voo. Um *stub* com latência (`delayElement`) conta o pico,
   incrementando ao assinar e decrementando no `doOnTerminate` **e** no `doOnCancel`. Com 100 itens
   e N = 4, o pico é exatamente 4; com um terço das chamadas presas e *timeout* de 50 ms, o pico
   continua 4 e o contador termina em zero. O contador precisa estar certo:
   - decrementado no `doFinally`, que roda depois de o sinal descer, ele mediu mais que 4 (de 5 a 7
     conforme a execução), porque o `flatMap` já tinha assinado a próxima chamada;
   - sem o `doOnCancel`, as chamadas canceladas pelo *timeout* nunca decrementam, e o pico subiu
     para 11.
2. Com o BlockHound ativo, a suíte falha se o teste exercitar uma chamada bloqueante numa thread não
   bloqueante. Um *stub* que emite via `Mono.delay` (portanto numa thread `parallel`) e tem um
   `Thread.sleep` num `map` produz `Blocking call!`. O BlockHound é instalado num bloco `static`, antes
   de qualquer thread do Reactor, com `-XX:+AllowRedefinitionToAddDeleteMethods` no *surefire*.
3. O `StepVerifier` com tempo virtual prova o *timeout* de 2 s sem esperar 2 s: o PSP que nunca
   responde (`Mono.never()`) vira `DESCONHECIDO`, e os outros dois itens chegam.
4. Com o consumidor lento, o excesso sobre o *buffer* vira erro: com `onBackpressureBuffer(16)`, a
   sequência termina com um erro que `Exceptions.isOverflow(e)` reconhece, depois de no máximo 16
   itens guardados mais o *prefetch* do consumidor.
5. O `trace_id` da requisição aparece no log emitido dentro do `flatMap`, nas 5 chamadas, com
   `contextWrite` e a propagação automática de contexto.

**Complemento.** A mesma carga em MVC com *virtual threads* e em WebFlux, com o `vegeta`: registre o
p99 e a memória numa tabela, e escreva qual dos dois você manteria no `pix-gateway`.

**Checagem**

1. Por que montar um `Mono` não chama o PSP, e por que assiná-lo duas vezes chama duas?
2. Qual a diferença entre `publishOn` e `subscribeOn`?
3. Onde colocar o `onErrorResume` para que a falha de um item não derrube o lote?
4. Quando você escolheria *virtual threads* em vez de WebFlux?

## Principais aprendizados

- *Reactive Streams* é `request(n)`: o consumidor dita o ritmo.
- Nada roda sem assinatura, e cada assinatura roda tudo de novo.
- `flatMap` com limite de concorrência; `concatMap` quando a ordem importa.
- `subscribeOn` move a fonte; `publishOn` move o que vem depois.
- Bloqueio no *event loop* trava todos os clientes; o BlockHound acusa em teste, instalado antes de
  qualquer thread do Reactor e com uma flag *deprecated* no JDK 25.
- O erro dentro do `flatMap` trata o item; fora, encerra a sequência.
- *Buffer* de *backpressure* sempre com limite.
- O `trace_id` atravessa threads com `Context` e propagação automática; no Boot, com
  `spring.reactor.context-propagation=auto`.
- Para I/O bloqueante comum, *virtual threads* entregam a escala com menos custo.
