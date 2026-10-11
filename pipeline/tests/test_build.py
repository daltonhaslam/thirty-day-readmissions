import json
import math
import re
import unittest
from pathlib import Path

from hrrp import geo, names

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "web" / "src" / "data" / "hrrp.json"


class NamesTest(unittest.TestCase):
    def test_title_cases_care_compare_name_even_when_impact_name_matches(self):
        self.assertEqual(names.display_name("DELL SETON  MED CENTER AT THE UNIVERSITY OF TX", "Dell Seton  Med Center At The University Of Tx"),
                         "Dell Seton Med Center at the University of TX")

    def test_keeps_names_that_are_already_mixed_case(self):
        self.assertEqual(names.display_name("McLaren Bay Region", None), "McLaren Bay Region")

    def test_splits_on_slashes(self):
        self.assertEqual(names.smart_title("SUNY/STONY BROOK UNIVERSITY HOSPITAL"), "SUNY/Stony Brook University Hospital")

    def test_smart_title_when_names_differ(self):
        self.assertEqual(names.display_name("ST. MARY'S MEDICAL CENTER OF EVANSVILLE", "Old Name"),
                         "St. Mary's Medical Center of Evansville")

    def test_keeps_acronyms_and_hyphens(self):
        self.assertEqual(names.smart_title("UCSF MEDICAL CENTER"), "UCSF Medical Center")
        self.assertEqual(names.smart_title("WAKE FOREST BAPTIST - WINSTON-SALEM"), "Wake Forest Baptist - Winston-Salem")
        self.assertEqual(names.smart_title("HCA FLORIDA JFK HOSPITAL"), "HCA Florida JFK Hospital")

    def test_mc_prefix(self):
        self.assertEqual(names.smart_title("MCALLEN MEDICAL CENTER"), "McAllen Medical Center")
        self.assertEqual(names.smart_title("LOUIS A WEISS MEMORIAL HOSPITAL"), "Louis A Weiss Memorial Hospital")
        self.assertEqual(names.smart_title("LAS PALMAS MEDICAL CENTER A CAMPUS OF LPDS"), "Las Palmas Medical Center a Campus of LPDS")

    def test_falls_back_to_impact_name_when_hgi_missing(self):
        self.assertEqual(names.display_name(None, "Some Hospital"), "Some Hospital")


class AliasTest(unittest.TestCase):
    def test_materially_different_impact_name_becomes_the_alias(self):
        self.assertEqual(names.alias("Spectrum Health", "Corewell Health Grand Rapids Hospitals Butterworth"),
                         "Corewell Health Grand Rapids Hospitals Butterworth")
        self.assertEqual(names.alias("Marion Communtiy Hospital", "Hca Florida Ocala Hospital"), "HCA Florida Ocala Hospital")
        self.assertEqual(names.alias("Ascension Providence Rochester Hospital", "Henry Ford Rochester Hospital"),
                         "Henry Ford Rochester Hospital")  # only 1 of 3 distinctive words shared

    def test_same_name_in_other_spelling_has_no_alias(self):
        for shown, impact in [("AdventHealthManchester", "AdventHealth Manchester"), ("TJ Health Columbia", "T J Health Columbia"),
                              ("Baptist Hlth Med Ctr", "Baptist Health Medical Center"), ("St. Mary's Hospital", "Saint Marys Hosp"),
                              ("Kershawhealth", "Kershaw Medical Center"), ("Memorial Hospital", "Memorial Hospital Inc")]:
            self.assertIsNone(names.alias(shown, impact), (shown, impact))

    def test_missing_names_have_no_alias(self):
        self.assertIsNone(names.alias("Some Hospital", None))
        self.assertIsNone(names.alias(None, "Some Hospital"))


class GeoTest(unittest.TestCase):
    def test_region_and_division(self):
        self.assertEqual(geo.region_of("UT"), ("West", "Mountain"))
        self.assertEqual(geo.region_of("DC"), ("South", "South Atlantic"))
        self.assertEqual(geo.region_of("ZZ"), (None, None))

    @unittest.skipUnless((RAW / "us_atlas_counties" / "counties-10m.json").exists(), "raw data not fetched")
    def test_county_centroid_salt_lake(self):
        counties = geo.read_counties(RAW / "us_atlas_counties" / "counties-10m.json")
        lat, lon = counties.centroid["49035"]
        self.assertEqual(counties.by_name[geo.county_key("UT", "SALT LAKE")], (lat, lon))
        self.assertEqual(counties.name["49035"], "Salt Lake")
        self.assertAlmostEqual(lat, 40.67, delta=0.3)
        self.assertAlmostEqual(lon, -111.92, delta=0.3)


