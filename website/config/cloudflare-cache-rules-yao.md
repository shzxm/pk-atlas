# Cloudflare Cache Rules for yao.shzxm.com (not yet activated)

Prepared policy; NOT a claim that Cloudflare is configured. Its dashboard
currently requires human security verification.

## Public shell ONLY (Eligible for cache)

Expression:

~~~
(http.host eq "yao.shzxm.com" and http.request.method eq "GET" and
 http.request.uri.path in {"/" "/index.html" "/quick.html"
 "/notifications.html" "/data-center.html" "/install.html" "/api.html"})
~~~

Action: Eligible for cache, Edge TTL 120 seconds, Browser TTL Respect origin.

The home/HTML responses are static for every visitor, without personal data.
Login cookies use Path=/api/, never included in the public app shell.

## All private API requests (Bypass cache)

Expression:

~~~
(http.host eq "yao.shzxm.com" and starts_with(http.request.uri.path, "/api/"))
~~~

Action: Bypass cache, placed LAST after any broad cache rule.
Cloudflare uses the LAST matching Cache Rule setting. Do not cache medical API
state, medication history, credentials, sessions, or private notifications.

Never cache the service worker at /sw.js (no-store by origin). Do not create
a broad Cache Everything rule.

## Verification

From an external machine, run: python3 scripts/check_cloudflare_cache.py

The checker makes two credential-free requests to public HTML, a JS asset,
an unauthenticated private endpoint and the service worker. Only public HTML
may be HIT; /api/me and /sw.js must never be HIT. Exit code 2 signals that
caching is not confirmed, or that a safety condition failed.

- After warming a single Cloudflare colo, public / should become MISS then HIT.
- API must remain DYNAMIC/BYPASS with Cache-Control no-store.
- /sw.js must not become HIT; its updates must be available immediately.
- Session cookies must retain HttpOnly, Secure, SameSite Strict and Path=/api/.
- Purge public HTML only after major releases if a 120-second old shell
  would be unacceptable. JS/CSS and PWA worker have explicit version keys.

## Other network work

Observed local Fake-IP resolution at 198.18.x.x and US SEA/PDX Cloudflare
colos, versus direct JP server reaching Tokyo NRT. Compare a Japan exit for
this domain, but do not globally change router rules without checking.
Evaluate paid Argo/Smart Shield only if uncached API latency remains a concern.
