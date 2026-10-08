"""Parsers for the CMS and Census source files.

Every reader locates its header row by content (not line number) and fails loudly with
SchemaError when an expected column is missing, so a CMS layout change cannot silently
produce wrong numbers.
"""
import csv

CONDITIONS = ("AMI", "COPD", "HF", "PN", "CABG", "THA_TKA")
# Condition key -> label used in the CMS supplemental file headers
SUPP_LABELS = {"AMI": "ami", "COPD": "copd", "HF": "hf", "PN": "pneumonia", "CABG": "cabg", "THA_TKA": "tha/tka"}
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


def _read_table(path, first_header_cell, delimiter="\t", encoding="latin1"):
    """Return (header->index map, data rows) for a delimited file whose header starts with first_header_cell."""
    with open(path, newline="", encoding=encoding) as f:
        rows = list(csv.reader(f, delimiter=delimiter))
    target = _norm(first_header_cell)
    for i, row in enumerate(rows):
        if row and _norm(row[0]) == target:
            header = {_norm(h): j for j, h in enumerate(row) if _norm(h)}
            return header, [r for r in rows[i + 1:] if r and r[0].strip()]
    raise SchemaError(f"{path}: header row starting with {first_header_cell!r} not found")


def _col(header, name, path):
    key = _norm(name)
    if key not in header:
        raise SchemaError(f"{path}: expected column {name!r} not found")
    return header[key]


def read_supplemental(path):
    """FY2027-format HRRP supplemental file -> {ccn: {paf, red, dual, peer, nm, c: {COND: {n, err, med, flag, ratio}}}}."""
    header, rows = _read_table(path, "Hospital CCN")
    col = lambda name: _col(header, name, path)  # noqa: E731
    base = {k: col(v) for k, v in {
        "paf": "Payment adjustment factor", "red": "Payment reduction percentage",
        "dual": "Dual proportion", "peer": "Peer group assignment", "nm": "Neutrality modifier"}.items()}
    cond_cols = {}
    for key, label in SUPP_LABELS.items():
        cond_cols[key] = {
            "n": col(f"Number of eligible discharges for {label}"),
            "err": col(f"ERR for {label}"),
            "med": col(f"Peer group median ERR for {label}"),
            "flag": col(f"Penalty indicator for {label}"),
            "ratio": col(f"DRG payment ratio for {label}"),
        }
    out = {}
    for r in rows:
        ccn = r[0].strip()
        if not ccn.isdigit() and not ccn[:2].isdigit():
            continue
        rec = {k: num(r[i]) for k, i in base.items()}
        rec["peer"] = _int(r[base["peer"]])
        rec["c"] = {}
        for key, cc in cond_cols.items():
            rec["c"][key] = {
                "n": _int(r[cc["n"]]),
                "err": num(r[cc["err"]]),
                "med": num(r[cc["med"]]),
                "flag": 1 if r[cc["flag"]].strip().upper() == "Y" else 0,
                "ratio": num(r[cc["ratio"]]),
            }
        if ccn in out:
            raise SchemaError(f"{path}: duplicate CCN {ccn}")
        out[ccn] = rec
    return out


def read_table15(path):
    """Table 15 (508 text version) -> {ccn: paf}."""
    header, rows = _read_table(path, "Hospital CMS Certification Number (CCN)")
    pcol = _col(header, "FY 2027 Payment Adjustment Factor", path)
    return {r[0].strip(): num(r[pcol]) for r in rows if r[0].strip().isdigit() and len(r) > pcol}