SQUARE = [[(0.0, 0.0), (0.0, 1.0), (1.0, 1.0), (1.0, 0.0), (0.0, 0.0)]]  # ~111 km square county at the equator


class CountyLabelTest(unittest.TestCase):
    """build_data.county_label: Care Compare's county when the atlas knows it, else the impact-file county's name."""
    COUNTIES = geo.Counties(centroid={}, by_name={("DC", "districtofcolumbia"): (0, 0), ("VA", "richmond"): (0, 0)},
                            shape={}, name={"11001": "District of Columbia", "51760": "Richmond"})

    def label(self, st, county, fips):
        import build_data
        return build_data.county_label({"county": county}, st, fips, self.COUNTIES)

    def test_unknown_care_compare_county_falls_back_to_the_impact_file_county(self):
        self.assertEqual(self.label("DC", "THE DISTRICT", "11001"), "District of Columbia")

    def test_known_county_and_virginia_city_keep_care_compares_wording(self):
        self.assertEqual(self.label("DC", "DISTRICT OF COLUMBIA", "11001"), "District of Columbia")
        self.assertEqual(self.label("VA", "RICHMOND CITY", "51760"), "Richmond City")


class StrayPointTest(unittest.TestCase):
    """build_data.locate: a ZIP point far outside the impact-file county falls back to that county's centroid."""
    COUNTIES = geo.Counties(centroid={"99001": (0.5, 0.5), "99002": (9.0, 9.0)}, by_name={},
                            shape={"99001": [SQUARE]}, name={"99001": "Squareville"})
    HOSP = {"zip": "11111", "county": "Wrongshire"}
    IMP = {"fips": "99001"}

    def locate(self, zip_pt, imp=IMP, point=None, hosp=HOSP):
        import build_data
        return build_data.locate(hosp, imp, "ZZ", {"11111": zip_pt}, self.COUNTIES, point)

    def test_address_point_wins_and_corrects_a_care_compare_county_naming_elsewhere(self):
        self.assertEqual(self.locate((0.2, 0.3), point=(0.6, 0.6)), (0.6, 0.6, "address", "Squareville"))
        self.assertEqual(self.locate((0.2, 0.3), point=(0.6, 0.6), hosp={**self.HOSP, "county": "SQUAREVILLE"}),
                         (0.6, 0.6, "address", None))
        self.assertEqual(self.locate((0.2, 0.3), point=(0.6, 0.6), hosp={**self.HOSP, "county": "SQUAREVILLE CITY"}),
                         (0.6, 0.6, "address", None))

    def test_address_point_near_the_county_keeps_care_compare_county(self):
        self.assertEqual(self.locate((0.2, 0.3), point=(0.5, 1.2)), (0.5, 1.2, "address", None))  # ~22 km out

    def test_address_point_far_outside_falls_back_to_zip_logic(self):
        self.assertEqual(self.locate((0.2, 0.3), point=(0.5, 2.0)), (0.2, 0.3, "zip", None))  # ~111 km out
        self.assertEqual(self.locate((0.5, 2.0), point=(0.5, 2.0)), (0.5, 0.5, "county", "Squareville"))

    def test_address_point_for_a_county_missing_from_the_atlas_is_used(self):
        self.assertEqual(self.locate((0.2, 0.3), {"fips": "09110"}, point=(5.0, 5.0)), (5.0, 5.0, "address", None))

    def test_km_outside(self):
        self.assertEqual(geo.km_outside(0.5, 0.5, [SQUARE]), 0.0)
        self.assertAlmostEqual(geo.km_outside(0.5, 1.1, [SQUARE]), 11.1, delta=0.3)
        hole = [SQUARE[0], [(0.4, 0.4), (0.4, 0.6), (0.6, 0.6), (0.6, 0.4), (0.4, 0.4)]]
        self.assertAlmostEqual(geo.km_outside(0.5, 0.5, [hole]), 11.1, delta=0.3)  # nearest edge is the hole's

    def test_inside_keeps_zip(self):
        self.assertEqual(self.locate((0.2, 0.3)), (0.2, 0.3, "zip", None))

    def test_slightly_outside_keeps_zip(self):
        self.assertEqual(self.locate((0.5, 1.2)), (0.5, 1.2, "zip", None))  # ~22 km out

    def test_far_outside_uses_fips_centroid_and_name(self):
        self.assertEqual(self.locate((0.5, 2.0)), (0.5, 0.5, "county", "Squareville"))  # ~111 km out

    def test_fips_missing_from_atlas_keeps_zip(self):
        self.assertEqual(self.locate((5.0, 5.0), {"fips": "09110"}), (5.0, 5.0, "zip", None))
        self.assertEqual(self.locate((5.0, 5.0), {"fips": "99002"}), (5.0, 5.0, "zip", None))  # centroid known, no shape


