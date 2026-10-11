"""Join the raw CMS/Census files into the site's data contract: web/src/data/hrrp.json.

Usage: python3 -I pipeline/build_data.py
Hard-fails on schema drift, duplicate CCNs, out-of-range PAFs, a Table 15 disagreement, an Excel workbook
value that does not round to the tab-delimited file's, or stored values that no longer reproduce every PAF;
prints a coverage report.
"""
import json
import sys
from collections import namedtuple
from decimal import ROUND_HALF_UP, Decimal
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
# Per-hospital history covers FY2013 through the prior year. When FY advances, append the prior year's
# PAFs (fy, ccn, paf, scope_flag) to HIST_FILE and its national row to HIST_SUMMARY before rebuilding.
HIST_FIRST_FY, HIST_LAST_FY = 2013, FY - 1
HIST_FILE = HIST / "hrrp_paf_history_fy2013_2026.csv"
HIST_SUMMARY = HIST / "hrrp_history_summary.csv"
FILES = {
    "supp_xlsx": ("hrrp_supplemental_fy2027", "extracted/FY2027_HRRP_Supplemental_File.xlsx"),
    "supp": ("hrrp_supplemental_fy2027", "extracted/FY2027_HRRP_Supplemental_File - FR FY 2027 Tab.txt"),
    "t15": ("hrrp_table15_fy2027", "extracted/Section 508 version of FY2027_HRRP_Table_15.txt"),
    "impact": ("ipps_impact_fy2027", "extracted/FY 2027 IPPS Impact File - Correction Notice.txt"),
    "rates": ("ipps_tables_1a_1e_fy2027", "extracted/CMS-1849-CN Tables 1A - 1E.txt"),
    "cbsa": ("county_cbsa_fy2027", "extracted/FY 2027 FR County to CBSA Crosswalk.txt"),
    "hgi": ("hospital_general_info", "Hospital_General_Information.csv"),
    "pos": ("pos_hospital_q2_2026", "Hospital_and_other.DATA.Q2_2026.csv"),
    "zcta": ("zcta_gazetteer_2024", "extracted/2024_Gaz_zcta_national.txt"),
    "counties": ("us_atlas_counties", "counties-10m.json"),
    "states": ("us_atlas_states", "states-10m.json"),
}
SUPP_SHEET = "FR FY 2027"  # the workbook sheet that "supp" is the tab-delimited export of
# ERRs, DRG ratios, peer medians, and the neutrality modifier are written with this many decimals: the fewest that
# still reproduce every FY2027 PAF from the JSON (5 leaves 7 hospitals 0.0001 off). The build fails if it stops sufficing.
DECIMALS = 6

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


def rd(v):
    return None if v is None else round(v, DECIMALS)


def cms_round(v, places=4):
    """Round half up, as CMS's published 4-decimal values are (Python's round() would give 0.15625 -> 0.1562)."""
    return None if v is None else float(Decimal(repr(v)).quantize(Decimal(1).scaleb(-places), ROUND_HALF_UP))


def _values(s):
    """(field, value) pairs of one supplemental-file record, conditions flattened as 'HF.err'."""
    yield from ((f, s[f]) for f in ("paf", "dual", "peer", "nm"))
    yield from ((f"{k}.{f}", v) for k, c in s["c"].items() for f, v in c.items())


def precision_mismatches(full, published):
    """(ccn, field) where a full-precision workbook value, rounded as CMS rounds, differs from the 4-decimal export."""
    if set(full) != set(published):
        return sorted((c, "missing") for c in set(full) ^ set(published))
    return [(c, f) for c in sorted(full) for (f, a), (_, b) in zip(_values(full[c]), _values(published[c]))
            if cms_round(a) != b]


def as_stored(s):
    """A supplemental record with its formula inputs rounded as hrrp.json stores them."""
    return {**s, "nm": rd(s["nm"]),
            "c": {k: {**c, "err": rd(c["err"]), "med": rd(c["med"]), "ratio": rd(c["ratio"])} for k, c in s["c"].items()}}


