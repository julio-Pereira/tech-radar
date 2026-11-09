---
id: kotlin-para-quem-vem-de-java
title: "Kotlin para quem vem de Java"
summary: "Kotlin muda o default (imutável, não-nulo, final), e o resto é consequência. Expressões no lugar de comandos, smart cast, classes finais e o plugin kotlin-spring provado por reflexão, interop em uma página, os critérios para responder \"por que Kotlin?\" e o Money do pix-core portado com o mesmo teste de rateio."
estimatedMinutes: 40
reviewedAt: 2026-11-09
reviewEvery: 12m
competencies: [arquitetura]
references:
  - title: "Kotlin: Comparison to Java"
    url: https://kotlinlang.org/docs/comparison-to-java.html
  - title: "Kotlin: All-open compiler plugin"
    url: https://kotlinlang.org/docs/all-open-plugin.html
  - title: "Kotlin: Calling Kotlin from Java"
    url: https://kotlinlang.org/docs/java-to-kotlin-interop.html
---

## O default mudou

Kotlin roda na mesma JVM, usa as mesmas bibliotecas e gera o mesmo *bytecode* que o Java. O que muda
são os **padrões** da linguagem: o que você ganha sem pedir, e o que precisa pedir explicitamente.

| Em Java, por padrão | Em Kotlin, por padrão | Para ter o outro |
| --- | --- | --- |
| variável reatribuível | `val`, que não se reatribui | `var` |
| referência pode ser `null` | o tipo não aceita `null` | `String?` (marco 02) |
| classe e método podem ser estendidos | `final` | `open` |
| coleção mutável (`List.add` existe) | `List` só de leitura | `MutableList` (marco 04) |
| comando (`if` não devolve valor) | expressão | — |

Nenhuma dessas mudanças é nova para quem escreve Java moderno: `final` em tudo, `record`,
`List.copyOf`, `Optional` no retorno. A diferença é que, em Kotlin, o caminho mais curto é o seguro.
O código que você escreveria com disciplina em Java é o que sai sem esforço em Kotlin.

## Expressões, *smart cast* e o que some do código

Em Kotlin, `if`, `when` e `try` devolvem valor. A variável deixa de nascer vazia para ser preenchida
num dos ramos:

```kotlin
val tarifa = if (valor > limite) Money.of("0.50") else Money.of("0.00")

val codigo = when (estado) {
    is Estado.Rejeitado -> "RJCT"
    is Estado.Liquidado -> "ACSC"
    else -> "PDNG"
}

val e2e = try { cliente.consultar(id) } catch (e: TimeoutException) { null }
```

O ***smart cast*** elimina o *cast* depois de um teste de tipo. Depois de `is Estado.Rejeitado`, o
compilador já trata `estado` como `Rejeitado`, e `estado.motivo` compila. É o *pattern matching* do
`instanceof` do Java 16 (`java-e-jvm/01`), aplicado a qualquer `val` local e a qualquer condição que o
compilador consiga provar. Ele não vale para uma propriedade `var` de outro objeto, porque outra
thread pode trocá-la entre o teste e o uso.

*String templates* (`"pagamento $id em $estado"`), argumentos com nome e valores padrão completam o que
mais some do código de todo dia.

## Classes finais e o plugin `kotlin-spring`

Em Kotlin, toda classe e todo método são `final`, a não ser que você escreva `open`. É a regra 19 do
*Effective Java* ("projete para herança ou proíba"), aplicada pelo compilador.

O problema aparece no Spring. `@Transactional`, `@Cacheable` e `@Async` funcionam por **proxy**, e o
proxy de classe é uma subclasse gerada em tempo de execução (`spring-boot/04`). Testado no Spring
Framework 7.0.10, com um gerenciador de transação de teste:

