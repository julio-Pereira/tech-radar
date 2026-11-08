---
id: objetos-igualdade-e-imutabilidade
title: "Objetos, igualdade e imutabilidade"
summary: "O contrato de equals e hashCode é a pergunta de entrevista mais antiga porque o bug é silencioso: o objeto que some do HashSet, o BigDecimal que não é igual a si mesmo, o Integer que só é == até 127 e o record que vaza a própria lista."
estimatedMinutes: 55
reviewedAt: 2026-11-08
reviewEvery: 12m
competencies: [arquitetura, confiabilidade]
references:
  - title: "Object.equals e Object.hashCode (Java SE 25 API)"
    url: https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/Object.html
  - title: "JEP 395: Records"
    url: https://openjdk.org/jeps/395
  - title: "JEP 513: Flexible Constructor Bodies"
    url: https://openjdk.org/jeps/513
  - title: "Value-based Classes (Java SE 25 API)"
    url: https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/doc-files/ValueBased.html
  - title: "EqualsVerifier"
    url: https://jqno.nl/equalsverifier/
---

## O contrato

`equals` e `hashCode` são um par, e a documentação de `Object` define o contrato dos dois. O `equals`
precisa ser:

- **reflexivo:** `x.equals(x)`;
- **simétrico:** se `x.equals(y)`, então `y.equals(x)`;
- **transitivo:** se `x` é igual a `y` e `y` é igual a `z`, então `x` é igual a `z`;
- **consistente:** a resposta não muda enquanto os objetos não mudam;
- e `x.equals(null)` é sempre `false`.

E a regra que liga os dois: **objetos iguais têm o mesmo `hashCode`**. O contrário não vale: hashes
iguais não implicam objetos iguais (é a colisão, assunto do marco 03).

A pergunta é velha porque o bug não lança exceção. Um `equals` sem `hashCode` compila, passa no teste
que compara dois objetos, e quebra o `HashMap`: a chave igual cai noutro *bucket*, e o `get` devolve
`null`. O sistema não cai. Ele só processa a mesma coisa duas vezes. O próprio `javac` avisa, se você
pedir: com `-Xlint:all`, uma classe assim gera
`[overrides] Class ChaveSemHash overrides equals, but neither it nor any superclass overrides
hashCode method`. Com `-Werror` no build, o aviso vira erro.

## Onde o contrato quebra sem ninguém ver

**Campo mutável no hash.** O `HashSet` guarda o objeto no *bucket* do hash calculado na hora do
`add`. Se um campo que entra no hash muda depois, o objeto continua lá dentro, mas no *bucket*
errado. `contains` com o próprio objeto devolve `false`, `contains` com uma cópia do valor antigo
também, e `size()` continua 1: o objeto "sumiu" sem sair.

**Herança e simetria.** Um `Ponto` com `equals` por `instanceof Ponto`, e um `PontoColorido` que
acrescenta a cor e compara com `instanceof PontoColorido`. `ponto.equals(colorido)` dá `true`, e
`colorido.equals(ponto)` dá `false`. Não há como estender uma classe instanciável, acrescentar estado
à igualdade e manter o contrato. A saída é composição (o `PontoColorido` tem um `Ponto`) ou uma
classe `final`.

**`==` e o cache de `Integer`.** `==` compara referências. Com *autoboxing*, `Integer a = 127, b = 127`
dá `a == b` verdadeiro, porque `Integer.valueOf` devolve objetos de um cache de −128 a 127. Com 128, são
dois objetos, e `==` dá falso. O teste com valores pequenos passa, e a produção com valores grandes
falha. O limite superior do cache pode ser aumentado com `-XX:AutoBoxCacheMax`, o que só torna o bug
mais raro. Compare `Integer` com `equals`, ou desembrulhe para `int`.

**`BigDecimal.equals` olha a escala.** `new BigDecimal("2.0").equals(new BigDecimal("2.00"))` é
`false`, embora `compareTo` dê zero. Num `HashSet`, os dois são elementos distintos; num `TreeSet`,
que usa `compareTo`, são um só. A documentação de `Comparable` recomenda que `compareTo` seja
consistente com `equals`, e o `BigDecimal` é a exceção famosa. No `pix-core`, o `Money` resolve na
origem: fixa a escala em 2 no construtor, então todo `Money` igual em valor é igual em `equals`.

## Records: igualdade por componente, e o que ainda é com você

Um **record** declara o estado e ganha, gerados pelo compilador, o construtor canônico, os acessores,
`equals`, `hashCode` e `toString`, todos por componente. É a forma natural de um *value object* (o
DDD tático de `arquitetura-de-software/03`). Duas coisas continuam sendo responsabilidade de quem
escreve:

- **O invariante.** O **construtor compacto** (`public PixKey { ... }`, sem lista de parâmetros) roda
  antes da atribuição dos campos e é o lugar da validação. Uma `PixKey` inválida não nasce.
- **A imutabilidade dos componentes.** O record é raso: os campos são `final`, mas um componente
  `List` ou `int[]` continua mutável por quem tem a referência. E o `equals` gerado usa o `equals` de
  cada componente: para um array, isso é identidade. Dois records com arrays de mesmo conteúdo não
  são iguais, e `lote.valores()[0] = 99` altera o record "imutável". A correção é a **cópia
  defensiva**: `parcelas = List.copyOf(parcelas)` no construtor compacto, e nunca array como
  componente.

