/* Offline-only fallback for a previously authenticated, remembered private
 * device. Cached JSON never goes through CacheStorage or a public CDN.
 * A recent successful online login is mandatory; remote revocation cannot
 * be checked offline, so cached views expire after seven days. */
const OFFLINE_SNAPSHOT_PREFIX="pk-atlas-offline-state-v1:";
const OFFLINE_GRACE_MS=7*86400000;
const PENDING_OFFLINE_LOGOUT_KEY="pk-atlas-logout-pending-v1";
async function offlineFinishPendingLogout(){
  if(getStored(PENDING_OFFLINE_LOGOUT_KEY)!=="1")return true;
  try{
    try{await window.disablePushForLogout?.()}catch{}
    try{await api("/api/logout","POST")}catch(error){
      if(error.status!==401)throw error;
    }
    localStorage.removeItem(PENDING_OFFLINE_LOGOUT_KEY);
    return true;
  }catch{return false}
}
let appOfflineRestored=false;
function initOfflineShell(){
  if(location.protocol!=="https:"||!("serviceWorker" in navigator))return;
  const install=()=>navigator.serviceWorker.register(
    "/sw.js?v=offline-20261116a",{scope:"/"}
  ).catch(()=>{/* A failed shell install must not block login or autosave. */});
  if(document.readyState==="complete")void install();
  else window.addEventListener("load",install,{once:true});
}
function offlineKey(username){return OFFLINE_SNAPSHOT_PREFIX+encodeURIComponent(username)}
function offlineForgetSnapshot(){
  try{
    for(let i=localStorage.length-1;i>=0;i--){
      const key=localStorage.key(i);
      if(key?.startsWith(OFFLINE_SNAPSHOT_PREFIX))localStorage.removeItem(key);
    }
  }catch{}
}
function offlineSaveVerified(username,state,version){
  try{
    const stored=JSON.parse(localStorage.getItem(REMEMBERED_DEVICE_KEY)||"null");
    if(!stored||stored.username!==username||!state||!Number.isInteger(version))return;
    localStorage.setItem(offlineKey(username),JSON.stringify({
      username,version,savedAt:Date.now(),state
    }));
  }catch{
    // A failed offline snapshot must not affect verified cloud autosave.
  }
}
function offlineReadVerified(){
  try{
    const token=JSON.parse(localStorage.getItem(REMEMBERED_DEVICE_KEY)||"null");
    if(!token?.username||!Number.isFinite(token.confirmedAt)||
       Date.now()-token.confirmedAt>OFFLINE_GRACE_MS)return null;
    const item=JSON.parse(localStorage.getItem(offlineKey(token.username))||"null");
    if(!item||item.username!==token.username||!item.state||
       !Number.isInteger(item.version)||!Number.isFinite(item.savedAt)||
       Date.now()-item.savedAt>OFFLINE_GRACE_MS)return null;
    return item;
  }catch{return null}
}
function offlineSetBanner(isOffline,message=""){
  const banner=$("offlineAppBanner");
  banner.hidden=!isOffline;
  banner.textContent=message||"离线模式：记录仅保存在本机草稿，联网并验证登录后自动核对。";
}
async function offlineRestoreLastVerified(){
  const item=offlineReadVerified();
  if(!item)return false;
  appOfflineRestored=true;
  authUser=item.username;
  applyAccountState(item.state,item.version);
  const entries=syncReadDrafts(item.username);
  let proposed=structuredClone(baseState);
  for(const entry of entries){
    proposed=mergeState(entry.draft.base,entry.draft.state,proposed);
    if(!proposed){
      syncConflict=true;
      break;
    }
  }
  if(!syncConflict)syncApplyMerged(proposed);
  syncPending=entries.length>0;
  $("accountName").textContent=item.username+" · 离线模式";
  $("authForm").hidden=true;
  $("accountActions").hidden=false;
  $("accountTools").hidden=false;
  const today=dateKey(Date.now());
  openCalculationDate(today);
  const message=syncConflict?
    "离线草稿有冲突，已保留本地文件；联网后需要人工核对。":
    "正在离线查看最近验证的记录。新增记录只保存在本机，云端尚未确认。";
  syncSetStatus(syncConflict?"conflict":"offline",message);
  offlineSetBanner(true,message);
  $("authRetry").hidden=false;
  return true;
}
