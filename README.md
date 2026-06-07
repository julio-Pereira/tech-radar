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