def beds(cr, pos):
    """(beds, source): the Provider of Services certified bed count ('pos') for every hospital that has one, else
    the impact file's cost-report beds ('cr'); (None, None) when neither is present or above zero."""
    if pos:
        return pos, "pos"
    return (cr, "cr") if cr else (None, None)


def inactive(p):
    """{date, code, reason} when the Provider of Services file shows the hospital's Medicare participation ended."""
    reason = parse.POS_TERMINATION.get(p.get("term"))
    return {"date": p["termDate"], "code": p["term"], "reason": reason} if reason else None


def bed_band(b):
    """The site's bed-size bands (web/src/js/model.js BED_BANDS)."""
    return None if b is None else "<100" if b < 100 else "100-299" if b < 300 else "300-499" if b < 500 else "500+"


def report_pos(hospitals, impact):
    """Print where bed counts came from, how many hospitals changed bed band, and the hospitals POS shows inactive."""
    src = {k: sum(1 for x in hospitals if x["bedsSrc"] == k) for k in ("pos", "cr", None)}
    cr = {x["id"]: (impact.get(x["id"]) or {}).get("beds") or None for x in hospitals}
    moved = sum(1 for x in hospitals if bed_band(x["beds"]) != bed_band(cr[x["id"]]))
    print(f"beds: certified (POS) {src['pos']}, cost report {src['cr']}, none {src[None]}; "
          f"{moved} hospitals in a different bed band than with cost-report beds")
    print("  e.g. " + "; ".join(f"{x['id']} {cr[x['id']]}->{x['beds']}" for x in hospitals
                                if x["id"] in ("360375", "490148", "670331", "670340", "220052", "240010", "050030")))
    off = [x for x in hospitals if x["inactive"]]
    print(f"inactive in POS ({len(off)}, still ranked and totaled): " + "; ".join(
        f"{x['id']} {x['name']} {x['inactive']['code']} {x['inactive']['date']}" for x in off))


def group_constant(rows, value, label):
    """The single value `value(row)` shared by every row; SystemExit if rows disagree."""
    vals = {value(r) for r in rows}
    if len(vals) != 1:
        raise SystemExit(f"{label} is not constant: {sorted(vals, key=str)[:5]}")
    return vals.pop()


def load_content(name):
    p = CONTENT / name
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else []


STRAY_KM = 40  # a ZIP/county point farther than this outside the impact-file county is replaced by that county's centroid


def locate(g, imp, st, zcta, counties):
    """(lat, lon, source, county label or None): ZIP centroid, else Care Compare county, else impact-file county.

    A ZIP or Care Compare county point more than STRAY_KM outside the impact-file county falls back to that
    county's centroid, and its atlas name is returned as the label. Counties absent from the atlas are not checked.
    """
    fips = imp.get("fips")
    key = geo.county_key(st, g.get("county"))
    if g.get("zip") in zcta:
        pt, src = zcta[g["zip"]], "zip"
    elif key in counties.by_name:
        pt, src = counties.by_name[key], "county"
    else:
        pt, src = None, None
    if pt and fips in counties.shape and geo.km_outside(*pt, counties.shape[fips]) > STRAY_KM:
        return (*counties.centroid[fips], "county", counties.name[fips])
    if pt:
        return (*pt, src, None)
    if fips in counties.centroid:
        return (*counties.centroid[fips], "county", None)
    return None, None, None, None


# Lookups shared by every hospital record; `moved` collects map points pulled back into their county
Ref = namedtuple("Ref", "zcta counties cbsa_names rates moved")


