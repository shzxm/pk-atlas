"""Offline shell must never cache medical data and must require prior online trust."""
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

class OfflineSecurityTests(unittest.TestCase):
    def test_service_worker_only_caches_explicit_public_shell(self):
        sw=(ROOT/"web/sw.js").read_text()
        self.assertIn('const SHELL_CACHE="pk-atlas-public-shell-',sw)
        self.assertIn('url.pathname.startsWith("/api/")',sw)
        self.assertIn('if(assets.has(url.href)||publicVersion)',sw)
        self.assertIn('if(req.method!=="GET")return;',sw)
        for term in ("state/sections","api/login","api/me","Cookie","localStorage",
                     "indexedDB","push_subscriptions"):
            self.assertNotIn(term,sw)
        self.assertIn('"/app.js?v=devices-20261117a"',sw)
        self.assertIn('"/inverse-worker.js?v=server-math-20261117b"',sw)
        self.assertIn('versionedPublicCode.has(url.pathname)',sw)
        self.assertIn('url.pathname.startsWith("/api/")',sw)
        self.assertIn('if(publicVersion&&live.ok)',sw)
        self.assertIn('self.addEventListener("push"',sw)
        self.assertIn('self.addEventListener("notificationclick"',sw)
        self.assertIn('event.waitUntil(update().catch(()=>{}))',sw)

    def test_versioned_shell_assets_match_dom_and_registration(self):
        sw=(ROOT/"web/sw.js").read_text()
        html=(ROOT/"frontend/html/00-document.html").read_text()
        ui=(ROOT/"frontend/07_offline.js").read_text()
        self.assertIn('styles.css?v=system-colors-20261118',html)
        self.assertIn('app.js?v=devices-20261117a',html)
        self.assertIn('styles.css?v=system-colors-20261118',sw)
        self.assertIn('app.js?v=devices-20261117a',sw)
        self.assertIn('/sw.js?v=devices-20261117a',ui)

    def test_offline_data_is_bounded_and_not_server_authenticated(self):
        js=(ROOT/"frontend/07_offline.js").read_text()
        self.assertIn('7*86400000',js)
        self.assertIn('offlineReadVerified()',js)
        self.assertIn('appOfflineRestored=true',js)
        self.assertIn('offlineSetBanner(true,message)',js)
        self.assertIn('syncReadDrafts(item.username)',js)
        self.assertIn('offlineForgetSnapshot()',js)
        self.assertIn('offlineSaveVerified(username,state,version)',js)
        self.assertNotIn('fetch(',js)
        self.assertNotIn('api("/api/login"',js)
    def test_offline_only_when_network_error_not_unauthorized(self):
        auth=(ROOT/"frontend/02_auth.js").read_text()
        self.assertIn('if(err.status!==401',auth)
        self.assertIn('if(await offlineRestoreLastVerified())return;',auth)
        self.assertIn('offlineSaveVerified(authUser,data.state,data.version)',auth)
        self.assertIn('const resumeOffline=async()=>',auth)
        self.assertIn('window.addEventListener("focus",()=>{if(appOfflineRestored)',auth)
        self.assertIn('if(!document.hidden&&appOfflineRestored)',auth)
        sync=(ROOT/"frontend/01_sync.js").read_text()
        self.assertIn('syncConflict||appOfflineRestored)return;',sync)
        self.assertIn('if(syncRunning||!authUser||appOfflineRestored',sync)
        self.assertIn('offlineSaveVerified(authUser,remote.state,remote.version)',sync)
        self.assertIn('if(authUser&&!appOfflineRestored)',sync)
    def test_auth_wires_remember_logout_and_device_management(self):
        js=(ROOT/"frontend/02_auth.js").read_text()
        self.assertIn("initDeviceSessionUI();",js)
        self.assertEqual(js.count("appRememberSession(result);"),2)
        self.assertIn('remember:$("sessionRemember").checked',js)
        self.assertIn("appForgetSession();",js)

    def test_session_ui_is_device_scoped_and_opt_in_remember(self):
        html=(ROOT/"web/index.html").read_text()
        self.assertIn('id="sessionRemember"',html)
        self.assertIn('id="deviceSessionGuide"',html)
        self.assertIn('id="deviceSessionsList"',html)
        self.assertIn('id="deviceSessionsRevokeOthers"',html)
        self.assertIn('id="deviceSessionResult"',html)
        js=(ROOT/"frontend/07_device_sessions.js").read_text()
        self.assertIn('api("/api/sessions/revoke","POST"',js)
        self.assertIn('location.reload()',js)
        self.assertIn('appForgetSession()',js)
        self.assertNotIn('localStorage.setItem("password"',js)
if __name__=="__main__":unittest.main()
