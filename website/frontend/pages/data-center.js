/* Authenticated data console. Never mutates state until explicit confirmation. */
(()=>{
  const $=id=>document.getElementById(id);
  const req=(path,method="GET",body)=>PKApi.request(path,method,body,{timeoutMs:16000});
  let user="",current=null,version=-1,pendingImport=null,importFileName="";
  let draftAccessError=false;
  const status=(text,kind="info")=>{$("dataCenterStatus").textContent=text;$("dataCenterStatus").dataset.kind=kind};
  const drafts=()=>{
    const out=[];
    draftAccessError=false;
    try{
      const prefix="pk-atlas-sync-draft-v2:"+encodeURIComponent(user)+":";
      for(let i=0;i<localStorage.length;i++){
        const key=localStorage.key(i);
        if(!key||!(key.startsWith(prefix)||key==="pk-atlas-sync-draft-v1"))continue;
        const raw=localStorage.getItem(key);
        if(!raw)continue;
        try{
          const parsed=JSON.parse(raw);
          if(parsed.username===user&&parsed.state)out.push({key,draft:parsed,raw});
          else if(key.startsWith(prefix))out.push({key,invalid:true,raw});
        }catch{if(key.startsWith(prefix))out.push({key,invalid:true,raw})}
      }
    }catch{
      draftAccessError=true;
      status("本机存储空间或权限不可用，无法核对草稿，导入已安全锁定。","error");
    }
    return out;
  };
  async function read(){
    const [account,response]=await Promise.all([req("/api/me"),req("/api/state")]);
    user=account.username;
    current=response.state;
    version=response.version;
    return response;
  }
  async function refresh(){
    $("syncCenterCheck").disabled=true;
    status("正在只读核对云端版本与本机草稿…");
    try{
      const response=await read(),local=drafts();
      const review=PKSyncCenter.summarize(local,response.state);
      $("dataAccount").textContent="当前账号："+user;
      $("syncCloudVersion").textContent="v"+response.version;
      $("syncRecordCount").textContent=response.state.records?.length??0;
      $("syncIntakeCount").textContent=response.state.intakes?.length??0;
      $("syncDraftCount").textContent=draftAccessError?"无法读取":review.needsAction;
      const box=$("syncCenterDetail");
      if(draftAccessError){
        box.textContent="本机存储不可读取，不能判断是否存在未同步草稿。请勿清除浏览器数据。";
        box.dataset.kind="error";
      }else if(review.needsAction){
        box.textContent=review.tally.possible_conflict?
          "发现 "+review.tally.possible_conflict+" 份可能与云端同分区修改冲突的草稿。先导出备份，再到首页核对；此处不会自动覆盖云端。":
          "发现 "+review.needsAction+" 份待处理或无法解析的草稿。先导出草稿，再返回首页执行自动同步。";
        box.dataset.kind=review.tally.possible_conflict?"error":"warning";
      }else{
        box.textContent="本机没有检测到待同步变更。其他设备的本机草稿无法从此处查看。";
        box.dataset.kind="info";
      }
      $("syncDraftClassification").textContent=draftAccessError?"":
        "草稿分类：待同步 "+review.tally.pending+" · 潜在冲突 "+review.tally.possible_conflict+
        " · 已与云端一致 "+review.tally.already_in_cloud+
        " · 无更改 "+review.tally.unchanged+
        " · 无法解析 "+review.tally.unreadable+
        "。涉及分区："+(review.changed.join("、")||"无")+
        "。这是分区级保守检查，不会自行删除或写入草稿。";
      $("syncCenterTime").textContent="服务器核对完成："+new Date().toLocaleString("zh-CN")+"；只证明这台设备已取得云端版本，不代表其他设备同步完成。";
      status(draftAccessError?"本机存储检查受限。":review.needsAction?"云端读取成功，但本机仍有需要处理的草稿。":"已核对云端和本机草稿；未更改任何记录。",
             draftAccessError?"error":"info");
      $("dataCenterContent").hidden=false;
      $("dataCenterGate").hidden=true;
    }catch(e){
      status("无法核对云端："+e.message,"error");
      if(e.status===401){$("dataCenterGate").hidden=false;$("dataCenterContent").hidden=true}
    }finally{$("syncCenterCheck").disabled=false}
  }
  function download(name,content,mime="application/json;charset=utf-8"){
    const blob=new Blob([content],{type:mime});
    const url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),15000);
  }
  const stamp=()=>new Date().toISOString().slice(0,10);
  async function file(name,what,type="json"){
    if(!user){status("请先成功登录并读取云端记录。","error");return}
    try{await read()}catch(err){status("导出前云端核对失败："+err.message,"error");return}
    const output=what==="full"?PKPortability.makeFull(current,{username:user,version,confirmed:true}):
      what==="legacy"?PKPortability.makeLegacy(current):
      what==="native"?PKPortability.makeNativeJournal(current):
      what==="journal"?PKPortability.makeJournal(current):
      what==="csv"?PKPortability.makeJournalCsv(current):null;
    if(!output)return;
    const content=type==="csv"?output:JSON.stringify(output,null,2);
    download("yaoshi-"+name+"-"+stamp()+"."+type,content,type==="csv"?"text/csv;charset=utf-8":"application/json;charset=utf-8");
    status("已生成 "+name+" 下载。请妥善保管，其中可能包含敏感医疗记录。");
  }
  function saveDrafts(){
    if(!user)return;
    const all=drafts();
    if(!all.length){status("这台设备没有当前账号未同步的草稿。");return}
    download("yaoshi-local-drafts-"+stamp()+".json",JSON.stringify({
      format:"pk-atlas-local-drafts-v1",exportedAt:new Date().toISOString(),
      username:user,drafts:all
    },null,2));
    status("已导出 "+all.length+" 份原始本机草稿（单独存档，不可直接作为覆盖云端的数据）。");
  }
  async function preview(event){
    const input=event.target,selected=input.files?.[0];
    pendingImport=null;$("dataImportCommit").disabled=true;
    if(!selected)return;
    importFileName=selected.name;
    if(selected.size>8_000_000){$("dataImportPreview").textContent="文件超过 8 MB，已拒绝加载";return}
    try{
      const parsed=JSON.parse(await selected.text());
      const incoming=await PKPortability.parseAny(parsed);
      // Extra safeguard: this page will not import a bundle of unresolved
      // local draft snapshots automatically.
      if(parsed.format==="pk-atlas-local-drafts-v1")throw Error("本机草稿包需要在原设备登录后交由自动同步恢复，不能批量覆盖云端");
      const latest=await req("/api/state");
      const pending=PKSyncCenter.summarize(drafts(),latest.state);
      if(draftAccessError||pending.needsAction)throw Error("检测到本机待处理/无法解析草稿或存储受限；先导出草稿并在首页完成同步再导入");
      const result=PKPortability.combine(latest.state,incoming,
        {nativeImport:parsed.exportSource==="iOS Journal 17.1"});
      if(JSON.stringify(result.state).length>7_000_000)throw Error("合并后的文件过大");
      pendingImport={state:result.state,version:latest.version,added:result.added};
      const text="文件："+selected.name+"；新增 "+result.added+" 项、跳过相同记录 "+
        result.skipped+" 项。"+(result.settingsRestored?
        "云端为空，将恢复文件中的模型设置。":"云端已有数据，保留当前模型设置。")+
        (result.settingsSkipped?" 导入文件中的个人参数不会覆盖现有参数。":"");
      $("dataImportPreview").textContent=text;
      $("dataImportPreview").dataset.kind="info";
      $("dataImportCommit").disabled=result.added===0&&!result.settingsRestored;
    }catch(e){
      $("dataImportPreview").textContent="预览失败："+e.message;
      $("dataImportPreview").dataset.kind="error";
    }
  }
  async function commit(){
    if(!pendingImport||!user)return;
    const plan=pendingImport;
    if(!confirm("将 "+importFileName+" 合并到账号 "+user+"，新增 "+plan.added+
                " 项。云端原有同 ID 记录不会被覆盖。确认继续吗？"))return;
    const button=$("dataImportCommit");button.disabled=true;
    try{
      const latest=await req("/api/state");
      const pending=PKSyncCenter.summarize(drafts(),latest.state);
      if(draftAccessError||pending.needsAction)throw Error("本机存在待处理草稿或无法读取存储，请先同步");
      if(latest.version!==plan.version)throw Error("云端版本已更新。请重新选择文件、重新预览");
      const sections=Object.fromEntries(PKPortability.SECTIONS.filter(k=>
        JSON.stringify(plan.state[k])!==JSON.stringify(latest.state[k])).map(k=>[k,plan.state[k]]));
      if(!Object.keys(sections).length){status("没有新的记录需要导入。");return}
      const response=await req("/api/state/sections","PUT",{version:latest.version,sections});
      const verified=await req("/api/state");
      if(verified.version!==response.version||PKPortability.SECTIONS.some(k=>
        JSON.stringify(verified.state[k])!==JSON.stringify(plan.state[k])))
        throw Error("服务器回读与导入版本不一致，请停止操作并检查云端");
      status("已完成云端合并并回读核对。请返回首页重新加载药时。");
      pendingImport=null;$("dataImportPreview").textContent="导入完成，建议立即下载一份新的完整备份。";
      await refresh();
    }catch(e){
      $("dataImportPreview").textContent="未能完成导入："+e.message+"。若云端已写入，请先重新读取状态核对。";
      $("dataImportPreview").dataset.kind="error";
      status("导入尚未通过回读确认。","error");
    }finally{button.disabled=true}
  }
  document.addEventListener("DOMContentLoaded",()=>{
    $("syncCenterCheck").addEventListener("click",()=>void refresh());
    $("exportFull").addEventListener("click",()=>void file("full-backup","full"));
    $("exportLegacy").addEventListener("click",()=>void file("legacy-compatible","legacy"));
    $("exportNativeJournal").addEventListener("click",()=>void file("ios-journal-17.1-original-import","native"));
    $("exportJournal").addEventListener("click",()=>void file("ios-journal-normalized","journal"));
    $("exportJournalCsv").addEventListener("click",()=>void file("ios-journal-normalized","csv","csv"));
    $("exportDrafts").addEventListener("click",saveDrafts);
    $("dataImportFile").addEventListener("change",e=>void preview(e));
    $("dataImportCommit").addEventListener("click",()=>void commit());
    void refresh();
  });
})();
