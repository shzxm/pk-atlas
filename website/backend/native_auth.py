"""Same-origin browser login -> one-time, PKCE-bound native app session grant.

No credentials or long-lived session tokens are ever placed in app callback
URLs. Grants live only in process memory and expire after two minutes.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import re
import secrets
import threading
import time
from urllib.parse import urlencode

_B64 = re.compile(r"^[A-Za-z0-9_-]+$")
GRANTS: dict[str, tuple[int, str, str, float]] = {}
_LOCK = threading.Lock()
TTL = 120


def valid_challenge(value: object) -> bool:
    return isinstance(value, str) and len(value) == 43 and bool(_B64.fullmatch(value))


def valid_state(value: object) -> bool:
    return isinstance(value, str) and 24 <= len(value) <= 128 and bool(_B64.fullmatch(value))


def issue(user_id: int, challenge: str, state: str) -> str | None:
    if not valid_challenge(challenge) or not valid_state(state) or user_id <= 0:
        return None
    now = time.monotonic()
    with _LOCK:
        for key, value in list(GRANTS.items()):
            if value[3] < now:
                del GRANTS[key]
        if len(GRANTS) > 512:
            return None
        code = secrets.token_urlsafe(32)
        GRANTS[hashlib.sha256(code.encode()).hexdigest()] = (user_id, challenge, state, now + TTL)
    return code


def consume(code: object, verifier: object, state: object) -> int | None:
    if not isinstance(code, str) or len(code) != 43 or not _B64.fullmatch(code):
        return None
    if not isinstance(verifier, str) or not 43 <= len(verifier) <= 128 or not _B64.fullmatch(verifier):
        return None
    if not valid_state(state):
        return None
    key = hashlib.sha256(code.encode()).hexdigest()
    digest = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    with _LOCK:
        grant = GRANTS.get(key)
        if not grant:
            return None
        uid, challenge, original, deadline = grant
        if deadline < time.monotonic():
            GRANTS.pop(key, None)
            return None
        if not hmac.compare_digest(original, state) or not hmac.compare_digest(challenge, digest):
            return None
        GRANTS.pop(key, None)
    return uid


def callback(code: str, state: str) -> str:
    return "pkatlas://auth/callback?" + urlencode({"code": code, "state": state})


LOGIN_PAGE = '<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<meta name="theme-color" content="#0b1120"><title>安全连接 · 药时</title>\n<link rel="stylesheet" href="/native-login.css?v=20261117-2"></head>\n<body><div class="backdrop" aria-hidden="true"></div>\n<main class="auth-shell"><header class="brand"><div class="brand-mark">✦</div><div><strong>药时</strong><small>PK ATLAS · SECURE CONNECT</small></div><span class="secure-pill">安全连接</span></header>\n<section class="auth-panel"><div class="eyebrow"><span class="dot"></span>设备授权</div>\n<h1>连接你的药时</h1><p class="lead">在官方网站确认身份后，将这台设备与账户安全关联。密码始终留在网站，不会交给原生 App。</p>\n<div class="steps"><span class="active" id="step1">01 登录账户</span><span id="step2">02 授权设备</span><span id="step3">03 返回 App</span></div>\n<div id="login"><form id="loginForm"><label for="username">用户名</label><input id="username" name="username" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="药时账户" required>\n<label for="password">密码</label><div class="password-field"><input id="password" type="password" name="password" autocomplete="current-password" placeholder="输入密码" required><button id="togglePassword" type="button" class="toggle-pass" aria-label="显示密码">显示</button></div>\n<button id="loginButton" type="submit" class="primary">继续 <span aria-hidden="true">→</span></button></form></div>\n<div id="allow" hidden><div class="identity"><span class="identity-icon">✓</span><div><small>已确认的账户</small><strong id="who"></strong></div></div><p class="approval-copy">仅授权这台设备读取和同步你的药时账户数据。可随时在设备管理中撤销登录。</p><button type="button" id="authorize" class="primary">确认授权并返回 App <span aria-hidden="true">→</span></button></div>\n<p id="status" role="status" aria-live="polite"></p><a id="finish" class="secondary" hidden>手动返回药时 App</a>\n</section><footer><span>一次性设备凭证 · 有效期 2 分钟 · PKCE 验证</span><span>HTTPS 安全连接</span></footer></main>\n<script defer src="/native-login.js?v=20261117-2"></script></body></html>'

INVALID_REQUEST_PAGE = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>请从 App 发起登录 · 药时</title><link rel="stylesheet" href="/native-login.css?v=20261117-2"></head><body><div class="backdrop" aria-hidden="true"></div><main class="auth-shell"><header class="brand"><div class="brand-mark">✦</div><div><strong>药时</strong><small>PK ATLAS · SECURE CONNECT</small></div></div></header><section class="auth-panel"><div class="eyebrow">设备连接已中断</div><h1>请从药时 App 重新开始</h1><p class="lead">这个地址缺少一次性设备授权参数，可能是从浏览器收藏夹打开、复制链接时丢失参数，或使用了已经结束的登录流程。</p><p class="approval-copy">返回药时 App → 我的药时 → 打开药时网页登录并授权。出于账户安全，不能直接在网页上补造设备授权参数。</p><a href="/" class="secondary">返回药时网站首页</a></section><footer>不会收集任何登录凭证 · 不会放宽设备验证规则</footer></main></body></html>'
