import { BrowserService } from '../server/browser.ts';
import { mkdir, writeFile } from 'node:fs/promises';
const service = new BrowserService();
try {
  const result = await service.read(
    {
      url:
        process.argv[2] ||
        'https://www.reddit.com/r/explainlikeimfive/comments/208ft5/eli5why_is_earths_core_molten_what_keeps_it_warm/',
      viewport: 'desktop',
    },
    new AbortController().signal,
  );
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/poc.json', JSON.stringify(result, null, 2));
  console.log(
    JSON.stringify(
      {
        status: result.status,
        title: result.post?.title,
        body: result.post?.blocks,
        comments: result.evidence.renderedComments,
        message: result.message,
        evidence: result.evidence,
      },
      null,
      2,
    ),
  );
} finally {
  await service.close();
}
