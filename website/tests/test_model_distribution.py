import base64
import hashlib
import json
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/"backend"))
import model_distribution


class ModelDistributionTest(unittest.TestCase):
    def test_catalog_checksum_and_schema(self):
        result = model_distribution.package()
        raw = base64.b64decode(result["catalogBase64"], validate=True)
        self.assertEqual(result["schemaVersion"], 1)
        self.assertEqual(result["catalogVersion"], hashlib.sha256(raw).hexdigest())
        self.assertEqual(json.loads(raw), json.loads(model_distribution.CATALOG_PATH.read_bytes()))
        self.assertEqual(len(result["engineVersion"]), 64)

    def test_site_and_native_catalog_both_from_shared(self):
        root = Path(__file__).resolve().parents[1]
        original = json.loads((root/"shared/catalog.json").read_text())
        generated = json.loads((root/"backend/drugs.json").read_text())
        self.assertEqual(original, generated)
        app = (root/"web/app.js").read_text()
        self.assertIn('const DRUGS = ',app)
        self.assertIn('const FOOD_INFO = ',app)
        self.assertIn('"id":"pregabalin"',app)

if __name__ == '__main__': unittest.main()
