import { it, expect } from 'vitest';
import { cleanDiscussion } from '../server/normalize.ts';
import type { Discussion } from '../shared/schema.ts';
it('removes untrusted media and continuations and sanitizes partial snapshots', () => {
  const url = 'https://www.reddit.com/r/pics/comments/abc123/title/';
  const d: Discussion = {
    schemaVersion: 1,
    adapterVersion: 'test',
    url,
    fetchedAt: '2026-10-21',
    status: 'partial',
    message: 'partial',
    post: {
      id: 'abc123',
      title: 'title',
      author: { name: 'author', deleted: false },
      subreddit: 'r/pics',
      timestamp: null,
      score: null,
      blocks: [{ type: 'html', html: '<p onclick="x()">hello</p><script>steal()</script>' }],
      media: [
        { kind: 'image', url: 'https://localhost/private', alt: '' },
        {
          kind: 'image',
          url: 'https://i.redd.it/public.png',
          poster: 'http://127.0.0.1',
          alt: 'public image',
        },
        { kind: 'embed', url: 'https://www.youtube.com/watch?v=example', alt: 'video' },
      ],
      permalink: 'javascript:alert(1)',
      archived: false,
      locked: false,
      commentCount: null,
    },
    comments: [],
    listing: [],
    continuations: [
      { url: 'https://127.0.0.1/private', label: 'bad', parentId: null },
      { url: url + 'def456/', label: 'Continue thread', parentId: null },
    ],
    evidence: {
      renderedComments: 0,
      remainingControls: 1,
      expansionAttempts: 0,
      httpStatus: 200,
      viewport: 'desktop',
      elapsedMs: 1,
    },
    warnings: [],
  };
  cleanDiscussion(d);
  expect(d.post!.blocks[0]!.html).toBe('<p>hello</p>');
  expect(d.post!.media).toHaveLength(2);
  expect(d.post!.media[0]!.poster).toBeUndefined();
  expect(d.post!.permalink).toBe(url);
  expect(d.continuations).toHaveLength(1);
});
