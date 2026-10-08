# HRRP Explorer ("Thirty Days") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One self-contained HTML site that explains HRRP and lets anyone explore FY2027 penalties from nation → region → state → metro → hospital, with FY2013–FY2026 history.

**Architecture:** A stdlib-Python pipeline turns raw CMS/Census files into one JSON data contract. A no-framework ES-module front end (D3 subset + topojson-client) renders hash-routed views; esbuild bundles JS and a Node build script inlines CSS, JS, and data into `docs/index.html` (GitHub Pages target).

**Tech Stack:** Python 3.9 stdlib (`csv`, `json`, `unittest`), Node 26, esbuild, d3 v7 modules, topojson-client, Playwright (smoke/e2e), Google Fonts (Alfa Slab One, Libre Franklin, Courier Prime).

**Spec:** `planning-docs/specs/2026-10-08-hrrp-explorer-design.md`

## Global Constraints
- Python: 3.9 stdlib only in `pipeline/` (no pandas). Run with `python3 -I`.
- Raw downloads live in `data/raw/` (gitignored), never committed; `pipeline/sources.json` holds URL + sha256.
- Output: single file `docs/index.html`; only external request = Google Fonts (system fallback).
- Data contract keys exactly as in Task 4 (`hospitals[].c.<COND>.{n,err,med,flag,ratio,contrib}`), condition keys `AMI, COPD, HF, PN, CABG, THA_TKA`.
- CMS PAF is always the displayed truth; recomputed values are only for explanation/what-if.
- Dollar figures always labeled "estimated" with a link to Methods.
- Visual: retro almanac (spec §6). Banned: gradients, glassmorphism, soft-shadow rounded card grids, emoji, Inter/DM Sans/Space Grotesk/Fraunces, marketing copy.
- No horizontal page scroll at 360px; 16px gutters; light + dark tokens; `prefers-reduced-motion` respected.
- Footer: "Built by Dalton Haslam, MD, MBA" + linkedin.com/in/dalton-haslam; "Not affiliated with CMS."
- No PHI exists in any source (public, hospital-level aggregate data).

## Review Focus
1. Hospital with every condition < 25 discharges or all ERRs below median (PAF = 1.0) → profile shows "No penalty" with reasons, what-if still works, no NaN.
2. Hospital missing from geo joins (no ZIP centroid / no county) → absent from dot map only, everywhere else normal, no console error.
3. Deep link to unknown CCN / state / metro (`#/hospital/999999`) → friendly not-found with search, no crash.
4. Omnibox queries with punctuation/case/apostrophes ("st. mary's", "o'connor", "460001", "salt lake") → sensible ranked results; HTML in names never injected.
5. Narrow phone (360px) and dark mode → tables scroll in-container, charts legible, no overflow.

Tests for each are pinned in Tasks 4 (1,2), 6 (1,4), 12 (3), 14 (2–5).

---

## Milestone A — Data pipeline

### Task 1: Repo scaffold + reproducible fetch
**Files:** Create `.gitignore`, `LICENSE` (MIT, © 2026 Dalton Haslam; note data is public-domain US gov), `README.md` (stub), `pipeline/sources.json`, `pipeline/fetch.py`, `pipeline/tests/test_fetch.py`.
**Interfaces:** Produces `fetch.py` CLI: `python3 -I pipeline/fetch.py [--only NAME]` → files under `data/raw/<name>/`; `sources.json` = `[{name, url, sha256, unzip: bool, note}]`.
- [ ] Step 1: Write test that `verify_sha256(path, expected)` raises `ChecksumError` on mismatch and returns True on match (temp file).
- [ ] Step 2: Run `python3 -I -m unittest pipeline.tests.test_fetch` → FAIL (module missing).
- [ ] Step 3: Implement `fetch.py` (urllib with browser UA; stream to `.part` then rename; sha256 verify; unzip into `data/raw/<name>/` with zip-slip guard: reject members whose resolved path escapes the target dir).
- [ ] Step 4: Add zip-slip test (member `../evil.txt` → `UnsafeArchiveError`). Run tests → PASS.
- [ ] Step 5: Populate `sources.json` with real URLs + sha256 of the files already downloaded (FY2027 supplemental, Table 15, impact file, tables 1A–1E, county-CBSA crosswalk, PDC Hospital General Information, ZCTA gazetteer, us-atlas states-10m + counties-10m, historical supplementals FY2013–FY2026). Run `fetch.py`; all verify.
- [ ] Step 6: Commit `chore: scaffold repo and reproducible CMS data fetch`.

