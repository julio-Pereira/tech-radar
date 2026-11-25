<img src="web/icon-512.png" alt="Tech Radar logo" width="96" height="96" align="right" />

# Tech Radar

Personal tech article aggregator. Fetches RSS/Atom feeds from Java, Spring, and software architecture sources and serves them as a static SPA — no runtime infrastructure.

## Architecture

```
GitHub Actions (cron 6h)
  └── Go aggregator → web/data/feed.json → GitHub Pages → SPA
```

## Sources

| ID | Name | Category |
|---|---|---|
| baeldung | Baeldung | Java/Spring |
| spring-blog | Spring Blog | Java/Spring |
| martin-fowler | Martin Fowler | Architecture |
| infoq | InfoQ | Architecture |
| thoughtworks | ThoughtWorks | Architecture |
| dzone-java | DZone Java | Java/Spring |
| go-blog | The Go Blog | Go |
| dave-cheney | Dave Cheney | Go |
| engineering-at-meta | Engineering at Meta | Engineering |
| netflix-tech | Netflix Tech Blog | Engineering |

> Some sources (e.g. Baeldung) block GitHub Actions IPs with `HTTP 403`. The aggregator caches each successful fetch in `aggregator/cache/{id}.json`, with the date it was saved, and falls back to it when a live fetch fails — but only if the cache is at most **14 days** old. Past that, the source is left out of the build (with a `WARN`) instead of showing weeks-old items under a fresh "Atualizado" date. Refresh by running locally and committing the updated cache.

> **What the build refuses from a feed.** Every item must link over `https` to a host on the source's `allowed_hosts` (default: the feed's own host), with no user info or port, and have a date that is not in the future. Anything else is dropped and logged. If more than half of a source's items are dropped in one build, the feed looks compromised: the build keeps that source's previous cache and does not overwrite it. Title, summary and author become plain text.

## Curated Baeldung series

Baeldung's evergreen "series" (Java Concurrency, Maven, Spring Boot, …) are not in its RSS feed, so they're hand-curated in `aggregator/series.yaml` and injected as Baeldung items with `kind: "series"`. They power the dedicated **"Baeldung Series"** daily card and show up in search and the Baeldung source filter. Edit `series.yaml` to add or remove series.

## Today's Reading

`web/themes.json` defines the daily cards. Each theme matches items by `sourceId`, `category`, and/or `kind`; a deterministic per-day pick (`cyrb53(localDate + themeId)`) keeps each card stable for the day and rotates it the next.

## Trilhas de Aprendizado (learning tracks)

Beyond aggregating articles, the radar hosts **authored learning tracks** — linear,
progressive courses per technology, with examples adapted to a fintech context. The
content is original and the source material is **referenced by link only** (never copied
or stored). The SPA renders each track as a vertical **timeline** of milestones with
per-browser progress tracking (`localStorage`).

Routes (hash-based, so they work under the `/tech-radar/` Pages prefix):

| Route | View |
|---|---|
| `#/` | Radar (article aggregator) |
| `#/learn` | Track catalog |
| `#/learn/<slug>` | A track's timeline |
| `#/paths/<slug>` | A role-based path over existing milestones (`content/paths/`) |
| `#/desafios` | Desafio bank: catalog, study mode and timed simulated rounds |
| `#/revisar` | Spaced review: quiz cards and the desafio queue |

### Banco de desafios e jornada de entrevista

Interview prep is not a track of its own. It is a **path**, `entrevista-senior`, made of
existing milestones, that ends with the **desafio bank** (`aggregator/content/desafios/`).
A desafio is recurring practice, not a milestone. It has parameters drawn per round,
clarifying questions, estimates, decisions, a twist and a deliverable. The parts the
machine can check are scored apart from the self-assessed rubric:

- Formulas compile to a closed-grammar AST, never `eval`; CI greps for it.
- LLD desafios ship tests that must fail on the skeleton and pass on a reference
  solution, in Go (`-race`) and Java.
- Rounds and drafts live only in the reader's `localStorage`. Behavioural answers never
  leave the browser.

A desafio unlocks once its prerequisite milestones are done. It then comes back on a
schedule driven by its verified score. The path shows a readiness radar on five axes:
HLD, LLD, estimativa, domínio and comportamental. The format, validation rules, schedule
and radar math are in `aggregator/content/desafios/_schema.md`.

