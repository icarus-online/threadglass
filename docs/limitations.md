# Known limitations

- **The production default remains blocked on the initial host.** Standard local Chromium and direct cloud browsing were blocked. A separately approved managed-cloud POC retrieved one real title and 25 comments; the full acceptance matrix and production cloud integration remain incomplete. Exact results are in the compatibility report.
- All live acceptance cases are attempted with explicit assertions. A source block prevents verification of the requested content behavior, including deleted-author, real app-interstitial and genuine-login cases. Candidate URLs are not a promise that those page states still exist.
- The modern and legacy DOM adapters have synthetic regression fixtures. Reddit may change its markup, localization, controls, shadow-root structure, or serving policies. English message matching can miss other languages.
- Comment expansion/scrolling is bounded. The app does not promise to load every comment, recursively crawl continuations, restore deleted material, or recover authenticated content. Continue-thread links start another explicit read.
- Only displayed metadata is extracted. Missing scores and timestamps remain null. A missing/deleted author marker does not prove why the account is unavailable. A rich-text body may be absent for an image/link post.
- Direct image and video URLs present in the rendered DOM are supported. External embeds become links. Opaque blob video URLs, DASH-only streams, separate video/audio streams, and script-only player state are not reconstructed; some videos may be unavailable or lack audio.
- The optional local userscript takes a snapshot of already-loaded content. It does not automatically scroll, expand comments, intercept Reddit network requests, or import cookies. Compatible userscript-manager behavior on real Android browsers remains unverified.
- Android-sized Chromium emulation passes fixture tests; physical Android-device testing has not been performed.
- The Browser Use experiment is an operator-only CLI. Its built-in browser behavior and standard proxy route were specifically authorized during this project. A production Browser Use backend is pending independently verified egress isolation and provider integration. Cloud test reports are separate from default local-browser evidence.
- Remote CDP support requires an operator-managed proxy with equivalent public-IP validation and DNS pinning. That remote path has not been integration-tested.
- Limits and cache are per process. A public multi-instance service needs upstream rate controls and infrastructure egress restrictions. The default Compose stack binds to loopback and has no public deployment or TLS certificate.
- Persistent diagnostic retention is operator-managed. Default Compose diagnostics are ephemeral and bounded. Do not expose raw diagnostics publicly.
- This is an early alpha with no independent security audit, broad browser-compatibility guarantee, or production uptime claim.
