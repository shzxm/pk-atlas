import SwiftUI
import AuthenticationServices
import UIKit

struct SettingsNativeView: View {
    @EnvironmentObject private var store: NativeAppStore
    @EnvironmentObject private var reminders: NativeReminderScheduler
    @Environment(\.webAuthenticationSession) private var webAuthenticationSession
    @State private var authorizingInBrowser = false
    @State private var exportURL: URL?
    @State private var showConflictConfirmation = false
    @State private var showingLogout = false
    @StateObject private var remotePush = PKRemotePushManager.shared
    @StateObject private var healthMedications = PKHealthMedications.shared
    @State private var showHealthImportConfirmation = false
    @State private var healthImportResult = ""
    @State private var diagnosticsCopied = false


    var body: some View {
        Form {
            Section {
                HStack {
                    Image(systemName: store.isLoggedIn ? "checkmark.icloud.fill" : "iphone.gen3")
                        .font(.title2)
                        .foregroundStyle(store.isLoggedIn ? .mint : .cyan)
                    VStack(alignment: .leading, spacing: 5) {
                        Text(store.isLoggedIn ? (store.username ?? "已登录") : "本机离线模式")
                            .font(.headline)
                        Text(store.syncStatus)
                            .font(.caption).foregroundStyle(.secondary)
                            .accessibilityIdentifier("native.sync.status")
                    }
                    Spacer()
                    if store.busy { ProgressView() }
                }
                if store.hasPendingChanges {
                    Label("存在尚未完成云端确认的记录，本机密文已保存",
                          systemImage: "externaldrive.badge.exclamationmark")
                        .font(.caption)
                        .foregroundStyle(.orange)
                }
            } header: { Text("数据与账号") }

            if !store.isLoggedIn {
                Section("通过官方网站登录") {
                    Button {
                        Task { await authorizeViaWebsite() }
                    } label: {
                        HStack {
                            Label("打开药时网页登录并授权", systemImage: "safari")
                            Spacer()
                            if authorizingInBrowser { ProgressView() }
                        }
                    }
                    .disabled(authorizingInBrowser || store.busy)
                    .accessibilityIdentifier("native.auth.browser")
                    Text("将打开 pk.example.com 的安全网页完成登录。原生 App 不接触账号密码；网站只会返回绑定此次设备请求的一次性授权码，并在 HTTPS 下换取登录会话。")
                        .font(.footnote).foregroundStyle(.secondary)
                    Text("首次授权后下载当前云端记录，并尝试安全恢复本机草稿。匿名草稿不会擅自上传。")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            } else {
                Section("云端同步") {
                    Button {
                        Task {
                            if store.accessState == .verified { await store.refresh() }
                            else { await store.start(force: true) }
                        }
                    } label: {
                        Label("立即核对云端", systemImage: "arrow.triangle.2.circlepath")
                    }
                    if store.hasPendingChanges {
                        Label("本机更改正在自动同步，网络断开时将保留草稿并在下次启动重试",
                              systemImage: "icloud.and.arrow.up")
                            .font(.footnote)
                    }
                    if store.conflict {
                        Label("云端与本机修改冲突，未自动覆盖任何记录",
                              systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.orange)
                        Button("放弃本机冲突并采用云端版本", role: .destructive) {
                            showConflictConfirmation = true
                        }
                    }
                    NavigationLink {
                        DeviceSessionsNativeView()
                    } label: {
                        Label("管理已登录设备", systemImage: "person.2.badge.gearshape")
                    }
                    .accessibilityIdentifier("native.settings.devices")
                    Button("退出登录", role: .destructive) { showingLogout = true }
                }
            }

            Section("主曲线页面 · 可选") {
                Button {
                    store.mainChartEnabled.toggle()
                } label: {
                    HStack(spacing: 12) {
                        Label("显示独立曲线页面", systemImage: "waveform.path.ecg")
                        Spacer()
                        Text(store.mainChartEnabled ? "已开启" : "已隐藏")
                            .foregroundStyle(.secondary)
                        Image(systemName: store.mainChartEnabled ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(store.mainChartEnabled ? .mint : .secondary)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityValue(store.mainChartEnabled ? "已开启" : "已隐藏")
                .accessibilityIdentifier("native.settings.main-chart.toggle")
                Text("默认隐藏整个独立曲线标签页；关闭时不创建该页面，也不会启动它的 Swift 曲线采样与云端窗口读取。反算页面仍有自己需要的曲线，不受此开关影响。")
                    .font(.footnote).foregroundStyle(.secondary)
            }

            Section("通知与 Siri") {
                Button {
                    Task { await reminders.requestPermission() }
                } label: {
                    Label("开启系统通知", systemImage: "bell.badge")
                }
                Button {
                    Task { await reminders.refresh() }
                } label: {
                    Label("同步未来 7 天本机提醒", systemImage: "clock.badge.checkmark")
                }
                Text(reminders.message)
                    .font(.footnote).foregroundStyle(.secondary)
                Label("Siri 和快捷指令支持：查询本机模型、记录已服药物、打开药时。",
                      systemImage: "waveform")
                    .font(.footnote)
                    .accessibilityIdentifier("native.siri.capabilities")
                Text(remotePush.status)
                    .font(.footnote).foregroundStyle(.secondary)
                Text("开启通知后自动登记 APNs 设备令牌。后台远程更新需要服务器 Apple APNs 凭证及有效签名，iOS 不保证每次即时唤醒。")
                    .font(.footnote).foregroundStyle(.secondary)
            }

            Section("App 版本更新 · 匿名校验") {
                HStack {
                    Label("已安装版本", systemImage: "iphone")
                    Spacer()
                    Text(store.installedReleaseDescription)
                        .foregroundStyle(.secondary).monospacedDigit()
                }
                if let latest = store.latestRelease {
                    HStack {
                        Label("服务器最新版", systemImage: "checkmark.shield")
                        Spacer()
                        Text(latest.displayVersion).foregroundStyle(.secondary).monospacedDigit()
                    }
                    if store.releaseAvailable {
                        Label("发现可安装的新版本", systemImage: "arrow.up.circle.fill")
                            .foregroundStyle(.orange)
                        Text(latest.releaseNotes).font(.footnote)
                        Text("未签名 IPA：" + latest.fileName)
                            .font(.caption.monospaced()).textSelection(.enabled)
                        if let url = latest.privateReleaseURL {
                            Link(destination: url) {
                                Label("打开 GitHub 私有 Release（需要仓库访问权限）",
                                      systemImage: "arrow.up.right.square")
                            }
                            .accessibilityIdentifier("native.release.github")
                            Text("GitHub 网页可能提供 ZIP 压缩包。解压后取得原始 IPA，自行签名安装并按发布页 SHA-256 验证；不会自动安装。")
                                .font(.caption2).foregroundStyle(.secondary)
                        }
                        Button {
                            UIPasteboard.general.string = latest.fileName
                        } label: {
                            Label("复制未签名 IPA 文件名", systemImage: "doc.on.doc")
                        }
                    }
                }
                Text(store.releaseStatus)
                    .font(.footnote).foregroundStyle(.secondary)
                    .accessibilityIdentifier("native.release.status")
                if let checked = store.releaseLastChecked {
                    Text("最近检查：" + checked.formatted(date: .abbreviated, time: .shortened))
                        .font(.caption2).foregroundStyle(.secondary)
                }
                Button {
                    Task { await store.checkNativeRelease(force: true) }
                } label: {
                    HStack {
                        Label("立即匿名检查最新版本", systemImage: "arrow.clockwise")
                        if store.releaseChecking { Spacer(); ProgressView() }
                    }
                }
                .disabled(store.releaseChecking)
                .accessibilityIdentifier("native.release.check")
                Toggle("启动及回到前台自动检查版本", isOn: $store.automaticReleaseChecks)
                Text("版本检测使用独立 HTTPS 会话，不发送登录 Cookie、账号、药物数据、设备编号或推送令牌。181 服务器为本接口关闭访问日志，不向第三方查询，也不自动下载安装 IPA。网络出口 IP 仍可能被 Cloudflare 看见；若要对 Cloudflare 隐藏真实 IP，请自行使用可信 VPN/代理。关闭自动检查后，仅按按钮时联网。")
                    .font(.caption).foregroundStyle(.secondary)
            }

            Section("药代模型 · 自动热更新") {
                HStack {
                    Label("模型参数版本", systemImage: "arrow.triangle.2.circlepath.icloud")
                    Spacer()
                    Text(store.modelVersion).monospaced().foregroundStyle(.secondary)
                }
                HStack {
                    Label("算法版本", systemImage: "function")
                    Spacer()
                    Text(store.engineVersion).monospaced().foregroundStyle(.secondary)
                }
                if store.modelUpdateRequiresApp {
                    Label("网站新版优化方法需要更新 IPA 才能使用；本机旧算法未被覆盖。",
                          systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.orange)
                }
                Text(store.modelStatus)
                    .font(.footnote).foregroundStyle(.secondary)
                    .accessibilityIdentifier("native.model.update.status")
                if let checked = store.modelUpdatedAt {
                    Text("最近校验：" + checked.formatted(date: .abbreviated, time: .shortened))
                        .font(.caption).foregroundStyle(.secondary)
                }
                Button {
                    Task { await store.refreshModel(force: true) }
                } label: {
                    Label("立即核对网站模型", systemImage: "arrow.clockwise")
                }
                .disabled(store.modelChecking)
                Text("打开 App 或回到前台自动检查。药物数据、药代计算公式及兼容的反算算法通过 Ed25519 数字签名验证后自动热更新并离线保存；校验失败保留旧版。若新优化需要 App 尚未支持的桥接能力，则提醒安装新版 IPA。")
                    .font(.footnote).foregroundStyle(.secondary)
            }

            Section("Apple 健康 · 用药记录") {
                NavigationLink {
                    AppleHealthNativeView()
                } label: {
                    HStack {
                        Label("Apple 健康 · 读取、匹配、调整与选择", systemImage: "heart.text.square")
                        Spacer()
                        Text("\(healthMedications.matches.count) 条")
                            .foregroundStyle(.secondary).font(.caption)
                    }
                }
                .accessibilityIdentifier("native.health.open-review")
                Text("独立管理读取事件、手动匹配药物、调整剂量和时间、逐条勾选导入。人工映射随账户云端同步；不会直接写回 Apple 健康。")
                    .font(.caption2).foregroundStyle(.secondary)
            }

            Section("数据体检 · 本机自检") {
                let report = PKDataHealth.inspect(store.snapshot, catalog: store.catalog)
                let unreviewed = report.issues.reduce(0) { total, issue in
                    total + PKDataReview.rows(for: issue.id, snapshot: store.snapshot,
                        catalog: store.catalog).filter { !store.isAuditConfirmed($0.fingerprint) }.count
                }
                HStack {
                    Label(unreviewed > 0 ? "发现需人工核对的数据" :
                          (report.hasProblems ? "异常已人工核对" : "数据结构检查通过"),
                          systemImage: unreviewed > 0 ? "exclamationmark.triangle" : "checkmark.shield")
                        .foregroundStyle(unreviewed > 0 ? .orange : .mint)
                        .font(.headline)
                    Spacer()
                    Text(unreviewed > 0 ? "\(unreviewed) 条待核对" : (report.hasProblems ? "已确认" : "正常"))
                        .font(.caption.bold())
                }
                .accessibilityIdentifier("native.diagnostics.summary")
                Text("已检查 \(report.recordCount) 条服药原始记录和 \(report.mealCount) 条饮食原始记录。检测只在本机进行，不上传药物名称、剂量或诊断内容。")
                    .font(.footnote).foregroundStyle(.secondary)
                if let saved = store.lastLocalSavedAt {
                    Label("本机加密快照已保存：" + saved.formatted(date: .abbreviated, time: .shortened),
                          systemImage: "externaldrive.badge.checkmark")
                        .font(.caption).foregroundStyle(.secondary)
                } else {
                    Label("当前尚无已保存的本机快照", systemImage: "externaldrive")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Label(store.hasPendingChanges ? "存在尚未回读确认的云端修改" : "目前无待同步更改",
                      systemImage: store.hasPendingChanges ? "icloud.and.arrow.up" : "checkmark.icloud")
                    .font(.caption)
                    .foregroundStyle(store.hasPendingChanges ? .orange : .secondary)
                NavigationLink {
                    PKDataReviewNativeView()
                } label: {
                    Label("打开逐条核对清单", systemImage: "checklist")
                }
                .accessibilityIdentifier("native.diagnostics.open-review")
                if report.issues.isEmpty {
                    Text("未发现重复原始 ID、可疑相近记录、未来已服记录、未知药物代号或无效格式。")
                        .font(.caption2).foregroundStyle(.secondary)
                }
                ForEach(report.issues) { issue in
                    NavigationLink {
                        PKDataReviewNativeView(selectedIssue: issue.id)
                    } label: {
                    VStack(alignment: .leading, spacing: 3) {
                        HStack {
                            Text(issue.title).font(.subheadline.bold())
                            Spacer()
                            Text("\(PKDataReview.rows(for: issue.id, snapshot: store.snapshot, catalog: store.catalog).filter { !store.isAuditConfirmed($0.fingerprint) }.count) 待核对")
                                    .monospacedDigit().foregroundStyle(.orange)
                        }
                        Text(issue.detail).font(.caption2).foregroundStyle(.secondary)
                    }
                    } // audit detail link
                }
                Button {
                    UIPasteboard.general.string = PKDataHealth.supportSummary(
                        report: report, appVersion: store.installedReleaseDescription,
                        localSaved: store.lastLocalSavedAt != nil,
                        pendingSync: store.hasPendingChanges,
                        sessionVerified: store.accessState == .verified,
                        modelAvailable: store.selectedDrug != nil)
                    diagnosticsCopied = true
                } label: {
                    Label(diagnosticsCopied ? "已复制脱敏诊断摘要" : "复制脱敏诊断摘要",
                          systemImage: diagnosticsCopied ? "checkmark.circle" : "doc.on.clipboard")
                }
                .accessibilityIdentifier("native.diagnostics.copy")
                if diagnosticsCopied {
                    Label("诊断摘要已复制。只含条数、状态和版本信息，不含药物名称或剂量。",
                          systemImage: "checkmark.circle")
                        .font(.caption2).foregroundStyle(.mint)
                }
                Text("这里不自动合并或删除任何记录。可疑重复也可能是真实的分次服用，先在历史中核实。若要寻求技术支持，可主动粘贴脱敏摘要；如涉及 HealthKit 崩溃，还应另行导出 iOS 的 PKAtlas .ips 日志。")
                    .font(.caption2).foregroundStyle(.secondary)
            }

            Section("数据导出与完整性") {
                Button {
                    do { exportURL = try store.exportSnapshot() }
                    catch {
                        store.errorMessage = error.localizedDescription
                        store.showingError = true
                    }
                } label: {
                    Label("导出原始兼容格式 JSON", systemImage: "square.and.arrow.up")
                }
                if let exportURL {
                    ShareLink(item: exportURL) {
                        Label("分享最近导出的 JSON", systemImage: "square.and.arrow.up.on.square")
                    }
                }
                Text("文件只在明确点击导出后生成临时副本。原始记录中的扩展字段与历史来源会保留。")
                    .font(.footnote).foregroundStyle(.secondary)
            }

            Section("本机模型") {
                Text("药物目录：\(store.catalog.drugs.count) 项")
                Text("本地计算支持饮食匹配、参考达峰、半衰期、叠加浓度、剂量等效量和情景对比。")
                    .font(.footnote).foregroundStyle(.secondary)
                Text("内置模型保留作为离线回退。药物参数与签名药代/反算引擎在打开 App 时从服务器自动检查更新；遇到不兼容计算接口会提示更新 IPA。")
                    .font(.footnote).foregroundStyle(.secondary)
                if store.selectedDrug?.id == "pregabalin" {
                    Text("普瑞巴林肾功能修正使用已同步账号设置中的肌酐清除率，未填写时采用参考参数。")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }

        }
        .nativeKeyboardDismissal()
        .navigationTitle("我的药时")
        .confirmationDialog("退出当前账号？", isPresented: $showingLogout) {
            Button("退出登录", role: .destructive) {
                Task { await store.logout() }
            }
        } message: {
            Text("云端未确认的本机草稿会继续加密保存，下一次登录可尝试恢复。")
        }
        .confirmationDialog("放弃本机冲突数据？", isPresented: $showConflictConfirmation) {
            Button("采用云端版本并放弃冲突的本机更改", role: .destructive) {
                Task { await store.resolveConflictByUsingCloud() }
            }
        } message: {
            Text("此操作可能放弃本机未同步记录。建议先导出 JSON 备份。")
        }
    }

    private func authorizeViaWebsite() async {
        guard !authorizingInBrowser else { return }
        authorizingInBrowser = true
        defer { authorizingInBrowser = false }
        do {
            let pending = try PKWebAuthRequest.create()
            let result = try await webAuthenticationSession.authenticate(
                using: pending.url,
                callback: .customScheme("pkatlas"),
                preferredBrowserSession: .shared,
                additionalHeaderFields: [:]
            )
            let code = try pending.checkCallback(result)
            let token = try await PKCloudAPI.shared.exchangeNative(
                code: code, verifier: pending.verifier, state: pending.state)
            try PKSessionVault.save(token.sessionToken)
            await store.finishWebAuthorization(username: token.username)
        } catch {
            // User cancellation is not a login error.
            if (error as? ASWebAuthenticationSessionError)?.code != .canceledLogin {
                store.errorMessage = error.localizedDescription
                store.showingError = true
            }
        }
    }

}
