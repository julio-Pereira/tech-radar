---
id: funcoes-extensoes-e-dsls
title: "Funções, extensões e DSLs"
summary: "Extensão e lambda with receiver são poderosas; usadas sem critério, escondem dependência. Funções de alta ordem e inline (o return que sai da função de fora), a extensão que se resolve pelo tipo declarado, scope functions com critério, a DSL de regras de notificação com @DslMarker, coleções só de leitura que não são imutáveis, e Sequence × List × Stream medidos sobre 1 milhão de eventos."
estimatedMinutes: 45
reviewedAt: 2026-11-09
reviewEvery: 12m
competencies: [arquitetura, performance]
references:
  - title: "Kotlin: Inline functions"
    url: https://kotlinlang.org/docs/inline-functions.html
  - title: "Kotlin: Extensions"
    url: https://kotlinlang.org/docs/extensions.html
  - title: "Kotlin: Scope functions"
    url: https://kotlinlang.org/docs/scope-functions.html
  - title: "Kotlin: Type-safe builders"
    url: https://kotlinlang.org/docs/type-safe-builders.html
  - title: "Kotlin: Sequences"
    url: https://kotlinlang.org/docs/sequences.html
---

## Funções de alta ordem e `inline`

Uma função que recebe uma função (`filter`, `map`, `retry(3) { ... }`) é de alta ordem. Sem mais
nada, cada lambda passada vira um objeto, e uma lambda que captura variáveis aloca um objeto novo a
cada chamada. A palavra **`inline`** muda isso: o compilador copia o corpo da função e o da lambda
para o ponto da chamada, e não sobra objeto nenhum. As funções de coleção da biblioteca padrão
(`map`, `filter`, `forEach`) são `inline`.

`inline` muda também o significado do `return` dentro da lambda:

```kotlin
fun primeiroNegativo(xs: List<Int>): Int? {
    xs.forEach { if (it < 0) return it }   // sai de primeiroNegativo, não só da lambda
    return null
}
```

`primeiroNegativo(listOf(3, -1, -7))` devolve `-1`. Com uma função de alta ordem que não é `inline`,
o mesmo `return` não compila (`'return' is prohibited here`): só o `return@rotulo` local é
permitido. Dois modificadores ajustam o comportamento: **`noinline`** num parâmetro mantém aquela
lambda como objeto (para guardá-la ou repassá-la), e **`crossinline`** proíbe o `return` não local
quando a lambda vai rodar em outro contexto, como dentro de um `Runnable`.

## Extensões: resolução estática

Uma função de extensão (`fun Money.emReais(): String`) parece um método novo da classe, mas é uma
função estática que recebe o objeto como primeiro parâmetro. Ela não entra na classe, não vê membros
privados e **é escolhida pelo tipo declarado**, não pelo tipo real:

```kotlin
open class Evento
class Liquidacao : Evento()
fun Evento.rotulo() = "evento"
fun Liquidacao.rotulo() = "liquidação"

val e: Evento = Liquidacao()
e.rotulo()   // "evento": o tipo declarado é Evento
```

Com um método `open` sobrescrito, a mesma chamada daria `"liquidação"`, porque método é despacho
dinâmico. Duas regras de uso saem disso. Se o comportamento depende do subtipo, ele é método (ou um
`when` sobre o tipo selado do marco 03), não extensão. E se um membro e uma extensão têm a mesma
assinatura, o membro vence sempre.

A extensão é ótima para adaptar o que você não controla (`fun Instant.formatoBacen()`) e para deixar
a API de um tipo mais legível sem engordá-lo. Usada demais, espalha regra de negócio por arquivos que
ninguém sabe que precisa importar: é a dependência escondida da tese do marco.

## *Scope functions* com critério

