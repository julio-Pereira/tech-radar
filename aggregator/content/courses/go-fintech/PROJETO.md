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

- Go 1.22+ e Docker (Postgres em compose)
- `protoc` com os plugins de Go, ou `buf`
- ~4 GB de RAM livres — este é o componente leve do `fin-platform`
- `go test -race` funcionando (é usado o tempo todo aqui)
- **Não precisa:** conta em cloud paga, framework web externo. A stdlib cobre quase tudo.

## Incrementos por marco

| Marco | Entrega | Como você prova que funciona |
| --- | --- | --- |
| 01 | Repo + binário que roda, com `go test` verde | `go build ./...` e o primeiro teste passando |
| 02 | Tipos do domínio: `Money` inteiro em centavos, `Entry`, `Transaction` | Teste que prova que a soma dos lançamentos fecha em zero |
| 03 | Processamento concorrente de eventos com `context` e cancelamento | `go test -race` verde sob carga concorrente |
| 04 | BFF REST: `GET /accounts/{id}/balance` e `POST /entries` | Teste de handler com timeout do cliente respeitado |
| 05 | Antifraude em gRPC, com deadline propagado | Chamada sem resposta no prazo devolve decisão de fallback |
| 06 | Logs estruturados, métricas e traces com OTel | Trace do evento até o lançamento, com `trace_id` no log |
| 07 | Perfil de CPU e alocação do caminho quente, com melhoria medida | Benchmark antes/depois no repo, com `benchstat` |
| 08 | ADR comparando com a implementação equivalente em Java | A comparação usa números do seu ambiente, não folclore |

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
