import Foundation
import JavaScriptCore

/// Wire-compatible with website evaluateAdoptedPlan(), including manual many-to-one
/// matches, nearest-record windows and adjustment suggestions.
struct PKAdoptedRecord: Decodable, Identifiable {
    let id: String
    let time: Double
    let mg: Double
}
struct PKAdoptedMatch: Decodable, Identifiable {
    let nodeIndex: Int
    let record: PKAdoptedRecord
    let manual: Bool?
    var id: String { "\(nodeIndex):\(record.id)" }
}
/// Every original adopted-plan dose that has NOT been linked to a real
/// medication record, including overdue nodes. This is NOT a dose history.
struct PKAdoptedUnmatchedNode: Identifiable {
    let index: Int
    let time: Date
    let mg: Double
    var id: Int { index }
    var overdue: Bool { time < Date.now }

    static func remaining(plan: [String: PKJSON], review: PKAdoptedReview?) -> [Self] {
        // A newly accepted adjustment supersedes the original plan's
        // hypothetical nodes. Preserve the old math as metadata, but never
        // request taken/not-taken confirmation for both generations.
        if let adjusted = plan["adjustment"]?.object?["doses"],
           case .array = adjusted { return [] }
        guard let raw = plan["doses"], case .array(let doses) = raw else { return [] }
        let matched = Set(review?.completed.map(\.nodeIndex) ?? [])
        return doses.enumerated().compactMap { index, element in
            guard !matched.contains(index), let row = element.object,
                  let milliseconds = row["time"]?.number,
                  let mg = row["mg"]?.number,
                  milliseconds.isFinite, mg.isFinite, mg > 0 else { return nil }
            return Self(index: index, time: Date(timeIntervalSince1970: milliseconds / 1000), mg: mg)
        }.sorted { $0.time < $1.time }
    }
}

struct PKAdoptedReview: Decodable {
    let completed: [PKAdoptedMatch]
    let matchedNodeCount: Int
    let pending: [PKInverseDose]
    let suggested: [PKInverseDose]?
    let missed: [PKInverseDose]
    let unmatched: [PKAdoptedRecord]
    let candidates: [PKAdoptedRecord]
    let invalidManual: [Int]
    let replanned: Bool
    let replanReason: String
    let remaining: Int
    let plannedMg: Double
    let completedMg: Double
    let pendingMg: Double
    let suggestedMg: Double?
    let suggestedAtTarget: Double?
    let bloodAtTarget: Double
    let equivalentAtTarget: Double
    let continuousFrom: Double?
    let allCovered: Bool
    let at: Double
    let replanFrom: Double

    func matched(_ index: Int) -> [PKAdoptedMatch] { completed.filter { $0.nodeIndex == index } }
    var nextNode: PKInverseDose? {
        pending.filter { $0.time >= Date.now.timeIntervalSince1970 * 1000 - 60_000 }
            .min { $0.time < $1.time }
    }
    var suggestionDiffers: Bool {
        guard let suggested, replanReason.isEmpty else { return false }
        return suggested.count != pending.count || zip(suggested, pending).contains {
            abs($0.time - $1.time) > 1000 || abs($0.mg - $1.mg) > 0.000001
        }
    }
}

enum PKAdoptedEvaluator {
    private static let entrypoint = #"""
    function __pkatlasEvaluateAdopted(serializedInput) {
      const input=JSON.parse(serializedInput);
      current=input.drugId;
      records=safeRecords(input.records);
      scheduledDoses=safeScheduledDoses(input.scheduledDoses);
      intakes=safeIntakes(input.intakes);
      plans={[input.drugId]:input.drugPlan||{}};
      renal=safeRenal(input.renal);
      MODEL_PARAMS.clear();mealMatchCache.clear();EQUIVALENT_PEAK_CACHE.clear();
      return JSON.stringify(evaluateAdoptedPlan(input.adopted,input.now));
    }
    """#

    static func evaluate(snapshot: PKCloudState, drugId: String,
                         catalog: PKCatalog, engineSource: String?,
                         now: Date = .now) async throws -> PKAdoptedReview? {
        guard let adopted = snapshot.settings["inverseMemory"]?.object?[drugId]?
            .object?["adoptedPointPlan"] else { return nil }
        return try await Task.detached(priority: .utility) {
            guard let url = Bundle.main.url(forResource: "site-engine", withExtension: "js"),
                  let bundled = try? String(contentsOf: url, encoding: .utf8),
                  let context = JSContext() else { throw PKInverseFailure.missingEngine }
            var exception: String?
            context.exceptionHandler = { _, value in exception = value?.toString() }
            context.evaluateScript("globalThis.structuredClone = x => JSON.parse(JSON.stringify(x));")
            context.evaluateScript(try PKNativeInverseSolver.injectingCatalog(
                engineSource ?? bundled, catalog: catalog))
            if let exception { throw PKInverseFailure.engine(exception) }
            context.evaluateScript(entrypoint)
            if let exception { throw PKInverseFailure.engine(exception) }
            let model = PKModel(catalog: catalog, doses: snapshot.doses,
                                intakes: snapshot.meals, renalCrCl: snapshot.renalCrCl,
                                engineSource: engineSource)
            let cutoff = catalog.drugs.first(where: { $0.id == drugId }).map {
                PKResidualWindow.start(drug: $0, model: model,
                                       earliestSample: min(now, Date(timeIntervalSince1970:
                                           (adopted.object?["adoptedAt"]?.number ?? now.timeIntervalSince1970 * 1000) / 1000)))
                   .timeIntervalSince1970 * 1000
            } ?? -Double.infinity
            let filteredRecords = snapshot.records.filter {
                $0["drug"]?.string == drugId && ($0["time"]?.number ?? -Double.infinity) >= cutoff
            }
            let input: PKJSON = .object([
                "drugId": .string(drugId), "adopted": adopted,
                "records": .array(filteredRecords.map { .object($0) }),
                "scheduledDoses": snapshot.settings["scheduledDoses"] ?? .array([]),
                "intakes": .array(snapshot.intakes.map { .object($0) }),
                "drugPlan": snapshot.plans[drugId] ?? .object([:]),
                "renal": snapshot.settings["renal"] ?? .null,
                "now": .number(now.timeIntervalSince1970 * 1000)
            ])
            let json = try JSONEncoder().encode(input)
            guard let argument = String(data: json, encoding: .utf8),
                  let response = context.objectForKeyedSubscript("__pkatlasEvaluateAdopted")?
                    .call(withArguments: [argument]),
                  let text = response.toString(), let reply = text.data(using: .utf8) else {
                throw PKInverseFailure.invalidOutput
            }
            if let exception { throw PKInverseFailure.engine(exception) }
            return try JSONDecoder().decode(PKAdoptedReview.self, from: reply)
        }.value
    }
}
