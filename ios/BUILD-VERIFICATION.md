# 药时 iOS 原生版 2.1（Build 3）验收记录

开发环境：Mac mini，Xcode 27.2（27B52）、iOS 27.2 SDK。生产后端：181 的 pk-atlas-api。

## 已验证

- Native 2.0 既有 47/47 PK 数值对照保持兼容。
- Native 2.1 新增真实网站 JavascriptCore 反算函数调用，并用无药盒规格和合成完整单位测试确保输出有效。
- 完整 Xcode 模拟器 Debug 原生构建成功。
- Native XCTest 9/9 全部通过（包含本地模型、完整网页反算内核加载、参考线三方合并、过去时间顺延、Keychain AES-GCM、旧记录字段保留）；日志 /tmp/pkatlas-21-native-tests.log。
- iPhone Duo XCUITest 4/4 全部通过（原生曲线与历史、首页无 WebView、服药编辑、Siri/通知设置及网页登录入口）；日志 /tmp/pkatlas-21-duo-ui-tests.log。
- 生产网页同版本网站反算引擎在 Mac 上独立通过合成完整单位情景，返回一个合法候选节点。未使用真实个人用药数据做反算或采用测试。
- Python native_auth.py 的一次性 PKCE 授权、状态比较、重复消费拒绝测试 3/3 通过。
- 公网 https://pk.example.com/api/native/login 页面测试返回 HTTP 200，/api/health 返回 HTTP 200。正式账号交互和回调未自动登录测试。
- 181 服务器新接口已部署：/api/native/login、/api/native/authorize、/api/native/exchange 和 /api/native/apns/*。服务 active，/api/health 返回 ok。
- 正式服务启动前已完整备份主 DB 与 server.py 到 /var/backups/pkatlas-native-integration-20261117，主 DB quick_check=ok。
- 远程通知模块已安装 httpx/h2 依赖，但正式 APNs 配置缺失，不声称真正推送成功。

## 不可误报

- Apple Health 服药事件无法第三方写入：SDK HKMedicationDoseEvent 禁止外部初始化。已添加授权读取，但尚未在用户真机完成系统权限测试。
- 网页授权登录尚未在真实账号上完成端到端测试，需要首次安装后亲自确认登录。
- APNs 后台送达依赖真实 Apple Developer 配置，系统不保证静默更新每次立即执行。
- 尚未验收真实 Duo 展开内屏姿态切换及真机签名。
- 反算给出的数学候选不是用药或疗效建议。

## 生产环境与配置

server.py 与 native_auth.py/native_apns.py 已部署在 /opt/pk-atlas；独立 APNs DB 为 /var/lib/pk-atlas/native-apns.sqlite3（仅 www-data 可读）。

要真正启用 APNs，须单独在安全的 systemd EnvironmentFile 提供 PK_APNS_TEAM_ID、PK_APNS_KEY_ID、PK_APNS_TOPIC=com.example.PKAtlas、PK_APNS_KEY_FILE。私钥不可纳入公开源码或 ZIP。先正确签名并开通 Push Notifications / Background Modes / HealthKit，然后分别验收 sandbox 和 production APNs。
