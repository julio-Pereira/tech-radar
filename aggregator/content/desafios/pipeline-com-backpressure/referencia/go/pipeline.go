package pipeline

import (
	"context"
	"errors"
	"hash/fnv"
	"sync"
)

type Evento struct {
	Chave string
	Seq   int
}

var ErrPermanente = errors.New("pipeline: erro permanente")
var ErrConfigInvalida = errors.New("pipeline: configuração inválida")

type Config struct {
	Particoes  int
	Buffer     int
	Tentativas int
}

// Processar: uma fila (canal com Buffer posições) e uma goroutine por
// partição. O hash da chave escolhe a partição, então os eventos de um
// pagamento passam sempre pela mesma goroutine, em ordem. O envio para a
// fila cheia bloqueia o laço de leitura da entrada: é o backpressure.
func Processar(ctx context.Context, entrada <-chan Evento, cfg Config,
	processar func(context.Context, Evento) error, dlq func(Evento, error)) error {
	if cfg.Particoes < 1 || cfg.Buffer < 1 || cfg.Tentativas < 1 {
		return ErrConfigInvalida
	}
	filas := make([]chan Evento, cfg.Particoes)
	var wg sync.WaitGroup
	for i := range filas {
		filas[i] = make(chan Evento, cfg.Buffer)
		wg.Add(1)
		go func(fila <-chan Evento) {
			defer wg.Done()
			for ev := range fila {
				entregar(ctx, ev, cfg.Tentativas, processar, dlq)
			}
		}(filas[i])
	}
	fechar := func() {
		for _, f := range filas {
			close(f)
		}
		wg.Wait()
	}
	for {
		select {
		case <-ctx.Done():
			fechar()
			return ctx.Err()
		case ev, ok := <-entrada:
			if !ok {
				fechar()
				return nil
			}
			select {
			case filas[particao(ev.Chave, cfg.Particoes)] <- ev:
			case <-ctx.Done():
				fechar()
				return ctx.Err()
			}
		}
	}
}

func entregar(ctx context.Context, ev Evento, tentativas int,
	processar func(context.Context, Evento) error, dlq func(Evento, error)) {
	var err error
	for i := 0; i < tentativas; i++ {
		if ctx.Err() != nil {
			return
		}
		if err = processar(ctx, ev); err == nil {
			return
		}
		if errors.Is(err, ErrPermanente) {
			break
		}
	}
	dlq(ev, err)
}

func particao(chave string, n int) int {
	h := fnv.New32a()
	h.Write([]byte(chave))
	return int(h.Sum32() % uint32(n))
}
