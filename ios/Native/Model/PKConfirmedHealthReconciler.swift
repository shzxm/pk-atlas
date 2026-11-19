import Foundation

/// Imports high-confidence, already-taken HealthKit events into the normal
/// actual-dose model. An ambiguous near-time event is only a pending proposal
/// until the user explicitly chooses link versus an independent dose.
/// Review-only / unselected events never become calculation inputs.
/// No unreviewed dose, dose-count or volume unit is converted automatically.
enum PKConfirmedHealthReconciler {
    struct Summary: Equatable {
        var inserted = 0
        var linked = 0
        var updated = 0
        var removed = 0
        var skipped = 0
        var pendingNearby = 0
        var changed = false
    }

    /// The time proximity is a duplicate-review heuristic, not a model rule.
    static let proximitySeconds: TimeInterval = 15 * 60

    /// Stage previously unreviewed, confident .taken events in the existing
    /// account review ledger. No dosage conversion or fuzzy matching occurs.
    /// A user rejection for a UUID persists across subsequent Health reads.
    @discardableResult
    static func stageAutomatic(_ events: [PKHealthDoseMatch],
                               state: inout PKCloudState,
                               catalog: PKCatalog,
                               now: Date = .now) -> Int {
        var reviews = state.settings["healthEventReviews"]?.object ?? [:]
        let mappings = state.settings["healthMedicationMappings"]?.object ?? [:]
        let validIDs = Set(catalog.drugs.map(\.id))
        var added = 0
        for event in events {
            let key = event.eventUUID.uuidString
            guard reviews[key] == nil,
                  !PKHealthMedications.isUnlinkedName(event.medicationName),
                  let mg = event.mg, mg.isFinite, mg > 0, mg < 100_000,
                  event.time > Date(timeIntervalSince1970: 946_684_800),
                  event.time <= now.addingTimeInterval(120) else { continue }
            let alias = PKHealthMedications.canonicalKey(event.medicationName)
            let explicitDrug = mappings[alias]?.object?["drugId"]?.string
            guard let drug = explicitDrug ?? event.drugID,
                  validIDs.contains(drug) else { continue }
            reviews[key] = .object([
                "selected": .bool(true),
                "drugId": .string(drug),
                "doseMG": .number(mg),
                "time": .number(event.time.timeIntervalSince1970 * 1000),
                "sourceName": .string(event.medicationName),
                "source": .string("healthkit-auto-match"),
                "reviewedAt": .number(now.timeIntervalSince1970 * 1000)
            ])
            added += 1
        }
        if added > 0 { state.settings["healthEventReviews"] = .object(reviews) }
        return added
    }

