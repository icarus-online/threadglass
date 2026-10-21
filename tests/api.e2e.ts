import { test, expect } from '@playwright/test';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/index.ts';
import type { Discussion } from '../shared/schema.ts';
const url = 'https://www.reddit.com/r/testing/comments/abc123/title/';
function blocked(): Discussion {
  return {
    schemaVersion: 1,
    adapterVersion: 'test',
    url,
    fetchedAt: '2026-10-21T00:00:00Z',
    status: 'source_blocked',
    message: 'Synthetic source block',
    post: null,
    comments: [],
    listing: [],
    warnings: [],
    continuations: [],
    evidence: {
      renderedComments: 0,
      remainingControls: 0,
      expansionAttempts: 0,
      httpStatus: 403,
      viewport: 'desktop',
      elapsedMs: 1,
    },
  };
}

test('API reports cooldown and shared cache metadata without another browser read', async ({
  request,
}) => {
  let reads = 0;
  const { app, close } = createApp({
    read: async () => {
      reads++;
      return blocked();
    },
    close: async () => {},
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const first = await request.post(base + '/api/read', { data: { url, viewport: 'desktop' } });
    expect(first.status()).toBe(200);
    expect(first.headers()['x-threadglass-cache']).toBe('miss');
    expect(first.headers()['retry-after']).toBe('15');
    expect(first.headers()['cache-control']).toBe('no-store');
    const second = await request.post(base + '/api/read', {
      data: { url: url + '?utm_source=tracking', viewport: 'desktop' },
    });
    expect(second.headers()['x-threadglass-cache']).toBe('hit');
    expect((await second.json()).fetchedAt).toBe('2026-10-21T00:00:00Z');
    expect(reads).toBe(1);
    const foreign = await request.post(base + '/api/read', {
      data: { url, viewport: 'desktop' },
      headers: { Origin: 'https://unrelated.example' },
    });
    expect(foreign.status()).toBe(403);
    expect(reads).toBe(1);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await close();
  }
});
