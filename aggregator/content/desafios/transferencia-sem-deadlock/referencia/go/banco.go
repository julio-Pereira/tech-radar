package ledger

import (
	"errors"
	"sort"
	"sync"
)

var (
	ErrValorInvalido    = errors.New("ledger: valor precisa ser positivo")
	ErrMesmaConta       = errors.New("ledger: origem e destino iguais")
	ErrContaInexistente = errors.New("ledger: conta inexistente")
)

type conta struct {
	mu    sync.Mutex
	saldo int64
}

// Banco: uma trava por conta, sempre adquiridas na ordem do id. Duas
// transferências opostas pedem as travas na mesma ordem, e o ciclo de espera
// que faz o deadlock não se forma.
type Banco struct {
	contas map[string]*conta
	ids    []string // ordenados, para o Total travar tudo na mesma ordem
}

func New(saldos map[string]int64) *Banco {
	b := &Banco{contas: map[string]*conta{}}
	for id, s := range saldos {
		b.contas[id] = &conta{saldo: s}
		b.ids = append(b.ids, id)
	}
	sort.Strings(b.ids)
	return b
}

func (b *Banco) Transferir(origem, destino string, centavos int64) (bool, error) {
	if centavos <= 0 {
		return false, ErrValorInvalido
	}
	if origem == destino {
		return false, ErrMesmaConta
	}
	o, okO := b.contas[origem]
	d, okD := b.contas[destino]
	if !okO || !okD {
		return false, ErrContaInexistente
	}
	primeira, segunda := o, d
	if destino < origem {
		primeira, segunda = d, o
	}
	primeira.mu.Lock()
	defer primeira.mu.Unlock()
	segunda.mu.Lock()
	defer segunda.mu.Unlock()
	if o.saldo < centavos {
		return false, nil
	}
	o.saldo -= centavos
	d.saldo += centavos
	return true, nil
}

func (b *Banco) Saldo(id string) int64 {
	c, ok := b.contas[id]
	if !ok {
		return 0
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.saldo
}

func (b *Banco) Total() int64 {
	for _, id := range b.ids {
		b.contas[id].mu.Lock()
	}
	var t int64
	for _, id := range b.ids {
		t += b.contas[id].saldo
	}
	for i := len(b.ids) - 1; i >= 0; i-- {
		b.contas[b.ids[i]].mu.Unlock()
	}
	return t
}
