# Cloudflare Cache Rules: pk.example.com

**状态：未启用。** 2026-11-17 已通过 API 验证现有 Cloudflare Token：
example.com Zone 可读取，方案为 Free Website，但查询 Rulesets
返回 HTTP 403 (10000 Authentication error)。
现有 DDNS Token 权限不足，不应擅自扩大。

## Free 套餐限制

通过 Cache Rules 手动强制指定 Edge TTL，Free 方案最短 2 小时，
不能选择 Override origin 120 seconds。

正确设置：
- Cache eligibility: Eligible for cache
- Edge TTL: Use cache-control header if present, bypass cache if not
- Browser TTL: Respect origin

站点公共 HTML 响应：
    Cache-Control: public, max-age=0, s-maxage=120

Cloudflare 应根据源站 s-maxage=120 处理边缘缓存，浏览器按
max-age=0 重新验证。以实际 CF-Cache-Status / Age 为准。

官方：
https://developers.cloudflare.com/cache/how-to/edge-browser-cache-ttl/
https://developers.cloudflare.com/cache/how-to/cache-rules/settings/
https://developers.cloudflare.com/cache/how-to/cache-rules/order/

## 公共 HTML 白名单

(http.host eq "pk.example.com" and http.request.method eq "GET" and http.request.uri.path in {"/" "/index.html" "/quick.html" "/notifications.html" "/data-center.html" "/install.html" "/api.html"})

Action：Eligible for cache，Edge TTL 读取源站控制头，缺失则跳过。
全部个人数据只经登录后的 /api/ 请求，不在公共 HTML 中。

## 私人 API 绕过缓存（置于最后）

(http.host eq "pk.example.com" and starts_with(http.request.uri.path, "/api/"))

Action：Bypass cache。多个 Cache Rules 冲突时最后匹配的规则生效。
/api/ 源站返回 no-store。/sw.js 始终 no-cache/no-store。

正式参数见 config/cloudflare-cache-rules-yao.json，
**此 JSON 只是准备好的规则，不代表已部署。**

## 验收

在独立外部网络运行：
    python3 scripts/check_cloudflare_cache.py

同一 Cloudflare 节点的公共 HTML：MISS -> HIT。
/api/me 必须为未认证 401 + Cache-Control no-store，
/sw.js 应为 BYPASS。两者不得是 HIT。

## Token 权限

官方 Create a Cache Rule via API 文档列出：
- Zone > Cache Rules > Edit
- Account Rulesets > Edit
- Account Filter Lists > Edit

仅给专用临时 Token 授予必要 Zone / Account 权限，
不要复用 DDNS Token。也可以在已登录 Cloudflare Dashboard
手工配置，不需要新增 API 凭据。
