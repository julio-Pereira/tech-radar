---
id: generics-e-erasure
title: "Generics e erasure"
summary: "Generics em Java são verificação de compilação; em tempo de execução, o tipo sumiu. O que a erasure proíbe, PECS para escrever APIs que aceitam o que devem, por que List<Integer> não é List<Number> mas Integer[] é Number[], e o @SafeVarargs que o compilador ainda acusa."
estimatedMinutes: 50
reviewedAt: 2026-11-08
reviewEvery: 12m
competencies: [arquitetura]
references:
  - title: "The Java Tutorials: Generics (Type Erasure)"
    url: https://docs.oracle.com/javase/tutorial/java/generics/erasure.html
  - title: "JLS 4.6: Type Erasure"
    url: https://docs.oracle.com/javase/specs/jls/se25/html/jls-4.html#jls-4.6
  - title: "Collections.copy (Java SE 25 API)"
    url: https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/Collections.html#copy(java.util.List,java.util.List)
  - title: "javax.tools.JavaCompiler (Java SE 25 API)"
    url: https://docs.oracle.com/en/java/javase/25/docs/api/java.compiler/javax/tools/JavaCompiler.html
---

## O tipo existe só para o compilador

Generics chegaram no Java 5 com uma restrição: o bytecode novo tinha que conviver com as bibliotecas
antigas. A solução foi a **erasure**. O compilador confere os argumentos de tipo e depois os apaga:
`List<String>` e `List<Integer>` viram a mesma `List` no bytecode, com *casts* inseridos onde o
código lê um elemento. Em tempo de execução, `new ArrayList<String>().getClass() ==
new ArrayList<Integer>().getClass()` é verdadeiro: as duas são `java.util.ArrayList`.

Disso saem as proibições que a entrevista adora, cada uma com a mensagem que o `javac` 25 dá:

- **Sem `new T()`**: o construtor a chamar não é conhecido em tempo de execução (`unexpected type`).
  Quem precisa criar instâncias recebe uma fábrica, um `Supplier<T>`.
- **Sem `instanceof List<String>` a partir de um `Object`**: não há como conferir o argumento de tipo
  (`Object cannot be safely cast to List<String>`). `instanceof List<?>` funciona.
- **Sem array de tipo genérico** (`new T[10]`, `new List<String>[10]`), pela mesma razão.
- **Dois métodos que só diferem pelo argumento de tipo** (`m(List<String>)` e `m(List<Integer>)`)
  colidem depois da erasure.

## Invariância, e a covariância dos arrays

`Integer` é subtipo de `Number`, mas `List<Integer>` **não** é subtipo de `List<Number>`
(`incompatible types: List<Integer> cannot be converted to List<Number>`). Se fosse, daria para
passar a lista de inteiros a um método que recebe `List<Number>` e adicionar um `Double` nela. Os
generics são **invariantes** de propósito.

Os arrays fizeram a escolha oposta, de antes dos generics: são **covariantes**. `Object[] o =
new String[2]` compila. O preço vem em tempo de execução: o array lembra o próprio tipo, e
`o[1] = 42` lança `ArrayStoreException: java.lang.Integer`. Os generics trocaram essa checagem
tardia por uma recusa na compilação, e é por isso que os dois não se misturam bem.

## *Wildcards* e PECS

A invariância deixaria as APIs rígidas demais, e os **curingas** (*wildcards*) devolvem a
flexibilidade com segurança:

- **`? extends T`** é um **produtor**: dá para ler `T` dele, mas não para escrever (o tipo exato é
  desconhecido). `List<? extends Number>` aceita `List<Integer>` e `List<Double>`.
- **`? super T`** é um **consumidor**: dá para escrever `T` nele, e ler só `Object`.
  `List<? super Integer>` aceita `List<Integer>`, `List<Number>` e `List<Object>`.

A regra mnemônica é **PECS**: *Producer Extends, Consumer Super*. A assinatura de
`Collections.copy(List<? super T> dest, List<? extends T> src)` é o exemplo canônico: copia uma
`List<Integer>` para uma `List<Number>` ou uma `List<Object>`. Curinga é para parâmetro de método;
como tipo de retorno, ele empurra a complexidade para quem chama.

Os parâmetros de tipo também aceitam limite: `<A extends Agregado<ID>>` restringe o tipo a quem tem
um `id()`, e o corpo pode chamá-lo. A **inferência** completa o resto: em `copiar(inteiros,
numeros)`, o compilador escolhe o `T`; e `var x = List.of(1, 2.5)` infere uma interseção (`Number &
Comparable<...>`), com `Integer` e `Double` dentro.

## *Heap pollution* e `@SafeVarargs`

Um método com parâmetro *varargs* genérico (`T... itens`) recebe um array, e um array de `T` não pode
existir: o compilador cria um `Object[]`. Se esse array escapa do método, o tipo declarado mente.
Este é o caso clássico:

```java
static <T> T[] doisDe(T a, T b) { return paraArray(a, b); }
@SafeVarargs static <T> T[] paraArray(T... itens) { return itens; }

String[] s = doisDe("a", "b"); // ClassCastException
```

