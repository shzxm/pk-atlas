import Foundation
import Combine

enum PKAccountAccess: Equatable {
    case verifying, verified, loginRequired, verificationUnavailable
}

/// Only the server session check is throttled. Personal local data remains
/// available, and actual cloud synchronization has its own update triggers.
enum PKCloudSessionPolicy {
    static let minimumCheckInterval: TimeInterval = 20 * 60

    static func shouldValidate(lastCheck: Date?, at now: Date = .now,
                               force: Bool = false) -> Bool {
        if force { return true }
        guard let lastCheck else { return true }
        return now.timeIntervalSince(lastCheck) >= minimumCheckInterval
    }
}

@MainActor
final class NativeAppStore: ObservableObject {
    static let shared = NativeAppStore()

    @Published private(set) var catalog = PKCatalog.bundled()
    @Published private(set) var modelStatus = "使用安装包内置模型；联网后自动检查"
    @Published private(set) var modelVersion = "内置"
    @Published private(set) var modelRevision = 0
    @Published private(set) var modelUpdatedAt: Date?
    @Published private(set) var modelChecking = false
    @Published private(set) var engineVersion = "内置"
    @Published private(set) var modelUpdateRequiresApp = false
    @Published var showingModelUpgradePrompt = false
    // Only a signature-verified script can reach JavaScriptCore.
    @Published private(set) var engineSource: String?
    @Published private(set) var snapshot = PKCloudState()
    @Published private(set) var healthAutoNotice = ""

    @Published private(set) var selectedDrugID = "pregabalin"
    @Published private(set) var adoptedReview: PKAdoptedReview?
    @Published private(set) var adoptedReviewStatus = ""
    // Local-only opt-in: do not instantiate the expensive stand-alone
    // Swift chart until this preference is enabled. Shared @Published state
    // updates TabView immediately when Settings changes the switch.
    @Published var mainChartEnabled = UserDefaults.standard.bool(forKey: "PKAtlasShowMainChart") {
        didSet {
            UserDefaults.standard.set(mainChartEnabled, forKey: "PKAtlasShowMainChart")
        }
    }
    @Published var activeTab: NativeTab = .today
    @Published private(set) var inverseChartRequest = 0
    @Published private(set) var inverseChartRequestVariant: String?

    func jumpToInverseChart(variant: String? = nil) {
        inverseChartRequestVariant = variant
        inverseChartRequest += 1
        activeTab = .inverse
    }
    @Published private(set) var curvePreviewVariant: String?
    @Published private(set) var curvePreviewDoses: [PKDose] = []
    private var adoptedReviewGeneration = 0

    @Published private(set) var accessState: PKAccountAccess = .verifying
    @Published private(set) var username: String?
    @Published private(set) var syncStatus = "本机已保存 · 未登录"
    @Published private(set) var hasPendingChanges = false
    @Published private(set) var lastLocalSavedAt: Date?
    @Published private(set) var conflict = false
    @Published private(set) var busy = false
    @Published var showingError = false
    @Published var errorMessage = ""
    @Published private(set) var releaseStatus = "尚未检查 App 新版本"
    @Published private(set) var releaseChecking = false
    @Published private(set) var releaseLastChecked: Date?
    @Published private(set) var latestRelease: PKNativeRelease?
    @Published private(set) var releaseAvailable = false
    @Published var showingReleaseUpdatePrompt = false
    @Published var automaticReleaseChecks = UserDefaults.standard.object(forKey: "PKAtlasAutomaticReleaseChecks") as? Bool ?? true {
        didSet { UserDefaults.standard.set(automaticReleaseChecks, forKey: "PKAtlasAutomaticReleaseChecks") }
    }

    private var base = PKCloudState()
    private var version = 0
    var syncedStateVersion: Int { version }
    private var verifyingAccount = false
    private var lastSessionValidationAt: Date?
    private var syncTask: Task<Void, Never>?
    private var syncRunning = false
    private var pendingUploadId: String? = UserDefaults.standard.string(forKey: "PKAtlasPendingUploadID")
    private func uploadID() -> String {
        if let pendingUploadId { return pendingUploadId }
        let id = UUID().uuidString
        pendingUploadId = id
        UserDefaults.standard.set(id, forKey: "PKAtlasPendingUploadID")
        return id
    }
    private func clearUploadID(ifMatches id: String) {
        guard pendingUploadId == id else { return }
        pendingUploadId = nil
        UserDefaults.standard.removeObject(forKey: "PKAtlasPendingUploadID")
    }
    private var lastModelCheck: Date?
    private var lastReleaseCheck: Date?
    private var lastReleasePrompted: String?

    var installedReleaseDescription: String {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "未知"
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "?"
        return "\(version)（Build \(build)）"
    }

