import SwiftUI
import Charts

/// Native Swift Charts is intentionally restored for the lightweight 9-hour
/// overview. The inverse page keeps the detailed website-compatible SVG.
@MainActor
final class PKShortChart: ObservableObject {
    @Published private(set) var actual: [PKSample] = []
    @Published private(set) var scenario: [PKSample] = []
    @Published private(set) var computing = false
    @Published private(set) var failureMessage = ""
    private var generation = 0

    nonisolated static let before: TimeInterval = 3 * 3600
    nonisolated static let after: TimeInterval = 6 * 3600
    nonisolated static let sampleStep: TimeInterval = 5 * 60

    func load(model: PKModel, drug: PKDrug?, center: Date, proposed: [PKDose]) {
        generation += 1
        let request = generation
        guard let drug, drug.canCalculate else {
            actual = []; scenario = []; computing = false
            failureMessage = "当前药物没有可计算的单药模型。"
            return
        }
        computing = true
        failureMessage = ""
        let store = NativeAppStore.shared
        let cloudVersion: Int? = store.accessState == .verified && !store.hasPendingChanges
            ? store.syncedStateVersion : nil
        Task {
            let result = await Task.detached(priority: .utility) {
                let start = center.addingTimeInterval(-Self.before)
                let dates = (0...108).map { start.addingTimeInterval(Double($0) * Self.sampleStep) }
                let model = PKResidualWindow.forCalculation(model: model, drug: drug,
                    from: start, through: dates.last ?? center)
                // Do not call model.curve() after signed JS fails: that method
                // calls the same broken signed JS again and returns [].
                let samples = model.engineSource == nil
                    ? model.curve(drug: drug, from: start, hours: 9, stepMinutes: 5)
                    : (PKHotMath.compute(model: model, drug: drug, times: dates) ?? [])
                guard samples.count == dates.count,
                      samples.allSatisfy({ $0.concentration.isFinite && $0.equivalent.isFinite && $0.unfed.isFinite }) else {
                    return (samples: [PKSample](), proposed: [PKSample](),
                            reason: "签名数学引擎未能生成有效曲线，已停止绘图。请检查模型版本或导出分析日志。")
                }
                let forecast = proposed.isEmpty ? [] : (model.engineSource == nil
                    ? model.curve(drug: drug, from: start, hours: 9, stepMinutes: 5, additional: proposed)
                    : (PKHotMath.compute(model: model, drug: drug, times: dates, additional: proposed) ?? []))
                let usablePreview = proposed.isEmpty || (forecast.count == dates.count &&
                    forecast.allSatisfy({ $0.concentration.isFinite && $0.equivalent.isFinite }))
                return (samples: samples, proposed: usablePreview ? forecast : [],
                        reason: usablePreview ? "" : "情景曲线验证失败；已记录曲线仍然有效。")
            }.value
            guard generation == request, !Task.isCancelled else { return }
            actual = result.samples
            scenario = result.proposed
            failureMessage = result.reason
            computing = false
            // Fetch an indexed cloud slice only while the curve is open.
            // Local computed samples remain usable without connectivity.
            if let cloudVersion, !result.samples.isEmpty {
                do {
                    let start = center.addingTimeInterval(-Self.before)
                    let end = center.addingTimeInterval(Self.after)
                    let from = PKResidualWindow.start(drug: drug, model: model,
                        earliestSample: start)
                    let window = try await PKCloudAPI.shared.calculationHistory(
                        drug: drug.id, from: from, through: end,
                        expectedVersion: cloudVersion)
                    guard generation == request, !Task.isCancelled else { return }
                    var remotelyBacked = PKResidualWindow.forCalculation(model: model,
                        drug: drug, from: start, through: end)
                    remotelyBacked.doses = window.doses
                    let remote = await Task.detached(priority: .utility) {
                        let dates = result.samples.map(\.time)
                        let base = remotelyBacked.engineSource != nil
                            ? PKHotMath.compute(model: remotelyBacked, drug: drug, times: dates)
                            : remotelyBacked.curve(drug: drug, from: start, hours: 9, stepMinutes: 5)
                        let forecast = proposed.isEmpty ? [] :
                            (PKHotMath.compute(model: remotelyBacked, drug: drug,
                                times: dates, additional: proposed) ?? [])
                        return (base, forecast)
                    }.value
                    guard generation == request, !Task.isCancelled else { return }
                    if let base = remote.0, base.count == result.samples.count {
                        actual = base
                        scenario = remote.1.count == base.count ? remote.1 : []
                        failureMessage = ""
                    }
                } catch {
                    // Session loss, no network, or stale revision: keep local.
                }
            }
        }
    }
}

