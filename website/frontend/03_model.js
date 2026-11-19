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
