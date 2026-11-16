"""Source-to-production build parity and disclosure semantics."""
import unittest
from pathlib import Path
from html.parser import HTMLParser

ROOT=Path(__file__).resolve().parents[1]
HTML_PARTS=('00-document.html','10-shell.html','20-account.html','30-journal.html','40-timeline.html','50-records.html','60-results.html','70-reference.html','80-dialogs.html')
JS_PARTS=('01_core.js','01_sync.js','02_auth.js','02_records.js','02_day.js','03_model.js','04_inverse_overview.js','04_inverse_setup.js','04_inverse_solver.js','05_chart.js','06_presentation.js','07_app_mode.js','07_device_sessions.js','07_offline.js','06_ui.js')

class Structure(HTMLParser):
    def __init__(self):
        super().__init__()
        self.depth=0
        self.ids=[]
        self.summaries=0
        self.forms={}
    def handle_starttag(self,tag,attrs):
        d=dict(attrs)
        if d.get('id'):self.ids.append(d['id'])
        if tag=='details':self.depth+=1
        if tag=='summary':
            assert self.depth>0, 'summary outside details'
            self.summaries+=1
        if tag=='form':self.forms[d.get('id')]=d
    def handle_endtag(self,tag):
        if tag=='details':
            self.depth-=1
            assert self.depth>=0

class SiteArchitectureTests(unittest.TestCase):
    def test_html_build_sources_and_sections(self):
        built=(ROOT/'web/index.html').read_text()
        source=''.join((ROOT/'frontend/html'/p).read_text() for p in HTML_PARTS)
        self.assertEqual(source,built)
        parsed=Structure();parsed.feed(built)
        self.assertEqual(parsed.depth,0)
        self.assertEqual(len(parsed.ids),len(set(parsed.ids)))
        self.assertGreaterEqual(parsed.summaries,14)
        for name in ('planPanel','advancedTools','readingGuide','historyGuide','sourcesGuide','renalGuide',
                     'drugDetailGuide','mealImpactGuide','dailyChartsGuide','chartCaptionGuide'):
            self.assertEqual(built.count('id="'+name+'"'),1)
        self.assertIn('id="drugSafetyAlert"',built)
        self.assertEqual(set(parsed.forms),{'authForm','doseForm','intakeForm'})
        self.assertTrue(all(form.get('method')=='post' for form in parsed.forms.values()))
    def test_js_modular_preserves_autosave_and_model(self):
        parts=''.join((ROOT/'frontend'/p).read_text() for p in JS_PARTS)
        result=(ROOT/'web/app.js').read_text()
        self.assertIn('function oralKernel(',result)
        self.assertIn('function initPresentation(',result)
        self.assertIn('function flushSync(',result)
        self.assertGreater(len(result),len(parts))
        self.assertEqual(parts.count('/* PK_CATALOG: generated from shared/catalog.json by scripts/build.py */'),1)
    def test_support_pages_are_accessible_disclosures(self):
        for page,expected in [('quick',2),('install',2),('api',4)]:
            with self.subTest(page=page):
                html=(ROOT/'web'/(page+'.html')).read_text()
                parsed=Structure();parsed.feed(html)
                self.assertEqual(parsed.depth,0)
                self.assertGreaterEqual(parsed.summaries,expected)
                self.assertIn('/support.css?v=duo-20261115',html)
                self.assertIn('/'+page+'.css?v=studio-20261115',html)
                self.assertEqual((ROOT/'web'/(page+'.css')).read_text(),
                                 (ROOT/'frontend/css/support'/(page+'.css')).read_text())
                self.assertNotIn('<style>',html)
        self.assertEqual((ROOT/'web/support.css').read_text(),
                         (ROOT/'frontend/css/60-support-pages.css').read_text())
    def test_number_formatter_keeps_integer_trailing_zeroes(self):
        source=(ROOT / "frontend/01_core.js").read_text()
        self.assertIn('raw.includes(".")',source)
        self.assertNotIn(".replace(/\\.?0+$/",source)

    def test_disclosure_navigation_does_not_change_medical_data(self):
        js=(ROOT/'frontend/06_presentation.js').read_text()
        self.assertNotIn('persist()',js)
        self.assertNotIn('api(',js)
        self.assertIn('setMobilePane("results"',js)
        self.assertIn('openDisclosure("historyGuide"',js)

if __name__=='__main__':
    unittest.main()
