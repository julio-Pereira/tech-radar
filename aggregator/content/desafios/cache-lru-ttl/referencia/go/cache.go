package cachelru

import (
	"container/list"
	"errors"
	"sync"
	"time"
)

var ErrConfigInvalida = errors.New("cachelru: capacidade e validade precisam ser positivas")

type entrada[K comparable, V any] struct {
	chave    K
	valor    V
	expiraEm time.Time
}

// Cache: mapa para achar em O(1) e lista duplamente ligada para a ordem de uso.
// Um mutex só, porque Get também escreve (move o elemento para a frente).
type Cache[K comparable, V any] struct {
	mu         sync.Mutex
	capacidade int
	ttl        time.Duration
	agora      func() time.Time
	ordem      *list.List // frente = mais recente
	itens      map[K]*list.Element
}

func New[K comparable, V any](capacidade int, ttl time.Duration, agora func() time.Time) (*Cache[K, V], error) {
	if capacidade <= 0 || ttl <= 0 || agora == nil {
		return nil, ErrConfigInvalida
	}
	return &Cache[K, V]{capacidade: capacidade, ttl: ttl, agora: agora, ordem: list.New(), itens: map[K]*list.Element{}}, nil
}

func (c *Cache[K, V]) Get(k K) (V, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	var zero V
	el, ok := c.itens[k]
	if !ok {
		return zero, false
	}
	e := el.Value.(*entrada[K, V])
	if !c.agora().Before(e.expiraEm) {
		c.ordem.Remove(el)
		delete(c.itens, k)
		return zero, false
	}
	c.ordem.MoveToFront(el)
	return e.valor, true
}

func (c *Cache[K, V]) Put(k K, v V) {
	c.mu.Lock()
	defer c.mu.Unlock()
	expira := c.agora().Add(c.ttl)
	if el, ok := c.itens[k]; ok {
		e := el.Value.(*entrada[K, V])
		e.valor, e.expiraEm = v, expira
		c.ordem.MoveToFront(el)
		return
	}
	c.itens[k] = c.ordem.PushFront(&entrada[K, V]{chave: k, valor: v, expiraEm: expira})
	if c.ordem.Len() > c.capacidade {
		velha := c.ordem.Back()
		c.ordem.Remove(velha)
		delete(c.itens, velha.Value.(*entrada[K, V]).chave)
	}
}

func (c *Cache[K, V]) Len() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.ordem.Len()
}
