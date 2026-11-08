---
id: memoria-e-gc
title: "Memória e GC"
summary: "Quase todo incidente de JVM em produção começa com uma suposição errada sobre memória. O que conta no limite do contêiner além do heap, o pod de 1 GB que roda SerialGC, MaxRAMPercentage, o OOMKilled com o heap em 60%, os tipos de OutOfMemoryError, e G1 × ZGC × Parallel medidos com a mesma carga."
estimatedMinutes: 60
reviewedAt: 2026-11-08
reviewEvery: 6m
competencies: [performance, confiabilidade]
references:
  - title: "HotSpot Virtual Machine Garbage Collection Tuning Guide (Release 25)"
    url: https://docs.oracle.com/en/java/javase/25/gctuning/
  - title: "JEP 439: Generational ZGC"
    url: https://openjdk.org/jeps/439
  - title: "JEP 490: ZGC: Remove the Non-Generational Mode"
    url: https://openjdk.org/jeps/490
  - title: "jcmd (Java SE 25 Tools Reference), com VM.native_memory"
    url: https://docs.oracle.com/en/java/javase/25/docs/specs/man/jcmd.html
---

## O que conta no limite do contêiner

O `-Xmx` limita o **heap**, onde vivem os objetos. O processo da JVM usa bem mais do que isso, e o
limite do contêiner (o `limits.memory` do pod, `kubernetes/05`) vale para **tudo**:

- **Heap:** os objetos Java, dividido em gerações.
- **Metaspace:** os metadados das classes carregadas, fora do heap, sem limite por padrão.
- **Pilhas das threads:** cada thread de plataforma reserva a sua pilha (1 MB por padrão no Linux
  x64); as *virtual threads* guardam a pilha no heap (`concorrencia-e-recursos/06`).
- **Code cache:** o código compilado pelo JIT (marco 09).
- **Memória direta:** `ByteBuffer.allocateDirect` e o que bibliotecas de rede (Netty) e de
  compressão usam fora do heap. Por padrão, o limite dela é o heap máximo
  (`Runtime.maxMemory()`, que varia um pouco com o GC).
- **O próprio GC, símbolos, alocações nativas** de bibliotecas JNI.

O **Native Memory Tracking** mostra cada parte: `-XX:NativeMemoryTracking=summary` e depois
`jcmd <pid> VM.native_memory summary`. Num processo de teste com 64 MiB de heap ocupado e 50 threads
paradas, o NMT reportou 1.669 MB **reservados** e 112 MB **committed**. A reserva é espaço de endereço
virtual, que não custa nada. O *committed* é memória que a JVM comprometeu, e é o teto do que pode
virar residente. O kernel cobra do limite do contêiner as páginas **tocadas** (o RSS): com
`-Xms1g -Xmx1g`, o NMT reportou 1.116 MB *committed* e o RSS era 115 MB. Com `-Xms` igual ao `-Xmx`
e `-XX:+AlwaysPreTouch`, os dois se aproximam, e a conta fica previsível.

## A JVM no contêiner: o heap e o GC que ela escolhe sozinha

A JVM lê os limites do cgroup (v1 e v2) e dimensiona a partir deles. Duas escolhas automáticas
surpreendem em entrevista, e foram conferidas no JDK 25 com `-XX:+PrintFlagsFinal` em contêineres:

- **O heap padrão é 25% da memória do contêiner** (`MaxRAMPercentage = 25`). Com `--memory=1g`,
  `MaxHeapSize` foi 256 MiB. Num contêiner dedicado a uma JVM, 25% desperdiça memória; o ajuste
  usual é `-XX:MaxRAMPercentage` entre 60 e 75, deixando o resto para o que não é heap.
- **O GC padrão depende do tamanho do contêiner.** O G1 só é escolhido quando a JVM se considera numa
  "máquina servidora": pelo menos **2 CPUs e 1792 MiB**. Com `--memory=1791m`, ou com `--cpus=1`, a
  JVM escolheu o **`SerialGC`**, que para a aplicação inteira numa única thread. Um pod de 1 GB com
  limite de 1 CPU roda SerialGC sem ninguém ter pedido. Se o GC importa (e importa), declare-o.

## `OOMKilled` não é `OutOfMemoryError`

São duas falhas diferentes, com sintomas diferentes:

