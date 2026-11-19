---
id: replicacao-sentinel-e-failover
title: "Replicação, Sentinel e failover"
summary: "A replicação do Redis é assíncrona: o OK que você recebeu pode não existir no primário promovido, e o WAIT reduz a janela sem fechá-la."
estimatedMinutes: 60
---

> **Stub.** Este marco ainda não tem conteúdo completo. A trilha `redis-em-producao` é escrita bloco a
> bloco (Bloco C). A tese, o conteúdo planejado e o hands-on deste marco já estão especificados no
> plano da trilha; o texto completo, os cinco blocos de Hands-on e o quiz chegam no PR dedicado a
> este bloco.

A replicação do Redis é assíncrona: o OK que você recebeu pode não existir no primário promovido, e o WAIT reduz a janela sem fechá-la.
