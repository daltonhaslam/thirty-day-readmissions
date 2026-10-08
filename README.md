# Thirty Day Readmissions

**An almanac of Medicare's Hospital Readmissions Reduction Program (HRRP), FY2027 edition.**

Each October, Medicare cuts payments to hospitals whose patients come back within 30 days more often than
expected. For fiscal year 2027 (October 1, 2026 – September 30, 2027), CMS cut payments at 2,334 of the
2,912 hospitals it evaluated. This site explains how the penalty works and lets anyone look up the result
for the nation, a census region or division, a state, a metro area, or a single hospital.

- **How it works:** five steps with live charts, ending in a line-by-line worksheet that recomputes any
  hospital's penalty from CMS's published values.
- **The FY2027 picture:** distribution of cuts, which conditions cost the most, peer groups, hospital types.
- **Map and drill-down:** state choropleth and hospital dots; every region, division, state, and metro has
  its own page with comparisons to the nation.
- **Hospital record:** ratios versus peer medians for each condition, a what-if simulator, penalty history
  FY2013–FY2027, and nearby hospitals.
- **Fifteen years:** share penalized, average cut, and estimated totals since FY2013, with a sourced timeline.
- **Every table** can be sorted, filtered, and exported as CSV.

Every chart has a text label and a sortable table alternative; selecting individual chart marks needs a mouse or touch.

The site is one self-contained HTML file (`docs/index.html`): data, code, and map geometry are inlined.
The only network request is Google Fonts, with system-font fallbacks.

Not affiliated with or endorsed by the Centers for Medicare & Medicaid Services.

## Data

| Source | Used for |
|---|---|
| CMS FY2027 HRRP Supplemental Data File (posted Oct 7, 2026) | Every hospital's payment adjustment factor, peer group, and per-condition ratios, cases, medians, weights |
| CMS FY2027 HRRP Table 15 | Cross-check of the adjustment factors |
| FY2027 IPPS final rule + correction notice: impact file, Tables 1A–1E, county–CBSA crosswalk | Hospital characteristics, metro areas, and the dollar estimate |
| CMS Care Compare, Hospital General Information | Names, addresses, counties, star ratings |
| US Census 2024 ZCTA Gazetteer; us-atlas 3.0.1 | Hospital locations and map geometry |
| CMS archived HRRP supplemental files FY2013–FY2026 | Penalty history (see `pipeline/history/PROVENANCE.md`) |
| Federal Register IPPS rules, KFF Health News, peer-reviewed studies | Annual totals, timeline, research digest (`pipeline/content/`) |

Recomputing every hospital from CMS's published values reproduces its adjustment factor exactly for 2,835
hospitals and within 0.0001 (rounding) for the other 77. Dollar figures are **estimates** modeled from the
IPPS impact file; CMS publishes percentages only. See the Methods page for the formula and caveats.

## Rebuilding

Requirements: Python 3.9+ (standard library only) and Node 20+.

```bash
python3 -I pipeline/fetch.py          # download sources into data/raw/ and verify SHA-256 pins
python3 -I pipeline/build_data.py     # join and validate → web/src/data/hrrp.json
python3 -I pipeline/run_tests.py      # pipeline tests (includes "committed JSON equals a fresh build")

cd web
npm install
npm test                              # unit tests (penalty math, search, router, CSV)
npm run build                         # → ../docs/index.html (and dist/artifact.html)
npm run e2e                           # end-to-end checks in installed Google Chrome
npm run e2e:headers                   # the page still works under vercel.json's security headers
```

## Hosting

The site deploys on Vercel from this repository. `vercel.json` serves `docs/` as-is (there is no build
step on Vercel) and sets security headers. Every push to `main` redeploys; other branches get preview URLs.

When CMS posts the next fiscal year: add the new files to `pipeline/sources.json`, update the constants
block at the top of `pipeline/build_data.py`, and append the prior year's factors to the history CSV.

## Layout

```
pipeline/   fetch.py, build_data.py, hrrp/ (parsers, formula, geography, names), history/, content/, tests/
web/        build.mjs, src/ (index shell, styles, js: model, router, charts, views), test/, e2e/
docs/       index.html, the built site (served by Vercel; see vercel.json)
planning-docs/  design spec and implementation plan
```

## License

Code: MIT (see `LICENSE`). Federal source data are public domain. Map geometry: us-atlas (ISC).

Built by Dalton Haslam, MD, MBA, using [Claude Code](https://claude.com/claude-code) · [LinkedIn](https://www.linkedin.com/in/dalton-haslam)
