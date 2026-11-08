---
id: concorrencia
title: "Concorrência aplicada a pagamentos"
summary: "Channel é sincronização com dono, e quem fecha é quem envia. A semântica completa de channels e select, os padrões de pipeline e worker pool, errgroup com limite, context como árvore de cancelamento — e por que parar no primeiro erro precisa de mais que o errgroup."
estimatedMinutes: 60
reviewedAt: 2026-11-08
reviewEvery: 12m
competencies: [confiabilidade, performance]
references:
  - title: "Go Concurrency Patterns: Pipelines and cancellation (Go blog)"
    url: https://go.dev/blog/pipelines
  - title: "The Go Programming Language Specification: Channel types e Select statements"
    url: https://go.dev/ref/spec#Select_statements
  - title: "package context"
    url: https://pkg.go.dev/context
  - title: "package errgroup (golang.org/x/sync)"
    url: https://pkg.go.dev/golang.org/x/sync/errgroup
  - title: "The Go Memory Model"
    url: https://go.dev/ref/mem
---

## Comunique compartilhando, com critério

A máxima de Go é *"Don't communicate by sharing memory; share memory by communicating"*.
Goroutines são leves (alguns KB de pilha, que cresce sob demanda), e conversam por **channels**. O
modelo de memória, data race, deadlock e CAS são de `concorrencia-e-recursos/01`, `/02` e `/04`;
aqui fica o que é **idiomático em Go**.

**Channel não é dogma, é critério.** Use **channel** quando o que importa é a **propriedade de um
dado**: uma goroutine é a única dona de um estado, e as outras mandam mensagem em vez de disputar
acesso (o sharding por conta, abaixo). Use **`Mutex`** quando a seção crítica é curta e o acesso
concorrente ao mesmo objeto em memória é inevitável. E use **o banco** (transação, ordem de
aquisição, marco 09) quando a invariante precisa valer **entre processos**: nenhum channel protege
um dado que outro processo também escreve. As virtual threads do Java 21+ aproximam o custo, e a
comparação está em `concorrencia-e-recursos/06`.

## A semântica completa de um channel

Um channel tem dono, e o dono é **quem envia**. Daí a regra que resolve metade das dúvidas: **quem
fecha é quem envia**, e só quando não vai mais enviar. O resto é a tabela que cai em entrevista:

| Operação | Channel aberto | Channel fechado | Channel `nil` |
| --- | --- | --- | --- |
| Enviar | bloqueia até alguém receber (ou até ter vaga no buffer) | **panic** | bloqueia para sempre |
| Receber | bloqueia até chegar valor | devolve o que restou no buffer, depois zero value com `ok == false` | bloqueia para sempre |
| Fechar | ok | **panic** | **panic** |

- **Sem buffer** (`make(chan T)`), envio e recebimento se encontram: é sincronização, além de
  comunicação. **Com buffer** (`make(chan T, n)`), o envio só bloqueia com o buffer cheio: é uma
  fila limitada, e o tamanho é decisão de projeto, não um número para "dar folga".
- **`for v := range ch`** recebe até o channel ser fechado e esvaziado. Se ninguém fechar, o laço
  nunca termina.
- **Channel `nil` bloqueia para sempre**, e isso é útil: num `select`, um `case` com channel nil
  nunca é escolhido. Atribuir `nil` à variável de um channel é o jeito idiomático de **desligar** um
  `case` (a fonte terminou, o limite foi atingido).
- **`select`** espera o primeiro `case` pronto. Com **vários prontos, escolhe ao acaso**, de
  propósito, para que nenhum fique sem vez. Prioridade não existe: simula-se com dois `select`
  aninhados (o primeiro, com `default`, só olha o channel prioritário). Com `default`, o `select`
  nunca bloqueia.

## Os padrões

- **Pipeline**: estágios ligados por channels, cada estágio dono do seu channel de saída e
  responsável por fechá-lo. O cancelamento desce pelo `context`.
- **Fan-out, fan-in**: vários workers leem o mesmo channel de entrada; os resultados se juntam num
  channel de saída, fechado por quem sabe que todos terminaram (um `WaitGroup`).
- **Worker pool limitado**: N goroutines fixas lendo uma fila. É o que impede um lote de 100 mil
  itens de virar 100 mil goroutines e 100 mil conexões abertas para o mesmo banco.
- **Semáforo com channel com buffer**: `sem := make(chan struct{}, n)`; `sem <- struct{}{}` para
  entrar e `<-sem` para sair. Limita concorrência sem um pool fixo.

## errgroup e context

O `errgroup.Group` (de `golang.org/x/sync`) é o `WaitGroup` que sabe de erro. Com
`errgroup.WithContext`, o primeiro `g.Go` que devolve erro **cancela o contexto** do grupo, e `Wait`
devolve esse erro. Com **`SetLimit(n)`**, `g.Go` bloqueia enquanto houver `n` em voo: é o worker
pool limitado sem código de pool.

