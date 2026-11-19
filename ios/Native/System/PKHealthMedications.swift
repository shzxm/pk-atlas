import Foundation
import HealthKit
import Combine
import UIKit
import os
import UserNotifications

/// One authorized Health medication dose, matched conservatively to a catalog
/// entry. Dose quantities expressed as counts or volumes are NOT mg values.
struct PKHealthDoseMatch: Identifiable {
    var id: String { eventUUID.uuidString }
    let eventUUID: UUID
    let medicationName: String
    let drugID: String?
    let mg: Double?
    let quantityText: String
    let time: Date
}

struct PKHealthAliasDocument: Codable {
    let schemaVersion: Int
    let version: String
    let aliases: [String: [String: [String]]]
}

/// Separate automatic scheduling from permissions. HealthKit read consent
/// cannot be silently bypassed on first use. Once the system request has been
/// attempted, subsequent foreground reads only query previously authorized
/// medications, without launching HealthKit permission UI repeatedly.
enum PKHealthAutomaticPolicy {
    static let authorizationAttemptedKey = "PKHealthPerObjectAuthorizationAttempted"
    static let minForegroundInterval: TimeInterval = 25

    static func needsFirstAuthorization(_ defaults: UserDefaults = .standard) -> Bool {
        !defaults.bool(forKey: authorizationAttemptedKey)
    }
    static func shouldRead(lastAttempt: Date?, at now: Date = .now) -> Bool {
        guard let lastAttempt else { return true }
        return now.timeIntervalSince(lastAttempt) >= minForegroundInterval
    }
}

/// Read-only HealthKit bridge. Apple doesn't expose third-party creation of
/// HKMedicationDoseEvent. All imports are explicitly confirmed by the user.
@MainActor
final class PKHealthMedications: ObservableObject {
    static let shared = PKHealthMedications()
    @Published private(set) var status = "尚未读取 Apple 健康"
    @Published private(set) var approvedMedications: [String] = []
    @Published private(set) var matches: [PKHealthDoseMatch] = []
    @Published private(set) var orphanDoseCount = 0
    @Published private(set) var skippedStatusCount = 0
    @Published private(set) var reviewing = false
    @Published private(set) var lastReadAt: Date?
    @Published private(set) var aliasSyncStatus = "内置审核词库"
    private var networkAliases: [String: [String: [String]]]?
    private var lastAliasCheck: Date?
    private var lastAutomaticAttempt: Date?

    private let healthStore = HKHealthStore()
    private let log = Logger(subsystem: "com.example.PKAtlas", category: "HealthMedicationRead")

    // HealthKit requires the provisioning/signing entitlement to be valid.
    // The iOS SDK does not publicly expose SecTaskCreateFromSelf: do not
    // guess entitlement status from an unsigned app's source plist.

    private func checkpoint(_ name: String) {
        log.info("HealthKit read stage: \(name, privacy: .public)")
        UserDefaults.standard.set(name, forKey: "PKHealthLastReadStage")
    }

    /// Stable cloud matching key. Never use a patient's device identity here.
    nonisolated static func canonicalKey(_ name: String) -> String {
        String(name.lowercased().replacingOccurrences(of: "[^\\p{L}\\p{N}]", with: "",
                       options: .regularExpression).prefix(120))
    }

