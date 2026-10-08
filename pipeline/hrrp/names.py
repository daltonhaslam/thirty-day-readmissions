"""Display casing for the all-caps names in CMS's Hospital General Information file."""
import re

ACRONYMS = {
    "UC", "UCSF", "UCLA", "UCSD", "UCI", "UNC", "UPMC", "HCA", "LLC", "MUSC", "OSF", "SSM", "CHI", "UAB", "UT",
    "UW", "VA", "NYU", "AMC", "II", "III", "IV", "JFK", "LDS", "MD", "DC", "ECU", "OU", "OHSU", "UNM", "UVA", "VCU",
    "WVU", "LSU", "USA", "US", "ICU", "TMC", "HSHS", "AHN", "SCL", "UI", "KU", "UK", "UTMB", "OSU", "IU", "HMH",
    "RWJ", "RWJBH", "NYC", "NY", "BJC", "SUNY", "UMC", "CHS", "AMG", "ACMC", "SJMC", "UNMC", "PAM", "LTAC", "SBH",
    "NCH", "CMC", "TJUH", "HSC", "AHMC", "SRMC", "RMC", "LAC", "USC", "MLK", "UIHC", "AHS", "CHRISTUS", "INTEGRIS",
    # state abbreviations that are not also common English words
    "TX", "NJ", "NC", "SC", "ND", "SD", "NM", "NH", "WV", "WI", "WA", "WY", "MN", "MS", "NV", "KY", "KS",
    "IA", "IL", "AZ", "AK", "CT", "FL", "GA", "RI", "VT", "TN",
}
# Brand camel-case that a capitalization rule cannot infer
SPECIAL = {"UMASS": "UMass", "UCHEALTH": "UCHealth", "MEDSTAR": "MedStar", "PROMEDICA": "ProMedica",
           "WELLSPAN": "WellSpan", "OHIOHEALTH": "OhioHealth", "ADVENTHEALTH": "AdventHealth",
           "HONORHEALTH": "HonorHealth", "BAYCARE": "BayCare", "MERCYONE": "MercyOne", "UNITYPOINT": "UnityPoint",
           "TRINITYHEALTH": "TrinityHealth", "UOFL": "UofL"}
# Vowel-less abbreviations that are words, not acronyms (title-cased, not upper-cased)
TITLE_ABBR = {"CTR", "CTRS", "HLTH", "HLTHCR", "MDL", "SVCS", "SYS", "CNTY", "RGNL", "REGL", "PKWY", "HWY", "BLVD",
              "MGMT", "ST", "MT", "FT", "DR", "JR", "SR"}
SMALL = {"of", "and", "the", "at", "in", "for", "on", "by", "to", "a"}
VOWELS = set("AEIOUY")


def _cap(word):
    if not word:
        return word
    up = word.upper()
    if up in SPECIAL:
        return SPECIAL[up]
    if up in ACRONYMS:
        return up
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
        after_sep = i > 0 and (tokens[i - 1] in SEPARATORS or tokens[i - 1].endswith(SEPARATORS))
        out.append(_word(t, lower_small=0 < i < len(tokens) - 1 and not after_sep))
    return " ".join(out)


def display_name(hgi_name, impact_name):
    """Care Compare's name, title-cased by our rules (kept as-is if already mixed case); impact name as fallback.

    The impact file's mixed case is itself mechanical ("Of", "Tx"), so it is not preferred.
    """
    if hgi_name:
        if hgi_name != hgi_name.upper():
            return " ".join(hgi_name.split())
        return smart_title(hgi_name)
    return " ".join(impact_name.split()) if impact_name else impact_name
