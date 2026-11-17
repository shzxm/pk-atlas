"""Modern Web Guidance regression checks for frontend-only refactors."""
import json
import re
import unittest
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class Markup(HTMLParser):
    def __init__(self):
        super().__init__()
        self.elements = []

    def handle_starttag(self, tag, attrs):
        self.elements.append((tag, dict(attrs)))


class ModernWebTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = (ROOT / "web/index.html").read_text()
        cls.parser = Markup()
        cls.parser.feed(cls.html)

    def test_all_controls_have_names_and_unique_ids(self):
        elements = self.parser.elements
        controls = [a for tag, a in elements if tag in ("input", "select", "textarea")]
        self.assertGreaterEqual(len(controls), 40)
        self.assertTrue(all(a.get("name") for a in controls))
        ids = [a["id"] for _, a in elements if a.get("id")]
        self.assertEqual(len(ids), len(set(ids)))
        for _, a in elements:
            if a.get("for"):
                self.assertIn(a["for"], ids)

    def test_sensitive_forms_do_not_fallback_to_get(self):
        forms = {a["id"]: a for tag, a in self.parser.elements if tag == "form"}
        self.assertEqual(set(forms), {"authForm", "doseForm", "intakeForm"})
        self.assertTrue(all(a.get("method") == "post" for a in forms.values()))
        auth = {a["id"]: a for tag, a in self.parser.elements
                if tag == "input" and a.get("id") in ("accountUser", "accountPassword")}
        self.assertEqual(auth["accountUser"].get("autocomplete"), "username")
        self.assertEqual(auth["accountPassword"].get("autocomplete"), "current-password")
        self.assertNotIn("aria-label", auth["accountUser"])
        self.assertNotIn("aria-label", auth["accountPassword"])
        self.assertIn('for="accountUser"', self.html)
        self.assertIn('for="accountPassword"', self.html)

    def test_semantic_navigation_and_unchanged_runtime_dependencies(self):
        self.assertIn('href="#mainContent"', self.html)
        self.assertIn('id="mainContent"', self.html)
        scripts = [a["src"] for tag, a in self.parser.elements
                   if tag == "script" and a.get("src")]
        self.assertEqual(len(scripts), 3)
        self.assertTrue(any(s.startswith("./app.js?") for s in scripts))
        self.assertTrue(any(s.startswith("/api-client.js?") for s in scripts))
        self.assertTrue(any(s.startswith("./push.js?") for s in scripts))
        self.assertFalse(any(re.match(r"^on[a-z]+$", key, re.I)
                             for _, a in self.parser.elements for key in a))

    def test_secondary_pages_semantic_and_named(self):
        for name in ("quick.html", "notifications.html", "install.html", "api.html"):
            with self.subTest(page=name):
                document = (ROOT / "web" / name).read_text()
                parser = Markup()
                parser.feed(document)
                self.assertEqual(sum(tag == "main" for tag, _ in parser.elements), 1)
                self.assertTrue(any(tag == "meta" and a.get("name") == "description"
                                    for tag, a in parser.elements))
                self.assertTrue(all(a.get("name") for tag, a in parser.elements
                                    if tag in ("input", "select", "textarea")))
                self.assertTrue(all(a.get("method") == "post"
                                    for tag, a in parser.elements if tag == "form"))

    def test_quick_script_is_external_and_preserves_api_features(self):
        page = (ROOT / "web/quick.html").read_text()
        parser = Markup()
        parser.feed(page)
        self.assertFalse(any(tag == "script" and not attrs.get("src")
                             for tag, attrs in parser.elements))
        sources = [a["src"] for tag, a in parser.elements if tag == "script" and a.get("src")]
        self.assertEqual(len(sources), 2)
        self.assertTrue(sources[0].startswith("/api-client.js"))
        self.assertTrue(sources[1].startswith("/quick.js"))
        self.assertIn("defer", dict(next(a for t, a in parser.elements
                                         if t == "script" and a.get("src") == sources[1])))
        js = (ROOT / "web/quick.js").read_text()
        for endpoint in ('"/api/me"', '"/api/v1/doses"', '"/api/v1/curve?',
                         '"/api/v1/inverse"', '"/api/v1/key"'):
            self.assertIn(endpoint, js)
        self.assertTrue(js.startswith('"use strict";'))

    def test_public_robots_and_sitemap(self):
        import xml.etree.ElementTree as ET
        robots=(ROOT / "web/robots.txt").read_text()
        self.assertIn("Disallow: /api/",robots)
        self.assertIn("Sitemap: https://pk.example.com/sitemap.xml",robots)
        root=ET.parse(ROOT / "web/sitemap.xml").getroot()
        self.assertEqual(len(root),3)

    def test_autosave_ui_and_client_contracts(self):
        src=(ROOT / "web/app.js").read_text()
        html=(ROOT / "web/index.html").read_text()
        api=(ROOT / "web/api-client.js").read_text()
        for name in ("syncNow", "syncExport", "syncLastSaved", "syncRetry"):
            self.assertIn(f'id="{name}"',html)
        for symbol in ("function syncSaveDraft()", "function syncRecoverPending()",
                       "async function flushSync()", "function syncConflictNotice()",
                       "function syncCaptureEditor(event)", 'syncPolicy:"last-upload-wins-v1"'):
            self.assertIn(symbol,src)
        self.assertIn('signal:controller.signal',api)
        self.assertNotIn('"accountPassword"',src[src.find('const EDITOR_IDS='):src.find('function safeEditorDrafts(')])
        self.assertIn("syncClearEditorFields",src)

    def test_rebuildable_six_part_javascript(self):
        source = "".join((ROOT / "frontend" / part).read_text()
                         for part in ("01_core.js", "01_sync.js", "02_auth.js", "02_records.js", "02_day.js",
                                      "03_model.js", "04_inverse_overview.js", "04_inverse_setup.js", "04_inverse_solver.js",
                                      "05_chart.js", "06_presentation.js", "07_app_mode.js", "07_device_sessions.js", "07_offline.js", "06_ui.js"))
        catalog = json.loads((ROOT / "shared/catalog.json").read_text())
        marker = "/* PK_CATALOG: generated from shared/catalog.json by scripts/build.py */"
        self.assertEqual(source.count(marker), 1)
        inject = ("const DRUGS = " + json.dumps(catalog["drugs"], ensure_ascii=False, separators=(",", ":"))
                  + ";\nconst FOOD_INFO = "
                  + json.dumps(catalog["food"], ensure_ascii=False, separators=(",", ":")) + ";")
        self.assertEqual(source.replace(marker, inject), (ROOT / "web/app.js").read_text())

    def test_rebuildable_styles_and_responsive_accessibility(self):
        parts = ("00-foundation.css", "10-responsive.css", "20-workflow.css",
                 "30-reference.css", "40-modern-guidance.css", "50-studio-redesign.css", "70-duo-and-chart.css", "80-edge-navigation.css", "90-pwa-app.css", "95-boot-login.css", "96-delete-dose.css", "97-sessions-offline.css")
        self.assertEqual("".join((ROOT / "frontend/css" / part).read_text()
                                 for part in parts), (ROOT / "web/styles.css").read_text())
        css = (ROOT / "web/styles.css").read_text()
        self.assertIn(":focus-visible", css)
        self.assertIn("@container", css)
        self.assertIn("prefers-reduced-motion", css)
        self.assertIn("100dvh", css)
        self.assertIn(".skip-link", css)
        self.assertIn(".stage-loading .auth-form", css)
        self.assertIn("visibility: hidden;", css)
        self.assertIn(".stage-loading .account-panel", css)
        self.assertIn(".stage-loading .entry-links", css)


if __name__ == "__main__":
    unittest.main()
