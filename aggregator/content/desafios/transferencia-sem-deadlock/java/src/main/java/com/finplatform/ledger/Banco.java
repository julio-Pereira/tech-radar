package com.finplatform.ledger;

import java.util.Map;

/**
 * Esqueleto do desafio transferencia-sem-deadlock: contas em memória e transferências
 * entre elas, seguras para uso concorrente. Nenhuma combinação de transferências
 * simultâneas pode travar, o total de dinheiro nunca muda e nenhum saldo fica negativo.
 * Os testes em BancoTest descrevem o comportamento esperado e falham até que a
 * implementação esteja certa.
 */
public final class Banco {

    /**
     * @param saldosIniciais conta → saldo em centavos
     * @throws IllegalArgumentException se o mapa estiver vazio ou algum saldo for negativo
     */
    public Banco(Map<String, Long> saldosIniciais) {
        // TODO
    }

    /**
     * Move {@code centavos} de {@code origem} para {@code destino}, de forma atômica.
     *
     * @return false, sem mudar nada, se a origem não tiver saldo suficiente
     * @throws IllegalArgumentException se centavos não for positivo, se origem e destino
     *                                  forem a mesma conta ou se alguma conta não existir
     */
    public boolean transferir(String origem, String destino, long centavos) {
        // TODO
        return false;
    }

    /** Saldo atual da conta, em centavos. */
    public long saldo(String conta) {
        // TODO
        return -1;
    }

    /** Soma dos saldos de todas as contas. */
    public long total() {
        // TODO
        return -1;
    }
}