Há um detalhe que o "para no primeiro erro" esconde: o grupo só cancela o contexto quando a função
que falhou **retorna**, e uma goroutine que já passou pela checagem `ctx.Err()` começa mesmo assim.
Numa medição com 8 em voo, até **8 eventos começaram depois de o erro já ter sido detectado**. Para
"nada novo começa depois do erro", a parada precisa de uma comporta explícita: a checagem e o
registro de início sob o mesmo mutex que fecha a comporta no erro.

O `context.Context` é uma **árvore de cancelamento**: cada `WithCancel`, `WithTimeout` ou
`WithDeadline` cria um filho que é cancelado quando o pai é. Dois acréscimos recentes ajudam em
produção: `WithCancelCause` e `context.Cause` (Go 1.20) carregam **o motivo** do cancelamento, e
não só "context canceled"; `context.AfterFunc` (Go 1.21) agenda uma função para quando o contexto
terminar, sem uma goroutine parada esperando. E o que o `context` **não** é: `context.Value` serve
para dado do escopo da requisição que atravessa APIs (um ID de correlação), **não** para injeção de
dependência. Um repositório tirado de `ctx.Value("repo")` é uma dependência invisível que o
compilador não vê e o teste esquece.

## Exemplo numa fintech: batch de 100 mil transações

O processador de lote (folha de pagamento, liquidação da adquirência, conciliação) recebe um CSV com
100 mil eventos. O risco mortal é a **corrida de saldo**: dois workers alterando a mesma conta ao
mesmo tempo. A solução idiomática não é um lock global, e sim **sharding por conta**: o hash da conta
escolhe o worker, então eventos da mesma conta são sempre sequenciais, e contas diferentes correm em
paralelo.

```go
shard := fnv32(ev.Account) % uint32(numWorkers)
queues[shard] <- ev // mesma conta, mesma goroutine: sem corrida de saldo
```

```diagrama
go-sharding-por-conta
```

A mesma ideia vale para o estado em memória: um mapa de saldos dividido em 16 shards, cada um com o
seu mutex, faz contas diferentes raramente disputarem o mesmo lock. E o lote tem uma segunda
exigência, de integridade: um evento inválido (valor zero, conta vazia) significa que o arquivo está
corrompido, e o lote inteiro precisa parar ali, sem processar o resto.

**O que `-race` não vê.** O detector acusa um acesso concorrente inseguro à memória que **de fato
ocorreu** na execução. Ele não prova ausência, e não pega **race condition lógica** (ler, decidir e
escrever sem que a sequência seja atômica). Um `-race` limpo não é certidão de que o sharding está
certo. Por isso o lote termina com uma reconciliação, e o teste compara com o processamento
sequencial.

## Hands-on

**Tutorial.** Reescreva o processamento do lote com `errgroup`: `errgroup.WithContext`,
`g.SetLimit(8)`, um `g.Go` por evento aplicando num mapa de saldos com shards, e `g.Wait()` no fim.
Gere 100 mil eventos sintéticos sobre 2 mil contas com `math/rand/v2` e semente fixa.

**Desafio.** Processe os 100 mil eventos com no máximo N em voo e parada no primeiro erro de
integridade. Instrumente um contador atômico de eventos em voo com registro do pico (laço de
`CompareAndSwap`), e implemente a comporta: `enter()` checa e registra o início sob um mutex, e o
evento inválido fecha a comporta antes de devolver o erro.

**Invariantes testáveis**

1. A concorrência observada nunca passa de N (o pico registrado é `≤ N`).
2. Depois do primeiro erro, nenhum evento novo começa; no máximo os N−1 que já estavam em voo ainda
   terminam; nenhum evento continua rodando depois que o processamento retorna. Cuidado com a
   tentação de afirmar "começaram no máximo `k + N` eventos" (com `k` o índice do evento ruim):
   goroutines rodam fora da ordem de despacho, e eventos depois do `k` podem ter começado e terminado
   antes dele.
3. Sem eventos inválidos, o saldo final de cada conta é idêntico ao do processamento sequencial.
4. `go test -race -count=20` fica verde.

**Complemento.** Tire a comporta e deixe só a checagem de `ctx.Err()`. Meça, em 200 rodadas, quantos
eventos começam depois de o erro já ter sido detectado (uma flag atômica marcada no evento ruim). Leve
o número para a explicação de por que o `errgroup` sozinho não basta.

**Checagem**

1. O que acontece ao enviar num channel fechado, ao receber de um channel fechado e ao receber de um
   channel nil?
2. Por que quem fecha o channel é quem envia?
3. Por que o `errgroup` cancela "no primeiro erro" e mesmo assim outros eventos podem começar depois
   dele?
4. Por que `context.Value` não serve para injetar um repositório?

## Principais aprendizados

- Channel para propriedade de dado, mutex para seção crítica curta, banco para invariante entre
  processos.
- Fechar é de quem envia; channel nil desliga um `case`; `select` com vários prontos sorteia.
- `errgroup` com `SetLimit` é o worker pool limitado; "parar no primeiro erro" exato precisa de uma
  comporta.
- `context` é árvore de cancelamento com causa; `context.Value` não é injeção de dependência.
- `-race` limpo não prova ausência de corrida lógica; teste o invariante contra o sequencial.
