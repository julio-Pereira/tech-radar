---
id: streams-lambdas-e-custos
title: "Streams, lambdas e seus custos"
summary: "Stream é expressivo e preguiçoso; paralelo raramente é a resposta. A ordem de execução vertical, o count que não roda o pipeline, Collectors e a chave duplicada, o boxing medido com JMH (15 vezes mais lento), o stream paralelo que trava com I/O e os Gatherers do Java 24."
estimatedMinutes: 55
reviewedAt: 2026-11-08
reviewEvery: 12m
competencies: [performance]
references:
  - title: "java.util.stream (Java SE 25 API)"
    url: https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/stream/package-summary.html
  - title: "JEP 485: Stream Gatherers"
    url: https://openjdk.org/jeps/485
  - title: "Collectors (Java SE 25 API)"
    url: https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/stream/Collectors.html
  - title: "JMH — Java Microbenchmark Harness"
    url: https://github.com/openjdk/jmh
---

## Montagem e execução

Um *stream* é a descrição de uma computação. `filter`, `map` e `sorted` são **operações
intermediárias**: devolvem outro *stream* e não fazem nada. Só a **operação terminal** (`toList`,
`collect`, `sum`, `findFirst`, `forEach`) põe o *pipeline* para rodar. Um `Stream.of("a", "b").map(...)`
sem terminal não executa o `map` nunca.

E mesmo com terminal, a implementação pode pular etapas. Desde o Java 9, `count()` não executa o
*pipeline* quando o tamanho já é conhecido e nenhuma etapa o altera: num `Stream.of("a", "b")` com
um `map` que imprime, o `count()` devolve 2 sem imprimir nada. A documentação avisa: efeito colateral
dentro de uma operação intermediária não tem garantia de acontecer.

## A ordem é vertical

Cada elemento atravessa o *pipeline* inteiro antes do próximo começar. Num `Stream.of("a", "bb",
"ccc", "dddd")` com `peek`, `filter(s -> s.length() > 1)`, `map(toUpperCase)` e `findFirst()`, a saída
é `p:a p:bb -> BB`. O `"a"` passa pelo `peek`, é barrado no `filter`; o `"bb"` passa pelo `peek`, pelo
`filter`, pelo `map`, e o `findFirst` termina tudo ali. Os dois últimos elementos nem são lidos. É o
**curto-circuito**: `findFirst`, `anyMatch` e `limit` param assim que têm a resposta.

Operações **stateless** (`filter`, `map`) processam um elemento sem olhar os outros. As **stateful**
(`sorted`, `distinct`) precisam ver todos, ou parte deles, antes de passar adiante: um `sorted` no
meio do *pipeline* desfaz a ordem vertical e guarda tudo na memória.

## `Collectors`: agrupar, e a chave duplicada

- `groupingBy(classificador, coletorAbaixo)`: `groupingBy(Lancamento::conta, summingLong(...))` é o
  fechamento por conta.
- `partitioningBy(predicado)`: um mapa de `true` e `false`.
- `toMap(chave, valor)`: e aqui mora o erro mais comum. Com duas entradas de mesma chave, ele lança
  `IllegalStateException: Duplicate key c1 (attempted merging values 100 and 25)`. O `toMap` de três
  argumentos recebe a **política de junção** (`Long::sum`, "fica a última", "fica a primeira"), que
  precisa ser uma decisão explícita, não um acidente.

## *Boxing*: medido

`Stream<Long>` guarda objetos `Long`; `LongStream` guarda `long`. A diferença, medida com JMH no
`pix-core` (soma de 1 milhão de valores, 2 *forks*, 10 medições, JDK 25):

| Implementação | Tempo médio |
| --- | ---: |
| laço sobre `long[]` | 401 ± 42 µs |
| `LongStream.of(...).sum()` | 402 ± 29 µs |
| `List<Long>`, `.stream().mapToLong(Long::longValue).sum()` | 1.173 ± 73 µs |
| `List<Long>`, `.stream().reduce(0L, Long::sum)` | 6.241 ± 426 µs |

O `LongStream` empata com o laço. O `reduce` sobre `Long` desembrulha e reembrulha a cada soma e
fica 15 vezes mais lento. O meio-termo (`mapToLong` antes de somar) paga só o acesso aos objetos
espalhados no heap.

## *Parallel streams*: quando ajudam e quando travam

`.parallel()` divide o trabalho no **`ForkJoinPool.commonPool()`**, cujo paralelismo padrão é o número
de núcleos menos um (3 numa máquina de 4: a thread que chama também trabalha). Ajuda em trabalho de
**CPU**, sobre muitos dados, com uma fonte que se divide bem (array, `ArrayList`, `IntStream.range`),
sem estado compartilhado e com uma junção barata.

E atrapalha com **I/O bloqueante**. Medido: 32 consultas de 100 ms num `IntStream.range(0, 32).parallel()`
levaram ~805 ms numa máquina de 4 núcleos, porque só 4 threads trabalham, em 8 rodadas. Pior: o
`commonPool` é **compartilhado pelo processo inteiro**, e as consultas travadas ali atrasam qualquer
outro *stream* paralelo e todo `CompletableFuture` sem executor próprio. Para I/O, use *virtual
threads* (`concorrencia-e-recursos/05` e `/06`).

