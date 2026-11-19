/* Pure, non-mutating per-browser draft/cloud comparison.
 * A section-level conflict is only a warning, never proof of record loss. */
(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.PKSyncCenter=api;
})(typeof window!=="undefined"?window:null,()=>{
  const SECTIONS=["records","courses","intakes","plans","settings"];
  const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  function classify(entry,cloud){
    const draft=entry?.draft;
    if(entry?.invalid||!draft||!draft.base||!draft.state||
       !Number.isInteger(draft.version))return {kind:"unreadable",changed:[]};
    const changed=SECTIONS.filter(k=>!equal(draft.base[k],draft.state[k]));
    if(!changed.length)return {kind:"unchanged",changed:[]};
    const conflicting=changed.filter(k=>!equal(cloud?.[k],draft.base[k])&&
                                            !equal(cloud?.[k],draft.state[k]));
    if(conflicting.length)return {kind:"possible_conflict",changed,conflicting};
    const pending=changed.filter(k=>!equal(cloud?.[k],draft.state[k]));
    if(pending.length)return {kind:"pending",changed,pending};
    return {kind:"already_in_cloud",changed};
  }
  function summarize(entries,cloud){
    const tally={pending:0,possible_conflict:0,already_in_cloud:0,unchanged:0,unreadable:0};
    const changed=new Set(),conflicting=new Set();
    const items=entries.map(entry=>{
      const row=classify(entry,cloud);
      tally[row.kind]++;
      for(const k of row.changed||[])changed.add(k);
      for(const k of row.conflicting||[])conflicting.add(k);
      return {key:entry.key,...row};
    });
    return {
      tally,items,
      total:entries.length,
      needsAction:tally.pending+tally.possible_conflict+tally.unreadable,
      changed:[...changed],conflicting:[...conflicting]
    };
  }
  return {SECTIONS,classify,summarize};
});
