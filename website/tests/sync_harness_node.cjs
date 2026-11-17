"use strict";
/* Browser-free deterministic regression tests for source sync state machine.
 * Run with node tests/sync_harness_node.cjs on a development host with Node LTS.
 * No connection to production credentials, data or accounts. */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const ROOT=path.resolve(__dirname,"..");
const core=fs.readFileSync(path.join(ROOT,"frontend/01_core.js"),"utf8");
const mergeSource=core.slice(core.indexOf("const same="),core.indexOf("function incomingLocalTransfer(){"));
assert(mergeSource.includes("function mergeState("));
const syncSource=fs.readFileSync(path.join(ROOT,"frontend/01_sync.js"),"utf8");
const deep=v=>JSON.parse(JSON.stringify(v));
const base=()=>({records:[],courses:[],intakes:[],plans:{},settings:{currentDrug:"amoxicillin",renal:null,referenceMemory:{},inverseMemory:{},editorDrafts:{}}});
class Storage{
  constructor(){this.data=new Map()}
  getItem(k){return this.data.get(String(k))??null}
  setItem(k,v){this.data.set(String(k),String(v))}
  removeItem(k){this.data.delete(String(k))}
  key(i){return Array.from(this.data.keys())[i]??null}
  get length(){return this.data.size}
}
function make(){
  const remote={version:0,state:base(),writes:[],hook:null,receipts:new Map(),failAfterCommit:false};
  const local=new Storage(),sess=new Storage();
  let now=Date.now(), uuidNumber=0;
  const timers=new Map();let tid=0;
  const context={
    console,JSON,Date,Math,Object,Array,Map,Set,String,Number,Error,Promise,
    Event:class Event{constructor(type){this.type=type}},
    structuredClone:deep,crypto:{randomUUID:()=>("test-upload-id-"+(++uuidNumber)+"-123456")},
    sessionStorage:sess,localStorage:local,
    navigator:{onLine:true},
    setTimeout:(fn,ms)=>{const id=++tid;timers.set(id,{fn,ms});return id},
    clearTimeout:id=>timers.delete(id),
    window:{addEventListener(){},dispatchEvent(){},},
    document:{hidden:false,activeElement:{matches:()=>false},addEventListener(){},createElement(){return {}},body:{append(){}}},
    Blob:class {},URL:{createObjectURL:()=>"",revokeObjectURL(){}},
    PKApi:{async request(route,method="GET",body){
      if(remote.hook){const hook=remote.hook;remote.hook=null;await hook(route,method,body)}
      if(route==="/api/state"&&method==="GET")
        return deep({version:remote.version,state:remote.state,syncPolicy:"last-upload-wins-v1"});
      if(route==="/api/state"&&method==="PUT"){
        if(body.syncPolicy!=="last-upload-wins-v1"||!body.operationId)throw Error("Missing LWW protocol");
        if(remote.receipts.has(body.operationId))
          return {version:remote.version,replayed:true,syncPolicy:"last-upload-wins-v1"};
        remote.state=deep(body.state);remote.version++;
        remote.receipts.set(body.operationId,remote.version);
        remote.writes.push(deep(body));
        if(remote.failAfterCommit){remote.failAfterCommit=false;throw Error("lost HTTP response")}
        return {version:remote.version,syncPolicy:"last-upload-wins-v1"};
      }
      throw Error("Unexpected "+method+" "+route);
    }},
    DRUGS:[{id:"amoxicillin"},{id:"pregabalin"}],
    safeRecords:a=>a??[],safeCourses:a=>a??[],safeIntakes:a=>a??[],
    safeRenal:a=>a??null,safeInverseMemory:a=>a||{},safeEditorDrafts:a=>a||{},
    MODEL_PARAMS:{clear(){}},mealMatchCache:{clear(){}},
    renderDrug(){},setSyncStatus(){},$(){return {hidden:false,dataset:{},textContent:""}},
    alert(){},getStored:key=>local.getItem(key),setStored:(key,v)=>local.setItem(key,v),
  };
  const globalDeclarations=`
    var authUser="sync_test",stateVersion=0,baseState=${JSON.stringify(base())},
      syncPending=false,syncRunning=false,syncConflict=false;
    var records=[],courses=[],intakes=[],plans={},renal=null,referenceMemory={},inverseMemory={},editorDrafts={};
    var current="amoxicillin";
    var RECORD_KEY="records",COURSE_KEY="courses",PLAN_KEY="plans",INTAKE_KEY="intakes",RENAL_KEY="renal",DRAFT_KEY="legacy-draft";
    function snapshot(){return {records:structuredClone(records),courses:structuredClone(courses),
      intakes:structuredClone(intakes),plans:structuredClone(plans),
      settings:{currentDrug:current,renal:structuredClone(renal),referenceMemory:structuredClone(referenceMemory),
      inverseMemory:structuredClone(inverseMemory),editorDrafts:structuredClone(editorDrafts)}}}
  `;
  vm.createContext(context);
  vm.runInContext(globalDeclarations,context);
  vm.runInContext(mergeSource,context);
  vm.runInContext(syncSource,context);
  return {ctx:context,remote,local,timers,eval:expr=>vm.runInContext(expr,context)};
}
async function test(name,func){
  try{await func();console.log("PASS",name)}catch(error){console.error("FAIL",name,error.stack);process.exitCode=1}
}
(async()=>{
await test("full snapshot upload and durable readback",async()=>{
  const c=make();
  c.eval('records.push({id:"one",mg:50});persist()');
  await c.eval('flushSync()');
  assert.equal(c.remote.version,1);
  assert.equal(c.remote.state.records[0].mg,50);
  assert.equal(c.remote.writes[0].syncPolicy,"last-upload-wins-v1");
  assert.equal(c.remote.writes[0].state.records.length,1);
  assert.equal(c.eval('syncPending'),false);
  assert.equal(c.local.length,0);
});
await test("stale device uploading last replaces entire remote snapshot",async()=>{
  const c=make();
  c.eval('records.push({id:"local",mg:60});persist()');
  c.remote.state.records.push({id:"cloud",mg:75});c.remote.version=1;
  await c.eval('flushSync()');
  assert.deepEqual(c.remote.state.records.map(r=>r.id),["local"]);
  assert.equal(c.eval('syncConflict'),false);
  assert.equal(c.eval('syncPending'),false);
});
await test("later other-device upload after PUT wins over stale readback",async()=>{
  const c=make();c.eval('records.push({id:"mine",mg:50});persist()');
  c.remote.hook=async(route,method)=>{
    if(route==="/api/state"&&method==="PUT"){
      c.remote.hook=async(nextRoute,nextMethod)=>{
        if(nextRoute==="/api/state"&&nextMethod==="GET"){
          c.remote.state=base();c.remote.state.records.push({id:"later",mg:80});c.remote.version++;
        }
      };
    }
  };
  await c.eval('flushSync()');
  assert.deepEqual(c.eval('records.map(x=>x.id)'),["later"]);
  assert.equal(c.eval('syncPending'),false);
});
await test("lost response retry does not replay older upload on newer device",async()=>{
  const c=make();c.eval('records.push({id:"first",mg:50});persist()');
  c.remote.failAfterCommit=true;
  await c.eval('flushSync()');
  assert.equal(c.eval('syncPending'),true);
  const firstId=c.remote.writes[0].operationId;
  c.remote.state=base();c.remote.state.records.push({id:"other",mg:90});c.remote.version++;
  await c.eval('flushSync()');
  assert.equal(c.remote.writes.length,1);
  assert.equal(c.remote.writes[0].operationId,firstId);
  assert.deepEqual(c.eval('records.map(x=>x.id)'),["other"]);
});
await test("new local edit while pending upload creates a new operation",async()=>{
  const c=make();c.eval('records.push({id:"dose",mg:50});persist()');
  let resume;const barrier=new Promise(resolve=>resume=resolve);
  c.remote.hook=async(route,method)=>{if(route==="/api/state"&&method==="PUT")await barrier};
  const first=c.eval('flushSync()');
  await new Promise(ok=>setImmediate(ok));
  c.eval('records[0].mg=80;persist()');
  resume();await first;
  assert.equal(c.remote.state.records[0].mg,50);
  assert.equal(c.eval('syncPending'),true);
  await c.eval('flushSync()');
  assert.equal(c.remote.state.records[0].mg,80);
  assert.notEqual(c.remote.writes[0].operationId,c.remote.writes[1].operationId);
});
await test("offline draft only uploads after connectivity returns",async()=>{
  const c=make();c.ctx.navigator.onLine=false;
  c.eval('records.push({id:"offline",mg:50});persist()');
  await c.eval('flushSync()');
  assert.equal(c.remote.version,0);
  c.ctx.navigator.onLine=true;
  await c.eval('flushSync()');
  assert.deepEqual(c.remote.state.records.map(x=>x.id),["offline"]);
});
await test("old unuploaded draft becomes newest whole snapshot, never row union",async()=>{
  const c=make();const draft=base();draft.records.push({id:"saved",mg:75});
  c.local.setItem("legacy-draft",JSON.stringify({username:"sync_test",base:base(),state:draft,version:0}));
  c.remote.state.records.push({id:"cloud",mg:60});c.remote.version=1;
  c.eval('baseState=structuredClone('+JSON.stringify(c.remote.state)+');stateVersion=1;');
  await c.eval('syncRecoverPending()');
  await c.eval('flushSync()');
  assert.deepEqual(c.remote.state.records.map(x=>x.id),["saved"]);
  assert.equal(c.local.getItem("legacy-draft"),null);
});
await test("remote pull updates clean client without re-uploading",async()=>{
  const c=make();c.remote.state.records.push({id:"remote",mg:45});c.remote.version=1;
  await c.eval('syncPullRemote()');
  assert.equal(c.eval('records[0].id'),"remote");
  assert.equal(c.remote.writes.length,0);
});
await test("draft editor is not a confirmed drug dose",async()=>{
  const c=make();c.eval('editorDrafts.amoxicillin={doseAmount:"75"};persist()');
  await c.eval('flushSync()');
  assert.equal(c.remote.state.records.length,0);
  assert.equal(c.remote.state.settings.editorDrafts.amoxicillin.doseAmount,"75");
});
if(process.exitCode)process.exit(process.exitCode);
})();
