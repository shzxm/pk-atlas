import Foundation
import Combine
import CryptoKit
import UserNotifications

/// First-party iOS local notifications. The OS delivers them even when the
/// app isn't running. For remote changes while suspended, real APNs is needed.
@MainActor
final class NativeReminderScheduler: NSObject, ObservableObject, UNUserNotificationCenterDelegate {
    static let shared = NativeReminderScheduler()
    @Published var isAuthorized = false
    @Published var message = "尚未授权本机通知"

    private let center = UNUserNotificationCenter.current()
    private let identifierPrefix = "pkatlas.native.model."

    private override init() {
        super.init()
        center.delegate = self
    }

    func requestPermission() async {
        do {
            let granted = try await center.requestAuthorization(options: [.alert, .badge, .sound])
            isAuthorized = granted
            message = granted ? "通知权限已开启" : "系统通知权限未开启"
            if granted {
                await refresh()
                await PKRemotePushManager.shared.registerIfAuthorized()
            }
        } catch {
            message = "系统通知授权失败：" + error.localizedDescription
        }
    }

    func refresh() async {
        let settings = await center.notificationSettings()
        isAuthorized = settings.authorizationStatus == .authorized ||
                       settings.authorizationStatus == .provisional
        guard isAuthorized, NativeAppStore.shared.username != nil else { return }

        do {
            let events = try await PKCloudAPI.shared.reminderEvents()
            let now = Date().timeIntervalSince1970 * 1000
            let horizon = now + 7 * 86_400_000
            let proposals = events.filter {
                $0.time > now + 10_000 && $0.time < horizon && $0.time.isFinite
            }.sorted { $0.time < $1.time }

            var newEvents: [(id: String, time: Double)] = []
            var dedup = Set<String>()
            for event in proposals {
                let id = identifierPrefix + SHA256.hash(data: Data(event.id.utf8))
                    .map { String(format: "%02x", $0) }.joined()
                if dedup.insert(id).inserted {
                    newEvents.append((id, event.time))
                }
                if newEvents.count >= 48 { break }
            }

            let scheduled = await center.pendingNotificationRequests()
            let owned = scheduled.filter { $0.identifier.hasPrefix(identifierPrefix) }
            let existing = Dictionary(uniqueKeysWithValues:
                owned.map { ($0.identifier, $0) })
            let wanted = Set(newEvents.map(\.id))
            var toRemove = owned.map(\.identifier).filter { !wanted.contains($0) }
            var toCreate: [(id: String, time: Double)] = []
            for event in newEvents {
                if let previous = existing[event.id],
                   let scheduledAt = (previous.trigger as? UNTimeIntervalNotificationTrigger)?
                       .nextTriggerDate(),
                   abs(scheduledAt.timeIntervalSince1970 - event.time / 1000) < 65 {
                    continue
                }
                if existing[event.id] != nil { toRemove.append(event.id) }
                toCreate.append(event)
            }
            if !toRemove.isEmpty {
                center.removePendingNotificationRequests(withIdentifiers: toRemove)
            }
            for item in toCreate {
                let content = UNMutableNotificationContent()
                content.title = "药时 · 模型提醒"
                content.body = "有一项模型时间事件，打开药时查看详情。"
                content.sound = .default
                // Do not reveal drug name/dose on the lock screen.
                let delay = max(1, (item.time - now) / 1000)
                let request = UNNotificationRequest(
                    identifier: item.id,
                    content: content,
                    trigger: UNTimeIntervalNotificationTrigger(timeInterval: delay, repeats: false)
                )
                try await center.add(request)
            }
            message = "已核对 \(newEvents.count) 条本机提醒，修正 \(toCreate.count) 项（未来 7 天）"
        } catch {
            message = "云端提醒暂不可用；已保留既有本机提醒"
        }
    }

    /// On a new adopted revision, discard *all* outstanding model events
    /// before asking the server for its current canonical pending events.
    /// Previously delivered alerts cannot be recalled from iOS, but the OS
    /// queue must never retain old hypothetical nodes if a request fails.
    func reconcileAfterAdoptedPlanChange() async {
        let pending = await center.pendingNotificationRequests()
        let oldIDs = pending.map(\.identifier).filter { $0.hasPrefix(identifierPrefix) }
        if !oldIDs.isEmpty {
            center.removePendingNotificationRequests(withIdentifiers: oldIDs)
        }
        await refresh()
    }

    /// Visible foreground notification when a verified cloud pull detects
    /// another device's adopted-model change. APNs is responsible for closed
    /// apps; never pretend a locally scheduled notification can wake an App
    /// which has never launched or has no system authorization.
    func announceRemoteAdoptedChange() async {
        let settings = await center.notificationSettings()
        guard settings.authorizationStatus == .authorized ||
              settings.authorizationStatus == .provisional,
              NativeAppStore.shared.isLoggedIn else { return }
        // When working APNs is configured the server delivers the alert; don't
        // generate a second local banner on the same sync event.
        if PKRemotePushManager.shared.providerConfigured { return }
        let content = UNMutableNotificationContent()
        content.title = "药时 · 已采用数学方案已同步"
        content.body = "其他设备更新了已采用的数学方案与待核对计划，请打开查看。不是服药建议。"
        content.sound = .default
        let request = UNNotificationRequest(identifier:
            "pkatlas.native.cloud-adopted." + UUID().uuidString,
            content: content, trigger: nil)
        try? await center.add(request)
    }

    func clear() async {
        let ids = await center.pendingNotificationRequests().map(\.identifier)
            .filter { $0.hasPrefix(identifierPrefix) }
        if !ids.isEmpty { center.removePendingNotificationRequests(withIdentifiers: ids) }
        message = "已移除当前账号本机模型提醒"
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter,
                                   willPresent notification: UNNotification,
                                   withCompletionHandler completionHandler:
                                     @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound])
    }
}
