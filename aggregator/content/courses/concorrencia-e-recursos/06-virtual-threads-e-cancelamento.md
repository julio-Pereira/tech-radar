---
id: virtual-threads-e-cancelamento
title: "Virtual threads, cancelamento e goroutines"
summary: "Quando a thread fica barata, o recurso escasso deixa de ser a thread — e o que sobra é cancelar a tempo e não vazar."
estimatedMinutes: 70
references:
  - title: "JEP 444 — Virtual Threads"
    url: https://openjdk.org/jeps/444
  - title: "Virtual Threads (Java SE 25, Core Libraries)"
    url: https://docs.oracle.com/en/java/javase/25/core/virtual-threads.html
  - title: "JEP 491 — Synchronize Virtual Threads without Pinning"
    url: https://openjdk.org/jeps/491
  - title: "JEP 506 — Scoped Values"
    url: https://openjdk.org/jeps/506
  - title: "JEP 505 — Structured Concurrency (Fifth Preview)"
    url: https://openjdk.org/jeps/505
  - title: "uber-go/goleak"
    url: https://github.com/uber-go/goleak
---

## O que o `spring-boot/07` já cobriu, e o que falta

`spring-boot/07` ensinou o que são virtual threads, o problema de **pinning** — uma virtual
thread bloqueada que prende (fixa) a thread de plataforma que a carrega, em vez de liberá-la para
outra virtual thread — **e como ele mudou no JDK 24**. Este marco não repete isso. O que falta são três coisas: **limitar concorrência** quando a thread deixa de ser o recurso
escasso, o custo de `ThreadLocal` em escala de milhões de threads, e o par completo de
cancelamento — cooperativo em Java, por `context` em Go.

**O estado do pinning hoje.** No JDK 25, a base desta trilha, bloquear dentro de
`synchronized` — e em `Object.wait()` — **desmonta** a virtual thread normalmente: é o JEP 491
(*Synchronize Virtual Threads without Pinning*), final desde o JDK 24. A regra antiga "troque
`synchronized` por `ReentrantLock` por causa de virtual threads" deixou de valer.
`ReentrantLock` continua útil pelo que o marco 03 ensinou (`tryLock` com timeout, fairness),
não por pinning.

O que **ainda** prende é a chamada nativa (método nativo ou FFM) que volta para Java e
bloqueia — raro em código de aplicação, comum em drivers e bibliotecas com JNI. O JEP 491 fala
em "poucos outros casos" sem listá-los; se o evento JFR `jdk.VirtualThreadPinned` aparecer, é
ali que se olha. Ele continua existindo, agora só para esses casos residuais. Já
`-Djdk.tracePinnedThreads`, que metade dos tutoriais da internet ensina, **não faz nada** desde
o 24 — é o tipo de conselho desatualizado que você vai encontrar.

> **Se você está no Java 21:** `synchronized` e `Object.wait()` com bloqueio prendem a
> carrier. A mitigação é `ReentrantLock` nos caminhos quentes, e o diagnóstico é o evento
> `jdk.VirtualThreadPinned` ou `-Djdk.tracePinnedThreads=full`. Se o seu ambiente pode subir
> para o 25, isso resolve o problema na raiz — é o argumento técnico mais forte para a
> migração.

**Structured concurrency e scoped values.** `ScopedValue` (JEP 506) é **API final** no JDK 25:
dado imutável compartilhado com uma árvore de chamadas, com escopo bem definido. E as duas
features se ligam: **as subtarefas de um `StructuredTaskScope` herdam os `ScopedValue` do
pai** — o id de correlação chega às três chamadas do extrato sem passar parâmetro.

`StructuredTaskScope` (JEP 505), por sua vez, segue em **preview** no JDK 25 **e no 27** — exige
`--enable-preview` — e a API **mudou de forma** no 25: no lugar das subclasses
`ShutdownOnFailure`/`ShutdownOnSuccess` do formato do 21, entra `StructuredTaskScope.open()`
com um `Joiner`. Quem aprendeu pelo formato antigo vai encontrar código que não compila mais. O
formato atual, para referência:

```java
try (var scope = StructuredTaskScope.open(
        StructuredTaskScope.Joiner.<Object>allSuccessfulOrThrow(),
        cfg -> cfg.withTimeout(Duration.ofSeconds(2)))) {
    var saldo       = scope.fork(() -> saldoClient.buscar(conta));
    var lancamentos = scope.fork(() -> lancamentosClient.buscar(conta));
    var limite      = scope.fork(() -> limiteClient.buscar(conta));
    scope.join();   // uma falha cancela as irmãs; timeout cancela todas
    return new Extrato(saldo.get(), lancamentos.get(), limite.get());
}
```

