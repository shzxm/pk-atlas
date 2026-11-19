"""Mathematical server is stateless and canonical for sample curves."""
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"backend"))
import api_v1
import math_runtime


class ServerMathRuntime(unittest.TestCase):
    def payload(self):
        now=1794892000000
        return {"drugId":"pregabalin","times":[now+i*300000 for i in range(20)],
                "records":[{"drug":"pregabalin","time":now-3600000,"mg":75}],
                "planned":[{"drug":"pregabalin","time":now+300000,"mg":75}],
                "meals":[],"renalCrCl":None}

    def test_server_synthetic_math_matches_active_engine(self):
        request=self.payload()
        result=math_runtime.run(request)
        self.assertEqual(result["source"],"181-server-math")
        self.assertEqual(len(result["points"]),20)
        model=api_v1.Model("pregabalin", {"records":request["records"],
                                          "intakes":[],"settings":{}})
        for p in result["points"]:
            self.assertAlmostEqual(p["bloodMgL"],model.blood(p["time"]),places=10)
            self.assertAlmostEqual(p["equivalentMg"],model.equivalent(p["time"]),places=8)
            self.assertGreaterEqual(p["plannedBloodMgL"],p["bloodMgL"])
        self.assertEqual(len(result["engineVersion"]),64)

    def test_invalid_samples_fail_closed(self):
        request=self.payload()
        for key,value in [("times",[True]),("times",[1e20]),
                          ("times",[request["times"][1],request["times"][0]]),
                          ("times",request["times"]*80)]:
            with self.subTest(key=key):
                incoming={**request,key:value}
                with self.assertRaises(ValueError):math_runtime.run(incoming)

    def test_rejects_wrong_drug_and_infinite_amount(self):
        request=self.payload()
        for changed in [
            {"records":[{"time":request["times"][0],"mg":float("nan")}]},
            {"planned":[{"drug":"ibuprofen","mg":75,"time":request["times"][0]}]},
            {"renalCrCl":float("inf")},
            {"drugId":"missing"}
        ]:
            with self.subTest(changed=changed):
                with self.assertRaises(ValueError):math_runtime.run({**request,**changed})

    def test_no_database_or_network_in_sample_engine(self):
        text=(Path(__file__).resolve().parents[1]/"backend/math_runtime.py").read_text()
        for forbidden in ("sqlite3","requests.", "urllib.", "subprocess", "open('/var/lib"):
            self.assertNotIn(forbidden,text)