def hospital_record(ccn, s, imp, g, p, ref):
    """One hospital's data-contract record from its supplemental (s), impact (imp), Care Compare (g), and Provider
    of Services (p) rows."""
    fips = imp.get("fips")
    st = g.get("st") or geo.STATE_FIPS.get((fips or "")[:2])
    region, division = geo.region_of(st)
    lat, lon, gsrc, fips_county = locate(g, imp, st, ref.zcta, ref.counties)
    if fips_county:
        ref.moved.append(f"{ccn} {g.get('county')} -> {fips_county}")
    cbsa = imp.get("cbsa_geo") if len(imp.get("cbsa_geo") or "") == 5 else None
    nbeds, beds_src = beds(imp.get("beds"), p.get("beds"))
    base = model.est_base_payment(imp, ref.rates)
    pen = model.est_penalty(base, s["paf"])
    return {
        "id": ccn,
        "name": names.display_name(g.get("name"), imp.get("name")) or f"Hospital {ccn} (name not in CMS files)",
        "city": names.smart_title(g.get("city")) or None,
        "st": st,
        "county": fips_county or names.smart_title(g.get("county")) or None,
        "zip": g.get("zip"),
        "lat": r4(lat), "lon": r4(lon), "geo": gsrc,
        "cbsa": cbsa, "cbsaName": ref.cbsa_names.get(cbsa),
        "urban": imp["urgeo"] in ("LURBAN", "OURBAN") if imp else None,
        "region": region, "division": division,
        "beds": nbeds, "bedsSrc": beds_src,
        "teach": teach_level(imp["irb"]) if imp else None,
        "own": ownership(g.get("ownership"), imp.get("own")),
        "ownDetail": g.get("ownership"),
        "star": g.get("star"),
        "types": sorted(set(PTYPES.get(imp.get("ptype"), [])) | ({"MDH"} if imp.get("mdh") else set())),
        "inactive": inactive(p),
        "paf": s["paf"], "red": round((1 - s["paf"]) * 100, 2), "dual": cms_round(s["dual"]), "peer": s["peer"],
        "base": round(base) if base is not None else None,
        "pen": round(pen) if pen is not None else None,
        "c": {k: {"n": c["n"], "err": rd(c["err"]), "flag": c["flag"], "ratio": rd(c["ratio"])}
              for k, c in s["c"].items() if not (c["n"] is None and c["err"] is None)},
    }


