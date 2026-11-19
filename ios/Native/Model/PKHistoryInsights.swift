import Foundation

/// Calendar-day record explorer. These are observations, not a prescribed
/// treatment schedule: empty days never imply missed doses.
enum PKHistoryPeriod: String, CaseIterable, Identifiable {
    case week, month, all
    var id: String { rawValue }
    var title: String { switch self {
        case .week: "近 7 天"
        case .month: "近 30 天"
        case .all: "全部"
    }}
    func start(at now: Date = .now, calendar: Calendar = .current) -> Date? {
        switch self {
        case .week: calendar.date(byAdding: .day, value: -6, to: calendar.startOfDay(for: now))
        case .month: calendar.date(byAdding: .day, value: -29, to: calendar.startOfDay(for: now))
        case .all: nil
        }
    }
}

enum PKHistoryEntry: Identifiable {
    case dose(PKDose), meal(PKIntake)
    var id: String {
        switch self {
        case .dose(let entry): "dose:" + entry.id
        case .meal(let entry): "meal:" + entry.id
        }
    }
    var time: Date { switch self {
        case .dose(let entry): entry.time
        case .meal(let entry): entry.time
    }}
}

struct PKHistoryDay: Identifiable {
    let date: Date
    let entries: [PKHistoryEntry]
    var id: Date { date }
    var doses: [PKDose] { entries.compactMap { if case .dose(let d) = $0 { return d }; return nil } }
    var meals: [PKIntake] { entries.compactMap { if case .meal(let m) = $0 { return m }; return nil } }
    var drugCount: Int { Set(doses.map(\.drug)).count }
    var drugTotals: [(drug: String, count: Int, mg: Double)] {
        Dictionary(grouping: doses, by: \.drug).map { drug, rows in
            (drug: drug, count: rows.count, mg: rows.reduce(0) { $0 + $1.mg })
        }.sorted { $0.drug < $1.drug }
    }
}

enum PKHistoryInsights {
    static func groups(doses: [PKDose], meals: [PKIntake],
                       drugNames: [String: String], period: PKHistoryPeriod,
                       selectedDrug: String? = nil, query: String = "",
                       now: Date = .now, calendar: Calendar = .current) -> [PKHistoryDay] {
        let earliest = period.start(at: now, calendar: calendar)
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let filteredDoses = doses.filter { dose in
            (earliest == nil || dose.time >= earliest!) &&
            (selectedDrug == nil || dose.drug == selectedDrug!) &&
            (needle.isEmpty || (drugNames[dose.drug] ?? dose.drug).localizedCaseInsensitiveContains(needle) ||
             dose.mg.formatted().localizedCaseInsensitiveContains(needle))
        }
        // If filtering one drug, don't silently imply unrelated meals were
        // associated with that drug. They remain visible under "全部药物".
        let filteredMeals = meals.filter { meal in
            selectedDrug == nil && (earliest == nil || meal.time >= earliest!) &&
            (needle.isEmpty || meal.note.localizedCaseInsensitiveContains(needle) ||
             (meal.kind == "meal" ? "用餐 餐 高脂" : "饮品 饮料")
                .localizedCaseInsensitiveContains(needle))
        }
        let events: [PKHistoryEntry] = filteredDoses.map { .dose($0) } + filteredMeals.map { .meal($0) }
        let grouped = Dictionary(grouping: events) { calendar.startOfDay(for: $0.time) }
        return grouped.map { day, values in
            PKHistoryDay(date: day, entries: values.sorted {
                if $0.time == $1.time { return $0.id < $1.id }
                return $0.time > $1.time
            })
        }.sorted { $0.date > $1.date }
    }

    /// Real entries only. Export doesn't invent model projections or conflate
    /// different substances' mg values into an aggregate drug amount.
    static func csv(groups: [PKHistoryDay], names: [String: String]) -> String {
        let headers = ["时间（ISO 8601）", "类型", "药物名称", "药物代号", "已记录剂量(mg)", "餐型", "饮品", "备注", "原始记录ID"]
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        func cell(_ text: String) -> String {
            // Spreadsheet viewers can evaluate imported text as formulas.
            // Prefix possible formula starters so a drug/note cannot execute.
            let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
            let neutralized = trimmed.first.map { "=+-@".contains($0) } == true
                ? "'" + text : text
            return "\"" + neutralized.replacingOccurrences(of: "\"", with: "\"\"") + "\""
        }
        var lines = [headers.map(cell).joined(separator: ",")]
        for entry in groups.flatMap(\.entries) {
            let cols: [String]
            switch entry {
            case .dose(let d):
                cols = [iso.string(from: d.time), "已服用", names[d.drug] ?? d.drug,
                        d.drug, String(d.mg), "", "", "", d.id]
            case .meal(let m):
                cols = [iso.string(from: m.time), m.kind == "meal" ? "用餐" : "饮品",
                        "", "", "", m.mealType, m.drink, m.note, m.id]
            }
            lines.append(cols.map(cell).joined(separator: ","))
        }
        return "\u{FEFF}" + lines.joined(separator: "\r\n") + "\r\n"
    }
}
