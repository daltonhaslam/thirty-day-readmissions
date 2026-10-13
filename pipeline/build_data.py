"""Join the raw CMS/Census files into the site's data contract: web/src/data/hrrp.json.

Usage: python3 -I pipeline/build_data.py
Hard-fails on schema drift, duplicate CCNs, out-of-range PAFs, a Table 15 disagreement, an Excel workbook
value that does not round to the tab-delimited file's, stored values that no longer reproduce every PAF or that
the site would print differently from CMS's 4-decimal values, or a missing or malformed content/dollar_check.json;
prints a coverage report.
"""
import csv
import json
import math
import re
import sys
from collections import namedtuple
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch import PIPELINE, RAW_DIR, ROOT, SOURCES  # noqa: E402
from hrrp import geo, history, model, names, parse  # noqa: E402

OUT = ROOT / "web" / "src" / "data" / "hrrp.json"
CONTENT = PIPELINE / "content"
GEOCODES = CONTENT / "geocodes.csv"  # written by pipeline/geocode.py (Census Geocoder); the build stays offline
GEOCODER_SOURCE = {"name": "U.S. Census Bureau Geocoder, Public_AR_Current benchmark (hospital street addresses)",
                   "url": "https://geocoding.geo.census.gov/geocoder/"}
HIST = PIPELINE / "history"

# Everything that changes when the next fiscal year's files arrive
FY = 2027
GROUPER = 44  # MS-DRG grouper version used in the FY2027 impact file
FILE_DATE = "2026-10-07"
PERF = ["2023-07-01", "2025-06-30"]
# Medicare-dependent hospital status ends on this date under current law (extended through Dec 31, 2026 by section
# 6202 of the Consolidated Appropriations Act, 2026). The MDH add-on counts only for the fiscal-year days up to it;
# move it if Congress extends the program again.
MDH_END = "2026-12-31"
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
# ERRs, DRG ratios, peer medians, and the neutrality modifier are written with at least this many decimals: the fewest
# that still reproduce every FY2027 PAF from the JSON (5 leaves 7 hospitals 0.0001 off). The build fails if it stops
# sufficing. A value gets more decimals, up to MAX_DECIMALS, when the site's toFixed(4) of it would otherwise differ
# from CMS's published 4-decimal value (1.02485 prints as 1.0249; CMS shows the full 1.0248497... as 1.0248). An exact
# tie that no rounding fixes (the double 0.06145 sits below the tie, so prints 0.0614; Excel shows CMS's 0.0615) is
# stored one unit of its MAX_DECIMALS-th decimal toward CMS's value (0.061450000001), and listed in the build report.
DECIMALS = 6
MAX_DECIMALS = 12

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


def rnd(v, places, half_up=False):
    """v rounded to `places` decimals; None stays None. half_up rounds as CMS's published values are: the value as
    Excel shows it (15 significant digits, so 0.12344999999999999 is 0.12345), ties up (Python's round() would give
    0.15625 -> 0.1562)."""
    if v is None:
        return None
    return float(Decimal(f"{v:.15g}").quantize(Decimal(1).scaleb(-places), ROUND_HALF_UP)) if half_up else round(v, places)


def to_fixed4(v):
    """JavaScript's Number(v).toFixed(4), as a Decimal: the exact binary value rounded, an exact tie to the larger
    (half up, since every value rounded this way is positive)."""
    return Decimal(v).quantize(Decimal("0.0001"), ROUND_HALF_UP)


