function strengthenPointPeak(drug,rows,doses,start,target,cap,floor){
  if(!(floor>0))return doses;
  const options=wholeDoseOptions(getStrengths(drug.id)).filter(x=>x.mg<=cap+1e-9);
  if(!options.length||!doses.length)return null;
  const result=doses.map(d=>({...d})),step=5*60000;
  const points=[];for(let time=start;time<target;time+=step)points.push(time);points.push(target);
  for(let iteration=0;iteration<result.length+1;iteration++){
    const levels=points.map(time=>totalEquivalent(drug,time,[...rows,...result]));
    if(Math.max(...levels)>=floor-1e-6)return result;
    let direct=null,fallback=null;
    for(let i=0;i<result.length;i++){
      const dose=result[i],largest=options.at(-1);
      if(largest.mg<=dose.mg+1e-9)continue;
      for(let j=0;j<points.length;j++){
        const perMg=doseEquivalent(drug,{time:dose.time,mg:1},points[j]);
        if(perMg<=1e-10)continue;
        const needed=dose.mg+(floor-levels[j])/perMg;
        const option=nearestWholeDose(needed,options,cap);
        if(option&&(!direct||option.mg-dose.mg<direct.extra))direct={i,option,extra:option.mg-dose.mg};
      }
      const gain=Math.max(...points.map((time,j)=>levels[j]+(largest.mg-dose.mg)*doseEquivalent(drug,{time:dose.time,mg:1},time)));
      if(!fallback||gain>fallback.gain)fallback={i,option:largest,gain};
    }
    const choice=direct||fallback;if(!choice)return null;
    result[choice.i]={...result[choice.i],mg:choice.option.mg,parts:choice.option.parts};
  }
  return pointEquivalentPeak(drug,rows,result,start,target)>=floor-1e-6?result:null;
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
function pointCoveragePeak(drug,rows,doses,start,target,mode){
  const combined=[...rows,...doses],step=5*60000;
  let peak=0;for(let time=start;time<target;time+=step)peak=Math.max(peak,modelValue(drug,time,combined,mode));
  return Math.max(peak,modelValue(drug,target,combined,mode));
}
function scenarioCard({title,badge,result,threshold,target,description,preview,adopt,coverageLabel,reference,totalLabel="模型合计"}){
  const card=document.createElement("section");card.className="scenario-card";
  const head=document.createElement("div");head.className="scenario-card-head";
  const heading=document.createElement("strong");heading.textContent=title;
  const tag=document.createElement("span");tag.className="scenario-badge";tag.textContent=badge;head.append(heading,tag);card.append(head);
  const summary=document.createElement("p");summary.className="scenario-summary";summary.textContent=description;card.append(summary);
  const metrics=document.createElement("div");metrics.className="scenario-metrics";
  const values=[[totalLabel,`${fmt(result.mg,3)} mg`],["假设节点",String(result.doses.length)],["目标时刻血药",`${fmt(result.bloodAtTarget,3)} mg/L`],["目标时刻等效",`${fmt(result.equivalentAtTarget,1)} mg`],[`覆盖段最低 · ${reference.name}`,`${fmt(result.minLevel,3)} ${reference.unit}`],["覆盖段峰值 · 剂量等效量",`${fmt(result.peakEquivalent,3)} mg（等效）`]];
  if(Number.isFinite(result.comparisonPeak))values.push([`同区间峰值 · ${reference.name}`,`${fmt(result.comparisonPeak,3)} ${reference.unit}`]);
  if(reference.name!=="剂量等效量")values.push(["覆盖段峰值 · 血药浓度",`${fmt(result.peak,3)} mg/L`]);
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
function matchAdoptedPlanRecords(plan,newRows,manual){
  const usedRecords=new Set(),usedNodes=new Set(),completed=[],invalidManual=[];
  for(let i=0;i<plan.doses.length;i++){
    if(!Object.hasOwn(manual,i))continue;
    const id=manual[i];
    if(id===null){usedNodes.add(i);continue}
    const row=newRows.find(r=>r.id===id);
    if(!row||usedRecords.has(row.id)){invalidManual.push(i);continue}
    usedNodes.add(i);usedRecords.add(row.id);completed.push({planned:plan.doses[i],record:{id:row.id,time:row.time,mg:row.mg},manual:true});
  }
  // Each node owns the nearer half of its neighbouring time intervals, capped
  // at two hours. Dose differences are allowed; the actual values stay intact.
  const pairs=[];
  for(const row of newRows){
    if(usedRecords.has(row.id))continue;
    for(let i=0;i<plan.doses.length;i++){
      if(usedNodes.has(i))continue;
      const dose=plan.doses[i],left=i?Math.abs(dose.time-plan.doses[i-1].time)/2:Infinity,right=i+1<plan.doses.length?Math.abs(plan.doses[i+1].time-dose.time)/2:Infinity;
      const window=Math.max(30*60000,Math.min(2*3600000,left,right)),difference=Math.abs(row.time-dose.time);
      if(difference<=window)pairs.push({row,i,difference,doseDifference:Math.abs(row.mg-dose.mg)});
    }
  }
  pairs.sort((a,b)=>a.difference-b.difference||a.doseDifference-b.doseDifference||a.row.time-b.row.time||a.i-b.i);
  for(const {row,i} of pairs){
    if(usedRecords.has(row.id)||usedNodes.has(i))continue;
    usedNodes.add(i);usedRecords.add(row.id);
    completed.push({planned:plan.doses[i],record:{id:row.id,time:row.time,mg:row.mg}});
  }
  return{usedRecords,usedNodes,completed,invalidManual};
}
function evaluateAdoptedPlan(plan,now=Date.now()){
  const drug=DRUGS.find(d=>d.id===plan.drug),baselineIds=new Set(plan.baselineIds||[]);
  const foodChanged=typeof plan.mealSignature==="string"&&plan.mealSignature!==mealScenarioSignature(plan.drug,plan.adoptedAt,plan.target);
  const earliest=Math.min(plan.adoptedAt||now,...plan.doses.map(d=>d.time))-6*3600000;
  const newRows=records.filter(r=>r.drug===plan.drug&&!baselineIds.has(r.id)&&r.time>=earliest&&r.time<=plan.target);
  const manual=plan.manualMatches&&typeof plan.manualMatches==="object"?plan.manualMatches:{};
  const {usedRecords,usedNodes,completed,invalidManual}=matchAdoptedPlanRecords(plan,newRows,manual);
  const missed=plan.doses.filter((dose,i)=>!usedNodes.has(i)&&dose.time<now-60000);
  const rows=inverseRecordRows(records.filter(r=>r.drug===plan.drug&&r.time<=plan.target),Math.min(now,plan.target)),cap=plan.cap?Number(plan.cap):Infinity,peakFloor=Number(plan.peakMin)||0;
  const remaining=Math.max(0,plan.doses.length-completed.length);
  const recordedGap=Math.max(30*60000,(Number(plans[plan.drug]?.interval)||0)*3600000);
  const replanFrom=Math.max(now,...completed.map(match=>match.record.time+recordedGap));
  const adjustment=plan.adjustment;
  let pending=adjustment?.doses?adjustment.doses.slice(Math.max(0,completed.length-adjustment.completedCount)).filter(dose=>dose.time>=now-60000):plan.doses.filter((dose,i)=>!usedNodes.has(i)&&dose.time>=now-60000);
  let suggested=null,replanReason="";
  if(newRows.length||Object.keys(manual).length||foodChanged){
    suggested=[];
    if(remaining===0&&modelValue(drug,plan.target,rows,plan.mode)<plan.threshold-1e-6)replanReason="count";
    if(remaining>0&&plan.target<=replanFrom&&modelValue(drug,plan.target,rows,plan.mode)<plan.threshold-1e-6)replanReason="time";
    if(plan.target>replanFrom&&remaining>0){
      let result=solveFixedContinuousPoint(drug,rows,plan.threshold,plan.target,cap,replanFrom,remaining,plan.mode,peakFloor);
      if(result.reason)replanReason=result.reason;
      else if(result.continuousFrom===null)replanReason="coverage";
      else{
        if(["B","C"].includes(plan.variant)&&result.doses.length){
          const primary=result,minimum=solveMinimumPoint(drug,rows,plan.threshold,plan.target,cap,replanFrom,primary,remaining,plan.mode,peakFloor);
          result=minimum||primary;
        }
        suggested=result.doses;
      }
    }
  }
  const combined=[...rows,...pending],sample=5*60000,intervalStart=Math.min(now,plan.target);
  const points=[];for(let time=intervalStart;time<plan.target;time+=sample)points.push({time,value:modelValue(drug,time,combined,plan.mode)});
  points.push({time:plan.target,value:modelValue(drug,plan.target,combined,plan.mode)});
  let lastBelow=null;for(const point of points)if(point.value<plan.threshold-1e-6)lastBelow=point.time;
  const continuousFrom=lastBelow===null?intervalStart:lastBelow>=plan.target?null:Math.min(plan.target,lastBelow+sample);
  const modeled=points.at(-1).value;
  const proposedRows=suggested===null?null:[...rows,...suggested];
  return{at:now,replanFrom,remaining,recordSignature:adoptedRecordSignature(plan.drug),completed,pending,suggested,missed,unmatched:newRows.filter(r=>!usedRecords.has(r.id)),candidates:newRows,invalidManual,foodChanged,replanned:!!newRows.length||!!Object.keys(manual).length||foodChanged,replanReason,plannedMg:plan.doses.reduce((sum,d)=>sum+d.mg,0),completedMg:completed.reduce((sum,d)=>sum+d.record.mg,0),pendingMg:pending.reduce((sum,d)=>sum+d.mg,0),suggestedMg:suggested?.reduce((sum,d)=>sum+d.mg,0)??null,suggestedAtTarget:proposedRows?modelValue(drug,plan.target,proposedRows,plan.mode):null,baselineNow:modelValue(drug,now,rows,plan.mode),bloodAtTarget:concentration(drug,plan.target,combined),equivalentAtTarget:totalEquivalent(drug,plan.target,combined),minLevel:Math.min(...points.map(p=>p.value)),peak:Math.max(...points.map(p=>p.value)),peakEquivalent:continuousFrom===null?0:pointEquivalentPeak(drug,rows,pending,continuousFrom,plan.target),continuousFrom,allCovered:lastBelow===null,fallingAfter:modelValue(drug,plan.target+sample,combined,plan.mode)<=modeled+1e-6};
}
let adoptedEvaluationCache=null;
function currentAdoptedEvaluation(plan){
  const now=Date.now(),key=JSON.stringify([plan,adoptedRecordSignature(plan.drug),intakes,renal,plans[plan.drug],Math.floor(now/60000)]);
  if(adoptedEvaluationCache?.key!==key)adoptedEvaluationCache={key,value:evaluateAdoptedPlan(plan,now)};
  return adoptedEvaluationCache.value;
}
function setManualPlanMatch(plan,index,value,candidates){
  const manual={...(plan.manualMatches||{})};
  if(value==="auto")delete manual[index];
  else if(value==="none")manual[index]=null;
  else if(value.startsWith("record:")){
    const id=value.slice(7);
    if(!candidates.some(row=>row.id===id))return;
    for(const key of Object.keys(manual))if(manual[key]===id)delete manual[key];
    manual[index]=id;
  }else return;
  plan.manualMatches=manual;
  appliedPointScenario=null;persist();renderPointInverse();drawChart();
}
function renderAdoptedPoint(plan){
  const panel=$("adoptedPointPanel"),out=$("adoptedPointResult"),state=currentAdoptedEvaluation(plan),reference={name:plan.mode==="equivalent"?"剂量等效量":"血药浓度",unit:plan.mode==="equivalent"?"mg（等效）":"mg/L"};
  panel.hidden=false;
  out.replaceChildren();out.classList.add("scenario-results");
  const intro=document.createElement("p");intro.className="scenario-intro";intro.textContent=`已采用方案 ${plan.variant||"A"}${plan.variant==="C"?"（历史方案）":""} · ${fullDate(plan.adoptedAt)} · 原方案 ${plan.doses.length} 个节点 · 目标 ${fullDate(plan.target)} · ${reference.name}参考线 ${fmt(plan.threshold,3)} ${reference.unit}${plan.peakMin? ` · 覆盖段等效峰值最低 ${fmt(plan.peakMin,3)} mg`:""}。后续模型节点提醒将跟随当前已采用方案和调整意见自动同步到云端；仅在设备已授权推送时送达。当前复核只读取计算起点前后各 48 小时的同药记录，更早的残留不计。实际服用记录的时间与剂量保持原样；自动重算只生成调整意见，点击采用后才替换后续预计节点。`;out.append(intro);
  const metrics=document.createElement("div");metrics.className="scenario-metrics";
  for(const [label,value] of [["原方案总量",`${fmt(state.plannedMg,3)} mg`],["已记录匹配",`${state.completed.length} 次 · ${fmt(state.completedMg,3)} mg`],["已采用后续节点",`${state.pending.length} 次 · ${fmt(state.pendingMg,3)} mg`],["已采用方案目标值",`${fmt(plan.mode==="equivalent"?state.equivalentAtTarget:state.bloodAtTarget,3)} ${reference.unit}`]]){const item=document.createElement("div"),small=document.createElement("small"),strong=document.createElement("strong");small.textContent=label;strong.textContent=value;item.append(small,strong);metrics.append(item)}out.append(metrics);
  const list=document.createElement("ol");list.className="scenario-timeline";
  for(const [index,dose] of plan.doses.entries()){
    const match=state.completed.find(x=>x.planned===dose),status=match?`${match.manual?"手动":"自动"}匹配 ${fullDate(match.record.time)} · 实际输入 ${fmt(match.record.mg,3)} mg`:state.missed.includes(dose)?"原节点已过时、未匹配":"原节点尚未匹配";
    const li=document.createElement("li"),time=document.createElement("time"),amount=document.createElement("strong"),small=document.createElement("small");
    time.textContent=match?`实际记录 ${fullDate(match.record.time)}`:`原计划 ${fullDate(dose.time)}`;
    amount.textContent=match?`实际输入 ${fmt(match.record.mg,3)} mg`:`原计划 ${fmt(dose.mg,3)} mg`;
    small.textContent=match?`对应原计划 ${fullDate(dose.time)} · ${fmt(dose.mg,3)} mg${dose.parts?.length?` · ${formatParts(dose.parts)}`:""}`:formatParts(dose.parts||[]);li.append(time,amount,small);
    const actual=document.createElement("div");actual.className=match?"actual-match":"planned-match";actual.textContent=match?`${match.manual?"手动":"自动"}关联；曲线和重算使用实际记录的时间与剂量。`:`${status}；仍是预计节点，不是实际服用`;li.append(actual);
    const label=document.createElement("label"),select=document.createElement("select");label.className="manual-match";label.textContent="调整匹配记录";select.setAttribute("aria-label",`第 ${index+1} 个原计划节点的匹配记录`);
    const addOption=(value,text)=>{const option=document.createElement("option");option.value=value;option.textContent=text;select.append(option)};
    addOption("auto","自动匹配");addOption("none","不匹配此节点");
    for(const row of [...state.candidates].sort((a,b)=>a.time-b.time))addOption(`record:${row.id}`,`${fullDate(row.time)} · ${fmt(row.mg,3)} mg${state.completed.some(x=>x.record.id===row.id&&x.planned!==dose)?" · 已用于其他节点":""}`);
    const manual=plan.manualMatches||{},chosen=Object.hasOwn(manual,index)?manual[index]===null?"none":`record:${manual[index]}`:"auto";
    if(chosen.startsWith("record:")&&!state.candidates.some(row=>`record:${row.id}`===chosen))addOption(chosen,"已选记录不存在或不在目标范围内");
    select.value=chosen;select.addEventListener("change",()=>setManualPlanMatch(plan,index,select.value,state.candidates));label.append(select);li.append(label);list.append(li);
  }
  out.append(list);
  if(state.unmatched.length){const heading=document.createElement("strong");heading.className="scenario-replan-heading";heading.textContent="未关联的实际服用记录 · 原时间保留";out.append(heading);const unmatchedList=document.createElement("ol");unmatchedList.className="scenario-timeline";for(const row of [...state.unmatched].sort((a,b)=>a.time-b.time)){const li=document.createElement("li"),time=document.createElement("time"),amount=document.createElement("strong"),note=document.createElement("small");time.textContent=fullDate(row.time);amount.textContent=`${fmt(row.mg,3)} mg`;note.textContent="记录时间和剂量未改；反算按 48 小时窗口读取，且这条记录未替换任何原计划节点。若属于某节点，可在上方手动关联。";li.append(time,amount,note);unmatchedList.append(li)}out.append(unmatchedList)}
  if(state.pending.length){const heading=document.createElement("strong");heading.className="scenario-replan-heading";heading.textContent=plan.adjustment?"当前已采用的调整节点 · 曲线显示":"当前已采用的原计划后续节点 · 曲线显示";out.append(heading);const pendingList=document.createElement("ol");pendingList.className="scenario-timeline";for(const dose of state.pending){const li=document.createElement("li"),time=document.createElement("time"),amount=document.createElement("strong");time.textContent=fullDate(dose.time);amount.textContent=`预计 ${fmt(dose.mg,3)} mg`;li.append(time,amount);pendingList.append(li)}out.append(pendingList)}
  if(state.replanned){const accepted=samePlanNodes(state.suggested,state.pending)&&!state.replanReason,heading=document.createElement("strong");heading.className="scenario-replan-heading";heading.textContent=accepted?"当前调整意见已采用 · 曲线已更新":"调整意见 · 尚未采用";out.append(heading);if(!accepted){const basis=document.createElement("p");basis.className="scenario-intro";basis.textContent=`依据已记录的实际时间与剂量，从 ${fullDate(state.replanFrom)} 起搜索剩余 ${state.remaining} 个节点。当前曲线仍显示已采用的后续节点。`;out.append(basis);const revised=document.createElement("ol");revised.className="scenario-timeline";for(const dose of state.suggested||[]){const li=document.createElement("li"),time=document.createElement("time"),amount=document.createElement("strong"),parts=document.createElement("small");time.textContent=fullDate(dose.time);amount.textContent=`建议模型节点 ${fmt(dose.mg,3)} mg`;parts.textContent=formatDoseContext(dose);li.append(time,amount,parts);revised.append(li)}if(state.suggested?.length)out.append(revised);else{const empty=document.createElement("p");empty.className="scenario-empty";empty.textContent=state.replanReason==="count"?"原方案节点已由记录用完，但目标时刻仍低于参考值。":state.replanReason==="time"?"按实际时间和间隔，目标时刻前已没有可用的后续节点。":state.replanReason?"当前约束与有限候选搜索下未找到调整节点。":"根据当前记录，无需保留后续假设节点。";out.append(empty)}if(!state.replanReason&&state.suggested){const proposal=document.createElement("p");proposal.className="scenario-status";proposal.textContent=`调整意见：预计剩余 ${state.suggested.length} 次 · 合计 ${fmt(state.suggestedMg,3)} mg · 目标时刻模型值约 ${fmt(state.suggestedAtTarget,3)} ${reference.unit}。实际服用记录不会因采用而改变。`;out.append(proposal);const accept=document.createElement("button");accept.type="button";accept.className="secondary adopt-adjustment";accept.textContent="采用调整意见";accept.onclick=()=>adoptPlanAdjustment(plan);out.append(accept)}}}
  const status=document.createElement("p");status.className="scenario-status";status.textContent=`按当前记录核算于 ${fullDate(state.at)} · 目标时刻血药 ${fmt(state.bloodAtTarget,3)} mg/L · 剂量等效 ${fmt(state.equivalentAtTarget,1)} mg · ${state.continuousFrom===null?"目标前存在未覆盖缺口":state.allCovered?"采样均高于参考线":`从 ${fullDate(state.continuousFrom)} 起的采样高于参考线`}${plan.peakMin?` · 覆盖段等效峰值 ${fmt(state.peakEquivalent,3)} mg（${state.peakEquivalent>=plan.peakMin-1e-6?"满足":"未满足"}最低值）`:""}`;out.append(status);
  const caution=document.createElement("p");caution.className="scenario-caution";caution.textContent=`自动匹配选时间最近的原节点，偏差范围不超过相邻计划间隔的一半且最多 2 小时；实际记录的时间和剂量不会改写。超出匹配范围的记录保留原时间，反算按 48 小时窗口规则读取，可在原节点手动关联。${state.unmatched.length?`当前有 ${state.unmatched.length} 条未关联实际记录，若同时保留原计划预计节点，曲线会计入两者；请核对是否需要手动关联或采用调整意见。`:""}${state.invalidManual.length?`${state.invalidManual.length} 个手动选择已失效，请重新选择。`:""}${state.replanReason?"当前剩余搜索无解，不代表可以忽略目标缺口。":""}这是有限候选数学情景，不是服药建议。`;out.append(caution);
}
function adoptPlanAdjustment(plan){
  if(!authUser){alert("请先登录账号，再采用调整意见。");return}
  const state=currentAdoptedEvaluation(plan);
  if(!state.replanned||state.replanReason||!state.suggested||samePlanNodes(state.suggested,state.pending))return;
  plan.adjustment={doses:structuredClone(state.suggested),completedCount:state.completed.length,adoptedAt:Date.now()};
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
    const worker=new Worker("./inverse-worker.js?v=wheel-time-20261112");
    pointWorker=worker;
    worker.onmessage=event=>{if(event.data.id!==id)return;if(pointWorker===worker)pointWorker=null;worker.terminate();if(event.data.error)reject(new Error(event.data.error));else resolve(event.data)};
    worker.onerror=event=>{if(pointWorker===worker)pointWorker=null;worker.terminate();reject(new Error(event.message||"后台计算未能完成"))};
    worker.postMessage({id,...input});
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
  $("pointLive").hidden=!adopted;
  pointScenario=null;minimumPointScenario=null;$("pointPreview").hidden=true;$("pointMinimumPreview").hidden=true;
  if(!rawThreshold){out.textContent="先填写一种要观察的参考值。";return}
  if(!Number.isFinite(threshold)||threshold<=0){out.textContent=`参考值须为大于 0 的 ${unit} 数值。`;return}
  const target=new Date($("pointTarget").value).getTime(),now=Date.now(),capText=$("pointMaxDose").value.trim(),cap=capText?Number(capText):Infinity,drug=chosen(),countText=$("pointCount").value.trim(),fixedCount=countText?Number(countText):null,peakText=$("pointPeakMin").value.trim(),peakFloor=peakText?Number(peakText):0;
  if(!Number.isFinite(target)||target<=now){out.textContent="请选择未来的目标时刻。";return}
  if(target-now>24*3600000){out.textContent="本模型最多检查未来 24 小时；请选择更近的目标时刻。";return}
  if(capText&&(!Number.isFinite(cap)||cap<=0)){out.textContent="单次假设剂量上限须为大于 0 的 mg 数值。";return}
  if(countText&&(!Number.isInteger(fixedCount)||fixedCount<1||fixedCount>8)){out.textContent="假设服用次数请留空，或填写 1—8 的整数。";return}
  if(peakText&&(!Number.isFinite(peakFloor)||peakFloor<=0)){out.textContent="覆盖段峰值最低值须为大于 0 的剂量等效 mg 数值。";return}
  const rows=inverseRecordRows(allRows().filter(r=>r.time<=now),now);
  out.textContent="正在后台计算方案 A 和方案 B，页面可继续操作…";
  let result,minimum;
  try{
    ({result,minimum}=await solvePointInWorker({drugId:drug.id,rows,plan:plans[drug.id]||{},meals:intakes,renalState:renal,threshold,target,cap,now,fixedCount,mode,peakFloor},requestId));
  }catch(error){
    if(requestId===pointRequestId)out.textContent=`后台计算未完成：${error.message}。请刷新页面后重试。`;
    return;
  }
  if(requestId!==pointRequestId||current!==drug.id||!document.body.classList.contains("stage-calc"))return;
  if(result.reason==="specs"){out.textContent=`请先为${drug.name}保存实际持有的药盒规格；本板块不会再输出无法由完整单位组成的零散剂量。`;return}
  if(result.reason==="cap"){out.textContent="当前单次上限低于最小完整药盒单位，模型找不到可用的剂量组合。";return}
  if(result.reason==="fixedNoSolution"){out.textContent=`仅计计算起点前后各 48 小时的记录：在指定 ${fixedCount} 次、已保存规格与候选时刻下，模型未找到同时满足参考线${peakFloor>0?"及覆盖段峰值最低值":""}的组合。`;return}
  if(result.reason==="peakNoSolution"){out.textContent="仅计计算起点前后各 48 小时的记录：在已保存规格、单次上限与当前搜索范围下，无法同时满足参考线和覆盖段峰值最低值。";return}
  if(result.continuousFrom===null||result.continuousFrom>=target){out.textContent="仅计计算起点前后各 48 小时的记录，当前搜索范围内无法形成持续覆盖到目标时刻的区间。口服吸收无法立刻补足已有缺口；请勿据此自行调整用药。";return}
  pointScenario={drug:current,target,threshold,mode,...result};
  if(minimum)minimumPointScenario={drug:current,target,threshold,mode,...minimum};
  const previewA=$("pointPreview"),previewB=$("pointMinimumPreview");
  previewA.hidden=!result.doses.length;previewB.hidden=!minimum?.doses.length;
  previewA.textContent="在曲线中查看方案 A";previewB.textContent="在曲线中查看方案 B";
  out.replaceChildren();out.classList.add("scenario-results");
  const label=capText?`单次假设上限 ${fmt(cap,3)} mg`:`未填写单次上限；候选仍受已存完整规格及每节点最多 8—20 单位的搜索边界限制`;
  const intro=document.createElement("p");intro.className="scenario-intro";intro.textContent=`${drug.name} · 当前${reference.name}模型 ${fmt(result.baselineNow,3)} ${unit} · ${label}${peakFloor>0?` · 覆盖段剂量等效峰值最低 ${fmt(peakFloor,3)} mg`:""}。反算只读取计算起点前后各 48 小时的同药记录；更早的残留不计。各方案在同一覆盖区间比较，每 5 分钟采样验证。${futureMealNotice(drug,now,target)}`;out.append(intro);
  out.append(scenarioCard({title:"方案 A · 自动补充节点",badge:fixedCount?`指定 ${fixedCount} 次`:"系统计算",result,threshold,target,description:fixedCount===2?"两次情景按 5 分钟步长比较第二个节点，并核对完整药盒单位。":"按照有限候选节点搜索得到的模型情景。",preview:previewA,adopt:()=>adoptPointScenario("A"),reference}));
  if(minimum){const delta=result.mg-minimum.mg;out.append(scenarioCard({title:"方案 B · 候选中最少总剂量",badge:delta>1e-6?`比 A 少 ${fmt(delta,3)} mg`:"当前候选与 A 相同",result:minimum,threshold,target,description:"缩减 A 的完整单位组合，并搜索单节点和双节点时刻；仅在这些有限候选中比较总量，不保证全局最少。",preview:previewB,adopt:()=>adoptPointScenario("B"),reference}))}
  const note=document.createElement("p");note.className="scenario-caution";note.textContent=`${result.baselineNow<threshold?"当前已低于参考线，口服吸收前的缺口不能被补服消除。":""}${result.limited?"方案 A 已触及 12 节点搜索上限。":""}${!result.fallingAfter?"方案 A 在目标后仍可能上升。":""}${Math.max(result.mg,minimum?.mg||0)>drug.refDose*4?"模型剂量超过参考单次剂量四倍，线性外推尤其不可靠。":""}48 小时外残留已排除；清除较慢时结果可能偏低。所有时间与剂量只是数学情景，不是服药建议；参考线也不是已验证的治疗阈值。`;out.append(note);
}
function adoptPointScenario(variant){
  if(!authUser){alert("请先登录账号，再采用模型方案。");return}
  if(!["A","B"].includes(variant))return;
  const selected=variant==="B"?minimumPointScenario:pointScenario;
  if(!selected||selected.drug!==current||!selected.doses?.length)return;
  const now=Date.now(),plan={v:1,variant,drug:current,adoptedAt:now,target:selected.target,threshold:selected.threshold,mode:selected.mode,cap:$("pointMaxDose").value.trim(),count:$("pointCount").value.trim(),peakMin:Number($("pointPeakMin").value)||0,baselineIds:records.filter(r=>r.drug===current).map(r=>r.id),doses:structuredClone(selected.doses),manualMatches:{},mealSignature:mealScenarioSignature(current,now,selected.target)};
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
    const worker=new Worker("./inverse-worker.js?v=wheel-time-20261112");
    inverseWorker=worker;
    worker.onmessage=event=>{if(event.data.id!==id)return;if(inverseWorker===worker)inverseWorker=null;worker.terminate();if(event.data.error)reject(new Error(event.data.error));else resolve(event.data)};
    worker.onerror=event=>{if(inverseWorker===worker)inverseWorker=null;worker.terminate();reject(new Error(event.message||"后台计算未能完成"))};
    worker.postMessage({id,kind:"duration",...input});
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
  const d=chosen(),rows=inverseRecordRows(allRows().filter(r=>r.time<=now),start);
  out.textContent="正在后台计算持续时长情景，页面可继续操作…";
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
  out.append(scenarioCard({title:"持续时长模型情景",badge:`${result.count} 个节点`,result:display,threshold,target:end,description:`${fullDate(start)} 至 ${fullDate(end)}，每 5 分钟采样检查${reference.name}。反算只读取目标开始时刻前后各 48 小时的同药记录；更早的残留不计。${futureMealNotice(d,now,end)}`,coverageLabel:"指定时段内的采样均达到参考线",reference,reminderKind:"duration"}));
  const note=document.createElement("p");note.className="scenario-caution";note.textContent=`${warning}48 小时外残留已排除；清除较慢时结果可能偏低。仅搜索已存完整单位与有限候选时刻；这是数学情景，不是服药时间或剂量建议。`;out.append(note);
}
