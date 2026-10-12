# UX baseline — partial Fase 0, scoped to this PR

> This is **not** the full Fase 0 from `PLANO-ux-tech-radar.md` — no Lighthouse run, no
> 360/768/1280px screenshot set, no JSON size budget. It documents only what was actually
> measured while shipping the pt-BR/a11y quick wins and the Playwright+axe-core harness
> (plan items 2, 3, 4, 6), via `web/tests/` against a locally-built `web/data/`. Scope was
> chosen with the user.
>
> **Item 7 resolved:** the user decided trilha-as-page (today's `#/learn/<slug>`) over
> marco-as-own-page — see "Fase 2" below for what that unlocked instead.
>
> **Item 1 done:** `app.js` (1268 lines, one file) is now `web/js/` — 13 ES modules
> (`main.js` as the sole entry with a top-level side effect; everything else just
> exports). Boundaries follow the `// ──` section comments the monolith already had:
> `router.js`/`announce.js` (routing + a11y announcements, split apart so course-view.js
> doesn't import router.js back), `radar.js` (feed/filters/daily reading — all
> radar-view-only state), `storage.js` (every localStorage access), `dom-helpers.js`
> (generic DOM builders + pt-BR formatting), and `courses/` (`index-view.js`,
> `course-view.js`, `timeline-node.js`, `quiz.js`, `content-blocks.js`, `scroll.js` —
> the last one its own file only to avoid a course-view.js ⇄ timeline-node.js cycle).
> `index.html` now loads `js/main.js`; no build step added — plain `<script
> type="module">` + relative imports, which GitHub Pages serves as-is. Full suite
> (32/32) green against the new structure, no behavior changes.

## Fase 2 — reading-experience improvements (trilha-as-page, no routing/aggregator changes)

Plan items 8, 9, and 11, adapted to stay inside the existing single-page-per-trilha
architecture instead of requiring a per-marco route (which would need the Go aggregator
to emit per-milestone JSON — out of scope for a client-only change):

- **"Continuar de onde parou"** (item 11): `localStorage` tracks the last course visited
  (`tr:lastcourse`, written whenever a course page renders) and the last milestone expanded
  per course (`tr:lastvisited:<slug>`, written on expand only). The tracks index
  (`#/learn`) shows a banner to the last course visited; the course page itself shows a
  "Continuar: Marco N — Title" button only once a milestone has actually been opened.
- **Anterior/Próximo marco** (item 8, adapted — in-page, not a route change): quick-nav
  buttons inside each expanded milestone jump to the previous/next sibling, expanding and
  scrolling to it. Absent at the first/last milestone boundaries.
- **Copy button on code blocks** (item 9): a "Copiar" button overlaid on every `<pre>`,
  copying the code text via `navigator.clipboard.writeText()` (works on GitHub Pages
  `https://` and on `localhost`/`127.0.0.1` for local dev — both secure contexts).

Covered by `web/tests/reading.spec.js` (8 tests): continue-btn/banner gating (visiting vs.
expanding), prev/next nav boundaries, and clipboard content (asserting the button's own
label text never leaks into the copied string). Full suite: 32/32 passing, 0 axe violations
of `serious`/`critical` impact (unchanged from Fase 1 — no new interactive roles needing a
fresh axe pass, but worth re-running whenever markup changes).

Still deferred: **item 10** (hands-on as structured collapsible sections — needs Go
aggregator markdown-structure parsing, a bigger change) and **item 1** (split `app.js`).

## Method

`cd aggregator && OUTPUT_FILE=../web/data/feed.json go run .` to generate real data (16
compiled courses at the time of this run), then `cd web && npx playwright test` — Chromium,
served by `python3 -m http.server`. 24 tests across 5 files: radar filters/search, course
view (expand/complete/reset), quiz (gated and ungated, read from the real compiled JSON so
nothing is hardcoded), routing (incl. back button, 404 slug), and axe-core on all three
views (radar, learn index, course).

## §2 diagnosis — confirmed / corrected in this pass

| # | Plan's claim | Status | What was actually found |
| --- | --- | --- | --- |
| P1 | Quiz gate requires 100%; project docs say 70% | **Not confirmed — plan premise wrong** | `README.md` says "stays locked until every answer is right"; code (`correct === questions.length`) matches the docs exactly. No 70% exists anywhere in the repo. No change made. |
| A1 | `<html lang="en">` with pt-BR content; EN/PT mix | **Confirmed, fixed** | `lang="pt-BR"` set; translated the English UI chrome (Search/Category/Source/Clear filters/Loading states/daily reading/relative time). Also found and fixed one the plan missed: course `level` badges rendered the raw English `course.yaml` value ("Advanced") — now mapped to pt-BR labels client-side. |
| A2 | `document.title` fixed; no focus/announce on route change | **Confirmed, fixed** | Per-route `document.title`, an `aria-live` announcer, and focus moved to `<main>` on in-app navigation. Deliberately **not** on the very first page load — auto-focusing `<main>` there defeated the skip link's purpose as the first Tab stop (found by the skip-link e2e test itself, see `app.js`'s `hasNavigatedOnce`/`isFirstNavigation`). |
| A3 | No skip link | **Confirmed, fixed** | Added, tested via keyboard Tab → Enter. |
| A4 | Chips lack `aria-pressed`; result count lacks `aria-live`; progress bar lacks a name | **Confirmed, fixed** | axe-core's `aria-progressbar-name` rule caught the progress bar immediately (10+ instances in the real course list). Added `aria-label` to every progress bar, `aria-pressed` to filter chips, `aria-live="polite"` on `#summary`. |
| A5 | `:focus-visible` inconsistent — chips/search left out | **Confirmed, fixed** | Added the same outline treatment used elsewhere in `course.css` to `#search`, `.chip`, `.clear-btn`, article title links. |
| A7 | Contrast on `--accent` + white, and `--text-muted` on `--surface2`, suspected to fail | **Confirmed (different exact spots), fixed** | axe's `color-contrast` rule found: `.nav-link.active` (4.31:1), `.node-order-label` (3.89–3.90:1, one per milestone). Not independently caught by axe in this run but fixed proactively for the same reason: `.chip.active`, `.timeline-node.done .node-dot`, `.daily-theme-label`, `.date.series-tag` — all used the same under-contrast pattern. New `--accent-contrast` (#5a52e6, 5.55:1 with white) for white-on-accent backgrounds; swapped `--accent` → `--accent-hover` for accent-as-text-on-dark-surface (5.4–5.5:1). Verified by WCAG relative-luminance calculation before touching CSS, not guessed. |
| — (restrictions §1) | `style-src 'unsafe-inline'` possibly removable | **Confirmed, removed** | Only inline-style usage in `app.js` is `element.style.width` via CSSOM (not gated by `style-src`). `bluemonday.UGCPolicy()` (the sanitizer for authored milestone HTML) does not allow a `style` attribute. CSP tightened to `style-src 'self'`; full suite green after. |
| R4 | Relative time in English, doesn't handle future dates | **Confirmed, fixed** | Rewrote `formatRelative` on `Intl.RelativeTimeFormat('pt-BR')`, which handles sign (past/future) natively — no more possible `-3m ago`. |
| T2 | No front-end tests at all | **Confirmed, fixed** | `web/tests/` (Playwright + `@axe-core/playwright`, `web/package.json`, dev-only, outside the Go build), new `.github/workflows/web-tests.yml` running on every PR and on push to `main`. |

## Not touched in this pass (still open from the plan)

- **Item 10** (hands-on as structured collapsible sections, tracked in issue #26) — needs the Go aggregator to
  parse markdown structure at build time, a bigger backend change than the client-only
  work in Fase 2.
- Lighthouse scores, JSON size budget, 360/768/1280 screenshot set (plan's full Fase 0) — not run.
- Remaining axe findings below `serious`/`critical` (moderate/minor) — not triaged; the test
  suite only asserts zero `serious`/`critical`, per the plan's own acceptance bar.

## Regression gate going forward

`web/tests/` runs in CI on every PR via `.github/workflows/web-tests.yml`. Currently: 32/32
passing, 0 axe violations of `serious`/`critical` impact on the three routes tested. The
plan's ratchet rule applies: these numbers should only improve from here.
