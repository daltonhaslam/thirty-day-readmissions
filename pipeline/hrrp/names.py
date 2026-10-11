"""Display casing for the all-caps names in CMS's Hospital General Information file."""
import re

ACRONYMS = {
    "UC", "UCSF", "UCLA", "UCSD", "UCI", "UNC", "UPMC", "HCA", "LLC", "MUSC", "OSF", "SSM", "CHI", "UAB", "UT",
    "UW", "VA", "NYU", "AMC", "II", "III", "IV", "JFK", "LDS", "MD", "DC", "ECU", "OU", "OHSU", "UNM", "UVA", "VCU",
    "WVU", "LSU", "USA", "US", "ICU", "TMC", "HSHS", "AHN", "SCL", "UI", "KU", "UK", "UTMB", "OSU", "IU", "HMH",
    "RWJ", "RWJBH", "NYC", "NY", "BJC", "SUNY", "UMC", "CHS", "AMG", "ACMC", "SJMC", "UNMC", "PAM", "LTAC", "SBH",
    "NCH", "CMC", "TJUH", "HSC", "AHMC", "SRMC", "RMC", "LAC", "USC", "MLK", "UIHC", "AHS", "CHRISTUS", "INTEGRIS",
    "ARH", "PIH", "UF", "UH", "CAMC", "LIJ", "SE",
    # state abbreviations that are not also common English words
    "TX", "NJ", "NC", "SC", "ND", "SD", "NM", "NH", "WV", "WI", "WA", "WY", "MN", "MS", "NV", "KY", "KS",
    "IA", "IL", "AZ", "AK", "CT", "FL", "GA", "RI", "VT", "TN",
}
# Brand camel-case that a capitalization rule cannot infer
SPECIAL = {"UMASS": "UMass", "UCHEALTH": "UCHealth", "MEDSTAR": "MedStar", "PROMEDICA": "ProMedica",
           "WELLSPAN": "WellSpan", "OHIOHEALTH": "OhioHealth", "ADVENTHEALTH": "AdventHealth",
           "HONORHEALTH": "HonorHealth", "BAYCARE": "BayCare", "MERCYONE": "MercyOne", "UNITYPOINT": "UnityPoint",
           "TRINITYHEALTH": "TrinityHealth", "UOFL": "UofL"}
# Vowel-less abbreviations that are words, not acronyms (title-cased, not upper-cased). Y counts as a vowel,
# so words like SYS or PKWY already title-case.
TITLE_ABBR = {"CTR", "CTRS", "HLTH", "HLTHCR", "MDL", "SVCS", "RGNL", "BLVD", "MGMT", "ST", "MT", "FT", "DR", "JR", "SR"}
# Words kept lower case wherever they appear ("dba" = doing business as)
LOWER = {"DBA"}
SMALL = {"of", "and", "the", "at", "in", "for", "on", "by", "to", "a"}
# A lone "A" is an initial ("Louis A Weiss") unless an article noun follows ("a Part of HCA", "a Campus of ...")
ARTICLE_NOUNS = {"part", "campus", "division", "member", "department", "facility", "subsidiary", "unit"}
VOWELS = set("AEIOUY")


def _cap(word):
    if not word:
        return word
    up = word.upper()
    if up in SPECIAL:
        return SPECIAL[up]
    if up in ACRONYMS:
        return up
    if up in LOWER:
        return word.lower()
    letters = re.sub(r"[^A-Z]", "", up)
    if letters in TITLE_ABBR:
        return up[:1] + up[1:].lower()
    if len(letters) >= 2 and not (set(letters) & VOWELS):
        return up
    if "'" in word:
        head, _, tail = word.partition("'")
        if len(head) == 1:  # O'CONNOR, D'IBERVILLE
            return head.upper() + "'" + _cap(tail)
        return head[:1].upper() + head[1:].lower() + "'" + tail.lower()
    if up.startswith("MC") and len(up) > 3 and up[2].isalpha():
        return "Mc" + up[2] + up[3:].lower()
    return up[:1] + up[1:].lower()


