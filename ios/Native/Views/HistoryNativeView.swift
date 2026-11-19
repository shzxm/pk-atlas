import SwiftUI
import UniformTypeIdentifiers

struct PKHistoryCSVDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.commaSeparatedText] }
    static var writableContentTypes: [UTType] { [.commaSeparatedText] }
    var text: String

    init(text: String) { self.text = text }
    init(configuration: ReadConfiguration) throws {
        guard let bytes = configuration.file.regularFileContents else {
            throw CocoaError(.fileReadCorruptFile)
        }
        text = String(decoding: bytes, as: UTF8.self)
    }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: Data(text.utf8))
    }
}

struct HistoryNativeView: View {
    @EnvironmentObject private var store: NativeAppStore
    @State private var query = ""
    @State private var editing: PKDose?
    @State private var editingPlan: PKDose?
    @State private var deletingPlan: PKDose?
    @State private var confirmingPlan: PKDose?
    @State private var confirmDelete: PKDose?
    @State private var onlyDrug = "all"
    @State private var period: PKHistoryPeriod = .month
    @State private var exportDocument: PKHistoryCSVDocument?
    @State private var exporting = false
    @State private var exportResult = ""

    private var names: [String: String] {
        Dictionary(uniqueKeysWithValues: store.catalog.drugs.map { ($0.id, $0.name) })
    }
    private var days: [PKHistoryDay] {
        PKHistoryInsights.groups(doses: store.doses, meals: store.meals,
            drugNames: names, period: period,
            selectedDrug: onlyDrug == "all" ? nil : onlyDrug,
            query: query)
    }
    private var doseCount: Int { days.reduce(0) { $0 + $1.doses.count } }
    private var mealCount: Int { days.reduce(0) { $0 + $1.meals.count } }

    private func exportVisible() {
        exportDocument = PKHistoryCSVDocument(text: PKHistoryInsights.csv(groups: days, names: names))
        exporting = true
    }

