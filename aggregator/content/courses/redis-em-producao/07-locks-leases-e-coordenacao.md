---
id: locks-leases-e-coordenacao
title: "Locks, leases e coordenação"
summary: "Um lock no Redis é um lease, e expira: correção exige liberar só o que é seu, renovar antes de expirar e impedir que o dono antigo escreva depois de perder o lease."
estimatedMinutes: 55
---

> **Stub.** Este marco ainda não tem conteúdo completo. A trilha `redis-em-producao` é escrita bloco a
> bloco (Bloco B). A tese, o conteúdo planejado e o hands-on deste marco já estão especificados no
> plano da trilha; o texto completo, os cinco blocos de Hands-on e o quiz chegam no PR dedicado a
> este bloco.

Um lock no Redis é um lease, e expira: correção exige liberar só o que é seu, renovar antes de expirar e impedir que o dono antigo escreva depois de perder o lease.
