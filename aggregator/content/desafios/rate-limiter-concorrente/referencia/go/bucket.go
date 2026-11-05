// Solução de referência do desafio rate-limiter-concorrente. Não é
// publicada no site; o CI a usa para provar que os testes passam numa
// implementação correta (e falham no esqueleto).
package ratelimit

import (
	"errors"
	"sync"
	"time"
)

type Clock interface {
	Now() time.Time
}

var ErrInvalidConfig = errors.New("ratelimit: capacidade e taxa precisam ser positivas")

type TokenBucket struct {
	mu       sync.Mutex
	capacity float64
	rate     float64
	tokens   float64
	last     time.Time
	clock    Clock
}

func New(capacity int, refillPerSecond float64, clock Clock) (*TokenBucket, error) {
	if capacity <= 0 || refillPerSecond <= 0 {
		return nil, ErrInvalidConfig
	}
	return &TokenBucket{
		capacity: float64(capacity), rate: refillPerSecond,
		tokens: float64(capacity), last: clock.Now(), clock: clock,
	}, nil
}

func (b *TokenBucket) TryAcquire(n int) bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	now := b.clock.Now()
	if elapsed := now.Sub(b.last).Seconds(); elapsed > 0 {
		b.tokens = min(b.capacity, b.tokens+elapsed*b.rate)
		b.last = now
	}
	if n <= 0 || float64(n) > b.tokens {
		return false
	}
	b.tokens -= float64(n)
	return true
}
