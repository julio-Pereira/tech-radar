---
id: excecoes-e-recursos
title: "Exceções e recursos"
summary: "Exceção é para o excepcional, e todo recurso aberto tem um dono que o fecha. Checked × unchecked sem dogma, a taxonomia do domínio com código estável, try-with-resources e as exceções suprimidas, o finally que engole a exceção, o custo medido do stack trace e o que o @Transactional faz com uma checked."
estimatedMinutes: 45
reviewedAt: 2026-11-08
reviewEvery: 12m
competencies: [confiabilidade, arquitetura]
references:
  - title: "JLS 14.20.3: try-with-resources"
    url: https://docs.oracle.com/javase/specs/jls/se25/html/jls-14.html#jls-14.20.3
  - title: "Throwable (Java SE 25 API)"
    url: https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/Throwable.html
  - title: "RFC 9457: Problem Details for HTTP APIs"
    url: https://www.rfc-editor.org/rfc/rfc9457
  - title: "Spring Framework: Rolling back a declarative transaction"
    url: https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/rolling-back.html
---

## *Checked* × *unchecked*, sem dogma

Java é a única linguagem popular com exceções **checked**: as subclasses de `Exception` que não são
`RuntimeException` precisam ser capturadas ou declaradas no `throws`. A ideia era boa: o compilador
obriga quem chama a pensar na falha. Na prática, duas coisas a desgastaram:

- **Elas não atravessam lambdas.** A interface `Function` não declara exceção, e
  `stream().map(n -> ler(n))`, com `ler` declarando `IOException`, não compila (`unreported exception
  IOException; must be caught or declared to be thrown`). O código acaba embrulhando tudo em
  `RuntimeException`.
- **Elas vazam a camada.** Um `throws SQLException` na interface do repositório amarra o domínio ao
  JDBC.

O critério honesto: **checked** quando quem chama pode, de fato, fazer algo diferente com a falha, e
a falha é parte do contrato (um arquivo que pode não existir numa ferramenta de linha de comando).
**Unchecked** para erro de programação (argumento inválido, estado impossível) e para as falhas de
domínio que atravessam várias camadas até a borda. No `pix-core`, as exceções de domínio são
*unchecked*, e quem não pode lançar no caminho normal usa o `Result` do marco 04.

## Taxonomia: domínio e infraestrutura

Uma falha de **domínio** é uma regra de negócio dizendo não: saldo insuficiente, chave Pix inválida,
limite diário excedido, transição não permitida. Ela tem um **código estável** (`PIX-001`), que vira o
`type` do *Problem Details* (RFC 9457) na borda HTTP, e que um cliente pode tratar sem ler a
mensagem. O formato e o mapeamento de erro para status estão em `go-fintech/08`; em Spring, a
classe `ProblemDetail` faz o mesmo papel. Uma falha de **infraestrutura** (o banco caiu, o DICT não respondeu) não é do
domínio, e não deve aparecer na assinatura dele.

No `pix-core`, a raiz é uma classe selada, `ErroDeDominio extends RuntimeException`, com uma subclasse
por regra, cada uma anotada com `@Codigo("PIX-00N")`. Ser selada faz a lista de exceções de domínio
ser fechada e conhecida: `ErroDeDominio.class.getPermittedSubclasses()` a devolve, e um teste confere
que todas têm código e que nenhum se repete.

A tradução acontece na **fronteira**: o adaptador do banco captura `SQLException` e lança a exceção do
domínio que faz sentido, ou uma exceção de infraestrutura própria; o controlador traduz o código de
domínio para o status HTTP. Em Go, a mesma taxonomia é feita com erros como valor e `errors.Is`
(`go-fintech/05`).

## *try-with-resources* e as exceções suprimidas

Todo `AutoCloseable` aberto num `try (...)` é fechado no fim do bloco, **na ordem inversa da
abertura**, aconteça o que acontecer. E quando o corpo lança e o `close()` também lança, a exceção do
corpo é a que propaga, e as do `close()` ficam **suprimidas** dentro dela:

```java
try (var a = new Recurso("conexao"); var b = new Recurso("arquivo")) {
    throw new RuntimeException("erro no corpo");
}
// fecha arquivo, fecha conexao
// capturada: erro no corpo
// suprimida: falha ao fechar arquivo
// suprimida: falha ao fechar conexao
```

Antes do Java 7, com `try`/`finally` escritos à mão, a exceção do `close()` substituía a do corpo, e o
erro real se perdia. Hoje, `getSuppressed()` guarda as duas. Com `-Xlint:all`, um recurso aberto e
nunca usado no corpo gera o aviso `[try]`. Nomeie-o `_` (Java 22) quando ele existe só para ser
fechado.

## O `finally` que engole a exceção

```java
static int debitar() {
    try {
        throw new IllegalStateException("saldo insuficiente");
    } finally {
        return 0;
    }
}
```

`debitar()` devolve 0, e a exceção some: um `return` (ou um `throw`) no `finally` substitui o que
estava em curso. O `javac` avisa com `-Xlint:all` (`[finally] finally clause cannot complete
normally`). O contrário também engana: num `try { return x; } finally { x = 2; }`, o método devolve o
valor de `x` do momento do `return`, e a atribuição no `finally` não muda o resultado.

