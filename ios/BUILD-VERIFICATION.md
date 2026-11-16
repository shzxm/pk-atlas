# 药时 iOS 27.2 构建与验收报告

验收日期：2026-11-16。目标：iPhone Duo / iPhone 18 Pro。

## 开发环境
- Xcode 27.2，Build 27B52，iOS 27.2 真机和模拟器 SDK。
- Mac mini arm64。工程位于 ~/Projects/PKAtlas-iOS。
- 保留现有服务器、药代模型与数据库，不迁移敏感用户数据。

## 验证结果
- iphoneos Release：BUILD SUCCEEDED。
- iphonesimulator Debug：BUILD SUCCEEDED。
- XCUITest：iPhone 18 Pro 3/3，iPhone Duo 4/4，均成功。
- Duo UI 测试验证 WebKit HTTPS 登录画面实际显示，以及原生返回、菜单、标签栏与切换。
- Duo 外屏截图检查：右侧状态栏下的纵向系统按钮、登入表单、保持登录复选框显示正常。
- Swift 语法、Info.plist、隐私清单和工程配置检查通过。
- Xcode 仍提示“未使用 AppIntents.framework，无相关元数据”的非错误提示。

## 未覆盖与限制
- Duo 展开内屏、折叠切换和横向/分屏的完整逐姿态验收未完成。
- 未用真实账号验证敏感服药记录的新增、删除、云端同步。
- 尚未接入原生 APNs 远程推送；仅有用户主动授权后的本机通知。
- Mac mini 目前没有有效 iOS 代码签名身份。输出为未签名 IPA，不可直接安装。

## 输出
- dist/PKAtlas-iOS27.2-unsigned.ipa
- PKAtlas.xcodeproj、SwiftUI/WebKit 源码、资源、测试和构建脚本。

安装时必须用自己的开发/Ad Hoc/企业证书和有效设备授权签名。
模型值只用于估算，不代表个体血药实测，不应用于自行调整用药。
