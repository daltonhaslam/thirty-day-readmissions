"""Build hrrp_history_long.csv + hrrp_history_summary.csv (+ diag.json for the README).

Usage:  python3 -I build_hist.py <dl_root> <out_dir> <diag_json_path>
"""
import csv
import hashlib
import json
import os
import statistics
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hrrp_parse as P  # noqa: E402

dl_root, out_dir, diag_path = sys.argv[1:4]
os.makedirs(out_dir, exist_ok=True)

LONG_COLS = (["fy", "ccn", "paf", "dual_proportion", "peer_group"]
             + ["err_" + c for c in P.COND] + ["n_" + c for c in P.COND] + ["scope_flag"])


def fnum(x):
    return "" if x is None else repr(float(x))


def md5(path):
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def scope_flag(r):
    no_n = all(v in (None, 0) for v in r["n"].values())
    if r["ccn"].startswith("21"):
        return "maryland_exempt"
    if r["ccn"].startswith("40") and no_n:
        return "puerto_rico_excluded"
    if no_n:
        return "no_measure_data"
    return ""


all_rows = []
diag = {}
problems = []

for fy in sorted(P.CFG):
    cfg = P.CFG[fy]
    rows, d = P.parse_fy(fy, dl_root)
    dd = dict(
        data_file=cfg["data"], dir=cfg["dir"], url=cfg["url"], xlsx=cfg["xlsx"],
        zip_md5=md5(os.path.join(dl_root, cfg["dir"], "src.zip")),
        zip_bytes=os.path.getsize(os.path.join(dl_root, cfg["dir"], "src.zip")),
        file_rows=len(rows), header_row=d["header_row"], encoding=d["encoding"],
        colnames={(k[0] + (":" + k[1] if k[1] else "")): v for k, v in d["colnames"].items()},
        skipped_rows=d["skipped_rows"], parse_anomalies=d["anomalies"],
        placeholder_err_blanked=0, pct_mismatch=0, paf_from_pct=0, md_dropped_no_paf=0,
        err_present_with_n_lt25=0, n_zero_recorded=0,
    )
    ps, pe, praw = P.performance_period(fy, dl_root)
    dd.update(period_start=ps, period_end=pe, period_raw=praw)
    kept = []
    for r in rows:
        # PAF: fall back to 1 - pct/100 only if PAF itself is absent
        if r["paf"] is None and r["pct"] is not None:
            r["paf"] = round(1 - r["pct"] / 100.0, 6)
            dd["paf_from_pct"] += 1
        if r["paf"] is not None and r["pct"] is not None and abs(r["paf"] - (1 - r["pct"] / 100.0)) > 0.00006:
            dd["pct_mismatch"] += 1
        # Maryland rows with no PAF are dropped (none occur in practice)
        if r["ccn"].startswith("21") and r["paf"] is None:
            dd["md_dropped_no_paf"] += 1
            continue
        # FY2013-FY2017 files print ERR = 0 as a placeholder when a hospital has <25 cases
        # (file layout: "Hospitals with fewer than 25 cases do not have an excess readmission ratio").
        for c in P.COND:
            e, n = r["err"][c], r["n"][c]
            if e is not None and e == 0 and (n is None or n < 25):
                r["err"][c] = None
                dd["placeholder_err_blanked"] += 1
            elif e is not None and n is not None and n < 25:
                dd["err_present_with_n_lt25"] += 1
            if n == 0:
                dd["n_zero_recorded"] += 1
        r["scope_flag"] = scope_flag(r)
        kept.append(r)
    # duplicates
    seen = {}
    dups = []
    uniq = []
    for r in kept:
        if r["ccn"] in seen:
            dups.append(r["ccn"])
            continue
        seen[r["ccn"]] = r
        uniq.append(r)
    dd["duplicate_ccns"] = dups
    dd["output_rows"] = len(uniq)
    dd["flag_counts"] = {k: sum(1 for r in uniq if r["scope_flag"] == k)
                         for k in ("maryland_exempt", "puerto_rico_excluded", "no_measure_data")}
    dd["rows_missing_paf"] = sum(1 for r in uniq if r["paf"] is None)
    pafs = [r["paf"] for r in uniq if r["paf"] is not None]
    dd["paf_min"], dd["paf_max"] = min(pafs), max(pafs)
    out_of_range = [r["ccn"] for r in uniq if r["paf"] is not None and not (0.97 - 1e-9 <= r["paf"] <= 1.0 + 1e-9)]
    below_cap = [r["ccn"] for r in uniq if r["paf"] is not None and r["paf"] < 1 - P.cap_pct(fy) / 100 - 1e-9]
    dd["paf_out_of_range"] = out_of_range
    dd["paf_below_year_cap"] = below_cap
    dd["measures_present"] = sorted({k.split(":")[1] for k in dd["colnames"] if ":" in k})
    dd["ccn_zero_padded_from_short"] = sum(1 for r in uniq if len(r["ccn_raw"]) < 6)
    diag[fy] = dd
    all_rows.extend(uniq)

