import SwiftUI
import Charts

/// Rolling an entered clock time to the following day is intentional.
/// The user-selected clock time is preserved, not replaced with current time.
enum PKFutureTime {
    static func nextOccurrence(_ candidate: Date, after now: Date) -> Date {
        var value = candidate
        for _ in 0..<366 where value <= now {
            guard let next = Calendar.current.date(byAdding: .day, value: 1, to: value) else { break }
            value = next
        }
        return value > now ? value : now.addingTimeInterval(3600)
    }
}

struct InverseNativeView: View {
    @EnvironmentObject private var store: NativeAppStore
    @State private var page = "point"
    @State private var targetTime = Date.now.addingTimeInterval(4 * 3600)
    @State private var durationStart = Date.now.addingTimeInterval(2 * 3600)
    @State private var durationHours = 4.0
    @State private var thresholdText = ""
    @State private var unitMode = "blood"
    @State private var maximumDoseText = ""
    @State private var fixedCount = 0
    @State private var minimumPeakText = ""
    @State private var peakMode = "equivalent"
    @State private var cycleMinimumText = ""
    @State private var initialModelValueText = ""
    @State private var cycleMode = "blood"
    @State private var totalMaximumText = ""
    @State private var targetLimitEnabled = false
    @State private var targetLimitBlood = "0.5"
    @State private var targetLimitEquivalent = "50"
    @State private var draftSaveTask: Task<Void, Never>?
    @State private var draftRestoring = false
    @State private var draftReady = false
    @StateObject private var inversePlot = PKWebsiteChartSource()
    @State private var inverseDay = Date.now
    @AppStorage("PKAtlasChartPrecision") private var inversePrecision = 55
    @State private var inverseWidth: Double = 360
    @State private var inverseChartHeight: CGFloat = 440
    @State private var inverseChartSummary = PKWebsiteChartSummary()
    @State private var lastHandledChartRequest = 0
    @State private var chartNavigationInFlight = false
    @State private var inverseFocusTime: Date?
    @State private var inverseNavigationToken = 0
    @State private var chartScrollTask: Task<Void, Never>?
    @State private var solving = false
    @State private var result: PKInverseOutput?
    @State private var solutionMessage = ""
    @State private var previewVariant = "A"
    @State private var calculatedIncludedScheduledDoses: [PKDose] = []
    @State private var calculatedInitialModelDose: PKDose? = nil
    @State private var showAdoptedOnly = false
    // Manual what-if is an ephemeral dashed preview. Only an explicit save
    // through DoseEditorNativeView creates a future scheduledDoses record.
    @State private var manualFutureTime = Date.now.addingTimeInterval(3600)
    @State private var manualFutureAmount = ""
    @State private var manualFuturePreview: PKDose?
    @State private var manualFutureDraft: PKDose?
    @State private var manualFutureStatus = ""