Fora dos records, o Java 25 trouxe os **flexible constructor bodies** (JEP 513): o construtor de uma
classe pode validar antes de chamar `super(...)`. Uma `ContaPix extends Conta` recusa um id vazio sem
que a `Conta` chegue a ser construída.

## Imutabilidade real e aparente

| Construção | Pode ser alterada por quem a recebe? | Muda se a origem mudar? |
| --- | --- | --- |
| `Collections.unmodifiableList(base)` | não (`UnsupportedOperationException`) | **sim**: é uma visão sobre `base` |
| `List.copyOf(base)` | não; e recusa `null` | não: é uma cópia |
| `List.of(...)` | não; e recusa `null` | não |

`unmodifiableList` é imutabilidade **aparente**: protege contra quem recebe, não contra quem guardou
a lista original. Para um record ou um tipo de domínio, a cópia (`List.copyOf`) é o que garante.

## Value-based classes: não sincronize nelas

`Integer`, `LocalDate`, `Optional` e outras são **value-based**: a identidade delas não é garantida,
porque instâncias iguais podem ser a mesma ou não (o cache de `Integer` é um exemplo). Sincronizar
num `Integer` é usar como trava um objeto que pode ser compartilhado com código que você não conhece.
O `javac` 25 avisa por padrão, sem flag (`[identity] attempt to synchronize on an instance of a value-based
class`). Em tempo de execução, `-XX:+UnlockDiagnosticVMOptions -XX:DiagnoseSyncOnValueBasedClasses=2`
registra cada ocorrência, e `=1` derruba a JVM com erro fatal: útil num teste de CI.

## Exemplo numa fintech

O cache de idempotência do `pix-gateway` guarda o resultado de cada pagamento pela chave do cliente e
pela `Idempotency-Key`. A primeira versão da chave era uma classe com `setIdempotencyKey`, reusada
entre requisições por um objeto de contexto. Um filtro "normalizava" a chave depois de ela já estar
no mapa. Resultado: a segunda requisição com a mesma `Idempotency-Key` não achava a primeira, e o
mesmo Pix foi enviado duas vezes. Nenhum log de erro, só a conciliação do dia seguinte divergindo.

A correção é um record, `PaymentKey(String clienteId, String idempotencyKey)`, validado no construtor
e sem nenhuma operação que mude o estado.

## Hands-on

**Tutorial.** Reproduza o bug: uma classe `Chave` mutável com `equals` e `hashCode` pelo cliente, num
`HashSet`. Altere o campo depois do `add` e mostre, num teste, `contains` falso e `size()` igual a 1.
Depois troque a classe por um record.

**Desafio.** Escreva `PaymentKey` e `PixKey` como records. A `PixKey` tem o tipo (CPF, e-mail,
telefone, aleatória) e o valor, e valida no construtor compacto: CPF com os dois dígitos
verificadores, e-mail em minúsculas, telefone no formato `+55` com 11 dígitos, chave aleatória como
UUID versão 4 em minúsculas. Escreva também um `Lote(String id, List<Money> parcelas)`.

**Invariantes testáveis**

1. O contrato de `equals` e `hashCode` de `PaymentKey` e `Money` é verificado pelo EqualsVerifier.
   Como os construtores recusam `null`, declare isso com `suppress(Warning.NULL_FIELDS)`. Prove que a
   ferramenta pega o erro com uma *fixture* que tem `equals` e não tem `hashCode`: o teste exige a
   falha, com `hashCode` na mensagem.
2. Uma `PaymentKey` colocada num `HashMap` continua encontrável, pela mesma instância e por uma nova
   com os mesmos valores, depois de qualquer operação pública do tipo.
3. Uma `PixKey` inválida não pode ser construída. Uma tabela cobre os quatro tipos com casos válidos
   e inválidos: CPF com dígito errado, CPF com 11 dígitos iguais, e-mail sem domínio ou com
   maiúsculas, telefone sem `+55`, UUID em maiúsculas.
4. A lista de um `Lote` não muda quando a lista de origem muda, e `parcelas().add(...)` lança
   `UnsupportedOperationException`.

**Complemento.** Compile um `synchronized (Integer)` e leia o aviso. Rode com
`-XX:+UnlockDiagnosticVMOptions -XX:DiagnoseSyncOnValueBasedClasses=1` e `=2` (a flag é de
diagnóstico, e sem o desbloqueio a JVM nem sobe), e decida qual dos dois o CI do `pix-core` usa.

**Checagem**

1. Por que um `equals` sem `hashCode` passa no teste de igualdade e quebra o `HashMap`?
2. Por que `Integer` com `==` funciona com 127 e falha com 128?
3. O que o record gera, e quais duas responsabilidades continuam sendo suas?
4. Qual a diferença entre `Collections.unmodifiableList` e `List.copyOf` para um tipo de domínio?

## Principais aprendizados

- Objetos iguais têm o mesmo `hashCode`; o bug de quebrar isso é silencioso.
- Campo mutável no hash faz o objeto sumir do `HashSet` sem sair dele.
- Herança com estado novo quebra a simetria; prefira composição ou `final`.
- `==` em `Integer` só funciona dentro do cache; `BigDecimal.equals` olha a escala.
- Record dá igualdade por componente; o invariante (construtor compacto) e a cópia defensiva são seus.
- `unmodifiableList` é uma visão, `List.copyOf` é uma cópia.
- Não sincronize em *value-based classes*.
