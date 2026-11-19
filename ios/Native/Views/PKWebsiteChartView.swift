import Foundation
import SwiftUI
import WebKit

/// Website chart visual contract, copied from 181/frontend/05_chart.js rather
/// than approximating its SVG paths with Swift Charts. This local, bundled SVG
/// renderer has no remote page, JS bridge to native code, login cookies or
/// network access. Only the plot is WebKit; the app's navigation, records,
/// authentication and medication calculations remain native and offline.
enum PKWebsiteChartSpecification {
    static let duration: TimeInterval = 48 * 3600
    static let scales = [55, 90, 140]
    static let minimumPoints = 288
    static let maximumPoints = 600
    static let mobileLeft = 42.0
    static let mobileRight = 54.0
    static let desktopLeft = 59.0
    static let desktopRight = 65.0
    static func count(scale: Int, viewport: Double) -> Int {
        let mobile = viewport < 560
        let pad = mobile ? mobileLeft + mobileRight : desktopLeft + desktopRight
        let width = min(16_000.0, max(mobile ? 360 : 760, viewport,
                                      ceil(48.0 * Double(scale)) + pad))
        return min(maximumPoints, max(minimumPoints, Int(ceil(width / 5))))
    }
    static func start(of day: Date, calendar: Calendar = .current) -> Date {
        calendar.startOfDay(for: day)
    }
}

struct PKWebsiteChartPoint: Encodable {
    let t: Double
    let c: Double
    let unfed: Double
    let eq: Double
    let eqPreview: Double?
    let bloodPreview: Double?
    let noFoodPreview: Double?
}
struct PKWebsiteChartDose: Encodable {
    let time: Double
    let mg: Double
    let matched: Bool
}
struct PKWebsiteChartMeal: Encodable {
    let time: Double
    let matched: Bool
}
struct PKWebsiteChartTarget: Encodable {
    let time: Double
    let mode: String
    let value: Double
    let variant: String?
}
struct PKWebsiteFoodPoint: Encodable {
    let t: Double
    let c: Double
    let unfed: Double
}
struct PKWebsiteChartPayload: Encodable {
    let drugId: String
    let drugName: String
    let start: Double
    let end: Double
    var scale: Int
    let points: [PKWebsiteChartPoint]
    let records: [PKWebsiteChartDose]
    let planned: [PKWebsiteChartDose]
    let meals: [PKWebsiteChartMeal]
    let referenceBlood: Double?
    let referenceEquivalent: Double?
    let target: PKWebsiteChartTarget?
    let adoptedVariant: String?
    let probeTime: Double
    let scrollTo: Double
    let foodEffectPoint: PKWebsiteFoodPoint?
    let previewFoodEffect: Bool
    let foodType: String?
    let mealMessages: [String]
    let serverVerified: Bool
}

@MainActor
final class PKWebsiteChartSource: ObservableObject {
    @Published private(set) var payload: PKWebsiteChartPayload?
    @Published private(set) var computing = false
    @Published private(set) var modelOrigin = "使用当前 App 内签名模型"
    private var generation = 0
    private var job: Task<Void, Never>?