    @State private var showingExplanation = false
    @State private var showingStrengthEditor = false
    @State private var showingAdoption = false
    @State private var pendingAdoptionVariant = "A"
    @State private var strengthMg = ""
    @State private var strengthUnit = "粒"
    @State private var strengthLabel = ""
    @FocusState private var focused: Bool
    private var isJumpUITestFixture: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("-PKAtlasUITestInverseChartJump")
        #else
        false
        #endif
    }

    private var drug: PKDrug? { store.selectedDrug }
    private var threshold: Double? {
        guard let value = Double(thresholdText.replacingOccurrences(of: ",", with: ".")),
              value.isFinite, value > 0, value <= 1_000_000 else { return nil }
        return value
    }
    // A saved STARTING model input is only required when no modeled actual
    // starting event exists and current modeled level is below the reference.
    // This is not an actual-dose record and never enters HealthKit or alerts.
    private var initialModelNeeded: Bool {
        guard page == "point", let drug, drug.canCalculate, let threshold else { return false }
        let now = Date.now
        let earliest = PKResidualWindow.start(drug: drug, model: store.model,
                                               earliestSample: now)
        let actual = store.model.doses.contains { $0.drug == drug.id &&
            $0.time <= now && $0.time >= earliest }
        let observed = unitMode == "equivalent"
            ? store.model.equivalent(drug, at: now)
            : store.model.concentration(drug, at: now)
        return !actual && observed.isFinite && observed < threshold - 0.000001
    }
    private var validInitialModelValue: Double? {
        guard let value = Double(initialModelValueText.replacingOccurrences(of: ",", with: ".")),
              value.isFinite, value > 0, value <= 1_000_000 else { return nil }
        return value
    }
    private var countText: String { fixedCount == 0 ? "" : String(fixedCount) }
    private var cap: Double {
        guard let n = Double(maximumDoseText), n.isFinite, n > 0 else { return 1_000_000 }
        return min(1_000_000, n)
    }
    private var peakFloor: Double {
        guard let n = Double(minimumPeakText), n.isFinite, n > 0 else { return 0 }
        return n
    }
    private var cycleFloor: Double {
        guard let n = Double(cycleMinimumText.replacingOccurrences(of: ",", with: ".")), n.isFinite, n > 0 else { return 0 }
        return n
    }
    private var totalCap: Double? {
        guard !totalMaximumText.trimmingCharacters(in: .whitespaces).isEmpty else { return nil }
        return Double(totalMaximumText.replacingOccurrences(of: ",", with: "."))
    }
    private func validOptional(_ raw: String) -> Bool {
        guard !raw.trimmingCharacters(in: .whitespaces).isEmpty else { return true }
        guard let n = Double(raw.replacingOccurrences(of: ",", with: ".")) else { return false }
        return n.isFinite && n > 0 && n <= 1_000_000
    }
    private var adoptedPlan: [PKDose] { store.selectedAdoptedDoses() }
    private var activeTolerance: Double? {
        Double((unitMode == "blood" ? targetLimitBlood : targetLimitEquivalent)
            .replacingOccurrences(of: ",", with: "."))
    }

    private static func localDateString(_ value: Date) -> String {
        let format = DateFormatter()
        format.locale = Locale(identifier: "en_US_POSIX")
        format.dateFormat = "yyyy-MM-dd'T'HH:mm"
        return format.string(from: value)
    }

    private static func parseLocalDate(_ raw: String) -> Date? {
        let format = DateFormatter()
        format.locale = Locale(identifier: "en_US_POSIX")
        format.dateFormat = "yyyy-MM-dd'T'HH:mm"
        return format.date(from: raw)
    }

    private var inverseDraftFields: [String: String] {
        ["pointTarget": Self.localDateString(targetTime),
         "pointTargetLimitEnabled": targetLimitEnabled ? "1" : "0",
         "pointTargetLimitBlood": targetLimitBlood,
         "pointTargetLimitEquivalent": targetLimitEquivalent,
         "pointMaxDose": maximumDoseText, "pointTotalMax": totalMaximumText,
         "pointCount": countText, "pointPeakMin": minimumPeakText,
         "pointPeakMode": peakMode, "pointCycleMin": cycleMinimumText,
         "pointCycleMode": cycleMode,
         "pointInitialValue": initialModelValueText,
         "pointInitialMode": unitMode,
         "targetStart": Self.localDateString(durationStart),
         "holdHours": String(durationHours), "inverseCount": countText]
    }
    private var draftSignature: String {
        inverseDraftFields.sorted(by: { $0.key < $1.key })
            .map { $0.key + "=" + $0.value }.joined(separator: "|")
    }

    private func restoreInverseDraft() {
        draftSaveTask?.cancel()
        draftRestoring = true
        let values = store.inverseDraft(for: store.selectedDrugID)
        if let raw = values["pointTarget"],
           let date = Self.parseLocalDate(raw), date > .now,
           date < Date.now.addingTimeInterval(24 * 3600) { targetTime = date }
        else { targetTime = Date.now.addingTimeInterval(4 * 3600) }
        if let raw = values["targetStart"],
           let date = Self.parseLocalDate(raw), date > .now { durationStart = date }
        else { durationStart = Date.now.addingTimeInterval(2 * 3600) }
        maximumDoseText = values["pointMaxDose"] ?? ""
        totalMaximumText = values["pointTotalMax"] ?? ""
        fixedCount = min(8, max(0, Int(values["pointCount"] ?? "") ?? 0))
        minimumPeakText = values["pointPeakMin"] ?? ""
        peakMode = values["pointPeakMode"] == "blood" ? "blood" : "equivalent"
        cycleMinimumText = values["pointCycleMin"] ?? ""
        cycleMode = values["pointCycleMode"] == "equivalent" ? "equivalent" : "blood"
        initialModelValueText = values["pointInitialMode"] == unitMode
            ? (values["pointInitialValue"] ?? "") : ""
        durationHours = min(24, max(0.5, Double(values["holdHours"] ?? "") ?? 4))
        targetLimitEnabled = values["pointTargetLimitEnabled"] == "1"
        targetLimitBlood = values["pointTargetLimitBlood"] ?? "0.5"
        targetLimitEquivalent = values["pointTargetLimitEquivalent"] ?? "50"
        draftReady = true
        // Keep restoration suppression until SwiftUI publishes the new state.
        Task { @MainActor in
            await Task.yield()
            draftRestoring = false
        }
    }

    private func scheduleInverseDraft() {
        guard draftReady && !draftRestoring else { return }
        let drugID = store.selectedDrugID
        let fields = inverseDraftFields
        draftSaveTask?.cancel()
        draftSaveTask = Task {
            try? await Task.sleep(for: .milliseconds(500))
            guard !Task.isCancelled else { return }
            store.saveInverseDraft(fields, drugID: drugID)
            draftSaveTask = nil
        }
    }


    private func loadReference() {
        let value = store.referenceValue(drugID: store.selectedDrugID, mode: unitMode)
        thresholdText = value.map { $0.formatted(.number.precision(.fractionLength(0...4))) } ?? ""
    }

    private func execute() {
        guard !solving, let drug, drug.canCalculate, let threshold else {
            solutionMessage = "请先填写大于零的参考数值。"
            return
        }
        focused = false
        guard [maximumDoseText, minimumPeakText, cycleMinimumText, totalMaximumText]
            .allSatisfy(validOptional),
              !targetLimitEnabled || (activeTolerance != nil &&
                activeTolerance!.isFinite && activeTolerance! > 0 &&
                activeTolerance! <= 1_000_000) else {
            solutionMessage = "剂量上限及最低值约束必须为空，或在 0～1,000,000 范围内。"; return
        }
        if initialModelNeeded && validInitialModelValue == nil {
            solutionMessage = "当前没有起始实际服用且模型低于参考线。请先按参考值明确设置起始模型假设，或手动输入正数起始模型值。它不是已服用记录。"
            return
        }
        let now = Date.now
        if page == "point" {
            targetTime = PKFutureTime.nextOccurrence(targetTime, after: now)
            guard targetTime.timeIntervalSince(now) <= 24 * 3600 else {
                solutionMessage = "与网站一致，目标时刻限定在未来 24 小时内。请调整日期与时间。"
                return
            }
        } else {
            durationStart = PKFutureTime.nextOccurrence(durationStart, after: now)
        }
        let nowMs = now.timeIntervalSince1970 * 1000
        // Both clients now use a pharmacokinetic residual window determined
        // by the selected drug, absorption, and renal scenario. The cutoff is
        // a mathematical error-bound approximation, not biological clearance.
        let residualStart = PKResidualWindow.start(drug: drug, model: store.model,
                                                   earliestSample: now).timeIntervalSince1970 * 1000
        let recordRows = store.snapshot.records.filter { record in
            guard record["drug"]?.string == drug.id,
                  let at = record["time"]?.number, at.isFinite else { return false }
            return at <= nowMs && at >= residualStart
        }
        // Existing future plans are fixed what-if nodes. Feed them to the
        // inverse baseline so the solver searches *additional* hypothetical
        // nodes instead of suggesting an already scheduled node again.
        let computedHorizon = page == "point" ? targetTime
            : durationStart.addingTimeInterval(durationHours * 3600)
        let alreadyPlanned = store.futureScenarioDoses([], drugID: drug.id)
            .filter { $0.time >= now.addingTimeInterval(-120) && $0.time <= computedHorizon }
        let plannedRows: [[String: PKJSON]] = alreadyPlanned.map { dose in
            ["id": .string(dose.id), "drug": .string(dose.drug),
             "time": .number(dose.time.timeIntervalSince1970 * 1000),
             "mg": .number(dose.mg), "planningOnly": .bool(true)]
        }
        let input = PKInverseInput(
            kind: page,
            drugId: drug.id,
            rows: recordRows + plannedRows,
            plan: store.snapshot.plans[drug.id] ?? .object([:]),
            meals: store.snapshot.intakes,
            renalState: store.snapshot.settings["renal"] ?? .null,
            threshold: threshold,
            target: targetTime.timeIntervalSince1970 * 1000,
            cap: cap,
            now: now.timeIntervalSince1970 * 1000,
            fixedCount: fixedCount == 0 ? nil : fixedCount,
            mode: unitMode,
            peakFloor: peakFloor,
            start: durationStart.timeIntervalSince1970 * 1000,
            hours: durationHours,
            countText: countText,
            cycleFloor: PKInverseLimit(value: cycleFloor, mode: cycleMode),
            peakRequirement: PKInverseLimit(value: peakFloor, mode: peakMode),
            totalCap: totalCap,
            targetWindow: PKInverseTargetWindow(enabled: targetLimitEnabled,
                value: activeTolerance ?? 0),
            initialBaseline: initialModelNeeded ? PKInverseInitialBaseline(
                mode: unitMode, value: validInitialModelValue ?? 0) : nil,
            catalog: store.catalog
        )
        scheduleInverseDraft()
        solving = true
        solutionMessage = "正在使用与网站相同的本地反算引擎计算…"
        result = nil
        Task {
            do {
                let output = try await PKNativeInverseSolver.solve(
                    input, engineSource: store.engineSource)
                result = output
                // Capture exactly what the completed solver saw. Do not
                // query mutable plan storage again when Adopt is tapped.
                calculatedIncludedScheduledDoses = page == "point" ? alreadyPlanned : []
                calculatedInitialModelDose = output.initialHypothesis.map { item in
                    PKDose(id: "pk-model-initial-assumption", drug: drug.id, mg: item.mg,
                           time: Date(timeIntervalSince1970: item.time / 1000))
                }
                previewVariant = "A"
                refreshPreview(output)
                if let reason = output.result?.reason {
                    solutionMessage = "数学搜索结束，但未找到符合现有输入的候选：" + failureText(reason) +
                        " 今日没有服用记录本身不会阻止反算；请核对已保存药盒规格、当前时刻最低值要求及其他启用的约束。"
                } else if output.result == nil {
                    solutionMessage = "当前有限搜索未返回候选，请核对药盒规格和所启用的约束；没有今日已服用记录不是必备条件。"
                } else {
                    solutionMessage = "数学搜索已完成；已把 \(alreadyPlanned.count) 条现有计划作为固定数学条件，A/B 仅搜索新增假设节点。计划未算作已服用。"
                }
            } catch {
                result = nil
                calculatedInitialModelDose = nil
                solutionMessage = "计算未完成：" + error.localizedDescription
            }
            solving = false
        }
    }

    private func refreshPreview(_ output: PKInverseOutput? = nil) {
        guard let drug, drug.canCalculate else { return }
        let evaluated = showAdoptedOnly ? nil : (output ?? result)
        let candidate = previewVariant == "B"
            ? evaluated?.minimum
            : (evaluated?.display ?? evaluated?.result)
        let doses = candidate?.doses.map { items in
            items.map { PKDose(drug: drug.id, mg: $0.mg,
                time: Date(timeIntervalSince1970: $0.time / 1000)) }
        } ?? store.selectedAdoptedDoses()
        let adopted = store.adoptedPlanObject()
        let viewingAdopted = evaluated == nil && adopted != nil
        let plottedTime = viewingAdopted
            ? PKInverseChartFocus.adoptedTarget(adopted, fallback: .now)
            : (page == "point" ? targetTime : durationStart)
        let plottedMode = viewingAdopted
            ? (adopted?["mode"]?.string == "equivalent" ? "equivalent" : "blood")
            : unitMode
        let plottedThreshold = viewingAdopted ? adopted?["threshold"]?.number : threshold
        let variant = viewingAdopted ? adopted?["variant"]?.string : previewVariant
        let activeReference = PKInverseChartFocus.activeReferences(
            mode: plottedMode, threshold: plottedThreshold)
        let target = plottedThreshold.flatMap { value -> PKWebsiteChartTarget? in
            guard value.isFinite && value > 0 else { return nil }
            return PKWebsiteChartTarget(time: plottedTime.timeIntervalSince1970 * 1000,
                mode: plottedMode, value: value, variant: variant)
        }
        // Explicit saved future plans always participate in dashed curve
        // predictions, including beside adopted A/B mathematical nodes.
        // Neither kind is treated as confirmed actual intake; the accepted
        // solver snapshot and its constraints remain unchanged.
        let baseScenarios = (evaluated == nil && adopted != nil
            ? store.adoptedForecastDoses(drugID: drug.id)
            : doses + (evaluated == nil ? [] : calculatedIncludedScheduledDoses) +
                (evaluated == nil ? [] : calculatedInitialModelDose.map { [$0] } ?? [])) +
                (manualFuturePreview.map { [$0] } ?? [])
        let actual = store.doses.filter { $0.drug == drug.id }
        let chartStart = Calendar.current.startOfDay(for: inverseDay)
        let chartEnd = chartStart.addingTimeInterval(48 * 3600)
        let from = PKResidualWindow.start(drug: drug, model: store.model,
            earliestSample: chartStart)
        // Combine independently saved plans with the currently adopted or
        // calculated model; without adoption, saved plans still render.
        // Deduping by ID and time/amount keeps one event in the dashed curve.
        let combinedScenarios = store.futureScenarioDoses(baseScenarios,
            drugID: drug.id, from: from, through: chartEnd)
        var allScenarios: [PKDose] = []
        for dose in combinedScenarios where dose.drug == drug.id {
            let same: (PKDose) -> Bool = { other in
                other.id == dose.id || (abs(other.time.timeIntervalSince(dose.time)) <= 60 &&
                    abs(other.mg - dose.mg) < 0.0001)
            }
            if !actual.contains(where: same) && !allScenarios.contains(where: same) {
                allScenarios.append(dose)
            }
        }
        // An explicit focus changes horizontal scroll position, never
        // the calendar-day origin. Tomorrow's target must remain in the
        // 48-hour chart starting at *today's* midnight.
        let focus = inverseFocusTime
        let center = focus ?? PKInverseChartFocus.browsingCenter(day: inverseDay)
        inversePlot.load(model: store.model, drug: drug, day: inverseDay,
            scale: inversePrecision, viewport: inverseWidth, planned: allScenarios,
            matchedRecordIDs: Set(store.adoptedReview?.completed.map(\.record.id) ?? []),
            // Even when BOTH reference inputs were saved, an inverse
            // calculation displays only its selected target's reference.
            referenceBlood: activeReference.blood,
            referenceEquivalent: activeReference.equivalent,
            target: target, variant: variant, catalogVersion: store.modelVersion,
            engineVersion: store.engineVersion, scrollTo: center,
            windowStart: nil, // use the selected day's midnight, not target -24h
            navigationToken: inverseNavigationToken)
    }

    private func focusChartPlot(_ proxy: ScrollViewProxy, afterRender: Bool) {
        guard chartNavigationInFlight else { return }
        chartScrollTask?.cancel()
        let token = inverseNavigationToken
        chartScrollTask = Task { @MainActor in
            await Task.yield()
            guard !Task.isCancelled, token == inverseNavigationToken else { return }
            withAnimation(.easeOut(duration: 0.20)) {
                proxy.scrollTo("inverse.chart.plot", anchor: .top)
            }
            if afterRender {
                // SwiftUI and WKWebView have independent layout passes. The
                // fixed plot anchor survives loading/empty/rendered states.
                try? await Task.sleep(for: .milliseconds(350))
                guard !Task.isCancelled, token == inverseNavigationToken else { return }
                withAnimation(.easeOut(duration: 0.15)) {
                    proxy.scrollTo("inverse.chart.plot", anchor: .top)
                }
                chartNavigationInFlight = false
            }
        }
    }

    private func handleChartNavigation(_ proxy: ScrollViewProxy) {
        let request = store.inverseChartRequest
        guard request > lastHandledChartRequest else { return }
        lastHandledChartRequest = request
        let variant = store.inverseChartRequestVariant
        switch variant {
        case "adopted": showAdoptedOnly = true
        case "A", "B":
            showAdoptedOnly = false
            previewVariant = variant!
        default: break
        }
        let focus: Date
        if variant == "adopted" {
            focus = PKInverseChartFocus.adoptedTarget(store.adoptedPlanObject(), fallback: .now)
        } else {
            guard result != nil else {
                solutionMessage = "候选结果已失效，请重新计算后再显示曲线。"
                return
            }
            focus = page == "point" ? targetTime : durationStart
        }
        inverseFocusTime = focus
        inverseDay = PKInverseChartFocus.visibleDay(for: focus)
        inverseNavigationToken += 1
        chartNavigationInFlight = true
        refreshPreview()
        focusChartPlot(proxy, afterRender: false)
    }

    private func changeInverseDay(_ direction: Int) {
        inverseFocusTime = nil
        inverseDay = Calendar.current.date(byAdding: .day, value: direction,
            to: inverseDay) ?? inverseDay
    }

    /// Same app-bundled SVG renderer used by the main curve. Candidate A/B,
    /// the adopted scenario, records, food contrast, dual y-axes, reference
    /// lines and sample labels all have the same website drawing grammar.
    @ViewBuilder
    private var inversePreview: some View {
        if let drug, drug.canCalculate {
            GlassPanel {
                HStack {
                    Label("反算 · 与网页版完全同一套曲线", systemImage: "chart.xyaxis.line")
                        .font(.headline)
                    Spacer()
                    if inversePlot.computing { ProgressView().controlSize(.mini) }
                }
                let includedCount = result != nil
                    ? calculatedIncludedScheduledDoses.count
                    : store.adoptedIncludedScheduledDoses(drugID: drug.id).count
                if calculatedInitialModelDose != nil && result != nil {
                    Label("虚线包含当前起始模型值的数学假设，不表示实际服用或血药实测，不生成服药通知；真实服用出现后应以实际记录重新核算。", systemImage: "waveform.path")
                        .font(.caption).foregroundStyle(.orange)
                }
                let independentlySaved = store.plannedDoses(for: drug.id).count
                if independentlySaved > 0 {
                    Label("已保存 \(independentlySaved) 条未来服用计划；位于曲线计算窗口内的计划会与当前 A/B 方案合并去重，显示在虚线预测中。未确认的计划不是已服用。", systemImage: "calendar.badge.clock")
                        .font(.caption).foregroundStyle(.orange)
                }
                if includedCount > 0 {
                    Text("其中 \(includedCount) 条计划已记录在本次反算或已采用数学方案的固定条件中。新保存的独立计划只合并到预测曲线，不会悄悄修改已采用方案的原约束。")
                        .font(.caption2).foregroundStyle(.secondary)
                }
                if page == "point" && result != nil {
                    Picker("预览候选", selection: $previewVariant) {
                        Text("方案 A").tag("A")
                        Text("方案 B").tag("B")
                    }
                    .pickerStyle(.segmented)
                    .onChange(of: previewVariant) { _, _ in refreshPreview() }
                }
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 10) {
                        Button { changeInverseDay(-1) } label: { Image(systemName: "chevron.left") }
                            .accessibilityLabel("曲线上一日")
                        DatePicker("时间轴日期", selection: $inverseDay, displayedComponents: .date)
                            .datePickerStyle(.compact).labelsHidden()
                            .frame(maxWidth: .infinity)
                        Button { changeInverseDay(1) } label: { Image(systemName: "chevron.right") }
                            .accessibilityLabel("曲线下一日")
                    }
                    HStack {
                        Text("可横向滑动曲线，查看各时刻的数值")
                            .font(.caption2).foregroundStyle(.secondary)
                        Spacer(minLength: 6)
                        Button {
                            let now = Date.now
                            inverseFocusTime = now
                            inverseDay = now
                            inverseNavigationToken += 1
                            refreshPreview()
                        } label: {
                            Label("定位现在", systemImage: "location.fill")
                        }
                        .buttonStyle(.bordered)
                        .font(.caption)
                        .accessibilityIdentifier("native.inverse.chart.now")
                    }
                }
                Picker("反算曲线时间轴精度", selection: $inversePrecision) {
                    Text("标准 · 12 小时").tag(55)
                    Text("精细 · 6 小时").tag(90)
                    Text("超精细 · 3 小时").tag(140)
                }
                .pickerStyle(.segmented)
                .accessibilityIdentifier("native.inverse.chart.precision")
                Text(inversePrecision == 55 ? "当前显示窗口约 12 小时" :
                     inversePrecision == 90 ? "当前显示窗口约 6 小时" : "当前显示窗口约 3 小时")
                    .font(.caption2).foregroundStyle(.secondary)
                    .accessibilityIdentifier("native.inverse.chart.precision.status")
                Text(inverseFocusTime.map {
                    "模型曲线 · 已定位 \($0.formatted(date: .abbreviated, time: .shortened))"
                } ?? "模型曲线 · 可横向滑动查看")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .accessibilityIdentifier("native.inverse.chart.plot-anchor")
                // The ScrollViewReader ID must belong to the actual plot's
                // persistent layout box, not to a caption above the chart.
                // Otherwise scrolling can stop at the header while WKWebView
                // is still measuring its dynamic height on compact iPhones.
                VStack(spacing: 0) {
                    if let data = inversePlot.payload {
                        PKWebsiteChartView(payload: data, displayScale: inversePrecision,
                                           contentHeight: $inverseChartHeight,
                                           summary: $inverseChartSummary)
                            .frame(height: max(370, inverseChartHeight))
                            .accessibilityIdentifier("native.inverse.curve")
                    } else if inversePlot.computing {
                        ProgressView("按网站绘图精度计算所有反算曲线…")
                            .frame(maxWidth: .infinity, minHeight: 220)
                    } else {
                        VStack(spacing: 12) {
                            ContentUnavailableView("当前模型无法生成反算曲线", systemImage: "exclamationmark.triangle",
                                description: Text(inversePlot.modelOrigin))
                            Button("重新检查模型并绘制") {
                                Task {
                                    await store.refreshModel(force: true)
                                    refreshPreview()
                                }
                            }
                            .buttonStyle(.bordered)
                            .accessibilityIdentifier("native.inverse.chart.retry")
                        }
                        .frame(maxWidth: .infinity, minHeight: 220)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .top)
                .id("inverse.chart.plot")
                VStack(alignment: .leading, spacing: 9) {
                    Label(inversePlot.modelOrigin, systemImage: "checkmark.shield")
                        .font(.caption.weight(.semibold))
                    if !inverseChartSummary.isEmpty {
                        Divider()
                        if !inverseChartSummary.stats.isEmpty {
                            Text(inverseChartSummary.stats)
                                .font(.caption.weight(.semibold))
                        }
                        if !inverseChartSummary.crossing.isEmpty {
                            Text(inverseChartSummary.crossing)
                                .font(.caption)
                        }
                        if !inverseChartSummary.caption.isEmpty {
                            Text(inverseChartSummary.caption)
                                .font(.caption2)
                        }
                        if !inverseChartSummary.meals.isEmpty {
                            Text(inverseChartSummary.meals)
                                .font(.caption2)
                        }
                    }
                }
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("native.inverse.chart.explanation")
                Text("已记曲线、剂量等效曲线、未计饮食对照、A/B 预计方案、参考线、目标时刻及服药/用餐标记，均与主曲线使用网页版的相同图层与颜色。")
                    .font(.caption2).foregroundStyle(.secondary)
                if let threshold, targetLimitEnabled, let tolerance = activeTolerance {
                    Text("目标限制：\(threshold.formatted()) ± \(tolerance.formatted()) \(unitMode == "blood" ? "mg/L" : "mg")（仍参与数学计算，不改变网站绘图中的参考线样式）。")
                        .font(.caption2).foregroundStyle(.secondary)
                }
            }
            .onGeometryChange(for: Double.self, of: { Double($0.size.width) }) { _, width in
                if width.isFinite && width > 150 && abs(width - inverseWidth) > 2 {
                    inverseWidth = width
                }
            }
        }
    }

    private var manualFuturePanel: some View {
        GlassPanel {
            Label("手动假设未来服用", systemImage: "calendar.badge.clock")
                .font(.headline)
            Text("修改时间或剂量只影响临时虚线预览；不会创建计划，更不会记录为已服用。只有主动保存为未来计划，才会进入服用确认板块。")
                .font(.caption).foregroundStyle(.secondary)
            DatePicker("假设时间", selection: $manualFutureTime,
                       displayedComponents: [.date, .hourAndMinute])
                .accessibilityIdentifier("native.inverse.what-if.time")
            PKCompactField(title: "假设剂量", hint: "输入正数",
                value: $manualFutureAmount, unit: "mg", tint: .purple,
                identifier: "native.inverse.what-if.amount")
            HStack(spacing: 10) {
                Button("只预览虚线") {
                    guard let drug, drug.canCalculate,
                        let mg = Double(manualFutureAmount.replacingOccurrences(of: ",", with: ".")),
                        mg.isFinite, mg > 0, mg < 100_000,
                        manualFutureTime > Date.now else {
                        manualFutureStatus = "请填写未来时刻和有效正数剂量；当前输入不会生成计划。"
                        return
                    }
                    manualFuturePreview = PKDose(drug: drug.id, mg: mg, time: manualFutureTime)
                    manualFutureStatus = "虚线预览已更新，没有写入计划或实际服用。"
                    refreshPreview()
                }
                .buttonStyle(.bordered)
                .accessibilityIdentifier("native.inverse.what-if.preview")
                Button("保存为未来计划") {
                    guard let drug, drug.canCalculate,
                        let mg = Double(manualFutureAmount.replacingOccurrences(of: ",", with: ".")),
                        mg.isFinite, mg > 0, mg < 100_000,
                        manualFutureTime > Date.now else {
                        manualFutureStatus = "请先选择未来时间并填写有效正数剂量。"
                        return
                    }
                    if store.plannedDoses(for: drug.id).contains(where: {
                        abs($0.time.timeIntervalSince(manualFutureTime)) <= 60
                    }) {
                        manualFutureStatus = "这一时间附近已有同药计划，请在上方确认板块修改它，不要重复保存。"
                    } else {
                        manualFutureDraft = PKDose(drug: drug.id, mg: mg, time: manualFutureTime)
                    }
                }
                .buttonStyle(.borderedProminent)
                .accessibilityIdentifier("native.inverse.what-if.save-plan")
            }
            Button("清空手动假设") {
                manualFuturePreview = nil
                manualFutureAmount = ""
                manualFutureStatus = "已清空手动虚线预览，原有计划和真实服用未被修改。"
                refreshPreview()
            }
            .buttonStyle(.borderless)
            if !manualFutureStatus.isEmpty {
                Text(manualFutureStatus).font(.caption).foregroundStyle(.secondary)
            }
        }
        .onChange(of: manualFutureTime) { _, _ in
            if manualFuturePreview != nil { manualFuturePreview = nil; refreshPreview() }
        }
        .onChange(of: manualFutureAmount) { _, _ in
            if manualFuturePreview != nil { manualFuturePreview = nil; refreshPreview() }
        }
        .sheet(item: $manualFutureDraft) { dose in
            DoseEditorNativeView(template: dose)
        }
    }

    var body: some View {
        ScrollViewReader { scrollProxy in
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                ModelNotice()
                DrugNativePicker()
                inversePreview.id("inverse.chart.top")
                // Confirmation only exists for explicit, still-unconfirmed
                // future plans. An adopted A/B scheme alone never creates it.
                if !store.scheduledDoses.isEmpty {
                    PKPlannedIntakeConfirmationView()
                }
                if store.adoptedPlanObject() != nil {
                    PKAdoptedPlanPanel()
                }
                Picker("反算模式", selection: $page) {
                    Text("目标时刻 / A、B 方案").tag("point")
                    Text("维持时长").tag("duration")
                }
                .pickerStyle(.segmented)

                if let drug, drug.canCalculate {
                    GlassPanel {
                        Label("参考值与目标", systemImage: "scope")
                            .font(.headline)
                        Picker("口径", selection: $unitMode) {
                            Text("血药浓度 mg/L").tag("blood")
                            Text("剂量等效量 mg").tag("equivalent")
                        }
                        .pickerStyle(.segmented)
                        PKCompactField(title: "计算参考线", hint: "输入参考数值",
                            value: $thresholdText, unit: unitMode == "blood" ? "mg/L" : "mg",
                            tint: .pink, identifier: "native.inverse.threshold")
                        if page == "point" {
                            DatePicker("目标时刻", selection: $targetTime,
                                       displayedComponents: [.date, .hourAndMinute])
                                .onChange(of: targetTime) { _, next in
                                    if next <= Date.now {
                                        targetTime = PKFutureTime.nextOccurrence(next, after: .now)
                                    }
                                }
                            Toggle("启用目标时刻精度限定", isOn: $targetLimitEnabled)
                                .accessibilityIdentifier("native.inverse.target.limit.enabled")
                            if targetLimitEnabled {
                                HStack {
                                    Text("目标时刻允许偏差 ±")
                                    Spacer()
                                    TextField(unitMode == "blood" ? "0.5" : "50",
                                              text: unitMode == "blood" ? $targetLimitBlood : $targetLimitEquivalent)
                                        .keyboardType(.decimalPad)
                                        .multilineTextAlignment(.trailing)
                                        .focused($focused)
                                        .frame(width: 96)
                                        .accessibilityIdentifier("native.inverse.target.tolerance")
                                    Text(unitMode == "blood" ? "mg/L" : "mg")
                                        .foregroundStyle(.secondary)
                                }
                                Text("允许目标时刻落在参考值 ± 偏差内；同时保持连续覆盖参考线等独立约束。默认浓度 ±0.5 mg/L、等效 ±50 mg，均可修改。")
                                    .font(.caption).foregroundStyle(.secondary)
                            } else {
                                Text("未开启精度限定：目标时刻只需达到或高于参考值，不要求精确相等。")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                            // Force two constraint columns even on narrow Duo widths.
                            // A fixed adaptive minimum made every item a full-width row.
                            LazyVGrid(columns: [GridItem(.flexible(minimum: 0), spacing: 10),
                                                GridItem(.flexible(minimum: 0), spacing: 10)],
                                      alignment: .leading, spacing: 12) {
                                PKCompactField(title: "单节点剂量上限", hint: "不限",
                                    value: $maximumDoseText, unit: "mg", tint: .orange,
                                    identifier: "native.inverse.max-node", emphasis: true, compact: true)
                                PKCompactField(title: "固定计划＋新增预计总量剂量上限", hint: "不限",
                                    value: $totalMaximumText, unit: "mg", tint: .orange,
                                    identifier: "native.inverse.total-cap", emphasis: true, compact: true)
                            }
                            HStack(spacing: 12) {
                                Label("假设节点数", systemImage: "number")
                                    .font(.caption.weight(.semibold))
                                Spacer(minLength: 4)
                                Picker("假设节点数", selection: $fixedCount) {
                                    Text("自动").tag(0)
                                    ForEach(1...8, id: \.self) { count in
                                        Text("\(count) 次").tag(count)
                                    }
                                }
                                .labelsHidden()
                            }
                            if initialModelNeeded {
                                VStack(alignment: .leading, spacing: 8) {
                                    Label("起始模型值 · 明确假设", systemImage: "scope")
                                        .font(.headline)
                                    PKCompactField(title: "起始模型值", hint: "必须明确填写",
                                        value: $initialModelValueText,
                                        unit: unitMode == "blood" ? "mg/L" : "mg（等效）",
                                        tint: .cyan, identifier: "native.inverse.initial-model")
                                    Button("按当前参考值假设起始已达标") {
                                        if let threshold {
                                            initialModelValueText = threshold.formatted(
                                                .number.precision(.fractionLength(0...6)))
                                            scheduleInverseDraft()
                                        }
                                    }
                                    .buttonStyle(.bordered)
                                    .accessibilityIdentifier("native.inverse.initial.use-reference")
                                    Text("没有起始实际服用且当前模型低于参考值时必须填写。该数值是数学初始条件，不是已服用、实测血药或服药提醒。周期最低值从规划形成连续覆盖后检查。")
                                        .font(.footnote).foregroundStyle(.secondary)
                                }
                            }
                            Divider()
                            LazyVGrid(columns: [GridItem(.flexible(minimum: 0), spacing: 10),
                                                GridItem(.flexible(minimum: 0), spacing: 10)],
                                      alignment: .leading, spacing: 12) {
                                VStack(alignment: .leading, spacing: 7) {
                                    PKCompactField(title: "规划覆盖段最低值", hint: "不设置",
                                        value: $cycleMinimumText,
                                        unit: cycleMode == "blood" ? "mg/L" : "mg", tint: .cyan,
                                        identifier: "native.inverse.cycle-min", emphasis: true, compact: true)
                                    Picker("周期最低值单位", selection: $cycleMode) {
                                        Text("血药").tag("blood")
                                        Text("等效").tag("equivalent")
                                    }
                                    .pickerStyle(.segmented)
                                }
                                VStack(alignment: .leading, spacing: 7) {
                                    PKCompactField(title: "覆盖峰值下限", hint: "不设置",
                                        value: $minimumPeakText,
                                        unit: peakMode == "blood" ? "mg/L" : "mg", tint: .mint,
                                        identifier: "native.inverse.peak-min", emphasis: true, compact: true)
                                    Picker("峰值最低值单位", selection: $peakMode) {
                                        Text("血药").tag("blood")
                                        Text("等效").tag("equivalent")
                                    }
                                    .pickerStyle(.segmented)
                                }
                            }
                            Text("周期最低值从模型规划的连续覆盖段起点至目标时刻检查，不再要求当前未建立覆盖的一瞬间已经达标。累计上限统计当前至目标时刻已保存的未来计划及新增假设节点；起始模型假设不是实际服用，不计入新增计划总量。")
                                .font(.footnote).foregroundStyle(.secondary)
                        } else {
                            DatePicker("维持窗口开始", selection: $durationStart,
                                       displayedComponents: [.date, .hourAndMinute])
                                .onChange(of: durationStart) { _, next in
                                    if next <= Date.now {
                                        durationStart = PKFutureTime.nextOccurrence(next, after: .now)
                                    }
                                }
                            HStack {
                                Text("持续时长")
                                Spacer()
                                Text(durationHours.formatted(.number.precision(.fractionLength(1))))
                                    .monospacedDigit()
                                Text("小时").foregroundStyle(.secondary)
                            }
                            Slider(value: $durationHours, in: 0.5...24, step: 0.5)
                            Picker("假设节点数", selection: $fixedCount) {
                                Text("自动").tag(0)
                                ForEach(1...8, id: \.self) { count in
                                    Text("\(count) 次").tag(count)
                                }
                            }
                        }
                        Button {
                            showingStrengthEditor = true
                        } label: {
                            Label("药盒规格 · \(store.strengths(for: drug.id).count) 项",
                                  systemImage: "pills")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.glass)
                    }

                    Button {
                        execute()
                    } label: {
                        HStack {
                            if solving { ProgressView().tint(.white) }
                            Label(solving ? "正在本地搜索…" : "计算反算方案",
                                  systemImage: "function")
                                .font(.headline)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                    }
                    .buttonStyle(.glassProminent)
                    .disabled(solving || threshold == nil)
                    .accessibilityIdentifier("native.inverse.calculate")

                    if !solutionMessage.isEmpty {
                        Text(solutionMessage).font(.callout).foregroundStyle(.secondary)
                    }
                    if let result {
                        if page == "point" {
                            candidateCard("方案 A · 连续覆盖", candidate: result.result,
                                          variant: "A")
                            candidateCard("方案 B · 最小量 / 稳定搜索",
                                          candidate: result.minimum, variant: "B")
                        } else {
                            candidateCard("维持时长搜索结果",
                                          candidate: result.display ?? result.result,
                                          variant: nil)
                        }
                    }
                    manualFuturePanel
                    Button {
                        showingExplanation = true
                    } label: {
                        Label("算法和安全说明", systemImage: "info.circle")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.glass)
                } else {
                    ContentUnavailableView("该药物仅能记录",
                                           systemImage: "exclamationmark.circle")
                }
            }
            .frame(maxWidth: 840)
            .frame(maxWidth: .infinity)
            .padding(18)
        }
        .nativeKeyboardDismissal()
        .background(PKSystemPalette.background)
        .navigationTitle("数学反算")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            restoreInverseDraft(); loadReference()
            #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("-PKAtlasUITestInverseChartJump") {
                // Debug-only deterministic fixture for testing real SwiftUI
                // button -> ScrollViewReader -> embedded WebKit navigation.
                page = "point"
                let at = Date.now.addingTimeInterval(4 * 3600)
                targetTime = at
                thresholdText = "0.5"
                let base = at.timeIntervalSince1970 * 1000
                let data = """
                {"result":{"doses":[{"time":\(base - 3600000),"mg":25}],"mg":25},
                 "minimum":{"doses":[{"time":\(base - 7200000),"mg":20}],"mg":20}}
                """
                result = try? JSONDecoder().decode(PKInverseOutput.self, from: Data(data.utf8))
            }
            #endif
            refreshPreview()
            Task { await store.refreshAdoptedReview() }
            handleChartNavigation(scrollProxy)
        }
        .onChange(of: store.inverseChartRequest) { _, _ in
            handleChartNavigation(scrollProxy)
        }
        .onChange(of: inverseDay) { _, day in
            if let focus = inverseFocusTime {
                let start = Calendar.current.startOfDay(for: day)
                let end = Calendar.current.date(byAdding: .day, value: 2,
                    to: start) ?? start.addingTimeInterval(48 * 3600)
                if focus < start || focus >= end { inverseFocusTime = nil }
            }
            refreshPreview()
        }
        .onChange(of: inversePlot.payload?.navigationToken) { _, token in
            if chartNavigationInFlight, token == inverseNavigationToken {
                focusChartPlot(scrollProxy, afterRender: true)
            }
        }
        .onChange(of: inversePrecision) { _, _ in refreshPreview() }
        .onChange(of: inverseWidth) { _, _ in refreshPreview() }
        .onChange(of: store.selectedDrugID) { _, _ in
            manualFuturePreview = nil
            manualFutureAmount = ""
            manualFutureStatus = ""
            if !isJumpUITestFixture { result = nil }
            restoreInverseDraft(); loadReference(); refreshPreview()
        }
        .onChange(of: draftSignature) { _, _ in
            scheduleInverseDraft()
        }
        .onChange(of: unitMode) { previous, next in
            if previous != next {
                initialModelValueText = "" // mg/L and mg are not interchangeable
                calculatedInitialModelDose = nil
            }
            if !isJumpUITestFixture { result = nil }
            refreshPreview()
            loadReference()
        }
        .onChange(of: page) { _, _ in
            if !isJumpUITestFixture { result = nil }
            refreshPreview()
        }
        .onChange(of: store.adoptedReview?.matchedNodeCount) { _, _ in
            if result == nil { refreshPreview() }
        }
        .onChange(of: store.snapshot.settings["inverseMemory"]) { _, _ in
            if result == nil { refreshPreview() }
        }
        .onChange(of: store.modelRevision) { _, _ in
            if !isJumpUITestFixture {
                result = nil
                solutionMessage = "云端模型参数已更新，请重新计算反算方案。"
            }
            refreshPreview()
        }
        .onChange(of: store.snapshot) { _, _ in
            if !focused && !draftRestoring {
                let cloud = store.inverseDraft(for: store.selectedDrugID)
                if let target = cloud["pointTarget"],
                   target != Self.localDateString(targetTime),
                   draftSaveTask == nil { restoreInverseDraft() }
            }
            refreshPreview()
        }
        .onChange(of: thresholdText) { _, value in
            // The focused state is not controlled by the reusable field.
            // Only non-empty, valid values are propagated, without syncing
            // the other unit's previous value into this measurement.
            if draftReady && !draftRestoring,
               let threshold = Double(value), threshold > 0, threshold.isFinite {
                store.setReference(drugID: store.selectedDrugID, mode: unitMode, text: value)
            }
        }
        .sheet(isPresented: $showingStrengthEditor) { strengthsEditor }
        .sheet(isPresented: $showingExplanation) {
            NavigationStack {
                ScrollView {
                    Text("""
                    当前使用生产网站同版本的本地 JavaScriptCore 数学反算内核，
                    包含目标时刻连续覆盖、药盒完整规格、固定节点数、A/B 候选、
                    稳定性和维持时长搜索。运算完全在本机进行，不调用网页。
                    模型值为群体估计，反算结果是有限数学候选，不是治疗处方，
                    不保证对个人安全或有效。不要依据输出自行加药、改间隔或停药。
                    """)
                    .padding()
                }
                .navigationTitle("模型说明")
                .toolbar { ToolbarItem(placement: .confirmationAction) {
                    Button("完成") { showingExplanation = false }
                } }
            }
        }
        .confirmationDialog("采用数学情景 \(pendingAdoptionVariant)？",
                            isPresented: $showingAdoption) {
            Button("确认采用模型情景") {
                guard let selected = pendingAdoptionVariant == "A"
                        ? result?.result : result?.minimum,
                      let threshold else { return }
                store.adoptInverse(selected, variant: pendingAdoptionVariant,
                                   mode: unitMode, threshold: threshold,
                                   target: targetTime, cap: maximumDoseText,
                                   count: countText, peakMin: peakFloor,
                                   peakMode: peakMode, cycleMin: cycleFloor,
                                   cycleMode: cycleMode, totalMax: totalCap,
                                   includedScheduledDoses: calculatedIncludedScheduledDoses,
                                   initialHypothesis: calculatedInitialModelDose,
                                   initialValue: validInitialModelValue)
            }
        } message: {
            Text("仅保存数学情景，不会新增真实服用记录。需由专业人士核对，不构成服药建议。")
        }
    }
    }

    private func candidateCard(_ title: String, candidate: PKInverseCandidate?,
                               variant: String?) -> some View {
        GlassPanel {
            Text(title).font(.headline)
            if let candidate {
                if let reason = candidate.reason {
                    Text(failureText(reason)).foregroundStyle(.orange)
                } else if let doses = candidate.doses {
                    HStack {
                        Text("合计 \(candidate.mg ?? doses.reduce(0, { $0 + $1.mg }), format: .number.precision(.fractionLength(1))) mg（模型）")
                            .font(.headline)
                        Spacer()
                        Text("\(doses.count) 个节点").foregroundStyle(.secondary)
                    }
                    if let min = candidate.minLevel {
                        Text("覆盖段最低模型值：\(min.formatted(.number.precision(.fractionLength(3)))) \(unitMode == "blood" ? "mg/L" : "mg")")
                            .font(.subheadline)
                    }
                    if let peak = candidate.peak {
                        Text("窗口最高模型值：\(peak.formatted(.number.precision(.fractionLength(3)))) \(unitMode == "blood" ? "mg/L" : "mg")")
                            .font(.subheadline)
                    }
                    if let modeled = candidate.modeled {
                        Text("目标时刻模型值：\(modeled.formatted(.number.precision(.fractionLength(3)))) \(unitMode == "blood" ? "mg/L" : "mg")")
                            .font(.subheadline)
                    }
                    if let continuous = candidate.continuousFrom {
                        Text("连续达到参考值的模型起点：\(Date(timeIntervalSince1970: continuous / 1000).formatted(date: .abbreviated, time: .shortened))")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    ForEach(doses) { dose in
                        HStack {
                            Text(Date(timeIntervalSince1970: dose.time / 1000),
                                 format: .dateTime.month().day().hour().minute())
                            Spacer()
                            Text("\(dose.mg.formatted()) mg").monospacedDigit()
                        }
                        .font(.subheadline)
                    }
                    if let variant, !doses.isEmpty {
                        Button {
                            // Adopted preview uses exactly this navigation
                            // event path. Avoid a pre-navigation recomputation
                            // that would cancel the new plot before scrolling.
                            store.jumpToInverseChart(variant: variant)
                        } label: {
                            Label("在曲线中显示方案 \(variant)", systemImage: "chart.xyaxis.line")
                        }
                        .buttonStyle(.glassProminent)
                        .accessibilityIdentifier("native.inverse.preview.\(variant)")
                        Button("采用模型情景 \(variant)") {
                            pendingAdoptionVariant = variant
                            showingAdoption = true
                        }
                        .buttonStyle(.glass)
                        .disabled(!store.isLoggedIn)
                        if !store.isLoggedIn {
                            Text("请先通过网站授权登录，再保存采用方案。")
                                .font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                } else {
                    Text("搜索未找到满足设定的数学候选。")
                        .foregroundStyle(.secondary)
                }
            } else {
                Text("暂无候选。调整参考值、药盒规格或节点数后重新计算。")
                    .font(.subheadline).foregroundStyle(.secondary)
            }
            Text("数学情景，不是处方或实际服药提醒。")
                .font(.caption2).foregroundStyle(.secondary)
        }
    }

    private func failureText(_ reason: String) -> String {
        switch reason {
        case "specs": return "该药物尚未保存药盒规格，请先添加完整单位。"
        case "initialBaselineRequired": return "请先填写起始模型值，或明确采用当前参考值作为起始数学假设。"
        case "initialBaselineInvalid": return "起始模型值须为有效正数且使用与参考线一致的单位。"
        case "cap": return "单次上限小于可组合的最小药盒规格。"
        case "coverageSearchIncomplete": return "本轮有界搜索没有找到目标前建立连续覆盖的候选，不能认定所有组合数学无解。"
        case "fixedNoSolution": return "在固定次数和时间窗口内未找到数学候选；有限搜索未遍历所有可能组合。"
        case "peakNoSolution": return "覆盖段模型峰值条件无法满足。"
        case "cycleAlreadyBelow": return "旧版本曾把最低值错算成当前瞬间的要求；请重新计算以使用连续覆盖段。"
        case "cycleNoSolution": return "周期最低值约束在此搜索范围内无解。"
        case "totalNoSolution": return "固定计划＋新增预计总量剂量上限与其他约束无法同时满足。"
        case "targetWindowUnreached": return "在已有规格及有限搜索中未找到目标时刻落入设定 ± 偏差范围的候选；不代表数学上绝对无解。"
        case "targetWindowInvalid": return "目标时刻偏差需要填写正数。"
        case "constraintNoSolution": return "无法同时满足全部模型约束。"
        default: return "未找到数学候选：\(reason)"
        }
    }

    private var strengthsEditor: some View {
        NavigationStack {
            Form {
                Section("当前药物的完整药盒规格") {
                    ForEach(store.strengths(for: store.selectedDrugID), id: \.id) { item in
                        HStack {
                            VStack(alignment: .leading) {
                                Text("\(item.mg.formatted()) mg / \(item.unit)")
                                if !item.label.isEmpty {
                                    Text(item.label).font(.caption).foregroundStyle(.secondary)
                                }
                            }
                            Spacer()
                            Button(role: .destructive) {
                                store.deleteStrength(id: item.id)
                            } label: {
                                Image(systemName: "trash")
                            }
                        }
                    }
                }
                Section("新增规格") {
                    HStack {
                        TextField("单个完整单位的含量", text: $strengthMg)
                            .keyboardType(.decimalPad)
                        Text("mg").foregroundStyle(.secondary)
                    }
                    Picker("单位", selection: $strengthUnit) {
                        Text("粒").tag("粒")
                        Text("片").tag("片")
                        Text("袋").tag("袋")
                    }
                    TextField("规格备注（可选）", text: $strengthLabel)
                    Button("添加规格") {
                        if let mg = Double(strengthMg), mg > 0 {
                            store.addStrength(mg: mg, unit: strengthUnit,
                                              label: strengthLabel)
                            strengthMg = ""; strengthLabel = ""
                        }
                    }
                    .disabled(store.strengths(for: store.selectedDrugID).count >= 8 ||
                              Double(strengthMg) == nil)
                }
                Text("仅用于验证数学搜索是否由完整单位组合而成，不决定实际服药剂量。")
                    .font(.caption).foregroundStyle(.secondary)
            }
            .nativeKeyboardDismissal()
            .navigationTitle("药盒规格")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("完成") { showingStrengthEditor = false }
                }
            }
        }
    }
}