@unittest.skipUnless(OUT.exists(), "run pipeline/build_data.py first")
class ContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.size = OUT.stat().st_size
        cls.d = json.loads(OUT.read_text())
        cls.h = cls.d["hospitals"]

    def test_size_budget(self):
        self.assertLess(self.size, 3_000_000)

    def test_ids_unique_and_well_formed(self):
        ids = [x["id"] for x in self.h]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertTrue(all(len(i) == 6 for i in ids))

    def test_paf_range_and_reduction_consistency(self):
        for x in self.h:
            self.assertTrue(0.97 <= x["paf"] <= 1.0, x["id"])
            self.assertAlmostEqual(x["red"], round((1 - x["paf"]) * 100, 2), places=6, msg=x["id"])

    def test_replication_and_geocode_coverage(self):
        self.assertEqual(self.d["meta"]["replication"], {"exact": len(self.h), "total": len(self.h)})
        with_geo = sum(1 for x in self.h if x["lat"] is not None)
        self.assertGreaterEqual(with_geo / len(self.h), 0.97)

    def test_site_arithmetic_reproduces_every_paf_from_the_json(self):
        """web/src/js/model.js contrib(): float sum in condition order, paf = round4(1 - round4(min(sum, cap)))."""
        def round4(v):  # JavaScript Math.round(v * 1e4) / 1e4: nearest, ties toward +infinity
            x = v * 1e4
            return (math.floor(x) + (x - math.floor(x) >= 0.5)) / 1e4
        meta, off = self.d["meta"], []
        for x in self.h:
            total = 0
            for k in ("AMI", "COPD", "HF", "PN", "CABG", "THA_TKA"):
                c, med = x["c"].get(k), meta["peerMedians"][str(x["peer"])][k]
                if c and (c["n"] or 0) >= 25 and c["err"] is not None and c["ratio"] is not None:
                    total += meta["nm"] * c["ratio"] * max(c["err"] - med, 0)
            if abs(round4(1 - round4(min(total, 0.03))) - x["paf"]) > 1e-9:
                off.append(x["id"])
        self.assertEqual(off, [])

    def test_hospital_with_no_flags_has_no_penalty(self):
        zero = [x for x in self.h if all(c["flag"] == 0 for c in x["c"].values())]
        self.assertTrue(zero)
        for x in zero:
            self.assertEqual(x["paf"], 1.0, x["id"])

    def test_conditions_without_discharges_are_omitted(self):
        for x in self.h:
            for k, c in x["c"].items():
                self.assertFalse(c["n"] is None and c["err"] is None, (x["id"], k))

    def test_readme_headline_numbers_match_the_data(self):
        text = (ROOT / "README.md").read_text(encoding="utf-8")
        count = lambda pattern: [int(g.replace(",", "")) for g in re.search(pattern, text).groups()]  # noqa: E731
        fy, n_pen, n = count(r"For fiscal year (\d{4}) .*?cut payments at ([\d,]+) of the\s+([\d,]+) hospitals it evaluated")
        self.assertEqual((fy, n_pen, n), (self.d["meta"]["fy"], sum(1 for x in self.h if x["paf"] < 1), len(self.h)))
        self.assertIn(f"FY{fy} edition", text)
        (exact,) = count(r"reproduces it exactly for all\s+([\d,]+) hospitals")
        self.assertEqual(exact, self.d["meta"]["replication"]["exact"])
        self.assertEqual(exact, len(self.h))

    def test_dollar_check_is_copied_from_content(self):
        dc = self.d["meta"]["dollarCheck"]
        self.assertEqual(dc, json.loads((ROOT / "pipeline" / "content" / "dollar_check.json").read_text(encoding="utf-8")))
        self.assertEqual(set(dc), {"asOf", "source", "costFy", "n", "rateDrift", "within10", "within15", "within15Small",
                                   "within15Large", "note"})
        self.assertIn(f"FY{dc['costFy']}", dc["source"])
        self.assertTrue(all(0 < dc[k] <= 100 for k in ("within10", "within15", "within15Small", "within15Large")))

    def test_whats_new_is_for_this_fiscal_year(self):
        items = self.d["meta"]["whatsNew"]
        self.assertTrue(items)
        self.assertTrue(all(set(i) == {"title", "body"} for i in items))

    def test_peer_medians_cover_every_group_and_condition(self):
        pm = self.d["meta"]["peerMedians"]
        self.assertEqual(sorted(pm), ["1", "2", "3", "4", "5"])
        for g in pm.values():
            self.assertEqual(sorted(g), sorted(["AMI", "COPD", "HF", "PN", "CABG", "THA_TKA"]))

    def test_hospital_without_a_name_in_cms_files_is_labeled(self):
        x = next(x for x in self.h if x["id"] == "420117")
        self.assertEqual(x["name"], "Hospital 420117 (name not in CMS files)")

    def test_ownership_prefers_care_compare(self):
        x = next(x for x in self.h if x["id"] == "010012")
        self.assertEqual((x["own"], x["ownDetail"]), ("For-profit", "Proprietary"))

    def test_missing_geo_is_null_not_zero(self):
        for x in self.h:
            if x["geo"] is None:
                self.assertIsNone(x["lat"])
                self.assertIsNone(x["lon"])
            else:
                self.assertIn(x["geo"], ("address", "zip", "county"))

    def test_contract_keys(self):
        self.assertEqual(set(self.d), {"meta", "conditions", "hospitals", "history", "timeline", "research", "geo"})
        self.assertEqual([c["key"] for c in self.d["conditions"]], ["AMI", "COPD", "HF", "PN", "CABG", "THA_TKA"])
        keys = {"id", "name", "city", "st", "county", "zip", "lat", "lon", "geo", "cbsa", "cbsaName", "urban", "region",
                "division", "beds", "teach", "own", "ownDetail", "star", "types", "paf", "red", "dual", "peer", "base", "pen", "c"}
        for x in self.h:  # alias, bedsSrc, and inactive are left out rather than null
            self.assertTrue(keys <= set(x) <= keys | {"alias", "bedsSrc", "inactive"}, x["id"])
            self.assertNotIn(None, (x.get("alias", ""), x.get("bedsSrc", ""), x.get("inactive", {})), x["id"])
        self.assertEqual({x["bedsSrc"] for x in self.h if "bedsSrc" in x}, {"cr"})  # only the cost-report fallback
        self.assertEqual({tuple(x["inactive"]) for x in self.h if "inactive" in x}, {("date", "reason")})
        self.assertEqual(set(self.h[0]["c"]["HF"]), {"n", "err", "flag", "ratio"})
        self.assertEqual(len(self.d["meta"]["peerCutoffs"]), 5)



