---
id: rest-bff
title: "API REST de pagamentos + BFF"
summary: "Transformar o produto em serviço: net/http, chi, middlewares e um BFF que agrega chamadas downstream com errgroup."
estimatedMinutes: 35
references:
  - title: "package net/http"
    url: https://pkg.go.dev/net/http
  - title: "go-chi/chi"
    url: https://github.com/go-chi/chi
---

## Dois serviços que coexistem

Na Fase 3 o LedgerCore vira serviço de verdade, em duas peças:

- **`payments-api`** — API REST de carteira, transferências, saldo e extrato.
- **`payments-bff`** — Backend-for-Frontend de um app hipotético, que **agrega** chamadas
  ao `payments-api`, a um serviço de KYC (mockado) e a um de cotação (real).

Comece com `net/http` puro antes de pegar framework — o `ServeMux` melhorou muito no Go
1.22 com pattern matching de rotas. Para produtividade, `chi` é o router recomendado:
minimalista e idiomático. Cuidado eterno: o `http.Client` padrão tem **timeout
infinito** — sempre configure o seu.

## Mapa Spring Boot → Go idiomático

| Spring Boot | Go (idiomático fintech) |
| --- | --- |
| `@RestController` + `@GetMapping` | `chi.Router` + `r.Get("/path", handler)` |
| `@Valid` + Hibernate Validator | `validator.Struct(req)` |
| Filtros / Interceptors | middleware `func(http.Handler) http.Handler` |
| `RestTemplate` / `WebClient` | `http.Client` com timeouts customizados |
| `@ExceptionHandler` | error mapping centralizado em middleware |
| `@Transactional` | `db.BeginTx(ctx, ...)` + `defer rollback` explícito |
| Resilience4j circuit breaker | `sony/gobreaker` |
| Spring Security | middlewares compostos (auth, authz, rate limit) |

## Exemplo numa fintech: agregação no BFF

O BFF precisa montar a home do app: saldo, status de KYC e cotação do dólar. Fazer isso
em série soma as latências; o idiomático é paralelizar com `errgroup` e cortar no
primeiro erro, propagando o `context` (que carrega o deadline da requisição):

```go
g, ctx := errgroup.WithContext(ctx)
var balance Balance
var kyc KYCStatus

g.Go(func() error { var e error; balance, e = paymentsAPI.Balance(ctx, id); return e })
g.Go(func() error { var e error; kyc, e = kycClient.Status(ctx, id); return e })

if err := g.Wait(); err != nil { // qualquer falha cancela as demais
    return writeProblem(w, err) // RFC 7807: contrato de erro estável e auditável
}
```

Sobre segurança, aplique o básico de OWASP: JWT com `golang-jwt`, validação rigorosa de
input (limites de valor, CPF, conta), `Idempotency-Key` persistida com TTL, rate
limiting por usuário e por IP, e — crucial — **mascaramento em logs**. Nunca logue PAN,
CVV, senha ou token; modele um tipo `Sensitive[T]` que mascara em `String()` e
`MarshalJSON()`.

## Principais aprendizados

- Entenda `net/http` antes do framework; use `chi` + middlewares funcionais compostos.
- Sempre defina timeouts no `http.Client` e paralelize o BFF com `errgroup` + `context`.
- Erros como Problem Details (RFC 7807) e dados sensíveis mascarados são requisito, não enfeite.
