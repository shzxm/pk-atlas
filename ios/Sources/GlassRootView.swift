import SwiftUI

enum AtlasSection: String, CaseIterable, Identifiable {
    case today, chart, history, my

    var id: String { rawValue }
    var title: String {
        switch self {
        case .today: return "今天"
        case .chart: return "曲线"
        case .history: return "历史"
        case .my: return "我的"
        }
    }
    var symbol: String {
        switch self {
        case .today: return "house.fill"
        case .chart: return "waveform.path.ecg"
        case .history: return "clock.arrow.circlepath"
        case .my: return "person.crop.circle"
        }
    }
}

struct GlassRootView: View {
    @EnvironmentObject private var session: AtlasWebSession
    @EnvironmentObject private var reminders: ReminderCoordinator
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.openURL) private var openURL
    @State private var showDetails = false

    var body: some View {
        NavigationStack {
            AtlasWebView(session: session)
                .background(Color(red: 0.035, green: 0.070, blue: 0.110))
                .navigationTitle("药时")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    // Standard system bars move vertically and respect the
                    // trailing reserved region on iPhone Duo iOS 27.1+.
                    ToolbarItem(placement: .topBarLeading) {
                        Button {
                            session.goBack()
                        } label: {
                            Label("返回", systemImage: "chevron.backward")
                        }
                        .accessibilityHint("返回上一页；没有网页历史时返回今天")
                        .accessibilityIdentifier("atlas.nav.back")
                    }
                    ToolbarItem(placement: .principal) {
                        HStack(spacing: 7) {
                            Text("药时")
                                .font(.headline.weight(.bold))
                            Image(systemName: session.syncSymbol)
                                .font(.caption)
                                .foregroundStyle(session.syncState == "synced" ? Color.mint : Color.cyan)
                        }
                        .padding(.horizontal, 11)
                        .padding(.vertical, 6)
                        .glassEffect(.regular, in: Capsule())
                        .accessibilityLabel("药时，云端状态：" + session.syncTitle)
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        Menu {
                            Button("刷新网页", systemImage: "arrow.clockwise") {
                                session.reload()
                            }
                            Button("同步本机提醒", systemImage: "bell.badge") {
                                Task { await reminders.enableAndRefresh(webView: session.webView) }
                            }
                            Button("通知设置", systemImage: "bell") {
                                session.openInternal("/notifications.html")
                            }
                            Button("快捷指令与 API", systemImage: "square.stack.3d.up") {
                                session.openInternal("/quick.html")
                            }
                            Button("安装说明", systemImage: "info.circle") {
                                session.openInternal("/install.html")
                            }
                            Button("打开 DG-LAB 控制台", systemImage: "app.connected.to.app.below.fill") {
                                // Explicit local app switch only. Never send medication
                                // values, authentication tokens or device commands.
                                if let url = URL(string: "dglabcontrol://open?source=pkatlas") {
                                    openURL(url)
                                }
                            }
                            Divider()
                            Button("关于 App", systemImage: "checkmark.shield") {
                                showDetails = true
                            }
                        } label: {
                            Label("更多", systemImage: "ellipsis.circle")
                        }
                        .accessibilityIdentifier("atlas.nav.more")
                    }
                    ToolbarItemGroup(placement: .bottomBar) {
                        ForEach(AtlasSection.allCases) { destination in
                            Button {
                                session.select(destination)
                            } label: {
                                Label(destination.title, systemImage: destination.symbol)
                                    .symbolVariant(session.selectedSection == destination ? .fill : .none)
                            }
                            .tint(session.selectedSection == destination ?
                                  Color(red: 0.47, green: 0.82, blue: 1.0) : .secondary)
                            .accessibilityAddTraits(
                                session.selectedSection == destination ? .isSelected : []
                            )
                            .accessibilityIdentifier("atlas.tab." + destination.rawValue)
                        }
                    }
                }
                .overlay {
                    if session.isLoading || !session.isPageReady {
                        VStack(spacing: 16) {
                            Image(systemName: "pills.circle.fill")
                                .font(.system(size: 55))
                                .symbolRenderingMode(.palette)
                                .foregroundStyle(.mint, .cyan)
                            Text("药时正在准备就绪")
                                .font(.title2.bold())
                            Text("正在安全恢复本机记录与云端会话")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .multilineTextAlignment(.center)
                            ProgressView()
                                .tint(.cyan)
                                .padding(.vertical, 8)
                            Button("重新连接") { session.reload() }
                                .font(.subheadline.weight(.medium))
                                .glassEffect(.regular, in: Capsule())
                            Text("已保存的数据不会因加载而改变")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .padding(24)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(Color(red: 0.035, green: 0.07, blue: 0.11))
                        .transition(.opacity)
                        .accessibilityElement(children: .contain)
                    }
                }
                .animation(.easeInOut(duration: 0.22), value: session.isPageReady)
        }
        .task {
            session.startIfNeeded()
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                session.onForeground()
                Task { await reminders.refreshIfAuthorized(webView: session.webView) }
            }
        }
        .onChange(of: session.recordRevision) { _, _ in
            Task { await reminders.refreshIfAuthorized(webView: session.webView) }
        }
        .onChange(of: session.logoutRevision) { _, _ in
            Task { await reminders.clearManagedReminders() }
        }
        .sheet(isPresented: $showDetails) {
            AboutPanel()
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .sheet(item: $session.downloadedFile) { file in
            ActivityPresenter(activityItems: [file.url])
                .presentationDetents([.medium, .large])
        }
        .alert("药时", isPresented: $session.showError) {
            Button("确定", role: .cancel) {}
            Button("重试") { session.reload() }
        } message: {
            Text(session.errorMessage)
        }
        .alert("本机提醒", isPresented: $reminders.showAlert) {
            Button("确定", role: .cancel) {}
        } message: {
            Text(reminders.statusMessage)
        }
    }
}

private struct AboutPanel: View {
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Image(systemName: "pills.circle.fill")
                        .font(.system(size: 50))
                        .foregroundStyle(.mint)
                        .frame(maxWidth: .infinity)
                    Text("药时 · PK ATLAS")
                        .font(.title2.bold())
                    Text("原生 SwiftUI 导航和 Liquid Glass，复用经过验证的药代模型与账户数据。支持 iPhone Duo 展开、折叠和多任务布局。")
                    Label("始终连接 pk.example.com；不会向第三方转发服药记录。", systemImage: "lock.shield")
                    Label("页面可以离线显示最近验证的记录，云端同步需要联网。", systemImage: "wifi.slash")
                    Label("系统提醒需主动授权，并在启动或记录修改时刷新。", systemImage: "bell")
                    Text("模型只用于估算与记录，不代表血药实测、药效或医疗建议。不要根据反算结果自行调整剂量。")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .padding(24)
                .frame(maxWidth: 640)
                .frame(maxWidth: .infinity)
            }
            .background(Color(red: 0.04, green: 0.07, blue: 0.12))
            .navigationTitle("关于药时")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}
