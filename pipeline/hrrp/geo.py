"""State → census region/division, and county centroids decoded from us-atlas TopoJSON."""
import json

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
STATE_NAMES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California", "CO": "Colorado",
    "CT": "Connecticut", "DE": "Delaware", "DC": "District of Columbia", "FL": "Florida", "GA": "Georgia",
    "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas",
    "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland", "MA": "Massachusetts",
    "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi", "MO": "Missouri", "MT": "Montana",
    "NE": "Nebraska", "NV": "Nevada", "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico",
    "NY": "New York", "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma",
    "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina", "SD": "South Dakota",
    "TN": "Tennessee", "TX": "Texas", "UT": "Utah", "VT": "Vermont", "VA": "Virginia", "WA": "Washington",
    "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming", "PR": "Puerto Rico",
}
STATE_FIPS = {
    "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT", "10": "DE", "11": "DC",
    "12": "FL", "13": "GA", "15": "HI", "16": "ID", "17": "IL", "18": "IN", "19": "IA", "20": "KS", "21": "KY",
    "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN", "28": "MS", "29": "MO", "30": "MT",
    "31": "NE", "32": "NV", "33": "NH", "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND", "39": "OH",
    "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD", "47": "TN", "48": "TX", "49": "UT",
    "50": "VT", "51": "VA", "53": "WA", "54": "WV", "55": "WI", "56": "WY", "72": "PR",
}


def region_of(st):
    return STATE_REGION.get(st, (None, None))


def _decode_arcs(topo):
    t = topo.get("transform")
    sx, sy = t["scale"] if t else (1, 1)
    tx, ty = t["translate"] if t else (0, 0)
    arcs = []
    for arc in topo["arcs"]:
        x = y = 0
        pts = []
        for p in arc:
            if t:
                x += p[0]
                y += p[1]
            else:
                x, y = p[0], p[1]
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


def county_centroids(path):
    """{county FIPS: (lat, lon)} using the largest polygon of each county."""
    topo = json.loads(open(path).read())
    arcs = _decode_arcs(topo)
    out = {}
    for g in topo["objects"]["counties"]["geometries"]:
        polys = [g["arcs"]] if g["type"] == "Polygon" else g["arcs"] if g["type"] == "MultiPolygon" else []
        best = None
        for poly in polys:
            area, lon, lat = _centroid(_ring(arcs, poly[0]))
            if best is None or area > best[0]:
                best = (area, lon, lat)
        if best:
            out[str(g["id"]).zfill(5)] = (best[2], best[1])
    return out
