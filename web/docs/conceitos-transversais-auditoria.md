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

---

# Fase 5 — auditoria final

Sobre o `main` depois do PR #78 (semente de 25 conceitos), com o build real.

## Relatório (`go test ./internal/course -run TestRelatorioConceitos -v`)

- **310 links de conceito** em 251 marcos; **nenhum cortado** pelo teto de 8.
- Por marco: 89 sem link, 78 com 1, 44 com 2, 24 com 3, 9 com 4, 3 com 5, 3 com 6, 1 com 7.
- Mais citados: idempotência 66, ADR 43, SLO 37, SLA 22, outbox 17, mTLS 14, saga 14.
- Candidatos ainda fora do registro, no topo: TTL, "Autorização", "Fase", "Janela", "Taxa",
  "Token", "Política", PAN — o ruído excluído de propósito (§6) e o PAN (achado editorial
  da Fase 4). A curadoria se sustenta: o que sobrou no topo é o que não deve entrar.

## Precisão (sigla com outro sentido)

Lidos no contexto todos os links dos conceitos de risco:

- **CDC** (12): todos *Change Data Capture*; nenhum Código de Defesa do Consumidor,
  embora a trilha de crédito exista.
- **saga** (14, inclusive minúscula): todos o padrão técnico.
- **PAR** (3) e **DORA** (4): todos corretos (DORA = métricas de entrega, não o regulamento).
- **RFC** (3): nenhuma citação de norma ("RFC 8705") ligada — `naoSeguidoDe` funciona.

## Revisão manual: 10 marcos, 10 trilhas

| Marco | Links | Leitura |
| --- | --- | --- |
| `credito-e-risco/03` | saga, idempotência | Ajuda: quem lê crédito não necessariamente fez eventos |
| `engenharia-de-dados/01` | idempotência | Ajuda: o verbete local existe, o link leva a quem ensina |
| `go-fintech/04` | JWT, `Idempotency-Key` | Ajuda: dois termos citados de passagem numa lista |
| `kafka/08` | outbox, CDC, saga | Ajuda; **e mostrou o ruído corrigido abaixo** ("idempotente (marco 05)") |
| `kubernetes/10` | JWT | Ajuda: "decodifique o JWT" sem explicar o que é |
| `lideranca-tecnica/02` | métricas DORA, SLOs | Ajuda |
| `open-finance-brasil/03` | PAR, `private_key_jwt`, mTLS, PKCE, JWT, FAPI | Denso (6), mas cada termo é central ali e tem dono em outra trilha |
| `spring-boot/09` | JWT, JWKS, FAPI, mTLS, `private_key_jwt` | É o caso do pedido; ajuda |
| `system-design/09` | ADRs, idempotência, saga | Ajuda |
| `dados-distribuidos/06` | CDC | Ajuda: "por CDC (marco 14)" vira clicável |

## Ruído encontrado e corrigido: a referência do autor prevalece

Em 7 dos 314 links, o termo vinha **logo seguido** de uma referência do autor para **outro**
marco — "consumidor ser idempotente (marco 05)", "`Idempotency-Key` (`spring-boot/06`)" — e
a página oferecia dois destinos para a mesma palavra. Regra nova no ligador: essa ocorrência
não liga e **não conta** como a primeira (uma menção seguinte ainda liga); se a referência
aponta para o **próprio dono**, o link fica. Vale para texto e para *code span*. Depois:
**0 de 310** links conflitam com uma referência do autor; os 2 que apontam para o dono
continuam ligados.

## Critérios de aceite (§10)

- [x] `go test ./...` verde; suíte Playwright verde (130 e2e) e unitários (7)
- [x] `TestConceitosResolve`: ids, donos, `tambem`, colisão de apelidos, `resumo`/glossário, dono contém apelido
- [x] Ligador: fronteira Unicode, apelido mais longo, primeira ocorrência, teto de 8, supressões, `CodeSpan` exato
- [x] Conservação do texto e determinismo nos 251 marcos
- [x] bluemonday preserva só `class="conceito"` e `data-conceito` (o `id` já era permitido — Fase 0, achado 3)
- [x] `spring-boot/09` liga `jwt`, `private-key-jwt`, `fapi` e `mtls`
- [x] E2E: prévia por *hover*, foco e toque; clique leva ao dono expandido; retorno ao elemento exato com foco e anúncio; Voltar do navegador; desvio aninhado de 2 níveis; "×"; movimento reduzido; *refresh* mantém a faixa
- [x] E2E: o "Continuar" da trilha de origem não muda depois de um desvio
- [x] axe sem violações sérias na prévia e na faixa; nenhum *handler* inline (CSP inalterada)
- [x] `conceitos.json` carregado só na primeira interação (verificado por rede)
- [x] Convenção "usar, não reensinar" no `README.md` — não há `PROJETO.md` geral (Fase 0)

## Fora desta entrega (registrado para decisão)

- **PAN**: entra quando `pagamentos-e-liquidacao/04` nomear o termo.
- **JOSE, JWE, DPoP, CIBA**: entram quando forem citados fora do próprio marco dono.
- **Pontes em tabela** continuam sem link (Fase 0, achado 2); o ligador de conceitos já trata
  tabelas, o de pontes não foi alterado.
- **Dono por seção** (âncora de `##`) segue para a v2, como decidido no plano.