- **`OutOfMemoryError`** é a JVM dizendo que uma região dela esgotou. É uma exceção Java, aparece no
  log, e a mensagem diz qual região:
  - `Java heap space`: o heap não comporta os objetos vivos;
  - `Metaspace`: classes demais carregadas (um gerador de classes, um *classloader* que vaza);
  - `Cannot reserve N bytes of direct buffer memory (allocated: ..., limit: ...)`: o limite da memória
    direta;
  - `unable to create native thread`: o sistema recusou mais uma thread;
  - `GC overhead limit exceeded`: o GC gasta quase todo o tempo e recupera quase nada (uma política do
    Parallel GC);
- **`OOMKilled`** é o **kernel** matando o processo porque o contêiner passou do limite. Não há
  exceção, não há *stack trace*, não há *heap dump*: o processo some com código 137.

O caso clássico, reproduzido: um contêiner de 256 MiB com `-XX:MaxRAMPercentage=75` dá 192 MiB de
heap. A aplicação ocupa 60% dele (~115 MiB) e aloca memória direta, que por padrão pode ir até o
tamanho do heap. Com ~112 MiB de memória direta, o contêiner morreu com `exit=137 oomkilled=true`, e
o heap nunca passou de 60%. Com `-XX:MaxDirectMemorySize=32m`, a mesma aplicação recebe um
`OutOfMemoryError` legível, antes do kernel agir.

## Hipótese geracional e os coletores

A maioria dos objetos morre jovem: o pedido HTTP, os objetos de uma validação, os intermediários de
um *stream*. É a **hipótese geracional**, e o Serial, o Parallel, o G1 e o ZGC a usam (o
Shenandoah só no modo opcional `generational`; o padrão dele é não geracional). A geração jovem é
coletada com frequência e barato, porque quase tudo nela está morto. O que sobrevive a algumas
coletas é promovido para a velha, coletada com menos frequência. A alocação em si é quase gratuita:
cada thread tem um pedaço do *eden* só dela (a **TLAB**) e aloca empurrando um ponteiro. E o JIT
evita alocar o que não escapa do método (*escape analysis*, o mesmo conceito de `go-fintech/14`).

| Coletor | Como trabalha | Para quê |
| --- | --- | --- |
| **Serial** | uma thread, para tudo | heaps pequenos, 1 CPU, utilitários |
| **Parallel** | várias threads, para tudo | *batch*: máximo *throughput*, pausas longas aceitáveis |
| **G1** (padrão) | heap em regiões, pausa alvo (`-XX:MaxGCPauseMillis`, 200 ms por padrão), marcação concorrente | serviço comum: equilíbrio entre pausa e *throughput* |
| **ZGC** (geracional opcional no 21, padrão no 23, único modo desde o 24) | quase tudo concorrente, pausas de microssegundos | latência de cauda crítica, heaps grandes, CPU sobrando |

Medido no `pix-core`, com a mesma carga sintética (live set de ~400 MiB substituído aos poucos, muito
lixo jovem, 2 threads, `-Xmx1g`, contêiner com 2 CPUs, 20 s, 3 execuções), lendo os *safepoints* com
`-Xlog:safepoint`:

| Coletor | Operações em 20 s | Tempo parado no *safepoint*, p99 | Tempo para chegar ao *safepoint*, p99 |
| --- | ---: | ---: | ---: |
| G1 | ~33 milhões | 1,7 ms | 0,5 ms |
| Parallel | ~22 milhões | 52 ms | 0,2 ms |
| ZGC | ~19 milhões | 0,04 ms | 5 ms |

A leitura honesta: o ZGC cumpre o que promete na pausa (40 µs no p99), mas, com só 2 CPUs, o trabalho
concorrente dele disputa CPU com a aplicação. O resultado é menos *throughput*, e as threads demoram
mais para **chegar** ao *safepoint*, o que também é latência para quem espera. O G1 foi o melhor
equilíbrio **nesta** carga e **neste** limite de CPU. Os números da entrevista são esses três: pausa
p99, taxa de alocação e porcentagem do tempo em GC, medidos no seu serviço.

## Vazamento em Java

O GC só coleta o que ninguém alcança. Vazamento é referência esquecida:

- **coleção estática** que só cresce (um cache sem limite, um registro de *listeners*);
- **`ThreadLocal`** num pool de threads: a thread não morre, e o valor fica preso a ela até alguém
  chamar `remove()`;
