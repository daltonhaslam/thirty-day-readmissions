"""Parsers for the CMS and Census source files.

Every reader goes through `_read_table`, which finds the header row by its first cell (not by
line number), pads and strips rows, and raises SchemaError when an expected column is missing,
so a CMS layout change cannot silently produce wrong numbers.
"""
import csv

# Condition key -> label used in CMS supplemental file headers (order = display order)
SUPP_LABELS = {"AMI": "ami", "COPD": "copd", "HF": "hf", "PN": "pneumonia", "CABG": "cabg", "THA_TKA": "tha/tka"}
CONDITIONS = tuple(SUPP_LABELS)
MISSING = {"", ".", "n/a", "na", "too few to report", "not available", "--"}


class SchemaError(Exception):
    pass


def num(s):
    """Parse a CMS-formatted number ('"1,110"', '0.04%', '"$4,519.68 "'); None when missing."""
    if s is None:
        return None
    t = str(s).strip().strip('"').strip()
    if t.lower() in MISSING:
        return None
    t = t.replace(",", "").replace("$", "").replace("%", "").strip()
    return float(t) if t else None


def _int(s):
    v = num(s)
    return None if v is None else int(round(v))


def _norm(h):
    return " ".join(str(h).replace("﻿", "").split()).lower()


def _rows(path, delimiter="\t", encoding="latin1"):
    with open(path, newline="", encoding=encoding) as f:
        return list(csv.reader(f, delimiter=delimiter))


def _read_table(path, anchor, columns, delimiter="\t", encoding="latin1"):
    """Records (dicts keyed by `columns` keys, stripped strings) from the table whose header row starts with `anchor`.

    `columns` maps output key -> header text (matched case/space-insensitively). A header text ending in
    '*' matches any header that ends with the rest (for year-stamped names like 'FY 2025 CBSA').
    """
    rows = _rows(path, delimiter, encoding)
    target = _norm(anchor)
    for i, row in enumerate(rows):
        if row and _norm(row[0]) == target:
            header = [_norm(h) for h in row]
            idx = {}
            for key, name in columns.items():
                n = _norm(name)
                hits = [j for j, h in enumerate(header) if (h.endswith(n[1:]) if n.startswith("*") else h == n)]
                if not hits:
                    raise SchemaError(f"{path}: expected column {name!r} not found")
                idx[key] = hits[0]
            width = len(row)
            out = []
            for r in rows[i + 1:]:
                if r and r[0].strip():
                    r = (r + [""] * width)[:width]
                    out.append({k: r[j].strip() for k, j in idx.items()})
            return out
    raise SchemaError(f"{path}: header row starting with {anchor!r} not found")


def _is_ccn(s):
    return len(s) == 6 and s[:2].isdigit()


def _index_by_ccn(path, records, build):
    out = {}
    for r in records:
        ccn = r["ccn"]
        if not _is_ccn(ccn):
            continue
        if ccn in out:
            raise SchemaError(f"{path}: duplicate CCN {ccn}")
        out[ccn] = build(r)
    return out


def read_supplemental(path):
    """HRRP supplemental file -> {ccn: {paf, dual, peer, nm, c: {COND: {n, err, med, flag, ratio}}}}."""
    fields = {"n": "Number of eligible discharges for {}", "err": "ERR for {}", "med": "Peer group median ERR for {}",
              "flag": "Penalty indicator for {}", "ratio": "DRG payment ratio for {}"}
    columns = {"ccn": "Hospital CCN", "paf": "Payment adjustment factor", "dual": "Dual proportion",
               "peer": "Peer group assignment", "nm": "Neutrality modifier"}
    columns.update({f"{k}.{f}": t.format(label) for k, label in SUPP_LABELS.items() for f, t in fields.items()})

    def build(r):
        return {
            "paf": num(r["paf"]), "dual": num(r["dual"]), "peer": _int(r["peer"]), "nm": num(r["nm"]),
            "c": {k: {"n": _int(r[f"{k}.n"]), "err": num(r[f"{k}.err"]), "med": num(r[f"{k}.med"]),
                      "flag": 1 if r[f"{k}.flag"].upper() == "Y" else 0, "ratio": num(r[f"{k}.ratio"])}
                  for k in CONDITIONS},
        }
    return _index_by_ccn(path, _read_table(path, "Hospital CCN", columns), build)


