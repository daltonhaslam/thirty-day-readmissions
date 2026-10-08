import unittest
from pathlib import Path

from hrrp import model, parse

FIX = Path(__file__).resolve().parent / "fixtures"


def cond(n, err, med, ratio, flag=None):
    if flag is None:
        flag = 1 if (n or 0) >= 25 and err is not None and err > med else 0
    return {"n": n, "err": err, "med": med, "flag": flag, "ratio": ratio}


# CMS "Payment Reduction Methodology" infographic, Hospital A (FY2027 edition)
HOSPITAL_A = {
    "nm": 0.9458, "paf": 0.9966,
    "c": {
        "AMI": cond(42, 1.0259, 0.9970, 0.0648),
        "COPD": cond(38, 1.0476, 0.9954, 0.0331),
        "HF": cond(22, 1.0783, 1.0077, 0.0500),
        "PN": cond(23, 1.0007, 1.0021, 0.0700),
        "CABG": cond(25, 0.9439, 1.0093, 0.0200),
        "THA_TKA": cond(0, None, 1.0073, None),
    },
}
RATES = parse.read_rates(FIX / "tables1a1e.txt")


class ContributionTest(unittest.TestCase):
    def test_only_eligible_conditions_above_median_contribute(self):
        c = model.contributions(HOSPITAL_A)
        self.assertAlmostEqual(c["AMI"], 0.9458 * 0.0648 * (1.0259 - 0.9970), places=9)
        self.assertAlmostEqual(c["COPD"], 0.9458 * 0.0331 * (1.0476 - 0.9954), places=9)
        for k in ("HF", "PN", "CABG", "THA_TKA"):
            self.assertEqual(c[k], 0.0, k)

    def test_reduction_matches_cms_example(self):
        self.assertAlmostEqual(round(model.reduction(HOSPITAL_A), 4), 0.0034)
        self.assertTrue(model.replicates(HOSPITAL_A))

    def test_reduction_is_capped_at_three_percent(self):
        h = {"nm": 1.0, "paf": 0.97, "c": {k: cond(500, 1.5, 1.0, 0.1) for k in parse.CONDITIONS}}
        self.assertEqual(model.reduction(h), 0.03)

    def test_missing_ratio_contributes_zero(self):
        h = {"nm": 1.0, "paf": 1.0, "c": {k: cond(100, 1.2, 1.0, None) for k in parse.CONDITIONS}}
        self.assertEqual(model.reduction(h), 0.0)

    def test_real_hospital_replicates(self):
        rows = parse.read_supplemental(FIX / "supp.txt")
        for ccn, h in rows.items():
            self.assertTrue(model.replicates(h), ccn)


class DollarTest(unittest.TestCase):
    def test_wage_index_above_one_uses_table_1a(self):
        imp = {"cases": 1000, "cmi": 1.5, "wi": 1.1, "cola": 1.0, "qual_red": False, "ehr_red": False}
        self.assertAlmostEqual(model.est_base_payment(imp, RATES), 1000 * 1.5 * (4519.68 * 1.1 + 2328.32), places=2)

    def test_wage_index_at_or_below_one_uses_table_1b_and_flags(self):
        imp = {"cases": 10, "cmi": 2.0, "wi": 0.9, "cola": 1.0, "qual_red": False, "ehr_red": True}
        self.assertAlmostEqual(model.est_base_payment(imp, RATES), 10 * 2.0 * (4146.16 * 0.9 + 2541.19), places=2)

    def test_cola_scales_nonlabor_share(self):
        imp = {"cases": 1, "cmi": 1.0, "wi": 1.2, "cola": 1.25, "qual_red": False, "ehr_red": False}
        self.assertAlmostEqual(model.est_base_payment(imp, RATES), 4519.68 * 1.2 + 2328.32 * 1.25, places=2)

    def test_missing_inputs_return_none(self):
        self.assertIsNone(model.est_base_payment({"cases": None, "cmi": 1, "wi": 1, "cola": 1, "qual_red": False, "ehr_red": False}, RATES))
        self.assertIsNone(model.est_base_payment(None, RATES))

    def test_penalty_dollars(self):
        self.assertAlmostEqual(model.est_penalty(1_000_000, 0.9966), 3400.0, places=6)
        self.assertIsNone(model.est_penalty(None, 0.99))


if __name__ == "__main__":
    unittest.main()