    func checkNativeRelease(force: Bool = false) async {
        guard !releaseChecking, (force || automaticReleaseChecks) else { return }
        if !force, let lastReleaseCheck,
           Date.now.timeIntervalSince(lastReleaseCheck) < 6 * 3600 { return }
        releaseChecking = true
        lastReleaseCheck = .now
        defer { releaseChecking = false }
        do {
            let release = try await PKPrivateReleaseClient.shared.fetch()
            let installedVersion = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.0"
            let buildNumber = Int(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0") ?? 0
            latestRelease = release
            releaseLastChecked = .now
            releaseAvailable = PKReleaseVerifier.newer(release, than: installedVersion,
                                                        localBuild: buildNumber)
            if releaseAvailable {
                releaseStatus = "发现新版本 \(release.displayVersion) · GitHub 私有 Release 或 iCloud 下载目录"
                let identifier = "\(release.version):\(release.build)"
                if lastReleasePrompted != identifier {
                    lastReleasePrompted = identifier
                    showingReleaseUpdatePrompt = true
                }
            } else {
                releaseStatus = "已是最新 App 版本（服务器签名验证通过）"
            }
        } catch {
            releaseStatus = "无法确认 App 最新版本：\(error.localizedDescription)"
            // Retry after ~10 minutes instead of suppressing checks for 6 hours
            // following a transient offline period.
            lastReleaseCheck = Date.now.addingTimeInterval(-(6 * 3600 - 600))
            if force { releaseLastChecked = .now }
        }
    }

    private init() {
        let localAccount = UserDefaults.standard.string(forKey: "PKAtlasLastAuthorizedAccount")
        let hasCredential = PKSessionVault.load() != nil
        let account = localAccount ?? "__local__"
        // Local-first: restore the last encrypted snapshot into the visible
        // pages immediately, even while the network and login are unavailable.
        // A server check is necessary only for remote sync, never for display.
        if let doc = try? PKSecureDisk.load(username: account) {
            snapshot = doc.state
            base = doc.base
            version = doc.version
            selectedDrugID = doc.selectedDrug
            lastLocalSavedAt = doc.savedAt
            if account != "__local__" { username = account }
        }
        hasPendingChanges = snapshot != base
        accessState = hasCredential ? .verifying : .loginRequired
        syncStatus = hasCredential
            ? "已立即恢复上次本机记录 · 正在后台确认云端登录"
            : "本机数据可用 · 云端登录未授权"
        let bundled = PKCatalog.bundled()
        if let signed = PKSignedEngine.restored(bundled: bundled) {
            catalog = signed.catalog
            engineSource = signed.script
            engineVersion = String(signed.engineVersion.prefix(12))
            modelVersion = String(signed.catalogVersion.prefix(12))
            modelStatus = "已恢复本机签名验证的算法与药物目录 · 离线可用"
            return
        }

        if let expected = PKModelDistribution.expectedEngineVersion,
           let restored = PKModelDistribution.cached(expectedEngine: expected, bundled: bundled) {
            catalog = restored.catalog
            modelVersion = String(restored.version.prefix(12))
            modelStatus = "已恢复本机校验通过的模型 · 离线可用"
        }
    }

    func showCurvePreview(variant: String, doses: [PKDose]) {
        guard ["A", "B"].contains(variant) else { return }
        curvePreviewVariant = variant
        curvePreviewDoses = doses
        activeTab = .chart
    }

    func clearCurvePreview() {
        curvePreviewVariant = nil
        curvePreviewDoses = []
    }

    func refreshAdoptedReview() async {
        // Matching the locally cached adopted plan does not need a cloud
        // token and must remain usable offline.
        adoptedReviewGeneration += 1
        let generation = adoptedReviewGeneration
        let source = snapshot, id = selectedDrugID, modelCatalog = catalog
        let engine = engineSource
        do {
            let evaluation = try await PKAdoptedEvaluator.evaluate(
                snapshot: source, drugId: id, catalog: modelCatalog,
                engineSource: engine)
            guard generation == adoptedReviewGeneration else { return }
            adoptedReview = evaluation
            adoptedReviewStatus = evaluation == nil ? "暂无已采用模型" : "自动匹配与调整意见已按网页版重新计算"
        } catch {
            guard generation == adoptedReviewGeneration else { return }
            adoptedReview = nil
            adoptedReviewStatus = "已采用模型暂未完成匹配：" + error.localizedDescription
        }
    }

    private func scheduleAdoptedReview() {
        Task { await refreshAdoptedReview() }
    }

    func adoptedPlanObject(drugID: String? = nil) -> [String: PKJSON]? {
        snapshot.settings["inverseMemory"]?.object?[drugID ?? selectedDrugID]?
            .object?["adoptedPointPlan"]?.object
    }

    func setManualMatch(nodeIndex: Int, recordIDs: [String]?) {
        guard var plan = adoptedPlanObject(),
              let doses = plan["doses"], case .array(let nodes) = doses,
              nodes.indices.contains(nodeIndex) else { return }
        var matches = plan["manualMatches"]?.object ?? [:]
        let key = String(nodeIndex)
        if let recordIDs {
            let eligible = Set(snapshot.doses.filter { $0.drug == selectedDrugID }.map(\.id))
            let ids = Array(Set(recordIDs.filter { eligible.contains($0) })).sorted().prefix(20)
            for (existingIndex, value) in matches where existingIndex != key {
                let taken = (value.arrayStringValues ?? [])
                if !Set(ids).isDisjoint(with: taken) { return }
            }
            matches[key] = .array(ids.map { .string($0) })
        } else {
            matches.removeValue(forKey: key)  // website auto matching
        }
        plan["manualMatches"] = .object(matches)
        updateAdoptedPlan(plan)
    }

    func disableMatch(nodeIndex: Int) {
        guard var plan = adoptedPlanObject() else { return }
        var matches = plan["manualMatches"]?.object ?? [:]
        matches[String(nodeIndex)] = .null // website 'do not match'
        plan["manualMatches"] = .object(matches)
        updateAdoptedPlan(plan)
    }

    func adoptCurrentAdjustment() {
        guard var plan = adoptedPlanObject(), let state = adoptedReview,
              state.suggestionDiffers, let suggestions = state.suggested else { return }
        plan["adjustment"] = .object([
            "doses": .array(suggestions.map { dose in
                var row: [String: PKJSON] = ["time": .number(dose.time), "mg": .number(dose.mg)]
                if let parts = dose.parts { row["parts"] = .array(parts) }
                return .object(row)
            }),
            "completedCount": .number(Double(state.matchedNodeCount)),
            "adoptedAt": .number(Date.now.timeIntervalSince1970 * 1000)
        ])
        updateAdoptedPlan(plan)
    }

    private func updateAdoptedPlan(_ value: [String: PKJSON]) {
        var inverse = snapshot.settings["inverseMemory"]?.object ?? [:]
        var memory = inverse[selectedDrugID]?.object ?? [:]
        memory["adoptedPointPlan"] = .object(value)
        inverse[selectedDrugID] = .object(memory)
        snapshot.settings["inverseMemory"] = .object(inverse)
        clearCurvePreview()
        adoptedReviewGeneration += 1
        adoptedReview = nil
        changed()
        Task { await NativeReminderScheduler.shared.reconcileAfterAdoptedPlanChange() }
    }

    var doses: [PKDose] { snapshot.doses.sorted { $0.time > $1.time } }
    var scheduledDoses: [PKDose] { snapshot.scheduledDoses.sorted { $0.time < $1.time } }
    func plannedDoses(for drugID: String) -> [PKDose] {
        scheduledDoses.filter { $0.drug == drugID }
    }
    func futureScenarioDoses(_ hypothetical: [PKDose], drugID: String,
                             from lower: Date = .now.addingTimeInterval(-120),
                             through upper: Date = .distantFuture) -> [PKDose] {
        // Combine saved future (possibly overdue/unconfirmed) plans with any
        // currently adopted A/B scenario. An identical node is modeled once.
        // Keep this distinct from adopted-plan constraint evaluation: adding
        // a plan does not mutate the accepted solver snapshot.
        PKScenarioOverlay.merged(saved: snapshot.scheduledDoses,
            hypothesis: hypothetical, actual: snapshot.doses,
            drugID: drugID, from: lower, through: upper)
    }
    func savePlannedDose(_ dose: PKDose, replacingActual id: String? = nil) {
        guard catalog.drugs.contains(where: { $0.id == dose.drug }),
              dose.mg.isFinite, dose.mg > 0, dose.mg < 100_000 else { return }
        if let id = id { snapshot.deleteDose(id) }
        snapshot.saveScheduledDose(dose)
        changed()
    }
    func removePlannedDose(_ id: String) { snapshot.deleteScheduledDose(id); changed() }
    @discardableResult
    func confirmPlannedDose(_ id: String) -> Bool {
        guard snapshot.confirmScheduledDose(id) else { return false }
        changed()
        return true
    }
    var meals: [PKIntake] { snapshot.meals.sorted { $0.time > $1.time } }
    var selectedDrug: PKDrug? {
        catalog.drugs.first { $0.id == selectedDrugID } ?? catalog.drugs.first
    }
    var model: PKModel { PKModel(catalog: catalog, doses: snapshot.doses,
                                 intakes: snapshot.meals, renalCrCl: snapshot.renalCrCl,
                                 engineSource: engineSource) }
    // Keep the account controls stable during silent foreground revalidation.
    // Actual cloud read/write still requires accessState == .verified.
    var isLoggedIn: Bool { username != nil && accessState != .loginRequired }

    /// At app launch and foreground activation, fetch an Ed25519-signed
    /// *data+code* bundle from the official backend. Never activate a partial
    /// or incompatible algorithm, even if the catalog itself is valid.
    func refreshModel(force: Bool = false) async {
        guard !modelChecking else { return }
        if !force, let lastModelCheck,
           Date.now.timeIntervalSince(lastModelCheck) < 120 { return }
        modelChecking = true
        lastModelCheck = .now
        defer { modelChecking = false }
        do {
            let envelope = try await PKCloudAPI.shared.signedEnginePackage()
            let verified = try PKSignedEngine.verify(
                envelope, bundled: PKCatalog.bundled(), previous: catalog)
            let newEngine = String(verified.engineVersion.prefix(12))
            let newCatalog = String(verified.catalogVersion.prefix(12))
            if engineVersion != newEngine || modelVersion != newCatalog || engineSource != verified.script {
                // Executable JS can be updated only after the same offline
                // mathematical entrypoints pass an isolated JSContext test.
                try PKSignedEngine.smokeTest(verified)
                try PKSignedEngine.save(envelope)
                PKModel.invalidateCaches()
                engineSource = verified.script
                catalog = verified.catalog
                engineVersion = newEngine
                modelVersion = newCatalog
                modelRevision += 1
                modelStatus = "网站药代公式、反算引擎与药物数据已安全热更新 · 离线可用"
            } else {
                modelStatus = "当前公式及反算算法已是云端最新版 · 签名校验通过"
            }
            modelUpdatedAt = .now
            scheduleAdoptedReview()
            modelUpdateRequiresApp = false
        } catch let failure as PKSignedEngineFailure {
            modelStatus = failure.localizedDescription
            switch failure {
            case .updateApp, .executionFailed:
                modelUpdateRequiresApp = true
                showingModelUpgradePrompt = true
            default:
                break
            }
        } catch {
            modelStatus = "自动更新未完成，使用上次验证通过的本地算法：" +
                error.localizedDescription
        }
    }

    /// Background-only session probe. Never changes the visible page or erases
    /// local records. Successful verification enables cloud writes; invalid
    /// credentials only disable remote actions and show a passive status.
    func start(force: Bool = false) async {
        guard !verifyingAccount else { return }
        guard PKCloudSessionPolicy.shouldValidate(lastCheck: lastSessionValidationAt,
                                                  force: force) else { return }
        guard PKSessionVault.load() != nil else {
            accessState = .loginRequired
            syncStatus = "本机记录可用 · 登录云端后才会同步"
            return
        }
        verifyingAccount = true
        lastSessionValidationAt = .now
        defer { verifyingAccount = false }
        // Unlike the old implementation, don't flip .verified to .verifying
        // on every foreground wake: that made the Settings login UI flicker.
        do {
            let me = try await PKCloudAPI.shared.me()
            if username != me.username,
               let disk = try? PKSecureDisk.load(username: me.username) {
                snapshot = disk.state
                base = disk.base
                version = disk.version
                selectedDrugID = disk.selectedDrug
                hasPendingChanges = snapshot != base
            }
            username = me.username
            UserDefaults.standard.set(me.username, forKey: "PKAtlasLastAuthorizedAccount")
            accessState = .verified
            syncStatus = "本机记录可用 · 后台登录验证成功"
            scheduleAdoptedReview()
            Task { [weak self] in
                guard let self else { return }
                do {
                    let remote = try await PKCloudAPI.shared.state()
                    guard self.accessState == .verified else { return }
                    try self.adopt(remote, as: me.username)
                    await NativeReminderScheduler.shared.refresh()
                } catch let error as PKHTTPError where error.status == 401 || error.status == 403 {
                    self.markCloudSessionExpired()
                } catch {
                    self.syncStatus = "本机数据正常 · 云端刷新失败，稍后重试"
                }
            }
        } catch let error as PKHTTPError where error.status == 401 || error.status == 403 {
            markCloudSessionExpired()
        } catch {
            // Offline/network timeout is NOT evidence that the token was
            // revoked. Keep the local view and previously validated status.
            if accessState != .verified { accessState = .verificationUnavailable }
            syncStatus = "本机记录正常 · 网络暂不可用，云端将后台重试"
        }
    }

    private func markCloudSessionExpired() {
        PKSessionVault.clear()
        accessState = .loginRequired
        // Do not mutate username, snapshot, pending edits or the disk file.
        // They are usable offline and can be re-linked after browser login.
        syncStatus = "本机历史已保留 · 云端会话过期，可在「我的」重新登录"
    }

    func referenceMode(drugID: String) -> String {
        snapshot.settings["referenceMemory"]?.object?[drugID]?.object?["mode"]?.string ?? "blood"
    }

    func referenceValue(drugID: String, mode: String) -> Double? {
        guard ["blood", "equivalent"].contains(mode) else { return nil }
        if let stored = snapshot.settings["referenceInputs"]?.object?[drugID]?.object?[mode]?.number,
           stored.isFinite, stored > 0 { return stored }
        // Compatible with older website documents with a single reference.
        guard let memory = snapshot.settings["referenceMemory"]?.object?[drugID]?.object,
              memory["mode"]?.string == mode else { return nil }
        return memory["value"]?.number ?? memory["value"]?.string.flatMap(Double.init)
    }

    /// Same per-drug inverseMemory fields as the deployed website. Updating
    /// them uses the existing encrypted draft and debounced cloud sync path.
    func inverseDraft(for drugID: String) -> [String: String] {
        guard let data = snapshot.settings["inverseMemory"]?.object?[drugID]?.object else { return [:] }
        return data.compactMapValues { $0.string }
    }

    func saveInverseDraft(_ fields: [String: String], drugID: String) {
        guard catalog.drugs.contains(where: { $0.id == drugID }) else { return }
        let allowed: Set<String> = [
            "pointTarget", "pointTargetLimitEnabled", "pointTargetLimitBlood", "pointTargetLimitEquivalent",
            "pointMaxDose", "pointTotalMax", "pointCount", "pointPeakMin", "pointPeakMode",
            "pointCycleMin", "pointCycleMode", "targetStart", "holdHours", "inverseCount"
        ]
        var memory = snapshot.settings["inverseMemory"]?.object ?? [:]
        var current = memory[drugID]?.object ?? [:]
        var modified = false
        for (key, value) in fields where allowed.contains(key) && value.utf8.count <= 32 {
            if current[key]?.string != value {
                current[key] = .string(value)
                modified = true
            }
        }
        guard modified else { return }
        memory[drugID] = .object(current)
        snapshot.settings["inverseMemory"] = .object(memory)
        changed()
    }

    func setReference(drugID: String, mode: String, text: String) {
        guard catalog.drugs.contains(where: { $0.id == drugID }),
              ["blood", "equivalent"].contains(mode) else { return }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let next: Double?
        if trimmed.isEmpty { next = nil }
        else {
            guard let value = Double(trimmed.replacingOccurrences(of: ",", with: ".")),
                  value.isFinite, value > 0, value <= 1_000_000 else { return }
            next = value
        }
        var inputs = snapshot.settings["referenceInputs"]?.object ?? [:]
        var values = inputs[drugID]?.object ?? [:]
        if let next { values[mode] = .number(next) }
        else { values.removeValue(forKey: mode) }
        inputs[drugID] = .object(values)
        let previousInputs = snapshot.settings["referenceInputs"]
        snapshot.settings["referenceInputs"] = .object(inputs)
        var memory = snapshot.settings["referenceMemory"]?.object ?? [:]
        if let next {
            memory[drugID] = .object(["mode": .string(mode), "value": .number(next)])
        } else if let other = values[mode == "blood" ? "equivalent" : "blood"]?.number {
            let alternative = mode == "blood" ? "equivalent" : "blood"
            memory[drugID] = .object(["mode": .string(alternative), "value": .number(other)])
        } else { memory.removeValue(forKey: drugID) }
        let nextReference = PKJSON.object(memory)
        let nextInputs = PKJSON.object(inputs)
        let priorInputs = previousInputs
        // Avoid uploading identical values when a remote snapshot refreshes
        // both text fields or the view is restored from local persistence.
        let changedReference = priorInputs != nextInputs ||
            snapshot.settings["referenceMemory"] != nextReference
        snapshot.settings["referenceMemory"] = nextReference
        guard changedReference else { return }
        changed()
    }

    func unmatchedAdoptedNodes() -> [PKAdoptedUnmatchedNode] {
        guard let plan = adoptedPlanObject() else { return [] }
        return PKAdoptedUnmatchedNode.remaining(plan: plan, review: adoptedReview)
    }

    /// Fixed mathematical inputs captured when the A/B solution was adopted.
    /// An unrelated plan added later must not change that accepted scenario.
    func adoptedIncludedScheduledDoses(drugID: String? = nil) -> [PKDose] {
        let id = drugID ?? selectedDrugID
        guard let adopted = adoptedPlanObject(drugID: id),
              let entries = adopted["includedScheduledDoses"]?.array else { return [] }
        let actual = snapshot.doses.filter { $0.drug == id }
        var result: [PKDose] = []
        for value in entries {
            guard let raw = value.object,
                  raw["drug"]?.string == id,
                  let sourceID = raw["id"]?.string, !sourceID.isEmpty,
                  let milliseconds = raw["time"]?.number, milliseconds.isFinite,
                  let mg = raw["mg"]?.number, mg.isFinite, mg > 0, mg < 100_000,
                  milliseconds <= (adopted["target"]?.number ?? .infinity) else { continue }
            let node = PKDose(id: sourceID, drug: id, mg: mg,
                time: Date(timeIntervalSince1970: milliseconds / 1000),
                unit: raw["unit"]?.string ?? "mg")
            let duplicate: (PKDose) -> Bool = { other in
                other.id == node.id || (abs(other.time.timeIntervalSince(node.time)) <= 60 &&
                    abs(other.mg - node.mg) < 0.0001)
            }
            guard !actual.contains(where: duplicate), !result.contains(where: duplicate) else { continue }
            result.append(node)
        }
        return result
    }

    /// Adopted curve: only its own accepted nodes and the saved calculation
    /// inputs, never all currently scheduled doses. Everything remains a
    /// dashed what-if layer until an actual record is confirmed.
    func adoptedForecastDoses(drugID: String? = nil) -> [PKDose] {
        let id = drugID ?? selectedDrugID
        let actual = snapshot.doses.filter { $0.drug == id }
        var rows = selectedAdoptedDoses() + adoptedIncludedScheduledDoses(drugID: id)
        if id == selectedDrugID, let initial = adoptedPlanObject()?["initialModel"]?.object,
           let at = initial["at"]?.number,
           let modeledTime = initial["time"]?.number,
           let mg = initial["mg"]?.number,
           mg.isFinite, mg > 0, modeledTime.isFinite,
           !actual.contains(where: { $0.time.timeIntervalSince1970 * 1000 >= at }) {
            rows.append(PKDose(id: "pk-model-initial-assumption", drug: id, mg: mg,
                time: Date(timeIntervalSince1970: modeledTime / 1000)))
        }
        var result: [PKDose] = []
        for node in rows where node.drug == id {
            let duplicate: (PKDose) -> Bool = { other in
                node.id == other.id || (abs(node.time.timeIntervalSince(other.time)) <= 60 &&
                    abs(node.mg - other.mg) < 0.0001)
            }
            guard !actual.contains(where: duplicate), !result.contains(where: duplicate) else { continue }
            result.append(node)
        }
        return result.sorted { $0.time < $1.time }
    }

    func selectedAdoptedDoses() -> [PKDose] {
        // Only the *currently adopted* original or adjustment is plotted.
        // Old superseded original points remain above the adopted panel for
        // confirmation, but may not be counted twice with accepted changes.
        if let review = adoptedReview {
            return review.pending.map { PKDose(drug: selectedDrugID, mg: $0.mg,
                time: Date(timeIntervalSince1970: $0.time / 1000)) }
        }
        if let adjusted = adoptedPlanObject()?["adjustment"]?.object?["doses"]?.array {
            return adjusted.compactMap { item in
                guard let row = item.object,
                      let ms = row["time"]?.number, ms.isFinite,
                      let mg = row["mg"]?.number, mg.isFinite, mg > 0 else { return nil }
                return PKDose(drug: selectedDrugID, mg: mg,
                              time: Date(timeIntervalSince1970: ms / 1000))
            }
        }
        return unmatchedAdoptedNodes().map { PKDose(drug: selectedDrugID,
            mg: $0.mg, time: $0.time) }
    }

    func strengths(for drugID: String) -> [(id: String, mg: Double, unit: String, label: String)] {
        guard let value = snapshot.plans[drugID]?.object?["strengths"],
              case .array(let array) = value else { return [] }
        return array.compactMap { item in
            guard let row = item.object, let mg = row["mg"]?.number,
                  mg.isFinite, mg >= 0.001 else { return nil }
            return (id: row["id"]?.string ?? UUID().uuidString, mg: mg,
                    unit: row["unit"]?.string ?? "粒",
                    label: row["label"]?.string ?? "")
        }
    }

    func addStrength(mg: Double, unit: String, label: String) {
        guard mg.isFinite, mg >= 0.001, mg < 1_000_000,
              ["粒", "片", "袋"].contains(unit) else { return }
        let drugID = selectedDrugID
        var plan = snapshot.plans[drugID]?.object ?? [:]
        var strengths: [PKJSON]
        if let value = plan["strengths"], case .array(let old) = value {
            strengths = old
        } else { strengths = [] }
        guard strengths.count < 8 else { return }
        strengths.append(.object([
            "id": .string(UUID().uuidString),
            "mg": .number(mg),
            "unit": .string(unit),
            "label": .string(String(label.prefix(40)))
        ]))
        plan["strengths"] = .array(strengths)
        snapshot.plans[drugID] = .object(plan)
        changed()
    }

    func deleteStrength(id: String) {
        var plan = snapshot.plans[selectedDrugID]?.object ?? [:]
        guard let value = plan["strengths"], case .array(let old) = value else { return }
        plan["strengths"] = .array(old.filter { $0.object?["id"]?.string != id })
        snapshot.plans[selectedDrugID] = .object(plan)
        changed()
    }

    func adoptInverse(_ candidate: PKInverseCandidate, variant: String,
                      mode: String, threshold: Double, target: Date,
                      cap: String, count: String, peakMin: Double,
                      peakMode: String, cycleMin: Double, cycleMode: String,
                      totalMax: Double?, includedScheduledDoses: [PKDose] = [],
                      initialHypothesis: PKDose? = nil,
                      initialValue: Double? = nil) {
        guard username != nil, ["A", "B"].contains(variant),
              let doses = candidate.doses, !doses.isEmpty else { return }
        var memory = snapshot.settings["inverseMemory"]?.object ?? [:]
        var drugMemory = memory[selectedDrugID]?.object ?? [:]
        let baseline = snapshot.doses.filter { $0.drug == selectedDrugID }
            .map { PKJSON.string($0.id) }
        let planned = doses.map { item -> PKJSON in
            var object: [String: PKJSON] = [
                "time": .number(item.time),
                "mg": .number(item.mg)
            ]
            if let parts = item.parts { object["parts"] = .array(parts) }
            return .object(object)
        }
        drugMemory["adoptedPointPlan"] = .object([
            "v": .number(1),
            "variant": .string(variant),
            "drug": .string(selectedDrugID),
            "adoptedAt": .number(Date.now.timeIntervalSince1970 * 1000),
            "target": .number(target.timeIntervalSince1970 * 1000),
            "threshold": .number(threshold),
            "mode": .string(mode),
            "cap": .string(cap),
            "count": .string(count),
            "peakMin": .number(peakMin),
            "peakMode": .string(peakMode),
            "cycleMin": .number(cycleMin),
            "cycleMode": .string(cycleMode),
            "totalMax": .number(totalMax ?? 0),
            "baselineIds": .array(baseline),
            // Model-only initial state: never an actual intake or notification.
            "initialModel": (initialHypothesis.flatMap { initial -> PKJSON? in
                guard initial.mg.isFinite, initial.mg > 0,
                      initial.time < .now,
                      let initialValue, initialValue.isFinite, initialValue > 0 else { return nil }
                return .object([
                    "time": .number(initial.time.timeIntervalSince1970 * 1000),
                    "mg": .number(initial.mg),
                    "value": .number(initialValue),
                    "mode": .string(mode),
                    "at": .number(Date.now.timeIntervalSince1970 * 1000),
                    "planningOnly": .bool(true)
                ])
            } ?? .null),
            "includedScheduledDoses": .array(includedScheduledDoses.filter {
                $0.drug == selectedDrugID && $0.time <= target &&
                $0.mg.isFinite && $0.mg > 0 && $0.mg < 100_000
            }.map { dose in .object([
                "id": .string(dose.id), "drug": .string(dose.drug),
                "time": .number(dose.time.timeIntervalSince1970 * 1000),
                "mg": .number(dose.mg), "unit": .string(dose.unit)
            ]) }),
            "doses": .array(planned),
            "manualMatches": .object([:])
        ])
        memory[selectedDrugID] = .object(drugMemory)
        snapshot.settings["inverseMemory"] = .object(memory)
        clearCurvePreview()
        adoptedReviewGeneration += 1
        adoptedReview = nil
        changed()
        Task { await NativeReminderScheduler.shared.reconcileAfterAdoptedPlanChange() }
    }

    /// Edit/delete a *hypothetical adopted node*, never a taken dose.
    /// Persist via the same account snapshot as the website. Delete/edits
    /// invalidate generated adjustments and manual mappings for this node.
    @discardableResult
    func updateAdoptedNode(index: Int, mg: Double, time: Date) -> Bool {
        guard mg.isFinite, mg > 0, mg < 100_000,
              let plan = adoptedPlanObject(),
              let raw = plan["doses"], case .array(let nodes) = raw,
              nodes.indices.contains(index), var item = nodes[index].object else { return false }
        let timeMS = time.timeIntervalSince1970 * 1000
        guard timeMS.isFinite,
              timeMS <= (plan["target"]?.number ?? Double.infinity) else { return false }
        item["mg"] = .number(mg)
        item["time"] = .number(timeMS)
        item.removeValue(forKey: "parts")
        // A moved node can cross neighbors. Sort chronologically while
        // preserving each other node's explicit record-link selection.
        var labeled = nodes.enumerated().map { (oldIndex: $0.offset, row: $0.element) }
        labeled[index].row = .object(item)
        labeled.sort {
            let a = $0.row.object?["time"]?.number ?? 0
            let b = $1.row.object?["time"]?.number ?? 0
            return a == b ? $0.oldIndex < $1.oldIndex : a < b
        }
        var revised = plan
        revised["doses"] = .array(labeled.map(\.row))
        revised.removeValue(forKey: "adjustment")
        let manual = revised["manualMatches"]?.object ?? [:]
        var remapped: [String: PKJSON] = [:]
        for (newIndex, element) in labeled.enumerated() where element.oldIndex != index {
            if let previous = manual[String(element.oldIndex)] {
                remapped[String(newIndex)] = previous
            }
        }
        revised["manualMatches"] = .object(remapped)
        updateAdoptedPlan(revised)
        return true
    }

    /// Edits an accepted adjustment node without accidentally mutating the
    /// original plan node or creating a real medication record.
    @discardableResult
    func updateAdoptedAdjustmentNode(index: Int, mg: Double, time: Date) -> Bool {
        guard mg.isFinite, mg > 0, mg < 100_000,
              var plan = adoptedPlanObject(),
              var adjustment = plan["adjustment"]?.object,
              let raw = adjustment["doses"], case .array(var nodes) = raw,
              nodes.indices.contains(index), var value = nodes[index].object else { return false }
        let at = time.timeIntervalSince1970 * 1000
        guard at.isFinite, at <= (plan["target"]?.number ?? .infinity) else { return false }
        value["mg"] = .number(mg)
        value["time"] = .number(at)
        value.removeValue(forKey: "parts")
        nodes[index] = .object(value)
        nodes.sort { ($0.object?["time"]?.number ?? 0) < ($1.object?["time"]?.number ?? 0) }
        adjustment["doses"] = .array(nodes)
        adjustment["adoptedAt"] = .number(Date.now.timeIntervalSince1970 * 1000)
        plan["adjustment"] = .object(adjustment)
        updateAdoptedPlan(plan)
        return true
    }

    @discardableResult
    func deleteAdoptedAdjustmentNode(index: Int) -> Bool {
        guard var plan = adoptedPlanObject(),
              var adjustment = plan["adjustment"]?.object,
              let raw = adjustment["doses"], case .array(var nodes) = raw,
              nodes.indices.contains(index) else { return false }
        nodes.remove(at: index)
        adjustment["doses"] = .array(nodes)
        adjustment["adoptedAt"] = .number(Date.now.timeIntervalSince1970 * 1000)
        plan["adjustment"] = .object(adjustment)
        updateAdoptedPlan(plan)
        return true
    }

    @discardableResult
    func deleteAdoptedNode(index: Int) -> Bool {
        guard let plan = adoptedPlanObject(),
              let raw = plan["doses"], case .array(var nodes) = raw,
              nodes.indices.contains(index) else { return false }
        nodes.remove(at: index)
        if nodes.isEmpty {
            cancelAdoptedInverse()
            return true
        }
        var revised = plan
        revised["doses"] = .array(nodes)
        revised.removeValue(forKey: "adjustment")
        let previous = revised["manualMatches"]?.object ?? [:]
        var shifted: [String: PKJSON] = [:]
        for (key, value) in previous {
            guard let position = Int(key), position != index else { continue }
            shifted[String(position > index ? position - 1 : position)] = value
        }
        revised["manualMatches"] = .object(shifted)
        updateAdoptedPlan(revised)
        return true
    }

    func cancelAdoptedInverse() {
        clearCurvePreview()
        var memory = snapshot.settings["inverseMemory"]?.object ?? [:]
        var drugMemory = memory[selectedDrugID]?.object ?? [:]
        drugMemory.removeValue(forKey: "adoptedPointPlan")
        memory[selectedDrugID] = .object(drugMemory)
        snapshot.settings["inverseMemory"] = .object(memory)
        adoptedReviewGeneration += 1
        adoptedReview = nil
        changed()
        Task { await NativeReminderScheduler.shared.reconcileAfterAdoptedPlanChange() }
    }

    func switchDrug(_ id: String) {
        guard catalog.drugs.contains(where: { $0.id == id }) else { return }
        selectedDrugID = id
        clearCurvePreview()
        adoptedReview = nil
        saveLocal()
        scheduleAdoptedReview()
    }

    private func saveLocal() {
        do {
            let committedAt = Date.now
            try PKSecureDisk.save(
                PKDiskDocument(state: snapshot, base: base, version: version,
                               selectedDrug: selectedDrugID, savedAt: committedAt),
                username: username ?? "__local__"
            )
            lastLocalSavedAt = committedAt
        } catch {
            errorMessage = error.localizedDescription + "。请勿清理应用数据。"
            showingError = true
            syncStatus = "本机保存失败"
        }
    }

    private func changed() {
        hasPendingChanges = snapshot != base
        if username != nil {
            pendingUploadId = UUID().uuidString
            UserDefaults.standard.set(pendingUploadId, forKey: "PKAtlasPendingUploadID")
        }
        saveLocal()
        scheduleAdoptedReview()
        guard !showingError else { return }
        if username != nil {
            syncStatus = hasPendingChanges ? "本机已保存，等待云端确认" : "云端已同步"
            syncTask?.cancel()
            syncTask = Task { [weak self] in
                try? await Task.sleep(for: .milliseconds(650))
                if !Task.isCancelled { await self?.sync() }
            }
        } else {
            syncStatus = "本机加密保存 · 未登录"
        }
    }

    func addDose(drug: String, mg: Double, time: Date) {
        guard catalog.drugs.contains(where: { $0.id == drug }),
              mg.isFinite, mg > 0, mg < 100_000 else { return }
        snapshot.saveDose(PKDose(drug: drug, mg: mg, time: time))
        changed()
    }

    /// The user's explicit Health medication-name mapping is part of the
    /// *existing* account snapshot, and follows last-successful-upload sync.
    /// Unknown products, counts and volumes are never silently converted.
    /// Audit acceptance is an acknowledgement, not a modification of the
    /// underlying sample. A content hash invalidates old acknowledgement if
    /// the imported record changes after review.
    func isAuditConfirmed(_ fingerprint: String) -> Bool {
        snapshot.settings["dataReviewConfirmations"]?.object?[fingerprint] != nil
    }

    func setAuditConfirmed(_ fingerprint: String, confirmed: Bool) {
        guard fingerprint.count == 64, fingerprint.allSatisfy({ $0.isHexDigit }) else { return }
        var flags = snapshot.settings["dataReviewConfirmations"]?.object ?? [:]
        if confirmed {
            flags[fingerprint] = .object([
                "confirmedAt": .number(Date.now.timeIntervalSince1970 * 1000),
                "result": .string("reviewed-as-entered")
            ])
        } else { flags.removeValue(forKey: fingerprint) }
        snapshot.settings["dataReviewConfirmations"] = .object(flags)
        changed()
    }

    func healthMappedDrug(_ event: PKHealthDoseMatch) -> String? {
        if let chosen = healthReview(for: event.eventUUID)["drugId"]?.string,
           catalog.drugs.contains(where: { $0.id == chosen }) { return chosen }
        if PKHealthMedications.isUnlinkedName(event.medicationName) { return nil }
        let key = PKHealthMedications.canonicalKey(event.medicationName)
        if let mapped = snapshot.settings["healthMedicationMappings"]?.object?[key]?.object,
           let drug = mapped["drugId"]?.string,
           catalog.drugs.contains(where: { $0.id == drug }) { return drug }
        return event.drugID
    }

    func setHealthMapping(medicationName: String, drugID: String?) {
        let key = PKHealthMedications.canonicalKey(medicationName)
        guard key.count >= 2, key.count <= 120, medicationName.count <= 200 else { return }
        if let drugID { guard catalog.drugs.contains(where: { $0.id == drugID }) else { return } }
        var mapping = snapshot.settings["healthMedicationMappings"]?.object ?? [:]
        if let drugID {
            mapping[key] = .object([
                "sourceName": .string(medicationName),
                "drugId": .string(drugID),
                "source": .string("manually-reviewed-healthkit"),
                "reviewedAt": .number(Date.now.timeIntervalSince1970 * 1000)
            ])
        } else { mapping.removeValue(forKey: key) }
        snapshot.settings["healthMedicationMappings"] = .object(mapping)
        // A user changing an approved name mapping must also change the
        // corresponding confirmed dose review. Never leave the *old drug* in
        // the calculation input after its mapping has been corrected.
        var reviews = snapshot.settings["healthEventReviews"]?.object ?? [:]
        for (eventID, value) in reviews {
            guard var review = value.object,
                  let sourceName = review["sourceName"]?.string,
                  PKHealthMedications.canonicalKey(sourceName) == key else { continue }
            if let drugID { review["drugId"] = .string(drugID) }
            else { review.removeValue(forKey: "drugId") }
            review.removeValue(forKey: "nearbyDecision")
            review.removeValue(forKey: "nearbyRecordID")
            reviews[eventID] = .object(review)
        }
        snapshot.settings["healthEventReviews"] = .object(reviews)
        PKConfirmedHealthReconciler.reconcile(&snapshot, catalog: catalog)
        changed()
    }

    /// For orphaned HealthKit events, never map every event sharing a generic
    /// “unlinked” label. The user's choice is bound to this one event UUID.
    func setHealthEventDrug(_ event: PKHealthDoseMatch, drugID: String?) {
        if let drugID { guard catalog.drugs.contains(where: { $0.id == drugID }) else { return } }
        var reviews = snapshot.settings["healthEventReviews"]?.object ?? [:]
        var entry = reviews[event.eventUUID.uuidString]?.object ?? [:]
        if let drugID { entry["drugId"] = .string(drugID) }
        else { entry.removeValue(forKey: "drugId") }
        entry.removeValue(forKey: "nearbyDecision")
        entry.removeValue(forKey: "nearbyRecordID")
        reviews[event.eventUUID.uuidString] = .object(entry)
        snapshot.settings["healthEventReviews"] = .object(reviews)
        PKConfirmedHealthReconciler.reconcile(&snapshot, catalog: catalog)
        changed()
    }

    /// Matches only HealthKit events explicitly logged as taken, with a
    /// curated/unambiguous catalog drug and a real mass dose. No extra import
    /// tap is required: a non-overlapping intake enters the same dose records
    /// used by both charts. Near-time intakes remain pending for user consent.
    @discardableResult
    func reconcileAutomaticHealthEvents(_ events: [PKHealthDoseMatch]) -> PKConfirmedHealthReconciler.Summary {
        var reviews = snapshot.settings["healthEventReviews"]?.object ?? [:]
        let previousPending = Set(reviews.compactMap { key, value in
            value.object?["nearbyRecordID"]?.string == nil ? nil : key
        })
        PKConfirmedHealthReconciler.stageAutomatic(events,
            state: &snapshot, catalog: catalog)
        var report = PKConfirmedHealthReconciler.reconcile(&snapshot, catalog: catalog)
        if report.changed { changed() }
        let pending = (snapshot.settings["healthEventReviews"]?.object ?? [:]).compactMap { key, value in
            value.object?["nearbyRecordID"]?.string == nil ? nil : key
        }
        let newlyPending = Set(pending).subtracting(previousPending).count
        if report.inserted > 0 || newlyPending > 0 {
            healthAutoNotice = "Apple 健康：已自动纳入 \(report.inserted) 条实际服用；\(newlyPending) 条时间相近，需核对后处理。"
        }
        report.pendingNearby = newlyPending
        return report
    }

    func nearbyHealthRecord(_ event: PKHealthDoseMatch) -> PKDose? {
        guard let id = healthReview(for: event.eventUUID)["nearbyRecordID"]?.string else { return nil }
        return snapshot.doses.first(where: { $0.id == id })
    }

    enum HealthNearResolution {
        case linkExisting, separateIntake, ignore
    }

    /// Only this explicit confirmation resolves an ambiguous near-time event.
    func resolveNearbyHealthEvent(_ event: PKHealthDoseMatch, decision: HealthNearResolution) {
        let key = event.eventUUID.uuidString
        var reviews = snapshot.settings["healthEventReviews"]?.object ?? [:]
        guard var review = reviews[key]?.object,
              let otherID = review["nearbyRecordID"]?.string,
              nearbyHealthRecord(event) != nil else { return }
        switch decision {
        case .linkExisting:
            review["nearbyDecision"] = .string("link:" + otherID)
            review["selected"] = .bool(true)
        case .separateIntake:
            review["nearbyDecision"] = .string("separate")
            review["selected"] = .bool(true)
        case .ignore:
            review["nearbyDecision"] = .string("ignore")
            review["selected"] = .bool(false)
        }
        reviews[key] = .object(review)
        snapshot.settings["healthEventReviews"] = .object(reviews)
        PKConfirmedHealthReconciler.reconcile(&snapshot, catalog: catalog)
        changed()
        healthAutoNotice = decision == .ignore
            ? "已忽略这条 Apple 健康记录，未修改既有服用记录。"
            : "已按确认结果处理相近时间事件，模型和云端同步队列已更新。"
    }

    func clearHealthAutoNotice() { healthAutoNotice = "" }

    func healthReview(for eventUUID: UUID) -> [String: PKJSON] {
        snapshot.settings["healthEventReviews"]?.object?[eventUUID.uuidString]?.object ?? [:]
    }

    func reviewHealthEvent(_ event: PKHealthDoseMatch, selected: Bool,
                           doseMG: Double?, correctedTime: Date?) {
        // A deliberately chosen mass dose can be manually added when the
        // HealthKit source reports counts/volumes, but must be reviewed as a
        // manually adjusted entry, never an automated unit conversion.
        guard doseMG == nil || (doseMG!.isFinite && doseMG! > 0 && doseMG! < 100_000),
              let correctedTime, correctedTime <= Date.now.addingTimeInterval(120) else { return }
        var reviews = snapshot.settings["healthEventReviews"]?.object ?? [:]
        // Preserve per-event drug choice for archived/unlinked medications.
        // A dose/time review must not erase the earlier manual mapping.
        var entry = reviews[event.eventUUID.uuidString]?.object ?? [:]
        entry["selected"] = .bool(selected)
        entry["reviewedAt"] = .number(Date.now.timeIntervalSince1970 * 1000)
        entry["time"] = .number(correctedTime.timeIntervalSince1970 * 1000)
        entry["source"] = .string("healthkit-manual-review")
        if !PKHealthMedications.isUnlinkedName(event.medicationName) {
            entry["sourceName"] = .string(event.medicationName)
        }
        if let doseMG { entry["doseMG"] = .number(doseMG) }
        else { entry.removeValue(forKey: "doseMG") }
        if let drug = healthMappedDrug(event) { entry["drugId"] = .string(drug) }
        else { entry.removeValue(forKey: "drugId") }
        reviews[event.eventUUID.uuidString] = .object(entry)
        snapshot.settings["healthEventReviews"] = .object(reviews)
        PKConfirmedHealthReconciler.reconcile(&snapshot, catalog: catalog)
        changed()
    }

    func healthEventSelected(_ event: PKHealthDoseMatch) -> Bool {
        if case .bool(let value)? = healthReview(for: event.eventUUID)["selected"] { return value }
        return false
    }

    func resolvedHealthEvent(_ event: PKHealthDoseMatch) -> PKHealthDoseMatch {
        let review = healthReview(for: event.eventUUID)
        let mg = review["doseMG"]?.number ?? event.mg
        let time = review["time"]?.number.map { Date(timeIntervalSince1970: $0 / 1000) } ?? event.time
        return PKHealthDoseMatch(eventUUID: event.eventUUID,
            medicationName: event.medicationName,
            drugID: healthMappedDrug(event), mg: mg,
            quantityText: event.quantityText, time: time)
    }

    var healthMappingCount: Int {
        snapshot.settings["healthMedicationMappings"]?.object?.count ?? 0
    }

    /// Selected and dose-verified HealthKit events now become actual doses as
    /// part of the review transaction. This button is an idempotent repair for
    /// older confirmed reviews, not a second consent gate.
    @discardableResult
    func importHealthMatches(_ items: [PKHealthDoseMatch]) -> (imported: Int, linked: Int, skipped: Int) {
        var eligible = 0
        for item in items where healthEventSelected(item) { eligible += 1 }
        let result = PKConfirmedHealthReconciler.reconcile(&snapshot, catalog: catalog)
        if result.changed { changed() }
        return (result.inserted, result.linked, max(0, eligible - result.inserted - result.linked))
    }

    @discardableResult
    func reconcileConfirmedHealthReviews() -> PKConfirmedHealthReconciler.Summary {
        let result = PKConfirmedHealthReconciler.reconcile(&snapshot, catalog: catalog)
        if result.changed { changed() }
        return result
    }

    var confirmedHealthRecordCount: Int {
        let links = snapshot.settings["healthDoseLinks"]?.object ?? [:]
        let ids = Set(snapshot.records.compactMap { $0["id"]?.string })
        return Set(links.values.compactMap(\.string)).intersection(ids).count
    }

    func editDose(_ dose: PKDose) {
        guard dose.mg.isFinite, dose.mg > 0, dose.mg < 100_000 else { return }
        snapshot.saveDose(dose); changed()
    }
    func removeDose(_ id: String) { snapshot.deleteDose(id); changed() }

    func addMeal(time: Date, kind: String, mealType: String,
                 drink: String, note: String) {
        guard ["meal","drink"].contains(kind) else { return }
        snapshot.saveIntake(PKIntake(id: UUID().uuidString, time: time, kind: kind,
                                     mealType: mealType, drink: drink, note: note))
        changed()
    }
    func deleteMeal(_ id: String) { snapshot.deleteIntake(id); changed() }

    func finishWebAuthorization(username user: String) async {
        busy = true
        defer { busy = false }
        do {
            let remote = try await PKCloudAPI.shared.state()
            try adopt(remote, as: user)
            UserDefaults.standard.set(user, forKey: "PKAtlasLastAuthorizedAccount")
            accessState = .verified
            await NativeReminderScheduler.shared.refresh()
            await PKRemotePushManager.shared.registerIfAuthorized()
        } catch {
            errorMessage = "网页授权已完成，但首次同步失败：" + error.localizedDescription
            showingError = true
        }
    }

    private func adopt(_ remote: PKServerResponse, as user: String) throws {
        let old = try? PKSecureDisk.load(username: user)
        username = user
        // Local changes (including deletions) represent a complete candidate
        // account state. A successful commit, not a field merge, wins.
        if let old, old.state != old.base {
            snapshot = old.state
            selectedDrugID = old.selectedDrug
        } else {
            snapshot = remote.state
            selectedDrugID = old?.selectedDrug ?? remote.state.settings["currentDrug"]?.string ?? "pregabalin"
        }
        base = remote.state
        // Repair historical HealthKit approvals that older builds persisted in
        // settings without ever making a calculation record. This is an
        // idempotent local transaction; changes are submitted via normal sync.
        PKConfirmedHealthReconciler.reconcile(&snapshot, catalog: catalog)
        version = remote.version
        conflict = false
        hasPendingChanges = snapshot != base
        saveLocal()
        syncStatus = hasPendingChanges
            ? "本机有完整草稿，待最后上传确认"
            : "已读取服务器最后成功提交版本"
        scheduleAdoptedReview()
        if hasPendingChanges { Task { await sync() } }
    }

    private func adoptedPlanContents(_ state: PKCloudState) -> [String: PKJSON] {
        let memory = state.settings["inverseMemory"]?.object ?? [:]
        return memory.reduce(into: [String: PKJSON]()) { result, element in
            if let adopted = element.value.object?["adoptedPointPlan"] {
                result[element.key] = adopted
            }
        }
    }

    /// While this App is foreground-visible, compare a tiny cloud revision
    /// about every four seconds. Pull only when it changed; never discard an
    /// unsent encrypted local draft or fake a successful background push.
    func refreshIfCloudRevisionChanged() async {
        guard accessState == .verified, username != nil,
              !syncRunning, !hasPendingChanges, !conflict else { return }
        do {
            let remoteVersion = try await PKCloudAPI.shared.stateRevision()
            if remoteVersion != version { await refresh() }
        } catch {
            // Existing local state remains usable when offline.
        }
    }

    func refresh() async {
        guard accessState == .verified, username != nil, !syncRunning, !hasPendingChanges else {
            if hasPendingChanges { await sync() }
            return
        }
        do {
            let remote = try await PKCloudAPI.shared.state()
            if !hasPendingChanges {
                let changedAdopted = adoptedPlanContents(snapshot) != adoptedPlanContents(remote.state)
                if changedAdopted {
                    adoptedReviewGeneration += 1
                    adoptedReview = nil
                }
                snapshot = remote.state
                base = remote.state
                PKConfirmedHealthReconciler.reconcile(&snapshot, catalog: catalog)
                version = remote.version
                hasPendingChanges = snapshot != base
                saveLocal()
                if hasPendingChanges { Task { await self.sync() } }
                syncStatus = "云端已同步"
                scheduleAdoptedReview()
                if changedAdopted {
                    await NativeReminderScheduler.shared.reconcileAfterAdoptedPlanChange()
                    await NativeReminderScheduler.shared.announceRemoteAdoptedChange()
                }
            }
        } catch {
            syncStatus = "离线 · 本机模型仍可使用"
        }
    }

    func sync() async {
        guard accessState == .verified, username != nil, !syncRunning, !conflict, hasPendingChanges else { return }
        syncRunning = true
        defer { syncRunning = false }
        let sent = snapshot
        let operationId = uploadID()
        syncStatus = "正在上传完整数据，以服务器最后成功提交为准…"
        do {
            _ = try await PKCloudAPI.shared.putLastUploadSnapshot(
                version: version, state: sent, operationId: operationId)
            let remote = try await PKCloudAPI.shared.state()
            let adoptedWasReplaced = adoptedPlanContents(base) != adoptedPlanContents(remote.state)
            if adoptedWasReplaced {
                adoptedReviewGeneration += 1
                adoptedReview = nil
            }
            base = remote.state
            version = remote.version
            if snapshot == sent {
                // A subsequent device may have committed between PUT and GET.
                // Respect that later server state rather than retrying ours.
                snapshot = remote.state
                clearUploadID(ifMatches: operationId)
            }
            hasPendingChanges = snapshot != base
            conflict = false
            saveLocal()
            scheduleAdoptedReview()
            syncStatus = hasPendingChanges
                ? "上传期间有新的本机修改，将以新编号继续上传"
                : "已回读确认最后成功提交的云端完整版本"
            if hasPendingChanges {
                Task {
                    try? await Task.sleep(for: .milliseconds(500))
                    await self.sync()
                }
            }
            if adoptedWasReplaced {
                await NativeReminderScheduler.shared.reconcileAfterAdoptedPlanChange()
            } else {
                await NativeReminderScheduler.shared.refresh()
            }
        } catch let error as PKHTTPError where error.status == 409 || error.status == 426 {
            conflict = true
            syncStatus = "服务器仍为旧版同步协议；已停止自动上传，保留本机草稿"
            saveLocal()
        } catch {
            syncStatus = "暂时无法确认上传；本机草稿和原请求编号已保留，重试不会覆盖后来提交的内容"
            saveLocal()
        }
    }

    func resolveConflictByUsingCloud() async {
        guard username != nil else { return }
        do {
            let latest = try await PKCloudAPI.shared.state()
            snapshot = latest.state
            base = latest.state
            version = latest.version
            conflict = false; hasPendingChanges = false
            syncStatus = "已选择云端版本"
            if let pendingUploadId { clearUploadID(ifMatches: pendingUploadId) }
            saveLocal()
        } catch {
            syncStatus = "无法读取云端版本，请稍后重试"
        }
    }

    func logout() async {
        // Never erase encrypted local state. Offline drafts must remain
        // recoverable after re-authentication.
        saveLocal()
        await PKRemotePushManager.shared.unregisterCurrentDevice()
        try? await PKCloudAPI.shared.logout()
        PKSessionVault.clear()
        UserDefaults.standard.removeObject(forKey: "PKAtlasLastAuthorizedAccount")
        accessState = .loginRequired
        if let pendingUploadId { clearUploadID(ifMatches: pendingUploadId) }
        await NativeReminderScheduler.shared.clear()
        username = nil
        if let anonymous = try? PKSecureDisk.load(username: "__local__") {
            snapshot = anonymous.state; base = anonymous.base
            version = anonymous.version; selectedDrugID = anonymous.selectedDrug
        } else {
            snapshot = PKCloudState(); base = snapshot; version = 0
        }
        hasPendingChanges = snapshot != base
        conflict = false
        syncStatus = "已退出 · 本机私人快照仍加密保存"
    }

    func exportSnapshot() throws -> URL {
        let data = try JSONEncoder().encode(snapshot)
        let out = FileManager.default.temporaryDirectory.appendingPathComponent(
            "PKAtlas-state-\(Int(Date().timeIntervalSince1970)).json")
        try data.write(to: out, options: .atomic)
        return out
    }
}
