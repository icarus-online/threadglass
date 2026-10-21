# Contributing

Threadglass is an early alpha. Start with a small issue describing a reproducible reader or extraction problem. The compatibility report deliberately distinguishes passing fixture tests from successful live Reddit retrieval.

## Development

Use `npm ci`, `npm run dev`, and `npm run check`. Use the pinned Docker image for reproducible Chromium dependencies. Run `npm run test:e2e` for browser/reader changes. Keep package and container Playwright versions aligned.

Changes to the Reddit adapter need sanitized, synthetic DOM fixtures covering their supported markup and parent relationships. Tests should exercise real DOM extraction in Chromium rather than duplicate selector constants. New live compatibility claims require a dated report showing post body/comment assertions and viewport evidence. A search-engine result or HTTP 200 does not prove retrieval.

Do not commit populated environment files, credentials, cookies, session URLs, raw source DOM, third-party discussion archives, or diagnostic screenshots. `artifacts/`, `test-results/`, and build output are ignored. Public documentation should contain sanitized aggregate results and public source URLs only.

Keep source availability honest. Never invent a missing comment, mark a network block as successful retrieval, or treat an app promotion as proof that authentication is needed. Any provider-specific cloud behavior and its costs must be explicit. Authentication, account interaction, and source content mutation are outside this reader's scope.

Run `npm run licenses` after dependency changes and update third-party notices. Preserve license notices in bundled distributions. Contributions are accepted under the repository's MIT license for original Threadglass code.
