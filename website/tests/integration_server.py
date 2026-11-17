"""Exercise a temporary API process without touching production records."""
import http.cookiejar
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as temporary:
    env = dict(os.environ, PK_DB=str(Path(temporary)/'test.sqlite3'), PK_PORT='9877')
    process = subprocess.Popen(['python3', str(ROOT/'backend/server.py')], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    opener = urllib.request.build_opener()
    cookie = [None]
    latest_set_cookie=[None]
    def call(path, method='GET', data=None, token=None):
        payload = json.dumps(data).encode() if data is not None else None
        headers = {'Host':'pk.example.com','Origin':'https://pk.example.com'}
        if payload is not None:headers['Content-Type']='application/json'
        if cookie[0]:headers['Cookie']=cookie[0]
        if token:headers['Authorization']='Bearer '+token
        req = urllib.request.Request('http://127.0.0.1:9877'+path, data=payload, headers=headers, method=method)
        try:
            with opener.open(req,timeout=4) as response:
                latest_set_cookie[0]=response.headers.get('Set-Cookie')
                if latest_set_cookie[0]:cookie[0]=latest_set_cookie[0].split(';',1)[0]
                return response.status,json.load(response)
        except urllib.error.HTTPError as error:return error.code,json.load(error)
    try:
        for _ in range(40):
            try:
                if call('/api/health')[0] == 200:break
            except Exception:time.sleep(.1)
        else:raise RuntimeError('API did not start')
        status, registered=call('/api/register','POST',{'username':'test_family','password':'test-passphrase-123'})
        assert status==200 and registered['username']=='test_family'
        assert 'Max-Age=' in (latest_set_cookie[0] or '')
        assert 'HttpOnly' in latest_set_cookie[0] and 'SameSite=Strict' in latest_set_cookie[0]
        assert registered['account']['version']==0 and registered['account']['state']['records']==[]
        status, sessions=call('/api/sessions')
        assert status==200 and len(sessions['sessions'])==1
        original_cookie=cookie[0]
        original_hash=sessions['sessions'][0]['id']
        assert sessions['sessions'][0]['current'] and sessions['sessions'][0]['remembered']
        # A distinct browser login can use a short lived non-remembered
        # session, with separate server timeout and revocation.
        status,secondary=call('/api/login','POST',{
            'username':'test_family','password':'test-passphrase-123','remember':False})
        assert status==200 and secondary['remembered'] is False
        assert 'Max-Age=' not in (latest_set_cookie[0] or ''),(latest_set_cookie[0] or '')
        assert 'HttpOnly' in latest_set_cookie[0] and 'Secure' in latest_set_cookie[0]
        secondary_cookie=cookie[0]
        status,other_sessions=call('/api/sessions')
        assert status==200 and len(other_sessions['sessions'])==2
        short=[x for x in other_sessions['sessions'] if x['current']][0]
        assert short['id']!=original_hash and short['remembered'] is False
        # A session may revoke only another session belonging to its user.
        cookie[0]=original_cookie
        status,revoked=call('/api/sessions/revoke','POST',{'id':short['id']})
        assert status==200 and revoked['revoked'] and revoked['current'] is False
        cookie[0]=secondary_cookie
        assert call('/api/me')[0]==401
        cookie[0]=original_cookie
        assert call('/api/me')[0]==200
        assert len(call('/api/sessions')[1]['sessions'])==1
        # Other sessions are revoked without logging the current browser out.
        for _ in range(2):
            assert call('/api/login','POST',{'username':'test_family','password':'test-passphrase-123','remember':True})[0]==200
        cookie[0]=original_cookie
        assert len(call('/api/sessions')[1]['sessions'])==3
        status,bye=call('/api/sessions/revoke-others','POST',{})
        assert status==200 and bye['revoked']==2,(status,bye)
        assert len(call('/api/sessions')[1]['sessions'])==1
        assert call('/api/me')[0]==200
        # A nonexistent or malformed session ID cannot terminate others.
        assert call('/api/sessions/revoke','POST',{'id':'wrong'})[0]==400
        assert call('/api/me')[0]==200
        status, initial = call('/api/state')
        assert status == 200 and initial['version'] == 0
        status, updated = call('/api/state/sections','PUT',{'version':0,'sections':{'plans':{'pregabalin':{'dose':75}}}})
        assert status == 200 and updated['version'] == 1,(status,updated)
        assert call('/api/state')[1]['state']['plans']['pregabalin']['dose'] == 75
        assert call('/api/state/sections')[1]['sections']['plans']['pregabalin']['dose'] == 75
        assert call('/api/state/sections','PUT',{'version':0,'sections':{'settings':{'currentDrug':'pregabalin'}}})[0] == 409
        status,key = call('/api/v1/key','POST',{})
        assert status == 200,(status,key)
        status,dose = call('/api/v1/doses','POST',{'username':'test_family','drug':'pregabalin','amount':75,'unit':'mg','idempotencyKey':'test-dose-00001'},key['apiKey'])
        assert status == 201,(status,dose)
        assert len(call('/api/state/sections')[1]['sections']['records']) == 1
        # Simulate stale second-device writes without touching any real account.
        status, before = call('/api/state')
        assert status == 200
        version = before['version']
        status, committed = call('/api/state/sections', 'PUT', {'version': version,
          'sections': {'records': before['state']['records'] + [{
              'id':'autotest-record', 'drug':'amoxicillin','time':0,'mg':250,'unit':'mg'}]}})
        assert status == 200
        status, rejected = call('/api/state/sections', 'PUT', {'version': version,
          'sections': {'intakes':[{'id':'autotest-meal','time':0,'kind':'meal','mealType':'regular','drink':'none'}]}})
        assert status == 409, (status,rejected)
        status, applied = call('/api/state/sections', 'PUT',
          {'version':rejected['version'], 'sections':{'intakes':[
           {'id':'autotest-meal','time':0,'kind':'meal','mealType':'regular','drink':'none'}]}})
        assert status == 200
        status, after = call('/api/state')
        assert status == 200 and len(after['state']['records']) == 2, after
        assert len(after['state']['intakes']) == 1
        assert after['version'] == applied['version']
        # Deletion uses the same versioned section-sync path as edits.
        status, existing=call('/api/state')
        assert status==200
        count_before=len(existing["state"]["records"])
        assert count_before>=2
        retained=existing["state"]["records"][:-1]
        status, gone=call('/api/state/sections','PUT',
          {"version":existing["version"],"sections":{"records":retained}})
        assert status==200,(status,gone)
        after_delete=call('/api/state')[1]
        assert after_delete["version"]==gone["version"]
        assert after_delete["state"]["records"]==retained
        sections_after=call('/api/state/sections')[1]
        assert sections_after["sections"]["records"]==retained
        assert len(retained)==count_before-1
        after=after_delete
        # Food edits and deletions use the identical versioned sync protocol.
        assert len(after["state"]["intakes"])==1
        status,meal_removed=call('/api/state/sections','PUT',
          {"version":after["version"],"sections":{"intakes":[]}})
        assert status==200,(status,meal_removed)
        after=call('/api/state')[1]
        assert after["version"]==meal_removed["version"]
        assert after["state"]["intakes"]==[]
        assert call('/api/state/sections')[1]["sections"]["intakes"]==[]
        # Invalid origin remains denied. The original 403 failure was an
        # unsupported route on production, NOT a reason to remove CSRF checks.
        bad = urllib.request.Request('http://127.0.0.1:9877/api/state/sections',
            data=json.dumps({'version':-1,'sections':{'plans':{}}}).encode(),
            headers={'Host':'pk.example.com','Origin':'https://other.example',
                     'Content-Type':'application/json','Cookie':cookie[0]},method='PUT')
        try:
            opener.open(bad,timeout=4)
            raise AssertionError('CSRF origin unexpectedly accepted')
        except urllib.error.HTTPError as error:
            assert error.code==403
        now_ms=int(time.time()*1000)
        plan={'v':1,'variant':'A','drug':'pregabalin',
              'adoptedAt':now_ms,'target':now_ms+4*3600000,
              'baselineIds':[],'manualMatches':{},
              'doses':[{'time':now_ms+3600000,'mg':75},
                       {'time':now_ms+2*3600000,'mg':50}]}
        ver,state=after['version'],after['state']
        settings=dict(state.get('settings') or {})
        settings['inverseMemory']={'pregabalin':{'adoptedPointPlan':plan}}
        status,res=call('/api/state/sections','PUT',{'version':ver,'sections':{'settings':settings}})
        assert status==200,(status,res)
        status,diag=call('/api/push/diagnostics')
        assert status==200 and diag["subscribedDevices"]==0 and diag["acceptedByProviderTotal"]==0
        assert diag["deviceDeliveryConfirmed"] is False
        status,pending=call('/api/push/pending')
        auto=[e for e in pending['events'] if e['kind']=='scenario']
        assert status==200 and len(auto)==2,(status,auto)
        plan['adjustment']={'doses':[{'time':now_ms+90*60000,'mg':60}],
                            'completedCount':0,'adoptedAt':now_ms+1000}
        status,res=call('/api/state/sections','PUT',{'version':res['version'],'sections':{'settings':settings}})
        assert status==200,(status,res)
        status,pending=call('/api/push/pending')
        auto=[e for e in pending['events'] if e['kind']=='scenario']
        assert status==200 and len(auto)==1 and auto[0]['time']==now_ms+90*60000,(status,auto)
        status,live=call('/api/push/scenarios')
        assert status==200 and len(live['automatic'])==1 and live['scenarios']==[],live
        settings['inverseMemory']={}
        status,res=call('/api/state/sections','PUT',{'version':res['version'],'sections':{'settings':settings}})
        assert status==200,(status,res)
        assert not [e for e in call('/api/push/pending')[1]['events'] if e['kind']=='scenario']
        assert call('/api/push/scenarios','POST',{'kind':'point-a','drug':'pregabalin','doses':[{'time':now_ms+3600000,'mg':75}]})[0]==410
        print('temporary API: sections, conflict, CSRF, automatic adopted/adjusted/cancelled push passed')
    finally:
        process.terminate()
        try:process.wait(timeout=3)
        except subprocess.TimeoutExpired:process.kill()