class HistorySummaryTest(unittest.TestCase):
    def test_summarize_fy_reproduces_historical_csv_definitions(self):
        import csv
        from hrrp import history
        hist = ROOT / "pipeline" / "history"
        with open(hist / "hrrp_paf_history_fy2013_2026.csv", newline="") as f:
            pafs = [float(r["paf"]) for r in csv.DictReader(f) if r["fy"] == "2026" and not r["scope_flag"]]
        row = next(r for r in history.load_national(hist / "hrrp_history_summary.csv") if r["fy"] == 2026)
        got = history.summarize_fy(2026, pafs, cap_pct=3)
        for k in ("n", "nPen", "pctPen", "nMax", "cap"):
            self.assertEqual(got[k], row[k], k)
        for k in ("meanRed", "meanRedPen", "medianRedPen"):
            self.assertAlmostEqual(got[k], row[k], places=3, msg=k)

    def test_summarize_fy_handles_no_penalized_hospitals(self):
        from hrrp import history
        got = history.summarize_fy(2030, [1.0, 1.0], cap_pct=3)
        self.assertEqual((got["nPen"], got["meanRedPen"], got["medianRedPen"]), (0, 0, 0))
        self.assertEqual(history.summarize_fy(2030, [], cap_pct=3)["n"], 0)


class NamesEdgeTest(unittest.TestCase):
    def test_health_system_acronyms(self):
        for raw, want in [("WHITESBURG ARH HOSPITAL", "Whitesburg ARH Hospital"), ("PIH HEALTH DOWNEY HOSPITAL", "PIH Health Downey Hospital"),
                          ("UF HEALTH SHANDS HOSPITAL", "UF Health Shands Hospital"), ("UH REGIONAL HOSPITALS", "UH Regional Hospitals"),
                          ("CAMC CHARLESTON SURGICAL HOSPITAL", "CAMC Charleston Surgical Hospital"),
                          ("NS/LIJ HS SOUTHSIDE HOSPITAL", "NS/LIJ HS Southside Hospital"),
                          ("OSF SAINT ELIZABETH MDL CTR", "OSF Saint Elizabeth Mdl Ctr"),
                          ("ASCENSION SE WISCONSIN HOSPITAL", "Ascension SE Wisconsin Hospital")]:
            self.assertEqual(names.smart_title(raw), want)

    def test_dba_is_lower_case(self):
        self.assertEqual(names.smart_title("HCA-HEALTHONE DBA SWEDISH MEDICAL CENTER"), "HCA-Healthone dba Swedish Medical Center")
        self.assertEqual(names.smart_title("COLISEUM MEDICAL CENTERS, LLC, DBA"), "Coliseum Medical Centers, LLC, dba")

    def test_mount_abbreviation(self):
        self.assertEqual(names.smart_title("MT SINAI HOSPITAL MEDICAL CENTER"), "Mt Sinai Hospital Medical Center")

    def test_common_abbreviations_are_title_cased(self):
        self.assertEqual(names.smart_title("BAPTIST HLTH MED CTR"), "Baptist Hlth Med Ctr")
        self.assertEqual(names.smart_title("UOFL HEALTH - JEWISH HOSPITAL"), "UofL Health - Jewish Hospital")

    def test_detached_mc_prefix_joins(self):
        self.assertEqual(names.smart_title("MC DONOUGH DISTRICT HOSPITAL"), "McDonough District Hospital")
        self.assertEqual(names.smart_title("MC KINNEY"), "McKinney")

    def test_articles_after_separators_or_at_end_stay_capitalized(self):
        self.assertEqual(names.smart_title("VILLAGES REGIONAL HOSPITAL, THE"), "Villages Regional Hospital, The")
        self.assertEqual(names.smart_title("DELTA HEALTH SYSTEM - THE MEDICAL CENTER"), "Delta Health System - The Medical Center")
        self.assertEqual(names.smart_title("CENTER OF THE ROCKIES"), "Center of the Rockies")


