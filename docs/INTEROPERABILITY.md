# 药时 PK Atlas × DG-Lab Control：互通协议与边界

## 已实现：双向、主动、仅导航

| 来源 | URL | 行为 |
| --- | --- | --- |
| 药时 iOS → DG-Lab iOS | dglabcontrol://open?source=pkatlas | 前台打开 DG-Lab，显示授权提示；不改变设备状态 |
| DG-Lab iOS → 药时 iOS | pkatlas://open?source=dglab | 前台打开药时；保持原有 Web 登录、同步和日记状态 |

URL scheme 在双方 Info.plist 和 project.yml 中注册。接收端只接受 open 路径；没有任何药物明细、Token、WebSocket 凭证或设备参数通过 URL 传递。未安装目标 App 时，系统可能无法打开该链接。

## 两个项目自身的交互链路

- PK Atlas 原生 iOS ⇄ Web：同源 HTTPS /api/，共享网站模型、账号、记录与版本化同步。
- DG-Lab iOS ⇄ macOS Telegram Bot：WebSocket + 独立随机授权 Token，默认仅本地地址、可信局域网中手动配置；手机可作为显示/控制端，或经现场授权成为 BLE 主机。

## 严格禁止的自动行为

- 不用药代反算或所谓血药浓度控制 DG-Lab 的强度、频率、波形、启停。
- 不允许未经用户点击的跨 App 启动、电刺激或账号数据读取。
- 不允许未授权的远程设备配对。DG-Lab 真机操作需硬件实体停止手段；软件强度范围不等于人体安全范围。

## 验证步骤

1. 自己用 Xcode 编译安装两个 iOS App，并确认 URL scheme 已注册。
2. 在药时选择“更多 → 打开 DG-LAB 控制台”，检查设备没有被自动连接、授权或输出。
3. 在 DG-Lab 设置里点击“打开药时”，确认服药记录没有变化。
4. 未安装另一 App 或设备离线时，不应创建任何药物记录或刺激会话。

此协议仅为当前已实现的手动应用间导航；不声称存在自动电刺激的跨应用 API。
