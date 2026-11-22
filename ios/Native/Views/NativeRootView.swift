import SwiftUI
import Charts
import UIKit

private enum AtlasStyle {
    static let background = PKSystemPalette.background
    static let accent = PKSystemPalette.accent
    static let warm = Color(red: 0.99, green: 0.78, blue: 0.50)
    static let mint = Color(red: 0.44, green: 0.86, blue: 0.74)
}

enum NativeTab: Hashable {
    case today, chart, inverse, history, settings
}

struct NativeRootView: View {
    @StateObject private var store = NativeAppStore.shared
    @StateObject private var reminders = NativeReminderScheduler.shared
    @Environment(\.scenePhase) private var scenePhase
    @State private var showGlobalDose = false
    @State private var showGlobalMeal = false
    @State private var showGlobalChoice = false


    @ToolbarContentBuilder
    private var globalAdd: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Button {
                showGlobalChoice = true
            } label: {
                Label("新增记录", systemImage: "plus.circle.fill")
            }
            .accessibilityIdentifier("native.global.add.dose")
        }
    }

    var body: some View {
        TabView(selection: $store.activeTab) {
            Tab("今天", systemImage: "house.fill", value: .today) {
                NavigationStack { TodayNativeView().toolbar { globalAdd } }
            }
            // Keep the entire expensive stand-alone chart out of the view
            // hierarchy when disabled. Its Swift plot/remote history tasks
            // therefore do not run until explicitly enabled under 我的.
            if store.mainChartEnabled {
                Tab("曲线", systemImage: "waveform.path.ecg", value: .chart) {
                    NavigationStack { ChartNativeView().toolbar { globalAdd } }
                }
            }
            Tab("反算", systemImage: "function", value: .inverse) {
                NavigationStack { InverseNativeView().toolbar { globalAdd } }
            }
            Tab("历史", systemImage: "clock.arrow.circlepath", value: .history) {
                NavigationStack { HistoryNativeView().toolbar { globalAdd } }
            }
            Tab("我的", systemImage: "person.crop.circle", value: .settings) {
                NavigationStack { SettingsNativeView().toolbar { globalAdd } }
            }
        }
        .tint(AtlasStyle.accent)
        .onChange(of: store.mainChartEnabled) { _, enabled in
            if !enabled && store.activeTab == .chart { store.activeTab = .inverse }
        }
        .onChange(of: store.activeTab) { _, selected in
            if selected == .chart && !store.mainChartEnabled { store.activeTab = .inverse }
        }
        .onAppear {
            if !store.mainChartEnabled && store.activeTab == .chart { store.activeTab = .inverse }
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            if !store.healthAutoNotice.isEmpty {
                HStack(spacing: 8) {
                    Image(systemName: "heart.text.square.fill")
                    Text(store.healthAutoNotice)
                        .font(.caption.weight(.semibold))
                    Spacer(minLength: 0)
                    Button("知道了", systemImage: "xmark.circle") {
                        store.clearHealthAutoNotice()
                    }
                    .labelStyle(.iconOnly)
                    .accessibilityIdentifier("native.health.notice.dismiss")
                }
                .padding(10)
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
                .padding(.horizontal, 12)
                .accessibilityIdentifier("native.health.auto-notice")
            }
        }
        .sheet(isPresented: $showGlobalDose) { DoseEditorNativeView() }
        .sheet(isPresented: $showGlobalMeal) { MealEditorNativeView() }
        .confirmationDialog("新增哪种实际记录？", isPresented: $showGlobalChoice,
                            titleVisibility: .visible) {
            Button("记录已经服用的药物", systemImage: "pills.fill") {
                showGlobalDose = true
            }
            .accessibilityIdentifier("native.global.choice.dose")
            Button("记录用餐或饮品", systemImage: "fork.knife") {
                showGlobalMeal = true
            }
            .accessibilityIdentifier("native.global.choice.meal")
            Button("取消", role: .cancel) {}
        } message: {
            Text("这里只登记已发生的实际事件，不会直接采用数学模型的假设节点。")
        }
        .environmentObject(store)
        .environmentObject(reminders)
        // Follow the operating system; never force night mode.
        // UI always renders the saved snapshot synchronously. Network checks,
        // including HealthKit, never gate the tab bar or its charts.
        .task { await store.start() }
        // Foreground only. iOS suspends apps in the background and without
        // configured APNs there is no honest way to guarantee 5s background
        // delivery. Fast-path polls transfer only a version integer.
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            while !Task.isCancelled {
                await store.refreshIfCloudRevisionChanged()
                do { try await Task.sleep(for: .seconds(4)) }
                catch { break }
            }
        }
        .task { await PKHealthMedications.shared.refreshAutomatically() }
        .task { await store.refreshModel(force: true) }
        .task { await store.checkNativeRelease(force: false) }
        .onChange(of: store.accessState) { _, access in
            if access == .verified {
                store.reconcileAutomaticHealthEvents(PKHealthMedications.shared.matches)
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                PKBackgroundSync.schedule()
                Task { await store.refreshModel() }
                Task { await store.checkNativeRelease() }
                Task { await PKHealthMedications.shared.refreshAutomatically() }
                Task {
                    // Validate the session in the background with a cooldown.
                    // Never lock or erase cached pages for an offline failure.
                    await store.start()
                    if store.accessState == .verified {
                        await store.refresh()
                        await store.refreshAdoptedReview()
                        await reminders.refresh()
                    }
                }
            }
        }
        .alert("发现药时 App 新版本", isPresented: $store.showingReleaseUpdatePrompt) {
            if let url = store.latestRelease?.privateReleaseURL {
                Button("查看 GitHub 私有 Release") { UIApplication.shared.open(url) }
            }
            Button("稍后更新", role: .cancel) {}
        } message: {
            if let release = store.latestRelease {
                Text("最新版本 \(release.displayVersion)；当前为 \(store.installedReleaseDescription)。\n\n\(release.releaseNotes)\n\n私有 GitHub Release 可能以 ZIP 提供原始 IPA。解压后须使用自己的签名方式安装。你也可以在 iCloud 云盘「下载」中找到原始 IPA；App 不会自动下载安装。")
            }
        }
        .alert("需要更新药时 App", isPresented: $store.showingModelUpgradePrompt) {
            Button("知道了", role: .cancel) {}
        } message: {
            Text("网站算法采用了当前版本不认识的反算优化能力，已保留原有可用模型。请安装新版未签名 IPA 后再同步。")
        }
        .alert("药时", isPresented: $store.showingError) {
            Button("确定", role: .cancel) {}
        } message: {
            Text(store.errorMessage)
        }
    }
}

