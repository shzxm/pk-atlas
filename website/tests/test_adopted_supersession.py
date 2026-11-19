import hashlib,json,sqlite3,time,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
import push_service

class SupersessionTests(unittest.TestCase):
    def setUp(self):
        self.now=int(time.time()*1000)
        self.times=[self.now+(i+1)*3600000 for i in range(5)]
        self.base=[{'time':self.times[i],'mg':50+i*25} for i in (0,1,2)]
        self.adjustment=[{'time':self.times[i],'mg':45+i*10} for i in (3,4)]
        self.plan={'v':1,'drug':'pregabalin','variant':'A','doses':self.base,
                   'adoptedAt':self.now-120000,'target':self.times[-1]+3600000,
                   'baselineIds':[], 'manualMatches':{},
                   'adjustment':{'doses':self.adjustment,'completedCount':0,'adoptedAt':self.now-30000}}
        self.state={'records':[], 'settings':{'inverseMemory':{'pregabalin':{'adoptedPointPlan':self.plan}},'scheduledDoses':[]}}
    def events(self):
        return push_service.adopted_plan_events(self.state,self.now,self.now+9*3600000)
    def test_new_adopted_adjustment_replaces_three_old_nodes(self):
        events=self.events()
        current=[r for r in events if r['source'].startswith('已采用的反算')]
        self.assertEqual(len(current),2)
        self.assertEqual([r['time'] for r in current],[r['time'] for r in self.adjustment])
        self.assertFalse(any(r['time'] in {d['time'] for d in self.base} for r in events))
    def test_entirely_new_plan_replaces_old_adjustment(self):
        newest={'v':1,'drug':'pregabalin','variant':'B','doses':[{'time':self.times[2],'mg':60}],
                'adoptedAt':self.now,'target':self.times[-1]+3600000,
                'baselineIds':[],'manualMatches':{},'includedScheduledDoses':[]}
        self.state['settings']['inverseMemory']['pregabalin']['adoptedPointPlan']=newest
        current=self.events()
        self.assertEqual(len(current),1)
        self.assertEqual(current[0]['time'],self.times[2])
    def test_standalone_old_schedules_are_not_reused(self):
        item={'id':'previous-model-schedule','drug':'pregabalin','time':self.times[1]+600000,'mg':120}
        self.state['settings']['scheduledDoses']=[item]
        self.assertEqual(len(self.events()),2,'unrelated old scheduled entry must not be an adopted alert')
        self.plan['includedScheduledDoses']=[dict(item)]
        self.assertEqual(len(self.events()),3,'only explicitly accepted future schedule joins the adopted plan')
        self.state['settings']['scheduledDoses'][0]['mg']=130
        self.assertEqual(len(self.events()),2,'edited schedule cannot be silently retained in an old adopted snapshot')
    def test_previous_change_versions_collapsed(self):
        c=sqlite3.connect(':memory:')
        push_service.initialize_adopted_changes(c)
        for v in (4,5,6):push_service.queue_adopted_change(c,1,v)
        self.assertEqual(c.execute('SELECT COUNT(*) FROM web_push_adopted_changes').fetchone()[0],1)
        self.assertEqual(c.execute('SELECT version FROM web_push_adopted_changes').fetchone()[0],6)

if __name__=='__main__':unittest.main()
