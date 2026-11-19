import Foundation
import CryptoKit

struct PKDataReviewRow: Identifiable {
    let id: String
    let issueID: String
    let heading: String
    let explanation: String
    let dose: PKDose?
    let canEdit: Bool
    let fingerprint: String
}

/// Detailed, read-only diagnostics built from the same validation rules as
/// PKDataHealth. Invalid/colliding IDs require an exported-source repair,
/// never a destructive mass delete.
enum PKDataReview {
    static func rows(for issue: String, snapshot: PKCloudState,
                     catalog: PKCatalog, now: Date = .now) -> [PKDataReviewRow] {
        let allDrugs = Dictionary(uniqueKeysWithValues: catalog.drugs.map { ($0.id, $0.name) })
        let doses = snapshot.doses
        var result: [PKDataReviewRow] = []
        let ids = snapshot.records.compactMap { $0["id"]?.string }
        let duplicated = Set(Dictionary(grouping: ids, by: { $0 })
            .filter { $0.value.count > 1 }.keys)
        func fingerprint(_ raw: [String: PKJSON], issue: String, index: Int) -> String {
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.sortedKeys]
            let json = (try? encoder.encode(raw)) ?? Data()
            var payload = Data("v1:\(issue):\(index):".utf8)
            payload.append(json)
            return SHA256.hash(data: payload).map { String(format: "%02x", $0) }.joined()
        }
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        func add(_ row: [String: PKJSON], at index: Int, problem: String, detail: String,
                 canEdit: Bool) {
            let identifier = row["id"]?.string
            let rawDrug = row["drug"]?.string ?? "未提供药物代号"
            let matched = identifier.flatMap { id in doses.first { $0.id == id } }
            let title = allDrugs[rawDrug] ?? rawDrug
            let timestamp = matched.map { formatter.string(from: $0.time) } ?? "时间不可识别"
            let mg = matched.map { "\($0.mg.formatted()) mg" } ?? "剂量不可识别"
            result.append(PKDataReviewRow(id: "\(problem):\(index)",issueID:problem,
                heading: "\(title) · \(mg)",
                explanation: "\(timestamp) · \(detail) · 原始序号 \(index + 1)",
                dose: canEdit ? matched : nil, canEdit: canEdit && matched != nil,
                fingerprint: fingerprint(row, issue: problem, index: index)))
        }
        // Use the same chronological ordering as PKDataHealth.inspect,
        // independent of the raw JSON row ordering (imports are not sorted).
        var windows: [String: [PKDose]] = [:]
        var suspiciousIDs = Set<String>()
        for dose in doses.sorted(by: { $0.time < $1.time }) {
            var current = windows[dose.drug] ?? []
            current.removeAll {
                dose.time.timeIntervalSince($0.time) > PKDoseEntryGuard.possibleDuplicateWindow
            }
            if PKDoseEntryGuard.possibleDuplicate(dose, in: current) != nil {
                suspiciousIDs.insert(dose.id)
            }
            current.append(dose)
            windows[dose.drug] = current
        }
        for (index, raw) in snapshot.records.enumerated() {
            let valid = raw["id"]?.string != nil && raw["drug"]?.string != nil &&
                (raw["mg"]?.number).map { $0.isFinite && $0 > 0 } == true &&
                (raw["time"]?.number).map(\.isFinite) == true
            let identifier = raw["id"]?.string ?? ""
            let isDuplicate = duplicated.contains(identifier)
            let isUnknown = valid && !catalog.drugs.contains { $0.id == raw["drug"]?.string }
            let isFuture = valid && (raw["time"]?.number ?? 0) >
                (now.timeIntervalSince1970 + PKDoseEntryGuard.clockTolerance) * 1000
            if issue == "invalidDose", !valid {
                add(raw,at:index,problem:issue,detail:"原始字段无效，不能在常规编辑器直接修复",canEdit:false)
            }
            if issue == "duplicateID", isDuplicate {
                add(raw,at:index,problem:issue,detail:"多个原始条目使用同一记录ID；禁止一键删除",canEdit:false)
            }
            if issue == "unknownDrug", isUnknown {
                add(raw,at:index,problem:issue,detail:"药物未收录，确认后可以用历史编辑器重新选择",canEdit:!isDuplicate)
            }
            if issue == "futureDose", isFuture {
                add(raw,at:index,problem:issue,detail:"记录时间晚于当前时间，不等于已完成服用",canEdit:!isDuplicate)
            }
            if issue == "nearDuplicate", suspiciousIDs.contains(identifier) {
                add(raw,at:index,problem:issue,
                    detail:"与相近时间同药同剂量的另一条记录重合，请人工确认是否真实分次服用",
                    canEdit:!isDuplicate)
            }
        }
        if issue == "invalidMeal" {
            for (index, row) in snapshot.intakes.enumerated() {
                guard row["id"]?.string != nil,
                    row["time"]?.number.map(\.isFinite) == true,
                    ["meal", "drink"].contains(row["kind"]?.string ?? "") else {
                    result.append(PKDataReviewRow(id: "meal:\(index)",issueID:issue,
                        heading:"第 \(index + 1) 条饮食原始记录", explanation:"原始字段无效，请导出 JSON 进行核对，不会自动删除。",dose:nil,canEdit:false,
                        fingerprint:fingerprint(row,issue:issue,index:index)))
                    continue
                }
            }
        }
        return result
    }
}
