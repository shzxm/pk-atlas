import Foundation
import JavaScriptCore

// Uses the EXACT deployed website inverse engine in JavaScriptCore, not a web
// page, hidden browser or server-side calculation. Its 250 KB JS source is
// a signed app resource; no network requests are executed by the engine.
struct PKInverseLimit: Encodable, Sendable {
    let value: Double
    let mode: String
}
struct PKInverseInitialBaseline: Encodable, Sendable {
    var mode: String
    var value: Double
}

struct PKInverseTargetWindow: Encodable, Sendable {
    let enabled: Bool
    let value: Double
}


struct PKInverseInput: Encodable, @unchecked Sendable {
    var kind: String
    var drugId: String
    var rows: [[String: PKJSON]]
    var plan: PKJSON
    var meals: [[String: PKJSON]]
    var renalState: PKJSON
    var threshold: Double
    var target: Double
    var cap: Double
    var now: Double
    var fixedCount: Int?
    var mode: String
    var peakFloor: Double
    var start: Double
    var hours: Double
    var countText: String
    var cycleFloor: PKInverseLimit
    var peakRequirement: PKInverseLimit
    var totalCap: Double?
    var targetWindow: PKInverseTargetWindow? = nil
    var initialBaseline: PKInverseInitialBaseline? = nil
    // Data-only model overrides; the bundled solver remains the only code.
    var catalog: PKCatalog? = nil
}

struct PKInverseDose: Codable, Identifiable {
    var id: String { "\(time)-\(mg)" }
    let time: Double
    let mg: Double
    var parts: [PKJSON]?
}
struct PKInverseCandidate: Decodable {
    var doses: [PKInverseDose]?
    var reason: String?
    var mg: Double?
    var modeled: Double?
    var baselineNow: Double?
    var baselineTarget: Double?
    var minLevel: Double?
    var peak: Double?
    var peakEquivalent: Double?
    var bloodAtTarget: Double?
    var equivalentAtTarget: Double?
    var continuousFrom: Double?
    var allCovered: Bool?
    var fallingAfter: Bool?
    var limited: Bool?
    var fixedCount: Int?
    var totalPlanned: Double?
    var cycleObserved: Double?
    var peakObserved: Double?
}
struct PKInverseOutput: Decodable, @unchecked Sendable {
    var result: PKInverseCandidate?
    var minimum: PKInverseCandidate?
    var initialHypothesis: PKInverseDose?
    var display: PKInverseCandidate?
    var error: String?
}

enum PKInverseFailure: LocalizedError {
    case missingEngine
    case invalidOutput
    case engine(String)
    var errorDescription: String? {
        switch self {
        case .missingEngine: return "未包含网站反算内核"
        case .invalidOutput: return "反算内核响应格式无效"
        case .engine(let message): return message
        }
    }
}

