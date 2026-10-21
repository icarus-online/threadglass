import { BrowserService } from '../server/browser.ts';
import { mkdir, writeFile } from 'node:fs/promises';
import type { Discussion, Comment } from '../shared/schema.ts';
const eli5 =
  'https://www.reddit.com/r/explainlikeimfive/comments/208ft5/eli5why_is_earths_core_molten_what_keeps_it_warm/';
const large =
  'https://www.reddit.com/r/AskReddit/comments/82y1qj/what_is_extremely_common_but_people_think_its/';
const cases = [
  {
    name: 'archived-eli5',
    url: eli5,
    viewport: 'desktop',
    check: (d: Discussion) =>
      !!d.post?.archived && d.post.blocks.length > 0 && d.evidence.renderedComments > 0,
  },
  {
    name: 'large-thread',
    url: large,
    viewport: 'desktop',
    check: (d: Discussion) => !!d.post && d.evidence.renderedComments >= 20,
  },
  {
    name: 'image-post',
    url: 'https://www.reddit.com/r/pics/comments/1u58ant/photo_of_my_friends_cousins_door/',
    viewport: 'desktop',
    check: (d: Discussion) => !!d.post?.media.some((m) => m.kind === 'image'),
  },
  {
    name: 'video-post',
    url: 'https://www.reddit.com/r/animation/comments/1u1wxe7/developing_the_animated_crowns/',
    viewport: 'desktop',
    check: (d: Discussion) => !!d.post?.media.some((m) => m.kind === 'video'),
  },
  {
    name: 'deleted-author-candidate',
    url: 'https://www.reddit.com/r/explainlikeimfive/comments/4quywi/eli5_why_are_pdfs_so_hard_to_edit/',
    viewport: 'desktop',
    check: (d: Discussion) => !!d.post?.author.deleted,
  },
  {
    name: 'deeply-nested',
    url: large,
    viewport: 'desktop',
    check: (d: Discussion) => flatten(d.comments).some((c) => c.depth >= 3),
  },
  {
    name: 'app-promotion-candidate',
    url: eli5,
    viewport: 'mobile',
    check: (d: Discussion) =>
      d.status === 'promotional_overlay' || d.evidence.expansionAttempts > 0,
  },
  {
    name: 'genuine-login-candidate',
    url: 'https://www.reddit.com/r/lounge/',
    viewport: 'desktop',
    check: (d: Discussion) => d.status === 'login_required',
  },
  {
    name: 'subreddit-listing',
    url: 'https://www.reddit.com/r/explainlikeimfive/',
    viewport: 'desktop',
    check: (d: Discussion) => d.listing.length > 0,
  },
  {
    name: 'android-viewport',
    url: eli5,
    viewport: 'mobile',
    check: (d: Discussion) => !!d.post && d.evidence.renderedComments > 0,
  },
] as const;
function flatten(cs: Comment[]): Comment[] {
  return cs.flatMap((c) => [c, ...flatten(c.children)]);
}
const service = new BrowserService(1, 35000);
await mkdir('artifacts/live', { recursive: true });
const rows: Record<string, unknown>[] = [];
try {
  for (const c of cases) {
    try {
      const d = await service.read(
        { url: c.url, viewport: c.viewport },
        new AbortController().signal,
      );
      await writeFile(`artifacts/live/${c.name}.json`, JSON.stringify(d, null, 2));
      const row = {
        case: c.name,
        url: c.url,
        viewport: c.viewport,
        status: d.status,
        httpStatus: d.evidence.httpStatus,
        titleRetrieved: !!d.post?.title,
        bodyRetrieved: !!d.post?.blocks.length,
        comments: d.evidence.renderedComments,
        scenarioVerified: c.check(d),
        diagnosticsId: d.evidence.diagnosticsId,
      };
      rows.push(row);
      console.log(JSON.stringify(row));
    } catch (error) {
      const row = {
        case: c.name,
        url: c.url,
        status: 'worker_error',
        scenarioVerified: false,
        errorCode: typeof error === 'object' && error && 'code' in error ? error.code : 'unknown',
      };
      rows.push(row);
      console.log(JSON.stringify(row));
    }
  }
} finally {
  await service.close();
}
const report = {
  observedAt: new Date().toISOString(),
  browser:
    'Standard Playwright Chromium, sandbox enabled, fresh signed-out contexts, no stealth/proxy rotation/CAPTCHA solving',
  rows,
};
await writeFile('artifacts/live/report.json', JSON.stringify(report, null, 2));
const header =
  '| Case | Outcome | HTTP | Post title | Post body | Comments | Scenario verified |\n|---|---|---|---|---|---|---|';
await writeFile(
  'artifacts/live/report.md',
  `# Live compatibility run\n\nObserved ${report.observedAt}. ${report.browser}.\n\n${header}\n` +
    rows
      .map(
        (r) =>
          `| ${r.case} | ${r.status} | ${r.httpStatus ?? '—'} | ${r.titleRetrieved ?? false} | ${r.bodyRetrieved ?? false} | ${r.comments ?? 0} | ${r.scenarioVerified} |`,
      )
      .join('\n') +
    '\n\nAn honest blocked result verifies failure reporting, not successful retrieval. Candidate scenarios require their expected DOM evidence before they count as covered. Search snippets are never used as extraction evidence. Raw screenshots, DOM and normalized output stay in ignored artifacts/.\n',
);
if (rows.some((r) => !r.scenarioVerified)) process.exitCode = 2;
