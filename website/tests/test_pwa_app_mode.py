"""Standalone PWA shell: view architecture and nonduplicated source forms."""
import json
import re
import unittest
from pathlib import Path
from html.parser import HTMLParser

ROOT = Path(__file__).resolve().parents[1]

class Index(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids=[]
        self.forms=[]
        self.tabs=[]
    def handle_starttag(self,tag,attrs):
        d=dict(attrs)
        if d.get('id'):self.ids.append(d['id'])
        if tag=='form':self.forms.append(d.get('id'))
        if d.get('data-app-tab'):self.tabs.append(d.get('data-app-tab'))

class AppModeTests(unittest.TestCase):
    def test_four_destinations_and_single_source_forms(self):
        html=(ROOT/"web/index.html").read_text()
        p=Index();p.feed(html)
        self.assertEqual(p.tabs,["today","chart","history","my"])
        self.assertEqual(set(p.forms),{"authForm","doseForm","intakeForm"})
        self.assertEqual(len(p.forms),3)
        self.assertEqual(len(set(p.ids)),len(p.ids))
        for tag in ("appHome","appMy","appHistoryHeading","appHeaderSync",
                    "appTabBar","appRecordSheet","appSheetBody","appHomeDrug",
                    "appMiniChart","appHomeRecords","appHomeWarning"):
            with self.subTest(id=tag):
                self.assertIn(tag,p.ids)
        self.assertIn('app.js?v=offline-20261116a',html)
        self.assertIn('aria-label="应用导航"',html)
        self.assertIn('aria-label="记录一次服用"',html)
        self.assertIn('role="alert" hidden',html)

    def test_sheet_moves_original_form_without_creating_medical_data(self):
        js=(ROOT/"frontend/07_app_mode.js").read_text()
        self.assertIn('appSheetAnchors[id]=anchor',js)
        self.assertIn('dialog.showModal()',js)
        self.assertIn('appRestoreSheetForm',js)
        self.assertIn('syncRestoreEditor()',js)
        for forbidden in ("fetch(","api(","stateVersion=","records.push(","persist()"):
            self.assertNotIn(forbidden,js)
        user_actions=(ROOT/"frontend/06_ui.js").read_text()
        self.assertIn('appCloseSheet()',user_actions)
        self.assertIn('appOpenSheet("dose",{editing:true})',user_actions)
        self.assertIn('appOpenSheet("intake",{editing:true})',user_actions)

    def test_logged_in_default_today_without_existing_records(self):
        src=(ROOT/"frontend/02_auth.js").read_text()
        self.assertIn('else openCalculationDate(today);',src)
        app=(ROOT/"frontend/07_app_mode.js").read_text()
        for tab in ("today","chart","history","my"):
            self.assertIn('\"'+tab+'\"',app)
        self.assertIn('renderAppHistoryQuicklist()',app)
        self.assertIn('appMoveLegacyToMy()',app)
        self.assertIn('appRestoreLegacy()',app)

    def test_cloud_chip_does_not_suppress_failure(self):
        app=(ROOT/"frontend/07_app_mode.js").read_text()
        self.assertIn('src.classList.contains("error")',app)
        self.assertIn('state==="conflict"',app)
        self.assertIn('dst.textContent=level==="synced"?"已同步"',app)
        self.assertIn('button.setAttribute("aria-label",dst.textContent+',app)
    def test_duo_larger_inner_split_and_compact_tab_bar(self):
        css=(ROOT/"frontend/css/90-pwa-app.css").read_text()
        self.assertIn('min-height:100dvh',css)
        self.assertIn('env(safe-area-inset-bottom,0px)',css)
        self.assertIn('min-width:820px',css)
        self.assertIn('grid-template-columns:minmax(280px,36%) minmax(0,1fr)',css)
        self.assertIn('min-height:52px',css)
        self.assertIn('position:fixed',css)
        self.assertIn('.app-record-sheet[open]',css)
        self.assertIn('overscroll-behavior:contain',css)
    def test_manifest_preserves_existing_install_identity(self):
        manifest=json.loads((ROOT/"web/manifest.webmanifest").read_text())
        self.assertEqual(manifest["start_url"],"/")
        self.assertEqual(manifest["scope"],"/")
        self.assertEqual(manifest["display"],"standalone")
        self.assertEqual(manifest["short_name"],"药时")
        self.assertEqual(manifest["theme_color"],"#0b1420")

if __name__=="__main__":
    unittest.main()