| Função | O objeto dentro do bloco | Devolve | Uso típico |
| --- | --- | --- | --- |
| `let` | `it` | o resultado do bloco | `x?.let { ... }`: só quando não é nulo |
| `run` | `this` | o resultado do bloco | calcular algo a partir do objeto |
| `with(x)` | `this` | o resultado do bloco | várias chamadas num objeto já existente |
| `apply` | `this` | o próprio objeto | configurar um objeto recém-criado |
| `also` | `it` | o próprio objeto | efeito colateral no meio de uma cadeia (log) |

O critério é legibilidade. Três *scope functions* aninhadas, com `it` e `this` mudando de significado
a cada nível, são piores que três variáveis locais com nome. Uma por expressão é a regra prática.

## *Lambda with receiver* e DSLs

`RegrasBuilder.() -> Unit` é o tipo de uma lambda que roda **como se fosse um método** de
`RegrasBuilder`: dentro dela, `this` é o *builder*, e as chamadas dispensam o prefixo. É a base das
DSLs do Kotlin, como o `build.gradle.kts`, o *router* DSL do WebFlux e o `BeanRegistrarDsl` do Spring
7 (marco 08). Para o `pix-status`, as regras de notificação:

```kotlin
val r = regras {
    quando(TipoEstado.LIQUIDADO) {
        webhook("https://recebedor.exemplo/pix")
        prazo = 3.seconds
    }
}
```

Lambdas aninhadas têm um problema: o bloco de dentro também enxerga o *receiver* de fora. Sem
cuidado, um `quando` escrito dentro de outro `quando` compila e cria a regra no lugar errado. A
anotação **`@DslMarker`** resolve isso. Aplicada aos dois *builders*, ela proíbe usar o *receiver*
de fora implicitamente, e o erro é `cannot be called in this context with an implicit receiver`.

Uma DSL boa só produz objetos válidos. Os campos obrigatórios são conferidos no `construir()`, os
limites (prazo de 1 a 30 s, tentativas de 1 a 10) também, e o construtor do *builder* é `internal`,
para que ninguém o instancie fora da DSL.

## Coleções só de leitura não são imutáveis

`List<T>` em Kotlin é uma interface **só de leitura**: ela não tem `add`. Mas a lista por trás pode
ser uma `MutableList` que outra parte do código continua alterando:

```kotlin
val interna = mutableListOf(1)
val exposta: List<Int> = interna
interna.add(2)        // exposta.size agora é 2
```

Para entregar uma cópia que ninguém mais altera, use `toList()`, como o `construir()` da DSL faz.
É a mesma diferença entre `Collections.unmodifiableList` e `List.copyOf` em Java (`java-e-jvm/03`).

## `Sequence` × `List` × `Stream`

As operações de `List` são **ansiosas**: cada `filter` e cada `map` cria uma lista nova inteira.
`Sequence` é **preguiçosa**: cada elemento passa por toda a cadeia antes do próximo, e nada é
calculado até uma operação terminal. A ordem de execução mostra a diferença:

| Cadeia sobre `listOf(1, 2, 3)` | Ordem das chamadas |
| --- | --- |
| `.map { it * 2 }.filter { it > 2 }.first()` | `m1, m2, m3, f2, f4, f6` |
| `.asSequence().map { it * 2 }.filter { it > 2 }.first()` | `m1, f2, m2, f4` |

Medido no JDK 25 com `ThreadMXBean.getThreadAllocatedBytes`, depois do aquecimento, sobre 1 milhão
de eventos (um quarto deles estornos):

| Código | Bytes alocados por execução |
| --- | ---: |
| `filter` + `map` + `take(10)` em `List` | 11,3 MB |
| o mesmo com `asSequence()` | 448 B |
| `filter` + `map` + `sum()` em `List` | 11,3 MB |
| o mesmo com `asSequence()` | 152 B a 6 MB, conforme a execução |
| `sumOf { if (estorno) valor else 0L }` | 24 a 56 B |
| `stream().filter().mapToLong().sum()` | 392 B |