### Projeto guia (capstone)

Tracks are not just reading. Each one builds one component of **`fin-platform`**, a single
fintech system that survives across tracks — so the exercises accumulate into a portfolio
instead of dying at the end of a milestone.

| Track | Component | Role |
|---|---|---|
| `spring-boot` | `pix-gateway` (Java) | Payment initiation, idempotency, outbox |
| `go-fintech` | `ledger-core` (Go) | Double-entry ledger, risk decision |
| `kafka` | `pix-stream` | Event backbone, DLQ, projections |
| `kubernetes` | `fin-platform` (GitOps) | Where it all runs, with security |
| `observabilidade` | `fin-watch` | The telemetry, SLOs and on-call over it |
| `arquitetura-eventos` | `fin-flow` | The event design the backbone carries |
| `dados-distribuidos` | `fin-store` | The data layer the ledger is written on |

Each track ships a `PROJETO.md` (spec: increments per milestone, definition of done, game
day) and closes with a `## Capstone` section in its last milestone. `PROJETO.md` is **not**
listed in `milestones:` — it is a repo-level spec, not a rendered milestone. Tracks assume
only **contracts** from each other (an endpoint, a topic), never code, so they can be taken
in any order.

### Authoring a track

One folder per track under `aggregator/content/courses/<slug>/`:

```
aggregator/content/courses/spring-boot/
  course.yaml              # manifest
  01-introducao.md         # one milestone = one markdown file (with frontmatter)
  02-auto-config.md
  03-actuator-observabilidade.md
```

`course.yaml` (manifest):

```yaml
slug: spring-boot
title: "Spring Boot para Fintech"
subtitle: "Do zero a produção, com exemplos de pagamentos e Open Finance."
category: "Java/Spring"          # reuses the radar categories
tags: [java, spring, backend]
level: intermediate              # beginner | intermediate | advanced
lang: pt-BR
estimatedHours: 6
sources:                         # attribution — links only, no copied text
  - title: "Baeldung — Spring Boot"
    url: https://www.baeldung.com/spring-boot
milestones:                      # timeline order = this list's order
  - 01-introducao.md
  - 02-auto-config.md
  - 03-actuator-observabilidade.md
```

Each milestone file is YAML frontmatter + authored markdown body:

```markdown
---
id: auto-config
title: "Auto-configuração e Starters"
summary: "Short one-liner shown collapsed on the timeline."
estimatedMinutes: 25
references:                      # optional, milestone-specific links
  - title: "Spring Boot Reference — Auto-configuration"
    url: https://docs.spring.io/spring-boot/reference/using/auto-configuration.html
---

## Section heading

Authored content… include a `## Exemplo numa fintech` section per milestone.
```

Body anatomy for a full milestone: 4–8 `##` sections → `## Exemplo numa fintech` →
`## Hands-on` → `## Principais aprendizados`, 1.100–1.600 words. The `## Hands-on`
block is written **inline in the milestone**, never as a sibling file, and has five
parts: `**Tutorial**` (guided steps) → `**Desafio**` (do it without the steps) →
`**Invariantes testáveis**` (what must hold, checkable) → `**Complemento**` (optional
extension) → `**Checagem**` (four open recall questions, no answers given).

### Quizzes

A milestone may have a sibling `NN-nome.quiz.yaml`. Absent is valid — the milestone
just renders without a quiz. Four questions is the standard; six for the milestones
that carry the hardest ideas.

```yaml
questions:
  - question: "Qual é o modo de falha característico do CDC?"
    options:                       # 2+ options, exactly one correct
      - "O conector satura a CPU do banco ao ler o log"
      - "O conector bloqueia as tabelas durante a leitura"
      - "Slot de replicação parado faz o WAL encher o disco"
    answer: 2                      # 0-based index into options
    explanation: "Enquanto o slot não confirma consumo, o banco retém o log."
```

**Option order is not yours to worry about.** The compiler shuffles every question's
options deterministically (seeded by `slug/milestone-id/question-index`) and moves
`answer` to wherever the correct option landed. The index you write is never the index
a reader sees, the same quiz always compiles to the same order, and positional bias
cannot be authored back in.

**What is still authoring** (enforced by `TestQuizNotGameable`):

