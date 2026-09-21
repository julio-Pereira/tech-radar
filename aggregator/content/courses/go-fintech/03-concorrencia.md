---
id: concorrencia
title: "Concorrência aplicada a pagamentos"
summary: "O modelo CSP de Go num processador de pagamentos em lote — com sharding por conta para evitar saldo negativo."
estimatedMinutes: 35
references:
  - title: "Go Concurrency Patterns: Pipelines"
    url: https://go.dev/blog/pipelines
  - title: "package context"
    url: https://pkg.go.dev/context
---

## CSP: comunique compartilhando, não o contrário

A máxima de Go é *"Don't communicate by sharing memory; share memory by
communicating"*. Goroutines são leves — milhões delas são viáveis, ao contrário das
threads da JVM — e conversam por **channels**. As ferramentas do dia a dia:

- Channels buffered vs unbuffered, direcionais, e `select` para multiplexar.
- Padrões: fan-out/fan-in, pipeline, worker pool, semáforo via channel.
- O pacote `sync`: `Mutex`, `RWMutex`, `WaitGroup`, `Once`, `sync.Pool`.
- `context.Context` para cancelamento, deadlines e propagação.
- `errgroup.Group` para paralelizar com short-circuit no primeiro erro.
- `go test -race` para flagrar race conditions antes da produção.

As virtual threads do Java 21+ (Project Loom) aproximam o modelo, mas a ergonomia de
`channels` + `select` não tem equivalente direto. Vale conhecer ambos.

## Exemplo numa fintech: batch de 100k transações

O `walletctl` ganha um processador de pagamentos em lote — pense em folha de pagamento,
settlement de adquirência ou conciliação bancária: um CSV com 100 mil transações. O
risco mortal é a **race condition de saldo**: dois workers debitando a mesma conta ao
mesmo tempo produzem saldo negativo.

A solução idiomática não é um lock global, e sim **sharding por conta**: cada worker
processa um conjunto fixo de contas, de modo que transações da mesma conta são sempre
sequenciais, enquanto contas diferentes correm em paralelo.

```go
// Roteia cada transação para um worker fixo pelo hash da conta de origem.
shard := fnv32(tx.SourceAccount) % uint32(numWorkers)
queues[shard] <- tx // mesma conta → sempre a mesma goroutine → sem corrida de saldo
```

Ao processar, grave o evento numa tabela **outbox** (consistência sem 2-phase commit) e,
ao final, reconcilie: `sum(débitos) == sum(créditos)`. Se não bater, dispare alarme.
Use `golang.org/x/time/rate` para limitar a vazão e não derrubar dependências downstream.

## Hands-on

**Desafio — processar 100k transações sem corrida de saldo.**

1. Gere um CSV sintético com 100.000 transações sobre 2.000 contas:

   ```bash
   go run ./cmd/gen-batch --transactions 100000 --accounts 2000 --out batch.csv
   ```

2. Implemente `internal/batch` com sharding por conta (o exemplo `fnv32` acima) e rode:

   ```bash
   go run ./cmd/walletctl process-batch --file batch.csv --workers 8
   ```

3. Ao final, reconcilie: `sum(débitos) == sum(créditos)`.

**Invariante testável** — o critério do `PROJETO.md` é literal:

```bash
go test -race ./internal/batch/... -run TestProcessBatch_NoRaceOnSameAccount -v
```

o teste deve subir pelo menos 500 goroutines despachando para o mesmo conjunto pequeno
de contas (para forçar contenção real) e afirmar, ao final, que o saldo de cada conta
bate com a soma esperada — sem flag de `-race` acusando nada.

**Checagem.** (a) Por que sharding por conta evita lock global sem perder paralelismo
entre contas diferentes? (b) O que `go test -race` detecta que um teste funcional não
detecta?

## Principais aprendizados

- Modele concorrência com channels e `context`, não com memória compartilhada e locks.
- Sharding por conta torna a mesma conta sequencial e contas distintas paralelas.
- Reconciliação ao fim do batch e `go test -race` são rede de segurança, não opcional.