def read_table15(path, fy):
    """Table 15 (508 text version) -> {ccn: paf}."""
    columns = {"ccn": "Hospital CMS Certification Number (CCN)", "paf": f"FY {fy} Payment Adjustment Factor"}
    return _index_by_ccn(path, _read_table(path, columns["ccn"], columns), lambda r: num(r["paf"]))


def read_impact(path, fy, grouper):
    """IPPS impact file -> {ccn: {...}}: the fields the site and dollar model need.

    `grouper` is the MS-DRG grouper version for the FY (44 for FY2027); its transfer-adjusted case
    count and case-mix columns are CASETA<grouper> / TACMIV<grouper>.
    """
    columns = {"ccn": "Provider Number", "name": "Name", "cbsa_geo": "Geographic Labor Market Area",
               "fips": "FIPS County Code", "urgeo": "URGEO", "wi": f"FY {fy} Wage Index",
               "cola": "Cost of Living Adjustment", "irb": "Resident to Bed Ratio", "beds": "Beds",
               "cases": f"CASETA{grouper}", "cmi": f"TACMIV{grouper}", "qual_red": "Proxy Quality Reduction",
               "ehr_red": "Proxy EHR Reduction", "own": "Ownership Control Type", "ptype": "Provider Type"}

    def build(r):
        return {
            "name": r["name"], "cbsa_geo": r["cbsa_geo"], "fips": r["fips"].zfill(5) if r["fips"] else None,
            "urgeo": r["urgeo"], "wi": num(r["wi"]), "cola": num(r["cola"]) or 1.0, "irb": num(r["irb"]) or 0.0,
            "beds": _int(r["beds"]), "cases": num(r["cases"]), "cmi": num(r["cmi"]),
            "qual_red": num(r["qual_red"]) == 1, "ehr_red": num(r["ehr_red"]) == 1,
            "own": r["own"] or None, "ptype": _int(r["ptype"]),
        }
    return _index_by_ccn(path, _read_table(path, "Provider Number", columns), build)


def read_hgi(path):
    """CMS Provider Data Catalog Hospital General Information CSV -> {ccn: {...}}."""
    columns = {"ccn": "Facility ID", "name": "Facility Name", "city": "City/Town", "st": "State", "zip": "ZIP Code",
               "county": "County/Parish", "ownership": "Hospital Ownership", "star": "Hospital overall rating"}

    def build(r):
        return {"name": r["name"], "city": r["city"], "st": r["st"], "zip": r["zip"][:5].zfill(5),
                "county": r["county"], "ownership": r["ownership"],
                "star": int(r["star"]) if r["star"].isdigit() else None}
    return _index_by_ccn(path, _read_table(path, "Facility ID", columns, ",", "utf-8-sig"), build)


def read_zcta(path):
    """Census ZCTA gazetteer -> {zip5: (lat, lon)}."""
    recs = _read_table(path, "GEOID", {"zip": "GEOID", "lat": "INTPTLAT", "lon": "INTPTLONG"}, encoding="utf-8")
    return {r["zip"]: (float(r["lat"]), float(r["lon"])) for r in recs}


def read_cbsa_names(path):
    """County-to-CBSA crosswalk -> {cbsa code: CBSA name}."""
    recs = _read_table(path, "FIPS County Code", {"code": "*cbsa", "name": "*cbsa name"})
    return {r["code"]: r["name"].strip('"') for r in recs if r["code"] and r["name"]}


def read_rates(path):
    """IPPS Tables 1A/1B -> {'1A'|'1B': {'qe'|'qn'|'ne'|'nn': (labor, nonlabor)}}.

    q/n = hospital did / did NOT submit quality data; e/n = is / is NOT a meaningful EHR user.
    1A applies when wage index > 1 (66% labor share); 1B when <= 1 (62%).
    """
    out, current = {}, None
    for r in _rows(path):
        first = r[0].strip().strip('"').upper() if r else ""
        if first.startswith("TABLE"):
            current = "1A" if first.startswith("TABLE 1A") else "1B" if first.startswith("TABLE 1B") else None
        elif current and first.startswith("$") and current not in out:
            vals = [v for v in map(num, r) if v is not None][:8]
            if len(vals) != 8:
                raise SchemaError(f"{path}: Table {current} expected 8 rates, got {len(vals)}")
            out[current] = {k: (vals[2 * i], vals[2 * i + 1]) for i, k in enumerate(("qe", "qn", "ne", "nn"))}
    if set(out) != {"1A", "1B"}:
        raise SchemaError(f"{path}: Tables 1A/1B not both found")
    return out
