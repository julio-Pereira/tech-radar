package fetcher

import (
	"context"
	"errors"
	"sync"
)

var ErrLimiteInvalido = errors.New("fetcher: limite precisa ser pelo menos 1")

// Buscar: um contexto filho cancelável, um semáforo (canal com limite
// posições) adquirido ANTES de criar a goroutine, e o primeiro erro guardado
// com sync.Once. O laço para de lançar assim que o contexto é cancelado, e o
// Wait no fim garante que nenhuma goroutine sobrevive ao retorno.
func Buscar[T any](ctx context.Context, ids []string, limite int, buscar func(context.Context, string) (T, error)) ([]T, error) {
	if limite < 1 {
		return nil, ErrLimiteInvalido
	}
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	res := make([]T, len(ids))
	sem := make(chan struct{}, limite)
	var (
		wg       sync.WaitGroup
		once     sync.Once
		primeiro error
	)
	falhar := func(err error) {
		once.Do(func() { primeiro = err; cancel() })
	}

lancar:
	for i, id := range ids {
		select {
		case sem <- struct{}{}:
		case <-ctx.Done():
			break lancar
		}
		if ctx.Err() != nil { // cancelado enquanto esperava a vaga
			<-sem
			break
		}
		wg.Add(1)
		go func(i int, id string) {
			defer wg.Done()
			defer func() { <-sem }()
			v, err := buscar(ctx, id)
			if err != nil {
				falhar(err)
				return
			}
			res[i] = v
		}(i, id)
	}
	wg.Wait()
	if primeiro != nil {
		return nil, primeiro
	}
	if err := ctx.Err(); err != nil {
		// cancelado de fora (prazo do chamador)
		return nil, context.Cause(ctx)
	}
	return res, nil
}
