"""Parsing helpers + per-FY source configuration for the HRRP history build.

All inputs are untrusted downloaded files: this module only reads them as data.
Run with:  python3 -I build_hist.py <dl_root> <out_dir>
"""
import csv
import io
import os
import re

COND = ["ami", "hf", "pn", "copd", "cabg", "tha_tka"]
MISSING_TOKENS = {"", ".", "n/a", "na", "n.a.", "too few to report", "too few", "*", "-", "--",
                  "null", "none", "not available", "nr", "ns"}
BASE = "https://www.cms.gov"
OLD = BASE + "/medicare/medicare-fee-for-service-payment/acuteinpatientpps/downloads/"
NEW = BASE + "/files/zip/"
SFX = "-hospital-readmissions-reduction-program-supplemental-data-file.zip"

# fy -> dict(dir, data, desc, xlsx, url, page, note)
# dir is relative to dl_root. data/desc/xlsx are file names inside dir/x/.
CFG = {
    2013: dict(
        dir="fy2013", data="Readmissions PUF-FY 2013 IPPS Correction-March 2013.txt",
        desc=["Readmissions PUF-FY 2013 IPPS-File Layout.txt"],
        xlsx="Readmissions PUF-FY 2013 IPPS Correction-March 2013.xlsx",
        older=["Readmissions PUF-FY 2013 IPPS Correction-September 2012.txt",
               "Readmissions PUF-FY 2013 IPPS-August 2012.txt"],
        url=OLD + "fy_2013_fr_readmissions_file.zip"),
    2014: dict(
        dir="fy2014", data="FY 2014 Readmissions Supplemental Data Corection - Sept 2013.txt",
        desc=["Variable Description Final FY14.txt"],
        xlsx="FY 2014 Final Rule Readmissions Supplemental Data PUF-CN_Sept 2013.xlsx",
        older=["FY 2014 Readmissions Supplemental Data Final Rule - August 2013.txt"],
        url=OLD + "readmissions-supplemental-data-puf.zip"),
    2015: dict(
        dir="fy2015", data="Final FY15-CN Oct 2014.txt",
        desc=["Variable Description.txt"],
        xlsx="FY 2015 IPPS Final Rule Readmissions PUF-Oct 2014 CN.xls",
        older=["Final FY15.txt"],
        url=OLD + "fy2015-fr-readmit-supp-data-file.zip"),
    2016: dict(
        dir="fy2016", data="FY 2016 IPPS Final Rule Readmissions PUF_readmadj revised 08-04-15.txt",
        desc=["FY 2016 IPPS Final Rule Readmissions PUF_variable.txt"],
        xlsx="FY 2016 IPPS Final Rule Readmissions PUF revised 08-04-15.xlsx",
        url=OLD + "fy2016-cms-1632-fr-readmissions.zip"),
    2017: dict(
        dir="fy2017", data="FY 2017 IPPS Final Rule Readmissions PUF (FY17 data).txt",
        desc=["FY 2017 IPPS Final Rule Readmissions PUF (FY17 data-Variable Description).txt"],
        xlsx="FY 2017 IPPS Final Rule Readmissions Supplemental Data File.xlsx",
        url=OLD + "fy2017-cms-1655-fr-hospital-readmissions.zip"),
    2018: dict(
        dir="fy2018", data="FY 2018 IPPS Final Rule Readmissions PUF (FY18 data).txt",
        desc=["FY 2018 IPPS Final Rule Readmissions PUF (FY18 data-Variable Description).txt"],
        xlsx="FY 2018 IPPS Final Rule Readmissions Supplemental Data File.xlsx",
        url=OLD + "fy2018-fr-hospital-readmissions.zip"),
    2019: dict(
        dir="fy2019",
        data="Section 508 - FR FY 19 - tab - fy_2019_ipps_final_rule_hrrp_supplemental_file.txt",
        desc=["Section 508 - Variable Description tab - fy_2019_ipps_final_rule_hrrp_supplemental_file.txt"],
        xlsx="fy_2019_ipps_final_rule_hrrp_supplemental_file.xlsx",
        url=OLD + "fy2019-cms-1694-fr-hospital-readmissions.zip"),
    2020: dict(
        dir="fy2020", data="FY2020_IPPS_Final_Rule_HRRP_Supplemental_File tab2.txt",
        desc=["FY2020_IPPS_Final_Rule_HRRP_Supplemental_File tab1.txt"],
        xlsx="FY2020_IPPS_Final_Rule_HRRP_Supplemental_File.xlsx",
        url=NEW + "fy-2020-ipps-final-rule" + SFX),
    2021: dict(
        dir="fy2021", data="FY2021_Final_Rule_Supplemental_File_FR FY 2021.txt",
        desc=["FY2021_Final_Rule_Supplemental_File_Variable Description.txt"],
        xlsx="FY2021_Final_Rule_Supplemental_File.xlsx",
        url=NEW + "fy-2021-ipps-final-rule" + SFX),
    2022: dict(
        dir="fy2022", data="508_Compliant_Version_of_FR FY 2022.csv",
        desc=["508_Compliant_Version_of_Variable Description.csv"],
        xlsx="FY2022_Final_Rule_Supplemental_File.xlsx",
        url=NEW + "fy-2022-ipps-final-rule" + SFX),
    2023: dict(
        dir="fy2023_real", data="FY2023_FR_Supplemental_File FR FY 2023.txt",
        desc=["FY2023_FR_Supplemental_File Variable Description.txt"],
        xlsx="FY2023_Final_Rule_Supplemental_File.xlsx",
        url=NEW + "fy-2023-ipps-final-rule" + SFX),   # NOT the '.zip-0' href on the CMS page
    2024: dict(
        dir="fy2024", data="508 version of FY2024_Final_Rule_Supplemental_File Variations FR FY 2024 tab .txt",
        desc=["508 version of FY2024_Final_Rule_Supplemental_File Variables tab .txt"],
        xlsx="FY2024_Final_Rule_Supplemental_File.xlsx",
        url=NEW + "fy-2024-ipps-final-rule" + SFX),
    2025: dict(
        dir="fy2025", data="508-Version-FR-FY-2025.csv",
        desc=["508-Version-Variable-Description.csv"],
        xlsx="FY2025_Final_Rule_Supplemental_File.xlsx",
        url=NEW + "fy-2025-ipps-final-rule" + SFX),
    2026: dict(
        dir="fy2026", data="FR FY 2026.txt",
        desc=["Variable Description.txt"],
        xlsx="FY2026_HRRP_Supplemental_File.xlsx",
        url=NEW + "fy-2026-ipps-final-rule" + SFX),   # guessed from pattern; CMS page href points at FY2025 zip
}

