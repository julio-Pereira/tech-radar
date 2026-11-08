---
id: tipos-algebricos
title: "Tipos algébricos: records, sealed e pattern matching"
summary: "Com sealed, records e switch exaustivo, estado inválido deixa de compilar. Soma e produto, padrões com guarda e record patterns aninhados, o MatchException de quem não recompilou, e a máquina de estados do pagamento Pix sem nenhum default."
estimatedMinutes: 55
reviewedAt: 2026-11-08
reviewEvery: 12m
competencies: [arquitetura]
references:
  - title: "JEP 409: Sealed Classes"
    url: https://openjdk.org/jeps/409
  - title: "JEP 441: Pattern Matching for switch"
    url: https://openjdk.org/jeps/441
  - title: "JEP 440: Record Patterns"
    url: https://openjdk.org/jeps/440
  - title: "JEP 456: Unnamed Variables & Patterns"
    url: https://openjdk.org/jeps/456
  - title: "MatchException (Java SE 25 API)"
    url: https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/MatchException.html
---

## Produto e soma

Um tipo de dado pode ser combinado de duas formas. O **produto** junta campos: um `Pix` tem um valor
**e** uma chave. O **record** é o produto do Java, com igualdade por componente (marco 02). A
**soma** escolhe uma alternativa: o resultado da iniciação é `Aceito` **ou** `Rejeitado` **ou**
`PendenteAnalise`. A soma é o que faltava ao Java antes do 17, e o que se fazia no lugar era um
`enum` de status com campos que só valem para alguns status, ou uma hierarquia aberta que qualquer um
estende.

A **interface selada** (Java 17) fecha a soma: `sealed interface Resultado permits Aceito, Rejeitado,
PendenteAnalise`. Só os tipos listados podem implementá-la, e cada um é `final`, `sealed` ou
`non-sealed`; records são implicitamente `final`. Se os subtipos estão no mesmo arquivo, o `permits`
pode ser omitido, e o compilador os infere.

## O `switch` sobre a soma

Com o *pattern matching* para `switch` (Java 21), cada `case` testa um tipo e já declara a variável:

```java
String status(Resultado r) {
    return switch (r) {
        case Aceito a -> "ACSC " + a.e2eId();
        case Rejeitado x -> "RJCT " + x.motivo();
        case PendenteAnalise p -> "PDNG até " + p.prazo();
    };
}
```

Sem `default`, porque o compilador sabe que esses três são todos os casos. Essa é a **exaustividade**:
um `switch` expressão sobre um tipo selado precisa cobrir todos os subtipos, e faltando um, não
compila (`the switch expression does not cover all possible input values`). É aqui que "estado
inválido deixa de compilar" vira verdade: quem acrescentar um quarto resultado é obrigado pelo
compilador a decidir o que cada `switch` faz com ele.

Mais três ferramentas completam o desenho:

- **Guarda (`when`):** `case Pix p when p.valor().compareTo(LIMITE) > 0 -> ...` refina o caso. Os
  casos são testados em ordem, e o compilador recusa um caso que nunca seria alcançado (`this case
  label is dominated by a preceding case label`).
- **Record patterns** (Java 21): o padrão desmonta o record, inclusive aninhado.
  `case Pix(Valor(var v), var chave) when ...` extrai o valor de dentro do valor.
- **Padrões sem nome** (Java 22): `case Liquidar _, Estornar _ -> ...` agrupa casos cujo conteúdo
  não importa, sem inventar nomes de variável.

Padrões de tipo primitivo (`case int i when ...`, `instanceof byte b`) continuam em *preview* no Java
25 e também no 27: aqui eles não entram.

## O `default` que esconde, e o `MatchException`

Um `default` num `switch` sobre tipo selado compila, e desliga a proteção: o quarto resultado cai no
`default` em silêncio, sem ninguém decidir nada. Por isso a regra do `pix-core` é **nenhum `default`
em `switch` sobre tipo selado** no código de produção. Os estados finais se escrevem explicitamente
(`case Rejeitado _, Estornado _ -> ...`).

E se o código que tem o `switch` não for recompilado? Num teste com compilação separada, o `switch`
foi compilado com dois resultados; depois a hierarquia ganhou `PendenteAnalise` e foi recompilada
sozinha. O código antigo, recebendo o caso novo, lançou **`java.lang.MatchException`**. O compilador
insere esse caso implícito justamente porque a exaustividade é conferida na compilação. Em produção, isso
aparece quando uma biblioteca de domínio muda de versão e o serviço que a usa não é recompilado.

