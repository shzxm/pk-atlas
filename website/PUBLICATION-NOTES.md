# Website source snapshot · 2026-11-19

This snapshot contains the current website UI, calculation/inverse mathematics, public server modules, and tests. It was **sanitized for publication**. Production origins and infrastructure addresses were replaced with `pk.example.com` and documentation-only IP addresses.

The signed mathematical engine and cloud deployment credentials are intentionally not distributed. For production use, configure your own HTTPS origin, secrets, VAPID/APNs credentials, signing key pair, and regenerate model signatures. The copied `web/` assets must be built and signed with your own keys; the production signature will not validate against modified sources.

Not included: user state/database, device tokens, access cookies, `.env`, signing private keys, reverse-proxy production configuration, and runtime backups. Never check real account or medical information into Git.

The deployed frontend uses a network-first Service Worker HTML shell, falling back to cached HTML only while offline, so a new index.html references the current versioned engine.

## 2026-11-19 superseded adopted plan confirmation fix

Only nodes belonging to the **current accepted adjustment** can generate pending yes/no confirmations or adopted-plan notifications. The replaced original plan remains as mathematical history, without a second actionable checklist. Native iOS v2.25 Build31 also clears stale queued OS model reminders on adoption and re-fetches the current canonical server notification set. Web Push adopted-change notifications now coalesce to the newest revision; the production IPA stays private.

## Inverse chart navigation correction (2026-11-19)

A/B and adopted-preview navigation in mobile/PWA first reveals the proper chart pane and waits for its layout before scrolling to the SVG plot. The horizontal position follows the scenario target time. The native iOS mirror v2.26 Build32 uses a persistent actual-plot ScrollViewReader anchor and a post-render recenter.
