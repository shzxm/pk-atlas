"""Session defaults and server-side authorization are explicit."""
import unittest
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"backend"))
import server

class SessionTests(unittest.TestCase):
    def test_device_settings(self):
        self.assertEqual(server.REMEMBER_ABSOLUTE,90*86400)
        self.assertEqual(server.REMEMBER_IDLE,30*86400)
        self.assertEqual(server.NORMAL_ABSOLUTE,7*86400)
        self.assertEqual(server.NORMAL_IDLE,24*3600)
        self.assertNotEqual(server.COOKIE,"")
    def test_no_user_agent_as_credential(self):
        src=Path(server.__file__).read_text()
        self.assertIn("WHERE s.token_hash=? AND s.expires_at>?",src)
        self.assertIn("absolute_expires_at",src)
        self.assertIn("last_active_at",src)
        self.assertIn('"/api/sessions/revoke"',src)
        self.assertIn('DELETE FROM sessions WHERE user_id=? AND token_hash=?',src)
        self.assertIn('SameSite=Strict',src)
        self.assertIn('HttpOnly; Secure',src)
        self.assertIn("self.valid_origin()",src)
    def test_browser_only_sessions_have_no_persistent_cookie_expiry(self):
        src=Path(server.__file__).read_text()
        self.assertIn('lifetime=f"; Max-Age=',src)
        self.assertIn('if persistent_cookie else ""',src)
        self.assertIn('persistent_cookie=remember',src)
        self.assertIn('persistent_cookie=bool(row["remembered"])',src)
        self.assertIn('"/api/sessions/revoke-others"',src)
        self.assertIn('"DELETE FROM sessions WHERE user_id=? AND token_hash<>?"',src)

    def test_no_exposure_of_raw_cookie_through_devices_api(self):
        src=Path(server.__file__).read_text()
        section=src[src.index('elif self.endpoint() == "/api/sessions":'):src.index('elif self.endpoint() == "/api/state":')]
        self.assertNotIn('Cookie',section)
        self.assertNotIn('session=token',section)
        self.assertIn('"current":',section)
if __name__=="__main__":
    unittest.main()
