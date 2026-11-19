import Foundation

/// 181 is the canonical online mathematical evaluator. The installed signed
/// engine remains an independently verified offline fallback.
enum PKServerMath {
    struct Entry: Encodable {
        let drug: String
        let time: Int64
        let mg: Double
    }
    struct Intake: Encodable {
        let kind: String
        let time: Int64
        let mealType: String
    }
    struct Request: Encodable {
        let drugId: String
        let times: [Int64]
        let records: [Entry]
        let planned: [Entry]
        let meals: [Intake]
        let renalCrCl: Double?
    }
    struct Sample: Decodable {
        let time: Int64
        let bloodMgL: Double
        let equivalentMg: Double
        let unfedMgL: Double
        let plannedBloodMgL: Double?
        let plannedEquivalentMg: Double?
    }
    struct Response: Decodable {
        let source: String
        let catalogVersion: String
        let engineVersion: String
        let serverKernelSha256: String
        let points: [Sample]
    }
    enum Invalid: Error {
        case incompatibleModel
        case invalidResult
    }

    /// Split only the wire request, never the data or the mathematical model.
    /// Each contribution is linear in recorded doses, so sums of separately
    /// evaluated batches are mathematically equivalent to one evaluation.
    /// The 181 endpoint retains its strict 300-record / 60,000-work limits.
    static func boundedRequests(drugId: String, times: [Int64], records: [Entry],
                                planned: [Entry], meals: [Intake],
                                renalCrCl: Double?) -> [Request] {
        guard !times.isEmpty, !times.contains(where: { $0 <= 0 }) else { return [] }
        let perBatch = max(1, min(90, 60_000 / times.count))
        var requests = [Request]()
        if records.isEmpty {
            requests.append(Request(drugId: drugId, times: times, records: [],
                                    planned: [], meals: meals, renalCrCl: renalCrCl))
        } else {
            for start in stride(from: 0, to: records.count, by: perBatch) {
                let end = min(records.count, start + perBatch)
                requests.append(Request(drugId: drugId, times: times,
                    records: Array(records[start..<end]), planned: [],
                    meals: meals, renalCrCl: renalCrCl))
            }
        }
        if !planned.isEmpty {
            requests.append(Request(drugId: drugId, times: times,
                records: [], planned: planned, meals: meals, renalCrCl: renalCrCl))
        }
        return requests
    }

    static func fetch(model: PKModel, drug: PKDrug, actual: [PKSample],
                      planned: [PKDose], expectedCatalogPrefix: String,
                      expectedEnginePrefix: String)
        async throws -> (actual: [PKSample], planned: [PKSample]) {
        guard !actual.isEmpty, actual.count <= 650,
              !expectedEnginePrefix.isEmpty,
              !expectedCatalogPrefix.isEmpty,
              expectedCatalogPrefix != "内置" else {
            throw Invalid.incompatibleModel
        }
        let first = actual[0].time.timeIntervalSince1970 * 1000
        let last = actual[actual.count - 1].time.timeIntervalSince1970 * 1000
        let actualRows = model.doses.filter { $0.drug == drug.id }
        let meals = model.intakes.filter { $0.kind == "meal" &&
            $0.time.timeIntervalSince1970 * 1000 >= first - 3 * 86_400_000 &&
            $0.time.timeIntervalSince1970 * 1000 <= last + 86_400_000 }
        guard actualRows.count <= 2_000, planned.count <= 30, meals.count <= 160,
              actualRows.allSatisfy({
                let t = $0.time.timeIntervalSince1970 * 1000
                return t >= first - 180 * 86_400_000 && t <= last
              }),
              planned.allSatisfy({
                let t = $0.time.timeIntervalSince1970 * 1000
                return $0.drug == drug.id && t >= first - 180 * 86_400_000 && t <= last
              }) else { throw Invalid.invalidResult }
        let toEntry: (PKDose) -> Entry = {
            Entry(drug: drug.id, time: Int64(($0.time.timeIntervalSince1970 * 1000).rounded()),
                  mg: $0.mg)
        }
        let sampleTimes = actual.map { Int64(($0.time.timeIntervalSince1970 * 1000).rounded()) }
        let requests = boundedRequests(drugId: drug.id, times: sampleTimes,
            records: actualRows.map(toEntry), planned: planned.map(toEntry),
            meals: meals.map { Intake(kind: "meal",
                time: Int64(($0.time.timeIntervalSince1970 * 1000).rounded()),
                mealType: $0.mealType == "highFat" ? "highFat" : "regular") },
            renalCrCl: model.renalCrCl)
        guard !requests.isEmpty, requests.count <= 25 else {
            throw Invalid.invalidResult
        }
        // Reduce each server response by its linear contribution, then apply
        // once. A partial network failure never replaces a good local curve.
        var blood = [Double](repeating: 0, count: actual.count)
        var equivalent = blood
        var unfed = blood
        var forecastBlood = blood
        var forecastEquivalent = blood
        var sawForecast = false
        for request in requests {
            try Task.checkCancellation()
            let payload = try JSONEncoder().encode(request)
            let result: Response = try await PKCloudAPI.shared.request(
                "/api/native/math/samples", method: "POST", body: payload)
            guard result.source == "181-server-math",
                  result.engineVersion.hasPrefix(expectedEnginePrefix == "内置"
                    ? (PKModelDistribution.expectedEngineVersion ?? "__missing__")
                    : expectedEnginePrefix),
                  result.catalogVersion.hasPrefix(expectedCatalogPrefix),
                  result.serverKernelSha256.count == 64,
                  result.points.count == actual.count else {
                throw Invalid.incompatibleModel
            }
            for (index, point) in result.points.enumerated() {
                guard abs(Double(point.time) - Double(sampleTimes[index])) <= 2,
                      [point.bloodMgL, point.equivalentMg, point.unfedMgL]
                        .allSatisfy({ $0.isFinite && $0 >= 0 }) else {
                    throw Invalid.invalidResult
                }
                blood[index] += point.bloodMgL
                equivalent[index] += point.equivalentMg
                unfed[index] += point.unfedMgL
                if !request.planned.isEmpty {
                    guard let mixedBlood = point.plannedBloodMgL,
                          let mixedEquivalent = point.plannedEquivalentMg,
                          mixedBlood.isFinite, mixedEquivalent.isFinite,
                          mixedBlood >= 0, mixedEquivalent >= 0 else {
                        throw Invalid.invalidResult
                    }
                    // This request deliberately contains no historical doses;
                    // its mixed result is the increment due to preview nodes.
                    forecastBlood[index] += mixedBlood
                    forecastEquivalent[index] += mixedEquivalent
                    sawForecast = true
                }
            }
        }
        var confirmed = [PKSample]()
        var projected = [PKSample]()
        confirmed.reserveCapacity(actual.count)
        if sawForecast { projected.reserveCapacity(actual.count) }
        for index in actual.indices {
            let values = [blood[index], equivalent[index], unfed[index],
                          forecastBlood[index], forecastEquivalent[index]]
            guard values.allSatisfy({ $0.isFinite && $0 >= 0 && $0 <= 1_000_000_000 }) else {
                throw Invalid.invalidResult
            }
            confirmed.append(PKSample(time: actual[index].time,
                concentration: blood[index], equivalent: equivalent[index],
                unfed: unfed[index]))
            if sawForecast {
                projected.append(PKSample(time: actual[index].time,
                    concentration: blood[index] + forecastBlood[index],
                    equivalent: equivalent[index] + forecastEquivalent[index],
                    unfed: unfed[index]))
            }
        }
        return (confirmed, projected)
    }
}
