"""Per-hospital PAF history (FY2013-FY2026) and the national trend series."""
import csv
import statistics

def load_paf_history(path, keep_ids, first_fy, last_fy):
    """{ccn: [paf or None per FY first_fy..last_fy]} for hospitals in keep_ids; out-of-scope rows (MD/PR/no data) → None."""
    years = list(range(first_fy, last_fy + 1))
    out = {}
    with open(path, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            ccn = r["ccn"]
            if ccn not in keep_ids or r["scope_flag"]:
                continue
            fy = int(r["fy"])
            if first_fy <= fy <= last_fy:
                out.setdefault(ccn, [None] * len(years))[fy - first_fy] = round(float(r["paf"]), 4)
    return years, out


def summarize_fy(fy, pafs, cap_pct):
    """National summary for one FY from its PAFs (same definitions as the historical summary CSV)."""
    reds = [(1 - p) * 100 for p in pafs]
    pen = [r for r in reds if r > 1e-9]
    avg = lambda xs: sum(xs) / len(xs) if xs else 0  # noqa: E731
    return {
        "fy": fy, "n": len(reds), "nPen": len(pen),
        "pctPen": round(100 * len(pen) / len(reds), 2) if reds else 0,
        "meanRed": round(avg(reds), 4),
        "meanRedPen": round(avg(pen), 4),
        "medianRedPen": round(statistics.median(pen), 4) if pen else 0,
        "nMax": sum(1 for r in reds if r >= cap_pct - 1e-6), "cap": cap_pct,
    }


def load_national(summary_path):
    """Comparable-population national series FY2013-FY2026 from the historical summary CSV."""
    rows = []
    with open(summary_path, newline="", encoding="utf-8") as f:
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
