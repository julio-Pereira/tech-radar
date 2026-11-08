# Projeto guia — ledger-core

> Componente do `fin-platform`, o sistema que atravessa as trilhas. Este arquivo não é
> um marco: é a especificação do projeto pessoal que você constrói enquanto lê a trilha.
> O `ledger-core` é o coração contábil: recebe eventos de pagamento, decide risco e
> lança em partida dobrada. É o componente onde errar custa dinheiro de verdade.

## O que você vai construir

Um ledger em Go, com antifraude ao lado, organizado em três módulos de negócio (`ledger`,
`antifraude`, `extrato`) num monolito modular. O ledger registra lançamentos que sempre fecham em
zero, nunca apaga nada (estorno é lançamento novo), grava no Postgres com transação e ordem de
trava, e sobrevive a receber o mesmo pedido cinquenta vezes. O antifraude expõe uma API gRPC com
deadline, e a decisão sai mesmo quando o modelo não responde. Tudo observável, encerrável sem perder
lançamento e empacotado numa imagem sem root.

É o componente ideal para aprender Go vindo de Java: a semântica da linguagem (slices, interfaces,
erros), concorrência com goroutines e `context`, e a disciplina de serviço que a stdlib não impõe.
A profundidade contábil (fechamento, conciliação) é da trilha `ledger-e-contabilidade`; aqui o
ledger é o veículo.

## Pré-requisitos

- Go 1.27 (baseline; o 1.26 ainda tem suporte — ver "Versões do Go" abaixo) e Docker, com o
  Postgres no compose
- `buf`, `protoc-gen-go` e `protoc-gen-go-grpc` (marco 10)
- `golangci-lint` (com `exhaustive`, `gochecksumtype`, `staticcheck`, `errcheck`, `gosec`, `noctx`),
  `govulncheck` e `benchstat`, fixados no `go.mod` com a diretiva `tool`
- Bibliotecas de teste: `go.uber.org/goleak` e `testcontainers-go` (com o módulo `postgres`)
- ~4 GB de RAM livres
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
| 01 | Módulo com `go 1.27`, `Money` e `Allocate` | Teste de propriedade: a soma das partes é o todo, com `-shuffle=on -count=20` |
| 02 | `AccountID` que não nasce inválido, `Ledger` com zero value útil, `Kind` com `iota` | Tabela de `Parse`; zero value recusado; `exhaustive` reprova o `switch` incompleto |
| 03 | Extrato paginado sem aliasing | `append` no slice devolvido não altera a página seguinte; `-race` com leitores |
| 04 | Decisão do antifraude como tipo fechado | `go build` de um tipo de fora falha; `gochecksumtype` e SA4023 no CI |
| 05 | Taxonomia de erros e mapeamento para HTTP; worker com `recover` | Erro de infraestrutura não vaza; o erro do `Commit` chega a quem chamou |
| 06 | Lote com no máximo N em voo e parada no primeiro erro | Pico ≤ N; nada começa depois do erro; saldo igual ao sequencial |
| 07 | Cliente de PSP com hedging | `goleak` limpo após 10 mil chamadas; `synctest` prova o cancelamento |
| 08 | `POST /entries` idempotente, Problem Details, shutdown | 50 repetições paralelas, um lançamento; Slowloris derrubado no prazo |
| 09 | Transferência no Postgres com ordem de trava e retry | 10 mil transferências conservam a soma; pool nunca acima do limite |
| 10 | Antifraude gRPC com deadline e fallback | Fallback dentro do prazo; `buf breaking` reprova mudança incompatível |
| 11 | Fuzz do parser e teste de contrato | Sem pânico; ida e volta; contrato verde no fake e no Postgres real |
| 12 | Config validada, `slog` com `trace_id`, readiness no drain | `trace_id` do log = do span; CPF não vaza; 503 no drain |
| 13 | mTLS, cliente de webhook anti-SSRF, imagem distroless | `govulncheck` limpo; IP interno recusado; imagem sem root e sem shell |
| 14 | Caminho quente otimizado; `GOMEMLIMIT` no contêiner | `benchstat` com p < 0,05; sem OOM no teste de carga |
| 15 | Módulos `ledger`, `antifraude`, `extrato` | Teste de arquitetura sobre `go list`; `internal/` fecha cada módulo |
| 16 | ADR Go × Java com números do seu ambiente | Três números medidos, com o comando que os gera |

## Definição de pronto (capstone)

- [ ] `docker compose up && go run ./cmd/ledger` sobe em máquina limpa
- [ ] **Invariante:** a soma dos lançamentos de toda transação é exatamente zero, e 10 mil
      transferências concorrentes conservam a soma de todos os saldos
- [ ] Dinheiro é inteiro na menor unidade — nenhum `float` no caminho do valor
- [ ] A mesma `Idempotency-Key` enviada 50 vezes em paralelo produz **um** lançamento
- [ ] Estorno é lançamento novo; nada é apagado nem editado
- [ ] `go test -race ./...` verde, e `goleak` sem goroutine sobrando nos testes de concorrência
- [ ] O fuzz do parser de eventos roda sem pânico
- [ ] O antifraude responde dentro do deadline mesmo com o modelo fora do ar
- [ ] O `Shutdown` não perde lançamento em voo
- [ ] `govulncheck ./...` sem vulnerabilidade alcançável
- [ ] Uma ADR por bloco: tipos do domínio, concorrência, persistência, gRPC × REST, segurança e
      Go × Java

## Decisões de ferramenta (ADR)

| Escolha | Opções | Critério |
| --- | --- | --- |
| Migração de schema | golang-migrate, goose (ambos MIT) | goose aceita migração em Go além de SQL; golang-migrate tem mais drivers |
| Teste de mutação | Gremlins (Apache-2.0), go-mutesting (MIT) | Gremlins funcionou no Go 1.27 mas está sem release desde 2024; go-mutesting é ativo, sem tag |
| Exaustividade | `exhaustive` (enum de `iota`), `gochecksumtype` (interface fechada) | os dois, cada um no seu caso, pelo golangci-lint |
| Acesso a dados | `sqlc` × ORM | SQL revisável e checado na compilação; ORM esconde o custo |

## Game day

Provoque cada cenário e escreva um post-mortem de uma página — inclusive quando nada quebrar.

1. **Reenviar o mesmo pedido** 50 vezes em paralelo. O saldo muda? Se mudar, a idempotência é
   ilusão.
2. **Derrubar o modelo do antifraude** e enviar pagamentos. A decisão de fallback é aprovar ou negar —
   e quem tomou essa decisão de negócio, você ou o timeout?
3. **Cancelar o `context`** no meio de uma transferência. Sobrou lançamento pela metade?
4. **Esgotar o pool de conexões** (uma consulta lenta segurando todas as conexões). O serviço espera
   para sempre, ou falha no prazo e se recupera quando a consulta termina?
5. **Clientes cancelando em massa** durante o hedging do PSP. O número de goroutines volta ao normal
   depois do pico?
6. **Processar um estorno antes do débito** correspondente. O ledger aceita em estado pendente,
   rejeita ou perde dinheiro do cliente?

## Regra das horas

`estimatedHours` ≈ 2 × Σ `estimatedMinutes`: os 16 marcos somam 845 minutos de leitura, e o hands-on
dobra isso; 845 × 2 / 60 = 28,2, arredondado para **28 horas**.
