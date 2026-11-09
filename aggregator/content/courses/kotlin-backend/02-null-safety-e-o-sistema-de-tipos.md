---
id: null-safety-e-o-sistema-de-tipos
title: "Null-safety e o sistema de tipos"
summary: "O null não sumiu: foi empurrado para a fronteira com Java, e é lá que o bug mora. Tipos anuláveis, elvis e o !! que é cheiro, o tipo de plataforma e o JSpecify do Spring 7, o JSON que entra com campo faltando (rejeitado na fronteira, ou aceito e estourado longe dali), lateinit × lazy, variância de declaração × PECS, e uma regra de build que proíbe !!."
estimatedMinutes: 55
reviewedAt: 2026-11-09
reviewEvery: 12m
competencies: [confiabilidade, arquitetura]
references:
  - title: "Kotlin: Null safety"
    url: https://kotlinlang.org/docs/null-safety.html
  - title: "Kotlin: Calling Java from Kotlin (platform types)"
    url: https://kotlinlang.org/docs/java-interop.html
  - title: "Kotlin: Generics (variance)"
    url: https://kotlinlang.org/docs/generics.html
  - title: "Spring blog — Next level Kotlin support in Spring Boot 4"
    url: https://spring.io/blog/2025/12/18/next-level-kotlin-support-in-spring-boot-4/
  - title: "jackson-module-kotlin"
    url: https://github.com/FasterXML/jackson-module-kotlin
---

## O tipo diz quem pode ser nulo

Em Kotlin, `String` não aceita `null`, e `String?` aceita. O compilador não deixa chamar um método em
`String?` sem tratar o caso nulo:

| Operador | O que faz | Quando usar |
| --- | --- | --- |
| `x?.length` | chamada segura: `null` se `x` for `null` | encadear sem `if` |
| `x ?: padrao` | *elvis*: o valor da direita se `x` for `null` | padrão, ou `?: return`, ou `?: error("...")` |
| `x!!` | afirma que não é `null`; se for, `NullPointerException` sem mensagem | quase nunca |
| `x?.let { ... }` | roda o bloco só se não for `null` | quando o bloco usa o valor |

O *elvis* aceita `return` e `throw` do lado direito, porque os dois têm o tipo `Nothing`, que é
subtipo de todos os tipos. É assim que a validação fica numa linha e o resto da função trabalha com o
tipo não-nulo:

```kotlin
fun tarifa(id: String, tabela: Map<String, Long>): Long {
    val base = tabela[id] ?: return 0          // daqui para baixo, base é Long
    return base * 2
}
```

O `!!` é cheiro porque troca uma decisão por um *crash* sem contexto. `mapa["P2"]!!.uppercase()`
lança `NullPointerException` com a mensagem `null`. `(mapa["P2"] ?: error("pagamento P2 sem e2eId"))`
lança `IllegalStateException` com a mensagem que o plantão precisa. Neste marco, o `!!` sai do código
de produção por uma regra de *build*.

`Nothing`, `Unit` e `Any` completam o quadro. `Any` é a raiz dos tipos não-nulos (o `Object` do
Java). `Unit` é o "nada de útil" que uma função devolve (o `void`, só que é um valor). `Nothing` é o
tipo de uma expressão que nunca termina normalmente: `throw`, `error(...)`, `TODO()`.

## O tipo de plataforma: onde o `null` voltou a morar

Um método Java sem anotação de nulidade pode devolver `null` ou não, e o Kotlin não sabe. O tipo que
ele dá ao retorno é o **tipo de plataforma**, escrito `String!` nas mensagens do compilador, que você
não pode declarar. O compilador deixa usá-lo como `String` ou como `String?`, por sua conta.

```kotlin
val assinatura: String = AssinadorLegado().assinar("")   // compila
```

Se o método devolver `null`, o Kotlin lança `NullPointerException: assinar(...) must not be null` na
própria atribuição. É melhor que a NPE três camadas depois, mas é um *crash* do mesmo jeito. Há duas
saídas:

- **Anotar o lado Java.** Com JSpecify (`@NullMarked` na classe ou no pacote, `@Nullable` no
  retorno), o Kotlin passa a ver `String?`, e a mesma linha deixa de compilar:
  `initializer type mismatch: expected 'String', actual 'String?'`. O Spring Framework 7 trocou as
  anotações JSR 305 por JSpecify, e o Kotlin traduz JSpecify para a nulidade dele por padrão desde a
  versão 2.1. Com o Spring 7, a API do framework chega ao Kotlin com nulidade certa.
