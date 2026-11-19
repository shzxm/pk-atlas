import XCTest
@testable import PKAtlas

final class PKChartPanAndAdoptedTests: XCTestCase {
    func testBothChartsHaveSameRollingPanWindow() {
        let start = Date(timeIntervalSince1970: 1_790_000_000)
        let left = PKChartTimeline.initialScrollStart(at: start)
        XCTAssertEqual(left.timeIntervalSince(start), -8 * 3600)
        XCTAssertEqual(PKChartTimeline.bufferEnd(around: start)
            .timeIntervalSince(PKChartTimeline.bufferStart(around: start)), 72 * 3600)
        XCTAssertNil(PKChartTimeline.nextCenter(scrollStart: left, currentCenter: start))
        let moved = left.addingTimeInterval(-20 * 3600)
        let recentered = PKChartTimeline.nextCenter(scrollStart: moved, currentCenter: start)
        XCTAssertNotNil(recentered)
        XCTAssertEqual(recentered?.timeIntervalSince(start), -16 * 3600)
        let late = left.addingTimeInterval(24 * 3600)
        XCTAssertEqual(PKChartTimeline.nextCenter(scrollStart: late, currentCenter: start)?
            .timeIntervalSince(start), 28 * 3600)
        XCTAssertEqual(PKChartTimeline.bufferDuration /
            Double(PKChartTimeline.sampleMinutes * 60) + 1, 433)
    }

    func testUnmatchedNodeIncludesOverdueAndDoesNotAlterActualHistory() {
        let now = Date.now.timeIntervalSince1970 * 1000
        let plan: [String: PKJSON] = ["doses": .array([
            .object(["time": .number(now - 3_600_000), "mg": .number(50)]),
            .object(["time": .number(now + 3_600_000), "mg": .number(75)]),
            .object(["time": .number(now + 7_200_000), "mg": .number(100)])
        ])]
        let nodes = PKAdoptedUnmatchedNode.remaining(plan: plan, review: nil)
        XCTAssertEqual(nodes.map(\.index), [0, 1, 2])
        XCTAssertTrue(nodes[0].overdue)
        XCTAssertFalse(nodes[1].overdue)
        XCTAssertEqual(nodes[2].mg, 100)
    }

    func testMatchedNodesAreExcludedIncludingPast() throws {
        let now = Date.now.timeIntervalSince1970 * 1000
        let plan: [String: PKJSON] = ["doses": .array([
            .object(["time": .number(now - 3_600_000), "mg": .number(50)]),
            .object(["time": .number(now + 3_600_000), "mg": .number(75)]),
            .object(["time": .number(now + 7_200_000), "mg": .number(100)])
        ])]
        let json = """
        {"completed":[{"nodeIndex":1,"record":{"id":"dose-1","time":\(now),"mg":75}}],
        "matchedNodeCount":1,"pending":[],"suggested":null,"missed":[],"unmatched":[],
        "candidates":[],"invalidManual":[],"replanned":false,"replanReason":"", "remaining":2,
        "plannedMg":225,"completedMg":75,"pendingMg":0,"suggestedMg":null,
        "suggestedAtTarget":null,"bloodAtTarget":0,"equivalentAtTarget":0,
        "continuousFrom":null,"allCovered":false,"at":\(now),"replanFrom":\(now)}
        """
        let review = try JSONDecoder().decode(PKAdoptedReview.self, from: Data(json.utf8))
        XCTAssertEqual(PKAdoptedUnmatchedNode.remaining(plan: plan, review: review)
            .map(\.index), [0, 2])
    }
}
