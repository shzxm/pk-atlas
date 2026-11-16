/*
 * Disclosure and navigation controller. This is view-only state:
 * it never mutates medical records, model inputs, or cloud data.
 */
const VIEW_PREF_KEY = "pk-atlas-disclosures-v2";
function readDisclosurePreferences(){
  try{
    const value=JSON.parse(localStorage.getItem(VIEW_PREF_KEY)||"{}");
    return value&&typeof value==="object"&&!Array.isArray(value)?value:{};
  }catch{return {}}
}
function openDisclosure(id,focus=false){
  const target=$(id);
  if(!target||target.tagName!=="DETAILS")return false;
  target.open=true;
  try{
    const preferences=readDisclosurePreferences();
    preferences[id]=true;
    localStorage.setItem(VIEW_PREF_KEY,JSON.stringify(preferences));
  }catch{}
  requestAnimationFrame(()=>{
    target.scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth",block:"start"});
    if(focus)target.querySelector(":scope > summary")?.focus({preventScroll:true});
  });
  return true;
}
/**
 * Only presents values from the chart's probe. Does not calculate drug doses
 * or change cloud state.
 */
function renderReferenceGlance(values,time,mode){
  const box=$("referenceGlanceValues");
  if(!box)return;
  box.replaceChildren();
  $("referenceGlanceTime").textContent=chosen().name+" · "+dateText(time)+" · 群体模型估算";
  for(const [label,value,kind] of values){
    const item=document.createElement("div"),name=document.createElement("span"),amount=document.createElement("strong");
    item.className=kind+(kind==="reference"&&mode==="equivalent"?" equivalent-reference":"");
    name.textContent=label;amount.textContent=value;
    item.append(name,amount);box.append(item);
  }
}
/**
 * In-page navigation, not browser history. The OS-reserved iPhone Duo rail
 * belongs to Safari, so these controls stay within the web viewport.
 * No medication data is mutated by any of these actions.
 */
function edgeNavigate(action){
  const menu=$("edgeDockMenu");
  if(menu?.matches(":popover-open"))menu.hidePopover();
  if(!document.body.classList.contains("stage-calc"))return;
  if(action==="dates"){$("backToChooser").click();return}
  if(action==="top"){
    window.scrollTo({top:0,behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});
    return;
  }
  if(action==="history"){openDisclosure("historyGuide",true);return}
  const results=action==="timeline";
  if(action!=="records"&&!results)return;
  if(matchMedia("(max-width:700px)").matches)setMobilePane(results?"results":"records");
  requestAnimationFrame(()=>{
    const anchor=$(results?"chartTitle":"recordSection");
    anchor?.scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth",block:"start"});
  });
}
function initPresentation(){
  const saved=readDisclosurePreferences();
  $("edgeDockBack")?.addEventListener("click",()=>edgeNavigate("dates"));
  document.querySelectorAll("#edgeDockMenu [data-edge-action]").forEach(button=>{
    button.addEventListener("click",()=>edgeNavigate(button.dataset.edgeAction));
  });
  // Native popover provides Escape, light-dismiss and focus behavior.
  // On close, restore focus only when it was inside the dismissed menu.
  $("edgeDockMenu")?.addEventListener("beforetoggle",event=>{
    if(event.newState==="closed"&&event.target.contains(document.activeElement))
      $("edgeDockMore")?.focus({preventScroll:true});
  });

  document.querySelectorAll("details[data-pref]").forEach(details=>{
    // Native details leaves the content available to keyboard and assistive tech.
    if(saved[details.id||details.dataset.pref]===true)details.open=true;
    details.addEventListener("toggle",()=>{
      try{
        const key=details.id||details.dataset.pref;
        const value=readDisclosurePreferences();
        value[key]=details.open;
        localStorage.setItem(VIEW_PREF_KEY,JSON.stringify(value));
      }catch{}
    });
  });
  $("openAdvanced")?.addEventListener("click",()=>{
    if(matchMedia("(max-width:700px)").matches)setMobilePane("results",true);
    openDisclosure("advancedTools",true);
  });
  $("openHistory")?.addEventListener("click",()=>openDisclosure("historyGuide",true));
  // The primary add action remains available when the floating FAB yields
  // to the interactive chart and its mobile legend.
  $("chartAddDose")?.addEventListener("click",()=>{
    if(document.body.classList.contains("app-mode")){appOpenSheet("dose");return}
    if(matchMedia("(max-width:700px)").matches)setMobilePane("records");
    requestAnimationFrame(()=>{
      $("doseForm").scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth",block:"center"});
      $("doseAmount").focus({preventScroll:true});
    });
  });
  $("referenceGlanceEdit")?.addEventListener("click",()=>{
    const glance=$("referenceGlance");
    if(glance?.matches(":popover-open"))glance.hidePopover();
    if(matchMedia("(max-width:700px)").matches)setMobilePane("results");
    openDisclosure("advancedTools",true);
  });
  // Fold/unfold and Split View resize the content without navigation.
  // Observe content width to avoid re-rendering when Safari bars move.
  if(typeof ResizeObserver!=="undefined"){
    let lastWidth=0,pending=0;
    const chartResize=new ResizeObserver(entries=>{
      const width=Math.round(entries[0]?.contentRect?.width||0);
      if(!width||Math.abs(width-lastWidth)<2)return;
      lastWidth=width;
      clearTimeout(pending);
      pending=setTimeout(()=>{
        if(!document.body.classList.contains("stage-calc"))return;
        if(matchMedia("(max-width:700px)").matches&&document.body.dataset.mobilePane!=="results")return;
        if(!$("chartWrap").hidden)drawChart();
      },160);
    });
    chartResize.observe($("chartWrap"));
  }
  if(typeof IntersectionObserver!=="undefined"){
    const visibility=new IntersectionObserver(entries=>{
      const visible=entries.some(entry=>entry.isIntersecting);
      document.body.classList.toggle("chart-onscreen",
        visible&&matchMedia("(max-width:700px)").matches&&document.body.dataset.mobilePane==="results");
    },{threshold:0.18});
    visibility.observe(document.querySelector(".chart-panel"));
  }

  $("dailyChartsGuide")?.addEventListener("toggle",event=>{
    if(event.target.open&&document.body.classList.contains("stage-calc"))
      requestAnimationFrame(()=>renderDay());
  });
  document.querySelectorAll(".view-quicknav a[data-view-pane]").forEach(link=>{
    link.addEventListener("click",event=>{
      const pane=link.dataset.viewPane;
      if(!matchMedia("(max-width:700px)").matches)return;
      event.preventDefault();
      setMobilePane(pane,true);
      const target=document.querySelector(link.getAttribute("href"));
      requestAnimationFrame(()=>target?.scrollIntoView({behavior:"smooth",block:"start"}));
    });
  });
}
