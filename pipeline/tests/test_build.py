import json
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
        by_fips, by_name = geo.county_centroids(RAW / "us_atlas_counties" / "counties-10m.json")
        lat, lon = by_fips["49035"]
        self.assertEqual(by_name[geo.county_key("UT", "SALT LAKE")], (lat, lon))
        self.assertAlmostEqual(lat, 40.67, delta=0.3)
        self.assertAlmostEqual(lon, -111.92, delta=0.3)


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
        self.assertEqual(rep["mismatches"], [])
        self.assertGreaterEqual(rep["exact"] / rep["total"], 0.95)
        with_geo = sum(1 for x in self.h if x["lat"] is not None)
        self.assertGreaterEqual(with_geo / len(self.h), 0.97)

    def test_hospital_with_no_flags_has_no_penalty(self):
        zero = [x for x in self.h if all(c["flag"] == 0 for c in x["c"].values())]
        self.assertTrue(zero)
        for x in zero:
            self.assertEqual(x["paf"], 1.0, x["id"])

    def test_conditions_without_discharges_are_omitted(self):
        for x in self.h:
            for k, c in x["c"].items():
                self.assertFalse(c["n"] is None and c["err"] is None, (x["id"], k))

    def test_peer_medians_cover_every_group_and_condition(self):
        pm = self.d["meta"]["peerMedians"]
        self.assertEqual(sorted(pm), ["1", "2", "3", "4", "5"])
        for g in pm.values():
            self.assertEqual(sorted(g), sorted(["AMI", "COPD", "HF", "PN", "CABG", "THA_TKA"]))

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
                "division", "beds", "teach", "own", "ownDetail", "star", "types", "paf", "red", "dual", "peer", "base",
                "pen", "c"}
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

    def test_replication_reports_exact_and_rounding_matches_separately(self):
        rep = self.built["meta"]["replication"]
        self.assertEqual(rep["exact"] + rep["rounding"] + len(rep["mismatches"]), rep["total"])
        self.assertGreater(rep["rounding"], 0)
