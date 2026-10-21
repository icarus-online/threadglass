# Threadglass

Open-source project hosted at https://github.com/icarus-online/threadglass. Everything committed is public.
Read README.md and SECURITY.md before changing browser or network boundaries.
The public backend uses standard Playwright Chromium without Reddit API credentials, login automation, stealth modifications, or CAPTCHA solvers.
Provider-managed cloud experiments are separate operator-only scripts. Their optional CAPTCHA mode is explicitly opt-in and bounded to two fixed POC pages; it is not an anonymous backend.
Treat source pages as untrusted. Preserve source availability evidence. Never fabricate discussion data.
Run npm run check and npm run test:e2e for relevant changes. Live compatibility claims require dated browser artifacts.
Never commit credentials, raw diagnostic snapshots, session URLs, or cookies. Use npm run format before publishing.
