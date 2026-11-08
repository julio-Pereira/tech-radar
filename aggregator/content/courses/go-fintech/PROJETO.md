# Projeto guia — ledger-core

> Componente do `fin-platform`, o sistema que atravessa as trilhas. Este arquivo não é
> um marco: é a especificação do projeto pessoal que você constrói enquanto lê a trilha.
> O `ledger-core` é o coração contábil: recebe eventos de pagamento, decide risco e
> lança em partida dobrada. É o componente onde errar custa dinheiro de verdade.

## O que você vai construir

Um ledger double-entry em Go, com um serviço de antifraude ao lado. O ledger registra
lançamentos que sempre fecham em zero, nunca apaga nada (estorno é lançamento novo) e
sobrevive a receber o mesmo evento duas vezes. O antifraude expõe uma API gRPC de
decisão com prazo curto — e a decisão precisa sair mesmo quando a dependência não responde.

É o componente ideal para aprender Go vindo de Java: concorrência com goroutines e
`context`, erros como valores, e a diferença de custo entre um BFF REST e um serviço
gRPC no caminho quente.

## Pré-requisitos

- Go 1.27 (baseline; o 1.26 ainda tem suporte — ver "Versões do Go" abaixo) e Docker (Postgres em compose)
- `protoc` com os plugins de Go, ou `buf`
- ~4 GB de RAM livres — este é o componente leve do `fin-platform`
- `go test -race` funcionando (é usado o tempo todo aqui)
- **Não precisa:** conta em cloud paga, framework web externo. A stdlib cobre quase tudo.

## Versões do Go

**Baseline: Go 1.27** (última estável em nov/2026: 1.27.3). O Go suporta cada versão até
existirem duas mais novas, então o **1.26** ainda recebe correções; nada abaixo dele é alvo.
O `go.mod` do projeto declara `go 1.27`: desde o Go 1.21 essa linha é um **mínimo estrito**
(um toolchain mais velho se recusa a compilar) e também fixa o comportamento padrão das
mudanças controladas por `GODEBUG`.

Cada recurso que a trilha usa, com a versão em que entrou — conferido nas release notes
oficiais (`go.dev/doc/go1.NN`), nunca de memória:

| Recurso | Versão | Marco |
| --- | --- | --- |
| `atomic.Int64`, `atomic.Pointer[T]` e demais tipos atômicos | 1.19 | 07 |
| Limite de memória suave (`GOMEMLIMIT`, `debug.SetMemoryLimit`) | 1.19 | 14 |
| `errors.Join` e vários `%w` no mesmo `fmt.Errorf` | 1.20 | 05 |
| `context.WithCancelCause` e `context.Cause` | 1.20 | 06 |
| Linha `go` do `go.mod` como mínimo estrito, linha `toolchain`, `GODEBUG` pela versão do módulo | 1.21 | 01 |
| Pacotes `slices`, `maps` e `cmp`; funções nativas `min`, `max` e `clear` | 1.21 | 03 |
| `context.AfterFunc` | 1.21 | 06 |
| `sync.OnceFunc`, `sync.OnceValue`, `sync.OnceValues` | 1.21 | 07 |
| `log/slog` | 1.21 | 12 |
| PGO estável (`-pgo=auto` lê `default.pgo` do pacote `main`) | 1.21 | 14 |
| Variável de `for` nova a cada iteração; `range` sobre inteiro | 1.22 | 03 |
| `ServeMux` com método e curinga no padrão (`GET /entries/{id}`, `r.PathValue`) | 1.22 | 08 |
| `math/rand/v2` | 1.22 | 13 |
| Servidor `crypto/tls` com TLS 1.2 como mínimo padrão (no cliente, desde 1.18) | 1.22 | 13 |
| `range` sobre função (iteradores) e pacote `iter` | 1.23 | 03, 04 |
| `os.Root` (acesso a arquivos confinado a um diretório) | 1.24 | 13 |
| `T.Context` e `B.Context` | 1.24 | 11 |
| `testing.B.Loop` (no 1.26 deixou de impedir *inlining* no corpo) | 1.24 | 14 |
| Diretiva `tool` no `go.mod` (`go get -tool`, `go tool <nome>`) | 1.24 | 13, 15 |
| `testing/synctest` estável (`synctest.Test`; experimental no 1.24); `synctest.Sleep` no 1.27 | 1.25 | 07, 11 |
| `sync.WaitGroup.Go` | 1.25 | 07 |
| `GOMAXPROCS` padrão ciente do limite de CPU do cgroup | 1.25 | 14 |
| `new(expr)`: `new` aceita uma expressão como valor inicial | 1.26 | 02 |
| `errors.AsType[T]`, versão genérica de `errors.As` | 1.26 | 05 |
| Coletor de lixo Green Tea como padrão | 1.26 | 14 |
| Perfil `goroutineleak` (experimental no 1.26) | 1.27 | 07 |
| Métodos genéricos (um método pode declarar parâmetros de tipo) | 1.27 | 04 |
| `encoding/json/v2` e `encoding/json/jsontext`; `encoding/json` passa a usar a implementação v2 | 1.27 | 08 |
| Pacote `uuid` | 1.27 | 08, 09 |
| `go vet` (printf) acusa `%w` com ponteiro para um tipo cujo valor já implementa `error` | 1.27 | 05 |
| `go test` roda a checagem `stdversion` (símbolo mais novo que a linha `go`) | 1.27 | 01 |