@unittest.skipUnless((RAW / "hrrp_supplemental_fy2027").exists() and OUT.exists(), "raw data not fetched")
class FreshBuildTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import build_data
        cls.built = json.loads(json.dumps(build_data.build(), ensure_ascii=False))
        cls.committed = json.loads(OUT.read_text(encoding="utf-8"))
        cls.by_id = {x["id"]: x for x in cls.built["hospitals"]}

    def test_committed_json_matches_a_fresh_build(self):
        self.assertEqual(self.built, self.committed, "web/src/data/hrrp.json is stale: run pipeline/build_data.py")

    def test_mdh_hospitals_are_tagged(self):
        self.assertGreater(sum(1 for x in self.built["hospitals"] if "MDH" in x["types"]), 100)

    def test_connecticut_po_box_zip_hospital_is_placed_by_street_address(self):
        x = self.by_id["070005"]  # Waterbury Hospital, New Haven County; its ZIP is a PO-box ZIP with no centroid
        self.assertEqual((x["geo"], x["county"]), ("address", "New Haven"))
        self.assertAlmostEqual(x["lat"], 41.56, delta=0.02)
        self.assertEqual(self.built["meta"]["geocode"]["none"], 0)

    def test_street_addresses_fix_points_and_counties_the_zip_got_wrong(self):
        for ccn, county, lat, lon in [("020012", "Fairbanks North Star", 64.83, -147.74),  # Fairbanks Memorial
                                      ("230216", "St. Clair", 42.99, -82.43),  # McLaren Port Huron
                                      ("140013", "Peoria", 40.75, -89.59),  # Carle Proctor
                                      ("050030", "Butte", 39.50, -121.54)]:  # Oroville Hospital
            x = self.by_id[ccn]
            self.assertEqual((x["geo"], x["county"]), ("address", county), ccn)
            self.assertAlmostEqual(x["lat"], lat, delta=0.01, msg=ccn)
            self.assertAlmostEqual(x["lon"], lon, delta=0.01, msg=ccn)
        self.assertGreater(self.built["meta"]["geocode"]["address"], 2400)

    def test_beds_come_from_certified_counts(self):
        for ccn, n in [("360375", 30), ("220052", 205), ("240010", 2059)]:
            self.assertEqual((self.by_id[ccn]["beds"], self.by_id[ccn].get("bedsSrc")), (n, None), ccn)
        self.assertGreater(sum(1 for x in self.built["hospitals"] if x["beds"] and "bedsSrc" not in x), 2900)

    def test_inactive_hospitals_stay_in_the_data(self):
        off = {x["id"]: x["inactive"] for x in self.built["hospitals"] if "inactive" in x}
        self.assertEqual(len(off), 21)
        self.assertEqual(off["140082"], {"date": "2025-08-09", "reason": "terminated for failing health and safety requirements"})
        self.assertEqual(self.built["meta"]["replication"]["total"], len(self.built["hospitals"]))

    def test_mdh_base_adds_the_hospital_specific_add_on_for_oct_to_dec(self):
        import build_data
        from hrrp import model, parse
        self.assertEqual(self.built["meta"]["mdh"], {"endDate": "2026-12-31", "maxShortfall": 33})
        imp = parse.read_impact(build_data.path("impact"), build_data.FY, build_data.GROUPER)["360123"]  # UH St John
        federal = model.est_base_payment(imp, self.built["meta"]["rates"])
        self.assertIn("MDH", self.by_id["360123"]["types"])
        self.assertEqual(self.by_id["360123"]["base"], round(federal + model.est_mdh_addon(imp, federal, 92 / 365)))
        self.assertGreater(self.by_id["360123"]["base"], federal * 1.15)

    def test_aliases_only_for_care_compare_names(self):
        self.assertEqual(self.by_id["230038"]["alias"], "Corewell Health Grand Rapids Hospitals Butterworth")
        self.assertNotIn("alias", self.by_id["420117"])  # no Care Compare name: nothing to alias
        self.assertTrue(50 <= sum(1 for x in self.built["hospitals"] if "alias" in x) <= 120)


