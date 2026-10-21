import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { extractDocument } from '../shared/extract.ts';
import { extractPage } from '../server/extract-page.ts';
import { interact } from '../server/interactions.ts';
const fixture = await readFile('tests/fixtures/thread.html', 'utf8');
async function extracted(page: import('@playwright/test').Page) {
  await page.goto('/r/explainlikeimfive/comments/fixture/room/');
  await page.setContent(fixture);
  return extractPage(page);
}
test('extracts real rendered DOM, preserves nesting and identifies promotion without inventing login', async ({
  page,
}) => {
  const d = await extracted(page);
  expect(d.status).toBe('promotional_overlay');
  expect(d.post?.title).toContain('conversation');
  expect(d.comments).toHaveLength(1);
  expect(d.comments[0]?.children[0]?.author.deleted).toBe(true);
  expect(d.comments[0]?.children[0]?.children[0]?.depth).toBe(2);
  expect(d.evidence.renderedComments).toBe(3);
  expect(d.post?.archived).toBe(true);
  expect(d.post?.locked).toBe(true);
  await page
    .getByRole('button', { name: 'Continue in browser' })
    .evaluate((el) => el.addEventListener('click', () => el.parentElement?.remove()));
  await interact(page, 2500, new AbortController().signal);
  expect(await page.getByRole('dialog').count()).toBe(0);
});
test('distinguishes explicit login, blocking, rate limits and empty page', async ({ page }) => {
  for (const [text, status] of [
    ['Log in to view this community', 'login_required'],
    ['You’ve been blocked by network security', 'source_blocked'],
    ['Prove your humanity. Complete the challenge below.', 'source_blocked'],
    ['Too many requests', 'rate_limited'],
    ['Nothing useful here', 'render_failure'],
  ]) {
    await page.setContent('<body>' + text + '</body>');
    expect((await page.evaluate(extractDocument)).status).toBe(status);
  }
});
test('reader renders extracted data, collapse, search, bookmarks and dark mode', async ({
  page,
}) => {
  const data = await extracted(page);
  await page.goto('/');
  await page.route('**/api/read', (r) => r.fulfill({ json: data }));
  await page
    .getByLabel('Reddit thread or subreddit URL')
    .fill('https://www.reddit.com/r/explainlikeimfive/comments/fixture/room/');
  await page.getByRole('button', { name: 'Read thread', exact: true }).click();
  await expect(page.getByRole('heading', { name: data.post!.title })).toBeVisible();
  await expect(
    page.getByText('And a third level, so the conversation stays intact.'),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Collapse comment by thoughtful_person', exact: true })
    .click();
  await expect(
    page.getByText('And a third level, so the conversation stays intact.'),
  ).not.toBeVisible();
  await page
    .getByRole('button', { name: 'Expand comment by thoughtful_person', exact: true })
    .click();
  await page.getByRole('button', { name: 'Save discussion', exact: true }).click();
  await page.getByRole('button', { name: 'Bookmarks', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your reading list' })).toBeVisible();
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await expect(page.locator('.app')).toHaveAttribute('data-theme', 'dark');
  await page.getByLabel('Find in loaded comments').fill('no-such-content');
  await expect(page.getByText('No loaded comments match your search.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/ui-${test.info().project.name}.png`, fullPage: true });
});
test('home supports mobile without overflow', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Room for the conversation.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/home-${test.info().project.name}.png`, fullPage: true });
});
test('local userscript uses loaded content and restores page on exit', async ({ page }) => {
  await page.goto('/r/explainlikeimfive/comments/fixture/room/');
  await page.setContent(fixture);
  let requests = 0;
  page.on('request', () => requests++);
  await page.evaluate(await readFile('dist/threadglass.user.js', 'utf8'));
  await page.getByRole('button', { name: 'Read with Threadglass' }).click();
  await expect(
    page
      .locator('#threadglass-local')
      .getByRole('heading', { name: 'Why does a conversation need room to breathe?' }),
  ).toBeVisible();
  expect(requests).toBe(0);
  await page
    .locator('#threadglass-local')
    .getByRole('button', { name: 'Return to Reddit' })
    .click();
  await expect(page.locator('#threadglass-local')).toHaveCount(0);
});
test('server rejects unsafe URLs without browsing', async ({ request }) => {
  const r = await request.post('/api/read', {
    data: { url: 'http://127.0.0.1/admin', viewport: 'desktop' },
  });
  expect(r.status()).toBe(400);
  expect((await r.json()).error.code).toBe('invalid_url');
});

test('modern archived attributes, title-only bodies, and credit-bar images stay accurate', async ({
  page,
}) => {
  await page.goto('/r/testing/comments/modern/title/');
  await page.setContent(await readFile('tests/fixtures/modern.html', 'utf8'));
  const d = await extractPage(page);
  expect(d.post?.archived).toBe(true);
  expect(d.post?.locked).toBe(true);
  expect(d.post?.blocks).toHaveLength(0);
  expect(d.post?.media).toHaveLength(0);
  expect(d.comments[0]?.blocks[0]?.html).toContain('<details>');
  expect(d.comments[0]?.blocks[0]?.html).toContain('http://127.0.0.1:3001/r/testing/');
});

test('targets a more-replies disclosure without clicking composition controls', async ({
  page,
}) => {
  await extracted(page);
  await page.evaluate(() => {
    document.querySelector('[role="dialog"]')?.remove();
    const more = document.createElement('button');
    more.textContent = 'More replies';
    more.addEventListener('click', () => {
      const comment = document.createElement('shreddit-comment');
      comment.setAttribute('thingid', 't1_loaded');
      comment.setAttribute('author', 'new_reader');
      comment.innerHTML = '<div slot="comment"><p>Loaded by the ordinary disclosure.</p></div>';
      document.body.append(comment);
      more.remove();
    });
    document.body.append(more);
    const reply = document.createElement('button');
    reply.textContent = 'Reply';
    reply.addEventListener('click', () =>
      document.body.setAttribute('data-composition-opened', 'true'),
    );
    document.body.append(reply);
  });
  expect(await interact(page, 3000, new AbortController().signal)).toBe(1);
  expect((await extractPage(page)).evidence.renderedComments).toBe(4);
  expect(await page.locator('body').getAttribute('data-composition-opened')).toBeNull();
});

test('blocked reads offer local cleanup, honor cooldown and can retry manually', async ({
  page,
}) => {
  const data = await extracted(page);
  Object.assign(data, {
    status: 'source_blocked',
    message: 'Reddit blocked this browser.',
    post: null,
    comments: [],
  });
  data.evidence.renderedComments = 0;
  await page.goto('/');
  await page.clock.install();
  let reads = 0;
  await page.route('**/api/read', (route) => {
    reads++;
    return route.fulfill({ json: data, headers: { 'Retry-After': '15' } });
  });
  await page.getByLabel('Reddit thread or subreddit URL').fill(data.url);
  await page.getByRole('button', { name: 'Read thread', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Reddit blocked this browser' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Get the local reader', exact: true }),
  ).toHaveAttribute('href', '/threadglass.user.js');
  const retry = page.getByRole('button', { name: 'Try reading again' });
  await expect(retry).toBeDisabled();
  expect(reads).toBe(1);
  await page.clock.fastForward(16000);
  await expect(retry).toBeEnabled();
  expect(reads).toBe(1);
  await retry.click();
  await expect(retry).toBeDisabled();
  expect(reads).toBe(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: `artifacts/blocked-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test('explicit login requirement does not offer cleanup or automatic retries', async ({ page }) => {
  const data = await extracted(page);
  Object.assign(data, {
    status: 'login_required',
    message: 'Reddit requires authentication.',
    post: null,
    comments: [],
  });
  data.evidence.renderedComments = 0;
  await page.goto('/');
  await page.route('**/api/read', (route) => route.fulfill({ json: data }));
  await page.getByLabel('Reddit thread or subreddit URL').fill(data.url);
  await page.getByRole('button', { name: 'Read thread', exact: true }).click();
  const notice = page.getByRole('region', { name: 'Reading availability' });
  await expect(notice.getByRole('heading', { name: 'Reddit requires access' })).toBeVisible();
  await expect(notice.getByRole('link', { name: 'Open original on Reddit' })).toBeVisible();
  await expect(notice.getByRole('link', { name: 'Get the local reader' })).toHaveCount(0);
  await expect(notice.getByRole('button')).toHaveCount(0);
});