struct ModelNotice: View {
    var body: some View {
        Label("群体药代模型 · 不是个人血药实测，也不是用药建议", systemImage: "info.circle")
            .font(.caption)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
    }
}

struct GlassPanel<Content: View>: View {
    @ViewBuilder let content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 14) { content }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .glassEffect(.regular, in: .rect(cornerRadius: 22))
    }
}

struct MetricTile: View {
    let label: String
    let amount: String
    let unit: String
    let tint: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            HStack(alignment: .firstTextBaseline, spacing: 5) {
                Text(amount).font(.system(size: 25, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.42)
                    .layoutPriority(1)
                Text(unit).font(.system(size: 10)).foregroundStyle(.secondary)
                    .lineLimit(1).minimumScaleFactor(0.8)
            }
            Rectangle().fill(tint).frame(height: 3).clipShape(Capsule())
        }
        .frame(maxWidth: .infinity, minHeight: 88, alignment: .leading)
        .padding(10)
        .glassEffect(.regular, in: .rect(cornerRadius: 18))
    }
}

struct DrugNativePicker: View {
    @EnvironmentObject var store: NativeAppStore
    var body: some View {
        Picker("药物", selection: Binding(
            get: { store.selectedDrugID },
            set: { store.switchDrug($0) }
        )) {
            ForEach(store.catalog.drugs) { drug in
                Text(drug.name).tag(drug.id)
            }
        }
        .pickerStyle(.menu)
        .accessibilityIdentifier("native.drug.picker")
    }
}

