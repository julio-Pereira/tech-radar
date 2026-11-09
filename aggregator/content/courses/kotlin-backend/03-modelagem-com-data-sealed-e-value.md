---
id: modelagem-com-data-sealed-e-value
title: "Modelagem com data, sealed e value"
summary: "O mesmo domínio fechado do pix-core, com menos código e o mesmo rigor. O que a data class gera e o copy que fura o construtor privado, sealed interface com when exaustivo como expressão, value class para PaymentId e PixKey (e onde ela vira objeto), enum × sealed, e a máquina de estados do pagamento com a mesma tabela de 20 pares do Java."
estimatedMinutes: 50
reviewedAt: 2026-11-09
reviewEvery: 12m
competencies: [arquitetura]
references:
  - title: "Kotlin: Data classes"
    url: https://kotlinlang.org/docs/data-classes.html
  - title: "Kotlin: Sealed classes and interfaces"
    url: https://kotlinlang.org/docs/sealed-classes.html
  - title: "Kotlin: Inline value classes"
    url: https://kotlinlang.org/docs/inline-classes.html
  - title: "KT-11914: copy() exposes a non-public primary constructor"
    url: https://youtrack.jetbrains.com/issue/KT-11914
---

## `data class`: o record com `copy`

Uma `data class` gera, a partir das propriedades do construtor primário, o que o *record* do Java
gera: `equals`, `hashCode` e `toString`. E acrescenta duas coisas:

- **`componentN()`**, para desestruturar: `val (e2eId, em) = liquidado`.
- **`copy(...)`**, que cria uma cópia trocando só os campos nomeados:
  `evento.copy(estado = "LIQUIDADO")`. É o "*wither*" que o Java ainda não tem.

Duas diferenças em relação ao *record* importam. A `data class` aceita `var` no construtor, e com
`var` o `hashCode` muda depois que o objeto entra num `HashSet` (o mesmo problema de
`java-e-jvm/02`); use só `val`. E o `copy` é uma porta para o construtor primário.

### O `copy` que fura o construtor privado

O padrão "construtor privado + fábrica que valida" protege o invariante, mas o `copy` gerado chama o
construtor direto:

```kotlin
data class Valor private constructor(val centavos: Long) {
    companion object { fun of(c: Long): Valor { require(c >= 0); return Valor(c) } }
}

val burla = Valor.of(10).copy(centavos = -5)   // compila no Kotlin 2.3
```

No Kotlin 2.3.21, isso compila com dois avisos: `non-public primary constructor is exposed via the
generated 'copy()' method`, e "*This will become an error in language version 2.5*" (KT-11914). Com
`@ConsistentCopyVisibility` na classe, o `copy` herda a visibilidade do construtor, e a mesma linha
deixa de compilar: `cannot access 'fun copy(...)': it is private in 'Valor'`. Use a anotação hoje
em toda `data class` com construtor não público; na linguagem 2.5, o `copy` que expõe o construtor
passa a ser erro.

### `data class` não é entidade JPA

`equals` e `hashCode` sobre todas as propriedades são o oposto do que uma entidade precisa: a
identidade de uma entidade é o id, que nasce nulo e muda ao persistir. Um `toString` gerado que
percorre uma associação preguiçosa dispara consultas, ou `LazyInitializationException`, num log. E o
JPA precisa de classe aberta e de construtor sem argumentos (os plugins `kotlin-jpa` e `all-open`, no
marco 08). Para a entidade, escreva uma classe comum com igualdade pelo id; para o valor e o DTO,
`data class`.

## `sealed interface` e `when` exaustivo

A `sealed interface` fecha a soma, como em `java-e-jvm/05`: todos os subtipos diretos estão no mesmo
módulo e pacote, e o compilador os conhece. O `when` sobre ela, usado como expressão, precisa cobrir
todos os casos, e o *smart cast* dá acesso aos campos de cada um:

```kotlin
sealed interface Estado {
    data object Criado : Estado
    data class Autorizado(val e2eId: String) : Estado
    data class Liquidado(val e2eId: String, val em: Instant) : Estado
    data class Rejeitado(val motivo: String) : Estado
    data class Estornado(val e2eId: String, val motivo: String) : Estado
}

fun aplicar(estado: Estado, evento: Evento): Result<Estado> = when (estado) {
    Estado.Criado -> when (evento) {
        is Evento.Autorizar -> Result.success(Estado.Autorizado(evento.e2eId))
        is Evento.Rejeitar -> Result.success(Estado.Rejeitado(evento.motivo))
        is Evento.Liquidar, is Evento.Estornar -> invalida(estado, evento)
    }
    // ... um ramo por estado, sem else
}
```

`data object` é o estado sem dados: um *singleton* com `toString` legível (`Criado`, não
`Estado$Criado@1b6d3586`) e `equals` correto mesmo se alguém o desserializar duas vezes.

Acrescentar `data object Cancelado : Estado` faz cada `when` sem `else` parar de compilar:
`'when' expression must be exhaustive. Add the 'Cancelado' branch or an 'else' branch`. O `else` é o
que desliga essa proteção, e por isso a máquina de estados não tem nenhum.

**`enum` × `sealed`.** `enum class` é a escolha quando cada alternativa é uma constante sem dados
próprios, com `entries` para iterar e `valueOf` para ler de texto. Assim que uma alternativa carrega
dados diferentes (`Rejeitado(motivo)`, `Liquidado(e2eId, em)`), é `sealed`.

## `value class`: o tipo sem o objeto

