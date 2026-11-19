import Foundation

/// A deliberate "show in chart" action targets a mathematical *time*, not
/// whichever day/scroll position happened to be visible before the tap.
/// This is only viewport navigation; it never changes the treatment scenario.
enum PKInverseChartFocus {
    static let halfWindow: TimeInterval = 24 * 3600

    static func adoptedTarget(_ plan: [String: PKJSON]?, fallback: Date) -> Date {
        if let at = plan?["target"]?.number, at.isFinite,
           at > 946_684_800_000, at < 10_000_000_000_000 {
            return Date(timeIntervalSince1970: at / 1000)
        }
        // Legacy scenarios without a target: show the first actual planned
        // node, rather than jumping to an unrelated draft target or to now.
        let chosen = plan?["adjustment"]?.object?["doses"]?.array ??
            plan?["doses"]?.array ?? []
        let times = chosen.compactMap { $0.object?["time"]?.number }
            .filter { $0.isFinite && $0 > 946_684_800_000 && $0 < 10_000_000_000_000 }
        if let first = times.min() { return Date(timeIntervalSince1970: first / 1000) }
        return fallback
    }

    static func chartStart(center: Date) -> Date {
        center.addingTimeInterval(-halfWindow)
    }

    static func browsingCenter(day: Date, now: Date = .now,
                               calendar: Calendar = .current) -> Date {
        if calendar.isDate(day, inSameDayAs: now) { return now }
        return calendar.startOfDay(for: day).addingTimeInterval(12 * 3600)
    }
}
