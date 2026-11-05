package com.finplatform.ratelimit;

import java.util.function.LongSupplier;

/** Solução de referência do desafio rate-limiter-concorrente (não publicada no site). */
public final class TokenBucket {

    private final double capacity;
    private final double ratePerNano;
    private final LongSupplier nanoClock;
    private double tokens;
    private long last;

    public TokenBucket(int capacity, double refillPerSecond, LongSupplier nanoClock) {
        if (capacity <= 0 || refillPerSecond <= 0) {
            throw new IllegalArgumentException("capacidade e taxa precisam ser positivas");
        }
        this.capacity = capacity;
        this.ratePerNano = refillPerSecond / 1_000_000_000.0;
        this.nanoClock = nanoClock;
        this.tokens = capacity;
        this.last = nanoClock.getAsLong();
    }

    public synchronized boolean tryAcquire(int n) {
        long now = nanoClock.getAsLong();
        long elapsed = now - last;
        if (elapsed > 0) {
            tokens = Math.min(capacity, tokens + elapsed * ratePerNano);
            last = now;
        }
        if (n <= 0 || n > tokens) {
            return false;
        }
        tokens -= n;
        return true;
    }
}