def stored(v, published, label, ties=None):
    """v as hrrp.json stores it, so that the site's toFixed(4) prints CMS's 4-decimal `published` value; None stays None.
    The first plain rounding that prints right, to DECIMALS, DECIMALS + 1, ... MAX_DECIMALS decimals; only if none does
    (an exact tie no rounding fixes), v rounded to MAX_DECIMALS, MAX_DECIMALS - 1, ... DECIMALS decimals and moved one
    unit of its last decimal toward `published`, finest first so the move is as small as it can be (~1e-12), and
    appended to `ties` as (label, v, stored value). SystemExit when nothing prints right. A moved value is off v by up
    to 1.5 units of its last decimal; the replication gate still checks the PAFs."""
    if v is None:
        return None
    want = Decimal(repr(published))
    places = range(DECIMALS, MAX_DECIMALS + 1)

    def prints(c):
        return to_fixed4(float(c)) == want

    plain = next((c for c in (Decimal(repr(round(v, d))) for d in places) if prints(c)), None)
    if plain is not None:
        return float(plain)
    for d in reversed(places):
        r = Decimal(repr(round(v, d)))
        c = r + Decimal(1 if to_fixed4(float(r)) < want else -1).scaleb(-d)
        if prints(c):
            if ties is not None:
                ties.append((label, v, float(c)))
            return float(c)
    raise SystemExit(f"{label}: {v!r} does not print as CMS's {published} at any precision up to {MAX_DECIMALS} decimals, "
                     "even moved one unit of the last decimal")


def _values(s):
    """(field, value) pairs of one supplemental-file record, conditions flattened as 'HF.err'."""
    yield from ((f, s[f]) for f in ("paf", "dual", "peer", "nm"))
    yield from ((f"{k}.{f}", v) for k, c in s["c"].items() for f, v in c.items())


def precision_mismatches(full, published):
    """(ccn, field) where a full-precision workbook value, rounded as CMS rounds, differs from the 4-decimal export."""
    if set(full) != set(published):
        return sorted((c, "missing") for c in set(full) ^ set(published))
    return [(c, f) for c in sorted(full) for (f, a), (_, b) in zip(_values(full[c]), _values(published[c]))
            if rnd(a, 4, half_up=True) != b]


def as_stored(ccn, s, pub, nm, peer_med, ties=None):
    """A full-precision supplemental record (s) with its formula inputs stored as hrrp.json writes them: the stored
    neutrality modifier (nm) and its peer group's medians (peer_med, {"1".."5": {condition: median}}), and its ERRs and
    DRG ratios each printing as in CMS's tab-delimited record (pub); see stored(), which appends any value it moves off
    an exact tie to `ties`. SystemExit naming the hospital when its peer group is missing or not one of 1-5."""
    med = peer_med.get(str(s.get("peer")))
    if med is None:
        raise SystemExit(f"{ccn}: peer group {s.get('peer')!r} is not one of 1-5")
    return {**s, "nm": nm,
            "c": {k: {**c, "med": med[k], **{f: stored(c[f], pub["c"][k][f], f"{ccn} {k}.{f}", ties) for f in ("err", "ratio")}}
                  for k, c in s["c"].items()}}


def replication_gate(kept):
    """SystemExit naming every hospital whose PAF the stored values ({ccn: as_stored record}) do not reproduce."""
    short = sorted(c for c, s in kept.items() if model.replication_status(s) != "exact")
    if short:
        raise SystemExit(f"The stored values do not reproduce the PAF of {len(short)} hospitals: {', '.join(short)}. "
                         f"Either {DECIMALS} decimals are too few (raise DECIMALS) or CMS counted a flagged condition "
                         "whose payment weight it did not publish, which the formula cannot recompute.")


def extra_places(hospitals, peer_med, nm):
    """(stored with more than DECIMALS decimals, all) over the 4-decimal values the site prints: the neutrality
    modifier, each peer median, and each hospital's ERRs and DRG ratios."""
    shown = [nm, *(v for g in peer_med.values() for v in g.values()),
             *(c[f] for x in hospitals for c in x["c"].values() for f in ("err", "ratio"))]
    shown = [v for v in shown if v is not None]
    return sum(1 for v in shown if round(v, DECIMALS) != v), len(shown)


def beds(cr, pos):
    """(beds, source): the Provider of Services certified bed count ('pos') for every hospital that has one, else
    the impact file's cost-report beds ('cr'); (None, None) when neither is present or above zero."""
    if pos:
        return pos, "pos"
    return (cr, "cr") if cr else (None, None)