enum PKNativeInverseSolver {
    // The bridge mirrors the production web/inverse-worker.js algorithm,
    // including dual units, cumulative cap and verified flattest B candidate.
    private static let entrypoint = #"""
    function __pkatlasNativeSolve(serializedInput) {
      const {id,kind="point",drugId,rows:givenRows,plan,meals,renalState,threshold,target,cap,now,fixedCount,mode,peakFloor,start,hours,countText,cycleFloor,peakRequirement,totalCap:rawTotalCap,targetWindow,initialBaseline}=JSON.parse(serializedInput);
      try{
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
            if(initialBaseline==null)
              return JSON.stringify({result:{reason:"initialBaselineRequired"},minimum:null});
            if(initialBaseline.mode!==mode||!Number.isFinite(initialBaseline.value)||initialBaseline.value<=0||initialBaseline.value>1000000)
              return JSON.stringify({result:{reason:"initialBaselineInvalid"},minimum:null});
            initialHypothesis=pkInitialHypothesis(drug,now,mode,initialBaseline.value);
            if(!initialHypothesis)
              return JSON.stringify({result:{reason:"initialBaselineInvalid"},minimum:null});
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
          return JSON.stringify({result,display});
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
        if(!fixedCount&&equivPeak>0)
          result=applyAutomaticPointPeakFloor(drug,rows,result,threshold,target,cap,now,mode,equivPeak);
        result=enforcePointConstraints(drug,rows,result,threshold,target,cap,now,mode,cycle,peak,fixedCount);
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
        if(targetWindow?.enabled&&!result.reason){
          const check=c=>refinePointTargetWindow(drug,rows,c,threshold,target,mode,
            targetWindow,now,cap,cycle,peak,fixedCount,totalCap);
          const checkedA=check(result),checkedB=check(minimum);
          if(checkedA){result=checkedA;minimum=checkedB;}
          else if(checkedB){result=checkedB;minimum=checkedB;}
          else{result={reason:"targetWindowUnreached"};minimum=null;}
        }
        return JSON.stringify({result,minimum,comparison,initialHypothesis});
      }catch(error){return JSON.stringify({error:String(error?.message||error)})}
    }
    """#

    static func injectingCatalog(_ script: String, catalog: PKCatalog) throws -> String {
        // The signed website engine is generated with two single-line JSON
        // declarations. Replace only those constants with re-encoded DATA.
        // Never accept or execute downloaded JavaScript.
        guard let drugsStart = script.range(of: "const DRUGS = "),
              let foodStart = script.range(of: ";\nconst FOOD_INFO = ",
                                           range: drugsStart.upperBound..<script.endIndex),
              let foodEnd = script.range(of: ";\n", range: foodStart.upperBound..<script.endIndex),
              drugsStart.lowerBound < foodStart.lowerBound else {
            throw PKInverseFailure.invalidOutput
        }
        let drugData = try JSONEncoder().encode(catalog.drugs)
        let foodData = try JSONEncoder().encode(catalog.food)
        guard let drugs = String(data: drugData, encoding: .utf8),
              let food = String(data: foodData, encoding: .utf8) else {
            throw PKInverseFailure.invalidOutput
        }
        var updated = script
        updated.replaceSubrange(drugsStart.lowerBound..<foodEnd.upperBound,
                                with: "const DRUGS = \(drugs);\nconst FOOD_INFO = \(food);\n")
        return updated
    }

    static func solve(_ request: PKInverseInput,
                      engineSource: String? = nil) async throws -> PKInverseOutput {
        // No UI-thread JavaScript execution. A fresh JSContext is used for
        // each isolated request, so global website mutable state cannot leak
        // between requests.
        try await Task.detached(priority: .utility) {
            guard let url = Bundle.main.url(forResource: "site-engine", withExtension: "js"),
                  let bundled = try? String(contentsOf: url, encoding: .utf8),
                  let context = JSContext() else { throw PKInverseFailure.missingEngine }
            let source = engineSource ?? bundled
            var lastException: String?
            context.exceptionHandler = { _, value in
                lastException = value?.toString()
            }
            context.evaluateScript("globalThis.structuredClone = x => JSON.parse(JSON.stringify(x));")
            let verifiedSource = try injectingCatalog(source,
                catalog: request.catalog ?? PKCatalog.bundled())
            context.evaluateScript(verifiedSource)
            if let lastException { throw PKInverseFailure.engine(lastException) }
            context.evaluateScript(entrypoint)
            if let lastException { throw PKInverseFailure.engine(lastException) }
            let encoded = try JSONEncoder().encode(request)
            guard let input = String(data: encoded, encoding: .utf8),
                  let reply = context.objectForKeyedSubscript("__pkatlasNativeSolve")?.call(withArguments: [input]),
                  let json = reply.toString()?.data(using: .utf8) else {
                throw PKInverseFailure.invalidOutput
            }
            if let lastException { throw PKInverseFailure.engine(lastException) }
            let result = try JSONDecoder().decode(PKInverseOutput.self, from: json)
            if let error = result.error { throw PKInverseFailure.engine(error) }
            return result
        }.value
    }
}
