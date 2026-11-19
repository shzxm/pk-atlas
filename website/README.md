# Web/PWA 源码

> **Source snapshot (2026-11-19):** the current application includes mathematical residual-window calculations, A/B inverse plans, adopted-dose review and network-first public HTML to avoid stale client scripts. Source hosts are placeholders; regenerate signed mathematical bundles for your own HTTPS environment.


此目录包含药时 Web/PWA + Python API 的可构建源码，独立于生产服务器运行时数据。

## 本地验证

\`\`\`bash
python3 scripts/build.py
PYTHONPATH=backend python3 -m unittest discover -s tests -q
python3 tests/integration_server.py
node tests/portability_node.cjs
\`\`\`

## 运行 API

环境变量：\`PK_DB\`（SQLite 文件完整路径）、\`PK_PORT\`（默认 8766）、\`PK_PUBLIC_HOST\`（对外 HTTPS 域名）、
\`PK_VAPID_PRIVATE\` / \`PK_VAPID_PUBLIC\` / \`PK_VAPID_SUBJECT\`（可选 Web Push）。

\`\`\`bash
PK_DB=$PWD/dev-data/pk.sqlite3 PK_PUBLIC_HOST=pk.example.com python3 backend/server.py
\`\`\`

使用自己的 Nginx HTTPS 反代并在同一站点路径根目录提供 \`web/\`，将 \`/api/\` 转发给 API。请使用部署模板，并把源文件中的
\`pk.example.com\` 替换成自己的域名后重新构建（建议使用 \`scripts/configure_site.py\`）。

**请勿将** SQLite、VAPID 私钥、登录账号、用户记录和具体服务器证书加入 Git。

单室口服群体药代曲线及反算均属模拟，不是个人实测血药浓度或用药建议。
