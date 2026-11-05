package com.finplatform.ratelimit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

class TokenBucketTest {

    private final AtomicLong nanos = new AtomicLong(0);

    private TokenBucket bucket(int capacity, double rate) {
        return new TokenBucket(capacity, rate, nanos::get);
    }

    private void advanceMillis(long ms) {
        nanos.addAndGet(TimeUnit.MILLISECONDS.toNanos(ms));
    }

    @Test
    void startsFull() {
        TokenBucket b = bucket(5, 1);
        for (int i = 0; i < 5; i++) {
            assertTrue(b.tryAcquire(1), "acquire " + (i + 1) + " negado com o bucket cheio");
        }
        assertFalse(b.tryAcquire(1), "sexta ficha concedida num bucket de capacidade 5");
    }

    @Test
    void refillsContinuously() {
        TokenBucket b = bucket(10, 10);
        assertTrue(b.tryAcquire(10));
        advanceMillis(500); // 10/s × 0,5 s = 5 fichas
        assertTrue(b.tryAcquire(5), "meio segundo a 10/s deveria repor 5 fichas");
        assertFalse(b.tryAcquire(1), "reposição acima do que o tempo permite");
    }

    @Test
    void neverExceedsCapacity() {
        TokenBucket b = bucket(3, 100);
        advanceMillis(3_600_000);
        assertTrue(b.tryAcquire(3));
        assertFalse(b.tryAcquire(1), "o bucket acumulou acima da capacidade");
    }

    @Test
    void rejectsMoreThanCapacityWithoutConsuming() {
        TokenBucket b = bucket(4, 1);
        assertFalse(b.tryAcquire(5));
        assertTrue(b.tryAcquire(4), "um pedido negado não pode consumir fichas");
    }

    @Test
    void invalidConfig() {
        assertThrows(IllegalArgumentException.class, () -> bucket(0, 1));
        assertThrows(IllegalArgumentException.class, () -> bucket(1, 0));
        assertThrows(IllegalArgumentException.class, () -> bucket(-1, -1));
    }

    /** Sem reposição (relógio parado), 64 threads disputando 1000 fichas: exatamente 1000 vencem. */
    @Test
    void concurrentAcquireNeverOversells() throws InterruptedException {
        TokenBucket b = bucket(1000, 1);
        AtomicLong granted = new AtomicLong();
        ExecutorService pool = Executors.newFixedThreadPool(64);
        CountDownLatch start = new CountDownLatch(1);
        for (int t = 0; t < 64; t++) {
            pool.submit(() -> {
                start.await();
                for (int i = 0; i < 100; i++) {
                    if (b.tryAcquire(1)) {
                        granted.incrementAndGet();
                    }
                }
                return null;
            });
        }
        start.countDown();
        pool.shutdown();
        assertTrue(pool.awaitTermination(30, TimeUnit.SECONDS));
        assertEquals(1000, granted.get(), "fichas concedidas além (ou aquém) da capacidade");
    }
}