- The correct option must not read as the longest one (max 40% of questions).
  Shuffling moves an option; it does not shorten it. Reasoning belongs in
  `explanation`, not inside the correct option.
- Distractors are real senior mistakes, not obvious absurdities.

**Gating completion on the quiz** is opt-in, per milestone, in the frontmatter:

```yaml
completion: quiz    # the "mark as done" checkbox stays locked until every answer is right
```

Omit it and the reader ticks the box whenever they like — that is the default for every
milestone today. `completion: quiz` on a milestone without a quiz file is a compile
error, and so is any other value, so a typo cannot silently disable the gate. A milestone
already marked done stays unlocked: re-locking a finished node would only punish a revisit.

### Glossary

A track may ship a `GLOSSARIO.md` — plain markdown, no frontmatter, verbetes grouped
by `##`. It is **only compiled when the manifest declares it**:

```yaml
glossary: GLOSSARIO.md           # without this key the file is silently ignored
```

### Cross-track concepts: usar, não reensinar

The same concept shows up in many tracks (ADR, SLO, idempotência, mTLS, FAPI...). Each
transversal concept has **one owner milestone**, the one that actually teaches it; every
other track **uses** the term and explains only the **delta** for its own context. The
owner registry is `aggregator/content/conceitos.yaml` (concept id, owner as `slug/NN`,
exact aliases), and the compiler links each cited term to its owner, with a preview and a
way back. *Status: the registry, the linker (Fase 1; curated seed of 25 concepts in Fase 4) and the preview
(Fase 2: hover 300 ms, keyboard focus, or first tap on touch; `conceitos.json` is fetched
on the first interaction) and the detour/return (Fase 3: following a concept rewrites the
current history entry to `#/learn/<slug>/<marco>/<conceito>`, so Back and a refresh land
on the exact term; a return banner and "Terminou? Voltar" bring the reader back; a detour
never moves "Continuar de onde parou") are in. Reverse links (Fase 4): the owner milestone
lists where its concepts are used ("Usado em"), and the glossary marks the owner's
definition as the principal one — or, when the owner trilha has no entry for the term,
says where it is taught.*

The linker links only the **first occurrence** of each concept per milestone, at most
**8** concept links per milestone, never in the owner milestone, headings, code or links,
and never in a block that already bridges to the same owner (that occurrence still counts
as the first). The author's own pointer also wins: a term right before "(marco NN)" or a
`` (`slug/NN`) `` bridge to a milestone other than the owner stays plain, and doesn't count as
the first occurrence. It writes `web/data/conceitos.json` (owner, summary, "tambem", "citadoEm")
next to `glossary.json`.

- **Use, don't re-teach.** If a concept has an owner, cite the term and write only what
  your context adds; the link and the preview carry the definition.
- **Explicit bridges stay.** A `` `slug/NN` `` bridge ("Reencontro — `slug/NN`") is still
  how an author highlights a relationship on purpose; the concept linker never adds a
  second link to the same owner in a paragraph that already has the bridge.
- **A new transversal concept enters the registry in the same PR as its owner track.**
- **Common words never become concepts.** "Taxa", "Fase", "Política", "Estado", "Token"
  and other everyday Portuguese words, and ambiguous acronyms (TTL), only enter with a
  compound, unambiguous alias.

### Diagrams: typed data, not pictures

A diagram is **content of the first class, like a quiz**: a typed YAML file, validated by
the compiler, drawn by the browser as plain SVG (`web/js/courses/diagram.js`, no
library, no inline style — the CSP is `style-src 'self'`). One file per diagram, in
`content/courses/<trilha>/diagramas/<id>.yaml`, referenced from a milestone by a fenced
block (two ids, one per line, draw them side by side):

````markdown
```diagrama
kafka-particoes-e-isr
```
````

The compiler replaces the block with a `<figure data-diagrama="<slug>/<id>">` holding the
title and the full textual description (readable without JavaScript), and writes the
specs to `web/data/diagramas/<slug>.json`, which the front end fetches only when a
milestone on screen has a diagram. No SVG element is ever allowed by the sanitizer.