MAX_CAP_PCT = {2013: 1, 2014: 2}  # 3 for FY2015+


def cap_pct(fy):
    return MAX_CAP_PCT.get(fy, 3)


def read_text(path):
    raw = open(path, "rb").read()
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return raw.decode(enc), enc
        except UnicodeDecodeError:
            continue
    raise RuntimeError("cannot decode " + path)


def clean_cell(s):
    if s is None:
        return ""
    return re.sub(r"\s+", " ", str(s).replace("﻿", "").replace("\xa0", " ")).strip().strip('"').strip()


def norm_hdr(s):
    return re.sub(r"\s+", " ", clean_cell(s).lower())


def to_float(tok, anomalies=None, ctx=""):
    t = clean_cell(tok).replace(",", "").replace("%", "").strip()
    if t.lower() in MISSING_TOKENS:
        return None
    try:
        return float(t)
    except ValueError:
        if anomalies is not None:
            anomalies.append("non-numeric %r in %s" % (tok, ctx))
        return None


def table_rows(path):
    """Return list of rows (list of str) from tab/comma-delimited text."""
    text, enc = read_text(path)
    delim = "," if path.lower().endswith(".csv") else "\t"
    return list(csv.reader(io.StringIO(text), delimiter=delim)), enc


def classify_header(h):
    """Map a header string to (field, cond) or None. field in {paf,pct,dual,peer,n,err}."""
    n = norm_hdr(h)
    if n in ("prov", "provider", "hospital ccn"):
        return ("ccn", None)
    if "adjustment factor" in n:
        return ("paf", None)
    if "payment reduction percentage" in n:
        return ("pct", None)
    if n.startswith("dual proportion"):
        return ("dual", None)
    if n.startswith("peer group assignment"):
        return ("peer", None)
    if "neutrality" in n or "median" in n or "penalty indicator" in n or "payment ratio" in n:
        return None
    cond = None
    for key, c in (("pneumon", "pn"), ("heart failure", "hf"), ("acute myocardial", "ami"),
                   ("hip", "tha_tka"), ("arthroplasty", "tha_tka"), ("tha/tka", "tha_tka"),
                   ("chronic obstructive", "copd"), ("copd", "copd"), ("coronary", "cabg"),
                   ("cabg", "cabg"), ("ami", "ami"), ("hf", "hf")):
        # word-ish match for short tokens
        if key in ("ami", "hf", "cabg", "copd"):
            if re.search(r"\b" + key + r"\b", n):
                cond = c
                break
        elif key in n:
            cond = c
            break
    if cond is None:
        return None
    if n.startswith("number of"):
        return ("n", cond)
    if n.startswith("err for") or "excess readmission ratio" in n:
        return ("err", cond)
    return None


def parse_fy(fy, dl_root, path=None):
    """Parse one FY's data file. Returns (rows, diag)."""
    cfg = CFG[fy]
    path = path or os.path.join(dl_root, cfg["dir"], "x", cfg["data"])
    rows, enc = table_rows(path)
    return parse_rows(fy, rows, enc, path)


