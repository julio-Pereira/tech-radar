package com.finplatform.cache;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.function.LongSupplier;

/** Referência: LinkedHashMap com ordem de acesso, despejo em removeEldestEntry e um monitor único. */
public final class CacheLru<K, V> {
    private record Entrada<V>(V valor, long expiraEm) {}

    private final int capacidade;
    private final long ttlNanos;
    private final LongSupplier relogio;
    private final LinkedHashMap<K, Entrada<V>> mapa;

    public CacheLru(int capacidade, long ttlNanos, LongSupplier nanoClock) {
        if (capacidade <= 0 || ttlNanos <= 0) throw new IllegalArgumentException("capacidade e ttl devem ser positivos");
        this.capacidade = capacidade;
        this.ttlNanos = ttlNanos;
        this.relogio = nanoClock;
        this.mapa = new LinkedHashMap<>(16, 0.75f, true) {
            @Override protected boolean removeEldestEntry(Map.Entry<K, Entrada<V>> maisAntiga) {
                return size() > CacheLru.this.capacidade;
            }
        };
    }

    public synchronized Optional<V> get(K chave) {
        Entrada<V> e = mapa.get(chave);
        if (e == null) return Optional.empty();
        if (relogio.getAsLong() - e.expiraEm() >= 0) {   // compara por diferença: nanoTime pode dar a volta
            mapa.remove(chave);
            return Optional.empty();
        }
        return Optional.of(e.valor());
    }

    public synchronized void put(K chave, V valor) {
        mapa.put(chave, new Entrada<>(valor, relogio.getAsLong() + ttlNanos));
    }

    public synchronized int size() {
        return mapa.size();
    }
}
