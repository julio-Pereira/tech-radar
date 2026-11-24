# Auditoria — Walkthrough por eventos (Fase 1.7)

Registro da execução do plano "Walkthrough por eventos nos marcos". O plano manda re-auditar
`main` antes de começar e diz que, onde ele divergir do código, o código vence e o plano é
ajustado. Esta seção lista essas divergências e o que foi decidido.

## 1. Re-auditoria de `main` (24 nov 2026, commit `1a0f837`)

| Item | O que o código tem | Consequência |
| --- | --- | --- |
| Referência no marco | Diagramas entram por um bloco cercado ```` ```diagrama ```` com o id, trocado por um marcador `⟦diagrama:id⟧` antes do goldmark (o sanitizer apaga a classe de linguagem). Não há marcador em comentário HTML | O walkthrough usa o mesmo mecanismo: bloco ```` ```walkthrough ````, marcador `⟦walkthrough:id⟧`, coluna 0 obrigatória |
| Onde fica o arquivo | `content/courses/<trilha>/diagramas/<id>.yaml`, por id, não por marco. Não existem `*.tutorial.md` nem `*.challenge.md`: o hands-on é uma seção do próprio `NN-slug.md` | `content/courses/<trilha>/walkthroughs/<id>.yaml`, não `<NN>-<slug>.walkthrough.yaml`. O id é o que o marco cita, como nos diagramas |
| JSON | `web/data/diagramas/<slug>.json`, carregado só quando um marco na tela tem diagrama | `web/data/walkthroughs/<slug>.json`, fora do JSON da trilha |
| `topologia` | Até 12 nós, 6 colunas, rótulo ≤ 28 caracteres, aresta que corta caixa é erro de build. Aresta é direcional; o renderer já desenha o par `a→b` e `b→a` (`hasReverse`) | Os diagramas de camada seguem essas regras sem exceção. Sentidos opostos são duas arestas, como o plano pede |
| `sequencia` | Até 6 participantes e 14 mensagens; rótulo de mensagem ≤ 28 caracteres | A sequência derivada é uma por etapa (≤ 6 eventos cabe), e o rótulo da mensagem é o rótulo da aresta da topologia (≤ 28), não a `msg` (≤ 110), que fica no cartão |
| Estados da Fase 1.6 | `ativo, novo, saindo, removido, falha, inativo, destaque`, cumulativos, com marca textual além da cor | Os mesmos valores e a mesma semântica, cumulativos no walkthrough inteiro |
| Roteador | Só segmentos: `#/learn/<slug>/<marco>/<conceito>`. Não há query string em nenhuma rota | O deep link não pode ser `…?wt=…&e=14`; vai seguir os segmentos (decidido no PR do player) |
| `diagram.js` | Não exporta `draw`; o `diagram-player.js` (≤ 4 KB gzip) tem pacote WAAPI, estados e pausa por viewport/aba dentro de `attach` | A extração do núcleo compartilhado é passo próprio, com a suíte da Fase 1.6 sem alteração |

## 2. Decisões tomadas na execução

- **D1 — Etapa tem `id`.** A regra 1 do plano pede ids únicos para etapas, mas o exemplo não
  tem `id`. Etapa passa a ter `id` kebab-case obrigatório; ele também nomeia a sequência
  derivada (`<walkthrough>-<etapa>`).
- **D2 — Regra da sequência (§3.4).** Com até 6 atores, toda etapa mostra todos, na ordem
  declarada, e as colunas nunca mudam entre etapas. Com mais de 6, cada etapa mostra só os
  atores que usa, na ordem declarada, e registra quantos omitiu (`omitidos`). Se uma etapa
  precisar de mais de 6 colunas, o build falha. Coberto por `TestWalkthroughSequenciaGolden`,
  `TestWalkthroughSequenciaOmiteAtores` e `TestWalkthroughSequenciaRespeitaORenderer`.
- **D3 — `tipo` opcional no evento** (`sync | async | reply`, padrão `sync`). É o que a visão
  de sequência desenha como seta cheia, aberta ou tracejada. O plano não tinha esse campo,
  mas sem ele o "201 Created" e uma notificação de watch sairiam iguais a uma escrita.
- **D4 — Walkthrough não referenciado é erro**, não aviso (diagramas não referenciados são
  aviso). Um walkthrough é sempre feito para um marco; um arquivo solto é engano.
- **D5 — Diagrama de camada conta como referenciado.** Ele é citado pelo walkthrough, não pelo
  marco, e não gera o aviso de arquivo solto.
- **D6 — `<ol start>` liberado no sanitizer**, só com número de 1 a 3 dígitos, para a
  descrição textual manter a numeração contínua dos eventos ("14 de 18").
- **D7 — Linguagens de painel**: `yaml, bash, texto, json, go, java, log`. O destaque de
  linhas é por classe, sem highlight de sintaxe.

## 3. Validação no compilador (§4 do plano)

Cada regra tem caso válido e caso inválido em `aggregator/internal/course/walkthroughs_test.go`:

| Regra | Teste |
| --- | --- |
| 1 — ids únicos, referências existem | `TestWalkthroughRegra1Ids` |
| 2 — diagrama de camada existe, é `topologia`, contém os atores | `TestWalkthroughRegra2Diagrama` |
| 3 — aresta `de → para` no mesmo sentido | `TestWalkthroughRegra3Aresta` |
| 4 — `de ≠ para` | `TestWalkthroughRegra4MesmoAtor` |
| 5 — `pai` existe, sem ciclo, profundidade ≤ 2 | `TestWalkthroughRegra5Pai` |
| 6 — `painel.linhas` | `TestWalkthroughRegra6Linhas` |
| 7 — limites, `msg`, `anotacao`, 120 palavras | `TestWalkthroughRegra7Limites` |
| 8 — valores de `estados` | `TestWalkthroughRegra8Estados` |
| Caso válido (numeração contínua, estados cumulativos, painéis, breadcrumb) | `TestWalkthroughValido` |
| Descrição textual | `TestWalkthroughDescricaoTextual` |
| De ponta a ponta no `compileCourse` | `TestCompileCourseWalkthroughs` |
