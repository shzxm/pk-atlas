import Foundation

/// Chart-only hypothetical overlay. Saved future plans and accepted A/B model
/// nodes contribute to one dashed prediction; neither becomes an actual dose.
/// The user's saved plan has priority when the same predicted intake also
/// occurs in an adopted candidate, including after its time has passed.
enum PKScenarioOverlay {
    static func merged(saved: [PKDose], hypothesis: [PKDose], actual: [PKDose],
                       drugID: String, from lower: Date, through upper: Date) -> [PKDose] {
        func same(_ a: PKDose, _ b: PKDose) -> Bool {
            a.id == b.id || (abs(a.time.timeIntervalSince(b.time)) <= 60 &&
                abs(a.mg - b.mg) < 0.0001)
        }
        var proposed: [PKDose] = []
        let knownActual = actual.filter { $0.drug == drugID }
        for dose in saved + hypothesis {
            guard dose.drug == drugID, dose.time >= lower, dose.time <= upper,
                  dose.mg.isFinite, dose.mg > 0, dose.mg < 100_000,
                  !knownActual.contains(where: { same($0, dose) }),
                  !proposed.contains(where: { same($0, dose) }) else { continue }
            proposed.append(dose)
        }
        return proposed.sorted { $0.time < $1.time }
    }
}