def read_impact(path):
    """IPPS impact file -> {ccn: {...}} with the fields the site and dollar model need."""
    header, rows = _read_table(path, "Provider Number")
    c = {k: _col(header, v, path) for k, v in {
        "name": "Name", "cbsa_geo": "Geographic Labor Market Area", "fips": "FIPS County Code",
        "region_code": "Region", "urgeo": "URGEO", "wi": "FY 2027 Wage Index",
        "cola": "Cost of Living Adjustment", "irb": "Resident to Bed Ratio", "beds": "Beds",
        "cases": "CASETA44", "cmi": "TACMIV44", "qual_red": "Proxy Quality Reduction",
        "ehr_red": "Proxy EHR Reduction", "own": "Ownership Control Type", "ptype": "Provider Type",
        "dshpct": "DSHPCT"}.items()}
    out = {}
    for r in rows:
        ccn = r[0].strip()
        if not ccn[:2].isdigit():
            continue
        g = lambda k: r[c[k]] if c[k] < len(r) else ""  # noqa: E731
        out[ccn] = {
            "name": g("name").strip(),
            "cbsa_geo": g("cbsa_geo").strip(),
            "fips": g("fips").strip().zfill(5) if g("fips").strip() else None,
            "region_code": _int(g("region_code")),
            "urgeo": g("urgeo").strip(),
            "wi": num(g("wi")),
            "cola": num(g("cola")) or 1.0,
            "irb": num(g("irb")) or 0.0,
            "beds": _int(g("beds")),
            "cases": num(g("cases")),
            "cmi": num(g("cmi")),
            "qual_red": (num(g("qual_red")) or 0) == 1,
            "ehr_red": (num(g("ehr_red")) or 0) == 1,
            "own": g("own").strip() or None,
            "ptype": _int(g("ptype")),
            "dshpct": num(g("dshpct")),
        }
    return out


def read_hgi(path):
    """CMS Provider Data Catalog Hospital General Information CSV -> {ccn: {...}}."""
    out = {}
    with open(path, newline="", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            star = r.get("Hospital overall rating", "").strip()
            out[r["Facility ID"].strip()] = {
                "name": r["Facility Name"].strip(),
                "address": r["Address"].strip(),
                "city": r["City/Town"].strip(),
                "st": r["State"].strip(),
                "zip": r["ZIP Code"].strip()[:5].zfill(5),
                "county": r["County/Parish"].strip(),
                "type": r["Hospital Type"].strip(),
                "ownership": r["Hospital Ownership"].strip(),
                "star": int(star) if star.isdigit() else None,
            }
    return out


def read_zcta(path):
    """Census ZCTA gazetteer -> {zip5: (lat, lon)}."""
    header, rows = _read_table(path, "GEOID", encoding="utf-8")
    lat, lon = _col(header, "INTPTLAT", path), _col(header, "INTPTLONG", path)
    return {r[0].strip(): (float(r[lat]), float(r[lon].strip())) for r in rows}


def read_cbsa_names(path):
    """County-to-CBSA crosswalk -> ({cbsa: name}, {county_fips: cbsa})."""
    header, rows = _read_table(path, "FIPS County Code")
    code_col = next((j for h, j in header.items() if h.endswith("cbsa")), None)
    name_col = next((j for h, j in header.items() if h.endswith("cbsa name")), None)
    if code_col is None or name_col is None:
        raise SchemaError(f"{path}: CBSA code/name columns not found")
    names, county = {}, {}
    for r in rows:
        code = r[code_col].strip() if code_col < len(r) else ""
        if not code:
            continue
        county[r[0].strip().zfill(5)] = code
        name = r[name_col].strip().strip('"') if name_col < len(r) else ""
        if name:
            names[code] = name
    return names, county


def read_rates(path):
    """IPPS Tables 1A/1B -> {'1A'|'1B': {'qe'|'qn'|'ne'|'nn': (labor, nonlabor)}}.

    q/n = hospital did / did NOT submit quality data; e/n = is / is NOT a meaningful EHR user.
    1A applies when wage index > 1 (66% labor share); 1B when <= 1 (62%).
    """
    with open(path, newline="", encoding="latin1") as f:
        rows = list(csv.reader(f, delimiter="\t"))
    out, current = {}, None
    for r in rows:
        first = r[0].strip().strip('"').upper() if r else ""
        if first.startswith("TABLE"):
            current = "1A" if first.startswith("TABLE 1A") else "1B" if first.startswith("TABLE 1B") else None
            continue
        if current and first.startswith("$") and current not in out:
            vals = [num(x) for x in r if num(x) is not None][:8]
            if len(vals) != 8:
                raise SchemaError(f"{path}: Table {current} expected 8 rates, got {len(vals)}")
            keys = ("qe", "qn", "ne", "nn")
            out[current] = {k: (vals[2 * i], vals[2 * i + 1]) for i, k in enumerate(keys)}
    if set(out) != {"1A", "1B"}:
        raise SchemaError(f"{path}: Tables 1A/1B not both found")
    return out
