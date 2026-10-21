/** Private replay of actual extraction output for UI inspection; never live evidence. */
import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
const file = process.argv[2];
if (!file || !file.startsWith('artifacts/'))
  throw new Error('Provide an ignored artifacts/ extraction JSON file.');
const data = JSON.parse(await readFile(file, 'utf8'));
const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
try {
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.route('**/api/read', (r) => r.fulfill({ json: data }));
  await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:3001');
  await page.getByLabel('Reddit thread or subreddit URL').fill(data.url);
  await page.getByRole('button', { name: 'Read thread', exact: true }).click();
  await page.getByRole('heading', { name: data.post.title, exact: true }).waitFor();
  await mkdir('artifacts/preview', { recursive: true });
  await page.screenshot({ path: 'artifacts/preview/real-snapshot-android.png', fullPage: false });
  console.log(
    JSON.stringify({
      mode: 'replay of captured live output',
      title: data.post.title,
      comments: data.evidence.renderedComments,
      viewport: { width: 412, height: 915 },
    }),
  );
} finally {
  await browser.close();
}