/// Intake confirmation is sourced EXCLUSIVELY from explicit scheduledDoses.
/// Accepting a hypothetical A/B scheme does not create a real intake plan,
/// confirmation task or actual-dose record. Future plans stay available for
/// editing; overdue plans remain until the user confirms or deletes them.
private struct PKPlannedIntakeConfirmationView: View {
    @EnvironmentObject private var store: NativeAppStore
    @State private var editingPlan: PKDose?
    @State private var deletingPlan: PKDose?
    @State private var confirmingPlan: PKDose?
    @State private var notice = ""

    private var pendingPlans: [PKDose] {
        // Global inbox: plans for other medications remain visible even when
        // the user selects a different drug for inverse calculations.
        store.scheduledDoses.sorted { a, b in
            let now = Date.now
            let aFuture = a.time > now, bFuture = b.time > now
            return aFuture == bFuture ? a.time < b.time : !aFuture
        }
    }

    var body: some View {
        TimelineView(.periodic(from: .now, by: 60)) { timeline in
            if !pendingPlans.isEmpty {
                GlassPanel {
                    Label("计划服用确认 · \(pendingPlans.count) 条", systemImage: "clock.badge.exclamationmark")
                        .font(.headline).foregroundStyle(.orange)
                    Text("只显示你明确保存的未来服用计划。采用 A/B 数学模型不会创建服用确认。未到时间可以修改、删除；到时才能确认，过期不会自动算作实际服用。")
                        .font(.caption).foregroundStyle(.secondary)
                    ForEach(pendingPlans) { dose in
                        Divider().opacity(0.25)
                        VStack(alignment: .leading, spacing: 7) {
                            Text("\(store.catalog.drugs.first(where: { $0.id == dose.drug })?.name ?? dose.drug) · \(dose.time.formatted(date: .abbreviated, time: .shortened)) · \(dose.mg.formatted()) mg")
                                .font(.subheadline.bold())
                            Text(dose.time <= timeline.date ? "已到时 · 尚未确认实际服用" : "未来计划 · 尚未发生")
                                .font(.caption2).foregroundStyle(.orange)
                            HStack(spacing: 9) {
                                Button("确认已服用") { confirmingPlan = dose }
                                    .disabled(dose.time > timeline.date)
                                    .buttonStyle(.borderedProminent)
                                Button("修改") { editingPlan = dose }
                                    .buttonStyle(.bordered)
                                Button("删除", role: .destructive) { deletingPlan = dose }
                                    .buttonStyle(.bordered)
                            }
                        }
                        .accessibilityIdentifier("native.planned.pending.\(dose.id)")
                    }
                    if !notice.isEmpty {
                        Text(notice).font(.caption).foregroundStyle(.orange)
                    }
                }
                .accessibilityIdentifier("native.inverse.pending.confirmation")
            }
        }
        .sheet(item: $editingPlan) { dose in
            DoseEditorNativeView(scheduledExisting: dose)
        }
        .confirmationDialog("确认实际已经服用了这条计划？", isPresented: Binding(
            get: { confirmingPlan != nil }, set: { if !$0 { confirmingPlan = nil } }
        )) {
            Button("确认并转为实际服用记录") {
                if let dose = confirmingPlan, dose.time <= .now {
                    if let duplicate = PKDoseEntryGuard.possibleDuplicate(dose, in: store.doses) {
                        notice = "已存在时间相近的实际服用 \(duplicate.mg.formatted()) mg；请先核对，未新增记录。"
                    } else if !store.confirmPlannedDose(dose.id) {
                        notice = "计划已在另一设备修改或确认，请刷新并重新核对。"
                    } else { notice = "" }
                }
                confirmingPlan = nil
            }
            Button("取消", role: .cancel) { confirmingPlan = nil }
        } message: {
            Text("确认将按当前计划的药物、时间和剂量保存为实际记录。若真实服用时间或剂量不同，请先修改这条计划；系统会检查是否存在重复记录。")
        }
        .confirmationDialog("删除这条未来服用计划？", isPresented: Binding(
            get: { deletingPlan != nil }, set: { if !$0 { deletingPlan = nil } }
        )) {
            Button("删除计划", role: .destructive) {
                if let dose = deletingPlan { store.removePlannedDose(dose.id) }
                deletingPlan = nil
            }
            Button("取消", role: .cancel) { deletingPlan = nil }
        } message: {
            Text("只删除已保存的未来计划，不会更改实际服用记录或已采用数学模型。")
        }
    }
}

