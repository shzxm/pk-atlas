import base64
import hashlib
import secrets
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"backend"))
import native_auth


def token_pair():
    verifier = secrets.token_urlsafe(32)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    return verifier, challenge


class NativeAuthTest(unittest.TestCase):
    def test_one_time_pkce_and_state(self):
        verifier, challenge = token_pair()
        state = secrets.token_urlsafe(32)
        code = native_auth.issue(7, challenge, state)
        self.assertIsNotNone(code)
        self.assertIsNone(native_auth.consume(code, verifier+"x", state))
        self.assertIsNone(native_auth.consume(code, verifier, secrets.token_urlsafe(32)))
        self.assertEqual(native_auth.consume(code, verifier, state), 7)
        self.assertIsNone(native_auth.consume(code, verifier, state))

    def test_bad_parameters(self):
        verifier, challenge = token_pair()
        state = secrets.token_urlsafe(32)
        self.assertIsNone(native_auth.issue(7, "invalid", state))
        self.assertIsNone(native_auth.issue(7, challenge, "bad"))
        self.assertIsNone(native_auth.consume(secrets.token_urlsafe(32), verifier, state))

    def test_login_page_obeys_strict_csp(self):
        self.assertIn('src="/native-login.js?', native_auth.LOGIN_PAGE)
        self.assertIn('href="/native-login.css?', native_auth.LOGIN_PAGE)
        self.assertNotIn('<script>', native_auth.LOGIN_PAGE)
        self.assertNotIn('<style>', native_auth.LOGIN_PAGE)
        self.assertIn('请从药时 App 重新开始', native_auth.INVALID_REQUEST_PAGE)

    def test_callback_has_no_session_token(self):
        state=secrets.token_urlsafe(32)
        callback=native_auth.callback(secrets.token_urlsafe(32),state)
        self.assertTrue(callback.startswith("pkatlas://auth/callback?"))
        self.assertIn("state=",callback)
        self.assertNotIn("sessionToken=",callback)


if __name__=="__main__":
    unittest.main()
