# Website source snapshot · 2026-11-19

This snapshot contains the current website UI, calculation/inverse mathematics, public server modules, and tests. It was **sanitized for publication**. Production origins and infrastructure addresses were replaced with `pk.example.com` and documentation-only IP addresses.

The signed mathematical engine and cloud deployment credentials are intentionally not distributed. For production use, configure your own HTTPS origin, secrets, VAPID/APNs credentials, signing key pair, and regenerate model signatures. The copied `web/` assets must be built and signed with your own keys; the production signature will not validate against modified sources.

Not included: user state/database, device tokens, access cookies, `.env`, signing private keys, reverse-proxy production configuration, and runtime backups. Never check real account or medical information into Git.

The deployed frontend uses a network-first Service Worker HTML shell, falling back to cached HTML only while offline, so a new index.html references the current versioned engine.