Five types, and only five: **`topologia`** (components and connections — `grupos`, `nos`,
`arestas` with `estilo: normal|tracejada`), **`fluxo`** (steps with branches —
`passos`, `arestas` with `tipo: normal|falha|compensacao`), **`estados`** (a life cycle —
`estados`, `transicoes` with `evento` and optional `guarda`, `inicial`, `finais`) and
**`sequencia`** (messages over time — `participantes`, `mensagens` with
`tipo: sync|async|reply` and an optional `nota`) and **`grafico`** (data shape —
distributions, curves, comparisons: `forma: linha|barra|area`, `eixo_x` with
`tipo: categoria|numero`, `eixo_y`, 1–4 `series` of `[x, y]` points, optional
`anotacoes` of type `linha-x|linha-y|faixa-x|faixa-y`, and a mandatory `fonte`: `"dados
ilustrativos"` or the https link of the origin; the figure also carries the numbers as a
table, readable without JavaScript). Grid types place every element with
`col`/`row` (and groups with `cols`/`rows`): the layout is declared by the author, there
is no layout engine. Presentation is semantic — `papel: destaque|externo|fora-da-transacao`
on a node — and becomes a CSS class; colors never go in the YAML. A node or participant
with `conceito: <id>` (from `conceitos.yaml`) is a link to the concept's owner milestone,
with the same detour and return as a concept in the prose. An edge that would cut
through another box is a **build error**: move a node, or bend the edge with
`via: [{ col: 0, row: 0.5 }, { col: 2, row: 0.5 }]` (half steps are the lanes between rows
and columns).

```yaml
id: exemplo-topologia
tipo: topologia
titulo: "O evento sai do outbox, nunca direto do pix-gateway"   # an assertion, not a label
descricao: >   # mandatory, at least 40 words: what a screen reader reads
  O pix-gateway grava o pagamento na tabela payments e o evento PaymentInitiated ...
grupos:
  - { id: postgres, rotulo: "Postgres", col: 1, row: 0, cols: 1, rows: 2 }
nos:
  - { id: gateway, rotulo: "pix-gateway", col: 0, row: 0, papel: destaque }
  - { id: outbox, rotulo: "outbox", grupo: postgres, col: 1, row: 1, conceito: outbox }
arestas:
  - { de: gateway, para: outbox, rotulo: "INSERT, mesma tx" }
```

The build fails (the track is skipped, and `TestCompileRealContent` fails CI) when: the
`id` differs from the file name; a key is unknown or belongs to another type; an edge,
message or transition points at something not declared; two elements share a grid cell,
or a node lies outside its group; the title passes 90 characters or a label 28; the
description has fewer than 40 words; there are more than 12 elements (6 participants and
14 messages in a sequence) — split the diagram; a `conceito` is not in `conceitos.yaml`;
a `diagrama` block names an id that doesn't exist, or is indented (inside a list or a
quote); an edge crosses a box; a chart breaks its own rules (series, points, increasing
`x`, annotations outside the axes, `log` with values ≤ 0, no `fonte`). A diagram file no
milestone references is a warning, and so is a drawing wider than 1100px — keep to **4
columns or fewer**. Examples of each type live in `aggregator/internal/course/testdata/diagramas/`.

**When to draw.** A milestone gets a diagram when its prose describes **3 or more
components interacting**, an **order of messages**, the **states of a life cycle** or a
**pipeline with branches or compensation**. One diagram, one idea; the title is an
assertion ("o PSP fica fora da transação"), not a label ("Transações"). Use the domain's
names — `pix-gateway`, `ledger-core`, `pix-stream`, real topics and events — never
`Service A`. The diagram complements the prose: the text stays self-sufficient, and the
diagram never states a fact the text doesn't support. **ASCII diagrams are not allowed**:
a fenced block without a language (or `text`) that has box-drawing characters or arrows
fails the build. Every track was converted; the rule is permanent.

