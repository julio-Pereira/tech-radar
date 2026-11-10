package ledger

import (
	"errors"
	"fmt"
	"math/rand"
	"sync"
	"testing"
	"time"
)

func TestTransferenciaSimples(t *testing.T) {
	b := New(map[string]int64{"a": 1000, "b": 0})
	ok, err := b.Transferir("a", "b", 300)
	if !ok || err != nil {
		t.Fatalf("Transferir = %v, %v; quer true, nil", ok, err)
	}
	if b.Saldo("a") != 700 || b.Saldo("b") != 300 {
		t.Fatalf("saldos = %d, %d; quer 700, 300", b.Saldo("a"), b.Saldo("b"))
	}
}

func TestSaldoInsuficienteNaoMudaNada(t *testing.T) {
	b := New(map[string]int64{"a": 100, "b": 0})
	ok, err := b.Transferir("a", "b", 101)
	if ok || err != nil {
		t.Fatalf("Transferir = %v, %v; quer false, nil", ok, err)
	}
	if b.Saldo("a") != 100 || b.Saldo("b") != 0 {
		t.Fatal("saldo insuficiente alterou os saldos")
	}
}

func TestEntradasInvalidas(t *testing.T) {
	b := New(map[string]int64{"a": 100, "b": 0})
	casos := []struct {
		o, d string
		v    int64
		want error
	}{{"a", "b", 0, ErrValorInvalido}, {"a", "b", -5, ErrValorInvalido}, {"a", "a", 10, ErrMesmaConta}, {"a", "x", 10, ErrContaInexistente}}
	for _, c := range casos {
		if _, err := b.Transferir(c.o, c.d, c.v); !errors.Is(err, c.want) {
			t.Errorf("Transferir(%s, %s, %d) erro = %v; quer %v", c.o, c.d, c.v, err, c.want)
		}
	}
}

// Transferências opostas (a→b e b→a) ao mesmo tempo: com travas na ordem do
// pedido, as goroutines travam. O teste falha por prazo em vez de ficar preso.
func TestTransferenciasOpostasNaoTravam(t *testing.T) {
	for rep := 0; rep < 3; rep++ {
		b := New(map[string]int64{"a": 1_000_000, "b": 1_000_000})
		var wg sync.WaitGroup
		for g := 0; g < 8; g++ {
			wg.Add(1)
			go func(g int) {
				defer wg.Done()
				o, d := "a", "b"
				if g%2 == 1 {
					o, d = "b", "a"
				}
				for i := 0; i < 20_000; i++ {
					if _, err := b.Transferir(o, d, 1); err != nil {
						panic(err)
					}
				}
			}(g)
		}
		pronto := make(chan struct{})
		go func() { wg.Wait(); close(pronto) }()
		select {
		case <-pronto:
		case <-time.After(15 * time.Second):
			t.Fatalf("repetição %d: transferências opostas não terminaram em 15 s (deadlock?)", rep)
		}
		if tot := b.Saldo("a") + b.Saldo("b"); tot != 2_000_000 {
			t.Fatalf("repetição %d: soma = %d; quer 2.000.000", rep, tot)
		}
	}
}

// 10 mil transferências aleatórias entre 10 contas, com 16 goroutines: a soma
// se conserva, nenhum saldo fica negativo e o Total lido no meio é sempre a soma.
func TestASomaSeConservaSobConcorrencia(t *testing.T) {
	for rep := 0; rep < 3; rep++ {
		saldos := map[string]int64{}
		for i := 0; i < 10; i++ {
			saldos[fmt.Sprintf("c%d", i)] = 10_000
		}
		b := New(saldos)
		var wg sync.WaitGroup
		erros := make(chan string, 64)
		for g := 0; g < 16; g++ {
			wg.Add(1)
			go func(g int) {
				defer wg.Done()
				rnd := rand.New(rand.NewSource(int64(rep*100 + g)))
				for i := 0; i < 10_000/16+1; i++ {
					o, d := rnd.Intn(10), rnd.Intn(10)
					if o == d {
						continue
					}
					if _, err := b.Transferir(fmt.Sprintf("c%d", o), fmt.Sprintf("c%d", d), int64(rnd.Intn(500)+1)); err != nil {
						erros <- err.Error()
						return
					}
					if i%100 == 0 {
						if tot := b.Total(); tot != 100_000 {
							erros <- fmt.Sprintf("Total no meio = %d", tot)
							return
						}
					}
				}
			}(g)
		}
		pronto := make(chan struct{})
		go func() { wg.Wait(); close(pronto) }()
		select {
		case <-pronto:
		case <-time.After(15 * time.Second):
			t.Fatalf("repetição %d: não terminou em 15 s (deadlock?)", rep)
		}
		close(erros)
		for e := range erros {
			t.Fatalf("repetição %d: %s", rep, e)
		}
		var soma int64
		for i := 0; i < 10; i++ {
			s := b.Saldo(fmt.Sprintf("c%d", i))
			if s < 0 {
				t.Fatalf("repetição %d: saldo negativo em c%d: %d", rep, i, s)
			}
			soma += s
		}
		if soma != 100_000 {
			t.Fatalf("repetição %d: soma = %d; quer 100.000", rep, soma)
		}
	}
}
