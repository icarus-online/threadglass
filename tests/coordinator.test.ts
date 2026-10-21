import { describe, it, expect, vi } from 'vitest';
import { ReadCoordinator, type Reader } from '../server/coordinator.ts';
import type { Discussion, ReadInput } from '../shared/schema.ts';
const input: ReadInput = {
  url: 'https://www.reddit.com/r/testing/comments/abc123/title/',
  viewport: 'desktop',
};
const signal = () => new AbortController().signal;
function snapshot(status: Discussion['status'] = 'public'): Discussion {
  return {
    schemaVersion: 1,
    adapterVersion: 'test',
    url: input.url,
    fetchedAt: '2026-10-21T00:00:00Z',
    status,
    message: status,
    post:
      status === 'public'
        ? {
            id: 'abc123',
            title: 'Synthetic discussion',
            author: { name: 'reader', deleted: false },
            subreddit: 'r/testing',
            timestamp: null,
            score: null,
            blocks: [{ type: 'html', html: '<p>Fixture</p>' }],
            media: [],
            permalink: input.url,
            archived: false,
            locked: false,
            commentCount: null,
          }
        : null,
    comments: [],
    listing: [],
    warnings: [],
    continuations: [],
    evidence: {
      renderedComments: 0,
      remainingControls: 0,
      expansionAttempts: 0,
      httpStatus: 200,
      viewport: 'desktop',
      elapsedMs: 1,
    },
  };
}
function backend() {
  return {
    read: vi.fn<Reader['read']>().mockResolvedValue(snapshot()),
    close: vi.fn<Reader['close']>().mockResolvedValue(undefined),
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe('anonymous read coordination', () => {
  it('shares simultaneous canonical URLs while separating viewports and preserving freshness', async () => {
    const reader = backend(),
      pending = deferred<Discussion>();
    reader.read.mockReturnValueOnce(pending.promise);
    const c = new ReadCoordinator(reader);
    const a = c.read({ ...input, url: input.url + '?utm_source=one#anchor' }, signal()),
      b = c.read(input, signal());
    await vi.waitFor(() => expect(reader.read).toHaveBeenCalledTimes(1));
    pending.resolve(snapshot());
    expect((await a).cache).toBe('miss');
    expect((await b).cache).toBe('shared');
    const cached = await c.read(input, signal());
    expect(cached.cache).toBe('hit');
    expect(cached.data.fetchedAt).toBe('2026-10-21T00:00:00Z');
    await c.read({ ...input, viewport: 'mobile' }, signal());
    expect(reader.read).toHaveBeenCalledTimes(2);
    await c.close();
  });
  it('does not let the initiating caller cancel another subscriber', async () => {
    const reader = backend(),
      pending = deferred<Discussion>();
    reader.read.mockReturnValue(pending.promise);
    const c = new ReadCoordinator(reader),
      owner = new AbortController();
    const a = c.read(input, owner.signal),
      b = c.read(input, signal());
    await vi.waitFor(() => expect(reader.read).toHaveBeenCalled());
    const cancelled = expect(a).rejects.toMatchObject({ code: 'cancelled' });
    owner.abort();
    await cancelled;
    expect(reader.read.mock.calls[0]![1].aborted).toBe(false);
    pending.resolve(snapshot());
    expect((await b).data.post?.title).toBe('Synthetic discussion');
    await c.close();
  });
  it('aborts underlying work when its last subscriber disconnects, and does not cache it', async () => {
    const reader = backend();
    reader.read.mockImplementationOnce(
      (_input, s) =>
        new Promise((_resolve, reject) =>
          s.addEventListener('abort', () => reject(new Error('stopped')), { once: true }),
        ),
    );
    const c = new ReadCoordinator(reader),
      a = new AbortController(),
      b = new AbortController();
    const pa = c.read(input, a.signal),
      pb = c.read(input, b.signal);
    await vi.waitFor(() => expect(reader.read).toHaveBeenCalled());
    const rejectedA = expect(pa).rejects.toMatchObject({ code: 'cancelled' }),
      rejectedB = expect(pb).rejects.toMatchObject({ code: 'cancelled' });
    a.abort();
    expect(reader.read.mock.calls[0]![1].aborted).toBe(false);
    b.abort();
    await Promise.all([rejectedA, rejectedB]);
    expect(reader.read.mock.calls[0]![1].aborted).toBe(true);
    await vi.waitFor(async () => expect((await c.read(input, signal())).cache).toBe('miss'));
    expect(reader.read).toHaveBeenCalledTimes(2);
    await c.close();
  });
  it('returns short-lived source cooldowns without confusing them with successful content', async () => {
    let now = 1000;
    const reader = backend();
    reader.read.mockResolvedValue(snapshot('rate_limited'));
    const c = new ReadCoordinator(reader, {}, () => now);
    const first = await c.read(input, signal());
    expect(first.retryAfterSeconds).toBe(30);
    expect(first.data.status).toBe('rate_limited');
    now += 1100;
    expect((await c.read(input, signal())).retryAfterSeconds).toBe(29);
    expect(reader.read).toHaveBeenCalledTimes(1);
    now += 29000;
    await c.read(input, signal());
    expect(reader.read).toHaveBeenCalledTimes(2);
    await c.close();
  });
  it('expires readable content and independently cools down blocked sources', async () => {
    let now = 0;
    const reader = backend(),
      c = new ReadCoordinator(reader, {}, () => now);
    await c.read(input, signal());
    now = 60000;
    await c.read(input, signal());
    expect(reader.read).toHaveBeenCalledTimes(2);
    const blockedInput = { ...input, url: input.url.replace('abc123', 'other') };
    reader.read.mockResolvedValue(snapshot('source_blocked'));
    expect((await c.read(blockedInput, signal())).retryAfterSeconds).toBe(15);
    now += 15000;
    await c.read(blockedInput, signal());
    expect(reader.read).toHaveBeenCalledTimes(4);
    await c.close();
  });
  it('bounds retained serialized bytes and evicts the least recently used entry', async () => {
    const reader = backend(),
      bytes = Buffer.byteLength(JSON.stringify(snapshot()));
    const c = new ReadCoordinator(reader, { maxBytes: bytes * 2, maxEntryBytes: bytes });
    const a = input,
      b = { ...input, url: input.url.replace('abc123', 'bbb123') },
      d = { ...input, url: input.url.replace('abc123', 'ccc123') };
    await c.read(a, signal());
    await c.read(b, signal());
    await c.read(a, signal());
    await c.read(d, signal());
    expect((await c.read(a, signal())).cache).toBe('hit');
    expect((await c.read(b, signal())).cache).toBe('miss');
    expect(reader.read).toHaveBeenCalledTimes(4);
    await c.close();
  });
  it('serves oversized snapshots without retaining them', async () => {
    const reader = backend(),
      c = new ReadCoordinator(reader, { maxEntryBytes: 10 });
    expect((await c.read(input, signal())).data.post).not.toBeNull();
    await c.read(input, signal());
    expect(reader.read).toHaveBeenCalledTimes(2);
    await c.close();
  });
  it('limits distinct in-flight jobs but permits a subscriber to an existing job', async () => {
    const reader = backend(),
      pending = deferred<Discussion>();
    reader.read.mockReturnValue(pending.promise);
    const c = new ReadCoordinator(reader, { maxFlights: 1 });
    const a = c.read(input, signal()),
      b = c.read(input, signal());
    await expect(
      c.read({ ...input, url: input.url.replace('abc123', 'other') }, signal()),
    ).rejects.toMatchObject({ code: 'busy', httpStatus: 429 });
    pending.resolve(snapshot());
    await Promise.all([a, b]);
    expect(reader.read).toHaveBeenCalledTimes(1);
    await c.close();
  });
  it('clears a failed flight instead of caching worker errors', async () => {
    const reader = backend();
    reader.read.mockRejectedValueOnce(new Error('crash'));
    const c = new ReadCoordinator(reader);
    await expect(c.read(input, signal())).rejects.toThrow('crash');
    expect((await c.read(input, signal())).cache).toBe('miss');
    expect(reader.read).toHaveBeenCalledTimes(2);
    await c.close();
  });
  it('rejects unsafe URLs and pre-cancelled callers before source work', async () => {
    const reader = backend(),
      c = new ReadCoordinator(reader),
      cancelled = new AbortController();
    cancelled.abort();
    await expect(c.read(input, cancelled.signal)).rejects.toMatchObject({ code: 'cancelled' });
    await expect(
      c.read({ ...input, url: 'https://127.0.0.1/private' }, signal()),
    ).rejects.toMatchObject({ code: 'invalid_url' });
    expect(reader.read).not.toHaveBeenCalled();
    await c.close();
    await expect(c.read(input, signal())).rejects.toMatchObject({ code: 'busy' });
  });
  it('bounds waiting subscribers even when they share one browser job', async () => {
    const reader = backend(),
      pending = deferred<Discussion>();
    reader.read.mockReturnValue(pending.promise);
    const c = new ReadCoordinator(reader, { maxSubscribers: 2 });
    const a = c.read(input, signal()),
      b = c.read(input, signal());
    await expect(c.read(input, signal())).rejects.toMatchObject({ code: 'busy' });
    pending.resolve(snapshot());
    await Promise.all([a, b]);
    expect(reader.read).toHaveBeenCalledTimes(1);
    expect((await c.read(input, signal())).cache).toBe('hit');
    await c.close();
  });
});
