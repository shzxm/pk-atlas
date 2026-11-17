"use strict";

// Published Cmax values describe a specific studied formulation/population.
// The Bateman curve and dose proportionality below are teaching assumptions.
/* PK_CATALOG: generated from shared/catalog.json by scripts/build.py */
const $=id=>document.getElementById(id);
const fmt=(n,d=2)=>{const raw=Number(n).toFixed(d);return raw.includes(".")?raw.replace(/0+$/,"").replace(/\.$/,""):raw};
const dateText=ms=>new Date(ms).toLocaleString("zh-CN",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false});
const fullDate=ms=>new Date(ms).toLocaleString("zh-CN",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false});
const localInput=ms=>{const d=new Date(ms),p=n=>String(n).padStart(2,"0");return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`};
const uuid=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
const RECORD_KEY="pk-atlas-records-v1",COURSE_KEY="pk-atlas-courses-v1",PLAN_KEY="pk-atlas-plans-v1",INTAKE_KEY="pk-atlas-intakes-v1",RENAL_KEY="pk-atlas-renal-v1",DRAFT_KEY="pk-atlas-sync-draft-v1",TRANSFER_KEY="pk-atlas-incoming-transfer-v1";
const getStored=key=>{try{return localStorage.getItem(key)}catch{return null}};
const setStored=(key,value)=>{try{localStorage.setItem(key,value)}catch{}};
const isJournalArchive=r=>r?.source==="ios-journal-17.1"&&typeof r.drug==="string"&&r.drug.startsWith("journal:")&&typeof r.journal?.substanceName==="string";
const isJournalReview=r=>isJournalArchive(r)&&["possibleDuplicate","duplicate"].includes(r.journal?.reviewStatus);
const JOURNAL_NAMES={Pregabalin:"普瑞巴林",Lorazepam:"劳拉西泮"};
const recordDrugName=r=>DRUGS.find(d=>d.id===r.drug)?.name||`${JOURNAL_NAMES[r.journal?.substanceName]||r.journal?.substanceName||r.drug}${isJournalReview(r)?r.journal.reviewStatus==="duplicate"?"（已标重复）":"（待核对）":""}`;
const safeRecords=raw=>Array.isArray(raw)?raw.filter(r=>r&&(DRUGS.some(d=>d.id===r.drug)||isJournalArchive(r))&&Number.isFinite(r.time)&&Number.isFinite(r.mg)&&r.mg>0).slice(-10000).map(r=>({...r,id:String(r.id||uuid())})):[];
const safeCourses=raw=>Array.isArray(raw)?raw.filter(c=>c&&typeof c.id==="string"&&DRUGS.some(d=>d.id===c.drug)&&Number.isFinite(c.start)&&Number.isFinite(c.days)&&c.days>=1&&c.days<=90).slice(-3000):[];
const safeIntakes=raw=>Array.isArray(raw)?raw.filter(x=>x&&Number.isFinite(x.time)&&["meal","drink"].includes(x.kind)&&["none","water","coffee","tea","milk","juice","alcohol","other"].includes(x.drink||"none")).slice(-10000).map(x=>({id:String(x.id||uuid()),time:x.time,kind:x.kind,mealType:x.mealType==="highFat"?"highFat":"regular",drink:x.drink||"none",note:String(x.note||"").slice(0,100)})):[];
const safeRenal=raw=>raw&&Number.isFinite(Number(raw.crcl))&&Number(raw.crcl)>=15&&Number(raw.crcl)<=150?{crcl:Number(raw.crcl),source:raw.source==="estimated"?"estimated":"entered"}:null;
const INVERSE_FIELDS=["pointTarget","pointMaxDose","pointCount","pointPeakMin","targetStart","holdHours","inverseCount"];
const safeInverseMemory=raw=>{
  const out={};if(!raw||typeof raw!=="object"||Array.isArray(raw))return out;
  for(const drug of DRUGS){const saved=raw[drug.id];if(!saved||typeof saved!=="object"||Array.isArray(saved))continue;
    out[drug.id]=Object.fromEntries(INVERSE_FIELDS.filter(id=>typeof saved[id]==="string"&&saved[id].length<=32).map(id=>[id,saved[id]]));
    const plan=saved.adoptedPointPlan;
    if(plan&&plan.v===1&&plan.drug===drug.id&&Number.isFinite(plan.target)&&Number.isFinite(plan.threshold)&&["blood","equivalent"].includes(plan.mode)&&Array.isArray(plan.doses)&&plan.doses.length<=12&&plan.doses.every(d=>Number.isFinite(d.time)&&Number.isFinite(d.mg)&&d.mg>0)){
      const clean=structuredClone(plan),manual=plan.manualMatches;
      clean.manualMatches=manual&&typeof manual==="object"&&!Array.isArray(manual)?Object.fromEntries(Object.entries(manual).filter(([index,id])=>Number.isInteger(Number(index))&&Number(index)>=0&&Number(index)<plan.doses.length&&(id===null||typeof id==="string"&&id.length<=100))):{};
      const adjustment=plan.adjustment;
      if(!adjustment||!Array.isArray(adjustment.doses)||adjustment.doses.length>12||!adjustment.doses.every(d=>Number.isFinite(d.time)&&Number.isFinite(d.mg)&&d.mg>0)||!Number.isInteger(adjustment.completedCount)||adjustment.completedCount<0||adjustment.completedCount>plan.doses.length)delete clean.adjustment;
      else clean.adjustment={doses:structuredClone(adjustment.doses),completedCount:adjustment.completedCount,adoptedAt:Number.isFinite(adjustment.adoptedAt)?adjustment.adoptedAt:0};
      if(typeof clean.mealSignature!=="string"||clean.mealSignature.length>4096)delete clean.mealSignature;
      out[drug.id].adoptedPointPlan=clean;
    }
  }
  return out;
};
let records=[],courses=[],plans={},intakes=[],renal=null,referenceMemory={},inverseMemory={};
const mealMatchCache=new Map();
const MEAL_BEFORE_DOSE_MINUTES=90,MEAL_AFTER_DOSE_MINUTES=15;
const mealBeforeDoseMinutes=drugId=>FOOD_INFO[drugId]?.mealWindowMinutes||MEAL_BEFORE_DOSE_MINUTES;
try{records=safeRecords(JSON.parse(getStored(RECORD_KEY)||"null"))}catch{}
try{courses=safeCourses(JSON.parse(getStored(COURSE_KEY)||"null"))}catch{}
try{const saved=JSON.parse(getStored(PLAN_KEY)||"null");if(saved&&typeof saved==="object"&&!Array.isArray(saved))plans=saved}catch{}
try{intakes=safeIntakes(JSON.parse(getStored(INTAKE_KEY)||"null"))}catch{}
try{renal=safeRenal(JSON.parse(getStored(RENAL_KEY)||"null"))}catch{}
try{const saved=JSON.parse(getStored("pk-atlas-reference-by-drug-v1")||"{}");if(saved&&typeof saved==="object"&&!Array.isArray(saved))referenceMemory=saved}catch{}
try{inverseMemory=safeInverseMemory(JSON.parse(getStored("pk-atlas-inverse-by-drug-v1")||"{}"))}catch{}
let authUser=null,stateVersion=0,baseState=null,syncPending=false,syncRunning=false,syncConflict=false;
const EDITOR_IDS=new Set([
  "doseTime","doseAmount","doseUnit","intakeKind","intakeTime","mealType","intakeDrink","intakeNote",
  "planStrength","planUnit","planStrengthLabel","planDose","planInterval","planLastTime",
  "threshold","thresholdEquivalent","pointTarget","pointMaxDose","pointCount","pointPeakMin",
  "targetStart","holdHours","inverseCount","scenarioTime","scenarioDose","scenarioUnit",
  "renalCrCl","renalAge","renalWeight","renalSex","renalCreatinine","renalCreatinineUnit"
]);
function safeEditorDrafts(raw){
  if(!raw||typeof raw!=="object"||Array.isArray(raw))return {};
  const out={};
  for(const [drug,fields] of Object.entries(raw)){
    if(!DRUGS.some(d=>d.id===drug)||!fields||typeof fields!=="object"||Array.isArray(fields))continue;
    const kept=Object.fromEntries(Object.entries(fields).filter(([id,val])=>
      EDITOR_IDS.has(id)&&typeof val==="string"&&val.length<=160));
    if(Object.keys(kept).length)out[drug]=kept;
  }
  return out;
}
let editorDrafts={};

const snapshot=()=>({records:structuredClone(records),courses:structuredClone(courses),plans:structuredClone(plans),intakes:structuredClone(intakes),settings:{currentDrug:current,renal:structuredClone(renal),referenceMemory:structuredClone(referenceMemory),inverseMemory:structuredClone(inverseMemory),editorDrafts:structuredClone(editorDrafts)}});
function migrateLegacy(){
  const ungrouped=records.filter(r=>!courses.some(c=>c.id===r.courseId));
  if(!ungrouped.length)return;
  const prior=getStored(RECORD_KEY);
  if(prior&&!getStored("pk-atlas-records-backup-before-courses-v1"))setStored("pk-atlas-records-backup-before-courses-v1",prior);
  for(const drug of DRUGS){
    const rows=ungrouped.filter(r=>r.drug===drug.id).sort((a,b)=>a.time-b.time);
    let cluster=[];
    const save=()=>{
      if(!cluster.length)return;
      const start=cluster[0].time,end=cluster.at(-1).time;
      const course={id:uuid(),drug:drug.id,title:"历史服用组",start,days:Math.min(90,Math.max(1,Math.floor((end-start)/86400000)+1)),legacy:true};
      courses.push(course);cluster.forEach(r=>r.courseId=course.id);cluster=[];
    };
    for(const row of rows){if(cluster.length&&row.time-cluster.at(-1).time>4*86400000)save();cluster.push(row)}
    save();
  }
  persist();
}
function repairLegacyCourseDays(){
  let changed=false;
  for(const c of courses.filter(x=>x.legacy)){
    const rows=records.filter(r=>r.courseId===c.id).sort((a,b)=>a.time-b.time);
    if(!rows.length)continue;
    const days=Math.min(90,Math.max(1,Math.floor((rows.at(-1).time-rows[0].time)/86400000)+1));
    if(c.days!==days){c.days=days;changed=true}
  }
  if(changed)persist();
}
let current="amoxicillin";
const savedDrug=getStored("pk-atlas-current-drug-v1");if(DRUGS.some(d=>d.id===savedDrug))current=savedDrug;
let activeCourseId=getStored("pk-atlas-active-course-v1")||"";
const dateKey=ms=>{const d=new Date(ms),p=n=>String(n).padStart(2,"0");return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`};
let selectedDate=dateKey(Date.now()),selectedDateFollowsToday=true,lastTodayKey=selectedDate;
const dayStart=key=>new Date(`${key}T00:00:00`).getTime();
const dayEnd=key=>{const d=new Date(`${key}T00:00:00`);d.setDate(d.getDate()+1);return d.getTime()};
function courseOnDate(c,key){
  const first=dateKey(c.start),d=new Date(`${first}T00:00:00`);d.setDate(d.getDate()+c.days);
  return first<=key&&key<dateKey(d.getTime())||records.some(r=>r.courseId===c.id&&dateKey(r.time)===key);
}
const api = (path,method="GET",body) => PKApi.request(path,method,body);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function mergeList(base,local,remote){
  const b=new Map(base.map(x=>[x.id,x])),l=new Map(local.map(x=>[x.id,x])),r=new Map(remote.map(x=>[x.id,x]));
  for(const id of new Set([...b.keys(),...l.keys()])){
    if(same(b.get(id),l.get(id)))continue;
    if(!same(b.get(id),r.get(id))&&!same(l.get(id),r.get(id)))return null;
    if(l.has(id))r.set(id,l.get(id));else r.delete(id);
  }
  return [...r.values()];
}
function mergeObjects(base,local,remote){
  const out={...remote};
  for(const key of new Set([...Object.keys(base),...Object.keys(local)])){
    if(same(base[key],local[key]))continue;
    if(!same(base[key],remote[key])&&!same(local[key],remote[key]))return null;
    if(Object.hasOwn(local,key))out[key]=local[key];else delete out[key];
  }
  return out;
}
function mergeState(base,local,remote){
  const mergedRecords=mergeList(base.records||[],local.records||[],remote.records||[]);
  const mergedCourses=mergeList(base.courses||[],local.courses||[],remote.courses||[]);
  const mergedIntakes=mergeList(base.intakes||[],local.intakes||[],remote.intakes||[]);
  const mergedPlans=mergeObjects(base.plans||{},local.plans||{},remote.plans||{});
  const mergedRenal=mergeObjects({renal:base.settings?.renal??null},{renal:local.settings?.renal??null},{renal:remote.settings?.renal??null});
  const mergedReferences=mergeObjects(base.settings?.referenceMemory||{},local.settings?.referenceMemory||{},remote.settings?.referenceMemory||{});
  const mergedInverse=mergeObjects(base.settings?.inverseMemory||{},local.settings?.inverseMemory||{},remote.settings?.inverseMemory||{});
  const mergedEditors=mergeEditorDrafts(base.settings?.editorDrafts||{},local.settings?.editorDrafts||{},remote.settings?.editorDrafts||{});
  if(!mergedRecords||!mergedCourses||!mergedIntakes||!mergedPlans||!mergedRenal||!mergedReferences||!mergedInverse||!mergedEditors)return null;
  return{records:mergedRecords,courses:mergedCourses,plans:mergedPlans,intakes:mergedIntakes,settings:{...remote.settings,...local.settings,renal:mergedRenal.renal,referenceMemory:mergedReferences,inverseMemory:mergedInverse,editorDrafts:mergedEditors}};
}
function mergeLocalForUpload(remote,local){
  const byId=(cloud,device)=>[...new Map([...(cloud||[]),...(device||[])].map(row=>[row.id,row])).values()];
  const cloudSettings=remote.settings||{},localSettings=local.settings||{};
  return{
    records:byId(remote.records,local.records),
    courses:byId(remote.courses,local.courses),
    intakes:byId(remote.intakes,local.intakes),
    plans:{...(remote.plans||{}),...(local.plans||{})},
    settings:{...cloudSettings,...localSettings,
      referenceMemory:{...(cloudSettings.referenceMemory||{}),...(localSettings.referenceMemory||{})},
      inverseMemory:{...(cloudSettings.inverseMemory||{}),...(localSettings.inverseMemory||{})}}
  };
}
function incomingLocalTransfer(){try{return JSON.parse(sessionStorage.getItem(TRANSFER_KEY)||"null")}catch{return null}}
function startLocalTransfer(){
  const targetOrigin="https://pk.example.com";
  const draft=(()=>{try{return JSON.parse(getStored(DRAFT_KEY)||"null")}catch{return null}})();
  const guest=snapshot(),hasGuest=guest.records.length||guest.intakes.length||Object.keys(guest.plans).length||guest.settings.renal;
  const source=draft?.state?hasGuest?mergeLocalForUpload(draft.state,guest):draft.state:guest;
  const popup=window.open(`${targetOrigin}/?local-transfer=1`,"_blank");
  if(!popup){setSyncStatus("新页面被浏览器拦截，请允许打开新页面后重试；本机数据仍在。",true);return}
  setSyncStatus("已打开正式网站，正在传送本机数据…");
  const onMessage=event=>{
    if(event.source!==popup||event.origin!==targetOrigin)return;
    if(event.data?.type==="pk-atlas-transfer-ready")popup.postMessage({type:"pk-atlas-transfer-data",state:source,sourceUsername:draft?.username||authUser||""},targetOrigin);
    if(event.data?.type==="pk-atlas-transfer-received")setSyncStatus("正式网站已接收本机数据；请在新页面登录并确认保存。",false);
    if(event.data?.type==="pk-atlas-transfer-saved"){setSyncStatus("本机数据已保存到云端，请在正式网站继续使用。");window.removeEventListener("message",onMessage)}
  };
  window.addEventListener("message",onMessage);
  setTimeout(()=>window.removeEventListener("message",onMessage),5*60000);
}
function initLocalTransferReceiver(){
  if(!new URLSearchParams(location.search).has("local-transfer")||!window.opener)return;
  const allowed=new Set(["http://127.0.0.1","http://181.example.com"]);
  window.addEventListener("message",event=>{
    if(event.source!==window.opener||!allowed.has(event.origin)||event.data?.type!=="pk-atlas-transfer-data")return;
    const state=event.data.state;
    if(!state||typeof state!=="object"||!Array.isArray(state.records)||state.records.length>10000||!Array.isArray(state.intakes||[])||JSON.stringify(state).length>2000000){setSyncStatus("本机数据格式或大小不符合云端要求。",true);return}
    try{sessionStorage.setItem(TRANSFER_KEY,JSON.stringify({state,origin:event.origin,sourceUsername:String(event.data.sourceUsername||"").slice(0,32)}))}
    catch{setSyncStatus("浏览器无法暂存本机数据，请检查存储空间后重试。",true);return}
    window.opener.postMessage({type:"pk-atlas-transfer-received"},event.origin);
    if(authUser)setTimeout(()=>$("saveLocalCloud").click(),0);
    else setSyncStatus("已接收本机数据，登录后可保存到云端。");
  });
  window.opener.postMessage({type:"pk-atlas-transfer-ready"},"*");
}
function setSyncStatus(message,error=false){const el=$("syncStatus");if(el){el.textContent=message;el.classList.toggle("error",error)}}
function setMobilePane(pane,scroll=false){
  document.body.dataset.mobilePane=pane;
  $("mobileRecords").setAttribute("aria-pressed",String(pane==="records"));
  $("mobileResults").setAttribute("aria-pressed",String(pane==="results"));
  if(pane==="results"&&document.body.classList.contains("stage-calc")){chartView=null;probeManual=false;requestAnimationFrame(()=>{drawChart();renderScenario();if(inversePage==="point")renderPointInverse();else renderInverse()})}
  if(scroll&&matchMedia("(max-width:700px)").matches)$("mobilePanels").scrollIntoView({behavior:"smooth",block:"start"});
}
let inversePage="point";
function setInversePage(page){
  const changed=inversePage!==page;
  inversePage=page==="duration"?"duration":"point";
  $("pointInversePage").hidden=inversePage!=="point";
  $("durationInversePage").hidden=inversePage!=="duration";
  $("inverseTabPoint").setAttribute("aria-selected",String(inversePage==="point"));
  $("inverseTabDuration").setAttribute("aria-selected",String(inversePage==="duration"));
  $("inverseTabPoint").tabIndex=inversePage==="point"?0:-1;
  $("inverseTabDuration").tabIndex=inversePage==="duration"?0:-1;
  if(changed&&document.body.classList.contains("stage-calc")){if(inversePage==="point"){cancelDurationInverse();renderPointInverse()}else{cancelPointInverse();renderInverse()}}
}
function showStage(stage){
  document.body.classList.remove("stage-loading","stage-auth","stage-choose","stage-calc");
  document.body.classList.add(`stage-${stage}`);
  if(stage==="choose")$("chooseDate").value=selectedDate;
  if(stage==="choose")renderChooser();
  if(stage==="calc"){chartView=null;probeManual=false;setInversePage("point");setMobilePane("records");render()}
  appOnStage(stage);
  window.scrollTo({top:0,behavior:"instant"});
}
