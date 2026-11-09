---
id: memoria-e-gc
title: "Memória e GC"
summary: "Quase todo incidente de JVM em produção começa com uma suposição errada sobre memória. Pilha, heap e o que o GC enxerga (frames, raízes, compactação, escape analysis medida e a pilha da virtual thread no heap), o que conta no limite do contêiner além do heap, o pod de 1 GB que roda SerialGC, MaxRAMPercentage, o OOMKilled com o heap em 60%, os tipos de OutOfMemoryError, e G1 × ZGC × Parallel medidos com a mesma carga."
estimatedMinutes: 70
reviewedAt: 2026-11-09
reviewEvery: 6m
competencies: [performance, confiabilidade]
references:
  - title: "The Java Virtual Machine Specification (Java SE 25), cap. 2: Run-Time Data Areas"
    url: https://docs.oracle.com/javase/specs/jvms/se25/html/jvms-2.html
  - title: "HotSpot Virtual Machine Garbage Collection Tuning Guide (Release 25)"
    url: https://docs.oracle.com/en/java/javase/25/gctuning/
  - title: "JEP 439: Generational ZGC"
    url: https://openjdk.org/jeps/439
  - title: "JEP 490: ZGC: Remove the Non-Generational Mode"
    url: https://openjdk.org/jeps/490
  - title: "jcmd (Java SE 25 Tools Reference), com VM.native_memory"
    url: https://docs.oracle.com/en/java/javase/25/docs/specs/man/jcmd.html
---

## Pilha, heap e o que o GC enxerga

A pergunta clássica é "o que fica na pilha e o que fica no heap?". A resposta curta cabe numa frase:
o **frame** guarda o primitivo e a referência; o **objeto** mora no heap.

Cada thread tem a sua **pilha**. Cada chamada de método empilha um *frame* com as variáveis locais,
os operandos das contas em andamento e o endereço de volta; o `return` desempilha. Um `long limite`
local fica dentro do *frame*. Uma variável `Pagamento p` também fica no *frame*, mas guarda só a
referência: o objeto `Pagamento`, e o `Money` dentro dele, estão no **heap**, compartilhado por todas
as threads.

Daí sai a outra pergunta de entrevista: **Java passa tudo por valor**. Ao chamar `autorizar(p)`, o
valor da referência é copiado para o *frame* novo. Reatribuir o parâmetro (`p = outro`) não muda nada
no chamador; mutar o objeto (`p.cancelar()`) muda, porque os dois *frames* apontam para o mesmo
objeto. Com tipos de valor imutáveis, como os records do `pix-core`, a diferença deixa de ser armadilha.

```diagrama
jj-pilha-e-heap
```

### A pilha tem tamanho fixo, e a profundidade não é contrato

A pilha de uma thread de plataforma é reservada na criação (`-Xss`, 1 MB por padrão no Linux x64), e
esgotá-la lança `StackOverflowError`. Medido no JDK 25, com um método recursivo de um parâmetro, numa
thread nova:

| `-Xss` | Só interpretado (`-Xint`) | Com o JIT (padrão), em execuções diferentes |
| --- | ---: | ---: |
| 256k | 1.793 *frames* | 3.946 a 9.866 |
| 512k | 4.772 | 10.500 a 26.250 |
| 1m | 10.730 | 23.608 |

Duas lições:

- **A profundidade depende do tamanho do *frame*.** Um *frame* compilado é menor que um
  interpretado, e o JIT pode juntar chamadas. Com a **mesma** `-Xss`, a profundidade variou mais de
  duas vezes entre execuções. Com quatro parâmetros e duas variáveis locais `long`, a versão interpretada
  chegou à metade.
- **Recursão sobre entrada externa é um risco.** JSON aninhado, uma cadeia de estornos, uma árvore de
  contas: se quem manda o dado decide a profundidade, decide também quando a pilha estoura. Itere com
  uma pilha explícita (`ArrayDeque`) ou limite a profundidade na entrada.

`StackOverflowError` não é `OutOfMemoryError`. É um `Error` da thread que estourou, a JVM continua de
pé, e o heap nem foi tocado. O perigo é o estado que ficou no meio do caminho: um contador
incrementado, um *lock* que um `finally` mais acima ainda vai liberar.

### Raízes, marcação e compactação

O GC não procura lixo: ele procura o que está **vivo**, partindo das **raízes** (*GC roots*):

- as variáveis locais e os operandos dos *frames* vivos, em todas as threads;
- os campos estáticos das classes carregadas;
- as referências globais de JNI, os monitores em uso e outras referências internas da JVM.

Tudo o que se alcança das raízes está vivo; o resto é lixo, inclusive um ciclo de objetos que só se
referenciam entre si. Por isso o vazamento em Java é sempre uma referência esquecida a partir de uma
raiz (ver o vazamento, mais abaixo).

Depois de **marcar**, há três jeitos de recuperar o espaço:

- **Varrer** devolve os buracos para uma lista livre. É rápido, mas fragmenta: sobra memória livre em
  pedaços pequenos demais para um objeto grande.
- **Compactar** move os vivos para o começo e atualiza todas as referências para eles.
- **Copiar** os vivos para outra área, que é o que a geração jovem faz, do *eden* para o *survivor*.
  O custo é proporcional ao que sobrevive, não ao lixo, e é por isso que a hipótese geracional
  compensa.

