import json,sqlite3,tempfile,time,unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
import push_service,native_apns
# When the optional Web Push package is not installed, dispatch_due still
# permits a fully mocked transport in this isolated release regression.
try:
    import pywebpush
except ImportError:
    import types
    sys.modules['pywebpush'] = types.SimpleNamespace(WebPushException=Exception)

class AdoptedNotifications(unittest.TestCase):
    def test_push_debounced_per_subscriber_and_future_plan_not_duplicate(self):
        now=int(time.time()*1000)
        state={'records':[],'settings':{'inverseMemory':{'pregabalin':{'adoptedPointPlan':{
            'v':1,'drug':'pregabalin','variant':'A','doses':[{'time':now+300000,'mg':75}],
            'target':now+3600000,'adoptedAt':now-60000,'baselineIds':[],
            'includedScheduledDoses':[{'id':'scheduled-1','drug':'pregabalin','time':now-20000,'mg':150}]}}},
            'scheduledDoses':[{'id':'scheduled-1','drug':'pregabalin','time':now-20000,'mg':150}]}}
        events=push_service.adopted_plan_events(state,now-60000,now+3600000)
        self.assertEqual(len(events),2)
        state['records']=[{'id':'taken','drug':'pregabalin','time':now-20000,'mg':150}]
        self.assertEqual(len(push_service.adopted_plan_events(state,now-60000,now+3600000)),0)
        state['records']=[]
        with tempfile.TemporaryDirectory() as temp:
            path=str(Path(temp)/'push-test.sqlite3')
            with sqlite3.connect(path) as db:
                db.executescript('''CREATE TABLE push_subscriptions(endpoint_hash TEXT PRIMARY KEY,user_id INTEGER,endpoint TEXT,p256dh TEXT,auth TEXT,details INTEGER,created_at INTEGER);
                CREATE TABLE push_deliveries(endpoint_hash TEXT,event_key TEXT,sent_at INTEGER,PRIMARY KEY(endpoint_hash,event_key));
                CREATE TABLE push_preferences(user_id INTEGER PRIMARY KEY,body TEXT);
                CREATE TABLE user_state(user_id INTEGER PRIMARY KEY,version INTEGER,body TEXT);
                CREATE TABLE web_push_adopted_changes(user_id INTEGER,version INTEGER,created_at INTEGER,PRIMARY KEY(user_id,version));''')
                db.execute('INSERT INTO user_state VALUES(1,3,?)',(json.dumps(state),))
                db.execute('INSERT INTO push_subscriptions VALUES(?,?,?,?,?,?,?)',('endpoint-hash',1,'https://fcm.googleapis.com/fake','fake-p256dh','fake-auth',0,now//1000))
                db.execute('INSERT INTO web_push_adopted_changes VALUES(1,3,?)',(now//1000,))
            original=push_service.send
            sent=[]
            push_service.send=lambda subscription,payload:sent.append(payload)
            try:
                self.assertEqual(push_service.dispatch_due(path,now),2)
                self.assertEqual(len(sent),2)
                self.assertEqual(push_service.dispatch_due(path,now),0)
            finally:
                push_service.send=original
    def test_unconfigured_app_provider_skips(self):
        self.assertFalse(native_apns.configured())
        native_apns.schedule_change(999,1,adopted_changed=True)

if __name__=='__main__':unittest.main()
