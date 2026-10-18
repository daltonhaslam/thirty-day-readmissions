# Overnight A2: round-3 county-label follow-ups (2026-10-17)

Branch `claude/round3-followups`, PR #1, merged to `main` as `f621754` on 2026-10-17. Source: `Paid-And-Penalized-Planning/docs/handoffs/2026-10-13-now3-results.md`,
"Round-3 review findings, not fixed". No data refreshed; `pipeline/sources.json` untouched.

**Output: byte-identical.** I built before starting and after every commit, then diffed SHA-256 manifests. The final
manifest equals the baseline, which equals the committed files on `main`:

| File | SHA-256 |
|---|---|
| `docs/index.html` | `f8407f1e…6ddfde` |
| `docs/og.png` | `b6f5161b…66bac8` |
| `web/src/data/hrrp.json` | `0d4e2ca5…943871` |
| `web/dist/artifact.html` | `5c791225…e85ad3` |

The build's stdout report, including the county gate (17, at most 17, same CCNs), is also identical.

**Tests.** Pipeline 160 → 165 test methods, 0 skipped; the CT 09110 case now runs. The table-driven cases inside them
grew too, including 4 new `CHECKED_COUNTIES` rows. Web 102 → 102.

## Items

| # | Done | Data evidence (pinned files) |
|---|---|---|
| 1 | `geo.drop_suffixes` strips a suffix after any separator and before trailing punctuation. The fallback spelling and `place_name` no longer double the suffix. | No Care Compare county has a punctuated or hyphenated suffix. Non-alphanumeric names: only `MATANUSKA-SUSITNA` and `MIAMI-DADE`. |
| 2 | `named_city`: when Care Compare's word and the impact-file county agree, the address point no longer decides. A bare name counts as Care Compare's county. | 21 shared-name hospitals in MO/VA. None has Care Compare and the impact file agreeing with the address in the other place. `locate` needed no change: it never moves a hospital when the two agree. |
| 3 | An "X CITY" with no atlas place is `(None, unsettled)` in any state, not only MD/MO/NV/VA (review widened this). The label keeps Care Compare's words with no suffix, and the gate says "unknown county or city". | No hospital has an unknown "X CITY". |
| 5 | Un-skipped. | Passes. |
| 6 | `geo.city_stem`, used by `locate` and `county_label`. | n/a |
| 7 | `says` reads `geo.drop_suffixes` instead of its own regex. | n/a |
| 8 | `place_hospital(ccn, g, imp, st, ref)` does the locate → county_label hand-off and the report bookkeeping. | n/a |
| 9 | `Counties.named` is required. `geo.spellings` builds it for `read_counties` and the test fixtures. | n/a |

**Held: none.** No fix in 1–3 changes a label today, so none needed `xfail`.

## Gates
- `/simplify` (4 agents): I adopted the shared `geo.spellings` and a docstring reflow. I skipped five findings: changing
  how suffix-less names are rebuilt (it would change "X Borough" labels), a constant for the unknown state, the
  duplicate-return nit, a regex precheck, and routing `place_name` through `drop_suffixes`. The regex costs about
  0.4 µs per `county_key` call; the build takes about 1.3 s.
- `/code-review`, 2 passes, no Critical findings. Fixed: the "X CITY" rule now runs in every state; Louisiana no longer
  gets "Morgan City Parish"; the trailing-punctuation strip keeps `)` and `]` and drops everything else.
- Not run: `/security-review` (no credentials or external input touched) and `npm run e2e` (`docs/index.html` is
  byte-identical to `main`).

## Look at first
1. **Item 2, bare names** (`named_city`, the `by_fips == bool(claim)` line). Bare "FAIRFAX" with Fairfax County's FIPS
   and an address just inside Fairfax city is now Fairfax County, settled. Before, it was the city. I chose this
   because the docstring already treats a bare name as Care Compare's county, and Fairfax city sits inside the county.
   The alternative is `claim is not None and by_fips == claim`.
2. **Known, already on `main`, left as is (all listed by the gate, none hit today):**
   - "SIOUX CITY" with no FIPS becomes "Sioux County" (pinned by a test).
   - "COUNTY" alone becomes "County County".
   - "NARNIA BOROUGH" in TX becomes "Narnia Borough County".
   - "NARNIA, COUNTY" keeps Care Compare's punctuation.
   - Suffix stacking depends on the order the suffixes appear in.
   - The AK/PR doubt says "county or city".
3. The PR also carries `b283be4` (the planning-doc reconcile). It was on local `main` but not pushed.