class ProviderOfServicesTest(unittest.TestCase):
    def test_certified_beds_win_whenever_present(self):
        import build_data
        self.assertEqual(build_data.beds(155, 240), (240, "pos"))
        self.assertEqual(build_data.beds(1, 30), (30, "pos"))
        self.assertEqual(build_data.beds(120, None), (120, "cr"))
        self.assertEqual(build_data.beds(None, None), (None, None))

    def test_inactive_uses_the_official_code_meaning(self):
        import build_data
        self.assertIsNone(build_data.inactive({"term": "00", "termDate": None}))
        self.assertIsNone(build_data.inactive({}))
        self.assertEqual(build_data.inactive({"term": "01", "termDate": "2024-08-31"}),
                         {"date": "2024-08-31", "reason": "merger or closure"})

    def test_only_codes_01_to_07_end_participation(self):
        import build_data
        from hrrp import parse
        self.assertIsNone(build_data.inactive({"term": "80", "termDate": None}))  # awaiting state approval
        self.assertEqual(sorted(k for k, v in parse.POS_TERMINATION.items() if v), [f"0{i}" for i in range(1, 8)])

    def test_a_termination_without_a_date_keeps_a_null_date(self):
        import build_data
        self.assertEqual(build_data.inactive({"term": "05", "termDate": None}),
                         {"date": None, "reason": "terminated for failing health and safety requirements"})


class MdhShareTest(unittest.TestCase):
    def test_shortfall_skips_mdhs_with_no_federal_base(self):
        import build_data
        addons = {"360001": (100.0, 10.0, 40.0), "360002": (0.0, 0.0, 0.0), "360003": (0, 0.0, 5.0)}
        self.assertEqual(build_data.mdh_shortfall(addons), {"360001": 100 * (1 - 110 / 140)})
        self.assertEqual(build_data.mdh_shortfall({}), {})

    def test_share_of_fiscal_year_before_mdh_status_ends(self):
        import build_data
        self.assertEqual(build_data.year_share(2027, "2026-12-31"), 92 / 365)  # Oct 1 - Dec 31, 2026
        self.assertEqual(build_data.year_share(2027, "2026-06-30"), 0)
        self.assertEqual(build_data.year_share(2027, "2028-09-30"), 1)
        self.assertEqual(build_data.year_share(2028, "2028-09-30"), 1)  # leap-year FY: 366 of 366


