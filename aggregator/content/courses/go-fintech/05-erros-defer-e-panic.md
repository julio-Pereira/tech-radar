---
id: erros-defer-e-panic
title: "Erros, defer e panic"
summary: "Erro é valor com contexto; panic é para bug, não para fluxo. errors.Is, As e AsType, onde embrulhar, a semântica exata do defer, o recover na borda e o erro do Commit que não pode sumir."
estimatedMinutes: 50
reviewedAt: 2026-11-08
reviewEvery: 12m
competencies: [confiabilidade]
references:
  - title: "Working with Errors in Go 1.13 (Go blog)"
    url: https://go.dev/blog/go1.13-errors
  - title: "Errors are values (Go blog)"
    url: https://go.dev/blog/errors-are-values
  - title: "Defer, Panic, and Recover (Go blog)"
    url: https://go.dev/blog/defer-panic-and-recover
  - title: "Package errors (errors.Is, As, AsType, Join)"
    url: https://pkg.go.dev/errors
  - title: "Go 1.27 Release Notes: vet e %w com ponteiro"
    url: https://go.dev/doc/go1.27#vet
---

## Erro é valor

Go não tem exceção. Uma função que pode falhar devolve um `error` como último retorno, e quem chama
decide na hora: `if err != nil`. Parece verboso até a primeira investigação de incidente: o caminho de
erro está escrito no código, onde dá para ler, e não num `catch` três camadas acima. Mas valor sem
contexto não ajuda. `connection refused` no log não diz qual transferência falhou. Por isso se
**embrulha** ao subir uma camada, com `fmt.Errorf("transfer %s -> %s: %w", from, to, err)`: o `%w`
guarda o erro original dentro do novo, e a mensagem final vira uma frase que conta a história.

Três formas de um erro carregar significado, da mais simples à mais flexível:

- **Sentinela**: um valor fixo (`var ErrSaldoInsuficiente = errors.New(...)`), comparado com
  `errors.Is(err, ErrSaldoInsuficiente)`. `Is` percorre a cadeia de `%w`, então funciona depois de
  qualquer número de embrulhos.
- **Tipo de erro**: uma struct com dados (`*LimiteError{Limite: 500}`), extraída com
  `errors.As(err, &alvo)`, ou com **`errors.AsType[*LimiteError](err)`** desde o Go 1.26, a versão
  genérica: mais curta, tipada e sem o risco do alvo errado. O alvo de `As` precisa ser um ponteiro
  para um tipo que implementa `error`: passar `&v` com `v LimiteError` (quando o método é do
  ponteiro) **entra em pânico** em tempo de execução, e o `go vet` acusa antes.
- **Comportamento**: o chamador testa uma interface (`interface{ Temporary() bool }`) e não sabe o
  tipo concreto. Útil entre pacotes, para decidir retentar sem acoplar.

Desde o Go 1.20, um erro pode embrulhar **vários**: `errors.Join(e1, e2)` ou dois `%w` no mesmo
`fmt.Errorf`. `errors.Is` encontra qualquer um deles. É o formato natural do resultado de um lote, em
que três de mil itens falharam por motivos diferentes.

Um detalhe que o Go 1.27 passou a vigiar: embrulhar com `%w` um **ponteiro** para um tipo cujo
**valor** já implementa `error` (`Timeout` com método de valor, embrulhado como `&Timeout{}`) faz
`errors.AsType[Timeout]` falhar silenciosamente, porque a cadeia guarda `*Timeout`. O `go vet` do
1.27 acusa (`%w wants operand of error type Timeout, not pointer type *Timeout`). Ele é parente do nil
tipado do marco 04.

## Onde embrulhar, e onde não

Embrulhe nas **fronteiras**: ao sair de um pacote, ao cruzar uma chamada de rede, onde o contexto
novo (qual conta, qual lote) é informação que o erro de baixo não tem. Não embrulhe em laço quente
(cada `fmt.Errorf` aloca) nem repita o mesmo contexto em cada camada.

E não **registre e devolva** ao mesmo tempo. Se cada camada faz `log.Error(err); return err`, o mesmo
erro aparece cinco vezes no log, com cinco níveis de contexto, e ninguém sabe qual linha é o
incidente. A regra: quem decide o que fazer com o erro (responder ao cliente, abortar o lote) é quem
registra; as camadas de baixo só embrulham.

## Domínio e infraestrutura

O erro que chega ao handler é de um de dois tipos, e eles são tratados diferente:

- **Domínio** (saldo insuficiente, conta inexistente, moeda diferente): faz parte do contrato. Tem
  código estável e mensagem que pode ir para o cliente, e mapeia para um 4xx específico.
- **Infraestrutura** (banco fora, timeout, DNS): o cliente não pode fazer nada com ele, e a mensagem
  real é perigosa. `dial tcp 10.0.3.7:5432` entrega a topologia da rede; uma string de conexão
  entrega a senha. Vai para o log com todo o detalhe; para o cliente vai um 500 genérico.

Uma taxonomia explícita (uma lista dos erros de domínio, cada um com seu código e status) torna o
mapeamento testável. É ela que o marco 08 transforma em `application/problem+json` e o marco 10 em
`status` do gRPC.

## defer: ordem, avaliação e retorno

`defer` agenda uma chamada para o fim da função, e três regras explicam todo comportamento estranho:

