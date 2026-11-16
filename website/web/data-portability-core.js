/* Safe, reversible data interchange. Pure helpers are also tested in Node. */
(function(root, factory) {
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.PKPortability=api;
})(typeof window!=="undefined"?window:null,()=> {
  const SECTIONS=["records","courses","intakes","plans","settings"];
  const isObject=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
  const clone=v=>JSON.parse(JSON.stringify(v));
  const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const normalize=input=>{
    if(!isObject(input))throw Error("文件内容必须是 JSON 对象");
    let state;
    if(input.format==="pk-atlas-ios-journal-17.1-normalized-v1"){
      if(!Array.isArray(input.records))throw Error("历史归档缺少 records");
      if(input.records.some(r=>r?.source!=="ios-journal-17.1"||!isObject(r.journal)))
        throw Error("历史归档包含不属于 iOS Journal 17.1 的记录");
      state={records:input.records};
    }else if(isObject(input.state)){
      state=input.state; // Existing site's draft exports also use this shape.
    }else if(Array.isArray(input.records)){
      state=input;
    }else throw Error("不能识别文件格式：支持完整备份、旧版药时 JSON 和本站 iOS Journal 归档");
    const data={
      records:state.records||[],courses:state.courses||[],
      intakes:state.intakes||[],plans:state.plans||{},settings:state.settings||{}
    };
    if(!Array.isArray(data.records)||data.records.length>10000||
       !Array.isArray(data.courses)||data.courses.length>3000||
       !Array.isArray(data.intakes)||data.intakes.length>10000||
       !isObject(data.plans)||!isObject(data.settings))throw Error("记录分区结构或数量不符合要求");
    if(data.records.some(r=>!isObject(r)||typeof r.id!=="string"||r.id.length>160||
       typeof r.drug!=="string"||r.drug.length>160||r.drug.length===0||
       !Number.isFinite(r.time)||!Number.isFinite(r.mg)||r.mg<=0||
       (r.source==="ios-journal-17.1"&&(!isObject(r.journal)||typeof r.journal.substanceName!=="string"))))
      throw Error("含有无效服药记录（时间、剂量、原导入信息或记录 ID）");
    if(data.intakes.some(r=>!isObject(r)||typeof r.id!=="string"||
       !Number.isFinite(r.time)||!["meal","drink"].includes(r.kind)))
      throw Error("饮食记录格式无效");
    if(data.courses.some(r=>!isObject(r)||typeof r.id!=="string"||!Number.isFinite(r.start)))
      throw Error("周期记录格式无效");
    if(JSON.stringify(data).length>7_000_000)throw Error("数据过大，超过单次导入安全限制");
    return clone(data);
  };
  // Exact JSON shape accepted by the original import_ios_journal.py script:
  // {"exportSource":"iOS Journal 17.1","experiences":[
  //   {"title":"...","ingestions":[{substanceName,time,dose,units,
  //      administrationRoute,isDoseAnEstimate,...}]}]}.
  // One experience per archived ingestion preserves titles without making up
  // any unknown original experience metadata or original grouping.
  const makeNativeJournal=state=>({
    exportSource:"iOS Journal 17.1",
    experiences:makeJournal(state).records.map(r=>({
      title:String(r.journal.experienceTitle||""),
      ingestions:[{
        substanceName:r.journal.substanceName,
        time:r.time,dose:r.mg,units:"mg",
        administrationRoute:r.journal.administrationRoute,
        isDoseAnEstimate:r.journal.isDoseAnEstimate===true,
        estimatedDoseStandardDeviation:r.journal.estimatedDoseStandardDeviation??null,
        stomachFullness:r.journal.stomachFullness??null
      }]
    }))
  });
  const parseAny=async input=>{
    if(input?.exportSource!=="iOS Journal 17.1")return normalize(input);
    if(!Array.isArray(input.experiences)||input.experiences.length>10000)
      throw Error("原生 iOS Journal 17.1 文件缺少 experiences 或条目过多");
    if(!globalThis.crypto?.subtle)throw Error("此浏览器需要 HTTPS 才能解析原生导入文件");
    const records=[],seen=new Set();
    for(const experience of input.experiences){
      if(!isObject(experience)||!Array.isArray(experience.ingestions))throw Error("原生体验记录格式无效");
      for(const ingestion of experience.ingestions){
        if(!isObject(ingestion)||typeof ingestion.substanceName!=="string"||
          !ingestion.substanceName||ingestion.substanceName.length>140||
          !Number.isSafeInteger(ingestion.time)||typeof ingestion.dose!=="number"||
          !Number.isFinite(ingestion.dose)||ingestion.dose<=0||
          ingestion.units!=="mg"||ingestion.administrationRoute!=="ORAL")
          throw Error("原生文件中存在无法可靠映射的摄入记录（原导入器仅接受口服 mg）");
        const name=ingestion.substanceName;
        const seed="iOS Journal 17.1|"+name+"|"+ingestion.time+"|"+ingestion.dose;
        const bytes=new TextEncoder().encode(seed);
        const digest=await globalThis.crypto.subtle.digest("SHA-256",bytes);
        const id="journal17-"+[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,"0")).join("").slice(0,24);
        if(seen.has(id))throw Error("原生导入文件包含重复的摄入事件");
        seen.add(id);
        const parts=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Shanghai",
          year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(ingestion.time));
        const ymd=Object.fromEntries(parts.filter(p=>["year","month","day"].includes(p.type))
          .map(p=>[p.type,p.value]));
        const day=ymd.year+"-"+ymd.month+"-"+ymd.day;
        const supported=name==="Pregabalin";
        const journal={
          substanceName:name,administrationRoute:"ORAL",
          isDoseAnEstimate:ingestion.isDoseAnEstimate===true,
          estimatedDoseStandardDeviation:ingestion.estimatedDoseStandardDeviation??null,
          stomachFullness:ingestion.stomachFullness??null,
          experienceTitle:String(experience.title||"")
        };
        if(!supported)journal.reviewStatus="unsupportedModel";
        records.push({id,courseId:"day-"+day,
          drug:supported?"pregabalin":"journal:"+name.toLowerCase().replaceAll(" ","-"),
          time:ingestion.time,mg:ingestion.dose,unit:"mg",
          source:"ios-journal-17.1",journal});
        if(records.length>10000)throw Error("导入记录超过上限");
      }
    }
    return normalize({records});
  };
  const combine=(existing,incoming,options={})=>{
    const current=normalize(existing),other=normalize(incoming);
    let added=0,skipped=0;
    const combined={...current};
    for(const key of ["records","courses","intakes"]){
      const ids=new Map(current[key].map(r=>[r.id,r]));
      if(ids.size!==current[key].length)throw Error("当前云端存在重复记录 ID，停止导入");
      for(const sourceItem of other[key]){
        let item=sourceItem;
        // Exactly preserve the original importer duplicate-review rule:
        // same supported drug, within five minutes, same dose as a site's
        // previously entered record. The imported row must not be counted
        // twice in concentration curves until manually reviewed.
        if(options.nativeImport&&key==="records"&&item.drug==="pregabalin"&&!ids.has(item.id)){
          const near=current.records.filter(old=>old.source!=="ios-journal-17.1"&&
            old.drug==="pregabalin"&&Number.isFinite(old.time)&&Number.isFinite(old.mg)&&
            Math.abs(old.time-item.time)<=5*60000&&Math.abs(old.mg-item.mg)<.001)
            .sort((a,b)=>Math.abs(a.time-item.time)-Math.abs(b.time-item.time));
          if(near.length)item={...item,drug:"journal:pregabalin-review",
            journal:{...item.journal,targetDrug:"pregabalin",reviewStatus:"possibleDuplicate",
              nearExistingTime:near[0].time,nearExistingDose:near[0].mg}};
        }
        if(ids.has(item.id)){
          if(!equal(ids.get(item.id),item)&&!(options.nativeImport&&
             item.source==="ios-journal-17.1"&&ids.get(item.id)?.source==="ios-journal-17.1"))
            throw Error("记录 ID 冲突："+item.id+"。为避免覆盖已修改的数据，导入已取消。");
          skipped++;
        }else{
          ids.set(item.id,item);added++;
        }
      }
      combined[key]=[...ids.values()];
    }
    // Never overwrite existing configurations or accepted dose plans.
    combined.plans={...current.plans};
    for(const [key,val] of Object.entries(other.plans)){
      if(key==="__proto__"||key==="constructor"||key==="prototype")throw Error("导入的方案键名无效");
      if(Object.hasOwn(combined.plans,key)&&!equal(combined.plans[key],val))
        throw Error("方案配置冲突："+key+"。请先备份并人工核对。");
      if(!Object.hasOwn(combined.plans,key)){combined.plans[key]=val;added++}
    }
    // When restoring onto an empty account, also restore the complete
    // settings tree (adopted plans, renal settings, editor drafts, etc).
    // On populated accounts, retain the current settings, without silent
    // replacement of current adopted medication scenarios.
    const accountIsEmpty=current.records.length===0&&current.courses.length===0&&
      current.intakes.length===0&&Object.keys(current.plans).length===0&&
      Object.keys(current.settings).length===0;
    const settingsRestored=accountIsEmpty;
    combined.settings=settingsRestored?clone(other.settings):clone(current.settings);
    if(combined.records.length>10000||combined.courses.length>3000||combined.intakes.length>10000)
      throw Error("合并后的记录超过账号上限");
    return {state:combined,added,skipped,settingsRestored,
      settingsSkipped:!settingsRestored&&Object.keys(other.settings).length>0};
  };
  const makeFull=(state,meta={})=>({
    format:"pk-atlas-full-backup-v1",exportedAt:new Date().toISOString(),
    username:String(meta.username||""),cloudVersion:meta.version??null,
    cloudConfirmed:meta.confirmed===true,
    state:normalize(state)
  });
  const makeLegacy=state=>normalize(state); // Exact five-section website data.
  const makeJournal=state=>({
    format:"pk-atlas-ios-journal-17.1-normalized-v1",
    description:"本站已导入的 iOS Journal 17.1 标准化历史记录；不等于原 App 原生导出文件。",
    exportedAt:new Date().toISOString(),
    records:normalize(state).records.filter(r=>r.source==="ios-journal-17.1")
  });
  const csvCell=value=>'"'+String(value??"").replaceAll('"','""')+'"';
  const makeJournalCsv=state=>{
    const cols=["id","source","drug","time","timeISO","mg","unit","courseId","substanceName",
      "administrationRoute","stomachFullness","isDoseAnEstimate",
      "estimatedDoseStandardDeviation","experienceTitle","journalJSON"];
    const rows=makeJournal(state).records.map(r=>{
      const j=r.journal||{};
      const obj={...r,...j,timeISO:new Date(r.time).toISOString(),
        journalJSON:JSON.stringify(j)};
      return cols.map(k=>csvCell(obj[k])).join(",");
    });
    return "\uFEFF"+[cols.map(csvCell).join(","),...rows].join("\r\n")+"\r\n";
  };
  return {SECTIONS,normalize,parseAny,combine,makeFull,makeLegacy,makeJournal,makeJournalCsv,makeNativeJournal};
});
