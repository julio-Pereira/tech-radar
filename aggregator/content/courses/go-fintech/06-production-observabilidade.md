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

## Principais aprendizados

- Logue com `slog` estruturado e exponha métricas de negócio, não só técnicas.
- Separe liveness de readiness e faça graceful shutdown drenando o que está em voo.
- Outbox garante entrega sem 2PC; o audit log imutável é a espinha da auditoria regulatória.
