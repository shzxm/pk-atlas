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
  // Start times remain searchable even if the current model is below the
  // reference. Requiring the first dose NOW incorrectly eliminates later
  // plans whose continuous coverage starts after oral absorption.
  for(let time=earliest;time<=lastAllowed;time+=step)firstTimes.push(time);
  if(firstTimes.at(-1)!==lastAllowed)firstTimes.push(lastAllowed);
  let best=null;
  for(const first of firstTimes){
    const lastTimes=[];
    if(count===2){for(let time=first+Math.max(step,minimumGap);time<=lastAllowed;time+=5*60000)lastTimes.push(time);if(lastTimes.at(-1)!==lastAllowed)lastTimes.push(lastAllowed)}
    else for(const fraction of count===1?[0]:[0,.25,.5,.75])lastTimes.push(first+(lastAllowed-first)*(1-fraction));
    for(const last of lastTimes){
      const times=Array.from({length:count},(_,i)=>i===0?first:Math.round((first+(last-first)*i/(count-1))/60000)*60000);
      if(times.some((time,i)=>i&&time-times[i-1]<Math.max(step,minimumGap)-1000))continue;
      const doses=[],possibleStart=first;
      // A mathematical coverage segment begins when a modeled future dose
      // can contribute, not necessarily at the input timestamp. The last
      // below-reference sample is recomputed after ALL chosen nodes exist.
      const baselineAllCovered=samples.every(p=>p.base>=threshold-1e-6);
      let coverageStart=baselineAllCovered?now:
        Math.min(target-sample,first+Math.min(dosePeakMs(drug,first),45*60000));
      if(coverageStart>=target)continue;
      let possible=true;
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
      let lastBelow=null;
      for(const level of levels)if(level.value<threshold-1e-6)lastBelow=level.time;
      const actualCoverageStart=lastBelow===null?now:
        lastBelow>=target?null:Math.min(target,lastBelow+sample);
      if(actualCoverageStart===null||actualCoverageStart>=target)continue;
      const covered=levels.filter(p=>p.time>=actualCoverageStart);
      if(covered.some(p=>p.value<threshold-1e-6))continue;
      const modeled=levels.at(-1).value,peak=Math.max(...covered.map(p=>p.value)),mg=doses.reduce((sum,dose)=>sum+dose.mg,0);
      const after=modelValue(drug,target+sample,rows,mode)+doses.reduce((sum,dose)=>sum+response(dose.mg,dose.time,target+sample),0);
      const fallingAfter=after<=modeled+1e-6;
      const candidate={doses,mg,baselineNow,baselineTarget,modeled,fallingAfter,
        firstReach:actualCoverageStart,continuousFrom:actualCoverageStart,
        allCovered:actualCoverageStart===now,limited:false,
        minLevel:Math.min(...covered.map(p=>p.value)),peak,effectiveCap,fixedCount:count};
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
  // The cycle floor belongs to the established modeled coverage, not
  // the instant before a newly modeled oral dose could be absorbed.
  // A candidate with no coverage is rejected by enforcePointConstraints.
  const cycleStart=Number.isFinite(coverageStart)?Math.max(now,coverageStart):now;
  const cycleBlood=sample(cycleStart,"blood"),cycleEquivalent=sample(cycleStart,"equivalent");
  const validCover=Number.isFinite(coverageStart)&&coverageStart<=target;
  const peakBlood=validCover?sample(coverageStart,"blood").maximum:null;
  const peakEquivalent=validCover?sample(coverageStart,"equivalent").maximum:null;
  return{cycleMinBlood:cycleBlood.minimum,cycleMinEquivalent:cycleEquivalent.minimum,
    peakBlood,peakEquivalent,
    cycleObserved:(cycle.mode==="equivalent"?cycleEquivalent:cycleBlood).minimum,
    cycleMinTime:(cycle.mode==="equivalent"?cycleEquivalent:cycleBlood).minTime,
    peakObserved:peak.mode==="equivalent"?peakEquivalent:peakBlood,
    cycleValid:!(cycle.value>0)||(validCover&&(cycle.mode==="equivalent"?cycleEquivalent:cycleBlood).minimum>=cycle.value-1e-6),
    peakValid:!(peak.value>0)||(validCover&&(peak.mode==="equivalent"?peakEquivalent:peakBlood)>=peak.value-1e-6)};
}
function strengthenPointCycleFloor(drug,rows,doses,coverageStart,target,cap,floor,mode){
  if(!(floor>0))return doses;
  // Only strengthen the established future coverage. Past gaps remain
  // visible in the actual curve and are never claimed to be repaired.
  const options=wholeDoseOptions(getStrengths(drug.id)).filter(x=>x.mg<=cap+1e-9);
  if(!options.length)return null;
  const step=5*60000,times=[];
  for(let t=coverageStart;t<target;t+=step)times.push(t);
  times.push(target);
  const result=doses.map(d=>({...d}));
  for(let iteration=0;iteration<48;iteration++){
    const combined=[...rows,...result];
    let worst={time:coverageStart,value:Infinity};
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
  if(!result||result.reason)return result;
  // Missing coverage is NEVER a successful inverse candidate. In particular,
  // the native JSCore caller previously received reason:null with a null
  // coverage start, and could present the result as valid.
  if(!Number.isFinite(result.continuousFrom)||result.continuousFrom>=target)
    return{reason:"coverageSearchIncomplete",checkedDoseNodes:result.doses?.length||0};
  const base=Number(cycle.value)||0,minimumPeak=Number(peak.value)||0;
  // "now -> target" is the sum of explicitly saved fixed future plans
  // AND newly proposed nodes. The pre-existing virtual initial state is
  // earlier than `now` and never counts as a newly planned dose.
  const fixedPlannedTotal=rows.filter(d=>d.planningOnly===true&&
    d.source!=="model-only-initial"&&Number.isFinite(d.time)&&
    d.time>=now-1000&&d.time<=target+1000&&Number.isFinite(d.mg)&&d.mg>0)
    .reduce((sum,d)=>sum+d.mg,0);
  const proposedTotal=doses=>doses.filter(d=>d.time>=now-1000&&d.time<=target+1000)
    .reduce((sum,d)=>sum+d.mg,0);
  const totalDose=doses=>fixedPlannedTotal+proposedTotal(doses);
  const checkedTotal=doses=>!Number.isFinite(totalCap)||totalDose(doses)<=totalCap+1e-6;
  if(!(base>0||minimumPeak>0)){
    const stats=pointConstraintMetrics(drug,rows,result.doses,now,result.continuousFrom,target,cycle,peak);
    if(!checkedTotal(result.doses))return{reason:"totalNoSolution"};
    return{...result,...stats,totalPlanned:totalDose(result.doses),fixedPlannedTotal,totalCap};
  }
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
        const better=strengthenPointCycleFloor(drug,rows,doses,result.continuousFrom,target,cap,base,cycle.mode);
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
      return{...result,...stats,totalPlanned:totalDose(doses),fixedPlannedTotal,totalCap,doses,mg:doses.reduce((total,d)=>total+d.mg,0),
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
  const initial=plan.initialModel;
  const replacedInitial=initial&&records.some(r=>r.drug===plan.drug&&r.time>=Number(initial.at)&&r.time<=now);
  const initialPreview=initial&&!replacedInitial&&Number.isFinite(Number(initial.time))&&
    Number.isFinite(Number(initial.mg))&&Number(initial.mg)>0?
      [{drug:plan.drug,time:Number(initial.time),mg:Number(initial.mg),planningOnly:true}]:[];
  const searchRows=[...rows,...additionalPlans,...initialPreview];
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
  // Global confirmation inbox: a plan for another drug must not disappear
  // merely because the user changed the calculator's selected drug.
  return scheduledDoses.filter(d=>Number.isFinite(d.time)&&
    Number.isFinite(d.mg)&&d.mg>0&&d.id)
    .sort((a,b)=>Number(a.time>now)-Number(b.time>now)||a.time-b.time);
}
function renderAdoptedPendingConfirm(plan,now=Date.now()){
  const adoptedBox=$("adoptedPointPanel");if(!adoptedBox)return;
  let box=$("adoptedPendingConfirmPanel");
  if(!box){box=document.createElement("section");box.id="adoptedPendingConfirmPanel";
    box.className="adopted-confirm-priority";box.setAttribute("aria-label","已保存计划服用的确认");
    adoptedBox.parentElement.insertBefore(box,adoptedBox)}
  const list=adoptedPendingReviewRows(plan,null,now);
  box.hidden=!list.length;box.replaceChildren();
  if(!list.length)return;
  const title=document.createElement("h3");title.textContent=`计划服用确认 · ${list.length} 条`;
  const intro=document.createElement("p");intro.className="hint";
  intro.textContent="这里只列出你明确保存的未来服用计划；仅计算或采用 A/B 方案不会生成确认任务。未到预计时间可以修改或删除，到时才能确认已服用；过期不会自动算作已服用。";
  box.append(title,intro);
  for(const dose of list){
    const row=document.createElement("div");row.className="adopted-confirm-row";
    const detail=document.createElement("div");detail.className="adopted-confirm-text";
    const name=document.createElement("strong");
    const drugName=DRUGS.find(item=>item.id===dose.drug)?.name||dose.drug;
    name.textContent=`${drugName} · ${fullDate(dose.time)} · ${fmt(dose.mg,3)} mg`;
    const status=document.createElement("small");
    status.textContent=dose.time<=now?"已到时 · 等待确认实际服用":"未来计划 · 尚未发生";
    detail.append(name,status);row.append(detail);
    const controls=document.createElement("div");controls.className="adopted-confirm-actions";
    const yes=document.createElement("button");yes.type="button";yes.className="secondary";
    yes.textContent="确认已服用";yes.disabled=dose.time>now;
    yes.onclick=()=>confirmScheduledTaken(dose.id);
    const edit=document.createElement("button");edit.type="button";edit.className="ghost";
    edit.textContent="修改计划";edit.onclick=()=>editScheduledDose(dose.id);
    const remove=document.createElement("button");remove.type="button";remove.className="ghost";
    remove.textContent="删除计划";remove.onclick=()=>{
      if(!confirm("删除这条计划未来服用？已服用的真实记录和已采用的数学模型不会被删除。"))return;
      scheduledDoses=scheduledDoses.filter(x=>x.id!==dose.id);
      if(editingScheduledId===dose.id)resetDoseEdit();persist();renderDrug();
    };
    controls.append(yes,edit,remove);row.append(controls);box.append(row);
  }
}
function compactAdoptedNode(li,index){
  const when=li.querySelector(":scope > time"),dose=li.querySelector(":scope > strong"),status=li.querySelector(":scope > small");
  if(!when||!dose||!status)return;
  const detail=document.createElement("details");detail.className="adopted-node-detail";
  detail.open=expandedMatchNode===index;
  const summary=document.createElement("summary");summary.className="adopted-node-summary";
  const heading=document.createElement("span");heading.className="adopted-node-heading";
  const number=document.createElement("span");number.className="adopted-node-number";number.textContent=String(index+1).padStart(2,"0");
  const copy=document.createElement("span");copy.className="adopted-node-copy";
  const title=document.createElement("strong");title.textContent=when.textContent.replace(/^原计划\s*/,"");
  const subtitle=document.createElement("small");subtitle.textContent=dose.textContent;
  copy.append(title,subtitle);heading.append(number,copy);
  const right=document.createElement("span");right.className="adopted-node-state";right.textContent=status.textContent;
  summary.append(heading,right);
  const body=document.createElement("div");body.className="adopted-node-body";
  for(const child of [...li.childNodes]){
    if(child===when||child===dose||child===status)continue;
    body.append(child);
  }
  detail.append(summary,body);li.replaceChildren(detail);li.classList.add("adopted-node-card");
}
function renderAdoptedPoint(plan){
  const panel=$("adoptedPointPanel"),out=$("adoptedPointResult"),state=currentAdoptedEvaluation(plan),reference={name:plan.mode==="equivalent"?"剂量等效量":"血药浓度",unit:plan.mode==="equivalent"?"mg（等效）":"mg/L"};
  panel.hidden=false;
  renderAdoptedPendingConfirm(plan);
  out.replaceChildren();out.classList.add("scenario-results");
  if(plan.initialModel){const caption=document.createElement("p");caption.className="scenario-caution";
    caption.textContent="已采用方案包含明确的起始模型假设：仅用于假设预测，不是已服用记录，不生成该假设的服药提醒；新的实际记录将取代该假设以避免重复估算。";out.append(caption)}
  const adoptedLimitEnabled=plan.targetLimitEnabled===true||plan.targetLimitEnabled==="1";
  const adoptedTolerance=Number(plan.mode==="equivalent"?plan.targetLimitEquivalent:plan.targetLimitBlood);
  const intro=document.createElement("p");intro.className="scenario-intro";intro.textContent=`${adoptedLimitEnabled&&Number.isFinite(adoptedTolerance)&&adoptedTolerance>0?`目标时刻限定 ${fmt(plan.threshold,3)} ±${fmt(adoptedTolerance,3)} ${reference.unit} · `:"目标时刻至少高于参考线 · "}已采用方案 ${plan.variant||"A"}${plan.variant==="C"?"（历史方案）":""} · ${fullDate(plan.adoptedAt)} · 原方案 ${plan.doses.length} 个节点 · 目标 ${fullDate(plan.target)} · ${reference.name}参考线 ${fmt(plan.threshold,3)} ${reference.unit}${plan.cycleMin?` · 周期最低 ${fmt(plan.cycleMin,3)} ${cycleFloorUnit(plan.cycleMode)}`:""}${plan.peakMin?` · 覆盖段峰值最低 ${fmt(plan.peakMin,3)} ${cycleFloorUnit(plan.peakMode)}`:""}。采用模型只会更新数学方案和原有模型通知，不会自动生成“服用确认”；上方确认板块只读取明确保存的未来服用计划。当前复核按本药数值残留窗口截取历史记录（不是生理清除或用药建议）。实际服用记录的时间与剂量保持原样；自动重算只生成调整意见，点击采用后才替换后续预计节点。`;out.append(intro);
  const overview=document.createElement("div");overview.className="adopted-overview";
  const kicker=document.createElement("span");kicker.className="adopted-overview-kicker";kicker.textContent="当前已采用 · 方案 "+(plan.variant||"A");
  const date=document.createElement("strong");date.textContent="目标 "+fullDate(plan.target);
  const note=document.createElement("small");note.textContent="原方案 "+plan.doses.length+" 个数学节点 · 已匹配 "+state.matchedNodeCount+" 个";
  overview.append(kicker,date,note);out.append(overview);
  const metrics=document.createElement("div");metrics.className="scenario-metrics";
  for(const [label,value] of [["原方案总量",`${fmt(state.plannedMg,3)} mg`],["已记录匹配",`${state.matchedNodeCount} 个计划节点 · ${state.completed.length} 条实际记录 · ${fmt(state.completedMg,3)} mg`],["已采用后续节点",`${state.pending.length} 次 · ${fmt(state.pendingMg,3)} mg`],["已采用方案目标值",`${fmt(plan.mode==="equivalent"?state.equivalentAtTarget:state.bloodAtTarget,3)} ${reference.unit}`]]){const item=document.createElement("div"),small=document.createElement("small"),strong=document.createElement("strong");small.textContent=label;strong.textContent=value;item.append(small,strong);metrics.append(item)}out.append(metrics);
  const preview=document.createElement("button");preview.type="button";preview.className="secondary";
  preview.textContent="显示当前多点匹配与预计节点曲线";
  preview.addEventListener("click",()=>previewAdoptedMatches(plan));
  out.append(preview);
  if(!Array.isArray(plan.adjustment?.doses)){
  const list=document.createElement("ol");list.className="scenario-timeline adopted-plan-nodes";
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
    const actions=document.createElement("div");actions.className="adopted-taken-actions";
    const edit=document.createElement("button");edit.type="button";edit.className="ghost";
    const stored=scheduledDoses.find(x=>x.drug===plan.drug&&
      Math.abs(x.time-dose.time)<=60000&&Math.abs(x.mg-dose.mg)<.0001);
    edit.textContent=stored?"修改关联的未来计划":matches.length?"查看实际匹配记录":"修改数学假设节点";
    edit.onclick=()=>stored?editScheduledDose(stored.id):
      matches.length?editRecord(matches[0].record.id):editAdoptedNode(plan,index);
    actions.append(edit);li.append(actions);
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
    compactAdoptedNode(li,index);
    list.append(li);
  }
  out.append(list);
  }else{
    const retired=document.createElement("p");retired.className="scenario-intro";
    retired.textContent=`前一版原方案的 ${plan.doses.length} 个节点已由当前已采用调整方案替换，不再生成旧节点的服用确认或提醒。旧数学参数仅保留作方案复核，真实服用记录不受影响。`;
    out.append(retired);
  }
  if(state.unmatched.length){const heading=document.createElement("strong");heading.className="scenario-replan-heading";heading.textContent="未关联的实际服用记录 · 原时间保留";out.append(heading);const unmatchedList=document.createElement("ol");unmatchedList.className="scenario-timeline";for(const row of [...state.unmatched].sort((a,b)=>a.time-b.time)){const li=document.createElement("li"),time=document.createElement("time"),amount=document.createElement("strong"),note=document.createElement("small");time.textContent=fullDate(row.time);amount.textContent=`${fmt(row.mg,3)} mg`;note.textContent="记录时间和剂量未改；反算按本药残留窗口读取，且这条记录未替换任何原计划节点。若属于某节点，可在上方手动关联。";li.append(time,amount,note);unmatchedList.append(li)}out.append(unmatchedList)}
  // Original unconfirmed nodes are already listed above. Avoid an identical
  // second timeline unless the accepted adjustment supersedes those nodes.
  if(state.pending.length&&plan.adjustment){const heading=document.createElement("strong");heading.className="scenario-replan-heading";heading.textContent=plan.adjustment?"当前已采用的调整节点 · 曲线显示":"当前已采用的原计划后续节点 · 曲线显示";out.append(heading);const pendingList=document.createElement("ol");pendingList.className="scenario-timeline";for(const dose of state.pending){const li=document.createElement("li"),time=document.createElement("time"),amount=document.createElement("strong");time.textContent=fullDate(dose.time);amount.textContent=`预计 ${fmt(dose.mg,3)} mg`;li.append(time,amount);pendingList.append(li)}out.append(pendingList)}
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
  $("pointInitialWrap").hidden=true;
  $("pointInitialValue").required=false;
  // Plans are independent of the current model and reference validity.
  renderAdoptedPendingConfirm(null);
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
  if(totalText&&(!Number.isFinite(totalCap)||totalCap<=0||totalCap>1000000)){out.textContent="固定计划＋新增候选的累计总量上限须为大于 0、至多 1,000,000 的 mg 数值。";return}
  if(countText&&(!Number.isInteger(fixedCount)||fixedCount<1||fixedCount>8)){out.textContent="假设服用次数请留空，或填写 1—8 的整数。";return}
  if(peakText&&(!Number.isFinite(peakFloor)||peakFloor<=0||peakFloor>1000000)){out.textContent=`覆盖段峰值最低值须为大于 0、至多 100 万的 ${modeUnit(peakMode)} 数值。`;return}
  if(cycleText&&(!Number.isFinite(cycleMin)||cycleMin<=0||cycleMin>1000000)){out.textContent=`周期最低值须为大于 0、至多 100 万的 ${modeUnit(cycleMode)} 数值。`;return}
  const activePlans=futurePreviewNodes(drug.id).filter(r=>r.time<=target);
  const rows=[...inverseRecordRows(allRows().filter(r=>r.time<=now),now),...activePlans.map(r=>({...r,planningOnly:true}))];
  const startingObserved=modelValue(drug,now,rows,mode);
  const hasActualStart=rows.some(r=>r.drug===drug.id&&r.time<=now&&!r.planningOnly);
  const initialRequired=!hasActualStart&&startingObserved<threshold-1e-6;
  const startBox=$("pointInitialWrap"),startInput=$("pointInitialValue");
  startBox.hidden=!initialRequired;
  startInput.required=initialRequired;
  $("pointInitialUnit").textContent=unit;
  if(startInput.dataset.mode!==mode){startInput.value="";startInput.dataset.mode=mode}
  const initialRaw=startInput.value.trim(),initialValue=Number(initialRaw);
  if(initialRequired&&(!initialRaw||!Number.isFinite(initialValue)||initialValue<=0||initialValue>1000000)){
    out.textContent=`当前没有起始真实服用记录，数学模型 ${fmt(startingObserved,3)} ${unit} 低于参考值。请明确采用「按参考值假设起始达标」或手动填入起始模型值。该假设不是实际服用。`;
    return;
  }
  const initialBaseline=initialRequired?{mode,value:initialValue}:null;
  out.textContent=`正在浏览器本地计算；已把 ${activePlans.length} 条未来计划作为固定数学情景，并只搜索新增假设节点。计划不计实际服用。`;
  let result,minimum,comparison,initialHypothesis;
  try{
    ({result,minimum,comparison,initialHypothesis}=await solvePointInWorker({drugId:drug.id,rows,plan:plans[drug.id]||{},meals:intakes,renalState:renal,threshold,target,cap,now,fixedCount,mode,peakFloor,cycleFloor,peakRequirement,totalCap,targetWindow,initialBaseline},requestId));
  }catch(error){
    if(requestId===pointRequestId)out.textContent=`浏览器本地计算未完成：${error.message}。请刷新页面后重试。`;
    return;
  }
  if(requestId!==pointRequestId||current!==drug.id||!document.body.classList.contains("stage-calc"))return;
  if(result.reason==="targetWindowUnreached"){
    out.textContent=`已经检查有限候选，但没有找到目标时刻落入 ${fmt(threshold,3)} ±${fmt(targetWindow.value,3)} ${unit} 的有效情景。当前搜索不保证覆盖全部组合，不能认定绝对无解；可扩大容差或调整约束。`;
    return;
  }
  if(result.reason==="specs"){out.textContent=`请先为${drug.name}保存实际持有的药盒规格；本板块不会再输出无法由完整单位组成的零散剂量。`;return}
  if(result.reason==="cap"){out.textContent="当前单次上限低于最小完整药盒单位，模型找不到可用的剂量组合。";return}
  if(result.reason==="coverageSearchIncomplete"){
    out.textContent=`本轮有界搜索已检查 ${result.checkedDoseNodes||0} 个新增数学节点，但未形成覆盖至目标时刻的连续参考区间。这不能证明所有时间和剂量组合都无解。`;
    return;
  }
  if(result.reason==="fixedNoSolution"){out.textContent=`固定 ${fixedCount} 次的有界搜索未找到同时满足参考线及已启用最低值限制的候选；这不代表数学上绝对无解。`;return}
  if(result.reason==="boundedSearchIncomplete"){
    const unit=modeUnit(result.checkedMode||peakMode);
    const observed=Number.isFinite(result.checkedPeak)?`；已检查候选的覆盖峰值为 ${fmt(result.checkedPeak,3)} ${unit}`:"";
    const nodes=Number.isInteger(result.checkedDoseNodes)?`；已检查 ${result.checkedDoseNodes} 个模型节点`:"";
    out.textContent=`当前有界数学搜索未找到满足全部输入约束的候选${nodes}${observed}。算法尚未遍历所有新增节点组合，所以不能判断数学上无解。请调整节点数量、时间范围或输入约束；没有设置医学剂量上限，模型不对安全剂量作任何判断。`;
    return;
  }
  if(["initialBaselineRequired","initialBaselineInvalid"].includes(result.reason)){
    out.textContent="请选择起始模型假设，或输入大于零且单位与当前参考值一致的初始模型值。";return;
  }
  if(result.reason==="totalNoSolution"){out.textContent=`在当前完整规格、固定未来计划及节点搜索范围内，尚未找到「已保存未来计划＋新生成候选」合计不超过 ${fmt(totalCap,3)} mg 的模型方案。固定计划本身也占用总量上限，不能视为零；不代表数学上绝对无解。`;return}
  if(["cycleNoSolution","peakNoSolution","constraintNoSolution"].includes(result.reason)){out.textContent="在已有完整规格、单次上限与本轮有界搜索范围内，尚未找到同时满足参考线、覆盖段最低值和峰值要求的候选。这不是全部组合无解的证明；请核对单位、节点数及全部约束。";return}
  if(result.continuousFrom===null||result.continuousFrom>=target){out.textContent="当前有限搜索没有找到目标时刻之前能建立连续覆盖的数学候选；这不是全部可能组合无解的证明。";return}
  // Keep the exact fixed future nodes used in the solved scenario. Do not
  // re-select from mutable cloud settings when a user clicks Adopt later.
  const calculatedPlans=activePlans.map(item=>({id:item.id,drug:item.drug,
    time:item.time,mg:item.mg,unit:item.unit||"mg"}));
  pointScenario={drug:current,target,threshold,mode,cycleFloor,peakRequirement,targetWindow,
    initialHypothesis,initialBaseline,includedScheduledDoses:calculatedPlans,...result};
  if(minimum)minimumPointScenario={drug:current,target,threshold,mode,cycleFloor,peakRequirement,targetWindow,
    initialHypothesis,initialBaseline,includedScheduledDoses:calculatedPlans,...minimum};
  const previewA=$("pointPreview"),previewB=$("pointMinimumPreview");
  previewA.hidden=!result.doses.length;previewB.hidden=!minimum?.doses.length;
  previewA.textContent="在曲线中查看方案 A";previewB.textContent="在曲线中查看方案 B";
  out.replaceChildren();out.classList.add("scenario-results");
  const label=capText?`单次假设上限 ${fmt(cap,3)} mg`:`未填写单次上限；候选仍受已存完整规格及每节点最多 8—20 单位的搜索边界限制`;
  const totalLabel=totalText?` · 当前至目标固定计划＋新增候选总量上限 ${fmt(totalCap,3)} mg`:"";
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
  if(initialHypothesis){const tip=document.createElement("p");tip.className="scenario-caution";
    tip.textContent=`本次假设起始模型值 ${fmt(initialBaseline.value,3)} ${unit}，仅在假设曲线中显示。它不是实测或已服用，绝不自动加入真实记录或服药通知；周期最低值从连续覆盖段检查。`;out.append(tip)}
  const note=document.createElement("p");note.className="scenario-caution";note.textContent=`${result.baselineNow<threshold?"当前已低于参考线，口服吸收前的缺口不能被补服消除。":""}${result.limited?"方案 A 已触及 12 节点搜索上限。":""}${!result.fallingAfter?"方案 A 在目标后仍可能上升。":""}${Math.max(result.mg,minimum?.mg||0)>drug.refDose*4?"模型剂量超过参考单次剂量四倍，线性外推尤其不可靠。":""}48 小时外残留已排除；清除较慢时结果可能偏低。所有时间与剂量只是数学情景，不是服药建议；参考线也不是已验证的治疗阈值。`;out.append(note);
}
function adoptPointScenario(variant){
  if(!authUser){alert("请先登录账号，再采用模型方案。");return}
  if(!["A","B"].includes(variant))return;
  const selected=variant==="B"?minimumPointScenario:pointScenario;
  if(!selected||selected.drug!==current||!selected.doses?.length)return;
  const now=Date.now(),plan={v:1,variant,drug:current,adoptedAt:now,
    initialModel:selected.initialHypothesis?{time:selected.initialHypothesis.time,mg:selected.initialHypothesis.mg,mode:selected.initialBaseline?.mode,value:selected.initialBaseline?.value,at:now,planningOnly:true}:null,
    target:selected.target,threshold:selected.threshold,mode:selected.mode,cap:$("pointMaxDose").value.trim(),totalMax:Number($("pointTotalMax").value)||0,count:$("pointCount").value.trim(),peakMin:Number($("pointPeakMin").value)||0,peakMode:$("pointPeakMode").value,cycleMin:Number($("pointCycleMin").value)||0,cycleMode:$("pointCycleMode").value,targetLimitEnabled:$("pointTargetLimitEnabled").checked,
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
