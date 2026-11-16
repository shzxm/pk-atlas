"""The iPhone Duo sidebar belongs to Safari, so navigation must stay in page."""
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

class EdgeNavigationTests(unittest.TestCase):
    def test_right_dock_uses_native_buttons_and_popover(self):
        html=(ROOT/'web/index.html').read_text()
        self.assertEqual(html.count('id="edgeDock"'),1)
        self.assertIn('id="edgeDockBack"',html)
        self.assertIn('aria-label="返回日期列表"',html)
        self.assertIn('id="edgeDockMenu"',html)
        self.assertIn('popovertarget="edgeDockMenu"',html)
        self.assertIn('popover="auto"',html)
        for action in ('dates','records','timeline','history','top'):
            self.assertIn('data-edge-action="'+action+'"',html)
    def test_on_page_navigation_does_not_write_medication(self):
        js=(ROOT/'frontend/06_presentation.js').read_text()
        section=js[js.index('function edgeNavigate(action){'):js.index('function initPresentation(){')]
        for forbidden in ('persist(', 'syncSchedule(', 'api(', 'history.back(', 'location.assign(', 'location.href='):
            self.assertNotIn(forbidden,section)
        self.assertIn('$("backToChooser").click()',section)
        self.assertIn('setMobilePane(results?"results":"records")',section)
    def test_buttons_remain_in_safari_web_safe_area(self):
        css=(ROOT/'frontend/css/80-edge-navigation.css').read_text()
        self.assertIn('env(safe-area-inset-right',css)
        self.assertIn('37dvh',css)
        self.assertIn('(pointer:coarse)',css)
        self.assertIn('min-height: 44px',css)
        self.assertIn('position: fixed',css)
        self.assertIn('.stage-calc .edge-dock',css)
        self.assertNotIn('viewport-fit="cover"',css)

if __name__=="__main__":
    unittest.main()
