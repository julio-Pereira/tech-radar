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

Rode `go test -bench=. -count=10` antes e depois da mudança e jogue no `benchstat`: se a
diferença não for estatisticamente significativa, a "otimização" foi ruído. É assim que
se atribui causa com rigor, em vez de torcer.

## Principais aprendizados

- Comece pelo `pprof`: otimize o que o perfil aponta, não o que a intuição sugere.
- Compare benchmarks com `benchstat` e `-count` alto — uma rodada não prova nada.
- A meta p99 < 200ms é alcançada cortando alocação no hot path, não reescrevendo tudo.
