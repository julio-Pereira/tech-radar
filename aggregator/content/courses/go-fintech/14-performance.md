---
id: performance
title: "Runtime, performance e profiling"
summary: "Otimizar é medir; e em Go a maior parte do custo evitável é alocação. O scheduler em uma página, GC com GOGC e GOMEMLIMIT num contêiner, GOMAXPROCS ciente de cgroup, benchmarks com benchstat, escape analysis, PGO e os números que você leva para a entrevista."
estimatedMinutes: 60
reviewedAt: 2026-11-08
reviewEvery: 6m
competencies: [performance]
references:
  - title: "A Guide to the Go Garbage Collector"
    url: https://go.dev/doc/gc-guide
  - title: "Profile-guided optimization"
    url: https://go.dev/doc/pgo
  - title: "Diagnostics (pprof, trace)"
    url: https://go.dev/doc/diagnostics
  - title: "benchstat"
    url: https://pkg.go.dev/golang.org/x/perf/cmd/benchstat
  - title: "Go 1.25 Release Notes (container-aware GOMAXPROCS)"
    url: https://go.dev/doc/go1.25
---

## O scheduler em uma página

O runtime do Go multiplexa **muitas goroutines (G)** sobre **poucas threads do sistema (M)**, e
quem faz a ponte são os **processadores lógicos (P)**, um por unidade de `GOMAXPROCS`. Cada P tem uma
fila local de goroutines prontas; uma M precisa de um P para rodar código Go. Quando uma goroutine
bloqueia num channel ou mutex, ela sai da M sem bloquear a thread, e outra entra. Quando faz uma
chamada de sistema bloqueante, a M fica presa com ela e o P vai para outra M. Um P sem trabalho
**rouba** metade da fila de outro (*work stealing*). E desde o Go 1.14 o runtime interrompe
goroutines que rodam laços longos sem ceder (preempção assíncrona), para uma conta pesada não
congelar as outras. É por isso que criar 100 mil goroutines é barato e bloquear numa delas não
custa uma thread: o modelo é do runtime, não do sistema operacional.

## GOMAXPROCS e o contêiner

`GOMAXPROCS` é quantos Ps existem: quantas goroutines rodam Go **ao mesmo tempo**. Até o Go 1.24, o
padrão era o número de CPUs da **máquina**, e um pod com limite de 2 CPUs num nó de 64 núcleos subia
64 Ps. O kernel estrangulava o processo ao estourar a cota de CPU, e a latência de cauda subia sem
nenhuma métrica de CPU alta. **Desde o Go 1.25**, o padrão considera o limite de CPU do **cgroup**:
num contêiner com `--cpus=2` numa máquina de 4 núcleos, o Go 1.27 reporta `NumCPU 4` e
`GOMAXPROCS 2`. O runtime considera o **limite** de CPU (o "CPU limit" do Kubernetes), não o
*request*, e reavalia o valor se o limite mudar com o processo rodando. Definir `GOMAXPROCS` à mão
(variável de ambiente ou `runtime.GOMAXPROCS`) desliga esse comportamento: a biblioteca
`automaxprocs`, que fazia isso antes do 1.25, deixa de ser necessária.

## Coletor de lixo: GOGC, GOMEMLIMIT e Green Tea

O coletor do Go é concorrente e de baixa pausa; o que se ajusta é **com que frequência** ele roda:

- **`GOGC`** (padrão 100): o heap pode crescer 100% sobre o heap vivo antes da próxima coleta. Com
  40 MB vivos, a próxima coleta acontece por volta de 80 MB. Mais alto, menos CPU de GC e mais
  memória; mais baixo, o contrário.
- **`GOMEMLIMIT`** (Go 1.19): um limite de memória **suave**. Perto dele, o GC passa a rodar mais,
  mesmo antes do que o `GOGC` pediria. Num contêiner, é o que impede o OOM: o `GOGC` não sabe que o
  contêiner tem 64 MiB. Numa reprodução com 36 MiB vivos e lixo constante, o processo foi **morto por
  OOM** (código 137) num contêiner de 64 MiB; com `GOMEMLIMIT=50MiB`, **sobreviveu**, ao custo de
  3.223 coletas em 4 segundos. O limite troca memória por CPU; se o heap vivo passa do limite, o GC
  entra em espiral e o serviço fica lento em vez de morrer. Deixe folga entre o `GOMEMLIMIT` e o
  limite do contêiner (pilhas e memória fora do heap não entram na conta).
- O **Green Tea**, coletor novo, é o padrão desde o **Go 1.26**: melhor localidade ao marcar objetos
  pequenos, e as release notes citam redução de 10% a 40% no custo de GC em programas que dependem
  muito do coletor. Medir antes e depois de subir de versão é o jeito de saber o efeito no seu.

## Alocação é o custo evitável

Em serviço Go, o que mais se consegue cortar é **alocação no heap**: cada uma custa na hora e de novo
no GC. A **escape analysis** do compilador decide o que fica na pilha (barato, morre com a função) e
o que escapa para o heap. `go build -gcflags=-m` mostra a decisão linha a linha: um valor passado a
`fmt.Sprintf` como `any` escapa (`l.ID escapes to heap`). As técnicas que mais rendem:

