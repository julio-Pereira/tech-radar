---
id: grpc-antifraude
title: "gRPC entre serviços + antifraude"
summary: "Comunicação tipada e performática com Protobuf e buf, aplicada a um fraud-check com velocity checks e decisão fail-open/fail-closed."
estimatedMinutes: 30
references:
  - title: "gRPC — Quick start (Go)"
    url: https://grpc.io/docs/languages/go/quickstart/
  - title: "buf — Build, manage and consume Protobuf"
    url: https://buf.build/docs/
---

## Por que gRPC entre os serviços

Entre serviços internos, JSON sobre HTTP custa caro em serialização e não dá contrato
forte. A Fase 4 introduz o serviço **`fraud-check`**: recebe via gRPC os detalhes de uma
transação e devolve um **score de risco**. A implementação inicial pode ser regras
simples, mas a interface já nasce estendível para um modelo de ML futuro.

Os tópicos centrais:

- **Protobuf com `buf`** — geração de código e versionamento de schema sem dor.
- Streaming: server, client e bidirectional — um stream de eventos de transação
  consumido pelo `fraud-check`.
- **Interceptors** de gRPC (auth, logging, tracing) — o equivalente direto aos
  middlewares HTTP da fase anterior.
- Circuit breaker na chamada `payments-api → fraud-check`.

## Exemplo numa fintech: velocity check

Um padrão clássico de antifraude é o **velocity check**: bloquear quando há transações
demais numa janela curta de tempo. O `payments-api` consulta o `fraud-check` antes de
aprovar:

```go
score, err := fraudClient.Check(ctx, &fraudv1.CheckRequest{
    Account: tx.Account, Amount: tx.Amount, Geo: tx.Geo,
})
```

## A decisão que é de produto, não de código

Duas escolhas de arquitetura aqui são, na verdade, decisões de **risco de negócio** que
precisam ser explícitas:

- **Síncrono vs assíncrono** — bloquear a transação esperando o score adiciona latência;
  aprovar e revisar depois adiciona risco. Trade-off real, sem resposta universal.
- **Fail-open vs fail-closed** — se o `fraud-check` está fora, você aprova mesmo assim
  (fail-open, prioriza disponibilidade) ou recusa (fail-closed, prioriza segurança)?
  Em fintech essa escolha é registrada e auditada, não escondida num `catch`.

## Hands-on

**Tutorial — o serviço `fraud-check`.**

1. Defina o `.proto` e gere o código:

   ```bash
   buf generate
   ```

2. Suba o `fraud-check`:

   ```bash
   go run ./cmd/fraud-check
   ```

3. Liste os serviços e chame o `Check` via `grpcurl` (precisa de reflection habilitada,
   ou passe o `.proto` com `-proto`):

   ```bash
   grpcurl -plaintext localhost:9090 list

   grpcurl -plaintext -d '{"account":"acc-1","amount":150000,"geo":"BR-SP"}' \
     localhost:9090 fraud.v1.FraudCheck/Check
   ```

**Invariante testável — fail-open ou fail-closed sob deadline estourado.**

```go
func TestPaymentsAPI_FraudCheckTimeout_FallsBackToFailOpen(t *testing.T) {
    ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
    defer cancel()

    slowFraudClient := newSlowFraudStub(200 * time.Millisecond) // nunca responde a tempo
    decision, err := slowFraudClient.CheckWithFallback(ctx, tx)
    if err != nil {
        t.Fatalf("CheckWithFallback não deveria propagar erro: %v", err)
    }
    if decision != FallbackDecisionConfigured {
        t.Errorf("decisão = %v, esperado o fallback configurado", decision)
    }
}
```

```bash
go test ./internal/fraud/... -run TestPaymentsAPI_FraudCheckTimeout_FallsBackToFailOpen -v
```

**Checagem.** (a) Fail-open ou fail-closed: qual o `payments-api` do `pix-stream`
deveria escolher, e por quê? (b) O que o `deadline` do gRPC propaga que um timeout de
HTTP simples não propaga automaticamente entre serviços?

## Principais aprendizados

- Use Protobuf + `buf` para contrato forte e versionado entre serviços internos.
- Interceptors de gRPC espelham os middlewares HTTP (auth, logging, tracing).
- Síncrono/assíncrono e fail-open/fail-closed são decisões de risco explícitas, não defaults.
