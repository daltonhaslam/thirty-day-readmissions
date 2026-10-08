"""Per-hospital PAF history (FY2013-FY2026) and the national trend series."""
import csv
import statistics

FIRST_FY, LAST_HIST_FY = 2013, 2026
CAP_BY_FY = {2013: 1, 2014: 2}  # percent; 3% from FY2015 on


def cap_pct(fy):
    return CAP_BY_FY.get(fy, 3)


def load_paf_history(path, keep_ids):
    """{ccn: [paf or None for FY2013..FY2026]} for hospitals in keep_ids; out-of-scope rows (MD/PR/no data) → None."""
    years = list(range(FIRST_FY, LAST_HIST_FY + 1))
    out = {}
    with open(path, newline="") as f:
        for r in csv.DictReader(f):
            ccn = r["ccn"]
            if ccn not in keep_ids or r["scope_flag"]:
                continue
            fy = int(r["fy"])
            if FIRST_FY <= fy <= LAST_HIST_FY:
                out.setdefault(ccn, [None] * len(years))[fy - FIRST_FY] = round(float(r["paf"]), 4)
    return years, out


def summarize_fy(fy, pafs):
    """National summary for one FY from a list of PAFs (same definitions as the historical summary)."""
    reds = [(1 - p) * 100 for p in pafs]
    pen = [r for r in reds if r > 1e-9]
    cap = cap_pct(fy)
    return {
        "fy": fy, "n": len(reds), "nPen": len(pen),
        "pctPen": round(100 * len(pen) / len(reds), 2) if reds else 0,
        "meanRed": round(sum(reds) / len(reds), 4) if reds else 0,
        "meanRedPen": round(sum(pen) / len(pen), 4) if pen else 0,
        "medianRedPen": round(statistics.median(pen), 4) if pen else 0,
        "nMax": sum(1 for r in reds if r >= cap - 1e-6), "cap": cap,
    }


def load_national(summary_path):
    """Comparable-population national series FY2013-FY2026 from the historical summary CSV."""
    rows = []
    with open(summary_path, newline="") as f:
        for r in csv.DictReader(f):
            fy = int(r["fy"])
            rows.append({
                "fy": fy,
                "n": int(r["n_hospitals_comparable"]),
                "nPen": int(r["n_penalized_comparable"]),
                "pctPen": float(r["pct_penalized_comparable"]),
                "meanRed": float(r["mean_reduction_pct_all_comparable"]),
                "meanRedPen": float(r["mean_reduction_pct_penalized"]),
                "medianRedPen": float(r["median_reduction_pct_penalized"]),
                "nMax": int(r["n_at_max"]),
                "cap": int(r["max_cap_pct"]),
                "perf": [r["performance_period_start"] or None, r["performance_period_end"] or None],
            })
    return rows