Duas outras armadilhas: `forEach` paralelo não preserva a ordem (`[6, 5, 2, 4, 3, 1, 0, 8, 9, 7]`
numa execução), enquanto `collect(toList())` preserva a ordem de encontro; e um `ArrayList`
compartilhado dentro de um `forEach` paralelo é uma corrida.

## *Gatherers* (Java 24)

Os *Stream Gatherers* (JEP 485) são operações intermediárias definidas por você, ou prontas em
`Gatherers`:

- `windowFixed(2)` agrupa em janelas: `[[1, 2], [3, 4], [5]]`;
- `scan` dá as somas acumuladas: `[1, 3, 6, 10]`;
- `mapConcurrent(n, f)` aplica `f` com até `n` execuções simultâneas, em *virtual threads*, e
  **preserva a ordem**.

O `mapConcurrent` é a resposta para o caso do I/O. As mesmas 32 consultas de 100 ms, com
`gather(Gatherers.mapConcurrent(32, ...))`, levaram ~113 ms.

## Lambdas, `Optional` e referências de método

- Uma lambda só captura variáveis locais **efetivamente finais**: atribuídas uma vez. É o que deixa
  a lambda ser executada noutra thread sem corrida sobre a variável.
- Dentro da lambda, `this` é o objeto que a declarou. Numa classe anônima, `this` é a própria classe
  anônima, que pode até esconder um campo de mesmo nome.
- Referências de método (`Lancamento::conta`, `Long::sum`) são lambdas com nome.
- `Optional` foi desenhado para **retorno** de método que pode não ter valor. Como campo, parâmetro ou
  elemento de coleção, ele só acrescenta um objeto e um nível de indireção, e não é `Serializable`.

## Exemplo numa fintech

O fechamento diário soma 5 milhões de lançamentos por conta. A primeira versão era um
`.parallelStream()` que, para cada lançamento, consultava o limite da conta num serviço HTTP. Rodou
bem em homologação, com poucos dados. Em produção, ocupou o `commonPool` por minutos, e os outros
*streams* paralelos do serviço pararam junto. A versão certa separa as duas coisas. A consulta vem
antes, com concorrência controlada (`mapConcurrent` ou um executor de *virtual threads*). A soma é
um `groupingBy` com `summingLong`, sequencial ou paralelo, e precisa dar o mesmo resultado, ao
centavo, que um laço.

## Hands-on

**Tutorial.** Reproduza a ordem vertical com `peek` e `findFirst`, o `count()` que não executa o `map`
e o `IllegalStateException` do `toMap`. Depois meça as 32 consultas de 100 ms com `.parallel()` e com
`Gatherers.mapConcurrent`.

**Desafio.** A agregação do fechamento: `Fechamento.comLaco`, `comStream` (com `groupingBy` e
`summingLong`) e `comStreamParalelo` (com `groupingByConcurrent`), em centavos (`long`), sobre um dia
gerado com semente fixa: 5 milhões de lançamentos, 20 mil contas, débitos e créditos.

**Invariantes testáveis**

1. As três implementações dão o mesmo mapa, ao centavo, e a soma dos totais por conta é igual à soma
   de todos os lançamentos.
2. Um benchmark JMH mostra a diferença do *boxing* com intervalo de confiança: `LongStream` ×
   `Stream<Long>` com `reduce` × `Stream<Long>` com `mapToLong`, com pelo menos 2 *forks*. Os
   intervalos do `LongStream` e do `reduce` não se sobrepõem.
3. Um `toMap` com chave repetida tem política explícita. O teste exige o `IllegalStateException`, com
   a mensagem exata, no `toMap` de dois argumentos, e confere que a política escolhida (aqui, "fica a
   última") é a aplicada.

**Complemento.** Escreva um `Gatherer` próprio que agrupa lançamentos consecutivos da mesma conta
(*run-length*), e compare a memória dele com um `groupingBy` sobre um *stream* já ordenado por conta.

**Checagem**

1. Por que o `peek` imprime só dois elementos no exemplo com `findFirst`?
2. Quando um *stream* paralelo ajuda, e por que I/O bloqueante dentro dele afeta o processo inteiro?
3. O que o JMH mostrou sobre `Stream<Long>` × `LongStream`, e de onde vem a diferença?
4. Por que `Optional` não deve ser campo de uma classe?

## Principais aprendizados

- Nada roda sem operação terminal, e a terminal pode pular etapas (`count`).
- A ordem é vertical, com curto-circuito; operações *stateful* guardam tudo.
- `toMap` com chave repetida lança exceção: decida a política.
- *Boxing* custa caro (15 vezes no `reduce` medido); use `IntStream` e `LongStream`.
- Paralelo é para CPU; com I/O, ele trava o `commonPool` do processo. Use `mapConcurrent` ou
  *virtual threads*.
- `Optional` é retorno; lambda captura só o efetivamente final.
