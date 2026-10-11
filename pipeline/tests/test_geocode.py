import tempfile
import unittest
from pathlib import Path

import build_data
import geocode

DOTHAN = ("hgi", "1108 ROSS CLARK CIRCLE", "DOTHAN", "AL", "36301")
FAIRBANKS = ("hgi", "1650 COWLES ST", "FAIRBANKS", "AK", "99701")
OK_ROW = '"010001","1108 ROSS CLARK CIRCLE, DOTHAN, AL, 36301","Match","Exact","1108 ROSS CLARK CIR, DOTHAN, AL, 36301","-85.361445951887,31.215662945023","101238843","R"'


class ResponseTest(unittest.TestCase):
    BATCH = {"010001": DOTHAN, "020012": FAIRBANKS}

    def parse(self, *lines):
        return geocode.parse_response("\n".join(lines) + "\n", self.BATCH)

    def test_matched_rows_give_lat_lon_and_match_type(self):
        got = self.parse(OK_ROW, '"020012","1650 COWLES ST, FAIRBANKS, AK, 99701","Match","Non_Exact","1650 COWLES ST, FAIRBANKS, AK, 99701",'
                                 '"-147.739134283597,64.834607892861","190923912","L"')
        self.assertEqual(got, {"010001": (31.215662945023, -85.361445951887, "Exact"),
                               "020012": (64.834607892861, -147.739134283597, "Non_Exact")})

    def test_no_match_and_tie_are_ignored(self):
        self.assertEqual(self.parse('"010001","x","No_Match"', '"020012","x","Tie"'), {})

    def test_untrusted_rows_are_ignored(self):
        for bad in [OK_ROW.replace('"010001"', '"999999"'),  # id not requested
                    OK_ROW.replace("DOTHAN, AL, 36301\",\"-85", "DOTHAN, GA, 36301\",\"-85"),  # other state
                    OK_ROW.replace("-85.361445951887,31.215662945023", "-85.36,31.21,7"),  # three numbers
                    OK_ROW.replace("-85.361445951887,31.215662945023", "1e3,31.2"),  # not a plain decimal
                    OK_ROW.replace("-85.361445951887,31.215662945023", "2.35,48.85"),  # Paris
                    OK_ROW.replace('"Exact"', '"Approximate"'),
                    OK_ROW.split(',"-85')[0]]:  # truncated row
            self.assertEqual(self.parse(bad), {}, bad)

    def test_an_id_answered_twice_is_ignored(self):
        self.assertEqual(self.parse(OK_ROW, OK_ROW), {})

    def test_us_bounds_include_alaska_hawaii_and_puerto_rico(self):
        for lat, lon in [(64.83, -147.74), (21.31, -157.86), (18.40, -66.06), (40.0, -100.0)]:
            self.assertTrue(geocode.in_us(lat, lon), (lat, lon))
        self.assertFalse(geocode.in_us(51.5, -0.1))


class FlowTest(unittest.TestCase):
    def test_candidates_put_care_compare_first_and_drop_identical_pos_address(self):
        hgi = {"010001": {"street": "PO BOX 1", "city": "A", "st": "AL", "zip": "36301"},
               "010005": {"street": "1 MAIN ST", "city": "B", "st": "AL", "zip": "35957"}}
        pos = {"010001": {"street": "1108 ROSS CLARK CIRCLE", "city": "DOTHAN", "st": "AL", "zip": "36301"},
               "010005": {"street": "1 Main St", "city": "B", "st": "AL", "zip": "35957"},
               "010006": {"street": "", "city": "C", "st": "AL", "zip": "35630"}}
        got = geocode.candidates(["010001", "010005", "010006"], hgi, pos)
        self.assertEqual([a[0] for a in got["010001"]], ["hgi", "pos"])
        self.assertEqual([a[0] for a in got["010005"]], ["hgi"])
        self.assertNotIn("010006", got)

    def test_unmatched_hospitals_are_retried_with_their_second_address(self):
        sent = []

        def send(batch):
            sent.append(dict(batch))
            return OK_ROW + "\n" if batch.get("010001", ("",))[0] == "pos" else '"010001","x","No_Match"\n'
        cands = {"010001": [("hgi", "PO BOX 1", "DOTHAN", "AL", "36301"), ("pos", *DOTHAN[1:])]}
        self.assertEqual(geocode.geocode(cands, send), {"010001": (31.215662945023, -85.361445951887, "Exact", "pos")})
        self.assertEqual([b["010001"][0] for b in sent], ["hgi", "pos"])

    def test_written_csv_round_trips_through_the_build_reader(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d, "g.csv")
            geocode.write({"020012": (64.834607892861, -147.739134283597, "Exact", "hgi"),
                           "010001": (31.215662945023, -85.361445951887, "Non_Exact", "pos")}, p)
            self.assertEqual(p.read_text().splitlines(), ["ccn,lat,lon,match,source", "010001,31.21566,-85.36145,Non_Exact,pos",
                                                          "020012,64.83461,-147.73913,Exact,hgi"])
            self.assertEqual(build_data.load_geocodes(p), {"010001": (31.21566, -85.36145), "020012": (64.83461, -147.73913)})
            self.assertEqual(build_data.load_geocodes(Path(d, "missing.csv")), {})


if __name__ == "__main__":
    unittest.main()
