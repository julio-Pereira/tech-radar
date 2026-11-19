---
id: atomicidade-multi-watch-lua-e-functions
title: "Atomicidade: MULTI, WATCH, Lua e Functions"
summary: "O Redis tem atomicidade de isolamento (ninguém intercala) e não tem atomicidade de falha (não há rollback); quem confunde as duas escreve código que debita metade."
estimatedMinutes: 65
---

> **Stub.** Este marco ainda não tem conteúdo completo. A trilha `redis-em-producao` é escrita bloco a
> bloco (Bloco B). A tese, o conteúdo planejado e o hands-on deste marco já estão especificados no
> plano da trilha; o texto completo, os cinco blocos de Hands-on e o quiz chegam no PR dedicado a
> este bloco.

O Redis tem atomicidade de isolamento (ninguém intercala) e não tem atomicidade de falha (não há rollback); quem confunde as duas escreve código que debita metade.