    func load(model: PKModel, drug: PKDrug?, day: Date,
              scale: Int, viewport: Double, planned: [PKDose],
              matchedRecordIDs: Set<String>, referenceBlood: Double?,
              referenceEquivalent: Double?, target: PKWebsiteChartTarget?,
              variant: String?, catalogVersion: String, engineVersion: String,
              scrollTo: Date? = nil) {
        generation += 1
        let number = generation
        job?.cancel()
        guard let drug, drug.canCalculate else { payload = nil; computing = false; return }
        computing = true
        let account = NativeAppStore.shared
        let cloudVersion: Int? = account.accessState == .verified && !account.hasPendingChanges
            ? account.syncedStateVersion : nil
        let startDate = PKWebsiteChartSpecification.start(of: day)
        let count = PKWebsiteChartSpecification.count(scale: scale, viewport: viewport)
        job = Task {
            let worker = Task.detached(priority: .utility) {
                // 181 website rounds every point to an integer millisecond.
                let beginMs = startDate.timeIntervalSince1970 * 1000
                let durationMs = PKWebsiteChartSpecification.duration * 1000
                let dates = (0...count).map { n in
                    let milliseconds = (beginMs + durationMs * Double(n) / Double(count)).rounded()
                    return Date(timeIntervalSince1970: milliseconds / 1000)
                }
                let model = PKResidualWindow.forCalculation(model: model, drug: drug,
                    from: startDate, through: dates.last ?? startDate)
                // When a signed engine is active, any runtime failure must be
                // visible, not silently retried N*3 times via model methods
                // which call the same JS engine and return NaN.
                let actual: [PKSample]
                if model.engineSource != nil {
                    actual = PKHotMath.compute(model: model, drug: drug, times: dates) ?? []
                } else {
                    actual = dates.map { at in PKSample(time: at,
                        concentration: model.concentration(drug, at: at),
                        equivalent: model.equivalent(drug, at: at),
                        unfed: model.concentration(drug, at: at, includeFood: false)) }
                }
                let forecast: [PKSample]
                if planned.isEmpty { forecast = [] }
                else if model.engineSource != nil {
                    forecast = PKHotMath.compute(model: model, drug: drug,
                        times: dates, additional: planned) ?? []
                } else {
                    forecast = dates.map { at in PKSample(time: at,
                        concentration: model.concentration(drug, at: at, additional: planned),
                        equivalent: model.equivalent(drug, at: at, additional: planned),
                        unfed: model.concentration(drug, at: at, includeFood: false, additional: planned)) }
                }
                return (model,actual,forecast)
            }
            let result = await withTaskCancellationHandler {
                await worker.value
            } onCancel: {
                worker.cancel()
            }
            guard !Task.isCancelled, number == generation else { return }
            computing = false
            guard !result.1.isEmpty else {
                payload = nil
                modelOrigin = "签名数学引擎无法生成有效采样数据，已停止绘图。可点击重新检查模型；未修改任何服用记录。"
                return
            }
            let previewFailed = !planned.isEmpty && result.2.count != result.1.count
            update(model: result.0, drug: drug, actual: result.1,
                   plannedSamples: previewFailed ? [] : result.2,
                   planned: planned, matchedRecordIDs: matchedRecordIDs,
                   referenceBlood: referenceBlood, referenceEquivalent: referenceEquivalent,
                   target: target, variant: variant, scale: scale,
                   scrollTo: scrollTo ?? .now, serverVerified: false)
            modelOrigin = previewFailed
                ? "已记录曲线可用，但情景预览计算失败，等待服务器校验。"
                : "本地签名模型（后台校验 181 中）"
            // Only this calculation requests a server-side indexed history
            // window. Local verified math renders first, so offline access or
            // network errors never blank an already visible chart.
            var calculationModel = result.0
            var visibleActual = result.1
            if let cloudVersion {
                do {
                    let from = PKResidualWindow.start(drug: drug, model: model,
                        earliestSample: startDate)
                    let remote = try await PKCloudAPI.shared.calculationHistory(
                        drug: drug.id, from: from, through: visibleActual.last!.time,
                        expectedVersion: cloudVersion)
                    guard !Task.isCancelled, number == generation else { return }
                    var cloudModel = result.0
                    cloudModel.doses = remote.doses
                    let samples = await Task.detached(priority: .utility) {
                        if cloudModel.engineSource != nil {
                            return PKHotMath.compute(model: cloudModel, drug: drug,
                                times: visibleActual.map(\.time))
                        }
                        return visibleActual.map { date in
                            PKSample(time: date.time,
                                concentration: cloudModel.concentration(drug, at: date.time),
                                equivalent: cloudModel.equivalent(drug, at: date.time),
                                unfed: cloudModel.concentration(drug, at: date.time, includeFood: false))
                        }
                    }.value
                    guard !Task.isCancelled, number == generation else { return }
                    if let samples, samples.count == visibleActual.count {
                        calculationModel = cloudModel
                        visibleActual = samples
                        let preview = planned.isEmpty ? [] :
                            (PKHotMath.compute(model: cloudModel, drug: drug,
                                times: samples.map(\.time), additional: planned) ?? [])
                        update(model: cloudModel, drug: drug, actual: samples,
                               plannedSamples: preview.count == samples.count ? preview : [],
                               planned: planned, matchedRecordIDs: matchedRecordIDs,
                               referenceBlood: referenceBlood,
                               referenceEquivalent: referenceEquivalent,
                               target: target, variant: variant, scale: scale,
                               scrollTo: scrollTo ?? .now, serverVerified: false)
                        modelOrigin = "已按需读取云端残留窗口 · 本机签名模型计算"
                    }
                } catch {
                    // Offline and stale versions are expected: keep local plot.
                }
            }
            do {
                let verified = try await PKServerMath.fetch(model: calculationModel, drug: drug,
                    actual: visibleActual, planned: planned,
                    expectedCatalogPrefix: catalogVersion,
                    expectedEnginePrefix: engineVersion)
                guard number == generation else { return }
                update(model: calculationModel, drug: drug, actual: verified.actual,
                       plannedSamples: verified.planned, planned: planned,
                       matchedRecordIDs: matchedRecordIDs,
                       referenceBlood: referenceBlood,
                       referenceEquivalent: referenceEquivalent,
                       target: target, variant: variant, scale: scale,
                       scrollTo: scrollTo ?? .now, serverVerified: true)
                modelOrigin = "181 服务器 · 同版本签名模型"
            } catch {
                guard number == generation else { return }
                modelOrigin = "本机签名数学模型 · 离线可用"
            }
        }
    }

