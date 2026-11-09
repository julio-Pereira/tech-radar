package com.finplatform.ledger;

import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.locks.ReentrantLock;

/**
 * Referência: uma trava por conta, sempre adquiridas na mesma ordem global (a ordem do id).
 * Duas transferências opostas, A → B e B → A, pedem as travas na mesma ordem, e o ciclo de
 * espera que causa o deadlock não pode se formar. Transferências entre contas diferentes correm
 * em paralelo.
 */
public final class Banco {
    private static final class Conta {
        final ReentrantLock trava = new ReentrantLock();
        long saldo;
        Conta(long saldo) { this.saldo = saldo; }
    }

    private final Map<String, Conta> contas;

    public Banco(Map<String, Long> saldosIniciais) {
        if (saldosIniciais.isEmpty()) throw new IllegalArgumentException("sem contas");
        var m = new TreeMap<String, Conta>();
        saldosIniciais.forEach((id, saldo) -> {
            if (saldo < 0) throw new IllegalArgumentException("saldo negativo em " + id);
            m.put(id, new Conta(saldo));
        });
        this.contas = Map.copyOf(m);
    }

    public boolean transferir(String origem, String destino, long centavos) {
        if (centavos <= 0) throw new IllegalArgumentException("valor deve ser positivo");
        if (origem.equals(destino)) throw new IllegalArgumentException("mesma conta");
        Conta de = conta(origem), para = conta(destino);
        Conta primeira = origem.compareTo(destino) < 0 ? de : para;
        Conta segunda = primeira == de ? para : de;
        primeira.trava.lock();
        try {
            segunda.trava.lock();
            try {
                if (de.saldo < centavos) return false;
                de.saldo -= centavos;
                para.saldo += centavos;
                return true;
            } finally {
                segunda.trava.unlock();
            }
        } finally {
            primeira.trava.unlock();
        }
    }

    public long saldo(String id) {
        Conta c = conta(id);
        c.trava.lock();
        try { return c.saldo; } finally { c.trava.unlock(); }
    }

    /** Trava todas as contas, na ordem global, para ler um total consistente. */
    public long total() {
        var ordem = new TreeMap<>(contas).values().toArray(new Conta[0]);
        for (Conta c : ordem) c.trava.lock();
        try {
            long soma = 0;
            for (Conta c : ordem) soma += c.saldo;
            return soma;
        } finally {
            for (int i = ordem.length - 1; i >= 0; i--) ordem[i].trava.unlock();
        }
    }

    private Conta conta(String id) {
        Conta c = contas.get(id);
        if (c == null) throw new IllegalArgumentException("conta inexistente: " + id);
        return c;
    }
}
