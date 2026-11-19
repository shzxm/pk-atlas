import Foundation

/// Input integrity for an *already taken* dose, not a clinical dosing limit.
/// A legitimate repeated administration is allowed after an explicit review.
enum PKDoseEntryGuard {
    static let possibleDuplicateWindow: TimeInterval = 5 * 60
    static let clockTolerance: TimeInterval = 2 * 60

    static func isPlanned(_ date: Date, at now: Date = .now) -> Bool {
        date > now
    }

    static func futureTimeNotice(_ date: Date, at now: Date = .now) -> String? {
        isPlanned(date, at: now)
            ? "这条未来日期记录将保存为计划服用，仅用于预测曲线和数学方案；不会被当作已经服用。"
            : nil
    }

    static func possibleDuplicate(_ candidate: PKDose, in doses: [PKDose]) -> PKDose? {
        doses.first { prior in
            prior.id != candidate.id && prior.drug == candidate.drug &&
            abs(prior.time.timeIntervalSince(candidate.time)) <= possibleDuplicateWindow &&
            abs(prior.mg - candidate.mg) <= max(0.0001, abs(candidate.mg) * 0.000001)
        }
    }

    static func mostRecentActual(drugID: String, in doses: [PKDose], at now: Date = .now) -> PKDose? {
        doses.filter { $0.drug == drugID && $0.time <= now.addingTimeInterval(clockTolerance) }
            .max { $0.time < $1.time }
    }

    static func recentTemplates(in doses: [PKDose], limit: Int = 3,
                                at now: Date = .now) -> [PKDose] {
        guard limit > 0 else { return [] }
        var seen = Set<String>()
        return doses.filter { $0.time <= now.addingTimeInterval(clockTolerance) }
            .sorted { $0.time > $1.time }
            .filter { seen.insert($0.drug).inserted }
            .prefix(limit).map { $0 }
    }
}
