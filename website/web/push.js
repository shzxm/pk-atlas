/* Opt-in, per-device Web Push. The service worker stores no account data. */
(()=>{
  const $=id=>document.getElementById(id);
  const supported=()=>"serviceWorker" in navigator&&"PushManager" in window&&"Notification" in window;
  const isIOS=()=>/iPad|iPhone|iPod/.test(navigator.userAgent);
  const standalone=()=>navigator.standalone===true||matchMedia("(display-mode: standalone)").matches;
  const kinds={dose:"pushDose",comeup:"pushComeup",peak:"pushPeak",offset:"pushOffset",end:"pushEnd"};
  let thresholds={},selectedDrug="";
  const status=(message,error=false)=>{const el=$("pushStatus");el.textContent=message;el.classList.toggle("error",error)};
  const bytes=value=>{
    const padded=value.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(value.length/4)*4,"=");
    return Uint8Array.from(atob(padded),char=>char.charCodeAt(0));
  };
  const request = (path,method="GET",body) => PKApi.request(path,method,body);
  async function existing(){
    const registration=await navigator.serviceWorker.getRegistration("/");
    return registration?registration.pushManager.getSubscription():null;
  }
  function stashDrug(){
    if(!selectedDrug)return;
    const low=$("pushLow").value.trim(),high=$("pushHigh").value.trim();
    if(low||high)thresholds[selectedDrug]={...(low?{low:Number(low)}:{}),...(high?{high:Number(high)}:{})};
    else delete thresholds[selectedDrug];
  }
  function showDrug(){
    selectedDrug=$("pushDrug").value;
    $("pushLow").value=thresholds[selectedDrug]?.low??"";
    $("pushHigh").value=thresholds[selectedDrug]?.high??"";
  }
  async function loadPreferences(){
    const data=await request("/api/push/preferences");
    const prefs=data.preferences;
    thresholds=structuredClone(prefs.thresholds);
    $("pushAuto").checked=prefs.auto;
    for(const [kind,id] of Object.entries(kinds))$(id).checked=prefs.enabled[kind];
    const select=$("pushDrug");select.replaceChildren();
    for(const drug of data.drugs){const option=document.createElement("option");option.value=drug.id;option.textContent=drug.name;select.append(option)}
    showDrug();
    await loadPending();
    await loadScenarios();
  }
  async function loadScenarios(){
    const box=$("pushScenarioList");if(!box)return;
    try{
      const data=await request("/api/push/scenarios");
      box.replaceChildren();
      if(!data.enabled){
        box.textContent="自动模型提醒已关闭。可在上方开启“自动提醒”开关。";
        return;
      }
      if(!data.automatic?.length){
        box.textContent="暂无已采用方案的未来节点。采用方案后会自动同步并生成提醒，不需要单独保存。";
        return;
      }
      for(const event of data.automatic){
        const row=document.createElement("div"),name=document.createElement("span"),time=document.createElement("time");
        row.className="push-pending-item";
        name.textContent=event.drugName+" · 已采用方案 · 数学模型节点 "+event.doseMg+" mg（非用药指令）";
        time.dateTime=event.timeIso;
        time.textContent=new Date(event.time).toLocaleString("zh-CN",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"});
        row.append(name,time);box.append(row);
      }
    }catch(err){box.textContent="无法读取自动模型提醒："+err.message}
  }
  async function loadPending(){
    const box=$("pushPendingList");
    if($("pushPanel").hidden)return;
    try{
      const data=await request("/api/push/pending");box.replaceChildren();
      $("pushPendingStatus").textContent=data.events.length?`共 ${data.events.length} 条模型时间，系统通知可能延迟。`:"暂无待提醒事件。记录服药并保存设置后会重新计算。";
      for(const event of data.events){
        const row=document.createElement("div"),name=document.createElement("span"),time=document.createElement("time");
        row.className="push-pending-item";name.textContent=event.kind==="scenario"?`${event.drugName} · ${event.source} · 模型情景节点 ${event.doseMg} mg`:`${event.drugName} · ${event.label} · ${event.levelMgL.toFixed(3)} mg/L`;
        time.dateTime=event.timeIso;time.textContent=new Date(event.time).toLocaleString("zh-CN",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"});
        row.append(name,time);box.append(row);
      }
    }catch(err){$("pushPendingStatus").textContent=`无法读取待提醒列表：${err.message}`}
  }
  async function savePreferences(){
    stashDrug();
    const preferences={auto:$("pushAuto").checked,enabled:Object.fromEntries(Object.entries(kinds).map(([kind,id])=>[kind,$(id).checked])),thresholds};
    try{
      await request("/api/push/preferences","PUT",{preferences});
      status("提醒设置已保存。仅当前设备已开启通知时才会收到推送。");
      await loadPending();
    }catch(err){status(`保存失败：${err.message}`,true)}
  }
  async function refresh(){
    const panel=$("pushPanel");
    if(!panel||panel.hidden)return;
    if(isIOS()&&!standalone()){
      status("iPhone 请先在 Safari 点“分享”→“添加到主屏幕”，再从主屏幕图标打开药时并开启提醒。",true);
      $("pushEnable").disabled=true;return;
    }
    if(!supported()){status("此浏览器暂不支持 Web Push。iPhone 需要 iOS 16.4 或更新版本。",true);return}
    $("pushEnable").disabled=false;
    try{
      await navigator.serviceWorker.register("/sw.js?v=web-plans-only-20261120g",{scope:"/"});
      const subscription=await existing();
      const server=subscription?await request("/api/push/status","POST",{endpoint:subscription.endpoint}):{enabled:false,details:false};
      $("pushEnable").hidden=server.enabled;
      $("pushDisable").hidden=!server.enabled;
      $("pushTest").hidden=!server.enabled;
      $("pushDetails").disabled=false;
      $("pushDetails").checked=server.details;
      status(server.enabled?"当前设备已开启模型时间提醒。":"当前设备尚未开启提醒。点击按钮后，系统会询问通知权限。");
    }catch(err){status(`无法读取当前设备订阅：${err.message}`,true)}
  }
  async function enable(){
    if(!supported())return;
    if(isIOS()&&!standalone()){await refresh();return}
    $("pushEnable").disabled=true;status("正在请求通知权限…");
    try{
      const permission=await Notification.requestPermission();
      if(permission!=="granted")throw new Error("未获得通知权限；可到系统设置中重新开启")
      const registration=await navigator.serviceWorker.register("/sw.js?v=web-plans-only-20261120g",{scope:"/"});
      const config=await request("/api/push/config");
      let subscription=await registration.pushManager.getSubscription();
      if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes(config.publicKey)});
      try{await request("/api/push/subscribe","POST",{subscription:subscription.toJSON(),details:$("pushDetails").checked})}
      catch(err){await subscription.unsubscribe();throw err}
      await refresh();status("提醒已开启。可点“发送测试通知”检查系统是否收到。");
    }catch(err){status(`开启失败：${err.message}`,true);$("pushEnable").disabled=false}
  }
  async function disable(){
    const subscription=await existing();
    if(!subscription)return;
    await request("/api/push/subscribe","DELETE",{endpoint:subscription.endpoint});
    await subscription.unsubscribe();
  }
  window.disablePushForLogout=async()=>{if(supported())await disable()};
  document.addEventListener("DOMContentLoaded",()=>{
    if(!$("pushPanel"))return;
    $("pushDrug").addEventListener("change",()=>{stashDrug();showDrug()});
    $("pushSave").addEventListener("click",savePreferences);
    $("pushEnable").addEventListener("click",enable);
    $("pushDisable").addEventListener("click",async()=>{
      try{await disable();await refresh();status("当前设备的提醒已关闭。")}
      catch(err){status(`关闭失败：${err.message}`,true)}
    });
    $("pushTest").addEventListener("click",async()=>{
      try{const subscription=await existing();if(!subscription)throw new Error("当前设备未订阅");await request("/api/push/test","POST",{endpoint:subscription.endpoint});status("测试通知已发送，请查看系统通知。")}
      catch(err){status(`测试失败：${err.message}`,true)}
    });
    $("pushDetails").addEventListener("change",async()=>{
      if(!$("pushEnable").hidden){status("开启提醒后会应用此锁屏显示设置。");return}
      try{const subscription=await existing();if(subscription)await request("/api/push/subscribe","POST",{subscription:subscription.toJSON(),details:$("pushDetails").checked});status("锁屏通知的显示范围已保存。")}
      catch(err){status(`设置保存失败：${err.message}`,true)}
    });
    // A server-side plan change is reflected in the main page after a safe
    // versioned account pull. Refresh the future reminder UI immediately.
    window.addEventListener("pk-atlas-adopted-plan-changed",()=>{
      if($("pushPanel")&&!$("pushPanel").hidden){
        void loadPending();void loadScenarios();
      }
    });
    if(document.body.dataset.page==="notifications"){
      void (async()=>{
        try{
          const me=await request("/api/me");
          $("notificationsUser").textContent=`当前账号：${me.username}`;
          $("notificationsLoginGate").hidden=true;
          $("pushPanel").hidden=false;
          $("notificationsLoading").hidden=true;
        }catch(err){
          $("pushPanel").hidden=true;
          $("notificationsLoginGate").hidden=false;
          $("notificationsUser").textContent="登录后可查看和修改提醒。";
          $("notificationsLoading").hidden=true;
          return;
        }
        await refresh();
        try{await loadPreferences()}catch(err){status(`无法读取提醒设置：${err.message}`,true)}
      })();
      document.addEventListener("visibilitychange",()=>{if(!document.hidden&&!$("pushPanel").hidden){void loadPending();void loadScenarios()}});
      setInterval(()=>{if(!document.hidden&&!$("pushPanel").hidden){void loadPending();void loadScenarios()}},30000);
    }
  });
})();