Mover um objeto exige saber onde estão todas as referências para ele. A JVM para as threads em
pontos onde o mapa de referências de cada *frame* é conhecido, os **safepoints**, e é essa a pausa
*stop-the-world*. O G1 move os vivos dentro dessa pausa (a evacuação de regiões). O ZGC move os
vivos com a aplicação rodando, usando barreiras na leitura de referências, e por isso pausa
microssegundos.

### *Escape analysis*: o objeto que nunca chega ao heap

Se o JIT prova que um objeto não sai do método, ele pode não alocá-lo: os campos viram variáveis no
*frame* (*scalar replacement*). Medido no JDK 25 com `ThreadMXBean.getThreadAllocatedBytes`, depois
do aquecimento, somando 1.000 valores com um record `Centavos`:

| Código | Padrão | `-XX:-DoEscapeAnalysis` |
| --- | ---: | ---: |
| objeto vive só dentro de uma iteração, total num `long` | **0 B** por chamada | 72.000 B |
| acumulador `Centavos total` atravessa o laço | 24.024 B | 48.024 B |
| cada objeto é publicado num campo estático | 48.024 B | 48.024 B |

O primeiro caso some por inteiro. No segundo, só a metade some: o JIT eliminou o objeto temporário,
mas não o acumulador que passa de uma iteração para a outra. No terceiro, o objeto escapa, e nada é
eliminado. É uma otimização, não uma garantia de linguagem: ela muda com a forma do código e com a
versão do JIT, e só a medição diz o que aconteceu.

### A pilha da *virtual thread* mora no heap

Uma *virtual thread* não tem pilha reservada. Quando ela bloqueia e desmonta da *carrier*, os
*frames* dela são copiados para um objeto do heap (`jdk.internal.vm.StackChunk`), e voltam para a
pilha da *carrier* quando ela monta de novo. Medido no JDK 25 com o histograma de classes
(`jcmd <pid> GC.class_histogram`), com 10.000 *virtual threads* estacionadas:

| Profundidade da recursão antes de estacionar | `StackChunk` no heap | Por *virtual thread* |
| ---: | ---: | ---: |
| 1 | 17,6 MB | ~1,8 KB |
| 50 | 27,3 MB | ~2,7 KB |
| 200 | 51,9 MB | ~5,2 KB |

O ponto de partida já inclui os *frames* do `CountDownLatch.await`. A conta mostra as duas faces:

- 10.000 threads de plataforma reservariam 10 GB de endereço só de pilha. As *virtual threads*
  ocupam o que a pilha de fato usa.
- Essa pilha é heap: o GC a enxerga e a coleta, e pilha funda vezes milhões de threads vira pressão
  de GC.

O escalonador e a *carrier* estão em `concorrencia-e-recursos/06`.

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

Antes dos contêineres, rode o `Profundidade` com `-Xss256k`, `512k` e `1m`, com e sem `-Xint`, e o
`Escape` com e sem `-XX:-DoEscapeAnalysis`, e compare com as tabelas acima.

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

4. A cadeia de estornos de *fixture*, com 100 mil elementos, é percorrida por uma versão iterativa
   sem erro com `-Xss256k`; a versão recursiva da mesma função falha com `StackOverflowError` (o
   teste roda numa thread com pilha pequena, `new Thread(null, r, "t", 256 * 1024)`).
5. Depois do aquecimento, a soma com o objeto só dentro da iteração aloca **0 bytes** por chamada,
   medido com `getThreadAllocatedBytes`; numa JVM filha com `-XX:-DoEscapeAnalysis`, a mesma soma
   aloca. O teste guarda os dois números.

**Complemento.** Refaça a tabela dos coletores com `--cpus=4`, e veja o que acontece com o
*throughput* do ZGC e com o tempo para chegar ao *safepoint*.

**Checagem**

1. Por que um pod pode ser `OOMKilled` com o heap em 60%?
2. Qual heap e qual GC a JVM escolhe num contêiner de 1 GB com 1 CPU, e por quê?
3. O que a pausa de 40 µs do ZGC não conta, e por que o *throughput* dele caiu com 2 CPUs?
4. Como um `ThreadLocal` vaza num pool de threads?
5. O que fica no *frame* e o que fica no heap numa chamada `autorizar(p)`, e por que reatribuir `p`
   dentro dela não muda o chamador?
6. Por que a profundidade de um `StackOverflowError` muda entre execuções com a mesma `-Xss`?

## Principais aprendizados

- O *frame* guarda o primitivo e a referência; o objeto mora no heap. Java passa a referência por
  valor.
- A pilha tem tamanho fixo e a profundidade depende do JIT: recursão sobre entrada externa é risco.
- O GC marca o que as raízes alcançam e copia ou compacta os vivos; mover exige *safepoint*. A
  *escape analysis* pode eliminar a alocação, e só a medição diz quando.
- A pilha da *virtual thread* é um objeto do heap (`StackChunk`), proporcional à profundidade.

- O limite do contêiner vale para heap, *metaspace*, pilhas, *code cache*, memória direta e nativa; o
  NMT mostra cada parte.
- O heap padrão é 25% do contêiner; abaixo de 2 CPUs ou 1792 MiB, o GC padrão é o Serial. Declare os
  dois.
- `OutOfMemoryError` é a JVM, com mensagem; `OOMKilled` é o kernel, com código 137 e nada no log.
- Limite a memória direta (`MaxDirectMemorySize`), que por padrão vai até o heap máximo.
- G1 para o caso comum; ZGC para latência quando sobra CPU; Parallel para *batch*. Meça no seu
  serviço.
- Vazamento é referência esquecida: estáticos, `ThreadLocal` em pool, *listeners*, *classloaders*.