struct ChartNativeView: View {
    @EnvironmentObject private var store: NativeAppStore
    @StateObject private var plot = PKShortChart()
    @State private var anchor = Date.now
    @State private var selectedTime = Date.now
    @State private var displayMode = "blood"
    @State private var bloodReference = ""
    @State private var equivalentReference = ""
    @State private var saveTask: Task<Void, Never>?
    @FocusState private var focused: String?

    private var scenarios: [PKDose] {
        if store.curvePreviewVariant != nil {
            return store.futureScenarioDoses(store.curvePreviewDoses, drugID: store.selectedDrugID)
        }
        if store.adoptedPlanObject() != nil {
            return store.adoptedForecastDoses()
        }
        // Standalone future plans remain available as their own general
        // what-if curve when no accepted A/B scheme is currently selected.
        return store.futureScenarioDoses([], drugID: store.selectedDrugID)
    }
    private var range: ClosedRange<Date> {
        anchor.addingTimeInterval(-PKShortChart.before)...anchor.addingTimeInterval(PKShortChart.after)
    }
    private var current: PKSample? {
        plot.actual.min { abs($0.time.timeIntervalSince(selectedTime)) < abs($1.time.timeIntervalSince(selectedTime)) }
    }
    private var predicted: PKSample? {
        plot.scenario.min { abs($0.time.timeIntervalSince(selectedTime)) < abs($1.time.timeIntervalSince(selectedTime)) }
    }
    private func loadReferences() {
        bloodReference = store.referenceValue(drugID: store.selectedDrugID, mode: "blood")
            .map { $0.formatted(.number.precision(.fractionLength(0...4))) } ?? ""
        equivalentReference = store.referenceValue(drugID: store.selectedDrugID, mode: "equivalent")
            .map { $0.formatted(.number.precision(.fractionLength(0...4))) } ?? ""
    }
    private func threshold(_ value: String) -> Double? {
        guard let n = Double(value.replacingOccurrences(of: ",", with: ".")),
              n.isFinite, n > 0, n <= 1_000_000 else { return nil }
        return n
    }
    private var reference: Double? {
        threshold(displayMode == "blood" ? bloodReference : equivalentReference)
    }
    private func refresh() {
        plot.load(model: store.model, drug: store.selectedDrug, center: anchor, proposed: scenarios)
    }
    private func resetNow() {
        anchor = .now; selectedTime = anchor
    }
    private func pan(hours: Double) {
        anchor = anchor.addingTimeInterval(hours * 3600)
        selectedTime = anchor
    }
    private func saveReference(_ mode: String, _ raw: String) {
        saveTask?.cancel()
        let id = store.selectedDrugID
        saveTask = Task {
            try? await Task.sleep(for: .milliseconds(450))
            guard !Task.isCancelled, raw.isEmpty || threshold(raw) != nil else { return }
            store.setReference(drugID: id, mode: mode, text: raw)
        }
    }
    private func value(_ row: PKSample) -> Double {
        displayMode == "blood" ? row.concentration : row.equivalent
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                ModelNotice()
                DrugNativePicker()
                if let drug = store.selectedDrug, drug.canCalculate {
                    GlassPanel {
                        HStack(spacing: 8) {
                            Label("原生药代曲线", systemImage: "waveform.path.ecg")
                                .font(.headline)
                            Spacer()
                            if plot.computing { ProgressView().controlSize(.mini) }
                            Text("前 3 小时 · 后 6 小时")
                                .font(.caption2).foregroundStyle(.secondary)
                        }
                        Picker("显示口径", selection: $displayMode) {
                            Text("血药浓度 mg/L").tag("blood")
                            Text("剂量等效 mg").tag("equivalent")
                        }
                        .pickerStyle(.segmented)
                        .accessibilityIdentifier("native.chart.mode")
                        HStack(spacing: 12) {
                            Button { pan(hours: -3) } label: {
                                Label("前移三小时", systemImage: "chevron.left")
                            }.labelStyle(.iconOnly).buttonStyle(.bordered)
                            Text(anchor, format: .dateTime.month().day().hour().minute())
                                .font(.caption.monospacedDigit())
                                .frame(maxWidth: .infinity)
                            Button { resetNow() } label: {
                                Label("定位现在", systemImage: "location.fill")
                            }.buttonStyle(.bordered).font(.caption)
                            Button { pan(hours: 3) } label: {
                                Label("后移三小时", systemImage: "chevron.right")
                            }.labelStyle(.iconOnly).buttonStyle(.bordered)
                        }
                        let currentPlans = store.plannedDoses(for: drug.id)
                        if !currentPlans.isEmpty {
                            Label("已包含 \(currentPlans.count) 条计划服用：仅参与虚线预测；不会计为已发生的服用，也不自动提醒。", systemImage: "calendar.badge.clock")
                                .font(.caption).foregroundStyle(.orange)
                        }
                        if !plot.actual.isEmpty {
                            Chart {
                                ForEach(plot.actual) { point in
                                    LineMark(x: .value("时间", point.time),
                                             y: .value("模型", value(point)),
                                             series: .value("曲线系列", "已记录"))
                                        .foregroundStyle(Color(red: 1, green: 0.65, blue: 0.28))
                                        .interpolationMethod(.linear)
                                }
                                if displayMode == "blood" {
                                    ForEach(plot.actual) { point in
                                        LineMark(x: .value("未计饮食时间", point.time),
                                                 y: .value("未计饮食", point.unfed),
                                             series: .value("曲线系列", "未计饮食"))
                                            .foregroundStyle(.cyan)
                                            .lineStyle(StrokeStyle(lineWidth: 1.5, dash: [5, 5]))
                                    }
                                }
                                ForEach(plot.scenario) { point in
                                    LineMark(x: .value("方案时间", point.time),
                                             y: .value("假设", value(point)),
                                             series: .value("曲线系列", "方案预览"))
                                        .foregroundStyle(.purple)
                                        .lineStyle(StrokeStyle(lineWidth: 2, dash: [5, 5]))
                                }
                                if let reference {
                                    RuleMark(y: .value("参考", reference))
                                        .foregroundStyle(.pink)
                                        .lineStyle(StrokeStyle(lineWidth: 1.4, dash: [5, 5]))
                                }
                                RuleMark(x: .value("游标", selectedTime))
                                    .foregroundStyle(.secondary.opacity(0.65))
                                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [2, 4]))
                                if range.contains(Date.now) {
                                    RuleMark(x: .value("当前时间", Date.now))
                                        .foregroundStyle(.mint)
                                        .lineStyle(StrokeStyle(lineWidth: 1, dash: [3, 4]))
                                }
                            }
                            .chartXScale(domain: range)
                            .chartXAxis {
                                AxisMarks(values: .stride(by: .hour, count: 2)) {
                                    AxisGridLine()
                                    AxisValueLabel(format: .dateTime.hour().minute())
                                        .font(.caption2)
                                }
                            }
                            .chartYAxis { AxisMarks(position: .leading) }
                            .chartOverlay { proxy in
                                GeometryReader { geometry in
                                    Rectangle().fill(.clear).contentShape(Rectangle())
                                        .gesture(DragGesture(minimumDistance: 0)
                                            .onChanged { gesture in
                                                guard let frame = proxy.plotFrame else { return }
                                                let origin = geometry[frame].origin.x
                                                let location = gesture.location.x - origin
                                                if let date: Date = proxy.value(atX: location) {
                                                    selectedTime = min(max(date, range.lowerBound), range.upperBound)
                                                }
                                            })
                                }
                            }
                            .frame(height: 260)
                            .accessibilityIdentifier("native.chart.curve")
                            HStack(spacing: 12) {
                                Label("已记录", systemImage: "line.diagonal").foregroundStyle(.orange)
                                if displayMode == "blood" {
                                    Label("未计饮食", systemImage: "line.diagonal").foregroundStyle(.cyan)
                                }
                                if !plot.scenario.isEmpty {
                                    Label("未匹配方案（虚线）", systemImage: "line.diagonal")
                                        .foregroundStyle(.purple)
                                }
                            }.font(.caption2)
                            Slider(value: Binding(get: {
                                min(max(selectedTime.timeIntervalSince(range.lowerBound) / (9 * 3600), 0), 1)
                            }, set: { selectedTime = range.lowerBound.addingTimeInterval($0 * 9 * 3600) }), in: 0...1)
                                .accessibilityIdentifier("native.chart.scrubber")
                            if let current {
                                HStack {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(current.time, format: .dateTime.month().day().hour().minute())
                                            .font(.caption).foregroundStyle(.secondary)
                                        Text("\(value(current).formatted(.number.precision(.fractionLength(3)))) \(displayMode == "blood" ? "mg/L" : "mg")")
                                            .font(.title2.bold()).monospacedDigit()
                                    }
                                    Spacer()
                                    if let predicted {
                                        VStack(alignment: .trailing, spacing: 4) {
                                            Text("情景模型").font(.caption2).foregroundStyle(.secondary)
                                            Text("\(value(predicted).formatted(.number.precision(.fractionLength(3))))")
                                                .font(.title3.bold()).foregroundStyle(.purple)
                                        }
                                    }
                                }
                            }
                        } else if plot.computing {
                            ProgressView("正在计算…").frame(maxWidth: .infinity, minHeight: 260)
                        } else {
                            VStack(alignment: .leading, spacing: 12) {
                                ContentUnavailableView("暂无可绘制数据", systemImage: "chart.xyaxis.line",
                                    description: Text(plot.failureMessage.isEmpty ?
                                        "请确认当前药物及计算模型是否可用。" : plot.failureMessage))
                                Button("重新检查模型并绘制") {
                                    Task {
                                        await store.refreshModel(force: true)
                                        refresh()
                                    }
                                }
                                .buttonStyle(.bordered)
                                .accessibilityIdentifier("native.chart.retry")
                            }
                        }
                    }
                    GlassPanel {
                        Text("参考线 · 可分别填写").font(.headline)
                        HStack(alignment: .top, spacing: 10) {
                            PKCompactField(title: "血药浓度", hint: "未设置", value: $bloodReference,
                                unit: "mg/L", tint: .pink, identifier: "native.chart.reference.blood")
                            PKCompactField(title: "剂量等效", hint: "未设置", value: $equivalentReference,
                                unit: "mg", tint: .mint, identifier: "native.chart.reference.equivalent")
                        }
                        Text("参考数值自动保存并同步；当前绘制口径使用对应单位的参考线。")
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                    GlassPanel {
                        Text("计算依据").font(.headline)
                        Text(drug.note ?? "使用药物目录内的群体模型和饮食修正参数。")
                            .font(.subheadline).foregroundStyle(.secondary)
                        if let source = drug.source, let raw = drug.url,
                           let url = URL(string: raw), url.scheme == "https" {
                            Link(source, destination: url).font(.caption)
                        }
                    }
                } else {
                    ContentUnavailableView("没有可计算的单药模型", systemImage: "chart.xyaxis.line")
                }
            }
            .frame(maxWidth: 850)
            .frame(maxWidth: .infinity)
            .padding(16)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(PKSystemPalette.background)
        .navigationTitle("药代曲线")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItemGroup(placement: .keyboard) {
            Spacer(); Button("完成") { focused = nil }
        }}
        .onAppear { loadReferences(); refresh() }
        .onChange(of: anchor) { _, _ in refresh() }
        .onChange(of: store.selectedDrugID) { _, _ in loadReferences(); refresh() }
        .onChange(of: store.modelRevision) { _, _ in refresh() }
        .onChange(of: store.snapshot) { _, _ in
            if focused == nil { loadReferences() }; refresh()
        }
        .onChange(of: store.curvePreviewVariant) { _, _ in refresh() }
        .onChange(of: store.adoptedReview?.matchedNodeCount) { _, _ in refresh() }
        .onChange(of: displayMode) { _, _ in selectedTime = anchor }
        .onChange(of: bloodReference) { _, text in saveReference("blood", text) }
        .onChange(of: equivalentReference) { _, text in saveReference("equivalent", text) }
    }
}
