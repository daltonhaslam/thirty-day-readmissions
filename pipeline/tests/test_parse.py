import csv
import tempfile
import unittest
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

from hrrp import parse

FIX = Path(__file__).resolve().parent / "fixtures"
MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG = "http://schemas.openxmlformats.org/package/2006/relationships"


def _ref(j, r):
    return (chr(64 + j // 26) if j >= 26 else "") + chr(65 + j % 26) + str(r)


def write_xlsx(path, sheets, doctype="", sheet_xml=None):
    """A minimal .xlsx: text cells as shared strings, numeric text as numbers, empty cells skipped.

    `sheet_xml` replaces the generated <sheetData> body of every sheet.
    """
    shared, books, rels = [], [], []
    with zipfile.ZipFile(path, "w") as zf:
        for i, (name, rows) in enumerate(sheets.items(), 1):
            xml_rows = []
            for r, row in enumerate(rows, 1):
                cells = []
                for j, v in enumerate(row):
                    if not v:
                        continue
                    try:
                        float(v)
                        cells.append(f'<c r="{_ref(j, r)}"><v>{v}</v></c>')
                    except ValueError:
                        shared.append(v)
                        cells.append(f'<c r="{_ref(j, r)}" t="s"><v>{len(shared) - 1}</v></c>')
                xml_rows.append(f'<row r="{r}">{"".join(cells)}</row>')
            body = sheet_xml or "".join(xml_rows)
            zf.writestr(f"xl/worksheets/sheet{i}.xml", f'{doctype}<worksheet xmlns="{MAIN}"><sheetData>{body}</sheetData></worksheet>')
            books.append(f'<sheet name="{escape(name)}" sheetId="{i}" r:id="rId{i}"/>')
            rels.append(f'<Relationship Id="rId{i}" Type="{REL}/worksheet" Target="/xl/worksheets/sheet{i}.xml"/>')
        rels.append(f'<Relationship Id="rIdS" Type="{REL}/sharedStrings" Target="sharedStrings.xml"/>')
        zf.writestr("xl/workbook.xml", f'<workbook xmlns="{MAIN}" xmlns:r="{REL}"><sheets>{"".join(books)}</sheets></workbook>')
        zf.writestr("xl/_rels/workbook.xml.rels", f'<Relationships xmlns="{PKG}">{"".join(rels)}</Relationships>')
        zf.writestr("xl/sharedStrings.xml", f'<sst xmlns="{MAIN}">{"".join(f"<si><t>{escape(t)}</t></si>" for t in shared)}</sst>')


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
        self.assertEqual((r["paf"], r["dual"], r["peer"], r["nm"]), (0.9863, 0.1258, 1, 0.9628))

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


class WorkbookTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name, "w.xlsx")

    def tearDown(self):
        self.tmp.cleanup()

    def test_supplemental_sheet_reads_like_its_tab_delimited_export(self):
        with open(FIX / "supp.txt", newline="", encoding="latin1") as f:
            rows = list(csv.reader(f, delimiter="\t"))
        write_xlsx(self.path, {"Notes": [["Hospital CCN", "not this table"]], "FR FY 2027": rows})
        self.assertEqual(parse.read_supplemental(self.path, "FR FY 2027"), parse.read_supplemental(FIX / "supp.txt"))

    def test_numbers_keep_full_precision_and_cells_land_in_their_columns(self):
        write_xlsx(self.path, {"S": [["a", "", "0.18243374902572096"], ["", "b"]]})
        rows = parse._xlsx_rows(self.path, "S")
        self.assertEqual(rows, [["a", "", "0.18243374902572096"], ["", "b"]])
        self.assertEqual(parse.num(rows[0][2]), 0.18243374902572096)

    def test_inline_strings_and_two_letter_columns(self):
        write_xlsx(self.path, {"S": []}, sheet_xml='<row r="1"><c r="B1" t="inlineStr"><is><t>hi</t></is></c>'
                                                   '<c r="AB1"><v>7</v></c></row>')
        row = parse._xlsx_rows(self.path, "S")[0]
        self.assertEqual((len(row), row[1], row[27]), (28, "hi", "7"))

    def test_missing_sheet_raises(self):
        write_xlsx(self.path, {"S": [["a"]]})
        with self.assertRaises(parse.SchemaError):
            parse._xlsx_rows(self.path, "T")

    def test_dtd_is_refused(self):
        write_xlsx(self.path, {"S": [["a"]]}, doctype='<!DOCTYPE x [<!ENTITY a "aaaa">]>')
        with self.assertRaises(parse.SchemaError):
            parse._xlsx_rows(self.path, "S")


class ImpactTest(unittest.TestCase):
    def test_fields(self):
        r = parse.read_impact(FIX / "impact.txt", fy=2027, grouper=44)["010001"]
        self.assertEqual(r["name"], "Southeast Health Medical Center")
        self.assertEqual(r["cbsa_geo"], "20020")
        self.assertEqual(r["fips"], "01069")
        self.assertEqual(r["urgeo"], "OURBAN")
        self.assertEqual((r["wi"], r["cola"], r["irb"], r["beds"]), (0.8702, 1.0, 0.1604, 334))
        self.assertEqual((r["cases"], r["cmi"]), (4257.85, 1.838))
        self.assertEqual((r["qual_red"], r["ehr_red"], r["own"], r["ptype"]), (False, False, "G", 7))


class ImpactMdhTest(unittest.TestCase):
    def test_mdh_flag_is_read(self):
        rows = parse.read_impact(FIX / "impact.txt", fy=2027, grouper=44)
        self.assertTrue(rows["010007"]["mdh"])
        self.assertFalse(rows["010001"]["mdh"])
        self.assertEqual((rows["010007"]["hsp"], rows["010001"]["hsp"]), (5248.3, None))


class MalformedCcnTest(unittest.TestCase):
    def test_numeric_row_that_is_not_a_ccn_raises(self):
        text = (FIX / "supp.txt").read_text(encoding="latin1").replace("010021\t", "10021\t")
        with tempfile.TemporaryDirectory() as d:
            p = Path(d, "s.txt")
            p.write_text(text, encoding="latin1")
            with self.assertRaises(parse.SchemaError):
                parse.read_supplemental(p)


class HgiTest(unittest.TestCase):
    def test_fields(self):
        r = parse.read_hgi(FIX / "hgi.csv")["050454"]
        self.assertEqual(r["name"], "UCSF MEDICAL CENTER")
        self.assertEqual((r["city"], r["st"], r["zip"]), ("SAN FRANCISCO", "CA", "94143"))
        self.assertEqual(r["street"], "505 PARNASSUS AVE, BOX 0296")
        self.assertIn(r["star"], (None, 1, 2, 3, 4, 5))


class PosTest(unittest.TestCase):
    def setUp(self):
        self.rows = parse.read_pos(FIX / "pos.csv")

    def test_active_hospital(self):
        self.assertEqual(self.rows["010001"], {"beds": 420, "term": "00", "termDate": None, "street": "1108 ROSS CLARK CIRCLE",
                                               "city": "DOTHAN", "st": "AL", "zip": "36301"})

    def test_terminated_provider_and_non_hospital_rows(self):
        self.assertEqual((self.rows["010062"]["term"], self.rows["010062"]["termDate"]), ("07", "2025-03-13"))
        self.assertIsNone(self.rows["011001"]["beds"])
        self.assertEqual(self.rows["220017"]["zip"], "02124")

    def test_windows_1252_text_and_spacing(self):
        self.assertEqual(self.rows["030149"]["street"], "4860 E BASLINE RD, STE 102")
        self.assertEqual(self.rows["670128"]["street"], "2600 EAST PFLUGERVILLE PARKWAY")

    def _variant(self, old, new):
        d = tempfile.TemporaryDirectory()
        self.addCleanup(d.cleanup)
        p = Path(d.name, "pos.csv")
        p.write_bytes((FIX / "pos.csv").read_bytes().replace(old, new))
        return p

    def test_duplicate_ccn_raises(self):
        with self.assertRaises(parse.SchemaError):
            parse.read_pos(self._variant(b"01,01,010062,", b"01,01,010001,"))

    def test_unknown_termination_code_raises(self):
        with self.assertRaises(parse.SchemaError):
            parse.read_pos(self._variant(b",67,07,", b",67,42,"))

    def test_bytes_undefined_in_windows_1252_raise(self):
        with self.assertRaises(parse.SchemaError):
            parse.read_pos(self._variant(b"CARNEY", b"CARN\x81Y"))


class GeoFilesTest(unittest.TestCase):
    def test_zcta_centroid(self):
        self.assertEqual(parse.read_zcta(FIX / "zcta.txt")["36301"], (31.140459, -85.409097))

    def test_cbsa_names(self):
        names = parse.read_cbsa_names(FIX / "xwalk.txt")
        self.assertEqual(names["41620"], "Salt Lake City-Murray, UT")
        self.assertEqual(names["33860"], "Montgomery, AL")
        self.assertEqual(len(names), 2)

    def test_missing_hgi_column_raises_schema_error(self):
        text = (FIX / "hgi.csv").read_text(encoding="utf-8-sig").replace('"ZIP Code"', '"Zip"')
        with tempfile.TemporaryDirectory() as d:
            p = Path(d, "h.csv")
            p.write_text(text, encoding="utf-8")
            with self.assertRaises(parse.SchemaError):
                parse.read_hgi(p)


class RatesTest(unittest.TestCase):
    def test_table_1a_and_1b(self):
        rates = parse.read_rates(FIX / "tables1a1e.txt")
        self.assertEqual(rates["1A"]["qe"], (4519.68, 2328.32))
        self.assertEqual(rates["1A"]["nn"], (4378.30, 2255.49))
        self.assertEqual(rates["1B"]["qe"], (4245.76, 2602.24))
        self.assertEqual(rates["1B"]["qn"], (4146.16, 2541.19))


if __name__ == "__main__":
    unittest.main()
