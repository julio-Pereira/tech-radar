---
id: interfaces-e-tipos
title: "Interfaces, tipos e generics com critério"
summary: "Interface em Go é satisfeita implicitamente e deve ser pequena e definida por quem consome. Method sets, o nil tipado que devolve 500 para toda consulta, embedding, tipos fechados e quando generics — agora com métodos genéricos no Go 1.27 — valem a pena."
estimatedMinutes: 55
reviewedAt: 2026-11-08
reviewEvery: 12m
competencies: [arquitetura]
references:
  - title: "Go FAQ: Why is my nil error value not equal to nil?"
    url: https://go.dev/doc/faq#nil_error
  - title: "The Go Programming Language Specification: Method sets"
    url: https://go.dev/ref/spec#Method_sets
  - title: "When To Use Generics (Go blog)"
    url: https://go.dev/blog/when-generics
  - title: "Go 1.27 Release Notes: generic methods"
    url: https://go.dev/doc/go1.27
  - title: "go-check-sumtype (exaustividade de interface fechada)"
    url: https://github.com/alecthomas/go-check-sumtype
---

## Interface implícita, pequena, do lado de quem consome

Um tipo satisfaz uma interface **só por ter os métodos**, sem declarar nada. A consequência muda o
desenho: quem precisa de um comportamento declara a interface que precisa, no próprio pacote, com os
métodos que usa; o tipo concreto nem sabe que ela existe. O antifraude que só consulta saldo declara
`type SaldoReader interface { Saldo(ctx context.Context, id AccountID) (Money, error) }`, e o
repositório real de 20 métodos a satisfaz sem mudar uma linha. Interface pequena e no consumidor é o
contrário do hábito Java de uma `AccountRepository` gorda ao lado da implementação. O resumo que
circula na comunidade: **aceite interfaces, devolva structs**.

Como ninguém declara `implements`, um tipo pode deixar de satisfazer uma interface sem ninguém
perceber até o ponto de uso. A asserção de compilação documenta e protege a intenção:

```go
var _ SaldoReader = (*PostgresRepo)(nil) // não compila se PostgresRepo perder o método
```

## Method sets: valor e ponteiro

Um método com receiver de **ponteiro** (`func (e *Email) Notify(...)`) pertence ao method set de
`*Email`, mas **não** ao de `Email`. Então `var n Notifier = Email{}` não compila
(`method Notify has pointer receiver`), enquanto `&Email{}` compila. A razão é segurança: um valor
guardado numa interface é uma cópia, e chamar um método que altera o receiver alteraria a cópia, não
o original. A regra prática: se algum método do tipo precisa de ponteiro (altera estado, ou o tipo
tem um `sync.Mutex`), use ponteiro em todos e passe `*T` adiante.

## O nil tipado: a pegadinha número um

Um valor de interface tem duas partes: o **tipo dinâmico** e o **valor**. Ele só é `nil` quando as
duas são nil. Um ponteiro nil de um tipo concreto, guardado numa interface, produz uma interface com
tipo e sem valor, e ela **não é nil**:

```go
func find(id string) error {
	var nf *NotFoundError // ponteiro nil
	if id == "" {
		nf = &NotFoundError{ID: id}
	}
	return nf // sempre devolve uma interface não nil
}

err := find("acc-001")
fmt.Println(err == nil) // false
```