struct TodayNativeView: View {
    @EnvironmentObject var store: NativeAppStore
    @State private var addDose = false
    @State private var addMeal = false
    @State private var quickTemplate: PKDose?
    @State private var editingTodayDose: PKDose?

    private var recent: [PKDose] {
        store.doses.filter { Calendar.current.isDateInToday($0.time) }
            .sorted { $0.time > $1.time }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 19) {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Image(systemName: "pills.circle.fill")
                            .font(.title)
                            .foregroundStyle(AtlasStyle.mint)
                        Text("药时").font(.largeTitle.bold())
                        Spacer()
                        Menu {
                            ForEach(store.catalog.drugs) { drug in
                                Button(drug.name) { store.switchDrug(drug.id) }
                            }
                        } label: {
                            VStack(alignment: .trailing, spacing: 3) {
                                Text(store.selectedDrug?.name ?? "选择药物")
                                    .font(.title2.bold())
                                    .foregroundStyle(AtlasStyle.warm)
                                    .multilineTextAlignment(.trailing)
                                Label("切换当前药物", systemImage: "chevron.down")
                                    .font(.caption2).foregroundStyle(.secondary)
                            }
                            .lineLimit(2)
                        }
                        .accessibilityIdentifier("native.today.drug.right")
                    }
                    ModelNotice()
                }

                if let drug = store.selectedDrug {
                    if drug.canCalculate {
                        let blood = store.model.concentration(drug, at: .now)
                        let equivalent = store.model.equivalent(drug, at: .now)
                        LazyVGrid(columns: [GridItem(.flexible(minimum: 0), spacing: 8),
                                            GridItem(.flexible(minimum: 0), spacing: 8)], spacing: 8) {
                            MetricTile(label: "当前模型浓度",
                                       amount: blood.isFinite ? blood.formatted(.number.precision(.fractionLength(2))) : "不可用",
                                       unit: "mg/L", tint: AtlasStyle.warm)
                            MetricTile(label: "剂量等效量",
                                       amount: equivalent.isFinite ? equivalent.formatted(.number.precision(.fractionLength(1))) : "不可用",
                                       unit: "mg", tint: AtlasStyle.mint)
                        }
                        GlassPanel {
                            HStack {
                                Label("本地药代参数", systemImage: "function")
                                    .font(.headline)
                                Spacer()
                                Image(systemName: "checkmark.icloud").foregroundStyle(.secondary)
                            }
                            HStack(spacing: 16) {
                                VStack(alignment: .leading) {
                                    Text("参考达峰").font(.caption).foregroundStyle(.secondary)
                                    Text("\((drug.tmax ?? 0).formatted()) h").font(.title3.bold())
                                }
                                Spacer()
                                VStack(alignment: .leading) {
                                    Text("消除半衰期").font(.caption).foregroundStyle(.secondary)
                                    Text("\(store.model.effectiveHalfLife(drug).formatted(.number.precision(.fractionLength(2)))) h")
                                        .font(.title3.bold())
                                }
                            }
                            Text("每次改变剂量、用餐或模型时间后，直接在设备内重新计算。")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    } else {
                        GlassPanel {
                            Label("记录专用药物", systemImage: "note.text")
                            Text("尚无可用于量化浓度的可靠参数，只显示已服记录。")
                                .font(.callout).foregroundStyle(.secondary)
                        }
                    }
                }

                if store.adoptedPlanObject() != nil {
                    GlassPanel {
                        HStack {
                            Label("已采用模型 · 下一个预计节点", systemImage: "clock.badge.checkmark")
                                .font(.headline)
                            Spacer()
                            Text("方案 \(store.adoptedPlanObject()?["variant"]?.string ?? "A")")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        if let review = store.adoptedReview {
                            let active = store.selectedAdoptedDoses().sorted { $0.time < $1.time }
                            if let upcoming = active.first {
                                Text(upcoming.time,
                                     format: .dateTime.month().day().weekday().hour().minute())
                                    .font(.title2.bold()).monospacedDigit()
                                    .foregroundStyle(AtlasStyle.mint)
                                    .accessibilityIdentifier("native.today.next-node.time")
                                Text(upcoming.time < .now ?
                                     "当前已采用节点已到时、尚未确认：\(upcoming.mg.formatted(.number.precision(.fractionLength(0...2)))) mg" :
                                     "当前已采用的预计节点：\(upcoming.mg.formatted(.number.precision(.fractionLength(0...2)))) mg")
                                    .font(.callout).foregroundStyle(.secondary)
                            } else {
                                Text("当前已采用方案没有待确认节点")
                                    .font(.subheadline.bold()).foregroundStyle(.mint)
                            }
                            Text("当前已采用方案待确认 \(active.count) 个 · 旧版方案节点不重复检查")
                                .font(.caption).foregroundStyle(.secondary)
                            if active.isEmpty {
                                Label("当前没有未确认的已采用计划节点", systemImage: "checkmark.circle")
                                    .font(.caption).foregroundStyle(.mint)
                            } else {
                                ForEach(Array(active.enumerated()), id: \.offset) { index, node in
                                    Divider().opacity(0.22)
                                    HStack(spacing: 9) {
                                        Image(systemName: node.time < .now ? "clock.badge.exclamationmark" : "clock")
                                            .foregroundStyle(node.time < .now ? .orange : .cyan)
                                        VStack(alignment: .leading, spacing: 3) {
                                            Text("当前节点 \(index + 1) · \(node.time.formatted(date: .abbreviated, time: .shortened))")
                                                .font(.subheadline.bold())
                                            Text(node.time < .now ? "已过预计时间 · 尚未确认" : "预计执行节点 · 尚未确认")
                                                .font(.caption2).foregroundStyle(.secondary)
                                        }
                                        Spacer()
                                        Text("\(node.mg.formatted(.number.precision(.fractionLength(0...2)))) mg")
                                            .font(.subheadline.bold()).monospacedDigit()
                                    }
                                    .accessibilityIdentifier("native.today.active.node.\(index)")
                                }
                            }
                            Text("这里只显示当前已采用的数学节点；已替换的旧方案仍保留数学历史，但不再产生确认或提醒。")
                                .font(.caption2).foregroundStyle(.secondary)
                        } else {
                            ProgressView("正在按照网页版规则匹配所有原计划节点…")
                        }
                        Button {
                            store.activeTab = .inverse
                        } label: {
                            Label("查看节点匹配和即时调整意见", systemImage: "arrow.right")
                        }
                        .buttonStyle(.glass)
                    }
                }

                GlassPanel {
                    HStack {
                        Text("今天的记录").font(.headline)
                        Spacer()
                        Text("\(recent.count) 条").font(.caption).foregroundStyle(.secondary)
                    }
                    if recent.isEmpty {
                        ContentUnavailableView("今天还没有服用记录",
                                               systemImage: "pills",
                                               description: Text("只记录已经实际服用的药物"))
                            .frame(maxWidth: .infinity)
                    } else {
                        ForEach(recent) { dose in
                            HStack(spacing: 10) {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundStyle(AtlasStyle.mint)
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(store.catalog.drugs.first(where: { $0.id == dose.drug })?.name
                                         ?? dose.drug).font(.subheadline.bold())
                                    Text(dose.time, format: .dateTime.hour().minute())
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Text("\(dose.mg.formatted()) mg").monospacedDigit()
                                Button {
                                    editingTodayDose = dose
                                } label: {
                                    Label("编辑", systemImage: "pencil")
                                }
                                .buttonStyle(.borderless)
                                .accessibilityIdentifier("native.today.edit.\(dose.id)")
                            }
                            if dose.id != recent.last?.id { Divider().opacity(0.35) }
                        }
                    }
                }

                let templates = PKDoseEntryGuard.recentTemplates(in: store.doses)
                if !templates.isEmpty {
                    GlassPanel {
                        HStack {
                            Label("快速记录 · 沿用历史填写", systemImage: "arrow.uturn.backward.circle")
                                .font(.headline)
                            Spacer()
                            Text("仅用于已实际服用")
                                .font(.caption2).foregroundStyle(.secondary)
                        }
                        ForEach(templates) { dose in
                            Button {
                                quickTemplate = dose
                            } label: {
                                HStack(spacing: 9) {
                                    Image(systemName: "square.and.pencil")
                                    Text(store.catalog.drugs.first(where: { $0.id == dose.drug })?.name ?? dose.drug)
                                        .lineLimit(1)
                                    Spacer()
                                    Text("\(dose.mg.formatted()) mg")
                                        .monospacedDigit()
                                    Image(systemName: "chevron.right")
                                        .font(.caption2)
                                }
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("native.today.quick-template.\(dose.drug)")
                        }
                        Text("只预填上一次实际记录的药物与剂量，时间自动设为现在；不会自动新增，也不代表建议再次服用。")
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                }

                HStack(spacing: 12) {
                    Button {
                        addDose = true
                    } label: {
                        Label("记录服用", systemImage: "plus.circle.fill")
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 10)
                    }
                    .buttonStyle(.glassProminent)
                    .accessibilityIdentifier("native.add.dose")
                    Button {
                        addMeal = true
                    } label: {
                        Label("饮食记录", systemImage: "fork.knife")
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 10)
                    }
                    .buttonStyle(.glass)
                }
                Label(store.syncStatus, systemImage: store.conflict ? "exclamationmark.icloud" : "checkmark.icloud")
                    .font(.caption2)
                    .foregroundStyle(store.conflict ? .orange : .secondary)
                    .padding(.vertical, 4)
            }
            .frame(maxWidth: 840)
            .frame(maxWidth: .infinity)
            .padding(18)
        }
        .background(AtlasStyle.background)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $addDose) { DoseEditorNativeView() }
        .sheet(item: $editingTodayDose) { dose in DoseEditorNativeView(existing: dose) }
        .sheet(item: $quickTemplate) { item in DoseEditorNativeView(template: item) }
        .sheet(isPresented: $addMeal) { MealEditorNativeView() }
    }
}

