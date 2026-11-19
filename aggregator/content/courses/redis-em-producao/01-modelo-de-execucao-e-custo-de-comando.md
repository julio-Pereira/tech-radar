---
id: modelo-de-execucao-e-custo-de-comando
title: "Modelo de execução e custo de comando"
summary: "Os comandos rodam um de cada vez: isso dá atomicidade de graça a cada comando e cobra caro, porque um comando lento é latência para todos os clientes, não só para quem o chamou."
estimatedMinutes: 55
---

> **Stub.** Este marco ainda não tem conteúdo completo. A trilha `redis-em-producao` é escrita bloco a
> bloco (Bloco A). A tese, o conteúdo planejado e o hands-on deste marco já estão especificados no
> plano da trilha; o texto completo, os cinco blocos de Hands-on e o quiz chegam no PR dedicado a
> este bloco.

Os comandos rodam um de cada vez: isso dá atomicidade de graça a cada comando e cobra caro, porque um comando lento é latência para todos os clientes, não só para quem o chamou.
