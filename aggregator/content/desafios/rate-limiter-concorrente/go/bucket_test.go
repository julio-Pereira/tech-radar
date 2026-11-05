package ratelimit

import (
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type fakeClock struct {
	mu  sync.Mutex
	now time.Time
}

func (c *fakeClock) Now() time.Time          { c.mu.Lock(); defer c.mu.Unlock(); return c.now }
func (c *fakeClock) Advance(d time.Duration) { c.mu.Lock(); c.now = c.now.Add(d); c.mu.Unlock() }

func newBucket(t *testing.T, capacity int, rate float64) (*TokenBucket, *fakeClock) {
	t.Helper()
	clock := &fakeClock{now: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)}
	b, err := New(capacity, rate, clock)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	return b, clock
}

func TestStartsFull(t *testing.T) {
	b, _ := newBucket(t, 5, 1)
	for i := 0; i < 5; i++ {
		if !b.TryAcquire(1) {
			t.Fatalf("acquire %d negado com o bucket cheio", i+1)
		}
	}
	if b.TryAcquire(1) {
		t.Fatal("sexta ficha concedida num bucket de capacidade 5")
	}
}

func TestRefillsContinuously(t *testing.T) {
	b, clock := newBucket(t, 10, 10)
	if !b.TryAcquire(10) {
		t.Fatal("bucket cheio negou 10 fichas")
	}
	clock.Advance(500 * time.Millisecond) // 10/s × 0,5 s = 5 fichas
	if !b.TryAcquire(5) {
		t.Fatal("meio segundo a 10/s deveria repor 5 fichas")
	}
	if b.TryAcquire(1) {
		t.Fatal("reposição acima do que o tempo permite")
	}
}

func TestNeverExceedsCapacity(t *testing.T) {
	b, clock := newBucket(t, 3, 100)
	clock.Advance(time.Hour)
	if !b.TryAcquire(3) {
		t.Fatal("depois de uma hora o bucket deveria estar cheio")
	}
	if b.TryAcquire(1) {
		t.Fatal("o bucket acumulou acima da capacidade")
	}
}

func TestRejectsMoreThanCapacityWithoutConsuming(t *testing.T) {
	b, _ := newBucket(t, 4, 1)
	if b.TryAcquire(5) {
		t.Fatal("pedido maior que a capacidade foi concedido")
	}
	if !b.TryAcquire(4) {
		t.Fatal("um pedido negado não pode consumir fichas")
	}
}

func TestInvalidConfig(t *testing.T) {
	for _, c := range []struct {
		capacity int
		rate     float64
	}{{0, 1}, {-1, 1}, {1, 0}, {1, -2}} {
		if _, err := New(c.capacity, c.rate, &fakeClock{}); err == nil {
			t.Errorf("New(%d, %v) aceitou configuração inválida", c.capacity, c.rate)
		}
	}
}

// Sem reposição (relógio parado), 64 goroutines disputando 1000 fichas:
// exatamente 1000 pedidos podem vencer. Rode com -race.
func TestConcurrentAcquireNeverOversells(t *testing.T) {
	b, _ := newBucket(t, 1000, 1)
	var granted atomic.Int64
	var wg sync.WaitGroup
	for g := 0; g < 64; g++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := 0; i < 100; i++ {
				if b.TryAcquire(1) {
					granted.Add(1)
				}
			}
		}()
	}
	wg.Wait()
	if got := granted.Load(); got != 1000 {
		t.Fatalf("%d fichas concedidas, esperado exatamente 1000", got)
	}
}