### Task 2: Parsers
**Files:** Create `pipeline/hrrp/__init__.py`, `pipeline/hrrp/parse.py`, `pipeline/tests/test_parse.py`, `pipeline/tests/fixtures/*.txt` (tiny hand-made samples copying real header rows).
**Interfaces:** Produces
- `num(s) -> float|None` ('.', '', 'N/A', 'Too Few to Report' → None; strips `"`, `,`, `%`).
- `read_supplemental(path) -> dict[ccn, dict]` with keys `paf, red, dual, peer, nm, c: {COND: {n, err, med, flag, ratio}}`.
- `read_impact(path) -> dict[ccn, dict]` keys `name, cbsa_geo, fips, region_code, urgeo, wi, cola, irb, beds, cases, cmi, qual_red, ehr_red, own, ptype`.
- `read_hgi(path) -> dict[ccn, dict]` keys `name, address, city, st, zip, county, type, ownership, star`.
- `read_zcta(path) -> dict[zip5, (lat, lon)]`; `read_cbsa_names(path) -> dict[cbsa, name]` and `dict[fips, cbsa]`.
- `read_rates(path) -> {'1A': {...}, '1B': {...}}` with labor/nonlabor for the four quality×EHR columns.
- [ ] Step 1: Tests: `num('"1,110"')==1110.0`, `num('.') is None`, `num('0.04%')==0.04`; `read_supplemental(fixture)['010006']['c']['HF']=={'n':601,'err':1.0899,'med':0.9928,'flag':1,'ratio':0.0325}`; header drift (missing 'ERR for HF') → `SchemaError`.
- [ ] Step 2: Run → FAIL. Step 3: Implement (csv module, `encoding='latin1'`, tab-delimited, header row located by first cell == 'Hospital CCN' / 'Provider Number' — not by fixed line number). Step 4: Run → PASS.
- [ ] Step 5: Commit `feat(pipeline): CMS/Census file parsers`.

### Task 3: Penalty + dollar model
**Files:** Create `pipeline/hrrp/model.py`, `pipeline/tests/test_model.py`.
**Interfaces:** Produces `contributions(h) -> dict[COND, float]`, `reduction(h) -> float` (capped 0.03), `replicates(h) -> bool` (`abs((1-round(reduction,4)) - paf) <= 0.0001`), `est_base_payment(imp, rates) -> float|None`, `est_penalty(base, paf) -> float|None`.
- [ ] Step 1: Tests (use CMS infographic Hospital A): NM 0.9458, AMI ratio 0.0648 ERR 1.0259 med 0.9970 n 42; COPD 0.0331 1.0476 0.9954 n 38; HF n 22 (excluded) → contributions AMI≈0.00177, COPD≈0.00163, total rounds to 0.0034 → PAF 0.9966. Cap test: synthetic sum 0.05 → 0.03. Real row 010006 → `replicates` True. Dollar: cases 1000, cmi 1.5, wi 1.1, cola 1, qual/ehr ok → base = 1000*1.5*(4519.68*1.1 + 2328.32) using Table 1A.
- [ ] Step 2: Run → FAIL. Step 3: Implement. Step 4: PASS. Step 5: Commit `feat(pipeline): HRRP formula + dollar estimate`.

