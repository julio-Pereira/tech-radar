package com.finplatform.cache;

import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Test;

import java.util.Optional;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class CacheLruTest {
    static final long SEGUNDO = 1_000_000_000L;

    /** Relógio que só anda quando o teste manda. */
    static final class Relogio {
        final AtomicLong agora = new AtomicLong(1_000 * SEGUNDO);
        long ler() { return agora.get(); }
        void avancar(long nanos) { agora.addAndGet(nanos); }
    }

    @Test
    void configInvalida() {
        assertThrows(IllegalArgumentException.class, () -> new CacheLru<String, String>(0, SEGUNDO, System::nanoTime));
        assertThrows(IllegalArgumentException.class, () -> new CacheLru<String, String>(3, 0, System::nanoTime));
    }

    @Test
    void tamanhoNuncaPassaDaCapacidade() {
        var cache = new CacheLru<String, String>(3, 300 * SEGUNDO, new Relogio()::ler);
        for (int i = 0; i < 100; i++) {
            cache.put("k" + i, "v");
            assertTrue(cache.size() <= 3, "tamanho " + cache.size() + " depois de " + (i + 1) + " puts");
        }
        assertEquals(3, cache.size());
    }

    @Test
    void despejaOMenosUsado() {
        var cache = new CacheLru<String, String>(3, 300 * SEGUNDO, new Relogio()::ler);
        cache.put("a", "1"); cache.put("b", "2"); cache.put("c", "3");
        assertEquals(Optional.of("1"), cache.get("a"));   // a passa a ser o mais recente: b é o menos usado
        cache.put("d", "4");                               // despeja b
        assertEquals(Optional.empty(), cache.get("b"));
        assertEquals(Optional.of("3"), cache.get("c"));   // agora a é o menos usado
        cache.put("e", "5");                               // despeja a
        assertEquals(Optional.empty(), cache.get("a"));
        assertEquals(Optional.of("4"), cache.get("d"));
        assertEquals(Optional.of("5"), cache.get("e"));
    }

    @Test
    void entradaVencidaNuncaVolta() {
        var relogio = new Relogio();
        var cache = new CacheLru<String, String>(3, 30 * SEGUNDO, relogio::ler);
        cache.put("chave", "conta-1");
        relogio.avancar(29 * SEGUNDO);
        assertEquals(Optional.of("conta-1"), cache.get("chave"));
        relogio.avancar(SEGUNDO);                          // exatamente no vencimento: já venceu
        assertEquals(Optional.empty(), cache.get("chave"));
    }

    @Test
    void putRecomecaAValidade() {
        var relogio = new Relogio();
        var cache = new CacheLru<String, String>(3, 30 * SEGUNDO, relogio::ler);
        cache.put("chave", "v1");
        relogio.avancar(20 * SEGUNDO);
        cache.put("chave", "v2");
        relogio.avancar(20 * SEGUNDO);                     // 40 s depois do primeiro put, 20 s depois do segundo
        assertEquals(Optional.of("v2"), cache.get("chave"));
    }

    /**
     * 16 threads, 30 fases de 1.000 operações. O relógio fica parado durante cada fase e anda 1 s na
     * troca (ação da barreira): assim, o instante que a thread grava como valor é o mesmo que o cache
     * usa no put, e o teste não acusa o cache por uma corrida do próprio teste.
     */
    @RepeatedTest(5)
    void dezesseisThreadsNaoQuebramOsInvariantes() throws Exception {
        var relogio = new Relogio();
        var cache = new CacheLru<Integer, Long>(64, 10 * SEGUNDO, relogio::ler);
        var violacoes = new AtomicInteger();
        var barreira = new CyclicBarrier(16, () -> relogio.avancar(SEGUNDO));
        ExecutorService ex = Executors.newFixedThreadPool(16);
        try {
            List<Future<?>> fs = new ArrayList<>();
            for (int t = 0; t < 16; t++) fs.add(ex.submit(() -> {
                var rnd = ThreadLocalRandom.current();
                for (int fase = 0; fase < 30; fase++) {
                    for (int i = 0; i < 1_000; i++) {
                        int k = rnd.nextInt(256);
                        long agora = relogio.ler();
                        if (rnd.nextBoolean()) cache.put(k, agora);
                        else cache.get(k).ifPresent(gravadoEm -> {
                            if (agora - (gravadoEm + 10 * SEGUNDO) >= 0) violacoes.incrementAndGet();
                        });
                        if (cache.size() > 64) violacoes.incrementAndGet();
                    }
                    barreira.await(10, TimeUnit.SECONDS);
                }
                return null;
            }));
            for (Future<?> f : fs) f.get(60, TimeUnit.SECONDS);
        } finally {
            ex.shutdownNow();
        }
        assertEquals(0, violacoes.get(), "violações de capacidade ou de validade");
        assertTrue(cache.size() <= 64);
    }
}
