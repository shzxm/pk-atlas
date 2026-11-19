/* Device-scoped login sessions. UI exposes no raw cookies or passwords. */
const REMEMBERED_DEVICE_KEY="pk-atlas-remembered-device-v1";
const DEVICE_INSTALL_KEY="pk-atlas-random-installation-v1";
async function browserDeviceMetadata(){
  // Purpose-limited, resettable random installation ID; NOT browser fingerprint.
  let deviceId="";
  try{
    deviceId=localStorage.getItem(DEVICE_INSTALL_KEY)||"";
    if(!/^[a-zA-Z0-9_-]{16,100}$/.test(deviceId)){
      deviceId=crypto.randomUUID();
      localStorage.setItem(DEVICE_INSTALL_KEY,deviceId);
    }
  }catch{/* Storage disabled: legacy independent sessions remain supported. */}
  const hints=navigator.userAgentData;
  let osVersion="版本未提供";
  try{
    if(hints?.getHighEntropyValues){
      const value=await hints.getHighEntropyValues(["platformVersion"]);
      if(value.platformVersion)osVersion=value.platformVersion;
    }
  }catch{/* Browser privacy policy may hide precise OS versions. */}
  const platform=String(hints?.platform||navigator.platform||"未知系统").slice(0,30);
  const browser=String(hints?.brands?.find(x=>!x.brand.toLowerCase().includes("not"))?.brand||"网页浏览器").slice(0,24);
  return {deviceId,devicePlatform:platform,deviceOS:osVersion,
          deviceName:(platform+" · "+browser).slice(0,50)};
}

function appRememberSession(result){
  if(!result?.username)return;
  try{
    if(result.remembered){
      localStorage.setItem(REMEMBERED_DEVICE_KEY,JSON.stringify({
        username:result.username,confirmedAt:Date.now()
      }));
    }else{
      localStorage.removeItem(REMEMBERED_DEVICE_KEY);
      offlineForgetSnapshot();
    }
  }catch{}
}
function appForgetSession(){
  try{localStorage.removeItem(REMEMBERED_DEVICE_KEY)}catch{}
  // Do not delete outstanding local drafts on logout; the next authorized
  // login must be able to reconcile them.
  offlineForgetSnapshot();
}
function displaySessionTime(time){
  return Number.isFinite(time)?new Date(time).toLocaleString("zh-CN",{
    year:"numeric",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"
  }):"未知";
}
async function loadDeviceSessions(){
  const list=$("deviceSessionsList");
  if(!authUser)return;
  list.textContent="正在读取已登录设备…";
  try{
    const response=await api("/api/sessions");
    list.replaceChildren();
    $("deviceSessionsRevokeOthers").hidden=true;
    if(!response.sessions?.length){
      list.textContent="当前没有有效会话。";
      return;
    }
    $("deviceSessionsRevokeOthers").hidden=response.sessions.filter(row=>!row.current).length===0;
    for(const session of response.sessions){
      const item=document.createElement("div"),details=document.createElement("div"),
            name=document.createElement("strong"),meta=document.createElement("small"),
            action=document.createElement("button");
      item.className="device-session";
      name.textContent=session.name+(session.current?" · 当前设备":"");
      const expires=session.expiresAt?displaySessionTime(session.expiresAt):"未知";
      const method=session.loginMethod==="ios-native"?"iOS 原生 App · 网页授权":
        session.loginMethod==="web"?"网页账号登录":"历史未知";
      meta.textContent=(session.platform||"未知系统")+" · "+(session.osVersion||"版本未提供")+
        " · "+method+" · 最近使用："+displaySessionTime(session.lastActiveAt)+
        " · 预计到期："+expires+(session.remembered?" · 保持登录":"")+
        (!session.identifiedInstallation?" · 旧会话未提供设备标识，无法安全去重":"");
      action.type="button";
      action.className=session.current?"record-danger":"ghost";
      action.textContent=session.current?"退出当前设备":"退出此设备";
      action.setAttribute("aria-label","退出 "+session.name+(session.current?" 当前设备":"")+" 的登录");
      action.addEventListener("click",async()=>{
        if(!confirm("确定让"+session.name+"退出药时？未同步的本地草稿仍保留在对应设备，但需要重新登录才能同步。"))return;
        action.disabled=true;
        try{
          const reply=await api("/api/sessions/revoke","POST",{id:session.id});
          if(reply.current){
            window.dispatchEvent(new Event("pk-atlas-logout"));
            appForgetSession();
            authUser=null;
            syncConflict=false;syncPending=false;
            $("accountActions").hidden=true;$("accountTools").hidden=true;
            $("authForm").hidden=false;
            $("accountName").textContent="登录已退出";
            setSyncStatus("当前设备的登录已撤销；本机草稿保留。");
            showStage("auth");
            // Clear account data still held in JS memory once drafts are safe.
            location.reload();
          }else await loadDeviceSessions();
        }catch(err){
          action.disabled=false;
          setSyncStatus("无法退出该设备："+err.message,true);
        }
      });
      details.append(name,meta);item.append(details,action);list.append(item);
    }
  }catch(err){list.textContent="读取设备失败："+err.message}
}
function initDeviceSessionUI(){
  $("deviceSessionsRefresh").addEventListener("click",()=>void loadDeviceSessions());
  $("deviceSessionsRevokeOthers").addEventListener("click",async()=>{
    if(!authUser)return;
    if(!confirm("确定退出此账号在其他所有设备上的登录吗？当前设备保持登录。其他设备已有的本地草稿会保留，但需要重新登录才能同步。"))return;
    const button=$("deviceSessionsRevokeOthers");
    button.disabled=true;
    try{
      const result=await api("/api/sessions/revoke-others","POST",{});
      await loadDeviceSessions();
      const notice=$("deviceSessionResult");
      notice.textContent="已让其他 "+(result.revoked||0)+" 个会话退出，当前设备保持登录。";
      notice.hidden=false;
    }catch(error){
      const notice=$("deviceSessionResult");
      notice.textContent="撤销其他设备失败："+error.message;
      notice.hidden=false;
    }finally{button.disabled=false}
  });
  $("deviceSessionGuide").addEventListener("toggle",()=>{
    if($("deviceSessionGuide").open)void loadDeviceSessions();
  });
}
