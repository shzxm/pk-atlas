function renderDay(){
  $("viewDate").value=selectedDate;
  const coursesBox=$("dayCourseList"),charts=$("dayCharts"),summary=$("daySummary");
  coursesBox.replaceChildren();charts.replaceChildren();summary.replaceChildren();
  const today=records.filter(r=>dateKey(r.time)===selectedDate),confirmedToday=today.filter(r=>!isJournalReview(r)),pendingToday=today.filter(r=>r.journal?.reviewStatus==="possibleDuplicate"),totals=dayDrugTotals(today);
  if(confirmedToday.length){
    const headline=document.createElement("div"),count=document.createElement("strong"),label=document.createElement("span");
    count.textContent=`${confirmedToday.length} 次服用`;label.textContent=`${totals.length} 种药物 · 所选日期总计`;
    headline.append(count,label);summary.append(headline);
    const byDrug=document.createElement("div");byDrug.className="day-summary-drugs";
    for(const total of totals){const item=document.createElement("span");item.textContent=`${total.name} · ${total.count} 次 · ${fmt(total.mg,3)} mg`;byDrug.append(item)}
    summary.append(byDrug);
  }else{const empty=document.createElement("strong");empty.textContent="当天没有已确认服用";summary.append(empty)}
  if(pendingToday.length){const notice=document.createElement("span");notice.className="day-summary-review";notice.textContent=`另有 ${pendingToday.length} 条导入记录待核对，暂不计入曲线与总数`;summary.append(notice)}
  for(const total of totals){
    const button=document.createElement("button"),strong=document.createElement("strong"),small=document.createElement("small");
    button.type="button";button.className=`day-course${total.drug===current?" active":""}`;
    strong.textContent=total.name;small.textContent=`${total.count} 次 · ${fmt(total.mg,3)} mg${DRUGS.some(d=>d.id===total.drug&&!d.recordOnly)?"":" · 暂无曲线模型"}`;
    button.append(strong,small);
    button.onclick=()=>{if(DRUGS.some(d=>d.id===total.drug)){current=total.drug;$("drug").value=current;renderDrug()}if(document.body.classList.contains("app-mode"))appSetView("chart");else{setMobilePane("records");$("recordSection").scrollIntoView({behavior:"smooth",block:"start"})}};
    coursesBox.append(button);
  }
  const add=document.createElement("button");add.type="button";add.className="secondary day-add";add.textContent="＋ 新增这一天的服用";add.onclick=()=>{if(document.body.classList.contains("app-mode"))appOpenSheet("dose");else{setMobilePane("records");$("doseForm").scrollIntoView({behavior:"smooth",block:"center"});$("doseAmount").focus()}};coursesBox.append(add);
  $("referenceDrugHint").textContent=`当前药物：${chosen().name}`;
  // Do not calculate or draw six extra charts while the optional overview is closed.
  // The disclosure toggle calls renderDay() once, when the user opens it.
  if(!$("dailyChartsGuide").open)return;
  const series=DRUGS.filter(d=>!d.recordOnly).map(d=>daySeries(d,selectedDate)).filter(s=>s.doses.length||s.points.some(p=>p.c>=.001||p.eq>=.1));
  if(series.length>1){
    const card=document.createElement("div");card.className="day-chart-card day-chart-overview";
    const title=document.createElement("h3");title.textContent="所有可建模药物 · 同图分线概览";
    const sub=document.createElement("p");sub.textContent="每条线是对应药物的血药浓度（mg/L），已计入适用的饮食修正；不同药物浓度不能直接相加。";
    const svg=svgEl("svg",{role:"img","aria-label":`${selectedDate} 多药物浓度分线概览`});
    const legend=document.createElement("div");legend.className="day-chart-legend";
    for(const s of series){const item=document.createElement("span"),dot=document.createElement("i");dot.style.borderTopColor=DRUG_COLORS[s.drug.id];item.append(dot,document.createTextNode(`${s.drug.name}血药浓度`));legend.append(item)}
    card.append(title,sub,svg,legend);charts.append(card);drawDaySvg(svg,series,true);
  }
  if(series.length){
    const grid=document.createElement("div");grid.className="day-chart-grid";charts.append(grid);
    for(const s of series){
      const card=document.createElement("div");card.className="day-chart-card";
      const title=document.createElement("h3");title.textContent=s.drug.name;
      const meta=document.createElement("p");meta.textContent=`彩色实线：血药浓度（mg/L）${s.hasFoodEffect?" · 灰色虚线：不计饮食的参考曲线":""} · 已计入此前同药记录`;
      const stats=document.createElement("div");stats.className="day-chart-stats";
      const addStat=(label,value)=>{const item=document.createElement("div"),small=document.createElement("small"),strong=document.createElement("strong");small.textContent=label;strong.textContent=value;item.append(small,strong);stats.append(item)};
      const start=s.points[0],end=s.points.at(-1),doseMg=s.doses.reduce((sum,r)=>sum+r.mg,0);
      addStat("当天已记服用",s.doses.length?`${s.doses.length} 次 · ${fmt(doseMg,3)} mg`:"无新服用 · 仅历史残留");
      addStat("血药浓度 00:00 → 24:00",`${fmt(start.c,3)} → ${fmt(end.c,3)} mg/L`);
      addStat("剂量等效 00:00 → 24:00",`${fmt(start.eq,1)} → ${fmt(end.eq,1)} mg`);
      const svg=svgEl("svg",{role:"img","aria-label":`${selectedDate} ${s.drug.name}估算血药浓度曲线`});
      const button=document.createElement("button");button.type="button";button.className="ghost";button.textContent=`查看${s.drug.name}记录`;button.onclick=()=>{current=s.drug.id;activeCourseId="";$("drug").value=current;renderDrug();if(document.body.classList.contains("app-mode"))appSetView("chart");else{setMobilePane("records");$("recordSection").scrollIntoView({behavior:"smooth",block:"start"})}};
      card.append(title,meta,stats,svg,button);grid.append(card);drawDaySvg(svg,[s]);
    }
  }
  const archived=totals.filter(total=>!DRUGS.some(d=>d.id===total.drug&&!d.recordOnly));
  for(const total of archived){const card=document.createElement("div"),title=document.createElement("h3"),note=document.createElement("p"),button=document.createElement("button");card.className="day-chart-card day-archive-card";title.textContent=`${total.name} · 仅记录`;note.textContent=`当天 ${total.count} 次 · 合计 ${fmt(total.mg,3)} mg。本站暂无该药经核对的药代模型，因此只显示原始记录，不绘制估算曲线。`;button.type="button";button.className="ghost";button.textContent="查看导入记录";button.onclick=()=>{if(document.body.classList.contains("app-mode"))appSetView("history");else{setMobilePane("records");$("recordSection").scrollIntoView({behavior:"smooth",block:"start"})}};card.append(title,note,button);charts.append(card)}
  if(!series.length&&!archived.length){const note=document.createElement("div");note.className="day-empty";note.textContent=pendingToday.length?"待核对的导入记录暂未计入曲线；请在下方记录列表确认。":"这一天以前还没有可计算的服药记录。";charts.append(note)}
}
function renderHistory(){
  const box=$("historyList");box.replaceChildren();
  if(!records.length&&!intakes.length){box.textContent="尚无服用或饮食历史。";return}
  const dates=[...new Set([...records,...intakes].map(r=>dateKey(r.time)))].sort().reverse();
  dates.forEach(key=>{
    const dayRows=records.filter(r=>dateKey(r.time)===key),dayIntakes=intakes.filter(x=>dateKey(x.time)===key);
    const card=document.createElement("button");card.type="button";card.className="history-card";
    const title=document.createElement("strong");title.textContent=key;
    const details=document.createElement("small");details.textContent=`${dayRows.filter(r=>!isJournalReview(r)).length} 次服用${dayRows.some(r=>r.journal?.reviewStatus==="possibleDuplicate")?` · ${dayRows.filter(r=>r.journal?.reviewStatus==="possibleDuplicate").length} 条待核对`:""} · ${dayIntakes.length} 条饮食`;
    const names=document.createElement("span");names.textContent=dayDrugTotals(dayRows).map(x=>x.name).join(" · ")||"无药物记录";
    card.append(title,details,names);
    card.onclick=()=>{selectedDate=key;selectedDateFollowsToday=key===dateKey(Date.now());activeCourseId="";resetDoseEdit();renderDrug();$("viewDate").scrollIntoView({behavior:"smooth",block:"start"})};
    box.append(card);
  });
}
