import { chromium, type Browser, type BrowserContext } from 'playwright';
import { mkdir, writeFile, chmod } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { extractPage } from './extract-page.ts';
import type { Discussion, ReadInput } from '../shared/schema.ts';
import { allowedResource, validateRedditUrl, resolvePublic } from './security.ts';
import { createEgress } from './egress.ts';
import { interact } from './interactions.ts';
import { abortable } from './budget.ts';
import { cleanDiscussion } from './normalize.ts';
export class ReaderError extends Error {
  constructor(
    public code: string,
    message: string,
    public httpStatus = 503,
  ) {
    super(message);
  }
}
export class BrowserService {
  private browser?: Browser;
  private launching?: Promise<Browser>;
  private egress?: Awaited<ReturnType<typeof createEgress>>;
  private active = 0;
  private closing = false;
  constructor(
    private concurrency = 2,
    private budgetMs = 35000,
  ) {}
  private async getBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) return this.browser;
    if (this.launching) return this.launching;
    this.launching = (async () => {
      let browser: Browser;
      if (process.env.CHROMIUM_CDP_URL) {
        // Remote operators must supply the same egress enforcement at the remote host.
        if (!process.env.REMOTE_EGRESS_PROXY)
          throw new ReaderError(
            'remote_configuration',
            'Remote Chromium requires REMOTE_EGRESS_PROXY with public-IP pinning.',
          );
        browser = await chromium.connectOverCDP(process.env.CHROMIUM_CDP_URL, { timeout: 15000 });
      } else {
        this.egress ??= await createEgress();
        browser = await chromium.launch({
          timeout: 15000,
          headless: true,
          executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
          chromiumSandbox: process.env.CHROMIUM_SANDBOX !== 'false',
          proxy: { server: this.egress.url, bypass: '<-loopback>' },
          args: ['--disable-quic', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp'],
        });
      }
      browser.on('disconnected', () => {
        if (this.browser === browser) this.browser = undefined;
      });
      this.browser = browser;
      return browser;
    })();
    try {
      return await this.launching;
    } finally {
      this.launching = undefined;
    }
  }
  async read(input: ReadInput, signal: AbortSignal): Promise<Discussion> {
    if (this.closing || this.active >= this.concurrency)
      throw new ReaderError('busy', 'The browser is busy. Try again shortly.', 429);
    if (signal.aborted) throw new ReaderError('cancelled', 'Reading cancelled.', 499);
    let url: URL;
    try {
      url = validateRedditUrl(input.url);
    } catch {
      throw new ReaderError('invalid_url', 'Paste an HTTPS Reddit thread or subreddit URL.', 400);
    }
    this.active++;
    const started = Date.now();
    let context: BrowserContext | undefined;
    let snapshot: Discussion | undefined;
    let stage = 'dns';
    const budget = AbortSignal.timeout(this.budgetMs);
    const combined = AbortSignal.any([signal, budget]);
    const cancel = () => {
      void context?.close().catch(() => {});
    };
    combined.addEventListener('abort', cancel, { once: true });
    try {
      await abortable(resolvePublic(url.hostname), combined);
      stage = 'launch';
      const browser = await abortable(this.getBrowser(), combined);
      if (signal.aborted) throw new ReaderError('cancelled', 'Reading cancelled.', 499);
      stage = 'context';
      const pendingContext = browser.newContext({
        viewport:
          input.viewport === 'mobile' ? { width: 412, height: 915 } : { width: 1280, height: 900 },
        isMobile: input.viewport === 'mobile',
        hasTouch: input.viewport === 'mobile',
        serviceWorkers: 'block',
        acceptDownloads: false,
        ...(process.env.CHROMIUM_CDP_URL
          ? { proxy: { server: process.env.REMOTE_EGRESS_PROXY!, bypass: '<-loopback>' } }
          : {}),
      });
      void pendingContext
        .then((ctx) => {
          if (combined.aborted) return ctx.close();
        })
        .catch(() => {});
      context = await abortable(pendingContext, combined);
      stage = 'page';
      const page = await context.newPage();
      page.setDefaultTimeout(2000);
      page.setDefaultNavigationTimeout(18000);
      context.on('page', (popup) => {
        if (popup !== page) void popup.close();
      });
      await context.route('**/*', async (route) => {
        const req = route.request();
        try {
          if (!allowedResource(req.url())) return await route.abort('blockedbyclient');
          if (req.isNavigationRequest()) {
            if (req.frame() !== page.mainFrame()) return await route.abort('blockedbyclient');
            validateRedditUrl(req.url());
          }
          await route.continue();
        } catch {
          await route.abort('blockedbyclient').catch(() => {});
        }
      });
      // WebSockets are unnecessary for reading and cannot bypass the HTTP route guard.
      await context.routeWebSocket('**/*', (socket) => socket.close());
      stage = 'navigate';
      let status: number | null = null,
        navError = false;
      try {
        status = (await page.goto(url.href, { waitUntil: 'domcontentloaded' }))?.status() ?? null;
      } catch {
        navError = true;
      }
      if (signal.aborted) throw new ReaderError('cancelled', 'Reading cancelled.', 499);
      await page
        .waitForFunction(
          () =>
            !!document.querySelector(
              'shreddit-post,.thing.link,shreddit-comment,[data-testid="post-container"],input[type="password"]',
            ) ||
            /prove your humanity|complete the challenge|blocked by network security|access denied|too many requests|log in to (view|continue)|confirm your age|you must be 18|whoa there/i.test(
              document.body?.innerText || '',
            ),
          undefined,
          { timeout: 7000 },
        )
        .catch(() => {});
      stage = 'extract';
      let result = await extractPage(page);
      result.evidence = {
        ...result.evidence,
        httpStatus: status,
        viewport: input.viewport,
        elapsedMs: Date.now() - started,
      };
      snapshot = cleanDiscussion(result);
      stage = 'interact';
      let attempts = 0;
      if (!['login_required', 'source_blocked', 'rate_limited'].includes(result.status))
        attempts = await interact(
          page,
          Math.min(8000, this.budgetMs - (Date.now() - started) - 2000),
          signal,
        );
      stage = 'extract';
      result = await extractPage(page);
      if (!result.post && !result.listing.length) {
        if (status === 429) result.status = 'rate_limited';
        else if (status === 401) result.status = 'login_required';
        else if (status === 403 && result.status !== 'login_required')
          result.status = 'source_blocked';
        else if (navError && result.status === 'render_failure') result.status = 'network_failure';
        result.message =
          (
            {
              rate_limited: 'Reddit temporarily limited this browser. Try again later.',
              login_required: 'Reddit requires authentication. Threadglass stops here.',
              source_blocked:
                'Reddit blocked this browser or requires verification. Threadglass stops here.',
              network_failure: 'The browser could not reach Reddit.',
            } as Record<string, string>
          )[result.status] || result.message;
      }
      cleanDiscussion(result);
      snapshot = result;
      result.evidence = {
        ...result.evidence,
        expansionAttempts: attempts,
        httpStatus: status,
        viewport: input.viewport,
        elapsedMs: Date.now() - started,
      };
      if (process.env.DIAGNOSTICS === 'true') {
        const id = randomUUID(),
          dir = `artifacts/diagnostics/${id}`;
        await mkdir(dir, { recursive: true, mode: 0o700 });
        await chmod(dir, 0o700);
        await page
          .screenshot({ path: `${dir}/page.png`, fullPage: false, timeout: 1500 })
          .catch(() => {});
        await writeFile(`${dir}/page.html`, await page.content(), { mode: 0o600 });
        await writeFile(`${dir}/result.json`, JSON.stringify(result, null, 2), { mode: 0o600 });
        result.evidence.diagnosticsId = id;
      }
      return result;
    } catch (error) {
      if (signal.aborted) throw new ReaderError('cancelled', 'Reading cancelled.', 499);
      if (snapshot && (snapshot.post || snapshot.listing.length)) {
        snapshot.status = 'partial';
        snapshot.message =
          'Public content was retrieved before browsing stopped. Some comments or media may be missing.';
        snapshot.warnings.push(
          'The rendering or interaction budget ended after the first readable snapshot.',
        );
        snapshot.evidence.elapsedMs = Date.now() - started;
        return snapshot;
      }
      if (budget.aborted)
        throw new ReaderError(
          'timeout',
          'The browser exceeded its rendering budget. Try again.',
          504,
        );
      if (error instanceof ReaderError) throw error;
      console.error(
        JSON.stringify({
          event: 'browser_failure',
          stage,
          errorType: error instanceof Error ? error.name : 'unknown',
        }),
      );
      throw new ReaderError(
        'browser_failure',
        'Chromium could not complete this request. See the local operator logs.',
      );
    } finally {
      combined.removeEventListener('abort', cancel);
      await context?.close().catch(() => {});
      this.active--;
    }
  }
  async close() {
    this.closing = true;
    await this.launching?.catch(() => {});
    await this.browser?.close().catch(() => {});
    await this.egress?.close();
  }
}
