import Foundation
import XCTest
@testable import PKAtlas

final class PKCurveFailureDiagnosisTests: XCTestCase {
    private func signed() throws -> PKVerifiedSignedEngine {
        let path = try XCTUnwrap(Bundle(for: type(of: self)).url(forResource: "PKSignedEngineFixture", withExtension: "json"))
        let envelope = try JSONDecoder().decode(PKSignedEngineEnvelope.self, from: Data(contentsOf: path))
        return try PKSignedEngine.verify(envelope, bundled: PKCatalog.bundled())
    }

    func testSignedModelSamplesForAllComputableDrugsAtNow() throws {
        let signed = try signed()
        let start = Date.now.addingTimeInterval(-3*3600)
        let times = (0...108).map { start.addingTimeInterval(Double($0)*300) }
        for drug in signed.catalog.drugs where drug.canCalculate {
            let dose = PKDose(drug: drug.id, mg: drug.refDose ?? 100,
                time: start.addingTimeInterval(-3600))
            let model = PKModel(catalog: signed.catalog, doses: [dose], intakes: [], renalCrCl: nil, engineSource: signed.script)
            let begin = Date()
            let results = PKHotMath.compute(model: model, drug: drug, times: times)
            let elapsed = Date().timeIntervalSince(begin)
            print("CHART-DIAG drug=\(drug.id) count=\(results?.count ?? -1) seconds=\(elapsed)")
            XCTAssertEqual(results?.count, 109, drug.id)
            XCTAssertTrue(results?.allSatisfy { $0.concentration.isFinite && $0.equivalent.isFinite } == true)
        }
    }

    func testLongHistoryDoesNotBreakSignedCurve() throws {
        let signed = try signed()
        let drug = try XCTUnwrap(signed.catalog.drugs.first(where: { $0.id == "pregabalin" }))
        let now = Date.now
        let doses = (0..<355).map { n in
            PKDose(drug: drug.id, mg: drug.refDose ?? 100,
                time: now.addingTimeInterval(-Double(n) * 6 * 3600))
        }
        let model = PKModel(catalog: signed.catalog, doses: doses,
            intakes: [], renalCrCl: nil, engineSource: signed.script)
        let start = now.addingTimeInterval(-3*3600)
        let dates = (0...108).map { start.addingTimeInterval(Double($0)*300) }
        let before = Date()
        let samples = PKHotMath.compute(model: model, drug: drug, times: dates)
        print("CHART-DIAG 355records/109points samples=\(samples?.count ?? -1) seconds=\(Date().timeIntervalSince(before))")
        XCTAssertEqual(samples?.count, 109)
        let days = Calendar.current.startOfDay(for: now)
        let chartCount = PKWebsiteChartSpecification.count(scale: 140,viewport: 360)
        let long = (0...chartCount).map { n in
            days.addingTimeInterval(Double(n)/Double(chartCount)*48*3600)
        }
        let second = Date()
        let longPoints = PKHotMath.compute(model: model, drug: drug, times: long)
        print("CHART-DIAG 355records/\(long.count)points samples=\(longPoints?.count ?? -1) seconds=\(Date().timeIntervalSince(second))")
        XCTAssertEqual(longPoints?.count, long.count)
    }

    @MainActor
    func testShortChartReportsSignedRuntimeFailureRatherThanStalling() async throws {
        let verified = try signed()
        let drug = try XCTUnwrap(verified.catalog.drugs.first(where: { $0.id == "pregabalin" }))
        let model = PKModel(catalog: verified.catalog, doses: [], intakes: [],
                            renalCrCl: nil, engineSource: "bad script")
        let chart = PKShortChart()
        chart.load(model: model, drug: drug, center: .now, proposed: [])
        for _ in 0..<40 where chart.computing {
            try await Task.sleep(for: .milliseconds(50))
        }
        XCTAssertFalse(chart.computing)
        XCTAssertTrue(chart.actual.isEmpty)
        XCTAssertTrue(chart.failureMessage.contains("签名数学引擎"))
    }

    func testInvalidSignedEngineFallbackDoesNotProduceCurve() throws {
        let signed = try signed()
        let drug = try XCTUnwrap(signed.catalog.drugs.first(where: { $0.canCalculate }))
        let now = Date.now
        let dose = PKDose(drug: drug.id, mg: drug.refDose ?? 100,
                          time: now.addingTimeInterval(-3600))
        let model = PKModel(catalog: signed.catalog, doses: [dose], intakes: [],
                            renalCrCl: nil, engineSource: "bad script")
        let first = PKHotMath.compute(model: model, drug: drug,
            times: [now])
        print("CHART-DIAG invalid-js primary=\(first == nil ? "nil" : "non-nil")")
        XCTAssertNil(first)
        let fallback = model.curve(drug: drug, from: now, hours: 9, stepMinutes: 5)
        print("CHART-DIAG invalid-js fallbackCount=\(fallback.count)")
        XCTAssertEqual(fallback.count, 0)
    }
}