## Exceção como fluxo, medida

Lançar uma exceção custa principalmente **capturar a pilha**: `fillInStackTrace` percorre os frames
da thread. Medido com JMH no `pix-core` (2 *forks*, 10 medições, JDK 25), lançando a 0 e a 20 frames
de profundidade do `catch`:

| Implementação | 0 frames | 20 frames |
| --- | ---: | ---: |
| exceção com *stack trace* | ~1.165 ns | ~3.000 ns |
| exceção sem *stack trace* (`super(msg, null, false, false)`) | ~9 ns | ~700 ns |
| `Result.falha(...)` | ~3,5 ns | ~19 ns |

Sem a pilha, a exceção lançada e capturada no mesmo método compilado vira quase um desvio, porque o
JIT junta os dois. Com 20 frames no meio, desempilhar ainda custa. Para uma falha de negócio
frequente (um limite recusado a cada mil requisições), o `Result` é o desenho de menor custo e o mais
explícito. Desligar a pilha é uma otimização para exceções de fluxo bem conhecidas, e torna a
depuração mais difícil: não a use em erros inesperados.

## O que o `@Transactional` faz com uma *checked*

No Spring, uma transação declarativa faz *rollback* por padrão só para `RuntimeException` e `Error`.
Conferido no código-fonte do `spring-tx` 7.0.10, em `DefaultTransactionAttribute.rollbackOn`:
`return (ex instanceof RuntimeException || ex instanceof Error);`. Uma *checked* lançada de um método
`@Transactional` deixa a transação ser **confirmada**, com o que já foi gravado. É por isso que
exceções de domínio *unchecked* combinam com transações declarativas, e por isso que quem usa
*checked* precisa de `rollbackFor`. As transações no Spring estão em `spring-boot/05`.

## Exemplo numa fintech

Um adaptador de envio ao SPI abria um canal e um arquivo de *log* de auditoria num `try`/`finally`
escrito à mão. Numa queda de rede, a escrita falhou, e o `close()` do canal também lançou exceção. O
`finally` propagou a do `close()`, e o *log* do incidente mostrou "canal já fechado", escondendo a
causa real, um *timeout* do SPI. O *post-mortem* levou um dia. Com *try-with-resources*, a exceção do
*timeout* propagaria, com a do fechamento suprimida dentro dela.

## Hands-on

**Tutorial.** Reproduza o `finally` com `return` e leia o aviso `[finally]`. Depois, o
*try-with-resources* com dois recursos que falham ao fechar, imprimindo a ordem e as suprimidas.

**Desafio.** A taxonomia de exceções do `pix-core`. Uma `sealed abstract class ErroDeDominio extends
RuntimeException` com `SaldoInsuficiente`, `ChavePixInvalida`, `LimiteDiarioExcedido` e
`TransicaoNaoPermitida`, cada uma com `@Codigo`, e um método `codigo()` que lê a anotação. Com
`-Xlint:all -Werror`, toda exceção precisa de `serialVersionUID`, porque `Throwable` é `Serializable`;
declare-o com `@Serial`.

**Invariantes testáveis**

1. Toda exceção de domínio tem um código estável e único. O teste percorre
   `ErroDeDominio.class.getPermittedSubclasses()` e exige `@Codigo` em todas, com o formato
   `PIX-NNN` e sem repetição.
2. Um recurso que falha ao fechar não esconde a exceção original: o teste exige a exceção do corpo,
   com exatamente uma suprimida, que é a do `close()`.
3. Nenhuma exceção de infraestrutura vaza para a API de domínio. Uma regra do ArchUnit reprova métodos
   públicos dos pacotes de domínio que declarem `SQLException` ou `IOException`, e classes de domínio
   que dependam de `java.sql` ou `java.net`. Prove que ela funciona com uma *fixture*
   (`RepositorioQueVaza`, que declara `throws SQLException`), exigindo a falha, com o nome do método
   na mensagem.

**Complemento.** Escreva o benchmark JMH da tabela acima (exceção com pilha, sem pilha e `Result`, a
0 e a 20 frames). Explique por que a exceção sem pilha a 0 frames custa quase nada.

**Checagem**

1. Quando uma exceção *checked* é a escolha certa, e por que ela não atravessa uma lambda?
2. Num *try-with-resources* em que o corpo e o `close()` lançam, qual exceção propaga?
3. O que acontece com uma exceção quando o `finally` tem um `return`?
4. Por que uma *checked* lançada de um método `@Transactional` deixa a transação ser confirmada?

## Principais aprendizados

- *Checked* quando quem chama pode agir sobre a falha; *unchecked* para erro de programação e para o
  domínio.
- Falha de domínio tem código estável; infraestrutura não aparece na assinatura do domínio. Traduza
  na fronteira.
- *Try-with-resources* fecha na ordem inversa, e guarda as exceções do `close()` como suprimidas.
- `return` no `finally` engole a exceção; o `javac` avisa com `-Xlint`.
- O custo da exceção é a pilha; para falha frequente, `Result`.
- `@Transactional` faz *rollback* só em `RuntimeException` e `Error`, por padrão.