def inactive(p):
    """{date, reason} when the Provider of Services file shows the hospital's Medicare participation ended (codes 01-07;
    the date may be None). Active (00) and awaiting state approval (80) are not inactive."""
    reason = parse.POS_TERMINATION.get(p.get("term"))
    return {"date": p.get("termDate"), "reason": reason} if reason else None


def report_pos(hospitals, impact, pos):
    """Print where bed counts came from and the hospitals POS shows inactive, with their termination codes."""
    n_cr, n_none = sum(1 for x in hospitals if "bedsSrc" in x), sum(1 for x in hospitals if x["beds"] is None)
    print(f"beds: certified (POS) {len(hospitals) - n_cr - n_none}, cost report {n_cr}, none {n_none}")
    cr = {x["id"]: (impact.get(x["id"]) or {}).get("beds") or None for x in hospitals}
    tiny = [x for x in hospitals if (cr[x["id"]] or 0) < 5]
    big = sorted(hospitals, key=lambda x: -abs((x["beds"] or 0) - (cr[x["id"]] or 0)))[:3]
    print("  cost-report beds -> certified: " + "; ".join(f"{x['id']} {cr[x['id']]}->{x['beds']}" for x in tiny + big))
    off = [x for x in hospitals if "inactive" in x]
    print(f"inactive in POS ({len(off)}, still ranked and totaled): " + "; ".join(
        f"{x['id']} {x['name']} {pos[x['id']]['term']} {x['inactive']['date']}" for x in off))


def year_share(fy, end):
    """Fraction of fiscal year `fy` (Oct 1 - Sep 30) that falls on or before the ISO date `end`, between 0 and 1."""
    start, stop = date(fy - 1, 10, 1), date(fy, 9, 30)
    last = min(max(date.fromisoformat(end), start - timedelta(days=1)), stop)
    return ((last - start).days + 1) / ((stop - start).days + 1)


def mdh_shortfall(addons):
    """{ccn: % by which the MDH's estimate would fall short if its status lasted the whole year}; MDHs with no
    federal base (no cases, so no full-year total either) are left out."""
    return {c: 100 * (1 - (fed + a) / (fed + full)) for c, (fed, a, full) in addons.items() if fed}


def report_mdh(hospitals, addons, share, shortfall):
    """Print how the Medicare-dependent hospital add-on changed the base and the estimated penalty."""
    paf = {x["id"]: x["paf"] for x in hospitals}
    got = {c: (fed, a, a * (1 - paf[c])) for c, (fed, a, _) in addons.items() if fed and a > 0}
    print(f"MDH add-on ({share:.4f} of the year): {len(got)} of {len(addons)} MDHs, base +${sum(v[1] for v in got.values()) / 1e6:.1f}M, "
          f"estimated penalty +${sum(v[2] for v in got.values()) / 1e6:.2f}M")
    if got:
        rel, usd = max(got, key=lambda c: got[c][1] / got[c][0]), max(got, key=lambda c: got[c][2])
        print(f"  largest: {rel} base +{100 * got[rel][1] / got[rel][0]:.1f}%; {usd} penalty +${got[usd][2]:,.0f}")
    if shortfall:
        c = max(shortfall, key=shortfall.get)
        print(f"  a full year of MDH status would leave estimates up to {shortfall[c]:.1f}% short ({c})")


def stored_constant(rows, full, published, label, ties=None):
    """The value `full(row)` that every row shares at full precision, stored as hrrp.json writes it (see stored(), which
    appends a value it moves off an exact tie to `ties`) with any one row's 4-decimal `published(row)`; SystemExit if
    rows disagree."""
    vals = {full(r) for r in rows}
    if len(vals) != 1:
        raise SystemExit(f"{label} is not constant: {sorted(vals, key=str)[:5]}")
    return stored(vals.pop(), published(rows[0]), label, ties)


def load_content(name):
    p = CONTENT / name
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else []