    private func update(model: PKModel, drug: PKDrug, actual: [PKSample],
                        plannedSamples: [PKSample], planned: [PKDose],
                        matchedRecordIDs: Set<String>, referenceBlood: Double?,
                        referenceEquivalent: Double?, target: PKWebsiteChartTarget?,
                        variant: String?, scale: Int, scrollTo: Date,
                        serverVerified: Bool) {
        guard let first = actual.first, let last = actual.last,
              actual.allSatisfy({ $0.concentration.isFinite && $0.equivalent.isFinite && $0.unfed.isFinite }),
              (plannedSamples.isEmpty || plannedSamples.count == actual.count) else { return }
        let start = first.time.timeIntervalSince1970 * 1000
        let end = last.time.timeIntervalSince1970 * 1000
        let peak = actual.map(\.concentration).max() ?? 0
        let unfedPeak = actual.map(\.unfed).max() ?? 0
        let threshold = max(0.001,peak,unfedPeak) * 0.001
        let foodEffect = actual.filter { abs($0.concentration - $0.unfed) > threshold }
        // Same selection window as website chart: the greatest difference
        // within the *selected calendar day*, only if recorded doses of this
        // drug were actually associated with a meal.
        let dayEnd = first.time.addingTimeInterval(24 * 3600)
        let ms: (Date) -> Double = { $0.timeIntervalSince1970 * 1000 }
        let rows = model.doses.filter { $0.drug == drug.id && ms($0.time) <= end &&
            ms($0.time) >= start - 30 * model.effectiveHalfLife(drug) * 3_600_000 }
        let renderedRecords = rows.map { PKWebsiteChartDose(time: ms($0.time),mg: $0.mg,
                                                matched: matchedRecordIDs.contains($0.id)) }
        let renderedPlanned = planned.map { PKWebsiteChartDose(time: ms($0.time),
                                                    mg: $0.mg, matched: false) }
        let beforeDoseMinutes = model.catalog.food[drug.id]?.mealWindowMinutes ?? 90
        let allMeals = model.intakes.filter { $0.kind == "meal" }
        func mealForDose(_ dose: PKDose) -> PKIntake? {
            allMeals.filter { meal in
                let delta = meal.time.timeIntervalSince(dose.time)
                return delta <= 15 * 60 && delta >= -beforeDoseMinutes * 60
            }.min { abs($0.time.timeIntervalSince(dose.time)) <
                     abs($1.time.timeIntervalSince(dose.time)) }
        }
        let associatedMealIDs = Set((rows + planned).compactMap {
            mealForDose($0)?.id
        })
        let mealRows = allMeals.filter { meal in
            ms(meal.time) >= start && ms(meal.time) <= end &&
            (meal.time < dayEnd || associatedMealIDs.contains(meal.id) || meal.time > .now)
        }.sorted { $0.time < $1.time }.prefix(16)
        let renderedMeals = mealRows.map { meal in
            PKWebsiteChartMeal(time: ms(meal.time),
                               matched: associatedMealIDs.contains(meal.id))
        }
        let types = Set(rows.compactMap { mealForDose($0) }.map {
            $0.mealType == "highFat" ? "高脂餐" : "普通餐"
        }).sorted().joined(separator: "、")
        let recordedMealRows = rows.filter { $0.time < dayEnd && mealForDose($0) != nil }
        let foodEffectPoint = recordedMealRows.isEmpty ? nil : foodEffect.filter {
            $0.time < dayEnd
        }.max { abs($0.concentration - $0.unfed) < abs($1.concentration - $1.unfed) }
        let previewFoodEffect = model.catalog.food[drug.id]?.fed != nil &&
            planned.contains { mealForDose($0) != nil }
        let samples = actual.enumerated().map { index, row -> PKWebsiteChartPoint in
            let p = plannedSamples.isEmpty ? nil : plannedSamples[index]
            return PKWebsiteChartPoint(t: ms(row.time), c: row.concentration,
                unfed: row.unfed, eq: row.equivalent,
                eqPreview: p?.equivalent, bloodPreview: p?.concentration,
                noFoodPreview: p.map { row.concentration + $0.unfed - row.unfed })
        }
        payload = PKWebsiteChartPayload(drugId: drug.id, drugName: drug.name,
            start: start, end: end, scale: scale, points: samples,
            records: renderedRecords, planned: renderedPlanned,
            meals: renderedMeals, referenceBlood: referenceBlood,
            referenceEquivalent: referenceEquivalent, target: target,
            adoptedVariant: variant, probeTime: ms(scrollTo), scrollTo: ms(scrollTo),
            foodEffectPoint: foodEffectPoint.map { PKWebsiteFoodPoint(t: ms($0.time),
                c: $0.concentration, unfed: $0.unfed) },
            previewFoodEffect: previewFoodEffect,
            foodType: types.isEmpty ? nil : types,
            mealMessages: renderedMeals.filter { !$0.matched }.map {
                "用餐 \(Date(timeIntervalSince1970: $0.time / 1000).formatted(date: .abbreviated, time: .shortened)) 尚未匹配本药服用"
            }, serverVerified: serverVerified)
    }
}

