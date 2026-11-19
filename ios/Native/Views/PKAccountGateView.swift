import SwiftUI
import AuthenticationServices

struct PKAccountGateView: View {
    @EnvironmentObject private var store: NativeAppStore
    @Environment(\.webAuthenticationSession) private var webSession
    @State private var authorizing = false
    @State private var progressError = ""

    private func signIn() async {
        guard !authorizing else { return }
        authorizing = true
        defer { authorizing = false }
        do {
            let request = try PKWebAuthRequest.create()
            let callback = try await webSession.authenticate(
                using: request.url,
                callback: .customScheme("pkatlas"),
                preferredBrowserSession: .shared,
                additionalHeaderFields: [:])
            let code = try request.checkCallback(callback)
            let credential = try await PKCloudAPI.shared.exchangeNative(
                code: code, verifier: request.verifier, state: request.state)
            try PKSessionVault.save(credential.sessionToken)
            await store.finishWebAuthorization(username: credential.username)
        } catch {
            if (error as? ASWebAuthenticationSessionError)?.code != .canceledLogin {
                progressError = error.localizedDescription
            }
        }
    }
    var body: some View {
        VStack(spacing: 22) {
            Image(systemName: "lock.shield.fill")
                .font(.system(size: 48)).foregroundStyle(.cyan)
            Text("药时 · 私人记录已锁定").font(.title2.bold())
            Text(store.accessState == .verifying
                 ? "正在后台验证上次登录会话。加密历史、计算模型和账户配置已在本机保留，验证成功才显示。"
                 : store.accessState == .verificationUnavailable
                 ? "网络或服务器暂不可用，无法核对登录状态。所有个人信息保持隐藏，密文仍保存在本机。"
                 : "登录已过期或尚未登录。重新授权后恢复本机保存的历史、模型及云端同步。")
                .font(.callout).foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            if store.accessState == .verifying || authorizing {
                ProgressView("正在验证…")
            } else {
                Button {
                    Task { await store.start(force: true) }
                } label: {
                    Label("重新验证当前会话", systemImage: "arrow.triangle.2.circlepath")
                }
                .buttonStyle(.glass)
                Button { Task { await signIn() } } label: {
                    Label("通过安全网页授权登录", systemImage: "safari")
                }
                .buttonStyle(.glassProminent)
            }
            if !progressError.isEmpty {
                Text(progressError).font(.caption).foregroundStyle(.orange)
            }
            Text("验证失败不会删除本机加密备份，也不会在锁屏前展示任何历史服药信息。")
                .font(.caption2).foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(28)
        .frame(maxWidth: 520)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(red: 0.035, green: 0.055, blue: 0.095))
        .accessibilityIdentifier("native.account.locked")
    }
}
