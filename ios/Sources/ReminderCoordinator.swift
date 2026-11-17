import Foundation
import Combine
import WebKit
import UserNotifications
import CryptoKit

/// Optional device-local fallback reminders. They do not replace APNs:
/// changes made on other devices while this app is suspended are not pushed
/// to this app without a dedicated APNs subscription and backend.
final class ReminderCoordinator: NSObject, ObservableObject, UNUserNotificationCenterDelegate {
    @Published var statusMessage = ""
    @Published var showAlert = false

    private let center = UNUserNotificationCenter.current()
    private let prefix = "pkatlas.local.model."
    private var running = false

    override init() {
        super.init()
        center.delegate = self
    }

    func enableAndRefresh(webView: WKWebView) async {
        do {
            let allowed = try await center.requestAuthorization(options: [.alert, .badge, .sound])
            guard allowed else {
                report("尚未获得系统通知权限。可在 iOS 设置中开启。")
                return
            }
            try await refresh(webView: webView, reportResult: true)
        } catch {
            report("本机提醒未更新：" + error.localizedDescription)
        }
    }

    func refreshIfAuthorized(webView: WKWebView) async {
        guard await hasAuthorization() else { return }
        // Best effort only: never silently discard previously scheduled
        // notifications if the network is down or the session has expired.
        try? await refresh(webView: webView, reportResult: false)
    }

    private func report(_ message: String) {
        statusMessage = message
        showAlert = true
    }

    func clearManagedReminders() async {
        let existing: [UNNotificationRequest] = await withCheckedContinuation { continuation in
            center.getPendingNotificationRequests { requests in
                continuation.resume(returning: requests)
            }
        }
        let own = existing.map(\.identifier).filter { $0.hasPrefix(prefix) }
        if !own.isEmpty {
            center.removePendingNotificationRequests(withIdentifiers: own)
        }
    }

    private func hasAuthorization() async -> Bool {
        let status: UNAuthorizationStatus = await withCheckedContinuation { continuation in
            center.getNotificationSettings { settings in
                continuation.resume(returning: settings.authorizationStatus)
            }
        }
        return status == .authorized || status == .provisional
    }

    private func refresh(webView: WKWebView, reportResult: Bool) async throws {
        guard !running else { return }
        running = true
        defer { running = false }

        guard let cookie = await authorizedCookie(from: webView) else {
            if reportResult { report("请先在药时中登录，然后再同步本机提醒。") }
            return
        }
        let url = URL(string: "https://pk.example.com/api/push/pending")!
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData)
        request.setValue(cookie, forHTTPHeaderField: "Cookie")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.timeoutInterval = 18

        let config = URLSessionConfiguration.ephemeral
        config.httpShouldSetCookies = false
        config.urlCache = nil
        let (body, response) = try await URLSession(configuration: config).data(for: request)
        guard let http = response as? HTTPURLResponse,
              http.url?.scheme == "https",
              http.url?.host == "pk.example.com" else {
            throw URLError(.badServerResponse)
        }
        guard http.statusCode == 200 else {
            if reportResult {
                report(http.statusCode == 401
                    ? "登录已过期，请重新登录后再同步提醒。"
                    : "提醒接口返回 HTTP \(http.statusCode)。")
            }
            return
        }

        let envelope = try JSONSerialization.jsonObject(with: body)
        guard let dictionary = envelope as? [String: Any],
              let events = dictionary["events"] as? [[String: Any]] else {
            throw URLError(.cannotParseResponse)
        }

        let now = Date().timeIntervalSince1970 * 1000
        let maxTime = now + 7 * 86_400_000
        let unique = Dictionary(grouping: events.compactMap { event -> LocalEvent? in
            guard let time = event["time"] as? Double,
                  time > now + 10_000, time < maxTime,
                  let sourceID = event["id"] as? String,
                  !sourceID.isEmpty, sourceID.count <= 128 else { return nil }

            let digest = SHA256.hash(data: Data(sourceID.utf8))
            let hashed = digest.map { String(format: "%02x", $0) }.joined()
            return LocalEvent(id: prefix + hashed, timestamp: time)
        }, by: \.id).compactMapValues { $0.first }
        let items = unique.values.sorted { $0.timestamp < $1.timestamp }.prefix(48)
        let newIDs = Set(items.map(\.id))

        let existing: [UNNotificationRequest] = await withCheckedContinuation { continuation in
            center.getPendingNotificationRequests { requests in
                continuation.resume(returning: requests)
            }
        }
        let oldIDs = existing.map(\.identifier).filter { $0.hasPrefix(prefix) }
        let obsolete = oldIDs.filter { !newIDs.contains($0) }
        if !obsolete.isEmpty {
            center.removePendingNotificationRequests(withIdentifiers: obsolete)
        }
        let stillScheduled = Set(oldIDs).subtracting(obsolete)
        for item in items where !stillScheduled.contains(item.id) {
            let content = UNMutableNotificationContent()
            content.title = "药时 · 模型提醒"
            // Avoid medication name, dose and sensitive information on the
            // lock screen. Details are visible only after opening the app.
            content.body = "打开药时核对模型时间与已采用的记录方案。"
            content.sound = .default
            let seconds = max(1, (item.timestamp - now) / 1000)
            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: seconds, repeats: false)
            let notification = UNNotificationRequest(identifier: item.id,
                                                     content: content,
                                                     trigger: trigger)
            try await center.add(notification)
        }
        if reportResult {
            report("已核对本机模型提醒：\(items.count) 条，最多安排未来 7 天。其他设备修改记录后，需要再次打开 App 同步。")
        }
    }

    @MainActor
    private func authorizedCookie(from browser: WKWebView) async -> String? {
        let cookies: [HTTPCookie] = await withCheckedContinuation { continuation in
            browser.configuration.websiteDataStore.httpCookieStore.getAllCookies { list in
                continuation.resume(returning: list)
            }
        }
        guard let cookie = cookies.first(where: {
            $0.name == "pk_atlas_session" &&
            $0.domain.lowercased() == "pk.example.com" &&
            $0.path.hasPrefix("/api") &&
            $0.isSecure && !$0.isExpired
        }) else { return nil }
        return "\(cookie.name)=\(cookie.value)"
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler:
                                    @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound])
    }
}

private struct LocalEvent {
    let id: String
    let timestamp: Double
}

private extension HTTPCookie {
    var isExpired: Bool {
        if let expiresDate { return expiresDate <= Date() }
        return false
    }
}
