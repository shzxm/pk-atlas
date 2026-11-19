import XCTest
@testable import PKAtlas

final class PKInverseChartFocusTests: XCTestCase {
    func testAdoptedNavigationUsesSavedTargetNotDraftOrCurrentTime() {
        let adopted = Date(timeIntervalSince1970: 1_800_000_000)
        let unrelated = adopted.addingTimeInterval(12 * 3600)
        let plan: [String: PKJSON] = [
            "target": .number(adopted.timeIntervalSince1970 * 1000),
            "mode": .string("equivalent"), "threshold": .number(150)
        ]
        XCTAssertEqual(PKInverseChartFocus.adoptedTarget(plan, fallback: unrelated), adopted)
        XCTAssertEqual(PKInverseChartFocus.chartStart(center: adopted),
                       adopted.addingTimeInterval(-24 * 3600))
    }

    func testMidnightTargetAppearsAtCenterOfFortyEightHourWindow() {
        let calendar = Calendar(identifier: .gregorian)
        let midnight = calendar.startOfDay(for: Date(timeIntervalSince1970: 1_800_000_000))
        let start = PKInverseChartFocus.chartStart(center: midnight)
        let end = start.addingTimeInterval(PKWebsiteChartSpecification.duration)
        XCTAssertEqual(midnight.timeIntervalSince(start), 24 * 3600)
        XCTAssertEqual(end.timeIntervalSince(midnight), 24 * 3600)
    }

    func testAdoptedLegacyAdjustmentFallsBackToFirstDose() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let plan: [String: PKJSON] = ["adjustment": .object(["doses": .array([
            .object(["time": .number((now.timeIntervalSince1970 + 5 * 3600) * 1000)]),
            .object(["time": .number((now.timeIntervalSince1970 + 3 * 3600) * 1000)])
        ])])]
        XCTAssertEqual(PKInverseChartFocus.adoptedTarget(plan, fallback: now),
                       now.addingTimeInterval(3 * 3600))
        XCTAssertEqual(PKInverseChartFocus.adoptedTarget([:], fallback: now), now)
    }

    func testBrowsingAnotherDayUsesNoonInsteadOfClampingToToday() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let otherDay = now.addingTimeInterval(-10 * 86_400)
        let center = PKInverseChartFocus.browsingCenter(day: otherDay, now: now)
        let midnight = Calendar.current.startOfDay(for: otherDay)
        XCTAssertEqual(center.timeIntervalSince(midnight), 12 * 3600)
    }
}
