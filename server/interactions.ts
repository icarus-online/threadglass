import type { Page } from 'playwright';
export const interactionRules = {
  dismiss:
    /^(?:close|dismiss|not now|maybe later|continue in browser|use browser|continue on web|no thanks|stay in browser)$/i,
  expand:
    /^(?:(?:load|show|view) (?:\d+ )?(?:more comments|more replies|replies|comments|more)|more (?:comments|replies)|\d+ more repl(?:y|ies)|expand comment|expand thread)$/i,
};
export async function interact(page: Page, budget: number, signal: AbortSignal) {
  let attempts = 0;
  const deadline = Date.now() + budget;
  // Only dismiss controls inside a structurally identified app-promotion dialog.
  const dialogs = page.locator(
    '[role="dialog"],shreddit-experience-tree,[data-testid*="xpromo"],xpromo-app-selector',
  );
  for (const dialog of await dialogs.all()) {
    if (signal.aborted || Date.now() > deadline) break;
    if (
      !/open (?:in |the )?app|use (?:the )?app|download.*app/i.test(
        await dialog.innerText().catch(() => ''),
      )
    )
      continue;
    const close = dialog
      .getByRole('button', { name: interactionRules.dismiss })
      .or(dialog.getByRole('link', { name: interactionRules.dismiss }))
      .first();
    if (await close.isVisible().catch(() => false)) {
      await close.click({ timeout: 1000 }).catch(() => {});
      attempts++;
    }
  }
  const clicked = new Set<string>();
  for (let round = 0; round < 6 && Date.now() < deadline && !signal.aborted; round++) {
    const before = await page.locator('shreddit-comment,.thing.comment').count();
    const controls = page
      .getByRole('button', { name: interactionRules.expand })
      .or(page.getByRole('link', { name: interactionRules.expand }))
      .or(page.locator('.commentarea a.morecomments, .comment .expand'));
    for (const el of (await controls.all()).slice(0, 15)) {
      if (Date.now() > deadline || signal.aborted || attempts >= 24) break;
      const label = (await el.getAttribute('aria-label')) || (await el.innerText().catch(() => ''));
      if (/^(?:log in|sign in|join|vote|reply|report|share)(?:\s|$)/i.test(label.trim())) continue;
      const key = await el
        .evaluate((e) =>
          [e.closest('shreddit-comment,.thing')?.id, e.getAttribute('id'), e.textContent].join(':'),
        )
        .catch(() => '');
      if (clicked.has(key) || !(await el.isVisible().catch(() => false))) continue;
      clicked.add(key);
      await el.click({ timeout: 1200 }).catch(() => {});
      attempts++;
    }
    await page
      .evaluate(() => window.scrollBy({ top: innerHeight * 0.85, behavior: 'instant' }))
      .catch(() => {});
    const changed = await page
      .waitForFunction(
        (n) => document.querySelectorAll('shreddit-comment,.thing.comment').length > n,
        before,
        { timeout: Math.max(1, Math.min(1500, deadline - Date.now())) },
      )
      .then(() => true)
      .catch(() => false);
    if (!changed) break;
  }
  return attempts;
}
