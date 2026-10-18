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
- `dollarCheck`: cost-report benchmark summary for the assumptions section (`asOf`, `source`, `n`, `rateDrift`, `within10`, `within15`, `within15Small`, `within15Large`, `note`), from `pipeline/content/dollar_check.json`

## Batch 1: pipeline (worktree, one agent)

- [x] Gap #8: read the supplemental file's Excel workbook (stdlib zip + XML) at full precision; keep Table 15 as a cross-check; replication all exact (done: 9c0c0a1)
- [x] Gap #2: add the POS file to `sources.json` (SHA-pinned); certified beds when impact beds < 5 or the two differ by more than 1.5x; `bedsSrc` (done: f01ebad)
- [x] Gap #3: `inactive` from POS termination code and date (keep the hospitals in every ranking and total) (done: f01ebad)
- [x] Gap #6: MDH add-on = 0.75 × max(0, HSP rate × CMI × cases − federal base) × share of FY2027 days before Jan 1, 2027 (done: aa22607)
- [x] Gap #9: `pipeline/geocode.py` geocodes Care Compare street addresses (POS as fallback) through the Census Geocoder batch API into a committed `pipeline/content/geocodes.csv`; build prefers matched points, keeps the 40 km county check, falls back to ZIP/county (done: a9e5bb2, d723ccc)
- [x] Gap #11: `alias` from the impact-file name (done: 3b8b86c)
- [x] Gap #13: test that README's headline counts match the built data; README wording updated (done: 4878b99)
- [x] Tests for each (pipeline/tests), `python3 -I pipeline/run_tests.py` green (done: 3b8b86c, 35092c9, 4878b99 add pipeline tests; last green run not re-executed in this audit)

## Batch 2: site (worktree, one agent, in parallel with batch 1)

- [x] Gap #1: "estimate" disclosure beside every dollar figure, linking to a new Methods section "Assumptions behind the dollar estimates" (assumption table + accuracy line) (done: c27fc42)
- [x] Gap #4: hospital counts beside state ranks and on metro condition bars; no greying out (done: e2649a4)
- [x] Gap #5: share penalized uses hospitals measured on at least one condition as the denominator (hero, KPIs, tables, OG card) (done: e2649a4)
- [x] Gap #7: history charts mark the 1% (FY2013) and 2% (FY2014) caps and the COVID-exclusion years (FY2022–FY2024); area and hospital "nation" lines use the same hospitals as the area line (done: a3e3a86)
- [x] Gap #10: CSV export rounds values, adds units to headers, blanks unmeasured conditions, keeps the CCN's leading zeros in Excel (done: bb08a44)
- [x] Gap #11: show `alias` on the hospital page and include it in search (done: a6e83a4)
- [x] Display `bedsSrc`, `inactive`, `geo: "address"`; Methods text for beds, places, MDH, replication (done: a6e83a4)
- [x] KFF footnote for FY2015, FY2016, FY2018 counts on the share-penalized chart (done: KFF text present in web/src/js/views/home.js and methods.js; commit not traced)
- [x] `npm test` green (done in effect: bb08a44, 6eea37f add web tests; green not re-executed in this audit)

## Batch 3: content (parallel)

- [x] Research digest: add Ody et al. 2019 and Dharmarajan et al. 2017, verified against the papers (done: 6d28de3)

## Checkpoint: integrate and gate

- [x] Merge batch branches; `python3 -I pipeline/fetch.py`, `python3 -I pipeline/build_data.py`, `npm run build` (done: 3dc8b31, 38cb9d2, 98cd34e)
- [x] `/simplify` on the full branch diff, then `python3 -I pipeline/run_tests.py`, `npm test`, `npm run e2e`, `npm run e2e:headers` (done: df247b6, b124dca)
- [x] `/code-review` (fix Critical/Important, re-run until clean) (done: 6eea37f, 16a815e and later rounds)
- [ ] `/security-review` (new external inputs: POS CSV, Excel parse, geocoder responses) (not ticked: no commit or note shows it was run; the pipeline's POS/Excel/geocoder inputs are covered only by the code-review rounds)
- [ ] `/verify`: drive the built site in Chrome (home, a state, a metro, Oroville, an MDH, an inactive hospital, Methods, CSV download) (not ticked: no record of the Chrome walkthrough; later `npm run e2e` smoke exists but was not run in this audit)
- [x] `npm run og` (card text changed) (done: 86b63cb)

## Ship

- [x] Merge to `main`, push (Vercel redeploys); confirm the live site serves the new build (done: d747d38 is live (see .project-status))
- [ ] Tick the report's checklist; update `.project-status` (not ticked: lives in an external artifact, not checkable from the repo)


## State as of 2026-10-17

**Done.** Every pipeline, site, and content item above is implemented and merged to `main` (live at d747d38, which
includes the 2026-10-13 county-name guard, `f6a250a`..`d747d38`). The raw-input release `fy2027-raw-inputs` is
published. Not re-run in this audit: the test suites. No record that `/security-review` or `/verify` ran.

**Done 2026-10-17: round-3 review follow-ups on the county-name guard** (PR #1, merged as `f621754`; published files
byte-identical). Items 1-3 and 5-9 from `Paid-And-Penalized-Planning/docs/handoffs/2026-10-13-now3-results.md` (item 4
was `65479c2`); no current hospital hit cases 1-3. Record: `planning-docs/build-records/2026-10-17-overnight-a2-report.md`.

Open: `/security-review` and `/verify` have no record of running on the 10-11 audit work; "tick the report's checklist" lives in an
external artifact.

**External triggers.**
- The October Care Compare refresh had not landed as of 2026-10-17. When it does (the CMS watcher creates a Todoist
  task): refresh the Hospital General Information file, rebuild, and read the county gate report. The build fails
  above `MAX_UNCHECKED_COUNTIES = 17` (`pipeline/build_data.py`).
- Medicare-dependent hospital status sunsets 2026-12-31 (`MDH_END`, `pipeline/build_data.py:38`). If Congress extends
  it, change `MDH_END` and rebuild; the Oct-Dec add-on in the data assumes the sunset.
- Later: early 2027 predicted/expected rates; Aug-Oct 2027 FY2028 rollover.
