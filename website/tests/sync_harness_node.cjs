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
  const remote={version:0,state:base(),writes:[],hook:null};
  const local=new Storage(),sess=new Storage();
  let now=Date.now();
  const timers=new Map();let tid=0;
  const context={
    console,JSON,Date,Math,Object,Array,Map,Set,String,Number,Error,Promise,
    Event:class Event{constructor(type){this.type=type}},
    structuredClone:deep,crypto:{randomUUID:()=>"test-tab-01234567"},
    sessionStorage:sess,localStorage:local,
    navigator:{onLine:true},
    setTimeout:(fn,ms)=>{const id=++tid;timers.set(id,{fn,ms});return id},
    clearTimeout:id=>timers.delete(id),
    window:{addEventListener(){},dispatchEvent(){},},
    document:{hidden:false,activeElement:{matches:()=>false},addEventListener(){},createElement(){return {}},body:{append(){}}},
    Blob:class {},URL:{createObjectURL:()=>"",revokeObjectURL(){}},
    PKApi:{async request(route,method="GET",body){
      if(remote.hook){const hook=remote.hook;remote.hook=null;await hook(route,method,body)}
      if(route==="/api/state")return deep({version:remote.version,state:remote.state});
      if(route==="/api/state/sections"&&method==="PUT"){
        if(body.version!==remote.version){
          const e=new Error("conflict");e.status=409;e.data=deep({version:remote.version,state:remote.state});throw e;
        }
        remote.state={...remote.state,...deep(body.sections)};
        remote.version++;
        remote.writes.push(deep(body));
        return {version:remote.version};
      }
      throw Error("Unexpected "+route);
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
await test("immediate local draft + section write + cloud readback",async()=>{
  const c=make();
  c.eval('records.push({id:"a",mg:50});persist()');
  assert.equal(c.remote.version,0);
  assert.equal(c.local.length>0,true);
  await c.eval('flushSync()');
  assert.equal(c.remote.version,1);
  assert.equal(c.remote.state.records[0].mg,50);
  assert.deepEqual(Object.keys(c.remote.writes[0].sections),["records"]);
  assert.equal(c.eval('syncPending'),false);
  assert.equal(c.local.length,0);
});
await test("second edit during inflight request survives acknowledgement",async()=>{
  const c=make();c.eval('records.push({id:"a",mg:50});persist()');
  let resume;const barrier=new Promise(ok=>resume=ok);
  c.remote.hook=async(route)=>{if(route==="/api/state/sections")await barrier};
  const first=c.eval('flushSync()');
  await new Promise(ok=>setImmediate(ok));
  c.eval('records[0].mg=80;persist()');
  resume();await first;
  assert.equal(c.remote.state.records[0].mg,50);
  assert.equal(c.eval('syncPending'),true);
  await c.eval('flushSync()');
  assert.equal(c.remote.state.records[0].mg,80);
  assert.equal(c.eval('syncPending'),false);
});
await test("409 merges unrelated new record without dropping either",async()=>{
  const c=make();c.eval('records.push({id:"local",mg:50});persist()');
  c.remote.state.records.push({id:"cloud",mg:75});c.remote.version=1;
  await c.eval('flushSync()');
  assert.equal(c.eval('syncConflict'),false);
  assert.equal(c.eval('syncPending'),true);
  await c.eval('flushSync()');
  assert.deepEqual(c.remote.state.records.map(r=>r.id).sort(),["cloud","local"]);
});
await test("409 same row conflict preserves both and blocks overwrite",async()=>{
  const c=make();c.remote.state.records.push({id:"same",mg:40});
  c.eval('records.push({id:"same",mg:40});baseState=structuredClone(snapshot());stateVersion=1');
  c.remote.version=1;
  c.eval('records[0].mg=60;persist()');
  c.remote.state.records[0].mg=90;c.remote.version=2;
  await c.eval('flushSync()');
  assert.equal(c.eval('syncConflict'),true);
  assert.equal(c.remote.state.records[0].mg,90);
  assert.equal(c.eval('records[0].mg'),60);
  assert.ok(c.local.length>0);
});
await test("offline remains local and does not write remotely",async()=>{
  const c=make();c.ctx.navigator.onLine=false;
  c.eval('records.push({id:"offline",mg:50});persist()');
  await c.eval('flushSync()');
  assert.equal(c.remote.version,0);
  assert.equal(c.eval('syncPending'),true);
  assert.ok(c.local.length>0);
  c.ctx.navigator.onLine=true;
  await c.eval('flushSync()');
  assert.equal(c.remote.state.records.length,1);
});
await test("reloaded legacy draft merged with cloud and synced",async()=>{
  const c=make();const draft=base();draft.records.push({id:"saved",mg:75});
  c.local.setItem("legacy-draft",JSON.stringify({username:"sync_test",base:base(),state:draft,version:0}));
  c.remote.state.records.push({id:"cloud",mg:60});c.remote.version=1;
  c.eval('baseState=structuredClone('+JSON.stringify(c.remote.state)+');stateVersion=1;');
  await c.eval('syncRecoverPending()');
  assert.equal(c.eval('syncPending'),true);
  await c.eval('flushSync()');
  assert.deepEqual(c.remote.state.records.map(r=>r.id).sort(),["cloud","saved"]);
  assert.equal(c.local.getItem("legacy-draft"),null);
});
await test("editor drafts sync without creating actual doses",async()=>{
  const c=make();
  c.eval('editorDrafts.amoxicillin={doseAmount:"75",doseTime:"2026-11-15T09:00"};persist()');
  await c.eval('flushSync()');
  assert.equal(c.remote.state.records.length,0);
  assert.equal(c.remote.state.settings.editorDrafts.amoxicillin.doseAmount,"75");
});
await test("different editor fields merge across devices",async()=>{
  const c=make();
  c.eval('editorDrafts.amoxicillin={doseAmount:"75"};persist()');
  c.remote.state.settings.editorDrafts={amoxicillin:{doseTime:"2026-11-15T09:00"}};c.remote.version=1;
  await c.eval('flushSync()');
  assert.equal(c.eval('syncConflict'),false);
  await c.eval('flushSync()');
  const a=c.remote.state.settings.editorDrafts.amoxicillin;
  assert.equal(a.doseAmount,"75");assert.equal(a.doseTime,"2026-11-15T09:00");
});
if(process.exitCode)process.exit(process.exitCode);
})();
