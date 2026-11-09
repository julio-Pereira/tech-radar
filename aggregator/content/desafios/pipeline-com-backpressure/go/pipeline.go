// Package pipeline é o esqueleto do desafio pipeline-com-backpressure: o
// fluxo de mudanças de estado que vira webhook, com ordem por pagamento,
// paralelismo entre pagamentos, fila limitada e DLQ. Os testes em
// pipeline_test.go falham até a implementação estar certa.
// Rode com: go test -race ./...
package pipeline

import (
	"context"
	"errors"
)

// Evento é uma mudança de estado de um pagamento; Seq cresce por Chave.
type Evento struct {
	Chave string
	Seq   int
}

// ErrPermanente marca um erro que não adianta repetir (410, 422).
var ErrPermanente = errors.New("pipeline: erro permanente")

// ErrConfigInvalida é devolvido para Particoes, Buffer ou Tentativas < 1.
var ErrConfigInvalida = errors.New("pipeline: configuração inválida")

type Config struct {
	Particoes  int // quantos pagamentos processam ao mesmo tempo
	Buffer     int // posições da fila de cada partição
	Tentativas int // tentativas para erro transitório antes da DLQ
}

// Processar consome a entrada até ela fechar. Cada Chave cai sempre na
// mesma partição e é processada em ordem; partições rodam em paralelo; a
// fila de cada partição tem Buffer posições, e o consumo da entrada para
// quando ela enche (backpressure). Erro permanente vai para a dlq na
// primeira vez; transitório repete até Tentativas e depois vai para a dlq.
// O fluxo nunca para por erro de um evento. Devolve ctx.Err() se o ctx for
// cancelado. Ao retornar, nenhuma goroutine criada por ele continua viva.
func Processar(ctx context.Context, entrada <-chan Evento, cfg Config,
	processar func(context.Context, Evento) error, dlq func(Evento, error)) error {
	// TODO
	return nil
}
