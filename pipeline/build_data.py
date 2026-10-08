"""Join the raw CMS/Census files into the site's data contract: web/src/data/hrrp.json.

Usage: python3 -I pipeline/build_data.py
Hard-fails on schema drift, duplicate CCNs, out-of-range PAFs, or a Table 15 disagreement;
prints a coverage report.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch import PIPELINE, RAW_DIR, ROOT, SOURCES  # noqa: E402
from hrrp import geo, history, model, names, parse  # noqa: E402

OUT = ROOT / "web" / "src" / "data" / "hrrp.json"
CONTENT = PIPELINE / "content"
HIST = PIPELINE / "history"

# Everything that changes when the next fiscal year's files arrive
FY = 2027
GROUPER = 44  # MS-DRG grouper version used in the FY2027 impact file
FILE_DATE = "2026-10-07"
PERF = ["2023-07-01", "2025-06-30"]
FILES = {
    "supp": ("hrrp_supplemental_fy2027", "extracted/FY2027_HRRP_Supplemental_File - FR FY 2027 Tab.txt"),
    "t15": ("hrrp_table15_fy2027", "extracted/Section 508 version of FY2027_HRRP_Table_15.txt"),
    "impact": ("ipps_impact_fy2027", "extracted/FY 2027 IPPS Impact File - Correction Notice.txt"),
    "rates": ("ipps_tables_1a_1e_fy2027", "extracted/CMS-1849-CN Tables 1A - 1E.txt"),
    "cbsa": ("county_cbsa_fy2027", "extracted/FY 2027 FR County to CBSA Crosswalk.txt"),
    "hgi": ("hospital_general_info", "Hospital_General_Information.csv"),
    "zcta": ("zcta_gazetteer_2024", "extracted/2024_Gaz_zcta_national.txt"),
    "counties": ("us_atlas_counties", "counties-10m.json"),
    "states": ("us_atlas_states", "states-10m.json"),
}

CONDITION_INFO = {
    "AMI": ("Heart attack", "Acute myocardial infarction (AMI)"),
    "COPD": ("COPD", "Chronic obstructive pulmonary disease (COPD)"),
    "HF": ("Heart failure", "Heart failure (HF)"),
    "PN": ("Pneumonia", "Pneumonia (PN)"),
    "CABG": ("Bypass surgery", "Coronary artery bypass graft surgery (CABG)"),
    "THA_TKA": ("Hip/knee replacement", "Elective total hip or knee arthroplasty (THA/TKA)"),
}
assert tuple(CONDITION_INFO) == parse.CONDITIONS
OWN = {"G": "Government", "P": "For-profit", "V": "Nonprofit", "X": "Unknown"}
OWN_PREFIX = (("Government", "Government"), ("Voluntary", "Nonprofit"), ("Proprietary", "For-profit"),
              ("Physician", "For-profit"), ("Tribal", "Government"), ("Veterans", "Government"))
PTYPES = {7: ["RRC"], 8: ["IHS"], 14: ["MDH"], 15: ["MDH", "RRC"], 16: ["SCH"], 17: ["SCH", "RRC"], 21: ["EACH"],
          22: ["EACH", "RRC"]}


def path(key):
    folder, rel = FILES[key]
    return RAW_DIR / folder / rel


def teach_level(irb):
    if not irb:
        return "none"
    return "major" if irb >= 0.25 else "minor"


def ownership(detail, own_code):
    """Broad ownership class: Care Compare's current value first, cost-report code as fallback."""
    for prefix, label in OWN_PREFIX:
        if (detail or "").startswith(prefix):
            return label
    return OWN.get(own_code)


def r4(v):
    return None if v is None else round(v, 4)


def group_constant(rows, value, label):
    """The single value `value(row)` shared by every row; SystemExit if rows disagree."""
    vals = {value(r) for r in rows}
    if len(vals) != 1:
        raise SystemExit(f"{label} is not constant: {sorted(vals, key=str)[:5]}")
    return vals.pop()


def load_content(name):
    p = CONTENT / name
    return json.loads(p.read_text()) if p.exists() else []


def hospital_record(ccn, s, imp, g, zcta, county_xy, cbsa_names, rates):
    fips = imp.get("fips")
    st = g.get("st") or geo.STATE_FIPS.get((fips or "")[:2])
    region, division = geo.region_of(st)
    lat = lon = gsrc = None
    if g.get("zip") in zcta:
        (lat, lon), gsrc = zcta[g["zip"]], "zip"
    elif fips in county_xy:
        (lat, lon), gsrc = county_xy[fips], "county"
    cbsa = imp.get("cbsa_geo") if len(imp.get("cbsa_geo") or "") == 5 else None
    base = model.est_base_payment(imp, rates)
    pen = model.est_penalty(base, s["paf"])
    return {
        "id": ccn,
        "name": names.display_name(g.get("name"), imp.get("name")) or ccn,
        "city": names.smart_title(g.get("city")) or None,
        "st": st,
        "county": names.smart_title(g.get("county")) or None,
        "zip": g.get("zip"),
        "lat": r4(lat), "lon": r4(lon), "geo": gsrc,
        "cbsa": cbsa, "cbsaName": cbsa_names.get(cbsa),
        "urban": imp["urgeo"] in ("LURBAN", "OURBAN") if imp else None,
        "region": region, "division": division,
        "beds": imp.get("beds") or None,
        "teach": teach_level(imp["irb"]) if imp else None,
        "own": ownership(g.get("ownership"), imp.get("own")),
        "ownDetail": g.get("ownership"),
        "star": g.get("star"),
        "types": PTYPES.get(imp.get("ptype"), []),
        "paf": s["paf"], "red": round((1 - s["paf"]) * 100, 2), "dual": s["dual"], "peer": s["peer"],
        "base": round(base) if base is not None else None,
        "pen": round(pen) if pen is not None else None,
        "c": {k: {f: c[f] for f in ("n", "err", "flag", "ratio")}
              for k, c in s["c"].items() if not (c["n"] is None and c["err"] is None)},
    }


