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
     show("pushDiagPermission",permitted==="granted"?"已允许":permitted==="denied"?"被系统拒绝":permitted==="default"?"未授权":"当前环境不支持");
     show("pushDiagThisDevice",locError?"当前设备检查失败："+locError:
       !localSub?"当前设备未订阅":serverSub?.enabled?"已在此账号注册":"本机已有订阅，但当前账号尚未注册");
     show("pushDiagSubscribers",server.subscribedDevices+" 台设备");
     show("pushDiagAccepted",server.acceptedByProviderTotal+" 次（最近24小时 "+server.acceptedLast24h+" 次）");
     show("pushDiagLatest",fmt(server.lastProviderAcceptedAt));
     show("pushDiagUpcoming",pending.events.length+" 个模型时间节点（未来 "+pending.windowDays+" 天）");
     show("pushDiagAuto",prefs.preferences.auto?"已开启":"已关闭");
     text.textContent="检查完成。服务商接受推送 ≠ 手机实际显示通知；网站无法验证系统弹窗是否出现。";
   }catch(err){
     text.textContent="诊断失败："+err.message+"。请检查是否已登录以及网络连接。";
   }finally{button.disabled=false}
 }
 document.addEventListener("DOMContentLoaded",()=>{
   $("pushDiagRefresh")?.addEventListener("click",()=>void refresh());
   if($("pushDiagnostics"))void refresh();
 });
})();
