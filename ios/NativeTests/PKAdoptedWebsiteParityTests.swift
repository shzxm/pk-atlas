import XCTest
@testable import PKAtlas

final class PKAdoptedWebsiteParityTests: XCTestCase {
    @MainActor
    func testAdoptedForecastIncludesSeparateFutureSavedPlanWithoutMakingItActual() async throws {
        let catalog = PKCatalog.bundled()
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let target = (now.timeIntervalSince1970 + 5 * 3600) * 1000
        let adoptedAt = now.timeIntervalSince1970 * 1000
        var baseline = PKCloudState()
        let plan: [String: PKJSON] = [
            "v": .number(1), "drug": .string("pregabalin"), "variant": .string("A"),
            "adoptedAt": .number(adoptedAt), "target": .number(target),
            "threshold": .number(0.01), "mode": .string("blood"),
            "doses": .array([.object(["time": .number(adoptedAt + 3600000), "mg": .number(75)])]),
            "baselineIds": .array([]), "manualMatches": .object([:])
        ]
        baseline.settings["inverseMemory"] = .object([
            "pregabalin": .object(["adoptedPointPlan": .object(plan)])
        ])
        let originalResult = try await PKAdoptedEvaluator.evaluate(snapshot: baseline,
            drugId: "pregabalin", catalog: catalog, engineSource: nil, now: now)
        let without = try XCTUnwrap(originalResult)
        baseline.saveScheduledDose(PKDose(id: "future-distinct", drug: "pregabalin",mg: 25,
            time: now.addingTimeInterval(2 * 3600)))
        let futureResult = try await PKAdoptedEvaluator.evaluate(snapshot: baseline,
            drugId: "pregabalin", catalog: catalog, engineSource: nil, now: now)
        let withFuture = try XCTUnwrap(futureResult)
        XCTAssertEqual(withFuture.bloodAtTarget, without.bloodAtTarget, accuracy: 0.0000001,
            "Future plans added after adoption must not silently change an adopted curve")
        var adoptedWithIncluded = plan
        adoptedWithIncluded["includedScheduledDoses"] = .array([.object([
            "id": .string("future-distinct"), "drug": .string("pregabalin"),
            "time": .number((now.timeIntervalSince1970 + 2 * 3600) * 1000),
            "mg": .number(25), "unit": .string("mg")
        ])])
        baseline.settings["inverseMemory"] = .object([
            "pregabalin": .object(["adoptedPointPlan": .object(adoptedWithIncluded)])
        ])
        let acceptedResult = try await PKAdoptedEvaluator.evaluate(snapshot: baseline,
            drugId: "pregabalin", catalog: catalog, engineSource: nil, now: now)
        let accepted = try XCTUnwrap(acceptedResult)
        XCTAssertGreaterThan(accepted.bloodAtTarget, without.bloodAtTarget,
            "Only planned doses explicitly captured at adoption may enter the accepted curve")
        XCTAssertTrue(baseline.doses.isEmpty, "Future plan must remain separate from taken records")
    }

    func testNewAdoptedAdjustmentRetiresPreviousOriginalConfirmations() {
        let t = Date(timeIntervalSince1970: 1_800_000_000).timeIntervalSince1970 * 1000
        let original: [PKJSON] = [
            .object(["time": .number(t), "mg": .number(50)]),
            .object(["time": .number(t + 3600000), "mg": .number(60)]),
            .object(["time": .number(t + 7200000), "mg": .number(70)])
        ]
        var plan: [String: PKJSON] = ["doses": .array(original)]
        XCTAssertEqual(PKAdoptedUnmatchedNode.remaining(plan: plan, review: nil).count, 3)
        plan["adjustment"] = .object([
            "adoptedAt": .number(t + 100),
            "completedCount": .number(0),
            "doses": .array([
                .object(["time": .number(t + 100000), "mg": .number(35)]),
                .object(["time": .number(t + 200000), "mg": .number(55)])
            ])
        ])
        XCTAssertTrue(PKAdoptedUnmatchedNode.remaining(plan: plan, review: nil).isEmpty,
                      "Adopting a replacement must retire all prior original yes/no reminders")
        // Historic math is retained, never reclassified as actual ingestion.
        XCTAssertEqual(plan["doses"]?.array?.count, 3)
    }

