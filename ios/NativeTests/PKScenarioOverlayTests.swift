import XCTest
@testable import PKAtlas

final class PKScenarioOverlayTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_800_000_000)
    private let drug = "pregabalin"

    private func node(_ id: String, _ offset: TimeInterval, _ mg: Double,
                      drug: String = "pregabalin") -> PKDose {
        PKDose(id: id, drug: drug, mg: mg, time: now.addingTimeInterval(offset))
    }

    func testSavedPlanAndAdoptedAreCombinedInOnePreview() {
        let saved = node("saved", 7200, 100)
        let accepted = node("adopted", 3600, 75)
        let merged = PKScenarioOverlay.merged(saved: [saved], hypothesis: [accepted],
            actual: [], drugID: drug, from: now.addingTimeInterval(-3600),
            through: now.addingTimeInterval(10_800))
        XCTAssertEqual(merged.map(\.id), ["adopted", "saved"])
        XCTAssertEqual(merged.map(\.mg), [75, 100])
    }

    func testSavedPlanWinsWhenAdoptedCandidateIsSameNodeDifferentId() {
        let saved = node("manual", 3600, 50)
        let duplicate = node("model-generated", 3620, 50)
        let merged = PKScenarioOverlay.merged(saved: [saved], hypothesis: [duplicate],
            actual: [], drugID: drug, from: now, through: now.addingTimeInterval(7200))
        XCTAssertEqual(merged.map(\.id), ["manual"])
    }

    func testActualConfirmationRemovesForecastDuplicateAndKeepsOthers() {
        let saved = node("planned-id", -1800, 50)
        let future = node("future-id", 3600, 75)
        let confirmed = node("actual-id", -1760, 50)
        let merged = PKScenarioOverlay.merged(saved: [saved, future], hypothesis: [],
            actual: [confirmed], drugID: drug, from: now.addingTimeInterval(-7200),
            through: now.addingTimeInterval(7200))
        XCTAssertEqual(merged.map(\.id), ["future-id"])
    }

    func testOverdueUnconfirmedPlanIsStillHypotheticalWhenWithinResidualWindow() {
        let overdue = node("unconfirmed", -3600, 80)
        let merged = PKScenarioOverlay.merged(saved: [overdue], hypothesis: [],
            actual: [], drugID: drug, from: now.addingTimeInterval(-7200),
            through: now.addingTimeInterval(7200))
        XCTAssertEqual(merged.map(\.id), ["unconfirmed"])
    }

    func testDrugAndTimeWindowExcludeUnrelatedNodes() {
        let within = node("within", 3600, 40)
        let other = node("other", 3600, 60, drug: "amoxicillin")
        let tooLate = node("outside", 24 * 3600, 20)
        let merged = PKScenarioOverlay.merged(saved: [within, other, tooLate], hypothesis: [],
            actual: [], drugID: drug, from: now.addingTimeInterval(-7200),
            through: now.addingTimeInterval(7200))
        XCTAssertEqual(merged.map(\.id), ["within"])
    }
}
