import tempfile
import unittest
from pathlib import Path

from hrrp import parse

FIX = Path(__file__).resolve().parent / "fixtures"


class NumTest(unittest.TestCase):
    def test_quoted_thousands(self):
        self.assertEqual(parse.num('"1,110"'), 1110.0)

    def test_missing_markers_are_none(self):
        for s in (".", "", "  ", "N/A", "Too Few to Report", None):
            self.assertIsNone(parse.num(s), s)

    def test_percent_sign_is_stripped(self):
        self.assertEqual(parse.num("0.04%"), 0.04)

    def test_dollar_sign_is_stripped(self):
        self.assertEqual(parse.num('"$4,519.68 "'), 4519.68)


class SupplementalTest(unittest.TestCase):
    def setUp(self):
        self.rows = parse.read_supplemental(FIX / "supp.txt")

    def test_reads_every_hospital(self):
        self.assertEqual(sorted(self.rows), ["010005", "010006", "010021"])

    def test_hospital_level_fields(self):
        r = self.rows["010006"]
        self.assertEqual((r["paf"], r["red"], r["dual"], r["peer"], r["nm"]), (0.9863, 1.37, 0.1258, 1, 0.9628))

    def test_condition_fields(self):
        self.assertEqual(self.rows["010006"]["c"]["HF"], {"n": 601, "err": 1.0899, "med": 0.9928, "flag": 1, "ratio": 0.0325})

    def test_missing_condition_values_are_none(self):
        cabg = self.rows["010005"]["c"]["CABG"]
        self.assertEqual((cabg["n"], cabg["err"], cabg["ratio"], cabg["flag"]), (None, None, None, 0))
        self.assertEqual(cabg["med"], 0.9837)

    def test_header_drift_raises(self):
        text = (FIX / "supp.txt").read_text(encoding="latin1").replace("ERR for HF", "ERR HF")
        with tempfile.TemporaryDirectory() as d:
            p = Path(d, "s.txt")
            p.write_text(text, encoding="latin1")
            with self.assertRaises(parse.SchemaError):
                parse.read_supplemental(p)


class ImpactTest(unittest.TestCase):
    def test_fields(self):
        r = parse.read_impact(FIX / "impact.txt")["010001"]
        self.assertEqual(r["name"], "Southeast Health Medical Center")
        self.assertEqual(r["cbsa_geo"], "20020")
        self.assertEqual(r["fips"], "01069")
        self.assertEqual(r["urgeo"], "OURBAN")
        self.assertEqual((r["wi"], r["cola"], r["irb"], r["beds"]), (0.8702, 1.0, 0.1604, 334))
        self.assertEqual((r["cases"], r["cmi"]), (4257.85, 1.838))
        self.assertEqual((r["qual_red"], r["ehr_red"], r["own"], r["ptype"]), (False, False, "G", 7))


class HgiTest(unittest.TestCase):
    def test_fields(self):
        r = parse.read_hgi(FIX / "hgi.csv")["050454"]
        self.assertEqual(r["name"], "UCSF MEDICAL CENTER")
        self.assertEqual((r["city"], r["st"], r["zip"]), ("SAN FRANCISCO", "CA", "94143"))
        self.assertIn(r["star"], (None, 1, 2, 3, 4, 5))


class GeoFilesTest(unittest.TestCase):
    def test_zcta_centroid(self):
        self.assertEqual(parse.read_zcta(FIX / "zcta.txt")["36301"], (31.140459, -85.409097))

    def test_cbsa_names_and_county_map(self):
        names, county_to_cbsa = parse.read_cbsa_names(FIX / "xwalk.txt")
        self.assertEqual(names["41620"], "Salt Lake City-Murray, UT")
        self.assertEqual(county_to_cbsa["01001"], "33860")
        self.assertNotIn("01005", county_to_cbsa)


class RatesTest(unittest.TestCase):
    def test_table_1a_and_1b(self):
        rates = parse.read_rates(FIX / "tables1a1e.txt")
        self.assertEqual(rates["1A"]["qe"], (4519.68, 2328.32))
        self.assertEqual(rates["1A"]["nn"], (4378.30, 2255.49))
        self.assertEqual(rates["1B"]["qe"], (4245.76, 2602.24))
        self.assertEqual(rates["1B"]["qn"], (4146.16, 2541.19))


if __name__ == "__main__":
    unittest.main()