- **Encapsular o que não dá para anotar.** A biblioteca de terceiros sem anotação entra por um
  adaptador que declara `String?` no retorno, e o adaptador tem um teste do caso nulo. O resto do
  código nunca vê um tipo de plataforma.

## A fronteira do JSON

O evento de mudança de estado chega como JSON. O que acontece com um campo obrigatório faltando
depende de como a classe é desserializada. Testado com Jackson 3.1.7 e o módulo Kotlin:

| Como a classe é desserializada | JSON sem `pagamentoId` |
| --- | --- |
| `data class`, com o módulo Kotlin | falha na leitura: `KotlinInvalidNullException` (um `MismatchedInputException`) |
| `data class`, sem o módulo | falha na leitura: o Jackson não acha construtor |
| `data class` com `= ""` como padrão | **passa**, com `pagamentoId` vazio |
| `lateinit var pagamentoId` | **passa**; falha no primeiro acesso, com `UninitializedPropertyAccessException` |
| classe com o plugin `noarg` (o que o `kotlin-jpa` faz), sem o módulo | **passa** com `null` num `String`; a NPE aparece longe |

A última linha é a armadilha do plano: o plugin gera um construtor sem argumentos, o Jackson o usa, e
o objeto nasce com `null` num campo que o tipo diz que nunca é nulo. O `toString()` mostra
`pagamentoId=null`, e a NPE só aparece quando alguém chama `pagamentoId.uppercase()`, com a mensagem
`because the return value of "getPagamentoId()" is null`.

A regra: na fronteira, use `data class` com propriedades `val`, o módulo Kotlin registrado e nenhum
valor padrão em campo obrigatório. O campo opcional é `String?`, com `= null` explícito.

## `lateinit` × `by lazy`

- **`lateinit var`** é para o que vai ser preenchido depois da construção, por alguém de fora: injeção
  por campo, `@BeforeEach` de teste. Só vale para `var` de tipo não-nulo e não primitivo. Antes de
  preenchido, o acesso lança `UninitializedPropertyAccessException`, e `::campo.isInitialized` diz se
  já foi.
- **`val x by lazy { ... }`** é para o que a própria classe calcula na primeira leitura. O padrão é
  sincronizado: duas threads lendo ao mesmo tempo calculam uma vez só.

Em DTO, nenhum dos dois: o objeto nasce completo ou não nasce.

## Variância, `reified` e igualdade

Java decide a variância **no uso**, com *wildcards*: `List<? extends Evento>` para ler,
`Comparator<? super EventoPix>` para consumir (o PECS de `java-e-jvm/04`). Kotlin deixa decidir **na
declaração**:

```kotlin
interface Fonte<out T> { fun proximo(): T }        // só produz T: Fonte<EventoPix> é uma Fonte<Evento>
interface Destino<in T> { fun enviar(t: T) }       // só consome T: Destino<Evento> é um Destino<EventoPix>
```

O compilador confere que um `out T` nunca aparece como parâmetro. A `List` do Kotlin é `List<out E>`,
por isso uma `List<EventoPix>` passa onde se pede `List<Evento>` sem *wildcard*. Quando a declaração
não serve, a variância de uso existe (`Array<out Evento>`), e é a mesma ideia do PECS.

**`reified`**: numa função `inline`, o argumento de tipo fica disponível em tempo de execução, e a
*erasure* deixa de atrapalhar (`inline fun <reified T> JsonMapper.ler(json: String): T`). É o que o
`readValue<EventoDeEstado>(json)` do módulo Kotlin do Jackson usa.

**Igualdade**: `==` chama `equals` (e trata `null`), `===` compara a referência. Com dois `Money` de
valor igual, `a == b` é `true` e `a === b` é `false`. A armadilha de `java-e-jvm/02` volta com tipos
anuláveis: `val x: Long? = 127L` e `val y: Long? = 127L` dão `x === y` verdadeiro, pelo cache de
`Long` do Java; com `128L`, falso. Para valor, use sempre `==`.

## Exemplo numa fintech

