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
  const actions=document.createElement("div");actions.className="record-actions";
  const remove=document.createElement("button");remove.type="button";
  remove.className="app-record-edit";remove.textContent="删除";
  remove.setAttribute("aria-label","删除 "+recordDrugName(row)+" "+dateText(row.time));
  remove.addEventListener("click",()=>requestDoseDeletion(row.id));
  if(modeled)actions.append(edit,remove);
  else actions.append(edit); // archive-only entry already uses the delete action
  left.append(label,meta);item.append(left,actions);
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
  }else for(const row of todayRows)list.append(appRecordCard(row));
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
