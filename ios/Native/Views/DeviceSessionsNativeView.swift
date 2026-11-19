import SwiftUI

/// Account-scoped device management. Revocation is always initiated by an
/// explicit user gesture, and the current session cannot be part of bulk exit.
struct DeviceSessionsNativeView: View {
    @State private var sessions: [AccountSession] = []
    @State private var loading = false
    @State private var mutating = false
    @State private var errorMessage = ""
    @State private var resultMessage = ""
    @State private var pendingSingle: AccountSession?
    @State private var confirmOthers = false

    struct AccountSession: Decodable, Identifiable {
        var id: String
        var name: String
        var current: Bool
        var remembered: Bool
        var expiresAt: Double
        var platform: String?
        var osVersion: String?
        var loginMethod: String?
        var identifiedInstallation: Bool?
        var lastActiveAt: Double?
    }
    struct SessionList: Decodable { let sessions: [AccountSession] }
    struct SingleRevoke: Decodable { let ok: Bool; let revoked: Bool }
    struct BulkRevoke: Decodable { let ok: Bool; let revoked: Int }

    private var others: [AccountSession] { sessions.filter { !$0.current } }

    var body: some View {
        List {
            Section {
                Text("会话分别管理，当前设备不会被‘退出其他设备’操作影响。已被登出的设备仍保留其本地草稿，重新登录后才能同步。")
                    .font(.footnote).foregroundStyle(.secondary)
                if loading { ProgressView("正在检查已登录设备…") }
                if !errorMessage.isEmpty {
                    Label(errorMessage, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.orange).font(.footnote)
                }
                if !resultMessage.isEmpty {
                    Label(resultMessage, systemImage: "checkmark.circle")
                        .foregroundStyle(.mint).font(.footnote)
                }
                Button {
                    Task { await loadSessions() }
                } label: {
                    Label("刷新已登录设备", systemImage: "arrow.clockwise")
                }
                .disabled(loading || mutating)
                .accessibilityIdentifier("native.devices.refresh")
            } header: { Text("账号会话") }

            Section("当前设备") {
                ForEach(sessions.filter(\.current)) { device in
                    deviceRow(device, allowLogout: false)
                }
            }

            Section("其他已登录设备 · \(others.count)") {
                if others.isEmpty, !loading {
                    Text("没有其他有效的登录会话")
                        .foregroundStyle(.secondary)
                }
                ForEach(others) { device in
                    deviceRow(device, allowLogout: true)
                }
                if !others.isEmpty {
                    Button(role: .destructive) { confirmOthers = true } label: {
                        Label("一键登出其他所有设备", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                    .disabled(loading || mutating)
                    .accessibilityIdentifier("native.devices.revoke-others")
                }
            }
        }
        .navigationTitle("已登录设备")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadSessions() }
        .refreshable { await loadSessions() }
        .confirmationDialog("确认退出其他所有设备？", isPresented: $confirmOthers,
                            titleVisibility: .visible) {
            Button("退出其他 \(others.count) 个会话", role: .destructive) {
                Task { await revokeOthers() }
            }
            Button("取消", role: .cancel) {}
        } message: {
            Text("此设备保留登录。其他设备会话立即失效，但其尚未同步的本地草稿不会从设备上删除。")
        }
        .confirmationDialog("确认退出所选设备？", isPresented: Binding(
            get: { pendingSingle != nil },
            set: { if !$0 { pendingSingle = nil } }
        ), titleVisibility: .visible) {
            Button("确认退出此设备", role: .destructive) {
                if let id = pendingSingle?.id { Task { await revokeSingle(id) } }
                pendingSingle = nil
            }
            Button("取消", role: .cancel) { pendingSingle = nil }
        } message: {
            Text("远程设备需要重新授权登录，其本地未同步草稿不会被删除。")
        }
    }

    private func deviceRow(_ device: AccountSession, allowLogout: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(device.name).font(.subheadline.weight(.semibold))
                    Text(device.current ? "当前设备 · 保留登录" :
                         (device.remembered ? "个人设备 · 保持登录" : "临时会话"))
                        .font(.caption).foregroundStyle(.secondary)
                }
                Spacer(minLength: 5)
                if device.current {
                    Image(systemName: "checkmark.shield.fill").foregroundStyle(.mint)
                } else if allowLogout {
                    Button(role: .destructive) { pendingSingle = device } label: {
                        Image(systemName: "rectangle.portrait.and.arrow.right")
                    }
                    .disabled(mutating)
                    .accessibilityLabel("退出设备 \(device.name) 的登录")
                }
            }
            Text("\(device.platform ?? "未知系统") · \(device.osVersion ?? "版本未提供")")
                .font(.caption).foregroundStyle(.secondary)
            Text(device.loginMethod == "ios-native" ? "iOS App · 系统网页登录" :
                 device.loginMethod == "web" ? "网页版" : "历史会话")
                .font(.caption2).foregroundStyle(.secondary)
            Text("最近使用：\(dateText(device.lastActiveAt)) · 到期：\(dateText(device.expiresAt))")
                .font(.caption2).foregroundStyle(.secondary)
            if device.identifiedInstallation != true {
                Text("历史会话没有可靠设备标识，不能按设备名称自动合并。")
                    .font(.caption2).foregroundStyle(.orange)
            }
        }
        .padding(.vertical, 5)
    }

    private func dateText(_ timestamp: Double?) -> String {
        guard let timestamp, timestamp > 0, timestamp.isFinite else { return "未知" }
        return Date(timeIntervalSince1970: timestamp / 1_000)
            .formatted(date: .abbreviated, time: .shortened)
    }

    private func loadSessions() async {
        guard !loading else { return }
        loading = true; defer { loading = false }
        do {
            let response: SessionList = try await PKCloudAPI.shared.request("/api/sessions")
            sessions = response.sessions
            errorMessage = ""
        } catch {
            errorMessage = "无法读取登录设备：" + error.localizedDescription
        }
    }

    private func revokeSingle(_ id: String) async {
        guard let device = sessions.first(where: { $0.id == id }), !device.current, !mutating else { return }
        mutating = true; defer { mutating = false }
        do {
            struct Body: Encodable { let id: String }
            let payload = try JSONEncoder().encode(Body(id: id))
            let result: SingleRevoke = try await PKCloudAPI.shared.request(
                "/api/sessions/revoke", method: "POST", body: payload)
            resultMessage = result.revoked ? "已撤销所选设备的登录。" : "该会话已经失效。"
            await loadSessions()
        } catch { errorMessage = "撤销设备登录失败：" + error.localizedDescription }
    }

    private func revokeOthers() async {
        guard !mutating && !others.isEmpty else { return }
        mutating = true; defer { mutating = false }
        do {
            let data = Data("{}".utf8)
            let result: BulkRevoke = try await PKCloudAPI.shared.request(
                "/api/sessions/revoke-others", method: "POST", body: data)
            resultMessage = "已使其他 \(result.revoked) 个会话退出，当前设备保持登录。"
            await loadSessions()
        } catch { errorMessage = "退出其他设备失败：" + error.localizedDescription }
    }
}
