/* Read-only diagnostics: provider acceptance is NOT device delivery. */
(()=>{
 const $=id=>document.getElementById(id);
 const fmt=ms=>ms?new Date(ms).toLocaleString("zh-CN",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}):"暂无记录";
 async function refresh(){
   const text=$("pushDiagStatus"),button=$("pushDiagRefresh");
   if(!text)return;
   button.disabled=true;text.textContent="正在读取设备权限与服务器记录…";
   try{
     const req=(path,method="GET",body)=>PKApi.request(path,method,body);
     const [server,prefs,pending]=await Promise.all([
       req("/api/push/diagnostics"),req("/api/push/preferences"),req("/api/push/pending")]);
     const permitted=typeof Notification!=="undefined"?Notification.permission:"unsupported";
     let localSub=null,locError="";
     try{
       const registration=await navigator.serviceWorker?.getRegistration("/");
       localSub=registration?await registration.pushManager?.getSubscription():null;
     }catch(err){locError=err.message}
     let serverSub=null;
     if(localSub){
       try{serverSub=await req("/api/push/status","POST",{endpoint:localSub.endpoint})}
       catch(err){locError=err.message}
     }
     const show=(id,value)=>$(id).textContent=String(value);
     const installed=window.matchMedia?.("(display-mode: standalone)")?.matches||
       navigator.standalone===true;
     const enabled=!!prefs.preferences.auto;
     const permissionOK=permitted==="granted";
     const deviceOK=!!localSub&&serverSub?.enabled===true;
     const pendingEvents=Array.isArray(pending.events)?pending.events:[];
     const sorted=pendingEvents.filter(e=>Number.isFinite(e.time)&&e.time>Date.now())
       .sort((a,b)=>a.time-b.time);
     show("pushDiagPermission",permitted==="granted"?"已允许":permitted==="denied"?"被系统拒绝":permitted==="default"?"未授权":"当前环境不支持");
     show("pushDiagThisDevice",locError?"当前设备检查失败："+locError:
       !localSub?"当前设备未订阅":serverSub?.enabled?"已在此账号注册":"本机已有订阅，但当前账号尚未注册");
     show("pushDiagSubscribers",server.subscribedDevices+" 台已注册设备");
     show("pushDiagAccepted",server.acceptedByProviderTotal+" 次（最近24小时 "+server.acceptedLast24h+" 次）");
     show("pushDiagLatest",fmt(server.lastProviderAcceptedAt));
     show("pushDiagUpcoming",sorted.length+" 个候选节点（未来 "+pending.windowDays+" 天）");
     show("pushDiagNext",sorted.length?fmt(sorted[0].time):"未来 7 天无节点");
     show("pushDiagMode",installed?"主屏幕/独立 App":"浏览器页面（iOS 推送一般需要主屏幕安装）");
     show("pushDiagAuto",enabled?"已开启":"已关闭");
     show("pushDiagReady",!enabled?"自动提醒未启用":
       !permissionOK?"当前设备尚未允许通知":
       !deviceOK?"当前设备订阅未在此账号确认":
       server.subscribedDevices===0?"当前账号没有有效订阅":
       sorted.length===0?"具备发送条件，但未来 7 天无待发节点":
       "已满足可检查的发送前提；实际显示仍需人工测试");
     text.textContent="检查完成。服务商接受推送 ≠ 手机实际显示通知；网站无法验证系统弹窗是否出现。下一个节点只是模型预计时间，不能理解为保证投递。";
   }catch(err){
     text.textContent="诊断失败："+err.message+"。请检查是否已登录以及网络连接。";
   }finally{button.disabled=false}
 }
 document.addEventListener("DOMContentLoaded",()=>{
   $("pushDiagRefresh")?.addEventListener("click",()=>void refresh());
   if($("pushDiagnostics"))void refresh();
 });
})();
