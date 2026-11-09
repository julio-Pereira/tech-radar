package com.finplatform.ledger;

import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

class BancoTest {

    static Map<String, Long> contas(int n, long saldo) {
        var m = new LinkedHashMap<String, Long>();
        for (int i = 0; i < n; i++) m.put("conta-" + i, saldo);
        return m;
    }

    /** Threads daemon: se a implementação travar, o teste falha pelo prazo e a JVM ainda encerra. */
    static ExecutorService pool(int n) {
        return Executors.newFixedThreadPool(n, r -> { Thread t = new Thread(r); t.setDaemon(true); return t; });
    }

    @Test
    void transferenciaSimples() {
        var banco = new Banco(Map.of("a", 10_000L, "b", 0L));
        assertTrue(banco.transferir("a", "b", 2_500));
        assertEquals(7_500, banco.saldo("a"));
        assertEquals(2_500, banco.saldo("b"));
        assertEquals(10_000, banco.total());
    }

    @Test
    void saldoInsuficienteNaoMudaNada() {
        var banco = new Banco(Map.of("a", 100L, "b", 0L));
        assertFalse(banco.transferir("a", "b", 101));
        assertEquals(100, banco.saldo("a"));
        assertEquals(0, banco.saldo("b"));
    }

    @Test
    void entradasInvalidas() {
        var banco = new Banco(Map.of("a", 100L, "b", 0L));
        assertThrows(IllegalArgumentException.class, () -> banco.transferir("a", "a", 10));
        assertThrows(IllegalArgumentException.class, () -> banco.transferir("a", "b", 0));
        assertThrows(IllegalArgumentException.class, () -> banco.transferir("a", "b", -5));
        assertThrows(IllegalArgumentException.class, () -> banco.transferir("a", "z", 10));
        assertThrows(IllegalArgumentException.class, () -> new Banco(Map.of()));
        assertThrows(IllegalArgumentException.class, () -> new Banco(Map.of("a", -1L)));
    }

    /** O caso clássico: metade das threads faz A → B e a outra metade B → A, ao mesmo tempo. */
    @RepeatedTest(3)
    void transferenciasOpostasNaoTravam() throws Exception {
        var banco = new Banco(Map.of("a", 1_000_000L, "b", 1_000_000L));
        var largada = new CountDownLatch(1);
        ExecutorService ex = pool(8);
        try {
            List<Future<?>> fs = new ArrayList<>();
            for (int t = 0; t < 8; t++) {
                boolean ida = t % 2 == 0;
                fs.add(ex.submit(() -> {
                    largada.await();
                    for (int i = 0; i < 20_000; i++) {
                        if (ida) banco.transferir("a", "b", 1); else banco.transferir("b", "a", 1);
                    }
                    return null;
                }));
            }
            largada.countDown();
            for (Future<?> f : fs) {
                try { f.get(15, TimeUnit.SECONDS); }
                catch (TimeoutException e) { fail("as transferências não terminaram em 15 s: deadlock?"); }
            }
        } finally {
            ex.shutdownNow();
        }
        assertEquals(2_000_000, banco.total());
    }

    /** 16 threads, 10 contas, transferências aleatórias em qualquer direção: soma conservada, nada negativo. */
    @RepeatedTest(3)
    void aSomaSeConservaSobConcorrencia() throws Exception {
        var banco = new Banco(contas(10, 10_000));
        var negativos = new AtomicInteger();
        var largada = new CountDownLatch(1);
        ExecutorService ex = pool(16);
        try {
            List<Future<?>> fs = new ArrayList<>();
            for (int t = 0; t < 16; t++) fs.add(ex.submit(() -> {
                largada.await();
                var rnd = ThreadLocalRandom.current();
                for (int i = 0; i < 20_000; i++) {
                    int de = rnd.nextInt(10), para = rnd.nextInt(10);
                    if (de == para) continue;
                    banco.transferir("conta-" + de, "conta-" + para, 1 + rnd.nextInt(500));
                    if (banco.saldo("conta-" + de) < 0) negativos.incrementAndGet();
                }
                return null;
            }));
            largada.countDown();
            for (Future<?> f : fs) {
                try { f.get(15, TimeUnit.SECONDS); }
                catch (TimeoutException e) { fail("as transferências não terminaram em 15 s: deadlock?"); }
            }
        } finally {
            ex.shutdownNow();
        }
        assertEquals(100_000, banco.total(), "a soma dos saldos mudou");
        assertEquals(0, negativos.get(), "algum saldo ficou negativo");
        for (int i = 0; i < 10; i++) assertTrue(banco.saldo("conta-" + i) >= 0);
    }
}