    /// Curated generic-name and common brand aliases for the medicines actually
    /// present in the local catalog. Entries are locale-prioritized but checked
    /// globally because imported Health labels can use another language.
    /// Never infer a specific antiretroviral combination from bare “PrEP”:
    /// FTC/TDF and FTC/TAF are different products.
    /// Server-curated aliases bundled for offline recognition. User-submitted
    /// feedback is stored separately and cannot change live matching directly.
    nonisolated static let aliases: [String: [String: [String]]] = {
        guard let url = Bundle.main.url(forResource: "health-medication-aliases", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let document = try? JSONDecoder().decode(PKHealthAliasDocument.self, from: data),
              document.schemaVersion == 1 else { return [:] }
        return document.aliases
    }()

    nonisolated static func normalizedLabel(_ value: String) -> String {
        value.folding(options: [.caseInsensitive, .diacriticInsensitive, .widthInsensitive],
                      locale: Locale(identifier: "en_US_POSIX"))
            .replacingOccurrences(of: "[^\\p{L}\\p{N}]", with: "", options: .regularExpression)
            .lowercased()
    }

    nonisolated static func isUnlinkedName(_ name: String) -> Bool {
        name.hasPrefix("未关联 Apple 健康药物")
    }

    /// Do not infer a drug from a brand name, generic PrEP or guess unit conversion.
    static func matchCatalog(_ name: String, catalog: PKCatalog,
                             locale: Locale = .current) -> String? {
        let haystack = normalizedLabel(name)
        guard !haystack.isEmpty, !isUnlinkedName(name) else { return nil }
        // A method of HIV prevention is not itself a unique medication.
        if ["prep", "hivprep", "暴露前预防", "暴露前預防"].contains(haystack) { return nil }
        let language = locale.language.languageCode?.identifier ?? "zh"
        let isTraditional = locale.identifier.lowercased().contains("hant") ||
            locale.identifier.lowercased().contains("tw") || locale.identifier.lowercased().contains("hk")
        let preferred = isTraditional ? "zh-Hant" : language
        var found = Set<String>()
        let candidates = catalog.drugs
        for drug in candidates {
            var terms = [drug.name, drug.en ?? "", drug.id]
            if let local = (shared.networkAliases ?? aliases)[drug.id] {
                terms += local[preferred] ?? []
                // Always support mixed-language exports from other phones.
                for (lang, values) in local where lang != preferred { terms += values }
            }
            // Compare aliases with boundaries where available; no fuzzy/Levenshtein
            // guesses. Short alphabetic abbreviations are exact-token only.
            let match = terms.contains { raw in
                let token = normalizedLabel(raw)
                guard token.count >= 2 else { return false }
                if token == haystack { return true }
                if token == "prep" { return false }
                let cjk = raw.range(of: "[\\p{Han}\\p{Hiragana}\\p{Katakana}\\p{Thai}]", options: .regularExpression) != nil
                if cjk { return token.count >= 2 && haystack.contains(token) }
                if token.count < 5 { return false }
                // Normalization accepts strength/suffixes such as 75mg or tablets;
                // avoid match against another medicine's longer root.
                return haystack.hasPrefix(token) || haystack.hasSuffix(token)
            }
            if match { found.insert(drug.id) }
        }
        return found.count == 1 ? found.first : nil
    }

    /// Called automatically on every cold start and foreground return. Only
    /// the first access can trigger a real iOS consent sheet; after that we
    /// query the already granted medication objects without prompting.
    func refreshAutomatically() async {
        guard PKHealthAutomaticPolicy.shouldRead(lastAttempt: lastAutomaticAttempt) else { return }
        lastAutomaticAttempt = .now
        await syncCuratedAliases()
        await readMedicationHistory(requestAuthorization: PKHealthAutomaticPolicy.needsFirstAuthorization())
    }

    /// Optional explicit re-authorization for newly added/previously denied
    /// medications. User need not press this button during normal launches.
    func requestAndRead() async {
        await syncCuratedAliases(force: true)
        await readMedicationHistory(requestAuthorization: true)
    }

    private func syncCuratedAliases(force: Bool = false) async {
        if !force, let lastAliasCheck, Date.now.timeIntervalSince(lastAliasCheck) < 6 * 3600 { return }
        lastAliasCheck = .now
        do {
            let manifest: PKHealthAliasDocument = try await PKCloudAPI.shared.request("/api/native/health-aliases")
            let validIds = Set(NativeAppStore.shared.catalog.drugs.map(\.id))
            guard manifest.schemaVersion == 1, (1...64).contains(manifest.version.count),
                  !manifest.aliases.isEmpty, manifest.aliases.count <= 300,
                  manifest.aliases.keys.allSatisfy({ validIds.contains($0) }),
                  manifest.aliases.values.allSatisfy({ languageSets in
                      languageSets.count <= 20 && languageSets.values.allSatisfy { names in
                          names.count <= 100 && names.allSatisfy {
                              (2...120).contains($0.count) && !Self.normalizedLabel($0).isEmpty
                          }
                      }
                  }) else {
                aliasSyncStatus = "服务器审核词库不符合约定，继续使用内置词库"
                return
            }
            networkAliases = manifest.aliases
            aliasSyncStatus = "181 审核词库已同步 · \(manifest.version)"
        } catch {
            aliasSyncStatus = "离线使用 App 内置审核词库"
        }
    }

    private func readMedicationHistory(requestAuthorization: Bool) async {
        guard !reviewing else { return }
        guard HKHealthStore.isHealthDataAvailable() else {
            status = "此设备尚不支持 Apple 健康"; return
        }
        reviewing = true
        // Preserve the last successfully read list if the network, entitlement
        // or Apple Health database is temporarily unavailable.
        defer { reviewing = false }
        do {
            let medType = HKObjectType.userAnnotatedMedicationType()
            // Apple WWDC25 medications API: per-object authorization for the
            // medication grants read access to that medication AND its dose
            // events. Calling standard requestAuthorization on the dose type
            // is unnecessary and was the exact SIGABRT frame in both IPS.
            if requestAuthorization {
                guard medType.requiresPerObjectAuthorization() else {
                    checkpoint("unexpected-medication-authorization-kind")
                    status = "系统药物对象授权方式异常；已停止读取，避免调用错误权限接口。"
                    return
                }
                checkpoint("authorize-annotated-medications-per-object")
                // Mark attempted before calling into system HealthKit. A
                // declined or failed request will not re-prompt on each launch;
                // the explicit Settings button can retry if authorization changes.
                UserDefaults.standard.set(true, forKey: PKHealthAutomaticPolicy.authorizationAttemptedKey)
                try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                    do {
                        try PKHealthExceptionShield.requestMedicationReadAccess(
                            healthStore, for: medType, completion: { ok, error in
                                if let error { continuation.resume(throwing: error) }
                                else if ok { continuation.resume(returning: ()) }
                                else { continuation.resume(throwing: NSError(
                                    domain: "PKAtlas.HealthKit.Authorization", code: 102,
                                    userInfo: [NSLocalizedDescriptionKey: "未授予 Apple 健康用药读取权限"])) }
                            })
                    } catch {
                        continuation.resume(throwing: error)
                    }
                }
                checkpoint("medication-authorized-dose-events-included")
            } else {
                checkpoint("silent-query-previously-authorized-medications")
            }
            checkpoint("query-annotated-medications")
            let query = HKUserAnnotatedMedicationQueryDescriptor(limit: 250)
            let medications = try await query.result(for: healthStore)
            approvedMedications = medications.map { $0.nickname ?? $0.medication.displayText }
            // Previously logged doses of archived medications remain valid
            // historical records. Keep them available if user authorized them.
            let approved = medications
            let after = Calendar.current.date(byAdding: .day, value: -365, to: .now) ?? .distantPast
            let predicate = HKQuery.predicateForSamples(withStart: after, end: .now, options: [])
            checkpoint("query-medication-dose-events")
            let samples: [HKMedicationDoseEvent] = try await withCheckedThrowingContinuation { continuation in
                let query = HKSampleQuery(sampleType: HKObjectType.medicationDoseEventType(),
                                          predicate: predicate, limit: 1000,
                                          sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)]) { _, objects, error in
                    if let error { continuation.resume(throwing: error); return }
                    continuation.resume(returning: (objects ?? []).compactMap { $0 as? HKMedicationDoseEvent })
                }
                healthStore.execute(query)
            }
            checkpoint("match-medications")
            let catalog = NativeAppStore.shared.catalog
            let taken = samples.filter { $0.logStatus == .taken }
            skippedStatusCount = samples.count - taken.count
            orphanDoseCount = 0
            matches = taken.map { event -> PKHealthDoseMatch in
                let medication = approved.first(where: {
                    $0.medication.identifier.isEqual(event.medicationConceptIdentifier)
                })
                if medication == nil { orphanDoseCount += 1 }
                let name = medication.map { $0.nickname ?? $0.medication.displayText } ??
                    "未关联 Apple 健康药物 · 请人工核对"
                let id = medication.flatMap {
                    Self.matchCatalog($0.medication.displayText, catalog: catalog)
                } ?? Self.matchCatalog(name, catalog: catalog)
                let unit = event.unit
                let amount = event.doseQuantity
                let mg = amount.flatMap { value -> Double? in
                    // Only explicitly recognized mass units. A 'tablet',
                    // 'capsule', mL, or dose count is NOT automatically mg.
                    let multiplier: Double
                    switch unit.unitString.lowercased() {
                    case "mg": multiplier = 1
                    case "g": multiplier = 1_000
                    case "µg", "μg", "mcg", "ug": multiplier = 0.001
                    default: return nil
                    }
                    let converted = value * multiplier
                    return converted.isFinite && converted > 0 && converted < 100_000 ? converted : nil
                }
                let text = amount.map { $0.formatted() } ?? "未提供"
                return PKHealthDoseMatch(eventUUID: event.uuid, medicationName: name,
                                         drugID: id, mg: mg,
                                         quantityText: text + " " + unit.unitString,
                                         time: event.endDate)
            }
            lastReadAt = .now
            // Data is already .taken, catalog-matched and mass-unit checked.
            // Nearby duplicates are queued, not silently double-counted.
            if NativeAppStore.shared.accessState != .verifying {
                let summary = NativeAppStore.shared.reconcileAutomaticHealthEvents(matches)
                if summary.inserted > 0 || summary.pendingNearby > 0 {
                    await notifyHealthReconciliation(inserted: summary.inserted,
                                                    pending: summary.pendingNearby)
                }
            }
            checkpoint("complete")
            status = "读取近一年：\(approvedMedications.count) 项药物、\(matches.count) 条已服事件、\(orphanDoseCount) 条来源未关联、\(skippedStatusCount) 条非已服事件"
        } catch {
            checkpoint("error-" + String((error as NSError).code))
            status = "Apple 健康读取失败或权限未授权：" + error.localizedDescription
        }
    }

    private func notifyHealthReconciliation(inserted: Int, pending: Int) async {
        // Honor notification permissions already granted to this app. Never
        // request new permission merely for a HealthKit reconciliation.
        let center = UNUserNotificationCenter.current()
        let permissions = await center.notificationSettings()
        guard [.authorized, .provisional, .ephemeral].contains(permissions.authorizationStatus) else { return }
        let notice = UNMutableNotificationContent()
        notice.title = "药时 · Apple 健康同步"
        notice.body = "已自动同步 \(inserted) 条实际服用记录；\(pending) 条附近有现存记录，需核对。"
        // No medicine, dose, medication ID or timestamp in lock screen notice.
        let request = UNNotificationRequest(identifier: "pkatlas-health-import-" + UUID().uuidString,
            content: notice, trigger: nil)
        try? await center.add(request)
    }

    /// HealthKit doesn't offer a stable public URL for a specific medication
    /// logging form. This best-effort scheme opens Health, not a pre-filled dose.
    func openHealthApp() {
        guard let url = URL(string: "x-apple-health://") else { return }
        UIApplication.shared.open(url, options: [:]) { success in
            if !success {
                Task { @MainActor in
                    self.status = "无法自动打开健康 App。请在系统中打开「健康」→「浏览」→「用药」，手动登记实际服用。"
                }
            }
        }
    }
}