1. **Ordem inversa (LIFO)**: o último `defer` registrado roda primeiro.
2. **Os argumentos são avaliados na hora do `defer`**, não na hora em que ele roda.
   `defer fmt.Println(saldo)` grava o valor de `saldo` naquele momento. Uma closure
   (`defer func() { fmt.Println(saldo) }()`) lê a variável no fim.
3. **Um `defer` pode alterar retornos nomeados**, porque roda depois do `return` atribuir o valor e
   antes de a função devolver. É assim que se acrescenta contexto ou se faz `Rollback` em qualquer
   caminho de erro.

O custo, que já foi argumento contra `defer` em código quente, caiu muito com os *open-coded defers*
do Go 1.14. Hoje a regra é usar sempre que ele deixa o fechamento correto em todos os caminhos.

## panic e recover: só na borda

`panic` é para **bug**: um estado que o programa não deveria alcançar (o `default` de um `switch`
exaustivo, um índice fora do slice). Não é para fluxo: "conta não encontrada" é erro, não panic.
`recover` só tem efeito **dentro de uma função adiada**: chamado num fluxo normal, devolve nil e não
faz nada.

E a regra que derruba processos em produção: **um panic que escapa de uma goroutine encerra o
programa inteiro**, não só a goroutine. Um worker que processa eventos numa goroutine própria precisa
de um `recover` **na borda**: no laço que chama o código de domínio, não espalhado dentro dele. A
borda recupera, registra com o stack (`runtime/debug.Stack()`) e segue para o próximo evento. Um
handler HTTP da stdlib já tem essa borda por requisição; um worker seu, não.

## Exemplo numa fintech

A transferência abre uma transação e escreveu-se o "padrão" que circula em blog:

```go
func TransferBuggy(tx Tx) error {
	defer tx.Rollback()
	if err := tx.Exec("UPDATE ..."); err != nil {
		return err
	}
	tx.Commit()
	return nil
}
```

O `Commit` falha (conflito de serialização no Postgres, marco 09), mas a função devolve `nil`. O
cliente recebe 200, o lançamento não existe, e a conciliação do dia seguinte acha a diferença. O
`errcheck` do golangci-lint aponta as duas linhas (`tx.Commit` e `tx.Rollback` com erro ignorado). A
versão correta usa retorno nomeado: o `defer` vê o erro final e só faz `Rollback` se algo falhou, e o
erro do `Commit` volta para quem chamou:

```go
func Transfer(tx Tx) (err error) {
	defer func() {
		if err != nil {
			if rbErr := tx.Rollback(); rbErr != nil {
				err = fmt.Errorf("%w (rollback também falhou: %v)", err, rbErr)
			}
		}
	}()
	if err := tx.Exec("UPDATE ..."); err != nil {
		return fmt.Errorf("débito: %w", err)
	}
	return tx.Commit()
}
```

## Hands-on

**Tutorial.** Implemente `TransferBuggy` e `Transfer` sobre uma interface `Tx` pequena (`Exec`,
`Commit`, `Rollback`), com um fake em teste cujo `Commit` devolve erro. Mostre que a versão com bug
devolve `nil`, e que `errcheck` aponta as duas linhas.

**Desafio.** A taxonomia de erros do ledger e o mapeamento para HTTP: um tipo `*Domain` (código,
mensagem, status), as sentinelas do domínio numa lista `Todos`, e uma função `ToHTTP(err) Response`
que usa `errors.AsType[*Domain]` e devolve 500 genérico para o resto. Mais um worker de eventos com
`recover` na borda.

**Invariantes testáveis**

1. Todo erro de domínio da lista `Todos` mapeia para exatamente um status 4xx, com código único,
   mesmo depois de embrulhado com `%w` (teste de tabela sobre a taxonomia inteira).
2. Erro de infraestrutura nunca vaza mensagem interna: para uma tabela de erros reais (`dial tcp`,
   string de conexão com senha, `sql: connection is already closed`, um stack), a resposta é 500 e
   não casa com nenhum padrão de vazamento (regex de DSN, IP com porta, `arquivo.go:linha`,
   `goroutine N`).
3. Um `panic` num evento é recuperado, registrado com o ID do evento, e o worker processa os eventos
   seguintes (o teste conta os processados e lê o log).
4. O erro do `Commit` chega a quem chamou (`errors.Is` com o erro do fake), há `Rollback` quando o
   `Commit` falha, e não há `Rollback` no caminho feliz.

**Complemento.** Troque `errors.AsType[*Domain]` por `errors.As(err, &d)` com `var d Domain` (sem
ponteiro). Rode o teste (pânico) e o `go vet` (acusa antes). Volte para a versão genérica.

**Checagem**

1. Por que `defer fmt.Println(saldo)` e `defer func() { fmt.Println(saldo) }()` podem imprimir
   valores diferentes?
2. Por que um panic numa goroutine de worker derruba o serviço HTTP inteiro, e onde fica o `recover`?
3. O que se perde quando cada camada registra o erro antes de devolvê-lo?
4. Por que a mensagem de um erro de infraestrutura não pode ir para o cliente?

## Principais aprendizados

- Erro é valor: embrulhe com `%w` nas fronteiras, inspecione com `errors.Is` e `errors.AsType`.
- Registre onde decide, não em cada camada.
- Erro de domínio tem contrato e status; erro de infraestrutura vai para o log, não para o cliente.
- `defer` roda em ordem inversa, avalia argumentos na hora e pode alterar retornos nomeados.
- `panic` é para bug; `recover` só na borda, e toda goroutine sua precisa da dela.
