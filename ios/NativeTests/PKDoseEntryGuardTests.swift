import XCTest
@testable import PKAtlas

final class PKDoseEntryGuardTests: XCTestCase {
    func testPossibleDuplicateOnlyForMatchingDrugAmountAndFiveMinuteWindow() {
        let now = Date(timeIntervalSince1970: 1_790_000_000)
        let prior = PKDose(id: "one", drug: "a", mg: 12.5, time: now)
        func check(_ drug: String = "a", _ mg: Double = 12.5,
                   _ offset: TimeInterval = 0, _ id: String = "two") -> PKDose? {
            PKDoseEntryGuard.possibleDuplicate(PKDose(id: id, drug: drug, mg: mg,
                time: now.addingTimeInterval(offset)), in: [prior])
        }
        XCTAssertEqual(check()?.id, "one")
        XCTAssertEqual(check("a", 12.5, 300)?.id, "one")
        XCTAssertNil(check("a", 12.5, 301))
        XCTAssertNil(check("b", 12.5))
        XCTAssertNil(check("a", 12.6))
        XCTAssertNil(check("a", 12.5, 0, "one")) // editing itself
    }

    func testFutureCannotBeMistakenForAlreadyTakenButClockDriftIsAllowed() {
        let now = Date(timeIntervalSince1970: 1_790_000_000)
        XCTAssertTrue(PKDoseEntryGuard.isPlanned(now.addingTimeInterval(120), at: now))
        XCTAssertNotNil(PKDoseEntryGuard.futureTimeNotice(now.addingTimeInterval(121), at: now))
        XCTAssertNil(PKDoseEntryGuard.futureTimeNotice(now.addingTimeInterval(-2 * 86400), at: now))
    }

    func testRecentTemplatesUseHistoricalRealRecordsNotPlannedFutureAndAreDistinctByDrug() {
        let now = Date(timeIntervalSince1970: 1_790_000_000)
        let rows = [
            PKDose(id: "a0", drug: "a", mg: 1, time: now.addingTimeInterval(-100)),
            PKDose(id: "a1", drug: "a", mg: 2, time: now.addingTimeInterval(-200)),
            PKDose(id: "b", drug: "b", mg: 3, time: now.addingTimeInterval(-150)),
            PKDose(id: "future", drug: "c", mg: 4, time: now.addingTimeInterval(10000))
        ]
        XCTAssertEqual(PKDoseEntryGuard.recentTemplates(in: rows, at: now).map(\.id), ["a0", "b"])
        XCTAssertEqual(PKDoseEntryGuard.mostRecentActual(drugID: "a", in: rows, at: now)?.id, "a0")
        XCTAssertNil(PKDoseEntryGuard.mostRecentActual(drugID: "c", in: rows, at: now))
    }
}
