---
id: fundamentos
title: "Fundamentos idiomáticos com domínio financeiro"
summary: "Idiomático em Go é zero value útil, composição e pacote organizado por domínio. Um Ledger que funciona sem construtor, um AccountID que não nasce inválido e o limite dos enums de iota."
estimatedMinutes: 50
reviewedAt: 2026-11-08
reviewEvery: 12m
competencies: [arquitetura]
references:
  - title: "Effective Go"
    url: https://go.dev/doc/effective_go
  - title: "Go Code Review Comments"
    url: https://go.dev/wiki/CodeReviewComments
  - title: "Package names (Go blog)"
    url: https://go.dev/blog/package-names
  - title: "golangci-lint"
    url: https://golangci-lint.run/
  - title: "exhaustive (linter de switch sobre enum)"
    url: https://github.com/nishanths/exhaustive
---

## O que torna o código idiomático

O `walletctl` deste marco é uma CLI de carteira que cria contas, transfere e lista lançamentos. O
objetivo não é a CLI, e sim internalizar três escolhas que fazem o código ser idiomático:

- **Organização por domínio, não por camada técnica.** Nada de `controllers/`, `services/`,
  `repositories/`: isso é hábito de Java. O pacote é a unidade de encapsulamento de Go, e o que se
  quer encapsular é um conceito: `account/`, `ledger/`, `money/`. Dividir por camada espalha cada
  conceito por três pacotes e obriga a exportar o que deveria ser interno.
- **Visibilidade por pacote.** Não há `private`, `protected` nem `public`: nome que começa com
  maiúscula é exportado, minúscula é visível só dentro do pacote. E o diretório `internal/` impede
  que qualquer coisa fora da árvore do seu módulo importe o que está ali dentro (marco 15).
- **Composição, não herança.** Um tipo ganha comportamento embutindo outro (marco 04), e satisfaz
  uma interface só por ter os métodos certos.

## Zero value é decisão de design

Em Go, toda variável nasce com o **zero value** do seu tipo: `0`, `""`, `false`, `nil`, ou uma struct
com todos os campos zerados. Não existe variável "não inicializada", e não existe construtor
obrigatório: qualquer pacote que importe o seu tipo pode escrever `var x SeuTipo`. Por isso a
pergunta de design não é "como impedir o zero value?" (não dá), e sim "o que o zero value
significa?". Há duas respostas boas:

- **Zero value utilizável.** `sync.Mutex{}` é um mutex destravado; `bytes.Buffer{}` é um buffer
  vazio. Um `Ledger{}` pode funcionar sem construtor se os mapas internos nascerem na primeira
  escrita. É a opção preferida quando existe um estado inicial natural.
- **Zero value com significado explícito.** Quando não existe estado inicial válido (uma conta sem
  ID não é uma conta), o zero value vira "ausente": o tipo ganha um `IsZero()`, e toda função que o
  recebe rejeita o zero value com um erro tipado. O construtor (`Parse`) é o único caminho para um
  valor válido.

O que não se faz é a terceira via, comum em quem vem de Java: um campo exportado que "todo mundo
sabe que precisa preencher". Ninguém sabe.

O Go 1.26 trouxe um detalhe que encurta esse código: `new` passou a aceitar uma expressão, então um
campo opcional representado por ponteiro (`Limite *int64` num JSON de requisição) se preenche com
`new(int64(5000))`, sem a variável auxiliar.

## Constantes e o limite dos enums

Go não tem `enum`. O idioma é um tipo com nome e constantes com `iota`:

```go
type Kind int

const (
	Debit Kind = iota + 1 // começa em 1: o zero value de Kind fica "inválido"
	Credit
)
```

Começar em 1 é uma aplicação direta do zero value: um `Entry` montado sem `Kind` não vira débito por
acidente. Mas o tipo **não é fechado**: `Kind(7)` compila, e um `switch` que esquece `Credit` também
compila. A linguagem não ajuda; a ferramenta ajuda. O linter `exhaustive` reprova o `switch` sobre
`Kind` que não trata todas as constantes declaradas. Para um tipo realmente fechado, o caminho é uma
interface com método não exportado, no marco 04.

## O que mais conta como "idiomático"

Idiomático em Go é também o que a ferramenta decide por você: `gofmt` formata (sem discussão de
estilo em code review), `go vet` pega erros que compilam (um `Printf` com o verbo errado, uma cópia de
mutex), e o `golangci-lint` junta dezenas de linters (`staticcheck`, `errcheck`, `exhaustive`…) num
comando só, configurado em `.golangci.yml`. Um CI de Go começa com os três.

