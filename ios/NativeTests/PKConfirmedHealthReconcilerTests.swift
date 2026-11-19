import XCTest
@testable import PKAtlas

final class PKConfirmedHealthReconcilerTests: XCTestCase {
    private let catalog = PKCatalog.bundled()
    private let fixed = Date(timeIntervalSince1970: 1_800_000_000)
    private let uuid = UUID(uuidString: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee")!
    private func state(selected: Bool = true, drug: String = "pregabalin",
                       mg: Double = 75, time: Date? = nil) -> PKCloudState {
        var state = PKCloudState()
        state.settings["healthEventReviews"] = .object([
            uuid.uuidString: .object([
                "selected": .bool(selected),
                "source": .string("healthkit-manual-review"),
                "drugId": .string(drug),
                "doseMG": .number(mg),
                "time": .number((time ?? fixed).timeIntervalSince1970 * 1000)
            ])
        ])
        return state
    }

    func testReviewWithoutSelectionNeverEntersMath() {
        var history = state(selected: false)
        let result = PKConfirmedHealthReconciler.reconcile(&history, catalog: catalog, now: fixed)
        XCTAssertEqual(result.inserted, 0)
        XCTAssertTrue(history.doses.isEmpty)
    }

    func testSelectedReviewBecomesRealDoseAndChangesMath() throws {
        var history = state()
        let result = PKConfirmedHealthReconciler.reconcile(&history, catalog: catalog, now: fixed)
        XCTAssertEqual(result.inserted, 1)
        XCTAssertEqual(history.records.count, 1)
        XCTAssertEqual(history.records.first?["source"]?.string, "healthkit-read")
        XCTAssertEqual(history.settings["healthDoseLinks"]?.object?[uuid.uuidString]?.string,
                       "healthkit-" + uuid.uuidString)
        let drug = try XCTUnwrap(catalog.drugs.first(where: { $0.id == "pregabalin" }))
        let imported = PKModel(catalog: catalog, doses: history.doses,
            intakes: [], renalCrCl: nil)
        let empty = PKModel(catalog: catalog, doses: [], intakes: [], renalCrCl: nil)
        let probe = fixed.addingTimeInterval(90 * 60)
        XCTAssertGreaterThan(imported.concentration(drug, at: probe),
                             empty.concentration(drug, at: probe))
        XCTAssertGreaterThan(imported.equivalent(drug, at: probe), 0)
    }

    func testRepeatedReadingAndCloudRoundTripNeverDuplicates() throws {
        var history = state()
        PKConfirmedHealthReconciler.reconcile(&history, catalog: catalog, now: fixed)
        let original = history
        let repeated = PKConfirmedHealthReconciler.reconcile(&history, catalog: catalog, now: fixed)
        XCTAssertFalse(repeated.changed)
        let data = try JSONEncoder().encode(history)
        var restored = try JSONDecoder().decode(PKCloudState.self, from: data)
        let again = PKConfirmedHealthReconciler.reconcile(&restored, catalog: catalog, now: fixed)
        XCTAssertEqual(original, restored)
        XCTAssertFalse(again.changed)
        XCTAssertEqual(restored.doses.count, 1)
    }

    func testCorrectedDoseAndTimeChangesSameModelRecord() {
        var history = state()
        PKConfirmedHealthReconciler.reconcile(&history, catalog: catalog, now: fixed)
        var reviews = history.settings["healthEventReviews"]!.object!
        var review = reviews[uuid.uuidString]!.object!
        review["doseMG"] = .number(125)
        review["time"] = .number(fixed.addingTimeInterval(-300).timeIntervalSince1970*1000)
        reviews[uuid.uuidString] = .object(review)
        history.settings["healthEventReviews"] = .object(reviews)
        let result = PKConfirmedHealthReconciler.reconcile(&history, catalog: catalog, now: fixed)
        XCTAssertEqual(result.updated, 1)
        XCTAssertEqual(history.doses.count, 1)
        XCTAssertEqual(history.doses[0].mg, 125)
        XCTAssertEqual(history.doses[0].time.timeIntervalSince1970,
                       fixed.addingTimeInterval(-300).timeIntervalSince1970, accuracy: 0.001)
    }

    func testUnselectRemovesOnlyManagedHealthRecord() {
        var history = state()
        history.saveDose(PKDose(id: "manual", drug:"pregabalin", mg:30,
                              time:fixed.addingTimeInterval(-7200)))
        PKConfirmedHealthReconciler.reconcile(&history, catalog: catalog, now: fixed)
        XCTAssertEqual(history.doses.count, 2)
        var reviews = history.settings["healthEventReviews"]!.object!
        var review = reviews[uuid.uuidString]!.object!
        review["selected"] = .bool(false)
        reviews[uuid.uuidString] = .object(review)
        history.settings["healthEventReviews"] = .object(reviews)
        let result = PKConfirmedHealthReconciler.reconcile(&history, catalog: catalog, now: fixed)
        XCTAssertEqual(result.removed, 1)
        XCTAssertEqual(history.doses.map(\.id), ["manual"])
        XCTAssertTrue(history.settings["healthDoseLinks"]?.object?.isEmpty == true)
    }

    func testManualRecordIsLinkedAndNeverDeletedOrAltered() {
        var history = state()
        history.saveDose(PKDose(id: "manual",drug:"pregabalin",mg:75,
                             time:fixed.addingTimeInterval(60)))
        let result = PKConfirmedHealthReconciler.reconcile(&history, catalog:catalog, now:fixed)
        XCTAssertEqual(result.linked, 0)
        XCTAssertEqual(result.pendingNearby, 1)
        XCTAssertEqual(history.doses.count, 1)
        var reviews = history.settings["healthEventReviews"]!.object!
        var review = reviews[uuid.uuidString]!.object!
        XCTAssertEqual(review["nearbyRecordID"]?.string, "manual")
        review["nearbyDecision"] = .string("link:manual")
        reviews[uuid.uuidString] = .object(review)
        history.settings["healthEventReviews"] = .object(reviews)
        let linked = PKConfirmedHealthReconciler.reconcile(&history, catalog:catalog, now:fixed)
        XCTAssertEqual(linked.linked,1)
        XCTAssertEqual(history.doses.count,1)
        reviews = history.settings["healthEventReviews"]!.object!
        review = reviews[uuid.uuidString]!.object!
        review["selected"] = .bool(false)
        reviews[uuid.uuidString] = .object(review)
        history.settings["healthEventReviews"] = .object(reviews)
        PKConfirmedHealthReconciler.reconcile(&history, catalog:catalog, now:fixed)
        XCTAssertEqual(history.doses.map(\.id),["manual"])
    }

    func testRemovingMappingOrMassReviewRemovesStaleHealthCalculationNode() {
        var history = state()
        PKConfirmedHealthReconciler.reconcile(&history, catalog: catalog, now: fixed)
        XCTAssertEqual(history.doses.count, 1)
        var reviews = history.settings["healthEventReviews"]!.object!
        var review = reviews[uuid.uuidString]!.object!
        review.removeValue(forKey: "drugId")
        reviews[uuid.uuidString] = .object(review)
        history.settings["healthEventReviews"] = .object(reviews)
        let result = PKConfirmedHealthReconciler.reconcile(&history, catalog: catalog, now: fixed)
        XCTAssertEqual(result.removed, 1)
        XCTAssertTrue(history.doses.isEmpty)
        XCTAssertTrue(history.settings["healthDoseLinks"]?.object?.isEmpty == true)
    }

    func testTwoHistoricallyConfirmedHealthEventsAreReconciledTogether() {
        var history = state()
        var reviews = history.settings["healthEventReviews"]!.object!
        let second = UUID(uuidString: "dddddddd-aaaa-4bbb-8ccc-ffffffffffff")!
        reviews[second.uuidString] = .object([
            "selected": .bool(true), "source": .string("healthkit-manual-review"),
            "drugId": .string("pregabalin"), "doseMG": .number(75),
            "time": .number(fixed.addingTimeInterval(-7200).timeIntervalSince1970 * 1000)
        ])
        history.settings["healthEventReviews"] = .object(reviews)
        let result = PKConfirmedHealthReconciler.reconcile(&history, catalog: catalog, now: fixed)
        XCTAssertEqual(result.inserted, 2)
        XCTAssertEqual(history.records.count, 2)
        XCTAssertEqual(history.settings["healthDoseLinks"]?.object?.count, 2)
    }

    func testRealHealthEventAutoStageWithoutManualImportAndWithCorrectionPriority() {
        var history = PKCloudState()
        let event = PKHealthDoseMatch(eventUUID: uuid, medicationName: "普瑞巴林胶囊 75mg",
            drugID: "pregabalin", mg: 75, quantityText: "75 mg", time: fixed)
        XCTAssertEqual(PKConfirmedHealthReconciler.stageAutomatic([event], state: &history,
            catalog: catalog, now: fixed), 1)
        let result = PKConfirmedHealthReconciler.reconcile(&history, catalog: catalog, now: fixed)
        XCTAssertEqual(result.inserted, 1)
        XCTAssertEqual(history.doses.first?.mg, 75)
        XCTAssertEqual(PKConfirmedHealthReconciler.stageAutomatic([event], state: &history,
            catalog: catalog, now: fixed), 0)
        XCTAssertEqual(history.doses.count, 1)
        var reviews = history.settings["healthEventReviews"]!.object!
        var corrected = reviews[uuid.uuidString]!.object!
        corrected["selected"] = .bool(false)
        reviews[uuid.uuidString] = .object(corrected)
        history.settings["healthEventReviews"] = .object(reviews)
        PKConfirmedHealthReconciler.reconcile(&history, catalog: catalog, now: fixed)
        XCTAssertTrue(history.doses.isEmpty)
        XCTAssertEqual(PKConfirmedHealthReconciler.stageAutomatic([event], state: &history,
            catalog: catalog, now: fixed), 0, "A user rejection must override future automatic reads")
    }

    func testAutoStageNeverInventsDoseForNonMassOrUnknownName() {
        var history = PKCloudState()
        let unknown = PKHealthDoseMatch(eventUUID: uuid, medicationName: "未知药物",
            drugID: nil, mg: nil, quantityText: "2 片", time: fixed)
        XCTAssertEqual(PKConfirmedHealthReconciler.stageAutomatic([unknown], state: &history,
            catalog: catalog, now: fixed), 0)
        let incorrect = PKHealthDoseMatch(eventUUID: uuid, medicationName: "未关联 Apple 健康药物 · 请人工核对",
            drugID: "pregabalin", mg: 75, quantityText: "75 mg", time: fixed)
        XCTAssertEqual(PKConfirmedHealthReconciler.stageAutomatic([incorrect], state: &history,
            catalog: catalog, now: fixed), 0)
        XCTAssertTrue(history.records.isEmpty)
    }

    func testHighConfidenceAutoMatchGoesStraightIntoCalculation() {
        var history = state()
        var reviews = history.settings["healthEventReviews"]!.object!
        var review = reviews[uuid.uuidString]!.object!
        review["source"] = .string("healthkit-auto-match")
        reviews[uuid.uuidString] = .object(review)
        history.settings["healthEventReviews"] = .object(reviews)
        let first = PKConfirmedHealthReconciler.reconcile(&history, catalog: catalog, now: fixed)
        XCTAssertEqual(first.inserted, 1)
        XCTAssertEqual(history.doses.count, 1)
        let repeated = PKConfirmedHealthReconciler.reconcile(&history, catalog: catalog, now: fixed)
        XCTAssertFalse(repeated.changed)
        XCTAssertEqual(history.doses.count, 1)
    }

    func testTwoHealthEventsNearEachOtherDoNotDoubleCountAutomatically() {
        var history = PKCloudState()
        let other = UUID(uuidString:"dddddddd-aaaa-4bbb-8ccc-ffffffffffff")!
        let events = [
            PKHealthDoseMatch(eventUUID:uuid, medicationName:"普瑞巴林胶囊", drugID:"pregabalin",
                mg:75,quantityText:"75 mg",time:fixed.addingTimeInterval(-10*60)),
            PKHealthDoseMatch(eventUUID:other, medicationName:"普瑞巴林胶囊", drugID:"pregabalin",
                mg:75,quantityText:"75 mg",time:fixed)
        ]
        XCTAssertEqual(PKConfirmedHealthReconciler.stageAutomatic(events, state:&history,
            catalog:catalog, now:fixed),2)
        let result = PKConfirmedHealthReconciler.reconcile(&history, catalog:catalog, now:fixed)
        XCTAssertEqual(result.inserted,1)
        XCTAssertEqual(result.pendingNearby,1)
        XCTAssertEqual(history.doses.count,1)
    }

    func testNearbyDifferentDoseRequiresReviewAndCanBeSeparate() {
        var history = state()
        history.saveDose(PKDose(id: "existing", drug:"pregabalin",mg:150,
                    time:fixed.addingTimeInterval(-10*60)))
        let review = PKConfirmedHealthReconciler.reconcile(&history, catalog: catalog, now: fixed)
        XCTAssertEqual(review.pendingNearby, 1)
        XCTAssertEqual(review.inserted, 0)
        XCTAssertEqual(history.doses.count, 1)
        var reviews = history.settings["healthEventReviews"]!.object!
        var content = reviews[uuid.uuidString]!.object!
        content["nearbyDecision"] = .string("separate")
        reviews[uuid.uuidString] = .object(content)
        history.settings["healthEventReviews"] = .object(reviews)
        let accepted = PKConfirmedHealthReconciler.reconcile(&history, catalog: catalog, now: fixed)
        XCTAssertEqual(accepted.inserted, 1)
        XCTAssertEqual(history.doses.count, 2)
        XCTAssertFalse(PKConfirmedHealthReconciler.reconcile(&history, catalog: catalog, now: fixed).changed)
    }

    func testSameMedicationOutsideFifteenMinutesCanAutoImport() {
        var history = state()
        history.saveDose(PKDose(id:"earlier", drug:"pregabalin", mg:75,
                    time:fixed.addingTimeInterval(-16*60)))
        let result = PKConfirmedHealthReconciler.reconcile(&history, catalog: catalog, now: fixed)
        XCTAssertEqual(result.pendingNearby, 0)
        XCTAssertEqual(result.inserted, 1)
        XCTAssertEqual(history.doses.count, 2)
    }

    func testRejectedNearEventDoesNotReappearAsPending() {
        var history = state()
        history.saveDose(PKDose(id:"existing",drug:"pregabalin",mg:75,
                              time:fixed.addingTimeInterval(-60)))
        PKConfirmedHealthReconciler.reconcile(&history, catalog:catalog, now:fixed)
        var reviews = history.settings["healthEventReviews"]!.object!
        var content = reviews[uuid.uuidString]!.object!
        content["selected"] = .bool(false)
        reviews[uuid.uuidString] = .object(content)
        history.settings["healthEventReviews"] = .object(reviews)
        let next = PKConfirmedHealthReconciler.reconcile(&history, catalog:catalog, now:fixed)
        XCTAssertEqual(next.pendingNearby,0)
        XCTAssertEqual(history.doses.count,1)
        XCTAssertNil(history.settings["healthEventReviews"]?.object?[uuid.uuidString]?.object?["nearbyRecordID"])
    }

    func testInvalidOrUnreviewedCannotProduceActualDose() {
        for invalid in [Double.nan, -1, 0, 200_000] {
            var history = state(mg: invalid)
            let result = PKConfirmedHealthReconciler.reconcile(&history, catalog: catalog, now: fixed)
            XCTAssertEqual(result.inserted,0)
            XCTAssertTrue(history.records.isEmpty)
        }
        var future = state(time: fixed.addingTimeInterval(3600))
        PKConfirmedHealthReconciler.reconcile(&future, catalog:catalog, now:fixed)
        XCTAssertTrue(future.records.isEmpty)
        var wrong = state()
        var reviews = wrong.settings["healthEventReviews"]!.object!
        var review = reviews[uuid.uuidString]!.object!
        review["source"] = .string("unknown-third-party")
        reviews[uuid.uuidString] = .object(review)
        wrong.settings["healthEventReviews"] = .object(reviews)
        PKConfirmedHealthReconciler.reconcile(&wrong, catalog:catalog, now:fixed)
        XCTAssertTrue(wrong.records.isEmpty)
    }
}
