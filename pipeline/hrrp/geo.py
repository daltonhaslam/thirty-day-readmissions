"""State → census region/division, and county centroids decoded from us-atlas TopoJSON."""
import json
from pathlib import Path

DIVISIONS = {
    "New England": ("Northeast", ["CT", "ME", "MA", "NH", "RI", "VT"]),
    "Middle Atlantic": ("Northeast", ["NJ", "NY", "PA"]),
    "East North Central": ("Midwest", ["IL", "IN", "MI", "OH", "WI"]),
    "West North Central": ("Midwest", ["IA", "KS", "MN", "MO", "NE", "ND", "SD"]),
    "South Atlantic": ("South", ["DE", "DC", "FL", "GA", "MD", "NC", "SC", "VA", "WV"]),
    "East South Central": ("South", ["AL", "KY", "MS", "TN"]),
    "West South Central": ("South", ["AR", "LA", "OK", "TX"]),
    "Mountain": ("West", ["AZ", "CO", "ID", "MT", "NV", "NM", "UT", "WY"]),
    "Pacific": ("West", ["AK", "CA", "HI", "OR", "WA"]),
}
STATE_REGION = {st: (region, div) for div, (region, sts) in DIVISIONS.items() for st in sts}
# (abbreviation, FIPS, name)
STATES = [
    ("AL", "01", "Alabama"), ("AK", "02", "Alaska"), ("AZ", "04", "Arizona"), ("AR", "05", "Arkansas"),
    ("CA", "06", "California"), ("CO", "08", "Colorado"), ("CT", "09", "Connecticut"), ("DE", "10", "Delaware"),
    ("DC", "11", "District of Columbia"), ("FL", "12", "Florida"), ("GA", "13", "Georgia"), ("HI", "15", "Hawaii"),
    ("ID", "16", "Idaho"), ("IL", "17", "Illinois"), ("IN", "18", "Indiana"), ("IA", "19", "Iowa"),
    ("KS", "20", "Kansas"), ("KY", "21", "Kentucky"), ("LA", "22", "Louisiana"), ("ME", "23", "Maine"),
    ("MD", "24", "Maryland"), ("MA", "25", "Massachusetts"), ("MI", "26", "Michigan"), ("MN", "27", "Minnesota"),
    ("MS", "28", "Mississippi"), ("MO", "29", "Missouri"), ("MT", "30", "Montana"), ("NE", "31", "Nebraska"),
    ("NV", "32", "Nevada"), ("NH", "33", "New Hampshire"), ("NJ", "34", "New Jersey"), ("NM", "35", "New Mexico"),
    ("NY", "36", "New York"), ("NC", "37", "North Carolina"), ("ND", "38", "North Dakota"), ("OH", "39", "Ohio"),
    ("OK", "40", "Oklahoma"), ("OR", "41", "Oregon"), ("PA", "42", "Pennsylvania"), ("RI", "44", "Rhode Island"),
    ("SC", "45", "South Carolina"), ("SD", "46", "South Dakota"), ("TN", "47", "Tennessee"), ("TX", "48", "Texas"),
    ("UT", "49", "Utah"), ("VT", "50", "Vermont"), ("VA", "51", "Virginia"), ("WA", "53", "Washington"),
    ("WV", "54", "West Virginia"), ("WI", "55", "Wisconsin"), ("WY", "56", "Wyoming"), ("PR", "72", "Puerto Rico"),
]
STATE_NAMES = {a: n for a, _, n in STATES}
STATE_FIPS = {f: a for a, f, _ in STATES}


def region_of(st):
    return STATE_REGION.get(st, (None, None))


def _decode_arcs(topo):
    """Absolute lon/lat arcs from a quantized, delta-encoded TopoJSON topology."""
    (sx, sy), (tx, ty) = topo["transform"]["scale"], topo["transform"]["translate"]
    arcs = []
    for arc in topo["arcs"]:
        x = y = 0
        pts = []
        for dx, dy in arc:
            x += dx
            y += dy
            pts.append((x * sx + tx, y * sy + ty))
        arcs.append(pts)
    return arcs


def _ring(arcs, refs):
    pts = []
    for i in refs:
        seg = arcs[i] if i >= 0 else list(reversed(arcs[~i]))
        pts.extend(seg if not pts else seg[1:])
    return pts


def _centroid(ring):
    """Area-weighted planar centroid (lon/lat) of a closed ring; returns (area, lon, lat)."""
    a = cx = cy = 0.0
    for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1]):
        f = x0 * y1 - x1 * y0
        a += f
        cx += (x0 + x1) * f
        cy += (y0 + y1) * f
    if abs(a) < 1e-12:
        xs, ys = zip(*ring)
        return 0.0, sum(xs) / len(xs), sum(ys) / len(ys)
    return abs(a) / 2, cx / (3 * a), cy / (3 * a)


def county_key(st, name):
    """Normalized (state, county) key: 'DE KALB' == 'DeKalb', 'ST. LOUIS COUNTY' == 'St. Louis'."""
    n = (name or "").lower().replace("saint ", "st ")
    for suffix in (" county", " parish", " city and borough", " borough", " census area", " municipality"):
        n = n.removesuffix(suffix)
    return st, "".join(ch for ch in n if ch.isalnum())


def county_centroids(path):
    """({county FIPS: (lat, lon)}, {(state, normalized name): (lat, lon)}) from the largest polygon of each county."""
    topo = json.loads(Path(path).read_text(encoding="utf-8"))
    arcs = _decode_arcs(topo)
    by_fips, by_name = {}, {}
    for g in topo["objects"]["counties"]["geometries"]:
        polys = [g["arcs"]] if g["type"] == "Polygon" else g.get("arcs", []) if g["type"] == "MultiPolygon" else []
        best = max((_centroid(_ring(arcs, poly[0])) for poly in polys), default=None)
        if best:
            fips = str(g["id"]).zfill(5)
            by_fips[fips] = (best[2], best[1])
            st = STATE_FIPS.get(fips[:2])
            if st:
                by_name.setdefault(county_key(st, g.get("properties", {}).get("name")), (best[2], best[1]))
    return by_fips, by_name
