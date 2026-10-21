import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import type { Discussion } from '../shared/schema.ts';
const mocks = vi.hoisted(() => ({ launch: vi.fn(), resolve: vi.fn(), extract: vi.fn() }));
vi.mock('playwright', () => ({ chromium: { launch: mocks.launch } }));
vi.mock('../server/security.ts', async (original) => ({
  ...(await original<typeof import('../server/security.ts')>()),
  resolvePublic: mocks.resolve,
}));
vi.mock('../server/egress.ts', () => ({
  createEgress: async () => ({ url: 'http://127.0.0.1:9000', close: async () => {} }),
}));
vi.mock('../server/extract-page.ts', () => ({ extractPage: mocks.extract }));
vi.mock('../server/interactions.ts', () => ({ interact: async () => 0 }));
import { BrowserService } from '../server/browser.ts';
const input = {
  url: 'https://www.reddit.com/r/pics/comments/abc123/title/',
  viewport: 'desktop' as const,
};
const result: Discussion = {
  schemaVersion: 1,
  adapterVersion: 'test',
  url: input.url,
  fetchedAt: '2026-10-21T00:00:00Z',
  status: 'source_blocked',
  message: 'blocked',
  post: null,
  comments: [],
  listing: [],
  evidence: {
    renderedComments: 0,
    remainingControls: 0,
    expansionAttempts: 0,
    httpStatus: null,
    viewport: 'desktop',
    elapsedMs: 0,
  },
  warnings: [],
  continuations: [],
};
function fakeBrowser() {
  const page = {
    setDefaultTimeout: vi.fn(),
    setDefaultNavigationTimeout: vi.fn(),
    mainFrame: vi.fn(),
    url: vi.fn().mockReturnValue(input.url),
    goto: vi.fn().mockResolvedValue({ status: () => 403 }),
    waitForFunction: vi.fn().mockResolvedValue(null),
  };
  const context = {
    newPage: vi.fn().mockResolvedValue(page),
    on: vi.fn(),
    route: vi.fn(),
    routeWebSocket: vi.fn(),
    close: vi.fn().mockResolvedValue(null),
  };
  const browser = {
    isConnected: vi.fn().mockReturnValue(true),
    on: vi.fn(),
    newContext: vi.fn().mockResolvedValue(context),
    close: vi.fn().mockResolvedValue(null),
  };
  return { page, context, browser };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolve.mockResolvedValue({ address: '1.1.1.1', family: 4 });
  mocks.extract.mockImplementation(async () => structuredClone(result));
});
afterEach(() => vi.useRealTimers());
describe('browser lifecycle', () => {
  it('reuses Chromium but creates and closes independent contexts', async () => {
    const f = fakeBrowser();
    mocks.launch.mockResolvedValue(f.browser);
    const service = new BrowserService();
    await service.read(input, new AbortController().signal);
    await service.read(input, new AbortController().signal);
    expect(mocks.launch).toHaveBeenCalledTimes(1);
    expect(f.browser.newContext).toHaveBeenCalledTimes(2);
    expect(f.context.close).toHaveBeenCalledTimes(2);
    await service.close();
    expect(f.browser.close).toHaveBeenCalledTimes(1);
  });
  it('bounds concurrency, cancels launch wait, and cleans up a late browser', async () => {
    let finish!: (value: unknown) => void;
    mocks.launch.mockReturnValue(new Promise((r) => (finish = r)));
    const service = new BrowserService(1),
      controller = new AbortController();
    const pending = service.read(input, controller.signal);
    await vi.waitFor(() => expect(mocks.launch).toHaveBeenCalled());
    await expect(service.read(input, new AbortController().signal)).rejects.toMatchObject({
      code: 'busy',
      httpStatus: 429,
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
    const f = fakeBrowser();
    finish(f.browser);
    await service.close();
    expect(f.browser.close).toHaveBeenCalled();
  });
  it('closes a context on extraction failure', async () => {
    const f = fakeBrowser();
    mocks.launch.mockResolvedValue(f.browser);
    mocks.extract.mockRejectedValue(new Error('unsupported source structure'));
    const service = new BrowserService();
    await expect(service.read(input, new AbortController().signal)).rejects.toMatchObject({
      code: 'browser_failure',
    });
    expect(f.context.close).toHaveBeenCalledTimes(1);
    await service.close();
  });
  it('recovers a disconnected browser on the next request', async () => {
    const a = fakeBrowser(),
      b = fakeBrowser();
    mocks.launch.mockResolvedValueOnce(a.browser).mockResolvedValueOnce(b.browser);
    const service = new BrowserService();
    await service.read(input, new AbortController().signal);
    a.browser.isConnected.mockReturnValue(false);
    await service.read(input, new AbortController().signal);
    expect(mocks.launch).toHaveBeenCalledTimes(2);
    expect(b.context.close).toHaveBeenCalled();
    await service.close();
  });
  it('enforces the total deadline including DNS', async () => {
    mocks.resolve.mockReturnValue(new Promise(() => {}));
    const service = new BrowserService(1, 20);
    await expect(service.read(input, new AbortController().signal)).rejects.toMatchObject({
      code: 'timeout',
      httpStatus: 504,
    });
    expect(mocks.launch).not.toHaveBeenCalled();
    await service.close();
  });
  it('rejects unsafe URLs before DNS or launch', async () => {
    const service = new BrowserService();
    await expect(
      service.read({ ...input, url: 'https://127.0.0.1/r/pics/' }, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'invalid_url' });
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.launch).not.toHaveBeenCalled();
    await service.close();
  });
  it.each([
    'https://www.reddit.com/api/v1/me',
    'https://www.reddit.com/login/',
    'https://example.com/thread',
  ])('refuses to extract an unsupported final destination %s', async (destination) => {
    const f = fakeBrowser();
    f.page.url.mockReturnValue(destination);
    mocks.launch.mockResolvedValue(f.browser);
    const service = new BrowserService();
    await expect(service.read(input, new AbortController().signal)).rejects.toMatchObject({
      code: 'unsupported_redirect',
      httpStatus: 422,
    });
    expect(mocks.extract).not.toHaveBeenCalled();
    expect(f.context.close).toHaveBeenCalled();
    await service.close();
  });
  it('keeps a failed blank navigation classified as a network failure', async () => {
    const f = fakeBrowser();
    f.page.url.mockReturnValue('about:blank');
    f.page.goto.mockRejectedValue(new Error('network unavailable'));
    mocks.launch.mockResolvedValue(f.browser);
    mocks.extract.mockImplementation(async () => ({
      ...structuredClone(result),
      status: 'render_failure',
    }));
    const service = new BrowserService();
    expect((await service.read(input, new AbortController().signal)).status).toBe(
      'network_failure',
    );
    await service.close();
  });
});
