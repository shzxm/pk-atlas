"""Scientific/numerical invariants for the population teaching model.

These checks verify math against the one-compartment formula; they do not
validate a personal clinical dose, a drug interaction, or Cmax source quality.
"""
import math
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
import api_v1


class ModelMathTests(unittest.TestCase):
    @staticmethod
    def phase_peak(ka, ke):
        if ka == ke:
            return 1 / ke
        return math.log(ka / ke) / (ka - ke)

    def test_tmax_inversion_both_sides_of_elimination(self):
        for d_id, (_, dose, cmax, tmax, hl) in api_v1.DRUGS.items():
            if hl is None:
                continue
            ke = math.log(2) / hl
            ka = api_v1.ka_for(tmax, ke)
            with self.subTest(drug=d_id):
                self.assertGreater(ka, 0)
                self.assertAlmostEqual(self.phase_peak(ka, ke), tmax, delta=1e-8)
                self.assertLess(ka, ke) if d_id == "amoxicillin" else self.assertGreater(ka, ke)

    def test_rate_coincidence_and_positive_curve(self):
        for ka, ke in [(0.7, 0.7), (0.7000000000001, 0.7), (0.6999999999999, 0.7),
                       (0.05, 0.68), (2.7, 0.2), (4.1, 0.11)]:
            with self.subTest(ka=ka, ke=ke):
                for t in [0, .0001, .25, 1.0, 5.0, 24, 120]:
                    level = api_v1.oral_kernel(ka, ke, t)
                    self.assertTrue(math.isfinite(level))
                    self.assertGreaterEqual(level, 0)
                    self.assertAlmostEqual(level, 0, delta=1e-14) if t == 0 else self.assertGreater(level, 0)

    def test_reference_dose_peak_and_non_negative_range(self):
        for did, (_, dose, cmax, tmax, half_life) in api_v1.DRUGS.items():
            if half_life is None: continue
            with self.subTest(drug=did):
                model = api_v1.Model(did, {"records": [], "intakes": [], "settings": {}})
                self.assertAlmostEqual(model.single(dose, tmax, 0), cmax, delta=cmax * 1e-8)
                hours = [i / 60 for i in range(0, 12 * 60 + 1)]
                peak_h = max(hours, key=lambda h: model.single(dose, h, 0))
                self.assertLess(abs(peak_h - tmax), 1 / 60 + 1e-5)
                for h in [0, .01, .5, 2, 5, 10, 36, 160]:
                    self.assertGreaterEqual(model.single(dose, h, 0), 0)

    def test_record_only_combination_refuses_invalid_curve(self):
        with self.assertRaisesRegex(ValueError, "双成分复方"):
            api_v1.Model("prep_ftc_taf", {"records": [], "settings": {}})

    def test_blood_superposition_and_units(self):
        a = api_v1.Model("pregabalin", {"records": [], "settings": {}})
        at = int(5 * 3600000)
        first = [{"drug": "pregabalin", "time": 0, "mg": 75}]
        second = [{"drug": "pregabalin", "time": int(2 * 3600000), "mg": 150}]
        both = a.blood(at, first + second)
        self.assertAlmostEqual(both, a.blood(at, first) + a.blood(at, second), places=10)
        self.assertAlmostEqual(a.single(150, 1.3, 0), 2.15, delta=.00001)
        self.assertAlmostEqual(a.single(300, 1.3, 0), 4.30, delta=.00001)

    def test_frontend_backend_food_window_parity(self):
        t = int(6 * 3600000)
        for d_id, interval_min, expected in [
            ("pregabalin", 180, True),
            ("pregabalin", 241, False),
            ("cetirizine", 80, True),
            ("cetirizine", 100, False),
        ]:
            state = {"records": [], "settings": {}, "intakes": [{
                "id": "meal-1", "kind": "meal", "mealType": "regular",
                "time": t - interval_min * 60000
            }]}
            with self.subTest(drug=d_id, interval=interval_min):
                self.assertEqual(api_v1.Model(d_id, state).meal(t) is not None, expected)

    def test_fed_response_and_renal_cases_finite(self):
        for crcl in [15., 30., 70., 100., 150.]:
            model = api_v1.Model("pregabalin", {
                "records": [], "settings": {"renal": {"crcl": crcl}},
                "intakes": [{"id": "m", "kind": "meal", "mealType": "highFat", "time": 0}]
            })
            for h in [.001, 1, 2, 3.5, 8, 36, 160]:
                for fed in [True, False]:
                    v = model.single(150, h, 180 * 60000, fed)
                    self.assertTrue(math.isfinite(v))
                    self.assertGreaterEqual(v, 0)


if __name__ == "__main__":
    unittest.main()
