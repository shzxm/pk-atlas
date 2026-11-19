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