- **Pré-alocar**: `make([]T, 0, n)` e `make(map[K]V, n)` quando o tamanho é conhecido; um `append` que
  cresce em dobro aloca várias vezes no caminho.
- **`strings.Builder` com `Grow`** e **`strconv.AppendInt`** num buffer, em vez de `fmt.Sprintf` e
  concatenação.
- **`sync.Pool`** para objetos grandes e de vida curta (buffers de serialização). Não ajuda com
  objeto pequeno nem com objeto que fica vivo: o pool é esvaziado a cada GC e tem custo de acesso.

## Medir: benchmark, benchstat, pprof, trace e PGO

- **Benchmark** com `for b.Loop()` (Go 1.24; no 1.26 ele deixou de impedir *inlining* no corpo) e
  `b.ReportAllocs()`. Rode com `-count=10` e compare com **`benchstat`**: ele diz se a diferença é
  estatisticamente significativa (`p`), e uma rodada só não prova nada.
- **`pprof`** de CPU e de heap no serviço (atrás de autenticação, nunca exposto). O perfil diz onde
  está o custo; a otimização ataca o que ele aponta. O profiling contínuo em produção é de
  `observabilidade/11`, e o diagnóstico de concorrência de `concorrencia-e-recursos/09`.
- **`go tool trace`** mostra o tempo: quando cada goroutine rodou, esperou, bloqueou, e as pausas de
  GC. É a ferramenta para latência de cauda, onde o `pprof` (que mede onde se gasta CPU) não ajuda.
- **PGO** (estável desde o Go 1.21): um perfil de CPU de produção, salvo como `default.pgo` no
  pacote `main`, entra no próximo build (`-pgo=auto`), e o compilador decide inlining e
  devirtualização pelo uso real. A documentação cita ganho de 2% a 14% num conjunto representativo
  de programas (medido com o Go 1.22), sem mudar código.

Os números para levar à entrevista são os que você mediu: **alocações por operação** no caminho
quente, **p99** sob uma carga definida, **CPU de GC** e **coletas por segundo**. "Ficou mais rápido"
não é um número.

## Exemplo numa fintech: o recibo do caminho quente

Cada lançamento gera uma linha de recibo (`id=...;conta=...;valor=1234.56;moeda=BRL;tag=pix`), e o
perfil de heap do `payments-api` apontou essa função. A primeira versão usava `fmt.Sprintf` para cada
campo, um slice que crescia e `strings.Join`. A segunda escreve tudo num `strings.Builder` com tamanho
estimado e usa `strconv.AppendInt` para o valor. Com `-count=10` nas duas versões, o `benchstat`
mostrou:

| Medida | Antes | Depois | Diferença |
| --- | ---: | ---: | --- |
| Tempo por operação | 596 ns | 94 ns | −84% (p=0,000, n=10) |
| Bytes por operação | 400 B | 96 B | −76% |
| Alocações por operação | 12 | 1 | −92% |

E um teste de igualdade sobre uma tabela de valores (0, 1, 9, 10, 99, 100, valores grandes) garante
que o texto do recibo não mudou: otimização que muda o resultado é bug.

## Hands-on

**Tutorial.** Escreva o benchmark do recibo com `b.Loop()` e `b.ReportAllocs()`, rode
`go test -bench=Recibo -benchmem -count=10 > antes.txt`, e leia a escape analysis com
`go build -gcflags=-m`.

**Desafio.** Otimize o caminho quente do lançamento (o recibo e o que mais o `pprof` apontar), e
configure o serviço para o contêiner: `GOMEMLIMIT` com folga sobre o limite de memória do compose, e
confirme o `GOMAXPROCS` que o runtime escolheu sob `--cpus`.

**Invariantes testáveis**

1. O `benchstat antes.txt depois.txt` mostra redução de `allocs/op` com `p < 0,05`; os dois arquivos
   ficam no repositório.
2. O resultado funcional não muda: a mesma suíte (inclusive o teste de igualdade entre as duas
   versões) passa.
3. Sob o limite de memória do compose e com `GOMEMLIMIT` definido, o serviço não é morto por OOM no
   teste de carga; sem o `GOMEMLIMIT`, reproduza o OOM (código 137) para saber que o teste é capaz de
   pegá-lo.

**Complemento.** Capture 30 s de perfil de CPU sob carga, salve como `cmd/ledger/default.pgo`,
recompile e meça com `benchstat` a diferença de CPU por requisição. Registre o número, inclusive se
for nenhum.

**Checagem**

1. Por que um pod com limite de 2 CPUs num nó grande tinha latência de cauda alta antes do Go 1.25?
2. O que o `GOMEMLIMIT` troca por memória, e o que acontece se o heap vivo passar dele?
3. Por que uma rodada de benchmark não prova uma otimização?
4. Quando o `sync.Pool` não ajuda?

## Principais aprendizados

- G, M e P: goroutines baratas, bloqueio sem custo de thread, work stealing e preempção.
- Desde o Go 1.25, `GOMAXPROCS` respeita a cota de CPU do contêiner.
- `GOMEMLIMIT` evita OOM no contêiner trocando memória por CPU de GC; deixe folga.
- Alocação é o custo evitável: escape analysis, pré-alocação, `strings.Builder`, `strconv.Append*`.
- Benchmark com `-count` e `benchstat`; `pprof` para onde, `trace` para quando, PGO para o resto.
