---
id: fundamentos
title: "Fundamentos idiomáticos com domínio financeiro"
summary: "Parar de escrever Java em Go: erros como valor, composição, e o tipo Money de uma carteira digital."
estimatedMinutes: 35
references:
  - title: "Effective Go"
    url: https://go.dev/doc/effective_go
  - title: "Go Code Review Comments"
    url: https://go.dev/wiki/CodeReviewComments
---

## O que torna o código idiomático

A Fase 1 do LedgerCore é uma CLI de carteira — o `walletctl` — que cria contas,
deposita, saca, transfere e lista extrato, com persistência local em SQLite. O
objetivo não é a CLI em si, e sim internalizar o que faz o código ser idiomático:

- **Organização por domínio, não por camada técnica.** Nada de `controllers/`,
  `services/`, `repositories/` — isso é Java thinking. Pacotes são por domínio:
  `wallet/`, `ledger/`, `money/`, `storage/`.
- **Interfaces implícitas e embedding.** Um tipo satisfaz uma interface só por ter os
  métodos; não existe `implements`. Composição via embedding substitui herança.
- **Erros são valores.** Em vez de `try/catch`, o padrão é `if err != nil`. Use
  `fmt.Errorf("...: %w", err)` para embrulhar, e `errors.Is` / `errors.As` para
  inspecionar a cadeia.

## Mapa mental Java → Go

| Java | Go |
| --- | --- |
| `try/catch/finally` | `if err != nil` + `defer` |
| `Optional<T>` | múltiplos retornos `(T, error)` ou `(T, bool)` |
| `implements` (explícito) | satisfação implícita de interface |
| `extends` | embedding de struct |
| `@Nullable` | ponteiro `*T` |
| Maven/Gradle | `go mod` |
| JUnit + Mockito | `testing` + `testify` (ou stdlib + interfaces) |
| `BigDecimal` | `int64` em centavos ou `shopspring/decimal` |

## Exemplo numa fintech: o tipo Money

Numa transferência, o domínio precisa de um `Money` que se recuse a somar moedas
diferentes e que jamais use ponto flutuante. O erro é um **valor** retornado, não uma
exceção lançada:

```go
type Money struct {
    Amount   int64
    Currency string
}

var ErrCurrencyMismatch = errors.New("moedas incompatíveis")

func (m Money) Add(o Money) (Money, error) {
    if m.Currency != o.Currency {
        return Money{}, fmt.Errorf("add %s + %s: %w",
            m.Currency, o.Currency, ErrCurrencyMismatch)
    }
    return Money{Amount: m.Amount + o.Amount, Currency: m.Currency}, nil
}
```

Cada transferência gera **dois lançamentos** (débito numa conta, crédito noutra), e o
comando `transfer --idempotency-key` checa se a chave já foi usada antes de re-executar
— idempotência básica desde o primeiro exercício.

## Principais aprendizados

- Estruture pacotes por domínio; interfaces implícitas e embedding substituem herança.
- Trate erro como valor: embrulhe com `%w`, inspecione com `errors.Is`/`errors.As`.
- O tipo `Money` em centavos e a `Idempotency-Key` aparecem já na CLI — não depois.
