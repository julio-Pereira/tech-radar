---
id: virtual-threads-e-cancelamento
title: "Virtual threads, cancelamento e goroutines"
summary: "Quando a thread fica barata, o recurso escasso deixa de ser a thread — e o que sobra é cancelar a tempo e não vazar."
estimatedMinutes: 60
references:
  - title: "JEP 444 — Virtual Threads"
    url: https://openjdk.org/jeps/444
  - title: "JEP 491 — Synchronize Virtual Threads without Pinning"
    url: https://openjdk.org/jeps/491
  - title: "JEP 506 — Scoped Values"
    url: https://openjdk.org/jeps/506
  - title: "uber-go/goleak"
    url: https://github.com/uber-go/goleak
---

## O que o `spring-boot/07` já cobriu, e o que falta

`spring-boot/07` ensinou o que são virtual threads e o problema de **pinning**: uma virtual thread
bloqueada dentro de um `synchronized` prende (fixa) a thread de plataforma que a carrega, em vez
de liberá-la para outra virtual thread — anulando o ganho de escalabilidade. Este marco não repete
isso. O que falta são três coisas: **limitar concorrência** quando a thread deixa de ser o recurso
escasso, o custo de `ThreadLocal` em escala de milhões de threads, e o par completo de
cancelamento — cooperativo em Java, por `context` em Go.

**O estado do pinning hoje, com precisão de versão**: JEP 491 (*Synchronize Virtual Threads
without Pinning*) é **GA desde o JDK 24** — a partir dali, `synchronized` deixou de fixar a
virtual thread ao bloquear. Em JDK 21 (a base desta trilha), o pinning em `synchronized` **ainda
ocorre**; a mitigação prática em 21 é trocar `synchronized` por `ReentrantLock` nos trechos que
viram ponto quente de virtual thread, até migrar para 24+.

**Structured concurrency e scoped values**: `StructuredTaskScope` (JEP 505) segue em **preview**
mesmo no JDK 25 mais recente (quinta rodada de preview) — exige `--enable-preview` para compilar e
rodar, e a API pode mudar entre versões. `ScopedValue` (JEP 506) **finalizou no JDK 25** — deixou
de ser preview depois de passar por várias rodadas desde o JDK 21. Em JDK 21, `ScopedValue` ainda
exige `--enable-preview`. A trilha usa `ScopedValue` como alternativa mais barata a `ThreadLocal`
para compartilhar dado imutável com uma árvore de tarefas, com o aviso explícito de que o leitor
precisa checar a versão do seu próprio JDK antes de depender dela em produção.

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

> **Reencontro — `go-fintech/03`.** O `context.Context` que propaga cancelamento e deadline, e o
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
pai é cancelado); as outras duas devem ser canceladas em consequência.

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

**Complemento.** Compare o consumo de memória de 100 mil virtual threads versus 100 mil
goroutines, cada população executando a mesma tarefa simples de espera.

**Checagem**

1. Quando faz sentido usar um `Semaphore` em vez de dimensionar um pool de threads virtuais?
2. Dê um exemplo clássico de vazamento de goroutine, e explique por que ele é definitivo (a
   goroutine nunca termina sozinha).
3. No JDK que o leitor usa hoje, o pinning em `synchronized` ainda ocorre? Como verificar?
4. O que "cancelamento cooperativo" significa, e o que acontece quando o código ignora o sinal de
   cancelamento?

## Principais aprendizados

- Quando a thread fica barata (virtual threads, goroutines), o recurso escasso vira o destino da
  chamada — limitar com `Semaphore`/`errgroup.SetLimit`, não dimensionar um pool de threads.
- JEP 491 (sem pinning em `synchronized`) é GA desde o JDK 24; em JDK 21, o pinning ainda ocorre, e
  `ReentrantLock` é a mitigação até migrar.
- `StructuredTaskScope` (JEP 505) segue em preview mesmo no JDK 25; `ScopedValue` (JEP 506)
  finalizou no JDK 25 — confira sempre a versão do seu próprio JDK antes de depender de qualquer
  uma em produção.
- Cancelamento é cooperativo nas duas linguagens: `interrupt()` em Java e `context.Done()` em Go
  não param nada sozinhos — o código precisa checar e reagir.
- Vazamento de goroutine (channel sem receptor, `Ticker` esquecido, `select` sem `ctx.Done()`) é
  definitivo — a goroutine nunca termina sozinha, e `goleak` é a rede de segurança em teste.
