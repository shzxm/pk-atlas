import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
import api_v1
import state_store


class RefactorTests(unittest.TestCase):
    def test_catalog_matches_model_values(self):
        catalog = json.loads((ROOT / "shared/catalog.json").read_text())
        self.assertEqual(set(api_v1.DRUGS), {row["id"] for row in catalog["drugs"]})
        self.assertEqual(api_v1.FED["pregabalin"][1], .949)
        self.assertEqual(api_v1.HIGH_FAT_PREGABALIN[1], .933)
        for row in catalog["drugs"]:
            # Record-only fixed-dose combinations cannot be modeled as one
            # single-drug concentration; preserve this explicit safety boundary.
            if row.get("recordOnly"):
                self.assertIsNone(row.get("halfLife"))
                self.assertIsNone(row.get("cmax"))
                continue
            state = {"records": [{"id":"a","drug":row["id"],"time":0,"mg":row["refDose"]}], "intakes": [], "settings": {}}
            model = api_v1.Model(row["id"], state)
            self.assertAlmostEqual(model.blood(round(row["tmax"] * 3600000)), row["cmax"], delta=row["cmax"]*.0001)

    def test_sections_migration_and_mirror(self):
        with tempfile.TemporaryDirectory() as directory:
            con = sqlite3.connect(Path(directory) / "test.sqlite3")
            con.row_factory = sqlite3.Row
            con.execute("CREATE TABLE users (id INTEGER PRIMARY KEY)")
            con.execute("CREATE TABLE user_state (user_id INTEGER PRIMARY KEY, body TEXT NOT NULL)")
            con.execute("INSERT INTO users(id) VALUES(1)")
            con.execute("INSERT INTO user_state(user_id,body) VALUES(1,?)", (json.dumps({"records":[{"id":"r"}],"courses":[],"plans":{},"settings":{}}),))
            state_store.initialize(con)
            sections = state_store.load_sections(con, 1)
            self.assertEqual(sections["records"], [{"id":"r"}])
            self.assertEqual(sections["intakes"], [])
            sections["settings"] = {"currentDrug":"pregabalin"}
            state_store.mirror(con, 1, sections, ("settings",))
            self.assertEqual(state_store.load_sections(con, 1)["settings"]["currentDrug"], "pregabalin")
            self.assertEqual(state_store.load_sections(con, 1)["records"], [{"id":"r"}])
            con.close()


if __name__ == "__main__":
    unittest.main()