**Coverage report.** `go run ./cmd/cobertura` (in `aggregator/`) prints, per track, the
diagrams, the animated ones and the charts, the milestones with prose and no diagram, and
the ASCII left. The floor is **⌈milestones with prose / 2⌉** diagrams; a stub milestone
(it opens with `> **Stub.**`) doesn't count until its prose exists. CI writes the report
to the job summary and uploads it as the `cobertura-diagramas` artifact. It informs, it
doesn't gate: a track below the floor is marked ⚠.
A last section lists **milestones without a diagram that show a sign of the trigger**: two or
more config or shell blocks in the prose, a list of four or more steps with flow verbs, four or
more arrows, or six or more state terms. The trigger is the author's judgment, so this list is a
prompt to look, never a failure.
The report ends with the **glossary coverage**: per track, how many glossary entries resolve to
a real milestone (`Onde na prática: marco NN`, with NN existing in the track). Only those enter
the spaced review (`#/revisar` shows cards from completed milestones only). The same numbers are
pinned by a golden file (`internal/course/testdata/glossario-cobertura.golden`); changing them
is deliberate: `UPDATE_GOLDEN=1 go test ./internal/course -run TestCoberturaGlossarioGolden`.
A floor test (`TestCoberturaGlossarioPiso`) fails the build if any track drops below 95%.

**Planning a new track.** The plan's table of milestones gets a **"diagrama"** column: for
each milestone, the diagram it will have (type and one-line idea) or "—" when the prose
doesn't hit any of the triggers above. The diagrams are written with the prose, not
retrofitted later.

**Animation by steps.** A diagram whose lesson is a process in time — a rolling update,
a canary, a saga compensating, an alert's life cycle — gets an `animacao:` list (the plan
calls it `passos`, but that key is already the node list of `fluxo`). Animate when the
**order or the transition is the content**, never to decorate.

```yaml
animacao:
  - legenda: "4 pods v1 atendem; maxSurge 1, maxUnavailable 0"   # step 1 = the base drawing
  - legenda: "Sobe 1 pod v2; fica fora do Service até ficar ready"
    estados: { p5: novo }          # ativo | novo | saindo | removido | falha | inativo | destaque
    rotulos: { p5: "v2 · iniciando" }
    fluxos: [ { de: svc, para: p5, rotulo: "5%" } ]   # an existing edge, same direction
    anotacao: "capacidade nunca abaixo de 4"
```

`estados` and `rotulos` are **cumulative** (they hold until a later step changes them);
`fluxos` and `anotacao` last one step. A `fluxos` label only replaces an edge label that
exists. In `estados`, every step names the `atual` state and may name the `transicao`; in
`sequencia`, `animacao: mensagens` makes one step per message, or each step reveals up to
message `ate`. At most 12 steps; each `legenda` (≤ 90 characters) is an assertion, like a
title. **Numbers must agree** across legend, labels and prose — percentages, replicas,
limits (a canary of 5% with 20 replicas is 1 pod). The compiler validates all of it and
writes the steps as a numbered list in the textual description. The player
(`web/js/courses/diagram-player.js`, ≤ 4 KB gzip, loaded only for a track with an animated
diagram) never autoplays, pauses off screen and in a hidden tab, is driven by keyboard
(Space, ←/→, Home/End), announces each legend, and with `prefers-reduced-motion` changes
steps without moving anything.

On screen the figure is wider than the reading column (up to 1100px), never shrinks below
80% of its natural size, and says in text when it still has to scroll; **Ampliar** opens
it full screen in a modal dialog — the main path on a phone. `web/tests/diagram-real.spec.js`
opens every compiled diagram and fails on a label outside the drawing, two labels on top
of each other, a line over a box, a figure that scrolls on a 1280px desktop, or a CSP
violation. The renderer and its primitives have a budget of **10 KB gzip** together,
checked by a test; what not every diagram uses stays out of it and loads on first use:
Ampliar (`diagram-zoom.js`, on the first click) and the `grafico` type (`diagram-chart.js`,
only on a track with a chart), each with its own ceiling.

**Walkthroughs by events** (Fase 1.7). When the lesson is a long chain of cause and
effect between components — from `kubectl apply` to a Pod receiving traffic, a Pix end to
end — a diagram's 12 steps are not enough and the prose drifts away from the drawing. A
walkthrough is typed data too: `content/courses/<trilha>/walkthroughs/<id>.yaml`,
referenced from a milestone by a fenced `walkthrough` block with its id (same rules as
`diagrama`: column 0, an unknown id fails the build, and so does a walkthrough no
milestone cites). It never draws a layout of its own: `atores` are the single source of
truth, each `camada` points to an existing **`topologia`** diagram whose nodes use the
actors' ids (`pai` builds the breadcrumb, `Cluster / node-2`), and each `etapa` fixes one
layer and lists its `eventos`.

