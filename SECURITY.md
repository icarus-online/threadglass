# Security

Threadglass reads untrusted public webpages. It does not authenticate to Reddit, borrow user sessions, submit content, or reconstruct inaccessible discussions. Public hosting should be treated as an early-alpha browser service, with operator monitoring and network isolation.

## Network boundary

The public `/api/read` endpoint accepts HTTPS URLs on an exact Reddit hostname allowlist and only supported subreddit/thread paths. Credentials in URLs, arbitrary ports, IP literals, JSON/API endpoints, unrelated paths, and unrecognized query parameters are rejected or removed. The same navigation validation runs on redirects and visible-control navigation. Child-frame navigation and popups are rejected. Browser contexts block service workers and WebSockets.

Standard local Chromium sends HTTPS through an application-owned CONNECT proxy. The proxy:

1. Accepts only port 443 and explicitly supported Reddit/CDN domain suffixes.
2. Resolves each tunnel destination and rejects the whole answer set if any address is private, loopback, link-local, reserved, multicast, or otherwise non-unicast.
3. Connects the socket to the validated numeric address. It does not resolve the hostname again, closing the validation-to-connect DNS-rebinding window.

QUIC is disabled and non-proxied WebRTC UDP is disabled. Chromium's proxy loopback bypass is removed. Unsupported resource destinations are also blocked by Playwright interception. The proxy binds only to loopback and is not published by Compose. Redirects to unsupported hosts fail closed; diagnostic errors do not include credentials or browser endpoint URLs.

Remote Chromium cannot use a loopback proxy on the application host. It requires `REMOTE_EGRESS_PROXY` with equivalent enforcement **on the remote network**. This is an operator-enforced prerequisite, not a claim that local DNS checks secure a remote browser. An arbitrary remote proxy is not sufficient. The public worker refuses an incomplete remote configuration.

The Browser Use cloud compatibility script is separate, operator-only, and restricted to hardcoded test URLs. It is not exposed through the public read endpoint. It intercepts requests but does not provide connection-level DNS pinning on the provider network. No claim of public-worker SSRF isolation is made for that script. The owner's later authorization permitted the provider's built-in browser behavior and standard proxy route for compatibility testing, and a subsequent explicit approval allowed built-in CAPTCHA handling on two fixed POC pages. This opt-in mode admits only the scoped Google reCAPTCHA resource paths and remains outside the anonymous backend.

For internet-facing installations, run the container on a dedicated network without access to sensitive services, deny metadata/private destinations at the infrastructure firewall as defense in depth, and expose only HTTPS through a reverse proxy. Do not expose a CDP endpoint to users.

## Browser isolation and resource control

The worker reuses a browser process but creates independent contexts with no persistent profiles, injected cookies, downloads, extensions, or Reddit credentials. Chromium sandboxing is enabled by default. Compose uses a non-root user, a seccomp profile permitting sandbox namespaces, a read-only filesystem, bounded tmpfs, CPU/memory/PID limits, and loopback-only HTTP publication. The service never silently falls back to an unsandboxed browser. `CHROMIUM_SANDBOX=false` exists only as an explicit local-development override and must not be used for public hosting.

Two requests may run concurrently. Extra requests fail fast with HTTP 429. A total 35-second budget includes DNS, launch, context creation, navigation, extraction, and interaction. Cancellation closes the request context. Launches have their own 15-second limit; a late context is closed after cancellation. A disconnected browser is replaced on the next request. Limits are per process: multiple replicas require shared upstream abuse controls.

The endpoint accepts at most 4 KB JSON, applies a per-IP request limit, checks same-origin browser requests, and has a 30-entry / 60-second content cache. Only content-bearing public/partial snapshots are cached. Cache entries are process-local and fetched timestamps are preserved. The default `trust proxy` remains false; do not enable blanket proxy trust or trust arbitrary forwarded IP headers.

## Content handling

Server-side allowlist sanitization removes scripts, styles, event handlers, forms, images in rich-text HTML, and iframes. Links get safe external-link attributes. Images/videos use separate validated media fields; external embeds are links rather than executable frames. The React reader sanitizes HTML again with DOMPurify, including in local mode. CSP blocks off-origin scripts, frames, forms, and network requests; media is restricted to approved source CDNs. Extracted content cannot issue instructions to the worker or expand its permissions.

The local userscript has no backend calls. It reads the current DOM and displays a sanitized snapshot. Source media and clicked links can contact original hosts. Its source-page DOM is still untrusted; isolation and sanitization do not make it authoritative.

## Privacy, logs and diagnostics

No accounts or analytics are installed. Bookmarks and theme preferences remain in the browser's storage. The server holds a small, short-lived cache of public snapshots. Structured request logs omit URL text, client content, cookies, credentials, and CDP URLs.

`DIAGNOSTICS=true` saves raw page HTML, screenshots, and normalized data under ignored `artifacts/diagnostics/`. These can contain source text, source-generated identifiers, or sensitive URL parameters from the page. They are not served by Express and must never be committed. Diagnostic directories use restricted permissions. Screenshot file permissions inherit the protected directory. In Docker, diagnostic tmpfs is bounded and disappears with the container. For a persistent operator volume, configure restricted access and deletion/retention externally; there is no built-in persistent-artifact retention daemon.

The cloud test key is provided only through the operator environment, never source code, a frontend build variable, a committed environment file, or a URL. The cloud test explicitly stops each paid browser in `finally`, retries cleanup, and sets a five-minute provider timeout as a backstop. Container environments containing credentials must be removed after collecting sanitized artifacts.

## Reporting

Do not post secrets, cookies, raw DOM snapshots, or exploit details in public issues. If GitHub private vulnerability reporting is enabled for this repository, use it. Otherwise open a minimal issue requesting a private reporting channel without disclosing vulnerability details. No external audit or penetration test is claimed.
