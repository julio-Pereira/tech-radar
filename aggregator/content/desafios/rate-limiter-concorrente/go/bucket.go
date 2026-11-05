// Package ratelimit é o esqueleto do desafio rate-limiter-concorrente:
// implemente um token bucket seguro para uso concorrente. Os testes em
// bucket_test.go descrevem o comportamento esperado e falham até que a
// implementação esteja certa. Rode com: go test -race ./...
package ratelimit

import (
	"errors"
	"time"
)

// Clock abstrai o relógio para que os testes controlem o tempo.
type Clock interface {
	Now() time.Time
}

// ErrInvalidConfig é devolvido por New para capacidade ou taxa não positivas.
var ErrInvalidConfig = errors.New("ratelimit: capacidade e taxa precisam ser positivas")

// TokenBucket guarda até capacity fichas e repõe refillPerSecond fichas por
// segundo, de forma contínua (meio segundo repõe metade da taxa). Começa cheio.
type TokenBucket struct {
	// TODO: os campos que a sua implementação precisar.
}

// New cria um bucket cheio.
func New(capacity int, refillPerSecond float64, clock Clock) (*TokenBucket, error) {
	// TODO
	return &TokenBucket{}, nil
}

// TryAcquire consome n fichas se houver, sem bloquear. Devolve false sem
// consumir nada quando não há fichas suficientes ou n > capacidade.
// Precisa ser seguro com muitas goroutines chamando ao mesmo tempo.
func (b *TokenBucket) TryAcquire(n int) bool {
	// TODO
	return false
}
