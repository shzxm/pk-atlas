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
let syncStorageError=false,syncPulling=false,syncUploadId=null;
const syncNewOperationId=()=>crypto.randomUUID?.()||('op-'+Date.now()+'-'+Math.random().toString(36).slice(2));
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
    version:stateVersion,operationId:syncUploadId,base:structuredClone(baseState||{}),state:snapshot()};
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
function syncClearAcknowledgedDrafts(acceptedId=null){
  if(!authUser)return;
  try{
    // Never delete a newer draft from another tab or a later edit on this tab.
    const key=syncKey(authUser),raw=localStorage.getItem(key);
    if(raw){
      const saved=JSON.parse(raw);
      if(saved?.username===authUser&&(same(saved.state,snapshot())||(acceptedId&&saved.operationId===acceptedId)))
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
    syncUploadId=syncNewOperationId();
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
  const pending=drafts.filter(item=>syncDraftChanges(item.draft.base,item.draft.state).length);
  if(!pending.length){syncSetStatus("synced","已读取云端最新数据");return}
  // Only the latest LOCAL draft wins. Never union deleted records back in.
  const newest=pending[pending.length-1];
  syncRecoveredDrafts=drafts;
  syncApplyMerged(newest.draft.state);
  syncUploadId=newest.draft.operationId||syncNewOperationId();
  syncRevision++;syncPending=true;syncSaveDraft();
  syncSetStatus("pending","恢复未上传的完整本机草稿，等待最后上传优先同步");
  syncSchedule(80);
}
async function flushSync(){
  clearTimeout(syncTimer);syncTimer=0;
  if(syncRunning||!authUser||appOfflineRestored||syncConflict||!syncPending)return;
  if(!navigator.onLine){syncRetryLater(new Error("offline"));return}
  syncRunning=true;syncPending=false;
  const sent=snapshot(),version=stateVersion,revision=syncRevision;
  const dirty=syncDraftChanges(baseState,sent).length>0;
  const operationId=syncUploadId||(syncUploadId=syncNewOperationId());
  try{
    if(dirty){
      syncSetStatus("saving","上传完整快照，以服务器最后成功提交的设备为准…");
      await syncApi("/api/state","PUT",{version,state:sent,
        syncPolicy:"last-upload-wins-v1",operationId});
    }
    const remote=await syncApi("/api/state");
    if(remote.syncPolicy!=="last-upload-wins-v1"){
      syncConflictNotice();
      syncSetStatus("conflict","服务器尚不支持最后上传优先规则，请先升级服务端。");
      return;
    }
    baseState=structuredClone(remote.state);
    stateVersion=remote.version;
    offlineSaveVerified(authUser,remote.state,remote.version);
    if(syncRevision!==revision){
      syncPending=true;syncSaveDraft();
      syncSetStatus("pending","上传期间产生新修改，将继续提交较新的本机快照…");
      syncSchedule(250);
      return;
    }
    // Another device could have committed between our write and GET.
    // In that case it has won. Do not re-upload our older snapshot.
    syncApplyMerged(remote.state);
    syncClearAcknowledgedDrafts(operationId);
    syncUploadId=null;syncRetryDelay=1000;
    renderDrug();
    syncSetStatus("synced","已回读最后成功上传设备的完整快照");
    $("syncRetry").hidden=true;
    window.dispatchEvent(new Event("pk-atlas-records-changed"));
  }catch(error){
    if(error.status===409){
      syncConflictNotice();
      syncSetStatus("conflict","服务器仍使用旧版冲突规则，停止重试；保留本机草稿。");
    }else if(error.status===401){
      syncPending=true;
      syncSetStatus("error","登录已过期，本机完整草稿已保留。");
      $("authRetry").hidden=false;$("syncRetry").hidden=false;
    }else syncRetryLater(error);
  }finally{
    syncRunning=false;
    if(syncPending&&!syncConflict&&!syncTimer)syncSchedule(250);
  }
}
async function syncPullRemote(){
  if(!authUser||appOfflineRestored||syncPulling||syncRunning||syncPending||syncConflict||!navigator.onLine)return;
  if(document.hidden)return;
  if(Date.now()-syncLastEditAt<3500)return;
  if(document.activeElement?.matches?.("input,textarea,select,[contenteditable=true]"))return;
  syncPulling=true;const revision=syncRevision;
  try{
    const remote=await syncApi("/api/state");
    if(syncRevision!==revision||syncPending||syncRunning)return;
    if(remote.version!==stateVersion){
      baseState=structuredClone(remote.state);
      stateVersion=remote.version;
      syncApplyMerged(remote.state);
      offlineSaveVerified(authUser,remote.state,remote.version);
      renderDrug();
      syncSetStatus("synced","已加载另一设备最后提交的完整版本");
      window.dispatchEvent(new Event("pk-atlas-records-changed"));
    }
  }catch{/* Poll failures never erase a local draft or upload stale data. */}
  finally{syncPulling=false}
}
async function syncManualRetry(){
  if(!authUser||appOfflineRestored||syncRunning)return;
  syncConflict=false;syncPending=true;
  if(!syncUploadId)syncUploadId=syncNewOperationId();
  syncSaveDraft();syncSchedule(0);
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
