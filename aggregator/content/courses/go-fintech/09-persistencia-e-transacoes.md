---
id: persistencia-e-transacoes
title: "Persistência e transações"
summary: "O pool de conexões e a transação são onde um serviço Go perde dinheiro em silêncio. database/sql e pgx, o pool que esgota por um rows.Close esquecido, FOR UPDATE em ordem fixa, o deadlock que o Postgres detecta, retry de serialização e migração versionada."
estimatedMinutes: 60
reviewedAt: 2026-11-08
reviewEvery: 12m
competencies: [dados, confiabilidade]
references:
  - title: "package database/sql"
    url: https://pkg.go.dev/database/sql
  - title: "jackc/pgx (driver e toolkit Postgres)"
    url: https://github.com/jackc/pgx
  - title: "PostgreSQL: Explicit Locking (FOR UPDATE e deadlocks)"
    url: https://www.postgresql.org/docs/current/explicit-locking.html
  - title: "PostgreSQL: Transaction Isolation"
    url: https://www.postgresql.org/docs/current/transaction-iso.html
  - title: "sqlc"
    url: https://docs.sqlc.dev/
---

## database/sql, pgx e o que cada um é

Em Go, falar com o Postgres tem dois caminhos, e os dois usam o **pgx**:

- **`database/sql` com o driver `pgx/v5/stdlib`**: a interface padrão da linguagem, com pool embutido,
  e o que bibliotecas de migração e de teste esperam. É o ponto de partida desta trilha.
- **`pgx` nativo** (`pgxpool`): API própria, mais rápida, com tipos do Postgres (arrays, `jsonb`,
  `COPY`) e erros ricos. Vale quando o serviço só fala Postgres e precisa do desempenho.

Nos dois, o erro do banco chega como **`*pgconn.PgError`**, com o `Code` do SQLSTATE: `23505`
(violação de unicidade), `40001` (falha de serialização), `40P01` (deadlock detectado). Com
`errors.AsType[*pgconn.PgError](err)` (marco 05), o código decide pelo código, nunca pela mensagem.

## O pool de conexões

O `*sql.DB` **não é uma conexão**: é um pool, seguro para uso concorrente, que se cria uma vez e se
compartilha. Três parâmetros mandam nele:

- **`SetMaxOpenConns`**: o teto de conexões abertas. Sem ele, o padrão é **ilimitado**, e um pico
  de tráfego abre conexões até o `max_connections` do Postgres recusar, derrubando todos os serviços
  que usam o mesmo banco. O tamanho certo não é "o maior possível": é o que o banco aguenta dividido
  pelas réplicas, e o dimensionamento está em `concorrencia-e-recursos/07`.
- **`SetMaxIdleConns`**: quantas ficam abertas ociosas. Abaixo do `MaxOpen`, o pool fecha e reabre
  conexões no pico.
- **`SetConnMaxLifetime`**: recicla conexões antigas (balanceador, failover do banco).

Quando todas estão em uso, a próxima operação **espera** uma voltar. É aí que dois descuidos esgotam
o pool:

- **`rows.Close()` esquecido.** Um `db.QueryContext` empresta a conexão até o `rows` ser fechado.
  Esquecer o `defer rows.Close()` (num caminho de erro, num `return` no meio do laço) deixa a conexão
  presa para sempre. Com o pool de 2 e duas `rows` abertas, a terceira query espera até o prazo do
  `ctx`. E depois do laço, `rows.Err()` diz se ele parou por erro ou por fim dos dados.
- **Query sem `context`.** `db.Query` e `db.QueryRow` sem `Context` não têm prazo: se o banco trava,
  a goroutine e a conexão travam junto. Use sempre as versões com `Context`, e deixe o linter
  `noctx` (no golangci-lint) reprovar as outras.

`db.Stats()` mostra o estado (`InUse`, `Idle`, `WaitCount`, `WaitDuration`); exporte isso como
métrica, porque `WaitDuration` subindo é o pool pedindo socorro antes da latência explodir.

## Transação com Rollback garantido

O padrão é uma função que recebe a transação e uma borda que faz o resto, com o retorno nomeado do
marco 05:

```go
func (s *Store) inTx(ctx context.Context, fn func(*sql.Tx) error) (err error) {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() {
		if p := recover(); p != nil {
			_ = tx.Rollback()
			panic(p) // devolve o panic depois de liberar a conexão
		}
		if err != nil {
			_ = tx.Rollback()
		}
	}()
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit() // o erro do Commit chega a quem chamou
}
```

O `recover` cobre o panic dentro de `fn`: sem ele, `err` continua nil no `defer`, e a transação
ficaria aberta segurando a conexão. Tudo dentro de `fn` usa o `tx`, nunca o `db`: uma query feita no `db` dentro da transação roda em
**outra conexão**, fora dela, e no pool cheio pode esperar a própria transação liberar a conexão.

## Lock, ordem e deadlock