class PrecisionTest(unittest.TestCase):
    """build_data's checks that the Excel workbook and the tab-delimited export hold the same table."""
    FULL = {"010001": {"paf": 0.9863, "dual": 0.15625, "peer": 1, "nm": 0.96284743999129252,
                       "c": {"HF": {"n": 601, "err": 1.08989959713565, "med": 0.99283380046303704, "flag": 1,
                                    "ratio": 0.032458421638130501}}}}
    PUBLISHED = {"010001": {"paf": 0.9863, "dual": 0.1563, "peer": 1, "nm": 0.9628,
                            "c": {"HF": {"n": 601, "err": 1.0899, "med": 0.9928, "flag": 1, "ratio": 0.0325}}}}

    def test_cms_rounds_half_up(self):
        import build_data
        self.assertEqual([build_data.rnd(v, 4, half_up=True) for v in (0.15625, 0.98625, None)], [0.1563, 0.9863, None])
        self.assertEqual([build_data.rnd(v, 4) for v in (0.15625, None)], [0.1562, None])

    def test_workbook_value_is_compared_as_excel_shows_it(self):
        import build_data
        v = 0.12344999999999999  # a different double from 0.12345; Excel shows it, to 15 digits, as 0.12345
        self.assertNotEqual(v, 0.12345)
        self.assertEqual(build_data.rnd(v, 4, half_up=True), 0.1235)
        full = {"010001": {**self.FULL["010001"], "dual": v}}
        self.assertEqual(build_data.precision_mismatches(full, {"010001": {**self.PUBLISHED["010001"], "dual": 0.1235}}), [])

    def test_to_fixed4_is_javascripts(self):
        import build_data
        # 1.02485 and 0.06145 are stored just above and below the tie; 0.03125 is an exact tie, which goes up.
        self.assertEqual([str(build_data.to_fixed4(v)) for v in (1.02485, 0.06145, 0.03125, 1.0)],
                         ["1.0249", "0.0614", "0.0313", "1.0000"])

    def test_matching_tables_pass(self):
        import build_data
        self.assertEqual(build_data.precision_mismatches(self.FULL, self.PUBLISHED), [])

    def test_mis_mapped_column_is_caught(self):
        import build_data
        hf = self.PUBLISHED["010001"]["c"]["HF"]
        swapped = {"010001": {**self.PUBLISHED["010001"], "c": {"HF": {**hf, "err": hf["med"], "med": hf["err"]}}}}
        self.assertEqual(build_data.precision_mismatches(self.FULL, swapped), [("010001", "HF.err"), ("010001", "HF.med")])
        self.assertEqual(build_data.precision_mismatches(self.FULL, {}), [("010001", "missing")])

    def test_stored_values_are_rounded_to_decimals(self):
        import build_data
        s = build_data.as_stored("010001", self.FULL["010001"], self.PUBLISHED["010001"], 0.962847, {"HF": 0.992834})
        self.assertEqual((s["nm"], s["c"]["HF"]["med"], s["c"]["HF"]["err"], s["c"]["HF"]["n"]),
                         (0.962847, 0.992834, round(1.08989959713565, build_data.DECIMALS), 601))

    def test_group_constants_are_checked_at_full_precision_then_stored_once(self):
        import build_data
        full = {"a": 0.96284743999129252, "b": 0.96284743999129252}
        self.assertEqual(build_data.stored_constant(["a", "b"], full.get, lambda c: 0.9628, "nm"), 0.962847)
        self.assertEqual(build_data.stored_constant(["a"], lambda c: 0.06145, lambda c: 0.0615, "peer 1 HF median"), 0.061451)
        with self.assertRaisesRegex(SystemExit, "peer 2 HF median is not constant"):
            build_data.stored_constant(["a", "b"], {"a": 0.9928, "b": 0.99280001}.get, lambda c: 0.9928, "peer 2 HF median")
        with self.assertRaisesRegex(SystemExit, "peer 3 AMI median is not constant: \\[\\]"):
            build_data.stored_constant([], full.get, lambda c: 0.9628, "peer 3 AMI median")

    def test_stored_values_get_more_decimals_until_the_site_prints_cms_value(self):
        import build_data
        self.assertEqual(build_data.DECIMALS, 6)
        self.assertEqual(build_data.stored(1.02484970123, 1.0248, "x"), 1.0248497)  # 1.02485 would print 1.0249
        self.assertEqual(build_data.stored(0.06145012, 0.0615, "x"), 0.0614501)  # 0.06145 would print 0.0614
        self.assertEqual(build_data.stored(1.08989959713565, 1.0899, "x"), 1.0899)
        self.assertIsNone(build_data.stored(None, None, "x"))
        with self.assertRaisesRegex(SystemExit, "010001 AMI.err: 1.0251 does not print as CMS's 1.0248"):
            build_data.stored(1.0251, 1.0248, "010001 AMI.err")

    def test_an_exact_tie_no_rounding_fixes_moves_one_unit_toward_cms_value(self):
        import build_data
        from decimal import Decimal
        # The double 0.06145 is 0.061449999...: Excel (15 digits) shows 0.06145 and CMS 0.0615, but every rounding of it
        # is 0.06145 again, which toFixed(4) prints 0.0614.
        self.assertEqual({round(0.06145, d) for d in range(build_data.DECIMALS, build_data.MAX_DECIMALS + 1)}, {0.06145})
        self.assertEqual(build_data.rnd(0.06145, 4, half_up=True), 0.0615)
        v = build_data.stored(0.06145, 0.0615, "x")
        self.assertEqual((v, str(build_data.to_fixed4(v))), (0.061451, "0.0615"))
        # The same just above a tie that CMS rounded down: 1.02484999999999 rounds to 1.02485, which prints 1.0249.
        v = build_data.stored(1.02484999999999, 1.0248, "x")
        self.assertEqual((v, str(build_data.to_fixed4(v))), (1.024849, "1.0248"))
        # Plain rounding at any precision still wins over a move.
        self.assertEqual(build_data.stored(0.06145012, 0.0615, "x"), 0.0614501)

    def test_replication_gate_names_every_hospital_and_both_causes(self):
        import build_data
        from hrrp.parse import CONDITIONS
        none = {"n": None, "err": None, "med": None, "flag": 0, "ratio": None}
        hf = {"n": 601, "err": 1.0899, "med": 0.9928, "flag": 1, "ratio": 0.0325}  # 0.9628 x 0.0325 x 0.0971 = 0.0030
        ok = {"paf": 0.997, "nm": 0.9628, "c": {**{k: none for k in CONDITIONS}, "HF": hf}}
        build_data.replication_gate({"010001": ok})
        no_weight = {**ok, "c": {**ok["c"], "HF": {**hf, "ratio": None}}}  # flagged, CMS counted it, no weight published
        with self.assertRaises(SystemExit) as e:
            build_data.replication_gate({"010001": ok, "010002": no_weight, "010003": no_weight})
        msg = str(e.exception)
        self.assertIn("2 hospitals: 010002, 010003.", msg)
        self.assertIn("raise DECIMALS", msg)
        self.assertIn("payment weight", msg)


