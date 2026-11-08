---
id: diagnostico-de-memoria-e-jfr
title: "Diagnóstico de memória e JFR"
summary: "Diagnóstico de JVM é a ferramenta certa na hora certa, com o mínimo de impacto em produção. O jcmd como canivete, o JFR contínuo e o caminho de um vazamento até a raiz, o custo do JFR medido em duas cargas, o heap dump que carrega 32 mil CPFs legíveis, e o log de GC unificado."
estimatedMinutes: 55
reviewedAt: 2026-11-08
reviewEvery: 12m
competencies: [confiabilidade, performance, seguranca]
references:
  - title: "jcmd (Java SE 25 Tools Reference)"
    url: https://docs.oracle.com/en/java/javase/25/docs/specs/man/jcmd.html
  - title: "jfr (Java SE 25 Tools Reference)"
    url: https://docs.oracle.com/en/java/javase/25/docs/specs/man/jfr.html
  - title: "JDK Mission Control"
    url: https://docs.oracle.com/en/java/java-components/jdk-mission-control/
  - title: "async-profiler"
    url: https://github.com/async-profiler/async-profiler
  - title: "Lei Geral de Proteção de Dados (Lei 13.709/2018)"
    url: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm
---

## `jcmd`: um comando para cada pergunta

O `jcmd <pid> <comando>` fala com uma JVM em execução, sem reiniciá-la. Os comandos que importam:

| Comando | Responde |
| --- | --- |
| `GC.heap_info` | quanto do heap está ocupado, por região |
| `GC.class_histogram` | quais classes ocupam o heap, por número de instâncias e bytes (força uma coleta completa) |
| `VM.native_memory summary` | o que está fora do heap, com o processo iniciado com `-XX:NativeMemoryTracking=summary` (marco 08) |
| `JFR.start`, `JFR.dump`, `JFR.stop` | controla gravações do Flight Recorder |
| `GC.heap_dump <arquivo>` | grava o heap inteiro num arquivo `.hprof` |
| `Thread.print` | *thread dump*, o mesmo do `jstack` (`concorrencia-e-recursos/09`) |

O `GC.class_histogram` é o primeiro passo de uma suspeita de vazamento: na *fixture* deste marco, ele
mostrou 120 mil `byte[]` somando 838 MB, apontando o tipo antes de qualquer outra ferramenta. Ele
força uma coleta completa, e por isso não é de graça num heap grande.

## JDK Flight Recorder

O **JFR** grava eventos da JVM e da aplicação (alocação, GC, compilação, *locks*, I/O, exceções) num
*buffer* circular, e o JDK Mission Control (ou o comando `jfr`) os lê. É feito para ficar **ligado em
produção**: `-XX:StartFlightRecording=name=continuo,settings=default,maxage=6h` mantém as últimas
horas na memória e em disco, e um `jcmd <pid> JFR.dump name=continuo filename=agora.jfr` tira a foto
quando o incidente acontece. O perfil `profile` grava mais detalhe, e custa mais.

O custo, **medido**, depende da carga:

- no *driver* HTTP do marco 09, a 2.000 requisições por segundo, com `settings=default`, o p50 ficou
  igual (0,24 ms) e o p99 foi de 0,53 a 0,56 ms para 0,58 ms;
- na carga sintética do marco 08, que só aloca, com 2 CPUs, o *throughput* caiu de ~33,5 para ~28
  milhões de operações (−17%); com 4 CPUs, −11%. Desligar a amostragem de alocação
  (`jdk.ObjectAllocationSample#enabled=false`) não mudou o resultado.

A regra é a mesma do resto da trilha: o JFR é barato para um serviço comum, e é preciso medir no seu.

O comando `jfr view` (JDK 21+) resume uma gravação em tabelas: `hot-methods`, `allocation-by-site`,
`gc-pauses`, `memory-leaks-by-site`, `contention-by-site`.

## O vazamento até a raiz

Um vazamento se prova com o **caminho até a raiz**: a cadeia de referências que mantém o objeto
vivo. O JFR o calcula pelo evento `OldObjectSample`, que amostra objetos que sobreviveram por muito
tempo. Com `path-to-gc-roots=true` no `JFR.dump`, ele grava também a cadeia de cada amostra.

Na *fixture* de um `ThreadLocal` que acumula o contexto de cada requisição num pool de 4 threads,
sem `remove()`:

- `jfr view memory-leaks-by-site` apontou `Incidentes.atender(int)`, com objetos de 5,6 s de idade;
- o `OldObjectSample` mostrou a raiz como `Thread OopStorage`, um *handle* global de thread, e a
  cadeia `threadLocals : java.lang.Thread (pool-1-thread-3)` → `table : ThreadLocalMap` →
  `ThreadLocalMap$Entry` → `value`. É exatamente o vazamento do marco 08.

Dois detalhes de procedimento apareceram na conferência. Com o *dump* tirado no fim do processo, depois
de o pool ser encerrado, a raiz veio `N/A`: as threads que seguravam o valor já não existiam. E quando
o processo morreu de `OutOfMemoryError`, a gravação com `dumponexit=true` ficou **vazia**. Tire o *dump*
com o processo vivo, pelo `jcmd`, antes da memória acabar.

## Alocação excessiva

O `allocation-by-site` mostra o método do topo da pilha, que muitas vezes é interno do JDK: na
*fixture*, 94% da pressão apareceu em `jdk.internal.misc.Unsafe.allocateUninitializedArray`, por
dentro da concatenação de `String`. A pilha completa do evento `ObjectAllocationSample`
(`jfr print --events jdk.ObjectAllocationSample --stack-depth 10`) leva ao culpado:
`Incidentes.montarRecibo`, que concatena 200 linhas com `+=` num laço. A correção é um
`StringBuilder` com capacidade estimada, e a prova é a mesma visão do JFR antes e depois.