Por isso a regra desta trilha sobre preview é diferente da do `spring-boot` (que não usa
preview em lugar nenhum): aqui, structured concurrency é assunto central, então ela aparece —
mas só num Complemento, nunca no caminho principal nem num invariante obrigatório. Código
compilado com preview fica preso à release exata do JDK: um `.class` de preview do 25 não roda
no 27.

> **Se você está no Java 21:** `ScopedValue` é preview e exige `--enable-preview`; use
> `ThreadLocal` com `remove()` num `finally`.

## Limitar concorrência quando threads são baratas

Com milhões de virtual threads possíveis, o gargalo deixa de ser "quantas threads cabem" e passa a
ser "quanta concorrência o recurso de destino aguenta" — exatamente a mesma virada de perspectiva
do marco 05 para Go. A ferramenta certa é um **`Semaphore`**, não um pool de threads virtuais: um
semáforo com 20 permissões limita quantas virtual threads simultâneas tocam o banco, mesmo que
10 mil delas estejam vivas ao mesmo tempo esperando a vez.

`ThreadLocal` continua funcionando com virtual threads, mas o custo por thread (mesmo pequeno)
multiplica por milhões quando a população de threads cresce nessa ordem de grandeza —
`ScopedValue` existe em parte para isso: é imutável, tem escopo bem definido (vale durante a
execução de um bloco, e é automaticamente limpo ao sair dele) e não carrega o custo de manter um
mapa por thread.

## Por dentro: *carrier*, escalonador e quando não usar

Uma *virtual thread* é uma tarefa que o JDK escalona sobre threads de plataforma, as **carriers**.
Dentro de uma, `Thread.currentThread()` mostra as duas coisas:
`VirtualThread[#24]/runnable@ForkJoinPool-1-worker-1`.

- **O escalonador é um `ForkJoinPool` próprio**, não o `commonPool` do `parallelStream`
  (`java-e-jvm/06`). O paralelismo padrão é o número de processadores, ajustável com
  `-Djdk.virtualThreadScheduler.parallelism`.
- **Montar e desmontar é copiar pilha.** Quando a *virtual thread* bloqueia (I/O, `sleep`,
  `Lock`, `BlockingQueue`), os *frames* dela vão para um objeto do heap, e a *carrier* pega outra
  tarefa. Quanto mais funda a pilha no momento do bloqueio, mais memória ela ocupa
  (`java-e-jvm/08` mediu: ~1,8 KB a 1 nível, ~5,2 KB a 200).

### Sem preempção por tempo: a fome de *carrier*

O sistema operacional tira uma thread de plataforma da CPU quando o tempo dela acaba. O escalonador
de *virtual threads* não faz isso: uma *virtual thread* só larga a *carrier* quando bloqueia. Trabalho
de CPU longo, sem bloqueio, prende a *carrier* até terminar.

Medido no JDK 25, com o paralelismo do escalonador em 2. Duas tarefas de CPU de 2 s ocupam as duas
*carriers*, e então chega uma tarefa curta, que só quer rodar por um instante:

| As duas tarefas de CPU rodam em | A tarefa curta esperou |
| --- | ---: |
| *virtual threads* | **1.900 ms** |
| *virtual threads* que chamam `Thread.yield()` a cada fatia | 1.900 ms |
| *virtual threads* que chamam `Thread.sleep(1)` a cada fatia | 1 ms |
| threads de plataforma | 1 ms |

Nesse teste, o `Thread.yield()` não liberou a vez para a tarefa que chegou de fora do pool. O
Javadoc do `yield` o define como uma sugestão ao escalonador, que pode ignorá-la; só um bloqueio de
verdade liberou. Com threads de plataforma, a preempção do sistema operacional resolveu sozinha.

Num serviço, isso é uma rota de cálculo pesado (um relatório, uma assinatura com criptografia cara)
rodando em *virtual threads* ao lado das rotas de I/O: com tarefas pesadas suficientes, as rotas
leves esperam o cálculo acabar.

### Quando usar, e o antipadrão do pool

Medido no JDK 25, com 4 CPUs:

| Carga | *Pool* de threads de plataforma | Uma *virtual thread* por tarefa |
| --- | ---: | ---: |
| 10.000 tarefas de I/O de 100 ms | 5.040 ms (*pool* de 200) | **~200 ms** |
| 32 tarefas de CPU | 193 ms (*pool* de 4) | ~190 ms |

A leitura é a da documentação da Oracle: *virtual threads* dão **escala**, não velocidade. Com I/O,
200 threads de plataforma limitam o serviço a 200 esperas simultâneas, e as *virtual threads* esperam
as 10.000 de uma vez. Com CPU, a conta é a mesma, porque o limite é o número de núcleos, e não há
ganho nenhum.

Três regras saem disso:

- **Uma *virtual thread* por tarefa, nunca um *pool* delas.** O *pool* existe para reaproveitar uma
  thread cara, e a *virtual thread* não é cara. Para limitar a concorrência, use o `Semaphore` da
  seção anterior.
