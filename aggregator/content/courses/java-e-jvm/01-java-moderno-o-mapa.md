---
id: java-moderno-o-mapa
title: "Java moderno: o mapa"
summary: "Java de 2026 não é o Java da sua primeira entrevista: saber o que mudou do 8 ao 25, o que ainda é preview e por que isso importa em produção é parte da resposta. A cadência de releases, a tabela recurso → versão e o primeiro tipo do pix-core: dinheiro sem double."
estimatedMinutes: 40
reviewedAt: 2026-11-08
reviewEvery: 6m
competencies: [arquitetura]
references:
  - title: "JEP 0: JEP Index (OpenJDK)"
    url: https://openjdk.org/jeps/0
  - title: "JEP 12: Preview Features"
    url: https://openjdk.org/jeps/12
  - title: "JDK 25 (OpenJDK)"
    url: https://openjdk.org/projects/jdk/25/
  - title: "BigDecimal (Java SE 25 API)"
    url: https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/math/BigDecimal.html
  - title: "ArchUnit User Guide"
    url: https://www.archunit.org/userguide/html/000_Index.html
---

## O Java da sua primeira entrevista ficou para trás

Desde o Java 9, uma versão nova sai a cada seis meses, em março e em setembro. Algumas delas são
**LTS** (*long-term support*), que os fornecedores de JDK mantêm com correções por anos: 17, 21 e 25.
As versões entre elas recebem correção só até a próxima sair. Em novembro de 2026, a LTS vigente é o
**Java 25** (setembro de 2025), a release mais nova é o **27** (setembro de 2026), e a próxima LTS
está prevista para setembro de 2027. Esta trilha usa o 25 como baseline: é o que um time de produção
escolhe hoje.

Na entrevista, "qual Java você usa?" raramente é sobre o número. É sobre saber o que essa escolha
traz. Quem para no Java 8 escreve getters e `equals` à mão, modela estado com `enum` e `if`, e
responde concorrência com pools de threads do sistema. O Java 25 tem outras ferramentas para os
mesmos problemas, e a banca de um sênior espera que você as conheça.

## Final, preview e incubator

Um recurso não chega pronto numa versão só. O caminho tem três estados, e confundir os dois primeiros
é um erro de produção, não de vocabulário:

- **Final:** faz parte da especificação. Compila sem flag nenhuma e vale para sempre.
- **Preview:** a linguagem ou a API está completa, mas pode mudar ou sair. Só compila com
  `--enable-preview` (e `--release` com a versão exata), e só roda com a mesma flag. O detalhe que
  importa: a classe compilada com *preview* é marcada com a versão. Uma classe do Java 25 com
  *preview* não roda no 27: a JVM recusa com
  `compiled with preview features that are unsupported` (`class file version 69.65535`). Usar
  *preview* em produção prende o serviço a uma versão exata do JDK.
- **Incubator:** uma API experimental em módulo próprio (`jdk.incubator.*`), carregada com
  `--add-modules`. A Vector API está assim há anos: sobe com `WARNING: Using incubator modules`.

A regra desta trilha: recurso em *preview* aparece só como nota, nunca como padrão. Padrões de tipo
primitivo (`if (i instanceof byte b)`) e `StructuredTaskScope` continuam em *preview* no Java 25 e
também no 27.

## O que mudou do 8 ao 25, e muda como se escreve código

Cada linha abaixo foi conferida compilando um exemplo com `javac --release N` (compila) e
`--release N-1` (falha). O número do JEP é o documento que propôs o recurso.

