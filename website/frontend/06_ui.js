function render(){
  if(!document.body.classList.contains("stage-calc")){if(document.body.classList.contains("stage-choose"))renderChooser();return}
  $("calcContext").textContent=`${selectedDate} · ${chosen().name}`;
  renderDay();renderRecords();renderIntakes();renderMealImpact();
  if(!matchMedia("(max-width:700px)").matches||document.body.dataset.mobilePane==="results"){drawChart();renderScenario();if(inversePage==="point")renderPointInverse();else renderInverse()}
  renderHistory();renderAppHome();renderAppHistoryQuicklist();updateWheelTriggers();
}
function fillNow(){const now=new Date(),clock=now.getHours()*3600000+now.getMinutes()*60000;$("doseTime").value=localInput(selectedDate===dateKey(now.getTime())?now.getTime():dayStart(selectedDate)+clock);timeTouched=false;updateWheelTriggers()}
function fillIntakeNow(){const now=new Date(),clock=now.getHours()*3600000+now.getMinutes()*60000;$("intakeTime").value=localInput(selectedDate===dateKey(now.getTime())?now.getTime():dayStart(selectedDate)+clock);updateWheelTriggers()}
function resetIntakeEdit(){editingIntakeId="";$("intakeSubmit").textContent="＋ 保存饮食记录";$("intakeCancel").hidden=true;$("intakeDelete").hidden=true;$("intakeKind").value="meal";$("mealType").value="regular";$("intakeDrink").value="none";$("intakeNote").value="";$("mealTypeWrap").hidden=false;fillIntakeNow()}
function editIntake(id){const x=intakes.find(row=>row.id===id);if(!x)return;editingIntakeId=id;$("intakeKind").value=x.kind;$("intakeTime").value=localInput(x.time);$("mealType").value=x.mealType;$("intakeDrink").value=x.drink;$("intakeNote").value=x.note;$("mealTypeWrap").hidden=x.kind!=="meal";$("intakeSubmit").textContent="保存饮食记录修改";$("intakeCancel").hidden=false;$("intakeDelete").hidden=false;updateWheelTriggers();if(document.body.classList.contains("app-mode"))appOpenSheet("intake",{editing:true});else{setMobilePane("records");$("intakeForm").scrollIntoView({behavior:"smooth",block:"center"})}}
function resetDoseEdit(){editingDoseId="";$("doseSubmit").innerHTML="<span>＋</span> 保存这次服用";$("doseCancel").hidden=true;$("doseDelete").hidden=true;setDoseEditor(unitByDrug[current]||"mg",chosen().defaultDose);fillNow()}
function editRecord(id){
  const r=records.find(x=>x.id===id);if(!r)return;
  if(!DRUGS.some(d=>d.id===r.drug))return;
  if(current!==r.drug){current=r.drug;$("drug").value=current;$("calcDrug").value=current;renderDrug()}
  selectedDate=dateKey(r.time);selectedDateFollowsToday=selectedDate===dateKey(Date.now());editingDoseId=id;
  $("doseTime").value=localInput(r.time);timeTouched=true;
  setDoseEditor(r.unit==="g"?"g":"mg",r.mg);
  $("doseSubmit").textContent="保存这次服用修改";$("doseCancel").hidden=false;$("doseDelete").hidden=false;
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
  $("doseTime").addEventListener("input",()=>{timeTouched=true});$("nowButton").addEventListener("click",()=>{$("doseTime").value=localInput(Date.now());timeTouched=true;updateWheelTriggers()});
  $("doseAmount").addEventListener("input",renderPillHint);
  $("doseUnit").addEventListener("change",()=>{const mg=Number($("doseAmount").value)*(previousUnit==="g"?1000:1),unit=$("doseUnit").value;unitByDrug[current]=unit;setDoseEditor(unit,mg)});
  $("doseCancel").addEventListener("click",resetDoseEdit);
  $("doseDelete").addEventListener("click",()=>{if(editingDoseId)requestDoseDeletion(editingDoseId)});
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
    if(editingDoseId){const r=records.find(x=>x.id===editingDoseId);if(r){Object.assign(r,{time,mg,unit,courseId});if(r.source==="ios-journal-17.1")r.journal={...r.journal,editedOnSite:true}}}
    else records.push({id:uuid(),courseId,drug:current,time,mg,unit});
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
  $("pointCount").addEventListener("input",()=>{rememberInverseInputs();appliedPointScenario=null;schedulePointInverse()});
  $("pointPeakMin").addEventListener("input",()=>{rememberInverseInputs();appliedPointScenario=null;schedulePointInverse()});
  $("pointLive").addEventListener("click",()=>{if(!adoptedPlan())return;if(!confirm("确定取消已采用方案？已记录的服用和实时反算候选不会删除。"))return;delete inverseMemory[current].adoptedPointPlan;persist();appliedPointScenario=null;renderPointInverse();drawChart()});
  $("adoptedPreview").addEventListener("click",()=>{const plan=adoptedPlan();if(!plan)return;const state=currentAdoptedEvaluation(plan);appliedPointScenario={drug:current,target:plan.target,threshold:plan.threshold,mode:plan.mode,doses:state.pending,adoptedVariant:plan.variant||"A"};$("scenarioTime").value="";$("scenarioDose").value="";render();$("chartWrap").scrollIntoView({behavior:"smooth",block:"center"})});
  $("pointPreview").addEventListener("click",()=>{if(!pointScenario||pointScenario.drug!==current)return;appliedPointScenario={...pointScenario};if(pointScenario.doses){$("scenarioTime").value="";$("scenarioDose").value=""}else{$("scenarioTime").value=localInput(pointScenario.time);$("scenarioDose").value=String(Number(pointScenario.mg.toPrecision(12)));$("scenarioUnit").value="mg"}render();$("chartWrap").scrollIntoView({behavior:"smooth",block:"center"});});
  $("pointMinimumPreview").addEventListener("click",()=>{if(!minimumPointScenario||minimumPointScenario.drug!==current)return;appliedPointScenario={...minimumPointScenario};$("scenarioTime").value="";$("scenarioDose").value="";render();$("chartWrap").scrollIntoView({behavior:"smooth",block:"center"})});
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
