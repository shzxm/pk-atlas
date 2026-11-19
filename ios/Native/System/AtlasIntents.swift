import Foundation
import AppIntents

// Siri, Spotlight and Shortcuts operate on the same encrypted local records
// and native calculation engine, never by opening a hidden WKWebView.
struct CheckAtlasModelIntent: AppIntent {
    static var title: LocalizedStringResource = "查询药时模型"
    static var description = IntentDescription("离线读取本机最近保存的药代模型值。此数值是群体估算，并非真实血药浓度或用药指导。")
    static var authenticationPolicy: IntentAuthenticationPolicy = .requiresLocalDeviceAuthentication

    @Parameter(title: "药物名称", description: "如：普瑞巴林、阿莫西林")
    var medicine: String

    static var parameterSummary: some ParameterSummary {
        Summary("查询\(\.$medicine)的药时模型")
    }

    func perform() async throws -> some IntentResult & ReturnsValue<String> {
        let store = await NativeAppStore.shared
        guard let drug = await store.catalog.drugs.first(where: {
            $0.name == medicine || $0.id == medicine || $0.en?.localizedCaseInsensitiveCompare(medicine) == .orderedSame
        }) else {
            return .result(value: "药时尚未收录该药物，请在 App 中选择现有药物。")
        }
        guard drug.canCalculate else {
            return .result(value: "\(drug.name)只支持记录，尚无可信的本地浓度模型。")
        }
        let model = await store.model
        let amount = model.concentration(drug, at: .now)
        let equivalent = model.equivalent(drug, at: .now)
        guard amount.isFinite, equivalent.isFinite else {
            return .result(value: "本地签名算法计算异常，已停止显示结果。请打开药时检查模型更新状态。")
        }
        let message = String(format: "\(drug.name)当前模型浓度约 %.2f mg/L，剂量等效量约 %.1f mg。仅供模型参考，非个人实测或服药建议。", amount, equivalent)
        return .result(value: message)
    }
}

struct LogAtlasDoseIntent: AppIntent {
    static var title: LocalizedStringResource = "记录已服药物"
    static var description = IntentDescription("将已经服用的剂量保存到本机药时记录，并在联网时尝试同步。")
    static var authenticationPolicy: IntentAuthenticationPolicy = .requiresLocalDeviceAuthentication

    @Parameter(title: "药物名称")
    var medicine: String

    @Parameter(title: "已经服用的剂量（毫克）")
    var amountMg: Double

    static var parameterSummary: some ParameterSummary {
        Summary("在药时记录\(\.$medicine)，\(\.$amountMg)毫克")
    }

    func perform() async throws -> some IntentResult & ReturnsValue<String> {
        let store = await NativeAppStore.shared
        guard let drug = await store.catalog.drugs.first(where: {
            $0.name == medicine || $0.id == medicine
        }), amountMg.isFinite, amountMg > 0, amountMg < 100_000 else {
            return .result(value: "未保存：药物未收录或剂量无效。请在 App 内核对。")
        }
        await store.addDose(drug: drug.id, mg: amountMg, time: .now)
        await store.sync()
        return .result(value: String(format: "已记录%@ %.2f 毫克。请在药时确认云端同步状态。", drug.name, amountMg))
    }
}

struct OpenAtlasAppIntent: AppIntent {
    static var title: LocalizedStringResource = "打开药时"
    static var description = IntentDescription("打开药时查看原生记录、图表、反算和同步状态。")
    static var openAppWhenRun = true

    func perform() async throws -> some IntentResult {
        .result()
    }
}

struct AtlasAppShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: OpenAtlasAppIntent(),
            phrases: ["打开\(.applicationName)", "在\(.applicationName)查看记录"],
            shortTitle: "打开药时",
            systemImageName: "pills"
        )
        AppShortcut(
            intent: CheckAtlasModelIntent(),
            phrases: ["用\(.applicationName)查询模型", "在\(.applicationName)查询药物浓度"],
            shortTitle: "查询药时模型",
            systemImageName: "waveform.path.ecg"
        )
        AppShortcut(
            intent: LogAtlasDoseIntent(),
            phrases: ["用\(.applicationName)记录服药"],
            shortTitle: "记录已服药物",
            systemImageName: "plus.circle"
        )
    }
}
