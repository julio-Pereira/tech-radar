---
id: production-observabilidade
title: "Microservice production-grade + observabilidade"
summary: "Consolidar tudo: slog, métricas de negócio, health checks, graceful shutdown, outbox completo e audit log imutável."
estimatedMinutes: 40
references:
  - title: "package log/slog"
    url: https://pkg.go.dev/log/slog
  - title: "prometheus/client_golang"
    url: https://github.com/prometheus/client_golang
---

## O serviço vira referência

Na Fase 5 o `payments-api` deixa de ser "um serviço que funciona" e vira referência de
microservice fintech production-grade. Três frentes se consolidam.

### Observabilidade

- **Logs estruturados** com `log/slog` (stdlib desde 1.21): JSON em produção, texto em
  dev, com request ID, trace ID e user ID em todo log.
- **Métricas** com `prometheus/client_golang`. Métricas de negócio — TPV, taxa de
  aprovação — contam tanto quanto CPU e latência.
- **Tracing** com OpenTelemetry, propagado via `context` entre os três serviços.

### Operação

- **Health checks separados**: liveness ("estou vivo?") distinto de readiness ("estou
  pronto para receber tráfego?") — o orquestrador usa cada um para uma decisão diferente.
- **Graceful shutdown** com `signal.NotifyContext`: drene as requisições em voo e feche
  os pools antes de morrer.
- **12-factor**: config via env, logs em stdout, statelessness, port binding.

### Persistência

- **`sqlc`** (gera código type-safe a partir de SQL) em vez de ORM mágico. Em fintech
  você quer SQL explícito e auditável.
- **`golang-migrate`** com migrations versionadas.

## Exemplo numa fintech: outbox + audit log

O **outbox pattern** completo entra aqui: ao gravar uma transação, escreva o evento numa
tabela `outbox` na **mesma transação** de banco; um worker lê e publica em Kafka/NATS,
garantindo entrega *at-least-once* sem 2-phase commit. Em paralelo, um `event_log`
append-only registra cada movimentação de forma imutável — auditoria regulatória adora.

```go
// Health check que diz a verdade: readiness cai se uma dependência crítica sai.
func (h *Health) Ready(ctx context.Context) error {
    if err := h.db.PingContext(ctx); err != nil {
        return fmt.Errorf("db indisponível: %w", err) // pod sai do balanceador
    }
    return nil
}
```

Sobre compliance: campos `created_at`/`created_by`, snapshots periódicos, e — atenção —
**não se deleta transação**. O "direito ao esquecimento" da LGPD vira anonimização, não
hard delete, num sistema contábil. No empacotamento, um Dockerfile multi-stage com
binário estático (`CGO_ENABLED=0`) gera uma imagem `distroless`/`scratch` de 5 a 15 MB.

## Hands-on

**Tutorial — o `payments-api` fica production-grade.**

1. Suba as dependências:

   ```yaml
   # docker-compose.yml
   services:
     postgres:
       image: postgres:17
       environment: { POSTGRES_PASSWORD: pix, POSTGRES_DB: ledger }
       ports: ["5432:5432"]
   ```

   ```bash
   docker compose up -d
   golang-migrate -database "postgres://postgres:pix@localhost:5432/ledger?sslmode=disable" \
     -path ./migrations up
   go run ./cmd/payments-api
   ```

2. Confira liveness e readiness separados:

   ```bash
   curl http://localhost:8080/healthz    # liveness — sempre 200 se o processo está de pé
   curl http://localhost:8080/readyz     # readiness — 503 se o Postgres cair
   ```

3. Confira as métricas de negócio expostas:

   ```bash
   curl http://localhost:8080/metrics | grep -E 'tpv_total|approval_rate'
   ```

4. Faça uma requisição e confirme que o `trace_id` aparece tanto no log quanto seria
   visível num backend de tracing:

   ```bash
   curl -X POST http://localhost:8080/entries -H "Content-Type: application/json" \
     -d '{"account":"acc-1","amount":1000,"currency":"BRL","type":"CREDIT"}' -v
   # copie o valor do header de resposta (ex.: traceparent) e confira que a mesma
   # string aparece no campo trace_id do log estruturado do payments-api
   ```

**Invariante testável.** Derrube o Postgres com o serviço no ar
(`docker compose stop postgres`) e confirme que `/readyz` responde **503** enquanto
`/healthz` continua **200** — a distinção entre os dois é o ponto do marco.

## Principais aprendizados

- Logue com `slog` estruturado e exponha métricas de negócio, não só técnicas.
- Separe liveness de readiness e faça graceful shutdown drenando o que está em voo.
- Outbox garante entrega sem 2PC; o audit log imutável é a espinha da auditoria regulatória.
