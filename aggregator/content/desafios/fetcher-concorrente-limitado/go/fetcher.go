// Package fetcher é o esqueleto do desafio fetcher-concorrente-limitado:
// buscar muitos itens em paralelo com limite de chamadas em voo, parar no
// primeiro erro e respeitar o prazo, sem vazar goroutine. Os testes em
// fetcher_test.go falham até a implementação estar certa.
// Rode com: go test -race ./...
package fetcher

import (
	"context"
	"errors"
)

// ErrLimiteInvalido é devolvido para limite menor que 1.
var ErrLimiteInvalido = errors.New("fetcher: limite precisa ser pelo menos 1")

// Buscar chama buscar para cada id, com no máximo limite chamadas em voo ao
// mesmo tempo, e devolve os resultados na ordem de ids. No primeiro erro, as
// chamadas em voo recebem o cancelamento pelo ctx, nenhuma chamada nova
// começa, e Buscar devolve esse erro. Se o ctx vencer, devolve ctx.Err().
// Quando Buscar retorna, nenhuma goroutine criada por ele continua viva.
func Buscar[T any](ctx context.Context, ids []string, limite int, buscar func(context.Context, string) (T, error)) ([]T, error) {
	// TODO
	return nil, nil
}
