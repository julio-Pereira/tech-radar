---
id: concorrencia
title: "Concorrência aplicada a pagamentos"
summary: "O modelo CSP de Go num processador de pagamentos em lote — com sharding por conta para evitar saldo negativo."
estimatedMinutes: 40
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

**Channel/ator não é dogma, é critério.** A escolha certa depende do que está sendo protegido:
**channel ou ator** quando o que importa é a **propriedade de um dado** — uma goroutine é a única
dona de um estado, e todo mundo manda mensagem em vez de disputar acesso (é o sharding por conta
abaixo); **`Mutex`** quando a seção crítica é curta e vários acessos concorrentes a um mesmo
objeto em memória são inevitáveis; e **o banco**, com transação e ordem de aquisição, quando a
invariante precisa valer **entre processos** — nenhum channel nem nenhum `Mutex` de uma goroutine
protege um dado que outro processo também escreve. `dados-distribuidos/04` ensina as anomalias
que acontecem quando essa última fronteira é ignorada, e `/10` cobre lock distribuído e fencing
token para quando um lock em memória não basta nem dentro do mesmo processo.

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

**O que `-race` não vê.** O detector de race do Go acusa um acesso concorrente inseguro à mesma
memória que **de fato ocorreu** na execução — ele não prova ausência, e não pega **race condition
lógica** (ler um valor de uma estrutura segura, decidir algo, escrever depois, sem que a sequência
inteira seja atômica). Um `-race` limpo não é certidão de que o sharding por conta está correto;
é só a confirmação de que não há acesso cru inseguro naquela execução específica.

**Checagem.** (a) Por que sharding por conta evita lock global sem perder paralelismo
entre contas diferentes? (b) O que `go test -race` detecta, e o que ele não detecta mesmo
passando limpo?

## Principais aprendizados

- Channel/ator, `Mutex` e transação de banco protegem coisas diferentes: propriedade de dado,
  seção crítica curta em memória, e invariante entre processos — a escolha é por critério, não
  por dogma de linguagem.
- Sharding por conta torna a mesma conta sequencial e contas distintas paralelas, mas só protege
  **dentro de um processo**; entre processos, a invariante precisa do banco.
- `go test -race` acusa data race que ocorreu — ele não prova ausência, e não pega race condition
  lógica (`dados-distribuidos/04`).
- Reconciliação ao fim do batch e `go test -race` são rede de segurança, não opcional.
