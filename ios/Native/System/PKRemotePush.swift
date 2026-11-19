import Foundation
import UIKit
import UserNotifications
import Combine

/// APNs background updates are best-effort. We always re-check the cloud when
/// opening the app, because the OS may delay or drop silent notifications.
@MainActor
final class PKRemotePushManager: ObservableObject {
    static let shared = PKRemotePushManager()
    @Published private(set) var status = "尚未向系统注册远程通知"
    @Published private(set) var providerConfigured = false
    private var currentToken: String?

    func registerIfAuthorized() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        guard settings.authorizationStatus == .authorized ||
              settings.authorizationStatus == .provisional else {
            status = "请先开启系统通知权限"
            return
        }
        UIApplication.shared.registerForRemoteNotifications()
        status = "正在请求 Apple 推送设备令牌…"
        if let token = currentToken { await register(token: token) }
    }

    func receivedToken(_ data: Data) async {
        let token = data.map { String(format: "%02x", $0) }.joined()
        currentToken = token
        await register(token: token)
    }

    private func register(token: String) async {
        guard NativeAppStore.shared.isLoggedIn else {
            status = "系统令牌已获取，网站授权登录后完成登记"
            return
        }
        do {
            let response = try await PKCloudAPI.shared.registerAPNs(token: token)
            providerConfigured = response.providerConfigured
            status = response.providerConfigured
                ? "设备已登记，远程变更可触发后台同步（不保证即时送达）"
                : "设备已登记，服务器尚未配置 Apple APNs 凭证"
        } catch {
            status = "APNs 设备登记失败，前台恢复仍会自动同步"
        }
    }

    func registrationFailed(_ error: Error) {
        status = "系统远程推送注册不可用；请确认签名开启 Push Notifications"
    }

    func unregisterCurrentDevice() async {
        if let token = currentToken, NativeAppStore.shared.isLoggedIn {
            try? await PKCloudAPI.shared.unregisterAPNs(token: token)
        }
        status = "当前账号已注销远程推送登记"
    }

    func receivedSilentChange() async {
        await NativeAppStore.shared.refreshModel()
        await NativeAppStore.shared.refresh()
        await NativeReminderScheduler.shared.refresh()
    }
}

final class PKAtlasAppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        PKBackgroundSync.register()
        PKBackgroundSync.schedule()
        return true
    }

    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken token: Data) {
        Task { @MainActor in
            await PKRemotePushManager.shared.receivedToken(token)
        }
    }

    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        Task { @MainActor in
            PKRemotePushManager.shared.registrationFailed(error)
        }
    }

    func application(_ application: UIApplication,
                     didReceiveRemoteNotification userInfo: [AnyHashable: Any],
                     fetchCompletionHandler completionHandler:
                     @escaping (UIBackgroundFetchResult) -> Void) {
        guard userInfo["type"] as? String == "pkatlas_state_changed" else {
            completionHandler(.noData)
            return
        }
        Task { @MainActor in
            await PKRemotePushManager.shared.receivedSilentChange()
            completionHandler(.newData)
        }
    }
}