    @MainActor
    func testOverdueUnconfirmedNodeSurvivesAndRemainsAnAdoptedHypothesis() async throws {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let overdueMs = (now.timeIntervalSince1970 - 3600) * 1000
        var state = PKCloudState()
        let plan: [String: PKJSON] = [
            "v": .number(1), "drug": .string("pregabalin"), "variant": .string("A"),
            "adoptedAt": .number(overdueMs - 7200000),
            "target": .number((now.timeIntervalSince1970 + 7200) * 1000),
            "threshold": .number(0.01), "mode": .string("blood"),
            "doses": .array([.object(["time": .number(overdueMs), "mg": .number(75)])]),
            "baselineIds": .array([]), "manualMatches": .object([:]),
            "includedScheduledDoses": .array([])
        ]
        state.settings["inverseMemory"] = .object([
            "pregabalin": .object(["adoptedPointPlan": .object(plan)])
        ])
        let response = try await PKAdoptedEvaluator.evaluate(snapshot: state,
            drugId: "pregabalin", catalog: PKCatalog.bundled(),
            engineSource: nil, now: now)
        let evaluated = try XCTUnwrap(response)
        XCTAssertEqual(evaluated.matchedNodeCount, 0)
        XCTAssertEqual(evaluated.pending.count, 1)
        XCTAssertEqual(evaluated.pending[0].time, overdueMs,
            "A 14:00 node must not disappear at 15:00 solely because it is overdue")
        let review = PKAdoptedUnmatchedNode.remaining(plan: plan, review: evaluated)
        XCTAssertEqual(review.count, 1)
        XCTAssertEqual(review[0].time.timeIntervalSince1970 * 1000, overdueMs)
        XCTAssertTrue(state.doses.isEmpty,
            "An overdue hypothetical dose must not be recorded as an actual intake")
    }

    @MainActor
    func testWebsiteAutomaticMatchingAndPendingExcludesTakenNode() async throws {
        let now = Date(timeIntervalSince1970: 1_790_000_000)
        let nodeMs = (now.timeIntervalSince1970 - 600) * 1000
        let nextMs = (now.timeIntervalSince1970 + 1800) * 1000
        var state = PKCloudState()
        let actual = PKDose(id: "actual-node-1", drug: "pregabalin", mg: 50,
                            time: Date(timeIntervalSince1970: now.timeIntervalSince1970 - 480))
        state.saveDose(actual)
        let plan: [String: PKJSON] = [
            "v": .number(1), "drug": .string("pregabalin"),
            "variant": .string("A"),
            "adoptedAt": .number(nodeMs - 900_000),
            "target": .number(nextMs + 600_000),
            "threshold": .number(0.01),
            "mode": .string("blood"), "cap": .string(""),
            "count": .string("2"), "peakMin": .number(0),
            "peakMode": .string("blood"), "cycleMin": .number(0),
            "cycleMode": .string("blood"), "totalMax": .number(0),
            "baselineIds": .array([]), "manualMatches": .object([:]),
            "doses": .array([
                .object(["time": .number(nodeMs), "mg": .number(50)]),
                .object(["time": .number(nextMs), "mg": .number(50)])
            ])
        ]
        state.settings["inverseMemory"] = .object([
            "pregabalin": .object(["adoptedPointPlan": .object(plan)])
        ])
        let output = try await PKAdoptedEvaluator.evaluate(
            snapshot: state, drugId: "pregabalin", catalog: PKCatalog.bundled(),
            engineSource: nil, now: now)
        let result = try XCTUnwrap(output)
        XCTAssertEqual(result.matchedNodeCount, 1)
        XCTAssertEqual(result.completed.count, 1)
        XCTAssertEqual(result.completed.first?.record.id, "actual-node-1")
        XCTAssertEqual(result.pending.count, 1, "A matched recorded dose must not remain a second future model node")
        XCTAssertEqual(result.pending.first?.time, nextMs)
        XCTAssertEqual(result.unmatched.count, 0)
    }
}
