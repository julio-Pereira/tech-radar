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

> Some sources (e.g. Baeldung) block GitHub Actions IPs with `HTTP 403`. The aggregator caches each successful fetch in `aggregator/cache/{id}.json` and falls back to it when a live fetch fails. Refresh by running locally and committing the updated cache.

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
otherwise compile in silence and never render.

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