/// A self-contained, app-bundled copy of the website's chart SVG drawing
/// grammar. It does not load `https://yao...` or any other remote website.
struct PKWebsiteChartSummary: Equatable {
    var stats = ""
    var crossing = ""
    var caption = ""
    var meals = ""
    var isEmpty: Bool { stats.isEmpty && crossing.isEmpty && caption.isEmpty && meals.isEmpty }
}

struct PKWebsiteChartView: UIViewRepresentable {
    let payload: PKWebsiteChartPayload
    let displayScale: Int
    @Binding var contentHeight: CGFloat
    @Binding var summary: PKWebsiteChartSummary
    func makeCoordinator() -> Coordinator { Coordinator() }
    func makeUIView(context: Context) -> WKWebView {
        let prefs = WKWebpagePreferences()
        prefs.allowsContentJavaScript = true
        let config = WKWebViewConfiguration()
        config.defaultWebpagePreferences = prefs
        config.websiteDataStore = .nonPersistent()
        let view = WKWebView(frame: .zero, configuration: config)
        view.isOpaque = false
        view.backgroundColor = PKSystemPalette.plotBackground
        // The parent SwiftUI ScrollView owns vertical scrolling; nesting a
        // second scroller hid the legend and bottom captions on iPhone Duo.
        view.scrollView.isScrollEnabled = false
        view.scrollView.alwaysBounceVertical = false
        view.navigationDelegate = context.coordinator
        context.coordinator.renderPayload = payload
        context.coordinator.displayScale = displayScale
        context.coordinator.heightChanged = { height in
            if abs(contentHeight - height) > 2 { contentHeight = height }
        }
        context.coordinator.summaryChanged = { details in
            if summary != details { summary = details }
        }
        if let url = Bundle.main.url(forResource: "website-chart", withExtension: "html") {
            view.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        }
        return view
    }
    func updateUIView(_ view: WKWebView, context: Context) {
        context.coordinator.renderPayload = payload
        context.coordinator.displayScale = displayScale
        context.coordinator.heightChanged = { height in
            if abs(contentHeight - height) > 2 { contentHeight = height }
        }
        context.coordinator.summaryChanged = { details in
            if summary != details { summary = details }
        }
        context.coordinator.render(to: view)
    }
    final class Coordinator: NSObject, WKNavigationDelegate {
        var renderPayload: PKWebsiteChartPayload?
        var displayScale = 55
        var heightChanged: ((CGFloat) -> Void)?
        var summaryChanged: ((PKWebsiteChartSummary) -> Void)?
        private var ready = false
        private var lastDigest = ""
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            ready = true
            lastDigest = ""
            render(to: webView)
        }
        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            let scheme = action.request.url?.scheme ?? ""
            decisionHandler(scheme == "file" || scheme == "about" ? .allow : .cancel)
        }
        func render(to webView: WKWebView) {
            guard ready, var renderPayload else { return }
            // Precision buttons change SVG viewport immediately, even when
            // background math is still sampling a denser model curve.
            renderPayload.scale = displayScale
            guard let data = try? JSONEncoder().encode(renderPayload) else { return }
            let hash = data.base64EncodedString()
            guard hash != lastDigest else { return }
            lastDigest = hash
            let script = "window.PKAtlasChart.render(JSON.parse(new TextDecoder().decode(Uint8Array.from(atob('\(hash)'), c=>c.charCodeAt(0)))))"
            webView.evaluateJavaScript(script) { _, error in
                if error != nil { self.lastDigest = "" }
                else {
                    self.measureHeight(in: webView)
                    self.readSummary(in: webView)
                }
            }
        }
        private func readSummary(in webView: WKWebView) {
            webView.evaluateJavaScript("window.PKAtlasChart?.summary?.()") { [weak self] value, error in
                guard error == nil, let result = value as? [String: String] else { return }
                let summary = PKWebsiteChartSummary(
                    stats: result["stats"] ?? "",
                    crossing: result["crossing"] ?? "",
                    caption: result["caption"] ?? "",
                    meals: result["meals"] ?? "")
                DispatchQueue.main.async { self?.summaryChanged?(summary) }
            }
        }
        private func measureHeight(in webView: WKWebView) {
            webView.evaluateJavaScript(
                "window.PKAtlasChart?.height?.() ?? document.body.scrollHeight"
            ) { [weak self] result, error in
                guard error == nil, let size = result as? NSNumber else { return }
                let height = CGFloat(size.doubleValue) + 12 // bottom safe breathing room
                guard height.isFinite, height >= 200, height < 10000 else { return }
                DispatchQueue.main.async { self?.heightChanged?(height) }
            }
        }
    }
}