Um serviço de notificação recebia o evento do *gateway* numa classe anotada com `@Entity`, para gravar
direto no banco. O plugin `kotlin-jpa` gerava o construtor vazio, e o `ObjectMapper` do projeto tinha
sido criado à mão, sem o módulo Kotlin. Um evento chegou sem `pagamentoId` por uma mudança no *gateway*.
O JSON foi aceito, a entidade foi gravada com a coluna nula, e a NPE apareceu horas depois, no *job*
que montava o *webhook*, longe da causa. A correção foi separar o DTO de entrada (`data class`, módulo
Kotlin, falha na leitura) da entidade, e testar a fronteira com o JSON incompleto.

## Hands-on

**Tutorial.** Acrescente ao `pix-status` o Jackson 3 (`tools.jackson.core:jackson-databind`) e o
módulo Kotlin (`tools.jackson.module:jackson-module-kotlin`), na versão que o Boot 4.1.2 gerencia
(3.1.7). Escreva o `EventoDeEstado` como `data class` com `pagamentoId`, `estado`, `ocorridoEm` e
`motivo: String? = null`, e um `Entrada.ler(json)` com o módulo registrado.

**Desafio.** A fronteira de entrada do evento e o adaptador de uma biblioteca Java de assinatura sem
anotação de nulidade (escreva-a em `src/main/java`, devolvendo `null` para payload vazio), e uma
segunda versão dela anotada com JSpecify.

**Invariantes testáveis**

1. **Falha na fronteira.** JSON sem `pagamentoId` e JSON com `"pagamentoId": null` lançam
   `MismatchedInputException` na leitura, com o nome do campo na mensagem. JSON sem `motivo` passa.
   Um teste de documentação mostra o contrário: a classe com o plugin `noarg`, lida sem o módulo,
   nasce com `null`, e a NPE aparece no primeiro uso.
2. **Nenhum `!!` em produção.** Um teste lê `src/main/kotlin` com a PSI do compilador
   (`kotlin-compiler-embeddable`, `KtPsiFactory`) e procura `KtPostfixExpression` com o operador
   `EXCLEXCL`. Prove a regra com uma *fixture*: ela acha o `x!!` da linha 3 e ignora `!!` dentro de
   *string* e de comentário. O detekt tem a regra `UnsafeCallOnNullableType`, mas ela exige resolução
   de tipos, e a linha estável do detekt (1.23) foi compilada com um Kotlin mais antigo que o do Boot
   4.1; a PSI não depende disso.
3. **A fronteira com Java tem dono.** Atribuir o retorno da biblioteca sem anotação a `String` lança
   NPE com `must not be null` (teste). O adaptador devolve `String?`, e o teste do caso nulo passa.
   Com a versão JSpecify, a mesma atribuição não compila: o teste compila o trecho em memória
   (`K2JVMCompiler`) e exige o erro `expected 'String', actual 'String?'`.

**Complemento.** Troque o `= null` do `motivo` por nada (sem padrão) e veja o que acontece com o JSON
sem `motivo`. Depois ligue `KotlinFeature.NullIsSameAsDefault` no módulo e explique o que muda.

**Checagem**

1. O que é um tipo de plataforma, por que você não pode declará-lo, e o que o JSpecify muda nele?
2. Por que `!!` é cheiro, e o que você escreve no lugar quando o `null` é mesmo impossível?
3. Em qual das formas de desserializar o evento um campo obrigatório faltando passa, e onde a falha
   aparece em cada uma?
4. Qual a diferença entre `out T` numa interface Kotlin e `? extends T` num método Java?

## Principais aprendizados

- O tipo diz quem pode ser nulo; `?.`, `?:` e `let` tratam o caso nulo, e `?: return` / `?: error()`
  validam numa linha.
- `!!` é um *crash* sem mensagem: tire-o do código de produção com uma regra de *build*.
- O `null` mora na fronteira com Java: tipo de plataforma, resolvido com JSpecify (o Spring 7 já usa)
  ou com um adaptador testado.
- Na entrada de JSON: `data class`, `val`, módulo Kotlin, sem padrão em campo obrigatório. `noarg`,
  `lateinit` e `= ""` deixam o erro passar e estourar longe.
- Variância na declaração (`out`/`in`) substitui o PECS na maior parte dos casos; `reified` contorna a
  *erasure* em funções `inline`; `==` é valor, `===` é referência.
