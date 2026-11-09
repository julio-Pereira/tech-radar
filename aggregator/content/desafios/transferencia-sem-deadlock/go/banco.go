// Package ledger é o esqueleto do desafio transferencia-sem-deadlock em Go:
// transferências concorrentes entre contas, sem deadlock e sem perder
// dinheiro. Os testes em banco_test.go falham até a implementação estar
// certa. Rode com: go test -race ./...
package ledger

import "errors"

var (
	ErrValorInvalido    = errors.New("ledger: valor precisa ser positivo")
	ErrMesmaConta       = errors.New("ledger: origem e destino iguais")
	ErrContaInexistente = errors.New("ledger: conta inexistente")
)

// Banco guarda saldos em centavos.
type Banco struct {
	// TODO: os campos que a sua implementação precisar.
}

// New cria o banco com os saldos iniciais (o mapa é copiado).
func New(saldos map[string]int64) *Banco {
	// TODO
	return &Banco{}
}

// Transferir move centavos de origem para destino. Devolve (false, nil) se
// o saldo da origem não basta; erro para valor não positivo, mesma conta ou
// conta inexistente. Precisa ser seguro com muitas goroutines e nunca travar.
func (b *Banco) Transferir(origem, destino string, centavos int64) (bool, error) {
	// TODO
	return false, nil
}

// Saldo devolve o saldo atual da conta.
func (b *Banco) Saldo(conta string) int64 {
	// TODO
	return -1
}

// Total devolve a soma de todos os saldos, num instante consistente.
func (b *Banco) Total() int64 {
	// TODO
	return -1
}
