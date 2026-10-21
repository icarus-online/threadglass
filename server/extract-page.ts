import type { Page } from 'playwright';
import type { Discussion } from '../shared/schema.ts';
import { extractDocument } from '../shared/extract.ts';
// tsx's keepNames transformation annotates nested functions with __name.
// Give serialized, repository-owned code that harmless helper in its lexical
// scope. No page input or user input is ever interpolated into this expression.
const expression = `(() => { const __name = (fn) => fn; return (${extractDocument.toString()})(); })()`;
export function extractPage(page: Page): Promise<Discussion> {
  return page.evaluate<Discussion>(expression);
}