class DollarCheckTest(unittest.TestCase):
    GOOD = {"asOf": "2026-10-11", "source": "Medicare cost reports", "costFy": 2024, "n": 2845, "rateDrift": 1.066,
            "within10": 73.4, "within15": 85.0, "within15Small": 73.7, "within15Large": 89.6, "note": "optional"}

    def load(self, rec):
        import build_data
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "dollar_check.json"
            p.write_text(json.dumps(rec), encoding="utf-8")
            return build_data.load_dollar_check(p)

    def test_a_missing_dollar_check_fails_the_build(self):
        import build_data
        with self.assertRaisesRegex(SystemExit, r"dollar_check\.json is missing\. It is a dated result of the October 2026 "
                                    r"comparison .* No script makes it: update it by hand when that comparison is redone\."):
            build_data.load_dollar_check(Path(__file__).parent / "fixtures" / "dollar_check.json")
        self.assertEqual(build_data.load_dollar_check()["costFy"], 2024)

    def test_a_complete_record_loads_as_written(self):
        self.assertEqual(self.load(self.GOOD), self.GOOD)
        self.assertEqual(self.load({**self.GOOD, "n": 2845.0, "within15": 85})["within15"], 85)

    def test_a_missing_field_fails_the_build_naming_it(self):
        rec = {k: v for k, v in self.GOOD.items() if k not in ("within15Large", "asOf")}
        with self.assertRaises(SystemExit) as e:
            self.load(rec)
        msg = str(e.exception)
        self.assertIn("asOf is missing; within15Large is missing.", msg)
        self.assertIn("update it by hand when that comparison is redone", msg)
        with self.assertRaisesRegex(SystemExit, "asOf is missing; source is missing; costFy is missing"):
            self.load([])

    def test_a_malformed_field_fails_the_build_naming_it(self):
        for field, bad, want in [("asOf", "Oct 2026", "a YYYY-MM-DD date"), ("asOf", "2026-02-30", "a YYYY-MM-DD date"),
                                 ("source", "", "a non-empty string"), ("source", 7, "a non-empty string"),
                                 ("costFy", "2024", "an integer"), ("costFy", 2024.0, "an integer"), ("costFy", True, "an integer"),
                                 ("n", None, "a number"), ("rateDrift", "1.066", "a number"), ("within15", True, "a number"),
                                 ("within10", float("nan"), "a number")]:
            with self.subTest(field=field, bad=bad), self.assertRaisesRegex(SystemExit, f"{field} should be {want}, not "):
                self.load({**self.GOOD, field: bad})


@unittest.skipUnless((RAW / "hrrp_supplemental_fy2027").exists() and OUT.exists(), "raw data not fetched")
class PublishedDigitsTest(unittest.TestCase):
    """Every ERR, DRG ratio, peer median, and the neutrality modifier in hrrp.json prints, with JavaScript's toFixed(4),
    as CMS's tab-delimited file shows it."""

    def test_stored_values_print_as_cms_publishes_them(self):
        import build_data
        from decimal import Decimal
        from hrrp import parse
        pub = parse.read_supplemental(build_data.path("supp"))
        d = json.loads(OUT.read_text(encoding="utf-8"))
        off, n = [], 0
        def check(v, want, label):
            nonlocal n
            if v is not None:
                n += 1
                if build_data.to_fixed4(v) != Decimal(repr(want)):
                    off.append((label, v, want))
        for x in d["hospitals"]:
            for k, c in x["c"].items():
                for f in ("err", "ratio"):
                    check(c[f], pub[x["id"]]["c"][k][f], f"{x['id']} {k}.{f}")
                check(d["meta"]["peerMedians"][str(x["peer"])][k], pub[x["id"]]["c"][k]["med"], f"{x['id']} {k}.med")
            check(d["meta"]["nm"], pub[x["id"]]["nm"], f"{x['id']} nm")
        self.assertEqual(off, [])
        self.assertGreater(n, 28000)
