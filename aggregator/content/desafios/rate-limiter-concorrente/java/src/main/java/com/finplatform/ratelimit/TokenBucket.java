package com.finplatform.ratelimit;

import java.util.function.LongSupplier;

/**
 * Esqueleto do desafio rate-limiter-concorrente: um token bucket seguro para
 * uso concorrente. Guarda até {@code capacity} fichas e repõe
 * {@code refillPerSecond} fichas por segundo, de forma contínua. Começa cheio.
 * Os testes em TokenBucketTest descrevem o comportamento esperado e falham até
 * que a implementação esteja certa.
 */
public final class TokenBucket {

    /**
     * @param nanoClock relógio em nanossegundos (System::nanoTime em produção;
     *                  os testes injetam um relógio controlado)
     * @throws IllegalArgumentException se capacity ou refillPerSecond não forem positivos
     */
    public TokenBucket(int capacity, double refillPerSecond, LongSupplier nanoClock) {
        // TODO
    }

    /**
     * Consome {@code n} fichas se houver, sem bloquear. Devolve false sem
     * consumir nada quando não há fichas suficientes ou n > capacidade.
     */
    public boolean tryAcquire(int n) {
        // TODO
        return false;
    }
}
