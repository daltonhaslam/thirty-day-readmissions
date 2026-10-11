"""Parsers for the CMS and Census source files.

Every reader goes through `_table`, which finds the header row by its first cell (not by
line number), pads and strips rows, and raises SchemaError when an expected column is missing,
so a CMS layout change cannot silently produce wrong numbers.
"""
import csv
import zipfile
import xml.etree.ElementTree as ET

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
    """The file's rows, streamed (the Provider of Services file is 30 MB and 473 columns wide)."""
    with open(path, newline="", encoding=encoding) as f:
        yield from csv.reader(f, delimiter=delimiter)


_XL = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
_XL_REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
XLSX_MAX_PART = 100_000_000  # bytes; a larger XML part is refused rather than inflated


def _xlsx_part(zf, name):
    """One parsed XML part of a workbook. Refuses DTDs (the standard library parser expands entities) and huge parts."""
    info = zf.getinfo(name)
    if info.file_size > XLSX_MAX_PART:
        raise SchemaError(f"{zf.filename}: part {name} is {info.file_size:,} bytes")
    data = zf.read(info)
    if b"<!DOCTYPE" in data or b"<!ENTITY" in data:
        raise SchemaError(f"{zf.filename}: part {name} declares a DTD")
    return ET.fromstring(data)


def _col_index(ref):
    """0-based column of a cell reference: 'A12' -> 0, 'AB3' -> 27."""
    n = 0
    for ch in ref:
        if not "A" <= ch <= "Z":
            break
        n = n * 26 + ord(ch) - 64
    return n - 1


def _xlsx_rows(path, sheet):
    """Rows (lists of strings) of worksheet `sheet` in an .xlsx workbook, read with zipfile + ElementTree.

    Shared and inline strings are resolved; a numeric cell keeps its stored text, which Excel writes at full
    double precision ('0.18243374902572096'); a skipped cell is ''.
    """
    with zipfile.ZipFile(path) as zf:
        rids = {s.get("name"): s.get(_XL_REL) for s in _xlsx_part(zf, "xl/workbook.xml").iter(_XL + "sheet")}
        if sheet not in rids:
            raise SchemaError(f"{path}: no worksheet named {sheet!r} (found {sorted(rids)})")
        rels = {r.get("Id"): r for r in _xlsx_part(zf, "xl/_rels/workbook.xml.rels")}
        part = lambda r: "xl/" + r.get("Target").removeprefix("/xl/")  # noqa: E731
        shared = []
        for r in rels.values():
            if r.get("Type", "").endswith("/sharedStrings"):
                shared = ["".join(t.text or "" for t in si.findall(_XL + "t") + si.findall(f"{_XL}r/{_XL}t"))
                          for si in _xlsx_part(zf, part(r)).iter(_XL + "si")]
        rows = []
        for row in _xlsx_part(zf, part(rels[rids[sheet]])).iter(_XL + "row"):
            out = []
            for c in row.iter(_XL + "c"):
                j = _col_index(c.get("r")) if c.get("r") else len(out)
                if j < len(out):
                    raise SchemaError(f"{path}: cell {c.get('r')} out of order")
                kind, v = c.get("t"), c.find(_XL + "v")
                if kind == "inlineStr":
                    val = "".join(t.text or "" for t in c.iter(_XL + "t"))
                else:
                    val = "" if v is None or v.text is None else v.text
                    if kind == "s":
                        val = shared[int(val)]
                out += [""] * (j - len(out)) + [val]
            rows.append(out)
        return rows


def _read_table(path, anchor, columns, delimiter="\t", encoding="latin1"):
    return _table(path, _rows(path, delimiter, encoding), anchor, columns)


def _table(path, rows, anchor, columns):
    """Records (dicts keyed by `columns` keys, stripped strings) from the table whose header row starts with `anchor`.

    `columns` maps output key -> header text (matched case/space-insensitively). A header text ending in
    '*' matches any header that ends with the rest (for year-stamped names like 'FY 2025 CBSA').
    `path` only labels errors; `rows` are the file's rows as lists of strings.
    """
    target = _norm(anchor)
    rows = iter(rows)
    for row in rows:
        if row and _norm(row[0]) == target:
            header = [_norm(h) for h in row]
            idx = {}
            for key, name in columns.items():
                n = _norm(name)
                hits = [j for j, h in enumerate(header) if (h.endswith(n[1:]) if n.startswith("*") else h == n)]
                if not hits:
                    raise SchemaError(f"{path}: expected column {name!r} not found")
                idx[key] = hits[0]
            return [{k: (r[j] if j < len(r) else "").strip() for k, j in idx.items()} for r in rows if r and r[0].strip()]
    raise SchemaError(f"{path}: header row starting with {anchor!r} not found")


def _is_ccn(s):
    return len(s) == 6 and s[:2].isdigit()


