# 药时 · PK Atlas

**开源药代动力学时间轴、服药日记、PWA 与 SwiftUI iOS App**

[Web/PWA 源码](website/) · [iOS App](ios/) · [与 DG-Lab 互动说明](docs/INTEROPERABILITY.md) · [安全说明](SECURITY.md)

> **医学警告：** 本项目输出的是群体药代模型估算，不是个人实测血药浓度、药效、处方或安全剂量。药量（mg）、模拟体内药量（mg）与血药浓度（mg/L）不能混为一谈。请勿据此自行改变药物剂量。

## 功能一览

| 模块 | 功能 |
| --- | --- |
| 药代时间轴 | 半衰期、达峰时间、群体浓度趋势、时间游标、参考线和折叠式模型说明 |
| 记录与日历 | 服药/饮食时间轴，添加、编辑、二次确认删除，按日查看历史 |
| 假设反算 | 根据模型目标量模拟未来药物曲线，采用方案后自动更新未来节点提醒，绝非服药指令 |
| 饮食与饮料 | 仅在有证据支持时模拟餐后和饮食因素；查看说明来源 |
| 同步 | 账号、设备会话管理、自动保存、离线草稿、云端版本核对、冲突拒绝与回读确认 |
| PWA | 安装到手机主屏幕、离线应用壳、最近验证的本机记录、响应式 Duo 视口 |
| 通知 | Web Push 和原生本机提醒，诊断权限、设备订阅、未来计划和服务商请求接受情况 |
| 数据迁移 | 完整备份 JSON、旧版五分区 JSON、iOS Journal 17.1 原导入结构及归档 JSON、CSV |
| iOS | SwiftUI + Liquid Glass 原生导航、持久 WKWebView、可自签名安装，支持 iPhone / iPad / Duo |

SwiftUI 客户端并没有复制一套独立的药代算法；它安全承载 Web 模型与同步流程，避免前后端计算逻辑分叉。

## 项目结构

~~~text
pk-atlas/
├── website/
│   ├── frontend/           # 模型、反算、账户、日记、模板与 UI
│   ├── shared/             # 药物参数目录
│   ├── backend/            # Python API、SQLite、Push
│   ├── web/                # 构建结果、PWA 静态资源
│   ├── scripts/            # 构建和站点配置
│   ├── config/             # Nginx 和 Cloudflare 策略示例
│   ├── deploy/             # systemd 部署示例
│   └── tests/              # API、数值模型和同步回归测试
├── ios/                    # PKAtlas.xcodeproj、SwiftUI、UITests
├── docs/INTEROPERABILITY.md
├── SECURITY.md
└── LICENSE
~~~

## Web/PWA 构建与测试

建议 Python 3.12+，Node.js 20+ 用于 JSON 格式兼容性测试。

~~~bash
git clone https://github.com/shzxm/pk-atlas.git
cd pk-atlas/website
python3 scripts/build.py
PYTHONPATH=backend python3 -m unittest discover -s tests -q
python3 tests/integration_server.py
node tests/portability_node.cjs
~~~

### 在自己的服务器部署

1. 使用自己的域名，例如 pk.example.com。运行 python3 scripts/configure_site.py pk.example.com 后检查修改内容，再执行 python3 scripts/build.py。
2. 使用专用低权限账户运行 Python API，设置 PK_DB、PK_PUBLIC_HOST、PK_PORT（默认 8766）。
3. 使用 [Nginx HTTPS 示例](website/config/nginx-pk.example.com) 或同等的 TLS 反代，公开网站静态根目录，并将同源 /api/ 转发到仅绑定 loopback 的 Python API。
4. 数据库目录必须只允许服务账户访问。生成自己的 VAPID 密钥，并按需设置 PK_VAPID_PRIVATE、PK_VAPID_PUBLIC 和 PK_VAPID_SUBJECT。
5. Cloudflare 只允许缓存无用户信息的公共 HTML、JS、CSS；所有 /api/ 必须 Bypass；/sw.js 需要更新时不得被错误缓存。见 [缓存策略](website/config/cloudflare-cache-rules-yao.md)。
6. 初始化数据库为空，不包含作者用户记录。正式导入之前先测试完整备份与回滚。

