package com.finplatform.cache;

import java.util.Optional;
import java.util.function.LongSupplier;

/**
 * Esqueleto do desafio cache-lru-ttl: o cache da consulta DICT. Guarda no máximo
 * {@code capacidade} entradas, despeja a usada há mais tempo quando enche, e nunca
 * devolve uma entrada no instante do vencimento ou depois. Seguro para uso concorrente.
 * Os testes em CacheLruTest descrevem o comportamento esperado e falham até que a
 * implementação esteja certa.
 */
public final class CacheLru<K, V> {

    /**
     * @param ttlNanos  validade de cada entrada, contada a partir do put
     * @param nanoClock relógio em nanossegundos (System::nanoTime em produção;
     *                  os testes injetam um relógio controlado)
     * @throws IllegalArgumentException se capacidade ou ttlNanos não forem positivos
     */
    public CacheLru(int capacidade, long ttlNanos, LongSupplier nanoClock) {
        // TODO
    }

    /** O valor, se presente e ainda válido. Um get conta como uso para o LRU. */
    public Optional<V> get(K chave) {
        // TODO
        return Optional.empty();
    }

    /** Grava ou substitui; a validade recomeça. Se o cache passar da capacidade, despeja o menos usado. */
    public void put(K chave, V valor) {
        // TODO
    }

    /** Número de entradas guardadas (inclusive as vencidas que ainda não foram lidas). */
    public int size() {
        // TODO
        return -1;
    }
}
