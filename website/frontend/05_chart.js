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
    : (typeof futurePreviewNodes==="function"?futurePreviewNodes(current,separatePreview):separatePreview);
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
  if(scenario&&!scenario.invalid)for(const p of points)scenarioPeak=Math.max(scenarioPeak,p.c+scenarioContribution(p.t));
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
    label.textContent=`${dose.preview?"预计 ":dose.matched?"已匹配 ":""}${dateText(dose.time)} · ${fmt(dose.mg,3)} mg`;
    svg.append(label);
  }
  if(rows.length||scenario&&!scenario.invalid){
    if(hasFoodEffect){const unfedPath=points.map((p,i)=>`${i?"L":"M"}${x(p.t).toFixed(2)} ${y(p.unfed).toFixed(2)}`).join(" ");svg.append(svgEl("path",{d:unfedPath,fill:"none",stroke:CHART_COLORS.unfed,"stroke-width":2,"stroke-dasharray":"6 5","stroke-linejoin":"round"}))}
    const path=points.map((p,i)=>`${i?"L":"M"}${x(p.t).toFixed(2)} ${y(p.c).toFixed(2)}`).join(" ");
    svg.append(svgEl("path",{d:`${path} L${x(end)} ${y(0)} L${x(start)} ${y(0)} Z`,fill:"url(#curveFill)"}));
    svg.append(svgEl("path",{d:path,fill:"none",stroke:CHART_COLORS.blood,"stroke-width":3,"stroke-linejoin":"round","stroke-linecap":"round",pathLength:1000,class:"chart-line"}));
    const equivalentPath=points.map((p,i)=>`${i?"L":"M"}${x(p.t).toFixed(2)} ${yEq(p.eq).toFixed(2)}`).join(" ");
    svg.append(svgEl("path",{d:equivalentPath,fill:"none",stroke:CHART_COLORS.equivalent,"stroke-width":2.5,"stroke-linejoin":"round","stroke-linecap":"round"}));
    if(foodEffectPoint&&Math.abs(foodEffectPoint.c-foodEffectPoint.unfed)>.001){const xx=x(foodEffectPoint.t);svg.append(svgEl("line",{x1:xx,y1:y(foodEffectPoint.c),x2:xx,y2:y(foodEffectPoint.unfed),stroke:"#f6cd83","stroke-width":2.5}));for(const value of [foodEffectPoint.c,foodEffectPoint.unfed])svg.append(svgEl("circle",{cx:xx,cy:y(value),r:4,fill:"#f6cd83",stroke:"#1b1c20","stroke-width":1.5}))}
    rows.filter(r=>r.time>=start&&r.time<=end).forEach(r=>svg.append(svgEl("circle",{cx:x(r.time),cy:y(0),r:3.5,fill:CHART_COLORS.blood})));
    if(scenario&&!scenario.invalid){
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