由于历史站点包含与原站点相关的链接，不能未经配置直接在任意域名使用。文档中的配置是**示例而非适用于所有系统的生产默认值**。

## iOS App 编译与自己签名

目标 Xcode 27.2 / iOS SDK 27.2，最低 iOS 26：

~~~bash
cd ios
xcodegen generate --spec project.yml
./Scripts/validate-source.sh
./Scripts/build-simulator.sh
./Scripts/build-unsigned.sh  # 可选；得到未签名 IPA
~~~

使用 ios/PKAtlas.xcodeproj，在 Xcode Signing & Capabilities 选择你的 Team 和 Bundle ID。自行编译/签名后安装，不要求上架 App Store。自建站点需要在 Sources/AtlasWebSession.swift 中更换 HTTPS 站点及允许域名。

原生容器使用系统导航、安全区和 Liquid Glass，iPhone Duo 外屏模拟器曾通过测试；实际折叠切换、真机 BLE/通知和签名需要单独验证。原生本机通知读取现有 API 主动刷新，**没有实现原生 APNs 远程通知**。

## 同步、导入和导出

登录站点后打开 /data-center.html，先读取云端版本与未同步草稿，然后操作：

- 完整备份 JSON：records、courses、intakes、plans、settings 全部保留。
- 旧版兼容 JSON：保留原站点五分区数据格式。
- iOS Journal 17.1 原导入格式：exportSource、experiences、ingestions 结构，兼容既有 Python 导入脚本。
- 本站 Journal 标准化归档 JSON/CSV：保留所导入的元数据以供审计。
- 合并导入采用预览、ID 去重、冲突阻断、版本检查及云端回读，不会自动覆盖未同步的本机草稿。

原始第三方 iOS Journal 文件的所有附加字段或原始体验分组未被初次导入器保留，无法通过本项目重新制造。

## 与 DG-Lab 项目互通

独立开源项目：[DG-Lab Telegram Bot + iOS Control](https://github.com/shzxm/dglab-telegram-bot)。

两个 iOS App 安装后，在药时“更多”里主动点击“打开 DG-LAB 控制台”，使用 dglabcontrol://open?source=pkatlas 打开 DG-Lab；在 DG-Lab 设置页点击“打开药时”，使用 pkatlas://open?source=dglab 返回。**仅传递应用来源标记**，不传递服药数据、账号、强度或波形，也不会因此启动电刺激设备。

两者自己的核心链路分别是 PK Atlas iOS ⇄ Web 同源 HTTPS、DG-Lab iOS ⇄ MBP Bot 独立加密凭证的 WebSocket 桥接。跨 App 互通仅为用户确认的导航，绝无“药代浓度自动控制电刺激”。详情见 [互通协议](docs/INTEROPERABILITY.md)。

## 安全与许可证

生产账号、数据库、登录 Cookie、证书、Telegram Token、VAPID 私钥、IPA 签名材料、个人用药日记以及服务器私有配置均不在此仓库。请勿在 Issue 上传真实健康记录或密钥。详见 [SECURITY.md](SECURITY.md)。

本项目源代码按 [MIT](LICENSE) 开源。引用医学资料、第三方软件、商标及相关设备名称仍归原权利人所有。欢迎提交带测试用例的 Issue 和 Pull Request。


## 2026-11-17 同步与通知诊断更新

- **同步中心**：本机草稿区分待同步、可能冲突、已与云端一致、无修改、无法解析。
  仅待处理草稿阻止新导入，保留本机原稿并引导到首页继续自动同步。
- **通知诊断中心**：增加下一个模型节点、独立 App/浏览器运行方式，以及当前设备
  是否满足可检查的发送条件。服务商接受仍**不等于**设备已显示通知。
- **数据迁移**：保留网站完整 JSON、旧版五分区 JSON、
  iOS Journal 17.1 原始导入器结构、标准化归档 JSON、CSV 和分区版本检查。
- **Cloudflare Free**：白名单缓存规则已准备，但**尚未在用户 Zone 上启用**。
  Free 方案不能直接设置强制 Edge TTL 120 秒；规则采用遵守源站
  s-maxage=120 的模式，并对 /api/ 采用显式 Bypass。
  详见 website/config/cloudflare-cache-rules-yao.md 和 JSON 规则文件。
