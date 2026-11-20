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
  $("pointInitialValue").dataset.mode=referenceSetting().mode;
  $("pointInitialValue").value=saved.pointInitialMode===referenceSetting().mode?(saved.pointInitialValue||""):"";
  const start=new Date(saved.targetStart||"").getTime();
  targetStartTouched=Number.isFinite(start)&&start>now+60000;
  $("targetStart").value=targetStartTouched?saved.targetStart:localInput(now+2*3600000);
}
function rememberInverseInputs(){
  inverseMemory[current]={...Object.fromEntries(INVERSE_FIELDS.map(id=>[id,(id==="pointTargetLimitEnabled"?($(id).checked?"1":"0"):id==="pointTarget"&&!pointTargetTouched||id==="targetStart"&&!targetStartTouched?"":$(id).value).slice(0,32)])),pointInitialMode:referenceSetting().mode,...(inverseMemory[current]?.adoptedPointPlan?{adoptedPointPlan:inverseMemory[current].adoptedPointPlan}:{})};
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
