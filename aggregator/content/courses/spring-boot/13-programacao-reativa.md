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
- **`zip`:** combina o primeiro elemento de cada fonte, quando todos chegaram.
- **`timeout(Duration)`:** falha com `TimeoutException` se nada chegar no prazo.
- **`retryWhen(Retry.backoff(n, d))`:** reassina com espera exponencial. Retry só no idempotente
  (`spring-boot/08`).

## *Schedulers*: `publishOn` × `subscribeOn`

O Reactor não cria threads sozinho: o código roda na thread de quem emitiu o sinal, até um operador
mudar isso.

- **`subscribeOn(s)`** muda onde a **fonte** roda, o início da cadeia, não importa onde ele esteja
  escrito.
- **`publishOn(s)`** muda onde roda tudo o que vem **depois** dele.

Medido num `Flux.just(1)` com um `doOnNext` antes do `publishOn(parallel)`, um entre os dois, e um
depois do `subscribeOn(boundedElastic)`: as threads foram `boundedElastic`, `parallel` e `parallel`.
O `subscribeOn` escrito por último decidiu onde a fonte rodou.

Os *schedulers* prontos: **`parallel()`**, com uma thread por núcleo, para CPU e para o *event loop*;
e **`boundedElastic()`**, um *pool* que cresce sob demanda, com limite, para encaixar código
bloqueante que não tem versão reativa.

## Bloqueio no *event loop*

O WebFlux atende todas as conexões com poucas threads (`spring-boot/07`). Uma chamada bloqueante
dentro de um `map` (um JDBC escondido, um `Thread.sleep`, um cliente HTTP síncrono) segura uma dessas
threads, e todo cliente que depende dela espera junto.

Medido: 8 "consultas" de 200 ms com `Thread.sleep`, num `map` sobre um *scheduler* de 2 threads,
levaram ~843 ms. As 8 rodaram de 2 em 2. As mesmas 8, como `Mono.fromCallable(...)` com
`subscribeOn(boundedElastic())`, levaram ~209 ms. O código bloqueante que não pode ser trocado vai
para o `boundedElastic`, nunca para o *event loop*.

O **BlockHound** detecta isso em teste: instalado, ele instrumenta o JDK e lança
`BlockingOperationError: Blocking call! java.lang.Thread.sleepNanos0` quando uma thread marcada como
não bloqueante bloqueia. Dois cuidados, conferidos no JDK 25 com o BlockHound 1.0.18:

- **Ele só sobe com `-XX:+AllowRedefinitionToAddDeleteMethods`.** Sem a flag, a instalação falha com
  `IllegalStateException`. Com ela, a JVM avisa que a flag está *deprecated* desde o JDK 13 e pode
  ser removida. É um risco de compatibilidade a acompanhar a cada versão do JDK.
- **Ele vale para o processo inteiro e não desinstala.** Instalado no meio de uma classe de teste,
  ele travou outro teste da mesma JVM, que dependia de propagação de contexto. A solução foi pôr o
  teste do BlockHound numa classe própria e rodar o *surefire* com `reuseForks=false`, uma JVM por
  classe.

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

- **`onBackpressureBuffer(16)`** guarda até 16 e, depois disso, falha com `OverflowException`. Medido:
  produtor a 1 item/ms, consumidor a 1 item/20 ms, erro em poucos milissegundos, em vez de memória
  crescendo até o `OutOfMemoryError`. Um `onBackpressureBuffer()` sem limite é um vazamento com prazo.
- **`onBackpressureDrop`** descarta o que não cabe, e conta o descarte.
- **`limitRate(10)`** pede aos poucos: num `Flux.range(1, 100)`, os pedidos foram de 10 e depois de 8
  em 8 (reabastece a 75%), em vez de pedir tudo de uma vez.

## Contexto reativo e o `trace_id`

