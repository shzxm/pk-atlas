"use strict";
// One request path for the journal, shortcut panel, and notification settings.
window.PKApi = Object.freeze({
  async request(path, method="GET", body, options={}) {
    const controller=new AbortController();
    // Avoid changing the historic timeout of long-running model endpoints.
    // The autosave synchronizer explicitly opts into a bounded 16s timeout.
    const limit=Number.isFinite(options.timeoutMs)&&options.timeoutMs>0?options.timeoutMs:0;
    const timer=limit?setTimeout(()=>controller.abort(),limit):null;
    let response;
    try{
      response=await fetch(path, {
        method, credentials:"same-origin", cache:"no-store",
        headers:body ? {"Content-Type":"application/json"} : {},
        body:body ? JSON.stringify(body) : undefined,
        signal:controller.signal
      });
    }catch(error){
      if(error.name==="AbortError")throw new Error("请求超时，请检查网络后重试");
      throw error;
    }finally{if(timer!==null)clearTimeout(timer)}
    const result = await response.json().catch(() => ({error:"服务返回无效数据"}));
    if (!response.ok) {
      const error = new Error(result.error || `请求失败 (${response.status})`);
      error.status = response.status;
      error.data = result;
      throw error;
    }
    return result;
  }
});
