# Security & health data

Do not commit patient records, iOS Journal personal exports, SQLite databases,
API tokens, Telegram Bot tokens, Web Push/VAPID private keys, Apple signing
profiles or certificates. Keep the Python API on loopback behind strict HTTPS.

- Public HTML/JS/CSS may be cached; all authenticated /api/ routes must bypass CDN.
- The browser local offline snapshot is not an end-to-end encrypted vault.
- Use the versioned API and a verified backup before restoring account state.
- Report vulnerabilities privately, not with real credentials in GitHub issues.
- Calculated PK curves and reverse scenarios are not individualized medical
  measurements or treatment recommendations.
- DG-Lab cross-app links never transmit medication data or operate physical devices.
