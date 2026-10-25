# Conceitos transversais — auditoria da Fase 0

Auditoria do plano "Conceitos transversais: prévia, desvio e retorno entre trilhas" contra o
`main` em `0b891af` (merge do PR #73). Cada linha diz o que o plano supunha, o que o código
mostra e o que muda nas fases seguintes.

## Confirmado

| Ponto do plano | Onde | Resultado |
| --- | --- | --- |
| Pontes `` `slug/NN` `` viram link num *walk* de AST, resolvidas por `bridgeIndex` | `internal/course/bridges.go` (`linkifyBridges`, `buildBridgeIndex`) | Confirmado. O índice é `slug → NN → marco-id` e lê só o *frontmatter* |
| Deep link `#/learn/<slug>/<marco-id>` expande e rola | `router.js` (`parts[2]`), `course-view.js:192`, `scroll.js` (`scrollToMilestone(..., { expand: true })`) | Confirmado. A expansão é um `toggle.click()` no `.node-toggle` |
| Um 4º segmento hoje não quebra nada | `router.js:39` lê só `parts[1]` e `parts[2]` | `#/learn/a/b/c` já cai no marco `b`: a Fase 3 estende sem quebrar links antigos |
| `spring-boot/09` cita JWT, `private_key_jwt`, FAPI e mTLS sem nenhuma ponte | `spring-boot/09-seguranca-oauth2-fapi.md` | Confirmado: JWT ×7, `private_key_jwt` ×2, FAPI ×4, mTLS ×3, JWS ×0, pontes 0 |
| Glossário do mTLS aponta o marco errado | `seguranca-aplicacao/GLOSSARIO.md` (mTLS → "marco 06") | Confirmado: o 06 é `federacao-e-sso`; o 07 é `fapi-mtls-e-ciba` |
| "Idempotência" com dono divergente | `engenharia-de-dados/GLOSSARIO.md` ("marcos 01, 06 e 07") | Confirmado. Há também "Idempotência de negócio" (`arquitetura-eventos`, 08), "de pedido" (`engenharia-de-plataforma`, 02) e "de *posting*" (`ledger-e-contabilidade`) |
| CSP `script-src 'self'`, sem *handler* inline | `web/index.html` | Confirmado: `default-src 'self'; style-src 'self'; script-src 'self';` |
| Nenhum uso de `sessionStorage` hoje | `web/js` | Confirmado: só `localStorage`, via `storage.js` |

## Diverge do plano (ajustar nas fases)

1. **Pontes só são ligadas nas `sections`, nunca no campo `html`.** `ParseMilestone` passa o
   `bridgeIndex` só para `splitSections`; o `html` é um *fallback* em depreciação. **Fase 1:** o
   ligador de conceitos entra no mesmo ponto (depois de `linkifyBridges`, dentro de
   `splitSections`) e também não toca o `html`.
2. **Células de tabela não são percorridas.** `linkifyBridges` só entra em `Paragraph` e
   `TextBlock`; uma célula GFM (`TableCell`) tem *inlines* diretos, sem parágrafo. Verificado com
   `splitSections` sobre um caso mínimo: a ponte da célula fica sem link **e não entra na lista de
   quebradas**, então uma ponte errada dentro de tabela também escapa do `TestBridgesResolve`
   hoje. **Fase 1:** a §4.1 pede tabelas; o *walk* do ligador precisa tratar
   `TableCell` explicitamente (e o de pontes pode ganhar o mesmo, se o relatório mostrar o caso).
3. **Sanitização.** A `UGCPolicy` atual **já preserva `id`** em `<a>` e em qualquer elemento, com
   qualquer valor (teste empírico: `id="c-m-jws"` e `id="user-content-x"` sobrevivem), e **remove
   `class` e `data-*`**. `<a><code>…</code></a>` sobrevive. **Fase 1:** liberar só `class` com valor
   exato `conceito` e `data-conceito` com a regex do id; restringir `id` a `c-` não é necessário
   para o recurso e mudaria um comportamento existente, então fica fora.
4. **`id` de marco não é único no repositório.** `introducao` existe em `go-fintech/01` e
   `spring-boot/01` (251 ids, 1 duplicado). É único **por trilha**, e só uma trilha é renderizada
   por vez, então `id="c-<marco-id>-<conceito-id>"` continua único na página. A justificativa da
   §4.1 muda; a regra não.
5. **O desvio hoje muda o "Continuar" global.** Abrir o marco dono por deep link chama
   `setLastCourse(<dono>)` (`course-view.js:63`, a cada render de trilha) e, pela expansão,
   `setLastVisited(<dono>, <marco>)` (`timeline-node.js:163`). O "Continuar" **interno** da trilha
   de origem não muda (a chave `tr:lastvisited:` é por trilha), mas o banner "Continuar de onde
   parou" de `#/learn` (`tr:lastcourse`) passa a apontar a trilha dona. **Fase 3 (§5.6):** as duas
   chamadas precisam saber que a rota veio de um desvio; o E2E deve cobrir o banner de `#/learn`,
   não só o botão da trilha.
6. **Blocos de hands-on são `<details>` que podem estar fechados** (`sections.js`; o Gabarito
   sempre começa fechado). **Fase 3 (§5.5):** se o ponto de retorno estiver dentro de um bloco
   fechado, o retorno abre o `<details>` antes de rolar e dar foco. O mesmo vale para o marco
   dono: o conceito citado pode estar num bloco fechado.
7. **Números da §2.3.** Recontagem com uma heurística equivalente: **895** verbetes em 17
   glossários (o plano diz 834), **24** termos duplicados entre trilhas (o plano diz 22) e **241**
   verbetes citados fora da própria trilha (o plano diz 174; a diferença vem de como parênteses e
   fronteira de palavra são tratados). A tese não muda; o relatório da Fase 1 (§4.4) torna a
   medição reproduzível e substitui estes números.
8. **Minutos do exemplo.** `seguranca-aplicacao/04 · jose-por-dentro` tem **60 min**, não 25. A
   prévia deve ler `estimatedMinutes` do marco, nunca um valor escrito à mão.

## Convenção registrada

"Usar, não reensinar" (§7) está no `README.md`, em *Authoring a track* → *Cross-track concepts*.
Não há `PROJETO.md` geral no repositório; cada trilha tem o seu, e os próximos planos de trilha
citam a seção do README.