| A classe com `@Transactional` | O que acontece |
| --- | --- |
| `final` (o padrão do Kotlin) | o contexto não sobe: `BeanCreationException`, `Cannot subclass final class` |
| `open`, com o método `final` | o contexto sobe, e o método roda **sem transação**; só um `WARNING` no log |
| `open`, com o método `open` | transação ativa |

O primeiro caso é barulhento e se resolve no primeiro *startup*. O segundo é o perigoso: alguém
corrige o erro escrevendo `open class`, esquece o `open` no método, e o `@Transactional` vira
decoração.

A solução é o plugin de compilador **`kotlin-spring`**, uma configuração pronta do plugin `all-open`.
Ele abre a classe **e os membros dela** quando a classe tem `@Component`, `@Transactional`, `@Async`,
`@Cacheable` ou `@SpringBootTest`, ou uma anotação meta-anotada com elas (`@Service`, `@Repository`,
`@Configuration`, `@RestController`). O que ele **não** faz: abrir uma classe sem nenhuma dessas
anotações. A classe utilitária que o Spring não gerencia continua `final`, e isso é o que se quer.

## Interop em uma página

Kotlin chama Java sem nenhuma cerimônia. Java chama Kotlin quase sem cerimônia, e quase todo o
"quase" se resolve com quatro anotações:

| Em Kotlin | O que o Java vê sem a anotação | Com a anotação |
| --- | --- | --- |
| função no `companion object` | `Money.Companion.of("1.00")` | `@JvmStatic`: `Money.of("1.00")` |
| parâmetro com valor padrão | só a assinatura completa | `@JvmOverloads`: uma sobrecarga por padrão |
| função que lança exceção | nada: Kotlin não tem exceção verificada | `@Throws(IOException::class)` |
| propriedade `val nome` | `getNome()` | `@JvmField`: o campo, sem *getter* |

Funções de nível de arquivo (`fun aplicar(...)` fora de classe) viram métodos estáticos de uma classe
com o nome do arquivo e o sufixo `Kt` (`PagamentoKt.aplicar`). O marco 09 volta ao assunto com um
teste em Java chamando a API do `pix-status`.

## Por que Kotlin?

É uma pergunta comum em vaga "Java/Kotlin", e a resposta fraca é de gosto. A forte separa o que a
linguagem resolve do que ela não muda:

- **Resolve:** NPE como classe de bug (o tipo diz quem pode ser nulo, marco 02); modelagem fechada com
  pouco código (marco 03); concorrência estruturada com cancelamento de verdade (marcos 05 e 06).
- **Não muda:** a JVM, o GC, o Spring, o *pool* de conexões. Um serviço lento em Java continua lento
  em Kotlin.
- **Custa:** tempo de compilação maior, um segundo conjunto de convenções no time, e a fronteira com
  Java, onde a nulidade volta a ser problema seu.

Times escolhem Kotlin quando a base nova é grande o bastante para a segurança de tipos pagar a curva, e
quando coroutines encaixam no problema (muito I/O concorrente, como o `pix-status`). Times ficam em
Java quando a base é Java, o time é Java, e o Java 25 já dá *records*, *sealed* e *virtual threads*.
As duas respostas são defensáveis; não ter critério é que não é.

## Exemplo numa fintech

Um time migrou para Kotlin o serviço de notificação de um banco, sem o plugin `kotlin-spring`. O
primeiro *startup* falhou com `Cannot subclass final class`, e a correção foi escrever `open class` no
serviço. O método com `@Transactional`, que gravava a notificação e a auditoria juntas, continuou
`final`. Em produção, uma falha entre as duas gravações deixou notificações sem auditoria, porque não
havia transação nenhuma para desfazer a primeira. O log tinha um `WARNING` desde o primeiro dia. O
teste de unidade passava, porque não subia o contexto. Um teste de reflexão de duas linhas, que exige
classe e métodos abertos nos *beans* anotados, teria barrado o *build*.

## Hands-on

