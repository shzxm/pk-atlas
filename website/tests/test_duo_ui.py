"""iPhone Duo / Safari 27 responsive UI invariants.

The tests inspect source structures without sending any real patient data to
the browser. Run a real browser at outer/inner/side-by-side viewport sizes too.
"""
from pathlib import Path
from html.parser import HTMLParser
import unittest

ROOT=Path(__file__).resolve().parents[1]

class Markup(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack=[]
        self.ids=set()
        self.duplicates=[]
        self.disclosures={}
        self.ancestors={}
    def handle_starttag(self,tag,attrs):
        data=dict(attrs)
        element_id=data.get('id')
        if element_id:
            if element_id in self.ids:self.duplicates.append(element_id)
            self.ids.add(element_id)
            self.ancestors[element_id]=tuple(self.stack)
            if tag=='details':self.disclosures[element_id]=data
        if tag not in ('input','img','meta','link','br','hr','path','source','area','embed','wbr'):
            self.stack.append(tag)
    def handle_endtag(self,tag):
        if self.stack and tag in self.stack:
            while self.stack:
                if self.stack.pop()==tag:break

class DuoUITests(unittest.TestCase):
    def test_account_actions_are_native_disclosure(self):
        html=(ROOT/'web/index.html').read_text()
        parser=Markup();parser.feed(html)
        self.assertEqual(parser.duplicates,[])
        self.assertIn('accountTools',parser.disclosures)
        self.assertNotIn('open',parser.disclosures['accountTools'])
        self.assertIn('details',parser.ancestors['accountActions'])
        self.assertNotIn('details',parser.ancestors['syncStatus'])
        self.assertIn('id="syncLastSaved"',html)
    def test_two_column_colors_and_readouts(self):
        css=(ROOT/'frontend/css/70-duo-and-chart.css').read_text()
        for value in ['.chart-panel .probe-values','.chart-panel .legend','repeat(2, minmax(0, 1fr))',
                      '--pk-reference: #ff5da8','--pk-reference-equivalent: #d7fc72']:
            self.assertIn(value,css)
        chart=(ROOT/'frontend/05_chart.js').read_text()
        for color in ['CHART_COLORS.reference','CHART_COLORS.referenceEquivalent','CHART_COLORS.target']:
            self.assertIn(color,chart)
        ui=(ROOT/'frontend/html/60-results.html').read_text()
        self.assertIn('popovertarget="referenceGlance"',ui)
        self.assertIn('id="referenceGlanceValues"',ui)
        self.assertIn('id="chartAddDose"',ui)
    def test_mobile_selector_is_not_sticky(self):
        css=(ROOT/'frontend/css/70-duo-and-chart.css').read_text()
        self.assertIn('.stage-calc .calc-nav {',css)
        self.assertIn('position: static;',css)
        self.assertIn('#chartCaptionGuide > #chartCaption',css)
    def test_foldable_resizes_without_device_assumptions(self):
        js=(ROOT/'frontend/06_presentation.js').read_text()
        self.assertIn('ResizeObserver',js)
        self.assertIn('entries[0]?.contentRect?.width',js)
        self.assertNotIn('navigator.userAgent',js)
        css=(ROOT/'frontend/css/70-duo-and-chart.css').read_text()
        self.assertIn('env(safe-area-inset-left',css)
        self.assertIn('env(safe-area-inset-right',css)
        self.assertIn('env(safe-area-inset-bottom',css)
        self.assertIn('100dvh',css)
        support=(ROOT/'frontend/css/60-support-pages.css').read_text()
        self.assertIn('safe-area-inset-left',support)
        self.assertIn('safe-area-inset-right',support)

    def test_markup_has_safe_quick_popover(self):
        html=(ROOT/'web/index.html').read_text()
        self.assertEqual(html.count('id="referenceGlance"'),1)
        self.assertIn('id="referenceGlance" class="reference-glance" popover="auto"',html)
        self.assertIn('popovertargetaction="hide"',html)

if __name__=='__main__':
    unittest.main()