    var body: some View {
        List {
            Section("计划服用 · 尚未确认发生") {
                if store.scheduledDoses.isEmpty {
                    Text("尚无计划。未来时间录入的剂量将显示在这里及曲线的虚线预测中。")
                        .font(.caption).foregroundStyle(.secondary)
                }
                ForEach(store.scheduledDoses) { dose in
                    HStack(spacing: 10) {
                        Image(systemName: "calendar.badge.clock").foregroundStyle(.purple)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(names[dose.drug] ?? dose.drug).font(.subheadline.bold())
                            Text(dose.time.formatted(date: .abbreviated, time: .shortened))
                                .font(.caption).foregroundStyle(.secondary)
                            Text(dose.time <= .now ? "计划已到时，尚未确认服用" : "未来计划，非实际服用")
                                .font(.caption2).foregroundStyle(.orange)
                        }
                        Spacer(minLength: 5)
                        Text("\(dose.mg.formatted()) mg").font(.caption).monospacedDigit()
                        Button("编辑", systemImage: "pencil") { editingPlan = dose }
                            .labelStyle(.iconOnly)
                        Button("删除", systemImage: "trash", role: .destructive) { deletingPlan = dose }
                            .labelStyle(.iconOnly)
                        if dose.time <= Date.now {
                            Button("确认已服用") { confirmingPlan = dose }
                                .font(.caption)
                        }
                    }
                }
            }
            Section("时间足迹 · 本机记录") {
                Picker("查看范围", selection: $period) {
                    ForEach(PKHistoryPeriod.allCases) { option in
                        Text(option.title).tag(option)
                    }
                }
                .pickerStyle(.segmented)
                .accessibilityIdentifier("native.history.period")
                Picker("筛选药物", selection: $onlyDrug) {
                    Text("全部药物与饮食").tag("all")
                    ForEach(store.catalog.drugs) { drug in Text(drug.name).tag(drug.id) }
                }
                .accessibilityIdentifier("native.history.drug")
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("\(doseCount) 条服用 · \(mealCount) 条饮食")
                            .font(.headline)
                            .accessibilityIdentifier("native.history.summary")
                        Text("覆盖 \(days.count) 个有记录的日期 · 按设备当前时区分组")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button { exportVisible() } label: {
                        Label("导出 CSV", systemImage: "square.and.arrow.up")
                    }
                    .disabled(days.isEmpty)
                    .accessibilityIdentifier("native.history.export.csv")
                }
                if !exportResult.isEmpty {
                    Text(exportResult).font(.caption).foregroundStyle(.secondary)
                }
                Text("这里只汇总真实记录，不把反算计划当成已经服用；不同药物的 mg 不相加，空白日期不代表漏服。CSV 为用户主动导出，包含实际记录明细，勿转发给不信任的服务。原有完整 JSON 备份与网站导入格式保持不变。")
                    .font(.caption2).foregroundStyle(.secondary)
            }
            if days.isEmpty {
                ContentUnavailableView("没有符合筛选条件的记录",
                    systemImage: "calendar.badge.clock",
                    description: Text("试试扩大日期范围、清空搜索或切回全部药物。"))
            } else {
                ForEach(days) { day in
                    Section {
                        if !day.drugTotals.isEmpty {
                            VStack(alignment: .leading, spacing: 5) {
                                Text("这一天的药物记录概览")
                                    .font(.caption.bold()).foregroundStyle(.secondary)
                                ForEach(day.drugTotals.indices, id: \.self) { idx in
                                    let summary = day.drugTotals[idx]
                                    HStack {
                                        Text(names[summary.drug] ?? summary.drug)
                                            .lineLimit(1)
                                        Spacer()
                                        Text("\(summary.count) 次 · \(summary.mg.formatted(.number.precision(.fractionLength(0...3)))) mg")
                                            .monospacedDigit()
                                    }
                                    .font(.caption)
                                }
                            }
                            .padding(.vertical, 4)
                        }
                        ForEach(day.entries) { event in
                            switch event {
                            case .dose(let dose):
                                Button { editing = dose } label: {
                                    HStack(spacing: 12) {
                                        Image(systemName: dose.isImported ? "square.and.arrow.down" : "pills.fill")
                                            .foregroundStyle(.mint)
                                        VStack(alignment: .leading, spacing: 4) {
                                            Text(names[dose.drug] ?? dose.drug).font(.subheadline.bold())
                                            Text(dose.time, format: .dateTime.hour().minute())
                                                .font(.caption).foregroundStyle(.secondary)
                                        }
                                        Spacer()
                                        Text("\(dose.mg.formatted()) mg").monospacedDigit()
                                        Image(systemName: "chevron.right")
                                            .font(.caption2).foregroundStyle(.tertiary)
                                    }
                                    .padding(.vertical, 3)
                                }
                                .tint(.primary)
                                .swipeActions(edge: .trailing) {
                                    Button("删除", role: .destructive) { confirmDelete = dose }
                                }
                            case .meal(let meal):
                                HStack(spacing: 12) {
                                    Image(systemName: meal.kind == "meal" ? "fork.knife" : "cup.and.saucer")
                                        .foregroundStyle(.cyan)
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(meal.kind == "meal"
                                            ? (meal.mealType == "highFat" ? "高脂餐" : "普通餐") : "饮品")
                                            .font(.subheadline.bold())
                                        Text(meal.time, format: .dateTime.hour().minute())
                                            .font(.caption).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    if !meal.note.isEmpty { Text(meal.note).lineLimit(1) }
                                }
                                .padding(.vertical, 3)
                                .swipeActions(edge: .trailing) {
                                    Button("删除", role: .destructive) { store.deleteMeal(meal.id) }
                                }
                            }
                        }
                    } header: {
                        HStack {
                            Text(day.date.formatted(.dateTime.year().month().day().weekday(.wide)))
                            Spacer()
                            Text("\(day.entries.count) 条").font(.caption2)
                        }
                    }
                }
            }
        }
        .searchable(text: $query, prompt: "搜索药物、剂量或饮食备注")
        .navigationTitle("历史 · 时间足迹")
        .nativeKeyboardDismissal()
        .sheet(item: $editing) { dose in DoseEditorNativeView(existing: dose) }
        .sheet(item: $editingPlan) { dose in DoseEditorNativeView(scheduledExisting: dose) }
        .confirmationDialog("确认该计划确实已服用？", isPresented: Binding(
            get: { confirmingPlan != nil }, set: { if !$0 { confirmingPlan = nil } }
        )) {
            Button("确认作为实际服用记录") {
                if let dose = confirmingPlan {
                    if let existing = PKDoseEntryGuard.possibleDuplicate(dose, in: store.doses) {
                        exportResult = "未自动转为实际记录：与已记录的 \(existing.mg.formatted()) mg 时间接近，请先核对避免重复。"
                    } else { _ = store.confirmPlannedDose(dose.id) }
                }
                confirmingPlan = nil
            }
            Button("取消", role: .cancel) { confirmingPlan = nil }
        } message: { Text("只在确实服用后确认。确认才会将计划移入实际模型；这不是服药提醒或剂量建议。") }
        .confirmationDialog("删除这条计划服用？", isPresented: Binding(
            get: { deletingPlan != nil }, set: { if !$0 { deletingPlan = nil } }
        )) {
            Button("删除计划", role: .destructive) {
                if let dose = deletingPlan { store.removePlannedDose(dose.id) }
                deletingPlan = nil
            }
            Button("取消", role: .cancel) { deletingPlan = nil }
        }
        .fileExporter(isPresented: $exporting, document: exportDocument,
                      contentType: .commaSeparatedText,
                      defaultFilename: "PKAtlas-history-\(Date.now.formatted(.iso8601.year().month().day().dateSeparator(.dash)))") { result in
            switch result {
            case .success:
                exportResult = "已导出当前筛选范围的 CSV；包含本机真实记录，不包含推测服药安排。"
            case .failure(let error):
                exportResult = "导出未完成：\(error.localizedDescription)"
            }
        }
        .confirmationDialog("确定删除该服药记录？", item: $confirmDelete) { dose in
            Button("删除", role: .destructive) { store.removeDose(dose.id) }
        } message: { _ in
            Text("删除后，本机模型重新计算，云端数据将在下一次同步时更新。")
        }
        .accessibilityIdentifier("native.history.list")
    }
}

private extension View {
    func confirmationDialog<Item: Identifiable>(
        _ title: String, item: Binding<Item?>,
        @ViewBuilder actions: @escaping (Item) -> some View,
        @ViewBuilder message: @escaping (Item) -> some View
    ) -> some View {
        self.confirmationDialog(title,
            isPresented: Binding(
                get: { item.wrappedValue != nil },
                set: { if !$0 { item.wrappedValue = nil } }
            )) {
                if let current = item.wrappedValue { actions(current) }
            } message: {
                if let current = item.wrappedValue { message(current) }
            }
    }
}