def _index_by_ccn(path, records, build):
    """{ccn: build(record)}. Footnote rows (no CCN) are skipped; a numeric cell that is not a 6-character CCN raises."""
    out = {}
    for r in records:
        ccn = r["ccn"]
        if not _is_ccn(ccn):
            if ccn.isdigit():
                raise SchemaError(f"{path}: malformed CCN {ccn!r} (expected 6 characters)")
            continue
        if ccn in out:
            raise SchemaError(f"{path}: duplicate CCN {ccn}")
        out[ccn] = build(r)
    return out


def read_supplemental(path, sheet=None):
    """HRRP supplemental file -> {ccn: {paf, dual, peer, nm, c: {COND: {n, err, med, flag, ratio}}}}.

    With `sheet`, `path` is CMS's Excel workbook and values keep full precision; without it, `path` is the
    tab-delimited export of that sheet, rounded to 4 decimals.
    """
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
    rows = _xlsx_rows(path, sheet) if sheet else _rows(path)
    return _index_by_ccn(path, _table(path, rows, "Hospital CCN", columns), build)


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
               "ehr_red": "Proxy EHR Reduction", "own": "Ownership Control Type", "ptype": "Provider Type",
               "mdh": "MDH Flag", "hsp": "HSP Rate"}

    def build(r):
        return {
            "name": r["name"], "cbsa_geo": r["cbsa_geo"], "fips": r["fips"].zfill(5) if r["fips"] else None,
            "urgeo": r["urgeo"], "wi": num(r["wi"]), "cola": num(r["cola"]) or 1.0, "irb": num(r["irb"]) or 0.0,
            "beds": _int(r["beds"]), "cases": num(r["cases"]), "cmi": num(r["cmi"]),
            "qual_red": num(r["qual_red"]) == 1, "ehr_red": num(r["ehr_red"]) == 1,
            "own": r["own"] or None, "ptype": _int(r["ptype"]), "mdh": r["mdh"].upper() == "Y", "hsp": num(r["hsp"]),
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


# Provider of Services termination codes (PGM_TRMNTN_CD) with plain-words reasons. Meanings from CMS's POS record
# layout for this dataset (P.QWB.POSQ.OTHER.LAYOUT.MAR23.pdf); the CLIA-only codes cannot occur in this file.
POS_TERMINATION = {
    "00": None,  # ACTIVE PROVIDER
    "01": "merger or closure",  # VOLUNTARY-MERGER, CLOSURE
    "02": "left Medicare, dissatisfied with payment",  # VOLUNTARY-DISSATISFACTION WITH REIMBURSEMENT
    "03": "left Medicare at risk of being terminated",  # VOLUNTARY-RISK OF INVOLUNTARY TERMINATION
    "04": "left Medicare for another reason",  # VOLUNTARY-OTHER REASON FOR WITHDRAWAL
    "05": "terminated for failing health and safety requirements",  # INVOLUNTARY-FAILURE TO MEET HEALTH/SAFETY REQ
    "06": "terminated for failing its Medicare agreement",  # INVOLUNTARY-FAILURE TO MEET AGREEMENT
    "07": "change in provider status",  # OTHER-PROVIDER STATUS CHANGE
    "80": "awaiting state approval",  # AWAITING STATE APPROVAL
}


def read_pos(path):
    """CMS Provider of Services file (hospital & non-hospital facilities) -> {ccn: {beds, term, termDate, street, city,
    st, zip}}. `beds` is the certified bed count; `term` the termination code (see POS_TERMINATION)."""
    columns = {"ccn": "PRVDR_NUM", "beds": "CRTFD_BED_CNT", "term": "PGM_TRMNTN_CD", "date": "TRMNTN_EXPRTN_DT",
               "street": "ST_ADR", "city": "CITY_NAME", "st": "STATE_CD", "zip": "ZIP_CD"}

    def build(r):
        if r["term"] not in POS_TERMINATION:
            raise SchemaError(f"{path}: unknown termination code {r['term']!r} for {r['ccn']}")
        d = r["date"]
        if d and not (len(d) == 8 and d.isdigit()):
            raise SchemaError(f"{path}: malformed termination date {d!r} for {r['ccn']}")
        return {"beds": _int(r["beds"]) or None, "term": r["term"], "termDate": f"{d[:4]}-{d[4:6]}-{d[6:]}" if d else None,
                "street": " ".join(r["street"].split()), "city": r["city"], "st": r["st"], "zip": r["zip"][:5].zfill(5) if r["zip"] else ""}
    try:  # Windows-1252 (en dashes and curly quotes as 0x96/0x92); an undefined byte means the encoding changed
        return _index_by_ccn(path, _read_table(path, "PRVDR_CTGRY_SBTYP_CD", columns, ",", "cp1252"), build)
    except UnicodeDecodeError as e:
        raise SchemaError(f"{path}: not Windows-1252 text ({e})") from None


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