struct DoseEditorNativeView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var store: NativeAppStore
    var existing: PKDose?
    var template: PKDose? = nil
    var scheduledExisting: PKDose? = nil
    /// Editing an adopted mathematical node, not a taken dose record.
    var adoptedNodeIndex: Int? = nil
    var adoptedAdjustmentIndex: Int? = nil

    @State private var drugID = ""
    @State private var amount = ""
    @State private var when = Date.now
    @State private var confirmDelete = false
    @State private var possibleDuplicate: PKDose?
    @State private var showingPossibleDuplicate = false
    @State private var validationProblem: String?

    private var number: Double? {
        guard let parsed = Double(amount.replacingOccurrences(of: ",", with: ".")),
              parsed.isFinite, parsed > 0, parsed < 100_000 else { return nil }
        return parsed
    }

    private var isPlan: Bool {
        adoptedNodeIndex != nil || adoptedAdjustmentIndex != nil ||
        scheduledExisting != nil || PKDoseEntryGuard.isPlanned(when)
    }
    private func commitRecord(allowDuplicate: Bool = false) {
        guard let mg = number, !drugID.isEmpty else { return }
        let candidate = PKDose(id: existing?.id ?? scheduledExisting?.id ?? UUID().uuidString,
            drug: drugID, mg: mg, time: when,
            courseId: existing?.courseId,
            unit: "mg", isImported: existing?.isImported ?? false)
        if !allowDuplicate,
           !isPlan,
           let duplicate = PKDoseEntryGuard.possibleDuplicate(candidate, in: store.doses) {
            possibleDuplicate = duplicate
            showingPossibleDuplicate = true
            return
        }
        if let adoptedAdjustmentIndex {
            guard store.updateAdoptedAdjustmentNode(index: adoptedAdjustmentIndex,
                                                     mg: mg, time: when) else {
                validationProblem = "已采用调整节点已发生变更，请重新核对。"
                return
            }
        } else if let adoptedNodeIndex {
            guard store.updateAdoptedNode(index: adoptedNodeIndex, mg: mg, time: when) else {
                validationProblem = "已采用计划节点已在其他设备更新，请重新进入页面核对。"
                return
            }
        } else if isPlan {
            store.savePlannedDose(candidate, replacingActual: existing?.id)
        } else {
            store.editDose(candidate)
        }
        dismiss()
    }

    var body: some View {
        NavigationStack {
            Form {
                Section(isPlan ? "计划服用 · 尚未发生" : "已服用的记录") {
                    Picker("药物", selection: $drugID) {
                        ForEach(store.catalog.drugs) { d in
                            Text(d.name).tag(d.id)
                        }
                    }
                    .disabled(adoptedNodeIndex != nil || adoptedAdjustmentIndex != nil)
                    HStack {
                        Text("剂量")
                        TextField("毫克", text: $amount)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .accessibilityIdentifier("native.dose.amount")
                        Text("mg").foregroundStyle(.secondary)
                    }
                    DatePicker(isPlan ? "计划时间" : "服用时间", selection: $when,
                               displayedComponents: [.date, .hourAndMinute])
                    if isPlan {
                        Label((adoptedNodeIndex != nil || adoptedAdjustmentIndex != nil) ? "正在修改已采用数学情景节点；不会创建实际服药记录。" : "未来时间将保存为计划，不计入实际已服用浓度。预测曲线会叠加该节点，只有完成确认才能记为实际服用。", systemImage: "calendar.badge.clock")
                            .font(.footnote).foregroundStyle(.orange)
                            .accessibilityIdentifier("native.dose.future-notice")
                    }
                    if existing == nil,
                       let last = PKDoseEntryGuard.mostRecentActual(drugID: drugID, in: store.doses) {
                        Button {
                            amount = last.mg.formatted()
                        } label: {
                            Label("填入本药上次实际记录的剂量 · \(last.mg.formatted()) mg",
                                  systemImage: "clock.arrow.circlepath")
                        }
                        .accessibilityIdentifier("native.dose.use-last")
                    }
                }
                Section {
                    Text(isPlan ? "这是一条数学计划，不会自动变成实际服药，也不会自动创建服药提醒。" : "当前时间保存为实际已服用记录；未来时间仅作为计划情景。模型不构成服药建议。")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                if existing != nil || scheduledExisting != nil || adoptedNodeIndex != nil || adoptedAdjustmentIndex != nil {
                    Section {
                        Button((adoptedNodeIndex != nil || adoptedAdjustmentIndex != nil) ? "删除该已采用计划节点" : isPlan ? "删除该计划" : "删除该记录", role: .destructive) { confirmDelete = true }
                    }
                }
            }
            .nativeKeyboardDismissal()
            .navigationTitle((adoptedNodeIndex != nil || adoptedAdjustmentIndex != nil) ? "修改已采用计划节点" : scheduledExisting != nil ? "编辑计划服用" : existing != nil ? "编辑服药" : isPlan ? "新增计划服用" : "记录服药")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isPlan ? "保存计划" : "保存实际记录") { commitRecord() }
                    .disabled(number == nil || drugID.isEmpty)
                    .accessibilityIdentifier("native.dose.save")
                }
            }
            .confirmationDialog("确定删除这条服药记录？", isPresented: $confirmDelete) {
                Button("确认删除", role: .destructive) {
                    if let existing { store.removeDose(existing.id) }
                    if let scheduledExisting { store.removePlannedDose(scheduledExisting.id) }
                    if let adoptedNodeIndex { _ = store.deleteAdoptedNode(index: adoptedNodeIndex) }
                    if let adoptedAdjustmentIndex {
                        _ = store.deleteAdoptedAdjustmentNode(index: adoptedAdjustmentIndex)
                    }
                    dismiss()
                }
            } message: {
                Text("删除会影响本机计算并同步到云端，请先核对。")
            }
            .confirmationDialog("发现可能重复的实际服用记录", isPresented: $showingPossibleDuplicate) {
                Button("仍然保存这条记录") { commitRecord(allowDuplicate: true) }
                Button("返回检查", role: .cancel) {}
            } message: {
                if let match = possibleDuplicate {
                    Text("已有相同药物、相同剂量且时间相差不超过 5 分钟的记录：\(match.mg.formatted()) mg · \(match.time.formatted(date: .abbreviated, time: .shortened))。如果确实分两次服用，可以继续保存。")
                }
            }
            .alert("请核对记录时间", isPresented: Binding(
                get: { validationProblem != nil },
                set: { if !$0 { validationProblem = nil } }
            )) {
                Button("返回修改", role: .cancel) { validationProblem = nil }
            } message: {
                Text(validationProblem ?? "")
            }
            .onAppear {
                drugID = scheduledExisting?.drug ?? existing?.drug ?? template?.drug ?? store.selectedDrug?.id ?? "pregabalin"
                amount = scheduledExisting?.mg.formatted() ?? existing?.mg.formatted() ?? template?.mg.formatted() ?? ""
                when = scheduledExisting?.time ?? existing?.time ?? .now
            }
        }
        .presentationDetents([.large])
    }
}