```yaml
id: k8s-do-apply-ao-pod-ready
titulo: "Do kubectl apply ao Pod recebendo tráfego"
resumo: "Ninguém manda o nó rodar o Pod: cada componente observa o API server e reage"
atores:
  - { id: kubectl, rotulo: "kubectl" }
  - { id: api, rotulo: "kube-apiserver" }
camadas:
  - { id: cluster, rotulo: "Cluster", diagrama: k8s-wt-cluster }
  - { id: node-2, rotulo: "node-2", diagrama: k8s-wt-node, pai: cluster }
paineis:
  - { id: deployment, linguagem: yaml, titulo: "deployment.yaml", conteudo: "…" }
etapas:
  - id: pedido
    titulo: "O pedido chega"
    subtitulo: "Gravar não é executar"
    camada: cluster
    texto: "Markdown curto (≤ 120 palavras)."
    eventos:
      - de: kubectl
        para: api
        msg: "kubectl envia o Deployment via HTTPS, autenticado pelo certificado do kubeconfig"
        painel: { id: deployment, linhas: "1-6" }   # N or N-M, inside the panel
        tipo: sync            # optional, for the sequence view: sync | async | reply
        anotacao: "≤ 60 caracteres, só neste evento"
        estados: { api: ativo }   # cumulative, the values of Fase 1.6
```

An event is a `fluxo` of Fase 1.6: the edge `de → para` must exist **in that direction**
in the diagram of the step's layer (a watch and a write are two edges). Event numbers run
across the whole walkthrough ("evento 14 de 18"); steps have their own. `msg` (≤ 110
characters) is an assertion in the present with an explicit subject, like a legend.
Limits: 8 steps, 6 events per step, 30 events, 3 layers (depth 2), 4 panels of 40 lines;
past that, split the process in two walkthroughs or two milestones. **The sequence view is
derived, never written**: one `sequencia` per step, one message per event, labelled with
the topology edge's label (or "evento N"). With up to 6 actors every step shows all of
them in the declared order, so columns never move; with more, a step shows only the actors
it uses and says how many it left out, and a step that would need more than 6 columns
fails the build. The compiler writes the specs to `web/data/walkthroughs/<slug>.json` and
the full textual description into the milestone — every step, its prose and every event
as `origem → destino: msg` — for a screen reader, a reader without JavaScript and a
printout. A walkthrough is never part of the completion gate (the quiz is).

The player (`web/js/courses/walkthrough-player.js`, ≤ 6 KB gzip, downloaded only for a
milestone with a walkthrough) shares its core with the diagram player
(`diagram-core.js`: the packet, the state marks, pausing out of sight) and draws the
layers and the sequences with the same renderer. On a phone the view is sticky on top
(at most 45vh) with the breadcrumb and a `Topologia | Sequência` tablist, then the event
card (`origem → destino`, the `msg`, the annotation), the controls (⏮ « ◀ ▶ ▶| » and
0,5× / 1× / 2×), "Etapa 6 de 7", the step's prose and, when the event has one, the panel
with its lines highlighted (closed by default); on a desktop the view sits on the left.
It never autoplays: play runs the current step and stops at its end, so the reader gets
to the prose before going on. Space, ←/→, PageUp/PageDown and Home/End drive it; each
event is announced ("Evento 16 de 19. kubelet (worker2) para kube-apiserver. …"), and a new step's
title first. Off screen, in a hidden tab or with `prefers-reduced-motion` nothing moves,
not even the change of layer. **Ampliar** opens the view full screen, on the current event,
with its own event card, controls and announcements (the page behind a modal dialog is
inert): the zoomed view follows the walkthrough across layers and views, plays the same way,
and closing it leaves the figure on the event where the dialog stopped.
A deep link lands paused on one event: `#/learn/<slug>/<marco>/wt/<id>/<evento>` (the
4th segment is `wt`, which is why no concept may have that id); moving inside the player
replaces the entry instead of adding history.

