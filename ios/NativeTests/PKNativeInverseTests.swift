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
        let missing = try await PKNativeInverseSolver.solve(input)
        XCTAssertEqual(missing.result?.reason, "initialBaselineRequired",
                       "No actual start and below-reference model requires an explicit hypothesis")
        var withStart = input
        withStart.initialBaseline = PKInverseInitialBaseline(mode: "blood", value: 0.01)
        withStart.cycleFloor = PKInverseLimit(value: 0.009, mode: "blood")
        let output = try await PKNativeInverseSolver.solve(withStart)
        XCTAssertNil(output.error)
        XCTAssertNil(output.result?.reason, "Explicit initial state should enable planned coverage")
        XCTAssertNotNil(output.result?.doses)
        XCTAssertNotNil(output.minimum?.doses)
        XCTAssertGreaterThan(output.initialHypothesis?.mg ?? 0, 0)
        XCTAssertGreaterThanOrEqual(output.result?.cycleObserved ?? 0, 0.009 - 0.000001)
        var custom = withStart
        custom.initialBaseline = PKInverseInitialBaseline(mode: "blood", value: 0.015)
        let customResult = try await PKNativeInverseSolver.solve(custom)
        XCTAssertNil(customResult.result?.reason)
        XCTAssertGreaterThan(customResult.initialHypothesis?.mg ?? 0,
                             output.initialHypothesis?.mg ?? 0)
        var invalid = withStart
        invalid.initialBaseline = PKInverseInitialBaseline(mode: "equivalent", value: 50)
        let rejected = try await PKNativeInverseSolver.solve(invalid)
        XCTAssertEqual(rejected.result?.reason, "initialBaselineInvalid")
    }

    func testFixedCountMayFormCoverageAfterInitialAbsorption() async throws {
        // Regression: the previous fixed-count search rejected any plan that
        // dipped below the reference after the initial model timestamp,
        // even when its later continuous modeled coverage met the floor.
        let now = 1_800_000_000_000.0
        let input = PKInverseInput(
            kind: "point", drugId: "pregabalin", rows: [],
            plan: .object(["strengths": .array([
                .object(["id": .string("fixture"),"mg": .number(50),"unit": .string("粒")])])]),
            meals: [], renalState: .null, threshold: 650,
            target: now + 3 * 3_600_000, cap: 200, now: now,
            fixedCount: 1, mode: "equivalent", peakFloor: 0,
            start: now + 900_000, hours: 1, countText: "",
            cycleFloor: PKInverseLimit(value: 650, mode: "equivalent"),
            peakRequirement: PKInverseLimit(value: 0, mode: "equivalent"),
            totalCap: nil, initialBaseline: PKInverseInitialBaseline(mode: "equivalent", value: 650))
        let output = try await PKNativeInverseSolver.solve(input)
        XCTAssertNil(output.error)
        XCTAssertNil(output.result?.reason)
        XCTAssertEqual(output.result?.doses?.count, 1)
        XCTAssertGreaterThan(output.result?.continuousFrom ?? now, now)
        XCTAssertLessThan(output.result?.continuousFrom ?? input.target, input.target)
        XCTAssertGreaterThanOrEqual(output.result?.cycleObserved ?? 0, 649.999)
    }

    func testExistingFuturePlanCountsTowardCurrentToTargetCap() async throws {
        let now = 1_800_000_000_000.0
        let fixedPlan: [[String: PKJSON]] = [[
            "id": .string("fixed"), "drug": .string("pregabalin"),
            "mg": .number(100), "time": .number(now + 3_600_000),
            "planningOnly": .bool(true)
        ]]
        let input = PKInverseInput(
            kind: "point", drugId: "pregabalin", rows: fixedPlan,
            plan: .object(["strengths": .array([
                .object(["mg": .number(50), "unit": .string("粒")])])]),
            meals: [], renalState: .null, threshold: 650,
            target: now + 3 * 3_600_000, cap: 200, now: now,
            fixedCount: 1, mode: "equivalent", peakFloor: 0,
            start: now + 900_000, hours: 1, countText: "",
            cycleFloor: PKInverseLimit(value: 650, mode: "equivalent"),
            peakRequirement: PKInverseLimit(value: 0, mode: "equivalent"),
            totalCap: 75, initialBaseline: PKInverseInitialBaseline(mode: "equivalent", value: 650))
        let output = try await PKNativeInverseSolver.solve(input)
        XCTAssertNil(output.error)
        XCTAssertEqual(output.result?.reason, "totalNoSolution",
                       "Existing fixed plans must consume the cumulative cap")
    }

    func testNoContinuousCoverageIsNeverPresentedAsSuccess() async throws {
        let now = 1_800_000_000_000.0
        let input = PKInverseInput(
            kind: "point", drugId: "pregabalin", rows: [],
            plan: .object(["strengths": .array([
                .object(["id": .string("small"), "mg": .number(50), "unit": .string("粒")])])]),
            meals: [], renalState: .null, threshold: 1000,
            target: now + 3_600_000, cap: 50, now: now,
            fixedCount: nil, mode: "equivalent", peakFloor: 0,
            start: now + 900_000, hours: 1, countText: "",
            cycleFloor: PKInverseLimit(value: 0, mode: "equivalent"),
            peakRequirement: PKInverseLimit(value: 0, mode: "equivalent"),
            totalCap: nil, initialBaseline: PKInverseInitialBaseline(mode: "equivalent", value: 100))
        let output = try await PKNativeInverseSolver.solve(input)
        XCTAssertNil(output.error)
        XCTAssertEqual(output.result?.reason, "coverageSearchIncomplete")
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
            totalCap: nil, initialBaseline: PKInverseInitialBaseline(mode: "blood", value: 0.6)
        )
        let output = try await PKNativeInverseSolver.solve(input)
        XCTAssertNotNil(output.result)
        XCTAssertEqual(output.result?.reason, "specs")
        XCTAssertNil(output.error)
    }
}