struct MealEditorNativeView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var store: NativeAppStore
    @State private var kind = "meal"
    @State private var mealType = "regular"
    @State private var drink = "none"
    @State private var when = Date.now
    @State private var note = ""

    var body: some View {
        NavigationStack {
            Form {
                Picker("类别", selection: $kind) {
                    Text("用餐").tag("meal")
                    Text("饮品").tag("drink")
                }
                DatePicker("发生时间", selection: $when,
                           displayedComponents: [.date, .hourAndMinute])
                if kind == "meal" {
                    Picker("餐型", selection: $mealType) {
                        Text("普通餐").tag("regular")
                        Text("高脂餐").tag("highFat")
                    }
                }
                Picker("饮料", selection: $drink) {
                    Text("无").tag("none")
                    Text("水").tag("water")
                    Text("咖啡").tag("coffee")
                    Text("茶").tag("tea")
                    Text("牛奶").tag("milk")
                    Text("果汁").tag("juice")
                    Text("酒精").tag("alcohol")
                    Text("其他").tag("other")
                }
                TextField("备注（可选）", text: $note)
                    .onChange(of: note) { _, new in
                        if new.count > 100 { note = String(new.prefix(100)) }
                    }
                Text("餐后模型仅使用已收录的文献参数，缺少依据的饮料不会改变计算曲线。")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            .nativeKeyboardDismissal()
            .navigationTitle("饮食记录")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("保存") {
                        store.addMeal(time: when, kind: kind, mealType: mealType,
                                      drink: drink, note: note)
                        dismiss()
                    }
                }
            }
        }
    }
}

struct NativeKeyboardDismissModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .scrollDismissesKeyboard(.interactively)
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("完成") {
                        UIApplication.shared.sendAction(
                            #selector(UIResponder.resignFirstResponder),
                            to: nil, from: nil, for: nil)
                    }
                }
            }
    }
}

extension View {
    func nativeKeyboardDismissal() -> some View {
        modifier(NativeKeyboardDismissModifier())
    }
}
