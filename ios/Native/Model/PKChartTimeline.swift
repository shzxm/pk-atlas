import Foundation

/// One common virtual clock for both the actual-dose and inverse charts.
/// The visible day slides within a 72h rolling buffer and each recenter moves
/// all time-series, vertical markers, reference levels and inverse scenarios.
enum PKChartTimeline {
    static let visibleDuration: TimeInterval = 24 * 3600
    static let bufferDuration: TimeInterval = 72 * 3600
    static let reloadDistance: TimeInterval = 14 * 3600
    static let initialPast: TimeInterval = 8 * 3600
    static let sampleMinutes = 10

    static func initialScrollStart(at now: Date) -> Date {
        now.addingTimeInterval(-initialPast)
    }

    static func bufferStart(around center: Date) -> Date {
        center.addingTimeInterval(-bufferDuration / 2)
    }

    static func bufferEnd(around center: Date) -> Date {
        center.addingTimeInterval(bufferDuration / 2)
    }

    static func nextCenter(scrollStart: Date, currentCenter: Date) -> Date? {
        let visibleCenter = scrollStart.addingTimeInterval(visibleDuration / 2)
        return abs(visibleCenter.timeIntervalSince(currentCenter)) > reloadDistance
            ? visibleCenter : nil
    }
}