- **CPU longa vai para um *pool* de plataforma dimensionado** (o marco 05), separado do caminho de
  I/O. A rota de I/O continua em *virtual threads*.
- **O ganho depende do destino.** Se as 10.000 tarefas disputam um *pool* de 20 conexões, a escala
  vira fila no *pool* (marco 07).

## Cancelamento: cooperativo em Java, por `context` em Go

**Interrupção em Java é cooperativa**: chamar `interrupt()` numa thread não a para à força — ela
marca um flag, e o código que está rodando precisa checar esse flag (ou estar bloqueado numa
chamada que responde a interrupção, como `Thread.sleep` ou operações de I/O interruptíveis) para
de fato parar. Código que ignora o flag de interrupção simplesmente continua rodando — "cancelar"
não cancela nada sozinho.

**Em Go, o cancelamento é por `context.Context`**: passado explicitamente como parâmetro (por
convenção, o primeiro parâmetro de qualquer função que pode bloquear), carregando *deadline*,
cancelamento e valores de requisição. `context.WithCancel`/`WithTimeout` propagam o cancelamento
para toda a árvore de chamadas que recebeu o mesmo `context` — e, assim como em Java, é
**cooperativo**: uma goroutine que nunca checa `ctx.Done()` nunca para.

**Vazamento de goroutine** é o equivalente a um `ThreadLocal` nunca limpo, só que pior, porque a
goroutine inteira fica viva para sempre: enviar para um channel sem nenhum receptor do outro lado
(a goroutine trava ali, permanentemente), um `time.Ticker` criado e nunca parado (`Stop()`
esquecido), ou um `select` sem o caso `<-ctx.Done()` — a goroutine nunca percebe que deveria
parar. `errgroup` ajuda a propagar erro e cancelamento entre um grupo de goroutines relacionadas;
`goleak` detecta, em teste, que a contagem de goroutines ao final bate com a do início.

> **Reencontro — `go-fintech/06`.** O `context.Context` que propaga cancelamento e deadline, e o
> `errgroup.Group` que transforma um fan-out em algo com short-circuit no primeiro erro, já
> apareceram ali aplicados a um lote de pagamentos. Aqui o mesmo par resolve o cancelamento de uma
> árvore de chamadas HTTP, não de workers de um batch — a ferramenta é a mesma, o contexto de uso
> muda.

## Exemplo numa fintech

O usuário pede o extrato, que dispara três chamadas internas em paralelo (saldo, lançamentos,
limite). O usuário cancela a requisição (fecha o app) antes das três voltarem. Se o cancelamento
não se propaga, as três chamadas continuam rodando até o fim — segurando conexões de banco,
threads ou goroutines, por um resultado que ninguém mais vai ler.

## Hands-on

**Tutorial.** Três chamadas paralelas simulando o exemplo acima; uma delas falha (ou o contexto
pai é cancelado); as outras duas devem ser canceladas em consequência. Em Go, com `context` e
`errgroup`. Em Java, só com API final: `Executors.newVirtualThreadPerTaskExecutor()` num
`try-with-resources`, três `submit`, e o cancelamento manual das irmãs quando uma falha:

```java
try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
    var ecs = new ExecutorCompletionService<String>(executor);
    List<Future<String>> futures = List.of(
        ecs.submit(() -> saldoClient.buscar(conta)),
        ecs.submit(() -> lancamentosClient.buscar(conta)),
        ecs.submit(() -> limiteClient.buscar(conta)));
    try {
        for (int i = 0; i < futures.size(); i++) ecs.take().get();   // na ordem em que terminam
    } catch (ExecutionException primeiraFalha) {
        futures.forEach(f -> f.cancel(true));                          // interrompe as irmãs
        throw primeiraFalha;
    }
}
```

**Desafio.** Teste de vazamento: disparar mil requisições e cancelá-las no meio da execução,
confirmando que a contagem de goroutines (Go) ou de threads de plataforma usadas (Java) volta à
linha de base depois.

**Invariantes testáveis**

1. Depois de cancelar 1.000 requisições, a contagem de goroutines volta à linha de base (com
   tolerância) em até 2 segundos, e `goleak.VerifyNone` passa.
2. A versão com um envio para channel sem receptor **falha** o `goleak` (demonstração do
   vazamento, não exigida como asserção rígida em todo o resto do hands-on).
3. Em Java, quando uma das três chamadas paralelas falha, as outras duas recebem interrupção em
   até 100 ms — medido por *fakes* que registram quando foram interrompidos.
4. Com 10 mil virtual threads disputando um pool de 20 conexões de banco, um `Semaphore(20)`
   mantém o número de requisições pendentes no pool (`pending`) dentro do teto configurado, e o p99
   do tempo de **aquisição** de conexão é menor que o mesmo cenário sem o semáforo — comparação de
   ordem, não de valor absoluto.
