# 药时 iOS App · PK Atlas

> **Current public native source:** v2.25 Build 31, November 19, 2026. The old WebView-only prototype has been superseded by the `Native/` SwiftUI implementation. Generate the Xcode project with `xcodegen generate`, then build with your own bundle identifier and private signing configuration. Do not use example addresses as working production endpoints.


这是在 Mac mini 上生成的真实 iOS 工程。开发目标为 **Xcode 27.2 (27B52) + iOS 27.2 SDK**，面向 iPhone Duo 内外屏、普通 iPhone 和 iPad。最低部署版本为 iOS 26.0。

## 架构与功能范围

这是 **SwiftUI 原生导航 + Liquid Glass + 持久 WKWebView 的混合 App**，不是对现有药代计算引擎的完整 Swift 重写。原生 UI 提供返回、今天、曲线、历史、我的、原生系统菜单、文件分享、本机提醒和状态指示。复杂药代曲线、剂量等效模型、反算、服用和饮食记录、账号会话、自动保存和云端同步继续运行在线站点：https://pk.example.com。

这避免了重新实现算法产生计算偏差，也意味着 Web 内容部分仍然是已有的暗色网页组件，不是每一个数据录入控件都换成 SwiftUI。项目没有修改数据库和服务器接口。

### iPhone Duo 与 Liquid Glass

- 使用 iOS 27.2 SDK 构建时，由系统适配 iPhone Duo 外屏、展开内屏和侧边垂直工具栏。
- 使用 NavigationStack 原生 toolbar，并依靠系统的非对称 safe area 和 reserved region，**不把返回键写死在 Wi-Fi 图标下方某个像素坐标**。
- 顶部同步状态使用 SwiftUI glassEffect，工具栏保持系统原生 Liquid Glass 材质。
- 折叠和展开仅重新布局同一个 WebView，不销毁或重新创建登录会话。
- 已在 iPhone Duo iOS 27.2（24B91016s）模拟器验证外屏：右侧原生返回/更多、纵向标签栏、网页登录与保持登录复选框布局正常。展开内屏和折叠姿态切换尚未单独验证。

### 隐私与安全

- 仅允许内置主 WebView 加载精确 HTTPS 域名 pk.example.com，外部链接交给系统。
- 只使用 WebKit 自己的持久 Cookie 存储，不将用户名、密码、API 密钥、服药数据写进工程或 Native UserDefaults。
- 桥接只传输同步状态、导航页和记录发生变化这一事件，不接收药物明细。
- 首次启动 App 需单独登录；Safari 与 WKWebView 不是同一个登录容器。
- 离线记录依赖已有网站的 Service Worker 和经验证的浏览器草稿。云端同步需要网络，离线授权不能实时判断远端撤销。
- 导出的记录通过 iOS 系统分享界面，由你自己决定是否保存；App 不自动上传到其他服务。

### 通知限制

原有网页 Web Push **不能直接当作原生 App 的 APNs 推送**。新工程提供用户主动开启的本机提醒：
- 原生 App 在有网络、登录有效时读取已有的 /api/push/pending 接口。
- 把未来最多 7 天、最多 48 条模型提醒转为 UNUserNotificationCenter 本机通知。
- 锁屏只显示通用提醒，不显示药名和剂量。
- 每次启动、前台返回或本站通知记录发生变化时尝试核对。
- **其他设备在本 App 被系统挂起后改变计划，不会立即刷新本机通知。** 真正的 APNs 远程推送需要额外的签名能力、APNs Key 和后端变更，目前尚未实现。
- 模型提醒不是药物安全建议，不能依此自行改变用药剂量。

## Mac mini 状态（2026-11-16）