A correção é devolver o `nil` literal no caminho de sucesso (`return nil`), nunca uma variável de tipo
concreto. O `go vet` não pega esse caso; o **staticcheck** pega (SA4023: "never returns a nil
interface value"), e é um bom motivo para tê-lo no CI.

## Embedding: promoção, não herança

Embutir um tipo numa struct **promove** os métodos dele: `Service` com `Audit` embutido ganha
`s.Log()`. Não é herança: não há polimorfismo de subtipo, e o método promovido opera sobre o campo
embutido, não sobre `Service`. Se `Service` declara um método com o mesmo nome de um promovido, o de
`Service` vence; se **dois** tipos embutidos têm o mesmo método e `Service` não declara o seu, o
seletor fica ambíguo e o código que o usa não compila. Embutir uma **interface** numa struct compila
sempre e produz um campo nil que estoura em tempo de execução se ninguém o preencher: útil em teste,
perigoso em produção.

## Type switch e tipos fechados

`switch x := v.(type)` escolhe pelo tipo dinâmico, e `v, ok := x.(T)` testa um tipo sem risco de
panic. Com isso dá para construir o que Go não tem: um **tipo fechado** (sum type). A interface tem
um método **não exportado**, então só tipos do próprio pacote a satisfazem:

```go
//sumtype:decl
type Decisao interface{ decisao() }

type Aprovado struct{}
type Negado struct{ Motivo string }
type Revisao struct{ Fila string }

func (Aprovado) decisao() {}
func (Negado) decisao()   {}
func (Revisao) decisao()  {}
```

O compilador garante o fechamento: um tipo de fora que declare `decisao()` não satisfaz a interface
(`unexported method decisao`). A exaustividade do `switch` não vem da linguagem; vem do linter
`gochecksumtype`, que lê o comentário `//sumtype:decl` e reprova o `type switch` que esquece
`Revisao`. É o mesmo papel do `exhaustive` com enums de `iota` (marco 02), para tipos com dados.

## Generics com critério

Generics servem para escrever o algoritmo **uma vez para vários tipos**, quando o comportamento não
depende do tipo: coleções, funções como `slices.Sort`, um `Sum` sobre qualquer inteiro. Constraints
dizem o que o tipo precisa ter: `comparable` (pode usar `==`, serve de chave de map), `~int64`
(qualquer tipo cujo tipo base é `int64`, como `type BRL int64`). Interface continua melhor quando o
**comportamento** varia por tipo: o antifraude não quer um `Decide[T]`, quer qualquer coisa que
saiba decidir.

O Go 1.27 acrescentou **métodos genéricos**: um método pode declarar parâmetros de tipo próprios,
como `func (b *Batch[T]) Map[U any](xs []T, f func(T) U) []U`. Isso tira a necessidade de funções
soltas no pacote só porque o método não podia ser genérico. Dois limites continuam: método de
**interface** não pode ter parâmetro de tipo, e um método genérico não satisfaz método de interface.
Então generics não substituem interface para despacho dinâmico, e um `Money` genérico em moeda não é
melhor que um `Money` com campo `Currency`. Num módulo com `go 1.26`, o mesmo código recusa:
`generic method requires go1.27 or later`.

A ponte com o desenho de código está em `arquitetura-de-software/04` (portas e adaptadores, que em Go
são justamente interfaces pequenas do lado do domínio), e o catálogo de padrões fica em
`design-de-codigo/02`, trilha planejada.

## Exemplo numa fintech

O repositório de contas devolve `*NotFoundError` quando a conta não existe. Num refactor, alguém
passou a guardar o resultado numa variável `var nf *NotFoundError` e devolver `nf` no fim. O handler
HTTP faz `if err != nil { return 500 }`. Resultado: **toda consulta bem-sucedida responde 500**,
porque o `err` é uma interface com tipo `*NotFoundError` e valor nil. Em staging, o time viu 500 no
saldo de todo mundo e passou uma hora procurando no banco. O teste unitário do repositório passava,
porque comparava `err.(*NotFoundError) == nil`, e não `err == nil`.

## Hands-on

**Tutorial.** Reproduza o nil tipado: o `find` acima, um handler que responde 500 quando
`err != nil`, e um teste que mostra o 500 numa consulta válida. Rode `go vet` (silêncio) e
`golangci-lint` com `staticcheck` (SA4023). Corrija devolvendo `nil` literal.

**Desafio.** O resultado de autorização do antifraude como tipo fechado: `Decisao` com `Aprovado`,
`Negado{Motivo}` e `Revisao{Fila}`, uma função `Status(d Decisao) string` com `type switch`, e o
`.golangci.yml` com `gochecksumtype` e `staticcheck`.

**Invariantes testáveis**

1. Nenhum tipo fora do pacote satisfaz `Decisao`. Prove com um pacote em `testdata/forasteiro` que
   tenta, e um teste que roda `go build` nele e exige a falha com `unexported method decisao` (e
   não qualquer falha).
2. Toda função do pacote que devolve `error` devolve o `nil` literal no sucesso: os testes de caminho
   feliz comparam com `err == nil` (nunca com um tipo concreto), e o `staticcheck` não acusa SA4023.
3. O `gochecksumtype` reprova o `type switch` de `Status` quando um caso é removido. Prove apagando
   o `case Revisao` e vendo `missing cases for Revisao`.
4. A tabela de `Status` cobre os três tipos, inclusive o motivo e a fila.

**Complemento.** Escreva o mesmo `Status` com generics (`func Status[D Decisao](d D) string`) e
explique, num comentário, por que ele não ficou melhor: o `type switch` continua necessário, e a
assinatura genérica não acrescenta nenhuma garantia.

**Checagem**

1. Por que `err != nil` é verdadeiro quando a função devolveu um ponteiro nil de um tipo de erro?
2. Por que `Email{}` não satisfaz `Notifier` quando `Notify` tem receiver de ponteiro, e por que
   essa regra existe?
3. Onde a interface `SaldoReader` deve ser declarada, e por quê?
4. Com métodos genéricos no Go 1.27, por que generics ainda não substituem interfaces?

## Principais aprendizados

- Interface é implícita: declare-a pequena, no consumidor, e proteja a intenção com
  `var _ I = (*T)(nil)`.
- Interface só é nil quando tipo e valor são nil; devolva `nil` literal, e deixe o staticcheck vigiar.
- Embedding promove métodos, não cria herança.
- Tipo fechado é interface com método não exportado, mais um linter de exaustividade.
- Generics para algoritmos independentes de tipo; interface para comportamento que varia.