## *Heap dump*: poderoso, e um dado sensível

O *heap dump* é o heap inteiro num arquivo: cada objeto, cada `String`. É a ferramenta mais completa
para vazamento, aberta num analisador como o Eclipse MAT, que acha o *dominator tree* e o caminho até
a raiz. Ele é gerado sob demanda (`jcmd GC.heap_dump`) ou automaticamente no OOM
(`-XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/dumps`). Num heap de 2 GB com a *fixture*, o
*dump* teve 539 MB e saiu em 0,5 s, com a aplicação parada nesse tempo.

E ele carrega **tudo o que está na memória**. No *dump* da *fixture*, um `grep` por números de 11
dígitos achou **32.011 CPFs distintos** legíveis. Num serviço real, também tokens, chaves de API e
dados de cartão. Sob a LGPD, isso é dado pessoal: o *heap dump* de produção não sai do ambiente
controlado, não vai para o *chat* nem para um *ticket* externo, tem acesso restrito e registrado, e é
apagado depois da análise. O mesmo vale para gravações do JFR com eventos de aplicação, e para
*thread dumps* com argumentos de métodos. A telemetria com PII é tratada em `observabilidade/17`.

## Log de GC e *profilers*

O log de GC unificado (`-Xlog:gc*:file=gc.log:time,uptime,level,tags:filecount=5,filesize=20m`) é
barato, rotaciona sozinho, e responde "o GC é o problema?" sem nenhuma outra ferramenta: duração de
cada pausa, causa, heap antes e depois. `-Xlog:safepoint` mostra também as paradas que não são de GC.

O **async-profiler** (licença Apache 2.0) é um *profiler* por amostragem que usa `perf_events` e
enxerga também código nativo e o próprio JIT, com *flame graphs* de CPU, alocação e *locks*. Ele
complementa o JFR quando a pergunta é "onde está o tempo de CPU?". O *profiling* contínuo como
prática está em `observabilidade/11`.

## Exemplo numa fintech

A latência do `pix-gateway` subia a cada 20 minutos, por alguns segundos. A primeira hipótese foi
GC. O log de GC mostrou pausas jovens curtas e regulares, sem nada a cada 20 minutos. Com
`-Xlog:safepoint`, apareceram paradas longas de outras operações, `PrintThreads` e `FindDeadlocks`:
um *job* pedia um *thread dump* a cada 20 minutos para um painel de monitoramento. Cada `Thread.print`
para a JVM inteira num *safepoint* (conferido no JDK 25: são essas duas operações), e com 2 mil
threads a parada é longa. A ferramenta de diagnóstico era a causa. A correção foi tirar o *job*, e deixar o
JFR contínuo, que já tinha a informação.

## Hands-on

**Tutorial.** Rode a *fixture* `Incidentes` com o JFR contínuo. Com o processo vivo, use
`GC.class_histogram`, `JFR.dump ... path-to-gc-roots=true` e `jfr view memory-leaks-by-site`, e leia
a cadeia no `OldObjectSample`.

**Desafio.** Três incidentes de *fixture* (vazamento por `ThreadLocal`, alocação excessiva em
concatenação, e uma pausa longa provocada com o SerialGC e um heap grande), diagnosticados com
evidência e corrigidos.

**Invariantes testáveis**

1. Para cada incidente, a causa é identificada com a evidência anexada: a visão do JFR, a cadeia até
   a raiz, o histograma ou o trecho do log de GC. A correção reduz a métrica-alvo, numa tabela de
   antes e depois:
   - o vazamento: idade e tamanho no `OldObjectSample`;
   - a alocação: a porcentagem do site no `allocation-by-site`;
   - a pausa: o p99 no `gc-pauses`.
2. O *heap dump* de produção simulada é tratado como dado sensível. Há um procedimento escrito (quem
   pode gerar, onde fica, quando é apagado) e um teste que varre o arquivo exportado por padrões de
   CPF. O teste falha no *dump* da *fixture*, o que prova que ele funciona. O artefato que sai do
   ambiente é o histograma e a cadeia de referências, nunca o `.hprof`.

**Complemento.** Meça o custo do JFR (`default` e `profile`) no seu serviço, na carga real, e compare
com as duas medições deste marco.

**Checagem**

1. Por que o `JFR.dump` tirado no fim do processo veio com a raiz `N/A`?
2. O que o `allocation-by-site` mostra no topo, e como chegar ao método da aplicação?
3. Por que um *heap dump* de produção é dado pessoal, e o que pode sair do ambiente no lugar dele?
4. Como separar "é GC" de "é *safepoint* de outra coisa"?

## Principais aprendizados

- `jcmd` responde cada pergunta sem reiniciar: histograma, NMT, JFR, *heap dump*, *thread dump*.
- JFR contínuo com `maxage`, *dump* com o processo vivo; o custo depende da carga, então meça.
- `memory-leaks-by-site` e `OldObjectSample` com `path-to-gc-roots` dão o caminho até a raiz.
- O topo do `allocation-by-site` pode ser interno do JDK; a pilha do evento leva ao culpado.
- *Heap dump* tem dado pessoal (32 mil CPFs na *fixture*): não sai do ambiente controlado.
- Log de GC unificado e `-Xlog:safepoint` separam pausa de GC de outras paradas.
