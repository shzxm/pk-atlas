from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]

class InverseTargetWindowTests(unittest.TestCase):
 def test_cross_platform_fields_and_worker_check(self):
  html=(ROOT/'frontend/html/60-results.html').read_text()
  worker=(ROOT/'web/inverse-worker.js').read_text()
  script=(ROOT/'frontend/04_inverse_solver.js').read_text()
  setup=(ROOT/'frontend/04_inverse_setup.js').read_text()
  core=(ROOT/'frontend/01_core.js').read_text()
  for name in ('pointTargetLimitEnabled','pointTargetLimitBlood','pointTargetLimitEquivalent'):
   self.assertIn(name,html)
   self.assertIn(name,setup)
   self.assertIn(name,core)
  self.assertIn('targetWindow},requestId',script)
  self.assertIn('refinePointTargetWindow',worker)
  self.assertIn('targetWindowUnreached',worker)
  self.assertIn('Math.abs(observed-threshold)<=delta+limit',script)
  self.assertIn('return Math.abs(observed-threshold)<=delta+limit?candidate:null;',script)

if __name__=='__main__':unittest.main()