| Java | Go |
| --- | --- |
| `try/catch/finally` | `if err != nil` e `defer` (marco 05) |
| `Optional<T>` | dois retornos: `(T, error)` ou `(T, bool)` |
| `implements` explícito | satisfação implícita de interface (marco 04) |
| `extends` | embedding de struct (marco 04) |
| construtor obrigatório | zero value utilizável ou com significado explícito |
| `enum` | tipo nomeado com `iota`, mais o linter `exhaustive` |
| Checkstyle e SpotBugs | `gofmt`, `go vet`, `golangci-lint` |
| `BigDecimal` | `int64` em centavos ou `shopspring/decimal` |

## Exemplo numa fintech

Numa transferência, o domínio precisa de três garantias que não dependem de disciplina de quem
chama: a conta de origem e a de destino existem como valores válidos, o débito e o crédito somam
zero, e a mesma chave de idempotência não lança duas vezes. Com zero value bem desenhado, a primeira
garantia vira tipo: `AccountID` tem o campo não exportado, então fora do pacote `account` só existem
`account.Parse("acc-001")` (validado) e `account.AccountID{}` (o zero value, que significa "nenhuma
conta"). O `Ledger.Transfer` rejeita o zero value antes de tocar no razão, e o `Ledger` em si
funciona zerado:

```go
var l ledger.Ledger // sem construtor: o mutex e o mapa nascem prontos ou na primeira escrita
entries, err := l.Transfer("chave-1", origem, destino, money.Money{Amount: 5000, Currency: "BRL"})
```

## Hands-on

**Tutorial.** Implemente o pacote `ledger` com zero value utilizável: um `Ledger` com `sync.Mutex`,
o slice de lançamentos e o mapa `chave de idempotência → posição`, criado na primeira escrita. A
`Transfer` lança um débito na origem e um crédito no destino; repetir a mesma chave devolve os
lançamentos da primeira execução. `Entries()` devolve uma cópia (o marco 03 explica por quê). Ligue
tudo num `walletctl transfer --idempotency-key` em memória.

**Desafio.** Crie o tipo `account.AccountID` que não pode ser criado inválido por nenhum caminho
exportado: campo não exportado, `Parse(s string) (AccountID, error)` com o formato
`^acc-[a-z0-9]{3,32}$`, `IsZero()`, e o erro sentinela `ErrZeroAccountID` para quem receber o zero
value.

**Invariantes testáveis**

1. `Parse` aceita os formatos válidos e recusa todos os inválidos de uma tabela, inclusive `""`,
   maiúsculas, espaço no fim e `\n`; toda recusa devolve o zero value e um erro reconhecível por
   `errors.Is`.
2. Toda função exportada que recebe `AccountID` devolve `ErrZeroAccountID` para o zero value (teste
   de tabela sobre `Transfer`, com origem vazia e destino vazio).
3. A soma de `SignedAmount()` de todos os lançamentos é zero depois de qualquer sequência de
   transferências, e a mesma chave repetida produz dois lançamentos, não quatro.
4. `golangci-lint run` com `exhaustive` habilitado não tem achados; e um `switch` sobre `Kind` que
   esquece `Credit` faz o linter falhar (prove escrevendo o switch errado e vendo o erro).

**Complemento.** Leia o `.golangci.yml` de um projeto Go grande que você usa (o do próprio
golangci-lint serve) e liste três linters que ele habilita e você não conhecia, com o erro que cada
um pega.

**Checagem**

1. Por que não dá para impedir o zero value de um tipo exportado, e o que se faz no lugar?
2. Quando um zero value utilizável é melhor que um construtor obrigatório?
3. O que o `iota + 1` protege, e o que ele não protege?
4. Por que pacote por domínio produz menos símbolos exportados que pacote por camada?

## Principais aprendizados

- Zero value não se proíbe: ou ele é útil, ou ele tem significado explícito e é rejeitado onde não
  serve.
- Campo não exportado mais construtor que valida é o jeito Go de "não nasce inválido".
- `iota` dá nome a constantes, não fecha o tipo; o `exhaustive` cobre o `switch`.
- `gofmt`, `go vet` e `golangci-lint` fazem parte do que "idiomático" quer dizer.
