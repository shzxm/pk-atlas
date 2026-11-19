import SwiftUI

struct PKDataReviewNativeView: View {
    @EnvironmentObject private var store: NativeAppStore
    var selectedIssue: String? = nil
    @State private var editor: PKDose?
    @State private var deleting: PKDose?
    @State private var showExport = false
    @State private var exportURL: URL?
    @State private var errorMessage = ""

    private var report: PKDataHealthReport {
        PKDataHealth.inspect(store.snapshot, catalog: store.catalog)
    }
    private var issues: [PKDataHealthIssue] {
        report.issues.filter { selectedIssue == nil || $0.id == selectedIssue }
    }

    var body: some View {
        List {
            Section {
                Label("只读审核 · 不会自动删除或合并数据", systemImage: "checkmark.shield")
                    .font(.subheadline.bold())
                Text("先核对真实记录；只有格式正确且 ID 不冲突的记录才允许在此直接进入编辑。已过时间的数学计划不属于已服历史。")
                    .font(.caption2).foregroundStyle(.secondary)
                Button {
                    do { exportURL = try store.exportSnapshot() }
                    catch { errorMessage = error.localizedDescription }
                } label: { Label("导出原始 JSON 用于备份与排查", systemImage: "square.and.arrow.up") }
                if let exportURL { ShareLink("分享这份 JSON", item: exportURL) }
                if !errorMessage.isEmpty { Text(errorMessage).foregroundStyle(.orange) }
            }
            if issues.isEmpty {
                ContentUnavailableView("当前未发现对应异常", systemImage: "checkmark.circle")
            }
            ForEach(issues) { issue in
                Section("\(issue.title) · \(issue.count) 条") {
                    Text(issue.detail).font(.caption).foregroundStyle(.secondary)
                    Text("确认无误仅代表您已经审核；不会删除异常记录，也不会更改模型结果。记录内容改变后须重新确认。")
                        .font(.caption2).foregroundStyle(.secondary)
                    let rows = PKDataReview.rows(for: issue.id, snapshot: store.snapshot,
                                                 catalog: store.catalog)
                    ForEach(rows) { entry in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(entry.heading).font(.subheadline.bold())
                            Text(entry.explanation).font(.caption).foregroundStyle(.secondary)
                            let structuralIssue = ["invalidDose", "duplicateID", "invalidMeal"].contains(entry.issueID)
                            if store.isAuditConfirmed(entry.fingerprint) {
                                Label(structuralIssue ? "已核对 · 原始结构异常仍保留" : "已核对 · 确认录入无误",
                                      systemImage: "checkmark.seal.fill")
                                    .font(.caption).foregroundStyle(.mint)
                            }
                            Button {
                                store.setAuditConfirmed(entry.fingerprint,
                                    confirmed: !store.isAuditConfirmed(entry.fingerprint))
                            } label: {
                                Label(store.isAuditConfirmed(entry.fingerprint) ? "撤销确认" :
                                      (structuralIssue ? "确认已查看此条异常" : "确认这条录入没有问题"),
                                      systemImage: store.isAuditConfirmed(entry.fingerprint) ? "arrow.uturn.backward" : "checkmark.circle")
                            }
                            .buttonStyle(.bordered)
                            .accessibilityIdentifier("native.audit.confirm.\(entry.id)")
                            if let dose = entry.dose, entry.canEdit {
                                Button {
                                    editor = dose
                                } label: {
                                    Label("检查并编辑此条实际记录", systemImage: "square.and.pencil")
                                }
                                .buttonStyle(.bordered)
                                .accessibilityIdentifier("native.audit.edit.\(dose.id)")
                            } else {
                                Label("该条需核对原始 JSON；不能安全地直接自动修改", systemImage: "info.circle")
                                    .font(.caption2).foregroundStyle(.orange)
                            }
                        }
                        .padding(.vertical, 5)
                    }
                    if rows.isEmpty {
                        Text("检查源数据时没有可安全定位的条目，请先导出 JSON 核对。")
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                }
            }
        }
        .navigationTitle("数据体检 · 核对清单")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $editor) { DoseEditorNativeView(existing: $0) }
        .accessibilityIdentifier("native.audit.review.list")
    }
}
