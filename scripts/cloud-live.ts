/** Operator-only fixed-target compatibility test. Not an HTTP backend/provider. */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { extractPage } from '../server/extract-page.ts';
import { interact } from '../server/interactions.ts';
import { cleanDiscussion } from '../server/normalize.ts';
import { allowedResource, validateRedditUrl, resolvePublic } from '../server/security.ts';
import type { Discussion } from '../shared/schema.ts';
const key = process.env.BROWSER_USE_API_KEY;
if (!key) throw new Error('Set BROWSER_USE_API_KEY in the operator environment. Never commit it.');
const base = 'https://api.browser-use.com/api/v4';
const proxyCountry = process.env.BROWSER_USE_PROXY_COUNTRY || null;
// Explicit operator opt-in; this mode is limited to the two approved POC pages.
const solveCaptchas = process.env.BROWSER_USE_SOLVE_CAPTCHAS === 'true';
const approvedPocCases = new Set(['archived-eli5', 'subreddit-listing']);
const artifactDir = solveCaptchas
  ? 'artifacts/cloud-live-managed'
  : proxyCountry
    ? 'artifacts/cloud-live-proxy'
    : 'artifacts/cloud-live';
async function api(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(base + path, {
    method,
    headers: { 'X-Browser-Use-API-Key': key!, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Browser Use ${method} returned HTTP ${response.status}`);
  return response.json();
}
const eli5 =
  'https://www.reddit.com/r/explainlikeimfive/comments/208ft5/eli5why_is_earths_core_molten_what_keeps_it_warm/';
const large =
  'https://www.reddit.com/r/AskReddit/comments/82y1qj/what_is_extremely_common_but_people_think_its/';
const cases = [
  ['archived-eli5', eli5, 'desktop'],
  ['large-thread', large, 'desktop'],
  [
    'image-post',
    'https://www.reddit.com/r/pics/comments/1u58ant/photo_of_my_friends_cousins_door/',
    'desktop',
  ],
  [
    'video-post',
    'https://www.reddit.com/r/animation/comments/1u1wxe7/developing_the_animated_crowns/',
    'desktop',
  ],
  [
    'deleted-author-candidate',
    'https://www.reddit.com/r/explainlikeimfive/comments/4quywi/eli5_why_are_pdfs_so_hard_to_edit/',
    'desktop',
  ],
  ['deeply-nested', large, 'desktop'],
  ['app-promotion-candidate', eli5, 'mobile'],
  ['genuine-login-candidate', 'https://www.reddit.com/r/lounge/', 'desktop'],
  ['subreddit-listing', 'https://www.reddit.com/r/explainlikeimfive/', 'desktop'],
  ['android-viewport', eli5, 'mobile'],
] as const;
await mkdir(artifactDir, { recursive: true, mode: 0o700 });
let session: { id: string; cdpUrl: string } | undefined;
let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
const rows: Record<string, unknown>[] = [];
let stopped = false;
try {
  session = await api('/browsers', 'POST', {
    timeout: 5,
    proxyCountryCode: proxyCountry,
    solveCaptchas,
    enableRecording: false,
  });
  if (!session?.cdpUrl) throw new Error('Provider did not return a CDP endpoint.');
  browser = await chromium.connectOverCDP(session.cdpUrl, { timeout: 20000 });
  console.log(
    JSON.stringify({
      event: 'cloud_browser_connected',
      browser: browser.version(),
      captchaSolving: solveCaptchas,
      proxy: proxyCountry,
      profile: false,
      timeoutMinutes: 5,
    }),
  );
  for (const [name, url, viewport] of cases) {
    if (solveCaptchas && !approvedPocCases.has(name)) continue;
    const started = Date.now();
    validateRedditUrl(url);
    await resolvePublic(new URL(url).hostname);
    const context = await browser.newContext({
      viewport: viewport === 'mobile' ? { width: 412, height: 915 } : { width: 1280, height: 900 },
      isMobile: viewport === 'mobile',
      hasTouch: viewport === 'mobile',
      serviceWorkers: 'block',
      acceptDownloads: false,
    });
    const timer = setTimeout(() => {
      void context.close().catch(() => {});
    }, 40000);
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(1500);
      context.on('page', (p) => {
        if (p !== page) void p.close();
      });
      await context.route('**/*', async (route) => {
        try {
          const req = route.request();
          const target = new URL(req.url());
          const challengeResource =
            solveCaptchas &&
            target.protocol === 'https:' &&
            [
              'www.google.com',
              'www.gstatic.com',
              'www.recaptcha.net',
              'recaptcha.google.com',
            ].includes(target.hostname) &&
            target.pathname.startsWith('/recaptcha/');
          if (!allowedResource(req.url()) && !challengeResource) return await route.abort();
          if (req.isNavigationRequest()) {
            if (req.frame() === page.mainFrame()) validateRedditUrl(req.url());
            else if (!challengeResource) return await route.abort();
          }
          await route.continue();
        } catch {
          await route.abort().catch(() => {});
        }
      });
      await context.routeWebSocket('**/*', (socket) => socket.close());
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12000 });
      if (solveCaptchas)
        await page
          .waitForFunction(
            () =>
              !!document.querySelector('shreddit-post,.thing.link') ||
              /log in to (view|access)|this community is private/i.test(
                document.body?.innerText || '',
              ),
            undefined,
            { timeout: 20000 },
          )
          .catch(() => {});
      await page
        .waitForFunction(
          () =>
            !!document.querySelector('shreddit-post,.thing.link') ||
            /prove your humanity|complete the challenge|blocked by network security|access denied|too many requests|log in to (view|continue)|private community|you must be 18/i.test(
              document.body?.innerText || '',
            ),
          undefined,
          { timeout: 4000 },
        )
        .catch(() => {});
      let d = await extractPage(page),
        attempts = 0;
      if (!['source_blocked', 'login_required', 'rate_limited'].includes(d.status))
        attempts = await interact(page, 3000, new AbortController().signal);
      d = cleanDiscussion(await extractPage(page));
      if (
        !d.post &&
        !d.listing.length &&
        response?.status() === 403 &&
        d.status !== 'login_required'
      )
        d.status = 'source_blocked';
      d.evidence = {
        ...d.evidence,
        httpStatus: response?.status() ?? null,
        viewport,
        elapsedMs: Date.now() - started,
        expansionAttempts: attempts,
      };
      await page
        .screenshot({ path: `${artifactDir}/${name}.png`, fullPage: false, timeout: 2000 })
        .catch(() => {});
      await writeFile(`${artifactDir}/${name}.html`, await page.content(), { mode: 0o600 });
      await writeFile(`${artifactDir}/${name}.json`, JSON.stringify(d, null, 2), { mode: 0o600 });
      const row = {
        case: name,
        url,
        viewport,
        status: d.status,
        httpStatus: d.evidence.httpStatus,
        titleRetrieved: !!d.post?.title,
        bodyRetrieved: !!d.post?.blocks.length,
        comments: d.evidence.renderedComments,
        listing: d.listing.length,
        archived: d.post?.archived ?? false,
        image: d.post?.media.some((m) => m.kind === 'image') ?? false,
        video: d.post?.media.some((m) => m.kind === 'video' || m.kind === 'embed') ?? false,
        deletedAuthor: d.post?.author.deleted ?? false,
        maxDepth: maxDepth(d.comments),
        expansionAttempts: attempts,
      };
      rows.push(row);
      console.log(JSON.stringify(row));
    } catch {
      const row = { case: name, status: 'worker_error', comments: 0 };
      rows.push(row);
      console.log(JSON.stringify(row));
    } finally {
      clearTimeout(timer);
      await context.close().catch(() => {});
    }
  }
} finally {
  await browser?.close().catch(() => {});
  if (session?.id) {
    for (let attempt = 0; attempt < 3 && !stopped; attempt++) {
      try {
        await api(`/browsers/${session.id}`, 'PATCH', { action: 'stop' });
        stopped = true;
      } catch {
        /* Retry only cleanup, never source access. */
      }
    }
    console.log(JSON.stringify({ event: 'cloud_browser_cleanup', stopped }));
    if (!stopped) process.exitCode = 1;
  }
  await writeFile(
    `${artifactDir}/report.json`,
    JSON.stringify(
      {
        observedAt: new Date().toISOString(),
        provider: 'Browser Use Cloud (built-in stealth acknowledged by owner)',
        restrictions: { solveCaptchas, proxyCountryCode: proxyCountry, profile: false },
        stopped,
        rows,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
}
function maxDepth(comments: Discussion['comments']): number {
  return comments.reduce((m, c) => Math.max(m, c.depth, maxDepth(c.children)), 0);
}
