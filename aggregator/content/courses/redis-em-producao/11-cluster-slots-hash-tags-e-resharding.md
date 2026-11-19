---
id: cluster-slots-hash-tags-e-resharding
title: "Cluster: slots, hash tags e resharding"
summary: "O cluster divide o espaço em 16.384 slots, e atomicidade, scripts e operações multichave só existem dentro de um slot: desenhar a chave é desenhar o que pode ser atômico."
estimatedMinutes: 60
---

> **Stub.** Este marco ainda não tem conteúdo completo. A trilha `redis-em-producao` é escrita bloco a
> bloco (Bloco C). A tese, o conteúdo planejado e o hands-on deste marco já estão especificados no
> plano da trilha; o texto completo, os cinco blocos de Hands-on e o quiz chegam no PR dedicado a
> este bloco.

O cluster divide o espaço em 16.384 slots, e atomicidade, scripts e operações multichave só existem dentro de um slot: desenhar a chave é desenhar o que pode ser atômico.
