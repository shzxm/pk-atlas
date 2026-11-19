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
