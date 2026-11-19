"use strict";
const PK_MODEL_ENGINE_VERSION = "f277750fa247aaac77c6f5e7c851682a5ef10a357c23818e356adae6c48bc2fb";

// Published Cmax values describe a specific studied formulation/population.
// The Bateman curve and dose proportionality below are teaching assumptions.
const DRUGS = [{"id":"amoxicillin","name":"阿莫西林","en":"Amoxicillin","kind":"抗菌药 · 口服胶囊","refDose":250,"cmax":4.25,"cmaxRange":"3.5–5.0 mg/L","tmax":1.5,"tmaxRange":"1–2 小时","halfLife":1.02,"defaultDose":300,"form":"250 mg 口服胶囊","note":"Cmax 取说明书 250 mg 剂量范围中点；说明书称口服后血清中最长可检出约 8 小时，但这不是有效治疗时长。肾功能变化可显著改变消除。抗生素疗程和间隔必须遵医嘱。","source":"DailyMed 药品说明书","url":"https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=9bb2856b-feef-4063-befc-2dd917502898"},{"id":"acetaminophen","name":"对乙酰氨基酚","en":"Acetaminophen","kind":"解热镇痛药 · 普通口服制剂","refDose":1000,"cmax":16.5,"cmaxRange":"16.5 mg/L（研究均值）","tmax":0.7,"tmaxRange":"0.7 小时（研究均值）","halfLife":3.8,"defaultDose":500,"form":"1000 mg 单次口服研究","note":"数据来自 FDA 对 22 名口服受试者的单次给药研究；肝病、其他含本成分药品和剂型差异会影响安全性。","source":"FDA 临床药理审评","url":"https://www.accessdata.fda.gov/drugsatfda_docs/nda/2010/022450Orig1s000ClinPharmR.pdf"},{"id":"ibuprofen","name":"布洛芬","en":"Ibuprofen","kind":"解热镇痛药 · 口服混悬液","refDose":200,"cmax":19,"cmaxRange":"19 mg/L（研究均值）","tmax":0.79,"tmaxRange":"0.79 小时（研究均值）","halfLife":2,"defaultDose":200,"form":"200 mg 成人口服混悬液","note":"浓度校准来自混悬液研究，不应直接当作片剂的实测曲线；食物可延迟吸收。","source":"DailyMed 混悬液说明书","url":"https://dailymed.nlm.nih.gov/dailymed/getFile.cfm?name=IBUPROFEN&setid=84c2b3e4-366c-433e-8a5e-14d606c5201e"},{"id":"cetirizine","name":"西替利嗪","en":"Cetirizine","kind":"抗过敏药 · 口服片剂","refDose":10,"cmax":0.311,"cmaxRange":"0.311 mg/L（多次给药均值）","tmax":1,"tmaxRange":"约 1 小时","halfLife":8.3,"defaultDose":10,"form":"10 mg 每日口服 10 天研究","note":"Cmax 源自多次给药研究，单次服药曲线的绝对浓度尤其不确定；食物及肾功能会影响参数。","source":"DailyMed 药品说明书","url":"https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=41d7af88-87b4-370e-e063-6294a90a8af6"},{"id":"pregabalin","name":"普瑞巴林","en":"Pregabalin","kind":"神经系统处方药 · 普通口服胶囊","refDose":150,"cmax":2.15,"cmaxRange":"2.15 mg/L（仅一项 150 mg 单次研究均值）","tmax":1.3,"tmaxRange":"空腹约 0.7–1.5 小时；模型取 1.3 小时","halfLife":6.3,"defaultDose":100,"form":"150 mg 普通胶囊；空腹模型、正常肾功能参考","note":"模型达峰取五项健康志愿者研究报告范围的上端 1.3 小时；说明书称空腹在 1.5 小时内达峰，正常肾功能平均消除半衰期 6.3 小时。绝对峰值 2.15 mg/L 仍借用另一项 22 人单剂量研究，参数并非同一人群联合拟合；个体浓度可能相差很大。既往服用时间与剂量保留，曲线按当前参数重新计算。个人 CrCl 情景是简化外推，不适用于缓释片、透析或急性肾损伤。","source":"DailyMed 普瑞巴林说明书","url":"https://www.dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=cae9b2b3-656a-4813-af77-b7644879d2ab&type=display","cmaxUrl":"https://pmc.ncbi.nlm.nih.gov/articles/PMC3513865/","tmaxUrl":"https://pubmed.ncbi.nlm.nih.gov/20147618/"},{"id":"prep_ftc_taf","name":"PrEP（FTC/TAF）","en":"Emtricitabine / Tenofovir Alafenamide","kind":"HIV 暴露前预防 · 每日口服复方片","refDose":225,"cmax":null,"cmaxRange":"复方无单一血药浓度","tmax":null,"tmaxRange":"FTC 约 3 小时；TAF 约 1 小时","halfLife":null,"defaultDose":225,"form":"每片 FTC 200 mg + TAF 25 mg（复方标示总量 225 mg）","note":"本站以 225 mg 记录一片 FTC 200 mg/TAF 25 mg；225 mg 仅为两成分标示含量之和，不是可相加的血药浓度或有效成分等效量。FTC 血浆终末半衰期约 10 小时，TAF 原药约 0.51 小时；TAF 的活性代谢物在细胞内的半衰期约 150–180 小时。由于作用部位是细胞内，现有单药血浆模型不能用于推算 PrEP 保护水平或反算服用节点。必须先确认 HIV 阴性及肾功能；FTC/TAF PrEP 不适用于经阴道接受性行为这一未研究适应场景。","source":"DailyMed DESCOVY 说明书","url":"https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=06f66e98-e6ee-4538-9506-6c1282cc14c1","recordOnly":true}];
const FOOD_INFO = {"amoxicillin":{"summary":"500 mg 阿莫西林口服交叉研究发现空腹与非空腹的吸收差异很小；当前 250 mg 胶囊标尺缺少足以重建完整餐后曲线的数据，因此暂不改写本药曲线。","drink":"一般饮料没有可量化的本模型参数。","url":"https://pubmed.ncbi.nlm.nih.gov/363052/","source":"阿莫西林饮食交叉研究（1978）","drinkUrl":"https://www.nhs.uk/medicines/amoxicillin/common-questions-about-amoxicillin/"},"acetaminophen":{"summary":"普通速释片群体药代研究模拟：餐后达峰约 0.88 小时、空腹约 0.61 小时；餐后峰值约为空腹的 85.2%，总暴露量近似不变。本站保留原有空腹浓度标尺，只用该研究的相对变化拟合餐后吸收形状，不能视为个人实测。","drink":"咖啡因影响的研究规模较小，未按饮料种类改写个体浓度或半衰期。","url":"https://pmc.ncbi.nlm.nih.gov/articles/PMC9232434/","source":"健康成人群体药代研究（2022）","drinkUrl":"https://pubmed.ncbi.nlm.nih.gov/7579030/","fed":{"parts":[{"tmax":0.7,"weight":0.709},{"tmax":2.45,"weight":0.291}],"aucRatio":1,"observedTmax":"普通速释片模拟 0.61→0.88 小时","observedPeak":"模拟 Cmax 10.9/12.8，约为空腹的 85.2%"}},"ibuprofen":{"summary":"当前模型限定为口服混悬液：成人 200 mg 空腹达峰约 0.79 小时、峰值约 19 mg/L；说明书给出随餐达峰晚约 0.5—1 小时、峰值低约 30%—50%、总吸收量近似不变。本站取范围中点拟合餐后情景；不适用于直接代表片剂。","drink":"酒精可能增加不良反应风险；没有可靠的饮料浓度修正参数。","url":"https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=9e9fb921-6b6a-422e-95b6-41d6b9047b80&type=display","source":"DailyMed 布洛芬混悬液说明书","drinkUrl":"https://www.nhs.uk/medicines/ibuprofen-for-adults/","fed":{"parts":[{"tmax":0.79,"weight":0.323},{"tmax":2.589,"weight":0.677}],"aucRatio":1,"observedTmax":"混悬液达峰约延后 0.5—1 小时","observedPeak":"混悬液 Cmax 约低 30%—50%"}},"cetirizine":{"summary":"随餐总暴露量近似不变，达峰约晚 1.7 小时，峰值约低 23%。","drink":"酒精与嗜睡风险有关；不按饮料种类改写浓度。","url":"https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=41d7af88-87b4-370e-e063-6294a90a8af6","source":"DailyMed 西替利嗪说明书","drinkUrl":"https://www.nhs.uk/medicines/cetirizine/common-questions-about-cetirizine/","fed":{"parts":[{"tmax":1,"weight":0.57},{"tmax":5.1,"weight":0.43}],"observedTmax":"约延后 1.7 小时","observedPeak":"约低 23%"}},"pregabalin":{"summary":"普通胶囊的两项交叉研究分别观察到：100 mg 普通早餐后达峰 3.17 小时、Cmax 为空腹的 68.6%、AUC 为 94.9%；150 mg 高脂早餐后达峰 2.29 小时、Cmax 为 74.8%、AUC 为 93.3%。本站分别拟合相对变化；剂量、人群与参考峰值来源不同，曲线不是个体实测。 餐后状态匹配另参考 Hong 等 2016 的 30 分钟与 4 小时给药数据；速释胶囊模型不套用控释片研究。","drink":"应避免与酒精同用，嗜睡和呼吸风险可能增加；不改写浓度。","url":"https://anaesthetics.ukzn.ac.za/Libraries/PAIN_1/Clinical_Pharmacokinetics_of_Pregabalin_JCP_2010.pdf","source":"Bockbrader 等 2010，表 V","drinkUrl":"https://www.nhs.uk/medicines/pregabalin/common-questions-about-pregabalin/","fed":{"parts":[{"tmax":2.1,"weight":0.5},{"tmax":5.3,"weight":0.5}],"aucRatio":0.949,"observedTmax":"普通早餐 3.17 小时","observedPeak":"普通早餐 Cmax 为空腹的 68.6%","highFat":{"parts":[{"tmax":1.7,"weight":0.65},{"tmax":4.8,"weight":0.35}],"aucRatio":0.933,"observedTmax":"高脂早餐 2.29 小时","observedPeak":"高脂早餐 Cmax 为空腹的 74.8%"}},"mealWindowMinutes":240,"mealWindowNote":"Hong 等 2016 纳入普通餐后 30 分钟与 4 小时给药，未识别出两者吸收参数的显著差异。本站将已记录用餐后 4 小时内的速释胶囊剂量归为餐后情景；4 小时普通餐结果外推至高脂餐，尚无同样时间点的独立验证。这不是个人消化完成时间，也不证明第 4 小时后影响突然消失。","mealWindowUrl":"https://pmc.ncbi.nlm.nih.gov/articles/PMC5153293/"},"prep_ftc_taf":{"summary":"FTC/TAF 复方片可随餐或空腹服用。高脂餐相对空腹使 FTC 的 AUC 约为 0.91、Cmax 约为 0.74；TAF 的 AUC 约为 1.75、Cmax 约为 0.85。两成分方向不同，本站不将其合并为单一餐后曲线。","drink":"说明书未提供可直接用于本模型的饮料浓度修正参数。","url":"https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=06f66e98-e6ee-4538-9506-6c1282cc14c1","source":"DailyMed DESCOVY 药代参数表"}};
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
// Account-synced what-if entries: never treated as a taken record.
// Overdue plans stay plans until an explicit user confirmation.
const safeScheduledDoses=raw=>Array.isArray(raw)?raw.filter(r=>r&&typeof r.id==="string"&&
  DRUGS.some(d=>d.id===r.drug)&&Number.isFinite(r.time)&&Number.isFinite(r.mg)&&
  r.mg>0&&r.mg<100000).slice(-50000).map(r=>({id:r.id,drug:r.drug,time:r.time,
  mg:r.mg,unit:r.unit==="g"?"g":"mg",kind:"planned"})):[];
const futurePreviewNodes=(drug,extras=[])=>{
  const rows=[...scheduledDoses.filter(d=>d.drug===drug&&d.time>=Date.now()-120000&&
    !records.some(row=>row.drug===drug&&(row.id===d.id||Math.abs(row.time-d.time)<=60000&&Math.abs(row.mg-d.mg)<.0001)))];
  for(const node of extras)if(node&&Number.isFinite(node.time)&&Number.isFinite(node.mg)&&node.mg>0&&
    !rows.some(old=>old.id===node.id||Math.abs(old.time-node.time)<=60000&&Math.abs(old.mg-node.mg)<.0001))rows.push(node);
  return rows.sort((a,b)=>a.time-b.time);
};
const safeCourses=raw=>Array.isArray(raw)?raw.filter(c=>c&&typeof c.id==="string"&&DRUGS.some(d=>d.id===c.drug)&&Number.isFinite(c.start)&&Number.isFinite(c.days)&&c.days>=1&&c.days<=90).slice(-3000):[];
const safeIntakes=raw=>Array.isArray(raw)?raw.filter(x=>x&&Number.isFinite(x.time)&&["meal","drink"].includes(x.kind)&&["none","water","coffee","tea","milk","juice","alcohol","other"].includes(x.drink||"none")).slice(-10000).map(x=>({id:String(x.id||uuid()),time:x.time,kind:x.kind,mealType:x.mealType==="highFat"?"highFat":"regular",drink:x.drink||"none",note:String(x.note||"").slice(0,100)})):[];
const safeRenal=raw=>raw&&Number.isFinite(Number(raw.crcl))&&Number(raw.crcl)>=15&&Number(raw.crcl)<=150?{crcl:Number(raw.crcl),source:raw.source==="estimated"?"estimated":"entered"}:null;
const INVERSE_FIELDS=["pointTarget","pointTargetLimitEnabled","pointTargetLimitBlood","pointTargetLimitEquivalent","pointMaxDose","pointTotalMax","pointCount","pointPeakMin","pointPeakMode","pointCycleMin","pointCycleMode","targetStart","holdHours","inverseCount"];
const safeInverseMemory=raw=>{
  const out={};if(!raw||typeof raw!=="object"||Array.isArray(raw))return out;
  for(const drug of DRUGS){const saved=raw[drug.id];if(!saved||typeof saved!=="object"||Array.isArray(saved))continue;
    out[drug.id]=Object.fromEntries(INVERSE_FIELDS.filter(id=>typeof saved[id]==="string"&&saved[id].length<=32).map(id=>[id,saved[id]]));
    const plan=saved.adoptedPointPlan;
    if(plan&&plan.v===1&&plan.drug===drug.id&&Number.isFinite(plan.target)&&Number.isFinite(plan.threshold)&&["blood","equivalent"].includes(plan.mode)&&Array.isArray(plan.doses)&&plan.doses.length<=12&&plan.doses.every(d=>Number.isFinite(d.time)&&Number.isFinite(d.mg)&&d.mg>0)){
      const clean=structuredClone(plan),manual=plan.manualMatches;
      clean.peakMode=plan.peakMode==="blood"?"blood":"equivalent";
      clean.cycleMode=plan.cycleMode==="equivalent"?"equivalent":"blood";
      clean.cycleMin=Number.isFinite(plan.cycleMin)&&plan.cycleMin>0&&plan.cycleMin<=1000000?plan.cycleMin:0;
      clean.peakMin=Number.isFinite(plan.peakMin)&&plan.peakMin>0&&plan.peakMin<=1000000?plan.peakMin:0;
      clean.totalMax=Number.isFinite(Number(plan.totalMax))&&Number(plan.totalMax)>0&&Number(plan.totalMax)<=1000000?Number(plan.totalMax):0;
      clean.manualMatches=manual&&typeof manual==="object"&&!Array.isArray(manual)?Object.fromEntries(
        Object.entries(manual)
          .filter(([index,id])=>Number.isInteger(Number(index))&&Number(index)>=0&&Number(index)<plan.doses.length&&(
            id===null||typeof id==="string"&&id.length<=100||Array.isArray(id)&&id.length<=20&&id.every(x=>typeof x==="string"&&x.length<=100)))
          .map(([index,id])=>[index,Array.isArray(id)?[...new Set(id)]:id])):{};
      const adjustment=plan.adjustment;
      if(!adjustment||!Array.isArray(adjustment.doses)||adjustment.doses.length>12||!adjustment.doses.every(d=>Number.isFinite(d.time)&&Number.isFinite(d.mg)&&d.mg>0)||!Number.isInteger(adjustment.completedCount)||adjustment.completedCount<0||adjustment.completedCount>plan.doses.length)delete clean.adjustment;
      else clean.adjustment={doses:structuredClone(adjustment.doses),completedCount:adjustment.completedCount,adoptedAt:Number.isFinite(adjustment.adoptedAt)?adjustment.adoptedAt:0};
      if(typeof clean.mealSignature!=="string"||clean.mealSignature.length>4096)delete clean.mealSignature;
      out[drug.id].adoptedPointPlan=clean;
    }
  }
  return out;
};
let records=[],courses=[],plans={},intakes=[],scheduledDoses=[],renal=null,referenceMemory={},inverseMemory={};
const mealMatchCache=new Map();
const MEAL_BEFORE_DOSE_MINUTES=90,MEAL_AFTER_DOSE_MINUTES=15;
const mealBeforeDoseMinutes=drugId=>FOOD_INFO[drugId]?.mealWindowMinutes||MEAL_BEFORE_DOSE_MINUTES;
try{records=safeRecords(JSON.parse(getStored(RECORD_KEY)||"null"))}catch{}
try{courses=safeCourses(JSON.parse(getStored(COURSE_KEY)||"null"))}catch{}
try{scheduledDoses=safeScheduledDoses(JSON.parse(getStored("pk-atlas-planned-doses-v1")||"null"))}catch{}
try{const saved=JSON.parse(getStored(PLAN_KEY)||"null");if(saved&&typeof saved==="object"&&!Array.isArray(saved))plans=saved}catch{}
try{intakes=safeIntakes(JSON.parse(getStored(INTAKE_KEY)||"null"))}catch{}
try{renal=safeRenal(JSON.parse(getStored(RENAL_KEY)||"null"))}catch{}
try{const saved=JSON.parse(getStored("pk-atlas-reference-by-drug-v1")||"{}");if(saved&&typeof saved==="object"&&!Array.isArray(saved))referenceMemory=saved}catch{}
try{inverseMemory=safeInverseMemory(JSON.parse(getStored("pk-atlas-inverse-by-drug-v1")||"{}"))}catch{}
let authUser=null,stateVersion=0,baseState=null,syncPending=false,syncRunning=false,syncConflict=false;
const EDITOR_IDS=new Set([
  "doseTime","doseAmount","doseUnit","intakeKind","intakeTime","mealType","intakeDrink","intakeNote",
  "planStrength","planUnit","planStrengthLabel","planDose","planInterval","planLastTime",
  "threshold","thresholdEquivalent","pointTarget","pointMaxDose","pointTotalMax","pointCount","pointPeakMin","pointPeakMode","pointCycleMin","pointCycleMode",
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

const snapshot=()=>({records:structuredClone(records),courses:structuredClone(courses),plans:structuredClone(plans),intakes:structuredClone(intakes),settings:{...structuredClone(baseState?.settings||{}),currentDrug:current,renal:structuredClone(renal),referenceMemory:structuredClone(referenceMemory),inverseMemory:structuredClone(inverseMemory),editorDrafts:structuredClone(editorDrafts),scheduledDoses:structuredClone(scheduledDoses)}});
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
  const mergedScheduled=mergeList(base.settings?.scheduledDoses||[],local.settings?.scheduledDoses||[],remote.settings?.scheduledDoses||[]);
  if(!mergedRecords||!mergedCourses||!mergedIntakes||!mergedPlans||!mergedRenal||!mergedReferences||!mergedInverse||!mergedEditors||!mergedScheduled)return null;
  return{records:mergedRecords,courses:mergedCourses,plans:mergedPlans,intakes:mergedIntakes,settings:{...remote.settings,...local.settings,renal:mergedRenal.renal,referenceMemory:mergedReferences,inverseMemory:mergedInverse,editorDrafts:mergedEditors,scheduledDoses:mergedScheduled}};
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
      scheduledDoses:byId(cloudSettings.scheduledDoses,localSettings.scheduledDoses),
      referenceMemory:{...(cloudSettings.referenceMemory||{}),...(localSettings.referenceMemory||{})},
      inverseMemory:{...(cloudSettings.inverseMemory||{}),...(localSettings.inverseMemory||{})}}
  };
}
function incomingLocalTransfer(){try{return JSON.parse(sessionStorage.getItem(TRANSFER_KEY)||"null")}catch{return null}}
function startLocalTransfer(){
  const targetOrigin="https://pk.example.com";
  const draft=(()=>{try{return JSON.parse(getStored(DRAFT_KEY)||"null")}catch{return null}})();
  const guest=snapshot(),hasGuest=guest.records.length||guest.intakes.length||guest.settings.scheduledDoses.length||Object.keys(guest.plans).length||guest.settings.renal;
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
// Avoid publishing historical private IPs/hostnames in publicly readable JS.
// Require manual confirmation before any transferred data is written remotely.
function permittedLegacyTransferOrigin(origin){
  try{
    const u=new URL(origin);
    if(u.protocol!=="http:"||u.port||u.username||u.password)return false;
    const host=u.hostname.toLowerCase(),parts=host.split(".");
    const n=parts.map(Number);
    const localIP=parts.length===4&&parts.every((p,i)=>/^\d{1,3}$/.test(p)&&Number(p)===n[i]&&n[i]>=0&&n[i]<=255)&&
      (n[0]===10||(n[0]===172&&n[1]>=16&&n[1]<=31)||(n[0]===192&&n[1]===168));
    const own=location.hostname.toLowerCase(),base=own.split(".").slice(-2).join(".");
    const sibling=own.split(".").length===3&&parts.length===3&&host!==own&&host.endsWith("."+base);
    return localIP||sibling;
  }catch{return false}
}
function initLocalTransferReceiver(){
  if(!new URLSearchParams(location.search).has("local-transfer")||!window.opener)return;
  window.addEventListener("message",event=>{
    if(event.source!==window.opener||!permittedLegacyTransferOrigin(event.origin)||event.data?.type!=="pk-atlas-transfer-data")return;
    const state=event.data.state;
    if(!state||typeof state!=="object"||!Array.isArray(state.records)||state.records.length>10000||!Array.isArray(state.intakes||[])||JSON.stringify(state).length>2000000){setSyncStatus("本机数据格式或大小不符合云端要求。",true);return}
    try{sessionStorage.setItem(TRANSFER_KEY,JSON.stringify({state,origin:event.origin,sourceUsername:String(event.data.sourceUsername||"").slice(0,32)}))}
    catch{setSyncStatus("浏览器无法暂存本机数据，请检查存储空间后重试。",true);return}
    window.opener.postMessage({type:"pk-atlas-transfer-received"},event.origin);
    setSyncStatus("已接收历史记录。请人工检查后点击『保存本地数据至云端』；不会自动上传。",false);
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
/* Cloud autosave: durable per-tab drafts, bounded retries and three-way merges.
 * All actual medication records remain explicit user actions. */
const SYNC_NAMES=["records","courses","intakes","plans","settings"];
const SYNC_DRAFT_PREFIX="pk-atlas-sync-draft-v2:";
// A new instance ID per page load avoids cloned sessionStorage IDs when
// Safari/Chrome duplicates a tab; prior draft keys are scanned on reload.
const SYNC_TAB_ID=(()=>{
  try{return crypto.randomUUID()}catch{return String(Date.now())+"-"+Math.random().toString(36).slice(2)}
})();
let syncRevision=0,syncTimer=0,syncRetryDelay=1000,syncRecoveredDrafts=[],syncLastEditAt=0;
let syncStorageError=false,syncPulling=false,syncUploadId=null;
const syncNewOperationId=()=>crypto.randomUUID?.()||('op-'+Date.now()+'-'+Math.random().toString(36).slice(2));
const syncKey=username=>SYNC_DRAFT_PREFIX+encodeURIComponent(username)+":"+SYNC_TAB_ID;
const syncApi=(path,method="GET",body)=>PKApi.request(path,method,body,{timeoutMs:16000});
const syncDraftChanges=(a,b)=>SYNC_NAMES.filter(key=>!same(a?.[key],b?.[key]));
function syncSetStatus(kind,message){
  setSyncStatus(message,kind==="error"||kind==="conflict");
  const el=$("syncStatus");
  if(el)el.dataset.sync=kind;
  const info=$("syncLastSaved");
  if(info){
    if(kind==="synced")info.textContent="云端已确认保存";
    else if(kind==="saving")info.textContent="本机草稿已保存，正在同步";
    else if(kind==="offline")info.textContent="本机草稿已保留，等待网络";
    else if(kind==="conflict")info.textContent="存在冲突，不会自动覆盖";
    else info.textContent="尚未完成云端确认";
  }
}
function syncReadDrafts(username){
  const entries=[];
  try{
    const prefix=SYNC_DRAFT_PREFIX+encodeURIComponent(username)+":";
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);
      if(!key||!key.startsWith(prefix))continue;
      const raw=localStorage.getItem(key);
      if(!raw)continue;
      try{
        const draft=JSON.parse(raw);
        if(draft?.username===username&&draft.state&&draft.base&&Number.isInteger(draft.version))
          entries.push({key,raw,draft});
      }catch{}
    }
    const raw=localStorage.getItem(DRAFT_KEY);
    if(raw){
      try{
        const draft=JSON.parse(raw);
        if(draft?.username===username&&draft.state&&draft.base&&Number.isInteger(draft.version))
          entries.push({key:DRAFT_KEY,raw,draft});
      }catch{}
    }
  }catch{syncStorageError=true}
  return entries.sort((a,b)=>(a.draft.savedAt||0)-(b.draft.savedAt||0));
}
function syncSaveDraft(){
  if(!authUser)return true;
  const draft={schema:2,username:authUser,tabId:SYNC_TAB_ID,savedAt:Date.now(),
    version:stateVersion,operationId:syncUploadId,base:structuredClone(baseState||{}),state:snapshot()};
  try{
    localStorage.setItem(syncKey(authUser),JSON.stringify(draft));
    syncStorageError=false;
    return true;
  }catch{
    syncStorageError=true;
    syncSetStatus("error","本机存储空间或权限不足！当前更改尚未安全备份；请保持页面打开并手动导出。");
    return false;
  }
}
function syncClearAcknowledgedDrafts(acceptedId=null){
  if(!authUser)return;
  try{
    // Never delete a newer draft from another tab or a later edit on this tab.
    const key=syncKey(authUser),raw=localStorage.getItem(key);
    if(raw){
      const saved=JSON.parse(raw);
      if(saved?.username===authUser&&(same(saved.state,snapshot())||(acceptedId&&saved.operationId===acceptedId)))
        localStorage.removeItem(key);
    }
    for(const entry of syncRecoveredDrafts){
      if(localStorage.getItem(entry.key)===entry.raw)localStorage.removeItem(entry.key);
    }
    syncRecoveredDrafts=[];
    syncStorageError=false;
  }catch{syncStorageError=true}
}
function mergeEditorDrafts(base,local,remote){
  const result={};
  for(const drug of new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)])){
    const merged=mergeObjects(base[drug]||{},local[drug]||{},remote[drug]||{});
    if(!merged)return null;
    if(Object.keys(merged).length)result[drug]=merged;
  }
  return result;
}
function syncAdoptedSignature(state){
  const memory=state?.settings?.inverseMemory;
  if(!memory||typeof memory!=="object"||Array.isArray(memory))return "[]";
  // Never include actual records, dosage details or private account fields in
  // a cross-component event. Only compare the locally held state.
  return JSON.stringify(Object.entries(memory).filter(([,entry])=>
    entry?.adoptedPointPlan&&typeof entry.adoptedPointPlan==="object")
    .sort(([a],[b])=>a.localeCompare(b))
    .map(([drug,entry])=>[drug,entry.adoptedPointPlan]));
}
function syncAdoptedChanged(version){
  const message="已接收另一设备对已采用方案的修改，曲线与自动提醒已重新同步。";
  for(const id of ["adoptedSyncNotice","adoptedSyncToast"]){
    const notice=$(id);
    if(notice){notice.textContent=message;notice.hidden=false;}
  }
  clearTimeout(syncAdoptedChanged.hideTimer);
  syncAdoptedChanged.hideTimer=setTimeout(()=>{
    for(const id of ["adoptedSyncNotice","adoptedSyncToast"]){
      const notice=$(id);if(notice)notice.hidden=true;
    }
  },12000);
  window.dispatchEvent(new CustomEvent("pk-atlas-adopted-plan-changed",{
    detail:{source:"server",version}
  }));
}
function syncApplyMerged(state){
  records=safeRecords(state.records);
  scheduledDoses=safeScheduledDoses(state.settings?.scheduledDoses);
  courses=safeCourses(state.courses);
  intakes=safeIntakes(state.intakes);
  plans=state.plans&&typeof state.plans==="object"&&!Array.isArray(state.plans)?state.plans:{};
  renal=safeRenal(state.settings?.renal);
  referenceMemory=state.settings?.referenceMemory||{};
  inverseMemory=safeInverseMemory(state.settings?.inverseMemory);
  editorDrafts=safeEditorDrafts(state.settings?.editorDrafts);
  if(DRUGS.some(d=>d.id===state.settings?.currentDrug))current=state.settings.currentDrug;
  mealMatchCache.clear();
  MODEL_PARAMS.clear();
}
function syncSchedule(delay=650){
  if(!authUser||syncConflict||appOfflineRestored)return;
  clearTimeout(syncTimer);
  syncTimer=setTimeout(()=>void flushSync(),delay);
}
function syncRetryLater(error){
  syncPending=true;
  syncRetryDelay=Math.min(60000,Math.max(1000,syncRetryDelay*2));
  const offline=typeof navigator!=="undefined"&&!navigator.onLine;
  syncSetStatus(offline?"offline":"error",
    offline?"已离线，本机更改已保存；联网后自动继续。":
    `云端同步失败：${error?.message||"网络错误"}；本机草稿保留，将自动重试。`);
  $("syncRetry").hidden=false;
  syncSchedule(syncRetryDelay);
}
function syncConflictNotice(){
  syncConflict=true;
  syncPending=false;
  clearTimeout(syncTimer);
  syncSetStatus("conflict","本机与云端修改了同一内容。两份数据均保留，暂不覆盖；可导出本机草稿并重试核对。");
  $("syncRetry").hidden=false;
}
function persist(){
  mealMatchCache.clear();
  if(authUser){
    syncRevision++;
    syncUploadId=syncNewOperationId();
    syncLastEditAt=Date.now();
    const safe=syncSaveDraft();
    syncPending=true;
    if(safe)syncSetStatus(navigator.onLine?"pending":"offline",
      navigator.onLine?"已自动保存到本机 · 等待云端确认":"已离线 · 本机草稿已保存");
    syncSchedule(600);
  }else{
    setStored(RECORD_KEY,JSON.stringify(records));setStored(COURSE_KEY,JSON.stringify(courses));
    setStored(PLAN_KEY,JSON.stringify(plans));setStored(INTAKE_KEY,JSON.stringify(intakes));
    setStored("pk-atlas-planned-doses-v1",JSON.stringify(scheduledDoses));
    setStored(RENAL_KEY,JSON.stringify(renal));
  }
  if(!authUser){
    setStored("pk-atlas-reference-by-drug-v1",JSON.stringify(referenceMemory));
    setStored("pk-atlas-inverse-by-drug-v1",JSON.stringify(inverseMemory));
  }
}
async function syncRecoverPending(){
  if(!authUser)return;
  const drafts=syncReadDrafts(authUser);
  const pending=drafts.filter(item=>syncDraftChanges(item.draft.base,item.draft.state).length);
  if(!pending.length){syncSetStatus("synced","已读取云端最新数据");return}
  // Only the latest LOCAL draft wins. Never union deleted records back in.
  const newest=pending[pending.length-1];
  syncRecoveredDrafts=drafts;
  syncApplyMerged(newest.draft.state);
  syncUploadId=newest.draft.operationId||syncNewOperationId();
  syncRevision++;syncPending=true;syncSaveDraft();
  syncSetStatus("pending","恢复未上传的完整本机草稿，等待最后上传优先同步");
  syncSchedule(80);
}
async function flushSync(){
  clearTimeout(syncTimer);syncTimer=0;
  if(syncRunning||!authUser||appOfflineRestored||syncConflict||!syncPending)return;
  if(!navigator.onLine){syncRetryLater(new Error("offline"));return}
  syncRunning=true;syncPending=false;
  const sent=snapshot(),version=stateVersion,revision=syncRevision;
  const adoptedBefore=syncAdoptedSignature(sent);
  const dirty=syncDraftChanges(baseState,sent).length>0;
  const operationId=syncUploadId||(syncUploadId=syncNewOperationId());
  try{
    if(dirty){
      syncSetStatus("saving","上传完整快照，以服务器最后成功提交的设备为准…");
      await syncApi("/api/state","PUT",{version,state:sent,
        syncPolicy:"last-upload-wins-v1",operationId});
    }
    const remote=await syncApi("/api/state");
    if(remote.syncPolicy!=="last-upload-wins-v1"){
      syncConflictNotice();
      syncSetStatus("conflict","服务器尚不支持最后上传优先规则，请先升级服务端。");
      return;
    }
    baseState=structuredClone(remote.state);
    stateVersion=remote.version;
    offlineSaveVerified(authUser,remote.state,remote.version);
    if(syncRevision!==revision){
      syncPending=true;syncSaveDraft();
      syncSetStatus("pending","上传期间产生新修改，将继续提交较新的本机快照…");
      syncSchedule(250);
      return;
    }
    // Another device could have committed between our write and GET.
    // In that case it has won. Do not re-upload our older snapshot.
    syncApplyMerged(remote.state);
    syncClearAcknowledgedDrafts(operationId);
    syncUploadId=null;syncRetryDelay=1000;
    renderDrug();
    syncSetStatus("synced","已回读最后成功上传设备的完整快照");
    $("syncRetry").hidden=true;
    if(adoptedBefore!==syncAdoptedSignature(remote.state))syncAdoptedChanged(remote.version);
    window.dispatchEvent(new Event("pk-atlas-records-changed"));
  }catch(error){
    if(error.status===409){
      syncConflictNotice();
      syncSetStatus("conflict","服务器仍使用旧版冲突规则，停止重试；保留本机草稿。");
    }else if(error.status===401){
      syncPending=true;
      syncSetStatus("error","登录已过期，本机完整草稿已保留。");
      $("authRetry").hidden=false;$("syncRetry").hidden=false;
    }else syncRetryLater(error);
  }finally{
    syncRunning=false;
    if(syncPending&&!syncConflict&&!syncTimer)syncSchedule(250);
  }
}
async function syncPullRemote(){
  if(!authUser||appOfflineRestored||syncPulling||syncRunning||syncPending||syncConflict||!navigator.onLine)return;
  if(document.hidden)return;
  if(Date.now()-syncLastEditAt<3500)return;
  if(document.activeElement?.matches?.("input,textarea,select,[contenteditable=true]"))return;
  syncPulling=true;const revision=syncRevision;
  try{
    const remote=await syncApi("/api/state");
    if(syncRevision!==revision||syncPending||syncRunning)return;
    if(remote.version!==stateVersion){
      const adoptedBefore=syncAdoptedSignature(snapshot());
      baseState=structuredClone(remote.state);
      stateVersion=remote.version;
      syncApplyMerged(remote.state);
      offlineSaveVerified(authUser,remote.state,remote.version);
      renderDrug();
      syncSetStatus("synced","已加载另一设备最后提交的完整版本");
      if(adoptedBefore!==syncAdoptedSignature(remote.state))syncAdoptedChanged(remote.version);
      window.dispatchEvent(new Event("pk-atlas-records-changed"));
    }
  }catch{/* Poll failures never erase a local draft or upload stale data. */}
  finally{syncPulling=false}
}
async function syncManualRetry(){
  if(!authUser||appOfflineRestored||syncRunning)return;
  syncConflict=false;syncPending=true;
  if(!syncUploadId)syncUploadId=syncNewOperationId();
  syncSaveDraft();syncSchedule(0);
}
function syncDownloadDraft(){
  if(!authUser)return;
  const text=JSON.stringify({username:authUser,exportedAt:new Date().toISOString(),
    state:snapshot(),base:baseState,version:stateVersion},null,2);
  const blob=new Blob([text],{type:"application/json"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download="yaoshi-unsynced-"+new Date().toISOString().slice(0,10)+".json";
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function initSyncLifecycle(){
  $("syncNow").addEventListener("click",()=>void syncManualRetry());
  $("syncExport").addEventListener("click",syncDownloadDraft);
  window.addEventListener("online",()=>{
    if(authUser&&!appOfflineRestored){syncPending=true;syncSchedule(0)}
  });
  document.addEventListener("visibilitychange",()=>{
    if(!document.hidden){if(syncPending)syncSchedule(0);else void syncPullRemote()}
  });
  window.addEventListener("focus",()=>{if(syncPending)syncSchedule(0);else void syncPullRemote()});
  window.addEventListener("storage",e=>{
    if(!authUser||!e.key||!e.key.startsWith(SYNC_DRAFT_PREFIX))return;
    if(!syncPending&&!syncRunning)void syncPullRemote();
  });
  document.addEventListener("input",syncCaptureEditor);
  document.addEventListener("change",syncCaptureEditor);
  setInterval(()=>{if(syncPending)syncSchedule(0);else void syncPullRemote()},15000);
}


// Editing a dose is not the same as recording that it was taken. Preserve
// in-progress fields as account-scoped drafts, never as confirmed medication.
function syncCaptureEditor(event){
  if(!authUser)return;
  const input=event.target;
  if(!input?.id||!EDITOR_IDS.has(input.id)||input.closest("#authForm"))return;
  const byDrug=editorDrafts[current]||{};
  byDrug[input.id]=String(input.value).slice(0,160);
  editorDrafts[current]=byDrug;
  persist();
}
function syncRestoreEditor(){
  const fields=editorDrafts[current];
  if(!fields)return;
  for(const [id,value] of Object.entries(fields)){
    const el=$(id);
    if(!el||el.disabled||!EDITOR_IDS.has(id))continue;
    if(document.activeElement===el)continue;
    el.value=value;
  }
}
function syncClearEditorFields(ids,drug=current){
  const fields=editorDrafts[drug];
  if(!fields)return;
  for(const id of ids)delete fields[id];
  if(!Object.keys(fields).length)delete editorDrafts[drug];
}
function migrateUnconfirmedFutureRecords(){
  const cutoff=Date.now();
  const items=records.filter(r=>r.time>cutoff&&!isJournalArchive(r));
  if(!items.length)return 0;
  const ids=new Set(scheduledDoses.map(x=>x.id));
  for(const row of items)if(!ids.has(row.id))scheduledDoses.push({id:row.id,drug:row.drug,
    time:row.time,mg:row.mg,unit:row.unit||"mg",kind:"planned"});
  records=records.filter(r=>!items.includes(r));
  return items.length;
}
function renderChooser(){
  const dateInput=$("chooseDate");if(!dateInput)return;
  if(!dateInput.value)dateInput.value=selectedDate;
  const box=$("chooserDates");box.replaceChildren();
  const keys=[...new Set([...records,...intakes,...scheduledDoses].map(r=>dateKey(r.time)))].sort().reverse();
  if(!keys.length){const p=document.createElement("p");p.className="chooser-empty";p.textContent="还没有服用或饮食记录。选定日期后即可开始。";box.append(p)}
  for(const key of keys){const button=document.createElement("button");button.className="chooser-card";button.type="button";const strong=document.createElement("strong"),small=document.createElement("small");strong.textContent=key;const dayRows=records.filter(r=>dateKey(r.time)===key),mealCount=intakes.filter(x=>dateKey(x.time)===key).length,names=dayDrugTotals(dayRows).map(x=>x.name),pending=dayRows.filter(r=>r.journal?.reviewStatus==="possibleDuplicate").length;small.textContent=`${dayRows.filter(r=>!isJournalReview(r)).length} 次服用${pending?` · ${pending} 条待核对`:""} · ${mealCount} 条饮食 · ${scheduledDoses.filter(x=>dateKey(x.time)===key).length} 条计划 · ${names.join("、")||"暂无已确认药物"}`;button.append(strong,small);button.onclick=()=>openCalculationDate(key);box.append(button)}
  const adopted=Object.entries(inverseMemory).map(([drugId,saved])=>({drugId,plan:saved?.adoptedPointPlan})).filter(x=>x.plan&&DRUGS.some(d=>d.id===x.drugId)).sort((a,b)=>(b.plan.adoptedAt||0)-(a.plan.adoptedAt||0));
  $("adoptedPlans").hidden=!adopted.length;
  const adoptedList=$("adoptedPlanList");adoptedList.replaceChildren();
  for(const {drugId,plan} of adopted){
    const card=document.createElement("button"),name=DRUGS.find(d=>d.id===drugId).name,strong=document.createElement("strong"),small=document.createElement("small");
    card.type="button";card.className="chooser-card";strong.textContent=`${name} · 已采用模型`;
    small.textContent=`方案 ${plan.variant||"A"} · 目标 ${fullDate(plan.target)} · 原方案 ${plan.doses.length} 个节点 · 账号同步`;
    card.append(strong,small);card.onclick=()=>{current=drugId;$("drug").value=drugId;openCalculationDate(dateKey(Number.isFinite(plan.adoptedAt)?plan.adoptedAt:plan.target));setMobilePane("results",true);openDisclosure("advancedTools");};
    adoptedList.append(card);
  }
  updateWheelTriggers();
}
function openCalculationDate(key,newDose=false){
  if(!authUser)return;
  selectedDate=key;selectedDateFollowsToday=key===dateKey(Date.now());activeCourseId="";appliedPointScenario=null;$("viewDate").value=key;resetDoseEdit();resetIntakeEdit();renderDrug();showStage("calc");updateWheelTriggers();
  if(newDose)$("doseForm").scrollIntoView({behavior:"smooth",block:"center"});
}
function applyAccountState(state,version){
  records=safeRecords(state.records);courses=safeCourses(state.courses);
  scheduledDoses=safeScheduledDoses(state.settings?.scheduledDoses);
  intakes=safeIntakes(state.intakes);mealMatchCache.clear();
  plans=state.plans&&typeof state.plans==="object"&&!Array.isArray(state.plans)?state.plans:{};
  renal=safeRenal(state.settings?.renal);
  referenceMemory=state.settings?.referenceMemory&&typeof state.settings.referenceMemory==="object"?state.settings.referenceMemory:{};
  inverseMemory=safeInverseMemory(state.settings?.inverseMemory);
  editorDrafts=safeEditorDrafts(state.settings?.editorDrafts);
  for(const saved of Object.values(inverseMemory)){const plan=saved.adoptedPointPlan;if(plan&&plan.mealSignature===undefined)plan.mealSignature=mealScenarioSignature(plan.drug,plan.adoptedAt,plan.target)}
  if(DRUGS.some(d=>d.id===state.settings?.currentDrug))current=state.settings.currentDrug;
  stateVersion=version;baseState=structuredClone({records,courses,plans,intakes,settings:{...state.settings,currentDrug:current,renal}});
  const converted=migrateUnconfirmedFutureRecords();
  if(converted){syncSetStatus("pending",`发现 ${converted} 条未来时间旧记录，已转为计划服用并等待云端同步`);persist();}
  activeCourseId="";$("drug").value=current;resetDoseEdit();renderDrug();
}
async function loadAccount(prefetched=null){
  const data=prefetched||await api("/api/state");
  $("bootStatus").textContent="正在验证云端记录与本机草稿…";
  applyAccountState(data.state,data.version);
  offlineSaveVerified(authUser,data.state,data.version);
  appOfflineRestored=false;
  offlineSetBanner(false);
  $("accountName").textContent=`${authUser} · 已登录`;
  $("authForm").hidden=true;$("accountActions").hidden=false;$("accountTools").hidden=false;$("accountTools").open=false;
  window.dispatchEvent(new Event("pk-atlas-login"));
  await syncRecoverPending();
  let guestRecords=[],guestCourses=[],guestIntakes=[],guestScheduled=[],guestRenal=null,draft=null;
  try{guestRecords=safeRecords(JSON.parse(getStored(RECORD_KEY)||"[]"));guestCourses=safeCourses(JSON.parse(getStored(COURSE_KEY)||"[]"));guestIntakes=safeIntakes(JSON.parse(getStored(INTAKE_KEY)||"[]"));guestScheduled=safeScheduledDoses(JSON.parse(getStored("pk-atlas-planned-doses-v1")||"[]"));guestRenal=safeRenal(JSON.parse(getStored(RENAL_KEY)||"null"));draft=JSON.parse(getStored(DRAFT_KEY)||"null")}catch{}
  $("importLocal").hidden=!guestRecords.length&&!guestCourses.length&&!guestIntakes.length&&!guestScheduled.length&&!guestRenal;
  if(!syncPending&&!syncConflict){
    syncSetStatus("synced",incomingLocalTransfer()?"已接收本机数据，请确认保存到云端。":"已连接账号 · 云端数据已核对");
  }
  const today=dateKey(Date.now());
  const todayRows=records.filter(r=>dateKey(r.time)===today).sort((a,b)=>b.time-a.time);
  if(todayRows.length){const latestKnown=todayRows.find(r=>DRUGS.some(d=>d.id===r.drug));if(latestKnown)current=latestKnown.drug;$("drug").value=current;openCalculationDate(today)}
  else openCalculationDate(today);
  if(incomingLocalTransfer())setSyncStatus("历史数据已暂存。请先核对，再手动点击『保存本地数据至云端』。",false);
}
async function initAuth(){
  initDeviceSessionUI();
  $("transferLocal").hidden=location.origin==="https://pk.example.com";
  $("transferLocal").addEventListener("click",startLocalTransfer);
  if(location.origin!=="https://pk.example.com"){
    $("authForm").hidden=true;$("authRetry").hidden=true;$("accountName").textContent="本机记录";
    setSyncStatus("点击下方按钮，在正式网站登录并保存本机记录。");showStage("auth");return;
  }
  const restore=async()=>{
    $("bootStatus").textContent="正在安全恢复登录与云端记录…";
    if(getStored(PENDING_OFFLINE_LOGOUT_KEY)==="1"){
      const revoked=await offlineFinishPendingLogout();
      $("authRetry").hidden=revoked;
      setSyncStatus(revoked?
        "已撤销此前离线退出的服务器会话，请重新登录。":
        "已在本机退出，联网后仍需撤销服务器会话。请重试。",!revoked);
      $("authForm").hidden=false;
      $("accountName").textContent="未登录";
      showStage("auth");
      return;
    }
    try{
      // The reads are independent. Parallel requests remove one edge RTT from
      // a warm PWA launch without weakening session validation.
      const [result,account]=await Promise.all([api("/api/me"),api("/api/state")]);
      authUser=result.username;
      $("authRetry").hidden=true;
      appRememberSession(result);
      await loadAccount(account);
    }catch(err){
    // 401 is an explicit authorization rejection: never unlock offline.
    if(err.status!==401&&(err.status===undefined||err.status===503||err.status===504)){
      if(await offlineRestoreLastVerified())return;
    }
    appOfflineRestored=false;offlineSetBanner(false);
    authUser=null;$("accountTools").hidden=true;
    if(err.status===401){$("authRetry").hidden=true;setSyncStatus(incomingLocalTransfer()?"本机数据已接收，请登录后确认保存到云端。":"请登录后查看和同步记录")}else{$("authRetry").hidden=false;setSyncStatus(`暂时无法恢复登录：${err.message}。请重试。`,true)}
    $("accountName").textContent="登录药时";
    showStage("auth")
  }};
  $("authRetry").addEventListener("click",()=>void restore());
  // Some installed PWAs may regain connectivity without an "online" event
  // while the page is suspended. Revalidate on return to the foreground too.
  let offlineResumeRunning=false;
  const resumeOffline=async()=>{
    if(!appOfflineRestored||!navigator.onLine||offlineResumeRunning)return;
    offlineResumeRunning=true;
    try{await restore()}finally{offlineResumeRunning=false}
  };
  window.addEventListener("online",()=>{
    if(appOfflineRestored)void resumeOffline();
    else if(!authUser&&!$("authRetry").hidden)void restore();
  });
  window.addEventListener("focus",()=>{if(appOfflineRestored)void resumeOffline()});
  document.addEventListener("visibilitychange",()=>{
    if(!document.hidden&&appOfflineRestored)void resumeOffline();
  });
  $("authForm").addEventListener("submit",async e=>{
    e.preventDefault();const action=e.submitter?.dataset.action||"login",username=$("accountUser").value.trim(),password=$("accountPassword").value;
    if(!await offlineFinishPendingLogout()){
      setSyncStatus("上次离线退出尚未完成服务器注销；请先联网重试。",true);
      return;
    }
    setSyncStatus("正在验证身份…");
    $("authForm").setAttribute("aria-busy","true");
    for(const button of $("authForm").querySelectorAll("button[type=submit]"))button.disabled=true;
    try{
      // Auth response includes the initial versioned snapshot. One HTTPS
      // request replaces sequential /api/login + /api/state.
      const result=await api(action==="register"?"/api/register":"/api/login","POST",
        {username,password,remember:$("sessionRemember").checked,
         ...(await browserDeviceMetadata())});
      $("accountPassword").value="";
      authUser=result.username;
      appRememberSession(result);
      await loadAccount(result.account||null);
    }catch(err){setSyncStatus("登录或加载失败："+err.message,true)}
    finally{
      $("authForm").removeAttribute("aria-busy");
      for(const button of $("authForm").querySelectorAll("button[type=submit]"))button.disabled=false;
    }
  });
  $("logout").addEventListener("click",async()=>{
    if((syncPending||syncRunning||syncConflict)&&!confirm("还有未同步到云端的更改。退出后本机草稿会保留，下一次登录可恢复，但其他设备暂时看不到这些更改。确定退出？"))return;
    clearTimeout(syncTimer);syncTimer=0;
    const disconnected=appOfflineRestored||!navigator.onLine;
    let pendingLogout=disconnected;
    if(!disconnected){
      try{await window.disablePushForLogout?.()}catch{
        // Push failure must not trap the user in a logged-in session.
      }
      try{await api("/api/logout","POST")}catch(error){
        if(error.status!==401)pendingLogout=true;
      }
    }
    try{
      if(pendingLogout)setStored(PENDING_OFFLINE_LOGOUT_KEY,"1");
      else localStorage.removeItem(PENDING_OFFLINE_LOGOUT_KEY);
    }catch{}
    window.dispatchEvent(new Event("pk-atlas-logout"));
    appForgetSession();
    authUser=null;syncConflict=false;syncPending=false;syncRecoveredDrafts=[];editorDrafts={};records=safeRecords(JSON.parse(getStored(RECORD_KEY)||"[]"));courses=safeCourses(JSON.parse(getStored(COURSE_KEY)||"[]"));plans=JSON.parse(getStored(PLAN_KEY)||"{}");intakes=safeIntakes(JSON.parse(getStored(INTAKE_KEY)||"[]"));scheduledDoses=safeScheduledDoses(JSON.parse(getStored("pk-atlas-planned-doses-v1")||"[]"));renal=safeRenal(JSON.parse(getStored(RENAL_KEY)||"null"));referenceMemory={};inverseMemory={};localStorage.removeItem("pk-atlas-reference-by-drug-v1");localStorage.removeItem("pk-atlas-inverse-by-drug-v1");mealMatchCache.clear();
    $("authForm").hidden=false;$("accountActions").hidden=true;$("accountTools").hidden=true;$("accountTools").open=false;$("accountName").textContent="未登录";setSyncStatus("请登录后查看和同步记录");activeCourseId="";renderDrug();showStage("auth");
  });
  $("importLocal").addEventListener("click",()=>{
    if(!authUser||!confirm("将当前浏览器保存的服用、计划服用、饮食记录、药盒规格和肾功能模型参数合并到已登录账号？"))return;
    const localRecords=safeRecords(JSON.parse(getStored(RECORD_KEY)||"[]")),localCourses=safeCourses(JSON.parse(getStored(COURSE_KEY)||"[]")),localPlans=JSON.parse(getStored(PLAN_KEY)||"{}"),localIntakes=safeIntakes(JSON.parse(getStored(INTAKE_KEY)||"[]")),localScheduled=safeScheduledDoses(JSON.parse(getStored("pk-atlas-planned-doses-v1")||"[]")),localRenal=safeRenal(JSON.parse(getStored(RENAL_KEY)||"null"));
    const cr=new Map(courses.map(x=>[x.id,x]));for(const x of localCourses)if(!cr.has(x.id))cr.set(x.id,x);courses=[...cr.values()];
    const rr=new Map(records.map(x=>[x.id,x]));for(const x of localRecords)if(!rr.has(x.id))rr.set(x.id,x);records=[...rr.values()];
    const ii=new Map(intakes.map(x=>[x.id,x]));for(const x of localIntakes)if(!ii.has(x.id))ii.set(x.id,x);intakes=[...ii.values()];
    const pp=new Map(scheduledDoses.map(x=>[x.id,x]));for(const x of localScheduled)if(!pp.has(x.id))pp.set(x.id,x);scheduledDoses=[...pp.values()];
    for(const [key,value] of Object.entries(localPlans))if(!Object.hasOwn(plans,key))plans[key]=value;
    if(!renal&&localRenal)renal=localRenal;
    persist();renderDrug();setSyncStatus("已合并本机记录，正在同步…");
  });
  $("saveLocalCloud").addEventListener("click",async()=>{
    if(location.origin!=="https://pk.example.com"){startLocalTransfer();return}
    if(!authUser){setSyncStatus("请先登录正式网站，再保存本机数据。",true);return}
    if(syncRunning){setSyncStatus("当前同步尚未结束，请稍后再保存本机数据。",true);return}
    let draftText=getStored(DRAFT_KEY),draft=null;
    try{draft=JSON.parse(draftText||"null")}catch{}
    const incoming=incomingLocalTransfer();
    const local=structuredClone(incoming?.state||(draft?.username===authUser?draft.state:null)||snapshot());
    const button=$("saveLocalCloud");button.disabled=true;syncRunning=true;let saved=false;
    try{
      setSyncStatus("正在核对云端数据…");
      let remote=await api("/api/state");
      const localIds=new Set((local.records||[]).map(row=>row.id));
      const cloudOnly=(remote.state.records||[]).filter(row=>!localIds.has(row.id)).length;
      const message=`将${incoming?`来自 ${incoming.sourceUsername||"本机旧页面"} 的`:"本机当前账号"}数据保存到 ${authUser} 的云端账号？\n本机：${(local.records||[]).length} 条已服用、${(local.settings?.scheduledDoses||[]).length} 条计划、${(local.intakes||[]).length} 条饮食。药盒规格、参考值和已采用情景也会保存。\n云端独有的 ${cloudOnly} 条服用记录会保留；同一记录如两端不同，以本机内容为准。`;
      if(!confirm(message)){setSyncStatus("已取消保存，本机数据未改动。");return}
      let uploaded=null,version=null;
      for(let attempt=0;attempt<3;attempt++){
        uploaded=mergeLocalForUpload(remote.state,local);
        if(uploaded.records.length>10000||uploaded.intakes.length>10000||uploaded.courses.length>3000)throw new Error("两端记录合并后超过云端容量，请先导出并整理记录");
        try{const result=await api("/api/state","PUT",{version:remote.version,state:uploaded});version=result.version;saved=true;break}
        catch(error){if(error.status!==409||attempt===2)throw error;remote={state:error.data.state,version:error.data.version}}
      }
      const latestDraft=getStored(DRAFT_KEY);
      if(latestDraft!==draftText){
        const combined=mergeLocalForUpload(uploaded,snapshot());
        applyAccountState(combined,version);baseState=uploaded;syncConflict=false;persist();
        setSyncStatus("本机数据已保存到云端；保存期间的新修改正在继续同步。");
      }else{
        applyAccountState(uploaded,version);localStorage.removeItem(DRAFT_KEY);
        syncConflict=false;syncPending=false;syncClearAcknowledgedDrafts();$("syncRetry").hidden=true;
        setSyncStatus(`已保存到云端 · ${(uploaded.records||[]).length} 条服用、${(uploaded.intakes||[]).length} 条饮食`);
      }
      window.dispatchEvent(new Event("pk-atlas-records-changed"));
      if(incoming){sessionStorage.removeItem(TRANSFER_KEY);window.opener?.postMessage({type:"pk-atlas-transfer-saved"},incoming.origin)}
    }catch(error){setSyncStatus(error.status===401?"登录已过期，请重新登录后保存；本机草稿仍保留。":`保存失败：${error.message}。本机草稿仍保留。`,true);$("syncRetry").hidden=false}
    finally{syncRunning=false;button.disabled=false;if(saved&&syncPending&&!syncConflict)void flushSync()}
  });
  $("syncRetry").addEventListener("click",()=>void syncManualRetry());
  if(!navigator.onLine && await offlineRestoreLastVerified())return;
  await restore();

}
let editingDoseId="",editingScheduledId="",editingAdoptedIndex=null,editingAdoptedAdjustmentIndex=null,editingCourseId="",editingIntakeId="",timeTouched=false,previousUnit="mg";
const unitByDrug={};
function chosen(){return DRUGS.find(d=>d.id===current)}
function allRows(){return records.filter(r=>r.drug===current)}
function courseRows(){return records.filter(r=>r.drug===current&&dateKey(r.time)===selectedDate)}
function setDoseEditor(unit,mg){
  const divisor=unit==="g"?1000:1;
  $("doseUnit").value=unit;
  $("doseAmount").min=unit==="g"?"0.0001":"0.1";
  $("doseAmount").removeAttribute("max");
  $("doseAmount").value=fmt(mg/divisor,4);
  $("doseLimit").textContent="单次剂量不设输入上限。超出文献参考剂量时，模型外推的不确定性会增加；请勿据此调整实际用药。";
  previousUnit=unit;
  renderPillHint();
}
function getStrengths(drugId){
  const p=plans[drugId]||{},raw=Array.isArray(p.strengths)?p.strengths:Number(p.strength)>0?[{id:`legacy-${drugId}`,mg:Number(p.strength),unit:"粒",label:"此前保存的规格"}]:[];
  return raw.filter(s=>s&&Number.isFinite(Number(s.mg))&&Number(s.mg)>=.001&&["粒","片","袋"].includes(s.unit||"粒")).slice(0,8).map(s=>({id:String(s.id||uuid()),mg:Number(s.mg),unit:s.unit||"粒",label:String(s.label||"").slice(0,40)}));
}
function ensurePlan(drugId){const p=plans[drugId]||{};if(!Array.isArray(p.strengths))p.strengths=getStrengths(drugId);delete p.strength;plans[drugId]=p;return p}
const DOSE_OPTION_CACHE=new Map();
function wholeDoseOptions(strengths){
  const key=strengths.map(s=>`${s.id}:${Math.round(s.mg*1000)}:${s.unit}`).join("|");if(DOSE_OPTION_CACHE.has(key))return DOSE_OPTION_CACHE.get(key);
  if(!strengths.length)return[];
  const maxUnits=strengths.length<=3?20:strengths.length<=5?12:8,amounts=strengths.map(s=>Math.round(s.mg*1000)),best=new Map(),counts=Array(strengths.length).fill(0);
  function visit(i,left,total,units){
    if(i===strengths.length){if(total<=0)return;const prior=best.get(total);if(!prior||units<prior.units)best.set(total,{mg:total/1000,units,parts:counts.map((n,k)=>n?{count:n,spec:strengths[k]}:null).filter(Boolean)});return}
    for(let n=0;n<=left;n++){counts[i]=n;visit(i+1,left-n,total+n*amounts[i],units+n)}counts[i]=0;
  }
  visit(0,maxUnits,0,0);
  const options=[...best.values()].sort((a,b)=>a.mg-b.mg||a.units-b.units);DOSE_OPTION_CACHE.set(key,options);return options;
}
function nearestWholeDose(needed,options,maxDose=Infinity){
  let lo=0,hi=options.length;while(lo<hi){const mid=(lo+hi)>>1;if(options[mid].mg+1e-9<needed)lo=mid+1;else hi=mid}
  return options[lo]&&options[lo].mg<=maxDose+1e-9?options[lo]:null;
}
function formatParts(parts){return parts.map(p=>`${p.count} ${p.spec.unit} × ${fmt(p.spec.mg,3)} mg`).join(" + ")}
function formatDoseContext(dose,drugId=current){
  const parts=formatParts(dose.parts||[]),meal=mealForDose(dose.time,drugId);
  if(!meal)return parts;
  const food=FOOD_INFO[drugId]?.fed,mealType=meal.mealType==="highFat"&&food?.highFat?"高脂餐":"普通餐";
  return [parts,`${meal.time>Date.now()?"计划":"记录"}用餐 ${dateText(meal.time)}（${mealType}）· ${food?"已计餐后吸收":"缺少本药数值修正"}`].filter(Boolean).join(" · ");
}
function renderPillHint(){
  const el=$("dosePillHint");if(!el)return;const strengths=getStrengths(current),amount=Number($("doseAmount").value)*($("doseUnit").value==="g"?1000:1);
  if(!strengths.length){el.textContent="保存药盒规格后，这里会核对能否由完整单位组成。";return}
  if(!(amount>0)){el.textContent="输入剂量后核对完整单位。";return}
  const option=nearestWholeDose(amount,wholeDoseOptions(strengths),amount);el.textContent=option&&Math.abs(option.mg-amount)<.0005?`${fmt(amount,3)} mg 可由 ${formatParts(option.parts)} 组成（仅算术核对）。`:`${fmt(amount,3)} mg 无法由已保存规格的完整单位精确组成；请核对药盒与处方。`;
}
function renderStrengthList(){
  const drugId=$("planDrug").value||current,list=$("planStrengthList"),strengths=getStrengths(drugId);list.replaceChildren();
  if(!strengths.length){const p=document.createElement("p");p.className="hint";p.textContent="此药尚未保存规格；持续时长反算暂不输出剂量。";list.append(p);return}
  for(const spec of strengths){const item=document.createElement("div");item.className="spec-item";const label=document.createElement("div"),strong=document.createElement("strong"),small=document.createElement("small");strong.textContent=`${fmt(spec.mg,3)} mg / ${spec.unit}`;small.textContent=spec.label||"完整单位";label.append(strong,small);const del=document.createElement("button");del.type="button";del.className="ghost";del.textContent="删除";del.setAttribute("aria-label",`删除 ${fmt(spec.mg,3)} mg 每${spec.unit}规格`);del.onclick=()=>{if(!confirm(`确定删除 ${fmt(spec.mg,3)} mg / ${spec.unit} 的已存规格？`))return;const p=ensurePlan(drugId);p.strengths=p.strengths.filter(x=>x.id!==spec.id);persist();renderStrengthList();renderPlan();renderPillHint();renderInverse();if(drugId===current){appliedPointScenario=null;renderPointInverse();drawChart()}};item.append(label,del);list.append(item)}
}
function loadPlanForCurrent(){const drugId=$("planDrug").value||current,p=plans[drugId]||{},strengths=getStrengths(drugId);$("planDose").value=p.dose??"";$("planStrength").value="";$("planStrengthLabel").value="";$("planInterval").value=p.interval??"";$("planLastTime").value=p.lastTime??"";$("planStored").textContent=strengths.length?`已存 ${strengths.length} 种规格 · 账号同步`:"尚未保存规格";renderStrengthList();renderPlan();renderPillHint()}
function effectiveHalfLife(drug){return drug.recordOnly?0:drug.id==="pregabalin"&&renal?drug.halfLife*100/renal.crcl:drug.halfLife}
function renderRenal(){
  $("renalCrCl").value=renal?String(Number(renal.crcl.toFixed(3))):"";
  $("renalStatus").textContent=renal?`已保存 CrCl ${fmt(renal.crcl,2)} mL/min（${renal.source==="estimated"?"公式估算":"直接填写"}）；普瑞巴林模型半衰期约 ${fmt(effectiveHalfLife(DRUGS.find(d=>d.id==="pregabalin")),2)} 小时。历史记录按同一参数重算。${current!=="pregabalin"?"当前所选药物仍用标准模型。":""}`:"尚未设置个人 CrCl，使用标准模型。";
}
const DRUG_SAFETY={
  amoxicillin:{common:"腹泻、皮疹、恶心、呕吐；严重过敏反应也可能发生。",overdose:"过量时可出现胃肠道症状；说明书报告过结晶尿，部分病例伴肾功能损害。",url:"https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=4fb7837e-964c-4d38-a3a5-b384b1bd6e08&type=display"},
  acetaminophen:{common:"通常耐受性较好；仍可能出现皮疹等不良反应。其他复方制剂也可能含本成分。",overdose:"超过推荐量可能造成严重肝损伤，早期症状不能用来排除风险。",upperDay:4000,url:"https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=7c342ae6-5de6-5c2f-e053-2a91aa0a3f0d"},
  ibuprofen:{common:"胃痛、恶心、消化不良、头晕或皮疹；也可能发生胃肠出血和肾功能问题。",overdose:"过量报告包括腹痛、恶心、呕吐、嗜睡；严重程度随剂量、时间与个体状况变化。",url:"https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=758eeb45-e599-4c1a-969d-8fa33f27bf14"},
  cetirizine:{common:"嗜睡、疲劳、口干等；与其他致困药物合用可能更明显。",overdose:"过量病例报告嗜睡，也可能出现烦躁或不安；表现因人而异。",upperDay:10,url:"https://dailymed.nlm.nih.gov/dailymed/getFile.cfm?setid=efabbad5-a162-45c8-a896-5af58e5d2d39&type=pdf"},
  pregabalin:{common:"头晕、嗜睡、口干、水肿、视物模糊及注意力下降；与酒精或其他中枢抑制剂合用风险增加。",overdose:"过量报告包括意识降低、精神状态改变、激越与不安；与其他抑制剂合用可能更危险。肾功能降低时需个体化核对。",upperDay:600,url:"https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=4db38263-899a-8405-e063-6294a90a4408"},
  prep_ftc_taf:{common:"PrEP 试验中较常见的是腹泻，也报告恶心、头痛、乏力和腹痛。",overdose:"说明书称复方过量的人体资料不足，不能根据剂量推断特定症状；若为真实误服，应及时联系专业人员。",upperDay:225,url:"https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=06f66e98-e6ee-4538-9506-6c1282cc14c1"}
};
function renderDrug(){
  referencePending=false;$("referenceConfirm").classList.remove("pending");
  const d=chosen();
  const saved=referenceMemory[current];
  $("threshold").value=saved?.mode==="blood"?String(saved.value):"";
  $("thresholdEquivalent").value=saved?.mode==="equivalent"?String(saved.value):"";
  $("referenceStatus").textContent=saved?`已应用 ${fmt(saved.value,3)} ${saved.mode==="equivalent"?"mg（等效）":"mg/L"}`:"尚未设置参考值";
  $("threshold").disabled=!!d.recordOnly;$("thresholdEquivalent").disabled=!!d.recordOnly;
  $("referenceConfirm").disabled=!!d.recordOnly;if(d.recordOnly)$("referenceStatus").textContent="复方没有单一参考浓度";
  restoreInverseInputs();
  $("calcDrug").value=current;
  $("planDrug").value=current;
  setDoseEditor(unitByDrug[current]||"mg",d.defaultDose);
  if(d.recordOnly){
    const dayMg=records.filter(r=>r.drug===d.id&&dateKey(r.time)===selectedDate&&!isJournalReview(r)).reduce((sum,r)=>sum+r.mg,0);
    const warning=dayMg>225?`所选日期记录合计 ${fmt(dayMg,0)} mg（复方标示含量），超过该药盒一日一片的参考方案。请核对真实记录与处方。`:"";
    $("drugSafetyAlert").textContent=warning;$("drugSafetyAlert").hidden=!warning;
    $("drugInfo").innerHTML=`<div class="kind">${d.kind}</div><h3>${d.en}</h3><p>药盒：${d.form}</p><div class="numbers"><span>各成分达峰<b>FTC 约 3 h · TAF 约 1 h</b></span><span>各成分血浆半衰期<b>FTC 约 10 h · TAF 约 0.51 h</b></span></div><p>${d.note}</p><div class="drug-safety"><strong>可能的不良反应</strong><p>${DRUG_SAFETY[d.id].common}</p><strong>过量相关风险</strong><p>${DRUG_SAFETY[d.id].overdose}</p>${dayMg>225?`<p class="dose-warning">所选日期记录合计 ${fmt(dayMg,0)} mg（复方标示含量），超过该 PrEP 药盒说明书的一日一片方案。仅为数值核对；如为真实服用请向医师或药师核实。</p>`:""}<a href="${d.url}" target="_blank" rel="noopener noreferrer">查看官方说明书 ↗</a></div>`;
    $("doseLimit").textContent="此复方以每片 FTC 200 mg + TAF 25 mg 记录；输入 225 mg 表示一片的标示含量之和，不代表血药浓度。";
    $("peakTime").textContent="FTC 3 h / TAF 1 h";$("halfLife").textContent="FTC 10 h / TAF 0.51 h";$("chartTitle").textContent="FTC/TAF · 服用记录";
    $("sourceList").innerHTML=`<div class="source-row"><strong>FTC/TAF 复方</strong><span>每片 FTC 200 mg + TAF 25 mg；高脂餐对两成分的影响不同。本站不提供复方单一浓度曲线或反算。</span><a href="${d.url}" target="_blank" rel="noopener noreferrer">查看 DailyMed 药代与安全资料 ↗</a></div><div class="source-row"><strong>PrEP 适用范围</strong><span>需核对 HIV 状态和肾功能；FTC/TAF 的预防适用人群有限制。</span><a href="https://www.cdc.gov/hivnexus/hcp/prep/" target="_blank" rel="noopener noreferrer">查看 CDC 指南 ↗</a></div>`;
    renderRenal();renderFoodEvidence();loadPlanForCurrent();syncRestoreEditor();render();return;
  }
  const personal=d.id==="pregabalin"&&renal,peak=personal?unfedModelPeak(d):null;
  const safety=DRUG_SAFETY[d.id],dayRows=records.filter(r=>r.drug===d.id&&dateKey(r.time)===selectedDate&&!isJournalReview(r)),dayMg=dayRows.reduce((sum,r)=>sum+r.mg,0),savedDose=Number(plans[d.id]?.dose),exceedsPrescription=savedDose>0&&dayRows.some(r=>r.mg>savedDose+1e-6),exceedsLabel=safety?.upperDay&&dayMg>safety.upperDay;
  const warning=exceedsPrescription||exceedsLabel?`所选日期记录${exceedsPrescription?"有单次量超过已保存处方":""}${exceedsPrescription&&exceedsLabel?"，且":""}${exceedsLabel?`累计 ${fmt(dayMg,1)} mg 高于该说明书参考的 ${fmt(safety.upperDay,0)} mg/日上限`:""}。仅供核对，不能据此诊断；请核实真实记录与处方。`:"";
  $("drugSafetyAlert").textContent=warning;$("drugSafetyAlert").hidden=!warning;
  $("drugInfo").innerHTML=`<div class="kind">${d.kind}</div><h3>${d.en}</h3><p>参考剂型：${d.form}</p><div class="numbers"><span>达峰时间<b>${d.tmaxRange}</b></span><span>半衰期<b>${fmt(d.halfLife)} 小时（文献参考）</b></span></div><p>文献峰值：${d.cmaxRange}</p><p>${d.note}</p>${personal?`<p>当前 CrCl ${fmt(renal.crcl,2)} mL/min；个人情景半衰期约 ${fmt(effectiveHalfLife(d),2)} 小时。</p>`:""}${safety?`<div class="drug-safety"><strong>可能的不良反应</strong><p>${safety.common}</p><strong>过量相关风险</strong><p>${safety.overdose}</p>${exceedsPrescription||exceedsLabel?`<p class="dose-warning">所选日期记录${exceedsPrescription?"有单次量超过已保存处方":""}${exceedsPrescription&&exceedsLabel?"，且":""}${exceedsLabel?`累计 ${fmt(dayMg,1)} mg 超过此说明书参考的 ${fmt(safety.upperDay,0)} mg/日上限`:""}。这仅是数值核对，不等于诊断过量；如为真实服用，请联系医师或药师核实。</p>`:""}<a href="${safety.url}" target="_blank" rel="noopener noreferrer">查看说明书的不良反应与过量章节 ↗</a></div>`:""}`;
  $("peakTime").textContent=personal?`${fmt(peak.time,2)} h（模型）`:d.id==="amoxicillin"?"1–2 h":`${fmt(d.tmax)} h`;
  $("halfLife").textContent=`${fmt(effectiveHalfLife(d),2)} h${personal?"（模型）":""}`;
  $("chartTitle").textContent=`${d.name} · 估算血药浓度`;
  const food=FOOD_INFO[d.id];
  $("sourceList").innerHTML=`<div class="source-row"><strong>${d.name}</strong><span>${d.form} · Cmax ${d.cmaxRange} · Tmax ${d.tmaxRange} · t½ ${fmt(d.halfLife)} h</span><a href="${d.url}" target="_blank" rel="noopener noreferrer">查看 ${d.source} ↗</a></div>${d.cmaxUrl?`<div class="source-row"><strong>模型校准</strong><span>达峰范围来自多研究汇总；绝对峰值来自另一项 22 人单剂量研究，未做同一人群联合拟合。</span><a href="${d.tmaxUrl}" target="_blank" rel="noopener noreferrer">达峰研究 ↗</a><a href="${d.cmaxUrl}" target="_blank" rel="noopener noreferrer">峰值研究 ↗</a></div>`:""}<div class="source-row"><strong>饮食影响</strong><span>${food.summary}</span><a href="${food.url}" target="_blank" rel="noopener noreferrer">查看 ${food.source} ↗</a></div>`;
  renderRenal();renderFoodEvidence();
  loadPlanForCurrent();syncRestoreEditor();render();
}
function editAdoptedNode(plan,index){
  if(!plan||!Array.isArray(plan.doses)||!plan.doses[index])return;
  const dose=plan.doses[index];
  if(current!==plan.drug){current=plan.drug;$("drug").value=current;$("calcDrug").value=current;renderDrug()}
  editingDoseId="";editingScheduledId="";editingAdoptedAdjustmentIndex=null;editingAdoptedIndex=index;
  selectedDate=dateKey(dose.time);selectedDateFollowsToday=selectedDate===dateKey(Date.now());
  $("doseTime").value=localInput(dose.time);setDoseEditor("mg",dose.mg);timeTouched=true;
  $("doseCancel").hidden=false;$("doseDelete").hidden=false;doseSaveHint();
  if(document.body.classList.contains("app-mode"))appOpenSheet("dose",{editing:true});
  else{setMobilePane("records");$("doseForm").scrollIntoView({behavior:"smooth",block:"center"})}
}
function editAdoptedAdjustmentNode(plan,index){
  const dose=plan?.adjustment?.doses?.[index];if(!dose)return;
  if(current!==plan.drug){current=plan.drug;$("drug").value=current;$("calcDrug").value=current;renderDrug()}
  editingDoseId="";editingScheduledId="";editingAdoptedIndex=null;editingAdoptedAdjustmentIndex=index;
  selectedDate=dateKey(dose.time);selectedDateFollowsToday=selectedDate===dateKey(Date.now());
  $("doseTime").value=localInput(dose.time);setDoseEditor("mg",dose.mg);timeTouched=true;
  $("doseCancel").hidden=false;$("doseDelete").hidden=false;doseSaveHint();
  if(document.body.classList.contains("app-mode"))appOpenSheet("dose",{editing:true});
  else{setMobilePane("records");$("doseForm").scrollIntoView({behavior:"smooth",block:"center"})}
}
function updateAdoptedAdjustmentNodeFromEditor(index,time,mg){
  const plan=adoptedPlan();if(!plan?.adjustment?.doses?.[index])return false;
  if(time>plan.target){alert("调整节点晚于方案目标时刻，请调整后重试。");return false}
  plan.adjustment.doses[index]={...plan.adjustment.doses[index],time,mg};
  delete plan.adjustment.doses[index].parts;
  plan.adjustment.doses.sort((a,b)=>a.time-b.time);
  plan.adjustment.adoptedAt=Date.now();persist();renderDrug();return true;
}
function deleteAdoptedAdjustmentNodeFromEditor(index){
  const plan=adoptedPlan();if(!plan?.adjustment?.doses?.[index])return false;
  plan.adjustment.doses.splice(index,1);plan.adjustment.adoptedAt=Date.now();
  persist();renderDrug();return true;
}
function updateAdoptedNodeFromEditor(index,time,mg){
  const plan=adoptedPlan();if(!plan||!Array.isArray(plan.doses)||!plan.doses[index])return false;
  if(time>plan.target){alert("修改时间晚于已采用方案的目标时刻，请先调整目标时刻。");return false}
  // Reorder chronological nodes and shift manual record links by original
  // index. The edited node's old link and stale adjustment are invalidated.
  const sorted=plan.doses.map((dose,old)=>({...dose,_old:old}));
  sorted[index]={...sorted[index],time,mg};delete sorted[index].parts;
  sorted.sort((a,b)=>a.time-b.time||a._old-b._old);
  const manual={};
  for(const [pos,node] of sorted.entries()){
    if(node._old!==index&&Object.hasOwn(plan.manualMatches||{},node._old))
      manual[pos]=plan.manualMatches[node._old];
    delete node._old;
  }
  plan.doses=sorted;plan.manualMatches=manual;delete plan.adjustment;
  persist();renderDrug();return true;
}
function deleteAdoptedNodeFromEditor(index){
  const plan=adoptedPlan();if(!plan||!Array.isArray(plan.doses)||!plan.doses[index])return false;
  const next=plan.doses.filter((_,i)=>i!==index);
  const manual={};for(const [key,value] of Object.entries(plan.manualMatches||{})){
    const n=Number(key);if(Number.isInteger(n)&&n!==index)manual[n>index?n-1:n]=value;
  }
  if(!next.length)delete inverseMemory[current].adoptedPointPlan;
  else{plan.doses=next;plan.manualMatches=manual;delete plan.adjustment;}
  persist();renderDrug();return true;
}
function openAdoptedTakenEditor(plan,dose,matched){
  if(matched){editRecord(matched.record.id);return}
  if(current!==plan.drug){current=plan.drug;$("drug").value=current;$("calcDrug").value=current;renderDrug()}
  resetDoseEdit();$("doseTime").value=localInput(dose.time);setDoseEditor("mg",dose.mg);
  timeTouched=true;doseSaveHint();
  if(document.body.classList.contains("app-mode"))appOpenSheet("dose");
  else{setMobilePane("records");$("doseForm").scrollIntoView({behavior:"smooth",block:"center"})}
}
function openAdoptedNotTakenEditor(plan,index,dose,matched){
  if(matched){editRecord(matched.record.id);return}
  const stored=scheduledDoses.find(x=>x.drug===plan.drug&&
    Math.abs(x.time-dose.time)<=60000&&Math.abs(x.mg-dose.mg)<.0001);
  if(stored)editScheduledDose(stored.id);
  else editAdoptedNode(plan,index);
}
function doseSaveHint(){
  const at=new Date($("doseTime")?.value||"").getTime();
  const planning=editingAdoptedIndex!==null||editingAdoptedAdjustmentIndex!==null||!!editingScheduledId||Number.isFinite(at)&&at>Date.now();
  const notice=$("doseFutureNotice");
  if(notice)notice.textContent=(editingAdoptedIndex!==null||editingAdoptedAdjustmentIndex!==null)
    ? "修改已采用方案的计划节点，不登记为实际服用。可用下方删除按钮移除此节点。"
    : planning
    ? "计划服用：仅保存为预计节点，参加虚线预测和反算条件。不计为实际服用，过期也不会自动完成。"
    : "已服用记录：所选时间为过去或现在，保存后将参加真实记录的数学曲线。";
  const button=$("doseSubmit");if(button)button.textContent=(editingAdoptedIndex!==null||editingAdoptedAdjustmentIndex!==null)?"保存已采用节点修改":planning?"保存计划服用":"保存实际服用";
}
function renderScheduledDoses(){
  const box=$("scheduledDoseList");if(!box)return;
  box.replaceChildren();
  const rows=scheduledDoses.filter(r=>dateKey(r.time)===selectedDate).sort((a,b)=>a.time-b.time);
  if(!rows.length){const empty=document.createElement("p");empty.className="hint";empty.textContent="本日没有计划服用；其他日期的计划可通过日期选择查看。";box.append(empty);return}
  for(const dose of rows){
    const el=document.createElement("div");el.className="record planned-dose-item";
    const info=document.createElement("div"),name=DRUGS.find(x=>x.id===dose.drug)?.name||dose.drug;
    const strong=document.createElement("strong");strong.textContent=`${name} · ${fmt(dose.mg,3)} mg · 计划`;
    const detail=document.createElement("small");detail.textContent=`${fullDate(dose.time)} · ${dose.time<=Date.now()?"计划已到时，尚未确认":"尚未发生"} · 不计入真实记录`;
    info.append(strong,detail);const controls=document.createElement("div");controls.className="record-actions";
    const edit=document.createElement("button");edit.type="button";edit.textContent="编辑";edit.onclick=()=>editScheduledDose(dose.id);controls.append(edit);
    if(dose.time<=Date.now()){
      const done=document.createElement("button");done.type="button";done.textContent="确认已服用";
      done.onclick=()=>confirmScheduledTaken(dose.id);controls.append(done)
    }
    const del=document.createElement("button");del.type="button";del.textContent="删除";
    del.onclick=()=>{if(!confirm("删除此条计划服用？不会修改已有实际记录。"))return;
      scheduledDoses=scheduledDoses.filter(d=>d.id!==dose.id);if(editingScheduledId===dose.id)resetDoseEdit();persist();renderDrug()};
    controls.append(del);el.append(info,controls);box.append(el);
  }
}
function editScheduledDose(id){
  const entry=scheduledDoses.find(d=>d.id===id);if(!entry)return;
  if(current!==entry.drug){current=entry.drug;$("drug").value=current;$("calcDrug").value=current;renderDrug()}
  selectedDate=dateKey(entry.time);selectedDateFollowsToday=selectedDate===dateKey(Date.now());
  editingDoseId="";editingAdoptedIndex=null;editingAdoptedAdjustmentIndex=null;editingScheduledId=id;$("doseTime").value=localInput(entry.time);
  setDoseEditor(entry.unit==="g"?"g":"mg",entry.mg);
  $("doseCancel").hidden=false;$("doseDelete").hidden=false;doseSaveHint();
  if(document.body.classList.contains("app-mode"))appOpenSheet("dose",{editing:true});
  else{$("doseForm").scrollIntoView({behavior:"smooth",block:"center"})}
}
function confirmScheduledTaken(id){
  const dose=scheduledDoses.find(d=>d.id===id);if(!dose||dose.time>Date.now())return;
  const duplicate=records.find(r=>r.drug===dose.drug&&Math.abs(r.time-dose.time)<=300000&&Math.abs(r.mg-dose.mg)<.0001);
  if(duplicate){alert("已有同药同剂量且时间相近的实际记录；请先核对，不自动产生第二次服用。");return}
  if(!confirm("确认已经实际服用这一笔计划剂量？确认后才会把该笔转入真实模型；请核对药物、时间与剂量。"))return;
  records.push({id:dose.id,drug:dose.drug,mg:dose.mg,time:dose.time,unit:dose.unit,courseId:`day-${dateKey(dose.time)}`,source:"confirmed-plan"});
  scheduledDoses=scheduledDoses.filter(d=>d.id!==id);if(editingScheduledId===id)resetDoseEdit();
  persist();renderDrug();
}
function renderRecords(){
  const box=$("recordList"),summary=$("dayRecordSummary"),rows=records.filter(r=>dateKey(r.time)===selectedDate).sort((a,b)=>a.time-b.time),totals=dayDrugTotals(rows);
  box.replaceChildren();summary.replaceChildren();
  if(!rows.length){summary.textContent="当天没有已记录的服用。";return}
  const confirmed=rows.filter(r=>!isJournalReview(r)),pending=rows.filter(r=>r.journal?.reviewStatus==="possibleDuplicate"),duplicate=rows.filter(r=>r.journal?.reviewStatus==="duplicate");
  const title=document.createElement("strong");title.textContent=`当天共 ${confirmed.length} 次服用 · ${totals.length} 种药物`;summary.append(title);
  for(const total of totals){const item=document.createElement("span");item.textContent=`${total.name} ${total.count} 次 · ${fmt(total.mg,3)} mg`;summary.append(item)}
  if(pending.length||duplicate.length){const item=document.createElement("span");item.textContent=`另有 ${pending.length} 条待核对、${duplicate.length} 条已标重复，不计入曲线和合计`;summary.append(item)}
  rows.forEach(r=>{
    const el=document.createElement("div");el.className="record";
    const info=document.createElement("div"),dose=r.unit==="g"?`${fmt(r.mg/1000,4)} g`:`${fmt(r.mg)} mg`;
    const strong=document.createElement("strong");strong.textContent=`${recordDrugName(r)} · ${dose}`;
    const small=document.createElement("small"),matched=mealForDose(r.time,r.drug),food=FOOD_INFO[r.drug];small.textContent=`${dateText(r.time)}${matched&&food?food.fed?` · ${matched.mealType==="highFat"&&r.drug==="pregabalin"?"高脂餐":"普通餐"}模型`:" · 已记录用餐，缺少本药数值修正":""}`;
    if(r.source==="ios-journal-17.1")small.textContent+=` · iOS Journal 17.1${r.journal?.isDoseAnEstimate?` · 剂量为原 App 估算${Number.isFinite(r.journal.estimatedDoseStandardDeviation)?`（标准差 ${fmt(r.journal.estimatedDoseStandardDeviation,2)} mg）`:""}`:""}${r.journal?.stomachFullness==="EMPTY"?" · 原 App 标注空腹":""}${r.journal?.editedOnSite?" · 网站已修改":""}${isJournalArchive(r)?isJournalReview(r)?" · 待核对未计入模型":" · 暂无药代模型":""}`;
    if(r.journal?.reviewStatus==="possibleDuplicate")small.textContent+=` · 与网站原记录${Number.isFinite(r.journal.nearExistingTime)?` ${dateText(r.journal.nearExistingTime)}`:""} 同剂量、时间接近；请确认是否独立服用`;
    if(r.journal?.reviewStatus==="duplicate")small.textContent+=" · 已标记重复，未计入统计或模型";
    info.append(strong,small);
    const actions=document.createElement("div");actions.className="record-actions";
    if(r.journal?.reviewStatus==="possibleDuplicate"){
      const confirmSeparate=document.createElement("button");confirmSeparate.type="button";confirmSeparate.textContent="确认独立";confirmSeparate.onclick=()=>{r.drug=r.journal.targetDrug;r.journal={...r.journal,reviewStatus:"confirmed",reviewedAt:Date.now()};persist();renderDrug()};actions.append(confirmSeparate);
      const markDuplicate=document.createElement("button");markDuplicate.type="button";markDuplicate.textContent="标为重复";markDuplicate.onclick=()=>{r.journal={...r.journal,reviewStatus:"duplicate",reviewedAt:Date.now()};persist();renderDrug()};actions.append(markDuplicate);
    }else if(r.journal?.reviewStatus==="duplicate"){
      const reopen=document.createElement("button");reopen.type="button";reopen.textContent="重新核对";reopen.onclick=()=>{r.journal={...r.journal,reviewStatus:"possibleDuplicate"};persist();renderDrug()};actions.append(reopen);
    }
    if(DRUGS.some(d=>d.id===r.drug)){const edit=document.createElement("button");edit.type="button";edit.textContent="编辑";edit.setAttribute("aria-label",`修改 ${recordDrugName(r)} ${dose} ${dateText(r.time)} 的服用记录`);edit.onclick=()=>editRecord(r.id);actions.append(edit)}
    const del=document.createElement("button");del.type="button";del.textContent="×";del.setAttribute("aria-label",`删除 ${dose} ${dateText(r.time)} 的服用记录`);
    del.onclick=()=>requestDoseDeletion(r.id);
    actions.append(del);el.append(info,actions);box.append(el);
  });
}
const DRINK_LABELS={none:"未记录饮料",water:"水",coffee:"咖啡",tea:"茶",milk:"牛奶",juice:"果汁",alcohol:"酒精饮料",other:"其他饮料"};
function intakeLabel(x){return x.kind==="meal"?`${x.mealType==="highFat"?"高脂或丰盛餐":"普通用餐"}${x.drink!=="none"?` · ${DRINK_LABELS[x.drink]}`:""}`:`仅饮料 · ${DRINK_LABELS[x.drink]}`}
function renderIntakes(){
  const box=$("intakeList");box.replaceChildren();
  const rows=intakes.filter(x=>dateKey(x.time)===selectedDate).sort((a,b)=>a.time-b.time);
  if(!rows.length){const p=document.createElement("p");p.className="hint";p.textContent="这一天还没有饮食记录；模型不会加入用餐修正。";box.append(p);return}
  for(const x of rows){const item=document.createElement("div");item.className="record intake-record";const info=document.createElement("div"),strong=document.createElement("strong"),small=document.createElement("small");strong.textContent=intakeLabel(x);small.textContent=`${fullDate(x.time)}${x.note?` · ${x.note}`:""}`;info.append(strong,small);
    const actions=document.createElement("div");actions.className="record-actions";const edit=document.createElement("button");edit.type="button";edit.textContent="编辑";edit.setAttribute("aria-label",`修改 ${fullDate(x.time)} 的饮食记录`);edit.onclick=()=>editIntake(x.id);
    const del=document.createElement("button");del.type="button";del.textContent="×";del.setAttribute("aria-label",`删除 ${fullDate(x.time)} 的饮食记录`);del.onclick=()=>requestIntakeDeletion(x.id);actions.append(edit,del);item.append(info,actions);box.append(item)}
}
function renderFoodEvidence(){
  const box=$("foodEvidence");box.replaceChildren();
  for(const d of DRUGS){const info=FOOD_INFO[d.id],article=document.createElement("article"),title=document.createElement("strong"),meal=document.createElement("p"),drink=document.createElement("p"),half=document.createElement("p"),link=document.createElement("a"),drinkLink=document.createElement("a");title.textContent=d.name;meal.textContent=`用餐：${info.summary}${info.mealWindowNote?` ${info.mealWindowNote}`:""}`;drink.textContent=`饮料：${info.drink}`;half.textContent=d.recordOnly?"两成分药代参数分别列示；本站不把两种成分合并成单一半衰期。":`消除半衰期：模型用 ${fmt(effectiveHalfLife(d),2)} 小时${d.id==="pregabalin"&&renal?"（个人 CrCl 情景）":""}；一次用餐或饮料记录不会改写清除率。`;link.href=info.url;link.target="_blank";link.rel="noopener noreferrer";link.textContent=`${info.source} ↗`;drinkLink.href=info.drinkUrl;drinkLink.target="_blank";drinkLink.rel="noopener noreferrer";drinkLink.textContent="饮料相关来源 ↗";article.append(title,meal,drink,half,link);if(info.mealWindowUrl){const windowLink=document.createElement("a");windowLink.href=info.mealWindowUrl;windowLink.target="_blank";windowLink.rel="noopener noreferrer";windowLink.textContent="餐后时间研究 ↗";article.append(document.createTextNode(" · "),windowLink)}if(info.drinkUrl){article.append(document.createTextNode(" · "),drinkLink)}box.append(article)}
}
function fedModelPeak(drug,mealType="regular"){
  let best={time:0,level:0};for(let minutes=0;minutes<=12*60;minutes++){const hours=minutes/60,p=modelParams(drug),parts=mealType==="highFat"&&p.fedHighFat.length?p.fedHighFat:p.fed,level=drug.refDose*p.fOverV*parts.reduce((sum,part)=>sum+part.weight*oralKernel(part.ka,p.ke,hours),0);if(level>best.level)best={time:hours,level}}return best;
}
function unfedModelPeak(drug){
  let best={time:0,level:0};for(let minutes=0;minutes<=12*60;minutes++){const hours=minutes/60,level=singleConcentration(drug,drug.refDose,hours,null,false);if(level>best.level)best={time:hours,level}}return best;
}
function renderMealImpact(){
  if(chosen().recordOnly){$("mealImpact").textContent=`${chosen().name}：用餐记录已保存；FTC 与 TAF 的高脂餐药代影响不同，本站暂不绘制复方餐后曲线。`;return}
  const box=$("mealImpact"),drug=chosen(),info=FOOD_INFO[drug.id],start=dayStart(selectedDate),dayRows=records.filter(r=>r.drug===current&&dateKey(r.time)===selectedDate),matched=dayRows.map(r=>({row:r,meal:mealForDose(r.time,drug.id)})).filter(x=>x.meal),carried=records.filter(r=>r.drug===current&&r.time<start&&r.time>=start-30*effectiveHalfLife(drug)*3600000&&mealForDose(r.time,drug.id)&&(concentration(drug,start,[r])>=.001||totalEquivalent(drug,start,[r])>=.1)),dayIntakes=intakes.filter(x=>dateKey(x.time)===selectedDate);box.replaceChildren();
  const title=document.createElement("strong"),summary=document.createElement("p"),half=document.createElement("p");title.textContent=`${drug.name} · 饮食与模型`;
  summary.textContent=!intakes.some(x=>x.kind==="meal")?"未添加用餐记录：沿用原有空腹参考曲线。":!matched.length?(carried.length?"所选日期没有新服用匹配到用餐；此前随餐服用的同药残留仍按适用的餐后模型参与曲线与反算。":"所选日期的已记服用未匹配到用餐；模型暂按原吸收曲线计算。"):info.fed?`${matched.length} 次服用匹配到用餐；已按餐后吸收模型重算本药曲线、残留与反算。${info.summary}`:`${matched.length} 次服用匹配到用餐；${info.summary}`;
  half.textContent=`半衰期模型用 ${fmt(effectiveHalfLife(drug),2)} 小时${drug.id==="pregabalin"&&renal?"（个人 CrCl 情景）":""}。用餐记录只可能改变有文献依据的吸收形状，不推断消除半衰期改变。`;box.append(title,summary,half);
  const futureMeals=dayIntakes.filter(x=>x.kind==="meal"&&x.time>Date.now());
  if(futureMeals.length){const planned=document.createElement("p");planned.textContent=`已录入 ${futureMeals.length} 条未来用餐情景。模型将用餐前 15 分钟至用餐后 ${mealBeforeDoseMinutes(drug.id)} 分钟内的服用节点与用餐匹配；窗口末端不是已测得的消化完成时间。${info.fed?`${drug.name}匹配后会在曲线及两种反算中采用对应的餐后吸收形状。`:`${drug.name}缺少可套用的餐后数值，记录用餐不会改写该药曲线或反算。`}已吸收的既往服用不会因未来用餐而重算为餐后服用。`;box.append(planned)}
  const unmatchedMeals=dayIntakes.filter(meal=>meal.kind==="meal"&&!records.some(row=>row.drug===drug.id&&mealForDose(row.time,drug.id)?.id===meal.id));
  for(const meal of unmatchedMeals){const note=document.createElement("p");note.textContent=unmatchedMealMessage(meal,drug.id,records);box.append(note)}
  if(matched.length){const list=document.createElement("ul");for(const {row,meal} of matched){const item=document.createElement("li");item.textContent=`${dateText(row.time)} 服用 ${fmt(row.mg,3)} mg ↔ ${dateText(meal.time)} ${intakeLabel(meal)}`;list.append(item)}box.append(list)}
  if(carried.length){const note=document.createElement("p");note.textContent=`另有 ${carried.length} 次此前随餐服用的同药模型残留进入所选日期；当天曲线与反算已按各次用餐条件累计。`;box.append(note)}
  if(matched.length&&info.fed){const unfed=unfedModelPeak(drug),types=[...new Set(matched.map(x=>x.meal.mealType))];for(const type of types){const peak=fedModelPeak(drug,type),variant=type==="highFat"&&info.fed.highFat?info.fed.highFat:info.fed,detail=document.createElement("p");detail.textContent=`参考剂量 ${fmt(drug.refDose)} mg · ${type==="highFat"&&info.fed.highFat?"高脂餐":"普通餐"}：空腹模型峰值约 ${fmt(unfed.level,3)} mg/L、达峰 ${fmt(unfed.time,2)} 小时；餐后模型约 ${fmt(peak.level,3)} mg/L、达峰 ${fmt(peak.time,2)} 小时，峰值比约 ${fmt(100*peak.level/unfed.level,1)}%、AUC 比约 ${fmt(100*(variant.aucRatio??1),1)}%。研究观察：${variant.observedPeak}、${variant.observedTmax}。`;box.append(detail)}}
  const dayDrinks=dayIntakes.filter(x=>x.drink!=="none");
  if(dayDrinks.length){const notice=document.createElement("p"),names=[...new Set(dayDrinks.map(x=>DRINK_LABELS[x.drink]))].join("、"),specific=dayDrinks.some(x=>x.drink==="alcohol")&&["ibuprofen","cetirizine","pregabalin"].includes(drug.id)||dayDrinks.some(x=>x.drink==="coffee")&&drug.id==="acetaminophen";notice.textContent=`已记录${names}。${specific?info.drink:"目前没有可直接套用的本药饮料药代参数。"}饮料记录未改写血药曲线或半衰期。`;box.append(notice)}
}
const DRUG_COLORS={amoxicillin:"#d1a579",acetaminophen:"#7bb6ff",ibuprofen:"#a7d17b",cetirizine:"#c99bdb",pregabalin:"#ff9d8d"};
function dayDrugTotals(rows){
  const totals=new Map();
  for(const row of rows){if(isJournalReview(row))continue;const item=totals.get(row.drug)||{drug:row.drug,name:recordDrugName(row),count:0,mg:0};item.count++;item.mg+=row.mg;totals.set(row.drug,item)}
  return [...totals.values()].sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,"zh-CN"));
}
function daySeries(drug,key){
  const start=dayStart(key),end=dayEnd(key),rows=records.filter(r=>r.drug===drug.id&&r.time<end&&r.time>=start-30*effectiveHalfLife(drug)*3600000),points=[];
  for(let i=0;i<=96;i++){const t=start+(end-start)*i/96;points.push({t,c:concentration(drug,t,rows),unfed:concentration(drug,t,rows,false),eq:totalEquivalent(drug,t,rows)})}
  const max=Math.max(.001,...points.map(p=>Math.max(p.c,p.unfed)));
  return{drug,rows,points,doses:rows.filter(r=>dateKey(r.time)===key),hasFoodEffect:points.some(p=>Math.abs(p.c-p.unfed)>max*.001)};
}
function drawDaySvg(svg,series,shared=false){
  const W=Math.max(320,Math.round(svg.getBoundingClientRect().width||svg.parentElement?.clientWidth||800)),H=Math.max(170,Math.round(svg.getBoundingClientRect().height||220)),L=48,R=18,T=16,B=34,max=Math.max(.001,...series.flatMap(s=>s.points.flatMap(p=>s.hasFoodEffect&&!shared?[p.c,p.unfed]:[p.c])))*1.12;
  svg.setAttribute("viewBox",`0 0 ${W} ${H}`);svg.replaceChildren();
  const x=i=>L+i/96*(W-L-R),y=c=>H-B-c/max*(H-T-B);
  for(let n=0;n<=3;n++){const yy=T+(H-T-B)*n/3;svg.append(svgEl("line",{x1:L,y1:yy,x2:W-R,y2:yy,stroke:"#323b46","stroke-width":1}));const t=svgEl("text",{x:L-7,y:yy+4,"text-anchor":"end",fill:"#a9b8c8","font-size":12});t.textContent=fmt(max*(1-n/3),max<1?3:1);svg.append(t)}
  for(let h=0;h<=24;h+=4){const tx=L+h/24*(W-L-R),t=svgEl("text",{x:tx,y:H-8,"text-anchor":h===0?"start":h===24?"end":"middle",fill:"#a9b8c8","font-size":11});t.textContent=`${String(h).padStart(2,"0")}:00`;svg.append(t)}
  for(const s of series){if(s.hasFoodEffect&&!shared){const unfed=s.points.map((p,i)=>`${i?"L":"M"}${x(i).toFixed(1)} ${y(p.unfed).toFixed(1)}`).join(" ");svg.append(svgEl("path",{d:unfed,fill:"none",stroke:"#aab2bc","stroke-width":2,"stroke-dasharray":"5 5"}))}const path=s.points.map((p,i)=>`${i?"L":"M"}${x(i).toFixed(1)} ${y(p.c).toFixed(1)}`).join(" ");svg.append(svgEl("path",{d:path,fill:"none",stroke:DRUG_COLORS[s.drug.id],"stroke-width":shared?2.5:3,"stroke-linejoin":"round","stroke-linecap":"round"}));for(const dose of s.doses){const tx=L+(dose.time-dayStart(selectedDate))/(dayEnd(selectedDate)-dayStart(selectedDate))*(W-L-R);svg.append(svgEl("line",{x1:tx,y1:T,x2:tx,y2:H-B,stroke:DRUG_COLORS[s.drug.id],"stroke-width":1,"stroke-dasharray":"3 5","stroke-opacity":.55}));svg.append(svgEl("circle",{cx:tx,cy:y(0),r:3,fill:DRUG_COLORS[s.drug.id]}))}}
}
function renderDay(){
  $("viewDate").value=selectedDate;
  const coursesBox=$("dayCourseList"),charts=$("dayCharts"),summary=$("daySummary");
  coursesBox.replaceChildren();charts.replaceChildren();summary.replaceChildren();
  const today=records.filter(r=>dateKey(r.time)===selectedDate),confirmedToday=today.filter(r=>!isJournalReview(r)),pendingToday=today.filter(r=>r.journal?.reviewStatus==="possibleDuplicate"),totals=dayDrugTotals(today);
  if(confirmedToday.length){
    const headline=document.createElement("div"),count=document.createElement("strong"),label=document.createElement("span");
    count.textContent=`${confirmedToday.length} 次服用`;label.textContent=`${totals.length} 种药物 · 所选日期总计`;
    headline.append(count,label);summary.append(headline);
    const byDrug=document.createElement("div");byDrug.className="day-summary-drugs";
    for(const total of totals){const item=document.createElement("span");item.textContent=`${total.name} · ${total.count} 次 · ${fmt(total.mg,3)} mg`;byDrug.append(item)}
    summary.append(byDrug);
  }else{const empty=document.createElement("strong");empty.textContent="当天没有已确认服用";summary.append(empty)}
  if(pendingToday.length){const notice=document.createElement("span");notice.className="day-summary-review";notice.textContent=`另有 ${pendingToday.length} 条导入记录待核对，暂不计入曲线与总数`;summary.append(notice)}
  for(const total of totals){
    const button=document.createElement("button"),strong=document.createElement("strong"),small=document.createElement("small");
    button.type="button";button.className=`day-course${total.drug===current?" active":""}`;
    strong.textContent=total.name;small.textContent=`${total.count} 次 · ${fmt(total.mg,3)} mg${DRUGS.some(d=>d.id===total.drug&&!d.recordOnly)?"":" · 暂无曲线模型"}`;
    button.append(strong,small);
    button.onclick=()=>{if(DRUGS.some(d=>d.id===total.drug)){current=total.drug;$("drug").value=current;renderDrug()}if(document.body.classList.contains("app-mode"))appSetView("chart");else{setMobilePane("records");$("recordSection").scrollIntoView({behavior:"smooth",block:"start"})}};
    coursesBox.append(button);
  }
  const add=document.createElement("button");add.type="button";add.className="secondary day-add";add.textContent="＋ 新增这一天的服用";add.onclick=()=>{if(document.body.classList.contains("app-mode"))appOpenSheet("dose");else{setMobilePane("records");$("doseForm").scrollIntoView({behavior:"smooth",block:"center"});$("doseAmount").focus()}};coursesBox.append(add);
  $("referenceDrugHint").textContent=`当前药物：${chosen().name}`;
  // Do not calculate or draw six extra charts while the optional overview is closed.
  // The disclosure toggle calls renderDay() once, when the user opens it.
  if(!$("dailyChartsGuide").open)return;
  const series=DRUGS.filter(d=>!d.recordOnly).map(d=>daySeries(d,selectedDate)).filter(s=>s.doses.length||s.points.some(p=>p.c>=.001||p.eq>=.1));
  if(series.length>1){
    const card=document.createElement("div");card.className="day-chart-card day-chart-overview";
    const title=document.createElement("h3");title.textContent="所有可建模药物 · 同图分线概览";
    const sub=document.createElement("p");sub.textContent="每条线是对应药物的血药浓度（mg/L），已计入适用的饮食修正；不同药物浓度不能直接相加。";
    const svg=svgEl("svg",{role:"img","aria-label":`${selectedDate} 多药物浓度分线概览`});
    const legend=document.createElement("div");legend.className="day-chart-legend";
    for(const s of series){const item=document.createElement("span"),dot=document.createElement("i");dot.style.borderTopColor=DRUG_COLORS[s.drug.id];item.append(dot,document.createTextNode(`${s.drug.name}血药浓度`));legend.append(item)}
    card.append(title,sub,svg,legend);charts.append(card);drawDaySvg(svg,series,true);
  }
  if(series.length){
    const grid=document.createElement("div");grid.className="day-chart-grid";charts.append(grid);
    for(const s of series){
      const card=document.createElement("div");card.className="day-chart-card";
      const title=document.createElement("h3");title.textContent=s.drug.name;
      const meta=document.createElement("p");meta.textContent=`彩色实线：血药浓度（mg/L）${s.hasFoodEffect?" · 灰色虚线：不计饮食的参考曲线":""} · 已计入此前同药记录`;
      const stats=document.createElement("div");stats.className="day-chart-stats";
      const addStat=(label,value)=>{const item=document.createElement("div"),small=document.createElement("small"),strong=document.createElement("strong");small.textContent=label;strong.textContent=value;item.append(small,strong);stats.append(item)};
      const start=s.points[0],end=s.points.at(-1),doseMg=s.doses.reduce((sum,r)=>sum+r.mg,0);
      addStat("当天已记服用",s.doses.length?`${s.doses.length} 次 · ${fmt(doseMg,3)} mg`:"无新服用 · 仅历史残留");
      addStat("血药浓度 00:00 → 24:00",`${fmt(start.c,3)} → ${fmt(end.c,3)} mg/L`);
      addStat("剂量等效 00:00 → 24:00",`${fmt(start.eq,1)} → ${fmt(end.eq,1)} mg`);
      const svg=svgEl("svg",{role:"img","aria-label":`${selectedDate} ${s.drug.name}估算血药浓度曲线`});
      const button=document.createElement("button");button.type="button";button.className="ghost";button.textContent=`查看${s.drug.name}记录`;button.onclick=()=>{current=s.drug.id;activeCourseId="";$("drug").value=current;renderDrug();if(document.body.classList.contains("app-mode"))appSetView("chart");else{setMobilePane("records");$("recordSection").scrollIntoView({behavior:"smooth",block:"start"})}};
      card.append(title,meta,stats,svg,button);grid.append(card);drawDaySvg(svg,[s]);
    }
  }
  const archived=totals.filter(total=>!DRUGS.some(d=>d.id===total.drug&&!d.recordOnly));
  for(const total of archived){const card=document.createElement("div"),title=document.createElement("h3"),note=document.createElement("p"),button=document.createElement("button");card.className="day-chart-card day-archive-card";title.textContent=`${total.name} · 仅记录`;note.textContent=`当天 ${total.count} 次 · 合计 ${fmt(total.mg,3)} mg。本站暂无该药经核对的药代模型，因此只显示原始记录，不绘制估算曲线。`;button.type="button";button.className="ghost";button.textContent="查看导入记录";button.onclick=()=>{if(document.body.classList.contains("app-mode"))appSetView("history");else{setMobilePane("records");$("recordSection").scrollIntoView({behavior:"smooth",block:"start"})}};card.append(title,note,button);charts.append(card)}
  if(!series.length&&!archived.length){const note=document.createElement("div");note.className="day-empty";note.textContent=pendingToday.length?"待核对的导入记录暂未计入曲线；请在下方记录列表确认。":"这一天以前还没有可计算的服药记录。";charts.append(note)}
}
function renderHistory(){
  const box=$("historyList");box.replaceChildren();
  if(!records.length&&!intakes.length){box.textContent="尚无服用或饮食历史。";return}
  const dates=[...new Set([...records,...intakes].map(r=>dateKey(r.time)))].sort().reverse();
  dates.forEach(key=>{
    const dayRows=records.filter(r=>dateKey(r.time)===key),dayIntakes=intakes.filter(x=>dateKey(x.time)===key);
    const card=document.createElement("button");card.type="button";card.className="history-card";
    const title=document.createElement("strong");title.textContent=key;
    const details=document.createElement("small");details.textContent=`${dayRows.filter(r=>!isJournalReview(r)).length} 次服用${dayRows.some(r=>r.journal?.reviewStatus==="possibleDuplicate")?` · ${dayRows.filter(r=>r.journal?.reviewStatus==="possibleDuplicate").length} 条待核对`:""} · ${dayIntakes.length} 条饮食`;
    const names=document.createElement("span");names.textContent=dayDrugTotals(dayRows).map(x=>x.name).join(" · ")||"无药物记录";
    card.append(title,details,names);
    card.onclick=()=>{selectedDate=key;selectedDateFollowsToday=key===dateKey(Date.now());activeCourseId="";resetDoseEdit();renderDrug();$("viewDate").scrollIntoView({behavior:"smooth",block:"start"})};
    box.append(card);
  });
}
/* ka may be below ke: slow absorption must be searched too. */
function kaFor(tmax,ke){
  if(!(Number.isFinite(tmax)&&tmax>0&&Number.isFinite(ke)&&ke>0))throw new RangeError("invalid model parameters");
  const eq=1/ke;
  if(Math.abs(tmax-eq)<=1e-10*eq)return ke;
  const peak=ka=>{
    const d=(ka-ke)/ke;
    return Math.abs(d)<1e-8?(d===0?1/ke:Math.log1p(d)/(ke*d)):Math.log(ka/ke)/(ka-ke);
  };
  let lo,hi;
  if(tmax>eq){lo=Math.max(ke*1e-12,1e-15);hi=ke;}
  else{lo=ke;hi=Math.max(ke*2,2/tmax);while(peak(hi)>tmax&&hi<1e12)hi*=2;}
  for(let i=0;i<100;i++){const mid=(lo+hi)/2;if(peak(mid)>tmax)lo=mid;else hi=mid;}
  return (lo+hi)/2;
}
/* Numerically stable oral response for ka<ke, ka>ke and ka near ke. */
function oralKernel(ka,ke,hours){
  if(!(hours>0))return 0;
  const delta=ka-ke;
  if(Math.abs(delta)<1e-10*Math.max(1,ka,ke))return ka*hours*Math.exp(-ke*hours);
  if(delta>0)return ka*Math.exp(-ke*hours)*(-Math.expm1(-delta*hours))/delta;
  return ka*Math.exp(-ka*hours)*(-Math.expm1(delta*hours))/(-delta);
}
const MODEL_PARAMS=new Map();
function mealForDose(doseTime,drugId=current){
  if(!Number.isFinite(doseTime))return null;
  const key=`${drugId}:${doseTime}`;
  if(mealMatchCache.has(key))return mealMatchCache.get(key);
  const before=mealBeforeDoseMinutes(drugId),matches=intakes.filter(x=>x.kind==="meal"&&x.time<=doseTime+MEAL_AFTER_DOSE_MINUTES*60000&&x.time>=doseTime-before*60000).sort((a,b)=>Math.abs(a.time-doseTime)-Math.abs(b.time-doseTime));
  const meal=matches[0]||null;mealMatchCache.set(key,meal);return meal;
}
function unmatchedMealMessage(meal,drugId,rows){
  const previous=rows.filter(row=>row.drug===drugId&&row.time<meal.time).reduce((latest,row)=>!latest||row.time>latest.time?row:latest,null);
  const gap=previous?Math.round((meal.time-previous.time)/60000):null;
  return `${dateText(meal.time)} 用餐未匹配到${DRUGS.find(drug=>drug.id===drugId)?.name||"当前药物"}的已记服用。${gap!==null?`最近一次服用在餐前 ${gap} 分钟${gap>MEAL_AFTER_DOSE_MINUTES?`，超过模型允许的服药后 ${MEAL_AFTER_DOSE_MINUTES} 分钟进餐窗口`:"，但与其他用餐记录匹配"}；`:""}餐后 ${mealBeforeDoseMinutes(drugId)} 分钟内也没有与这顿饭匹配的后续同药已记服用。未对先前剂量套用完整餐后曲线；若之后新增窗口内的服用或假设节点，会重新计算。`;
}
function modelParams(drug){
  const halfLife=effectiveHalfLife(drug),key=`${drug.id}:${halfLife}`;
  let p=MODEL_PARAMS.get(key);
  if(!p){
    const baseKe=Math.LN2/drug.halfLife,ke=Math.LN2/halfLife,ka=kaFor(drug.tmax,baseKe);
    // Calibrated to a population reference peak, not patient-specific Vd.
    const fOverV=(drug.cmax/drug.refDose)/oralKernel(ka,baseKe,drug.tmax);
    const makeFed=variant=>variant?.parts.map(part=>({
      ka:kaFor(part.tmax,baseKe),weight:(variant.aucRatio??1)*part.weight
    }))||[];
    const fedConfig=FOOD_INFO[drug.id]?.fed,fed=makeFed(fedConfig),fedHighFat=makeFed(fedConfig?.highFat);
    p={ke,ka,fOverV,fed,fedHighFat};MODEL_PARAMS.set(key,p)
  }
  return p;
}
function singleConcentration(drug,dose,hours,doseTime=null,includeFood=true){
  if(drug.recordOnly)return 0;
  if(hours<0)return 0;
  const p=modelParams(drug);
  if(includeFood&&doseTime!==null&&p.fed.length){const meal=mealForDose(doseTime,drug.id);if(meal){const parts=meal.mealType==="highFat"&&p.fedHighFat.length?p.fedHighFat:p.fed;return dose*p.fOverV*parts.reduce((sum,part)=>sum+part.weight*oralKernel(part.ka,p.ke,hours),0)}}
  return dose*p.fOverV*oralKernel(p.ka,p.ke,hours);
}
function concentration(drug,time,rows,includeFood=true){return rows.reduce((sum,r)=>sum+singleConcentration(drug,r.mg,(time-r.time)/3600000,r.time,includeFood),0)}
const EQUIVALENT_PEAK_CACHE=new Map();
function equivalentPeak(drug,doseTime){
  const meal=FOOD_INFO[drug.id]?.fed?mealForDose(doseTime,drug.id):null;
  const variant=meal?.mealType||"none",key=`${drug.id}:${effectiveHalfLife(drug)}:${variant}`;
  if(EQUIVALENT_PEAK_CACHE.has(key))return EQUIVALENT_PEAK_CACHE.get(key);
  const horizon=Math.min(72,Math.max(12,drug.tmax*8,effectiveHalfLife(drug)*3));
  let best={hours:0,level:0};
  for(let minute=0;minute<=horizon*60;minute+=2){const hours=minute/60,level=singleConcentration(drug,1,hours,doseTime);if(level>best.level)best={hours,level}}
  EQUIVALENT_PEAK_CACHE.set(key,best);return best;
}
function doseEquivalent(drug,dose,time){
  if(drug.recordOnly)return 0;
  const hours=(time-dose.time)/3600000;if(hours<0)return 0;
  const peak=equivalentPeak(drug,dose.time);if(!(peak.level>0))return 0;
  if(hours<=peak.hours)return dose.mg*Math.max(0,singleConcentration(drug,1,hours,dose.time)/peak.level);
  return dose.mg*Math.pow(2,-(hours-peak.hours)/effectiveHalfLife(drug));
}
function totalEquivalent(drug,time,rows){return rows.reduce((sum,row)=>sum+doseEquivalent(drug,row,time),0)}
function referenceSetting(){
  const saved=referenceMemory[current],mode=saved?.mode==="equivalent"?"equivalent":"blood",raw=Number.isFinite(Number(saved?.value))&&Number(saved?.value)>0?String(saved.value):"";
  return{mode,raw,value:raw?Number(raw):null,unit:mode==="equivalent"?"mg（等效）":"mg/L",name:mode==="equivalent"?"剂量等效量":"血药浓度"};
}
function modelValue(drug,time,rows,mode="blood"){return mode==="equivalent"?totalEquivalent(drug,time,rows):concentration(drug,time,rows)}
function doseModelValue(drug,mg,doseTime,time,mode="blood"){return mode==="equivalent"?doseEquivalent(drug,{time:doseTime,mg},time):singleConcentration(drug,mg,(time-doseTime)/3600000,doseTime)}
// Mathematical truncation only: 44 modeled half-lives plus the longest
// absorption/peak-search horizon. Not an elimination time or clinical interval.
const PK_MODELED_RESIDUAL_HALFLIVES=44;
function residualWindowHours(drug){
  if(!drug||drug.recordOnly)return Infinity;
  const p=modelParams(drug),effective=effectiveHalfLife(drug);
  if(!(effective>0&&Number.isFinite(effective)))return Infinity;
  const absorption=[p.ka,...p.fed.map(part=>part.ka),...p.fedHighFat.map(part=>part.ka)];
  let slowest=effective;
  for(const ka of absorption){if(!(ka>0&&Number.isFinite(ka)))return Infinity;
    slowest=Math.max(slowest,Math.LN2/ka)}
  const peakHorizon=Math.min(72,Math.max(12,drug.tmax*8,effective*3));
  return peakHorizon+PK_MODELED_RESIDUAL_HALFLIVES*slowest;
}
function inverseRecordRows(rows,start,drug=DRUGS.find(item=>item.id===current)){
  const lookback=residualWindowHours(drug)*3600000;
  return rows.filter(row=>row.time>=start-lookback);
}
function svgEl(tag,attrs={}){const el=document.createElementNS("http://www.w3.org/2000/svg",tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));return el}
let chartView=null,probeResetTimer=null,probeManual=false,targetStartTouched=false,pointTargetTouched=false,pointScenario=null,minimumPointScenario=null,appliedPointScenario=null,inverseScenario=null,referencePending=false;
function renderProbeValues(time,inside){
  const view=chartView;if(!view)return;
  const {rows,previewRows,reference,hasFoodEffect,target}=view,d=chosen(),blood=concentration(d,time,rows),equivalent=totalEquivalent(d,time,rows);
  const values=[[hasFoodEffect?"已计饮食血药浓度":"已记血药浓度",`${fmt(blood,blood<1?3:2)} mg/L`,"blood"],["剂量等效量",`${fmt(equivalent,1)} mg（等效）`,"equivalent"]];
  if(hasFoodEffect){const unfed=concentration(d,time,rows,false);values.push(["未计饮食参考",`${fmt(unfed,unfed<1?3:2)} mg/L`,"unfed"])}
  if(previewRows.length){
    const combined=[...rows,...previewRows],previewBlood=concentration(d,time,combined),previewEquivalent=totalEquivalent(d,time,combined);
    values.push(["假设后血药浓度",`${fmt(previewBlood,previewBlood<1?3:2)} mg/L`,"preview-blood"],["假设后剂量等效量",`${fmt(previewEquivalent,1)} mg（等效）`,"preview-equivalent"]);
    if(view.previewFoodEffect){const withoutPreviewFood=blood+concentration(d,time,previewRows,false);values.push(["假设节点不计饮食",`${fmt(withoutPreviewFood,withoutPreviewFood<1?3:2)} mg/L`,"preview-unfed"])}
  }
  if(reference.value!==null&&Number.isFinite(reference.value)&&reference.value>0)values.push([`${reference.name}参考线`,`${fmt(reference.value,3)} ${reference.unit}`,"reference"]);
  if(target){
    const combined=[...rows,...previewRows],targetValue=modelValue(d,target.time,combined,target.mode);
    values.push([`目标时刻 ${dateText(target.time)}`,`${fmt(targetValue,target.mode==="blood"&&targetValue<1?3:2)} ${target.mode==="equivalent"?"mg（等效）":"mg/L"}`,target.mode==="equivalent"?"target":"target blood-target"]);
  }
  const container=$("probeValues");container.replaceChildren();
  for(const [label,value,kind] of values){const item=document.createElement("div"),name=document.createElement("span"),amount=document.createElement("strong");item.className=`probe-value ${kind}${kind==="reference"&&reference.mode==="equivalent"?" equivalent-reference":""}`;name.textContent=label;amount.textContent=value;item.append(name,amount);container.append(item)}
  renderReferenceGlance(values,time,reference.mode);
  $("probeReadout").textContent=`${inside?"":"图示窗口外 · "}${probeManual?"选中":"现在"} ${dateText(time)}`;
}
function showNowProbe(){
  if(!chartView)return;
  probeManual=false;
  const {points,x,y,line,dot,probeAxis,start,end,rows}=chartView,now=Date.now(),level=concentration(chosen(),now,rows),inside=now>=start&&now<=end;
  renderProbeValues(now,inside);
  $("timeScrubber").value=String(Math.max(0,Math.min(points.length-1,Math.round((now-start)/(end-start)*(points.length-1)))));
  line.setAttribute("visibility",inside?"visible":"hidden");dot.setAttribute("visibility",inside?"visible":"hidden");
  probeAxis.textContent=inside?`当前 ${dateText(now)}`:"";
  if(inside){const xx=x(now);line.setAttribute("x1",xx);line.setAttribute("x2",xx);dot.setAttribute("cx",xx);dot.setAttribute("cy",y(level));probeAxis.setAttribute("x",xx)}
}
function updateProbe(index){
  if(!chartView)return;
  const {points,x,y,line,dot,probeAxis}=chartView,i=Math.max(0,Math.min(points.length-1,Number(index)||0)),p=points[i],xx=x(p.t);
  line.setAttribute("visibility","visible");dot.setAttribute("visibility","visible");
  line.setAttribute("x1",xx);line.setAttribute("x2",xx);dot.setAttribute("cx",xx);dot.setAttribute("cy",y(p.c));
  probeAxis.setAttribute("x",xx);probeAxis.textContent=dateText(p.t);
  $("timeScrubber").value=String(i);probeManual=true;renderProbeValues(p.t,true);clearTimeout(probeResetTimer);probeResetTimer=setTimeout(showNowProbe,5000);
}
function getScenario(){
  const timeText=$("scenarioTime").value,doseText=$("scenarioDose").value;
  if(!timeText||!doseText)return null;
  const time=new Date(timeText).getTime(),mg=Number(doseText)*($("scenarioUnit").value==="g"?1000:1);
  if(!Number.isFinite(time)||!Number.isFinite(mg)||mg<=0)return{invalid:true};
  return{time,mg};
}
function renderCrossing(rows,points,peak,reference){
  const out=$("crossingResult");
  if(!rows.length){out.textContent="当前药物还没有单次记录；请先在服用组中添加。";return}
  const {value:threshold,mode,unit,name}=reference,field=mode==="equivalent"?"eq":"c",chosenPeak=points.reduce((a,b)=>b[field]>a[field]?b:a,points[0]);
  const peakText=`当前图示时间窗的${name}模型峰值约 ${fmt(chosenPeak[field],3)} ${unit}，时间约 ${fullDate(chosenPeak.t)}。`;
  if(threshold===null){out.textContent=peakText+"输入一种参考值后显示下降交点。";return}
  if(!Number.isFinite(threshold)||threshold<=0){out.textContent=peakText+`参考值必须大于 0 ${unit}。`;return}
  if(threshold>chosenPeak[field]){out.textContent=peakText+`所填 ${fmt(threshold,3)} ${unit} 高于模型峰值，本时间窗未达到。`;return}
  const crossings=[];
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i];
    if(a[field]>=threshold&&b[field]<threshold)crossings.push(a.t+(b.t-a.t)*(a[field]-threshold)/(a[field]-b[field]));
  }
  const future=crossings.find(t=>t>=Date.now());
  if(future){out.textContent=peakText+`按模型，约 ${fullDate(future)} 再次低于 ${fmt(threshold,3)} ${unit}；这不是建议的下一次服药时间。`;return}
  if(modelValue(chosen(),Date.now(),rows,mode)<threshold){out.textContent=peakText+`当前模型值已低于 ${fmt(threshold,3)} ${unit}；下方可作数学情景反算，但不能据此决定补服。`;return}
  out.textContent=peakText+`本时间窗未找到再次低于 ${fmt(threshold,3)} ${unit} 的交点。`;
}
function renderScenario(){
  if(chosen().recordOnly){$("scenarioResult").textContent="FTC/TAF 复方暂不支持单一血药浓度假设。";return}
  if(referencePending){$("scenarioResult").textContent="参考值已修改。点击“确定并计算”后更新情景结果。";return}
  const out=$("scenarioResult"),s=getScenario(),reference=referenceSetting(),{raw:rawThreshold,value:threshold,mode,unit}=reference,d=chosen();
  if(!s){out.textContent="输入假设时间与剂量后，显示模型达峰、达到参考线与维持时间。";return}
  if(s.invalid){out.textContent="假设单次剂量须为大于 0 的有效数值。";return}
  const rows=allRows(),horizon=Math.min(336,Math.max(24,effectiveHalfLife(d)*8)),step=2*60000;
  let peak={time:s.time,c:0},firstAbove=null,fall=null,prev=null;
  for(let t=s.time;t<=s.time+horizon*3600000;t+=step){
    const c=concentration(d,t,rows)+singleConcentration(d,s.mg,(t-s.time)/3600000,s.time),observed=modelValue(d,t,rows,mode)+doseModelValue(d,s.mg,s.time,t,mode);
    if(c>peak.c)peak={time:t,c};
    if(rawThreshold&&Number.isFinite(threshold)&&threshold>0){
      if(firstAbove===null&&observed>=threshold){firstAbove=prev&&prev.c<threshold?prev.time+(t-prev.time)*(threshold-prev.c)/(observed-prev.c):t}
      if(firstAbove!==null&&fall===null&&prev&&prev.c>=threshold&&observed<threshold)fall=prev.time+(t-prev.time)*(prev.c-threshold)/(prev.c-observed);
    }
    prev={time:t,c:observed};
  }
  let result=`假设在 ${fullDate(s.time)} 再服用 ${fmt(s.mg)} mg，本模型预计约 ${fullDate(peak.time)} 达峰，峰值约 ${fmt(peak.c,peak.c<1?3:2)} mg/L（包含该药此前记录的模型残留）。`;
  if(!rawThreshold)result+="输入一种参考值后可查看连续高于它的时间段。";
  else if(!Number.isFinite(threshold)||threshold<=0)result+=`参考值须大于 0 ${unit}。`;
  else if(firstAbove===null)result+=`本次假设曲线在观察窗内未达到 ${fmt(threshold,3)} ${unit}。`;
  else if(fall!==null)result+=`首次连续高于 ${fmt(threshold,3)} ${unit} 的模型时间段约为 ${fullDate(firstAbove)} 至 ${fullDate(fall)}，持续 ${fmt((fall-firstAbove)/3600000,2)} 小时；不保证真实数值。`;
  else result+=`在 ${fmt(horizon)} 小时观察窗内未见跌回参考线，无法由此推定可维持更久。`;
  out.textContent=result;
}
function solveInverse(drug,rows,threshold,start,hours,now,mode="blood",countText=""){
  const end=start+hours*3600000,samples=[];
  for(let t=start;t<end;t+=5*60000)samples.push({time:t,base:modelValue(drug,t,rows,mode)});
  samples.push({time:end,base:modelValue(drug,end,rows,mode)});
  if(samples.every(p=>p.base>=threshold-1e-8))return{alreadyAbove:true};
  const options=wholeDoseOptions(getStrengths(drug.id)),fixed=countText?Number(countText):null;
  if(!options.length)return{reason:"specs"};
  if(countText&&(!Number.isInteger(fixed)||fixed<1||fixed>8))return{reason:"count"};
  const plan=plans[drug.id]||{},maxDose=Number(plan.dose)>0?Number(plan.dose):Infinity,minGap=Number(plan.interval)>0?Number(plan.interval)*3600000:0;
  const usable=options.filter(o=>o.mg<=maxDose+1e-8);if(!usable.length)return{reason:"cap"};
  const first=Math.max(now,start-12*3600000),firstTimes=[];
  for(let t=first;t<start;t+=20*60000)firstTimes.push(t);
  if(!firstTimes.length||firstTimes.at(-1)!==start)firstTimes.push(start);
  const counts=fixed?[fixed]:[1,2,3,4,5,6,7,8],response=(mg,time,at)=>doseModelValue(drug,mg,time,at,mode);
  let best=null;
  for(const n of counts){
    for(const t0 of firstTimes){
      for(const shift of n===1?[0]:[0,.25,.5]){
        const span=Math.max(0,end-t0),times=Array.from({length:n},(_,i)=>i===0?t0:Math.round((t0+span*(i-shift)/(n-shift))/60000)*60000);
        if(times.some((t,i)=>i&&t-times[i-1]<minGap-1000))continue;
        const doses=[];let possible=true;
        for(let i=0;i<n;i++){
          const boundary=i===n-1?end:Math.min(end,times[i+1]+dosePeakMs(drug,times[i+1]));
          let required=0;
          for(const p of samples){
            if(p.time>(i?times[i]+dosePeakMs(drug,times[i]):start)+1||p.time>boundary+1)continue;
            const gap=threshold-p.base-doses.reduce((sum,d)=>sum+response(d.mg,d.time,p.time),0);
            if(gap<=1e-8)continue;
            const perMg=response(1,times[i],p.time);
            if(perMg<=1e-10){possible=false;break}
            required=Math.max(required,gap/perMg);
          }
          if(!possible)break;
          const option=nearestWholeDose(Math.max(required,usable[0].mg),usable,maxDose);
          if(!option){possible=false;break}
          doses.push({time:times[i],mg:option.mg,parts:option.parts});
        }
        if(!possible)continue;
        const levels=samples.map(p=>p.base+doses.reduce((sum,d)=>sum+response(d.mg,d.time,p.time),0));
        const minimum=Math.min(...levels);if(minimum<threshold-1e-6)continue;
        const total=doses.reduce((sum,d)=>sum+d.mg,0),peak=Math.max(...levels);
        if(!best||total<best.mg-1e-6||Math.abs(total-best.mg)<1e-6&&peak<best.peak)best={doses,mg:total,peak,minConcentration:minimum,count:n};
      }
    }
  }
  return best;
}
function pointLeadHours(drug){return drug.tmax+effectiveHalfLife(drug)}
function dosePeakMs(drug,time){return equivalentPeak(drug,time).hours*3600000}
function defaultPointTarget(){return localInput(Date.now()+(pointLeadHours(chosen())+2)*3600000)}
let inverseSaveTimer=null;
function restoreInverseInputs(){
  const saved=inverseMemory[current]||{},now=Date.now();
  for(const id of ["pointMaxDose","pointTotalMax","pointCount","pointPeakMin","pointPeakMode","pointCycleMin","pointCycleMode","pointTargetLimitBlood","pointTargetLimitEquivalent","holdHours","inverseCount"])$(id).value=saved[id]??(id==="pointTargetLimitBlood"?"0.5":id==="pointTargetLimitEquivalent"?"50":id==="holdHours"?"3":id==="pointPeakMode"?"equivalent":id==="pointCycleMode"?"blood":"");
  $("pointTargetLimitEnabled").checked=saved.pointTargetLimitEnabled==="1";
  const point=new Date(saved.pointTarget||"").getTime();
  pointTargetTouched=Number.isFinite(point)&&point>now+60000&&point<=now+24*3600000;
  $("pointTarget").value=pointTargetTouched?localInput(point):defaultPointTarget();
  const start=new Date(saved.targetStart||"").getTime();
  targetStartTouched=Number.isFinite(start)&&start>now+60000;
  $("targetStart").value=targetStartTouched?saved.targetStart:localInput(now+2*3600000);
}
function rememberInverseInputs(){
  inverseMemory[current]={...Object.fromEntries(INVERSE_FIELDS.map(id=>[id,(id==="pointTargetLimitEnabled"?($(id).checked?"1":"0"):id==="pointTarget"&&!pointTargetTouched||id==="targetStart"&&!targetStartTouched?"":$(id).value).slice(0,32)])),...(inverseMemory[current]?.adoptedPointPlan?{adoptedPointPlan:inverseMemory[current].adoptedPointPlan}:{})};
  setStored("pk-atlas-inverse-by-drug-v1",JSON.stringify(inverseMemory));
  clearTimeout(inverseSaveTimer);inverseSaveTimer=setTimeout(persist,500);
}
function earliestHypotheticalTime(rows,now){
  const recent=rows.filter(r=>r.time<=now&&r.time>now-30*60000).sort((a,b)=>b.time-a.time)[0];
  return recent?Math.max(now,recent.time+30*60000):now;
}
function pointEquivalentPeak(drug,rows,doses,start,target){
  const combined=[...rows,...doses],step=5*60000;
  let peak=0;
  for(let time=start;time<target;time+=step)peak=Math.max(peak,totalEquivalent(drug,time,combined));
  return Math.max(peak,totalEquivalent(drug,target,combined));
}
function strengthenPointPeak(drug,rows,doses,start,target,cap,floor,mode="equivalent"){
  if(!(floor>0))return doses;
  const options=wholeDoseOptions(getStrengths(drug.id)).filter(x=>x.mg<=cap+1e-9);
  if(!options.length||!doses.length)return null;
  const result=doses.map(d=>({...d})),step=5*60000;
  const points=[];for(let time=start;time<target;time+=step)points.push(time);points.push(target);
  for(let iteration=0;iteration<result.length+1;iteration++){
    const levels=points.map(time=>modelValue(drug,time,[...rows,...result],mode));
    if(Math.max(...levels)>=floor-1e-6)return result;
    let direct=null,fallback=null;
    for(let i=0;i<result.length;i++){
      const dose=result[i],largest=options.at(-1);
      if(largest.mg<=dose.mg+1e-9)continue;
      for(let j=0;j<points.length;j++){
        const perMg=doseModelValue(drug,1,dose.time,points[j],mode);
        if(perMg<=1e-10)continue;
        const needed=dose.mg+(floor-levels[j])/perMg;
        const option=nearestWholeDose(needed,options,cap);
        if(option&&(!direct||option.mg-dose.mg<direct.extra))direct={i,option,extra:option.mg-dose.mg};
      }
      const gain=Math.max(...points.map((time,j)=>levels[j]+(largest.mg-dose.mg)*doseModelValue(drug,1,dose.time,time,mode)));
      if(!fallback||gain>fallback.gain)fallback={i,option:largest,gain};
    }
    const choice=direct||fallback;if(!choice)return null;
    result[choice.i]={...result[choice.i],mg:choice.option.mg,parts:choice.option.parts};
  }
  return pointCoveragePeak(drug,rows,result,start,target,mode)>=floor-1e-6?result:null;
}
function solveContinuousPoint(drug,rows,threshold,target,cap,now,mode="blood"){
  const doses=[],step=30*60000,sample=5*60000;
  const response=(time,dose)=>doseModelValue(drug,dose.mg,dose.time,time,mode);
  const level=time=>modelValue(drug,time,rows,mode)+doses.reduce((sum,dose)=>sum+response(time,dose),0);
  const baselineNow=level(now),baselineTarget=modelValue(drug,target,rows,mode);
  const strengths=getStrengths(drug.id),plan=plans[drug.id]||{},effectiveCap=cap,minimumGap=Number(plan.interval)>0?Number(plan.interval)*3600000:0;
  const options=strengths.length?wholeDoseOptions(strengths).filter(option=>option.mg<=effectiveCap+1e-9):[];
  const baselineSamples=[];for(let time=now;time<target;time+=sample)baselineSamples.push(modelValue(drug,time,rows,mode));baselineSamples.push(baselineTarget);
  if(baselineSamples.every(value=>value>=threshold-1e-6))return{doses,baselineNow,baselineTarget,modeled:baselineTarget,fallingAfter:modelValue(drug,target+sample,rows,mode)<=baselineTarget+1e-6,firstReach:now,continuousFrom:now,allCovered:true,limited:false,minLevel:Math.min(...baselineSamples),peak:Math.max(...baselineSamples),mg:0,effectiveCap};
  if(!strengths.length)return{reason:"specs",baselineNow};
  if(!options.length)return{reason:"cap",baselineNow,effectiveCap};
  let limited=false;
  const earliest=earliestHypotheticalTime(rows,now);
  // Oral absorption cannot correct an existing gap instantly. Start with the
  // smallest complete-unit candidate that reaches the first model peak.
  if(baselineNow<threshold&&earliest<target){const check=Math.min(target,earliest+dosePeakMs(drug,earliest)),perMg=doseModelValue(drug,1,earliest,check,mode),needed=perMg>0?(threshold-modelValue(drug,check,rows,mode))/perMg:0;const option=nearestWholeDose(Math.max(options[0].mg,needed*1.002),options,effectiveCap)||options.at(-1);doses.push({time:earliest,mg:option.mg,parts:option.parts})}
  for(let time=earliest;time<target;time+=step){
    if(doses.length>=12){limited=true;break}
    if(time===earliest&&baselineNow<threshold)continue;
    if(doses.length&&time-doses.at(-1).time<minimumGap-1000)continue;
    let needed=0;
    const lead=dosePeakMs(drug,time);
    for(const check of [time+lead,Math.min(target,time+lead+step)]){
      if(check>target)continue;
      const gap=threshold-level(check);
      if(gap<=0)continue;
      const perMg=doseModelValue(drug,1,time,check,mode);
      if(perMg>0)needed=Math.max(needed,gap/perMg);
    }
    if(needed>0){const option=nearestWholeDose(needed*1.002,options,effectiveCap)||options.at(-1);doses.push({time,mg:option.mg,parts:option.parts})}
  }
  const samples=[];
  for(let time=now;time<target;time+=sample)samples.push({time,level:level(time)});
  samples.push({time:target,level:level(target)});
  const firstReach=samples.find(p=>p.level>=threshold)?.time??null;
  let lastBelow=null;for(const p of samples)if(p.level<threshold-1e-6)lastBelow=p.time;
  const continuousFrom=lastBelow===null?now:lastBelow>=target?null:Math.min(target,lastBelow+sample);
  return{doses,time:doses[0]?.time??now,mg:doses.reduce((sum,x)=>sum+x.mg,0),baselineNow,baselineTarget,modeled:samples.at(-1).level,fallingAfter:level(target+sample)<=level(target)+1e-6,firstReach,continuousFrom,allCovered:lastBelow===null,limited,minLevel:Math.min(...samples.map(x=>x.level)),peak:Math.max(...samples.map(x=>x.level)),effectiveCap};
}
function solveFixedContinuousPoint(drug,rows,threshold,target,cap,now,count,mode="blood",peakFloor=0){
  const sample=5*60000,step=30*60000,samples=[];
  for(let time=now;time<target;time+=sample)samples.push({time,base:modelValue(drug,time,rows,mode)});
  samples.push({time:target,base:modelValue(drug,target,rows,mode)});
  const baselineNow=samples[0].base,baselineTarget=samples.at(-1).base;
  if(samples.every(p=>p.base>=threshold-1e-6)&&(peakFloor<=0||pointEquivalentPeak(drug,rows,[],now,target)>=peakFloor-1e-6))return{doses:[],baselineNow,baselineTarget,modeled:baselineTarget,allCovered:true,continuousFrom:now,minLevel:Math.min(...samples.map(p=>p.base)),peak:Math.max(...samples.map(p=>p.base)),mg:0};
  const strengths=getStrengths(drug.id);if(!strengths.length)return{reason:"specs",baselineNow};
  const plan=plans[drug.id]||{},effectiveCap=cap,minimumGap=Number(plan.interval)>0?Number(plan.interval)*3600000:0;
  const options=wholeDoseOptions(strengths).filter(option=>option.mg<=effectiveCap+1e-9);
  if(!options.length)return{reason:"cap",baselineNow,effectiveCap};
  const response=(mg,doseTime,time)=>doseModelValue(drug,mg,doseTime,time,mode);
  const earliest=earliestHypotheticalTime(rows,now),lastAllowed=target-sample,firstTimes=[];
  if(earliest>lastAllowed)return{reason:"fixedNoSolution",baselineNow,effectiveCap};
  if(baselineNow<threshold)firstTimes.push(earliest);
  else{for(let time=earliest;time<=lastAllowed;time+=step)firstTimes.push(time);if(firstTimes.at(-1)!==lastAllowed)firstTimes.push(lastAllowed)}
  let best=null;
  for(const first of firstTimes){
    const lastTimes=[];
    if(count===2){for(let time=first+Math.max(step,minimumGap);time<=lastAllowed;time+=5*60000)lastTimes.push(time);if(lastTimes.at(-1)!==lastAllowed)lastTimes.push(lastAllowed)}
    else for(const fraction of count===1?[0]:[0,.25,.5,.75])lastTimes.push(first+(lastAllowed-first)*(1-fraction));
    for(const last of lastTimes){
      const times=Array.from({length:count},(_,i)=>i===0?first:Math.round((first+(last-first)*i/(count-1))/60000)*60000);
      if(times.some((time,i)=>i&&time-times[i-1]<Math.max(step,minimumGap)-1000))continue;
      const doses=[];let coverageStart=now,possible=true;
      if(baselineNow<threshold){
        const check=Math.min(target,first+dosePeakMs(drug,first)),perMg=response(1,first,check),needed=perMg>0?(threshold-modelValue(drug,check,rows,mode))/perMg:0;
        const option=nearestWholeDose(Math.max(options[0].mg,needed*1.002),options,effectiveCap)||options.at(-1);
        doses.push({time:first,mg:option.mg,parts:option.parts});
        coverageStart=samples.find(p=>p.base+response(option.mg,first,p.time)>=threshold-1e-6)?.time??null;
        if(coverageStart===null||coverageStart>=target)continue;
      }
      for(let i=doses.length;i<count;i++){
        const segmentStart=i===0?coverageStart:Math.max(coverageStart,times[i]+dosePeakMs(drug,times[i]));
        const segmentEnd=i===count-1?target:Math.min(target,times[i+1]+dosePeakMs(drug,times[i+1]));
        let needed=0;
        for(const p of samples){
          if(p.time<segmentStart-1||p.time>segmentEnd+1)continue;
          const gap=threshold-p.base-doses.reduce((sum,dose)=>sum+response(dose.mg,dose.time,p.time),0);
          if(gap<=1e-8)continue;
          const perMg=response(1,times[i],p.time);
          if(perMg<=1e-10){possible=false;break}
          needed=Math.max(needed,gap/perMg);
        }
        if(!possible)break;
        const option=nearestWholeDose(Math.max(needed*1.002,options[0].mg),options,effectiveCap);
        if(!option){possible=false;break}
        doses.push({time:times[i],mg:option.mg,parts:option.parts});
      }
      if(!possible||doses.length!==count)continue;
      if(peakFloor>0){const adjusted=strengthenPointPeak(drug,rows,doses,coverageStart,target,effectiveCap,peakFloor);if(!adjusted)continue;doses.splice(0,doses.length,...adjusted)}
      const levels=samples.map(p=>({time:p.time,value:p.base+doses.reduce((sum,dose)=>sum+response(dose.mg,dose.time,p.time),0)}));
      if(levels.some(p=>p.time>=coverageStart&&p.value<threshold-1e-6))continue;
      const modeled=levels.at(-1).value,peak=Math.max(...levels.map(p=>p.value)),mg=doses.reduce((sum,dose)=>sum+dose.mg,0);
      const after=modelValue(drug,target+sample,rows,mode)+doses.reduce((sum,dose)=>sum+response(dose.mg,dose.time,target+sample),0);
      const fallingAfter=after<=modeled+1e-6;
      const candidate={doses,mg,baselineNow,baselineTarget,modeled,fallingAfter,firstReach:coverageStart,continuousFrom:coverageStart,allCovered:coverageStart===now,limited:false,minLevel:Math.min(...levels.filter(p=>p.time>=coverageStart).map(p=>p.value)),peak,effectiveCap,fixedCount:count};
      if(!best||(candidate.allCovered&&!best.allCovered)||(candidate.allCovered===best.allCovered&&((candidate.continuousFrom<best.continuousFrom)||(candidate.continuousFrom===best.continuousFrom&&(candidate.mg<best.mg-1e-6||(Math.abs(candidate.mg-best.mg)<1e-6&&candidate.peak<best.peak))))))best=candidate;
    }
  }
  return best||{reason:"fixedNoSolution",baselineNow,effectiveCap};
}
function applyAutomaticPointPeakFloor(drug,rows,result,threshold,target,cap,now,mode,peakFloor){
  if(!(peakFloor>0)||result.reason||result.continuousFrom===null)return result;
  let doses=result.doses;
  if(!doses.length){
    const earliest=earliestHypotheticalTime(rows,now),first=wholeDoseOptions(getStrengths(drug.id)).find(x=>x.mg<=cap+1e-9);
    if(!first||earliest>=target)return{reason:"peakNoSolution"};
    doses=[{time:earliest,mg:first.mg,parts:first.parts}];
  }
  const adjusted=strengthenPointPeak(drug,rows,doses,result.continuousFrom,target,cap,peakFloor);
  if(!adjusted)return{reason:"peakNoSolution"};
  const levels=[],sample=5*60000,combined=[...rows,...adjusted];
  for(let time=now;time<target;time+=sample)levels.push({time,value:modelValue(drug,time,combined,mode)});
  levels.push({time:target,value:modelValue(drug,target,combined,mode)});
  let lastBelow=null;for(const point of levels)if(point.value<threshold-1e-6)lastBelow=point.time;
  const continuousFrom=lastBelow===null?now:lastBelow>=target?null:Math.min(target,lastBelow+sample);
  if(continuousFrom===null||pointEquivalentPeak(drug,rows,adjusted,continuousFrom,target)<peakFloor-1e-6)return{reason:"peakNoSolution"};
  const covered=levels.filter(p=>p.time>=continuousFrom),modeled=levels.at(-1).value;
  return{...result,doses:adjusted,mg:adjusted.reduce((sum,d)=>sum+d.mg,0),modeled,continuousFrom,allCovered:continuousFrom===now,minLevel:Math.min(...covered.map(p=>p.value)),peak:Math.max(...covered.map(p=>p.value)),fallingAfter:modelValue(drug,target+sample,combined,mode)<=modeled+1e-6};
}
// A bounded, whole-unit search. Both displayed candidates are checked over
// the same interval; this is not a globally optimal clinical regimen.
function solveMinimumPoint(drug,rows,threshold,target,cap,now,primary,fixedCount,mode="blood",peakFloor=0){
  if(!primary.doses.length||primary.continuousFrom===null)return null;
  const earliest=earliestHypotheticalTime(rows,now);
  const options=wholeDoseOptions(getStrengths(drug.id)).filter(x=>x.mg<=cap+1e-9);
  if(!options.length)return null;
  const sample=5*60000,coverageStart=primary.continuousFrom,points=[];
  for(let time=coverageStart;time<target;time+=sample)points.push({time,base:modelValue(drug,time,rows,mode)});
  points.push({time:target,base:modelValue(drug,target,rows,mode)});
  const response=(dose,time)=>doseModelValue(drug,dose.mg,dose.time,time,mode);
  const evaluate=doses=>{
    const levels=points.map(p=>p.base+doses.reduce((sum,d)=>sum+response(d,p.time),0));
    if(levels.some(x=>x<threshold-1e-6))return null;
    if(peakFloor>0&&pointEquivalentPeak(drug,rows,doses,coverageStart,target)<peakFloor-1e-6)return null;
    const mg=doses.reduce((sum,d)=>sum+d.mg,0),modeled=levels.at(-1);
    const next=modelValue(drug,target+sample,rows,mode)+doses.reduce((sum,d)=>sum+response(d,target+sample),0);
    if(primary.fallingAfter&&next>modeled+1e-6)return null;
    return{doses:structuredClone(doses),mg,modeled,minLevel:Math.min(...levels),peak:Math.max(...levels),fallingAfter:next<=modeled+1e-6,continuousFrom:coverageStart,allCovered:coverageStart===now,baselineNow:primary.baselineNow,effectiveCap:cap};
  };
  let best=evaluate(primary.doses);
  const better=x=>x&&(!best||x.mg<best.mg-1e-6||Math.abs(x.mg-best.mg)<1e-6&&x.peak<best.peak-1e-6);
  const shrink=seed=>{
    let doses=structuredClone(seed),changed=true;
    while(changed){changed=false;
      for(let i=doses.length-1;i>=0;i--){
        if(!fixedCount){const removed=doses.filter((_,j)=>j!==i);if(evaluate(removed)){doses=removed;changed=true;continue}}
        let lo=0,hi=options.findIndex(x=>x.mg>=doses[i].mg-1e-9);if(hi<0)hi=options.length-1;
        while(lo<hi){const mid=(lo+hi)>>1,candidate=doses.map((d,j)=>j===i?{time:d.time,mg:options[mid].mg,parts:options[mid].parts}:d);if(evaluate(candidate))hi=mid;else lo=mid+1}
        if(options[lo].mg<doses[i].mg-1e-6){doses[i]={time:doses[i].time,mg:options[lo].mg,parts:options[lo].parts};changed=true}
      }
    }
    const candidate=evaluate(doses);if(better(candidate))best=candidate;
  };
  shrink(primary.doses);
  // Check alternative single-node times on a 30-minute grid. This may find
  // a smaller amount than reducing the automatic nodes alone.
  if(!fixedCount||fixedCount===1){
    for(let time=earliest;time<=target;time+=30*60000){
      let required=options[0].mg,possible=true;
      for(const p of points){const gap=threshold-p.base;if(gap<=0)continue;const perMg=response({time,mg:1},p.time);if(perMg<=1e-10){possible=false;break}required=Math.max(required,gap/perMg*1.002)}
      if(!possible)continue;
      const option=nearestWholeDose(required,options,cap);if(option){const candidate=evaluate([{time,mg:option.mg,parts:option.parts}]);if(better(candidate))best=candidate}
    }
  }
  if(!fixedCount||fixedCount===2){
    const grid=[];for(let time=earliest;time<=target;time+=60*60000)grid.push(time);
    const firstOptions=options.length<=32?options:options.filter((_,i)=>i%Math.ceil(options.length/32)===0);
    const minimumGap=Math.max(30*60000,(Number(plans[drug.id]?.interval)||0)*3600000);
    for(let i=0;i<grid.length;i++)for(let j=i+1;j<grid.length;j++){
      if(grid[j]-grid[i]<minimumGap)continue;
      for(const first of firstOptions){
        const d1={time:grid[i],mg:first.mg,parts:first.parts};let required=options[0].mg,possible=true;
        for(const p of points){const gap=threshold-p.base-response(d1,p.time);if(gap<=0)continue;const perMg=response({time:grid[j],mg:1},p.time);if(perMg<=1e-10){possible=false;break}required=Math.max(required,gap/perMg*1.002)}
        if(!possible)continue;
        const second=nearestWholeDose(required,options,cap);if(!second)continue;
        const candidate=evaluate([d1,{time:grid[j],mg:second.mg,parts:second.parts}]);if(better(candidate))best=candidate;
      }
    }
  }
  return best;
}
function pointStabilityStats(drug,rows,doses,start,target,mode){
  const combined=[...rows,...doses],step=60000,values=[];
  for(let time=start;time<target;time+=step)values.push(modelValue(drug,time,combined,mode));
  values.push(modelValue(drug,target,combined,mode));
  const min=Math.min(...values),max=Math.max(...values),mean=values.reduce((sum,value)=>sum+value,0)/values.length;
  return{min,max,swing:max-min,spread:Math.sqrt(values.reduce((sum,value)=>sum+(value-mean)**2,0)/values.length)};
}
function solveStablePoint(drug,rows,threshold,target,cap,now,primary,minimum,fixedCount,mode="blood",peakFloor=0){
  if(!minimum?.doses?.length||minimum.continuousFrom===null)return null;
  const start=minimum.continuousFrom,step=5*60000,points=[];
  for(let time=start;time<target;time+=step)points.push({time,base:modelValue(drug,time,rows,mode)});
  points.push({time:target,base:modelValue(drug,target,rows,mode)});
  const options=wholeDoseOptions(getStrengths(drug.id)).filter(option=>option.mg<=cap+1e-9);
  const earliest=earliestHypotheticalTime(rows,now),minimumGap=Math.max(30*60000,(Number(plans[drug.id]?.interval)||0)*3600000);
  const curveCache=new Map();
  const curve=(time,kind)=>{const key=`${time}:${kind}`;if(!curveCache.has(key))curveCache.set(key,Float64Array.from(points,p=>doseModelValue(drug,1,time,p.time,kind)));return curveCache.get(key)};
  const evaluate=doses=>{
    if(fixedCount&&doses.length!==fixedCount)return null;
    if(doses.some((dose,i)=>dose.time<earliest||dose.time>target-step||dose.mg>cap+1e-9||i&&dose.time-doses[i-1].time<minimumGap-1000))return null;
    const levels=Float64Array.from(points,p=>p.base);
    for(const dose of doses){const response=curve(dose.time,mode);for(let i=0;i<levels.length;i++)levels[i]+=dose.mg*response[i]}
    let min=Infinity,max=-Infinity;
    for(const value of levels){if(value<threshold-1e-6)return null;min=Math.min(min,value);max=Math.max(max,value)}
    if(peakFloor>0&&pointEquivalentPeak(drug,rows,doses,start,target)<peakFloor-1e-6)return null;
    const blood=mode==="blood"?levels:Float64Array.from(points,p=>concentration(drug,p.time,rows));
    if(mode!=="blood")for(const dose of doses){const response=curve(dose.time,"blood");for(let i=0;i<blood.length;i++)blood[i]+=dose.mg*response[i]}
    let bloodMin=Infinity,bloodMax=-Infinity,sum=0,sumSquares=0;
    for(const value of blood){bloodMin=Math.min(bloodMin,value);bloodMax=Math.max(bloodMax,value);sum+=value;sumSquares+=value*value}
    const modeled=levels.at(-1),next=modelValue(drug,target+step,rows,mode)+doses.reduce((total,dose)=>total+doseModelValue(drug,dose.mg,dose.time,target+step,mode),0);
    if(primary.fallingAfter&&next>modeled+1e-6)return null;
    const mg=doses.reduce((total,dose)=>total+dose.mg,0),swing=bloodMax-bloodMin,spread=Math.sqrt(Math.max(0,sumSquares/blood.length-(sum/blood.length)**2));
    return{doses:doses.map(dose=>({...dose})),mg,swing,spread,modeled,minLevel:min,peak:max,fallingAfter:next<=modeled+1e-6,continuousFrom:start,allCovered:start===now,baselineNow:primary.baselineNow,effectiveCap:cap};
  };
  let best=evaluate(minimum.doses);if(!best)return null;
  const denseCheck=doses=>{
    const combined=[...rows,...doses];let bloodMin=Infinity,bloodMax=-Infinity,sum=0,sumSquares=0,count=0;
    for(let time=start;time<target;time+=60000){
      if(modelValue(drug,time,combined,mode)<threshold-1e-6)return null;
      const blood=concentration(drug,time,combined);bloodMin=Math.min(bloodMin,blood);bloodMax=Math.max(bloodMax,blood);sum+=blood;sumSquares+=blood*blood;count++;
    }
    if(modelValue(drug,target,combined,mode)<threshold-1e-6)return null;
    const blood=concentration(drug,target,combined);bloodMin=Math.min(bloodMin,blood);bloodMax=Math.max(bloodMax,blood);sum+=blood;sumSquares+=blood*blood;count++;
    return{swing:bloodMax-bloodMin,spread:Math.sqrt(Math.max(0,sumSquares/count-(sum/count)**2))};
  };
  const baseline=pointStabilityStats(drug,rows,best.doses,start,target,"blood");best={...best,swing:baseline.swing,spread:baseline.spread};
  const original=best,maxSwing=best.swing+1e-6;
  const consider=doses=>{let candidate=evaluate(doses);if(!candidate||candidate.swing>maxSwing+0.01||candidate.mg>original.mg+1e-6)return false;
    const dense=denseCheck(doses);if(!dense||dense.swing>maxSwing)return false;
    candidate={...candidate,...dense};
    if(candidate.mg<best.mg-1e-6||Math.abs(candidate.mg-best.mg)<1e-6&&(candidate.swing<best.swing-1e-6||Math.abs(candidate.swing-best.swing)<1e-6&&candidate.spread<best.spread-1e-6)){best=candidate;return true}return false};
  for(let round=0;round<3;round++){
    let improved=false;
    for(let i=0;i<best.doses.length;i++){
      const seed=best.doses,originalDose=seed[i],optionIndex=options.findIndex(option=>Math.abs(option.mg-originalDose.mg)<1e-6);
      if(optionIndex<0)continue;
      for(const minutes of [-60,-30,-15,-5,0,5,15,30,60]){
        for(const index of [optionIndex,optionIndex-1,optionIndex-2]){
          if(index<0)continue;
          const option=options[index],trial=seed.map(dose=>({...dose}));
          trial[i]={time:originalDose.time+minutes*60000,mg:option.mg,parts:option.parts};
          if(consider(trial))improved=true;
        }
      }
    }
    for(let i=0;i<best.doses.length;i++)for(let j=0;j<best.doses.length;j++){
      if(i===j)continue;
      const seed=best.doses,a=options.findIndex(option=>Math.abs(option.mg-seed[i].mg)<1e-6),b=options.findIndex(option=>Math.abs(option.mg-seed[j].mg)<1e-6);
      if(a<=0||b<0||b+1>=options.length)continue;
      const trial=seed.map(dose=>({...dose}));trial[i]={...trial[i],mg:options[a-1].mg,parts:options[a-1].parts};trial[j]={...trial[j],mg:options[b+1].mg,parts:options[b+1].parts};
      if(consider(trial))improved=true;
    }
    if(!improved)break;
  }
  return best.mg<original.mg-1e-6||best.swing<original.swing-1e-6?best:null;
}
// Plan B: blood-concentration peak-to-trough swing is the primary objective.
// Compare exactly the same time window and allow no more total dose than A.
// Existing whole-unit local search is bounded; no clinical/global optimum claim.
function solveFlattestPoint(drug,rows,threshold,target,cap,now,primary,minimum,fixedCount,mode,peakFloor,cycle,peak,totalCap=Infinity){
  if(!primary?.doses?.length||primary.continuousFrom===null)return null;
  const budget=Math.min(totalCap,primary.mg),start=primary.continuousFrom;
  const candidates=[primary,minimum];
  for(const seed of [primary,minimum]){
    if(!seed?.doses?.length)continue;
    const tuned=solveStablePoint(drug,rows,threshold,target,cap,now,primary,seed,fixedCount,mode,peakFloor);
    if(tuned)candidates.push(tuned);
  }
  let best=null;
  for(const candidate of candidates){
    if(!candidate?.doses?.length)continue;
    if(candidate.mg>budget+1e-6)continue;
    const checked=enforcePointConstraints(drug,rows,{...candidate,continuousFrom:start},threshold,target,cap,now,mode,cycle,peak,fixedCount,budget);
    if(!checked||checked.reason||checked.mg>budget+1e-6)continue;
    const stats=pointStabilityStats(drug,rows,checked.doses,start,target,"blood");
    if(!best||stats.swing<best.stabilitySwing-1e-6||
      (Math.abs(stats.swing-best.stabilitySwing)<=1e-6&&
        (stats.spread<best.stabilitySpread-1e-6||
         (Math.abs(stats.spread-best.stabilitySpread)<=1e-6&&checked.mg<best.mg-1e-6)))){
      best={...checked,stabilitySwing:stats.swing,stabilitySpread:stats.spread};
    }
  }
  return best;
}
function pointCoveragePeak(drug,rows,doses,start,target,mode){
  const combined=[...rows,...doses],step=5*60000;
  let peak=0;for(let time=start;time<target;time+=step)peak=Math.max(peak,modelValue(drug,time,combined,mode));
  return Math.max(peak,modelValue(drug,target,combined,mode));
}

// Optional target-time precision bound. Reference-line coverage is separately
// preserved: without the bound, anything >= threshold at target is accepted.
// With it, mathematically accept only |observed-reference| <= tolerance,
// and still enforce other enabled constraints; no false global infeasibility.
function refinePointTargetWindow(drug,rows,candidate,threshold,target,mode,targetWindow,
  now,cap,cycle,peak,fixedCount,totalCap){
  const initial=checkPointTargetWindow(drug,rows,candidate,threshold,target,mode,targetWindow);
  if(initial||!candidate?.doses?.length||candidate.reason)return initial;
  // Bounded whole-unit local search of the existing nodes. Never claim that
  // failure here proves mathematical impossibility; it is NOT a dose policy.
  const options=wholeDoseOptions(getStrengths(drug.id))
    .filter(option=>option.mg<=cap+1e-9).slice(0,128);
  if(!options.length)return null;
  const baseline=modelValue(drug,target,rows,mode);
  if(baseline>threshold+targetWindow.value+1e-6)return null;
  const targetLevel=doses=>modelValue(drug,target,[...rows,...doses],mode);
  let best=null,bestGap=Infinity,attempts=0;
  for(let index=0;index<candidate.doses.length;index++){
    const original=candidate.doses[index];
    const admissible=options.filter(option=>{
      const high=targetLevel(candidate.doses)>threshold+targetWindow.value;
      return high?option.mg<=original.mg+1e-6:option.mg>=original.mg-1e-6;
    });
    for(const offset of [0,-30,30,-60,60]){
      const time=original.time+offset*60000;
      if(time<now||time>=target)continue;
      for(const option of admissible){
        if(++attempts>280)return best;
        const trial=candidate.doses.map(dose=>({...dose}));
        trial[index]={...trial[index],time,mg:option.mg,parts:option.parts};
        const score=targetLevel(trial);
        const gap=Math.abs(score-threshold);
        if(gap>targetWindow.value+1e-6||gap>=bestGap-1e-8)continue;
        const candidateTrial={...candidate,doses:trial,
          mg:trial.reduce((total,dose)=>total+dose.mg,0)};
        const checked=enforcePointConstraints(drug,rows,candidateTrial,
          threshold,target,cap,now,mode,cycle,peak,fixedCount,totalCap);
        if(!checked||checked.reason)continue;
        const result=checkPointTargetWindow(drug,rows,checked,threshold,target,mode,targetWindow);
        if(result){best=result;bestGap=gap;}
      }
    }
  }
  return best;
}
function checkPointTargetWindow(drug,rows,candidate,threshold,target,mode,targetWindow){
  if(!candidate||candidate.reason||!candidate.doses)return candidate;
  const observed=modelValue(drug,target,[...rows,...candidate.doses],mode);
  candidate.targetObserved=observed;
  if(!targetWindow?.enabled)return candidate;
  const delta=Number(targetWindow.value);
  if(!(Number.isFinite(delta)&&delta>0&&delta<=1000000))return{reason:"targetWindowInvalid"};
  const limit=Math.max(1e-6,Math.abs(threshold)*1e-9);
  return Math.abs(observed-threshold)<=delta+limit?candidate:null;
}

// Independent hard constraints: the entire now -> target window is NOT the
// same as the reference-line coverage window (continuousFrom -> target).
function pointConstraintMetrics(drug,rows,doses,now,coverageStart,target,cycle,peak){
  const all=[...rows,...doses],step=5*60000;
  const sample=(start,mode)=>{
    let minimum=Infinity,maximum=-Infinity,minTime=start;
    for(let t=start;t<target;t+=step){
      const value=modelValue(drug,t,all,mode);
      if(value<minimum){minimum=value;minTime=t}
      maximum=Math.max(maximum,value);
    }
    const end=modelValue(drug,target,all,mode);
    if(end<minimum){minimum=end;minTime=target}
    maximum=Math.max(maximum,end);
    return{minimum,maximum,minTime};
  };
  const cycleBlood=sample(now,"blood"),cycleEquivalent=sample(now,"equivalent");
  const validCover=Number.isFinite(coverageStart)&&coverageStart<=target;
  const peakBlood=validCover?sample(coverageStart,"blood").maximum:null;
  const peakEquivalent=validCover?sample(coverageStart,"equivalent").maximum:null;
  return{cycleMinBlood:cycleBlood.minimum,cycleMinEquivalent:cycleEquivalent.minimum,
    peakBlood,peakEquivalent,
    cycleObserved:(cycle.mode==="equivalent"?cycleEquivalent:cycleBlood).minimum,
    cycleMinTime:(cycle.mode==="equivalent"?cycleEquivalent:cycleBlood).minTime,
    peakObserved:peak.mode==="equivalent"?peakEquivalent:peakBlood,
    cycleValid:!(cycle.value>0)||(cycle.mode==="equivalent"?cycleEquivalent:cycleBlood).minimum>=cycle.value-1e-6,
    peakValid:!(peak.value>0)||(validCover&&(peak.mode==="equivalent"?peakEquivalent:peakBlood)>=peak.value-1e-6)};
}
function strengthenPointCycleFloor(drug,rows,doses,now,target,cap,floor,mode){
  if(!(floor>0))return doses;
  // New oral dosing cannot alter the *current instant*. Never claim that a
  // pre-existing deficit can be repaired retroactively.
  if(modelValue(drug,now,rows,mode)<floor-1e-6)return null;
  const options=wholeDoseOptions(getStrengths(drug.id)).filter(x=>x.mg<=cap+1e-9);
  if(!options.length)return null;
  const step=5*60000,times=[];
  for(let t=now;t<target;t+=step)times.push(t);
  times.push(target);
  const result=doses.map(d=>({...d}));
  for(let iteration=0;iteration<48;iteration++){
    const combined=[...rows,...result];
    let worst={time:now,value:Infinity};
    for(const time of times){
      const value=modelValue(drug,time,combined,mode);
      if(value<worst.value)worst={time,value};
    }
    if(worst.value>=floor-1e-6)return result;
    let best=null;
    for(let i=0;i<result.length;i++){
      const dose=result[i];
      const coefficient=doseModelValue(drug,1,dose.time,worst.time,mode);
      if(coefficient<=1e-10)continue;
      const next=nearestWholeDose(dose.mg+(floor-worst.value)/coefficient*1.001,options,cap);
      const largest=options.at(-1);
      const choice=next?.mg>dose.mg+1e-8?next:largest.mg>dose.mg+1e-8?largest:null;
      if(!choice)continue;
      const improvement=(choice.mg-dose.mg)*coefficient;
      const extra=choice.mg-dose.mg;
      if(!best||((next&&improvement>=floor-worst.value-1e-6)&&best.full===false)||
        ((improvement>=floor-worst.value-1e-6)==best.full&&extra<best.extra)){
        best={i,option:choice,extra,full:improvement>=floor-worst.value-1e-6};
      }
    }
    if(!best)return null;
    result[best.i]={...result[best.i],mg:best.option.mg,parts:best.option.parts};
  }
  return null;
}
function enforcePointConstraints(drug,rows,result,threshold,target,cap,now,mode,cycle,peak,fixedCount=null,totalCap=Infinity){
  if(!result||result.reason||result.continuousFrom===null)return result;
  const base=Number(cycle.value)||0,minimumPeak=Number(peak.value)||0;
  const totalDose=doses=>doses.filter(d=>d.time>=now-1000&&d.time<=target+1000).reduce((sum,d)=>sum+d.mg,0);
  const checkedTotal=doses=>!Number.isFinite(totalCap)||totalDose(doses)<=totalCap+1e-6;
  if(!(base>0||minimumPeak>0)){
    const stats=pointConstraintMetrics(drug,rows,result.doses,now,result.continuousFrom,target,cycle,peak);
    if(!checkedTotal(result.doses))return{reason:"totalNoSolution"};
    return{...result,...stats,totalPlanned:totalDose(result.doses),totalCap};
  }
  if(base>0&&modelValue(drug,now,rows,cycle.mode)<base-1e-6)
    return{reason:"cycleAlreadyBelow",cycleStart:modelValue(drug,now,rows,cycle.mode)};
  let doses=result.doses.map(d=>({...d}));
  const options=wholeDoseOptions(getStrengths(drug.id)).filter(x=>x.mg<=cap+1e-9);
  if(!doses.length&&(base>0||minimumPeak>0)){
    const stats=pointConstraintMetrics(drug,rows,doses,now,result.continuousFrom,target,cycle,peak);
    if(!stats.cycleValid||!stats.peakValid){
      if(fixedCount||!options.length)return{reason:"constraintNoSolution"};
      const at=earliestHypotheticalTime(rows,now);
      if(at>=target)return{reason:"constraintNoSolution"};
      const option=options[0];doses=[{time:at,mg:option.mg,parts:option.parts}];
    }
  }
  for(let pass=0;pass<3;pass++){
    if(minimumPeak>0){
      const checked=pointConstraintMetrics(drug,rows,doses,now,result.continuousFrom,target,cycle,peak);
      if(!checked.peakValid){
        const better=strengthenPointPeak(drug,rows,doses,result.continuousFrom,target,cap,minimumPeak,peak.mode);
        if(!better)return{reason:"peakNoSolution"};
        doses=better;
      }
    }
    if(base>0){
      const checked=pointConstraintMetrics(drug,rows,doses,now,result.continuousFrom,target,cycle,peak);
      if(!checked.cycleValid){
        const better=strengthenPointCycleFloor(drug,rows,doses,now,target,cap,base,cycle.mode);
        if(!better)return{reason:"cycleNoSolution"};
        doses=better;
      }
    }
    const stats=pointConstraintMetrics(drug,rows,doses,now,result.continuousFrom,target,cycle,peak);
    if(stats.cycleValid&&stats.peakValid){
      if(!checkedTotal(doses))return{reason:"totalNoSolution"};
      const all=[...rows,...doses],step=5*60000,coverage=[];
      for(let t=result.continuousFrom;t<target;t+=step)coverage.push(modelValue(drug,t,all,mode));
      coverage.push(modelValue(drug,target,all,mode));
      if(coverage.some(value=>value<threshold-1e-6))return{reason:"constraintNoSolution"};
      const modeled=modelValue(drug,target,all,mode);
      return{...result,...stats,totalPlanned:totalDose(doses),totalCap,doses,mg:doses.reduce((total,d)=>total+d.mg,0),
        minLevel:Math.min(...coverage),peak:Math.max(...coverage),modeled,
        fallingAfter:modelValue(drug,target+step,all,mode)<=modeled+1e-6};
    }
  }
  return{reason:"constraintNoSolution"};
}
const cycleFloorUnit=mode=>mode==="equivalent"?"mg（等效）":"mg/L";
function scenarioCard({title,badge,result,threshold,target,description,preview,adopt,coverageLabel,reference,totalLabel="模型合计"}){
  const card=document.createElement("section");card.className="scenario-card";
  const head=document.createElement("div");head.className="scenario-card-head";
  const heading=document.createElement("strong");heading.textContent=title;
  const tag=document.createElement("span");tag.className="scenario-badge";tag.textContent=badge;head.append(heading,tag);card.append(head);
  const summary=document.createElement("p");summary.className="scenario-summary";summary.textContent=description;card.append(summary);
  const metrics=document.createElement("div");metrics.className="scenario-metrics";
  const values=[[totalLabel,`${fmt(result.mg,3)} mg`],["假设节点",String(result.doses.length)],
    ["目标时刻血药",`${fmt(result.bloodAtTarget,3)} mg/L`],["目标时刻等效",`${fmt(result.equivalentAtTarget,1)} mg`],
    [`覆盖段最低 · ${reference.name}`,`${fmt(result.minLevel,3)} ${reference.unit}`],
    ["覆盖段峰值 · 剂量等效",`${fmt(result.peakEquivalent,3)} mg（等效）`]];
  if(Number.isFinite(result.cycleMinBlood))values.push(["整个周期最低 · 血药浓度",`${fmt(result.cycleMinBlood,3)} mg/L`]);
  if(Number.isFinite(result.cycleMinEquivalent))values.push(["整个周期最低 · 剂量等效",`${fmt(result.cycleMinEquivalent,3)} mg（等效）`]);
  if(Number.isFinite(result.peakBlood))values.push(["覆盖段峰值 · 血药浓度",`${fmt(result.peakBlood,3)} mg/L`]);
  if(Number.isFinite(result.totalCap))values.push(["本段预计新增合计 / 上限",`${fmt(result.totalPlanned??result.mg,3)} / ${fmt(result.totalCap,3)} mg`]);
  for(const [label,value] of values){const item=document.createElement("div"),small=document.createElement("small"),strong=document.createElement("strong");small.textContent=label;strong.textContent=value;item.append(small,strong);metrics.append(item)}card.append(metrics);
  const line=document.createElement("ol");line.className="scenario-timeline";
  for(const dose of result.doses){const li=document.createElement("li"),time=document.createElement("time"),amount=document.createElement("strong"),parts=document.createElement("small");time.textContent=fullDate(dose.time);amount.textContent=`${fmt(dose.mg,3)} mg`;parts.textContent=formatDoseContext(dose);li.append(time,amount,parts);line.append(li)}
  if(!result.doses.length){const item=document.createElement("p");item.className="scenario-empty";item.textContent="已有模型曲线覆盖目标区间，无新增假设节点。";card.append(item)}else card.append(line);
  const status=document.createElement("p");status.className="scenario-status";status.textContent=`${coverageLabel|| (result.allCovered?"从现在起的采样均达标":`仅从 ${fullDate(result.continuousFrom)} 起的采样达标；此前存在缺口`)} · 目标 ${fullDate(target)} · ${reference.name}参考线 ${fmt(threshold,3)} ${reference.unit}${result.fallingAfter===false?" · 目标后所选模型仍可能上升":""}`;card.append(status);
  if(preview&&!preview.hidden){const action=document.createElement("button");action.type="button";action.className="ghost point-preview";action.textContent=preview.textContent;action.addEventListener("click",()=>preview.click());card.append(action)}
  if(adopt&&result.doses.length){const action=document.createElement("button");action.type="button";action.className="primary scenario-adopt";action.textContent=`采用方案 ${title.match(/^方案 ([ABC])/)?.[1]||"A"} 并同步账号`;action.addEventListener("click",adopt);card.append(action)}
  return card;
}
function adoptedPlan(){return inverseMemory[current]?.adoptedPointPlan||null}
function samePlanNodes(a,b){return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((dose,i)=>Math.abs(dose.time-b[i].time)<60000&&Math.abs(dose.mg-b[i].mg)<1e-6)}
function adoptedRecordSignature(drugId){return JSON.stringify(records.filter(r=>r.drug===drugId).map(r=>[r.id,r.time,r.mg]))}
function mealScenarioSignature(drugId,start,target){
  if(!FOOD_INFO[drugId]?.fed)return"";
  return JSON.stringify(intakes.filter(x=>x.kind==="meal"&&x.time>=start-mealBeforeDoseMinutes(drugId)*60000&&x.time<=target+MEAL_AFTER_DOSE_MINUTES*60000).map(x=>[x.id,x.time,x.mealType]));
}
function futureMealNotice(drug,now,target){
  const count=intakes.filter(x=>x.kind==="meal"&&x.time>now&&x.time<=target+15*60000).length;
  if(!count)return"";
  return `已计入 ${count} 条未来用餐情景；${FOOD_INFO[drug.id]?.fed?`用餐前 15 分钟至餐后 ${mealBeforeDoseMinutes(drug.id)} 分钟内的节点会使用餐后吸收模型；窗口末端不是已测得的消化完成时间。`:"本药缺少可套用的餐后数值，模型不会因用餐记录改变。"}`;
}
function manualMatchIds(value){
  if(value===null)return[];
  if(typeof value==="string")return[value];
  return Array.isArray(value)?[...new Set(value.filter(id=>typeof id==="string"&&id.length<=100))].slice(0,20):[];
}
function matchAdoptedPlanRecords(plan,newRows,manual){
  const usedRecords=new Set(),usedNodes=new Set(),manualBlockedAuto=new Set(),completed=[],invalidManual=[];
  for(let i=0;i<plan.doses.length;i++){
    if(!Object.hasOwn(manual,i))continue;
    const selection=manual[i];
    if(selection===null){usedNodes.add(i);continue}
    if(Array.isArray(selection)&&selection.length===0){manualBlockedAuto.add(i);continue}
    let selected=0;
    for(const id of manualMatchIds(selection)){
      const row=newRows.find(r=>r.id===id);
      if(!row||usedRecords.has(id)){invalidManual.push(i);continue}
      usedRecords.add(id);usedNodes.add(i);selected++;
      completed.push({planned:plan.doses[i],nodeIndex:i,record:{id:row.id,time:row.time,mg:row.mg},manual:true});
    }
    if(!selected){invalidManual.push(i);manualBlockedAuto.add(i)}
  }
  // Auto-match unchanged for unassigned nodes. Each actual record belongs to
  // one model node at most, even if the user manually picks multiple records.
  const pairs=[];
  for(const row of newRows){
    if(usedRecords.has(row.id))continue;
    for(let i=0;i<plan.doses.length;i++){
      if(usedNodes.has(i)||manualBlockedAuto.has(i))continue;
      const dose=plan.doses[i],left=i?Math.abs(dose.time-plan.doses[i-1].time)/2:Infinity,right=i+1<plan.doses.length?Math.abs(plan.doses[i+1].time-dose.time)/2:Infinity;
      const window=Math.max(30*60000,Math.min(2*3600000,left,right)),difference=Math.abs(row.time-dose.time);
      if(difference<=window)pairs.push({row,i,difference,doseDifference:Math.abs(row.mg-dose.mg)});
    }
  }
  pairs.sort((a,b)=>a.difference-b.difference||a.doseDifference-b.doseDifference||a.row.time-b.row.time||a.i-b.i);
  for(const {row,i} of pairs){
    if(usedRecords.has(row.id)||usedNodes.has(i)||manualBlockedAuto.has(i))continue;
    usedNodes.add(i);usedRecords.add(row.id);
    completed.push({planned:plan.doses[i],nodeIndex:i,record:{id:row.id,time:row.time,mg:row.mg}});
  }
  const matchedNodeCount=new Set(completed.map(item=>item.nodeIndex)).size;
  return{usedRecords,usedNodes,completed,matchedNodeCount,invalidManual:[...new Set(invalidManual)]};
}
function adoptedIncludedScheduledDoses(plan,actualRows=records,adoptedRows=[]){
  // Snapshot taken at adoption. Legacy plans without this field are treated
  // as unknown, never guessed from today's schedule or account history.
  if(!plan||!Array.isArray(plan.includedScheduledDoses))return [];
  const matched=[];
  for(const item of plan.includedScheduledDoses){
    if(!item||item.drug!==plan.drug||typeof item.id!=="string"||
      !Number.isFinite(item.time)||!Number.isFinite(item.mg)||item.mg<=0||item.mg>=100000||
      item.time>plan.target)continue;
    const isSame=(other)=>other&&(!other.drug||other.drug===item.drug)&&
      (other.id===item.id||
       Math.abs(other.time-item.time)<=60000&&Math.abs(other.mg-item.mg)<.0001);
    if(actualRows.some(isSame)||adoptedRows.some(isSame)||matched.some(isSame))continue;
    matched.push({id:item.id,drug:item.drug,time:item.time,mg:item.mg,
      unit:item.unit||"mg",planningOnly:true,adoptedIncluded:true});
  }
  return matched;
}
function evaluateAdoptedPlan(plan,now=Date.now()){
  const drug=DRUGS.find(d=>d.id===plan.drug),baselineIds=new Set(plan.baselineIds||[]);
  const foodChanged=typeof plan.mealSignature==="string"&&plan.mealSignature!==mealScenarioSignature(plan.drug,plan.adoptedAt,plan.target);
  const earliest=Math.min(plan.adoptedAt||now,...plan.doses.map(d=>d.time))-6*3600000;
  const newRows=records.filter(r=>r.drug===plan.drug&&!baselineIds.has(r.id)&&r.time>=earliest&&r.time<=plan.target);
  const manual=plan.manualMatches&&typeof plan.manualMatches==="object"?plan.manualMatches:{};
  const {usedRecords,usedNodes,completed,matchedNodeCount,invalidManual}=matchAdoptedPlanRecords(plan,newRows,manual);
  const missed=plan.doses.filter((dose,i)=>!usedNodes.has(i)&&dose.time<now-60000);
  const rows=inverseRecordRows(records.filter(r=>r.drug===plan.drug&&r.time<=plan.target),Math.min(now,plan.target)),cap=plan.cap?Number(plan.cap):Infinity,totalCap=Number(plan.totalMax)>0?Number(plan.totalMax):Infinity;
  const cycleFloor={value:Number(plan.cycleMin)||0,mode:plan.cycleMode==="equivalent"?"equivalent":"blood"};
  const peakRequirement={value:Number(plan.peakMin)||0,mode:plan.peakMode==="blood"?"blood":"equivalent"};
  const peakFloor=peakRequirement.mode==="equivalent"?peakRequirement.value:0;
  const remaining=Math.max(0,plan.doses.length-matchedNodeCount);
  const recordedGap=Math.max(30*60000,(Number(plans[plan.drug]?.interval)||0)*3600000);
  const replanFrom=Math.max(now,...completed.map(match=>match.record.time+recordedGap));
  const adjustment=plan.adjustment;
  // Every unconfirmed adopted node survives its planned timestamp. An
  // overdue 14:00 node is still pending review at 14:01, 15:00 or tomorrow.
  // The adopted scenario stays hypothetical until the actual entry is saved.
  let pending=adjustment?.doses?adjustment.doses.slice(Math.max(0,matchedNodeCount-adjustment.completedCount)):plan.doses.filter((dose,i)=>!usedNodes.has(i));
  // Only entries explicitly captured when adopting this result may be
  // treated as fixed future inputs in the adopted graph. Fresh unrelated
  // schedules await an actual-taken confirmation before entering the graph.
  const additionalPlans=adoptedIncludedScheduledDoses(plan,rows,pending);
  const searchRows=[...rows,...additionalPlans];
  let suggested=null,replanReason="";
  if(newRows.length||Object.keys(manual).length||foodChanged){
    suggested=[];
    if(remaining===0&&modelValue(drug,plan.target,rows,plan.mode)<plan.threshold-1e-6)replanReason="count";
    if(remaining>0&&plan.target<=replanFrom&&modelValue(drug,plan.target,rows,plan.mode)<plan.threshold-1e-6)replanReason="time";
    if(plan.target>replanFrom&&remaining>0){
      let result=solveFixedContinuousPoint(drug,searchRows,plan.threshold,plan.target,cap,replanFrom,remaining,plan.mode,peakFloor);
      result=enforcePointConstraints(drug,searchRows,result,plan.threshold,plan.target,cap,replanFrom,plan.mode,cycleFloor,peakRequirement,remaining);
      if(!result?.reason&&result.mg>totalCap+1e-6){
        const slim=solveMinimumPoint(drug,searchRows,plan.threshold,plan.target,cap,replanFrom,result,remaining,plan.mode,peakFloor);
        result=enforcePointConstraints(drug,searchRows,slim,plan.threshold,plan.target,cap,replanFrom,plan.mode,cycleFloor,peakRequirement,remaining,totalCap)||{reason:"totalNoSolution"};
        if(result.reason)result={reason:"totalNoSolution"};
      }else if(!result?.reason){
        result=enforcePointConstraints(drug,searchRows,result,plan.threshold,plan.target,cap,replanFrom,plan.mode,cycleFloor,peakRequirement,remaining,totalCap);
      }
      if(result.reason)replanReason=result.reason;
      else if(result.continuousFrom===null)replanReason="coverage";
      else{
        if(plan.variant==="B"&&result.doses.length){
          const primary=result;
          const minimum=solveMinimumPoint(drug,searchRows,plan.threshold,plan.target,cap,replanFrom,primary,remaining,plan.mode,peakFloor);
          const flat=solveFlattestPoint(drug,searchRows,plan.threshold,plan.target,cap,replanFrom,primary,minimum,remaining,plan.mode,peakFloor,cycleFloor,peakRequirement,totalCap);
          result=flat||primary;
        }else if(plan.variant==="C"&&result.doses.length){
          const minimum=solveMinimumPoint(drug,searchRows,plan.threshold,plan.target,cap,replanFrom,result,remaining,plan.mode,peakFloor);
          const checked=enforcePointConstraints(drug,searchRows,minimum,plan.threshold,plan.target,cap,replanFrom,plan.mode,cycleFloor,peakRequirement,remaining,totalCap);
          if(checked&&!checked.reason)result=checked;
        }
        suggested=result.doses;
      }
    }
  }
  // Already-saved future intakes remain fixed scenario conditions; they are
  // never counted as a real taken dose. Avoid double-counting an adopted
  // node that already represents the same saved future plan.
  const combined=[...searchRows,...pending],sample=5*60000,intervalStart=Math.min(now,plan.target);
  const points=[];for(let time=intervalStart;time<plan.target;time+=sample)points.push({time,value:modelValue(drug,time,combined,plan.mode)});
  points.push({time:plan.target,value:modelValue(drug,plan.target,combined,plan.mode)});
  let lastBelow=null;for(const point of points)if(point.value<plan.threshold-1e-6)lastBelow=point.time;
  const continuousFrom=lastBelow===null?intervalStart:lastBelow>=plan.target?null:Math.min(plan.target,lastBelow+sample);
  const modeled=points.at(-1).value;
  const proposedRows=suggested===null?null:[...searchRows,...suggested];
  const constraintStats=pointConstraintMetrics(drug,searchRows,pending,intervalStart,continuousFrom,plan.target,cycleFloor,peakRequirement);
  return{...constraintStats,at:now,replanFrom,remaining,recordSignature:adoptedRecordSignature(plan.drug),completed,matchedNodeCount,pending,suggested,missed,unmatched:newRows.filter(r=>!usedRecords.has(r.id)),candidates:newRows,invalidManual,foodChanged,replanned:!!newRows.length||!!Object.keys(manual).length||foodChanged,replanReason,plannedMg:plan.doses.reduce((sum,d)=>sum+d.mg,0),completedMg:completed.reduce((sum,d)=>sum+d.record.mg,0),pendingMg:pending.reduce((sum,d)=>sum+d.mg,0),suggestedMg:suggested?.reduce((sum,d)=>sum+d.mg,0)??null,suggestedAtTarget:proposedRows?modelValue(drug,plan.target,proposedRows,plan.mode):null,baselineNow:modelValue(drug,now,rows,plan.mode),bloodAtTarget:concentration(drug,plan.target,combined),equivalentAtTarget:totalEquivalent(drug,plan.target,combined),minLevel:Math.min(...points.map(p=>p.value)),peak:Math.max(...points.map(p=>p.value)),peakEquivalent:continuousFrom===null?0:pointEquivalentPeak(drug,rows,pending,continuousFrom,plan.target),continuousFrom,allCovered:lastBelow===null,fallingAfter:modelValue(drug,plan.target+sample,combined,plan.mode)<=modeled+1e-6};
}
let adoptedEvaluationCache=null;
function currentAdoptedEvaluation(plan){
  const now=Date.now(),key=JSON.stringify([plan,adoptedRecordSignature(plan.drug),scheduledDoses,intakes,renal,plans[plan.drug],Math.floor(now/60000)]);
  if(adoptedEvaluationCache?.key!==key)adoptedEvaluationCache={key,value:evaluateAdoptedPlan(plan,now)};
  return adoptedEvaluationCache.value;
}
let expandedMatchNode=null;
function setManualPlanMatch(plan,index,value,candidates){
  const manual={...(plan.manualMatches||{})};
  const existing=manualMatchIds(manual[index]);
  if(value==="auto"){delete manual[index];if(expandedMatchNode===index)expandedMatchNode=null}
  else if(value==="none"){manual[index]=null;if(expandedMatchNode===index)expandedMatchNode=null}
  else if(value==="manual"){
    expandedMatchNode=index;
    // Initial manual selection inherits the automatic record where available.
    const state=currentAdoptedEvaluation(plan);
    manual[index]=existing.length?existing:state.completed.filter(match=>match.nodeIndex===index).map(match=>match.record.id);
  }else if(value&&typeof value==="object"&&typeof value.id==="string"){
    if(!candidates.some(row=>row.id===value.id))return;
    expandedMatchNode=index;
    if(value.checked&&existing.length>=20&&!existing.includes(value.id)){
      alert("一个模型节点最多手动关联 20 条记录。");return;
    }
    const ownedByOther=Object.entries(manual).some(([key,ids])=>Number(key)!==index&&manualMatchIds(ids).includes(value.id));
    if(value.checked&&ownedByOther){alert("该实际服用记录已关联其他计划节点；请先取消原关联。");return}
    const ids=existing.filter(id=>id!==value.id);
    if(value.checked)ids.push(value.id);
    manual[index]=[...new Set(ids)].slice(0,20);
  }else return;
  plan.manualMatches=manual;
  appliedPointScenario=null;
  persist();
  renderPointInverse();
  drawChart();
}
function previewAdoptedMatches(plan){
  const state=currentAdoptedEvaluation(plan);
  appliedPointScenario={drug:plan.drug,target:plan.target,threshold:plan.threshold,mode:plan.mode,
    doses:state.pending,adoptedVariant:plan.variant||"A",matchedRecordIds:state.completed.map(item=>item.record.id)};
  $("scenarioTime").value="";$("scenarioDose").value="";
  if(document.body.classList.contains("app-mode"))appSetView("chart",{scroll:false});
  else setMobilePane("chart",true);
  drawChart();
  $("chartWrap").scrollIntoView({behavior:"smooth",block:"center"});
}
function adoptedPendingReviewRows(plan,state,now=Date.now()){
  if(!plan||!Array.isArray(plan.doses))return [];
  const completed=new Set(state.completed.map(item=>item.nodeIndex));
  const rows=[];
  // A newly accepted adjustment REPLACES the unconfirmed original plan.
  // Do not keep its old nodes as a second confirmation/reminder set.
  if(!Array.isArray(plan.adjustment?.doses)){
    for(const [index,dose] of plan.doses.entries()){
      if(completed.has(index)||!Number.isFinite(dose.time)||!Number.isFinite(dose.mg))continue;
      rows.push({index,time:dose.time,mg:dose.mg,kind:"adopted",drug:plan.drug});
    }
  }
  // Also keep adopted adjustment nodes in view. These are hypothetical
  // nodes and must never be silently converted to taken records.
  if(plan.adjustment?.doses){
    for(const dose of state.pending){
      if(rows.some(existing=>Math.abs(existing.time-dose.time)<=60000&&
          Math.abs(existing.mg-dose.mg)<.0001))continue;
      const index=plan.adjustment.doses.findIndex(original=>
        Math.abs(original.time-dose.time)<=60000&&Math.abs(original.mg-dose.mg)<.0001);
      if(index<0)continue;
      rows.push({index,time:dose.time,mg:dose.mg,kind:"adjusted",drug:plan.drug});
    }
  }
  for(const dose of adoptedIncludedScheduledDoses(plan,records,rows)){
    rows.push({...dose,index:-1,kind:"included"});
  }
  return rows.sort((a,b)=>Number(a.time>now)-Number(b.time>now)||a.time-b.time);
}
function renderAdoptedPendingConfirm(plan,now=Date.now()){
  const adoptedBox=$("adoptedPointPanel");if(!adoptedBox)return;
  let box=$("adoptedPendingConfirmPanel");
  if(!box){box=document.createElement("section");box.id="adoptedPendingConfirmPanel";
    box.className="adopted-confirm-priority";box.setAttribute("aria-label","待确认服用的已采用数学节点");
    adoptedBox.parentElement.insertBefore(box,adoptedBox)}
  if(!plan){box.hidden=true;box.replaceChildren();return}
  const state=currentAdoptedEvaluation(plan),list=adoptedPendingReviewRows(plan,state,now);
  box.hidden=!list.length;if(!list.length){box.replaceChildren();return}
  box.replaceChildren();
  const title=document.createElement("h3");title.textContent=`待确认服用 · ${list.length} 条数学计划节点`;
  const intro=document.createElement("p");intro.className="hint";
  intro.textContent="即使预计时间已经过去，只要没有确认实际服用，就持续显示在已采用方案上方。未确认节点仅属于数学假设，不会记为已服用。";
  box.append(title,intro);
  for(const item of list){
    const row=document.createElement("div");row.className="adopted-confirm-row";
    const detail=document.createElement("div");detail.className="adopted-confirm-text";
    const name=document.createElement("strong");name.textContent=`${fullDate(item.time)} · ${fmt(item.mg,3)} mg`;
    const status=document.createElement("small");
    status.textContent=`${item.time<=now?"已到时 · 尚未确认":"尚未到时 · 预计节点"} · ${item.kind==="included"?"采用计算时已计入的未来计划":item.kind==="adjusted"?"已采用调整节点":"已采用原方案节点"}`;
    detail.append(name,status);row.append(detail);
    const controls=document.createElement("div");controls.className="adopted-confirm-actions";
    const yes=document.createElement("button");yes.type="button";yes.className="secondary";
    yes.textContent="是 · 确认已服用";yes.disabled=item.time>now;
    yes.onclick=()=>{
      const matchedPlan=scheduledDoses.find(d=>d.drug===plan.drug&&
        (d.id===item.id||Math.abs(d.time-item.time)<=60000&&Math.abs(d.mg-item.mg)<.0001));
      if(matchedPlan){confirmScheduledTaken(matchedPlan.id);return}
      openAdoptedTakenEditor(plan,item,null);
    };
    const no=document.createElement("button");no.type="button";no.className="ghost";
    no.textContent="否 · 修改或删除";
    no.onclick=()=>{
      if(item.kind==="included"){
        const stored=scheduledDoses.find(d=>d.id===item.id);
        if(stored)editScheduledDose(stored.id);
        else{alert("这条计划已参与采用时的计算快照，但原计划记录已被删除。请通过重新计算并采用新方案修正，避免默默改变历史方案。");}
      }else if(item.kind==="adjusted"){
        editAdoptedAdjustmentNode(plan,item.index);
      }else editAdoptedNode(plan,item.index);
    };
    controls.append(yes,no);row.append(controls);box.append(row);
  }
}
function renderAdoptedPoint(plan){
  const panel=$("adoptedPointPanel"),out=$("adoptedPointResult"),state=currentAdoptedEvaluation(plan),reference={name:plan.mode==="equivalent"?"剂量等效量":"血药浓度",unit:plan.mode==="equivalent"?"mg（等效）":"mg/L"};
  panel.hidden=false;
  renderAdoptedPendingConfirm(plan);
  out.replaceChildren();out.classList.add("scenario-results");
  const intro=document.createElement("p");intro.className="scenario-intro";intro.textContent=`${targetWindow.enabled?`目标时刻限定 ${fmt(threshold,3)} ±${fmt(targetWindow.value,3)} ${unit} · `:"目标时刻至少高于参考线 · "}已采用方案 ${plan.variant||"A"}${plan.variant==="C"?"（历史方案）":""} · ${fullDate(plan.adoptedAt)} · 原方案 ${plan.doses.length} 个节点 · 目标 ${fullDate(plan.target)} · ${reference.name}参考线 ${fmt(plan.threshold,3)} ${reference.unit}${plan.cycleMin?` · 周期最低 ${fmt(plan.cycleMin,3)} ${cycleFloorUnit(plan.cycleMode)}`:""}${plan.peakMin?` · 覆盖段峰值最低 ${fmt(plan.peakMin,3)} ${cycleFloorUnit(plan.peakMode)}`:""}。后续模型节点提醒将跟随当前已采用方案和调整意见自动同步到云端；仅在设备已授权推送时送达。当前复核按本药数值残留窗口截取历史记录（不是生理清除或用药建议）。实际服用记录的时间与剂量保持原样；自动重算只生成调整意见，点击采用后才替换后续预计节点。`;out.append(intro);
  const metrics=document.createElement("div");metrics.className="scenario-metrics";
  for(const [label,value] of [["原方案总量",`${fmt(state.plannedMg,3)} mg`],["已记录匹配",`${state.matchedNodeCount} 个计划节点 · ${state.completed.length} 条实际记录 · ${fmt(state.completedMg,3)} mg`],["已采用后续节点",`${state.pending.length} 次 · ${fmt(state.pendingMg,3)} mg`],["已采用方案目标值",`${fmt(plan.mode==="equivalent"?state.equivalentAtTarget:state.bloodAtTarget,3)} ${reference.unit}`]]){const item=document.createElement("div"),small=document.createElement("small"),strong=document.createElement("strong");small.textContent=label;strong.textContent=value;item.append(small,strong);metrics.append(item)}out.append(metrics);
  const preview=document.createElement("button");preview.type="button";preview.className="secondary";
  preview.textContent="显示当前多点匹配与预计节点曲线";
  preview.addEventListener("click",()=>previewAdoptedMatches(plan));
  out.append(preview);
  if(!Array.isArray(plan.adjustment?.doses)){
  const list=document.createElement("ol");list.className="scenario-timeline";
  for(const [index,dose] of plan.doses.entries()){
    const matches=state.completed.filter(x=>x.nodeIndex===index);
    const li=document.createElement("li"),time=document.createElement("time"),amount=document.createElement("strong"),small=document.createElement("small");
    time.textContent="原计划 "+fullDate(dose.time);
    amount.textContent="原节点 "+fmt(dose.mg,3)+" mg";
    small.textContent=matches.length?
      "已关联 "+matches.length+" 条实际记录（时间和剂量保持原样）":
      state.missed.includes(dose)?"原节点已过时、未匹配":"原节点尚未匹配";
    li.append(time,amount,small);
    for(const matched of matches){
      const item=document.createElement("p");item.className="actual-match";
      item.textContent=(matched.manual?"手动":"自动")+"匹配 · "+fullDate(matched.record.time)+" · "+fmt(matched.record.mg,3)+" mg";
      li.append(item);
    }
    const actions=document.createElement("fieldset"),legend=document.createElement("legend");
    actions.className="adopted-taken-actions";legend.textContent="是否服用（仅在确认发生后登记实际记录）";actions.append(legend);
    const taken=document.createElement("button");taken.type="button";taken.className="secondary";
    taken.textContent="是 · 核对已服用";
    taken.onclick=()=>openAdoptedTakenEditor(plan,dose,matches[0]||null);
    const notTaken=document.createElement("button");notTaken.type="button";notTaken.className="ghost";
    notTaken.textContent="否 · 修改或删除";
    notTaken.onclick=()=>openAdoptedNotTakenEditor(plan,index,dose,matches[0]||null);
    actions.append(taken,notTaken);li.append(actions);
    const advanced=document.createElement("details"),advancedTitle=document.createElement("summary");
    advanced.className="adopted-advanced-match";advancedTitle.textContent="高级：关联既有实际记录";
    advanced.append(advancedTitle);
    const label=document.createElement("label"),select=document.createElement("select");
    label.className="manual-match";label.textContent="关联方式";
    select.setAttribute("aria-label","第 "+(index+1)+" 个模型节点的匹配方式");
    for(const [v,title] of [["auto","自动匹配（最近记录）"],["manual","手动多选实际记录"],["none","不匹配此节点"]]){
      const option=document.createElement("option");option.value=v;option.textContent=title;select.append(option);
    }
    const manual=plan.manualMatches||{},raw=manual[index];
    select.value=Object.hasOwn(manual,index)?raw===null?"none":"manual":"auto";
    select.addEventListener("change",()=>setManualPlanMatch(plan,index,select.value,state.candidates));
    label.append(select);advanced.append(label);
    if(select.value==="manual"){
      const details=document.createElement("details"),summary=document.createElement("summary"),options=document.createElement("div");
      details.className="match-multi-disclosure";options.className="match-multi-options";
      details.open=expandedMatchNode===index;
      details.addEventListener("toggle",()=>{
        if(!details.isConnected)return;
        if(details.open)expandedMatchNode=index;
        else if(expandedMatchNode===index)expandedMatchNode=null;
      });
      const selected=manualMatchIds(raw);
      summary.textContent="选择多个匹配点 · 已选 "+selected.length+" 条";
      details.append(summary);
      const candidates=[...state.candidates].sort((a,b)=>Math.abs(a.time-dose.time)-Math.abs(b.time-dose.time));
      const shown=[...new Map([...candidates.filter(row=>selected.includes(row.id)),
        ...candidates.slice(0,80)].map(row=>[row.id,row])).values()];
      for(const row of shown){
        const other=Object.entries(manual).some(([key,ids])=>Number(key)!==index&&manualMatchIds(ids).includes(row.id));
        const optionLabel=document.createElement("label"),checkbox=document.createElement("input");
        checkbox.type="checkbox";checkbox.checked=selected.includes(row.id);
        checkbox.disabled=(other||selected.length>=20)&&!checkbox.checked;
        checkbox.setAttribute("aria-label",fullDate(row.time)+" · "+fmt(row.mg,3)+" mg");
        checkbox.addEventListener("change",()=>setManualPlanMatch(plan,index,{id:row.id,checked:checkbox.checked},state.candidates));
        optionLabel.append(checkbox,document.createTextNode(" "+fullDate(row.time)+" · "+fmt(row.mg,3)+" mg"+(other?" · 已分配其他节点":"")));
        options.append(optionLabel);
      }
      if(candidates.length>80){
        const note=document.createElement("p");note.className="hint";
        note.textContent="优先显示离该计划节点最近的 80 条记录。";options.append(note);
      }
      if(!shown.length){const empty=document.createElement("p");empty.className="hint";empty.textContent="目前没有可关联的新增实际服用记录。";options.append(empty)}
      const hint=document.createElement("p");hint.className="hint";
      hint.textContent="每节点最多关联 20 条；只建立关系，不复制记录，不重复计算实际服用量。";
      details.append(options,hint);advanced.append(details);
    }
    li.append(advanced);
    list.append(li);
  }
  out.append(list);
  }else{
    const retired=document.createElement("p");retired.className="scenario-intro";
    retired.textContent=`前一版原方案的 ${plan.doses.length} 个节点已由当前已采用调整方案替换，不再生成旧节点的服用确认或提醒。旧数学参数仅保留作方案复核，真实服用记录不受影响。`;
    out.append(retired);
  }
  if(state.unmatched.length){const heading=document.createElement("strong");heading.className="scenario-replan-heading";heading.textContent="未关联的实际服用记录 · 原时间保留";out.append(heading);const unmatchedList=document.createElement("ol");unmatchedList.className="scenario-timeline";for(const row of [...state.unmatched].sort((a,b)=>a.time-b.time)){const li=document.createElement("li"),time=document.createElement("time"),amount=document.createElement("strong"),note=document.createElement("small");time.textContent=fullDate(row.time);amount.textContent=`${fmt(row.mg,3)} mg`;note.textContent="记录时间和剂量未改；反算按本药残留窗口读取，且这条记录未替换任何原计划节点。若属于某节点，可在上方手动关联。";li.append(time,amount,note);unmatchedList.append(li)}out.append(unmatchedList)}
  if(state.pending.length){const heading=document.createElement("strong");heading.className="scenario-replan-heading";heading.textContent=plan.adjustment?"当前已采用的调整节点 · 曲线显示":"当前已采用的原计划后续节点 · 曲线显示";out.append(heading);const pendingList=document.createElement("ol");pendingList.className="scenario-timeline";for(const dose of state.pending){const li=document.createElement("li"),time=document.createElement("time"),amount=document.createElement("strong");time.textContent=fullDate(dose.time);amount.textContent=`预计 ${fmt(dose.mg,3)} mg`;li.append(time,amount);pendingList.append(li)}out.append(pendingList)}
  if(state.replanned){const accepted=samePlanNodes(state.suggested,state.pending)&&!state.replanReason,heading=document.createElement("strong");heading.className="scenario-replan-heading";heading.textContent=accepted?"当前调整意见已采用 · 曲线已更新":"调整意见 · 尚未采用";out.append(heading);if(!accepted){const basis=document.createElement("p");basis.className="scenario-intro";basis.textContent=`依据已记录的实际时间与剂量，从 ${fullDate(state.replanFrom)} 起搜索剩余 ${state.remaining} 个节点。当前曲线仍显示已采用的后续节点。`;out.append(basis);const revised=document.createElement("ol");revised.className="scenario-timeline";for(const dose of state.suggested||[]){const li=document.createElement("li"),time=document.createElement("time"),amount=document.createElement("strong"),parts=document.createElement("small");time.textContent=fullDate(dose.time);amount.textContent=`建议模型节点 ${fmt(dose.mg,3)} mg`;parts.textContent=formatDoseContext(dose);li.append(time,amount,parts);revised.append(li)}if(state.suggested?.length)out.append(revised);else{const empty=document.createElement("p");empty.className="scenario-empty";empty.textContent=state.replanReason==="count"?"原方案节点已由记录用完，但目标时刻仍低于参考值。":state.replanReason==="time"?"按实际时间和间隔，目标时刻前已没有可用的后续节点。":state.replanReason?"当前约束与有限候选搜索下未找到调整节点。":"根据当前记录，无需保留后续假设节点。";out.append(empty)}if(!state.replanReason&&state.suggested){const proposal=document.createElement("p");proposal.className="scenario-status";proposal.textContent=`调整意见：预计剩余 ${state.suggested.length} 次 · 合计 ${fmt(state.suggestedMg,3)} mg · 目标时刻模型值约 ${fmt(state.suggestedAtTarget,3)} ${reference.unit}。实际服用记录不会因采用而改变。`;out.append(proposal);const accept=document.createElement("button");accept.type="button";accept.className="secondary adopt-adjustment";accept.textContent="采用调整意见";accept.onclick=()=>adoptPlanAdjustment(plan);out.append(accept)}}}
  const status=document.createElement("p");status.className="scenario-status";status.textContent=`按当前记录核算于 ${fullDate(state.at)} · 目标时刻血药 ${fmt(state.bloodAtTarget,3)} mg/L · 剂量等效 ${fmt(state.equivalentAtTarget,1)} mg · ${state.continuousFrom===null?"目标前存在未覆盖缺口":state.allCovered?"采样均高于参考线":`从 ${fullDate(state.continuousFrom)} 起的采样高于参考线`}${plan.cycleMin?` · 周期最低 ${fmt(state.cycleObserved,3)} ${cycleFloorUnit(plan.cycleMode)}（${state.cycleValid?"满足":"未满足"}）`:""}${plan.peakMin?` · 覆盖段峰值 ${Number.isFinite(state.peakObserved)?fmt(state.peakObserved,3):"无覆盖段"} ${cycleFloorUnit(plan.peakMode)}（${state.peakValid?"满足":"未满足"}）`:""}`;out.append(status);
  const caution=document.createElement("p");caution.className="scenario-caution";caution.textContent=`自动匹配选时间最近的原节点，偏差范围不超过相邻计划间隔的一半且最多 2 小时；实际记录的时间和剂量不会改写。超出匹配范围的记录保留原时间，反算按 48 小时窗口规则读取，可在原节点手动关联。${state.unmatched.length?`当前有 ${state.unmatched.length} 条未关联实际记录，若同时保留原计划预计节点，曲线会计入两者；请核对是否需要手动关联或采用调整意见。`:""}${state.invalidManual.length?`${state.invalidManual.length} 个手动选择已失效，请重新选择。`:""}${state.replanReason?"当前剩余搜索无解，不代表可以忽略目标缺口。":""}这是有限候选数学情景，不是服药建议。`;out.append(caution);
}
function adoptPlanAdjustment(plan){
  if(!authUser){alert("请先登录账号，再采用调整意见。");return}
  const state=currentAdoptedEvaluation(plan);
  if(!state.replanned||state.replanReason||!state.suggested||samePlanNodes(state.suggested,state.pending))return;
  plan.adjustment={doses:structuredClone(state.suggested),completedCount:state.matchedNodeCount,adoptedAt:Date.now()};
  appliedPointScenario=null;persist();renderPointInverse();drawChart();
}
let pointWorker=null,pointRequestId=0,pointInputTimer=null;
function cancelPointInverse(){
  pointRequestId++;
  if(pointWorker){pointWorker.terminate();pointWorker=null}
}
function schedulePointInverse(){
  cancelPointInverse();clearTimeout(pointInputTimer);
  $("pointResult").textContent="输入完成后正在更新模型…";
  pointScenario=null;minimumPointScenario=null;
  $("pointPreview").hidden=true;$("pointMinimumPreview").hidden=true;
  pointInputTimer=setTimeout(()=>{renderPointInverse();drawChart()},350);
}
function solvePointInWorker(input,id){
  return new Promise((resolve,reject)=>{
    const worker=new Worker("./inverse-worker.js?v=server-math-20261117b");
    pointWorker=worker;
    worker.onmessage=event=>{if(event.data.id!==id)return;if(pointWorker===worker)pointWorker=null;worker.terminate();if(event.data.error)reject(new Error(event.data.error));else resolve(event.data)};
    worker.onerror=event=>{if(pointWorker===worker)pointWorker=null;worker.terminate();reject(new Error(event.message||"后台计算未能完成"))};
    worker.postMessage({id,...input,modelCatalog:typeof PKVerifiedWebCatalog!=="undefined"&&PKVerifiedWebCatalog?
      {catalog:PKVerifiedWebCatalog.catalog,engineVersion:PKVerifiedWebCatalog.engineVersion,
       version:PKVerifiedWebCatalog.version}:null});
  });
}
async function renderPointInverse(){
  cancelPointInverse();clearTimeout(pointInputTimer);
  const requestId=pointRequestId;
  if(chosen().recordOnly){$("pointResult").textContent="FTC/TAF 是双成分复方，现有单药血浆模型不能反算 PrEP 服用时间或剂量。请按处方核对。";$("adoptedPointPanel").hidden=true;$("pointPreview").hidden=true;$("pointMinimumPreview").hidden=true;return}
  if(referencePending){$("pointResult").textContent="参考值尚未确定。点击“确定并计算”后更新反算方案。";pointScenario=null;minimumPointScenario=null;$("pointPreview").hidden=true;$("pointMinimumPreview").hidden=true;return}
  const out=$("pointResult"),reference=referenceSetting(),{raw:rawThreshold,value:threshold,mode,unit}=reference;
  const adopted=adoptedPlan();$("adoptedPointPanel").hidden=!adopted;
  if(adopted)renderAdoptedPoint(adopted);
  else renderAdoptedPendingConfirm(null);
  $("pointLive").hidden=!adopted;
  pointScenario=null;minimumPointScenario=null;$("pointPreview").hidden=true;$("pointMinimumPreview").hidden=true;
  if(!rawThreshold){out.textContent="先填写一种要观察的参考值。";return}
  if(!Number.isFinite(threshold)||threshold<=0){out.textContent=`参考值须为大于 0 的 ${unit} 数值。`;return}
  const target=new Date($("pointTarget").value).getTime(),now=Date.now(),capText=$("pointMaxDose").value.trim(),cap=capText?Number(capText):Infinity,drug=chosen(),countText=$("pointCount").value.trim(),fixedCount=countText?Number(countText):null;
  const totalText=$("pointTotalMax").value.trim(),totalCap=totalText?Number(totalText):Infinity;
  const peakText=$("pointPeakMin").value.trim(),peakFloor=peakText?Number(peakText):0;
  const cycleText=$("pointCycleMin").value.trim(),cycleMin=cycleText?Number(cycleText):0;
  const peakMode=$("pointPeakMode").value,cycleMode=$("pointCycleMode").value;
  const cycleFloor={value:cycleMin,mode:cycleMode},peakRequirement={value:peakFloor,mode:peakMode};
  const targetWindow={enabled:$("pointTargetLimitEnabled").checked,
    value:Number(mode==="blood"?$("pointTargetLimitBlood").value:$("pointTargetLimitEquivalent").value)};
  const modeUnit=setting=>setting==="equivalent"?"mg（等效）":"mg/L";
  if(targetWindow.enabled&&(!Number.isFinite(targetWindow.value)||targetWindow.value<=0||targetWindow.value>1000000)){
    out.textContent="已开启目标时刻精度限定，请输入大于零且不超过100万的有效偏差值。";return;
  }
  if(!Number.isFinite(target)||target<=now){out.textContent="请选择未来的目标时刻。";return}
  if(target-now>24*3600000){out.textContent="本模型最多检查未来 24 小时；请选择更近的目标时刻。";return}
  if(capText&&(!Number.isFinite(cap)||cap<=0)){out.textContent="单次假设剂量上限须为大于 0 的 mg 数值。";return}
  if(totalText&&(!Number.isFinite(totalCap)||totalCap<=0||totalCap>1000000)){out.textContent="累计新增预计剂量上限须为大于 0、至多 1,000,000 的 mg 数值。";return}
  if(countText&&(!Number.isInteger(fixedCount)||fixedCount<1||fixedCount>8)){out.textContent="假设服用次数请留空，或填写 1—8 的整数。";return}
  if(peakText&&(!Number.isFinite(peakFloor)||peakFloor<=0||peakFloor>1000000)){out.textContent=`覆盖段峰值最低值须为大于 0、至多 100 万的 ${modeUnit(peakMode)} 数值。`;return}
  if(cycleText&&(!Number.isFinite(cycleMin)||cycleMin<=0||cycleMin>1000000)){out.textContent=`周期最低值须为大于 0、至多 100 万的 ${modeUnit(cycleMode)} 数值。`;return}
  const activePlans=futurePreviewNodes(drug.id).filter(r=>r.time<=target);
  const rows=[...inverseRecordRows(allRows().filter(r=>r.time<=now),now),...activePlans.map(r=>({...r,planningOnly:true}))];
  if(cycleMin>0&&modelValue(drug,now,rows,cycleMode)<cycleMin-1e-6){
    out.textContent=`当前 ${modeUnit(cycleMode)} 模型值 ${fmt(modelValue(drug,now,rows,cycleMode),3)} 已低于设定的全周期最低 ${fmt(cycleMin,3)}；口服吸收不能立刻改变已发生的缺口，所以本约束无解。`;return
  }
  out.textContent=`正在后台计算；已把 ${activePlans.length} 条未来计划作为固定数学情景，并只搜索新增假设节点。计划不计实际服用。`;
  let result,minimum,comparison;
  try{
    ({result,minimum,comparison}=await solvePointInWorker({drugId:drug.id,rows,plan:plans[drug.id]||{},meals:intakes,renalState:renal,threshold,target,cap,now,fixedCount,mode,peakFloor,cycleFloor,peakRequirement,totalCap,targetWindow},requestId));
  }catch(error){
    if(requestId===pointRequestId)out.textContent=`后台计算未完成：${error.message}。请刷新页面后重试。`;
    return;
  }
  if(requestId!==pointRequestId||current!==drug.id||!document.body.classList.contains("stage-calc"))return;
  if(result.reason==="targetWindowUnreached"){
    out.textContent=`已经检查有限候选，但没有找到目标时刻落入 ${fmt(threshold,3)} ±${fmt(targetWindow.value,3)} ${unit} 的有效情景。当前搜索不保证覆盖全部组合，不能认定绝对无解；可扩大容差或调整约束。`;
    return;
  }
  if(result.reason==="specs"){out.textContent=`请先为${drug.name}保存实际持有的药盒规格；本板块不会再输出无法由完整单位组成的零散剂量。`;return}
  if(result.reason==="cap"){out.textContent="当前单次上限低于最小完整药盒单位，模型找不到可用的剂量组合。";return}
  if(result.reason==="fixedNoSolution"){out.textContent=`在指定 ${fixedCount} 次、已有完整规格与时间候选范围内，无法同时满足参考线与所有已启用的最低值限制。`;return}
  if(result.reason==="boundedSearchIncomplete"){
    const unit=modeUnit(result.checkedMode||peakMode);
    const observed=Number.isFinite(result.checkedPeak)?`；已检查候选的覆盖峰值为 ${fmt(result.checkedPeak,3)} ${unit}`:"";
    const nodes=Number.isInteger(result.checkedDoseNodes)?`；已检查 ${result.checkedDoseNodes} 个模型节点`:"";
    out.textContent=`当前有界数学搜索未找到满足全部输入约束的候选${nodes}${observed}。算法尚未遍历所有新增节点组合，所以不能判断数学上无解。请调整节点数量、时间范围或输入约束；没有设置医学剂量上限，模型不对安全剂量作任何判断。`;
    return;
  }
  if(result.reason==="cycleAlreadyBelow"){out.textContent=`本周期起点的模型值 ${fmt(result.cycleStart,3)} ${modeUnit(cycleMode)} 已低于周期最低要求 ${fmt(cycleMin,3)}，口服吸收无法立即补足；约束无解。`;return}
  if(result.reason==="totalNoSolution"){out.textContent=`在当前药盒规格、节点次数及其余条件下，搜索不到累计新增剂量不超过 ${fmt(totalCap,3)} mg 的模型方案。不会输出超出限制的方案。`;return}
  if(["cycleNoSolution","peakNoSolution","constraintNoSolution"].includes(result.reason)){out.textContent="在已有完整规格、单次上限与搜索范围内，无法同时满足参考线、整个周期最低值和覆盖段峰值要求。请核对约束与单位；不会采用不满足条件的方案。";return}
  if(result.continuousFrom===null||result.continuousFrom>=target){out.textContent="仅计计算起点前后各 48 小时的记录，当前搜索范围内无法形成持续覆盖到目标时刻的区间。口服吸收无法立刻补足已有缺口；请勿据此自行调整用药。";return}
  // Keep the exact fixed future nodes used in the solved scenario. Do not
  // re-select from mutable cloud settings when a user clicks Adopt later.
  const calculatedPlans=activePlans.map(item=>({id:item.id,drug:item.drug,
    time:item.time,mg:item.mg,unit:item.unit||"mg"}));
  pointScenario={drug:current,target,threshold,mode,cycleFloor,peakRequirement,targetWindow,
    includedScheduledDoses:calculatedPlans,...result};
  if(minimum)minimumPointScenario={drug:current,target,threshold,mode,cycleFloor,peakRequirement,targetWindow,
    includedScheduledDoses:calculatedPlans,...minimum};
  const previewA=$("pointPreview"),previewB=$("pointMinimumPreview");
  previewA.hidden=!result.doses.length;previewB.hidden=!minimum?.doses.length;
  previewA.textContent="在曲线中查看方案 A";previewB.textContent="在曲线中查看方案 B";
  out.replaceChildren();out.classList.add("scenario-results");
  const label=capText?`单次假设上限 ${fmt(cap,3)} mg`:`未填写单次上限；候选仍受已存完整规格及每节点最多 8—20 单位的搜索边界限制`;
  const totalLabel=totalText?` · 当前至目标累计新增上限 ${fmt(totalCap,3)} mg`:"";
  const intro=document.createElement("p");intro.className="scenario-intro";intro.textContent=`已含 ${activePlans.length} 条固定计划（仅数学预测，非实际服用） · ${drug.name} · 当前${reference.name}模型 ${fmt(result.baselineNow,3)} ${unit} · ${label}${totalLabel}${cycleMin>0?` · 全周期最低 ${fmt(cycleMin,3)} ${modeUnit(cycleMode)}`:""}${peakFloor>0?` · 覆盖段峰值最低 ${fmt(peakFloor,3)} ${modeUnit(peakMode)}`:""}。反算按本药残留窗口截取历史记录；更早的数值残留不计。各方案在同一覆盖区间比较，每 5 分钟采样验证。${futureMealNotice(drug,now,target)}`;out.append(intro);
  out.append(scenarioCard({title:"方案 A · 自动补充节点",badge:fixedCount?`指定 ${fixedCount} 次`:"系统计算",result,threshold,target,description:fixedCount===2?"两次情景按 5 分钟步长比较第二个节点，并核对完整药盒单位。":"按照有限候选节点搜索得到的模型情景。",preview:previewA,adopt:()=>adoptPointScenario("A"),reference}));
  if(minimum){
    const aSwing=comparison?.a?.swing,bSwing=comparison?.newModel?.swing;
    const label=Number.isFinite(bSwing)?"血药峰谷差 "+fmt(bSwing,3)+" mg/L":"平稳优先";
    const improved=Number.isFinite(aSwing)&&Number.isFinite(bSwing)&&bSwing<aSwing-1e-6;
    out.append(scenarioCard({title:"方案 B · 血药曲线平稳优先",badge:label,
      result:minimum,threshold,target,
      description:"先降低同一覆盖段内血药浓度峰谷差，波动相近时比较离散程度及总剂量。"+
        "完整规格、参考线、全部最低值与累计上限仍为硬约束；B 的新增总量不超过 A。"+
        (improved?"已找到比 A 更平稳的有限候选。":"当前搜索未找到比 A 更低的峰谷差，可能与 A 相同。"),
      preview:previewB,adopt:()=>adoptPointScenario("B"),reference}));
  }
  if(comparison?.b){const info=document.createElement("p");info.className="scenario-caution";info.textContent=`同区间稳定性比较（1 分钟血药采样）：A 峰谷差 ${fmt(comparison.a.swing,3)} mg/L，最少剂量中间候选 ${fmt(comparison.b.swing,3)} mg/L${comparison.newModel?`，新平稳候选 ${fmt(comparison.newModel.swing,3)} mg/L`:"；未找到进一步改善的平稳候选"}。新约束均已重新验证。`;out.append(info)}
  const note=document.createElement("p");note.className="scenario-caution";note.textContent=`${result.baselineNow<threshold?"当前已低于参考线，口服吸收前的缺口不能被补服消除。":""}${result.limited?"方案 A 已触及 12 节点搜索上限。":""}${!result.fallingAfter?"方案 A 在目标后仍可能上升。":""}${Math.max(result.mg,minimum?.mg||0)>drug.refDose*4?"模型剂量超过参考单次剂量四倍，线性外推尤其不可靠。":""}48 小时外残留已排除；清除较慢时结果可能偏低。所有时间与剂量只是数学情景，不是服药建议；参考线也不是已验证的治疗阈值。`;out.append(note);
}
function adoptPointScenario(variant){
  if(!authUser){alert("请先登录账号，再采用模型方案。");return}
  if(!["A","B"].includes(variant))return;
  const selected=variant==="B"?minimumPointScenario:pointScenario;
  if(!selected||selected.drug!==current||!selected.doses?.length)return;
  const now=Date.now(),plan={v:1,variant,drug:current,adoptedAt:now,target:selected.target,threshold:selected.threshold,mode:selected.mode,cap:$("pointMaxDose").value.trim(),totalMax:Number($("pointTotalMax").value)||0,count:$("pointCount").value.trim(),peakMin:Number($("pointPeakMin").value)||0,peakMode:$("pointPeakMode").value,cycleMin:Number($("pointCycleMin").value)||0,cycleMode:$("pointCycleMode").value,targetLimitEnabled:$("pointTargetLimitEnabled").checked,
    targetTolerance:$("pointTargetLimitEnabled").checked?Number(selected.targetWindow?.value??0):0,baselineIds:records.filter(r=>r.drug===current).map(r=>r.id),doses:structuredClone(selected.doses),
    includedScheduledDoses:structuredClone(selected.includedScheduledDoses||[]),manualMatches:{},mealSignature:mealScenarioSignature(current,now,selected.target)};
  inverseMemory[current]={...(inverseMemory[current]||{}),adoptedPointPlan:plan};persist();appliedPointScenario=null;renderPointInverse();drawChart();
}
let inverseWorker=null,inverseRequestId=0,inverseInputTimer=null;
function cancelDurationInverse(){
  inverseRequestId++;
  if(inverseWorker){inverseWorker.terminate();inverseWorker=null}
}
function scheduleDurationInverse(){
  cancelDurationInverse();clearTimeout(inverseInputTimer);
  $("inverseResult").textContent="输入完成后正在更新模型…";
  inverseScenario=null;$("inversePreview").hidden=true;
  inverseInputTimer=setTimeout(renderInverse,350);
}
function solveDurationInWorker(input,id){
  return new Promise((resolve,reject)=>{
    const worker=new Worker("./inverse-worker.js?v=server-math-20261117b");
    inverseWorker=worker;
    worker.onmessage=event=>{if(event.data.id!==id)return;if(inverseWorker===worker)inverseWorker=null;worker.terminate();if(event.data.error)reject(new Error(event.data.error));else resolve(event.data)};
    worker.onerror=event=>{if(inverseWorker===worker)inverseWorker=null;worker.terminate();reject(new Error(event.message||"后台计算未能完成"))};
    worker.postMessage({id,kind:"duration",...input,modelCatalog:typeof PKVerifiedWebCatalog!=="undefined"&&PKVerifiedWebCatalog?
      {catalog:PKVerifiedWebCatalog.catalog,engineVersion:PKVerifiedWebCatalog.engineVersion,
       version:PKVerifiedWebCatalog.version}:null});
  });
}
async function renderInverse(){
  cancelDurationInverse();clearTimeout(inverseInputTimer);
  const requestId=inverseRequestId;
  if(chosen().recordOnly){$("inverseResult").textContent="FTC/TAF 复方暂不支持按持续时长反算。";$("inversePreview").hidden=true;return}
  if(referencePending){$("inverseResult").textContent="参考值尚未确定。点击“确定并计算”后更新反算方案。";inverseScenario=null;$("inversePreview").hidden=true;return}
  const out=$("inverseResult"),reference=referenceSetting(),{raw:rawThreshold,value:threshold,mode,unit}=reference;
  inverseScenario=null;$("inversePreview").hidden=true;
  if(!rawThreshold){out.textContent="先填写一种参考值，再查看连续时长的模型反算。";return}
  if(!Number.isFinite(threshold)||threshold<=0){out.textContent=`参考值须为大于 0 的有效数值，单位为 ${unit}。`;return}
  const start=new Date($("targetStart").value).getTime(),hours=Number($("holdHours").value),now=Date.now();
  if(!Number.isFinite(start)){out.textContent="请选择希望开始连续高于参考线的时间。";return}
  if(start<now-60000){out.textContent="目标开始时间已过去；请选择当前或未来时间。";return}
  if(!Number.isFinite(hours)||hours<0.25||hours>24){out.textContent="连续维持时长请输入 0.25—24 小时。";return}
  const d=chosen(),activePlans=futurePreviewNodes(d.id).filter(r=>r.time<=start+hours*3600000),
    rows=[...inverseRecordRows(allRows().filter(r=>r.time<=now),start),...activePlans.map(r=>({...r,planningOnly:true}))];
  out.textContent=`正在后台计算持续时长情景；已纳入 ${activePlans.length} 条既有计划，且未当作真实已服用。`;
  let result,display;
  try{
    ({result,display}=await solveDurationInWorker({drugId:d.id,rows,plan:plans[d.id]||{},meals:intakes,renalState:renal,threshold,start,hours,now,mode,countText:$("inverseCount").value.trim()},requestId));
  }catch(error){
    if(requestId===inverseRequestId)out.textContent=`后台计算未完成：${error.message}。请刷新页面后重试。`;
    return;
  }
  if(requestId!==inverseRequestId||current!==d.id||!document.body.classList.contains("stage-calc"))return;
  if(result?.alreadyAbove){out.textContent=`按当前已记录的${d.name}${reference.name}模型曲线，${fullDate(start)} 至 ${fullDate(start+hours*3600000)} 的采样点已高于 ${fmt(threshold,3)} ${unit}；模型无需叠加新的单次剂量。这不表示可以停药或漏服。`;return}
  if(result?.reason==="specs"){out.textContent=`请先为${d.name}保存至少一种实际持有的药盒规格；模型不会输出无法由完整单位组成的剂量。`;return}
  if(result?.reason==="count"){out.textContent="服用次数请留空，或填写 1—8 的整数。";return}
  if(result?.reason==="cap"){out.textContent="当前保存的处方单次剂量上限小于最小药盒规格；请核对所填数据。";return}
  if(!result){out.textContent="仅计目标开始时刻前后各 48 小时的记录：在当前药盒规格、服用次数和已保存处方约束下，有限候选搜索没有找到覆盖整段的组合。口服吸收并非瞬时；这不证明临床上不存在其他方案。";return}
  const warning=result.mg>d.refDose*4?`该反算剂量超过本模型参考研究单次剂量 ${fmt(d.refDose)} mg 的 4 倍，外推极不可靠。`:"";
  inverseScenario={drug:current,target:start+hours*3600000,threshold,mode,doses:result.doses};$("inversePreview").hidden=false;
  const end=start+hours*3600000;
  out.replaceChildren();out.classList.add("scenario-results");
  out.append(scenarioCard({title:"持续时长模型情景",badge:`${result.count} 个节点`,result:display,threshold,target:end,description:`已含 ${activePlans.length} 条固定未来计划（非实际服用）。${fullDate(start)} 至 ${fullDate(end)}，每 5 分钟采样检查${reference.name}。反算按本药有效残留窗口读取历史记录；更早的残留不计。${futureMealNotice(d,now,end)}`,coverageLabel:"指定时段内的采样均达到参考线",reference,reminderKind:"duration"}));
  const note=document.createElement("p");note.className="scenario-caution";note.textContent=`${warning}48 小时外残留已排除；清除较慢时结果可能偏低。仅搜索已存完整单位与有限候选时刻；这是数学情景，不是服药时间或剂量建议。`;out.append(note);
}
/* Distinct curve, reference, and target colours. */
const CHART_COLORS=Object.freeze({
  blood:"#ffca83",equivalent:"#58e5c4",unfed:"#b9c4d2",
  reference:"#ff5da8",referenceEquivalent:"#d7fc72",
  previewBlood:"#55aaff",previewEquivalent:"#cb9cff",target:"#ff9257"
});
// Prefer the canonical 181 mathematical curve online. Local deterministic
// model remains available without server connectivity.
let pkServerCurveCache=null,pkServerCurvePending=null,pkServerCurveFailure=null;
function pkServerCurveClear(){
  pkServerCurveCache=null;pkServerCurvePending=null;pkServerCurveFailure=null;
}
function pkServerCurveKey(payload){return JSON.stringify(payload)}
function pkServerCurveRequest(key,payload){
  if(pkServerCurveCache?.key===key||pkServerCurvePending===key||!navigator.onLine)return;
  if(pkServerCurveFailure?.key===key&&Date.now()-pkServerCurveFailure.at<30000)return;
  pkServerCurvePending=key;
  const requestVersion=typeof PKVerifiedWebCatalog!=="undefined"?PKVerifiedWebCatalog?.version:null;
  void fetch("/api/native/math/samples",{
    method:"POST",credentials:"omit",cache:"no-store",
    headers:{"Content-Type":"application/json","Accept":"application/json"},
    body:JSON.stringify(payload)
  }).then(async response=>{
    if(!response.ok)throw Error("181 数学模型 HTTP "+response.status);
    const result=await response.json();
    if(result.source!=="181-server-math"||
       result.engineVersion!==PK_MODEL_ENGINE_VERSION||
       (requestVersion&&result.catalogVersion!==requestVersion)||
       !Array.isArray(result.points)||result.points.length!==payload.times.length||
       result.points.some((p,i)=>Math.abs(p.time-payload.times[i])>1||
         ![p.bloodMgL,p.equivalentMg,p.unfedMgL].every(v=>Number.isFinite(v)&&v>=0)||
         (payload.planned.length>0&&
          ![p.plannedBloodMgL,p.plannedEquivalentMg].every(v=>Number.isFinite(v)&&v>=0))))
       throw Error("服务器和本地引擎、目录或采样数据不一致");
    if(pkServerCurvePending!==key)return;
    pkServerCurveCache={key,points:result.points,serverKernel:result.serverKernelSha256};
    pkServerCurveFailure=null;
    if(document.body.classList.contains("stage-calc"))drawChart();
  }).catch(error=>{
    if(pkServerCurvePending===key){
      pkServerCurveFailure={key,at:Date.now(),message:String(error.message||error)};
      const node=document.getElementById("chartCaption");
      if(node)node.textContent+=" · 本地模型（服务器求值暂不可用）";
    }
  }).finally(()=>{if(pkServerCurvePending===key)pkServerCurvePending=null});
}
function drawChart(){
  const d=chosen(),rows=allRows(),svg=$("chart"),wrap=$("chartWrap");
  wrap.hidden=!!d.recordOnly;document.querySelector(".chart-panel .probe").hidden=!!d.recordOnly;document.querySelector(".chart-panel .legend").hidden=!!d.recordOnly;$("quickReference").hidden=!!d.recordOnly;
  if(d.recordOnly){svg.replaceChildren();svg.style.width="100%";svg.style.height="100%";chartView=null;$("timeScrubber").disabled=true;$("probeReadout").textContent="复方无单一曲线";$("probeValues").replaceChildren();$("chartCaption").textContent="FTC/TAF 是双成分复方：FTC、TAF 与细胞内活性代谢物不能合成一条有意义的血药浓度曲线。所选日期的服用记录仍保留在左侧与历史中。";$("peakConc").textContent="不适用";$("peakEquivalent").textContent="不适用";$("crossingResult").textContent="复方没有单一血药浓度参考线；此处不作下降交点计算。";$("chartMealStatus").hidden=true;$("insight").textContent="此复方的血浆药代参数不等于 HIV 预防保护水平。";return}
  const previous=chartView,previousScroll=wrap.scrollLeft,previousViewport=wrap.clientWidth;svg.replaceChildren();
  const mobile=window.innerWidth<560,H=mobile?300:390,L=mobile?42:59,R=mobile?54:65,T=25,B=mobile?83:94;
  const adopted=adoptedPlan();
  const activeScenario=appliedPointScenario?.drug===current?appliedPointScenario:adopted?(()=>{const state=currentAdoptedEvaluation(adopted);return{drug:current,target:adopted.target,threshold:adopted.threshold,mode:adopted.mode,doses:state.pending,adoptedVariant:adopted.variant||"A"}})():null;
  const manual=activeScenario?null:getScenario(),multi=activeScenario?.doses||null;
  const scenario=multi?{time:multi[0]?.time??activeScenario.target,mg:0,doses:multi}:manual,scenarioTime=scenario&&!scenario.invalid?scenario.time:null;
  const separatePreview=scenario&&!scenario.invalid?(scenario.doses||[{time:scenario.time,mg:scenario.mg}]):[];
  const previewRows=adopted
    ? [...separatePreview,...adoptedIncludedScheduledDoses(adopted,rows,separatePreview)]
       .filter((item,index,array)=>!array.slice(0,index).some(other=>
         Math.abs(other.time-item.time)<=60000&&Math.abs(other.mg-item.mg)<.0001))
    : futurePreviewNodes(current,separatePreview);
  const now=Date.now(),start=dayStart(selectedDate),end=start+48*3600000;
  const scale=Number($("chartScale").value)||55;
  const W=Math.min(16000,Math.max(mobile?360:760,wrap.clientWidth||0,Math.ceil((end-start)/3600000*scale)+L+R));
  svg.setAttribute("viewBox",`0 0 ${W} ${H}`);svg.style.width=`${W}px`;svg.style.height=`${H}px`;
  const reference=referenceSetting(),threshold=reference.value,referenceEquivalent=reference.mode==="equivalent";
  const count=Math.min(600,Math.max(288,Math.ceil(W/5))),points=[],modelRows=rows.filter(r=>r.time>=start-residualWindowHours(d)*3600000&&r.time<=end);
  const times=Array.from({length:count+1},(_,i)=>Math.round(start+(end-start)*i/count));
  const allMeals=intakes.filter(m=>m.kind==="meal"&&m.time>=start-3*86400000&&m.time<=end+86400000);
  const validRemoteInputs=modelRows.length<=300&&previewRows.length<=30&&allMeals.length<=160&&
    modelRows.every(r=>r.time>=start-180*86400000);
  const mathRequest={
    drugId:d.id,times,
    records:modelRows.map(r=>({drug:d.id,time:Math.round(r.time),mg:r.mg})),
    planned:previewRows.map(r=>({drug:d.id,time:Math.round(r.time),mg:r.mg})),
    meals:allMeals.map(m=>({kind:"meal",time:Math.round(m.time),mealType:m.mealType==="highFat"?"highFat":"regular"})),
    renalCrCl:Number.isFinite(renal?.crcl)?renal.crcl:null
  };
  const mathKey=pkServerCurveKey({model:typeof PKVerifiedWebCatalog!=="undefined"?PKVerifiedWebCatalog?.version:null,...mathRequest});
  const authoritative=validRemoteInputs&&pkServerCurveCache?.key===mathKey?pkServerCurveCache.points:null;
  if(validRemoteInputs&&!authoritative)pkServerCurveRequest(mathKey,mathRequest);
  const previewFoodEffect=!!FOOD_INFO[d.id]?.fed&&previewRows.some(row=>mealForDose(row.time,d.id));
  for(let i=0;i<=count;i++){
    const t=times[i],remote=authoritative?.[i];
    const eq=remote?.equivalentMg??totalEquivalent(d,t,modelRows);
    points.push({t,
      c:remote?.bloodMgL??concentration(d,t,modelRows),
      unfed:remote?.unfedMgL??concentration(d,t,modelRows,false),
      eq,eqPreview:previewRows.length?(remote?.plannedEquivalentMg??eq+totalEquivalent(d,t,previewRows)):null,
      bloodPreview:previewRows.length?(remote?.plannedBloodMgL??null):null});
  }
  const peak=points.reduce((a,b)=>b.c>a.c?b:a,{t:start,c:0});
  const unfedPeak=points.reduce((a,b)=>b.unfed>a.unfed?b:a,{t:start,unfed:0});
  const hasFoodEffect=points.some(p=>Math.abs(p.c-p.unfed)>Math.max(.001,peak.c,unfedPeak.unfed)*.001);
  const recordedMealRows=FOOD_INFO[d.id]?.fed?modelRows.filter(r=>r.time<dayEnd(selectedDate)&&mealForDose(r.time,d.id)):[];
  const dayEffectPoints=points.filter(p=>p.t>=dayStart(selectedDate)&&p.t<dayEnd(selectedDate));
  const foodEffectPoint=recordedMealRows.length&&dayEffectPoints.length?dayEffectPoints.reduce((a,b)=>Math.abs(b.c-b.unfed)>Math.abs(a.c-a.unfed)?b:a):null;
  let scenarioPeak=0;
  const scenarioContribution=(t,includeFood=true)=>previewRows.reduce((sum,row)=>sum+singleConcentration(d,row.mg,(t-row.time)/3600000,row.time,includeFood),0);
  if(previewRows.length)for(const p of points)scenarioPeak=Math.max(scenarioPeak,p.c+scenarioContribution(p.t));
  const maxY=Math.max(.001,peak.c*1.23,hasFoodEffect?unfedPeak.unfed*1.23:0,scenarioPeak*1.2,!referenceEquivalent&&threshold!==null&&Number.isFinite(threshold)&&threshold>0?threshold*1.13:0);
  const maxEq=Math.max(1,...points.map(p=>Math.max(p.eq,p.eqPreview||0)),referenceEquivalent&&threshold!==null&&Number.isFinite(threshold)&&threshold>0?threshold:0)*1.18;
  const x=t=>L+(t-start)/(end-start)*(W-L-R),y=c=>H-B-c/maxY*(H-T-B),yEq=amount=>H-B-amount/maxEq*(H-T-B);
  const defs=svgEl("defs"),grad=svgEl("linearGradient",{id:"curveFill",x1:"0",y1:"0",x2:"0",y2:"1"});
  grad.append(svgEl("stop",{offset:"0%","stop-color":CHART_COLORS.blood,"stop-opacity":".27"}),svgEl("stop",{offset:"100%","stop-color":CHART_COLORS.blood,"stop-opacity":".01"}));defs.append(grad);svg.append(defs);
  for(let i=0;i<=4;i++){
    const yy=y(maxY*i/4);svg.append(svgEl("line",{x1:L,y1:yy,x2:W-R,y2:yy,stroke:"#333942","stroke-width":1}));
    const label=svgEl("text",{x:L-7,y:yy+4,"text-anchor":"end",fill:"#87909c","font-size":10});label.textContent=fmt(maxY*i/4,maxY<1?3:1);svg.append(label);
    const right=svgEl("text",{x:W-R+7,y:yy+4,"text-anchor":"start",fill:"#7bdec9","font-size":10});right.textContent=fmt(maxEq*i/4,maxEq<10?1:0);svg.append(right);
  }
  const leftUnit=svgEl("text",{x:L,y:14,fill:CHART_COLORS.blood,"font-size":10});leftUnit.textContent="血药 mg/L";const rightUnit=svgEl("text",{x:W-R+7,y:14,fill:"#7bdec9","font-size":10});rightUnit.textContent="等效 mg";svg.append(leftUnit,rightUnit);
  const pxPerHour=(W-L-R)/((end-start)/3600000);
  const tickHours=[1,2,3,4,6,8,12,24,48,72].find(h=>h*pxPerHour>=120)||72;
  const axisLabel=(t,xx,anchor)=>{const label=svgEl("text",{x:xx,y:H-B+18,"text-anchor":anchor,fill:"#87909c","font-size":10});label.textContent=dateText(t);svg.append(label)};
  axisLabel(start,L,"start");axisLabel(end,W-R,"end");
  const tickMs=tickHours*3600000;
  for(let t=Math.ceil(start/tickMs)*tickMs;t<end;t+=tickMs){
    const xx=x(t);if(xx<L+75||xx>W-R-75)continue;
    svg.append(svgEl("line",{x1:xx,y1:T,x2:xx,y2:H-B,stroke:"#292e36","stroke-width":1}));
    axisLabel(t,xx,"middle");
  }
  if(threshold!==null&&Number.isFinite(threshold)&&threshold>0){
    const yy=referenceEquivalent?yEq(threshold):y(threshold),color=referenceEquivalent?CHART_COLORS.referenceEquivalent:CHART_COLORS.reference;svg.append(svgEl("line",{x1:L,y1:yy,x2:W-R,y2:yy,stroke:color,"stroke-width":2,"stroke-dasharray":"6 5"}));
    const label=svgEl("text",{x:W-R-2,y:Math.max(14,yy-6),"text-anchor":"end",fill:color,"font-size":10});label.textContent=`${referencePending?"上次确认 ":"参考 "}${fmt(threshold,3)} ${reference.unit}`;svg.append(label);
  }
  const relatedMealIds=new Set([...modelRows.filter(row=>row.time>=start&&row.time<=end),...previewRows].map(row=>mealForDose(row.time,d.id)?.id).filter(Boolean));
  const visibleMeals=intakes.filter(meal=>meal.kind==="meal"&&meal.time>=start&&meal.time<=end&&(dateKey(meal.time)===selectedDate||relatedMealIds.has(meal.id)||meal.time>now)).sort((a,b)=>a.time-b.time).slice(0,16);
  const unmatchedVisibleMeals=visibleMeals.filter(meal=>dateKey(meal.time)===selectedDate&&!relatedMealIds.has(meal.id));
  for(const [index,meal] of visibleMeals.entries()){
    const xx=x(meal.time);svg.append(svgEl("line",{x1:xx,y1:T,x2:xx,y2:H-B,stroke:"#8bd58c","stroke-width":1.5,"stroke-dasharray":"3 5"}));
    const label=svgEl("text",{x:Math.min(W-R-5,xx+4),y:T+10+(index%2)*12,"text-anchor":"start",fill:"#8bd58c","font-size":10});label.textContent=`${meal.time>now?"计划":"已记"}用餐 ${dateText(meal.time)}${relatedMealIds.has(meal.id)?"":" · 未匹配本药"}`;svg.append(label);
  }
  const matchedIds=new Set(appliedPointScenario?.matchedRecordIds||(adopted?currentAdoptedEvaluation(adopted).completed.map(item=>item.record.id):[]));
  const doseMarkers=[...rows.filter(r=>r.time>=start&&r.time<=end).map(r=>({...r,preview:false,matched:matchedIds.has(r.id)})),...previewRows.filter(r=>r.time>=start&&r.time<=end).map(r=>({...r,preview:true,matched:false}))].sort((a,b)=>a.time-b.time);
  const lastLabelX=[-Infinity,-Infinity,-Infinity];
  for(const dose of doseMarkers){
    const xx=x(dose.time),color=dose.preview?CHART_COLORS.previewBlood:dose.matched?"#77f0b6":CHART_COLORS.blood;
    svg.append(svgEl("line",{x1:xx,y1:T,x2:xx,y2:H-B,stroke:color,"stroke-width":1,"stroke-dasharray":"3 6","stroke-opacity":dose.preview?.8:.58}));
    const level=lastLabelX.findIndex(last=>xx-last>=(mobile?105:125));
    const slot=level<0?lastLabelX.indexOf(Math.min(...lastLabelX)):level;
    lastLabelX[slot]=xx;
    const label=svgEl("text",{x:Math.min(W-R-5,Math.max(L+5,xx+4)),y:H-B+36+slot*15,fill:color,"font-size":mobile?9:10});
    label.textContent=`${dose.preview?(scheduledDoses.some(d=>d.id===dose.id)?"计划 ":"情景 "):dose.matched?"已匹配 ":""}${dateText(dose.time)} · ${fmt(dose.mg,3)} mg`;
    svg.append(label);
  }
  if(points.length){
    if(hasFoodEffect){const unfedPath=points.map((p,i)=>`${i?"L":"M"}${x(p.t).toFixed(2)} ${y(p.unfed).toFixed(2)}`).join(" ");svg.append(svgEl("path",{d:unfedPath,fill:"none",stroke:CHART_COLORS.unfed,"stroke-width":2,"stroke-dasharray":"6 5","stroke-linejoin":"round"}))}
    const path=points.map((p,i)=>`${i?"L":"M"}${x(p.t).toFixed(2)} ${y(p.c).toFixed(2)}`).join(" ");
    svg.append(svgEl("path",{d:`${path} L${x(end)} ${y(0)} L${x(start)} ${y(0)} Z`,fill:"url(#curveFill)"}));
    svg.append(svgEl("path",{d:path,fill:"none",stroke:CHART_COLORS.blood,"stroke-width":3,"stroke-linejoin":"round","stroke-linecap":"round",pathLength:1000,class:"chart-line"}));
    const equivalentPath=points.map((p,i)=>`${i?"L":"M"}${x(p.t).toFixed(2)} ${yEq(p.eq).toFixed(2)}`).join(" ");
    svg.append(svgEl("path",{d:equivalentPath,fill:"none",stroke:CHART_COLORS.equivalent,"stroke-width":2.5,"stroke-linejoin":"round","stroke-linecap":"round"}));
    if(foodEffectPoint&&Math.abs(foodEffectPoint.c-foodEffectPoint.unfed)>.001){const xx=x(foodEffectPoint.t);svg.append(svgEl("line",{x1:xx,y1:y(foodEffectPoint.c),x2:xx,y2:y(foodEffectPoint.unfed),stroke:"#f6cd83","stroke-width":2.5}));for(const value of [foodEffectPoint.c,foodEffectPoint.unfed])svg.append(svgEl("circle",{cx:xx,cy:y(value),r:4,fill:"#f6cd83",stroke:"#1b1c20","stroke-width":1.5}))}
    rows.filter(r=>r.time>=start&&r.time<=end).forEach(r=>svg.append(svgEl("circle",{cx:x(r.time),cy:y(0),r:3.5,fill:CHART_COLORS.blood})));
    if(previewRows.length){
      const preview=points.map((p,i)=>`${i?"L":"M"}${x(p.t).toFixed(2)} ${y(p.bloodPreview??p.c+scenarioContribution(p.t)).toFixed(2)}`).join(" ");
      svg.append(svgEl("path",{d:preview,fill:"none",stroke:CHART_COLORS.previewBlood,"stroke-width":2.2,"stroke-dasharray":"5 5","stroke-linejoin":"round"}));
      if(previewFoodEffect){const withoutPreviewFood=points.map((p,i)=>`${i?"L":"M"}${x(p.t).toFixed(2)} ${y(p.c+scenarioContribution(p.t,false)).toFixed(2)}`).join(" ");svg.append(svgEl("path",{d:withoutPreviewFood,fill:"none",stroke:CHART_COLORS.unfed,"stroke-width":1.6,"stroke-dasharray":"2 5","stroke-linejoin":"round"}))}
      const eqPreviewPath=points.map((p,i)=>`${i?"L":"M"}${x(p.t).toFixed(2)} ${yEq(p.eqPreview).toFixed(2)}`).join(" ");
      svg.append(svgEl("path",{d:eqPreviewPath,fill:"none",stroke:CHART_COLORS.previewEquivalent,"stroke-width":2,"stroke-dasharray":"5 5","stroke-linejoin":"round"}));
      if(activeScenario&&activeScenario.target>=start&&activeScenario.target<=end){
        const tx=x(activeScenario.target),eqMode=activeScenario.mode==="equivalent",targetValue=eqMode?totalEquivalent(d,activeScenario.target,[...rows,...previewRows]):concentration(d,activeScenario.target,rows)+scenarioContribution(activeScenario.target),ty=eqMode?yEq(targetValue):y(targetValue),color=CHART_COLORS.target;
        svg.append(svgEl("line",{x1:tx,y1:T,x2:tx,y2:H-B,stroke:color,"stroke-width":1,"stroke-dasharray":"3 5"}));
        svg.append(svgEl("circle",{cx:tx,cy:ty,r:5,fill:color,stroke:"#1b1c20","stroke-width":2}));
        const label=svgEl("text",{x:tx+7,y:Math.max(T+12,ty-9),fill:color,"font-size":11});label.textContent=`${activeScenario.adoptedVariant?`已采用 ${activeScenario.adoptedVariant} · `:""}目标 ${dateText(activeScenario.target)} · ${fmt(activeScenario.threshold,3)} ${eqMode?"mg（等效）":"mg/L"}`;svg.append(label);
      }
    }
  }
    const line=svgEl("line",{x1:L,y1:T,x2:L,y2:H-B,stroke:"#e4e6e9","stroke-width":1.2,"stroke-dasharray":"3 4"});
    const dot=svgEl("circle",{cx:L,cy:y(0),r:5,fill:"#f9e0c5",stroke:"#1b1c20","stroke-width":2});
    const probeAxis=svgEl("text",{x:L,y:H-4,"text-anchor":"middle",fill:"#fff","font-size":11,"font-weight":"700"});svg.append(line,dot,probeAxis);
    chartView={points,x,y,line,dot,probeAxis,start,end,W,L,R,drug:current,courseId:activeCourseId,rows:modelRows,previewRows,previewFoodEffect,reference,hasFoodEffect,target:activeScenario?{time:activeScenario.target,mode:activeScenario.mode}:null};$("timeScrubber").disabled=false;$("timeScrubber").max=String(count);
    clearTimeout(probeResetTimer);showNowProbe();
    const keepPosition=previous&&previous.start===start&&previous.end===end&&previous.drug===current&&previous.courseId===activeCourseId;
    const centerTime=keepPosition?previous.start+(previousScroll+previousViewport/2-previous.L)/(previous.W-previous.L-previous.R)*(previous.end-previous.start):Math.max(start,Math.min(end,Date.now()));
    wrap.scrollLeft=Math.max(0,x(centerTime)-wrap.clientWidth/2);
    const move=e=>{const rect=svg.getBoundingClientRect(),px=(e.clientX-rect.left)/rect.width*W;updateProbe(Math.round((px-L)/(W-L-R)*count))};
    svg.onpointerdown=e=>{if(e.pointerType!=="touch")svg.setPointerCapture(e.pointerId);move(e)};
    svg.onpointermove=e=>{if(e.buttons&&e.pointerType!=="touch")move(e)};
  $("peakConc").textContent=rows.length?`${fmt(peak.c,peak.c<1?3:2)} mg/L`:"—";
  const equivalentPeakInWindow=points.reduce((a,b)=>b.eq>a.eq?b:a,{eq:0});
  $("peakEquivalent").textContent=rows.length?`${fmt(equivalentPeakInWindow.eq,1)} mg（等效）`:"—";
  $("unfedLegend").hidden=!hasFoodEffect;
  $("recordedLegend").textContent=hasFoodEffect?"已计饮食血药浓度 · 左轴 mg/L":"已记血药浓度 · 左轴 mg/L";
  $("referenceLegend").hidden=!(threshold!==null&&Number.isFinite(threshold)&&threshold>0);
  $("referenceLegend").lastChild.textContent=` ${reference.name}参考线 · ${referenceEquivalent?"右轴 mg（等效）":"左轴 mg/L"}`;
  $("referenceLegendLine").classList.toggle("equivalent-reference",referenceEquivalent);
  $("targetMarkerLegend").firstElementChild.classList.toggle("equivalent-target",!!activeScenario&&activeScenario.mode==="equivalent");
  $("previewBloodLegend").hidden=!previewRows.length;
  $("previewUnfedLegend").hidden=!previewFoodEffect;
  $("previewEquivalentLegend").hidden=!previewRows.length;
  $("targetMarkerLegend").hidden=!(activeScenario&&activeScenario.target>=start&&activeScenario.target<=end);
  $("targetMarkerLegend").lastChild.textContent=` 虚线竖标＝${activeScenario?.adoptedVariant?`已采用方案 ${activeScenario.adoptedVariant} 的`:""}目标时刻（${activeScenario?.mode==="equivalent"?"橙色＝剂量等效量":"橙色＝血药浓度"}）`;
  const mealTypes=FOOD_INFO[d.id]?.fed?[...new Set(modelRows.map(r=>mealForDose(r.time,d.id)?.mealType).filter(Boolean))].map(type=>type==="highFat"&&FOOD_INFO[d.id].fed.highFat?"高脂餐":"普通餐").join("、"):"";
  $("chartCaption").textContent=rows.length?`仅统计${d.name} · 历史共 ${rows.length} 次记录，同药物跨日残留已计入${activeScenario?.adoptedVariant?` · 已采用方案 ${activeScenario.adoptedVariant} 的剩余节点显示为虚线`:""}${mealTypes?` · 餐型：${mealTypes}`:""}${hasFoodEffect?` · 已计饮食峰值约 ${fmt(peak.c,3)} mg/L；未计饮食参考峰值约 ${fmt(unfedPeak.unfed,3)} mg/L`:""} · 当前窗口 ${dateText(start)}—${dateText(end)}`:scenario&&!scenario.invalid?`${d.name}暂无已记服用；蓝色虚线为假设血药浓度，紫色虚线为假设剂量等效量 · 当前窗口 ${dateText(start)}—${dateText(end)}`:`${d.name}暂无单次记录`;
  $("chartCaption").textContent+=authoritative?
    " · 当前曲线由181服务器计算（同版本模型校验）":
    " · 当前曲线为本地数学模型（等待181或离线）";
  if(visibleMeals.length)$("chartCaption").textContent+=` · 绿色竖虚线＝已记录或计划用餐${foodEffectPoint?"；金色竖线＝当日餐后与空腹对照差异最大的位置":""}`;
  const mealStatus=$("chartMealStatus");mealStatus.replaceChildren();mealStatus.hidden=!recordedMealRows.length&&!previewRows.length&&!unmatchedVisibleMeals.length;
  for(const meal of unmatchedVisibleMeals){const note=document.createElement("p");note.textContent=unmatchedMealMessage(meal,d.id,rows);mealStatus.append(note)}
  if(recordedMealRows.length){const note=document.createElement("p"),latest=recordedMealRows.at(-1),meal=mealForDose(latest.time,d.id);note.textContent=`已记餐后匹配：${dateText(latest.time)} ${fmt(latest.mg,3)} mg ↔ ${dateText(meal.time)} 用餐${recordedMealRows.length>1?`；本药另有 ${recordedMealRows.length-1} 条随餐记录参与叠加`:""}。`;
    mealStatus.append(note);
    if(foodEffectPoint&&Math.abs(foodEffectPoint.c-foodEffectPoint.unfed)>.001){const detail=document.createElement("p"),difference=foodEffectPoint.c-foodEffectPoint.unfed,button=document.createElement("button");detail.textContent=`当日差异最明显的模型采样点 ${dateText(foodEffectPoint.t)}：计入饮食 ${fmt(foodEffectPoint.c,3)} mg/L，全部按空腹计算 ${fmt(foodEffectPoint.unfed,3)} mg/L，相差 ${fmt(Math.abs(difference),3)} mg/L。`;
      button.type="button";button.className="ghost";button.textContent="在曲线中定位这段差异";button.onclick=()=>{const xx=x(foodEffectPoint.t);wrap.scrollTo({left:Math.max(0,xx-wrap.clientWidth/2),behavior:"smooth"});updateProbe(Math.round((foodEffectPoint.t-start)/(end-start)*(points.length-1)))};mealStatus.append(detail,button)}
  }
  if(previewRows.length){const descriptions=previewRows.slice(0,8).map(row=>{const meal=mealForDose(row.time,d.id);if(!meal)return `${dateText(row.time)} 假设服用：未匹配用餐，按空腹吸收`;
    const delta=Math.round((row.time-meal.time)/60000),relation=delta>=0?`餐后 ${delta} 分钟`:`餐前 ${-delta} 分钟`;
    return `${dateText(row.time)} 假设服用：匹配 ${dateText(meal.time)} 用餐（${relation}），${FOOD_INFO[d.id]?.fed?"已计餐后吸收":"本药缺少定量修正"}`});const note=document.createElement("p");note.textContent=`假设节点饮食匹配：${descriptions.join("；")}${previewRows.length>8?`；另有 ${previewRows.length-8} 个节点`:""}。${mealBeforeDoseMinutes(d.id)} 分钟餐后匹配窗口仅用于模型模拟，不是消化完成时间。`;mealStatus.append(note)}
  renderCrossing(rows,points,peak,reference);
  $("insight").textContent=rows.length?`当前时间窗的简化模型峰值约 ${fmt(peak.c,peak.c<1?3:2)} mg/L。此前日期中相同药物的记录也参与本药曲线；其他药物各自计算，不合并浓度。浓度不等于疗效。`:"选择日期后新增服用记录，或输入假设剂量观察模型。";
}
/*
 * Disclosure and navigation controller. This is view-only state:
 * it never mutates medical records, model inputs, or cloud data.
 */
const VIEW_PREF_KEY = "pk-atlas-disclosures-v2";
function readDisclosurePreferences(){
  try{
    const value=JSON.parse(localStorage.getItem(VIEW_PREF_KEY)||"{}");
    return value&&typeof value==="object"&&!Array.isArray(value)?value:{};
  }catch{return {}}
}
function openDisclosure(id,focus=false){
  const target=$(id);
  if(!target||target.tagName!=="DETAILS")return false;
  target.open=true;
  try{
    const preferences=readDisclosurePreferences();
    preferences[id]=true;
    localStorage.setItem(VIEW_PREF_KEY,JSON.stringify(preferences));
  }catch{}
  requestAnimationFrame(()=>{
    target.scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth",block:"start"});
    if(focus)target.querySelector(":scope > summary")?.focus({preventScroll:true});
  });
  return true;
}
/**
 * Only presents values from the chart's probe. Does not calculate drug doses
 * or change cloud state.
 */
function renderReferenceGlance(values,time,mode){
  const box=$("referenceGlanceValues");
  if(!box)return;
  box.replaceChildren();
  $("referenceGlanceTime").textContent=chosen().name+" · "+dateText(time)+" · 群体模型估算";
  for(const [label,value,kind] of values){
    const item=document.createElement("div"),name=document.createElement("span"),amount=document.createElement("strong");
    item.className=kind+(kind==="reference"&&mode==="equivalent"?" equivalent-reference":"");
    name.textContent=label;amount.textContent=value;
    item.append(name,amount);box.append(item);
  }
}
/**
 * In-page navigation, not browser history. The OS-reserved iPhone Duo rail
 * belongs to Safari, so these controls stay within the web viewport.
 * No medication data is mutated by any of these actions.
 */
function edgeNavigate(action){
  const menu=$("edgeDockMenu");
  if(menu?.matches(":popover-open"))menu.hidePopover();
  if(!document.body.classList.contains("stage-calc"))return;
  if(action==="dates"){$("backToChooser").click();return}
  if(action==="top"){
    window.scrollTo({top:0,behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});
    return;
  }
  if(action==="history"){openDisclosure("historyGuide",true);return}
  const results=action==="timeline";
  if(action!=="records"&&!results)return;
  if(matchMedia("(max-width:700px)").matches)setMobilePane(results?"results":"records");
  requestAnimationFrame(()=>{
    const anchor=$(results?"chartTitle":"recordSection");
    anchor?.scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth",block:"start"});
  });
}
function initPresentation(){
  const saved=readDisclosurePreferences();
  $("edgeDockBack")?.addEventListener("click",()=>edgeNavigate("dates"));
  document.querySelectorAll("#edgeDockMenu [data-edge-action]").forEach(button=>{
    button.addEventListener("click",()=>edgeNavigate(button.dataset.edgeAction));
  });
  // Native popover provides Escape, light-dismiss and focus behavior.
  // On close, restore focus only when it was inside the dismissed menu.
  $("edgeDockMenu")?.addEventListener("beforetoggle",event=>{
    if(event.newState==="closed"&&event.target.contains(document.activeElement))
      $("edgeDockMore")?.focus({preventScroll:true});
  });

  document.querySelectorAll("details[data-pref]").forEach(details=>{
    // Native details leaves the content available to keyboard and assistive tech.
    if(saved[details.id||details.dataset.pref]===true)details.open=true;
    details.addEventListener("toggle",()=>{
      try{
        const key=details.id||details.dataset.pref;
        const value=readDisclosurePreferences();
        value[key]=details.open;
        localStorage.setItem(VIEW_PREF_KEY,JSON.stringify(value));
      }catch{}
    });
  });
  $("openAdvanced")?.addEventListener("click",()=>{
    if(matchMedia("(max-width:700px)").matches)setMobilePane("results",true);
    openDisclosure("advancedTools",true);
  });
  $("openHistory")?.addEventListener("click",()=>openDisclosure("historyGuide",true));
  // The primary add action remains available when the floating FAB yields
  // to the interactive chart and its mobile legend.
  $("chartAddDose")?.addEventListener("click",()=>{
    if(document.body.classList.contains("app-mode")){appOpenSheet("dose");return}
    if(matchMedia("(max-width:700px)").matches)setMobilePane("records");
    requestAnimationFrame(()=>{
      $("doseForm").scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth",block:"center"});
      $("doseAmount").focus({preventScroll:true});
    });
  });
  $("referenceGlanceEdit")?.addEventListener("click",()=>{
    const glance=$("referenceGlance");
    if(glance?.matches(":popover-open"))glance.hidePopover();
    if(matchMedia("(max-width:700px)").matches)setMobilePane("results");
    openDisclosure("advancedTools",true);
  });
  // Fold/unfold and Split View resize the content without navigation.
  // Observe content width to avoid re-rendering when Safari bars move.
  if(typeof ResizeObserver!=="undefined"){
    let lastWidth=0,pending=0;
    const chartResize=new ResizeObserver(entries=>{
      const width=Math.round(entries[0]?.contentRect?.width||0);
      if(!width||Math.abs(width-lastWidth)<2)return;
      lastWidth=width;
      clearTimeout(pending);
      pending=setTimeout(()=>{
        if(!document.body.classList.contains("stage-calc"))return;
        if(matchMedia("(max-width:700px)").matches&&document.body.dataset.mobilePane!=="results")return;
        if(!$("chartWrap").hidden)drawChart();
      },160);
    });
    chartResize.observe($("chartWrap"));
  }
  if(typeof IntersectionObserver!=="undefined"){
    const visibility=new IntersectionObserver(entries=>{
      const visible=entries.some(entry=>entry.isIntersecting);
      document.body.classList.toggle("chart-onscreen",
        visible&&matchMedia("(max-width:700px)").matches&&document.body.dataset.mobilePane==="results");
    },{threshold:0.18});
    visibility.observe(document.querySelector(".chart-panel"));
  }

  $("dailyChartsGuide")?.addEventListener("toggle",event=>{
    if(event.target.open&&document.body.classList.contains("stage-calc"))
      requestAnimationFrame(()=>renderDay());
  });
  document.querySelectorAll(".view-quicknav a[data-view-pane]").forEach(link=>{
    link.addEventListener("click",event=>{
      const pane=link.dataset.viewPane;
      if(!matchMedia("(max-width:700px)").matches)return;
      event.preventDefault();
      setMobilePane(pane,true);
      const target=document.querySelector(link.getAttribute("href"));
      requestAnimationFrame(()=>target?.scrollIntoView({behavior:"smooth",block:"start"}));
    });
  });
}
/* Yaoshi PWA app shell. Scientific models, account APIs and original forms
   are reused without copying any personal records or changing SQLite. */
let appCurrentView="today",appShellReady=false,appSheetForm=null;
const appSheetAnchors={},appLegacyAnchors={};
const APP_VIEWS=new Set(["today","chart","history","my"]);

function appMoveLegacyToMy(){
  const target=$("appMyContent");
  for(const entry of Object.values(appLegacyAnchors)){
    if(entry.node.parentNode!==target)target.append(entry.node);
  }
}
function appRestoreLegacy(){
  for(const entry of Object.values(appLegacyAnchors)){
    if(entry.anchor.parentNode&&entry.node.parentNode!==entry.anchor.parentNode)
      entry.anchor.after(entry.node);
  }
}
function appObserveCloud(){
  const src=$("syncStatus"),dst=$("appHeaderSyncText"),button=$("appHeaderSync");
  const update=()=>{
    const state=src.dataset.sync||"",msg=src.textContent||"";
    const failed=src.classList.contains("error")||state==="conflict"||
      state==="error"||msg.includes("未完成云端")||msg.includes("同步失败");
    const level=failed?"warning":
      state==="offline"?"offline":
      state==="synced"||msg.includes("已核对")?"synced":"pending";
    button.dataset.sync=level;
    dst.textContent=level==="synced"?"已同步":level==="warning"?"需要处理":
      level==="offline"?"离线草稿":"同步中";
    button.title=msg;
    // The accessible name must contain the button's visible status text.
    button.setAttribute("aria-label",dst.textContent+" · 打开同步与账户设置");
  };
  new MutationObserver(update).observe(src,{childList:true,attributes:true,subtree:true});
  update();
}
function appSetView(view,opts={}){
  if(!APP_VIEWS.has(view)||!document.body.classList.contains("stage-calc"))return;
  const scroll=opts.scroll!==false;
  appCurrentView=view;
  document.body.dataset.appView=view;
  for(const button of document.querySelectorAll("[data-app-tab]")){
    if(button.dataset.appTab===view)button.setAttribute("aria-current","page");
    else button.removeAttribute("aria-current");
  }
  $("appHome").hidden=view!=="today";
  $("appMy").hidden=view!=="my";
  if(view==="today"){
    const today=dateKey(Date.now());
    if(selectedDate!==today&&!editingDoseId&&!editingIntakeId){
      selectedDate=today;selectedDateFollowsToday=true;$("viewDate").value=today;renderDrug();
    }else renderAppHome();
  }
  if(view==="history"){
    $("historyGuide").open=true;
    renderDay();renderHistory();renderAppHistoryQuicklist();
  }
  if(view==="chart"){
    setMobilePane("results");
    requestAnimationFrame(()=>{
      if(document.body.dataset.appView!=="chart")return;
      drawChart();renderScenario();
      if(inversePage==="point")renderPointInverse();else renderInverse();
    });
  }
  if(scroll)window.scrollTo({top:0,behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});
}
function appOnStage(stage){
  if(!appShellReady)return;
  const active=stage==="calc"&&!!authUser;
  document.body.classList.toggle("app-mode",active);
  if(active){
    appMoveLegacyToMy();
    appSetView(appCurrentView,{scroll:false});
    renderAppHome();
  }else{
    if($("appRecordSheet").open)appCloseSheet();
    appRestoreLegacy();
    document.body.removeAttribute("data-app-view");
  }
}
function appMiniChart(drug,now,rows){
  const svg=$("appMiniChart"),NS="http://www.w3.org/2000/svg";
  svg.replaceChildren();
  const grid=document.createElementNS(NS,"path");
  grid.setAttribute("d","M0 23H320 M0 57H320 M0 91H320");
  grid.setAttribute("stroke","currentColor");grid.setAttribute("stroke-opacity",".14");
  grid.setAttribute("stroke-dasharray","4 6");grid.setAttribute("fill","none");
  svg.append(grid);
  if(drug.recordOnly||!rows.length)return;
  const values=[];
  for(let i=0;i<=40;i++){
    const time=now+(i/40*24-12)*3600000;
    const value=concentration(drug,time,rows);
    values.push(Number.isFinite(value)&&value>0?value:0);
  }
  const max=Math.max(.00001,...values);
  const d=values.map((v,i)=>(i===0?"M":"L")+(i/40*320).toFixed(2)+" "+(102-v/max*86).toFixed(2)).join(" ");
  const line=document.createElementNS(NS,"path");
  line.setAttribute("d",d);line.setAttribute("stroke","#78c8ed");
  line.setAttribute("stroke-width","3");line.setAttribute("fill","none");
  line.setAttribute("stroke-linejoin","round");line.setAttribute("stroke-linecap","round");
  svg.append(line);
  const nowLine=document.createElementNS(NS,"line");
  nowLine.setAttribute("x1","160");nowLine.setAttribute("x2","160");
  nowLine.setAttribute("y1","7");nowLine.setAttribute("y2","106");
  nowLine.setAttribute("stroke","#ffd496");nowLine.setAttribute("stroke-dasharray","4 4");
  svg.append(nowLine);
}
function appRecordCard(row){
  const item=document.createElement("div"),left=document.createElement("div");
  const label=document.createElement("strong"),meta=document.createElement("span"),edit=document.createElement("button");
  item.className="app-record-card";
  const unit=row.unit==="g"?"g":"mg";
  label.textContent=recordDrugName(row)+" · "+fmt(unit==="g"?row.mg/1000:row.mg,3)+" "+unit;
  meta.textContent=dateText(row.time)+(isJournalReview(row)?" · 待核对":"")+
    (row.time>Date.now()?" · 未来时间，未计入已服用":"");
  const modeled=DRUGS.some(d=>d.id===row.drug);
  edit.type="button";
  edit.className=modeled?"app-record-edit":"app-record-edit app-record-delete";
  edit.textContent=modeled?"编辑":"删除";
  edit.setAttribute("aria-label",(modeled?"编辑 ":"删除 ")+recordDrugName(row)+" "+dateText(row.time));
  edit.addEventListener("click",()=>modeled?editRecord(row.id):requestDoseDeletion(row.id));
  left.append(label,meta);item.append(left,edit);
  return item;
}
function renderAppHome(){
  if(!appShellReady||!authUser)return;
  const now=Date.now(),today=dateKey(now),drug=chosen();
  $("appHomeDate").textContent=new Date(now).toLocaleDateString("zh-CN",
    {year:"numeric",month:"long",day:"numeric",weekday:"long"});
  $("appHomeDrug").value=current;
  const todayRows=records.filter(r=>dateKey(r.time)===today&&!isJournalReview(r))
    .sort((a,b)=>b.time-a.time);
  const actualToday=todayRows.filter(r=>r.time<=now);
  $("appTodayCount").textContent=actualToday.length+" 次";
  const latest=actualToday[0];
  $("appLastDose").textContent=latest?fmt(latest.unit==="g"?latest.mg/1000:latest.mg,3)+" "+(latest.unit==="g"?"g":"mg"):"暂无";
  $("appLastDoseTime").textContent=latest?recordDrugName(latest)+" · "+dateText(latest.time):"添加记录后显示";
  const rows=records.filter(r=>r.drug===current&&!isJournalReview(r)&&r.time<=now);
  if(drug.recordOnly)$("appHomeConcentration").textContent="仅支持服用记录";
  else if(!rows.length)$("appHomeConcentration").textContent="暂无浓度估算";
  else{
    const value=concentration(drug,now,rows);
    $("appHomeConcentration").textContent=Number.isFinite(value)?fmt(Math.max(0,value),3)+" mg/L":"暂不可计算";
  }
  appMiniChart(drug,now,rows);
  const warning=$("drugSafetyAlert");
  $("appHomeWarning").hidden=warning?.hidden!==false;
  $("appHomeWarning").textContent=warning?.hidden?"":warning?.textContent||"";
  const list=$("appHomeRecords");
  list.replaceChildren();
  if(!todayRows.length){
    const empty=document.createElement("div");empty.className="app-empty";
    empty.textContent="今天还没有服药记录。编辑草稿不会计入实际服用。";
    list.append(empty);
  }else for(const row of todayRows.slice(0,4))list.append(appRecordCard(row));
}
function renderAppHistoryQuicklist(){
  if(!appShellReady||!authUser)return;
  const list=$("appHistoryRecords");list.replaceChildren();
  const rows=records.filter(r=>dateKey(r.time)===selectedDate)
    .sort((a,b)=>b.time-a.time);
  if(!rows.length&&!intakes.some(x=>dateKey(x.time)===selectedDate))return;
  const title=document.createElement("p");title.className="app-eyebrow";
  const meals=intakes.filter(x=>dateKey(x.time)===selectedDate).sort((a,b)=>b.time-a.time);
  title.textContent=selectedDate+" · "+rows.length+" 条服用记录 · "+meals.length+" 条饮食记录";
  list.append(title);
  for(const row of rows.slice(0,60))list.append(appRecordCard(row));
  if(rows.length>60||meals.length>30){
    const notice=document.createElement("p");notice.className="app-muted";
    notice.textContent="这里只显示最近 60 条服用与 30 条饮食记录；其余记录仍保留在云端。";
    list.append(notice);
  }
  for(const item of meals.slice(0,30)){
    const card=document.createElement("div"),left=document.createElement("div");
    const title=document.createElement("strong"),time=document.createElement("span"),edit=document.createElement("button");
    card.className="app-record-card app-meal-card";
    title.textContent=intakeLabel(item);
    time.textContent=fullDate(item.time);
    edit.type="button";edit.className="app-record-edit";edit.textContent="编辑";
    edit.setAttribute("aria-label","编辑饮食记录 "+fullDate(item.time));
    edit.addEventListener("click",()=>editIntake(item.id));
    left.append(title,time);card.append(left,edit);list.append(card);
  }
}
function appRestoreSheetForm(){
  const form=appSheetForm;
  if(!form)return;
  const anchor=appSheetAnchors[form.id];
  if(anchor?.parentNode)anchor.after(form);
  appSheetForm=null;
  // Closing a sheet abandons edit mode, not the durable autosaved draft.
  if(form.id==="doseForm"&&editingDoseId)resetDoseEdit();
  if(form.id==="intakeForm"&&editingIntakeId)resetIntakeEdit();
}
function appCloseSheet(){
  const dialog=$("appRecordSheet");
  if(dialog?.open)dialog.close();
  appRestoreSheetForm();
}
function appOpenSheet(kind="dose",options={}){
  if(!authUser||!document.body.classList.contains("stage-calc"))return;
  const form=$(kind==="intake"?"intakeForm":"doseForm");
  if(!form)return;
  const dialog=$("appRecordSheet");
  if(dialog.open)appCloseSheet();
  if(!options.editing){
    if(kind==="dose")resetDoseEdit();
    else resetIntakeEdit();
    // Input is a saved draft, not a confirmed dose. Re-opening a sheet must
    // restore the last uncommitted values instead of silently discarding them.
    syncRestoreEditor();
  }
  $("appSheetTitle").textContent=kind==="intake"?
    (options.editing?"修改饮食记录":"记录饮食或饮料"):
    (options.editing?"修改服用记录":"记录一次服用");
  $("appSheetDisclaimer").textContent=kind==="intake"?
    "确认后才保存实际饮食记录，吸收模型仅对有依据的餐型使用估算修正。":
    "输入内容自动暂存为草稿，只有确认保存才计入实际服用。";
  $("appSheetBody").append(form);appSheetForm=form;
  dialog.showModal();
  requestAnimationFrame(()=>$(kind==="intake"?"intakeTime":"doseAmount")?.focus({preventScroll:true}));
}
function initAppMode(){
  if(appShellReady)return;
  appShellReady=true;
  for(const [key,node] of [
    ["account",document.querySelector(".account-panel")],
    ["links",document.querySelector(".entry-links")],
    ["notice",document.querySelector(".notice-compact")],
    ["sources",document.querySelector(".sources")],
    ["renal",document.querySelector(".renal-bottom")]
  ]){
    if(!node)continue;
    const anchor=document.createComment("app-original-"+key);
    node.before(anchor);appLegacyAnchors[key]={node,anchor};
  }
  for(const id of ["doseForm","intakeForm"]){
    const form=$(id),anchor=document.createComment("sheet-origin-"+id);
    form.before(anchor);appSheetAnchors[id]=anchor;
  }
  for(const drug of DRUGS){
    const option=document.createElement("option");
    option.value=drug.id;option.textContent=drug.name;
    $("appHomeDrug").append(option);
  }
  $("appHomeDrug").addEventListener("change",()=>{
    $("drug").value=$("appHomeDrug").value;
    $("drug").dispatchEvent(new Event("change",{bubbles:true}));
    renderAppHome();
  });
  for(const button of document.querySelectorAll("[data-app-tab]"))
    button.addEventListener("click",()=>appSetView(button.dataset.appTab));
  $("appHeaderSync").addEventListener("click",()=>appSetView("my"));
  $("homeOpenChart").addEventListener("click",()=>appSetView("chart"));
  $("homeSeeHistory").addEventListener("click",()=>appSetView("history"));
  $("homeNewDose").addEventListener("click",()=>appOpenSheet("dose"));
  $("homeNewDoseSecondary").addEventListener("click",()=>appOpenSheet("dose"));
  $("homeNewIntake").addEventListener("click",()=>appOpenSheet("intake"));
  $("appSheetClose").addEventListener("click",appCloseSheet);
  $("appRecordSheet").addEventListener("close",appRestoreSheetForm);
  $("appRecordSheet").addEventListener("click",event=>{
    if(event.target===$("appRecordSheet"))appCloseSheet();
  });
  appObserveCloud();
  window.addEventListener("pk-atlas-records-changed",()=>{
    if(document.body.classList.contains("stage-calc")){
      renderAppHome();renderAppHistoryQuicklist();
    }
  });
  // An installed PWA can remain resident for hours. Refresh display estimates
  // at the current clock time without treating this as a medication edit.
  const refreshCurrentView=()=>{
    if(!document.hidden&&document.body.classList.contains("stage-calc")&&appCurrentView==="today")
      renderAppHome();
  };
  document.addEventListener("visibilitychange",refreshCurrentView);
  window.addEventListener("pageshow",refreshCurrentView);
  setInterval(refreshCurrentView,60000);
}
/* Device-scoped login sessions. UI exposes no raw cookies or passwords. */
const REMEMBERED_DEVICE_KEY="pk-atlas-remembered-device-v1";
const DEVICE_INSTALL_KEY="pk-atlas-random-installation-v1";
async function browserDeviceMetadata(){
  // Purpose-limited, resettable random installation ID; NOT browser fingerprint.
  let deviceId="";
  try{
    deviceId=localStorage.getItem(DEVICE_INSTALL_KEY)||"";
    if(!/^[a-zA-Z0-9_-]{16,100}$/.test(deviceId)){
      deviceId=crypto.randomUUID();
      localStorage.setItem(DEVICE_INSTALL_KEY,deviceId);
    }
  }catch{/* Storage disabled: legacy independent sessions remain supported. */}
  const hints=navigator.userAgentData;
  let osVersion="版本未提供";
  try{
    if(hints?.getHighEntropyValues){
      const value=await hints.getHighEntropyValues(["platformVersion"]);
      if(value.platformVersion)osVersion=value.platformVersion;
    }
  }catch{/* Browser privacy policy may hide precise OS versions. */}
  const platform=String(hints?.platform||navigator.platform||"未知系统").slice(0,30);
  const browser=String(hints?.brands?.find(x=>!x.brand.toLowerCase().includes("not"))?.brand||"网页浏览器").slice(0,24);
  return {deviceId,devicePlatform:platform,deviceOS:osVersion,
          deviceName:(platform+" · "+browser).slice(0,50)};
}

function appRememberSession(result){
  if(!result?.username)return;
  try{
    if(result.remembered){
      localStorage.setItem(REMEMBERED_DEVICE_KEY,JSON.stringify({
        username:result.username,confirmedAt:Date.now()
      }));
    }else{
      localStorage.removeItem(REMEMBERED_DEVICE_KEY);
      offlineForgetSnapshot();
    }
  }catch{}
}
function appForgetSession(){
  try{localStorage.removeItem(REMEMBERED_DEVICE_KEY)}catch{}
  // Do not delete outstanding local drafts on logout; the next authorized
  // login must be able to reconcile them.
  offlineForgetSnapshot();
}
function displaySessionTime(time){
  return Number.isFinite(time)?new Date(time).toLocaleString("zh-CN",{
    year:"numeric",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"
  }):"未知";
}
async function loadDeviceSessions(){
  const list=$("deviceSessionsList");
  if(!authUser)return;
  list.textContent="正在读取已登录设备…";
  try{
    const response=await api("/api/sessions");
    list.replaceChildren();
    $("deviceSessionsRevokeOthers").hidden=true;
    if(!response.sessions?.length){
      list.textContent="当前没有有效会话。";
      return;
    }
    $("deviceSessionsRevokeOthers").hidden=response.sessions.filter(row=>!row.current).length===0;
    for(const session of response.sessions){
      const item=document.createElement("div"),details=document.createElement("div"),
            name=document.createElement("strong"),meta=document.createElement("small"),
            action=document.createElement("button");
      item.className="device-session";
      name.textContent=session.name+(session.current?" · 当前设备":"");
      const expires=session.expiresAt?displaySessionTime(session.expiresAt):"未知";
      const method=session.loginMethod==="ios-native"?"iOS 原生 App · 网页授权":
        session.loginMethod==="web"?"网页账号登录":"历史未知";
      meta.textContent=(session.platform||"未知系统")+" · "+(session.osVersion||"版本未提供")+
        " · "+method+" · 最近使用："+displaySessionTime(session.lastActiveAt)+
        " · 预计到期："+expires+(session.remembered?" · 保持登录":"")+
        (!session.identifiedInstallation?" · 旧会话未提供设备标识，无法安全去重":"");
      action.type="button";
      action.className=session.current?"record-danger":"ghost";
      action.textContent=session.current?"退出当前设备":"退出此设备";
      action.setAttribute("aria-label","退出 "+session.name+(session.current?" 当前设备":"")+" 的登录");
      action.addEventListener("click",async()=>{
        if(!confirm("确定让"+session.name+"退出药时？未同步的本地草稿仍保留在对应设备，但需要重新登录才能同步。"))return;
        action.disabled=true;
        try{
          const reply=await api("/api/sessions/revoke","POST",{id:session.id});
          if(reply.current){
            window.dispatchEvent(new Event("pk-atlas-logout"));
            appForgetSession();
            authUser=null;
            syncConflict=false;syncPending=false;
            $("accountActions").hidden=true;$("accountTools").hidden=true;
            $("authForm").hidden=false;
            $("accountName").textContent="登录已退出";
            setSyncStatus("当前设备的登录已撤销；本机草稿保留。");
            showStage("auth");
            // Clear account data still held in JS memory once drafts are safe.
            location.reload();
          }else await loadDeviceSessions();
        }catch(err){
          action.disabled=false;
          setSyncStatus("无法退出该设备："+err.message,true);
        }
      });
      details.append(name,meta);item.append(details,action);list.append(item);
    }
  }catch(err){list.textContent="读取设备失败："+err.message}
}
function initDeviceSessionUI(){
  $("deviceSessionsRefresh").addEventListener("click",()=>void loadDeviceSessions());
  $("deviceSessionsRevokeOthers").addEventListener("click",async()=>{
    if(!authUser)return;
    if(!confirm("确定退出此账号在其他所有设备上的登录吗？当前设备保持登录。其他设备已有的本地草稿会保留，但需要重新登录才能同步。"))return;
    const button=$("deviceSessionsRevokeOthers");
    button.disabled=true;
    try{
      const result=await api("/api/sessions/revoke-others","POST",{});
      await loadDeviceSessions();
      const notice=$("deviceSessionResult");
      notice.textContent="已让其他 "+(result.revoked||0)+" 个会话退出，当前设备保持登录。";
      notice.hidden=false;
    }catch(error){
      const notice=$("deviceSessionResult");
      notice.textContent="撤销其他设备失败："+error.message;
      notice.hidden=false;
    }finally{button.disabled=false}
  });
  $("deviceSessionGuide").addEventListener("toggle",()=>{
    if($("deviceSessionGuide").open)void loadDeviceSessions();
  });
}
/* Offline-only fallback for a previously authenticated, remembered private
 * device. Cached JSON never goes through CacheStorage or a public CDN.
 * A recent successful online login is mandatory; remote revocation cannot
 * be checked offline, so cached views expire after seven days. */
const OFFLINE_SNAPSHOT_PREFIX="pk-atlas-offline-state-v1:";
const OFFLINE_GRACE_MS=7*86400000;
const PENDING_OFFLINE_LOGOUT_KEY="pk-atlas-logout-pending-v1";
async function offlineFinishPendingLogout(){
  if(getStored(PENDING_OFFLINE_LOGOUT_KEY)!=="1")return true;
  try{
    try{await window.disablePushForLogout?.()}catch{}
    try{await api("/api/logout","POST")}catch(error){
      if(error.status!==401)throw error;
    }
    localStorage.removeItem(PENDING_OFFLINE_LOGOUT_KEY);
    return true;
  }catch{return false}
}
let appOfflineRestored=false;
function initOfflineShell(){
  if(location.protocol!=="https:"||!("serviceWorker" in navigator))return;
  const install=()=>navigator.serviceWorker.register(
    "/sw.js?v=inverse-chart-navigation-20261119g",{scope:"/"}
  ).catch(()=>{/* A failed shell install must not block login or autosave. */});
  if(document.readyState==="complete")void install();
  else window.addEventListener("load",install,{once:true});
}
function offlineKey(username){return OFFLINE_SNAPSHOT_PREFIX+encodeURIComponent(username)}
function offlineForgetSnapshot(){
  try{
    for(let i=localStorage.length-1;i>=0;i--){
      const key=localStorage.key(i);
      if(key?.startsWith(OFFLINE_SNAPSHOT_PREFIX))localStorage.removeItem(key);
    }
  }catch{}
}
function offlineSaveVerified(username,state,version){
  try{
    const stored=JSON.parse(localStorage.getItem(REMEMBERED_DEVICE_KEY)||"null");
    if(!stored||stored.username!==username||!state||!Number.isInteger(version))return;
    localStorage.setItem(offlineKey(username),JSON.stringify({
      username,version,savedAt:Date.now(),state
    }));
  }catch{
    // A failed offline snapshot must not affect verified cloud autosave.
  }
}
function offlineReadVerified(){
  try{
    const token=JSON.parse(localStorage.getItem(REMEMBERED_DEVICE_KEY)||"null");
    if(!token?.username||!Number.isFinite(token.confirmedAt)||
       Date.now()-token.confirmedAt>OFFLINE_GRACE_MS)return null;
    const item=JSON.parse(localStorage.getItem(offlineKey(token.username))||"null");
    if(!item||item.username!==token.username||!item.state||
       !Number.isInteger(item.version)||!Number.isFinite(item.savedAt)||
       Date.now()-item.savedAt>OFFLINE_GRACE_MS)return null;
    return item;
  }catch{return null}
}
function offlineSetBanner(isOffline,message=""){
  const banner=$("offlineAppBanner");
  banner.hidden=!isOffline;
  banner.textContent=message||"离线模式：记录仅保存在本机草稿，联网并验证登录后自动核对。";
}
async function offlineRestoreLastVerified(){
  const item=offlineReadVerified();
  if(!item)return false;
  appOfflineRestored=true;
  authUser=item.username;
  applyAccountState(item.state,item.version);
  const entries=syncReadDrafts(item.username);
  const pending=entries.filter(entry=>syncDraftChanges(entry.draft.base,entry.draft.state).length);
  // In offline mode, recover exactly the latest local pending snapshot.
  // Never silently union deleted rows back in from older tabs/devices.
  const newest=pending.at(-1);
  if(newest){
    syncApplyMerged(newest.draft.state);
    syncUploadId=newest.draft.operationId||syncNewOperationId();
  }
  syncRecoveredDrafts=entries;
  syncConflict=false;
  syncPending=Boolean(newest);
  $("accountName").textContent=item.username+" · 离线模式";
  $("authForm").hidden=true;
  $("accountActions").hidden=false;
  $("accountTools").hidden=false;
  const today=dateKey(Date.now());
  openCalculationDate(today);
  const message=syncConflict?
    "离线草稿有冲突，已保留本地文件；联网后需要人工核对。":
    "正在离线查看最近验证的记录。新增记录只保存在本机，云端尚未确认。";
  syncSetStatus(syncConflict?"conflict":"offline",message);
  offlineSetBanner(true,message);
  $("authRetry").hidden=false;
  return true;
}
function render(){
  if(!document.body.classList.contains("stage-calc")){if(document.body.classList.contains("stage-choose"))renderChooser();return}
  $("calcContext").textContent=`${selectedDate} · ${chosen().name}`;
  renderDay();renderRecords();renderScheduledDoses();renderIntakes();renderMealImpact();
  if(!matchMedia("(max-width:700px)").matches||document.body.dataset.mobilePane==="results"){drawChart();renderScenario();if(inversePage==="point")renderPointInverse();else renderInverse()}
  renderHistory();renderAppHome();renderAppHistoryQuicklist();updateWheelTriggers();
}
function fillNow(){const now=new Date(),clock=now.getHours()*3600000+now.getMinutes()*60000;$("doseTime").value=localInput(selectedDate===dateKey(now.getTime())?now.getTime():dayStart(selectedDate)+clock);timeTouched=false;updateWheelTriggers()}
function fillIntakeNow(){const now=new Date(),clock=now.getHours()*3600000+now.getMinutes()*60000;$("intakeTime").value=localInput(selectedDate===dateKey(now.getTime())?now.getTime():dayStart(selectedDate)+clock);updateWheelTriggers()}
function resetIntakeEdit(){editingIntakeId="";$("intakeSubmit").textContent="＋ 保存饮食记录";$("intakeCancel").hidden=true;$("intakeDelete").hidden=true;$("intakeKind").value="meal";$("mealType").value="regular";$("intakeDrink").value="none";$("intakeNote").value="";$("mealTypeWrap").hidden=false;fillIntakeNow()}
function editIntake(id){const x=intakes.find(row=>row.id===id);if(!x)return;editingIntakeId=id;$("intakeKind").value=x.kind;$("intakeTime").value=localInput(x.time);$("mealType").value=x.mealType;$("intakeDrink").value=x.drink;$("intakeNote").value=x.note;$("mealTypeWrap").hidden=x.kind!=="meal";$("intakeSubmit").textContent="保存饮食记录修改";$("intakeCancel").hidden=false;$("intakeDelete").hidden=false;updateWheelTriggers();if(document.body.classList.contains("app-mode"))appOpenSheet("intake",{editing:true});else{setMobilePane("records");$("intakeForm").scrollIntoView({behavior:"smooth",block:"center"})}}
function resetDoseEdit(){editingDoseId="";editingScheduledId="";editingAdoptedIndex=null;editingAdoptedAdjustmentIndex=null;$("doseCancel").hidden=true;$("doseDelete").hidden=true;setDoseEditor(unitByDrug[current]||"mg",chosen().defaultDose);fillNow();doseSaveHint()}
function editRecord(id){
  const r=records.find(x=>x.id===id);if(!r)return;
  if(!DRUGS.some(d=>d.id===r.drug))return;
  if(current!==r.drug){current=r.drug;$("drug").value=current;$("calcDrug").value=current;renderDrug()}
  selectedDate=dateKey(r.time);selectedDateFollowsToday=selectedDate===dateKey(Date.now());editingScheduledId="";editingAdoptedIndex=null;editingAdoptedAdjustmentIndex=null;editingDoseId=id;
  $("doseTime").value=localInput(r.time);timeTouched=true;
  setDoseEditor(r.unit==="g"?"g":"mg",r.mg);
  doseSaveHint();$("doseCancel").hidden=false;$("doseDelete").hidden=false;
  if(document.body.classList.contains("app-mode"))appOpenSheet("dose",{editing:true});else{setMobilePane("records");$("doseForm").scrollIntoView({behavior:"smooth",block:"center"})}
}
let pendingDoseDeleteId=null,pendingIntakeDeleteId=null;
function requestDoseDeletion(id){
  const row=records.find(r=>r.id===id);
  if(!row||!authUser)return;
  const amount=row.unit==="g"?fmt(row.mg/1000,4)+" g":fmt(row.mg,3)+" mg";
  $("deleteDoseDescription").textContent=
    recordDrugName(row)+" · "+amount+" · "+fullDate(row.time)+
    "。删除后将自动保存本机草稿并同步云端，浓度曲线及后续模型提醒会按剩余记录更新。";
  pendingDoseDeleteId=id;
  pendingIntakeDeleteId=null;
  $("deleteDoseTitle").textContent="删除这条服用记录？";
  $("deleteDoseDialog").showModal();
}
function applyConfirmedDoseDeletion(id){
  if(!authUser)return;
  const row=records.find(r=>r.id===id);
  if(!row)return;
  if(editingDoseId===id){
    if($("appRecordSheet").open)appCloseSheet();
    syncClearEditorFields(["doseTime","doseAmount","doseUnit"],row.drug);
    resetDoseEdit();
  }
  records=records.filter(r=>r.id!==id);
  appliedPointScenario=null;
  persist();
  renderDrug();
}
function requestIntakeDeletion(id){
  const item=intakes.find(row=>row.id===id);
  if(!item||!authUser)return;
  pendingIntakeDeleteId=id;
  pendingDoseDeleteId=null;
  $("deleteDoseTitle").textContent="删除这条饮食记录？";
  $("deleteDoseDescription").textContent=
    intakeLabel(item)+" · "+fullDate(item.time)+
    "。确认后会删除此条饮食记录，并重新计算相关药物的餐后吸收情景。更改将自动同步到云端。";
  $("deleteDoseDialog").showModal();
}
function applyConfirmedIntakeDeletion(id){
  if(!authUser)return;
  const item=intakes.find(row=>row.id===id);
  if(!item)return;
  if(editingIntakeId===id){
    if($("appRecordSheet").open)appCloseSheet();
    syncClearEditorFields(["intakeKind","intakeTime","mealType","intakeDrink","intakeNote"]);
    resetIntakeEdit();
  }
  intakes=intakes.filter(row=>row.id!==id);
  appliedPointScenario=null;
  persist();
  render();
}
const WHEEL_ROW=44;
let wheelInput=null,wheelState={};
const wheelPad=n=>String(n).padStart(2,"0");
function wheelValue(input){
  if(!input.value)return "选择日期时间";
  const [date,time]=input.value.split("T");return input.type==="date"?date:`${date} ${time||"00:00"}`;
}
function updateWheelTriggers(){
  for(const input of document.querySelectorAll("input.wheel-enabled")){const trigger=input.nextElementSibling;if(trigger?.classList.contains("wheel-trigger"))trigger.textContent=wheelValue(input)}
}
function wheelParts(){
  const year=Number(wheelState.year),month=Number(wheelState.month);const days=new Date(year,month,0).getDate();
  const parts={year:Array.from({length:101},(_,i)=>2000+i),month:Array.from({length:12},(_,i)=>i+1),day:Array.from({length:days},(_,i)=>i+1)};
  if(wheelInput?.type!=="date"){parts.hour=Array.from({length:24},(_,i)=>i);parts.minute=Array.from({length:60},(_,i)=>i)}
  return parts;
}
function renderWheel(){
  const columns=$("wheelColumns"),parts=wheelParts();columns.replaceChildren();
  const labels={year:"年",month:"月",day:"日",hour:"时",minute:"分"};
  for(const [key,values] of Object.entries(parts)){
    const group=document.createElement("div");group.className="wheel-col";group.dataset.part=key;
    const label=document.createElement("span");label.className="wheel-label";label.textContent=labels[key];
    const scroller=document.createElement("div");scroller.className="wheel-options";scroller.setAttribute("role","listbox");scroller.setAttribute("aria-label",labels[key]);
    let initializing=true,markTimer=null;
    for(const value of values){const item=document.createElement("button");item.type="button";item.className="wheel-item";item.setAttribute("role","option");item.dataset.value=String(value);item.textContent=key==="year"?String(value):wheelPad(value);item.onclick=()=>{initializing=false;wheelState[key]=value;const index=values.indexOf(value);scroller.scrollTop=index*WHEEL_ROW;markWheelSelection(scroller,index);if(key==="year"||key==="month")refreshWheelDay()};scroller.append(item)}
    const enableScroll=()=>{initializing=false};
    scroller.addEventListener("pointerdown",enableScroll,{passive:true});scroller.addEventListener("touchstart",enableScroll,{passive:true});scroller.addEventListener("wheel",enableScroll,{passive:true});
    scroller.addEventListener("scroll",()=>{if(initializing)return;const idx=Math.max(0,Math.min(values.length-1,Math.round(scroller.scrollTop/WHEEL_ROW)));wheelState[key]=values[idx];clearTimeout(markTimer);markTimer=setTimeout(()=>{markWheelSelection(scroller,idx);if(key==="year"||key==="month")refreshWheelDay()},80)},{passive:true});
    group.append(label,scroller);columns.append(group);
    requestAnimationFrame(()=>{const index=Math.max(0,values.indexOf(Number(wheelState[key])));scroller.scrollTop=index*WHEEL_ROW;markWheelSelection(scroller,index);setTimeout(()=>{initializing=false},0)});
  }
}
function markWheelSelection(scroller,index){for(const [i,item] of [...scroller.children].entries()){const selected=i===index;item.classList.toggle("selected",selected);item.setAttribute("aria-selected",String(selected))}}
function refreshWheelDay(){
  const year=Number(wheelState.year),month=Number(wheelState.month),dayCol=$("wheelColumns").querySelector('[data-part="day"] .wheel-options');if(!dayCol)return;
  const count=new Date(year,month,0).getDate();if(dayCol.children.length===count)return;
  wheelState.day=Math.min(Number(wheelState.day),count);
  for(let i=dayCol.children.length;i<count;i++){const item=document.createElement("button");item.type="button";item.className="wheel-item";item.setAttribute("role","option");item.dataset.value=String(i+1);item.textContent=wheelPad(i+1);item.onclick=()=>{wheelState.day=i+1;dayCol.scrollTop=i*WHEEL_ROW;markWheelSelection(dayCol,i)};dayCol.append(item)}
  while(dayCol.children.length>count)dayCol.lastChild.remove();dayCol.scrollTop=(wheelState.day-1)*WHEEL_ROW;markWheelSelection(dayCol,wheelState.day-1);
}
function openWheel(input){
  wheelInput=input;const now=new Date(),raw=input.value||localInput(now.getTime()),[date,time="00:00"]=raw.split("T"),[year,month,day]=date.split("-").map(Number),[hour,minute]=time.split(":").map(Number);
  wheelState={year:year||now.getFullYear(),month:month||now.getMonth()+1,day:day||now.getDate(),hour:hour||0,minute:minute||0};
  $("wheelTitle").textContent=input.type==="date"?"选择日期":"选择日期与时间";$("wheelDialog").showModal();renderWheel();
}
function commitWheel(){
  if(!wheelInput)return;
  // Clicks update wheelState immediately. Reading scrollTop here can capture
  // an unfinished smooth scroll and silently replace the selected minute.
  wheelState.day=Math.min(wheelState.day,new Date(wheelState.year,wheelState.month,0).getDate());
  const date=`${wheelState.year}-${wheelPad(wheelState.month)}-${wheelPad(wheelState.day)}`;
  wheelInput.value=wheelInput.type==="date"?date:`${date}T${wheelPad(wheelState.hour)}:${wheelPad(wheelState.minute)}`;
  wheelInput.dispatchEvent(new Event("input",{bubbles:true}));wheelInput.dispatchEvent(new Event("change",{bubbles:true}));
  $("wheelDialog").close();updateWheelTriggers();wheelInput=null;
}
function initWheelPickers(){
  for(const input of document.querySelectorAll('input[type="date"],input[type="datetime-local"]')){
    input.classList.add("wheel-enabled");const trigger=document.createElement("button");trigger.type="button";trigger.className="wheel-trigger";trigger.setAttribute("aria-label",`滚动选择${input.type==="date"?"日期":"日期时间"}`);trigger.onclick=e=>{e.preventDefault();openWheel(input)};input.insertAdjacentElement("afterend",trigger);
  }
  $("wheelCancel").onclick=()=>$("wheelDialog").close();$("wheelDone").onclick=commitWheel;
  $("wheelNow").onclick=()=>{const now=new Date();wheelState={year:now.getFullYear(),month:now.getMonth()+1,day:now.getDate(),hour:now.getHours(),minute:now.getMinutes()};renderWheel()};
  $("wheelDialog").addEventListener("close",()=>{wheelInput=null});updateWheelTriggers();
}
function init(){
  migrateLegacy();repairLegacyCourseDays();
  $("chartScale").value="55";
  const select=$("drug");for(const d of DRUGS){const o=document.createElement("option");o.value=d.id;o.textContent=`${d.name} · ${d.en}`;select.append(o)}select.value=current;
  const calcDrug=$("calcDrug"),planDrug=$("planDrug");for(const d of DRUGS){for(const target of [calcDrug,planDrug]){const o=document.createElement("option");o.value=d.id;o.textContent=d.name;target.append(o)}}calcDrug.value=current;planDrug.value=current;
  planDrug.addEventListener("change",loadPlanForCurrent);
  calcDrug.addEventListener("change",()=>{current=calcDrug.value;$("drug").value=current;activeCourseId="";resetDoseEdit();renderDrug()});
  $("chooseDate").value=selectedDate;
  $("chooseDateOpen").addEventListener("click",()=>openCalculationDate($("chooseDate").value||selectedDate));
  $("chooserAdd").addEventListener("click",()=>openCalculationDate($("chooseDate").value||selectedDate,true));
  $("backToChooser").addEventListener("click",()=>document.body.classList.contains("app-mode")?appSetView("history"):showStage("choose"));
  $("mobileRecords").addEventListener("click",()=>setMobilePane("records",true));
  $("mobileResults").addEventListener("click",()=>setMobilePane("results",true));
  $("inverseTabPoint").addEventListener("click",()=>setInversePage("point"));
  $("inverseTabDuration").addEventListener("click",()=>setInversePage("duration"));
  for(const id of ["inverseTabPoint","inverseTabDuration"])$(id).addEventListener("keydown",e=>{
    if(e.key!=="ArrowLeft"&&e.key!=="ArrowRight")return;
    e.preventDefault();const next=id==="inverseTabPoint"?"duration":"point";setInversePage(next);$(next==="point"?"inverseTabPoint":"inverseTabDuration").focus();
  });
  $("viewDate").value=selectedDate;$("viewDate").addEventListener("change",()=>{if(!$("viewDate").value)return;selectedDate=$("viewDate").value;selectedDateFollowsToday=selectedDate===dateKey(Date.now());activeCourseId="";resetDoseEdit();resetIntakeEdit();renderDrug()});
  select.addEventListener("change",()=>{current=select.value;setStored("pk-atlas-current-drug-v1",current);activeCourseId="";appliedPointScenario=null;resetDoseEdit();$("scenarioTime").value="";$("scenarioDose").value="";renderDrug()});
  let renalEstimatedPending=false;
  $("renalCrCl").addEventListener("input",()=>{renalEstimatedPending=false;$("renalStatus").textContent="尚未保存；保存后才会重算。"});
  $("renalCalculate").addEventListener("click",()=>{
    const age=Number($("renalAge").value),weight=Number($("renalWeight").value),scr=Number($("renalCreatinine").value),coefficient=Number($("renalSex").value),unit=$("renalCreatinineUnit").value;
    if(!$("renalAge").value||!Number.isInteger(age)||age<18||age>120||!$("renalWeight").value||weight<20||weight>300||!$("renalCreatinine").value||!Number.isFinite(scr)||scr<=0){$("renalStatus").textContent="请核对成人年龄、体重和血清肌酐；此公式不适用于未成年人。";return}
    const mgdl=unit==="umol"?scr/88.4:scr,crcl=(140-age)*weight/(72*mgdl)*coefficient;
    if(!Number.isFinite(crcl)||crcl<15||crcl>150){$("renalStatus").textContent=`公式估算 CrCl 约 ${fmt(crcl,2)} mL/min，超出本站 15–150 mL/min 的情景范围，不能保存到模型。请向专业人员核对。`;return}
    $("renalCrCl").value=String(Number(crcl.toFixed(3)));renalEstimatedPending=true;
    $("renalStatus").textContent=`公式估算 CrCl 约 ${fmt(crcl,2)} mL/min。请核对后点击“保存个人值并重算”。`;
  });
  $("renalSave").addEventListener("click",()=>{
    const raw=$("renalCrCl").value.trim(),crcl=Number(raw);
    if(!raw||!Number.isFinite(crcl)||crcl<15||crcl>150){$("renalStatus").textContent="请输入 15–150 mL/min 的有效 CrCl；透析或范围外情况不能使用此模型。";return}
    renal={crcl,source:renalEstimatedPending?"estimated":"entered"};renalEstimatedPending=false;MODEL_PARAMS.clear();appliedPointScenario=null;persist();renderDrug();
  });
  $("renalReset").addEventListener("click",()=>{renal=null;renalEstimatedPending=false;MODEL_PARAMS.clear();appliedPointScenario=null;persist();renderDrug()});
  $("doseTime").addEventListener("input",()=>{timeTouched=true;doseSaveHint()});$("nowButton").addEventListener("click",()=>{$("doseTime").value=localInput(Date.now());timeTouched=true;updateWheelTriggers()});
  $("doseAmount").addEventListener("input",renderPillHint);
  $("doseUnit").addEventListener("change",()=>{const mg=Number($("doseAmount").value)*(previousUnit==="g"?1000:1),unit=$("doseUnit").value;unitByDrug[current]=unit;setDoseEditor(unit,mg)});
  $("doseCancel").addEventListener("click",resetDoseEdit);
  $("doseDelete").addEventListener("click",()=>{
    if(editingAdoptedAdjustmentIndex!==null){const index=editingAdoptedAdjustmentIndex;
      if(confirm("删除已采用的调整节点？不删除实际服用记录。")){
        resetDoseEdit();deleteAdoptedAdjustmentNodeFromEditor(index);
        if(document.body.classList.contains("app-mode"))appCloseSheet();}
      return;
    }
    if(editingAdoptedIndex!==null){const index=editingAdoptedIndex;
      if(confirm("删除该已采用方案的计划节点？不会删除实际服用记录或其他独立计划。")){
        resetDoseEdit();deleteAdoptedNodeFromEditor(index);if(document.body.classList.contains("app-mode"))appCloseSheet();}
      return;
    }
    if(editingDoseId)requestDoseDeletion(editingDoseId);
    else if(editingScheduledId){const id=editingScheduledId;
      if(confirm("删除这条计划服用？")){scheduledDoses=scheduledDoses.filter(d=>d.id!==id);resetDoseEdit();persist();renderDrug()}}
  });
  $("deleteDoseCancel").addEventListener("click",()=>$("deleteDoseDialog").close("cancel"));
  $("deleteDoseConfirm").addEventListener("click",()=>$("deleteDoseDialog").close("delete"));
  $("deleteDoseDialog").addEventListener("close",()=>{
    const dialog=$("deleteDoseDialog"),confirmed=dialog.returnValue==="delete",id=pendingDoseDeleteId,intakeId=pendingIntakeDeleteId;
    pendingDoseDeleteId=null;
    pendingIntakeDeleteId=null;
    dialog.returnValue="";
    if(confirmed&&id)applyConfirmedDoseDeletion(id);
    else if(confirmed&&intakeId)applyConfirmedIntakeDeletion(intakeId);
  });
  $("doseForm").addEventListener("submit",e=>{
    e.preventDefault();const time=new Date($("doseTime").value).getTime(),unit=$("doseUnit").value,mg=Number($("doseAmount").value)*(unit==="g"?1000:1);
    if(!Number.isFinite(time)||!Number.isFinite(mg)||mg<=0){alert("请输入大于 0 的有效单次剂量和服用时间。");return}
    if(current==="prep_ftc_taf"&&Math.abs(mg/225-Math.round(mg/225))>1e-8){alert("当前收录的是 FTC 200 mg + TAF 25 mg 固定复方；请按整片输入 225 mg 的倍数。");return}
    const courseId=`day-${dateKey(time)}`;
    if(editingAdoptedAdjustmentIndex!==null){
      const index=editingAdoptedAdjustmentIndex;
      if(updateAdoptedAdjustmentNodeFromEditor(index,time,mg)){
        resetDoseEdit();if(document.body.classList.contains("app-mode"))appCloseSheet();
      }
      return;
    }
    if(editingAdoptedIndex!==null){
      const index=editingAdoptedIndex;
      if(updateAdoptedNodeFromEditor(index,time,mg)){
        resetDoseEdit();if(document.body.classList.contains("app-mode"))appCloseSheet();
      }
      return;
    }
    const isPlan=!!editingScheduledId||time>Date.now();
    if(isPlan){
      const id=editingScheduledId||editingDoseId||uuid();
      if(editingDoseId)records=records.filter(x=>x.id!==editingDoseId);
      const value={id,drug:current,time,mg,unit,kind:"planned"};
      const index=scheduledDoses.findIndex(x=>x.id===id);
      if(index<0)scheduledDoses.push(value);else scheduledDoses[index]=value;
    }else if(editingDoseId){
      const r=records.find(x=>x.id===editingDoseId);
      if(r){Object.assign(r,{time,mg,unit,courseId});if(r.source==="ios-journal-17.1")r.journal={...r.journal,editedOnSite:true}}
    }else records.push({id:uuid(),courseId,drug:current,time,mg,unit});
    selectedDate=dateKey(time);selectedDateFollowsToday=selectedDate===dateKey(Date.now());appliedPointScenario=null;syncClearEditorFields(["doseTime","doseAmount","doseUnit"]);persist();resetDoseEdit();renderDrug();if(document.body.classList.contains("app-mode"))appCloseSheet();
  });
  $("intakeKind").addEventListener("change",()=>{$("mealTypeWrap").hidden=$("intakeKind").value!=="meal"});
  $("intakeNow").addEventListener("click",()=>{$("intakeTime").value=localInput(Date.now());updateWheelTriggers()});
  $("intakeCancel").addEventListener("click",resetIntakeEdit);
  $("intakeDelete").addEventListener("click",()=>{if(editingIntakeId)requestIntakeDeletion(editingIntakeId)});
  $("intakeForm").addEventListener("submit",e=>{
    e.preventDefault();const time=new Date($("intakeTime").value).getTime(),kind=$("intakeKind").value,drink=$("intakeDrink").value;
    if(!Number.isFinite(time)){alert("请选择有效的饮食发生时间。");return}
    if(kind==="drink"&&drink==="none"){alert("仅饮料记录请选择饮料种类。");return}
    const item={id:editingIntakeId||uuid(),time,kind,mealType:$("mealType").value,drink,note:$("intakeNote").value.trim().slice(0,100)};
    if(editingIntakeId){const index=intakes.findIndex(x=>x.id===editingIntakeId);if(index>=0)intakes[index]=item}
    else intakes.push(item);
    selectedDate=dateKey(time);selectedDateFollowsToday=selectedDate===dateKey(Date.now());appliedPointScenario=null;syncClearEditorFields(["intakeKind","intakeTime","mealType","intakeDrink","intakeNote"]);persist();resetIntakeEdit();render();if(document.body.classList.contains("app-mode"))appCloseSheet();
  });
  for(const [id,other] of [["threshold","thresholdEquivalent"],["thresholdEquivalent","threshold"]])$(id).addEventListener("input",()=>{
    if($(id).value.trim())$(other).value="";
    referencePending=true;
    $("referenceStatus").textContent="待确定；输入不会触发计算";
    $("referenceConfirm").classList.add("pending");
    $("crossingResult").textContent="参考值尚未确定。点击“确定并计算”后更新下降交点。";
    renderScenario();renderPointInverse();renderInverse();
  });
  $("referenceConfirm").addEventListener("click",()=>{
    const blood=$("threshold").value.trim(),equivalent=$("thresholdEquivalent").value.trim(),raw=blood||equivalent;
    if(blood&&equivalent){$("referenceStatus").textContent="请只填写一种参考值。";return}
    const value=Number(raw);
    if(raw&&(!Number.isFinite(value)||value<=0||value>1000000)){$("referenceStatus").textContent="参考值须大于 0 且不超过 1,000,000。";return}
    if(raw)referenceMemory[current]={mode:equivalent?"equivalent":"blood",value};else delete referenceMemory[current];
    referencePending=false;$("referenceConfirm").classList.remove("pending");
    $("referenceStatus").textContent=raw?`已应用 ${fmt(value,3)} ${equivalent?"mg（等效）":"mg/L"}`:"已清空参考值";
    appliedPointScenario=null;syncClearEditorFields(["threshold","thresholdEquivalent"]);persist();render();
  });
  $("targetStart").addEventListener("input",()=>{targetStartTouched=true;rememberInverseInputs();scheduleDurationInverse()});
  $("holdHours").addEventListener("input",()=>{rememberInverseInputs();scheduleDurationInverse()});
  $("inverseCount").addEventListener("input",()=>{rememberInverseInputs();scheduleDurationInverse()});
  $("inverseManageStrengths").addEventListener("click",()=>{$("planDrug").value=current;loadPlanForCurrent();setMobilePane("records",true);openDisclosure("planPanel");});
  $("inversePreview").addEventListener("click",()=>{if(!inverseScenario||inverseScenario.drug!==current)return;appliedPointScenario={...inverseScenario};$("scenarioTime").value="";$("scenarioDose").value="";render();$("chartWrap").scrollIntoView({behavior:"smooth",block:"center"})});
  $("pointTarget").addEventListener("input",()=>{pointTargetTouched=true;rememberInverseInputs();appliedPointScenario=null;schedulePointInverse()});
  $("pointMaxDose").addEventListener("input",()=>{rememberInverseInputs();appliedPointScenario=null;schedulePointInverse()});
  $("pointTotalMax").addEventListener("input",()=>{rememberInverseInputs();appliedPointScenario=null;schedulePointInverse()});
  $("pointCount").addEventListener("input",()=>{rememberInverseInputs();appliedPointScenario=null;schedulePointInverse()});
  for(const id of ["pointTargetLimitEnabled","pointTargetLimitBlood","pointTargetLimitEquivalent"]){
    $(id).addEventListener(id.endsWith("Enabled")?"change":"input",()=>{
      rememberInverseInputs();appliedPointScenario=null;schedulePointInverse();
    });
  }
  for(const id of ["pointPeakMin","pointPeakMode","pointCycleMin","pointCycleMode"]){
    $(id).addEventListener(id.endsWith("Mode")?"change":"input",()=>{rememberInverseInputs();appliedPointScenario=null;schedulePointInverse()});
  }
  $("pointLive").addEventListener("click",()=>{if(!adoptedPlan())return;if(!confirm("确定取消已采用方案？已记录的服用和实时反算候选不会删除。"))return;delete inverseMemory[current].adoptedPointPlan;persist();appliedPointScenario=null;renderPointInverse();drawChart()});
  // Changing the mathematical preview and navigating to the chart are two
  // distinct operations. Switching the small-screen pane (or installed PWA
  // tab) must finish before we scroll to the graph, otherwise scrollIntoView
  // targets a display:none element and lands on the wrong section.
  let inverseChartJumpSerial=0;
  function showInverseScenarioOnChart(scenario){
    if(!scenario || scenario.drug!==current)return;
    const request=++inverseChartJumpSerial;
    // A target may belong to the next day while the currently selected
    // record date is historical. Ensure the 48-hour chart window contains
    // the target before looking for its horizontal pixel position.
    const wantedTarget=Number(scenario.target);
    if(Number.isFinite(wantedTarget) &&
       (wantedTarget<dayStart(selectedDate) || wantedTarget>=dayStart(selectedDate)+48*3600000)){
      selectedDate=dateKey(wantedTarget-12*3600000);
      selectedDateFollowsToday=selectedDate===dateKey(Date.now());
      $("viewDate").value=selectedDate;
    }
    appliedPointScenario={...scenario};
    $("scenarioTime").value="";$("scenarioDose").value="";
    if(document.body.classList.contains("app-mode"))appSetView("chart",{scroll:false});
    else if(matchMedia("(max-width:700px)").matches)setMobilePane("results");
    render();
    requestAnimationFrame(()=>requestAnimationFrame(async()=>{
      if(request!==inverseChartJumpSerial ||
         !document.body.classList.contains("stage-calc") ||
         document.body.classList.contains("app-mode")&&document.body.dataset.appView!=="chart")return;
      const wrap=$("chartWrap");
      // Await in supporting browsers. Safari gracefully resolves the
      // undefined return immediately without blocking the chart preview.
      await wrap.scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth",block:"start"});
      if(request!==inverseChartJumpSerial)return;
      const wanted=Number(scenario.target);
      if(chartView && Number.isFinite(wanted)){
        const t=Math.max(chartView.start,Math.min(chartView.end,wanted));
        wrap.scrollLeft=Math.max(0,chartView.x(t)-wrap.clientWidth/2);
        updateProbe(Math.round((t-chartView.start)/(chartView.end-chartView.start)*(chartView.points.length-1)));
      }
    }));
  }
  $("adoptedPreview").addEventListener("click",()=>{
    const plan=adoptedPlan();if(!plan)return;
    const state=currentAdoptedEvaluation(plan);
    showInverseScenarioOnChart({drug:current,target:plan.target,threshold:plan.threshold,
      mode:plan.mode,doses:state.pending,adoptedVariant:plan.variant||"A",
      matchedRecordIds:state.completed.map(item=>item.record.id)});
  });
  $("pointPreview").addEventListener("click",()=>showInverseScenarioOnChart(pointScenario));
  $("pointMinimumPreview").addEventListener("click",()=>showInverseScenarioOnChart(minimumPointScenario));
  for(const id of ["scenarioTime","scenarioDose","scenarioUnit"])$(id).addEventListener("input",()=>{appliedPointScenario=null;render()});
  $("timeScrubber").addEventListener("input",e=>updateProbe(e.target.value));
  $("chartScale").addEventListener("change",drawChart);
  let chartScrollFrame=0;
  $("chartWrap").addEventListener("scroll",()=>{if(chartScrollFrame||!chartView)return;chartScrollFrame=requestAnimationFrame(()=>{chartScrollFrame=0;if(!chartView)return;const wrap=$("chartWrap"),t=chartView.start+(wrap.scrollLeft+wrap.clientWidth/2-chartView.L)/(chartView.W-chartView.L-chartView.R)*(chartView.end-chartView.start);updateProbe(Math.round((t-chartView.start)/(chartView.end-chartView.start)*(chartView.points.length-1)))})},{passive:true});
  $("jumpNow").addEventListener("click",()=>{if(!chartView)return;const wrap=$("chartWrap"),t=Math.max(chartView.start,Math.min(chartView.end,Date.now()));wrap.scrollTo({left:Math.max(0,chartView.x(t)-wrap.clientWidth/2),behavior:"smooth"});showNowProbe()});
  for(const id of ["planDose","planInterval","planLastTime"])$(id).addEventListener("input",renderPlan);
  $("planAddStrength").addEventListener("click",()=>{const drugId=$("planDrug").value,mg=Number($("planStrength").value),unit=$("planUnit").value,label=$("planStrengthLabel").value.trim();if(!Number.isFinite(mg)||mg<.001){alert("药盒每单位含量须为至少 0.001 mg 的有效数值。");return}if(mg>1e6){alert("请核对药盒含量与 mg 单位。");return}const p=ensurePlan(drugId);if(p.strengths.length>=8){alert("当前每种药物最多保存 8 种规格。");return}if(p.strengths.some(s=>Math.abs(s.mg-mg)<1e-9&&s.unit===unit&&s.label===label)){alert("该规格及备注已保存。");return}p.strengths.push({id:uuid(),mg,unit,label});persist();loadPlanForCurrent();if(inversePage==="duration")renderInverse();if(drugId===current){appliedPointScenario=null;if(inversePage==="point")renderPointInverse();drawChart()}});
  $("planSave").addEventListener("click",()=>{const drugId=$("planDrug").value,dose=Number($("planDose").value),interval=Number($("planInterval").value);if($("planDose").value&&!(dose>0)){alert("处方每次剂量须大于 0。");return}if($("planInterval").value&&!(interval>0&&interval<=168)){alert("处方间隔须大于 0 且不超过 168 小时。");return}const p=ensurePlan(drugId);p.dose=$("planDose").value?dose:null;p.interval=$("planInterval").value?interval:null;p.lastTime=$("planLastTime").value||"";syncClearEditorFields(["planDose","planInterval","planLastTime"]);persist();loadPlanForCurrent();if(inversePage==="duration")renderInverse();if(drugId===current){appliedPointScenario=null;if(inversePage==="point")renderPointInverse();drawChart()}});
  $("quickAdd").addEventListener("click",()=>{if(document.body.classList.contains("app-mode"))appOpenSheet("dose");else{setMobilePane("records");$("recordSection").scrollIntoView({behavior:"smooth",block:"start"})}});
  let resizeFrame=0,lastLayoutWidth=window.innerWidth;
  window.addEventListener("resize",()=>{if(window.innerWidth===lastLayoutWidth)return;lastLayoutWidth=window.innerWidth;clearTimeout(resizeFrame);resizeFrame=setTimeout(()=>{if(document.body.classList.contains("stage-calc")){drawChart();const series=DRUGS.filter(d=>!d.recordOnly).map(d=>daySeries(d,selectedDate)).filter(s=>s.doses.length||s.points.some(p=>p.c>=.001||p.eq>=.1));document.querySelectorAll("#dayCharts svg").forEach(svg=>{const id=svg.closest(".day-chart-card")?.querySelector("h3")?.textContent,shared=id?.includes("所有可建模");drawDaySvg(svg,shared?series:series.filter(s=>s.drug.name===id),shared)})}},180)});
  $("targetStart").value=localInput(Date.now()+2*3600000);
  $("pointTarget").value=defaultPointTarget();
  let lastInverseMinute=Math.floor(Date.now()/60000);
  setInterval(()=>{
    const today=dateKey(Date.now());
    if(today!==lastTodayKey){if($("chooseDate").value===lastTodayKey)$("chooseDate").value=today;lastTodayKey=today}
    if(selectedDateFollowsToday&&selectedDate!==today&&!editingDoseId&&!editingIntakeId){selectedDate=today;$("viewDate").value=today;resetDoseEdit();resetIntakeEdit();renderDrug()}
    if(!probeManual)showNowProbe();
    const calculationsVisible=document.visibilityState==="visible"&&(!matchMedia("(max-width:700px)").matches||document.body.dataset.mobilePane==="results");
    if(!targetStartTouched){const next=localInput(Date.now()+2*3600000);if($("targetStart").value!==next){$("targetStart").value=next;if(calculationsVisible&&inversePage==="duration")renderInverse()}}
    if(!pointTargetTouched){const next=defaultPointTarget();if($("pointTarget").value!==next){$("pointTarget").value=next;if(calculationsVisible)renderPointInverse()}}
    const inverseMinute=Math.floor(Date.now()/60000);
    if(inverseMinute!==lastInverseMinute){lastInverseMinute=inverseMinute;if(authUser&&inversePage==="point"&&document.visibilityState==="visible"&&(!matchMedia("(max-width:700px)").matches||document.body.dataset.mobilePane==="results"))renderPointInverse()}
    updateWheelTriggers();
  },10000);
  fillNow();fillIntakeNow();renderDrug();initWheelPickers();initLocalTransferReceiver();initSyncLifecycle();initPresentation();initAppMode();initOfflineShell();void initAuth();
}
function renderPlan(){
  const d=Number($("planDose").value),interval=Number($("planInterval").value),timeText=$("planLastTime").value,parts=[],strengths=getStrengths($("planDrug").value);
  if($("planDose").value){
    if(!Number.isFinite(d)||d<=0)parts.push("请输入大于 0 的处方单次剂量。");
    else if(!strengths.length)parts.push("尚未保存此药的药盒规格，无法核对完整单位。");
    else{const option=nearestWholeDose(d,wholeDoseOptions(strengths),d);parts.push(option&&Math.abs(option.mg-d)<.0005?`${fmt(d,3)} mg 可由 ${formatParts(option.parts)} 组成（仅算术核对）。`:`${fmt(d,3)} mg 无法由已保存规格的完整单位精确组成；请核对处方和药盒。`)}
  }
  if($("planInterval").value&&timeText){const t=new Date(timeText).getTime();parts.push(Number.isFinite(interval)&&interval>0&&interval<=168&&Number.isFinite(t)?`按输入的处方间隔，下一次计划时间为 ${fullDate(t+interval*3600000)}。这不是根据浓度重新安排的时间。`:"请核对处方间隔和上次计划时间。")}
  $("planResult").textContent=parts.length?parts.join(" "):"填写处方和药盒信息后显示核对结果。";
}
if(typeof document!=="undefined")init();
