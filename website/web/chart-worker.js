"use strict";
// All curve sampling happens in this browser's Worker. No user record or
// pharmacokinetic calculation request is sent to the 181 API.
self.localStorage={getItem:()=>null,setItem:()=>{}};
self.PKApi={};
importScripts("./app.js?v=web-curve-union-20261121c");
self.onmessage=event=>{
  const {id,drugId,times,records,planned,meals,renalState,modelCatalog}=event.data;
  try {
    if(modelCatalog){
      if(modelCatalog.engineVersion!==PK_MODEL_ENGINE_VERSION||
         !Array.isArray(modelCatalog.catalog?.drugs)||!modelCatalog.catalog?.food)
        throw new Error("本地模型版本已更新，请刷新网页");
      DRUGS.splice(0,DRUGS.length,...modelCatalog.catalog.drugs);
      for(const key of Object.keys(FOOD_INFO))delete FOOD_INFO[key];
      Object.assign(FOOD_INFO,modelCatalog.catalog.food);
    }
    current=drugId;
    intakes=safeIntakes(meals);
    renal=safeRenal(renalState);
    mealMatchCache.clear();MODEL_PARAMS.clear();EQUIVALENT_PEAK_CACHE.clear();
    const drug=DRUGS.find(item=>item.id===drugId);
    if(!drug||drug.recordOnly)throw new Error("该药物没有单一血药曲线模型");
    if(!Array.isArray(times)||times.length>801||!Array.isArray(records)||!Array.isArray(planned))
      throw new Error("曲线计算参数格式有误");
    const points=times.map(t=>{
      const c=concentration(drug,t,records);
      const unfed=concentration(drug,t,records,false);
      const eq=totalEquivalent(drug,t,records);
      const preview=planned.length>0;
      return {t,c,unfed,eq,
        eqPreview:preview?eq+totalEquivalent(drug,t,planned):null,
        bloodPreview:preview?c+concentration(drug,t,planned):null,
        unfedBloodPreview:preview?unfed+concentration(drug,t,planned,false):null};
    });
    self.postMessage({id,engineVersion:PK_MODEL_ENGINE_VERSION,points});
  }catch(error){self.postMessage({id,error:String(error?.message||error)})}
};
