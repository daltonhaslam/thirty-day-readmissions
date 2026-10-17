"""State → census region/division, and county centroids decoded from us-atlas TopoJSON."""
import json
import math
import re
import unicodedata
from collections import namedtuple
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


def _edges(ring):
    """Consecutive point pairs of a ring, closing it back to the first point."""
    return zip(ring, ring[1:] + ring[:1])


def _ring(arcs, refs):
    pts = []
    for i in refs:
        seg = arcs[i] if i >= 0 else list(reversed(arcs[~i]))
        pts.extend(seg if not pts else seg[1:])
    return pts


def _centroid(ring):
    """Area-weighted planar centroid (lon/lat) of a closed ring; returns (area, lon, lat)."""
    a = cx = cy = 0.0
    for (x0, y0), (x1, y1) in _edges(ring):
        f = x0 * y1 - x1 * y0
        a += f
        cx += (x0 + x1) * f
        cy += (y0 + y1) * f
    if abs(a) < 1e-12:
        xs, ys = zip(*ring)
        return 0.0, sum(xs) / len(xs), sum(ys) / len(ys)
    return abs(a) / 2, cx / (3 * a), cy / (3 * a)


# Legal suffixes county_key drops, each once and in this order, after a space, hyphen, or other punctuation and before
# any trailing punctuation ("ST. LOUIS COUNTY.", "HARRIS-COUNTY"); "COUNTY" alone is a name.
SUFFIXES = {s: re.compile(r"[\W_]+" + r"[\W_]+".join(s.split()) + r"[\W_]*$")
            for s in ("county", "parish", "city and borough", "borough", "census area", "municipality")}


def drop_suffixes(n):
    """(lowercase n without its legal suffixes, the suffixes dropped): "st. louis county." is ("st. louis", ["county"])."""
    dropped = []
    for suffix, pattern in SUFFIXES.items():
        n, hit = pattern.subn("", n)
        if hit:
            dropped.append(suffix)
    return n, dropped


def county_key(st, name):
    """Normalized (state, county) key: 'DE KALB' == 'DeKalb', 'SAINT-LOUIS COUNTY.' == 'St. Louis', 'DONA ANA' == 'Doña Ana'."""
    n = (name or "").lower().strip()
    if not n.isascii():
        n = "".join(ch for ch in unicodedata.normalize("NFKD", n) if not unicodedata.combining(ch))
    if "saint" in n:
        n = re.sub(r"\bsaint(e?)\b", r"st\1", n)
    n, _ = drop_suffixes(n)
    return st, "".join(ch for ch in n if ch.isalnum())


def city_stem(key):
    """A county_key without the "city" it ends in: Care Compare's "RICHMOND CITY" is the atlas's "Richmond"."""
    st, n = key
    return st, n.removesuffix("city")


# named: {(state, normalized name): the atlas spelling} ("DeKalb", "Fond du Lac").
Counties = namedtuple("Counties", "centroid by_name shape name named")


def _polygons(g):
    """A TopoJSON geometry's polygons, each a list of arc-reference rings (outer ring first)."""
    return {"Polygon": [g.get("arcs", [])], "MultiPolygon": g.get("arcs", [])}.get(g["type"], [])


def read_counties(path):
    """Counties from us-atlas: centroid of each county's largest polygon by FIPS and by (state, normalized name),
    and each county's polygons ([outer ring, *hole rings] in lon/lat) and atlas name by FIPS."""
    topo = json.loads(Path(path).read_text(encoding="utf-8"))
    arcs = _decode_arcs(topo)
    out = Counties({}, {}, {}, {}, {})
    for g in topo["objects"]["counties"]["geometries"]:
        polys = [[_ring(arcs, r) for r in poly] for poly in _polygons(g)]
        if not polys:
            continue
        fips, name = str(g["id"]).zfill(5), g.get("properties", {}).get("name")
        _, lon, lat = max(_centroid(p[0]) for p in polys)
        out.centroid[fips], out.shape[fips], out.name[fips] = (lat, lon), polys, name
        st = STATE_FIPS.get(fips[:2])
        if st:
            out.by_name.setdefault(county_key(st, name), (lat, lon))
            out.named.setdefault(county_key(st, name), name)
    return out


def _in_ring(lat, lon, ring):
    """Ray-casting point-in-ring test (ring in lon/lat)."""
    inside = False
    for (x0, y0), (x1, y1) in _edges(ring):
        if (y0 > lat) != (y1 > lat) and lon < (x1 - x0) * (lat - y0) / (y1 - y0) + x0:
            inside = not inside
    return inside


def _edge_km(lat, lon, ring):
    """Distance in km from a point to the nearest edge of a ring (local equirectangular approximation)."""
    kx, ky = 111.32 * math.cos(math.radians(lat)), 110.57
    best = math.inf
    for (x0, y0), (x1, y1) in _edges(ring):
        ax, ay, bx, by = (x0 - lon) * kx, (y0 - lat) * ky, (x1 - lon) * kx, (y1 - lat) * ky
        dx, dy = bx - ax, by - ay
        t = 0.0 if dx == dy == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / (dx * dx + dy * dy)))
        best = min(best, math.hypot(ax + t * dx, ay + t * dy))
    return best


def km_outside(lat, lon, polys):
    """0 if the point is inside one of the county's polygons, else km to the nearest polygon edge."""
    if any(_in_ring(lat, lon, p[0]) and not any(_in_ring(lat, lon, h) for h in p[1:]) for p in polys):
        return 0.0
    return min(_edge_km(lat, lon, r) for p in polys for r in p)
