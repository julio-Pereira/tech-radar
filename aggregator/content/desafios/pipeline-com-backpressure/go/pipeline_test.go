package pipeline

import (
	"context"
	"errors"
	"fmt"
	"math/rand"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"go.uber.org/goleak"
)

func TestMain(m *testing.M) { goleak.VerifyTestMain(m) }

func TestConfigInvalida(t *testing.T) {
	for _, c := range []Config{{0, 1, 1}, {1, 0, 1}, {1, 1, 0}} {
		ent := make(chan Evento)
		close(ent)
		if err := Processar(context.Background(), ent, c, func(context.Context, Evento) error { return nil }, func(Evento, error) {}); !errors.Is(err, ErrConfigInvalida) {
			t.Errorf("Config %+v: erro = %v; quer ErrConfigInvalida", c, err)
		}
	}
}

// Consumidor lento: quem produz nunca fica mais que Particoes*(Buffer+1)+1
// eventos à frente de quem processa.
func TestPendentesLimitadosComConsumidorLento(t *testing.T) {
	cfg := Config{Particoes: 4, Buffer: 8, Tentativas: 1}
	ent := make(chan Evento)
	var enviados, processados, pico atomic.Int64
	go func() {
		for i := 0; i < 400; i++ {
			ent <- Evento{Chave: fmt.Sprintf("P%d", i%40), Seq: i / 40}
			n := enviados.Add(1) - processados.Load()
			for {
				p := pico.Load()
				if n <= p || pico.CompareAndSwap(p, n) {
					break
				}
			}
		}
		close(ent)
	}()
	err := Processar(context.Background(), ent, cfg, func(context.Context, Evento) error {
		time.Sleep(time.Millisecond)
		processados.Add(1)
		return nil
	}, func(Evento, error) {})
	if err != nil {
		t.Fatal(err)
	}
	limite := int64(cfg.Particoes*(cfg.Buffer+1) + 1)
	if p := pico.Load(); p > limite {
		t.Fatalf("pico de pendentes = %d; quer no máximo %d", p, limite)
	}
	if processados.Load() != 400 {
		t.Fatalf("processados = %d; quer 400", processados.Load())
	}
}

// Mil eventos de 50 pagamentos, intercalados: cada pagamento sai em ordem, e
// pagamentos diferentes processam em paralelo.
func TestOrdemPorPagamentoEConcorrenciaEntrePagamentos(t *testing.T) {
	rnd := rand.New(rand.NewSource(42))
	seq := map[string]int{}
	var eventos []Evento
	for i := 0; i < 1000; i++ {
		k := fmt.Sprintf("P%02d", rnd.Intn(50))
		seq[k]++
		eventos = append(eventos, Evento{Chave: k, Seq: seq[k]})
	}
	ent := make(chan Evento)
	go func() {
		for _, e := range eventos {
			ent <- e
		}
		close(ent)
	}()
	var mu sync.Mutex
	vistos := map[string][]int{}
	var emVoo, pico atomic.Int64
	err := Processar(context.Background(), ent, Config{Particoes: 8, Buffer: 16, Tentativas: 1},
		func(_ context.Context, e Evento) error {
			n := emVoo.Add(1)
			for {
				p := pico.Load()
				if n <= p || pico.CompareAndSwap(p, n) {
					break
				}
			}
			time.Sleep(time.Duration(rand.Intn(300)) * time.Microsecond)
			emVoo.Add(-1)
			mu.Lock()
			vistos[e.Chave] = append(vistos[e.Chave], e.Seq)
			mu.Unlock()
			return nil
		}, func(Evento, error) {})
	if err != nil {
		t.Fatal(err)
	}
	for k, s := range vistos {
		for i, v := range s {
			if v != i+1 {
				t.Fatalf("pagamento %s fora de ordem: %v", k, s)
			}
		}
	}
	if p := pico.Load(); p < 2 || p > 8 {
		t.Fatalf("pico de concorrência = %d; quer entre 2 e 8", p)
	}
}

// Erro de um evento não para o fluxo: transitório repete, permanente vai
// direto para a DLQ, e o transitório que esgota as tentativas também vai.
func TestTransitorioRepetePermanenteVaiParaDLQ(t *testing.T) {
	ent := make(chan Evento, 5)
	for _, k := range []string{"ok1", "transitorio2x", "permanente", "ok2", "sempreTransitorio"} {
		ent <- Evento{Chave: k, Seq: 1}
	}
	close(ent)
	var mu sync.Mutex
	tentativas := map[string]int{}
	var entregues, naDLQ []string
	err := Processar(context.Background(), ent, Config{Particoes: 2, Buffer: 4, Tentativas: 4},
		func(_ context.Context, e Evento) error {
			mu.Lock()
			defer mu.Unlock()
			tentativas[e.Chave]++
			switch {
			case e.Chave == "transitorio2x" && tentativas[e.Chave] <= 2, e.Chave == "sempreTransitorio":
				return errors.New("503")
			case e.Chave == "permanente":
				return fmt.Errorf("410: %w", ErrPermanente)
			}
			entregues = append(entregues, e.Chave)
			return nil
		}, func(e Evento, _ error) {
			mu.Lock()
			naDLQ = append(naDLQ, e.Chave)
			mu.Unlock()
		})
	if err != nil {
		t.Fatal(err)
	}
	if len(entregues) != 3 || len(naDLQ) != 2 {
		t.Fatalf("entregues = %v, dlq = %v; quer 3 entregues e 2 na DLQ", entregues, naDLQ)
	}
	if tentativas["permanente"] != 1 || tentativas["sempreTransitorio"] != 4 || tentativas["transitorio2x"] != 3 {
		t.Fatalf("tentativas = %v; quer permanente=1, sempreTransitorio=4, transitorio2x=3", tentativas)
	}
}

func TestCancelamentoParaOFluxoSemVazar(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	ent := make(chan Evento) // nunca fecha
	fim := make(chan struct{})
	var produtor sync.WaitGroup
	produtor.Add(1)
	go func() { // o produtor do teste também não pode vazar
		defer produtor.Done()
		for i := 0; ; i++ {
			select {
			case ent <- Evento{Chave: fmt.Sprint(i % 10), Seq: i}:
			case <-fim:
				return
			}
		}
	}()
	defer func() { close(fim); produtor.Wait() }()
	inicio := time.Now()
	err := Processar(ctx, ent, Config{Particoes: 3, Buffer: 4, Tentativas: 1}, func(ctx context.Context, _ Evento) error {
		select {
		case <-time.After(10 * time.Millisecond):
		case <-ctx.Done():
		}
		return nil
	}, func(Evento, error) {})
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("erro = %v; quer context.DeadlineExceeded", err)
	}
	if d := time.Since(inicio); d > time.Second {
		t.Fatalf("Processar levou %v depois de um prazo de 50 ms", d)
	}
}
