"""Adopted plan reminders use cloud state, not legacy manual save buttons."""
import copy
import time
import unittest
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"backend"))
import push_service

class AutoPlanNotificationsTests(unittest.TestCase):
    def setUp(self):
        now=int(time.time()*1000)
        self.now=now
        self.doses=[
            {"time":now+60*60000,"mg":75},
            {"time":now+3*3600000,"mg":50}
        ]
        self.plan={"v":1,"variant":"A","drug":"pregabalin",
                   "adoptedAt":now-10*60000,"target":now+5*3600000,
                   "baselineIds":[],"doses":copy.deepcopy(self.doses),
                   "manualMatches":{}}
        self.state={"records":[],"settings":{"inverseMemory":{
            "pregabalin":{"adoptedPointPlan":self.plan}}}}
    def events(self):
        return push_service.adopted_plan_events(self.state,self.now+1,self.now+7*86400000)
    def test_adoption_automatically_creates_two_reminders(self):
        events=self.events()
        self.assertEqual(len(events),2)
        self.assertEqual([e["time"] for e in events],[d["time"] for d in self.doses])
        self.assertTrue(all(e["kind"]=="scenario" and "已采用" in e["source"] for e in events))
        self.assertEqual([x["id"] for x in events],[x["id"] for x in self.events()])
    def test_accepted_adjustment_replaces_old_pending_times(self):
        before={e["id"] for e in self.events()}
        target=self.now+2*3600000
        self.plan["adjustment"]={"doses":[{"time":target,"mg":70}],"completedCount":0,
                                  "adoptedAt":self.now}
        events=self.events()
        self.assertEqual(len(events),1)
        self.assertEqual(events[0]["time"],target)
        self.assertNotIn(events[0]["id"],before)
    def test_actual_record_matching_removes_completed_node(self):
        self.plan["doses"][0]["time"]=self.now-30*60000
        self.state["records"].append({"id":"taken","time":self.now-45*60000,
                                      "drug":"pregabalin","mg":40})
        events=self.events()
        self.assertEqual([e["time"] for e in events],[self.doses[1]["time"]])
    def test_manual_null_exclusion(self):
        self.plan["manualMatches"]={"0":None}
        self.assertEqual(len(self.events()),1)
    def test_cancel_removes_all_and_respects_record_only(self):
        self.state["settings"]["inverseMemory"]["pregabalin"].pop("adoptedPointPlan")
        self.assertEqual(self.events(),[])
        self.plan["drug"]="prep_ftc_taf"
        self.state["settings"]["inverseMemory"]={"prep_ftc_taf":{"adoptedPointPlan":self.plan}}
        self.assertEqual(self.events(),[])
    def test_current_pending_is_window_scoped(self):
        events=push_service.adopted_plan_events(self.state,self.now+2*3600000,self.now+4*3600000)
        self.assertEqual(len(events),1)
        self.assertEqual(events[0]["time"],self.doses[1]["time"])
    def test_removed_adjustment_no_longer_in_events(self):
        self.plan["adjustment"]={"doses":[{"time":self.now+90*60000,"mg":100}],
                                  "completedCount":0,"adoptedAt":self.now}
        self.assertEqual(len(self.events()),1)
        self.plan.pop("adjustment")
        self.assertEqual([event["time"] for event in self.events()],
                         [d["time"] for d in self.doses])
    def test_legacy_save_buttons_are_gone(self):
        src=(Path(__file__).resolve().parents[1]/"frontend/04_inverse_solver.js").read_text()
        self.assertNotIn("保存此模型情景的时间提醒",src)
        self.assertNotIn("saveScenarioReminder(",src)

if __name__=="__main__":
    unittest.main()
