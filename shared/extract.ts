import type { Discussion, Post, Comment, Media } from './schema.ts';
// Self-contained for page.evaluate() and the local userscript. No network/API reads.
export function extractDocument(): Discussion {
  const all = (selector: string, root: ParentNode = document): Element[] => {
    const found = [...root.querySelectorAll(selector)];
    for (const el of root.querySelectorAll('*'))
      if (el.shadowRoot) found.push(...all(selector, el.shadowRoot));
    return found;
  };
  const first = (root: ParentNode, selector: string) => root.querySelector(selector);
  const attr = (el: Element | null, ...keys: string[]) => {
    for (const key of keys) {
      const v = el?.getAttribute(key);
      if (v) return v;
    }
    return null;
  };
  const txt = (el: Element | null) => el?.textContent?.trim() ?? '';
  const author = (name: string | null) => ({
    name: name || '[deleted]',
    deleted: !name || name === '[deleted]',
  });
  const link = (value: string | null) => {
    try {
      const u = new URL(value || location.href, location.href);
      return ['https:', 'http:'].includes(u.protocol) ? u.href : location.href;
    } catch {
      return location.href;
    }
  };
  const body = (el: Element) => {
    const candidates = all(
      '[slot="text-body"], [slot="comment"], .usertext-body > .md, [data-testid="post-content"], [data-testid="comment"]',
      el,
    );
    const own = candidates.filter(
      (e) =>
        e.closest('shreddit-comment, .thing.comment') === el ||
        !e.closest('shreddit-comment, .thing.comment'),
    );
    if (!own.length) return [];
    const clone = own[0]!.cloneNode(true) as Element;
    for (const a of clone.querySelectorAll('a[href]'))
      a.setAttribute('href', link(a.getAttribute('href')));
    for (const spoiler of clone.querySelectorAll('span.md-spoiler-text,span.spoiler')) {
      const details = document.createElement('details'),
        summary = document.createElement('summary');
      summary.textContent = 'Spoiler';
      details.append(summary);
      while (spoiler.firstChild) details.append(spoiler.firstChild);
      spoiler.replaceWith(details);
    }
    return [{ type: 'html' as const, html: clone.innerHTML.slice(0, 150000) }];
  };
  const media = (el: Element): Media[] => {
    const found: Media[] = [];
    for (const img of all('img', el)) {
      if (img.closest('[slot="credit-bar"],[slot="authorName"],faceplate-hovercard')) continue;
      const src = attr(img, 'src');
      if (
        src &&
        /^https:\/\/(?:i\.redd\.it|preview\.redd\.it|external-preview\.redd\.it|(?:a|b)\.thumbs\.redditmedia\.com)\//.test(
          src,
        ) &&
        !/avatar|icon|award/i.test(src)
      )
        found.push({ kind: 'image', url: src, alt: attr(img, 'alt') || 'Post image' });
    }
    for (const video of all('video', el)) {
      const src = attr(video, 'src') || attr(first(video, 'source'), 'src');
      if (src?.startsWith('https://'))
        found.push({
          kind: 'video',
          url: src,
          poster: attr(video, 'poster') || undefined,
          alt: 'Post video',
        });
    }
    for (const embed of all('iframe[src],a[data-testid="outbound-link"],a.post-link', el)) {
      const src = attr(embed, 'src', 'href');
      if (src && /^https:\/\/(?:www\.)?(?:youtube\.com|youtu\.be|vimeo\.com)\//.test(src))
        found.push({ kind: 'embed', url: src, alt: attr(embed, 'title') || 'Embedded media' });
    }
    return found.slice(0, 20);
  };
  const postFrom = (el: Element): Post => ({
    id: attr(el, 'id', 'thingid', 'data-fullname') || 'post',
    title: attr(el, 'post-title') || txt(first(el, 'h1, [slot="title"], a.title, h2, h3')),
    author: author(attr(el, 'author') || txt(first(el, 'a.author, a[href^="/user/"]')) || null),
    subreddit:
      attr(el, 'subreddit-prefixed-name') ||
      (location.pathname.match(/^\/r\/([^/]+)/)?.[1] ? 'r/' + location.pathname.split('/')[2] : ''),
    timestamp: attr(el, 'created-timestamp') || attr(first(el, 'time'), 'datetime'),
    score:
      attr(el, 'score') || attr(first(el, '.score'), 'title') || txt(first(el, '.score')) || null,
    blocks: body(el),
    media: media(el),
    permalink: link(attr(el, 'permalink') || attr(first(el, 'a.comments'), 'href')),
    archived:
      el.hasAttribute('archived') ||
      (el.hasAttribute('is-archived') && attr(el, 'is-archived') !== 'false') ||
      !!first(el, '[icon-name="archived_fill"], .archived'),
    locked:
      el.hasAttribute('locked') ||
      (el.hasAttribute('is-locked') && attr(el, 'is-locked') !== 'false') ||
      !!first(el, '[icon-name="lock_fill"], .locked'),
    commentCount: attr(el, 'comment-count') || txt(first(el, 'a.comments')) || null,
  });
  const postEls = all('shreddit-post, .thing.link, [data-testid="post-container"]').slice(0, 50);
  const posts = postEls.map(postFrom).filter((p) => p.title);
  const isThread = /\/comments\//.test(location.pathname);
  const map = new Map<string, Comment>();
  for (const el of all('shreddit-comment, .thing.comment').slice(0, 1000)) {
    const id = attr(el, 'thingid', 'id', 'data-fullname');
    if (!id) continue;
    const ancestor = el.parentElement?.closest('shreddit-comment, .thing.comment');
    const parent =
      attr(el, 'parentid', 'parent-id') || attr(ancestor ?? null, 'thingid', 'id', 'data-fullname');
    const c: Comment = {
      id,
      parentId: parent,
      author: author(attr(el, 'author') || txt(first(el, ':scope > .entry .author')) || null),
      timestamp: attr(el, 'created', 'created-timestamp') || attr(first(el, 'time'), 'datetime'),
      score:
        attr(el, 'score') || attr(first(el, '.score'), 'title') || txt(first(el, '.score')) || null,
      blocks: body(el),
      permalink: link(attr(el, 'permalink') || attr(first(el, 'a.bylink'), 'href')),
      depth: Number(attr(el, 'depth') || 0),
      children: [],
    };
    if (c.blocks.length) map.set(id, c);
  }
  const comments: Comment[] = [];
  for (const c of map.values()) {
    const parent = c.parentId ? map.get(c.parentId) : undefined;
    // Reject cycles and malformed/deep source trees instead of recursive UI loops.
    let cursor = parent,
      cycle = false;
    const seen = new Set([c.id]);
    while (cursor) {
      if (seen.has(cursor.id) || seen.size > 80) {
        cycle = true;
        break;
      }
      seen.add(cursor.id);
      cursor = cursor.parentId ? map.get(cursor.parentId) : undefined;
    }
    if (parent && !cycle) {
      c.depth = seen.size - 1;
      parent.children.push(c);
    } else {
      c.depth = 0;
      comments.push(c);
    }
  }
  const text = document.body?.innerText || document.body?.textContent || '';
  const post = isThread ? (posts[0] ?? null) : null;
  const hasContent = !!post || (!isThread && posts.length > 0);
  const login =
    /you (?:must|need to) (?:be logged in|log in)|log in to (?:view|access|continue)|this (?:community|content) (?:is|requires).*(?:private|logged in)|you must be 18|confirm your age/i.test(
      text,
    );
  const blocked =
    /prove your humanity|complete the challenge|blocked by network security|whoa there|access denied|you(?:'|’)?ve been blocked|verify (?:that )?you(?:'|’)?re human|complete the captcha/i.test(
      text,
    ) || !!document.querySelector('iframe[src*="captcha"]');
  const rate = /too many requests|rate limit|try again (?:later|in a few minutes)/i.test(text);
  const promo = all(
    '[role="dialog"],shreddit-experience-tree,[data-testid*="xpromo"],xpromo-app-selector',
  ).some((e) => /open (?:in |the )?app|use (?:the )?app|download.*app/i.test(txt(e)));
  const continuations = all('a[href]')
    .filter((e) => /^continue (?:this )?thread/i.test(txt(e)))
    .slice(0, 30)
    .map((e) => ({
      url: link(attr(e, 'href')),
      label: txt(e),
      parentId: attr(
        e.closest('shreddit-comment,.thing.comment'),
        'thingid',
        'id',
        'data-fullname',
      ),
    }));
  const remaining = all('button,a,summary').filter((e) =>
    /^(?:load|show|view) (?:\d+ )?(?:more|replies|comments)|^continue (?:this )?thread|^\d+ more repl/i.test(
      (e.getAttribute('aria-label') || txt(e)).trim(),
    ),
  ).length;
  const status = hasContent
    ? promo
      ? 'promotional_overlay'
      : remaining || (isThread && map.size === 0)
        ? 'partial'
        : 'public'
    : rate
      ? 'rate_limited'
      : blocked
        ? 'source_blocked'
        : login
          ? 'login_required'
          : promo
            ? 'promotional_overlay'
            : 'render_failure';
  const messages = {
    public:
      'Publicly rendered content retrieved. This is a snapshot, not a guarantee that every comment was loaded.',
    partial:
      'Some public content was retrieved. More comments may remain unavailable or outside the reading budget.',
    promotional_overlay: hasContent
      ? 'An app promotion remains visible on Reddit. Content already loaded underneath was retrieved.'
      : 'An app promotion is visible, but no discussion content could be extracted.',
    render_failure:
      'The browser did not find a supported rendered discussion. The page may have changed or failed to load.',
    network_failure: 'The source could not be reached.',
    rate_limited: 'Reddit temporarily limited this browser. Try again later.',
    login_required:
      'Reddit explicitly requires authentication for this content. Threadglass stops here.',
    source_blocked:
      'Reddit blocked this browser or presented a verification challenge. Threadglass stops here.',
  };
  return {
    schemaVersion: 1,
    adapterVersion: 'reddit-dom-v1',
    url: location.href,
    fetchedAt: new Date().toISOString(),
    status,
    message: messages[status],
    post,
    comments,
    listing: isThread ? [] : posts,
    evidence: {
      renderedComments: map.size,
      expansionAttempts: 0,
      remainingControls: remaining,
      httpStatus: null,
      viewport: 'desktop',
      elapsedMs: 0,
    },
    warnings:
      isThread && map.size === 0 && post
        ? ['No comment bodies were available in the rendered page.']
        : [],
    continuations,
  };
}
