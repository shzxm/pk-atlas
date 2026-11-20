"use strict";

// The inverse search is CPU intensive. Run the same model code off the UI thread.
self.localStorage={getItem:()=>null,setItem:()=>{}};
self.PKApi={};
importScripts("./app.js?v=web-start-initial-20261120e");

self.onmessage=event=>{
  const {id,kind="point",drugId,rows:givenRows,plan,meals,renalState,threshold,target,cap,now,fixedCount,mode,peakFloor,start,hours,countText,cycleFloor,peakRequirement,totalCap:rawTotalCap,targetWindow,initialBaseline}=event.data;
  try{
    const remote=event.data.modelCatalog;
    if(remote){
      if(remote.engineVersion!==PK_MODEL_ENGINE_VERSION||
         !Array.isArray(remote.catalog?.drugs)||
         !remote.catalog?.food||typeof remote.version!=="string")
        throw new Error("网页数学模型与计算 Worker 版本不一致，请刷新页面");
      DRUGS.splice(0,DRUGS.length,...remote.catalog.drugs);
      for(const name of Object.keys(FOOD_INFO))delete FOOD_INFO[name];
      Object.assign(FOOD_INFO,remote.catalog.food);
    }
    current=drugId;
    plans={[drugId]:plan||{}};
    intakes=safeIntakes(meals);
    renal=safeRenal(renalState);
    mealMatchCache.clear();MODEL_PARAMS.clear();EQUIVALENT_PEAK_CACHE.clear();
    const drug=DRUGS.find(item=>item.id===drugId);
    if(!drug||drug.recordOnly)throw new Error("不支持当前药物的反算");
    if(!Array.isArray(givenRows))throw new Error("服用记录输入格式无效");
    let rows=givenRows,initialHypothesis=null;
    if(kind==="point"){
      const hasStart=rows.some(item=>!item.planningOnly&&item.drug===drugId&&
        Number.isFinite(item.time)&&item.time<=now&&item.time>=now-residualWindowHours(drug)*3600000);
      const currentlyAbove=modelValue(drug,now,rows,mode)>=threshold-1e-6;
      if(!hasStart&&!currentlyAbove){
        if(initialBaseline==null){
          self.postMessage({id,result:{reason:"initialBaselineRequired"},minimum:null});return;
        }
        if(initialBaseline.mode!==mode||!Number.isFinite(initialBaseline.value)||initialBaseline.value<=0||initialBaseline.value>1000000){
          self.postMessage({id,result:{reason:"initialBaselineInvalid"},minimum:null});return;
        }
        initialHypothesis=pkInitialHypothesis(drug,now,mode,initialBaseline.value);
        if(!initialHypothesis){
          self.postMessage({id,result:{reason:"initialBaselineInvalid"},minimum:null});return;
        }
        rows=[...givenRows,initialHypothesis];
      }
    }
    if(kind==="duration"){
      const result=solveInverse(drug,rows,threshold,start,hours,now,mode,countText);
      let display=null;
      if(result?.doses){
        const end=start+hours*3600000,combined=[...rows,...result.doses];
        display={...result,modeled:modelValue(drug,end,combined,mode),minLevel:result.minConcentration,peakEquivalent:pointEquivalentPeak(drug,rows,result.doses,start,end),bloodAtTarget:concentration(drug,end,combined),equivalentAtTarget:totalEquivalent(drug,end,combined)};
      }
      self.postMessage({id,result,display});return;
    }
    const cycle=cycleFloor||{value:0,mode:"blood"};
    const peak=peakRequirement||{value:Number(peakFloor)||0,mode:"equivalent"};
    if(!["blood","equivalent"].includes(cycle.mode)||!["blood","equivalent"].includes(peak.mode)||
       ![cycle.value,peak.value].every(v=>Number.isFinite(v)&&v>=0&&v<=1000000))
      throw new Error("反算约束单位或数值不合法");
    const totalCap=rawTotalCap===undefined||rawTotalCap===null?Infinity:Number(rawTotalCap);
    if(totalCap!==Infinity&&(!Number.isFinite(totalCap)||totalCap<=0||totalCap>1000000))
      throw new Error("周期累计新增剂量上限无效");
    const equivPeak=peak.mode==="equivalent"?peak.value:0;
    // Existing bounded search remains the first stage. The second stage
    // enforces BOTH independently sampled metrics before publishing results.
    let result=fixedCount?
      solveFixedContinuousPoint(drug,rows,threshold,target,cap,now,fixedCount,mode,equivPeak):
      solveContinuousPoint(drug,rows,threshold,target,cap,now,mode);
    const initialCandidate=result&&!result.reason?structuredClone(result):null;
    if(!fixedCount&&equivPeak>0)
      result=applyAutomaticPointPeakFloor(drug,rows,result,threshold,target,cap,now,mode,equivPeak);
    result=enforcePointConstraints(drug,rows,result,threshold,target,cap,now,mode,cycle,peak,fixedCount);
    // A failed attempt to increase already placed model nodes is NOT a proof
    // that adding further nodes could never satisfy a mathematical threshold.
    // A finite search must report algorithmic incompleteness, not mathematical impossibility.
    if(!fixedCount&&initialCandidate&&["peakNoSolution","cycleNoSolution","constraintNoSolution"].includes(result?.reason)){
      const coverage=initialCandidate.continuousFrom;
      const sampledPeak=Number.isFinite(coverage)?pointCoveragePeak(drug,rows,initialCandidate.doses,coverage,target,peak.mode):null;
      const sampledCycle=pointConstraintMetrics(drug,rows,initialCandidate.doses,now,coverage,target,cycle,peak);
      result={reason:"boundedSearchIncomplete",failedCondition:result.reason,
        checkedDoseNodes:initialCandidate.doses.length,automaticNodeLimit:12,
        checkedPeak:sampledPeak,checkedCycleMin:sampledCycle.cycleObserved,
        checkedMode:peak.mode,perNodeCap:cap,
        existingAtCap:Number.isFinite(cap)&&initialCandidate.doses.length>0&&
          initialCandidate.doses.every(dose=>dose.mg>=cap-1e-6)};
    }
    // If the first bounded greedy candidate exceeds the cumulative cap, try
    // reducing whole-dose nodes before declaring the cap infeasible.
    if(!result?.reason&&result.mg>totalCap+1e-6){
      const smallest=solveMinimumPoint(drug,rows,threshold,target,cap,now,result,fixedCount,mode,equivPeak);
      result=enforcePointConstraints(drug,rows,smallest,threshold,target,cap,now,mode,cycle,peak,fixedCount,totalCap)
        ||{reason:"totalNoSolution"};
      if(result.reason&&result.reason!=="cycleAlreadyBelow")result={reason:"totalNoSolution"};
    }else if(!result?.reason){
      result=enforcePointConstraints(drug,rows,result,threshold,target,cap,now,mode,cycle,peak,fixedCount,totalCap);
    }
    let minimum=null,previousMinimum=null,stableCandidate=null,comparison=null;
    if(!result.reason&&result.continuousFrom!==null&&result.continuousFrom<target){
      previousMinimum=solveMinimumPoint(drug,rows,threshold,target,cap,now,result,fixedCount,mode,equivPeak);
      previousMinimum=enforcePointConstraints(drug,rows,previousMinimum,threshold,target,cap,now,mode,cycle,peak,fixedCount,totalCap);
      if(previousMinimum?.reason||previousMinimum?.mg>result.mg+1e-6)previousMinimum=null;
      stableCandidate=solveFlattestPoint(drug,rows,threshold,target,cap,now,result,previousMinimum,fixedCount,mode,equivPeak,cycle,peak,totalCap);
      minimum=stableCandidate||previousMinimum||structuredClone(result);
      // The chosen B is the flattest verified bounded candidate, and never
      // uses more than the smaller of A's total and the explicit total cap.
      const bStats=pointStabilityStats(drug,rows,minimum.doses,result.continuousFrom,target,"blood");
      const aStats=pointStabilityStats(drug,rows,result.doses,result.continuousFrom,target,"blood");
      if(bStats.swing>aStats.swing+1e-6)minimum=structuredClone(result);
      comparison={a:{mg:result.mg,...aStats},
        b:previousMinimum?{mg:previousMinimum.mg,...pointStabilityStats(drug,rows,previousMinimum.doses,result.continuousFrom,target,"blood")}:null,
        newModel:{mg:minimum.mg,...pointStabilityStats(drug,rows,minimum.doses,result.continuousFrom,target,"blood")},
        replaced:!!minimum&&previousMinimum?.doses?.some((d,i)=>Math.abs(d.mg-(minimum.doses[i]?.mg||0))>1e-6||Math.abs(d.time-(minimum.doses[i]?.time||0))>1000)};
      const start=result.continuousFrom;
      const summarize=candidate=>candidate?{mg:candidate.mg,...pointStabilityStats(drug,rows,candidate.doses,start,target,"blood")}:null;
      comparison={a:summarize(result),b:summarize(previousMinimum),newModel:summarize(stableCandidate),replaced:!!stableCandidate};
      for(const candidate of [result,minimum]){
        if(!candidate)continue;
        const combined=[...rows,...candidate.doses];
        candidate.bloodAtTarget=concentration(drug,target,combined);
        candidate.equivalentAtTarget=totalEquivalent(drug,target,combined);
        candidate.peakEquivalent=pointEquivalentPeak(drug,rows,candidate.doses,candidate.continuousFrom,target);
        candidate.peakBlood=pointCoveragePeak(drug,rows,candidate.doses,candidate.continuousFrom,target,"blood");
        candidate.comparisonPeak=pointCoveragePeak(drug,rows,candidate.doses,candidate.continuousFrom,target,mode);
      }
    }
    // A and B are candidate searches, never guarantees of finding every
    // dose combination. Apply the target-time tolerance to BOTH before display.
    if(targetWindow?.enabled&&!result.reason){
      const check=c=>refinePointTargetWindow(drug,rows,c,threshold,target,mode,
        targetWindow,now,cap,cycle,peak,fixedCount,totalCap);
      const checkedA=check(result);
      const checkedB=check(minimum);
      if(checkedA){result=checkedA;minimum=checkedB;}
      else if(checkedB){result=checkedB;minimum=checkedB;}
      else {result={reason:"targetWindowUnreached"};minimum=null;}
    }
    self.postMessage({id,result,minimum,comparison,initialHypothesis});
  }catch(error){self.postMessage({id,error:String(error?.message||error)})}
};
