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

    func testInverseReferenceUsesOnlyCurrentTargetUnit() {
        let blood = PKInverseChartFocus.activeReferences(mode: "blood", threshold: 0.5)
        XCTAssertEqual(blood.blood, 0.5)
        XCTAssertNil(blood.equivalent)
        let equivalent = PKInverseChartFocus.activeReferences(mode: "equivalent", threshold: 50)
        XCTAssertNil(equivalent.blood)
        XCTAssertEqual(equivalent.equivalent, 50)
        let empty = PKInverseChartFocus.activeReferences(mode: "blood", threshold: nil)
        XCTAssertNil(empty.blood)
        XCTAssertNil(empty.equivalent)
    }

    func testTomorrowTargetStaysOnTodayChart() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 8 * 3600)!
        let components = DateComponents(year: 2026, month: 11, day: 20, hour: 21)
        let now = calendar.date(from: components)!
        let tomorrow = calendar.date(byAdding: .hour, value: 7, to: now)!
        let day = PKInverseChartFocus.visibleDay(for: tomorrow,
            now: now, calendar: calendar)
        let start = calendar.startOfDay(for: now)
        XCTAssertEqual(day, start)
        XCTAssertGreaterThan(tomorrow, day)
        XCTAssertLessThan(tomorrow, day.addingTimeInterval(48 * 3600))
        XCTAssertNotEqual(day, calendar.startOfDay(for: tomorrow))
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
