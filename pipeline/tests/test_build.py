import json
import math
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

    def test_falls_back_to_impact_name_when_hgi_missing(self):
        self.assertEqual(names.display_name(None, "Some Hospital"), "Some Hospital")


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


class StrayPointTest(unittest.TestCase):
    """build_data.locate: a ZIP point far outside the impact-file county falls back to that county's centroid."""
    COUNTIES = geo.Counties(centroid={"99001": (0.5, 0.5), "99002": (9.0, 9.0)}, by_name={},
                            shape={"99001": [SQUARE]}, name={"99001": "Squareville"})
    HOSP = {"zip": "11111", "county": "Wrongshire"}
    IMP = {"fips": "99001"}

    def locate(self, zip_pt, imp=IMP):
        import build_data
        return build_data.locate(self.HOSP, imp, "ZZ", {"11111": zip_pt}, self.COUNTIES)

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
        rep = self.d["meta"]["replication"]
        self.assertEqual((rep["exact"], rep["rounding"], rep["mismatches"]), (rep["total"], 0, []))
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
                self.assertIn(x["geo"], ("zip", "county"))

    def test_contract_keys(self):
        self.assertEqual(set(self.d), {"meta", "conditions", "hospitals", "history", "timeline", "research", "geo"})
        self.assertEqual([c["key"] for c in self.d["conditions"]], ["AMI", "COPD", "HF", "PN", "CABG", "THA_TKA"])
        keys = {"id", "name", "city", "st", "county", "zip", "lat", "lon", "geo", "cbsa", "cbsaName", "urban", "region",
                "division", "beds", "bedsSrc", "teach", "own", "ownDetail", "star", "types", "inactive", "paf", "red",
                "dual", "peer", "base", "pen", "c"}
        self.assertEqual(set(self.h[0]), keys)
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

    def test_connecticut_po_box_hospitals_are_placed_in_their_care_compare_county(self):
        x = self.by_id["070005"]  # Waterbury Hospital, New Haven County
        self.assertEqual(x["geo"], "county")
        self.assertAlmostEqual(x["lat"], 41.4, delta=0.3)
        self.assertEqual(self.built["meta"]["geocode"]["none"], 0)

    def test_stray_zip_points_are_moved_to_their_impact_file_county(self):
        for ccn, county in [("020012", "Fairbanks North Star"), ("230216", "St. Clair"), ("140013", "Peoria")]:
            self.assertEqual((self.by_id[ccn]["geo"], self.by_id[ccn]["county"]), ("county", county), ccn)

    def test_beds_come_from_certified_counts(self):
        for ccn, n in [("360375", 30), ("220052", 205), ("240010", 2059)]:
            self.assertEqual((self.by_id[ccn]["beds"], self.by_id[ccn]["bedsSrc"]), (n, "pos"), ccn)
        self.assertGreater(sum(1 for x in self.built["hospitals"] if x["bedsSrc"] == "pos"), 2900)

    def test_inactive_hospitals_stay_in_the_data(self):
        off = {x["id"]: x["inactive"] for x in self.built["hospitals"] if x["inactive"]}
        self.assertEqual(len(off), 21)
        self.assertEqual(off["140082"], {"date": "2025-08-09", "code": "05",
                                         "reason": "terminated for failing health and safety requirements"})
        self.assertEqual(self.built["meta"]["replication"]["total"], len(self.built["hospitals"]))

    def test_mdh_base_adds_the_hospital_specific_add_on_for_oct_to_dec(self):
        import build_data
        from hrrp import model, parse
        self.assertEqual(self.built["meta"]["mdh"], {"endDate": "2026-12-31", "share": 92 / 365})
        imp = parse.read_impact(build_data.path("impact"), build_data.FY, build_data.GROUPER)["360123"]  # UH St John
        federal = model.est_base_payment(imp, self.built["meta"]["rates"])
        self.assertIn("MDH", self.by_id["360123"]["types"])
        self.assertEqual(self.by_id["360123"]["base"], round(federal + model.est_mdh_addon(imp, federal, 92 / 365)))
        self.assertGreater(self.by_id["360123"]["base"], federal * 1.15)

    def test_replication_counts_add_up(self):
        rep = self.built["meta"]["replication"]
        self.assertEqual(rep["exact"] + rep["rounding"] + len(rep["mismatches"]), rep["total"])


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
                         {"date": "2024-08-31", "code": "01", "reason": "merger or closure"})

    def test_bed_bands_match_the_site(self):
        import build_data
        self.assertEqual([build_data.bed_band(b) for b in (None, 99, 100, 299, 300, 499, 500)],
                         [None, "<100", "100-299", "100-299", "300-499", "300-499", "500+"])


class MdhShareTest(unittest.TestCase):
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
        self.assertEqual((build_data.cms_round(0.15625), build_data.cms_round(0.98625), build_data.cms_round(None)),
                         (0.1563, 0.9863, None))

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
        s = build_data.as_stored(self.FULL["010001"])
        self.assertEqual((s["nm"], s["c"]["HF"]["err"], s["c"]["HF"]["n"]), (round(0.96284743999129252, build_data.DECIMALS),
                                                                             round(1.08989959713565, build_data.DECIMALS), 601))