| Recurso | Final no Java | JEP | Onde a trilha usa |
| --- | ---: | --- | --- |
| `var` em variável local | 10 | 286 | em todo lugar, com moderação |
| `switch` como expressão (`->`) | 14 | 361 | marco 05 |
| *Text blocks* (`"""`) | 15 | 378 | fixtures de teste |
| Records | 16 | 395 | marcos 02 e 05 |
| *Pattern matching* para `instanceof` | 16 | 394 | marco 05 |
| Classes e interfaces seladas | 17 | 409 | marco 05 |
| *Pattern matching* para `switch`, *record patterns* | 21 | 441, 440 | marco 05 |
| Coleções sequenciadas (`reversed()`, `getFirst()`) | 21 | 431 | marco 03 |
| *Virtual threads* | 21 | 444 | `concorrencia-e-recursos/06` |
| Variáveis e padrões sem nome (`_`) | 22 | 456 | marco 05 |
| *Stream Gatherers* | 24 | 485 | marco 06 |
| *Flexible constructor bodies* | 25 | 513 | marco 02 |
| *Module import declarations* | 25 | 511 | scripts e testes |
| `ScopedValue` | 25 | 506 | `spring-boot/07` |

Dois recursos de 2025 mudam o dia a dia. Com **flexible constructor bodies**, o construtor pode
validar o argumento antes de chamar `super(...)` ou `this(...)`, em vez de deixar a superclasse
construir um objeto que vai ser jogado fora. E o **arquivo-fonte compacto** com `main` de instância
(JEP 512) faz `void main() { IO.println("oi"); }` ser um programa completo, rodado com
`java Oi.java`: bom para scripts de suporte, não muda o código de produção.

## A versão é parte do build

Quem garante a versão é o build, não a máquina de quem compila. No Maven, a propriedade
`maven.compiler.release` passa `--release 25` ao `javac`. A flag não muda só o formato do bytecode
gerado: ela também confere a **API**. Com `--release 15`, `Stream.toList()` (do 16) não compila,
mesmo que o JDK instalado seja o 25. Isso é diferente do antigo par `-source`/`-target`, que deixava
passar uma chamada a uma API que não existe na versão de destino.

Para não depender do JDK instalado, use *toolchains*: o `maven-toolchains-plugin` ou o
`java { toolchain { languageVersion = JavaLanguageVersion.of(25) } }` do Gradle escolhem o JDK do
projeto, e o CI usa o mesmo. Escolher Maven ou Gradle é uma decisão de time, registrada numa ADR:
o que importa é que a versão esteja declarada num lugar só.

## O pix-core e o mapa da trilha

O projeto guia é o `pix-core`: o **domínio do `pix-gateway` sem framework**. Tipos de valor, regras
de validação, o resultado de autorização como tipo fechado, a máquina de estados do pagamento, o
cálculo de tarifa e o cache de consulta DICT. Sem HTTP e sem banco: ele existe para ser correto,
rápido e testável. A trilha `spring-boot` o consome como dependência. A especificação completa está
no `PROJETO.md` desta trilha.

| Bloco | Marcos | O que entra no `pix-core` |
| --- | --- | --- |
| A — A linguagem a fundo | 01–07 | `Money`, chaves como records, cache LRU, `Result`, estados selados, fechamento diário, taxonomia de exceções |
| B — A JVM | 08–10 | dimensionamento de memória, *startup* medido, três incidentes diagnosticados |
| C — Integrar | 11 | rodadas cronometradas e o capstone |

## Exemplo numa fintech

O primeiro tipo do `pix-core` é dinheiro, e o primeiro erro é o de sempre: `double`. Em ponto
flutuante binário, `0.1` não existe, e o erro aparece no construtor que parece mais inocente.
`new BigDecimal(0.1)` vale `0.1000000000000000055511151231257827021181583404541015625`, porque
converte o `double` exatamente como ele está guardado. `BigDecimal.valueOf(0.1)` passa pelo
`Double.toString` e vale `0.1`, e `new BigDecimal("0.10")` vale `0.10`, com escala 2.

E ainda há o rateio. Uma tarifa de R$ 100,00 dividida entre 3 parceiros não é `33,33` três vezes:
sobra um centavo, que precisa ir para alguma parcela, sempre a mesma, para que reprocessar o
fechamento dê o mesmo resultado. A mesma propriedade aparece no `Allocate` de `go-fintech/01`, e o
arredondamento em geral está em `ledger-e-contabilidade/05`.

## Hands-on

