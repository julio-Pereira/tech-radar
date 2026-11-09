package cachelru

import (
	"fmt"
	"math/rand"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// relogio é controlado pelo teste; o cache só lê.
type relogio struct{ ns atomic.Int64 }

func (r *relogio) agora() time.Time       { return time.Unix(0, r.ns.Load()) }
func (r *relogio) avanca(d time.Duration) { r.ns.Add(int64(d)) }

func novo(t *testing.T, cap int, ttl time.Duration) (*Cache[string, int], *relogio) {
	t.Helper()
	r := &relogio{}
	r.ns.Store(time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC).UnixNano())
	c, err := New[string, int](cap, ttl, r.agora)
	if err != nil || c == nil {
		t.Fatalf("New(%d, %v): %v", cap, ttl, err)
	}
	return c, r
}

func TestConfigInvalida(t *testing.T) {
	for _, tc := range []struct {
		cap int
		ttl time.Duration
	}{{0, time.Second}, {-1, time.Second}, {1, 0}, {1, -time.Second}} {
		if _, err := New[string, int](tc.cap, tc.ttl, time.Now); err == nil {
			t.Errorf("New(%d, %v) aceitou configuração inválida", tc.cap, tc.ttl)
		}
	}
}

func TestTamanhoNuncaPassaDaCapacidade(t *testing.T) {
	c, _ := novo(t, 3, time.Hour)
	for i := 0; i < 100; i++ {
		c.Put(fmt.Sprint(i), i)
		if n := c.Len(); n > 3 || n < 1 {
			t.Fatalf("depois de %d puts, Len() = %d; quer entre 1 e 3", i+1, n)
		}
	}
	if c.Len() != 3 {
		t.Fatalf("Len() = %d; quer 3", c.Len())
	}
}

func TestDespejaOMenosUsado(t *testing.T) {
	c, _ := novo(t, 3, time.Hour)
	c.Put("a", 1)
	c.Put("b", 2)
	c.Put("c", 3)
	if _, ok := c.Get("a"); !ok { // a vira o mais recente; b é o menos usado
		t.Fatal("a sumiu antes da hora")
	}
	c.Put("d", 4)
	if _, ok := c.Get("b"); ok {
		t.Fatal("b deveria ter sido despejado (menos usado)")
	}
	for _, k := range []string{"a", "c", "d"} {
		if _, ok := c.Get(k); !ok {
			t.Fatalf("%s foi despejado no lugar de b", k)
		}
	}
}

func TestEntradaVencidaNuncaVolta(t *testing.T) {
	c, r := novo(t, 10, 5*time.Second)
	c.Put("pix", 7)
	r.avanca(4999 * time.Millisecond)
	if v, ok := c.Get("pix"); !ok || v != 7 {
		t.Fatalf("Get antes de vencer = %v, %v; quer 7, true", v, ok)
	}
	r.avanca(time.Millisecond) // exatamente no vencimento
	if _, ok := c.Get("pix"); ok {
		t.Fatal("entrada voltou no instante do vencimento")
	}
	if _, ok := c.Get("pix"); ok {
		t.Fatal("entrada vencida voltou na segunda leitura")
	}
}

func TestPutRecomecaAValidade(t *testing.T) {
	c, r := novo(t, 10, 5*time.Second)
	c.Put("k", 1)
	r.avanca(4 * time.Second)
	c.Put("k", 2)
	r.avanca(4 * time.Second)
	if v, ok := c.Get("k"); !ok || v != 2 {
		t.Fatalf("Get = %v, %v; o segundo Put deveria recomeçar a validade", v, ok)
	}
}

// 16 goroutines, fases de 1.000 operações; entre fases o relógio anda 1 s
// (com validade de 3 s). Invariantes: Len nunca passa da capacidade e nenhum
// valor vencido volta. Com -race, um cache sem trava é reprovado.
func TestDezesseisGoroutinesNaoQuebramOsInvariantes(t *testing.T) {
	for rep := 0; rep < 3; rep++ {
		c, r := novo(t, 50, 3*time.Second)
		var gravadoEm sync.Map // chave -> instante (ns) da última gravação na fase
		var falhas atomic.Int64
		for fase := 0; fase < 20; fase++ {
			agora := r.agora().UnixNano()
			var wg sync.WaitGroup
			for g := 0; g < 16; g++ {
				wg.Add(1)
				go func(g int) {
					defer wg.Done()
					rnd := rand.New(rand.NewSource(int64(rep*1000 + fase*16 + g)))
					for i := 0; i < 1000; i++ {
						k := fmt.Sprint(rnd.Intn(200))
						if rnd.Intn(2) == 0 {
							c.Put(k, int(agora/int64(time.Millisecond)))
							gravadoEm.Store(k, agora)
						} else if v, ok := c.Get(k); ok && int64(v)*int64(time.Millisecond) <= agora-int64(3*time.Second) {
							falhas.Add(1)
						}
						if c.Len() > 50 {
							falhas.Add(1)
						}
					}
				}(g)
			}
			wg.Wait()
			r.avanca(time.Second)
		}
		if f := falhas.Load(); f > 0 {
			t.Fatalf("repetição %d: %d violações (capacidade ou valor vencido)", rep, f)
		}
	}
}
