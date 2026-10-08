# HRRP Explorer — Design Spec

**Date:** 2026-10-08 · **Status:** approved via in-session Q&A (hosting, byline, dollars, audience) · **Owner:** Dalton Haslam

## 1. Intent

A public, free, single-page website that (a) teaches anyone how Medicare's Hospital
Readmissions Reduction Program (HRRP) works and (b) lets them explore the **FY2027**
readmission penalties CMS finalized in October 2026, from the national picture down to
a census region, state, metro area, and individual hospital. Historical penalties
(FY2013–FY2026) give every view a time dimension.

**Audience (confirmed):** curious public, journalists, hospital leaders. Plain-language
explainer first; analyst-grade depth on demand. Tone neutral and factual — a penalty is a
relative-performance signal under a specific formula, not a verdict on a hospital.

**Success criteria**
1. A layperson can explain, after 3 minutes, what a penalty is, how big they are, and why
   80% of hospitals get one.
2. A hospital leader can find their hospital in two keystrokes, see which conditions drove
   the penalty and by how much, and run a what-if.
3. A journalist can get a defensible state/metro summary and a CSV of the rows behind it.
4. Every number traces to a named CMS file; modeled numbers are labeled as estimates.
5. Works as one self-contained HTML file (offline-capable), on phones, in light/dark mode.

## 2. Decisions (from Q&A)

| Decision | Choice |
|---|---|
| Home | `~/Documents/Claude/Public/hrrp-explorer`, own git repo. Public GitHub repo + GitHub Pages created **only after Dalton reviews** the finished site. |
| Byline | "Built by Dalton Haslam, MD, MBA" + LinkedIn (linkedin.com/in/dalton-haslam). |
| Dollars | Show modeled per-hospital dollar estimates, labeled "estimated", methodology on page. |
| Audience | Mixed; plain language up top, depth in drill-downs. |

## 3. Data

### 3.1 Sources (all public CMS/Census files; raw files are NOT committed — `pipeline/sources.json` records URL + SHA-256 and `fetch.py` re-downloads)

