"""The site-level Nginx hardening must preserve PWA and strict API isolation."""
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class SiteHeaderTests(unittest.TestCase):
    def test_csp_restrictive_and_web_push_compatible(self):
        src=(ROOT/"config/pk.example.com").read_text()
        for rule in ["Content-Security-Policy","script-src 'self'",
            "style-src 'self'","connect-src 'self'",
            "worker-src 'self'","object-src 'none'",
            "frame-ancestors 'none'","base-uri 'none'",
            "X-Frame-Options DENY","Strict-Transport-Security",
            "Permissions-Policy"]:
            with self.subTest(rule=rule):self.assertIn(rule,src)
        self.assertNotIn("'unsafe-inline'",src)
        self.assertNotIn("'unsafe-eval'",src)
    def test_static_compression_only(self):
        src=(ROOT/"config/pk.example.com").read_text()
        self.assertIn('gzip_types application/javascript text/javascript text/css',src)
        self.assertNotIn('gzip_types application/json',src)
        self.assertIn('gzip_vary on',src)

    def test_cache_only_public_static_not_api(self):
        src=(ROOT/"config/pk.example.com").read_text()
        api=src[src.index('location ^~ /api/ {'):src.index('location = /manifest.webmanifest')]
        self.assertNotIn('max-age=600',api)
        self.assertIn('max-age=600',src)
        self.assertIn('location = /sw.js',src)
        self.assertIn('no-cache, no-store',src)
        self.assertIn('s-maxage=120',src)
if __name__=="__main__":unittest.main()