5. Um `synchronized` envolvendo uma chamada bloqueante (um *fake* lento), executado por 10 mil
   virtual threads, **não** gera `jdk.VirtualThreadPinned` no JDK 25, capturado por JFR com o
   limiar do evento zerado — o padrão de 20 ms esconde bloqueios curtos:
   `-XX:StartFlightRecording=filename=pin.jfr,jdk.VirtualThreadPinned#threshold=0ms`. No JDK 21,
   o mesmo teste gera um evento por chamada: rodando nas duas versões, você vê o JEP 491
   acontecer.

6. Com `-Djdk.virtualThreadScheduler.parallelism=2` e duas tarefas de CPU de 2 s em *virtual
   threads*, uma tarefa curta espera mais de 1 s. Com as tarefas de CPU num *pool* de plataforma
   separado, a mesma tarefa curta espera menos de 50 ms. O teste mede as duas esperas.
7. Com 10.000 tarefas de I/O simulado de 100 ms, `newVirtualThreadPerTaskExecutor()` termina em
   menos de 1 s, e um `newFixedThreadPool(200)` leva mais de 4 s. O mesmo par, com tarefas de CPU,
   fica dentro de 20% um do outro.

**Complemento — o mesmo invariante em 12 linhas.** Reimplemente o Tutorial Java com o
`StructuredTaskScope` mostrado acima (`--enable-preview`, JDK 25). O invariante 3 — irmãs
interrompidas em até 100 ms — deve passar nas duas versões. A lição é o contraste: o código
manual que o Tutorial exigiu é o que a API em preview elimina, e o preço é ficar preso à
release.

**Complemento.** Compare o consumo de memória de 100 mil virtual threads versus 100 mil
goroutines, cada população executando a mesma tarefa simples de espera. Opcional: rode também
com `-XX:+UseCompactObjectHeaders` (JEP 519, opcional no 25 e padrão no 27) e observe a
diferença — a mesma flag aparece em `spring-boot/12`.

**Checagem**

1. Quando faz sentido usar um `Semaphore` em vez de dimensionar um pool de threads virtuais?
2. Dê um exemplo clássico de vazamento de goroutine, e explique por que ele é definitivo (a
   goroutine nunca termina sozinha).
3. No JDK que o leitor usa hoje, o pinning em `synchronized` ainda ocorre? Como verificar?
4. O que "cancelamento cooperativo" significa, e o que acontece quando o código ignora o sinal de
   cancelamento?
5. Por que uma tarefa de CPU longa em *virtual thread* atrasa as outras *virtual threads*, e uma em
   thread de plataforma não?
6. Por que colocar *virtual threads* num *pool* fixo é um antipadrão, e o que usar no lugar?

**Gabarito.** (3) Depende da versão: no JDK 24 em diante (inclusive no 25, a base desta
trilha), não — o JEP 491 fez a virtual thread desmontar dentro de `synchronized` e de
`Object.wait()`; no JDK 21, sim. Para verificar, capture um JFR com
`jdk.VirtualThreadPinned#threshold=0ms` e conte os eventos, como no invariante 5. Não use
`-Djdk.tracePinnedThreads`: desde o 24 ele não faz nada, e a ausência de saída não prova
coisa alguma.

## Principais aprendizados

- Quando a thread fica barata (virtual threads, goroutines), o recurso escasso vira o destino da
  chamada — limitar com `Semaphore`/`errgroup.SetLimit`, não dimensionar um pool de threads.
- No JDK 25, `synchronized` e `Object.wait()` não prendem mais a virtual thread (JEP 491, desde o
  24); pinning residual só em chamada nativa. Em 21, ainda prende — `ReentrantLock` é a
  mitigação.
- `ScopedValue` é final no 25 e é herdado pelas subtarefas de um `StructuredTaskScope`;
  `StructuredTaskScope` segue em preview (25 e 27) e mudou de API no 25 — não amarre código de
  produção a ela.
- *Virtual threads* rodam num `ForkJoinPool` próprio, sem preempção por tempo: CPU longa prende a
  *carrier*, e `Thread.yield()` não garante a vez. Trabalho de CPU vai para um *pool* de plataforma.
- *Virtual threads* dão escala, não velocidade: com I/O, 10.000 esperas de 100 ms em ~200 ms; com
  CPU, nenhum ganho. Uma por tarefa, nunca um *pool*.
- Cancelamento é cooperativo nas duas linguagens: `interrupt()` em Java e `context.Done()` em Go
  não param nada sozinhos — o código precisa checar e reagir.
- Vazamento de goroutine (channel sem receptor, `Ticker` esquecido, `select` sem `ctx.Done()`) é
  definitivo — a goroutine nunca termina sozinha, e `goleak` é a rede de segurança em teste.