| Source | Use |
|---|---|
| FY2027 HRRP Supplemental Data File (CMS, posted 2026-10-07) | Core: PAF, reduction %, dual proportion, peer group, neutrality modifier, per-condition discharges/ERR/peer median/penalty flag/DRG ratio for 2,912 hospitals |
| FY2027 HRRP Table 15 | Cross-check of PAF |
| FY2027 IPPS Final Rule & CN Impact File | Display-name casing, CBSA, FIPS county, urban/rural, beds, resident-to-bed ratio, ownership, provider type, transfer-adjusted cases + CMI, wage index, COLA, quality/EHR reduction flags (dollar model) |
| FY2027 Tables 1A–1E (final rule + CN; Dalton's download) | National standardized amounts for the dollar model |
| FY2027 County→CBSA crosswalk | Metro (CBSA) names |
| CMS Provider Data Catalog "Hospital General Information" (Jul 2026) | Current Care Compare name, address, city, ZIP, county, ownership detail, overall star rating |
| Census 2024 ZCTA Gazetteer | ZIP centroid lat/lon for hospital dots (fallback: county centroid from map geometry) |
| us-atlas@3 states/counties TopoJSON | Map geometry |
| Archived HRRP supplemental files FY2013–FY2026 | Per-hospital PAF history + national trend |
| FY IPPS final rules / KFF Health News | Annual estimated total penalty dollars (trend chart), program timeline, research citations |

### 3.2 Derived fields
- **Contribution by condition** = NM × DRG ratio × max(ERR − peer median, 0), only when
  discharges ≥ 25 and penalty flag = Y. Sum, capped at 0.03 = reduction. Pipeline verifies
  `1 − round(sum,4)` reproduces CMS PAF; mismatches are reported, CMS PAF always displayed.
- **Estimated base operating DRG payments** = transfer-adjusted cases × transfer-adjusted CMI ×
  (labor amount × wage index + non-labor amount × COLA). Labor/non-labor amounts from Table 1A
  (wage index > 1) or 1B (≤ 1), column chosen by the hospital's quality/EHR reduction flags.
  **Estimated penalty $** = base × (1 − PAF). Caveats on page: FY2025 volume as proxy for
  FY2027, federal rate only (SCH/MDH hospital-specific rates ignored), excludes IME/DSH/outliers
  (correctly — HRRP applies to base operating payments only). National total is compared with
  CMS's own estimate in the final rule and the ratio is shown.
- **Teaching status**: resident-to-bed ratio 0 = non-teaching, (0, 0.25) = minor, ≥ 0.25 = major.
- **Bed size**: <100, 100–299, 300–499, 500+. **Urban/rural**: impact file URGEO.
- **Census region/division**: from state.
- **Rank**: penalty percentile nationally, within state, within peer group.

### 3.3 Data contract (`web/src/data/hrrp.json`, built by pipeline, inlined at build)
```
{ meta: { fy, fileDate, perfPeriod:[start,end], nm, nHosp, peerCutoffs:[[min,max]x5],
          peerMedians:{ "1":{AMI,COPD,HF,PN,CABG,THA_TKA}, ... }, rates:{...}, cmsTotalEst, modelTotalEst,
          sources:[{name,url,date}] },
  conditions: [ {key:"AMI", label, long, color}, ... six ],
  hospitals: [ { id(CCN), name, city, st, county, zip, lat, lon, cbsa, cbsaName, urban(bool),
                 region, division, beds, teach("none|minor|major"), own, star, sch, mdh, rrc,
                 paf, red(%), dual, peer, est$ (base), pen$ (est penalty),
                 c: { AMI:{n, err, med, flag(0/1), ratio, contrib}, ... } } ],
  history: { years:[2013..2026], byHospital:{ CCN:[paf|null ...] }, national:[{fy,n,nPen,meanRed,meanRedPen,nMax,cap,totalEst,totalSrc}] },
  timeline: [ {fy|date, title, body, src} ], research: [ {cite, url, finding} ],
  geo: { states: TopoJSON (us-atlas states-10m, unprojected) } }
```

## 4. Site structure (hash routes, shareable)

| Route | View |
|---|---|
| `#/` | Story + national dashboard + map + explorer table |
| `#/region/<name>`, `#/division/<n>`, `#/state/<ST>`, `#/metro/<cbsa>` | Scoped dashboard (same components, filtered) with breadcrumb Nation › Region › Division › State › Metro |
| `#/hospital/<CCN>` | Hospital profile |
| `#/methods` | Methodology, sources, caveats, about |

### 4.1 Home (`#/`)
1. **Masthead + omnibox** — search hospital name / city / CCN / state / metro; keyboard nav.
2. **Hero** — headline FY2027 numbers: hospitals penalized (n, %), average penalty, number at
   the 3% cap, estimated total, effective date Oct 1 2026. One-line plain-English framing.
3. **How it works** (interactive explainer, 5 steps, each with a live chart using real data):
   1. Six conditions — counts of hospitals with ≥25 discharges per condition.
   2. ERR = predicted ÷ expected — dot strip of all HF ERRs; 1.0 line.
   3. Peer groups — dual-proportion histogram with the five FY2027 quintile bands.
   4. Compare to peer median — per-condition peer medians by group (small table/heatmap).
   5. The formula — worked example on a real hospital (selectable), step by step, ending at
      CMS's PAF; then "the cap" and "applied to all Medicare FFS base payments for a year".
   Plus a **What's new in FY2027** callout (Medicare Advantage patients now in the ERRs; 2-year
   performance period Jul 2023–Jun 2025) and a **program timeline**.
4. **The FY2027 picture** — penalty distribution histogram; which conditions drive penalties
   (share of hospitals flagged + share of total estimated $ by condition); penalty by peer group
   (strip/box); by hospital type (teaching, bed size, urban/rural, ownership) small multiples.
5. **Fifteen years of penalties** — FY2013–FY2027: % penalized, mean penalty, total $ estimate.
6. **Map** — state choropleth (metric toggle: average penalty, % penalized, estimated $,
   hospitals at ≥1%); hospital-dot layer toggle; click state → state view.
7. **Explorer table** — sortable, filterable (penalized only, peer group, teaching, bed size,
   urban/rural, condition flagged), paginated, CSV download of current rows.
8. **What the research says** — 6–10 verified citations, balanced.
9. **Footer** — byline, sources, "not affiliated with CMS", data date.

### 4.2 Scoped dashboard (region/division/state/metro)
Breadcrumb; KPI tiles vs. nation; map zoomed to scope with hospital dots; penalty distribution
(scope vs. nation overlay); condition breakdown; peer-group mix; trend (scope mean vs. national);
child-geography table (e.g., states in a region, metros in a state); hospital table.

### 4.3 Hospital profile
Header (name, city/state, CCN, type badges, star rating link to Care Compare). Penalty card:
reduction %, PAF, estimated $ (labeled), national/state/peer percentile. **Condition panel**:
for each of six, ERR vs. peer median dot-on-range chart, discharges, flag, contribution (bar)
and share of total — conditions with <25 discharges shown greyed with the reason. **What-if
simulator**: sliders per condition ERR → live recomputed penalty and $ (labeled hypothetical;
peer medians held fixed). **Peer context**: dual proportion position in the peer-group band.
**History**: PAF FY2013–FY2027 line vs. national mean. **Nearby/peer comparison**: same-metro
hospitals table.

## 5. Architecture