    @discardableResult
    static func reconcile(_ state: inout PKCloudState,
                          catalog: PKCatalog,
                          now: Date = .now) -> Summary {
        var report = Summary()
        guard var reviews = state.settings["healthEventReviews"]?.object else { return report }
        let validDrugs = Set(catalog.drugs.map(\.id))
        var links = state.settings["healthDoseLinks"]?.object ?? [:]
        let before = state
        let nowMS = now.timeIntervalSince1970 * 1000

        // Process chronological records, avoiding a duplicate when two HealthKit
        // event UUIDs describe the same intake within the proximity window.
        let sorted = reviews.sorted { lhs, rhs in
            let a = lhs.value.object?["time"]?.number ?? 0
            let b = rhs.value.object?["time"]?.number ?? 0
            return a == b ? lhs.key < rhs.key : a < b
        }
        for (rawUUID, rawReview) in sorted {
            guard let uuid = UUID(uuidString: rawUUID),
                  var review = rawReview.object,
                  ["healthkit-manual-review", "healthkit-auto-match"]
                    .contains(review["source"]?.string ?? "") else {
                continue
            }
            let key = uuid.uuidString
            let managedId = "healthkit-" + key
            let currentLink = links[key]?.string
            let chosen = { () -> Bool in
                if case .bool(true)? = review["selected"] { return true }
                return false
            }()
            if !chosen {
                if review.removeValue(forKey: "nearbyRecordID") != nil {
                    reviews[key] = .object(review)
                }
                // Only revoke a record created by our HealthKit importer.
                // A linked manual or legacy record must remain untouched.
                if currentLink == managedId || currentLink == nil {
                    state.records.removeAll { row in
                        row["id"]?.string == managedId &&
                        row["source"]?.string == "healthkit-read"
                    }
                }
                links.removeValue(forKey: key)
                continue
            }
            guard let drug = review["drugId"]?.string,
                  validDrugs.contains(drug),
                  let mg = review["doseMG"]?.number,
                  mg.isFinite, mg > 0, mg < 100_000,
                  let timeMS = review["time"]?.number,
                  timeMS.isFinite, timeMS > 946_684_800_000,
                  timeMS <= nowMS + 120_000 else {
                // A corrected or removed mapping/dose must not leave a stale
                // Health-created calculation node in the active model.
                if currentLink == managedId || currentLink == nil {
                    state.records.removeAll { row in
                        row["id"]?.string == managedId &&
                        row["source"]?.string == "healthkit-read"
                    }
                }
                links.removeValue(forKey: key)
                if review.removeValue(forKey: "nearbyRecordID") != nil {
                    reviews[key] = .object(review)
                }
                report.skipped += 1
                continue
            }
            let date = Date(timeIntervalSince1970: timeMS / 1000)
            if let currentLink {
                if currentLink == managedId,
                   let index = state.records.firstIndex(where: {
                       $0["id"]?.string == managedId &&
                       $0["source"]?.string == "healthkit-read"
                   }) {
                    let existing = state.records[index]
                    if existing["drug"]?.string != drug ||
                       existing["mg"]?.number != mg ||
                       existing["time"]?.number != timeMS {
                        state.saveDose(PKDose(id: managedId, drug: drug, mg: mg, time: date))
                        report.updated += 1
                    }
                } else if !state.records.contains(where: { $0["id"]?.string == currentLink }) {
                    // A user may have deleted the linked historical record.
                    // Never silently resurrect it on the next Health read.
                    report.skipped += 1
                }
                continue
            }
            if state.records.contains(where: {
                $0["id"]?.string == managedId && $0["source"]?.string == "healthkit-read"
            }) {
                links[key] = .string(managedId)
                continue
            }
            // Any prior actual intake of the *same drug* within 15 minutes
            // might be a double-entry, regardless of the listed dose. Never
            // silently link or add it as a second dose.
            let nearby = state.doses
                .filter { dose in
                    dose.id != managedId && dose.drug == drug &&
                    abs(dose.time.timeIntervalSince(date)) <= proximitySeconds
                }
                .min { left, right in
                    abs(left.time.timeIntervalSince(date)) < abs(right.time.timeIntervalSince(date))
                }
            if let nearby {
                let resolution = review["nearbyDecision"]?.string ?? ""
                if resolution == "link:\(nearby.id)" {
                    // Explicitly confirmed that the Health event represents
                    // the same real intake already recorded in the model.
                    links[key] = .string(nearby.id)
                    review.removeValue(forKey: "nearbyRecordID")
                    reviews[key] = .object(review)
                    report.linked += 1
                    continue
                }
                if resolution != "separate" {
                    if review["nearbyRecordID"]?.string != nearby.id {
                        review["nearbyRecordID"] = .string(nearby.id)
                        reviews[key] = .object(review)
                    }
                    report.pendingNearby += 1
                    continue
                }
            }
            if review.removeValue(forKey: "nearbyRecordID") != nil {
                reviews[key] = .object(review)
            }
            state.saveDose(PKDose(id: managedId, drug: drug, mg: mg, time: date))
            if let index = state.records.firstIndex(where: { $0["id"]?.string == managedId }) {
                state.records[index]["source"] = .string("healthkit-read")
            }
            links[key] = .string(managedId)
            report.inserted += 1
        }
        if reviews != state.settings["healthEventReviews"]?.object {
            state.settings["healthEventReviews"] = .object(reviews)
        }
        if links != state.settings["healthDoseLinks"]?.object {
            state.settings["healthDoseLinks"] = .object(links)
        }
        report.removed = before.records.filter { row in
            row["source"]?.string == "healthkit-read" &&
            !state.records.contains(where: { $0["id"]?.string == row["id"]?.string })
        }.count
        report.changed = state != before
        return report
    }
}
