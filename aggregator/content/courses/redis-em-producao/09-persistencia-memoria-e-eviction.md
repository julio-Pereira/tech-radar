---
id: persistencia-memoria-e-eviction
title: "Persistência, memória e eviction: o que se perde"
summary: "Há duas formas de o Redis perder um dado sem falhar nenhum comando, o crash antes do fsync e a eviction por falta de memória, e as duas têm tamanho e configuração."
estimatedMinutes: 65
---

> **Stub.** Este marco ainda não tem conteúdo completo. A trilha `redis-em-producao` é escrita bloco a
> bloco (Bloco C). A tese, o conteúdo planejado e o hands-on deste marco já estão especificados no
> plano da trilha; o texto completo, os cinco blocos de Hands-on e o quiz chegam no PR dedicado a
> este bloco.

Há duas formas de o Redis perder um dado sem falhar nenhum comando, o crash antes do fsync e a eviction por falta de memória, e as duas têm tamanho e configuração.