def build():
    supp = parse.read_supplemental(path("supp_xlsx"), SUPP_SHEET)
    t15 = parse.read_table15(path("t15"), FY)
    impact = parse.read_impact(path("impact"), FY, GROUPER)
    hgi = parse.read_hgi(path("hgi"))
    pos = parse.read_pos(path("pos"))
    zcta = parse.read_zcta(path("zcta"))
    cbsa_names = parse.read_cbsa_names(path("cbsa"))
    rates = parse.read_rates(path("rates"))
    counties = geo.read_counties(path("counties"))

    t15_mismatch = sorted(set(t15) ^ set(supp)) + [c for c in supp if c in t15 and t15[c] != supp[c]["paf"]]
    if t15_mismatch:
        raise SystemExit(f"Table 15 and the supplemental file disagree for {len(t15_mismatch)} hospitals: {t15_mismatch[:10]}")
    out_of_range = [c for c, s in supp.items() if not 1 - model.CAP <= s["paf"] <= 1.0]
    if out_of_range:
        raise SystemExit(f"PAF out of range for {out_of_range[:10]}")
    drift = precision_mismatches(supp, parse.read_supplemental(path("supp")))
    if drift:
        raise SystemExit(f"Excel workbook and tab-delimited file disagree on {len(drift)} values: {drift[:10]}")
    short = [c for c, s in supp.items() if model.replication_status(as_stored(s)) != "exact"]
    if short:
        raise SystemExit(f"{DECIMALS} decimals do not reproduce the PAF of {len(short)} hospitals {short[:10]}: raise DECIMALS")

    nm = group_constant(supp.values(), lambda s: s["nm"], "neutrality modifier")
    peer_cut, peer_med = [], {}
    for p in range(1, 6):
        grp = [s for s in supp.values() if s["peer"] == p]
        peer_cut.append([cms_round(min(s["dual"] for s in grp)), cms_round(max(s["dual"] for s in grp))])
        peer_med[str(p)] = {k: rd(group_constant(grp, lambda s, k=k: s["c"][k]["med"], f"peer {p} {k} median"))
                            for k in parse.CONDITIONS}

    ref = Ref(zcta, counties, cbsa_names, rates, [])
    hospitals = [hospital_record(ccn, supp[ccn], impact.get(ccn) or {}, hgi.get(ccn) or {}, pos.get(ccn) or {}, ref)
                 for ccn in sorted(supp)]
    if ref.moved:
        print(f"moved to impact-file county centroid (point > {STRAY_KM} km outside it): {'; '.join(ref.moved)}")
    report_pos(hospitals, impact)
    unchecked = sum(1 for c in supp if (impact.get(c) or {}).get("fips") not in (None, *counties.shape))
    if unchecked:
        print(f"{unchecked} hospitals have an impact-file county missing from the atlas (e.g. CT planning regions); "
              "their map points are not checked")
    status = {c: model.replication_status(supp[c]) for c in sorted(supp)}
    geocode = {k: sum(1 for x in hospitals if x["geo"] == (None if k == "none" else k)) for k in ("zip", "county", "none")}

    years, paf_hist = history.load_paf_history(HIST_FILE, set(supp), HIST_FIRST_FY, HIST_LAST_FY)
    national = history.load_national(HIST_SUMMARY)
    national.append({**history.summarize_fy(FY, [s["paf"] for s in supp.values()], round(model.CAP * 100)),
                     "perf": PERF})
    totals = {t["fy"]: t for t in load_content("annual_totals.json")}
    for row in national:
        row["totalEst"] = totals.get(row["fy"], {}).get("totalEst")
        row["totalSrc"] = totals.get(row["fy"], {}).get("src")

    states = {st: geo.STATE_NAMES[st] for st in sorted({x["st"] for x in hospitals if x["st"]})}
    whats_new = load_content("whats_new.json") or {}
    return {
        "meta": {
            "fy": FY, "fileDate": FILE_DATE, "perf": PERF, "nm": rd(nm),
            "peerCutoffs": peer_cut, "peerMedians": peer_med, "rates": rates,
            "totals": {"modelBase": sum(x["base"] or 0 for x in hospitals),
                       "modelPen": sum(x["pen"] or 0 for x in hospitals),
                       "cmsEst": national[-1]["totalEst"], "cmsSrc": national[-1]["totalSrc"]},
            "replication": {"exact": sum(1 for v in status.values() if v == "exact"),
                            "rounding": sum(1 for v in status.values() if v == "rounding"), "total": len(supp),
                            "mismatches": [c for c, v in status.items() if v == "mismatch"]},
            "geocode": geocode, "states": states,
            "whatsNew": whats_new.get("items", []) if whats_new.get("fy") == FY else [],
            "divisions": [{"name": d, "region": r, "states": [s for s in sts if s in states]}
                          for d, (r, sts) in geo.DIVISIONS.items()],
            "sources": [{"name": s["note"], "url": s["url"]} for s in json.loads(SOURCES.read_text(encoding="utf-8"))],
        },
        "conditions": [{"key": k, "short": short, "label": label} for k, (short, label) in CONDITION_INFO.items()],
        "hospitals": hospitals,
        "history": {"years": years, "paf": paf_hist, "national": national},
        "timeline": load_content("timeline.json"),
        "research": load_content("research.json"),
        "geo": {"states": json.loads(path("states").read_text(encoding="utf-8"))},
    }


def main():
    data = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    m, h = data["meta"], data["hospitals"]
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1e6:.2f} MB)")
    rep = m["replication"]
    print(f"hospitals {len(h)} | penalized {sum(1 for x in h if x['paf'] < 1)} | PAF replication: {rep['exact']} exact, {rep['rounding']} within rounding, {len(rep['mismatches'])} mismatched")
    print(f"geocode {m['geocode']} | no state {sum(1 for x in h if not x['st'])} | no impact match {sum(1 for x in h if x['base'] is None)}"
          f" | no name {sum(1 for x in h if x['name'].endswith('(name not in CMS files)'))}")
    print(f"history hospitals {len(data['history']['paf'])} | modeled penalty ${m['totals']['modelPen'] / 1e6:.1f}M on base ${m['totals']['modelBase'] / 1e9:.2f}B")


if __name__ == "__main__":
    main()
