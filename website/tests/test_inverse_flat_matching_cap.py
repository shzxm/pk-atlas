"""Inverse: summed future model dose cap, flatter B, and distinct matched nodes."""
import unittest
from pathlib import Path
from html.parser import HTMLParser
ROOT=Path(__file__).resolve().parents[1]
class FormIds(HTMLParser):
    def __init__(self):super().__init__();self.inputs={}
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if a.get('id'):self.inputs[a['id']]=(tag,a)
class InverseFlatMatchCapTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html=(ROOT/'web/index.html').read_text()
        cls.solver=(ROOT/'frontend/04_inverse_solver.js').read_text()
        cls.worker=(ROOT/'web/inverse-worker.js').read_text()
        cls.core=(ROOT/'frontend/01_core.js').read_text()
        cls.chart=(ROOT/'frontend/05_chart.js').read_text()
        cls.push=(ROOT/'backend/push_service.py').read_text()
    def test_cumulative_cap_is_independent_from_single_dose(self):
        p=FormIds();p.feed(self.html)
        self.assertIn('pointTotalMax',p.inputs)
        self.assertEqual(p.inputs['pointTotalMax'][1]['type'],'number')
        self.assertIn('现在至目标时刻累计新增预计剂量上限',self.html)
        self.assertIn('累计上限限制从当前计算时刻至目标时刻全部新增模型节点剂量之和',self.html)
        self.assertIn('"pointTotalMax"',self.core)
        self.assertIn('totalMax:Number($("pointTotalMax").value)||0',self.solver)
        self.assertIn('totalCap,targetWindow},requestId',self.solver)
        self.assertIn('totalCap:rawTotalCap',self.worker)
        self.assertIn('reason:"totalNoSolution"',self.solver)
        self.assertIn('totalDose=doses=>doses.filter(',self.solver)
    def test_b_selection_prioritizes_peak_to_trough_then_spread_then_mg(self):
        self.assertIn('function solveFlattestPoint(',self.solver)
        self.assertIn('stats.swing<best.stabilitySwing-1e-6',self.solver)
        self.assertIn('stats.spread<best.stabilitySpread-1e-6',self.solver)
        self.assertIn('checked.mg<best.mg-1e-6',self.solver)
        self.assertIn('budget=Math.min(totalCap,primary.mg)',self.solver)
        self.assertIn('方案 B · 血药曲线平稳优先',self.solver)
        self.assertIn('bStats.swing>aStats.swing+1e-6',self.worker)
        self.assertIn('solveFlattestPoint(',self.worker)
    def test_multi_match_keeps_completed_nodes_distinct_from_actual_records(self):
        self.assertIn('function manualMatchIds(',self.solver)
        self.assertIn('matchedNodeCount=new Set(completed.map(',self.solver)
        self.assertIn('plan.doses.length-matchedNodeCount',self.solver)
        self.assertIn('completedCount:state.matchedNodeCount',self.solver)
        self.assertIn('manualBlockedAuto.has(i)',self.solver)
        self.assertIn('len(matched_nodes)',self.push)
        self.assertIn('manual_blocked_auto',self.push)
        self.assertIn('Array.isArray(id)&&id.length<=20',self.core)
    def test_match_curve_uses_existing_actual_records_once(self):
        self.assertIn('function previewAdoptedMatches(',self.solver)
        self.assertIn('matchedRecordIds:state.completed.map(',self.solver)
        self.assertIn('显示当前多点匹配与预计节点曲线',self.solver)
        self.assertIn('const matchedIds=new Set(',self.chart)
        self.assertIn('已匹配 ',self.chart)
        self.assertIn('details.open=expandedMatchNode===index',self.solver)
        self.assertIn('selected.length>=20',self.solver)
    def test_replanning_and_worker_both_check_total_cap(self):
        self.assertIn('totalCap=Number(plan.totalMax)>0?',self.solver)
        self.assertIn('remaining,totalCap)',self.solver)
        self.assertIn('cycle,peak,fixedCount,totalCap)',self.worker)
    def test_release_version_identical_for_shell_and_worker(self):
        version='server-math-20261117b'
        assert version in self.worker
        assert version in (ROOT/'frontend/html/00-document.html').read_text()
        assert version in (ROOT/'web/sw.js').read_text()
        assert 'devices-20261117a' in (ROOT/'frontend/07_offline.js').read_text()
if __name__=='__main__':unittest.main()