Dentro de `doisDe`, o `T` foi apagado, e o array criado é `Object[]`; o *cast* para `String[]` na
chamada falha. Isso é **heap pollution**: uma variável de tipo parametrizado apontando para um objeto
que não é daquele tipo. `@SafeVarargs` é uma **promessa** de que o método não faz isso: só lê os
elementos e nunca deixa o array escapar. Aqui a promessa é falsa, e o `javac` 25 ainda acusa, mesmo
com a anotação: `[varargs] Varargs method could cause heap pollution from non-reifiable varargs
parameter itens`.

## *Raw types* e *type tokens*

Um *raw type* (`List` sem argumento) desliga a checagem e existe por compatibilidade com código de
antes do Java 5. Ele ainda aparece em código legado, e `-Xlint:all` o acusa
(`[rawtypes] found raw type: List`). Com `-Werror`, o aviso vira erro de build: é a forma de garantir
que nenhum *unchecked* novo entre.

Quando uma biblioteca precisa do tipo completo em tempo de execução, como um desserializador JSON
que precisa saber que é `Map<String, List<Integer>>`, ela usa um **type token**: uma subclasse
anônima de uma classe genérica abstrata. A erasure apaga o tipo das variáveis, mas a assinatura da
superclasse de uma classe fica gravada no bytecode, e `getGenericSuperclass()` a devolve inteira.
É o desenho do `TypeReference` do Jackson.

## Exemplo numa fintech

O `pix-core` precisa de um resultado de operação que carregue o valor ou o erro de domínio, sem
exceção no caminho normal: um `Result<T, E>`. E de um repositório em memória para os testes dos
agregados. Os dois são genéricos, e os dois erram do mesmo jeito quando escritos sem curinga: um
`map(Function<T, U>)` recusa uma função que recebe `Number` para um `Result<Integer, E>`, e um
`salvarTodos(Collection<A>)` recusa uma lista de um subtipo do agregado. As assinaturas certas são
`map(Function<? super T, ? extends U>)` e `salvarTodos(Collection<? extends A>)`.

## Hands-on

**Tutorial.** Reproduza as quatro proibições da erasure em arquivos separados e leia as mensagens do
`javac` 25. Depois reproduza a *heap pollution* do `doisDe` e o aviso `[varargs]`.

**Desafio.** Escreva um `Result<T, E>` (uma *sealed interface* com os records `Ok` e `Falha`, que o
marco 05 aprofunda) com `map`, e um `RepositorioEmMemoria<ID, A extends Agregado<ID>>` com `salvar`,
`porId`, `salvarTodos` e `copiarPara`. Compile o projeto com `-Xlint:all -Werror`. Com o JMH no
projeto, o processador de anotações gera o aviso `No processor claimed any of these annotations`;
desligue só essa categoria, com `-Xlint:all,-processing`.

**Invariantes testáveis**

1. O projeto compila sem nenhum aviso, com `-Xlint:all,-processing -Werror`. Prove que a regra vale
   acrescentando uma classe com *raw type* e vendo o build falhar.
2. Um teste de compilação negativo documenta a invariância. Ele compila um fonte em memória com a
   API `javax.tools.JavaCompiler` e exige o erro
   `java.util.List<java.lang.String> cannot be converted to java.util.List<java.lang.Object>`.
   Um segundo teste mostra que, com `List<? extends Object>`, o mesmo código compila.
3. `copiar(List<? extends T> origem, List<? super T> destino)` aceita `List<Integer>` →
   `List<Number>`, e o repositório aceita uma lista de subtipos do agregado na entrada e uma
   `List<Object>` na saída.
4. `Result.map` aceita uma `Function<Number, Long>` sobre um `Result<Integer, String>`, e uma `Falha`
   passa pelo `map` sem chamar a função.

**Complemento.** Escreva um *type token* (`abstract class TypeRef<T>`) e imprima o tipo de
`new TypeRef<Map<String, List<Integer>>>() {}`. Explique por que a erasure não o apagou.

**Checagem**

1. O que a erasure apaga, e por que `new T()` não compila?
2. Por que `List<Integer>` não é `List<Number>`, e que erro os arrays covariantes trocaram por essa
   recusa?
3. Na assinatura de `Collections.copy`, qual parâmetro é produtor e qual é consumidor?
4. O que `@SafeVarargs` promete, e por que o `javac` ainda acusa o `paraArray`?

## Principais aprendizados

- Generics são checagem de compilação; a erasure os apaga no bytecode.
- Sem `new T()`, sem `instanceof List<String>`, sem array genérico.
- Generics são invariantes; arrays são covariantes e falham em tempo de execução
  (`ArrayStoreException`).
- PECS: `? extends` para quem produz, `? super` para quem consome; curinga em parâmetro, não em
  retorno.
- `@SafeVarargs` é uma promessa: o array de *varargs* genérico não pode escapar.
- `-Xlint:all -Werror` no build impede *raw types* e *unchecked* novos; um *type token* recupera o
  tipo completo.