SEPARATORS = ("-", "\u2013", "/", ",", ":")


def _word(token, lower_small):
    m = re.match(r"^([^A-Za-z0-9]*)(.*?)([^A-Za-z0-9']*)$", token)
    pre, core, post = m.groups()
    if lower_small and core.lower() in SMALL:
        return pre + core.lower() + post
    parts = re.split(r"([-/])", core)
    return pre + "".join(p if p in "-/" else _cap(p) for p in parts) + post


def smart_title(name):
    if not name:
        return name
    tokens = []
    for t in name.split():  # join a detached prefix: 'MC DONOUGH' -> 'MCDONOUGH'
        if tokens and tokens[-1].upper() == "MC" and t[:1].isalpha():
            tokens[-1] += t
        else:
            tokens.append(t)
    out = []
    for i, t in enumerate(tokens):
        after_sep = i > 0 and tokens[i - 1].endswith(SEPARATORS)
        initial = t.upper() == "A" and 0 < i < len(tokens) - 1 and tokens[i + 1].lower() not in ARTICLE_NOUNS
        out.append(_word(t, lower_small=0 < i < len(tokens) - 1 and not after_sep and not initial))
    return " ".join(out)


# Comparing two names for `alias`: abbreviations expanded, filler dropped, and words that say what kind of place a
# hospital is (rather than which one) ignored.
EXPAND = {"st": "saint", "ste": "sainte", "mt": "mount", "ft": "fort", "ctr": "center", "cntr": "center",
          "centre": "center", "med": "medical", "mdl": "medical", "hosp": "hospital", "hosps": "hospitals",
          "mem": "memorial", "meml": "memorial", "reg": "regional", "rgnl": "regional", "regl": "regional",
          "hlth": "health", "hlthcr": "healthcare", "univ": "university", "comm": "community", "cmty": "community",
          "sys": "system", "svcs": "services", "gen": "general", "co": "county", "cnty": "county"}
FILLER = {"and", "the", "of", "at", "in", "for", "a", "an", "inc", "llc", "lp", "corp", "corporation", "dba", "campus"}
GENERIC = {"hospital", "hospitals", "medical", "center", "centers", "health", "healthcare", "system", "regional",
           "community", "memorial", "general", "county", "services", "university", "clinic", "clinics"}


def _words(name):
    words = (EXPAND.get(w, w) for w in re.findall(r"[a-z0-9]+", (name or "").lower().replace("'s", "s")))
    return [w for w in words if w not in FILLER]


def alias(shown, impact_name):
    """The impact file's name (title-cased) when it tells a reader something the shown name does not, else None.

    Material means fewer than half of the impact name's distinctive words appear in the shown name, as a word or
    inside a run-together word for words of 4+ letters ('AdventHealthManchester'), and the two names are not the
    same letters ('TJ Health' / 'T J Health'). E.g. Care Compare's 'Spectrum Health' gets 'Corewell Health Grand
    Rapids Hospitals Butterworth'.
    """
    if not shown or not impact_name:
        return None
    mine, theirs = _words(shown), _words(impact_name)
    distinct = [w for w in dict.fromkeys(theirs) if w not in GENERIC]
    compact = "".join(mine)
    found = sum(1 for w in distinct if w in mine or (len(w) >= 4 and w in compact))
    if compact == "".join(theirs) or found >= len(distinct) / 2:
        return None
    return smart_title(" ".join(impact_name.split()))


def display_name(hgi_name, impact_name):
    """Care Compare's name, title-cased by our rules (kept as-is if already mixed case); impact name as fallback.

    The impact file's mixed case is itself mechanical ("Of", "Tx"), so it is not preferred.
    """
    if hgi_name:
        if hgi_name != hgi_name.upper():
            return " ".join(hgi_name.split())
        return smart_title(hgi_name)
    return " ".join(impact_name.split()) if impact_name else impact_name
