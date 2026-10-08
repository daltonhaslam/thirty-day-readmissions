> **Repo note (2026-10-08):** this folder holds the committed outputs of a one-time historical build.
> `hrrp_paf_history_fy2013_2026.csv` is the long file trimmed to `fy, ccn, paf, scope_flag`;
> `hrrp_history_summary.csv` is unchanged. `hrrp_parse.py` and `build_hist.py` are the scripts that produced
> them (run against the archived CMS zips listed below). Paths in the text refer to the original scratch layout.

# HRRP payment adjustment factors, FY2013-FY2026 (historical build)

Built 2026-10-08. One row per hospital per fiscal year, from CMS's archived 'Final Rule' HRRP supplemental data files. FY2027 deliberately not processed.

Outputs (this folder): `hrrp_history_long.csv`, `hrrp_history_summary.csv`, `README_hist.md`. Scripts: `../scripts_hist/` (`hrrp_parse.py`, `build_hist.py`, `make_readme.py`, `xlsx_crosscheck2.py`). Run: `python3 -I build_hist.py <dl_root> <out_dir> <diag.json>` then `make_readme.py`. Downloads: `../dl/hist/fyYYYY/` (untrusted; never executed).

## Method and conventions

- Index page: https://www.cms.gov/medicare/payment/prospective-payment-systems/acute-inpatient-pps/archived-supplemental-data-files . One 'final rule' sub-page per FY was fetched; hrefs were read from the HTML (`curl -sSL -A Mozilla/5.0`). Proposed-rule pages were never used.
- Where a zip held several versions, the latest correction was used (FY2013 March 2013, FY2014 Sept 2013, FY2015 Oct 2014). Every FY's txt/csv was then compared with the final sheet of the xlsx/xls in the same zip (script `xlsx_crosscheck2.py`): same CCN set, identical case counts and PAFs in every year; ERR/dual differ only by rounding (<= 5e-5 for FY2019+, <= 5e-7 FY2014).
- **Parsing source** is the tab-delimited `.txt` (or `.csv` for FY2022 and FY2025) because it keeps CCNs as text; xlsx has extra decimal places in FY2019+ that are not used.
- Columns are mapped by header *text* (not position), because column order/wording differs between years.
- Missing tokens (`.`, `N/A`, 'Too Few to Report', blank) -> empty cell; thousands separators/quotes/percent signs stripped. Markers actually observed: `.` (FY2018-FY2024, FY2026) and empty cells (FY2024: 2, FY2025: all, FY2026: 206), always in n/ERR fields only; no `N/A`/'Too Few' text and no non-numeric garbage occurred. PAF, dual proportion and peer group are never missing.
- `paf` is always the file's own payment adjustment factor. **No file lacked a PAF, so no PAF was derived from a reduction percentage.** FY2022-FY2026 files carry both; they agree in every row.
- `ccn` is a 6-character string, zero-padded (only FY2019's txt had dropped leading zeros).
- `dual_proportion` and `peer_group` exist only in FY2019+ files; blank for FY2013-FY2018.
- **ERR placeholder rule (FY2013-FY2017):** those files print ERR = 0 for measures where a hospital has fewer than 25 cases (a placeholder; a real ERR cannot be 0). Those zeros were blanked. No ERR of 0 with n >= 25 exists in any year. FY2018+ files use `.` for 'no ERR' and instead report real ERRs even when n < 25; those are kept as the file shows.
- **n_* columns** are the file's case counts / eligible discharges. FY2013-FY2017 files print `0` for no cases and that `0` is kept; FY2018+ print `.` (-> blank). n and ERR are blank for measures not in the program that year (COPD, THA/TKA before FY2015; CABG before FY2017) and for pneumonia in FY2023.
- **Maryland / Puerto Rico / no-data rows.** Rule applied: drop Maryland (CCN 21xxxx) rows only if they lack a PAF - none did. But the FY2013-FY2015 files list Maryland (45/45/48 rows) and Puerto Rico (52 rows each year, zero cases) with PAF = 1.0000, and FY2013-FY2018 also list hospitals with no measure data (PAF 1.0). FY2016+ files drop Maryland/PR and FY2019+ files drop no-data hospitals. To keep the series comparable I kept every listed row (per the brief) and added a trailing column **`scope_flag`** to the long file: `maryland_exempt`, `puerto_rico_excluded`, `no_measure_data`, or blank. Filter on `scope_flag == ''` for a like-for-like population. This extra column is not in the requested schema; drop it if unwanted.
- Summary: spec columns are computed on **all rows in the long file**. Trailing `_comparable` columns use only `scope_flag == ''` rows (penalized counts barely change, because the flagged rows have PAF 1.0, but percentages and means do). `pct_penalized` is a percent (0-100). Reductions are (1 - PAF) x 100. 'Penalized' = PAF < 1. `n_at_max` uses that year's cap (`max_cap_pct`: 1 for FY2013, 2 for FY2014, 3 for FY2015+); no PAF falls below its year's cap, and none is outside [0.97, 1.0].
- Performance period: parsed from each year's variable-description text. FY2018 states none (blank). FY2022-FY2024 periods have gaps (COVID exclusions); the summary shows the outer start/end and the segments are listed per FY below.

## Cross-check against public figures

- Penalized hospitals: FY2013 2,214 here (CMS's Sept 2012 file: 2,217 - the commonly cited figure, ~2,200 expected); FY2014 2,225 (matches the published 2,225); FY2023 2,273 with mean penalty 0.43% among penalized (matches KFF's 'fewest since FY2014, 2,273 hospitals, 0.43%'); FY2022 2,500 (KFF cites 2,499).
- I did not independently verify the other years' counts against an external source; they are simply what the CMS file contains (PAF < 1).
- Sources: KFF 10-year review https://www.kff.org/affordable-care-act/10-years-of-hospital-readmissions-penalties/ ; KFF Health News https://kffhealthnews.org/news/article/few-acute-care-hospitals-escaped-readmissions-penalties

## Summary table (copy of `hrrp_history_summary.csv`)

| fy | n_hospitals | n_penalized | pct_penalized | mean_reduction_pct_all | mean_reduction_pct_penalized | n_at_max | max_cap_pct | median_reduction_pct_penalized | performance_period_start | performance_period_end |
|---|---|---|---|---|---|---|---|---|---|---|
| 2013 | 3500 | 2214 | 63.26 | 0.2658 | 0.4202 | 276 | 1 | 0.3300 | 2008-07-01 | 2011-06-30 |
| 2014 | 3483 | 2225 | 63.88 | 0.2451 | 0.3837 | 18 | 2 | 0.2700 | 2009-07-01 | 2012-06-30 |
| 2015 | 3476 | 2638 | 75.89 | 0.4741 | 0.6247 | 39 | 3 | 0.4400 | 2010-07-01 | 2013-06-30 |
| 2016 | 3464 | 2665 | 76.93 | 0.4673 | 0.6075 | 38 | 3 | 0.4200 | 2011-07-01 | 2014-06-30 |
| 2017 | 3448 | 2598 | 75.35 | 0.5501 | 0.7300 | 49 | 3 | 0.5200 | 2012-07-01 | 2015-06-30 |
| 2018 | 3414 | 2634 | 77.15 | 0.5644 | 0.7316 | 48 | 3 | 0.5150 |  |  |
| 2019 | 3173 | 2599 | 81.91 | 0.5733 | 0.6999 | 47 | 3 | 0.4800 | 2014-07-01 | 2017-06-30 |
| 2020 | 3130 | 2583 | 82.52 | 0.5831 | 0.7066 | 56 | 3 | 0.4700 | 2015-07-01 | 2018-06-30 |
| 2021 | 3080 | 2545 | 82.63 | 0.5684 | 0.6879 | 39 | 3 | 0.4600 | 2016-07-01 | 2019-06-30 |
| 2022 | 3047 | 2500 | 82.05 | 0.5291 | 0.6449 | 39 | 3 | 0.4400 | 2017-07-01 | 2019-12-01 |
| 2023 | 3044 | 2273 | 74.67 | 0.3196 | 0.4280 | 17 | 3 | 0.2700 | 2018-07-01 | 2021-06-30 |
| 2024 | 3037 | 2356 | 77.58 | 0.3289 | 0.4239 | 9 | 3 | 0.2900 | 2019-07-01 | 2022-06-30 |
| 2025 | 2980 | 2342 | 78.59 | 0.3219 | 0.4096 | 11 | 3 | 0.2700 | 2020-07-01 | 2023-06-30 |
| 2026 | 2945 | 2304 | 78.23 | 0.3440 | 0.4397 | 15 | 3 | 0.3000 | 2021-07-01 | 2024-06-30 |

## Things not obtained / limitations

- Nothing failed to download or parse: all 14 FYs (2013-2026) are in the output. Two of them needed workarounds because of CMS page errors (FY2023, FY2026) - see below.
- FY2018 performance-period dates are not stated in the file (left blank).
- Only the main results table of each file is used. Peer-group median ERR, penalty indicators, DRG payment ratios, neutrality modifier, and the 'Case Info'/'DRG info'/claim-trim tabs were not extracted.
- Dual proportion/peer group are unavailable before FY2019 (not in files).

## Per fiscal year

### FY2013

- Sub-page: https://www.cms.gov/medicare/medicare-fee-for-service-payment/acuteinpatientpps/archived-supplemental-data-files/fy2013-ipps-final-rule-hrrp-supplemental-data-file
- Zip used: https://www.cms.gov/medicare/medicare-fee-for-service-payment/acuteinpatientpps/downloads/fy_2013_fr_readmissions_file.zip  (906,565 bytes, md5 `9a9f6012be82f63a03a0437624b9c695`)
- File parsed: `Readmissions PUF-FY 2013 IPPS Correction-March 2013.txt` (header on line 5, utf-8-sig). Cross-checked vs `Readmissions PUF-FY 2013 IPPS Correction-March 2013.xlsx`.
- Column map: ccn <- `PROV`; paf <- `FY 2013 Readmission Payment Adjustment Factor`
  - err_ami <- `Acute Myocardial Infarction Excess Readmission Ratio`; err_hf <- `Excess Readmission Ratio for Heart Failure`; err_pn <- `Excess Readmission Ratio for Pneumonia`
  - n_ami <- `Number of Acute Myocardial Infarction Cases`; n_hf <- `Number of Heart Failure Cases`; n_pn <- `Number of Pneumonia Cases`
- Measures with ERR columns: AMI, HF, PN. **Absent (blank): COPD, CABG, THA/TKA.**
- Rows: 3,500 in file -> 3,500 in output (0 dropped as Maryland-without-PAF; 0 duplicate CCNs; 0 rows without PAF).
- scope_flag counts: maryland_exempt 45, puerto_rico_excluded 52, no_measure_data 171.
- PAF range 0.9900 - 1.0000 (cap 1%); out-of-range PAFs: 0; PAFs below that year's cap: 0; CCNs zero-padded: 0.
- Stated performance period: July 1, 2008 to June 30, 2011
- Penalized: 2214 of 3500 (63.26%); at cap: 276.
- Zip holds three versions of the data (Aug 2012, Sept 2012 correction, March 2013 correction). **Used the latest (March 2013, CMS-1588-CN4)**, which matches the sheet `Readmissions PUF-FY 2013 IPPS C...` in the shipped xlsx exactly. Earlier versions differ: Aug 2012 differs in 1,338 PAFs (2,215 penalized), Sept 2012 in 1,473 PAFs (2,217 penalized - the figure widely cited in 2012 press); the March 2013 file used here has 2,214 penalized.
- File lists Maryland (45 rows, CCN 21xxxx) and Puerto Rico (52 rows, CCN 40xxxx) with PAF 1.0000 (not blank). Rule in the brief only drops Maryland rows with *no* PAF, so these are **kept** and tagged in `scope_flag` (`maryland_exempt`, `puerto_rico_excluded`). Maryland rows do carry real case counts and ERRs; PR rows have zero cases.
- Excess readmission ratios print as `0.0000` when a hospital has < 25 cases (file layout: such hospitals 'do not have an excess readmission ratio'). These placeholder zeros were converted to blank (2,005 values). No ERR of exactly 0 exists with n >= 25.
- Only AMI, HF, PN measures. No dual proportion / peer group (not in file). Max penalty 1% (file layout: floor 0.9900).

### FY2014

- Sub-page: https://www.cms.gov/medicare/medicare-fee-for-service-payment/acuteinpatientpps/archived-supplemental-data-files/fy2014-ipps-final-rule-hrrp-supplemental-data-file
- Zip used: https://www.cms.gov/medicare/medicare-fee-for-service-payment/acuteinpatientpps/downloads/readmissions-supplemental-data-puf.zip  (2,712,013 bytes, md5 `917fca83e66e36ada69fa6abc7badce1`)
- File parsed: `FY 2014 Readmissions Supplemental Data Corection - Sept 2013.txt` (header on line 3, utf-8-sig). Cross-checked vs `FY 2014 Final Rule Readmissions Supplemental Data PUF-CN_Sept 2013.xlsx`.
- Column map: ccn <- `PROV`; paf <- `FY 2014 Readmissions Adjustment Factor`
  - err_ami <- `Acute Myocardial Infarction Excess Readmission Ratio`; err_hf <- `Excess Readmission Ratio for Heart Failure`; err_pn <- `Excess Readmission Ratio for Pneumonia`
  - n_ami <- `Number of Acute Myocardial Infarction Cases`; n_hf <- `Number of Heart Failure Cases`; n_pn <- `Number of Pneumonia Cases`
- Measures with ERR columns: AMI, HF, PN. **Absent (blank): COPD, CABG, THA/TKA.**
- Rows: 3,483 in file -> 3,483 in output (0 dropped as Maryland-without-PAF; 0 duplicate CCNs; 0 rows without PAF).
- scope_flag counts: maryland_exempt 45, puerto_rico_excluded 52, no_measure_data 172.
- PAF range 0.9800 - 1.0000 (cap 2%); out-of-range PAFs: 0; PAFs below that year's cap: 0; CCNs zero-padded: 0.
- Stated performance period: July 1, 2009 to June 30, 2012
- Penalized: 2225 of 3483 (63.88%); at cap: 18.
- Zip holds the Aug 2013 final-rule data and the Sept 2013 correction notice (CMS-1599-CN2). **Used the correction notice** (matches xlsx sheet `Final FY 2014-CN2-Sept 2013`). 39 PAFs differ from the August version; penalized count is 2,225 in both.
- Maryland (45) and Puerto Rico (52) listed with PAF 1.0000; kept and flagged as in FY2013. ERR placeholder `0.000000` for < 25 cases blanked (2,004 values).
- Two footnote lines at the bottom of the txt were skipped. AMI/HF/PN only; no dual/peer. Max penalty 2% (floor 0.9800).

### FY2015

- Sub-page: https://www.cms.gov/medicare/medicare-fee-for-service-payment/acuteinpatientpps/archived-supplemental-data-files/fy2015-ipps-final-rule-hrrp-supplemental-data-file
- Zip used: https://www.cms.gov/medicare/medicare-fee-for-service-payment/acuteinpatientpps/downloads/fy2015-fr-readmit-supp-data-file.zip  (8,647,765 bytes, md5 `46e7b7197cd21f6e0741328e9287591f`)
- File parsed: `Final FY15-CN Oct 2014.txt` (header on line 2, utf-8-sig). Cross-checked vs `FY 2015 IPPS Final Rule Readmissions PUF-Oct 2014 CN.xls`.
- Column map: ccn <- `PROV`; paf <- `Corrected FY 2015 Readmissions Adjustment Factor`
  - err_ami <- `Acute Myocardial Infarction Excess Readmission Ratio`; err_hf <- `Excess Readmission Ratio for Heart Failure`; err_pn <- `Excess Readmission Ratio for Pneumonia`; err_copd <- `Chronic Obstructive Pulmonary Disease Excess Readmission Ratio`; err_tha_tka <- `Hip/Knee Arthroplasty Excess Readmission Ratio`
  - n_ami <- `Number of Acute Myocardial Infarction Cases`; n_hf <- `Number of Heart Failure Cases`; n_pn <- `Number of Pneumonia Cases`; n_copd <- `Number of Chronic Obstructive Pulmonary Disease Cases`; n_tha_tka <- `Number of Hip/Knee Arthroplasty Cases`
- Measures with ERR columns: AMI, COPD, HF, PN, THA/TKA. **Absent (blank): CABG.**
- Rows: 3,476 in file -> 3,476 in output (0 dropped as Maryland-without-PAF; 0 duplicate CCNs; 0 rows without PAF).
- scope_flag counts: maryland_exempt 48, puerto_rico_excluded 52, no_measure_data 74.
- PAF range 0.9700 - 1.0000 (cap 3%); out-of-range PAFs: 0; PAFs below that year's cap: 0; CCNs zero-padded: 0.
- Stated performance period: July 1, 2010 to June 30, 2013
- Penalized: 2638 of 3476 (75.89%); at cap: 39.
- Page title: 'Final Rule and Correction Notice'. Zip has `Final FY15.txt` (PAF column header 'FY 2015 Proxy Readmissions Adjustment Factor') and **`Final FY15-CN Oct 2014.txt` ('Corrected FY 2015 Readmissions Adjustment Factor') - used the latter**; it equals the xlsx/xls sheet 'Final FY15-CN Oct 2014' exactly. The proxy version differs in 60 PAFs (penalized count 2,638 in both).
- First year with COPD and THA/TKA (header 'Hip/Knee Arthroplasty'); CABG absent. Maryland (48) and Puerto Rico (52) rows listed with PAF 1.0000: kept and flagged. ERR placeholder `0` for < 25 cases blanked (3,415 values). Max penalty 3%.
- Source workbook is legacy `.xls` (read with xlrd for the cross-check only); the txt was the parsing source.

### FY2016

- Sub-page: https://www.cms.gov/medicare/medicare-fee-for-service-payment/acuteinpatientpps/archived-supplemental-data-files/fy2016-ipps-final-rule-hrrp-supplemental-data-file
- Zip used: https://www.cms.gov/medicare/medicare-fee-for-service-payment/acuteinpatientpps/downloads/fy2016-cms-1632-fr-readmissions.zip  (4,861,982 bytes, md5 `fd15fbaabd83b2dd37a10d8913f03c4a`)
- File parsed: `FY 2016 IPPS Final Rule Readmissions PUF_readmadj revised 08-04-15.txt` (header on line 2, utf-8-sig). Cross-checked vs `FY 2016 IPPS Final Rule Readmissions PUF revised 08-04-15.xlsx`.
- Column map: ccn <- `Provider`; paf <- `FY 2016 Readmissions Adjustment Factor`
  - err_ami <- `Acute Myocardial Infarction Excess Readmission Ratio`; err_hf <- `Excess Readmission Ratio for Heart Failure`; err_pn <- `Excess Readmission Ratio for Pneumonia`; err_copd <- `Chronic Obstructive Pulmonary Disease Excess Readmission Ratio`; err_tha_tka <- `Hip/Knee Arthroplasty Excess Readmission Ratio`
  - n_ami <- `Number of Acute Myocardial Infarction Cases`; n_hf <- `Number of Heart Failure Cases`; n_pn <- `Number of Pneumonia Cases`; n_copd <- `Number of Chronic Obstructive Pulmonary Disease Cases`; n_tha_tka <- `Number of Hip/Knee Arthroplasty Cases`
- Measures with ERR columns: AMI, COPD, HF, PN, THA/TKA. **Absent (blank): CABG.**
- Rows: 3,464 in file -> 3,464 in output (0 dropped as Maryland-without-PAF; 0 duplicate CCNs; 0 rows without PAF).
- scope_flag counts: maryland_exempt 0, puerto_rico_excluded 0, no_measure_data 94.
- PAF range 0.9700 - 1.0000 (cap 3%); out-of-range PAFs: 0; PAFs below that year's cap: 0; CCNs zero-padded: 0.
- Stated performance period: July 1, 2011 to June 30, 2014
- Penalized: 2665 of 3464 (76.93%); at cap: 38.
- Page title: 'Final Rule and Correction Notice'. Zip contains a single revised version (files dated 08-04-15): `..._readmadj revised 08-04-15.txt`; equals the xlsx sheet 'Final Rule FY 2016'.
- CCN column header is 'Provider'. No Maryland or Puerto Rico rows in this file. 94 rows have no cases for any measure (tagged `no_measure_data`). ERR placeholder `0` blanked (3,611 values). AMI, HF, PN, COPD, THA/TKA; CABG absent.

### FY2017

- Sub-page: https://www.cms.gov/medicare/medicare-fee-for-service-payment/acuteinpatientpps/archived-supplemental-data-files/fy2017-ipps-final-rule-hrrp-supplemental-data-file
- Zip used: https://www.cms.gov/medicare/medicare-fee-for-service-payment/acuteinpatientpps/downloads/fy2017-cms-1655-fr-hospital-readmissions.zip  (5,102,071 bytes, md5 `ef34cfe61e43aecda70c940a6f0cb798`)
- File parsed: `FY 2017 IPPS Final Rule Readmissions PUF (FY17 data).txt` (header on line 2, utf-8-sig). Cross-checked vs `FY 2017 IPPS Final Rule Readmissions Supplemental Data File.xlsx`.
- Column map: ccn <- `Provider`; paf <- `FY 2017 Readmissions Adjustment Factor`
  - err_ami <- `Acute Myocardial Infarction Excess Readmission Ratio`; err_hf <- `Excess Readmission Ratio for Heart Failure`; err_pn <- `Excess Readmission Ratio for Pneumoniuia`; err_copd <- `Chronic Obstructive Pulmonary Disease Excess Readmission Ratio`; err_cabg <- `Coronary Artery Bypass Graft Excess Readmission Ratio`; err_tha_tka <- `Hip/Knee Arthroplasty Excess Readmission Ratio`
  - n_ami <- `Number of Acute Myocardial Infarction Cases`; n_hf <- `Number of Heart Failure Cases`; n_pn <- `Number of Pneumonia Cases`; n_copd <- `Number of Chronic Obstructive Pulmonary Disease Cases`; n_cabg <- `Number of Coronary Artery Bypass Graft Cases`; n_tha_tka <- `Number of Hip/Knee Arthroplasty Cases`
- Measures with ERR columns: AMI, CABG, COPD, HF, PN, THA/TKA. **Absent (blank): none.**
- Rows: 3,448 in file -> 3,448 in output (0 dropped as Maryland-without-PAF; 0 duplicate CCNs; 0 rows without PAF).
- scope_flag counts: maryland_exempt 0, puerto_rico_excluded 0, no_measure_data 271.
- PAF range 0.9700 - 1.0000 (cap 3%); out-of-range PAFs: 0; PAFs below that year's cap: 0; CCNs zero-padded: 0.
- Stated performance period: July 1, 2012 to June 30, 2015
- Penalized: 2598 of 3448 (75.35%); at cap: 49.
- First year with CABG. Header typo 'Excess Readmission Ratio for Pneumoniuia' (mapped by keyword). Column order in the data file (Hip/Knee, COPD, CABG) differs from the order in the variable-description file; mapping is by header text, not position. ERR placeholder `0.000000000` for < 25 cases blanked (6,373 values); 271 `no_measure_data` rows.

### FY2018

- Sub-page: https://www.cms.gov/medicare/medicare-fee-for-service-payment/acuteinpatientpps/archived-supplemental-data-files/fy2018-ipps-final-rule-hrrp-supplemental-data-file
- Zip used: https://www.cms.gov/medicare/medicare-fee-for-service-payment/acuteinpatientpps/downloads/fy2018-fr-hospital-readmissions.zip  (4,939,723 bytes, md5 `26d8fc86cf02895adc1b77e7667d20e8`)
- File parsed: `FY 2018 IPPS Final Rule Readmissions PUF (FY18 data).txt` (header on line 2, utf-8-sig). Cross-checked vs `FY 2018 IPPS Final Rule Readmissions Supplemental Data File.xlsx`.
- Column map: ccn <- `Provider`; paf <- `FY 2018 Readmissions Adjustment Factor`
  - err_ami <- `Acute Myocardial Infarction Excess Readmission Ratio`; err_hf <- `Excess Readmission Ratio for Heart Failure`; err_pn <- `Excess Readmission Ratio for Pneumonia`; err_copd <- `Chronic Obstructive Pulmonary Disease Excess Readmission Ratio`; err_cabg <- `Coronary Artery Bypass Graft Excess Readmission Ratio`; err_tha_tka <- `Hip/Knee Arthroplasty Excess Readmission Ratio`
  - n_ami <- `Number of Acute Myocardial Infarction Cases`; n_hf <- `Number of Heart Failure Cases`; n_pn <- `Number of Pneumonia Cases`; n_copd <- `Number of Chronic Obstructive Pulmonary Disease Cases`; n_cabg <- `Number of Coronary Artery Bypass Graft Cases`; n_tha_tka <- `Number of Hip/Knee Arthroplasty Cases`
- Measures with ERR columns: AMI, CABG, COPD, HF, PN, THA/TKA. **Absent (blank): none.**
- Rows: 3,414 in file -> 3,414 in output (0 dropped as Maryland-without-PAF; 0 duplicate CCNs; 0 rows without PAF).
- scope_flag counts: maryland_exempt 0, puerto_rico_excluded 0, no_measure_data 87.
- PAF range 0.9700 - 1.0000 (cap 3%); out-of-range PAFs: 0; PAFs below that year's cap: 0; CCNs zero-padded: 0.
- Stated performance period: not stated in file
- Penalized: 2634 of 3414 (77.15%); at cap: 48.
- Missing values are `.` (not zeros) from this year on; ERR is reported even when the case count is < 25 (2,137 such measure-level values are kept as given). 87 rows have `.` for every measure (no ERRs) and are tagged `no_measure_data`.
- Data column order differs from earlier years (AMI first, then PN, HF, THA/TKA, COPD, CABG). **The file does not state the performance-period dates** - it only says 'FY 18 applicable period' - so performance_period_start/end are left blank for FY2018. (The DRG-info variable-description file contains a stray 'July 1, 2011 ... June 30, 2014' string carried over from FY2016, which I did not use.)

### FY2019

- Sub-page: https://www.cms.gov/medicare/medicare-fee-for-service-payment/acuteinpatientpps/archived-supplemental-data-files/fy2019-ipps-final-rule-hrrp-supplemental-data-file
- Zip used: https://www.cms.gov/medicare/medicare-fee-for-service-payment/acuteinpatientpps/downloads/fy2019-cms-1694-fr-hospital-readmissions.zip  (1,525,741 bytes, md5 `c5aa1f670e4db78a00f69537c9788833`)
- File parsed: `Section 508 - FR FY 19 - tab - fy_2019_ipps_final_rule_hrrp_supplemental_file.txt` (header on line 2, utf-8-sig). Cross-checked vs `fy_2019_ipps_final_rule_hrrp_supplemental_file.xlsx`.
- Column map: ccn <- `Hospital CCN`; paf <- `Payment Adjustment Factor`; dual_proportion <- `Dual Proportion`; peer_group <- `Peer Group Assignment`
  - err_ami <- `ERR for AMI`; err_hf <- `ERR for HF`; err_pn <- `ERR for Pneumonia`; err_copd <- `ERR for COPD`; err_cabg <- `ERR for CABG`; err_tha_tka <- `ERR for THA/TKA`
  - n_ami <- `Number of Eligible Discharges for AMI`; n_hf <- `Number of Eligible Discharges for HF`; n_pn <- `Number of Eligible Discharges for Pneumonia`; n_copd <- `Number of Eligible Discharges for COPD`; n_cabg <- `Number of Eligible Discharges for CABG`; n_tha_tka <- `Number of Eligible Discharges for THA/TKA`
- Measures with ERR columns: AMI, CABG, COPD, HF, PN, THA/TKA. **Absent (blank): none.**
- Rows: 3,173 in file -> 3,173 in output (0 dropped as Maryland-without-PAF; 0 duplicate CCNs; 0 rows without PAF).
- scope_flag counts: maryland_exempt 0, puerto_rico_excluded 0, no_measure_data 0.
- PAF range 0.9700 - 1.0000 (cap 3%); out-of-range PAFs: 0; PAFs below that year's cap: 0; CCNs zero-padded: 579.
- Stated performance period: July 1, 2014 through June 30, 2017; July 1, 2014 to June 30, 2017
- Penalized: 2599 of 3173 (81.91%); at cap: 47.
- First stratified-methodology year: adds Dual Proportion, Peer Group Assignment, per-measure peer-group median ERR, penalty indicator, DRG payment ratio and a neutrality modifier (median/indicator/ratio/modifier were not extracted). Header is 'Hospital CCN'. **The txt drops leading zeros on CCNs** (579 five-digit CCNs, e.g. `10001`); zero-padded to 6 characters. Trailing 'end of worksheet' row skipped. Text file is 4-decimal rounded; the xlsx carries more digits (max abs difference 5e-5 for ERR and dual proportion; PAF identical).
- The index also lists a separate page 'hrrp-new-stratified-methodology-hospital-level-impact-files' (impact files for the stratified methodology); it is not a final-rule PAF file and was not used.

### FY2020

- Sub-page: https://www.cms.gov/medicare/payment/prospective-payment-systems/acute-inpatient-pps/archived-supplemental-data-files/fy-2020-ipps-final-rule-hospital-readmissions-reduction-program-supplemental-data-file
- Zip used: https://www.cms.gov/files/zip/fy-2020-ipps-final-rule-hospital-readmissions-reduction-program-supplemental-data-file.zip  (1,647,303 bytes, md5 `4e99a391ba9ce5b3cc7f32b439687610`)
- File parsed: `FY2020_IPPS_Final_Rule_HRRP_Supplemental_File tab2.txt` (header on line 2, utf-8-sig). Cross-checked vs `FY2020_IPPS_Final_Rule_HRRP_Supplemental_File.xlsx`.
- Column map: ccn <- `Hospital CCN`; paf <- `Payment Adjustment Factor`; dual_proportion <- `Dual Proportion`; peer_group <- `Peer Group Assignment`
  - err_ami <- `ERR for AMI`; err_hf <- `ERR for HF`; err_pn <- `ERR for Pneumonia`; err_copd <- `ERR for COPD`; err_cabg <- `ERR for CABG`; err_tha_tka <- `ERR for THA/TKA`
  - n_ami <- `Number of Eligible Discharges for AMI`; n_hf <- `Number of Eligible Discharges for HF`; n_pn <- `Number of Eligible Discharges for Pneumonia`; n_copd <- `Number of Eligible Discharges for COPD`; n_cabg <- `Number of Eligible Discharges for CABG`; n_tha_tka <- `Number of Eligible Discharges for THA/TKA`
- Measures with ERR columns: AMI, CABG, COPD, HF, PN, THA/TKA. **Absent (blank): none.**
- Rows: 3,130 in file -> 3,130 in output (0 dropped as Maryland-without-PAF; 0 duplicate CCNs; 0 rows without PAF).
- scope_flag counts: maryland_exempt 0, puerto_rico_excluded 0, no_measure_data 0.
- PAF range 0.9700 - 1.0000 (cap 3%); out-of-range PAFs: 0; PAFs below that year's cap: 0; CCNs zero-padded: 0.
- Stated performance period: July 1, 2015 through June 30, 2018; July 1, 2015 to June 30, 2018
- Penalized: 2583 of 3130 (82.52%); at cap: 56.
- The txt export is split by workbook tab: `tab1` = variable description, **`tab2` = data (used)**, `tab3` = case-info variable description, `tab4` = case info (DRG/case lists, not used). Text values rounded to 4 decimals (xlsx has more digits; PAF identical).

### FY2021

- Sub-page: https://www.cms.gov/medicare/payment/prospective-payment-systems/acute-inpatient-pps/archived-supplemental-data-files/fy-2021-ipps-final-rule-hospital-readmissions-reduction-program-supplemental-data-file
- Zip used: https://www.cms.gov/files/zip/fy-2021-ipps-final-rule-hospital-readmissions-reduction-program-supplemental-data-file.zip  (1,770,718 bytes, md5 `9d66aecb52addd0276a2f20b1e410166`)
- File parsed: `FY2021_Final_Rule_Supplemental_File_FR FY 2021.txt` (header on line 2, utf-8-sig). Cross-checked vs `FY2021_Final_Rule_Supplemental_File.xlsx`.
- Column map: ccn <- `Hospital CCN`; paf <- `Payment adjustment factor`; dual_proportion <- `Dual proportion`; peer_group <- `Peer group assignment`
  - err_ami <- `ERR for AMI`; err_hf <- `ERR for HF`; err_pn <- `ERR for pneumonia`; err_copd <- `ERR for COPD`; err_cabg <- `ERR for CABG`; err_tha_tka <- `ERR for THA/TKA`
  - n_ami <- `Number of eligible discharges for AMI`; n_hf <- `Number of eligible discharges for HF`; n_pn <- `Number of eligible discharges for pneumonia`; n_copd <- `Number of eligible discharges for COPD`; n_cabg <- `Number of eligible discharges for CABG`; n_tha_tka <- `Number of eligible discharges for THA/TKA`
- Measures with ERR columns: AMI, CABG, COPD, HF, PN, THA/TKA. **Absent (blank): none.**
- Rows: 3,080 in file -> 3,080 in output (0 dropped as Maryland-without-PAF; 0 duplicate CCNs; 0 rows without PAF).
- scope_flag counts: maryland_exempt 0, puerto_rico_excluded 0, no_measure_data 0.
- PAF range 0.9700 - 1.0000 (cap 3%); out-of-range PAFs: 0; PAFs below that year's cap: 0; CCNs zero-padded: 0.
- Stated performance period: July 1, 2016 through June 30, 2019; July 1, 2016 to June 30, 2019
- Penalized: 2545 of 3080 (82.63%); at cap: 39.
- Numbers >= 1,000 are quoted with thousands separators (`"1,107"`); commas stripped. The xlsx is dated 10-22-2020, later than the txt exports (09-15-2020); I compared them row by row - PAF, peer group, and case counts are identical (ERR/dual differ only by 4-decimal rounding).

### FY2022

- Sub-page: https://www.cms.gov/medicare/payment/prospective-payment-systems/acute-inpatient-pps/archived-supplemental-data-files/fy-2022-ipps-final-rule-hospital-readmissions-reduction-program-supplemental-data-file
- Zip used: https://www.cms.gov/files/zip/fy-2022-ipps-final-rule-hospital-readmissions-reduction-program-supplemental-data-file.zip  (1,632,780 bytes, md5 `c6d2eca0c71a57de134836ca48e72ab7`)
- File parsed: `508_Compliant_Version_of_FR FY 2022.csv` (header on line 4, utf-8-sig). Cross-checked vs `FY2022_Final_Rule_Supplemental_File.xlsx`.
- Column map: ccn <- `Hospital CCN`; paf <- `Payment adjustment factor`; (check only) `Payment Reduction Percentage`; dual_proportion <- `Dual proportion`; peer_group <- `Peer group assignment`
  - err_ami <- `ERR for AMI`; err_hf <- `ERR for HF`; err_pn <- `ERR for pneumonia`; err_copd <- `ERR for COPD`; err_cabg <- `ERR for CABG`; err_tha_tka <- `ERR for THA/TKA`
  - n_ami <- `Number of eligible discharges for AMI`; n_hf <- `Number of eligible discharges for HF`; n_pn <- `Number of eligible discharges for pneumonia`; n_copd <- `Number of eligible discharges for COPD`; n_cabg <- `Number of eligible discharges for CABG`; n_tha_tka <- `Number of eligible discharges for THA/TKA`
- Measures with ERR columns: AMI, CABG, COPD, HF, PN, THA/TKA. **Absent (blank): none.**
- Rows: 3,047 in file -> 3,047 in output (0 dropped as Maryland-without-PAF; 0 duplicate CCNs; 0 rows without PAF).
- scope_flag counts: maryland_exempt 0, puerto_rico_excluded 0, no_measure_data 0.
- PAF range 0.9700 - 1.0000 (cap 3%); out-of-range PAFs: 0; PAFs below that year's cap: 0; CCNs zero-padded: 0.
- Stated performance period: July 1, 2017 and December 1, 2019; July 1, 2017 through December 1, 2019; July 1, 2017 to December 1, 2019
- Penalized: 2500 of 3047 (82.05%); at cap: 39.
- CSV (508-compliant version). First year with a 'Payment Reduction Percentage' column (e.g. `0.97%`); it is consistent with PAF in every row (|PAF - (1 - pct/100)| <= 0.00006), so no PAF was derived from the percentage. Performance (data) period stated as July 1, 2017 - December 1, 2019, with Q1-Q2 2020 claims excluded under the COVID extraordinary-circumstance exception.

### FY2023

- Sub-page: https://www.cms.gov/medicare/payment/prospective-payment-systems/acute-inpatient-pps/archived-supplemental-data-files/fy-2023-ipps-final-rule-hospital-readmissions-reduction-program-supplemental-data-file
- Zip used: https://www.cms.gov/files/zip/fy-2023-ipps-final-rule-hospital-readmissions-reduction-program-supplemental-data-file.zip  (1,418,475 bytes, md5 `6450d2cdbae1fac6668d8c5be5f838b7`)
- File parsed: `FY2023_FR_Supplemental_File FR FY 2023.txt` (header on line 2, utf-8-sig). Cross-checked vs `FY2023_Final_Rule_Supplemental_File.xlsx`.
- Column map: ccn <- `Hospital CCN`; paf <- `Payment adjustment factor`; (check only) `Payment reduction percentage`; dual_proportion <- `Dual proportion`; peer_group <- `Peer group assignment`
  - err_ami <- `ERR for AMI`; err_hf <- `ERR for HF`; err_copd <- `ERR for COPD`; err_cabg <- `ERR for CABG`; err_tha_tka <- `ERR for THA/TKA`
  - n_ami <- `Number of eligible discharges for AMI`; n_hf <- `Number of eligible discharges for HF`; n_copd <- `Number of eligible discharges for COPD`; n_cabg <- `Number of eligible discharges for CABG`; n_tha_tka <- `Number of eligible discharges for THA/TKA`
- Measures with ERR columns: AMI, CABG, COPD, HF, THA/TKA. **Absent (blank): PN.**
- Rows: 3,044 in file -> 3,044 in output (0 dropped as Maryland-without-PAF; 0 duplicate CCNs; 0 rows without PAF).
- scope_flag counts: maryland_exempt 0, puerto_rico_excluded 0, no_measure_data 0.
- PAF range 0.9700 - 1.0000 (cap 3%); out-of-range PAFs: 0; PAFs below that year's cap: 0; CCNs zero-padded: 0.
- Stated performance period: July 1, 2018 to December 1, 2019; July 1, 2020 to June 30, 2021
- Penalized: 2273 of 3044 (74.67%); at cap: 17.
- **CMS link problem:** the FY2023 sub-page's href is `.../fy-2023-...-supplemental-data-file.zip-0` and that file is byte-identical (same MD5 `a975a434...`) to the **FY2024** zip. The correct FY2023 zip is at the same URL without the `-0` suffix (header `FY 2023 IPPS Final Rule`, files dated 09-13-2022); that is what was used. The mis-linked file is *not* in the output under FY2023.
- **Pneumonia is absent from the file** (suppressed for FY2023 payment because of COVID-19, 86 FR 45254-45256; file note: 'results ... are not included in this file'). All pneumonia ERR/n are blank for FY2023. The PAF is computed from five measures. Data period is two segments: July 1, 2018 - Dec 1, 2019 and July 1, 2020 - June 30, 2021 (start/end in summary = outer bounds). Has a 'Payment reduction percentage' column, consistent with PAF.

### FY2024

- Sub-page: https://www.cms.gov/medicare/payment/prospective-payment-systems/acute-inpatient-pps/archived-supplemental-data-files/fy-2024-ipps-final-rule-hospital-readmissions-reduction-program-supplemental-data-file
- Zip used: https://www.cms.gov/files/zip/fy-2024-ipps-final-rule-hospital-readmissions-reduction-program-supplemental-data-file.zip  (1,768,890 bytes, md5 `a975a4342922f6c55ec659445eb1bb1a`)
- File parsed: `508 version of FY2024_Final_Rule_Supplemental_File Variations FR FY 2024 tab .txt` (header on line 2, utf-8-sig). Cross-checked vs `FY2024_Final_Rule_Supplemental_File.xlsx`.
- Column map: ccn <- `Hospital CCN`; paf <- `Payment adjustment factor`; (check only) `Payment reduction percentage`; dual_proportion <- `Dual proportion`; peer_group <- `Peer group assignment`
  - err_ami <- `ERR for AMI`; err_hf <- `ERR for HF`; err_pn <- `ERR for pneumonia`; err_copd <- `ERR for COPD`; err_cabg <- `ERR for CABG`; err_tha_tka <- `ERR for THA/TKA`
  - n_ami <- `Number of eligible discharges for AMI`; n_hf <- `Number of eligible discharges for HF`; n_pn <- `Number of eligible discharges for pneumonia`; n_copd <- `Number of eligible discharges for COPD`; n_cabg <- `Number of eligible discharges for CABG`; n_tha_tka <- `Number of eligible discharges for THA/TKA`
- Measures with ERR columns: AMI, CABG, COPD, HF, PN, THA/TKA. **Absent (blank): none.**
- Rows: 3,037 in file -> 3,037 in output (0 dropped as Maryland-without-PAF; 0 duplicate CCNs; 0 rows without PAF).
- scope_flag counts: maryland_exempt 0, puerto_rico_excluded 0, no_measure_data 0.
- PAF range 0.9700 - 1.0000 (cap 3%); out-of-range PAFs: 0; PAFs below that year's cap: 0; CCNs zero-padded: 0.
- Stated performance period: July 1, 2019 to December 1, 2019; July 1, 2020 to June 30, 2022
- Penalized: 2356 of 3037 (77.58%); at cap: 9.
- Data period is two segments: July 1, 2019 - Dec 1, 2019 and July 1, 2020 - June 30, 2022 (summary shows outer bounds). Pneumonia returns. Trailing 'End of worksheet' rows skipped.

### FY2025

- Sub-page: https://www.cms.gov/medicare/payment/prospective-payment-systems/acute-inpatient-pps/archived-supplemental-data-files/fy-2025-ipps-final-rule-hospital-readmissions-reduction-program-supplemental-data-file
- Zip used: https://www.cms.gov/files/zip/fy-2025-ipps-final-rule-hospital-readmissions-reduction-program-supplemental-data-file.zip  (1,712,578 bytes, md5 `01c6ba03313683246ae578905149760e`)
- File parsed: `508-Version-FR-FY-2025.csv` (header on line 2, utf-8-sig). Cross-checked vs `FY2025_Final_Rule_Supplemental_File.xlsx`.
- Column map: ccn <- `Hospital CCN`; paf <- `Payment adjustment factor`; (check only) `Payment reduction percentage`; dual_proportion <- `Dual proportion`; peer_group <- `Peer group assignment`
  - err_ami <- `ERR for AMI`; err_hf <- `ERR for HF`; err_pn <- `ERR for pneumonia`; err_copd <- `ERR for COPD`; err_cabg <- `ERR for CABG`; err_tha_tka <- `ERR for THA/TKA`
  - n_ami <- `Number of eligible discharges for AMI`; n_hf <- `Number of eligible discharges for HF`; n_pn <- `Number of eligible discharges for pneumonia`; n_copd <- `Number of eligible discharges for COPD`; n_cabg <- `Number of eligible discharges for CABG`; n_tha_tka <- `Number of eligible discharges for THA/TKA`
- Measures with ERR columns: AMI, CABG, COPD, HF, PN, THA/TKA. **Absent (blank): none.**
- Rows: 2,980 in file -> 2,980 in output (0 dropped as Maryland-without-PAF; 0 duplicate CCNs; 0 rows without PAF).
- scope_flag counts: maryland_exempt 0, puerto_rico_excluded 0, no_measure_data 0.
- PAF range 0.9700 - 1.0000 (cap 3%); out-of-range PAFs: 0; PAFs below that year's cap: 0; CCNs zero-padded: 0.
- Stated performance period: July 1, 2020 to June 30, 2023
- Penalized: 2342 of 2980 (78.59%); at cap: 11.
- CSV (508-compliant). File begins with a BOM and an extra title row; header found by name. Reports ERRs even when n < 25 (kept as given). Data period July 1, 2020 - June 30, 2023.

### FY2026

- Sub-page: https://www.cms.gov/medicare/payment/prospective-payment-systems/acute-inpatient-pps/archived-supplemental-data-files/fy-2026-ipps-final-rule-hospital-readmissions-reduction-program-supplemental-data-file
- Zip used: https://www.cms.gov/files/zip/fy-2026-ipps-final-rule-hospital-readmissions-reduction-program-supplemental-data-file.zip  (1,721,540 bytes, md5 `09ab2147e06de2b406b0b2e3a8efe228`)
- File parsed: `FR FY 2026.txt` (header on line 2, utf-8-sig). Cross-checked vs `FY2026_HRRP_Supplemental_File.xlsx`.
- Column map: ccn <- `Hospital CCN`; paf <- `Payment adjustment factor`; (check only) `Payment reduction percentage`; dual_proportion <- `Dual proportion`; peer_group <- `Peer group assignment`
  - err_ami <- `ERR for AMI`; err_hf <- `ERR for HF`; err_pn <- `ERR for pneumonia`; err_copd <- `ERR for COPD`; err_cabg <- `ERR for CABG`; err_tha_tka <- `ERR for THA/TKA`
  - n_ami <- `Number of eligible discharges for AMI`; n_hf <- `Number of eligible discharges for HF`; n_pn <- `Number of eligible discharges for pneumonia`; n_copd <- `Number of eligible discharges for COPD`; n_cabg <- `Number of eligible discharges for CABG`; n_tha_tka <- `Number of eligible discharges for THA/TKA`
- Measures with ERR columns: AMI, CABG, COPD, HF, PN, THA/TKA. **Absent (blank): none.**
- Rows: 2,945 in file -> 2,945 in output (0 dropped as Maryland-without-PAF; 0 duplicate CCNs; 0 rows without PAF).
- scope_flag counts: maryland_exempt 0, puerto_rico_excluded 0, no_measure_data 0.
- PAF range 0.9700 - 1.0000 (cap 3%); out-of-range PAFs: 0; PAFs below that year's cap: 0; CCNs zero-padded: 0.
- Stated performance period: July 1, 2021 to June 30, 2024
- Penalized: 2304 of 2945 (78.23%); at cap: 15.
- **CMS link problem:** the FY2026 sub-page lists a download titled 'FY 2025 IPPS Final Rule...' whose href is the FY2025 zip (MD5 `01c6ba03...`). The FY2026 zip is **not linked from CMS's page**; I fetched it at the URL pattern the other years use (`/files/zip/fy-2026-ipps-final-rule-hospital-readmissions-reduction-program-supplemental-data-file.zip`), which resolves to a distinct file whose contents are labelled FY 2026 (title 'FY 2026 IPPS/LTCH PPS Final Rule', `FY2026_HRRP_Supplemental_File.xlsx`, data period July 1, 2021 - June 30, 2024). Treat the provenance as 'guessed URL, verified by content' and re-check against CMS once the page is fixed.
