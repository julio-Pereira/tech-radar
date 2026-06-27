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

### Compiling

The same `go run .` that builds the feed also compiles tracks: it renders each
milestone's markdown to HTML (goldmark, GFM), **sanitizes it at build time**
(`bluemonday`), and writes `web/data/courses/<slug>.json` plus a lightweight
`index.json` catalog. A malformed track is logged and skipped — it never aborts the
feed build (and vice versa). Validation failures: missing/duplicate `slug`, a milestone
file listed but absent, a duplicate milestone `id`, or invalid frontmatter.

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