`PaymentId` e `PixKey` são `String`s que não podem ser trocadas entre si. A `value class` dá o tipo
próprio sem alocar um objeto em volta:

```kotlin
@JvmInline
value class PixKey(val valor: String) {
    init { require(FORMATOS.any { it.matches(valor) }) { "chave Pix inválida" } }
}
```

O `init` roda a cada construção: uma `PixKey` inválida não existe. Em tempo de execução, quase sempre
é a `String`. Numa função `fun registrar(chave: PixKey)`, o *bytecode* tem um parâmetro `String`, e o
nome da função ganha um sufixo (*mangling*) para não colidir com uma sobrecarga que receba `String`:
`registrar-mvVK3hg(String)`. Isso também significa que o Java não chama essa função pelo nome normal.

A `value class` vira objeto (*boxing*) quando o tipo estático não é ela: atribuída a `Any`, usada
como `PixKey?`, ou dentro de um genérico (`List<PixKey>`, `Map<PaymentId, Estado>`). Nesses casos, o
elemento é uma instância de `PixKey`, como mostra `javaClass.name`. O ganho de memória vale no campo,
no parâmetro e no retorno, não nas coleções.

## O mesmo desenho em três linguagens

| | Java (`java-e-jvm/05`) | Kotlin | Go (`go-fintech/04`) |
| --- | --- | --- | --- |
| tipo fechado | `sealed interface` + `record` | `sealed interface` + `data class`/`data object` | interface com método não exportado |
| exaustividade | `switch` sem `default`, pelo compilador | `when` sem `else`, pelo compilador | linter (`go-check-sumtype`) |
| sem estado inválido | construtor compacto | `init`, construtor privado com `@ConsistentCopyVisibility` | construtor `New...` e campos não exportados |
| tipo sem objeto | ainda não há na linguagem final (projeto Valhalla) | `@JvmInline value class` | `type PixKey string` |

O raciocínio é o mesmo nas três; muda quem garante. Em Java e em Kotlin, o compilador. Em Go, um
linter que o CI precisa rodar.

## Exemplo numa fintech

Um serviço de status em Kotlin representava o estado com `enum class` e guardava o motivo da rejeição
num campo `motivo: String?` ao lado. Um estorno foi registrado com `motivo = null`, porque nada
obrigava o campo a existir naquele estado, e o *webhook* saiu sem a razão que o regulamento exige.
Com `Estornado(e2eId, motivo)` como subtipo selado, o estado sem motivo não é construível, e o
`when` que monta o *webhook* não compila se esquecer um estado.

## Hands-on

**Tutorial.** Escreva `Estado` e `Evento` como `sealed interface` (com `data object` e `data class`),
`PaymentId` e `PixKey` como `@JvmInline value class`. A `PixKey` aceita os cinco formatos: CPF (11
dígitos), CNPJ (14), telefone (`+55` e 10 ou 11 dígitos), e-mail e chave aleatória (UUID).

**Desafio.** A máquina de estados do pagamento no `pix-status`: `aplicar(estado, evento)` com `when`
aninhado, sem `else`, devolvendo `Result<Estado>` com uma `TransicaoInvalida` na falha.

**Invariantes testáveis**

1. **Paridade com o `pix-core`.** O teste percorre os mesmos 20 pares estado × evento de
   `java-e-jvm/05`, com a tabela das 5 transições válidas escrita à parte. Os 15 pares restantes
   falham com a `TransicaoInvalida` daquele par.
2. **Estado novo quebra a compilação.** O teste lê o fonte real, acrescenta
   `data object Cancelado : Estado`, compila em memória com o `K2JVMCompiler` do
   `kotlin-compiler-embeddable` e exige o erro `'when' expression must be exhaustive` com o nome
   `Cancelado`.
3. **`PixKey` inválida não é construível.** `PixKey("123")` e `PixKey("")` lançam
   `IllegalArgumentException`; os cinco formatos válidos constroem. Um segundo teste documenta o
   *boxing*: como `Any` e dentro de `List<PixKey>`, a classe em tempo de execução é `PixKey`, e o
   parâmetro de `registrar(PixKey)` no *bytecode* é `String`.

**Complemento.** Escreva `data class Valor private constructor(...)` com a fábrica que valida,
compile `Valor.of(10).copy(centavos = -5)` e leia os avisos. Acrescente `@ConsistentCopyVisibility` e
veja o erro. Depois reescreva a máquina com `enum class` e um `EnumMap` e compare o que o compilador
deixa de conferir.

**Checagem**

1. O que a `data class` gera além do que o *record* gera, e por que o `copy` é um risco com construtor
   privado?
2. Por que `data class` é uma escolha ruim para entidade JPA?
3. Em quais usos uma `value class` vira objeto, e o que o *mangling* faz com o nome da função?
4. Quando usar `enum class` e quando usar `sealed interface`?

## Principais aprendizados

- `data class` é o *record* com `componentN` e `copy`; só `val` no construtor.
- `copy` expõe o construtor primário: com construtor privado, use `@ConsistentCopyVisibility` (na
  linguagem 2.5, o `copy` exposto vira erro).
- Entidade JPA não é `data class`: igualdade pelo id e nenhum `toString` que percorra associação.
- `sealed interface` + `when` sem `else` = estado novo que não compila até ser tratado; `data object`
  para o estado sem dados.
- `value class` dá tipo sem objeto no campo e no parâmetro, e vira objeto em `Any`, nulável e
  genérico.