# ---- validation ----
keys = [(r["fy"], r["ccn"]) for r in all_rows]
if len(keys) != len(set(keys)):
    problems.append("duplicate (fy, ccn) in output")
for r in all_rows:
    if len(r["ccn"]) != 6:
        problems.append("bad ccn length %s" % r["ccn"])
    if r["dual"] is not None and not (0 <= r["dual"] <= 1):
        problems.append("dual out of [0,1] %s %s" % (r["fy"], r["ccn"]))
    if r["peer"] is not None and not (1 <= r["peer"] <= 5):
        problems.append("peer out of 1..5 %s %s" % (r["fy"], r["ccn"]))
    for c in P.COND:
        if r["err"][c] is not None and r["err"][c] < 0:
            problems.append("negative ERR")
        if r["n"][c] is not None and r["n"][c] < 0:
            problems.append("negative n")
    if r["fy"] < 2019 and (r["dual"] is not None or r["peer"] is not None):
        problems.append("dual/peer before FY2019")

# ---- long CSV ----
all_rows.sort(key=lambda r: (r["fy"], r["ccn"]))
long_path = os.path.join(out_dir, "hrrp_history_long.csv")
with open(long_path, "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f, lineterminator="\n")
    w.writerow(LONG_COLS)
    for r in all_rows:
        w.writerow([r["fy"], r["ccn"], fnum(r["paf"]), fnum(r["dual"]),
                    "" if r["peer"] is None else r["peer"]]
                   + [fnum(r["err"][c]) for c in P.COND]
                   + ["" if r["n"][c] is None else r["n"][c] for c in P.COND]
                   + [r["scope_flag"]])

# ---- summary ----
SUM_COLS = ["fy", "n_hospitals", "n_penalized", "pct_penalized", "mean_reduction_pct_all",
            "mean_reduction_pct_penalized", "n_at_max", "median_reduction_pct_penalized",
            "performance_period_start", "performance_period_end", "max_cap_pct",
            "n_hospitals_comparable", "n_penalized_comparable", "pct_penalized_comparable",
            "mean_reduction_pct_all_comparable"]


def stats(rows, cap):
    p = [r["paf"] for r in rows if r["paf"] is not None]
    red = [(1 - x) * 100 for x in p]
    pen = [x for x in red if x > 1e-9]
    n = len(p)
    return dict(
        n=n, npen=len(pen), pct=(100.0 * len(pen) / n) if n else None,
        mean_all=(sum(red) / n) if n else None,
        mean_pen=(sum(pen) / len(pen)) if pen else None,
        at_max=sum(1 for x in p if x <= 1 - cap / 100 + 1e-9),
        med_pen=statistics.median(pen) if pen else None)


def r4(x):
    return "" if x is None else ("%.4f" % x)


summary = []
for fy in sorted(P.CFG):
    rows = [r for r in all_rows if r["fy"] == fy]
    cap = P.cap_pct(fy)
    s = stats(rows, cap)
    sc = stats([r for r in rows if r["scope_flag"] == ""], cap)
    summary.append([fy, s["n"], s["npen"], "%.2f" % s["pct"], r4(s["mean_all"]), r4(s["mean_pen"]), s["at_max"],
                    r4(s["med_pen"]), diag[fy]["period_start"] or "", diag[fy]["period_end"] or "", cap,
                    sc["n"], sc["npen"], "%.2f" % sc["pct"], r4(sc["mean_all"])])
    diag[fy]["summary"] = dict(zip(SUM_COLS, summary[-1]))
sum_path = os.path.join(out_dir, "hrrp_history_summary.csv")
with open(sum_path, "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f, lineterminator="\n")
    w.writerow(SUM_COLS)
    w.writerows(summary)

json.dump({"diag": {str(k): v for k, v in diag.items()}, "problems": problems}, open(diag_path, "w"), indent=1, default=str)

print("rows:", len(all_rows), "problems:", problems)
print(",".join(SUM_COLS))
for s in summary:
    print(",".join(str(x) for x in s))