**Tutorial.** Crie o `pix-status` com Gradle Kotlin DSL, Kotlin 2.3.21 (a versão que o Spring Boot
4.1.2 gerencia), toolchain JDK 25, JUnit 6 e AssertJ, com os plugins `kotlin("jvm")` e
`kotlin("plugin.spring")`. Registre numa ADR a escolha da biblioteca de asserção (AssertJ, que o time
já conhece do Java, ou Kotest, mais idiomática), com o critério. Porte o `Money` do `pix-core`
(`java-e-jvm/01`):

```kotlin
class Money private constructor(val valor: BigDecimal) : Comparable<Money> {
    val centavos: Long get() = valor.unscaledValue().longValueExact()

    override fun compareTo(other: Money): Int = valor.compareTo(other.valor)
    override fun equals(other: Any?): Boolean = other is Money && valor == other.valor
    override fun hashCode(): Int = valor.hashCode()

    companion object {
        private const val ESCALA = 2
        fun of(reais: String) = Money(BigDecimal(reais).setScale(ESCALA, RoundingMode.UNNECESSARY))
        fun ofCentavos(c: Long) = Money(BigDecimal.valueOf(c, ESCALA))
    }
}
```

O construtor é privado e as fábricas fixam a escala, como o construtor compacto do record em Java.

**Desafio.** Implemente `fun ratear(partes: Int): List<Money>`, com os centavos que sobram nas
primeiras parcelas, trabalhando em `Long`.

**Invariantes testáveis**

1. **Paridade com o Java.** A mesma tabela do `pix-core` passa: `100.00` em 3, `0.01` em 2, `10.00`
   em 7, `999999.99` em 13 e `0.00` em 4. A soma é o total, centavo a centavo, e duas parcelas diferem
   em no máximo um centavo. `100.00` em 3 dá exatamente `33.34, 33.33, 33.33`.
2. **O plugin, provado por reflexão.** Uma classe sem anotação do Spring é `final`, e o método dela
   também (`Modifier.isFinal`). Uma classe anotada com `@Service` não é `final`, nem os métodos dela.

**Complemento.** Remova o plugin `kotlin-spring` e rode o teste 2: ele falha. Depois reproduza a
tabela do `@Transactional` com um `AnnotationConfigApplicationContext`, `@EnableTransactionManagement`
e um `AbstractPlatformTransactionManager` de teste, conferindo
`TransactionSynchronizationManager.isActualTransactionActive()` dentro do método. Depois escreva o mesmo
`Money` como `@JvmInline value class Money(val centavos: Long)` e anote o que se perde (a escala em
`BigDecimal`) e o que se ganha (nenhum objeto em volta do `Long`). O marco 03 volta a esse custo.

**Checagem**

1. Quais são os três *defaults* que Kotlin inverte em relação ao Java, e que consequência cada um tem?
2. O que acontece com o `@Transactional` numa classe `final` e numa classe `open` com o método
   `final`, e o que exatamente o plugin `kotlin-spring` abre?
3. Como o Java chama uma função do `companion object` de uma classe Kotlin, com e sem `@JvmStatic`?
4. Dê um critério para escolher Kotlin e um para ficar em Java, num serviço novo.

## Principais aprendizados

- Kotlin inverte os *defaults*: `val`, não-nulo, `final`, coleção só de leitura, `if` e `when` como
  expressão.
- *Smart cast* elimina o *cast* depois do teste de tipo, em `val` e em tudo o que o compilador prova.
- Classe `final` não aceita proxy de classe e derruba o *startup*; método `final` numa classe aberta
  perde o aspecto em silêncio. O `kotlin-spring` abre as classes anotadas do Spring e os membros
  delas, e só elas. Prove com um teste.
- Para o Java chamar Kotlin: `@JvmStatic`, `@JvmOverloads`, `@Throws` e `@JvmField`.
- "Por que Kotlin?" se responde com o que a linguagem resolve, o que ela não muda e o que ela custa.
