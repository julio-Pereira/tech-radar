---
id: colecoes-por-dentro
title: "Coleções por dentro"
summary: "Escolher a coleção é escolher complexidade, ordem e comportamento sob concorrência. O HashMap por dentro (buckets, resize, treeification e por que o hash ruim custa quatro ordens de grandeza), o LRU com LinkedHashMap, o fail-fast que não é garantia e o ConcurrentHashMap como coleção."
estimatedMinutes: 60
reviewedAt: 2026-11-08
reviewEvery: 12m
competencies: [performance, confiabilidade]
references:
  - title: "Collections Framework Overview (Java SE 25)"
    url: https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/doc-files/coll-overview.html
  - title: "HashMap (Java SE 25 API)"
    url: https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/HashMap.html
  - title: "ConcurrentHashMap (Java SE 25 API)"
    url: https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ConcurrentHashMap.html
  - title: "JEP 431: Sequenced Collections"
    url: https://openjdk.org/jeps/431
  - title: "JMH — Java Microbenchmark Harness"
    url: https://github.com/openjdk/jmh
---

## Listas e filas: quase sempre `ArrayList` e `ArrayDeque`

`ArrayList` é um array que cresce: acesso por índice em O(1), `add` no fim em O(1) amortizado
(quando enche, copia para um array maior), e inserção ou remoção no meio em O(n), porque desloca os
elementos seguintes. `ArrayDeque` é um array circular: inserir e remover nas duas pontas em O(1), sem
alocar um nó por elemento. É a pilha e a fila certas; `Stack` é legado sincronizado.

`LinkedList` parece a escolha para remoção no meio, mas chegar ao meio custa O(n) de percurso por
ponteiros, cada elemento é um nó separado no heap (mais memória, pior localidade de cache), e a
remoção barata só vale com um `ListIterator` já posicionado. Na prática, raramente ganha de
`ArrayList` ou `ArrayDeque`.

## O `HashMap` por dentro

Um `HashMap` é um array de *buckets*. Para achar o *bucket* de uma chave, ele pega o `hashCode()`,
**espalha** os bits altos sobre os baixos (`h ^ (h >>> 16)`) e usa os bits baixos como índice, porque
o tamanho da tabela é sempre uma potência de 2. Chaves no mesmo *bucket* ficam numa lista.

- **Capacidade e fator de carga.** A tabela começa com 16 *buckets* e fator de carga 0,75: ao passar
  de 12 entradas, ela dobra para 32 e redistribui tudo (*resize*). Conferido por reflexão no JDK 25:
  com 12 entradas a tabela tem 16 posições, com 13 tem 32. Se você sabe o tamanho, dimensione na
  criação (`HashMap.newHashMap(n)`, desde o Java 19, já calcula a capacidade pelo fator de carga).
- **Treeification.** Se um *bucket* passa de 8 entradas (`TREEIFY_THRESHOLD`) e a tabela tem pelo
  menos 64 posições (`MIN_TREEIFY_CAPACITY`), a lista vira uma árvore rubro-negra; abaixo de 6, volta
  a ser lista. A árvore limita o estrago de muitas colisões, mas ordena pelas chaves só se elas forem
  `Comparable`. Sem isso, a busca no *bucket* degenera.

Quanto custa, medido com JMH no `pix-core` (10 mil chaves, `get` de uma delas, JDK 25):

| Chave | Tempo por `get` |
| --- | ---: |
| `hashCode` do record (bom) | ~8 ns |
| `hashCode` constante, chave `Comparable` | ~200 ns |
| `hashCode` constante, chave sem `Comparable` | ~74.000 ns |

Quatro ordens de grandeza entre o hash bom e o hash ruim sem ordem. É por isso que `hashCode` não é
detalhe: um hash que devolve uma constante, ou que ignora o campo que varia, transforma o mapa numa
busca linear.

## Ordem: `LinkedHashMap`, `TreeMap` e as coleções sequenciadas

- **`LinkedHashMap`** mantém uma lista duplamente ligada pelas entradas. Por padrão, na ordem de
  inserção; com `accessOrder = true` no construtor, na ordem de **acesso**: cada `get` move a entrada
  para o fim. Somado a `removeEldestEntry`, que é chamado depois de cada `put`, é um **LRU** em poucas
  linhas.
- **`TreeMap`** é uma árvore ordenada: operações em O(log n) e, pela interface `NavigableMap`,
  consultas por faixa: `floorKey`, `ceilingEntry`, `headMap`, `subMap`. É a estrutura para "a tarifa
  vigente na data X" ou "as faixas de valor".
- **`EnumMap` e `EnumSet`** são arrays indexados pelo ordinal do enum: compactos e rápidos. Use sempre
  que a chave for um enum.
- **Coleções sequenciadas** (Java 21, JEP 431) deram uma interface comum às coleções com ordem
  definida: `getFirst()`, `getLast()`, `reversed()` em `List`, `Deque`, `LinkedHashSet`,
  `LinkedHashMap` e nos ordenados.

## *Fail-fast* não é garantia

Os iteradores das coleções de `java.util` são *fail-fast*: se a coleção muda estruturalmente fora do
próprio iterador, o próximo `next()` lança `ConcurrentModificationException`. A documentação diz que
isso é feito "na base do melhor esforço" e que não se deve depender dela. O exemplo clássico: num
`for-each` sobre `[a, b, c]`, remover `"a"` lança a exceção, mas remover `"b"`, o penúltimo, não lança
nada e o laço termina com `[a, c]`. O `hasNext()` compara o cursor com o tamanho, que diminuiu, e o
laço acaba antes da checagem. Para remover durante a iteração, use `Iterator.remove()` ou
`removeIf`.