**Walkthrough or animated diagram.** Use a walkthrough when the process has **more than
12 steps, or changes scale** (cluster → node), **or needs a panel** that ties an event to
the YAML, the command or the log the reader sees; anything shorter stays an animated
diagram. `msg` is an assertion in the present with its subject ("O scheduler grava um
Binding para o worker2"), not a label. Numbers agree across YAML, panel, `msg` and
prose — replicas, node names, the one Pod followed — and with the rest of the track
(the kubernetes pilot uses the track's 3 replicas and the `kind` cluster of milestone 01,
not new ones). A panel that shows tool output that was not captured from a real run says
so in its `nota` ("Saída ilustrativa").

**Illustrations** (what isn't a graph — the anatomy of a log record, say) are authored
images in `content/courses/<trilha>/assets/` (`svg`, `png` or `webp`, at most 200 KB),
referenced as `![alt text](assets/file.svg)` with a non-empty alt. Remote images and
hotlinks fail the build; the files are copied to `web/data/assets/<slug>/`.

Each track with a capstone component also opens with a **"você está aqui"** mini-map:
its component on the fin-platform map, between what it uses and what uses it, linking to
`#/fin-platform` (drawn from `capstones.json` with the same SVG primitives).

### Compiling

The same `go run .` that builds the feed also compiles tracks: it renders each
milestone's markdown to HTML (goldmark, GFM), **sanitizes it at build time**
(`bluemonday`), and writes `web/data/courses/<slug>.json` plus a lightweight
`index.json` catalog. A malformed track is logged and skipped — it never aborts the
feed build (and vice versa). Validation failures: missing/duplicate `slug`, a milestone
file listed but absent, a duplicate milestone `id`, or invalid frontmatter.

Skipping is right in production and dangerous in CI — a track can disappear from the
site without anything turning red. `go test ./...` (a required CI step) closes that:
`TestCompileRealContent` compiles the real `content/courses` and fails if any track was
skipped or came out with zero milestones, `TestQuizNotGameable` enforces the length rule
above across every quiz in the repo, `TestShuffleIsStableAndKeepsTheAnswer` guards that
the shuffle stays deterministic and never loses the correct answer, and
`TestGlossaryIsDeclared` catches a `GLOSSARIO.md` that no manifest declares — which would
otherwise compile in silence and never render. `TestConceitosResolve` fails on an invalid
`conceitos.yaml` (ids, owners, alias collisions, an owner that never mentions its own
concept, an empty `resumo` with no glossary entry to fall back on), and
`go test ./internal/course -run TestRelatorioConceitos -v` prints the non-blocking curation
report: links per concept, links cut by the cap, and the candidate terms not yet registered.

## Running locally

```bash
cd aggregator
OUTPUT_FILE=../web/data/feed.json go run .
# then serve web/ with any static server, e.g.:
python3 -m http.server 8080 --directory web
```

## Deployment

Push to `main` or wait for the 6-hour cron. GitHub Actions builds the feed and deploys to GitHub Pages automatically.

**Setup (one-time):** Enable GitHub Pages in Settings → Pages → Source: GitHub Actions.

## Adding sources

Edit `aggregator/sources.yaml` — add an entry with `id`, `name`, `category`, and RSS/Atom `url`. The aggregator discovers and caps items automatically.

## Config

Environment variables (override `sources.yaml` defaults):

| Variable | Default | Description |
|---|---|---|
| `SOURCES_FILE` | `sources.yaml` | Path to sources config |
| `SERIES_FILE` | `series.yaml` | Path to curated Baeldung series |
| `OUTPUT_FILE` | `../web/data/feed.json` | Output path for feed JSON |
| `CACHE_DIR` | `cache` | Per-source fetch cache directory |
| `COURSES_CONTENT_DIR` | `content/courses` | Source folder for authored tracks |
| `COURSES_OUTPUT_DIR` | `../web/data/courses` | Output dir for compiled track JSON |

## Licenses

- **Code** (the aggregator, the tools, the site in `web/`, and every source file inside `aggregator/content/`, such as the desafios' skeletons, tests and reference solutions): [MIT](LICENSE).
- **Content** (the trilhas, marcos, tutorials, quizzes, glossaries, diagrams, desafios and paths in `aggregator/content/`, and the docs in `web/docs/`): [CC BY-NC-SA 4.0](LICENSE-CONTENT). You may copy and adapt it with credit, for non-commercial use, under the same license.
- **Third-party articles:** the radar only links to them. Their titles and summaries in `web/data/feed.json` belong to their authors and outlets, and neither license above applies to them.

Security reports and the repository's controls: [SECURITY.md](SECURITY.md).
