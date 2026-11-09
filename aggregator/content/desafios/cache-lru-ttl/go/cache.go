// Package cachelru é o esqueleto do desafio cache-lru-ttl em Go: um cache
// LRU com validade por entrada e relógio injetado, seguro entre goroutines.
// Os testes em cache_test.go descrevem o comportamento e falham até que a
// implementação esteja certa. Rode com: go test -race ./...
package cachelru

import (
	"errors"
	"time"
)

// ErrConfigInvalida é devolvido por New para capacidade ou validade não positivas.
var ErrConfigInvalida = errors.New("cachelru: capacidade e validade precisam ser positivas")

// Cache guarda até capacidade entradas; cada uma vale por ttl a partir do Put.
type Cache[K comparable, V any] struct {
	// TODO: os campos que a sua implementação precisar.
}

// New cria um cache vazio. agora é o relógio (injetado para os testes).
func New[K comparable, V any](capacidade int, ttl time.Duration, agora func() time.Time) (*Cache[K, V], error) {
	// TODO
	return &Cache[K, V]{}, nil
}

// Get devolve o valor se a entrada existe e não venceu, e a marca como a usada
// mais recentemente. Entrada vencida nunca volta.
func (c *Cache[K, V]) Get(k K) (V, bool) {
	var zero V
	// TODO
	return zero, false
}

// Put grava (ou regrava) a entrada, recomeça a validade dela e, se o cache
// passar da capacidade, despeja a menos usada recentemente.
func (c *Cache[K, V]) Put(k K, v V) {
	// TODO
}

// Len devolve quantas entradas o cache guarda agora.
func (c *Cache[K, V]) Len() int {
	// TODO
	return -1
}