## Sealed, enum ou hierarquia aberta

| Desenho | Quando |
| --- | --- |
| `enum` | as alternativas não carregam dados próprios (canal: PIX, TED) |
| `sealed` + records | cada alternativa carrega dados diferentes (`Rejeitado(motivo)`, `PendenteAnalise(prazo)`) |
| interface aberta | quem estende é outro módulo, e você não quer saber quantos são (um *plugin*) |

O `switch` sobre `enum` também é exaustivo. O mesmo desenho existe em Go como interface com método
não exportado e um linter de exaustividade (`go-fintech/04`), e em Kotlin como `sealed class` com
`when` (`kotlin-backend/03`). Os tipos de valor que entram nas alternativas são os *value objects* do
DDD tático (`arquitetura-de-software/03`).

## Exemplo numa fintech

A máquina de estados do pagamento Pix tem cinco estados (`Criado`, `Autorizado`, `Liquidado`,
`Rejeitado`, `Estornado`) e quatro eventos (`Autorizar`, `Liquidar`, `Rejeitar`, `Estornar`). São 20
pares, dos quais 5 são transições válidas. Uma versão com `enum` de estado e `if` espalhados aceitou
um estorno de um pagamento só autorizado, porque o `if` que conferia "liquidado" estava num serviço e
não no outro. Com os dois tipos selados e um `switch` aninhado sem `default`, cada par está escrito
num lugar só, e um evento novo (um `Cancelar`) não compila até alguém decidir o que ele faz em cada
estado.

## Hands-on

**Tutorial.** Reproduza o `MatchException`: compile um `switch` sobre um tipo selado com dois casos,
acrescente um terceiro subtipo e recompile só a hierarquia. Rode, e depois tente recompilar o
`switch`.

**Desafio.** A máquina de estados do pagamento. `Estado` e `Evento` como *sealed interfaces* com
records; `Maquina.aplicar(Estado, Evento)` devolvendo o `Result<Estado, TransicaoInvalida>` do marco
04, com um `switch` sobre o estado e, dentro de cada caso, um `switch` sobre o evento.

**Invariantes testáveis**

1. Um teste de tabela percorre os 20 pares estado × evento. Os 5 válidos produzem o estado esperado
   (escrito no teste, à parte da implementação), e os 15 outros produzem `TransicaoInvalida`.
2. Acrescentar um evento à *sealed interface* quebra a compilação. O teste lê os fontes reais,
   acrescenta `record Cancelar()` ao `Evento`, compila em memória com `javax.tools.JavaCompiler` e
   exige o erro `the switch expression does not cover all possible input values`.
3. Nenhum `switch` sobre tipo selado em `src/main/java` tem `default`. A regra é um teste que analisa
   os fontes com a Compiler Tree API (`JavacTask`, `Trees`). Para cada `switch`, ele pega o tipo do
   seletor e procura um rótulo `default` quando o tipo é `sealed`. Prove que ela pega o problema de
   duas formas: com um fonte de *fixture*, ela acusa o `switch` selado com `default` e deixa passar o
   de `String`; e com um `default` posto de propósito na `Maquina`, ela aponta o arquivo e a linha.

**Complemento.** Reescreva a mesma máquina com `enum Estado` e um `EnumMap` de transições. Compare o
que acontece, nos dois desenhos, quando o `Liquidado` passa a carregar a data da liquidação.

**Checagem**

1. Qual a diferença entre tipo produto e tipo soma, e qual construção do Java é cada um?
2. Por que um `default` num `switch` sobre tipo selado desliga a proteção da exaustividade?
3. Quando aparece um `MatchException` em produção?
4. Quando você escolhe `enum` em vez de `sealed` com records?

## Principais aprendizados

- Record é produto; *sealed interface* é soma fechada.
- `switch` sobre tipo selado é exaustivo: faltar um caso é erro de compilação.
- Guarda com `when`, *record patterns* aninhados e `_` para o que não importa.
- `default` sobre tipo selado esconde o caso novo; o `pix-core` o proíbe com um teste sobre a árvore
  de sintaxe.
- Código não recompilado recebe o caso novo como `MatchException`.
- Padrões primitivos continuam em *preview*: fora do código de produção.
