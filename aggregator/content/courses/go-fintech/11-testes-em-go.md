---
id: testes-em-go
title: "Testes em Go"
summary: "Teste de Go é código Go: tabela, subteste, fuzz e dependência real quando importa. O fake honesto provado por teste de contrato contra o Postgres de verdade, o fuzz que acha o pânico do parser em milissegundos e a mutação que mostra o que a suíte não vê."
estimatedMinutes: 55
reviewedAt: 2026-11-08
reviewEvery: 12m
competencies: [confiabilidade]
references:
  - title: "package testing"
    url: https://pkg.go.dev/testing
  - title: "Go Fuzzing"
    url: https://go.dev/doc/security/fuzz/
  - title: "Using Subtests and Sub-benchmarks (Go blog)"
    url: https://go.dev/blog/subtests
  - title: "Testcontainers for Go"
    url: https://golang.testcontainers.org/
  - title: "Gremlins (teste de mutação em Go)"
    url: https://github.com/go-gremlins/gremlins
---

## Teste de Go é código Go

Não há framework obrigatório: um arquivo `_test.go`, funções `TestX(t *testing.T)` e `go test`. O que
uma suíte madura usa, quase tudo da stdlib:

- **Tabela com subtestes.** Uma slice de casos e um `t.Run(c.nome, ...)` por caso: cada um aparece com
  nome no relatório, roda isolado (`-run 'TestParse/valor_zero'`) e falha sem derrubar os outros.
- **`t.Parallel()`** marca o subteste para rodar em paralelo com os outros paralelos. Desde o Go
  1.22, a variável do laço é nova a cada iteração (marco 03), então o caso capturado é o certo.
- **`t.Helper()`** faz a falha apontar a linha de quem chamou o helper, não a do helper.
  **`t.Cleanup(f)`** registra a limpeza junto da criação do recurso. **`t.Context()`** (Go 1.24)
  devolve um contexto cancelado quando o teste termina, o fim dos `context.Background()` vazando
  goroutine em teste.
- **`httptest`**: `NewServer` sobe um servidor de verdade numa porta local; `NewRecorder` testa o
  handler sem rede.
- **Teste de exemplo** (`func ExampleParse()` com `// Output:`): documentação que o `go test` executa
  e confere.
- **Golden file**: a saída esperada fica em `testdata/x.golden`, e o teste compara; uma flag
  `-update` regrava quando a mudança é intencional. Bom para saída grande (um extrato, um arquivo de
  conciliação gerado).
- **As flags que pegam teste ruim**: `-race` (marco 06), `-shuffle=on` (ordem aleatória, pega teste
  que depende de outro) e `-count=N` (repetição, pega intermitência).

## Fake ou mock

