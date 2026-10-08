"""Join the raw CMS/Census files into the site's data contract: web/src/data/hrrp.json.

Usage: python3 -I pipeline/build_data.py
Hard-fails on schema drift, duplicate CCNs, or out-of-range PAFs; prints a coverage report.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from hrrp import geo, history, model, names, parse  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
CONTENT = Path(__file__).resolve().parent / "content"
HIST = Path(__file__).resolve().parent / "history"
OUT = ROOT / "web" / "src" / "data" / "hrrp.json"

FY = 2027
FILE_DATE = "2026-10-07"
PERF = ["2023-07-01", "2025-06-30"]

CONDITIONS = [
    {"key": "AMI", "short": "Heart attack", "label": "Acute myocardial infarction (AMI)", "color": "#c8452c"},
    {"key": "COPD", "short": "COPD", "label": "Chronic obstructive pulmonary disease (COPD)", "color": "#8e5a8a"},
    {"key": "HF", "short": "Heart failure", "label": "Heart failure (HF)", "color": "#1f6f8b"},
    {"key": "PN", "short": "Pneumonia", "label": "Pneumonia (PN)", "color": "#5b7f2a"},
    {"key": "CABG", "short": "Bypass surgery", "label": "Coronary artery bypass graft surgery (CABG)", "color": "#d39b1e"},
    {"key": "THA_TKA", "short": "Hip/knee replacement", "label": "Elective total hip or knee arthroplasty (THA/TKA)", "color": "#5aa5c9"},
]
OWN = {"G": "Government", "P": "For-profit", "V": "Nonprofit", "X": "Unknown"}
PTYPES = {7: ["RRC"], 8: ["IHS"], 14: ["MDH"], 15: ["MDH", "RRC"], 16: ["SCH"], 17: ["SCH", "RRC"], 21: ["EACH"], 22: ["EACH", "RRC"]}


def raw(name, *parts):
    return RAW.joinpath(name, *parts)


def teach_level(irb):
    if not irb:
        return "none"
    return "major" if irb >= 0.25 else "minor"


def ownership(g, imp):
    """Broad ownership class: Care Compare's current value first, cost-report code as fallback."""
    detail = (g or {}).get("ownership", "")
    for prefix, label in (("Government", "Government"), ("Voluntary", "Nonprofit"), ("Proprietary", "For-profit"),
                          ("Physician", "For-profit"), ("Tribal", "Government"), ("Veterans", "Government")):
        if detail.startswith(prefix):
            return label
    return OWN.get(imp["own"]) if imp and imp.get("own") else None


def r4(v):
    return None if v is None else round(v, 4)


def load_content(name):
    p = CONTENT / name
    return json.loads(p.read_text()) if p.exists() else []