```
hrrp-explorer/
  pipeline/            Python 3.9 stdlib only
    sources.json       URLs + sha256 + local names
    fetch.py           download raw → data/raw/ (gitignored), verify sha256
    build_data.py      parse, join, derive, validate → web/src/data/hrrp.json
    hrrp/              parse.py, model.py (formula, dollars), geo.py, history.py
    tests/             unittest: parsing, formula replication, joins, contract
  web/
    src/index.html     template; src/styles/*.css; src/js/*.js (ES modules)
      js/model.js      pure functions (penalty math, stats, filters, formatting) — unit-tested
      js/router.js, js/views/*.js, js/charts/*.js, js/ui/*.js
    build.mjs          esbuild bundle (d3 subset + topojson-client bundled in) → inline into one HTML
    test/*.test.mjs    node:test for model/router
    e2e/smoke.mjs      Playwright: console errors, routes, mobile overflow, screenshots
  docs/index.html      BUILD OUTPUT (GitHub Pages serves /docs) — generated, never hand-edited
  planning-docs/       specs + plans
```
- **Single self-contained file**: CSS, JS (d3 subset bundled), data, and geometry inlined.
  Google Fonts is the only network request, with system-font fallback.
- **No framework.** D3 for charts; vanilla DOM views; hash router.
- **Theming**: color tokens on `:root`, dark mode via `prefers-color-scheme` + manual toggle.
- **Accessibility**: semantic landmarks, focusable controls, `aria-label`/`<title>` on charts,
  table alternative for every chart, color-blind-safe palettes (Okabe-Ito for conditions),
  `prefers-reduced-motion` respected.
- **Responsive**: 16px gutters, no horizontal page scroll at 360px; tables scroll inside
  their container; charts re-render on resize.

## 6. Visual direction — "1970s statistical almanac" (Dalton, 2026-10-08: retro, no AI tells, still intuitive)
Working title on the masthead: **Thirty Days — An almanac of Medicare's readmission penalties,
FY2027 edition** ("Vol. 15": FY2027 is the program's 15th payment year). Easy to rename.
- **Paper & ink**: warm cream paper with a faint grain; brown-black ink; two/three spot colors
  as if offset-printed — vermilion, mustard, petrol teal. Night edition (dark mode) = charcoal
  paper, cream ink, same spot colors lifted for contrast.
- **Type**: Alfa Slab One (wood-type masthead + section heads), Libre Franklin (body/UI —
  Franklin Gothic is the classic American newspaper/government face), Courier Prime (numbers,
  tables, axis ticks, captions — typed-report feel, monospaced digits align).
- **Report conventions as navigation aids**: numbered parts ("Part II"), every chart captioned
  "Figure N." with a one-line takeaway and a source line; hairline + double rules between
  sections; index-tab section nav; small-caps labels.
- **Tables** printed like green-bar computer paper (alternating pale bands, Courier) — retro and
  genuinely easier to scan.
- **Charts**: thin ink axes, hatched fills for "not eligible (<25 discharges)", penalty ramp
  cream → mustard → vermilion → oxblood; condition palette = print-muted Okabe-Ito
  (color-blind-safe).
- **Banned AI tells**: gradient text/backgrounds, glassmorphism, rounded-2xl card grids with
  soft shadows, purple/blue tech palettes, emoji/icon-feature trios, Inter/DM Sans/Space
  Grotesk/Fraunces, pill-badge clutter, "unlock/dive deep/empower/seamless" copy, centered
  everything. Copy is plain, specific, and written like a careful reporter.
- **Intuitive first**: sticky top bar with search always visible; breadcrumb on every scoped
  view; every chart clickable to drill down; obvious back paths; no hidden gestures.

## 7. Error handling
- Pipeline: hard-fail on schema drift (missing expected columns), checksum mismatch, PAF out of
  [0.97,1], duplicate CCNs; warn (and report counts) on join misses, geocode fallbacks,
  formula-replication mismatches.
- Front-end: unknown route/CCN → friendly not-found with search; missing values render "—"
  with a footnote reason (e.g., "fewer than 25 discharges").

## 8. Testing
- Python unittest: parser edge cases; formula reproduces CMS PAF for ≥99% of hospitals
  (exact to 4 dp); join coverage thresholds; contract shape.
- JS node:test: penalty math (incl. cap, <25 rule, what-if), stats helpers, filters, router.
- Playwright smoke: every route type loads with zero console errors; omnibox → hospital;
  360px viewport has no horizontal scroll; light + dark screenshots.
- Final gate per Dalton's CLAUDE.md: /simplify → tests → /code-review + /security-review →
  /verify (drive the built page end-to-end).

## 9. Out of scope (v1)
Per-hospital SEO pages; predicted/expected readmission rates (FY2027 measure-level data
arrives on data.cms.gov in early 2027 — add then); other CMS programs (VBP, HACRP);
multi-hospital compare tray.
