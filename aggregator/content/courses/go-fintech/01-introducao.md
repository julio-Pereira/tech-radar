---
id: introducao
title: "Por que Go numa fintech"
summary: "Go tem poucas ideias, e o erro de quem vem de Java é escrever Java com outra sintaxe. A filosofia da linguagem, a versão que você declara no go.mod e os quatro pilares de domínio que aparecem desde a primeira linha de código."
estimatedMinutes: 30
reviewedAt: 2026-11-08
reviewEvery: 6m
competencies: [arquitetura]
references:
  - title: "Effective Go"
    url: https://go.dev/doc/effective_go
  - title: "Go Toolchains (linha go, linha toolchain e GOTOOLCHAIN)"
    url: https://go.dev/doc/toolchain
  - title: "Go, Backwards Compatibility, and GODEBUG"
    url: https://go.dev/doc/godebug
  - title: "Go 1.27 Release Notes"
    url: https://go.dev/doc/go1.27
  - title: "shopspring/decimal"
    url: https://github.com/shopspring/decimal
---

## Não escreva "Java em outra sintaxe"

O erro mais comum de quem migra para Go vindo de Java/Spring é tratar a linguagem como uma sintaxe
diferente para os mesmos hábitos. Go tem **opiniões fortes**: composição em vez de herança,
simplicidade em vez de abstração, e um modelo de concorrência (goroutines e channels) que não tem
equivalente direto na JVM. Algumas coisas vão parecer primitivas demais: não há `Optional`, não há
exceções, não há ORM mágico de fábrica. Outras vão parecer libertadoras: um binário único,
estático, que sobe em milissegundos.

A linguagem é pequena de propósito. A especificação inteira cabe numa tarde, e isso muda o tipo de
pergunta que uma entrevista de Go faz: em vez de "qual anotação resolve isso?", vem "o que este
código imprime?" e "por que isto vaza goroutine?". A trilha é organizada nessa ordem: primeiro a
semântica que derruba gente experiente, depois concorrência, depois o serviço em produção.

A meta não é só "saber Go", e sim **tomar decisões de arquitetura informadas** sobre quando Go
vence Java em sistemas financeiros, e quando não vence (marco 16).

## A versão do Go é parte do código

O `go.mod` não é só a lista de dependências. A linha `go` declara a versão da linguagem do módulo, e
desde o Go 1.21 ela é um **mínimo estrito**: um toolchain mais velho se recusa a compilar, com uma
mensagem clara, em vez de falhar com um erro obscuro no meio do build.

```text
module github.com/pix-platform/ledger-core

go 1.27
```

Três consequências práticas:

- **Comportamento travado pela linha `go`.** Quando o Go muda um comportamento padrão sem quebrar
  a regra de compatibilidade, a mudança é controlada por uma configuração `GODEBUG`, e o valor padrão
  vem da linha `go` do seu módulo. Atualizar o toolchain sem mexer na linha `go` preserva o
  comportamento antigo; subir a linha `go` é a decisão consciente de aceitar o novo. O exemplo
  famoso é o da variável de laço, no marco 03: o mesmo código imprime coisas diferentes conforme a
  linha `go`.
- **Toolchain baixado sob demanda.** Se o módulo pede uma versão mais nova que a instalada, o
  comando `go` pode baixar o toolchain certo (controlado por `GOTOOLCHAIN`). A linha opcional
  `toolchain` sugere a versão preferida para trabalhar no módulo.
- **Símbolo novo demais falha no teste.** No Go 1.27, `go test` passou a rodar a checagem
  `stdversion` do `vet`: usar uma função da stdlib mais nova que a linha `go` do módulo reprova o
  teste.

A baseline desta trilha é o **Go 1.27**, e o 1.26 ainda recebe correções. Todo recurso recente
aparece com a versão em que entrou ("Go 1.27+"), e a tabela completa está no `PROJETO.md`.

## Um produto que cresce: o ledger-core

Em vez de projetos descartáveis, a trilha evolui um único produto de pagamentos, o **`ledger-core`**:
nasce como uma CLI de carteira e termina como um serviço observável, com antifraude por gRPC,
persistência transacional e um modelo de segurança. Cada marco adiciona uma camada verificável ao
mesmo sistema, como uma fintech real cresce. A profundidade contábil (fechamento, conciliação) é da
trilha `ledger-e-contabilidade/01`; aqui o ledger é o veículo para aprender a linguagem.

O mapa:

| Bloco | Marcos | O que você sai sabendo |
| --- | --- | --- |
| A — A linguagem a fundo | 01–05 | Zero value, slices e maps, interfaces e nil tipado, erros e `defer` |
| B — Concorrência idiomática | 06–07 | Channels, `select`, `context`, `errgroup`, vazamento de goroutine |
| C — O serviço de produto | 08–11 | HTTP com a stdlib, transações, gRPC, testes com fuzzing e Postgres real |
| D — Produção | 12–14 | Observabilidade, segurança e cadeia de módulos, runtime e profiling |
| E — Arquitetura e decisão | 15–16 | Estrutura de pacotes e a decisão Go × Java com números |

## Quatro pilares de domínio, desde o dia 1