### Task 4: Join, derive, validate, emit contract
**Files:** Create `pipeline/hrrp/geo.py` (state→census region/division; county centroid fallback computed from us-atlas counties TopoJSON by averaging decoded ring coordinates), `pipeline/hrrp/names.py` (display name: impact-file casing when it equals HGI name case-insensitively, else smart title case of HGI with acronym keep-list), `pipeline/hrrp/history.py` (reads `out_hist/hrrp_history_long.csv` → `{years, paf}` + national summary incl. FY2027), `pipeline/build_data.py`, `pipeline/tests/test_build.py`.
**Interfaces:** Produces `web/src/data/hrrp.json`:
```
meta{fy, fileDate, perf:[s,e], nm, peerCutoffs:[[min,max]x5], peerMedians:{"1":{COND:med}}, rates, totals:{modelPen, modelBase, cmsEst|null, cmsSrc|null}, replication:{matched,total,mismatches:[ccn]}, geocode:{zip,county,none}, sources:[{name,url,date}] }
conditions:[{key,label,short,long,color}]
hospitals:[{id,name,city,st,county,zip,lat,lon,geo,cbsa,cbsaName,urban,region,division,beds,teach,own,ownDetail,star,types[],paf,red,dual,peer,base,pen,c:{COND:{n,err,med,flag,ratio,contrib}}}]
history{years:[2013..2026], paf:{ccn:[...]}, national:[{fy,n,nPen,pctPen,meanRed,meanRedPen,nMax,cap,totalEst,totalSrc}]}
timeline:[...], research:[...]   (from pipeline/content/*.json, hand-curated + verified)
geo{states: TopoJSON, counties?: no}
```
- [ ] Step 1: Tests: every hospital has `id` 6 chars, `0.97<=paf<=1`; no duplicate ids; `red == round((1-paf)*100,2)`; ≥99% replicate; ≥97% have lat/lon; a hospital with all `flag=0` has all `contrib==0` and `paf==1`; missing geo → `lat is None` and `geo is None` (Review Focus 1, 2); `json` size < 3 MB.
- [ ] Step 2: FAIL. Step 3: Implement `build_data.py` (hard-fail on schema drift/dupes/range; print a coverage report). Step 4: PASS.
- [ ] Step 5: Commit `feat(pipeline): build FY2027 data contract`.

### ✅ Checkpoint A
- [ ] `/simplify` on Milestone A diff → re-run `python3 -I -m unittest discover pipeline/tests`.
- [ ] `/code-review` on the diff; fix Critical/Important.
- [ ] `/security-review` (parses untrusted downloaded archives: zip-slip, path handling).

## Milestone B — Front-end foundation

### Task 5: Build system, shell, theme, router, omnibox (+ style probe for Dalton)
**Files:** Create `web/package.json`, `web/build.mjs`, `web/src/index.html`, `web/src/styles/{tokens,base,components,charts}.css`, `web/src/js/{main,data,router,dom}.js`, `web/src/js/ui/{omnibox,figure,tooltip,theme,table}.js`.
**Interfaces:** Produces
- `dom.js`: `h(tag, attrs, ...children)` (text via textContent only — never innerHTML with data), `clear(el)`.
- `data.js`: `loadData() -> {meta, conditions, hospitals, byId: Map, byState: Map, byCbsa: Map, history, timeline, research, geo}`.
- `router.js`: `parseHash(hash) -> {view:'home'|'region'|'division'|'state'|'metro'|'hospital'|'methods'|'notfound', key?}`; `link(view,key) -> '#/...'`; `onRoute(cb)`.
- `figure.js`: `figure({num, title, takeaway, source, body}) -> HTMLElement` (auto-numbered "Figure N.").
- `table.js`: `greenbarTable({columns:[{key,label,fmt,sort,align}], rows, pageSize, onRow}) -> {el, setRows}`.
- `omnibox.js`: `search(query, index) -> [{type, key, label, sub, score}]` (normalizes case/punctuation/diacritics; tokens AND-matched; CCN exact first).
- `theme.js`: light/dark toggle persisted in localStorage (try/catch).
- `build.mjs`: esbuild bundle `src/js/main.js` (IIFE, minify), read CSS + `src/data/hrrp.json`, inline into template placeholders → `../docs/index.html`; print size.
- [ ] Step 1: `npm init`, add deps (`esbuild`, `d3-array d3-scale d3-selection d3-geo d3-shape d3-axis d3-format d3-zoom d3-transition d3-scale-chromatic`, `topojson-client`; dev `playwright`).
- [ ] Step 2: Tests `web/test/router.test.mjs` (`parseHash('#/hospital/010001')` → hospital/010001; `'#/state/ut'` → state/UT; garbage → notfound; `''` → home) and `web/test/omnibox.test.mjs` ("st. mary's" matches "St. Mary's Medical Center"; "460001" ranks the CCN first; "<script>" returns [] without throwing). Run `node --test web/test` → FAIL.
- [ ] Step 3: Implement modules + tokens/base CSS (retro almanac). Step 4: PASS.
- [ ] Step 5: Style probe: masthead, hero numbers, one real chart (penalty histogram), one green-bar table → build → screenshot light/dark/mobile → show Dalton; adjust on feedback.
- [ ] Step 6: Commit `feat(web): build pipeline, retro theme, router, search`.