def build():
    supp = parse.read_supplemental(path("supp"))
    t15 = parse.read_table15(path("t15"), FY)
    impact = parse.read_impact(path("impact"), FY, GROUPER)
    hgi = parse.read_hgi(path("hgi"))
    zcta = parse.read_zcta(path("zcta"))
    cbsa_names = parse.read_cbsa_names(path("cbsa"))
    rates = parse.read_rates(path("rates"))
    county_xy = geo.county_centroids(path("counties"))

    t15_mismatch = [c for c in supp if t15.get(c) != supp[c]["paf"]]
    if t15_mismatch:
        raise SystemExit(f"Table 15 disagrees with supplemental PAF for {len(t15_mismatch)} hospitals: {t15_mismatch[:10]}")
    out_of_range = [c for c, s in supp.items() if not 1 - model.CAP <= s["paf"] <= 1.0]
    if out_of_range:
        raise SystemExit(f"PAF out of range for {out_of_range[:10]}")

    nm = group_constant(supp.values(), lambda s: s["nm"], "neutrality modifier")
    peer_cut, peer_med = [], {}
    for p in range(1, 6):
        grp = [s for s in supp.values() if s["peer"] == p]
        peer_cut.append([min(s["dual"] for s in grp), max(s["dual"] for s in grp)])
        peer_med[str(p)] = {k: group_constant(grp, lambda s, k=k: s["c"][k]["med"], f"peer {p} {k} median")
                            for k in parse.CONDITIONS}

    hospitals = [hospital_record(ccn, supp[ccn], impact.get(ccn) or {}, hgi.get(ccn) or {}, zcta, county_xy,
                                 cbsa_names, rates) for ccn in sorted(supp)]
    mismatches = [c for c in sorted(supp) if not model.replicates(supp[c])]
    geocode = {k: sum(1 for x in hospitals if x["geo"] == (None if k == "none" else k)) for k in ("zip", "county", "none")}

    years, paf_hist = history.load_paf_history(HIST / "hrrp_paf_history_fy2013_2026.csv", set(supp))
    national = history.load_national(HIST / "hrrp_history_summary.csv")
    national.append({**history.summarize_fy(FY, [s["paf"] for s in supp.values()], round(model.CAP * 100)),
                     "perf": PERF})
    totals = {t["fy"]: t for t in load_content("annual_totals.json")}
    for row in national:
        row["totalEst"] = totals.get(row["fy"], {}).get("totalEst")
        row["totalSrc"] = totals.get(row["fy"], {}).get("src")

    states = {st: geo.STATE_NAMES[st] for st in sorted({x["st"] for x in hospitals if x["st"]})}
    return {
        "meta": {
            "fy": FY, "fileDate": FILE_DATE, "perf": PERF, "nm": nm,
            "peerCutoffs": peer_cut, "peerMedians": peer_med, "rates": rates,
            "totals": {"modelBase": sum(x["base"] or 0 for x in hospitals),
                       "modelPen": sum(x["pen"] or 0 for x in hospitals),
                       "cmsEst": national[-1]["totalEst"], "cmsSrc": national[-1]["totalSrc"]},
            "replication": {"matched": len(supp) - len(mismatches), "total": len(supp), "mismatches": mismatches},
            "geocode": geocode, "states": states,
            "divisions": [{"name": d, "region": r, "states": [s for s in sts if s in states]}
                          for d, (r, sts) in geo.DIVISIONS.items()],
            "sources": [{"name": s["note"], "url": s["url"]} for s in json.loads(SOURCES.read_text())],
        },
        "conditions": [{"key": k, "short": short, "label": label} for k, (short, label) in CONDITION_INFO.items()],
        "hospitals": hospitals,
        "history": {"years": years, "paf": paf_hist, "national": national},
        "timeline": load_content("timeline.json"),
        "research": load_content("research.json"),
        "geo": {"states": json.loads(path("states").read_text())},
    }


def main():
    data = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False))
    m, h = data["meta"], data["hospitals"]
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1e6:.2f} MB)")
    print(f"hospitals {len(h)} | penalized {sum(1 for x in h if x['paf'] < 1)} | replication {m['replication']['matched']}/{m['replication']['total']}")
    print(f"geocode {m['geocode']} | no state {sum(1 for x in h if not x['st'])} | no impact match {sum(1 for x in h if x['base'] is None)}")
    print(f"history hospitals {len(data['history']['paf'])} | modeled penalty ${m['totals']['modelPen'] / 1e6:.1f}M on base ${m['totals']['modelBase'] / 1e9:.2f}B")


if __name__ == "__main__":
    main()
