"""A model package is verified as data and never mixes divergent engines."""
import hashlib
import json
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]


class ModelSyncTests(unittest.TestCase):
    def test_model_fingerprint_generated_into_web_bundle(self):
        bundle=(ROOT/"web/app.js").read_text()
        metadata=json.loads((ROOT/"backend/model-engine.json").read_text())
        self.assertEqual(metadata["schemaVersion"],1)
        self.assertIn('const PK_MODEL_ENGINE_VERSION = "'+metadata["engineVersion"]+'";',bundle)
        self.assertIn('const DRUGS = ',bundle)
        self.assertIn('const FOOD_INFO = ',bundle)

    def test_public_cryptographic_validation_and_offline_fallback(self):
        src=(ROOT/"web/model-sync.js").read_text()
        self.assertIn('crypto.subtle.digest("SHA-256",bytes)',src)
        self.assertIn('PK_MODEL_ENGINE_VERSION',src)
        self.assertIn('credentials:"omit"',src)
        self.assertIn('cache:"no-store"',src)
        self.assertIn('PK_MODEL_CACHE_KEY',src)
        self.assertIn('setInterval',src)
        self.assertIn('visibilitychange',src)
        self.assertIn('pageshow',src)
        self.assertIn('pkModelRefreshSelectors',src)
        self.assertNotIn('eval(',src)
        self.assertNotIn('new Function(',src)
        self.assertNotIn('import(',src)

    def test_worker_uses_verified_same_catalog(self):
        worker=(ROOT/"web/inverse-worker.js").read_text()
        solver=(ROOT/"frontend/04_inverse_solver.js").read_text()
        self.assertIn('event.data.modelCatalog',worker)
        self.assertIn('remote.engineVersion!==PK_MODEL_ENGINE_VERSION',worker)
        self.assertIn('DRUGS.splice(0,DRUGS.length',worker)
        self.assertIn('modelCatalog:typeof PKVerifiedWebCatalog',solver)

    def test_public_shell_caches_data_sync_script_but_never_api(self):
        html=(ROOT/"web/index.html").read_text()
        sw=(ROOT/"web/sw.js").read_text()
        deploy=(ROOT/"scripts/deploy_web_only.sh").read_text()
        self.assertIn('/model-sync.js?v=server-catalog-20261117c',html)
        self.assertIn('/model-sync.js?v=server-catalog-20261117c',sw)
        self.assertIn('model-sync.js',deploy)
        self.assertIn('url.pathname.startsWith("/api/")',sw)
        self.assertIn('pk-atlas-public-shell-v20261118-light-1',sw)

    def test_live_math_samples_drive_chart_without_duplicate_actuals(self):
        chart=(ROOT/"frontend/05_chart.js").read_text()
        api=(ROOT/"backend/math_runtime.py").read_text()
        self.assertIn('/api/native/math/samples',chart)
        self.assertIn('result.engineVersion!==PK_MODEL_ENGINE_VERSION',chart)
        self.assertIn('result.catalogVersion!==requestVersion',chart)
        self.assertIn('pkServerCurveCache?.key===mathKey',chart)
        self.assertIn('remote?.bloodMgL??concentration',chart)
        self.assertIn('remote?.equivalentMg??totalEquivalent',chart)
        self.assertIn('serverKernelSha256',api)
        self.assertNotIn('sqlite3',api)

    def test_global_math_disclaimer(self):
        self.assertIn('全部曲线和反算结果均为数学模拟',
                      (ROOT/"web/index.html").read_text())
        ui=(ROOT/"frontend/04_inverse_solver.js").read_text()
        self.assertIn('没有设置医学剂量上限',ui)
        self.assertIn('当前有界数学搜索未找到满足全部输入约束',ui)


if __name__=="__main__":
    unittest.main()
