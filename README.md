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
| engineering-at-meta | Engineering at Meta | Engineering |
| netflix-tech | Netflix Tech Blog | Engineering |

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
| `OUTPUT_FILE` | `../web/data/feed.json` | Output path for feed JSON |