### Task 6: Front-end model (pure functions)
**Files:** Create `web/src/js/model.js`, `web/test/model.test.mjs`.
**Interfaces:** Produces `CONDS` (ordered keys), `contrib(h, errOverride?) -> {byCond:{COND:number}, sum, reduction, paf}`, `summarize(list) -> {n,nPen,pctPen,meanRed,medianRed,meanRedPen,nMax,nGe1,penTotal,baseTotal}`, `percentileRank(sortedArr, v) -> 0..100`, `quantile(arr,q)`, `scopeFilter({view,key}) -> (h)=>bool`, `applyFilters(list, f)`, `fmtPct(v,dp)`, `fmtMoney(v)` ("$1.2M", "$48K", "—" for null), `fmtInt`, `censusRegionOf(st)`, `toCSV(rows, columns)` (RFC-4180 quoting; prefix `'` on cells starting with = + - @ to block CSV formula injection).
- [ ] Step 1: Tests: Hospital A reproduces 0.34%; what-if lowering COPD ERR to median → contribution 0 and reduction drops; n<25 ignored even if ERR high; cap 3%; `summarize([])` returns zeros not NaN; `fmtMoney(null)==='—'`; `toCSV` escapes quotes/commas/newlines and neutralizes `=SUM(A1)`.
- [ ] Step 2: FAIL. Step 3: Implement. Step 4: PASS. Step 5: Commit `feat(web): penalty model + stats helpers`.

### ✅ Checkpoint B — `/simplify` → `node --test web/test` → `/code-review`.

## Milestone C — Views

### Task 7: Home story — hero, How it works, What's new, timeline
**Files:** `web/src/js/views/home.js`, `web/src/js/charts/{histogram,dotstrip,peerbands,medianGrid,formulaWalk}.js`.
- Hero KPIs from `summarize(all)`; "How it works" five steps with live charts (conditions eligibility counts; HF ERR dot strip; dual-proportion histogram with five FY2027 bands; peer-median grid; formula walk on a selectable real hospital that ends at CMS PAF and states "matches CMS ✓" or shows CMS value when rounding differs).
- [ ] Tests: `node --test` for any pure helpers added; Playwright check that `#how` renders 5 figures and formula walk PAF text equals hospital PAF.
- [ ] Commit `feat(web): home story and interactive explainer`.

### Task 8: National picture + 15-year trend
**Files:** `web/src/js/charts/{conditionBars,groupStrip,smallMultiples,trendLine}.js`, extend `home.js`.
- Distribution histogram; condition drivers (share flagged + share of estimated $); penalty by peer group (strip + median tick); by teaching/bed size/urban-rural/ownership; FY2013–FY2027 trend (% penalized, mean penalty, total $ with source per point).
- [ ] Commit `feat(web): national charts and trend`.

