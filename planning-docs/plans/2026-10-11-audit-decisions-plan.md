# Audit decisions: implementation plan (2026-10-11)

Source: the "Your decisions" checklist and Gaps table in the data-audit report
(https://claude.ai/code/artifact/d365fe20-ffe0-44f6-ac13-63d96d9f5851). Branch: `audit/2026-10-11-data-validation`.
Gap #12 (teaching labels) was decided as no change.

## Data contract additions (web/src/data/hrrp.json)

Per hospital:
- `bedsSrc`: `"cr"` (cost report, via the impact file) or `"pos"` (certified beds, CMS Provider of Services file)
- `inactive`: `null`, or `{ "date": "YYYY-MM-DD", "code": "01" | "07" | …, "reason": "<plain words>" }` from the POS termination fields
- `alias`: `null`, or the impact-file name when it differs materially from the displayed name
- `geo`: adds `"address"` (street address geocoded by the Census Geocoder) beside `"zip"` and `"county"`
- `base`/`pen`: Medicare-dependent hospitals now include the hospital-specific add-on for Oct–Dec 2026

Meta:
- `replication`: computed from full-precision values (expected: all hospitals exact)
- `geocode`: adds an `address` count
- `mdh`: `{ "endDate": "2026-12-31", "share": <fraction of FY volume before endDate> }`
- `accuracy`: cost-report benchmark summary for the assumptions section (`within15`, `within15Small`, `costYear`)

## Batch 1: pipeline (worktree, one agent)

- [ ] Gap #8: read the supplemental file's Excel workbook (stdlib zip + XML) at full precision; keep Table 15 as a cross-check; replication all exact
- [ ] Gap #2: add the POS file to `sources.json` (SHA-pinned); certified beds when impact beds < 5 or the two differ by more than 1.5x; `bedsSrc`
- [ ] Gap #3: `inactive` from POS termination code and date (keep the hospitals in every ranking and total)
- [ ] Gap #6: MDH add-on = 0.75 × max(0, HSP rate × CMI × cases − federal base) × share of FY2027 days before Jan 1, 2027
- [ ] Gap #9: `pipeline/geocode.py` geocodes Care Compare street addresses (POS as fallback) through the Census Geocoder batch API into a committed `pipeline/content/geocodes.csv`; build prefers matched points, keeps the 40 km county check, falls back to ZIP/county
- [ ] Gap #11: `alias` from the impact-file name
- [ ] Gap #13: test that README's headline counts match the built data; README wording updated
- [ ] Tests for each (pipeline/tests), `python3 -I pipeline/run_tests.py` green

## Batch 2: site (worktree, one agent, in parallel with batch 1)

- [ ] Gap #1: "estimate" disclosure beside every dollar figure, linking to a new Methods section "Assumptions behind the dollar estimates" (assumption table + accuracy line)
- [ ] Gap #4: hospital counts beside state ranks and on metro condition bars; no greying out
- [ ] Gap #5: share penalized uses hospitals measured on at least one condition as the denominator (hero, KPIs, tables, OG card)
- [ ] Gap #7: history charts mark the 1% (FY2013) and 2% (FY2014) caps and the COVID-exclusion years (FY2022–FY2024); area and hospital "nation" lines use the same hospitals as the area line
- [ ] Gap #10: CSV export rounds values, adds units to headers, blanks unmeasured conditions, keeps the CCN's leading zeros in Excel
- [ ] Gap #11: show `alias` on the hospital page and include it in search
- [ ] Display `bedsSrc`, `inactive`, `geo: "address"`; Methods text for beds, places, MDH, replication
- [ ] KFF footnote for FY2015, FY2016, FY2018 counts on the share-penalized chart
- [ ] `npm test` green

## Batch 3: content (parallel)

- [ ] Research digest: add Ody et al. 2019 and Dharmarajan et al. 2017, verified against the papers

## Checkpoint: integrate and gate

- [ ] Merge batch branches; `python3 -I pipeline/fetch.py`, `python3 -I pipeline/build_data.py`, `npm run build`
- [ ] `/simplify` on the full branch diff, then `python3 -I pipeline/run_tests.py`, `npm test`, `npm run e2e`, `npm run e2e:headers`
- [ ] `/code-review` (fix Critical/Important, re-run until clean)
- [ ] `/security-review` (new external inputs: POS CSV, Excel parse, geocoder responses)
- [ ] `/verify`: drive the built site in Chrome (home, a state, a metro, Oroville, an MDH, an inactive hospital, Methods, CSV download)
- [ ] `npm run og` (card text changed)

## Ship

- [ ] Merge to `main`, push (Vercel redeploys); confirm the live site serves the new build
- [ ] Tick the report's checklist; update `.project-status`
