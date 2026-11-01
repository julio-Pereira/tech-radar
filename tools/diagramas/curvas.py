#!/usr/bin/env python3
"""Pontos dos diagramas do tipo grafico que vêm de fórmula (PLANO D-G).

Os pontos não são digitados à mão: rode este script e cole a saída no
YAML do diagrama. Uso:

    python3 tools/diagramas/curvas.py amdahl
    python3 tools/diagramas/curvas.py little
    python3 tools/diagramas/curvas.py montecarlo
    python3 tools/diagramas/curvas.py price-sac
"""
import random
import sys


def fmt(x):
    """Número em YAML, com no máximo duas casas e sem zeros inúteis."""
    return f"{x:.2f}".rstrip("0").rstrip(".")


def amdahl():
    # concorrencia-e-recursos/01: speedup(n) <= 1 / (s + (1 - s) / n)
    ns = [1, 2, 4, 8, 16, 32, 64]
    for s in (0.1, 0.3):
        pts = ", ".join(f"[{n}, {fmt(1 / (s + (1 - s) / n))}]" for n in ns)
        print(f"s={s}: [{pts}]")


def little():
    # concorrencia-e-recursos/07: conexões ≈ TPS × tempo de retenção (s)
    tps = range(0, 1001, 100)
    for ret_ms in (50, 250):
        pts = ", ".join(f"[{t}, {fmt(t * ret_ms / 1000)}]" for t in tps)
        print(f"retenção {ret_ms} ms: [{pts}]")


def montecarlo():
    # lideranca-tecnica/04: 40 itens no backlog, throughput semanal amostrado
    # do histórico (12 semanas, dados ilustrativos). Semente fixa: a saída é
    # reprodutível. Imprime a chance acumulada de terminar até cada semana e
    # as semanas dos percentis 50 e 85.
    historico = [2, 3, 3, 4, 4, 5, 5, 6, 7, 3, 4, 2]
    backlog, rodadas = 40, 10000
    rng = random.Random(42)
    semanas = []
    for _ in range(rodadas):
        feito, sem = 0, 0
        while feito < backlog:
            feito += rng.choice(historico)
            sem += 1
        semanas.append(sem)
    semanas.sort()
    ate = range(min(semanas), max(semanas) + 1)
    pts = ", ".join(f"[{w}, {fmt(100 * sum(1 for x in semanas if x <= w) / rodadas)}]" for w in ate)
    print(f"chance acumulada (%): [{pts}]")
    print(f"p50: semana {semanas[rodadas // 2 - 1]}; p85: semana {semanas[int(rodadas * 0.85) - 1]}")


def price_sac():
    # credito-e-risco/02: R$ 10.000,00 a 2% a.m. em 12 parcelas. Price: parcela
    # constante arredondada ao centavo, juros arredondados a cada mês e a
    # última parcela ajustada para zerar o saldo. SAC: amortização P/n exata,
    # parcela arredondada só no fim (arredondar no último passo).
    p, i, n = 10000.0, 0.02, 12
    pmt = round(p * i / (1 - (1 + i) ** -n), 2)
    saldo, price, juros_price = p, [], 0.0
    for k in range(1, n + 1):
        juros = round(saldo * i, 2)
        parcela = round(saldo + juros, 2) if k == n else pmt
        saldo = round(saldo - (parcela - juros), 2)
        juros_price += juros
        price.append(parcela)
    sac = [round(p / n + (p - (k - 1) * p / n) * i, 2) for k in range(1, n + 1)]
    print("price: [" + ", ".join(f"[{k}, {fmt(v)}]" for k, v in enumerate(price, 1)) + "]")
    print("sac:   [" + ", ".join(f"[{k}, {fmt(v)}]" for k, v in enumerate(sac, 1)) + "]")
    print(f"juros price {juros_price:.2f}; juros sac {sum(sac) - p:.2f}")


if __name__ == "__main__":
    {"amdahl": amdahl, "little": little, "montecarlo": montecarlo, "price-sac": price_sac}[sys.argv[1]]()
