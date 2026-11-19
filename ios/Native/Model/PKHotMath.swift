import Foundation
import JavaScriptCore
import OSLog

/// Evaluates the pinned, Ed25519-verified website algorithm in a JSContext
/// without a browser, DOM, network APIs, file access or native object bridges.
/// A whole curve is evaluated in one batch to avoid JS/Swift per-point overhead.
enum PKHotMath {
    private static let logger = Logger(subsystem: "com.example.PKAtlas", category: "CurveMath")
    private static func rejected(_ reason: String, pointCount: Int) -> [PKSample]? {
        // Diagnostic codes only: never log medicine names, doses, event IDs or user data.
        logger.error("curve_math_failure stage=\(reason, privacy: .public) samples=\(pointCount)")
        return nil
    }
    private struct DoseRow: Encodable {
        let drug: String
        let mg: Double
        let time: Double
    }
    private struct MealRow: Encodable {
        let kind: String
        let mealType: String
        let drink: String
        let time: Double
    }
    private struct Input: Encodable {
        let drugId: String
        let times: [Double]
        let records: [DoseRow]
        let meals: [MealRow]
        let renalCrCl: Double?
    }
    private struct Point: Decodable {
        let time: Double
        let concentration: Double
        let equivalent: Double
        let unfed: Double
    }

    private static let bridge = #"""
    function __pkatlasHotSamples(serializedInput) {
      const {drugId,times,records,meals,renalCrCl}=JSON.parse(serializedInput);
      current=drugId;
      intakes=safeIntakes(meals);
      renal=safeRenal(renalCrCl===null?null:{crcl:renalCrCl});
      mealMatchCache.clear();MODEL_PARAMS.clear();EQUIVALENT_PEAK_CACHE.clear();
      const drug=DRUGS.find(d=>d.id===drugId);
      if(!drug||drug.recordOnly)throw new Error('Unsupported drug');
      return JSON.stringify(times.map(time=>({
        time,
        concentration:concentration(drug,time,records),
        equivalent:totalEquivalent(drug,time,records),
        unfed:concentration(drug,time,records,false)
      })));
    }
    """#

    static func compute(model: PKModel, drug: PKDrug,
                        times: [Date], additional: [PKDose] = []) -> [PKSample]? {
        guard let source = model.engineSource, !times.isEmpty,
              times.count <= 650 else { return rejected("invalid-input-or-engine", pointCount: times.count) }
        // A JSContext belongs to one thread. Reuse only within that thread;
        // do not retain or share a JSC VM across detached Swift tasks.
        let key = "pkatlas-hot-math-context-\(source.hashValue)-\(model.catalog.drugs.count)"
        let thread = Thread.current
        let context: JSContext
        if let cached = thread.threadDictionary[key] as? JSContext {
            context = cached
        } else {
            guard let fresh = JSContext() else { return rejected("jscontext-create", pointCount: times.count) }
            var setupError: String?
            fresh.exceptionHandler = { _, value in setupError = value?.toString() }
            fresh.evaluateScript("globalThis.structuredClone = x => JSON.parse(JSON.stringify(x));")
            guard let reconciled = try? PKNativeInverseSolver.injectingCatalog(
                source, catalog: model.catalog) else { return rejected("catalog-injection", pointCount: times.count) }
            fresh.evaluateScript(reconciled)
            fresh.evaluateScript(bridge)
            guard setupError == nil else { return rejected("js-setup-exception", pointCount: times.count) }
            thread.threadDictionary[key] = fresh
            context = fresh
        }
        var exception: String?
        context.exception = nil
        context.exceptionHandler = { _, value in exception = value?.toString() }
        let rows = (model.doses + additional).filter { $0.drug == drug.id }.map {
            DoseRow(drug: $0.drug, mg: $0.mg,
                    time: $0.time.timeIntervalSince1970 * 1000)
        }
        let meals = model.intakes.filter { $0.kind == "meal" }.map {
            MealRow(kind: $0.kind, mealType: $0.mealType, drink: $0.drink,
                    time: $0.time.timeIntervalSince1970 * 1000)
        }
        let input = Input(drugId: drug.id,
                          times: times.map { $0.timeIntervalSince1970 * 1000 },
                          records: rows, meals: meals, renalCrCl: model.renalCrCl)
        guard let data = try? JSONEncoder().encode(input),
              let raw = String(data: data, encoding: .utf8),
              let result = context.objectForKeyedSubscript("__pkatlasHotSamples")?
                  .call(withArguments: [raw]),
              let json = result.toString()?.data(using: .utf8),
              let values = try? JSONDecoder().decode([Point].self, from: json),
              exception == nil, values.count == times.count else {
            return rejected("js-call-or-result-decode", pointCount: times.count)
        }
        var samples = [PKSample]()
        samples.reserveCapacity(values.count)
        for (index, value) in values.enumerated() {
            guard abs(value.time - input.times[index]) < 2,
                  [value.concentration, value.equivalent, value.unfed].allSatisfy({
                      $0.isFinite && $0 >= 0 && $0 <= 1_000_000_000
                  }) else { return rejected("nonfinite-or-invalid-sample", pointCount: times.count) }
            samples.append(PKSample(time: times[index],
                concentration: value.concentration, equivalent: value.equivalent,
                unfed: value.unfed))
        }
        return samples
    }
}
