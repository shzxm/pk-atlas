"""The point solver must apply separate hard constraints in explicit units.

Numerical synthetic Worker smoke tests are also run in an isolated browser.
"""
from pathlib import Path
from html.parser import HTMLParser
import unittest

ROOT=Path(__file__).resolve().parents[1]

class Controls(HTMLParser):
    def __init__(self):
        super().__init__();self.tags=[];self.fields={};self.options={};self.current_select=None
    def handle_starttag(self,tag,attrs):
        d=dict(attrs)
        if d.get('id'):
            self.tags.append(d['id']);self.fields[d['id']]=(tag,d)
        if tag=='select':self.current_select=d.get('id')
        if tag=='option' and self.current_select:
            self.options.setdefault(self.current_select,[]).append(d.get('value'))
    def handle_endtag(self,tag):
        if tag=='select':self.current_select=None

class DualInverseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.js=(ROOT/'frontend/04_inverse_solver.js').read_text()
        cls.worker=(ROOT/'web/inverse-worker.js').read_text()
        cls.html=(ROOT/'web/index.html').read_text()
    def test_controls_explain_interval_and_independent_units(self):
        p=Controls();p.feed(self.html)
        self.assertEqual(len(p.tags),len(set(p.tags)))
        self.assertEqual(p.options['pointCycleMode'],['blood','equivalent'])
        self.assertEqual(p.options['pointPeakMode'],['equivalent','blood'])
        for id in ['pointCycleMin','pointPeakMin']:
            self.assertEqual(p.fields[id][0],'input')
            self.assertEqual(p.fields[id][1]['type'],'number')
        self.assertIn('现在至目标时刻',self.html)
        self.assertIn('首次连续达到参考线至目标时刻',self.html)
    def test_solver_has_distinct_windows_and_hard_rejection(self):
        self.assertIn('function pointConstraintMetrics(',self.js)
        self.assertIn('function strengthenPointCycleFloor(',self.js)
        self.assertIn('function enforcePointConstraints(',self.js)
        self.assertIn('cycleMinTime:',self.js)
        self.assertIn('reason:"cycleAlreadyBelow"',self.js)
        self.assertIn('reason:"cycleNoSolution"',self.js)
        self.assertIn('reason:"peakNoSolution"',self.js)
        self.assertIn('result.cycleMinBlood',self.js)
        self.assertIn('result.cycleMinEquivalent',self.js)
        self.assertIn('result.peakBlood',self.js)
        self.assertIn('result.peakEquivalent',self.js)
    def test_worker_rechecks_all_model_candidates(self):
        self.assertIn('enforcePointConstraints(drug,rows,result',self.worker)
        self.assertIn('enforcePointConstraints(drug,rows,previousMinimum',self.worker)
        self.assertIn('solveFlattestPoint(',self.worker)
        self.assertIn('cycleFloor,peakRequirement',self.worker)
        self.assertIn('peak.mode==="equivalent"?peak.value:0',self.worker)
        self.assertIn('cycleValid',self.js)
        self.assertIn('peakValid',self.js)
    def test_adoption_saves_and_replans_with_constraints(self):
        self.assertIn('peakMode:$("pointPeakMode").value',self.js)
        self.assertIn('cycleMode:$("pointCycleMode").value',self.js)
        self.assertIn('cycleMin:Number($("pointCycleMin").value)||0',self.js)
        self.assertIn('result=enforcePointConstraints(drug,rows,result',self.js)
        core=(ROOT/'frontend/01_core.js').read_text()
        self.assertIn('clean.peakMode=',core)
        self.assertIn('clean.cycleMode=',core)
        self.assertIn('clean.cycleMin=',core)
        self.assertIn('"pointCycleMin"',core)
    def test_restored_live_stability_search_not_removed(self):
        self.assertIn('function solveStablePoint(',self.js)
        self.assertIn('function pointStabilityStats(',self.js)
        self.assertIn('solveFlattestPoint(',self.worker)
        self.assertIn('方案 B · 血药曲线平稳优先',self.js)
    def test_standalone_worker_cache_and_release_all_match(self):
        version='server-math-20261117b'
        assert version in self.worker
        assert version in (ROOT/'frontend/html/00-document.html').read_text()
        sw=(ROOT/'web/sw.js').read_text()
        self.assertIn('"/inverse-worker.js?v='+version+'"',sw)
        self.assertIn('"/app.js?v=devices-20261117a"',sw)
        self.assertIn('inverse-worker.js', (ROOT/'scripts/deploy_web_only.sh').read_text())

if __name__=='__main__':unittest.main()