**Tutorial.** Crie o `pix-core` com Maven (ou Gradle, com a ADR da escolha), `maven.compiler.release`
em 25, JUnit 6, AssertJ, ArchUnit e JMH (este último com o processador de anotações no
`maven-compiler-plugin`). Escreva o `Money` como um record sobre `BigDecimal` com escala fixa:

```java
public record Money(BigDecimal valor) implements Comparable<Money> {
    private static final int ESCALA = 2;

    public Money {
        Objects.requireNonNull(valor, "valor");
        valor = valor.setScale(ESCALA, RoundingMode.UNNECESSARY); // mais de 2 casas: ArithmeticException
    }

    public static Money of(String reais) { return new Money(new BigDecimal(reais)); }
    public static Money ofCentavos(long c) { return new Money(BigDecimal.valueOf(c, ESCALA)); }
    public long centavos() { return valor.unscaledValue().longValueExact(); }
    @Override public int compareTo(Money o) { return valor.compareTo(o.valor); }
}
```

O `RoundingMode.UNNECESSARY` é a escolha deliberada: um valor com três casas não é arredondado em
silêncio, ele falha. Fixar a escala no construtor compacto também resolve uma armadilha do marco 02:
como todo `Money` tem escala 2, `Money.of("0.1")` e `Money.of("0.10")` são iguais.

**Desafio.** Implemente `List<Money> ratear(int partes)`: divide o valor em `partes` parcelas que
somam exatamente o total, com os centavos que sobram nas primeiras parcelas. Trabalhe em centavos
(`long`), não em `BigDecimal.divide`.

**Invariantes testáveis**

1. A soma das parcelas é igual ao total, centavo a centavo, e duas parcelas diferem em no máximo um
   centavo (teste parametrizado com `100.00` em 3, `0.01` em 2, `10.00` em 7, `999999.99` em 13 e
   `0.00` em 4). `100.00` em 3 dá exatamente `33.34, 33.33, 33.33`.
2. Um teste documenta os três construtores: `new BigDecimal("0.10")` é `0.10`;
   `BigDecimal.valueOf(0.1)` é `0.1`; `new BigDecimal(0.1)` é
   `0.1000000000000000055511151231257827021181583404541015625`. E `0.10` e `0.1` não são `equals`
   (escalas diferentes), embora `compareTo` dê zero.
3. O build falha se uma classe do pacote de domínio tiver campo, parâmetro ou retorno `double`,
   `float`, `Double` ou `Float`. A regra é uma `ArchCondition` do ArchUnit. Prove que ela funciona
   com uma *fixture* de teste (`TarifaComDouble`) e um teste que exige a falha, com o nome do campo e
   o do método na mensagem.

**Complemento.** Compile um arquivo com padrões primitivos usando `--enable-preview --release 25` e
tente rodá-lo num JDK 27. Leia o erro, e escreva na ADR de versão por que o `pix-core` não liga
`--enable-preview`.

**Checagem**

1. Qual a diferença entre um recurso final, um em *preview* e um em *incubator*, e por que o *preview*
   prende o serviço a uma versão exata?
2. O que `--release 25` confere que `-source 25 -target 25` não conferia?
3. Por que `new BigDecimal(0.1)` não vale `0.1`, e qual construtor você usa para um valor que chega
   como texto de uma API?
4. No rateio de R$ 100,00 em 3, para onde vai o centavo que sobra, e por que precisa ser sempre a
   mesma parcela?

## Principais aprendizados

- Uma versão a cada seis meses; LTS em 17, 21 e 25. O baseline de produção hoje é o 25.
- *Preview* exige `--enable-preview` para compilar e rodar, e a classe só roda na mesma versão do JDK.
  Não use em produção.
- `--release` fixa o bytecode e a API; *toolchains* fixam o JDK do build.
- Dinheiro é `BigDecimal` com escala fixa, construído a partir de texto ou de centavos, nunca de
  `double`; uma regra de arquitetura garante isso no build.
- Rateio se faz em centavos, com o resto distribuído de forma determinística.