## `ConcurrentHashMap` como coleção

O modelo de memória e as travas ficam em `concorrencia-e-recursos/02` e `/03`. Aqui interessa o
`ConcurrentHashMap` como estrutura:

- **Operações atômicas por chave:** `compute`, `computeIfAbsent`, `merge`, `putIfAbsent`. Ler com
  `get` e gravar com `put` são duas operações, e outra thread pode gravar entre elas. Medido: 16
  threads somando 10 mil cada numa chave, com `get` e `put`, terminaram com 73.737, 120.838 e
  137.390 em três rodadas, de 160.000 esperados. Com `merge(chave, 1L, Long::sum)`, 160.000 nas três.
- **Iteração fracamente consistente:** o iterador não lança `ConcurrentModificationException` e
  reflete o estado em algum momento durante a iteração, não necessariamente o final.
- **Não aceita `null`**, nem como chave nem como valor (`put(k, null)` lança `NullPointerException`).
  Num mapa concorrente, `get` devolver `null` precisa significar "não existe": se `null` pudesse ser
  valor, não haveria como distinguir os dois casos sem uma segunda chamada, que já poderia ver outro
  estado.

## Exemplo numa fintech

O limite diário por chave Pix ficava num `HashMap<String, Long>` com o total do dia: ler, somar,
gravar. Com o tráfego da tarde, o limite estourou para algumas chaves. Duas requisições liam o mesmo
total, as duas viam espaço, e as duas gravavam. Trocar o `HashMap` por `ConcurrentHashMap` sem trocar
o `get` e o `put` não resolve: a estrutura passa a não se corromper, mas a corrida entre a leitura e a
escrita continua. A correção é a operação atômica, `compute`, que lê, decide e grava sob a trava da
chave, devolvendo a recusa quando o novo total passaria do limite.

## Hands-on

**Tutorial.** Reproduza a corrida do limite: 16 threads somando numa chave com `get` e `put` num
`ConcurrentHashMap`, contra o mesmo laço com `merge`. Imprima os totais de três rodadas.

**Desafio.** Um `CacheLru<K, V>` com TTL para o resultado da consulta DICT: capacidade máxima,
despejo do menos usado (`LinkedHashMap` com `accessOrder` e `removeEldestEntry`), validade por
entrada, relógio injetado (`InstantSource`) e segurança entre threads (um `synchronized` em cada
operação pública é o ponto de partida honesto).

**Invariantes testáveis**

1. O tamanho nunca passa da capacidade, verificado depois de cada um de 100 `put` com chaves
   distintas.
2. A ordem de despejo é a do menos usado. Com capacidade 3: `put` de a, b, c; `get(a)`; `put(d)`
   despeja b; `get(c)`; `put(e)` despeja a. A ordem final é `d, c, e`.
3. Com o relógio injetado, uma entrada nunca é devolvida no instante do vencimento ou depois (TTL de
   30 s: devolvida em 29 s, vazia em 30 s).
4. 16 threads, 30 fases de 1.000 operações cada, não violam (1) e (3), em 5 repetições. O teste também
   precisa estar certo. O valor gravado é o instante do `put`, e o relógio só pode andar entre fases
   (uma `CyclicBarrier` cuja ação avança 1 s). Se ele andar durante a fase, a thread pode ler o
   relógio, perder a CPU e gravar depois: o cache estaria certo e o teste acusaria erro. Prove que o
   teste pega o defeito real: sem os `synchronized`, ele falha em todas as repetições. O teste de
   concorrência em profundidade (jcstress, determinismo) está em `concorrencia-e-recursos/08`.

**Complemento.** Escreva o benchmark JMH do hash ruim: 10 mil chaves num `HashMap`, com `hashCode`
do record, com `hashCode` constante e chave `Comparable`, e com `hashCode` constante sem
`Comparable`. Compare a ordem de grandeza com a tabela acima e explique o papel da
*treeification* na linha do meio.

**Checagem**

1. Por que `LinkedList` raramente ganha de `ArrayList` ou `ArrayDeque`, mesmo para remoção?
2. O que acontece com um *bucket* que recebe muitas colisões, e por que importa se a chave é
   `Comparable`?
3. Por que remover o penúltimo elemento num `for-each` não lança `ConcurrentModificationException`?
4. Por que trocar `HashMap` por `ConcurrentHashMap` não corrige o limite diário que estoura?

## Principais aprendizados

- `ArrayList` e `ArrayDeque` cobrem quase tudo; `LinkedList` quase nunca.
- `HashMap`: tabela em potência de 2, fator de carga 0,75, *resize* dobrando, *treeification* acima de
  8 por *bucket* (com tabela de 64 ou mais).
- Um `hashCode` ruim custa ordens de grandeza; com chave `Comparable`, a árvore do *bucket* limita o
  estrago.
- `LinkedHashMap` com ordem de acesso e `removeEldestEntry` é um LRU; `TreeMap` responde faixas.
- *Fail-fast* é melhor esforço; remova pelo iterador ou com `removeIf`.
- `ConcurrentHashMap` só é correto com as operações atômicas, e não aceita `null`.
