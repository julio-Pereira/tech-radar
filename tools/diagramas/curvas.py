#!/usr/bin/env python3
"""Pontos dos diagramas do tipo grafico que vêm de fórmula (PLANO D-G).

Os pontos não são digitados à mão: rode este script e cole a saída no
YAML do diagrama. Uso:

    python3 tools/diagramas/curvas.py amdahl
    python3 tools/diagramas/curvas.py little
"""
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


if __name__ == "__main__":
    {"amdahl": amdahl, "little": little}[sys.argv[1]]()