Precisão monetária, idempotência, contabilidade e auditoria não são "adicionados depois". Eles
aparecem no menor exercício.

- **Precisão monetária.** Nunca use `float64` para dinheiro. O padrão é `int64` na menor unidade
  (centavos) ou `shopspring/decimal` para fração arbitrária (juros, câmbio). O equivalente é o
  `BigDecimal` do Java, mas em Go a disciplina é cultural: a linguagem não impede o erro.
- **Idempotência.** Toda operação financeira precisa ser idempotente. O padrão `Idempotency-Key`
  (popularizado pela Stripe) faz uma requisição duplicada devolver o resultado anterior em vez de
  executar de novo.
- **Partida dobrada.** Toda movimentação tem um débito e um crédito que se equilibram. A soma de
  todos os lançamentos do sistema é zero por construção, o que habilita conciliação automática.
- **Auditoria e compliance.** Logs estruturados, trilha de auditoria imutável, mascaramento de dados
  sensíveis (LGPD, PCI-DSS). Registro contábil não se apaga: "deletar" quase sempre significa
  anonimizar.

## Exemplo numa fintech

Um boleto de R$ 100,00 precisa ser dividido em 3 parcelas. Em ponto flutuante, `100.0 / 3` dá
`33.333...`, e as três parcelas arredondadas somam R$ 99,99: um centavo some, e a conciliação do fim
do mês não fecha. Em centavos inteiros, a divisão tem quociente e resto: 3 parcelas de 3.333 e
**um centavo de resto**, que precisa ir para alguma parcela, sempre a mesma, para que reprocessar o
boleto dê o mesmo resultado. É o problema de `Allocate`, o desafio deste marco: dividir dinheiro sem
criar nem destruir centavos.

## Hands-on

**Tutorial — o módulo e o tipo `Money`.** Nasça o módulo, com a baseline declarada:

```bash
mkdir ledger-core && cd ledger-core
go mod init github.com/pix-platform/ledger-core
go mod edit -go=1.27
mkdir -p cmd/walletctl internal/money
```

```go
// internal/money/money.go
package money

import (
	"errors"
	"fmt"
)

type Money struct {
	Amount   int64  // menor unidade da moeda (ex.: centavos)
	Currency string // ISO 4217, ex.: "BRL"
}

var ErrCurrencyMismatch = errors.New("moedas incompatíveis")

func (m Money) Add(o Money) (Money, error) {
	if m.Currency != o.Currency {
		return Money{}, fmt.Errorf("add %s + %s: %w", m.Currency, o.Currency, ErrCurrencyMismatch)
	}
	return Money{Amount: m.Amount + o.Amount, Currency: m.Currency}, nil
}
```

Escreva um teste para `Add` (inclusive a soma de moedas diferentes), um `cmd/walletctl/main.go`
mínimo, e feche com `go build ./...` e `go test ./...`.

**Desafio.** Implemente `func (m Money) Allocate(n int) ([]Money, error)`: divide `m` em `n` partes
que somam exatamente `m`. O resto da divisão (de 0 a `n-1` centavos) vai para as primeiras partes,
um centavo para cada. Cuidado com valor negativo (um estorno dividido): em Go, `-10 % 3` é `-1`, o
resto tem o sinal do dividendo.

**Invariantes testáveis**

1. Para qualquer valor e qualquer `n > 0`, a soma das partes é exatamente o valor original. Prove com
   uma tabela de casos de borda (`0`, `1`, negativos, `math.MaxInt64`) e com um teste de propriedade
   que sorteia 10 mil pares `(valor, n)` com `math/rand/v2` e semente fixa.
2. Nenhuma parte difere de outra em mais de um centavo.
3. A mesma entrada produz a mesma saída: R$ 1,00 em 3 é sempre 34/33/33, nessa ordem.
4. `n <= 0` devolve um erro comparável com `errors.Is`, nunca uma divisão por zero.
5. A suíte passa com `go test -shuffle=on -count=20 ./...`: a ordem dos testes e a repetição não
   mudam o resultado.

**Complemento.** Troque a linha `go` do `go.mod` para `1.20` e rode `go vet ./...`, sem trocar o
toolchain. O teste de propriedade usa as funções nativas `min` e `max`, que entraram no Go 1.21, e o
toolchain passa a recusá-las com `built-in min requires go1.21 or later`. Volte para `1.27` e veja
passar: a linha `go` decide que linguagem o compilador aceita, não só que versão você instalou.

**Checagem**

1. Por que o resto de `Allocate` precisa ir sempre para as mesmas partes, e não para partes
   sorteadas?
2. O que muda no seu programa quando você troca a linha `go` do `go.mod`, sem trocar o toolchain?
3. Por que `float64` falha para dinheiro mesmo quando os valores são pequenos?
4. Que teste prova que `Allocate` não cria nem destrói centavos para valores que você não pensou em
   listar?

## Principais aprendizados

- Go não é Java com chaves diferentes: composição, simplicidade e erros como valores.
- A linha `go` do `go.mod` é parte do comportamento do programa, não só um requisito de build.
- Dinheiro é inteiro na menor unidade, e dividir dinheiro é distribuir o resto de forma
  determinística.
- Um teste de propriedade com semente fixa prova o invariante para casos que você não listou.
