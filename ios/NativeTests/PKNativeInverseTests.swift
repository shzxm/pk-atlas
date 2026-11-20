import XCTest
@testable import PKAtlas

final class PKNativeInverseTests: XCTestCase {
    func testPastTimeMovesToNextDayPreservingHourMinute() {
        let now = Date(timeIntervalSince1970: 1_700_000_000)
        let before = now.addingTimeInterval(-4 * 3600)
        let after = PKFutureTime.nextOccurrence(before, after: now)
        XCTAssertGreaterThan(after, now)
        let previous = Calendar.current.dateComponents([.hour, .minute], from: before)
        let next = Calendar.current.dateComponents([.hour, .minute], from: after)
        XCTAssertEqual(previous.hour, next.hour)
        XCTAssertEqual(previous.minute, next.minute)
    }

    func testNewReferenceSettingsCanMergeIndependently() {
        let initial: [String: PKJSON] = [
            "referenceMemory": .object([
                "pregabalin": .object(["mode": .string("blood"), "value": .number(9)])
            ])
        ]
        var one = initial
        one["referenceMemory"] = .object([
            "pregabalin": .object(["mode": .string("equivalent"), "value": .number(350)])
        ])
        var other = initial
        other["referenceMemory"] = .object([
            "pregabalin": .object(["mode": .string("blood"), "value": .number(9)]),
            "amoxicillin": .object(["mode": .string("blood"), "value": .number(2)])
        ])
        let merged = PKMerge.fields(base: initial, local: one, remote: other)
        XCTAssertNotNil(merged)
        let reference = merged?["referenceMemory"]?.object
        XCTAssertEqual(reference?["pregabalin"]?.object?["value"], .number(350))
        XCTAssertEqual(reference?["amoxicillin"]?.object?["value"], .number(2))
    }

    func testInverseTargetTimeSettingsMergeAcrossDevices() throws {
        let base: [String: PKJSON] = ["inverseMemory": .object([:])]
        let local: [String: PKJSON] = ["inverseMemory": .object([
            "pregabalin": .object([
                "pointTarget": .string("2026-11-18T19:30"),
                "pointTargetLimitEnabled": .string("1"),
                "pointTargetLimitBlood": .string("0.5"),
                "pointTargetLimitEquivalent": .string("50")
            ])
        ])]
        let remote: [String: PKJSON] = ["inverseMemory": .object([
            "amoxicillin": .object(["pointTarget": .string("2026-11-19T08:15")])
        ])]
        let joined = try XCTUnwrap(PKMerge.fields(base: base, local: local, remote: remote))
        let memory = try XCTUnwrap(joined["inverseMemory"]?.object)
        XCTAssertEqual(memory["pregabalin"]?.object?["pointTarget"],
                       .string("2026-11-18T19:30"))
        XCTAssertEqual(memory["amoxicillin"]?.object?["pointTarget"],
                       .string("2026-11-19T08:15"))
        XCTAssertEqual(memory["pregabalin"]?.object?["pointTargetLimitBlood"],
                       .string("0.5"))
    }

    func testTargetTimeWithNoLimitAllowsAboveReferenceAndLimitRejectsOutside() async throws {
        let now = 1_700_000_000_000.0
        let original: [[String: PKJSON]] = [[
            "id": .string("dose-1"), "drug": .string("pregabalin"),
            "mg": .number(150), "time": .number(now - 3_600_000)
        ]]
        let defaults = PKInverseInput(
            kind: "point", drugId: "pregabalin", rows: original,
            plan: .object([:]), meals: [], renalState: .null,
            threshold: 0.1, target: now + 1_800_000,
            cap: 300, now: now, fixedCount: nil,
            mode: "blood", peakFloor: 0,
            start: now + 900_000, hours: 1, countText: "",
            cycleFloor: PKInverseLimit(value: 0, mode: "blood"),
            peakRequirement: PKInverseLimit(value: 0, mode: "equivalent"),
            totalCap: nil, targetWindow: PKInverseTargetWindow(enabled: false, value: 0.5))
        let unbounded = try await PKNativeInverseSolver.solve(defaults)
        XCTAssertNil(unbounded.result?.reason)
        XCTAssertGreaterThan(unbounded.result?.modeled ?? 0, defaults.threshold)
        var bounded = defaults
        bounded.targetWindow = PKInverseTargetWindow(enabled: true, value: 0.001)
        let restricted = try await PKNativeInverseSolver.solve(bounded)
        XCTAssertEqual(restricted.result?.reason, "targetWindowUnreached")
    }

    func testEmptyActualHistoryCanStillCalculateUsingSavedStrengths() async throws {
        // Regression: zero ACTUAL doses is not equivalent to no mathematical
        // baseline. The inverse engine must still accept the verified saved
        // whole-unit strengths and return an ordinary candidate, rather than
        // requiring a dose to have already been taken today.
        let now = 1_800_000_000_000.0
        let input = PKInverseInput(
            kind: "point", drugId: "amoxicillin", rows: [],
            plan: .object(["strengths": .array([.object(["mg": .number(100)])])]),
            meals: [], renalState: .null,
            threshold: 0.01, target: now + 6 * 3_600_000,
            cap: 1_000, now: now, fixedCount: nil,
            mode: "blood", peakFloor: 0,
            start: now + 3_600_000, hours: 2, countText: "",
            cycleFloor: PKInverseLimit(value: 0, mode: "blood"),
            peakRequirement: PKInverseLimit(value: 0, mode: "equivalent"),
            totalCap: nil, targetWindow: PKInverseTargetWindow(enabled: false, value: 0))
        let output = try await PKNativeInverseSolver.solve(input)
        XCTAssertNil(output.error)
        XCTAssertNil(output.result?.reason, "No actual doses must not block inverse calculation")
        XCTAssertNotNil(output.result?.doses)
        XCTAssertNotNil(output.minimum?.doses)
    }

    func testWebsiteInverseEngineLoadsAndIdentifiesMissingDrugStrengths() async throws {
        let now = 1_700_000_000_000.0
        let input = PKInverseInput(
            kind: "point", drugId: "pregabalin", rows: [],
            plan: .object([:]), meals: [], renalState: .null,
            threshold: 0.6, target: now + 3_600_000 * 3,
            cap: 300, now: now, fixedCount: nil,
            mode: "blood", peakFloor: 0,
            start: now + 3_600_000, hours: 2, countText: "",
            cycleFloor: PKInverseLimit(value: 0, mode: "blood"),
            peakRequirement: PKInverseLimit(value: 0, mode: "equivalent"),
            totalCap: nil
        )
        let output = try await PKNativeInverseSolver.solve(input)
        XCTAssertNotNil(output.result)
        XCTAssertEqual(output.result?.reason, "specs")
        XCTAssertNil(output.error)
    }
}