def _is_date(v):
    """True for a real calendar date written YYYY-MM-DD."""
    if not (isinstance(v, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", v)):
        return False
    try:
        date.fromisoformat(v)
    except ValueError:
        return False
    return True


def _is_number(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def _is_int(v):
    return isinstance(v, int) and not isinstance(v, bool)


def _between(lo, hi):
    return lambda v: _is_number(v) and lo <= v <= hi


# content/dollar_check.json fields the build requires: (check, what the field must be). The site reads asOf, costFy,
# rateDrift, within15, and within15Small (Methods); source, n, within10, and within15Large are recorded for provenance.
# "note" is optional and unchecked.
DOLLAR_CHECK_FIELDS = {
    "asOf": (_is_date, "a YYYY-MM-DD date"),
    "source": (lambda v: isinstance(v, str) and v.strip() != "", "a non-empty string"),
    "costFy": (lambda v: _is_int(v) and 2013 <= v <= FY, f"a fiscal year from 2013 to {FY}"),
    "n": (lambda v: _is_int(v) and v > 0, "a positive integer"),
    "rateDrift": (_between(0.5, 2), "a number between 0.5 and 2"),
    **{f: (_between(0, 100), "a percentage between 0 and 100") for f in ("within10", "within15", "within15Small", "within15Large")},
}


def dollar_check_about(rec):
    """What content/dollar_check.json is and how to fix it, dated by the record's own asOf when it has a valid one."""
    when = f"the {rec['asOf']}" if _is_date(rec.get("asOf")) else "the"
    return (f"It is a dated result of {when} cost-report comparison (the dollar estimates checked against hospitals' "
            "Medicare cost reports), which Methods quotes. No script makes it: update it by hand when that comparison is redone.")


def load_dollar_check(p=CONTENT / "dollar_check.json"):
    """content/dollar_check.json, the cost-report comparison Methods quotes; SystemExit when the file is missing or not
    valid JSON, or a field in DOLLAR_CHECK_FIELDS is missing, of the wrong type, or out of range."""
    if not p.exists():
        raise SystemExit(f"{p} is missing. {dollar_check_about({})} Restore it from git before building.")
    try:
        dc = json.loads(p.read_text(encoding="utf-8"))
    except ValueError as e:  # json.JSONDecodeError and UnicodeDecodeError
        raise SystemExit(f"{p} is not valid JSON ({e}). {dollar_check_about({})}") from None
    rec = dc if isinstance(dc, dict) else {}
    bad = [f"{f} is missing" if f not in rec else f"{f} should be {want}, not {rec[f]!r}"
           for f, (ok, want) in DOLLAR_CHECK_FIELDS.items() if not ok(rec.get(f))]
    if bad:
        raise SystemExit(f"{p}: {'; '.join(bad)}. {dollar_check_about(rec)}")
    return dc


STRAY_KM = 40  # a ZIP/county point farther than this outside the impact-file county is replaced by that county's centroid


def load_geocodes(path=GEOCODES):
    """{ccn: (lat, lon)} street-address points written by pipeline/geocode.py; {} before it has been run."""
    if not path.exists():
        return {}
    with open(path, newline="", encoding="utf-8") as f:
        return {r["ccn"]: (float(r["lat"]), float(r["lon"])) for r in csv.DictReader(f)}


def locate(g, imp, st, zcta, counties, point=None):
    """(lat, lon, source, county label or None): geocoded street address, else ZIP centroid, else Care Compare
    county, else impact-file county.

    An address point more than STRAY_KM outside the impact-file county is set aside; one inside it overrides a
    Care Compare county that names somewhere else (the label is then that county's atlas name; Virginia's
    "Richmond City" and the atlas's "Richmond" count as the same). A ZIP or Care Compare county point more than
    STRAY_KM outside falls back to the impact-file county's centroid and atlas name. Counties absent from the atlas
    are not checked.
    """
    fips = imp.get("fips")
    key = geo.county_key(st, g.get("county"))
    if point:
        out = geo.km_outside(*point, counties.shape[fips]) if fips in counties.shape else None
        if out is None or out <= STRAY_KM:
            same = out != 0 or key[1].removesuffix("city") == geo.county_key(st, counties.name[fips])[1].removesuffix("city")
            return (*point, "address", None if same else counties.name[fips])
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


CITY_STATES = ("MD", "MO", "NV", "VA")  # states with independent cities: FIPS county codes 500 and up
NO_SUFFIX = ("AK", "DC", "PR")  # Alaska's boroughs and census areas, the District, Puerto Rico's municipios


def independent_city(fips):
    """True for an independent city's FIPS code: county code 500 and up in MD, MO, NV, or VA."""
    return bool(fips) and geo.STATE_FIPS.get(fips[:2]) in CITY_STATES and int(fips[2:]) >= 500


def atlas_fips(st, key, counties):
    """The FIPS codes of the atlas places in state `st` whose name has this geo.county_key."""
    return sorted(f for f, n in counties.name.items() if geo.STATE_FIPS.get(f[:2]) == st and geo.county_key(st, n) == key)


def named_city(key, says, st, fips, point, counties):
    """(city, settled) for Care Compare's county name, normalized (`key`, "X City" without its "City"): city is True for
    an independent city; settled is False when the evidence conflicts or runs out, and the caller lists it. `says` is
    Care Compare's own word, "city" ("RICHMOND CITY") or "county" ("ST. LOUIS COUNTY"), else None; a bare name is the
    county by Care Compare's style. Only MD, MO, NV, and VA have independent cities. A name the atlas has once goes by
    that place ("James City" is a county; "Carson City" and "Salem" are cities). Where a county and a city share it
    ("Fairfax", "St. Louis"), the one holding the street-address point decides, then Care Compare's word, then the
    impact-file county (fips) if it is either; a bare name the impact file puts in the city, or that nothing decides,
    is unsettled. Inova Fair Oaks (490101) is filed under Fairfax city, but its address is in Fairfax County."""
    if st not in CITY_STATES:
        return False, True
    same = atlas_fips(st, key, counties)
    claim = {"city": True, "county": False}.get(says)
    if len(same) < 2:
        city = independent_city(same[0]) if same else bool(claim)
        return city, claim in (None, city)
    inside = [f for f in same if point and f in counties.shape and geo.km_outside(*point, counties.shape[f]) == 0]
    by_fips = independent_city(fips) if fips in same else None
    if inside:
        city = independent_city(inside[0])
        return city, claim in (None, city)
    if claim is not None:
        return claim, by_fips in (None, claim)
    return bool(by_fips), by_fips is False


def place_name(name, st, city):
    """`name` with its legal suffix, as the hospital page shows it: "Butte County", "East Baton Rouge Parish", an
    independent city (`city`) as "Richmond City" (Care Compare's style), and no suffix in AK, DC, and PR or on a name
    that already ends in County or Parish."""
    if not name or st in NO_SUFFIX or re.search(r" (county|parish)$", name, re.I):
        return name
    if st == "LA":
        return f"{name} Parish"
    if city:
        return name if re.search(r"\scity$", name, re.I) else f"{name} City"
    return f"{name} County"


def county_label(g, st, fips, counties, point=None, moved=None):
    """(label, doubt): the hospital's county or independent city with its legal suffix (place_name), and why the rules
    could not check it, or None. The label is Care Compare's name in the atlas's spelling when the atlas knows it for
    that state ("DE KALB" is "DeKalb"), a city when named_city() says so (point: the street-address point, if the map
    kept it). Care Compare's "X City" for an atlas X is the independent city X in the states that have them
    ("RICHMOND CITY"), and elsewhere the county X when the impact file puts the hospital there ("SALT LAKE CITY"; not
    "SIOUX CITY", which is in Woodbury County). Otherwise (typos such as "E. BATON ROUGE", or "THE DISTRICT"), or when
    locate() moved the hospital to the impact-file county (`moved`: its source, "address" for a street address inside
    that county, "county" for a ZIP or county point far outside it), the label is that county's atlas name, a city
    when its FIPS code is one. Doubts: Care Compare's name is missing or unknown; named_city() could not settle county
    or city; or a far-off point, not a street address, moved a hospital from the place Care Compare names."""
    raw = g.get("county")
    key = geo.county_key(st, raw)
    stem = (key[0], key[1].removesuffix("city"))
    ends_city = key not in counties.by_name and stem != key  # "RICHMOND CITY", which the atlas has as "Richmond"
    base = stem if ends_city else key  # Care Compare's name without the "City" it ends in
    says = "city" if ends_city else "county" if re.search(r"(?i)\scounty\W*$", raw or "") else None
    if ends_city and stem in counties.by_name:
        places = atlas_fips(st, stem, counties)
        known = any(map(independent_city, places)) if st in CITY_STATES else fips in places
    else:
        known = key in counties.by_name
    if moved or (not known and counties.name.get(fips)):
        label = place_name(counties.name[fips], st, independent_city(fips))
        if not known:
            return label, "unknown county; the impact-file county's name"
        if moved == "county":  # a far-off point, not an address: is the impact-file county the place Care Compare names?
            if fips not in atlas_fips(st, base, counties):
                return label, "Care Compare names another place and no street address settles it; took the impact file's"
            city, settled = named_city(base, says, st, fips, None, counties)
            if not settled or city != independent_city(fips):
                return label, "county or city? Care Compare and the impact file disagree and no street address settles it; took the impact file's"
        return label, None
    atlas = counties.named if counties.named is not None else {
        geo.county_key(geo.STATE_FIPS.get(f[:2]), n): n for f, n in counties.name.items() if geo.STATE_FIPS.get(f[:2])}
    name = atlas.get(base) or names.smart_title(raw)
    city, settled = named_city(base, says, st, fips, point, counties)
    if not known:
        doubt = "unknown county; Care Compare's name alone" if name else "no county"
    elif not settled:
        doubt = f"county or city? Care Compare, the street address, and the impact file do not settle it; took the {'city' if city else 'county'}"
    else:
        doubt = None
    return place_name(name, st, city) or None, doubt


# Care Compare refreshes add and re-spell county names. Each county the rules cannot check (county_label's doubt) is
# listed in the build report; more than this many fails the build, so a new one is looked at before it ships.
# tests/test_build.py pins the CCNs.
MAX_UNCHECKED_COUNTIES = 17


def county_gate(unchecked, limit):
    """Print every unchecked county ((ccn, Care Compare's county, label, doubt)); SystemExit when there are more than
    `limit`."""
    lines = [f"{c} {raw!r} -> {label} ({doubt})" for c, raw, label, doubt in unchecked]
    print(f"county names the rules cannot check ({len(unchecked)}, at most {limit}): " + ("; ".join(lines) or "none"))
    if len(unchecked) > limit:
        raise SystemExit(f"{len(unchecked)} county names the rules cannot check, more than {limit}: "
                         f"{', '.join(c for c, *_ in unchecked)}. Check each label in the report above, then teach "
                         "geo.county_key or county_label the new spelling, or raise MAX_UNCHECKED_COUNTIES and the "
                         "CCNs pinned in tests/test_build.py.")


# Lookups shared by every hospital record. Collected for the build report: `moved`, (ccn, Care Compare county,
# impact-file county, geo source) where the impact-file county replaced Care Compare's; `addons`, {ccn: (federal
# base, MDH add-on, add-on had MDH status lasted the whole year)}; `unchecked`, (ccn, Care Compare county, label,
# doubt) for each county the rules could not check (county_label).
Ref = namedtuple("Ref", "zcta counties points cbsa_names rates mdh_share moved addons unchecked")


# Left out of a hospital record when None: most hospitals have no alias, certified beds ("cr" marks the cost-report
# fallback), and an active Medicare agreement.
OPTIONAL = ("alias", "bedsSrc", "inactive")


def hospital_record(ccn, s, imp, g, p, ref):
    """One hospital's data-contract record from its supplemental record as stored (s, from as_stored), impact (imp),
    Care Compare (g), and Provider of Services (p) rows."""
    fips = imp.get("fips")
    st = g.get("st") or geo.STATE_FIPS.get((fips or "")[:2])
    region, division = geo.region_of(st)
    point = ref.points.get(ccn)
    lat, lon, gsrc, fips_county = locate(g, imp, st, ref.zcta, ref.counties, point)
    if fips_county:
        ref.moved.append((ccn, g.get("county"), fips_county, gsrc))
    county, doubt = county_label(g, st, fips, ref.counties, point if gsrc == "address" else None,
                                 gsrc if fips_county else None)
    if doubt:
        ref.unchecked.append((ccn, g.get("county"), county, doubt))
    cbsa = imp.get("cbsa_geo") if len(imp.get("cbsa_geo") or "") == 5 else None
    nbeds, beds_src = beds(imp.get("beds"), p.get("beds"))
    shown = names.display_name(g.get("name"), imp.get("name"))
    types = sorted(set(PTYPES.get(imp.get("ptype"), [])) | ({"MDH"} if imp.get("mdh") else set()))
    base = model.est_base_payment(imp, ref.rates)
    if "MDH" in types and base is not None:
        ref.addons[ccn] = (base, model.est_mdh_addon(imp, base, ref.mdh_share), model.est_mdh_addon(imp, base, 1))
        base += ref.addons[ccn][1]
    pen = model.est_penalty(base, s["paf"])
    rec = {
        "id": ccn,
        "name": shown or f"Hospital {ccn} (name not in CMS files)",
        "alias": names.alias(shown, imp.get("name")),
        "city": names.smart_title(g.get("city")) or None,
        "st": st,
        "county": county,
        "zip": g.get("zip"),
        "lat": rnd(lat, 4), "lon": rnd(lon, 4), "geo": gsrc,
        "cbsa": cbsa, "cbsaName": ref.cbsa_names.get(cbsa),
        "urban": imp["urgeo"] in ("LURBAN", "OURBAN") if imp else None,
        "region": region, "division": division,
        "beds": nbeds, "bedsSrc": "cr" if beds_src == "cr" else None,
        "teach": teach_level(imp["irb"]) if imp else None,
        "own": ownership(g.get("ownership"), imp.get("own")),
        "ownDetail": g.get("ownership"),
        "star": g.get("star"),
        "types": types,
        "inactive": inactive(p),
        "paf": s["paf"], "red": round((1 - s["paf"]) * 100, 2), "dual": rnd(s["dual"], 4, half_up=True), "peer": s["peer"],
        "base": round(base) if base is not None else None,
        "pen": round(pen) if pen is not None else None,
        "c": {k: {"n": c["n"], "err": c["err"], "flag": c["flag"], "ratio": c["ratio"]}
              for k, c in s["c"].items() if not (c["n"] is None and c["err"] is None)},
    }
    return {k: v for k, v in rec.items() if v is not None or k not in OPTIONAL}


def build():
    supp = parse.read_supplemental(path("supp_xlsx"), SUPP_SHEET)
    t15 = parse.read_table15(path("t15"), FY)
    impact = parse.read_impact(path("impact"), FY, GROUPER)
    hgi = parse.read_hgi(path("hgi"))
    pos = parse.read_pos(path("pos"), set(supp))
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
    pub = parse.read_supplemental(path("supp"))
    drift = precision_mismatches(supp, pub)
    if drift:
        raise SystemExit(f"Excel workbook and tab-delimited file disagree on {len(drift)} values: {drift[:10]}")
    # One value across the group at full precision, stored once
    ties = []  # (label, full value, stored value) for each value stored() moved off an exact tie
    nm = stored_constant(list(supp), lambda c: supp[c]["nm"], lambda c: pub[c]["nm"], "neutrality modifier", ties)
    peer_cut, peer_med = [], {}
    for p in range(1, 6):
        grp = [c for c in supp if supp[c]["peer"] == p]
        peer_cut.append([rnd(f(supp[c]["dual"] for c in grp), 4, half_up=True) for f in (min, max)])
        peer_med[str(p)] = {k: stored_constant(grp, lambda c, k=k: supp[c]["c"][k]["med"], lambda c, k=k: pub[c]["c"][k]["med"],
                                              f"peer {p} {k} median", ties) for k in parse.CONDITIONS}
    kept = {c: as_stored(c, s, pub[c], nm, peer_med, ties) for c, s in supp.items()}
    replication_gate(kept)

    mdh_share = year_share(FY, MDH_END)
    ref = Ref(zcta, counties, load_geocodes(), cbsa_names, rates, mdh_share, [], {}, [])
    hospitals = [hospital_record(ccn, kept[ccn], impact.get(ccn) or {}, hgi.get(ccn) or {}, pos.get(ccn) or {}, ref)
                 for ccn in sorted(supp)]
    n_extra, n_shown = extra_places(hospitals, peer_med, nm)
    print(f"stored with more than {DECIMALS} decimals so the site prints CMS's 4-decimal value: {n_extra} of {n_shown}")
    print(f"moved one unit of the last decimal off an exact tie ({len(ties)}): "
          + ("; ".join(f"{label} {v!r} -> {s!r}" for label, v, s in ties) or "none"))
    for src, what in (("county", f"moved to impact-file county centroid (point > {STRAY_KM} km outside it)"),
                      ("address", "street address inside the impact-file county, not Care Compare's")):
        hits = [f"{c} {old} -> {new}" for c, old, new, s in ref.moved if s == src]
        if hits:
            print(f"{what} ({len(hits)}): {'; '.join(hits)}")
    set_aside = [x["id"] for x in hospitals if x["id"] in ref.points and x["geo"] != "address"]
    print(f"geocoded addresses {len(ref.points)}; set aside (> {STRAY_KM} km outside the impact-file county): {set_aside}")
    county_gate(ref.unchecked, MAX_UNCHECKED_COUNTIES)
    report_pos(hospitals, impact, pos)
    shortfall = mdh_shortfall(ref.addons)
    report_mdh(hospitals, ref.addons, mdh_share, shortfall)
    no_shape = sum(1 for c in supp if (impact.get(c) or {}).get("fips") not in (None, *counties.shape))
    if no_shape:
        print(f"{no_shape} hospitals have an impact-file county missing from the atlas (e.g. CT planning regions); "
              "their map points are not checked")
    geocode = {k: sum(1 for x in hospitals if x["geo"] == (None if k == "none" else k)) for k in ("address", "zip", "county", "none")}

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
            "fy": FY, "fileDate": FILE_DATE, "perf": PERF, "nm": nm,
            "peerCutoffs": peer_cut, "peerMedians": peer_med, "rates": rates,
            "totals": {"modelBase": sum(x["base"] or 0 for x in hospitals),
                       "modelPen": sum(x["pen"] or 0 for x in hospitals),
                       "cmsEst": national[-1]["totalEst"], "cmsSrc": national[-1]["totalSrc"]},
            "replication": {"exact": sum(1 for s in supp.values() if model.replication_status(s) == "exact"),
                            "total": len(supp)},
            "mdh": {"endDate": MDH_END, "maxShortfall": round(max(shortfall.values(), default=0))},
            "dollarCheck": load_dollar_check(),
            "geocode": geocode, "states": states,
            "whatsNew": whats_new.get("items", []) if whats_new.get("fy") == FY else [],
            "divisions": [{"name": d, "region": r, "states": [s for s in sts if s in states]}
                          for d, (r, sts) in geo.DIVISIONS.items()],
            "sources": [{"name": s["note"], "url": s["url"]} for s in json.loads(SOURCES.read_text(encoding="utf-8"))]
                       + [GEOCODER_SOURCE],
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
    print(f"hospitals {len(h)} | penalized {sum(1 for x in h if x['paf'] < 1)} | PAF replication: {rep['exact']} of {rep['total']} exact")
    print(f"geocode {m['geocode']} | no state {sum(1 for x in h if not x['st'])} | no impact match {sum(1 for x in h if x['base'] is None)}"
          f" | no name {sum(1 for x in h if x['name'].endswith('(name not in CMS files)'))}")
    print(f"history hospitals {len(data['history']['paf'])} | modeled penalty ${m['totals']['modelPen'] / 1e6:.1f}M on base ${m['totals']['modelBase'] / 1e9:.2f}B")


if __name__ == "__main__":
    main()
