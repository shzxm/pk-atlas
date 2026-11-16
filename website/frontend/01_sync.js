/* Cloud autosave: durable per-tab drafts, bounded retries and three-way merges.
 * All actual medication records remain explicit user actions. */
const SYNC_NAMES=["records","courses","intakes","plans","settings"];
const SYNC_DRAFT_PREFIX="pk-atlas-sync-draft-v2:";
// A new instance ID per page load avoids cloned sessionStorage IDs when
// Safari/Chrome duplicates a tab; prior draft keys are scanned on reload.
const SYNC_TAB_ID=(()=>{
  try{return crypto.randomUUID()}catch{return String(Date.now())+"-"+Math.random().toString(36).slice(2)}
})();
let syncRevision=0,syncTimer=0,syncRetryDelay=1000,syncRecoveredDrafts=[],syncLastEditAt=0;
let syncStorageError=false,syncPulling=false;
const syncKey=username=>SYNC_DRAFT_PREFIX+encodeURIComponent(username)+":"+SYNC_TAB_ID;
const syncApi=(path,method="GET",body)=>PKApi.request(path,method,body,{timeoutMs:16000});
const syncDraftChanges=(a,b)=>SYNC_NAMES.filter(key=>!same(a?.[key],b?.[key]));
function syncSetStatus(kind,message){
  setSyncStatus(message,kind==="error"||kind==="conflict");
  const el=$("syncStatus");
  if(el)el.dataset.sync=kind;
  const info=$("syncLastSaved");
  if(info){
    if(kind==="synced")info.textContent="云端已确认保存";
    else if(kind==="saving")info.textContent="本机草稿已保存，正在同步";
    else if(kind==="offline")info.textContent="本机草稿已保留，等待网络";
    else if(kind==="conflict")info.textContent="存在冲突，不会自动覆盖";
    else info.textContent="尚未完成云端确认";
  }
}
function syncReadDrafts(username){
  const entries=[];
  try{
    const prefix=SYNC_DRAFT_PREFIX+encodeURIComponent(username)+":";
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);
      if(!key||!key.startsWith(prefix))continue;
      const raw=localStorage.getItem(key);
      if(!raw)continue;
      try{
        const draft=JSON.parse(raw);
        if(draft?.username===username&&draft.state&&draft.base&&Number.isInteger(draft.version))
          entries.push({key,raw,draft});
      }catch{}
    }
    const raw=localStorage.getItem(DRAFT_KEY);
    if(raw){
      try{
        const draft=JSON.parse(raw);
        if(draft?.username===username&&draft.state&&draft.base&&Number.isInteger(draft.version))
          entries.push({key:DRAFT_KEY,raw,draft});
      }catch{}
    }
  }catch{syncStorageError=true}
  return entries.sort((a,b)=>(a.draft.savedAt||0)-(b.draft.savedAt||0));
}
function syncSaveDraft(){
  if(!authUser)return true;
  const draft={schema:2,username:authUser,tabId:SYNC_TAB_ID,savedAt:Date.now(),
    version:stateVersion,base:structuredClone(baseState||{}),state:snapshot()};
  try{
    localStorage.setItem(syncKey(authUser),JSON.stringify(draft));
    syncStorageError=false;
    return true;
  }catch{
    syncStorageError=true;
    syncSetStatus("error","本机存储空间或权限不足！当前更改尚未安全备份；请保持页面打开并手动导出。");
    return false;
  }
}
function syncClearAcknowledgedDrafts(){
  if(!authUser)return;
  try{
    // Never delete a newer draft from another tab or a later edit on this tab.
    const key=syncKey(authUser),raw=localStorage.getItem(key);
    if(raw){
      const saved=JSON.parse(raw);
      if(saved?.username===authUser&&same(saved.state,snapshot()))
        localStorage.removeItem(key);
    }
    for(const entry of syncRecoveredDrafts){
      if(localStorage.getItem(entry.key)===entry.raw)localStorage.removeItem(entry.key);
    }
    syncRecoveredDrafts=[];
    syncStorageError=false;
  }catch{syncStorageError=true}
}
function mergeEditorDrafts(base,local,remote){
  const result={};
  for(const drug of new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)])){
    const merged=mergeObjects(base[drug]||{},local[drug]||{},remote[drug]||{});
    if(!merged)return null;
    if(Object.keys(merged).length)result[drug]=merged;
  }
  return result;
}
function syncApplyMerged(state){
  records=safeRecords(state.records);
  courses=safeCourses(state.courses);
  intakes=safeIntakes(state.intakes);
  plans=state.plans&&typeof state.plans==="object"&&!Array.isArray(state.plans)?state.plans:{};
  renal=safeRenal(state.settings?.renal);
  referenceMemory=state.settings?.referenceMemory||{};
  inverseMemory=safeInverseMemory(state.settings?.inverseMemory);
  editorDrafts=safeEditorDrafts(state.settings?.editorDrafts);
  if(DRUGS.some(d=>d.id===state.settings?.currentDrug))current=state.settings.currentDrug;
  mealMatchCache.clear();
  MODEL_PARAMS.clear();
}
function syncSchedule(delay=650){
  if(!authUser||syncConflict||appOfflineRestored)return;
  clearTimeout(syncTimer);
  syncTimer=setTimeout(()=>void flushSync(),delay);
}
function syncRetryLater(error){
  syncPending=true;
  syncRetryDelay=Math.min(60000,Math.max(1000,syncRetryDelay*2));
  const offline=typeof navigator!=="undefined"&&!navigator.onLine;
  syncSetStatus(offline?"offline":"error",
    offline?"已离线，本机更改已保存；联网后自动继续。":
    `云端同步失败：${error?.message||"网络错误"}；本机草稿保留，将自动重试。`);
  $("syncRetry").hidden=false;
  syncSchedule(syncRetryDelay);
}
function syncConflictNotice(){
  syncConflict=true;
  syncPending=false;
  clearTimeout(syncTimer);
  syncSetStatus("conflict","本机与云端修改了同一内容。两份数据均保留，暂不覆盖；可导出本机草稿并重试核对。");
  $("syncRetry").hidden=false;
}
function persist(){
  mealMatchCache.clear();
  if(authUser){
    syncRevision++;
    syncLastEditAt=Date.now();
    const safe=syncSaveDraft();
    syncPending=true;
    if(safe)syncSetStatus(navigator.onLine?"pending":"offline",
      navigator.onLine?"已自动保存到本机 · 等待云端确认":"已离线 · 本机草稿已保存");
    syncSchedule(600);
  }else{
    setStored(RECORD_KEY,JSON.stringify(records));setStored(COURSE_KEY,JSON.stringify(courses));
    setStored(PLAN_KEY,JSON.stringify(plans));setStored(INTAKE_KEY,JSON.stringify(intakes));
    setStored(RENAL_KEY,JSON.stringify(renal));
  }
  if(!authUser){
    setStored("pk-atlas-reference-by-drug-v1",JSON.stringify(referenceMemory));
    setStored("pk-atlas-inverse-by-drug-v1",JSON.stringify(inverseMemory));
  }
}
async function syncRecoverPending(){
  if(!authUser)return;
  const drafts=syncReadDrafts(authUser);
  if(!drafts.length){
    syncSetStatus("synced","已读取云端最新数据");
    return;
  }
  let merged=structuredClone(baseState);
  for(const entry of drafts){
    const proposed=mergeState(entry.draft.base,entry.draft.state,merged);
    if(!proposed){syncRecoveredDrafts=drafts;syncConflictNotice();return}
    merged=proposed;
  }
  syncRecoveredDrafts=drafts;
  if(syncDraftChanges(baseState,merged).length){
    syncApplyMerged(merged);
    syncRevision++;
    syncPending=true;
    syncSaveDraft();
    syncSetStatus("pending",`发现 ${drafts.length} 份未同步草稿，已安全合并，正在补传云端…`);
    syncSchedule(80);
  }else{
    syncClearAcknowledgedDrafts();
    syncSetStatus("synced","本机草稿与云端一致，已核对");
  }
}
async function flushSync(){
  clearTimeout(syncTimer);syncTimer=0;
  if(syncRunning||!authUser||appOfflineRestored||syncConflict||!syncPending)return;
  if(!navigator.onLine){syncRetryLater(new Error("offline"));return}
  syncRunning=true;
  syncPending=false;
  const sent=snapshot(),base=structuredClone(baseState||{}),version=stateVersion;
  const sections=Object.fromEntries(syncDraftChanges(base,sent).map(k=>[k,sent[k]]));
  try{
    syncSetStatus("saving","正在安全同步云端…");
    if(Object.keys(sections).length)
      await syncApi("/api/state/sections","PUT",{version,sections});
    // Read back the durable state; an HTTP 200 alone is not sufficient proof.
    const verified=await syncApi("/api/state");
    const latest=snapshot();
    const merged=mergeState(Object.keys(sections).length?sent:base,latest,verified.state);
    if(!merged){syncConflictNotice();return}
    const changedMemory=!same(merged,latest);
    baseState=structuredClone(verified.state);
    stateVersion=verified.version;
    offlineSaveVerified(authUser,verified.state,verified.version);
    if(changedMemory){
      syncApplyMerged(merged);
      renderDrug();
      window.dispatchEvent(new Event("pk-atlas-records-changed"));
    }
    if(syncDraftChanges(baseState,snapshot()).length){
      syncRevision++;
      syncPending=true;
      syncSaveDraft();
      syncSetStatus("pending","合并了其他设备或刚刚输入的更改，正在继续同步…");
      syncRetryDelay=1000;
      syncSchedule(200);
    }else{
      syncClearAcknowledgedDrafts();
      syncRetryDelay=1000;
      if(!syncStorageError)syncSetStatus("synced","所有更改已保存到云端 · 已回读核对");
      $("syncRetry").hidden=true;
      window.dispatchEvent(new Event("pk-atlas-records-changed"));
    }
  }catch(error){
    if(error.status===409&&error.data?.state&&Number.isInteger(error.data.version)){
      const merged=mergeState(base,snapshot(),error.data.state);
      if(!merged){syncConflictNotice();return}
      baseState=structuredClone(error.data.state);
      stateVersion=error.data.version;
      syncApplyMerged(merged);
      renderDrug();
      syncRevision++;
      syncPending=true;
      syncSaveDraft();
      syncSetStatus("pending","另一台设备已有新内容；已合并不冲突的更改，正在重试…");
      syncSchedule(80);
    }else if(error.status===401){
      syncPending=true;
      syncSetStatus("error","登录已过期。本机草稿已保留，请重新登录后自动恢复同步。");
      $("authRetry").hidden=false;
      $("syncRetry").hidden=false;
    }else syncRetryLater(error);
  }finally{
    syncRunning=false;
    // A new change might have arrived during the awaited request.
    if(syncPending&&!syncConflict&&!syncTimer)syncSchedule(250);
  }
}
async function syncPullRemote(){
  if(!authUser||appOfflineRestored||syncPulling||syncRunning||syncPending||syncConflict||!navigator.onLine)return;
  // No redundant 30-second cloud reads while a home-screen PWA is in the
  // background. Visibility/focus listeners refresh immediately on return.
  if(document.hidden)return;
  if(Date.now()-syncLastEditAt<3500)return;
  if(document.activeElement?.matches?.("input,textarea,select,[contenteditable=true]"))return;
  syncPulling=true;
  const rev=syncRevision;
  try{
    const data=await syncApi("/api/state");
    if(syncRevision!==rev||syncPending||syncRunning)return;
    if(data.version!==stateVersion){
      const merged=mergeState(baseState,snapshot(),data.state);
      if(!merged){syncConflictNotice();return}
      baseState=structuredClone(data.state);
      stateVersion=data.version;
      syncApplyMerged(merged);
      renderDrug();
      if(syncDraftChanges(baseState,snapshot()).length){
        syncRevision++;syncPending=true;syncSaveDraft();syncSchedule(100);
      }else{
        syncSetStatus("synced","已载入另一台设备的最新内容");
        window.dispatchEvent(new Event("pk-atlas-records-changed"));
      }
    }
  }catch{/* transient polling failures never erase local changes */ }
  finally{syncPulling=false}
}
async function syncManualRetry(){
  if(!authUser||appOfflineRestored||syncRunning)return;
  if(syncConflict){
    try{
      const data=await syncApi("/api/state");
      const drafts=syncReadDrafts(authUser);
      let merged=structuredClone(data.state);
      for(const entry of drafts){
        merged=mergeState(entry.draft.base,entry.draft.state,merged);
        if(!merged){syncConflictNotice();return}
      }
      syncConflict=false;
      baseState=structuredClone(data.state);stateVersion=data.version;
      syncApplyMerged(merged);
      syncRecoveredDrafts=drafts;
      renderDrug();
    }catch(e){syncSetStatus("error",`重新核对失败：${e.message}`);return}
  }
  syncRevision++;syncPending=true;syncSaveDraft();syncSchedule(0);
}
function syncDownloadDraft(){
  if(!authUser)return;
  const text=JSON.stringify({username:authUser,exportedAt:new Date().toISOString(),
    state:snapshot(),base:baseState,version:stateVersion},null,2);
  const blob=new Blob([text],{type:"application/json"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download="yaoshi-unsynced-"+new Date().toISOString().slice(0,10)+".json";
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function initSyncLifecycle(){
  $("syncNow").addEventListener("click",()=>void syncManualRetry());
  $("syncExport").addEventListener("click",syncDownloadDraft);
  window.addEventListener("online",()=>{
    if(authUser&&!appOfflineRestored){syncPending=true;syncSchedule(0)}
  });
  document.addEventListener("visibilitychange",()=>{
    if(!document.hidden){if(syncPending)syncSchedule(0);else void syncPullRemote()}
  });
  window.addEventListener("focus",()=>{if(syncPending)syncSchedule(0);else void syncPullRemote()});
  window.addEventListener("storage",e=>{
    if(!authUser||!e.key||!e.key.startsWith(SYNC_DRAFT_PREFIX))return;
    if(!syncPending&&!syncRunning)void syncPullRemote();
  });
  document.addEventListener("input",syncCaptureEditor);
  document.addEventListener("change",syncCaptureEditor);
  setInterval(()=>{if(syncPending)syncSchedule(0);else void syncPullRemote()},30000);
}


// Editing a dose is not the same as recording that it was taken. Preserve
// in-progress fields as account-scoped drafts, never as confirmed medication.
function syncCaptureEditor(event){
  if(!authUser)return;
  const input=event.target;
  if(!input?.id||!EDITOR_IDS.has(input.id)||input.closest("#authForm"))return;
  const byDrug=editorDrafts[current]||{};
  byDrug[input.id]=String(input.value).slice(0,160);
  editorDrafts[current]=byDrug;
  persist();
}
function syncRestoreEditor(){
  const fields=editorDrafts[current];
  if(!fields)return;
  for(const [id,value] of Object.entries(fields)){
    const el=$(id);
    if(!el||el.disabled||!EDITOR_IDS.has(id))continue;
    if(document.activeElement===el)continue;
    el.value=value;
  }
}
function syncClearEditorFields(ids,drug=current){
  const fields=editorDrafts[drug];
  if(!fields)return;
  for(const id of ids)delete fields[id];
  if(!Object.keys(fields).length)delete editorDrafts[drug];
}