### Task 9: Map
**Files:** `web/src/js/charts/usmap.js`.
**Interfaces:** `usMap(el, {topo, hospitals, metric, scope, onState, onHospital}) -> {update(opts)}`; projection `d3.geoAlbersUsa()` fitted to container; dots only for hospitals with lat/lon; zoom-to-scope by fitting the scope's hospitals/state feature.
- [ ] Commit `feat(web): state choropleth + hospital dot map`.

### Task 10: Explorer table + filters + CSV
**Files:** `web/src/js/views/explorer.js`.
- Filters: penalized only, peer group, teaching, bed size, urban/rural, condition flagged, text filter; sortable columns; 50/page; CSV of filtered rows via `toCSV` + Blob download.
- [ ] Commit `feat(web): hospital explorer table`.

### Task 11: Scoped dashboards (region/division/state/metro)
**Files:** `web/src/js/views/scope.js`, `web/src/js/ui/breadcrumb.js`.
- KPI tiles with Δ vs nation; map zoomed; distribution scope-vs-nation; condition drivers; peer mix; trend scope vs nation; child-geography table; hospitals table.
- [ ] Commit `feat(web): scoped dashboards with breadcrumb drill-down`.

### Task 12: Hospital profile + what-if
**Files:** `web/src/js/views/hospital.js`, `web/src/js/charts/{errRange,contribBars,historyLine}.js`.
- Header, penalty card (CMS PAF, red %, estimated $, percentiles), condition panel (hatched when n<25), what-if sliders (range 0.80–1.20, step 0.001, reset), peer band position, history line vs national mean, same-metro table. Unknown CCN → not-found view with omnibox (Review Focus 3).
- [ ] Playwright: `#/hospital/999999` shows not-found; a PAF=1.0 hospital shows "No penalty" with reasons and no "NaN".
- [ ] Commit `feat(web): hospital profile with what-if simulator`.

### Task 13: Methods, research, footer
**Files:** `web/src/js/views/methods.js`, `pipeline/content/{timeline,research}.json`.
- Methods: data sources table with dates/URLs, formula, dollar model + calibration vs CMS total, caveats (MA in ERR but penalty only on FFS; 2-yr period; SCH/MDH; Maryland excluded; PR not in file), glossary. Research: verified citations only.
- [ ] Commit `feat(web): methods, research, footer`.

### ✅ Checkpoint C — `/simplify` → tests → `/code-review` → `/security-review` (CSV export, DOM injection surface).

## Milestone D — Quality + release

### Task 14: E2E, accessibility, responsive, performance
**Files:** `web/e2e/smoke.mjs`.
- Routes: `#/`, `#/region/South`, `#/division/5`, `#/state/UT`, `#/metro/41620`, `#/hospital/<real>`, `#/methods`, `#/hospital/999999` → zero console errors each.
- 360×740 viewport: `document.documentElement.scrollWidth <= 360` on every route (Review Focus 5).
- Dark mode emulation screenshots; omnibox type "o'connor" and "st. mary" → results list (Review Focus 4).
- Keyboard: Tab reaches omnibox, table sort buttons, sliders; charts have `role="img"` + `aria-label`.
- Initial render < 1.5 s on local file load.
- [ ] Commit `test(web): Playwright smoke + a11y checks`.

### ✅ Final gate
- [ ] `/simplify` (full diff) → all tests.
- [ ] `/code-review` + `/security-review` + `/verify` (drive built page end-to-end). Fix and repeat until clean.

### Task 15: Docs + release prep
- [ ] README (what, screenshots, how to rebuild data, how to build site, data sources, license, disclaimer).
- [ ] `.project-status` (gitignored), Folder Map line in `~/Documents/Claude/CLAUDE.md`, project memory.
- [ ] Publish private claude.ai artifact preview of `docs/index.html`.
- [ ] After Dalton's OK only: `gh repo create daltonhaslam/hrrp-explorer --public`, push, enable Pages from `/docs`.