Duas leituras. Com `take`, a `Sequence` para no décimo elemento, e a `List` processou o milhão.
Somando tudo, a `Sequence` evita as listas intermediárias, mas o `map` produz `Long` como objeto, e
só depois que o JIT otimiza o laço essa alocação some: numa execução, 6 MB; em outra, 152 B. O
`mapToLong` do `Stream` (`java-e-jvm/06`) e o `sumOf` direto evitam a caixa por construção. A regra:
`List` para coleções pequenas e cadeias curtas (é mais rápida e mais simples); `Sequence` para
cadeias longas, coleções grandes ou quando há `take`/`first`; e meça antes de trocar.

## Exemplo numa fintech

Um time espalhou regra de tarifa em extensões (`fun Pagamento.tarifa()`) em três módulos. Um
pagamento de um tipo novo, subclasse de `Pagamento`, passou a ser cobrado com a tarifa genérica,
porque o código que calculava recebia o pagamento declarado como `Pagamento`, e a extensão
específica do subtipo nunca foi escolhida. Nenhum teste quebrou: a regra estava "lá". A correção
foi trazer a tarifa para um `when` exaustivo sobre o tipo selado, no domínio, onde um tipo novo não
compila sem tarifa.

## Hands-on

**Tutorial.** Escreva a DSL `regras { quando(estado) { webhook(url); prazo = ...; tentativas = ... } }`
com `@DslMarker` nos dois *builders*, `internal` nos construtores e a validação no `construir()`.

**Desafio.** A DSL de regras de notificação do `pix-status`, com os limites de prazo (1 a 30 s) e de
tentativas (1 a 10), e o *webhook* obrigatório com `https`.

**Invariantes testáveis**

1. **A DSL só produz regras válidas.** Regra sem *webhook*, com `http` ou com prazo fora do limite
   falha no `construir()` com a mensagem do campo. O teste de compilação negativo: um `quando`
   dentro de outro `quando` não compila (`K2JVMCompiler` em memória, erro `cannot be called in this
   context with an implicit receiver`), e a mesma DSL **sem** o `@DslMarker` compila.
2. **`Sequence` não materializa as listas intermediárias.** Sobre 1 milhão de eventos, com `take(10)`,
   a versão `Sequence` aloca menos de 10 KB, e a versão `List` mais de 1 MB, medido com
   `getThreadAllocatedBytes` depois do aquecimento.
3. **Extensão segue o tipo declarado.** Com `val e: Evento = Liquidacao()`, `e.rotulo()` devolve a
   extensão de `Evento`, `(e as Liquidacao).rotulo()` a de `Liquidacao`, e o método `open`
   sobrescrito devolve o do tipo real.

**Complemento.** Reescreva a soma dos estornos com `asSequence().map { it.valor }.sum()` e rode a
medição dez vezes, a primeira sem aquecimento. Anote a variação e explique-a pelo *boxing* do `Long`.
Depois compare com `sumOf`.

**Checagem**

1. O que muda no `return` dentro de uma lambda passada a uma função `inline`, e para que servem
   `noinline` e `crossinline`?
2. Por que uma extensão não substitui um método `open` quando o comportamento depende do subtipo?
3. O que o `@DslMarker` impede, e por que isso importa numa DSL com blocos aninhados?
4. Quando `Sequence` é melhor que `List`, e por que a soma com `map` pode alocar mesmo assim?

## Principais aprendizados

- `inline` elimina o objeto da lambda e permite o `return` não local; `noinline` e `crossinline`
  ajustam.
- Extensão é função estática escolhida pelo tipo declarado; comportamento por subtipo é método ou
  `when` selado.
- *Scope functions*: uma por expressão, escolhida pelo que devolve e pelo nome do objeto no bloco.
- DSL = *lambda with receiver* + `@DslMarker` + validação no `construir()`.
- `List` só de leitura não é imutável: entregue `toList()`.
- `Sequence` é preguiçosa e brilha com `take`/`first` e cadeias longas; para somar primitivos,
  `sumOf` ou `mapToLong` evitam a caixa.
