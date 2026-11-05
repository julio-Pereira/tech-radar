# Auditoria — Jornada "Preparação para Entrevistas" + Banco de Desafios (Fase 0)

Auditado contra `main` em `5b94ddd` (merge do PR #102), em 2026-11-05, antes de qualquer código.
Convenções encontradas no código têm precedência sobre o plano; cada divergência abaixo diz como
foi resolvida, com as decisões do Julio de 2026-11-05.

## 1. Learning paths por papel

**Existem.** `content/paths/*.yaml` (hoje só `tech-lead-para-staff.yaml`), compilados por
`internal/course/paths.go` para `web/data/paths.json`, exibidos em `#/paths` e `#/paths/<slug>`
(`web/js/courses/paths-view.js`). Cada passo é `ref: trilha/NN` (ou `whole: true` para a trilha
inteira), com `group` e `why` (≥20 caracteres); o compilador resolve a referência como as pontes e
recusa trilha ou marco inexistente.

**Divergência:** o plano (§6) propõe `jornadas/entrevista-senior.yaml` com `marcos:` e
`desafios: "*"`. **Resolução (decisão 1):** a jornada vira `content/paths/entrevista-senior.yaml` no
formato existente, com um tipo de passo novo para a prática contínua com desafios (Fase 8). Nenhum
formato paralelo.

## 2. Revisão espaçada

`#/revisar` (`web/js/courses/review-view.js`) usa caixas Leitner por cartão (`review-scheduler.js`,
intervalos 1-2-4-8-16-32 dias), estado em `tr:review:v1`. Desde os PRs #101/#102
(`TASK-revisao-so-marcos-concluidos`, concluída), o baralho só tem cartões de marcos concluídos
(`review-deck.js`, `buildEligibleDeck`), e 100% dos verbetes têm marco.

**Divergência:** o plano (§9) pede intervalos pela nota verificada (2, 7, 21, 45 dias) e parâmetros
novos a cada reaparição, o que as caixas Leitner não modelam. **Resolução (decisão 4):** agendador
puro próprio para desafios, com os intervalos do plano e chave própria no `localStorage`, exibido
como seção de desafios em `#/revisar`, com a mesma regra de pré-requisitos concluídos (Fase 4).

## 3. Registro de conceitos

`content/conceitos.yaml` existe, com dono por conceito e resolução testada
(`TestConceitosResolve`). Os desafios citam conceitos pelo `id`, e o compilador resolve o link
para o marco dono (`#/learn/<trilha>/<marco>`); id inexistente reprova o build.

**Divergência:** o plano usa `rate-limiting`, que **não existe** no registro (existem `outbox`,
`idempotencia`, `idempotency-key`). **Resolução:** um conceito só entra no registro com dono que o
ensine e citação fora do dono (regra do `TestConceitosResolve`). O desafio 1 usa os conceitos
existentes; `rate-limiting` fica pendente até haver dono (candidato: o marco de resiliência ou de
borda que o ensinar).

## 4. Marco final de entrevista em `system-design`

**Existe:** `system-design/15` — "Design review, antipadrões e entrevista". A seção "O framework de
condução com *timebox*, usado nos casos 09-12" é o framework de estudo de caso. Não há marco
separado de "estudo de caso": os casos são os marcos 09 (Pix ponta a ponta), 10 (Open Finance e
consentimento), 11 (extrato e notificações) e 12 (antifraude em tempo real).

**Divergência:** o plano usa `system-design/estudo-de-caso` e `system-design/entrevista`.
**Resolução:** pré-requisitos e passos usam `trilha/NN`, o formato das pontes e dos caminhos
(`system-design/15`, `system-design/09`...). O compilador recusa slug de marco por nome.

**Sobreposição:** os desafios 1 (Pix), 2 (extrato Open Finance), 3 (antifraude) e 5 (notificações)
repetem os temas dos casos 09-12. **Resolução (decisão 2):** viram prática desses casos. O marco
do caso é pré-requisito; o desafio traz parâmetros sorteados, reviravolta e rubrica próprios, e não
repete o texto do marco.

## 5. Pré-requisitos citados no plano (§7)

| Plano | Situação | Uso |
| --- | --- | --- |
| `spring-boot/idempotencia` | existe como `spring-boot/06` (idempotência e outbox) | `spring-boot/06` |
| `kafka/semantica-entrega` | existe como `kafka/05` (semântica de entrega e transações) | `kafka/05` |
| `system-design/estudo-de-caso` | não existe com esse nome; é `system-design/15` + casos 09-12 | `system-design/15` |
| trilha `design-de-codigo` | **não existe** | pendente; o eixo LLD usa `concorrencia-e-recursos` e `arquitetura-de-software` |
| `concorrencia-e-recursos` | existe | desafio 8 |
| `lideranca-tecnica` (dossiê) | existe; o dossiê é privado, fora do repositório (marco 01) | desafio 10 |
| trilhas de domínio financeiro | `pagamentos-e-liquidacao`, `open-finance-brasil`, `ledger-e-contabilidade`, `credito-e-risco` | desafios 1-6 |

## 6. Outras divergências

- **Código executável.** O repositório não tem código de exercício: as trilhas especificam os
  testes e o leitor os escreve no próprio `fin-platform`. O CI instala Go e Node, não Java.
  **Resolução (decisão 3):** o desafio LLD traz esqueleto, testes e solução de referência no
  repositório (o site publica só `web/`, então a referência não aparece na página, mas o repositório
  é visível e ela não é secreta), e um job de CI com Java e Go prova que os testes falham no
  esqueleto e passam na referência (Fase 5).
- **Script de viés "em Python".** Não existe no repositório. O que existe é o
  `TestQuizNotGameable` (Go): a correta pode ser a mais longa em no máximo 40% das questões. A
  posição é neutralizada pelo embaralhamento determinístico do build (`shuffleOptions`).
  **Resolução:** as decisões dos desafios seguem o mesmo limite de 40%, verificado no compilador.
  A posição é balanceada por construção: a correta da k-ésima decisão do banco vai para o índice
  `k mod n`, o que garante o limite de 35% por índice.
- **"Quebra o build".** No compilador, conteúdo inválido é WARN e fica fora do site (o deploy nunca
  cai por conteúdo). O CI é que reprova: `TestDesafiosRealContent` falha com qualquer desafio
  rejeitado, como `TestCompileRealContent` faz com as trilhas.
- **Localização.** `desafios/` do plano fica em `aggregator/content/desafios/`, ao lado de
  `courses/`, `paths/` e `conceitos.yaml`.

## 7. Ordem de execução

Um PR por grupo de fases:

1. Fases 0 + 1 — esta auditoria e o compilador (schema, fórmulas em AST, validações da §5.4,
   `desafios.json`, verificação anti-`eval` no CI).
2. Fase 5 — piloto: desafios 1 (`pix-10k-tps`), 7 (`storage-eventos-pix`) e 8
   (`rate-limiter-concorrente`, com o job de Java e Go no CI).
3. Fases 2 + 3 — front-end: catálogo, modo estudo, interpretador de AST e modo simulado.
4. Fase 4 — agenda em `#/revisar` e card "desafio da semana".

Depois disso, a Fase 6 (revisão do piloto com o Julio) decide os ajustes antes das Fases 7 a 9.