- ***listener* não removido** ao fim do ciclo de vida do objeto;
- **classes de um *classloader*** que não é descartado (*redeploy* em servidor de aplicação), que
  esgotam o *metaspace*.

`WeakReference` deixa o GC coletar o objeto quando só ela o referencia (a base do `WeakHashMap`).
`SoftReference` resiste até a memória apertar, e é um cache ruim: o GC decide quando esvaziar, sem
critério de negócio. O cache com limite do marco 03 é melhor.

## Exemplo numa fintech

O pod do `pix-gateway`, com limite de 1 GiB, era morto por `OOMKilled` duas vezes por semana, com o
painel de heap em 60%. O time aumentou o `-Xmx`, e a frequência aumentou. A causa estava fora do
heap: o cliente HTTP usava memória direta para os *buffers* de rede, sem limite próprio, e nos picos
de tráfego a soma de heap, memória direta, *metaspace* e pilhas passava de 1 GiB. A correção foi
fazer a conta de verdade (NMT), limitar a memória direta, voltar o heap para 60% do limite e declarar
o GC, porque o pod de 1 CPU estava rodando SerialGC.

## Hands-on

**Tutorial.** Em contêineres do `eclipse-temurin:25-jdk`, leia o `MaxHeapSize` e o GC escolhido com
`--memory=1791m`, `1792m` e `--cpus=1`. Depois reproduza os três tipos de falha com o programa `Oom`:
`Java heap space`, a memória direta com `-XX:MaxDirectMemorySize=32m`, e o `OOMKilled` com o heap em
60% (`docker inspect --format '{{.State.OOMKilled}}'`).

**Desafio.** Dimensione a memória de um serviço: dado um limite de contêiner, calcule heap,
*metaspace* (`-XX:MaxMetaspaceSize`), pilhas (threads × `-Xss`), memória direta
(`-XX:MaxDirectMemorySize`) e uma folga para o resto, e escreva o cálculo no README do `pix-core`.

**Invariantes testáveis**

1. Com o limite de contêiner escolhido, a soma configurada (heap + *metaspace* + threads + direta)
   fica abaixo do limite, com folga. O cálculo do README é conferido contra o *committed* do
   `jcmd VM.native_memory summary` com o serviço sob carga: o *committed* é o teto do residente, então
   a conferência é conservadora.
2. Um vazamento de *fixture* (um `ThreadLocal` com um objeto grande, num pool de 8 threads, sem
   `remove()`) aparece no *heap dump*. A cadeia de referências até a raiz (a thread do pool) fica
   registrada no README. A ferramenta para chegar nela é o marco 10.
3. A mesma carga, com G1, ZGC e Parallel, em 3 execuções cada e com o limite de CPU anotado, produz
   a tabela de operações, pausa p99 e tempo para chegar ao *safepoint*. O README a traz, e o p99 do
   tempo parado no *safepoint* do ZGC fica abaixo de 1 ms.

**Complemento.** Refaça a tabela dos coletores com `--cpus=4`, e veja o que acontece com o
*throughput* do ZGC e com o tempo para chegar ao *safepoint*.

**Checagem**

1. Por que um pod pode ser `OOMKilled` com o heap em 60%?
2. Qual heap e qual GC a JVM escolhe num contêiner de 1 GB com 1 CPU, e por quê?
3. O que a pausa de 40 µs do ZGC não conta, e por que o *throughput* dele caiu com 2 CPUs?
4. Como um `ThreadLocal` vaza num pool de threads?

## Principais aprendizados

- O limite do contêiner vale para heap, *metaspace*, pilhas, *code cache*, memória direta e nativa; o
  NMT mostra cada parte.
- O heap padrão é 25% do contêiner; abaixo de 2 CPUs ou 1792 MiB, o GC padrão é o Serial. Declare os
  dois.
- `OutOfMemoryError` é a JVM, com mensagem; `OOMKilled` é o kernel, com código 137 e nada no log.
- Limite a memória direta (`MaxDirectMemorySize`), que por padrão vai até o heap máximo.
- G1 para o caso comum; ZGC para latência quando sobra CPU; Parallel para *batch*. Meça no seu
  serviço.
- Vazamento é referência esquecida: estáticos, `ThreadLocal` em pool, *listeners*, *classloaders*.
