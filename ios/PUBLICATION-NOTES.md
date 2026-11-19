# PKAtlas iOS source snapshot · v2.24 Build 30

This public source snapshot corresponds to the current native SwiftUI iOS feature set. Real deployment origins and identifiers have been replaced with `pk.example.com` and `com.example`. Private cloud credentials, account sessions, signing private keys, Apple provisioning, and unpublished machine logs are excluded.

The actual unsigned IPA is distributed through a **private** GitHub release repository, not this public source tree, because the production app may embed organization-specific connectivity settings. Build and configure your own server, Apple bundle identifier, team, model signing key pair and runtime origin before use. No public repository contains user dose or medical records.

The live 181 website has a newer network-first Service Worker revision. This iOS release bundles the signed engine version captured during Build 30, which remains compatible with signed model hot-update where configured.
