"""The HRRP payment-reduction formula and the dollar estimate.

Formula (CMS Payment Reduction Methodology, FY2019+ peer grouping):
    contribution_c = NM x DRG ratio_c x max(ERR_c - peer median ERR_c, 0)
        counted only when eligible discharges_c >= 25 and ERR_c > peer median
    reduction = min(sum of contributions, 0.03);  PAF = 1 - reduction
"""
from hrrp.parse import CONDITIONS

MIN_DISCHARGES = 25
CAP = 0.03


def contribution(nm, c):
    n, err, med, ratio = c.get("n"), c.get("err"), c.get("med"), c.get("ratio")
    if nm is None or err is None or med is None or ratio is None or (n or 0) < MIN_DISCHARGES:
        return 0.0
    return nm * ratio * max(err - med, 0.0)


def contributions(h):
    return {k: contribution(h["nm"], h["c"][k]) for k in CONDITIONS}


def reduction(h):
    return min(sum(contributions(h).values()), CAP)


def replication_status(h):
    """'exact' when the recomputed PAF equals CMS's 4-decimal PAF; 'rounding' when it is off by one unit in the
    4th decimal (CMS computes from unrounded ERRs and ratios; the file publishes them rounded); else 'mismatch'."""
    diff = abs((1 - round(reduction(h), 4)) - h["paf"])
    if diff < 1e-9:
        return "exact"
    return "rounding" if diff <= 0.0001 + 1e-9 else "mismatch"


def replicates(h):
    return replication_status(h) != "mismatch"


def est_base_payment(imp, rates):
    """Estimated annual Medicare FFS base operating DRG payments (federal rate only).

    cases x CMI x (labor amount x wage index + non-labor amount x COLA), with the
    standardized amounts from Table 1A (wage index > 1) or 1B (<= 1) chosen by the
    hospital's quality-reporting and EHR status.
    """
    if not imp or any(imp.get(k) is None for k in ("cases", "cmi", "wi")):
        return None
    table = "1A" if imp["wi"] > 1 else "1B"
    col = ("n" if imp.get("qual_red") else "q") + ("n" if imp.get("ehr_red") else "e")
    labor, nonlabor = rates[table][col]
    return imp["cases"] * imp["cmi"] * (labor * imp["wi"] + nonlabor * (imp.get("cola") or 1.0))


def est_penalty(base, paf):
    if base is None or paf is None:
        return None
    return base * (1 - paf)
