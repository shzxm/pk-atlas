from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
class DataCenterContractTests(unittest.TestCase):
    def test_export_routes_behind_login_and_manual_confirmation(self):
        src=(ROOT/"frontend/pages/data-center.js").read_text()
        html=(ROOT/"frontend/pages/data-center.html").read_text()
        self.assertIn('req("/api/me")',src)
        self.assertIn('req("/api/state")',src)
        self.assertIn('const latest=await req("/api/state")',src)
        self.assertIn('if(latest.version!==plan.version)',src)
        self.assertIn('if(drafts().length)throw Error',src)
        self.assertIn('try{await read()}catch(err)',src)
        self.assertIn('req("/api/state/sections","PUT"',src)
        self.assertIn('if(!confirm(',src)
        self.assertIn('disabled>核对后合并到云端',html)
        self.assertIn('id="syncCloudVersion"',html)
    def test_legacy_journal_fields_are_preserved(self):
        core=(ROOT/"frontend/pages/data-portability-core.js").read_text()
        for key in ("source","journalJSON","administrationRoute","stomachFullness",
                    "isDoseAnEstimate","estimatedDoseStandardDeviation","experienceTitle"):
            self.assertIn(key,core)
        self.assertIn('pk-atlas-ios-journal-17.1-normalized-v1',core)
        self.assertIn('exportSource:"iOS Journal 17.1"',core)
        self.assertIn('const parseAny=async input=>',core)
        self.assertIn('pk-atlas-full-backup-v1',core)
        self.assertIn('记录 ID 冲突',core)
    def test_diagnostics_does_not_claim_device_delivery(self):
        backend=(ROOT/"backend/server.py").read_text()
        ui=(ROOT/"frontend/pages/push-diagnostics.js").read_text()
        self.assertIn('"/api/push/diagnostics"',backend)
        self.assertIn('"deviceDeliveryConfirmed": False',backend)
        self.assertIn('服务商接受推送 ≠ 手机实际显示通知',ui)
        self.assertNotIn('Notification.requestPermission(',ui)
    def test_public_offline_cache_does_not_include_personal_api(self):
        sw=(ROOT/"web/sw.js").read_text()
        self.assertIn('pk-atlas-public-shell-v20261116-4',sw)
        self.assertIn('"/data-center.html"',sw)
        self.assertIn('"/push.js?v=11"',sw)
        self.assertIn('"/data-portability-core.js?v=20261116b"',sw)
        self.assertIn('url.pathname.startsWith("/api/")',sw)

    def test_cf_audit_never_sends_cookies_or_downloads_state(self):
        source=(ROOT/"scripts/check_cloudflare_cache.py").read_text()
        self.assertIn('"/api/me", "private_api"',source)
        self.assertIn('"/sw.js", "service_worker"',source)
        self.assertIn('response.read(8192)',source)
        self.assertNotIn('Cookie',source.split('def probe',1)[1].split('def audit',1)[0])
        self.assertIn('no-store',source)

    def test_build_and_index_links(self):
        build=(ROOT/"scripts/build.py").read_text()
        html=(ROOT/"frontend/html/20-account.html").read_text()
        for name in ("data-center.html","data-center.js","data-portability-core.js","push-diagnostics.js"):
            self.assertIn(name,build)
        self.assertIn('href="/data-center.html"',html)

if __name__=="__main__":unittest.main()