def parse_rows(fy, rows, enc, path):
    hdr_i = None
    for i, r in enumerate(rows):
        if r and norm_hdr(r[0]) in ("prov", "provider", "hospital ccn"):
            hdr_i = i
            break
    if hdr_i is None:
        raise RuntimeError("no header row in " + path)
    header = rows[hdr_i]
    colmap = {}   # idx -> (field, cond)
    colnames = {}  # (field,cond) -> original header string
    unmapped = []
    for j, h in enumerate(header):
        if not clean_cell(h):
            continue
        c = classify_header(h)
        if c is None:
            unmapped.append(clean_cell(h))
            continue
        if c in colnames:
            raise RuntimeError("duplicate mapping %s for %r in FY%d" % (c, h, fy))
        colmap[j] = c
        colnames[c] = clean_cell(h)
    diag = dict(path=path, encoding=enc, header_row=hdr_i + 1, colnames=colnames,
                unmapped_headers=unmapped, anomalies=[], skipped_rows=[], md_excluded=[])
    out = []
    for lineno, r in enumerate(rows[hdr_i + 1:], start=hdr_i + 2):
        if not r or not any(clean_cell(x) for x in r):
            continue
        ccn_raw = clean_cell(r[0]) if r else ""
        if not re.fullmatch(r"[0-9A-Za-z]{4,6}", ccn_raw) or not re.search(r"\d", ccn_raw):
            diag["skipped_rows"].append((lineno, ccn_raw[:60]))
            continue
        ccn = ccn_raw.zfill(6)
        rec = dict(fy=fy, ccn=ccn, ccn_raw=ccn_raw, paf=None, pct=None, dual=None, peer=None,
                   n={c: None for c in COND}, err={c: None for c in COND}, line=lineno)
        for j, (field, cond) in colmap.items():
            if field == "ccn":
                continue
            tok = r[j] if j < len(r) else ""
            ctx = "FY%d line %d ccn %s col %r" % (fy, lineno, ccn, colnames[(field, cond)])
            if field in ("paf", "dual"):
                rec[field] = to_float(tok, diag["anomalies"], ctx)
            elif field == "pct":
                rec["pct"] = to_float(tok, diag["anomalies"], ctx)
            elif field == "peer":
                v = to_float(tok, diag["anomalies"], ctx)
                rec["peer"] = int(v) if v is not None else None
            elif field == "n":
                v = to_float(tok, diag["anomalies"], ctx)
                rec["n"][cond] = int(round(v)) if v is not None else None
            elif field == "err":
                rec["err"][cond] = to_float(tok, diag["anomalies"], ctx)
        out.append(rec)
    return out, diag


def performance_period(fy, dl_root):
    """Parse stated performance period start/end from variable-description files.
    Returns (start_iso, end_iso, raw_matches) or (None, None, []) if no dates stated."""
    months = {"january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6, "july": 7,
              "august": 8, "september": 9, "october": 10, "november": 11, "december": 12}
    pat = re.compile(r"(January|February|March|April|May|June|July|August|September|October|November|December)"
                     r" (\d{1,2}), ?(20\d{2})", re.I)
    cfg = CFG[fy]
    dates = []
    raw = []
    for d in cfg["desc"]:
        text, _ = read_text(os.path.join(dl_root, cfg["dir"], "x", d))
        text = text.replace("\xa0", " ")
        # look for 'start (to|through|and) end' ranges
        for m in re.finditer(pat.pattern + r"[,]?\s*(?:to|through|and)\s*" + pat.pattern, text, re.I):
            g = m.groups()
            s = (int(g[2]), months[g[0].lower()], int(g[1]))
            e = (int(g[5]), months[g[3].lower()], int(g[4]))
            # skip ranges that are Q1-Q2 2020 exclusion statements
            if s == (2020, 1, 1):
                continue
            dates.append((s, e))
            raw.append(m.group(0))
    if not dates:
        return None, None, []
    start = min(d[0] for d in dates)
    end = max(d[1] for d in dates)
    f = lambda t: "%04d-%02d-%02d" % t
    return f(start), f(end), sorted(set(raw))


def xlsx_sheets(path):
    """Return {sheet_name: rows(list of list of str)} for .xlsx (openpyxl) or .xls (xlrd)."""
    out = {}

    def fmt(v):
        if v is None:
            return ""
        if isinstance(v, float) and v.is_integer():
            return str(int(v))
        return str(v)

    if path.lower().endswith(".xlsx"):
        import openpyxl
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        for ws in wb.worksheets:
            out[ws.title] = [[fmt(c) for c in row] for row in ws.iter_rows(values_only=True)]
    else:
        import xlrd
        wb = xlrd.open_workbook(path)
        for sh in wb.sheets():
            out[sh.name] = [[fmt(c) for c in sh.row_values(i)] for i in range(sh.nrows)]
    return out