Um `ThreadLocal` não atravessa a troca de thread: o `trace_id` que estava no MDC da thread do pedido
não está na thread `parallel` onde o `flatMap` continua. Medido: sem nada, o log dentro do `flatMap`
saiu com `trace=null`. O Reactor carrega dados num **`Context`** próprio, escrito com `contextWrite`.
Com a biblioteca **Micrometer Context Propagation**, um `ThreadLocalAccessor` registrado e
`Hooks.enableAutomaticContextPropagation()`, o `ThreadLocal` é restaurado a cada operador. O mesmo log
saiu com `trace=abc123`. No Spring Boot com Micrometer Tracing, isso é o que faz o `trace_id` aparecer
nos logs de um serviço WebFlux (`spring-boot/10`).

## `WebClient`, R2DBC e testes

O **`WebClient`** é o cliente HTTP reativo. *Timeout* de resposta no conector e `timeout()` no `Mono`
são as duas camadas; nenhuma das duas existe por padrão. O **R2DBC** é o acesso reativo a banco, com
limites reais: transação via `TransactionalOperator`, *pool* próprio (`r2dbc-pool`), e menos
maturidade que o JDBC em *drivers* e ferramentas. Ele só vale quando todo o caminho é reativo.

O **`StepVerifier`**, do `reactor-test`, assina e confere cada sinal. Com
**`StepVerifier.withVirtualTime`**, o tempo é simulado: um `timeout` de 2 s é provado sem esperar 2 s.
Um `retryWhen` com *backoff* de 1, 2 e 4 s também, em milissegundos de teste.

## Quando não usar

Desde o Java 21, *virtual threads* resolvem o I/O bloqueante com código imperativo: o MVC com
`spring.threads.virtual.enabled=true` atende milhares de requisições concorrentes com `try`/`catch`,
`ThreadLocal` e JDBC normais (`spring-boot/07`, `concorrencia-e-recursos/06`). O reativo continua
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
banco disputava conexões com o tráfego acumulado. O BlockHound, ligado na suíte de teste, teria
reprovado o *merge* daquele `map`.

## Hands-on

**Tutorial.** Reescreva o *fan-out* do marco 07 com `WebClient` e `Flux.merge`. Reproduza as
medições deste marco: montagem × assinatura, as threads de `publishOn` × `subscribeOn`, `flatMap` ×
`concatMap`, e o `onErrorResume` dentro e fora do `flatMap`.

**Desafio.** A consulta de status em lote: para uma lista de pagamentos, consultar o status no PSP com
no máximo N chamadas em voo e *timeout* de 2 s por chamada. Uma chamada que estoura o *timeout* vira
`DESCONHECIDO`, sem derrubar o lote.

**Invariantes testáveis**

1. Nunca mais de N chamadas em voo. Um *stub* conta o pico, incrementando ao assinar e decrementando
   no `doOnTerminate`. Com 100 itens e N = 4, o pico é exatamente 4. O contador precisa estar certo:
   decrementando no `doFinally`, que roda depois de o sinal descer, a primeira versão mediu 7,
   porque o `flatMap` já tinha assinado a próxima chamada.
2. Com o BlockHound ativo, a suíte falha se houver chamada bloqueante no caminho reativo. Um *stub*
   com `Thread.sleep` dentro de um `map` produz `Blocking call!`. O teste fica numa classe própria,
   com o *surefire* em `reuseForks=false` e `-XX:+AllowRedefinitionToAddDeleteMethods`.
3. O `StepVerifier` com tempo virtual prova o *timeout* de 2 s sem esperar 2 s: o PSP que nunca
   responde (`Mono.never()`) vira `DESCONHECIDO`, e os outros dois itens chegam.
4. Com o consumidor lento, o produtor não acumula mais que o *buffer* configurado: com
   `onBackpressureBuffer(16)`, o excesso vira `OverflowException`, e não `OutOfMemoryError`.
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
- Bloqueio no *event loop* trava todos os clientes; o BlockHound acusa em teste, e precisa de JVM
  própria e de uma flag *deprecated* no JDK 25.
- O erro dentro do `flatMap` trata o item; fora, encerra a sequência.
- *Buffer* de *backpressure* sempre com limite.
- O `trace_id` atravessa threads com `Context` e propagação automática.
- Para I/O bloqueante comum, *virtual threads* entregam a escala com menos custo.
