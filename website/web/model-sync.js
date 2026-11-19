"use strict";
/* Server-owned, data-only mathematical PK catalog. This public data is never
 * executed as downloaded JavaScript. The application and Worker keep their
 * reviewable, version-pinned local algorithm implementations.
 */
const PK_MODEL_CACHE_KEY="pk-atlas-verified-math-model-v1";
const PK_MODEL_CHECK_MS=5*60*1000;
let PKVerifiedWebCatalog=null,pkModelCheckRunning=false,pkModelLastCheck=0;
let pkModelStatus="正在核对 181 权威数学模型";
function pkModelSetStatus(message){
  pkModelStatus=message;
  let node=document.getElementById("modelSyncStatus");
  if(!node){
    const parent=document.getElementById("accountName")?.parentElement;
    if(parent){
      node=document.createElement("small");
      node.id="modelSyncStatus";node.role="status";
      node.style.fontSize="11px";node.style.opacity=".86";
      parent.append(node);
    }
  }
  if(node)node.textContent=message;
}
function pkModelValidURL(value){
  if(value===undefined||value===null)return true;
  if(typeof value!=="string"||value.length>2000)return false;
  try{const u=new URL(value);return u.protocol==="https:"&&!u.username&&!u.password}catch{return false}
}
function pkModelValidateCatalog(catalog){
  if(!catalog||!Array.isArray(catalog.drugs)||!catalog.food||
      typeof catalog.food!=="object"||Array.isArray(catalog.food)||
      catalog.drugs.length<1||catalog.drugs.length>500||
      Object.keys(catalog.food).length>500)throw Error("药物目录格式无效");
  const ids=new Set(),prior=new Set(DRUGS.map(d=>d.id));
  for(const d of catalog.drugs){
    if(!d||typeof d.id!=="string"||!/^[a-z][a-z0-9_]{0,47}$/.test(d.id)||
       ids.has(d.id)||typeof d.name!=="string"||!d.name||d.name.length>100||
       !pkModelValidURL(d.url)||String(d.note||"").length>2500||
       String(d.source||"").length>250)throw Error("药物标识或来源不合法");
    ids.add(d.id);
    if(d.recordOnly!==true){
      for(const [key,min,max] of [["refDose",.00001,1e6],["cmax",1e-9,1e6],
                                 ["tmax",.005,240],["halfLife",.01,1e5]]){
        if(!Number.isFinite(d[key])||d[key]<min||d[key]>max)
          throw Error("药物模型参数数值无效");
      }
    }
  }
  for(const id of prior)if(!ids.has(id))throw Error("权威目录不能删除历史药物 "+id);
  for(const [id,info] of Object.entries(catalog.food)){
    if(!ids.has(id)||!info||typeof info!=="object"||
       !pkModelValidURL(info.url))throw Error("饮食模型结构无效");
    for(const variant of [info.fed,info.fed?.highFat]){
      if(!variant)continue;
      if(!Array.isArray(variant.parts)||variant.parts.length<1||variant.parts.length>16||
         variant.parts.some(p=>!Number.isFinite(p.tmax)||p.tmax<=0||p.tmax>240||
                               !Number.isFinite(p.weight)||p.weight<0||p.weight>1)||
         Math.abs(variant.parts.reduce((v,p)=>v+p.weight,0)-1)>.03||
         (variant.aucRatio!==undefined&&(!Number.isFinite(variant.aucRatio)||
                                         variant.aucRatio<=0||variant.aucRatio>5)))
        throw Error("饮食吸收模型参数无效");
    }
  }
  return catalog;
}
async function pkModelVerifyPackage(pkg){
  if(!pkg||pkg.schemaVersion!==1||pkg.maxSupportedClientSchema<1||
     typeof pkg.engineVersion!=="string"||
     pkg.engineVersion!==PK_MODEL_ENGINE_VERSION)
     throw Error("服务器公式版本与当前网页不兼容，请完整刷新网页");
  if(typeof pkg.catalogBase64!=="string"||pkg.catalogBase64.length>750000||
     !/^[a-f0-9]{64}$/.test(pkg.catalogVersion||"")||
     !globalThis.crypto?.subtle)throw Error("模型校验条件不完整");
  const binary=atob(pkg.catalogBase64);
  if(!binary||binary.length>512*1024)throw Error("模型目录大小超限");
  const bytes=Uint8Array.from(binary,ch=>ch.charCodeAt(0));
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),
     b=>b.toString(16).padStart(2,"0")).join("");
  if(hash!==pkg.catalogVersion)throw Error("181 模型目录 SHA-256 校验失败");
  const catalog=pkModelValidateCatalog(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes)));
  return{catalog,version:hash,engineVersion:pkg.engineVersion};
}
function pkModelRefreshSelectors(){
  for(const [id,style] of [["drug","long"],["calcDrug","short"],["planDrug","short"]]){
    const target=document.getElementById(id);if(!target)continue;
    const selected=target.value;
    target.replaceChildren(...DRUGS.map(d=>{
      const option=document.createElement("option");
      option.value=d.id;option.textContent=style==="long"?d.name+" · "+(d.en||d.id):d.name;
      return option;
    }));
    target.value=DRUGS.some(d=>d.id===selected)?selected:current;
  }
}
function pkModelActivateVerified(verified){
  if(PKVerifiedWebCatalog?.version===verified.version)return false;
  DRUGS.splice(0,DRUGS.length,...verified.catalog.drugs);
  for(const id of Object.keys(FOOD_INFO))delete FOOD_INFO[id];
  Object.assign(FOOD_INFO,verified.catalog.food);
  mealMatchCache.clear();MODEL_PARAMS.clear();EQUIVALENT_PEAK_CACHE.clear();
  if(typeof pkServerCurveClear==="function")pkServerCurveClear();
  if(typeof cancelPointInverse==="function")cancelPointInverse();
  pointScenario=null;minimumPointScenario=null;appliedPointScenario=null;
  PKVerifiedWebCatalog=verified;
  pkModelRefreshSelectors();
  if(document.body.classList.contains("stage-calc")&&typeof renderDrug==="function")renderDrug();
  return true;
}
async function pkModelRefresh(force=false){
  if(pkModelCheckRunning||!globalThis.crypto?.subtle)return;
  if(!force&&Date.now()-pkModelLastCheck<PK_MODEL_CHECK_MS)return;
  pkModelLastCheck=Date.now();pkModelCheckRunning=true;
  try{
    const response=await fetch("/api/native/model",{cache:"no-store",credentials:"omit",
      headers:{"Accept":"application/json"}});
    if(!response.ok)throw Error("服务器模型接口 HTTP "+response.status);
    const payload=await response.json();
    const checked=await pkModelVerifyPackage(payload);
    const updated=pkModelActivateVerified(checked);
    try{localStorage.setItem(PK_MODEL_CACHE_KEY,JSON.stringify(payload))}catch{}
    pkModelSetStatus("181 权威数学模型 "+checked.version.slice(0,12)+
      (updated?" · 已自动更新":" · 已是最新版")+" · 离线可用");
  }catch(error){
    pkModelSetStatus("181 模型同步未完成，继续使用本机模型："+String(error.message||error).slice(0,100));
  }finally{pkModelCheckRunning=false}
}
async function pkModelBoot(){
  try{
    const cached=localStorage.getItem(PK_MODEL_CACHE_KEY);
    if(cached)pkModelActivateVerified(await pkModelVerifyPackage(JSON.parse(cached)));
    if(PKVerifiedWebCatalog)
      pkModelSetStatus("已恢复校验通过的数学模型 "+PKVerifiedWebCatalog.version.slice(0,12)+" · 离线可用");
  }catch{pkModelSetStatus("正在核对 181 权威数学模型")}
  if(navigator.onLine)void pkModelRefresh(true);
}
if(typeof document!=="undefined"){
  document.addEventListener("visibilitychange",()=>{
    if(document.visibilityState==="visible")void pkModelRefresh();
  });
  window.addEventListener("pageshow",()=>void pkModelRefresh());
  window.addEventListener("online",()=>void pkModelRefresh(true));
  window.setInterval(()=>{if(document.visibilityState==="visible")void pkModelRefresh()},
                     PK_MODEL_CHECK_MS);
  pkModelSetStatus(pkModelStatus);
  void pkModelBoot();
}
