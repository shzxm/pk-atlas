function renderChooser(){
  const dateInput=$("chooseDate");if(!dateInput)return;
  if(!dateInput.value)dateInput.value=selectedDate;
  const box=$("chooserDates");box.replaceChildren();
  const keys=[...new Set([...records,...intakes].map(r=>dateKey(r.time)))].sort().reverse();
  if(!keys.length){const p=document.createElement("p");p.className="chooser-empty";p.textContent="还没有服用或饮食记录。选定日期后即可开始。";box.append(p)}
  for(const key of keys){const button=document.createElement("button");button.className="chooser-card";button.type="button";const strong=document.createElement("strong"),small=document.createElement("small");strong.textContent=key;const dayRows=records.filter(r=>dateKey(r.time)===key),mealCount=intakes.filter(x=>dateKey(x.time)===key).length,names=dayDrugTotals(dayRows).map(x=>x.name),pending=dayRows.filter(r=>r.journal?.reviewStatus==="possibleDuplicate").length;small.textContent=`${dayRows.filter(r=>!isJournalReview(r)).length} 次服用${pending?` · ${pending} 条待核对`:""} · ${mealCount} 条饮食 · ${names.join("、")||"暂无已确认药物"}`;button.append(strong,small);button.onclick=()=>openCalculationDate(key);box.append(button)}
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
  intakes=safeIntakes(state.intakes);mealMatchCache.clear();
  plans=state.plans&&typeof state.plans==="object"&&!Array.isArray(state.plans)?state.plans:{};
  renal=safeRenal(state.settings?.renal);
  referenceMemory=state.settings?.referenceMemory&&typeof state.settings.referenceMemory==="object"?state.settings.referenceMemory:{};
  inverseMemory=safeInverseMemory(state.settings?.inverseMemory);
  editorDrafts=safeEditorDrafts(state.settings?.editorDrafts);
  for(const saved of Object.values(inverseMemory)){const plan=saved.adoptedPointPlan;if(plan&&plan.mealSignature===undefined)plan.mealSignature=mealScenarioSignature(plan.drug,plan.adoptedAt,plan.target)}
  if(DRUGS.some(d=>d.id===state.settings?.currentDrug))current=state.settings.currentDrug;
  stateVersion=version;baseState=structuredClone({records,courses,plans,intakes,settings:{...state.settings,currentDrug:current,renal}});
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
  let guestRecords=[],guestCourses=[],guestIntakes=[],guestRenal=null,draft=null;
  try{guestRecords=safeRecords(JSON.parse(getStored(RECORD_KEY)||"[]"));guestCourses=safeCourses(JSON.parse(getStored(COURSE_KEY)||"[]"));guestIntakes=safeIntakes(JSON.parse(getStored(INTAKE_KEY)||"[]"));guestRenal=safeRenal(JSON.parse(getStored(RENAL_KEY)||"null"));draft=JSON.parse(getStored(DRAFT_KEY)||"null")}catch{}
  $("importLocal").hidden=!guestRecords.length&&!guestCourses.length&&!guestIntakes.length&&!guestRenal;
  if(!syncPending&&!syncConflict){
    syncSetStatus("synced",incomingLocalTransfer()?"已接收本机数据，请确认保存到云端。":"已连接账号 · 云端数据已核对");
  }
  const today=dateKey(Date.now());
  const todayRows=records.filter(r=>dateKey(r.time)===today).sort((a,b)=>b.time-a.time);
  if(todayRows.length){const latestKnown=todayRows.find(r=>DRUGS.some(d=>d.id===r.drug));if(latestKnown)current=latestKnown.drug;$("drug").value=current;openCalculationDate(today)}
  else openCalculationDate(today);
  if(incomingLocalTransfer())setTimeout(()=>$("saveLocalCloud").click(),0);
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
        {username,password,remember:$("sessionRemember").checked});
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
    authUser=null;syncConflict=false;syncPending=false;syncRecoveredDrafts=[];editorDrafts={};records=safeRecords(JSON.parse(getStored(RECORD_KEY)||"[]"));courses=safeCourses(JSON.parse(getStored(COURSE_KEY)||"[]"));plans=JSON.parse(getStored(PLAN_KEY)||"{}");intakes=safeIntakes(JSON.parse(getStored(INTAKE_KEY)||"[]"));renal=safeRenal(JSON.parse(getStored(RENAL_KEY)||"null"));referenceMemory={};inverseMemory={};localStorage.removeItem("pk-atlas-reference-by-drug-v1");localStorage.removeItem("pk-atlas-inverse-by-drug-v1");mealMatchCache.clear();
    $("authForm").hidden=false;$("accountActions").hidden=true;$("accountTools").hidden=true;$("accountTools").open=false;$("accountName").textContent="未登录";setSyncStatus("请登录后查看和同步记录");activeCourseId="";renderDrug();showStage("auth");
  });
  $("importLocal").addEventListener("click",()=>{
    if(!authUser||!confirm("将当前浏览器保存的服用、饮食记录、药盒规格和肌酐清除率合并到已登录账号？"))return;
    const localRecords=safeRecords(JSON.parse(getStored(RECORD_KEY)||"[]")),localCourses=safeCourses(JSON.parse(getStored(COURSE_KEY)||"[]")),localPlans=JSON.parse(getStored(PLAN_KEY)||"{}"),localIntakes=safeIntakes(JSON.parse(getStored(INTAKE_KEY)||"[]")),localRenal=safeRenal(JSON.parse(getStored(RENAL_KEY)||"null"));
    const cr=new Map(courses.map(x=>[x.id,x]));for(const x of localCourses)if(!cr.has(x.id))cr.set(x.id,x);courses=[...cr.values()];
    const rr=new Map(records.map(x=>[x.id,x]));for(const x of localRecords)if(!rr.has(x.id))rr.set(x.id,x);records=[...rr.values()];
    const ii=new Map(intakes.map(x=>[x.id,x]));for(const x of localIntakes)if(!ii.has(x.id))ii.set(x.id,x);intakes=[...ii.values()];
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
      const message=`将${incoming?`来自 ${incoming.sourceUsername||"本机旧页面"} 的`:"本机当前账号"}数据保存到 ${authUser} 的云端账号？\n本机：${(local.records||[]).length} 条服用、${(local.intakes||[]).length} 条饮食。药盒规格、参考值和已采用情景也会保存。\n云端独有的 ${cloudOnly} 条服用记录会保留；同一记录如两端不同，以本机内容为准。`;
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
let editingDoseId="",editingCourseId="",editingIntakeId="",timeTouched=false,previousUnit="mg";
const unitByDrug={};
