"""Bounded search is not mathematical infeasibility or medication advice."""
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
class BoundedSearchDiagnosticTests(unittest.TestCase):
    def test_worker_distinguishes_search_failure(self):
        s=(ROOT/'web/inverse-worker.js').read_text()
        self.assertIn('boundedSearchIncomplete',s)
        self.assertIn('initialCandidate',s)
        self.assertIn('checkedDoseNodes',s)
        self.assertIn('checkedPeak',s)
        self.assertIn('automaticNodeLimit:12',s)
        self.assertIn('if(!fixedCount&&initialCandidate&&',s)
        self.assertIn('peakNoSolution',s)
    def test_ui_stops_claiming_impossibility_or_offering_extra_doses(self):
        s=(ROOT/'frontend/04_inverse_solver.js').read_text()
        self.assertIn('result.reason==="boundedSearchIncomplete"',s)
        self.assertIn('当前有界数学搜索未找到满足全部输入约束',s)
        self.assertIn('没有设置医学剂量上限',s)
        self.assertIn('模型不对安全剂量作任何判断',s)
    def test_strict_cycle_below_start_still_distinct(self):
        s=(ROOT/'frontend/04_inverse_solver.js').read_text()
        self.assertIn('result.reason==="cycleAlreadyBelow"',s)
        self.assertIn('modelValue(drug,now,rows,cycleMode)<cycleMin-1e-6',s)
    def test_cache_assets_all_reversioned(self):
        v='server-math-20261117b'
        for p in ['frontend/04_inverse_solver.js','frontend/html/00-document.html','web/inverse-worker.js','web/sw.js']:
            self.assertIn(v,(ROOT/p).read_text(),p)
        self.assertIn('devices-20261117a',(ROOT/'frontend/07_offline.js').read_text())
    def test_notice_explicit_12_node_upper_bound(self):
        s=(ROOT/'frontend/html/60-results.html').read_text()
        self.assertIn('自动搜索仍最多检查 12 个模型节点',s)
        self.assertIn('不自动扩充次数',s)
if __name__=='__main__':unittest.main()