/// Native counterpart of the website's adopted point-plan panel. The review
/// itself comes from the signed WEBSITE evaluateAdoptedPlan() engine, not a
/// second Swift interpretation of node-matching or suggested adjustments.
private struct PKAdoptedPlanPanel: View {
    private struct AdoptedNodeEdit: Identifiable {
        let index: Int
        let template: PKDose
        var id: Int { index }
    }
    @EnvironmentObject private var store: NativeAppStore
    @State private var showingAdjustmentConfirmation = false
    @State private var editingActualRecord: PKDose?
    @State private var preparingTakenRecord: PKDose?
    @State private var editingScheduledPlan: PKDose?
    @State private var editingAdoptedNode: AdoptedNodeEdit?
    private var plan: [String: PKJSON]? { store.adoptedPlanObject() }
    private var doses: [[String: PKJSON]] {
        guard let plan, let raw = plan["doses"], case .array(let list) = raw else { return [] }
        return list.compactMap(\.object)
    }
    private var manual: [String: PKJSON] { plan?["manualMatches"]?.object ?? [:] }
    private func date(_ ms: Double) -> String {
        Date(timeIntervalSince1970: ms / 1000)
            .formatted(date: .abbreviated, time: .shortened)
    }
    private func amount(_ number: Double) -> String {
        number.formatted(.number.precision(.fractionLength(0...2)))
    }
    private func matchMode(_ i: Int) -> String {
        guard let value = manual[String(i)] else { return "auto" }
        if case .null = value { return "none" }
        return "manual"
    }
    private func assignedIDs(_ i: Int) -> [String] {
        manual[String(i)]?.arrayStringValues ?? []
    }
    private func changeMode(_ value: String, index: Int) {
        switch value {
        case "auto": store.setManualMatch(nodeIndex: index, recordIDs: nil)
        case "none": store.disableMatch(nodeIndex: index)
        default: store.setManualMatch(nodeIndex: index, recordIDs: assignedIDs(index))
        }
    }
    private func candidateChoices(_ node: [String: PKJSON],
                                  review: PKAdoptedReview, selected: [String]) -> [PKAdoptedRecord] {
        let target = node["time"]?.number ?? 0
        let sorted = review.candidates.sorted {
            abs($0.time - target) < abs($1.time - target)
        }
        let visible = sorted.filter { selected.contains($0.id) } + Array(sorted.prefix(80))
        var ids = Set<String>()
        return visible.filter { ids.insert($0.id).inserted }
    }
    private func toggle(_ record: PKAdoptedRecord, nodeIndex: Int, checked: Bool) {
        var ids = assignedIDs(nodeIndex)
        if checked { if !ids.contains(record.id) { ids.append(record.id) } }
        else { ids.removeAll { $0 == record.id } }
        store.setManualMatch(nodeIndex: nodeIndex, recordIDs: ids)
    }
    private func nodeRow(_ node: [String: PKJSON], index: Int,
                         review: PKAdoptedReview) -> some View {
        let plannedAt = node["time"]?.number ?? 0
        let plannedMg = node["mg"]?.number ?? 0
        let matches = review.matched(index)
        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("模型假设节点 \(index + 1) · \(date(plannedAt))")
                        .font(.subheadline.bold())
                    Text("数学预测 \(amount(plannedMg)) mg · \(matches.isEmpty ? "尚未关联实际服用" : "已关联 \(matches.count) 条实际记录")")
                        .font(.caption).foregroundStyle(matches.isEmpty ? .orange : .mint)
                }
                Spacer()
                if !matches.isEmpty { Image(systemName: "checkmark.circle.fill").foregroundStyle(.mint) }
            }
            ForEach(matches) { match in
                Text("\(match.manual == true ? "手动" : "自动")匹配：\(date(match.record.time)) · \(amount(match.record.mg)) mg")
                    .font(.caption).foregroundStyle(.secondary)
            }
            // A mathematical adopted node is not a confirmation task.
            // Only the separately saved scheduledDoses enter the panel above.
            if let scheduled = store.plannedDoses(for: store.selectedDrugID).first(where: {
                abs($0.time.timeIntervalSince1970 * 1000 - plannedAt) <= 60_000 &&
                abs($0.mg - plannedMg) < 0.0001
            }) {
                Button {
                    editingScheduledPlan = scheduled
                } label: {
                    Label("编辑关联的未来计划", systemImage: "calendar.badge.clock")
                }
                .buttonStyle(.bordered)
            } else if let matched = matches.first,
                      let actual = store.doses.first(where: { $0.id == matched.record.id }) {
                Button {
                    editingActualRecord = actual
                } label: {
                    Label("查看关联的真实记录", systemImage: "checkmark.circle")
                }
                .buttonStyle(.bordered)
            } else {
                Button {
                    editingAdoptedNode = AdoptedNodeEdit(index: index,
                        template: PKDose(drug: store.selectedDrugID, mg: plannedMg,
                            time: Date(timeIntervalSince1970: plannedAt / 1000)))
                } label: {
                    Label("修改数学假设节点", systemImage: "pencil")
                }
                .buttonStyle(.bordered)
                .accessibilityIdentifier("native.adopted.math.edit.\(index)")
            }
            DisclosureGroup("高级：关联实际服用记录") {
            Picker("匹配方式", selection: Binding(
                get: { matchMode(index) },
                set: { changeMode($0, index: index) }
            )) {
                Text("自动（最近时间）").tag("auto")
                Text("手动多选").tag("manual")
                Text("不匹配此节点").tag("none")
            }
            .pickerStyle(.menu)
            if matchMode(index) == "manual" {
                DisclosureGroup("实际记录 · 已选 \(assignedIDs(index).count) 条") {
                    let selected = assignedIDs(index)
                    ForEach(candidateChoices(node, review: review, selected: selected)) { row in
                        let usedByOther = manual.contains { key, value in
                            key != String(index) && (value.arrayStringValues ?? []).contains(row.id)
                        }
                        Toggle(isOn: Binding(
                            get: { assignedIDs(index).contains(row.id) },
                            set: { toggle(row, nodeIndex: index, checked: $0) }
                        )) {
                            Text("\(date(row.time)) · \(amount(row.mg)) mg")
                                .font(.caption)
                        }
                        .disabled((usedByOther || selected.count >= 20) && !selected.contains(row.id))
                    }
                    Text("每节点至多关联 20 条。记录不会被修改，同一条记录不能分配给多个节点。")
                        .font(.caption2).foregroundStyle(.secondary)
                }
            }
            }
        }
    }
    var body: some View {
        GlassPanel {
            HStack {
                Label("已采用的数学模型", systemImage: "checkmark.circle.fill")
                    .font(.headline).foregroundStyle(.mint)
                Spacer()
                Text("方案 \(plan?["variant"]?.string ?? "A")")
                    .font(.caption.bold()).foregroundStyle(.secondary)
            }
            if let plan, let target = plan["target"]?.number {
                Text("目标：\(date(target)) · 参考值 \(amount(plan["threshold"]?.number ?? 0)) \(plan["mode"]?.string == "equivalent" ? "mg（等效）" : "mg/L")")
                    .font(.caption).foregroundStyle(.secondary)
            }
            if let review = store.adoptedReview {
                HStack {
                    Text("已匹配 \(review.matchedNodeCount) / \(doses.count) 个节点")
                    Spacer()
                    Text("未匹配的数学节点 \(review.pending.count) 个")
                }
                .font(.subheadline.bold())
                // Show only the currently accepted generation, not a
                // superseded base node when an adjustment has been adopted.
                if let next = store.selectedAdoptedDoses().min(by: { $0.time < $1.time }) {
                    Label("当前已采用节点：\(next.time.formatted(date: .abbreviated, time: .shortened))",
                          systemImage: next.time < .now ? "clock.badge.exclamationmark" : "clock.badge")
                        .font(.subheadline)
                        .foregroundStyle(next.time < .now ? .orange : .mint)
                    if next.time < .now {
                        Text("数学节点已过预计时间，仍不自动生成服用确认；只有另外保存的计划未来服用才需要确认。")
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                }
                Button {
                    store.jumpToInverseChart(variant: "adopted")
                } label: {
                    Label("在曲线中显示已采用方案", systemImage: "chart.xyaxis.line")
                }
                .buttonStyle(.glassProminent)
                if plan?["adjustment"]?.object?["doses"]?.array != nil {
                    Text("原数学情景已被新情景替换，旧节点不会进入服用确认。只有你明确保存为未来计划的记录，才会出现在上方的确认板块。")
                        .font(.caption).foregroundStyle(.secondary)
                } else {
                    ForEach(doses.indices, id: \.self) { index in
                        Divider().opacity(0.3)
                        nodeRow(doses[index], index: index, review: review)
                    }
                }
                if !review.unmatched.isEmpty {
                    Divider().opacity(0.3)
                    Text("未关联的实际服用记录 · \(review.unmatched.count) 条")
                        .font(.subheadline.bold()).foregroundStyle(.orange)
                    ForEach(review.unmatched) { record in
                        Text("\(date(record.time)) · \(amount(record.mg)) mg")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
                if review.replanned {
                    Divider().opacity(0.3)
                    Text("依据当前实际记录自动计算的调整意见")
                        .font(.subheadline.bold())
                    if !review.replanReason.isEmpty {
                        Text("当前有限数学搜索未找到满足条件的调整节点：\(review.replanReason)")
                            .foregroundStyle(.orange).font(.caption)
                    } else if review.suggestionDiffers, let suggestion = review.suggested {
                        Text("从 \(date(review.replanFrom)) 重新核算剩余 \(review.remaining) 个预计节点。以下为数学情景，尚未采用。")
                            .font(.caption).foregroundStyle(.secondary)
                        ForEach(suggestion) { item in
                            HStack {
                                Text(date(item.time))
                                Spacer()
                                Text("\(amount(item.mg)) mg（候选）")
                            }
                            .font(.subheadline)
                        }
                        Button("采用新的数学情景") { showingAdjustmentConfirmation = true }
                            .buttonStyle(.glass)
                    } else {
                        Text("当前模型节点与本次计算结果一致，无新的调整意见。")
                            .font(.caption).foregroundStyle(.mint)
                    }
                }
                Text("自动匹配按实际时间与节点时间最接近排序；偏差窗口至少 30 分钟、最多 2 小时，并受相邻计划节点间距的一半约束。实际记录不被改写。")
                    .font(.caption2).foregroundStyle(.secondary)
            } else {
                ProgressView("正在核对已采用节点与实际记录…")
                if !store.adoptedReviewStatus.isEmpty {
                    Text(store.adoptedReviewStatus).font(.caption2).foregroundStyle(.secondary)
                }
            }
            Button("取消采用方案", role: .destructive) {
                store.cancelAdoptedInverse()
            }
        }
        .confirmationDialog("采用重新计算的数学情景？", isPresented: $showingAdjustmentConfirmation) {
            Button("确认采用后续预计节点") { store.adoptCurrentAdjustment() }
        } message: {
            Text("只更新尚未执行的假设节点，不改动实际服用记录。这是数学模型，不是个人给药建议。")
        }
        .sheet(item: $editingActualRecord) { dose in
            DoseEditorNativeView(existing: dose)
        }
        .sheet(item: $preparingTakenRecord) { dose in
            DoseEditorNativeView(template: dose)
        }
        .sheet(item: $editingScheduledPlan) { dose in
            DoseEditorNativeView(scheduledExisting: dose)
        }
        .sheet(item: $editingAdoptedNode) { edit in
            DoseEditorNativeView(template: edit.template, adoptedNodeIndex: edit.index)
        }
        .accessibilityIdentifier("native.inverse.adopted.matches")
    }
}