- 已核查系统为 macOS 27.3 arm64。
- 已安装 Xcode 27.2 (27B52)，iOS 27.2 真机与模拟器 SDK 已验证；全局 xcode-select 仍指向 CommandLineTools，但打包脚本会自动使用 /Applications/Xcode.app/Contents/Developer。
- 已安装 Homebrew XcodeGen 2.46.0，生成 PKAtlas.xcodeproj。
- 已完成 Xcode 首次启动许可。Duo 运行时 24B91016s 已安装、Duo 模拟器启动成功。
- 使用 iphoneos27.2 SDK 成功编译 Release 并生成 unsigned IPA；也已完成 iphonesimulator27.2 Debug 构建。系统目前无可用签名证书，须由你自行签名。

## 你自行签名并安装

1. Xcode 27.2（27B52）、iOS SDK 27.2 和 Duo 运行时已经安装在 Mac mini。
2. 进入 ~/Projects/PKAtlas-iOS 并打开 PKAtlas.xcodeproj。
3. 如终端仍指向旧的 CommandLineTools，可仅在终端设置 DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer，不必全局修改系统路径。
4. 运行 Scripts/validate-source.sh 和 Scripts/build-unsigned.sh，可在 dist 目录重新生成未签名 IPA。
5. 在 Xcode 的 Signing & Capabilities 中设置你自己的 Team / Bundle ID / provisioning profile。可以使用个人开发证书、Ad Hoc 或合法企业分发方式，不要求上架 App Store。
6. Duo 外屏已经通过模拟器验收；还应在 Device Hub 展开内屏、折叠切换、旋转和分屏模式，以及真机上进一步验收。
7. 用 Xcode Product → Archive → Distribute App 生成你自己签名的安装包。
8. 如果你更喜欢第三方签名工具，可在 Xcode 27.2 安装成功后运行 Scripts/build-unsigned.sh，生成未签名 IPA。它仍需要你的有效签名与设备授权才能安装。

请不要把 Apple ID 密码、.p12 私钥、provisioning profile 或 APNs Key 上传到项目或聊天中。

## 文件

- project.yml / PKAtlas.xcodeproj：工程定义和可在 Xcode 打开的工程。
- Sources/PKAtlasApp.swift：SwiftUI App 入口。
- Sources/GlassRootView.swift：Liquid Glass 导航和 Duo 系统工具栏。
- Sources/AtlasWebSession.swift：WebKit 安全、会话、JS 弹窗、外链、下载。
- Sources/AtlasWebView.swift：单实例 WebView。
- Sources/ReminderCoordinator.swift：可选的本机通知。
- Resources/Assets.xcassets：应用图标和配色。
- Resources/PrivacyInfo.xcprivacy：隐私清单。
- Scripts/validate-source.sh：无 iOS SDK 时的静态检查。
- Scripts/build-unsigned.sh：要求 Xcode 27.2 的真实设备编译脚本。
- Scripts/build-simulator.sh：iOS 27.2 Simulator Debug 编译。
- UITests/PKAtlasUITests.swift：Duo 和普通 iPhone 的原生导航、登录加载测试。
- BUILD-VERIFICATION.md：实测构建与验收报告。

## 验证状态

- [x] 所有 Swift 文件的 swiftc -frontend -parse 语法解析。
- [x] XcodeGen 创建真实 .xcodeproj，项目和 Info.plist 结构检查。
- [x] 原生返回、网页导航、模态确认及下载的源码功能。
- [x] iPhone Duo 系统布局模式与 Liquid Glass 源码实现。
- [x] 本机通知和严格一方 HTTPS 域名处理。
- [x] Xcode 27.2 的 iphoneos Release 和 iphonesimulator Debug 构建通过，未签名 IPA 生成成功。
- [x] iPhone 18 Pro 3/3 原生 UI 自动化测试通过。
- [x] iPhone Duo 4/4 UI 测试通过（含真实 HTTPS 登录页面加载）。
- [x] iPhone Duo 外屏及右侧纵向工具栏实际截图验收。
- [ ] Duo 展开内屏、折叠状态变化和分屏姿态验收。
- [ ] 使用你自己的证书签名 IPA 并在真实设备上安装。
- [ ] APNs 原生远程推送。

**模型计算仅为估算参考，不是个体血药浓度实测、药效或医学用药指导。**