def build():
    supp = parse.read_supplemental(raw("hrrp_supplemental_fy2027", "extracted", "FY2027_HRRP_Supplemental_File - FR FY 2027 Tab.txt"))
    t15 = parse.read_table15(raw("hrrp_table15_fy2027", "extracted", "Section 508 version of FY2027_HRRP_Table_15.txt"))
    impact = parse.read_impact(raw("ipps_impact_fy2027", "extracted", "FY 2027 IPPS Impact File - Correction Notice.txt"))
    hgi = parse.read_hgi(raw("hospital_general_info", "Hospital_General_Information.csv"))
    zcta = parse.read_zcta(raw("zcta_gazetteer_2024", "extracted", "2024_Gaz_zcta_national.txt"))
    cbsa_names, _ = parse.read_cbsa_names(raw("county_cbsa_fy2027", "extracted", "FY 2027 FR County to CBSA Crosswalk.txt"))
    rates = parse.read_rates(raw("ipps_tables_1a_1e_fy2027", "extracted", "CMS-1849-CN Tables 1A - 1E.txt"))
    county_xy = geo.county_centroids(raw("us_atlas_counties", "counties-10m.json"))

    t15_mismatch = [c for c in supp if t15.get(c) != supp[c]["paf"]]
    if t15_mismatch:
        raise SystemExit(f"Table 15 disagrees with supplemental PAF for {len(t15_mismatch)} hospitals: {t15_mismatch[:10]}")

    hospitals, mismatches, geocode = [], [], {"zip": 0, "county": 0, "none": 0}
    for ccn in sorted(supp):
        s, imp, g = supp[ccn], impact.get(ccn), hgi.get(ccn)
        if not 0.97 <= s["paf"] <= 1.0:
            raise SystemExit(f"{ccn}: PAF {s['paf']} out of range")
        if not model.replicates(s):
            mismatches.append(ccn)
        fips = imp["fips"] if imp else None
        st = (g or {}).get("st") or geo.STATE_FIPS.get((fips or "")[:2])
        region, division = geo.region_of(st)
        lat = lon = gsrc = None
        if g and g["zip"] in zcta:
            (lat, lon), gsrc = zcta[g["zip"]], "zip"
        elif fips and fips in county_xy:
            (lat, lon), gsrc = county_xy[fips], "county"
        geocode[gsrc or "none"] += 1
        cbsa = imp["cbsa_geo"] if imp and len(imp["cbsa_geo"]) == 5 else None
        base = model.est_base_payment(imp, rates)
        pen = model.est_penalty(base, s["paf"])
        hospitals.append({
            "id": ccn,
            "name": names.display_name(g["name"] if g else None, imp["name"] if imp else None) or ccn,
            "city": names.smart_title(g["city"]) if g else None,
            "st": st,
            "county": names.smart_title(g["county"]) if g and g["county"] else None,
            "zip": g["zip"] if g else None,
            "lat": r4(lat), "lon": r4(lon), "geo": gsrc,
            "cbsa": cbsa, "cbsaName": cbsa_names.get(cbsa) if cbsa else None,
            "urban": (imp["urgeo"] in ("LURBAN", "OURBAN")) if imp else None,
            "region": region, "division": division,
            "beds": imp["beds"] if imp and imp["beds"] else None,
            "teach": teach_level(imp["irb"]) if imp else None,
            "own": ownership(g, imp),
            "ownDetail": g["ownership"] if g else None,
            "star": g["star"] if g else None,
            "types": PTYPES.get(imp["ptype"], []) if imp else [],
            "paf": s["paf"], "red": round((1 - s["paf"]) * 100, 2), "dual": s["dual"], "peer": s["peer"],
            "base": round(base) if base is not None else None,
            "pen": round(pen) if pen is not None else None,
            "c": {k: {f: s["c"][k][f] for f in ("n", "err", "flag", "ratio")}
                  for k in parse.CONDITIONS if not (s["c"][k]["n"] is None and s["c"][k]["err"] is None)},
        })

    peer_cut, peer_med = [], {}
    for p in range(1, 6):
        grp = [x for x in hospitals if x["peer"] == p]
        duals = [x["dual"] for x in grp]
        peer_cut.append([min(duals), max(duals)])
        peer_med[str(p)] = {k: supp[grp[0]["id"]]["c"][k]["med"] for k in parse.CONDITIONS}
        for x in grp:
            for k in parse.CONDITIONS:
                if supp[x["id"]]["c"][k]["med"] != peer_med[str(p)][k]:
                    raise SystemExit(f"{x['id']}: peer-group {p} median for {k} differs within the group")

    ids = {x["id"] for x in hospitals}
    years, paf_hist = history.load_paf_history(HIST / "hrrp_paf_history_fy2013_2026.csv", ids)
    national = history.load_national(HIST / "hrrp_history_summary.csv")
    national.append({**history.summarize_fy(FY, [x["paf"] for x in hospitals]), "perf": PERF})
    totals = {t["fy"]: t for t in load_content("annual_totals.json")}
    for row in national:
        t = totals.get(row["fy"], {})
        row["totalEst"] = t.get("totalEst")
        row["totalSrc"] = t.get("src")

    model_base = sum(x["base"] for x in hospitals if x["base"] is not None)
    model_pen = sum(x["pen"] for x in hospitals if x["pen"] is not None)
    sources = [{"name": s["note"], "url": s["url"]} for s in json.loads((Path(__file__).resolve().parent / "sources.json").read_text())]
    states = {st: geo.STATE_NAMES[st] for st in sorted({x["st"] for x in hospitals if x["st"]})}
    divisions = [{"name": d, "region": r, "states": [s for s in sts if s in states]} for d, (r, sts) in geo.DIVISIONS.items()]

    data = {
        "meta": {
            "fy": FY, "fileDate": FILE_DATE, "perf": PERF, "nm": hospitals[0] and supp[hospitals[0]["id"]]["nm"],
            "peerCutoffs": peer_cut, "peerMedians": peer_med, "rates": rates,
            "totals": {"modelBase": model_base, "modelPen": model_pen,
                       "cmsEst": totals.get(FY, {}).get("totalEst"), "cmsSrc": totals.get(FY, {}).get("src")},
            "replication": {"matched": len(hospitals) - len(mismatches), "total": len(hospitals), "mismatches": mismatches},
            "geocode": geocode, "states": states, "divisions": divisions, "sources": sources,
        },
        "conditions": CONDITIONS,
        "hospitals": hospitals,
        "history": {"years": years, "paf": paf_hist, "national": national},
        "timeline": load_content("timeline.json"),
        "research": load_content("research.json"),
        "geo": {"states": json.loads(raw("us_atlas_states", "states-10m.json").read_text())},
    }
    return data


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
