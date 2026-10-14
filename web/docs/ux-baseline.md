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

Still deferred at the time: **item 10** (hands-on as structured collapsible sections —
needs Go aggregator markdown-structure parsing, a bigger change). See below for how it
landed.

## Item 10 — hands-on as structured collapsible blocks

Shipped as two PRs per `TASK-ux-10-hands-on-estruturado.md` (issue #26): the aggregator
contract change, then the front end.

**Aggregator (PR #28).** `splitSections` parses each milestone's markdown with
goldmark's own AST and groups it by `##` into `Section{id, title, kind, html |
intro+blocks}`. The task's premise ("split by H2/H3 inside Hands-on") didn't hold — 0 of
195 real hands-on sections use one — so instead it formalizes the convention authors
already used almost universally: a top-level paragraph opening with a bold label
(`**Tutorial.**`, `**Desafio — título.**`, `**Invariantes testáveis**`,
`**Complemento.**`, `**Checagem**`). A hands-on section with no recognized label (2 real
milestones) downgrades to plain prose, same as before — never an error. Two real bugs in
the task doc's own spec were caught by its own test list before touching content: the
label regex could only match the plural "testáveis" (Portuguese pluralizes "-vel" as
"-veis", not by appending "s", so singular "testável" never matched despite being a
named test case), and the title capture was greedy, leaking a trailing "." into every
block's title. `CompiledMilestone.HTML` stays as a deprecated fallback field, removed
only when item 7 ships one JSON file per milestone. Raw course JSON: 3.95 MB → 6.65 MB
across 16 courses (+69%, ~13.8 KB/milestone) — temporary duplication, ~1.13 MB gzipped
combined; a reader only ever fetches the one course they open.

**Front end (this PR).** `web/js/courses/sections.js` renders `sections` when present
(falling back to the deprecated `html` blob otherwise — tested via route interception,
since all real content now has `sections`). A "handson" section becomes one native
`<details>` per block; a done-mark button sits as a **sibling** of `<details>`, not
nested inside `<summary>` — axe's `nested-interactive` rule (WCAG 4.1.2) caught a first
attempt that put a `<button>` inside `<summary>`, which is invalid even though it worked
visually with manual `preventDefault`/`stopPropagation`. State:
- **Default** (decision 3): Tutorial open, others closed; no Tutorial → first block
  opens instead. Materialized into storage the first time a milestone's blocks render
  (`tr:handson:<slug>`, `{ open, done, seen }`) — `seen` is a separate per-milestone flag
  from `open`'s contents on purpose: inferring "already defaulted" from whether anything
  is in `open` would re-open the default block the next time the reader has closed
  everything, which is exactly the "snap back" the design is meant to avoid.
- **Done mark** (decision 4): per-block, `localStorage`-only, cosmetic — verified by test
  to never touch the milestone's own completion checkbox or quiz gate.
- **Invariantes as an interactive checklist** (decision 5): out of scope, left as a plain
  block like the other four; tracked as a 10b follow-up if wanted later.

A real layout bug surfaced at 360px during a manual screenshot check (same pattern that
caught bugs in Fase 1/2): a flex row's default `min-width: auto` let a long label
("INVARIANTES TESTÁVEIS") or even a single unbreakable word ("COMPLEMENTO") overflow
under the absolutely-positioned done button instead of wrapping. Fixed by dropping
flexbox for the summary row entirely (plain inline text wraps correctly on its own) and,
below 480px, having the done button fall to its own line in normal flow instead of
fighting reserved padding against an unpredictable label width.

Milestone body height (`fundamentos` in go-fintech, 3 hands-on blocks, 900px viewport):
**2276px before → 1811px with the default collapsed state (-20%)**, 2429px if every
block is manually opened (+7% over before, from the summary-row/border/button chrome —
expected, not a regression, since nothing forces opening every block to read one).
Trade-off worth naming plainly: reaching a specific block like "Desafio" now costs one
extra click (expand that block) where before it was already inline after Tutorial — the
feature trades that for not having to scroll past content you didn't ask for, and for a
"done" mark per block.

8 new tests (`web/tests/handson.spec.js`): default-open state (with and without a
Tutorial block), persistence across reload (including the "closing the default doesn't
make an untouched sibling snap back" case), the done mark's independence from the
completion gate, block title/body content, the `sections`-absent fallback, and an axe
pass with blocks expanded. Full suite: 40/40 passing.

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

## Melhoria 8 — Bloco "Gabarito" (`TASK-plat-melhorias-lideranca.md` §8)

First of the eight `lideranca-tecnica` platform improvements (confirmed order:
8 → 3 → 6 → 1 → 4 → 2 → 5 → 7). Extends the `sections` divider from item 10 with a
sixth closed-vocabulary label, `**Gabarito**` (plain or `**Gabarito — título**`),
`kind: "gabarito"` in `HandsOnBlock` — same matching rules as the other five (top-level
paragraph only, unrecognized bold text never opens a block). No real milestone uses the
label yet, so the golden-coverage test (`TestSplitSectionsGoldenCoverage`) staying green
with its existing numbers is itself the proof that no existing marco's output changed.

Front end: a Gabarito block renders **closed by default** (the opposite of Tutorial),
has **no done-mark button**, and its open/closed state is **never persisted** —
`buildHandsonBlock` skips both the `state.open` read and the `toggle` listener for it,
and `applyFirstVisitDefault` excludes `kind: "gabarito"` from ever being picked as the
default-open block even when it's first in a section with no Tutorial. Summary text
reads "Mostrar gabarito (tente antes)" instead of the label, so the intent ("try first")
is explicit rather than implied by the closed state alone. Tested via route interception
(`web/tests/gabarito.spec.js`) since no real content has the label to test against
directly — 6 new tests: closed by default, no done button, open-by-click/keyboard and
does *not* survive a reload, never steals the default-open slot from a real Tutorial or
from the fallback-first-block rule, and an axe pass with it expanded. Full suite: 46/46.

## Melhoria 3 — pontes viram links (UX item 14, `TASK-plat-melhorias-lideranca.md` §2)

Front-end half of the second platform improvement (the Go half — bridge resolution,
`bridges-planned.yaml`, `TestBridgesResolve`, 10 real content fixes — shipped separately).
Design question resolved with the user first: item 14's own link target
(`#/learn/<slug>/<marco-id>`) is literally the per-marco-page URL from item 7, already
rejected in favor of trilha-as-page. Resolved as an anchor, not a route: the hash router
now accepts an optional 3rd segment and treats it as a scroll-to/expand target on the
*same* single-fetch course page — `renderCourse`/`buildCourseView` thread an optional
`marcoId` through to `scrollToMilestone(timeline, id, { expand: true })`, the exact helper
already built for the Continuar button and prev/next nav. A stale or unmatched marco id
falls through to the ordinary default (scroll to last-visited/first-pending, unexpanded) —
never a crash, never a blank page.

Clicking a bridge also marks the target marco as last-visited (free: `scrollToMilestone`'s
`expand: true` calls the real toggle's `.click()`, which already sets `tr:lastvisited` —
no new code needed for that part).

`web/tests/bridges.spec.js` (5 new tests, against real compiled bridge links — no mocking
needed since the Go side now really resolves them): clicking a full-reference bridge lands
on and expands the right marco; a same-trilha shorthand bridge (`` `/08` ``) resolves to
its own marco, not the one stated right before it; visiting a deep link directly (not via
click) works the same as clicking one; a stale/invalid marco id degrades to the normal
default; and the last-visited side effect round-trips through the Continuar button. Full
suite: 51/51. No CSS changes needed — a bridge is a plain `<a>` inside `.milestone-body`/
`.section-prose`, already styled by the existing rule for reference links.

## Melhoria 6 — frescor do conteúdo (`TASK-plat-melhorias-lideranca.md` §6)

Front-end half of the third platform improvement (the Go half — `reviewedAt`/`reviewEvery`
frontmatter, deterministic `reviewDue`, `-check-freshness` CLI mode, the weekly
`content-freshness.yml` workflow — shipped separately, PR #34). `freshnessLabel`
(`dom-helpers.js`) compares a milestone's `reviewDue` against the reader's own clock
(`new Date()`, not a server date) and returns one of three things: nothing (no
`reviewedAt` — the overwhelming majority of milestones, since tracking is opt-in),
"Revisado em out/2026" (reviewed, not yet due or no cadence declared), or "Pode estar
desatualizado" (past due) — rendered in `timeline-node.js` next to the existing `⏱ 20 min`
time estimate. The warning gets a color (`#f0a830`, ~8.3:1 against `--surface`) *in
addition to* different wording, never color alone, matching the plan's own "texto, não só
cor" requirement.

One formatting subtlety worth recording: the displayed month/year is read by splitting
the `"YYYY-MM-DD"` string, not by constructing a `Date` and calling `.getMonth()` —
date-only strings parse as UTC midnight, and reading the month back out of that in a
negative-UTC-offset timezone can roll the displayed month back by one. String-splitting
sidesteps the whole class of bug.

No real milestone has opted in yet (tracking is per-marco and voluntary, same as the
Go side) — `web/tests/freshness.spec.js` (5 new tests) injects `reviewedAt`/`reviewDue`
via route interception and controls the browser's own clock with Playwright's
`page.clock` API, covering: no label when opted out, the reviewed-date label within the
window, the warning once past due, `reviewedAt` alone (no cadence, so it can never warn),
and a clock that crosses `reviewDue` between two renders of the same page flipping the
label on the second one. Full suite: 56/56. Manually screenshotted both variants side by
side to confirm the color/wording pairing reads correctly.

## Role-based paths (`#/paths`, `#/paths/<slug>` — UX platform melhoria 1)

New `web/js/courses/paths-view.js` adds a list page (`#/paths`, a `.course-card` grid
reusing the Trilhas index styling) and a detail page (`#/paths/<slug>`, steps grouped
under cosmetic `group` headings from the compiled path). A path is a guide, never a
gate: every step is a plain `<a>` inside a keyboard-navigable `<ol>`, always clickable
regardless of progress — milestone steps deep-link straight to `#/learn/<slug>/<marco-id>`
(melhoria 3's anchor, reused as-is), whole-trilha steps link to `#/learn/<slug>`.

"Done" is read straight from the same `tr:progress:<slug>` every course page already
writes — no separate progress store. A milestone step is done when its id is in that
course's progress set; a whole-trilha step is done only when every milestone in that
course is (needs `courses/index.json`'s `milestoneCount`, fetched once alongside
`paths.json`). Hours-remaining sums only the steps not yet done (milestone minutes
rounded up to the hour, whole-trilha steps added as their own `estimatedHours`).

Added a "Caminhos" link to the main nav alongside Radar/Trilhas — discoverable, not
buried behind a URL only linked from elsewhere.

`web/tests/paths.spec.js` (9 new tests, against the real compiled `tech-lead-para-staff`
path, no mocking) covers: index listing with hours/step-count, grouped step rendering,
correct hrefs (milestone deep-link vs whole-trilha), click-through navigation, progress
reflecting after completing a milestone on its course page (both on the path detail page
and the index card), "never blocking" (every step stays a plain link with no progress at
all), not-found handling, and axe on the detail page. Full suite: 65/65 (one pre-existing
unrelated flake in `reading.spec.js`, confirmed passing in isolation, not a regression).

## Melhoria 4 — glossário entre trilhas e busca global (UX itens 15-16)

Two new routes over the `glossary.json`/`search-index.json` compiled in the previous PR:
`#/glossario` (every distinct term across every trilha, grouped alphabetically, with a
local filter — "busca dentro do glossário") and `#/glossario/<anchor>` (every trilha's own
definition of that term, side by side, never merged — real content already exercises this:
"Reconciliação" has 3 independent definitions). A header search box (`#search-input`,
`/` shortcut, `web/js/search.js`) is lazy — `search-index.json` is only fetched on first
focus/keystroke, never on page load — and matches accent-insensitively across
title/summary/tags/headings/track, capped at 8 results, no ranking model ("busca simples",
per the plan).

A glossary search result's link is reconstructed client-side (`slugifyTerm` in
`dom-helpers.js`, mirroring the aggregator's own `slugify` exactly) rather than carrying a
precomputed `anchor` field in `search-index.json` — one fewer field in a file that ships to
every visitor, and both sides fold the same closed set of Latin diacritics so they can
never disagree in practice.

**Simplification disclosed in the PR:** UX item 16 also asks for in-body prose terms to
auto-link to their glossary entry at build time. That's deferred — doing it safely without
false-positive prose matches needs its own explicit-syntax convention (the way bridges use
backtick `slug/NN`), and isn't covered by melhoria 4's own stated acceptance bar (search
finds a term + its marco). The two new routes already deliver "find and open a verbete."

Two real bugs caught by the new specs before they shipped: (1) `aria-expanded`/`aria-controls`
on a plain `<input type="search">` is an axe `critical` violation — a combobox role is
required for `aria-expanded` to be valid at all, so both were dropped rather than bolting
on a full combobox pattern for "busca simples"; (2) the glossary filter's hide/show used the
native `hidden` *property*, which did nothing because `.glossario-term-row { display: flex }`
(author CSS) unconditionally overrides the browser's default `[hidden] { display: none }`
(UA stylesheet) — fixed by toggling the project's existing `.hidden { display: none
!important }` utility class instead, the same convention `showView()` already uses.

`web/tests/glossario.spec.js` (5 tests) and `web/tests/search.spec.js` (7 tests), all
against the real compiled data. Full suite: 78/78.

## Melhoria 2 — competências por marco (`TASK-plat-melhorias-lideranca.md` §4)

New `#/skills`, over the `skills.json` compiled in the previous PR. Pure SVG horizontal
bars (`web/js/courses/skills-view.js`, one `<svg>` per group — Liderança/Transversal,
derived dynamically from the data, not hardcoded) — explicitly not a radar/spider chart,
per the plan ("o radar pesa mal em leitura por leitor de tela"). Each `<svg>` is
`aria-hidden="true"`: a single combined `<table>` right below carries the identical
numbers (competência, grupo, minutos concluídos, minutos totais, %) in accessible markup,
so the chart never needs a per-bar ARIA progressbar role duplicating what the table
already says.

Value is `minutos concluídos ÷ minutos totais`, computed entirely client-side from
`skills.json` + the existing per-course `tr:progress:<slug>` — no new storage, nothing
sent to a server. An untagged competency (real example: `arquitetura`, `performance`,
`plataforma`, `seguranca` — none of the transversais are tagged yet) shows "sem marcos
marcados" instead of a misleading "0%", since 0% implies work exists but none is done, not
"nothing has been marked at all". The page also surfaces "cobertura da marcação" (N% dos
marcos) up top, so it never implies more completeness than the content actually has — only
`lideranca-tecnica`'s 13 stub milestones are tagged so far (6% of all 209 real milestones).

`web/tests/skills.spec.js` (5 tests) against real compiled data: coverage + group headings,
the untagged-competency display, completing a real milestone (`lideranca-tecnica/01`,
tagged `[estrategia, execucao]`) moving both competencies' numbers, a reset dropping them
back to zero, axe clean. Full suite: 83/83.

## UX items 17-18 — export/import progress, quiz persistence

Prerequisite for platform melhoria 5 (revisão espaçada), which explicitly depends on both
("o estado de revisão tem de entrar no export", "persistir quiz"). Built ahead of melhoria 5
per Julio's call when the dependency surfaced mid-sequence.

**Item 17 (`web/js/progress-io.js`).** Export walks every `tr:*` localStorage key (not a
hardcoded list) into one versioned JSON file — any future feature that adds a new `tr:*` key
(melhoria 5's `tr:review:v1` included) is captured automatically, no edit to this file
required. Import validates the whole file's shape *before* writing anything (a corrupted or
malformed file never touches existing state), then merges key by key: array-shaped values
(progress ids, hands-on open/done/seen lists) union together; anything else keeps the local
value when both sides have one, so import can only ever add. UI lives on `#/learn` (export
button, import file input, inline status) since it's global, not per-course.

**Disclosed simplification:** the merge for nested-object values (quiz history's per-milestone
`{bestScore, total, lastAttemptAt}`) keeps the *local* entry wholesale on conflict rather than
taking the higher score across the two — a real but minor quality gap (importing a better
score recorded on another device won't win), not required by the acceptance bar (round-trip
identical; corrupted file doesn't wipe state; union merge), which the array-shaped case (the
primary motivating one: progress ids) satisfies exactly.

**Item 18 (`storage.js` + `quiz.js`).** `tr:quiz:<slug>` stores, per milestone, the best score
ever reached and when — shown as "Sua melhor nota: X de Y (data)" above the quiz, persisting
across reloads, never decreasing on a worse reattempt. "Refazer só as erradas" is a new button
alongside the existing full "Refazer tudo": it only re-enables the questions that were
actually wrong, leaving correct ones locked and still marked correct — re-checking re-scores
the whole set since the locked radios are still `checked`, no separate scoring path needed.
Answers themselves are still never persisted, only the outcome.

`web/tests/progress-io.spec.js` (5 tests): export shape, round-trip identical, union merge
(importing a different milestone than the one just completed locally leaves both done),
corrupted file rejected without touching storage, wrong-shape file rejected. `web/tests/quiz.spec.js`
gained 4 more (best score appears/persists, a worse attempt doesn't overwrite it, "refazer só
as erradas" re-opens only the wrong question and a perfect retry then passes, the button hides
on a perfect first score). Full suite: 92/92.

## Melhoria 5 — revisão espaçada (`TASK-plat-melhorias-lideranca.md` §5)

Depended on UX items 17-18 (built in the previous PR) — "o estado de revisão tem de entrar
no export" and "persistir quiz" were both explicit prerequisites, confirmed by Julio when the
dependency surfaced mid-sequence.

**Scheduler (`web/js/review-scheduler.js`).** Pure function, no DOM, `today` always a
parameter (never `Date.now()` internally) — tested with `node --test`
(`review-scheduler.test.js`, wired into CI as its own step, independent of the Playwright
suite). Leitner boxes with intervals `[1, 2, 4, 8, 16, 32]` days. A real subtlety worth
recording: a brand-new card starts "resting" in box 0, and a *correct* answer promotes it to
the next box **before** computing the due date — so a new card's first correct review already
waits 2 days (box 1's interval), never 1 (box 0's). Box 0 is only ever reached by a *wrong*
answer resetting the card. This matches "acerto sobe uma caixa" literally: the raise happens
the same way for a new card as for a reviewed one.

**Deck.** Built fresh on every visit to `#/revisar` from `quiz-bank.json` (new this pass —
`aggregator/internal/course/quizbank.go` flattens every compiled milestone's already-shuffled
quiz into one file, 885 real questions, so the front end never fetches 17 full course JSONs
just to pull out their quizzes) and the existing `glossary.json`. Card id = `cyrb53(slug|context-key|text)`
(`web/js/hash.js` — the same hash `radar.js` already used for the daily-reading pick, now
shared instead of duplicated); changing a question's or term's text changes its id, which
restarts that card's box by construction — documented, not a bug.

**Session (`#/revisar`).** Daily limit (default 10, editable, persisted). A quiz card reuses
the exact `.quiz-question`/`.quiz-option` markup/CSS from the real milestone quiz (visually
"componente reutilizado", per the plan) with its own check → feedback → "Próximo cartão" flow.
A glossary card hides its "Em uma frase" summary behind "Mostrar resposta" first (self-test
before seeing the answer), then "Lembrei"/"Não lembrei". State lives only in `tr:review:v1` —
this never writes to `tr:progress:`/`tr:quiz:`, so it structurally cannot affect a milestone's
completion gate or its own quiz history. Every control is a real `<button>`/`<input>`, so
keyboard operability needed no extra ARIA work.

**A real layout bug caught before shipping:** the first draft put `.review-card`'s own
border/padding directly on the same `<fieldset>` as `.quiz-question` — a `<legend>` straddles
its *own* element's border by default, so the question text visually poked out above the
card's border. Fixed by splitting it the same way `.milestone-quiz`/`.quiz-question` already
are elsewhere: an outer bordered `<div>` wrapping a borderless `<fieldset>`.

`web/tests/review.spec.js` (9 tests, deck mocked via route interception — same pattern as
handson/bridges/freshness — so each test controls exactly which cards exist): daily-limit
display, a quiz card's check→feedback→advance flow, a glossary card's reveal→self-assess flow,
daily limit stopping and a raised limit resuming, a wrong answer scheduling back to box 0 due
tomorrow (not further out), confirms `tr:progress:`/`tr:quiz:` stay untouched after a session,
confirms `tr:review:v1` round-trips through the item-17 export unchanged, an empty deck shows
a plain message, axe clean on an open quiz card. Full suite: 101/101 (Playwright) + 7/7 (`node
--test`, scheduler: interval never decreases on a correct streak, a wrong answer always resets
to box 0 regardless of starting box, due date is never in the past across leap-year/month/year
boundaries, determinism, `isDue` boundary cases).

## Not touched in this pass (still open from the plan)

- Lighthouse scores, JSON size budget, full 360/768/1280 screenshot set (plan's full
  Fase 0) — not run systematically; item 10 above got an ad hoc 360px/900px check.
- Item 10b (Invariantes as an interactive per-item checklist) — explicitly deferred,
  decision 5 of `TASK-ux-10-hands-on-estruturado.md`.
- Remaining axe findings below `serious`/`critical` (moderate/minor) — not triaged; the test
  suite only asserts zero `serious`/`critical`, per the plan's own acceptance bar.

## Regression gate going forward

`web/tests/` runs in CI on every PR via `.github/workflows/web-tests.yml`. Currently:
101/101 Playwright + 7/7 `node --test` passing, 0 axe violations of `serious`/`critical`
impact across every route tested. The
plan's ratchet rule applies: these numbers should only improve from here.
