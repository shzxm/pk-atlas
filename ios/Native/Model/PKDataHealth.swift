import Foundation

struct PKDataHealthIssue: Identifiable, Equatable {
    let id: String
    let title: String
    let detail: String
    let count: Int
}

struct PKDataHealthReport {
    let recordCount: Int
    let mealCount: Int
    let invalidRecords: Int
    let duplicatedIDs: Int
    let similarRecords: Int
    let futureActualRecords: Int
    let unknownDrugRecords: Int
    let invalidMeals: Int

    var hasProblems: Bool {
        invalidRecords + duplicatedIDs + similarRecords + futureActualRecords +
            unknownDrugRecords + invalidMeals > 0
    }
    var issues: [PKDataHealthIssue] {
        [
            PKDataHealthIssue(id: "invalidDose", title: "无法识别的实际记录",
                detail: "缺少有效时间、药物、ID 或剂量，原始数据仍保留。", count: invalidRecords),
            PKDataHealthIssue(id: "duplicateID", title: "重复记录标识",
                detail: "同一 ID 在原始数据中出现多次，应核对导入或同步来源。", count: duplicatedIDs),
            PKDataHealthIssue(id: "nearDuplicate", title: "可能重复录入",
                detail: "相同药物、剂量和相近时间的不同 ID。真实分次服用也可能出现，不会自动删除。", count: similarRecords),
            PKDataHealthIssue(id: "futureDose", title: "未来时间被标记为已服用",
                detail: "可能由旧版或外部导入产生，应查看历史记录后人工核对。", count: futureActualRecords),
            PKDataHealthIssue(id: "unknownDrug", title: "记录使用了未收录的药物代号",
                detail: "原始记录仍然保留，但不能无依据地进行药代计算。", count: unknownDrugRecords),
            PKDataHealthIssue(id: "invalidMeal", title: "无法识别的饮食记录",
                detail: "缺少有效的时间、ID 或类型；不会自动修正。", count: invalidMeals)
        ].filter { $0.count > 0 }
    }
}

enum PKDataHealth {
    static func inspect(_ snapshot: PKCloudState, catalog: PKCatalog,
                        now: Date = .now) -> PKDataHealthReport {
        let names = Set(catalog.drugs.map(\.id))
        var ids = Set<String>()
        var duplicatedIDs = 0, invalid = 0, unknown = 0, future = 0
        let futureLimit = (now.timeIntervalSince1970 + PKDoseEntryGuard.clockTolerance) * 1000
        for row in snapshot.records {
            if let id = row["id"]?.string, !id.isEmpty {
                if !ids.insert(id).inserted { duplicatedIDs += 1 }
            }
            guard let id = row["id"]?.string, !id.isEmpty,
                  let drug = row["drug"]?.string, !drug.isEmpty,
                  let mg = row["mg"]?.number, mg.isFinite, mg > 0,
                  let time = row["time"]?.number, time.isFinite else {
                invalid += 1; continue
            }
            if !names.contains(drug) { unknown += 1 }
            if time > futureLimit { future += 1 }
        }
        let actual = snapshot.doses.sorted { $0.time < $1.time }
        // Limit comparisons to a rolling 5-minute window per drug. This is
        // only an advisory scan; it never deduplicates any real records.
        var windows: [String: [PKDose]] = [:]
        var similar = 0
        for dose in actual {
            var current = windows[dose.drug] ?? []
            current.removeAll { dose.time.timeIntervalSince($0.time) > PKDoseEntryGuard.possibleDuplicateWindow }
            if PKDoseEntryGuard.possibleDuplicate(dose, in: current) != nil { similar += 1 }
            current.append(dose)
            windows[dose.drug] = current
        }
        var invalidMeals = 0
        for meal in snapshot.intakes {
            guard let id = meal["id"]?.string, !id.isEmpty,
                  let time = meal["time"]?.number, time.isFinite,
                  let kind = meal["kind"]?.string, ["meal", "drink"].contains(kind)
            else { invalidMeals += 1; continue }
        }
        return PKDataHealthReport(recordCount: snapshot.records.count,
            mealCount: snapshot.intakes.count, invalidRecords: invalid,
            duplicatedIDs: duplicatedIDs, similarRecords: similar,
            futureActualRecords: future, unknownDrugRecords: unknown,
            invalidMeals: invalidMeals)
    }

    /// Safe support summary. Avoid raw record IDs, medical names, actual mg,
    /// times, private account details, hosts, tokens or URL paths entirely.
    /// Counts can still be sensitive, so this is only copied on explicit tap.
    static func supportSummary(report: PKDataHealthReport, appVersion: String,
                               localSaved: Bool, pendingSync: Bool,
                               sessionVerified: Bool, modelAvailable: Bool) -> String {
        let safeVersion = String(appVersion.prefix(40)).filter {
            $0.isNumber || $0 == "." || $0 == " " || $0 == "（" || $0 == "）" ||
            $0.isASCII && ($0 == "B" || $0 == "u" || $0 == "i" || $0 == "l" || $0 == "d")
        }
        var lines = [
            "药时 · 脱敏技术诊断（仅在用户主动复制后生成）",
            "App：\(safeVersion)",
            "本机加密快照：\(localSaved ? "保存过" : "尚无保存时间")",
            "等待云端同步：\(pendingSync ? "是" : "否")",
            "云端会话已验证：\(sessionVerified ? "是" : "否")",
            "已载入本地数学模型：\(modelAvailable ? "是" : "否")",
            "服药记录条数：\(report.recordCount)",
            "饮食记录条数：\(report.mealCount)"
        ]
        for issue in report.issues {
            lines.append("检查项 \(issue.id)：\(issue.count)")
        }
        lines.append("未包含用户名、设备标识、药物名称、剂量明细、具体时间、账号令牌或网络地址。")
        return lines.joined(separator: "\n")
    }
}