Recursos de 1.26 e 1.27 aparecem no texto marcados com a versão ("Go 1.27+"), para quem
ainda está no 1.26 saber o que não vai compilar.

## Incrementos por marco

| Marco | Entrega | Como você prova que funciona |
| --- | --- | --- |
| 01 | Repo + binário que roda, com `go test` verde | `go build ./...` e o primeiro teste passando |
| 02 | Tipos do domínio: `Money` inteiro em centavos, `Entry`, `Transaction` | Teste que prova que a soma dos lançamentos fecha em zero |
| 06 | Processamento concorrente de eventos com `context` e cancelamento | `go test -race` verde sob carga concorrente |
| 08 | BFF REST: `GET /accounts/{id}/balance` e `POST /entries` | Teste de handler com timeout do cliente respeitado |
| 10 | Antifraude em gRPC, com deadline propagado | Chamada sem resposta no prazo devolve decisão de fallback |
| 12 | Logs estruturados, métricas e traces com OTel | Trace do evento até o lançamento, com `trace_id` no log |
| 14 | Perfil de CPU e alocação do caminho quente, com melhoria medida | Benchmark antes/depois no repo, com `benchstat` |
| 16 | ADR comparando com a implementação equivalente em Java | A comparação usa números do seu ambiente, não folclore |

## Definição de pronto (capstone)

- [ ] `docker compose up && go run ./cmd/ledger` sobe em máquina limpa
- [ ] **Invariante:** a soma dos lançamentos de toda transação é exatamente zero, provada por teste
- [ ] Dinheiro é inteiro na menor unidade — nenhum `float` no caminho do valor
- [ ] O mesmo evento processado duas vezes produz **um** lançamento
- [ ] Estorno é lançamento novo; nada é apagado nem editado
- [ ] `go test -race ./...` verde, inclusive nos testes de concorrência
- [ ] O antifraude responde dentro do deadline mesmo com a dependência fora do ar
- [ ] Uma ADR por bloco: modelo de dados do ledger, concorrência, gRPC vs REST, Go vs Java

## Game day

Provoque cada cenário e escreva um post-mortem de uma página — inclusive quando nada quebrar.

1. **Reenviar o mesmo evento** 50 vezes. O saldo muda? Se mudar, a idempotência é ilusão.
2. **Derrubar o antifraude** e enviar pagamentos. A decisão de fallback é negar ou
   aprovar — e quem tomou essa decisão de negócio, você ou o timeout?
3. **Cancelar o `context`** no meio de uma transação. Sobrou lançamento pela metade?
4. **Rodar com `-race` sob carga.** Alguma corrida aparece só com 500 goroutines?
5. **Processar um estorno antes do débito** correspondente. O ledger aceita em estado
   pendente, rejeita ou perde dinheiro do cliente?
