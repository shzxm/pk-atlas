import XCTest
@testable import PKAtlas

final class PKScheduledDoseTests: XCTestCase {
    private let catalog = PKCatalog.bundled()
    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    func testFuturePlanNeverEntersActualModelBeforeConfirmation() throws {
        var state = PKCloudState()
        let planned = PKDose(id: "future-1", drug: "pregabalin", mg: 75,
                             time: now.addingTimeInterval(3 * 3600))
        state.saveScheduledDose(planned)
        XCTAssertEqual(state.scheduledDoses.map(\.id), ["future-1"])
        XCTAssertTrue(state.records.isEmpty)
        let drug = try XCTUnwrap(catalog.drugs.first { $0.id == "pregabalin" })
        let baseline = PKModel(catalog: catalog, doses: state.doses,
                               intakes: [], renalCrCl: nil)
        let future = now.addingTimeInterval(4 * 3600)
        XCTAssertEqual(baseline.concentration(drug, at: future), 0)
        XCTAssertFalse(state.confirmScheduledDose(planned.id, at: now))
        XCTAssertEqual(state.scheduledDoses.count, 1)
        XCTAssertTrue(state.records.isEmpty)
        XCTAssertTrue(state.confirmScheduledDose(planned.id, at: future))
        XCTAssertTrue(state.scheduledDoses.isEmpty)
        XCTAssertEqual(state.doses.count, 1)
        XCTAssertEqual(state.doses[0].id, planned.id)
        XCTAssertFalse(state.confirmScheduledDose(planned.id, at: future))
        let actual = PKModel(catalog: catalog, doses: state.doses,
                             intakes: [], renalCrCl: nil)
        XCTAssertGreaterThan(actual.concentration(drug, at: future), 0)
    }

    func testScheduledDoseSurvivesCloudRoundTripAndDoesNotBecomeActualWhenOverdue() throws {
        var state = PKCloudState()
        let old = PKDose(id: "older-plan", drug: "amoxicillin", mg: 250,
                         time: now.addingTimeInterval(-3 * 3600))
        state.saveScheduledDose(old)
        let bytes = try JSONEncoder().encode(state)
        var restored = try JSONDecoder().decode(PKCloudState.self, from: bytes)
        XCTAssertEqual(restored.scheduledDoses.count, 1)
        XCTAssertTrue(restored.doses.isEmpty)
        XCTAssertEqual(restored.scheduledDoses[0].id, old.id)
        restored.saveScheduledDose(PKDose(id: old.id, drug: old.drug, mg: 500,
                                         time: old.time))
        XCTAssertEqual(restored.scheduledDoses.count, 1)
        XCTAssertEqual(restored.scheduledDoses[0].mg, 500)
        XCTAssertTrue(restored.doses.isEmpty)
        restored.deleteScheduledDose(old.id)
        XCTAssertTrue(restored.scheduledDoses.isEmpty)
    }

    func testUpcomingDateIsPlanNotRejected() {
        let soon = now.addingTimeInterval(30)
        XCTAssertTrue(PKDoseEntryGuard.isPlanned(soon, at: now))
        XCTAssertNotNil(PKDoseEntryGuard.futureTimeNotice(soon, at: now))
        XCTAssertFalse(PKDoseEntryGuard.isPlanned(now, at: now))
        XCTAssertNil(PKDoseEntryGuard.futureTimeNotice(now, at: now))
    }

    func testPlanChangesOnlyForecastAndNeverRecordedCurve() throws {
        var state = PKCloudState()
        let plan = PKDose(id: "plan", drug: "pregabalin", mg: 75,
                          time: now.addingTimeInterval(3600))
        state.saveScheduledDose(plan)
        let drug = try XCTUnwrap(catalog.drugs.first { $0.id == "pregabalin" })
        let model = PKModel(catalog: catalog, doses: state.doses,
                            intakes: [], renalCrCl: nil)
        let sampled = now.addingTimeInterval(2 * 3600)
        XCTAssertEqual(model.concentration(drug, at: sampled), 0, accuracy: 0.00001)
        XCTAssertGreaterThan(model.concentration(drug, at: sampled,
                              additional: state.scheduledDoses), 0)
        XCTAssertEqual(model.equivalent(drug, at: sampled), 0, accuracy: 0.00001)
        XCTAssertGreaterThan(model.equivalent(drug, at: sampled,
                             additional: state.scheduledDoses), 0)
    }

    func testSameIdRemainsSinglePlannedNodeOnEdit() {
        var state = PKCloudState()
        state.saveScheduledDose(PKDose(id: "x", drug: "cetirizine", mg: 10,
                                       time: now.addingTimeInterval(7200)))
        state.saveScheduledDose(PKDose(id: "x", drug: "cetirizine", mg: 20,
                                       time: now.addingTimeInterval(10800)))
        XCTAssertEqual(state.scheduledDoses.count, 1)
        XCTAssertEqual(state.scheduledDoses.first?.mg, 20)
        XCTAssertEqual(state.records.count, 0)
    }
}
