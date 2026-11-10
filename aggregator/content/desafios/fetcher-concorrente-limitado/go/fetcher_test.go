package fetcher

import (
	"context"
	"errors"
	"fmt"
	"sync/atomic"
	"testing"
	"time"

	"go.uber.org/goleak"
)

func TestMain(m *testing.M) { goleak.VerifyTestMain(m) }

func ids(n int) []string {
	out := make([]string, n)
	for i := range out {
		out[i] = fmt.Sprintf("P%03d", i)
	}
	return out
}

// contador de chamadas em voo, com o pico observado.
type voo struct{ agora, pico, inicios atomic.Int64 }

func (v *voo) entra() {
	v.inicios.Add(1)
	n := v.agora.Add(1)
	for {
		p := v.pico.Load()
		if n <= p || v.pico.CompareAndSwap(p, n) {
			return
		}
	}
}
func (v *voo) sai() { v.agora.Add(-1) }

func TestLimiteInvalido(t *testing.T) {
	_, err := Buscar(context.Background(), ids(3), 0, func(context.Context, string) (int, error) { return 1, nil })
	if !errors.Is(err, ErrLimiteInvalido) {
		t.Fatalf("erro = %v; quer ErrLimiteInvalido", err)
	}
}

func TestResultadosNaOrdemENuncaMaisQueOLimite(t *testing.T) {
	var v voo
	res, err := Buscar(context.Background(), ids(100), 7, func(ctx context.Context, id string) (string, error) {
		v.entra()
		defer v.sai()
		time.Sleep(2 * time.Millisecond)
		return "ok-" + id, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	for i, r := range res {
		if want := fmt.Sprintf("ok-P%03d", i); r != want {
			t.Fatalf("res[%d] = %q; quer %q (ordem de ids)", i, r, want)
		}
	}
	if p := v.pico.Load(); p != 7 {
		t.Fatalf("pico de chamadas em voo = %d; quer exatamente 7", p)
	}
}

func TestPrimeiroErroCancelaAsEmVooENaoLancaNovas(t *testing.T) {
	var v voo
	var canceladas atomic.Int64
	falha := errors.New("PSP fora do ar")
	inicio := time.Now()
	_, err := Buscar(context.Background(), ids(200), 5, func(ctx context.Context, id string) (int, error) {
		v.entra()
		defer v.sai()
		if id == "P003" { // falha dentro da primeira leva de 5
			return 0, falha
		}
		select {
		case <-time.After(2 * time.Second):
			return 1, nil
		case <-ctx.Done():
			canceladas.Add(1)
			return 0, ctx.Err()
		}
	})
	if !errors.Is(err, falha) {
		t.Fatalf("erro = %v; quer o primeiro erro (PSP fora do ar)", err)
	}
	if d := time.Since(inicio); d > time.Second {
		t.Fatalf("Buscar levou %v; as chamadas em voo deviam ser canceladas no primeiro erro", d)
	}
	if canceladas.Load() == 0 {
		t.Fatal("nenhuma chamada em voo viu o cancelamento")
	}
	if n := v.inicios.Load(); n > 15 {
		t.Fatalf("%d chamadas começaram; depois do erro nenhuma nova deveria começar", n)
	}
}

func TestPrazoDoChamadorERespeitado(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	inicio := time.Now()
	_, err := Buscar(ctx, ids(50), 4, func(ctx context.Context, id string) (int, error) {
		<-ctx.Done() // dependência lenta que respeita o ctx
		return 0, ctx.Err()
	})
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("erro = %v; quer context.DeadlineExceeded", err)
	}
	if d := time.Since(inicio); d > 400*time.Millisecond {
		t.Fatalf("Buscar levou %v com prazo de 100 ms", d)
	}
}