Com interfaces pequenas no consumidor (marco 04), o dublê de teste mais útil é um **fake**: uma
implementação simples e real da interface, em memória, com comportamento (um mapa de saldos que
recusa débito sem saldo). Um **mock gerado** verifica chamadas ("`Debitar` foi chamado uma vez com
30"), e com isso acopla o teste à implementação: refatorar quebra o teste sem mudar comportamento.
Use mock só quando a **interação** é o que importa (o e-mail foi enviado uma vez).

O risco do fake é ele mentir: aceitar o que o Postgres recusa. A defesa é o **teste de contrato**: a
mesma função de teste, parametrizada pelo construtor do repositório, roda contra o fake e contra o
Postgres real. Se os dois passam, o fake é um substituto honesto nos testes rápidos.

## Dependência real com testcontainers

O **`testcontainers-go`** sobe um Postgres de verdade num contêiner descartável, dentro do teste:

```go
pg, err := postgres.Run(ctx, "postgres:16-alpine",
	postgres.WithDatabase("ledger"), postgres.WithUsername("ledger"), postgres.WithPassword("ledger"),
	postgres.BasicWaitStrategies())
testcontainers.CleanupContainer(t, pg)
dsn, _ := pg.ConnectionString(ctx, "sslmode=disable")
```

É lento (segundos, não milissegundos) e precisa de Docker, então fica atrás de uma **build tag**:
`//go:build integration` no arquivo, `go test -tags=integration` no CI. O desenvolvedor roda o rápido
o tempo todo; o pipeline roda os dois (`entrega-continua-e-devops/04` trata teste como gate).

## Fuzzing nativo

Desde o Go 1.18, `go test` tem **fuzzing**: uma função `FuzzX(f *testing.F)` com sementes
(`f.Add(...)`) e um corpo `f.Fuzz(func(t *testing.T, entrada string) {...})`. Com
`go test -fuzz=FuzzX`, o motor muta as entradas guiado por cobertura e procura qualquer uma que faça o
corpo falhar ou entrar em pânico. A entrada que falha vai para `testdata/fuzz/FuzzX/` e passa a rodar
em todo `go test` comum, como teste de regressão.

O fuzz é a ferramenta certa para **entrada não confiável**: o arquivo do parceiro, o payload do
webhook, o JSON do cliente. Duas propriedades valem quase sempre: **não entra em pânico** para
nenhuma entrada, e **ida e volta** (`Parse(Format(x)) == x`) para toda entrada válida.

## Cobertura e mutação

Cobertura (`go test -cover`) diz que linha **rodou**, não que alguma asserção **conferiu** o
resultado dela. É útil para achar código sem teste nenhum; como meta numérica, incentiva teste que
executa e não verifica.

O **teste de mutação** responde à pergunta certa: se eu estragar o código, a suíte percebe? A
ferramenta (Gremlins ou go-mutesting, escolha numa ADR) troca `<` por `<=`, `+` por `-`, nega
condições, e roda a suíte para cada mutante. Mutante **morto** (algum teste falhou) é bom; mutante
**vivo** é uma mudança de comportamento que nenhum teste viu, ou um mutante **equivalente**, que não
muda nada observável e precisa ser lido por uma pessoa.

## Exemplo numa fintech

O arquivo de eventos do parceiro de pagamento chega toda madrugada, uma linha por evento:
`pix;<id>;<conta>;<valor>;<unix>`. O primeiro parser confiava no formato e indexava os campos
direto. Num dia, o parceiro mandou uma linha truncada, e o processo de conciliação caiu com
`index out of range`, às 3h. A versão corrigida conta os campos antes de indexar e recusa campo vazio
e valor não positivo. O fuzz, rodado contra a versão antiga, achou o pânico **em centésimos de
segundo** (`index out of range [3] with length 1`); contra a nova, rodou 10 segundos sem achar nada,
e com a propriedade de ida e volta conferida em cada entrada aceita.

No `Allocate` do marco 01, o Gremlins gerou 14 mutantes: 13 morreram, e o único vivo foi
`rest < 0` virando `rest <= 0`, que é **equivalente**: com resto zero, trocar o sinal do passo não
muda nenhuma parte. Ler o mutante vivo e concluir isso é o trabalho; acrescentar teste para "matá-lo"
seria impossível.

## Hands-on

**Tutorial.** Escreva o teste de tabela do `Parse` com subtestes nomeados e `errors.Is` para
`ErrFormato`, e um `ExampleParse` com `// Output:`. Rode com `-shuffle=on -count=5`.

**Desafio.** Fuzz do parser de evento de pagamento e o teste de contrato do repositório de contas: a
mesma função de contrato contra o fake e contra o Postgres do testcontainers, atrás da tag
`integration`.

**Invariantes testáveis**

1. Para qualquer entrada, `Parse` não entra em pânico (`go test -fuzz=FuzzParse -fuzztime=30s` no CI
   noturno; as sementes rodam em todo `go test`).
2. `Parse(Format(x)) == x` para todo evento válido (um segundo fuzz que gera os campos), e
   `Format(Parse(s))` volta a ser aceito para toda linha aceita.
3. O teste de contrato (saldo e débito, saldo insuficiente não altera, conta inexistente, 100
   débitos concorrentes nunca negativam) passa contra o fake e contra o Postgres real.
4. Uma mutação no domínio derruba a suíte: rode a ferramenta de mutação no pacote `money` e no
   pacote do parser; todo mutante vivo está explicado (equivalente) ou ganhou um teste.

**Complemento.** Rode `go test -cover` no pacote do parser e depois apague todas as asserções de um
teste: a cobertura não muda. Rode a mutação de novo e veja quantos mutantes passam a sobreviver.

**Checagem**

1. Por que um fake precisa de teste de contrato, e um mock gerado acopla o teste à implementação?
2. O que a entrada salva em `testdata/fuzz/` passa a fazer depois que o fuzz acha uma falha?
3. Por que cobertura alta não prova que a suíte confere o resultado?
4. O que é um mutante equivalente, e por que não dá para matá-lo com um teste?

## Principais aprendizados

- Tabela com subtestes, `t.Helper`, `t.Cleanup` e `t.Context`: a stdlib cobre quase tudo.
- Fake em vez de mock, e teste de contrato para provar que o fake não mente.
- Dependência real com testcontainers, atrás de build tag.
- Fuzz para toda entrada não confiável: sem pânico e com ida e volta.
- Mutação mede a suíte; cobertura só mede execução.
