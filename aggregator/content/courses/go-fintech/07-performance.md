---
id: performance
title: "Performance, profiling e testes de carga"
summary: "Medir, atribuir causa e otimizar: pprof, benchmarks com benchstat, escape analysis e a meta de p99 abaixo de 200ms."
estimatedMinutes: 30
references:
  - title: "Profiling Go Programs"
    url: https://go.dev/blog/pprof
  - title: "package testing — Benchmarks"
    url: https://pkg.go.dev/testing#hdr-Benchmarks
---

## Otimizar é medir, não adivinhar

A Fase 6 fecha o curso com a disciplina que separa sênior de pleno: **medir antes de
otimizar**. As ferramentas:

- **`pprof`** integrado ao serviço (atrás de auth!): perfis de CPU, heap, goroutines e
  blocking.
- **Benchmarks** de hot paths com `testing.B`, comparados estatisticamente com
  `benchstat` — uma medição só não prova regressão.
- **Escape analysis** (`go build -gcflags='-m'`): entender o que vai para a stack e o que
  escapa para o heap.
- **Alocação**: `sync.Pool`, pré-alocação de slices, evitar conversões `string ↔ []byte`
  desnecessárias.
- **GC tuning**: `GOGC`, `GOMEMLIMIT` (1.19+) e `GOMAXPROCS`.
- **Load testing** com `k6` ou `vegeta` — simular 1k TPS de transferências.

## Exemplo numa fintech: caçar a alocação no hot path

A meta realista é **latência p99 de pagamento abaixo de 200ms**. Suponha que o `pprof`
de heap aponte alocação excessiva no encoding de cada resposta. Um benchmark isola o hot
path e o `b.ReportAllocs()` mostra o custo por operação:

```go
func BenchmarkEncodeReceipt(b *testing.B) {
    r := sampleReceipt()
    b.ReportAllocs()
    for b.Loop() { // Go 1.24+: laço de benchmark idiomático
        _ = encodeReceipt(r)
    }
}
```

Rode antes da mudança:

```bash
go test -bench=BenchmarkEncodeReceipt -benchmem -count=10 ./internal/api/... \
  > antes.txt
```

Aplique a otimização, rode de novo com o mesmo comando redirecionando para
`depois.txt`, e compare:

```bash
go install golang.org/x/perf/cmd/benchstat@latest
benchstat antes.txt depois.txt
```

Se a diferença não for estatisticamente significativa, a "otimização" foi ruído. É assim
que se atribui causa com rigor, em vez de torcer.

## Hands-on

**Tutorial — perfil ao vivo do `payments-api`.**

1. Exponha o `pprof` atrás de auth (nunca em `0.0.0.0` sem proteção):

   ```go
   mux.Handle("/debug/pprof/", authMiddleware(http.DefaultServeMux))
   ```

2. Gere carga e capture um perfil de CPU de 30s:

   ```bash
   vegeta attack -targets=targets.txt -rate=1000 -duration=30s | vegeta report
   go tool pprof -http=:8081 http://localhost:8080/debug/pprof/profile?seconds=30
   ```

3. Rode a escape analysis do hot path apontado pelo perfil:

   ```bash
   go build -gcflags='-m' ./internal/api/... 2>&1 | grep "escapes to heap"
   ```

**Invariante testável.** Com `GOMAXPROCS=4` fixo, meça o p99 do `vegeta report` antes e
depois de aplicar a mitigação de alocação apontada pelo `pprof`. A meta do
`PROJETO.md` é **p99 < 200ms** — registre os dois números.

## Principais aprendizados

- Comece pelo `pprof`: otimize o que o perfil aponta, não o que a intuição sugere.
- Compare benchmarks com `benchstat` e `-count` alto — uma rodada não prova nada.
- A meta p99 < 200ms é alcançada cortando alocação no hot path, não reescrevendo tudo.