Uma transferência lê o saldo, decide e escreve. Sem trava, duas transferências da mesma conta leem o
mesmo saldo e as duas debitam: corrida lógica, a mesma do marco 06, agora entre conexões.
`SELECT ... FOR UPDATE` trava a linha até o fim da transação. Mas travar **duas** contas abre outro
problema: a transferência A→B trava A e espera B; a B→A trava B e espera A. É um **deadlock**, e o
Postgres o detecta e aborta uma delas com `40P01`. A correção não é retry, é **ordem**: trave sempre
as contas em ordem fixa (por ID), qualquer que seja a direção da transferência. Ciclo de espera deixa
de ser possível. Os fundamentos de deadlock estão em `concorrencia-e-recursos/04`.

E quando o nível de isolamento é `SERIALIZABLE` (ou `REPEATABLE READ`), o Postgres pode abortar
uma transação com `40001`, porque a execução concorrente não equivale a nenhuma ordem serial. Não é
bug: é o banco pedindo para **repetir a transação inteira**. O laço de retry repete só os códigos
`40001` e `40P01`, com um limite, e depois devolve um erro tipado de concorrência.

## sqlc, ORM e migração

- **`sqlc`** gera código Go tipado a partir de SQL escrito à mão: a query é SQL de verdade (revisável,
  explicável com `EXPLAIN`), e o Go que a chama é verificado em tempo de compilação. Um ORM esconde o
  SQL e o custo de cada chamada, e cobra na hora do N+1. A escolha entra numa ADR.
- **Migração versionada** (golang-migrate ou goose, ambos MIT): arquivos numerados, aplicados em
  ordem, com a versão registrada no banco. Em produção, a mudança de schema segue o padrão
  expand/contract de `dados-distribuidos/11`: adicionar antes de usar, remover só depois que nenhum
  binário antigo depende.
- **`NULL`**: uma coluna anulável vira `sql.Null[T]` (Go 1.22+) ou ponteiro; `Scan` de `NULL` num
  `int64` comum é erro em tempo de execução.

## Exemplo numa fintech

O lote noturno faz milhares de transferências entre contas de clientes, com 32 workers e um pool de
10 conexões. A primeira versão travava as contas na ordem do pedido (origem, depois destino). Numa
reprodução com 40 transferências simultâneas entre duas contas, em direções opostas, **33 foram
abortadas** pelo Postgres com `deadlock_detected`. Com as travas em ordem de ID e o retry de
`40001`/`40P01`, 10 mil transferências aleatórias entre 50 contas terminaram com a soma de todos os
saldos idêntica à inicial, nenhuma conta negativa, o pool nunca acima de 10 conexões em uso e
nenhuma conexão emprestada no fim. As 9.722 esperas por conexão registradas em `db.Stats()` mostram
o outro lado: 32 workers para 10 conexões é fila, e o tamanho do pool é decisão, não acidente. A
partida dobrada em si é de `ledger-e-contabilidade/02`; aqui, o veículo para aprender a transação.

## Hands-on

**Tutorial.** Suba o Postgres no compose do `ledger-core`, crie o schema (`contas` com
`CHECK (saldo >= 0)` e `lancamentos`) e escreva o `Store` com `database/sql` e o driver pgx. Reproduza
os dois problemas: o pool de 2 esgotado por duas `rows` sem `Close` (a terceira query termina com
`context.DeadlineExceeded`), e o deadlock das travas na ordem do pedido (`40P01`).

**Desafio.** `Transfer(ctx, from, to, valor)` segura sob concorrência: `inTx`, `FOR UPDATE` nas duas
contas em ordem de ID, checagem de saldo, débito, crédito e dois lançamentos, e retry dos códigos
`40001` e `40P01` até 5 vezes, com `ErrConcorrencia` depois disso.

**Invariantes testáveis**

1. A soma de todos os saldos é a mesma antes e depois de 10 mil transferências aleatórias feitas
   por 32 goroutines.
2. Nenhuma conta fica negativa (a constraint do banco e a checagem do código).
3. Nenhum deadlock chega ao chamador: os erros possíveis são `ErrSaldoInsuficiente` e, depois das
   tentativas, `ErrConcorrencia`; qualquer outro reprova o teste.
4. Com 32 workers e `MaxOpenConns` 10, `db.Stats().WaitCount` termina maior que zero (houve fila)
   e o teste termina sem travar, com `InUse == 0`: nenhuma `rows` ou transação ficou presa.
5. Uma query sem `Context` reprova o lint do projeto (`noctx` habilitado no `.golangci.yml`).

**Complemento.** Gere o `Store` com `sqlc` a partir das mesmas queries e compare o código: o que o
gerador garantiu em tempo de compilação que você garantia só no teste?

**Checagem**

1. Por que esquecer `rows.Close()` trava o serviço inteiro, e não só aquela consulta?
2. Por que travar as contas em ordem de ID elimina o deadlock, e retry sozinho não?
3. O que o `40001` está dizendo, e por que a resposta é repetir a transação inteira?
4. Por que uma query no `db` dentro de uma função que recebeu o `tx` é bug?

## Principais aprendizados

- `*sql.DB` é um pool: limite o máximo, recicle conexões e meça as esperas.
- `rows.Close()` e `Context` em toda query; o `noctx` vigia a segunda.
- Transação numa borda com Rollback garantido e o erro do Commit devolvido.
- Trave em ordem fixa; repita só `40001` e `40P01`, com limite e erro tipado.
- SQL escrito à mão com `sqlc`, migração versionada e expand/contract.
