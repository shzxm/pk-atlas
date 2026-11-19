import sqlite3
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
import session_devices

class DeviceSessionTests(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        self.db.execute('CREATE TABLE sessions (token_hash TEXT,user_id INTEGER,device_key TEXT,login_method TEXT)')
    def tearDown(self): self.db.close()
    def test_hash_scoped_to_account_and_login_method(self):
        data={'deviceId':'123e4567-e89b-12d3-a456-426614174000','deviceName':'Test Mac <script>','devicePlatform':'Mac','deviceOS':'17.0'}
        one=session_devices.from_request(1,data,'web')
        self.assertEqual(one['device_key'],session_devices.from_request(1,data,'web')['device_key'])
        self.assertNotEqual(one['device_key'],session_devices.from_request(2,data,'web')['device_key'])
        self.assertNotEqual(one['device_key'],session_devices.from_request(1,data,'ios-native')['device_key'])
        self.assertNotIn(data['deviceId'],str(one))
        self.assertNotIn('<',one['device_name'])
    def test_dedup_only_same_account_method_and_id(self):
        same=session_devices.from_request(1,{'deviceId':'aaaaaaaaaaaaaaaa'},'web')
        other=session_devices.from_request(1,{'deviceId':'bbbbbbbbbbbbbbbb'},'web')
        self.db.executemany('INSERT INTO sessions VALUES(?,?,?,?)',[
          ('old',1,same['device_key'],'web'),('different',1,other['device_key'],'web'),
          ('native',1,same['device_key'],'ios-native'),('otheruser',2,same['device_key'],'web')])
        self.assertEqual(session_devices.prune_old_same_installation(self.db,1,same),1)
        names=[r[0] for r in self.db.execute('SELECT token_hash FROM sessions')]
        self.assertEqual(set(names),{'different','native','otheruser'})
    def test_legacy_session_is_not_identified_by_ua(self):
        info=session_devices.from_request(1,{'deviceId':'bad','deviceName':'Mac · Browser'},'web')
        self.assertEqual(info['device_key'],'')
        self.assertEqual(session_devices.prune_old_same_installation(self.db,1,info),0)

if __name__=='__main__': unittest.main()
