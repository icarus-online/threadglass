import { useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { AvailabilityNotice } from './Availability.tsx';
import { validateRedditUrl } from '../shared/urls.ts';
import type { Discussion, Post, Comment, ContentBlock, Media } from '../shared/schema.ts';
type IconName =
  'sun' | 'moon' | 'bookmark' | 'arrow' | 'link' | 'close' | 'check' | 'chevron' | 'external';
function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, string> = {
    sun: 'M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
    moon: 'M20.5 13.5A9 9 0 0 1 10.5 3 9 9 0 1 0 20.5 13.5',
    bookmark: 'M6 3h12v18l-6-4-6 4z',
    arrow: 'M4 12h16m-6-6 6 6-6 6',
    link: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2',
    close: 'm6 6 12 12M6 18 18 6',
    check: 'm5 12 4 4L19 6',
    chevron: 'm8 5 7 7-7 7',
    external: 'M14 3h7v7m0-7L10 14M10 3H3v18h18v-7',
  };
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
function storage<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem('threadglass:' + key) || 'null') ?? fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem('threadglass:' + key, JSON.stringify(value));
  } catch {
    /* Browsing remains available when storage is restricted. */
  }
}
function date(value: string | null) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.valueOf())
    ? value
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function RichText({ blocks }: { blocks: ContentBlock[] }) {
  return (
    <div className="prose">
      {blocks.map((b, i) => (
        <div
          key={i}
          dangerouslySetInnerHTML={{
            __html: DOMPurify.sanitize(b.html, {
              ADD_ATTR: ['target'],
              FORBID_TAGS: ['img', 'iframe', 'video', 'audio', 'style', 'form'],
              FORBID_ATTR: ['style', 'id', 'name'],
            }),
          }}
        />
      ))}
    </div>
  );
}
function MediaView({ items }: { items: Media[] }) {
  const [zoom, setZoom] = useState<Media | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (zoom) dialog.current?.showModal();
  }, [zoom]);
  return (
    <>
      {items.map((m, i) => (
        <div className="attachment" key={i}>
          {m.kind === 'embed' ? (
            <a className="embed-link" href={m.url} target="_blank" rel="noopener noreferrer">
              {m.alt} <Icon name="external" />
            </a>
          ) : m.kind === 'image' ? (
            <button
              className="image-button"
              onClick={() => setZoom(m)}
              aria-label={'Enlarge ' + m.alt}
            >
              <img loading="lazy" referrerPolicy="no-referrer" src={m.url} alt={m.alt} />
            </button>
          ) : (
            <video controls preload="metadata" src={m.url} poster={m.poster} aria-label={m.alt} />
          )}
        </div>
      ))}
      <dialog
        ref={dialog}
        className="media-dialog"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            dialog.current?.close();
            setZoom(null);
          }
        }}
        onCancel={() => setZoom(null)}
      >
        <button
          className="icon close-dialog"
          aria-label="Close image"
          onClick={() => {
            dialog.current?.close();
            setZoom(null);
          }}
        >
          <Icon name="close" />
        </button>
        {zoom && <img src={zoom.url} alt={zoom.alt} />}
      </dialog>
    </>
  );
}
function CommentNode({ comment: c }: { comment: Comment }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <article className={'comment ' + (collapsed ? 'is-collapsed' : '')} id={'comment-' + c.id}>
      <div className="comment-head">
        <button
          className="collapse"
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? 'Expand' : 'Collapse'} comment by ${c.author.name}`}
          onClick={() => setCollapsed(!collapsed)}
        >
          <Icon name="chevron" />
        </button>
        <span className="avatar" aria-hidden="true">
          {c.author.deleted ? '·' : c.author.name[0]?.toUpperCase()}
        </span>
        <span className="comment-author">{c.author.name}</span>
        <time>{date(c.timestamp)}</time>
        <span className="comment-score">{c.score ? `${c.score} points` : ''}</span>
      </div>
      {!collapsed ? (
        <div className="comment-content">
          <RichText blocks={c.blocks} />
          <a className="source-link" href={c.permalink} target="_blank" rel="noopener noreferrer">
            Permalink <Icon name="external" />
          </a>
          {c.children.length > 0 && (
            <div className="children">
              {c.children.map((child) => (
                <CommentNode key={child.id} comment={child} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <button className="collapsed-note" onClick={() => setCollapsed(false)}>
          Comment collapsed · {c.children.length} direct replies
        </button>
      )}
    </article>
  );
}
function PostCard({ post: p, onRead }: { post: Post; onRead: (url: string) => void }) {
  return (
    <button className="post-card" onClick={() => onRead(p.permalink)}>
      <span className="eyebrow">{p.subreddit}</span>
      <h3>{p.title}</h3>
      <span className="muted">
        {p.author.name} {p.commentCount ? ` · ${p.commentCount} comments` : ''}
      </span>
      <Icon name="arrow" />
    </button>
  );
}
export function App({
  initial,
  localMode = false,
  onExit,
}: {
  initial?: Discussion;
  localMode?: boolean;
  onExit?: () => void;
}) {
  const [data, setData] = useState<Discussion | null>(initial || null),
    [url, setUrl] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [retryAt, setRetryAt] = useState(0);
  const [theme, setTheme] = useState(() => storage('theme', 'light')),
    [bookmarks, setBookmarks] = useState<{ url: string; title: string }[]>(() =>
      storage('bookmarks', []),
    ),
    [showBookmarks, setShowBookmarks] = useState(false),
    [mobile, setMobile] = useState(false);
  const [query, setQuery] = useState('');
  const controller = useRef<AbortController | null>(null);
  const resultRef = useRef<HTMLElement>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    save('theme', theme);
  }, [theme]);
  useEffect(() => {
    save('bookmarks', bookmarks);
  }, [bookmarks]);
  const read = async (value: string) => {
    if (localMode) {
      try {
        window.location.assign(validateRedditUrl(value).href);
      } catch {
        setError('This saved link is not a supported Reddit URL.');
      }
      return;
    }
    controller.current?.abort();
    const ac = new AbortController();
    controller.current = ac;
    setError('');
    setRetryAt(0);
    setBusy(true);
    setUrl(value);
    try {
      const response = await fetch('/api/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: value, viewport: mobile ? 'mobile' : 'desktop' }),
        signal: ac.signal,
      });
      const json = await response.json();
      if (!response.ok)
        throw new Error(json.error?.message || 'The reader could not complete this request.');
      if (ac.signal.aborted || controller.current !== ac) return;
      const retry = Number(response.headers.get('Retry-After'));
      setRetryAt(
        Number.isFinite(retry) && retry > 0 ? Date.now() + Math.min(retry, 3600) * 1000 : 0,
      );
      setData(json);
      setQuery('');
      requestAnimationFrame(() => resultRef.current?.focus());
    } catch (e) {
      if (!ac.signal.aborted)
        setError(e instanceof Error ? e.message : 'The reader could not connect.');
    } finally {
      if (controller.current === ac) setBusy(false);
    }
  };
  const bookmarked = !!data && bookmarks.some((b) => b.url === data.url);
  const toggleBookmark = () => {
    if (!data) return;
    setBookmarks(
      bookmarked
        ? bookmarks.filter((b) => b.url !== data.url)
        : [...bookmarks, { url: data.url, title: data.post?.title || data.url }].slice(-100),
    );
  };
  const count = data?.evidence.renderedComments || 0;
  const matching = (c: Comment): boolean =>
    [c.author.name, ...c.blocks.map((b) => b.html)]
      .join(' ')
      .toLowerCase()
      .includes(query.toLowerCase()) || c.children.some(matching);
  return (
    <div className="app" data-theme={theme}>
      <a className="skip" href="#reader-content">
        Skip to content
      </a>
      <header className="topbar">
        <a
          className="brand"
          href={localMode ? '#' : '/'}
          onClick={localMode ? (e) => e.preventDefault() : undefined}
          aria-label="Threadglass home"
        >
          <span className="brand-mark">
            <i />
            <i />
            <i />
          </span>
          threadglass<span className="beta">ALPHA</span>
        </a>
        <nav aria-label="Main navigation">
          <a
            className="github-link"
            href="https://github.com/icarus-online/threadglass"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open source <Icon name="external" />
          </a>
          <button
            className={'icon ' + (showBookmarks ? 'selected' : '')}
            aria-label="Bookmarks"
            onClick={() => setShowBookmarks(!showBookmarks)}
          >
            <Icon name="bookmark" />
            {bookmarks.length > 0 && <span className="dot" />}
          </button>
          <button
            className="icon"
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          >
            <Icon name={theme === 'light' ? 'moon' : 'sun'} />
          </button>
          {localMode && (
            <button className="icon" aria-label="Return to Reddit" onClick={onExit}>
              <Icon name="close" />
            </button>
          )}
        </nav>
      </header>
      <main id="reader-content">
        {!localMode && (
          <section className={'intro ' + (data ? 'compact' : '')}>
            <div className="intro-copy">
              <span className="eyebrow">
                <span className="status-dot" /> A LITTLE LESS NOISE. A LOT MORE CONTEXT.
              </span>
              <h1>
                Room for the
                <br /> <em>conversation.</em>
              </h1>
              <p>
                The thread you came for, with space to read it.
                <br className="desktop-break" /> Public Reddit discussions, through a quieter lens.
              </p>
            </div>
            <div className="input-section">
              <form
                className="url-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (url.trim()) void read(url.trim());
                }}
              >
                <label htmlFor="reddit-url" className="sr-only">
                  Reddit thread or subreddit URL
                </label>
                <span className="input-icon">
                  <Icon name="link" />
                </span>
                <input
                  id="reddit-url"
                  type="url"
                  required
                  placeholder="Paste a Reddit link…"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={busy}
                />
                <button className="read-button" type="submit" disabled={busy}>
                  {busy ? 'Opening…' : 'Read thread'}
                  {!busy && <Icon name="arrow" />}
                </button>
              </form>
              <div className="input-caption">
                <span>
                  <Icon name="check" /> No account needed
                </span>
                <span>
                  <Icon name="check" /> Real browser, public content
                </span>
              </div>
              <label className="mobile-option">
                <input
                  type="checkbox"
                  checked={mobile}
                  onChange={(e) => setMobile(e.target.checked)}
                />{' '}
                Use a mobile source viewport
              </label>
            </div>
          </section>
        )}
        {busy && (
          <div className="loading" role="status">
            <span className="spinner" />
            <div>
              <strong>Making room for your thread</strong>
              <p>A real Chromium browser is opening Reddit and reading the public page.</p>
            </div>
            <button
              onClick={() => {
                controller.current?.abort();
                setBusy(false);
              }}
              className="text-button"
            >
              Cancel
            </button>
          </div>
        )}
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
        {showBookmarks && (
          <section className="bookmarks">
            <div className="section-top">
              <h2>Your reading list</h2>
              <span>Saved on this device</span>
            </div>
            {bookmarks.length ? (
              bookmarks.map((b) => (
                <div className="bookmark-row" key={b.url}>
                  <button
                    onClick={() => {
                      setShowBookmarks(false);
                      void read(b.url);
                    }}
                  >
                    {b.title}
                  </button>
                  <button
                    className="icon"
                    aria-label={'Remove bookmark ' + b.title}
                    onClick={() => setBookmarks(bookmarks.filter((x) => x.url !== b.url))}
                  >
                    <Icon name="close" />
                  </button>
                </div>
              ))
            ) : (
              <p className="muted">
                Save a discussion with the bookmark button. It will be waiting here.
              </p>
            )}
          </section>
        )}
        {data && (
          <section
            className="reading-layout"
            ref={resultRef}
            tabIndex={-1}
            aria-label="Retrieved discussion"
          >
            <aside className="reader-aside">
              <span className="eyebrow">READING ROOM</span>
              <p>{data.post?.subreddit || 'Public discussion'}</p>
              <div className="aside-rule" />
              <a href="#discussion">
                Discussion <span>{count}</span>
              </a>
              <a href={data.url} target="_blank" rel="noopener noreferrer">
                Original on Reddit <Icon name="external" />
              </a>
              <button onClick={toggleBookmark}>
                <Icon name="bookmark" />
                {bookmarked ? 'Saved to reading list' : 'Save for later'}
              </button>
              <p className="aside-note">
                A snapshot of what the browser could see.
                <br />
                Fetched {date(data.fetchedAt)}.
              </p>
            </aside>
            <div className="reading-main">
              <AvailabilityNotice
                data={data}
                localMode={localMode}
                busy={busy}
                retryAt={retryAt}
                onRetry={() => void read(data.url)}
              />
              {data.warnings.map((w, i) => (
                <p className="warning" key={i}>
                  {w}
                </p>
              ))}
              {data.post && (
                <article className="post">
                  <div className="post-meta">
                    <span className="subreddit-pill">{data.post.subreddit}</span>
                    <span>by {data.post.author.name}</span>
                    <time>{date(data.post.timestamp)}</time>
                  </div>
                  <h2>{data.post.title}</h2>
                  <div className="post-flags">
                    {data.post.archived && <span>Archived</span>}
                    {data.post.locked && <span>Locked</span>}
                  </div>
                  <RichText blocks={data.post.blocks} />
                  <MediaView items={data.post.media} />
                  <div className="post-bottom">
                    <span>
                      {data.post.score ? `${data.post.score} points` : 'Score not displayed'}
                      <b>·</b>
                      {count} loaded comments
                    </span>
                    <button
                      className={'icon ' + (bookmarked ? 'selected' : '')}
                      aria-label={bookmarked ? 'Remove bookmark' : 'Save discussion'}
                      onClick={toggleBookmark}
                    >
                      <Icon name="bookmark" />
                    </button>
                  </div>
                </article>
              )}
              {data.listing.length > 0 && (
                <div className="listing">
                  {data.listing.map((p) => (
                    <PostCard key={p.id} post={p} onRead={(value) => void read(value)} />
                  ))}
                </div>
              )}
              {(data.post || count > 0) && (
                <section id="discussion" className="discussion">
                  <div className="section-top">
                    <h2>
                      The discussion <span>{count}</span>
                    </h2>
                    <a href="#reader-content" className="text-button">
                      Back to top ↑
                    </a>
                  </div>
                  {count > 0 && (
                    <>
                      <label className="sr-only" htmlFor="find-comments">
                        Find in loaded comments
                      </label>
                      <input
                        id="find-comments"
                        className="comment-search"
                        type="search"
                        placeholder="Find in loaded comments…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                      <nav className="comment-nav" aria-label="Comment navigation">
                        {data.comments.slice(0, 12).map((c, i) => (
                          <a
                            key={c.id}
                            href={'#comment-' + c.id}
                            aria-label={`Jump to top level comment ${i + 1}`}
                          >
                            {String(i + 1).padStart(2, '0')}
                          </a>
                        ))}
                      </nav>
                    </>
                  )}
                  {data.comments.filter(matching).map((c) => (
                    <CommentNode key={c.id} comment={c} />
                  ))}
                  {!count && (
                    <p className="empty-comments">
                      No comment bodies were retrieved. Threadglass only shows what was available.
                    </p>
                  )}
                  {query && data.comments.filter(matching).length === 0 && (
                    <p>No loaded comments match your search.</p>
                  )}
                  {data.continuations?.length > 0 && (
                    <div className="continuations">
                      {data.continuations.map((c, i) => (
                        <button key={i} className="text-button" onClick={() => void read(c.url)}>
                          {c.label} <Icon name="arrow" />
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="end-note">
                    <span className="brand-mark small">
                      <i />
                      <i />
                      <i />
                    </span>
                    <p>You’ve reached the end of this snapshot.</p>
                    <span>Unread or restricted comments are never filled in.</span>
                  </div>
                </section>
              )}
            </div>
          </section>
        )}
        {!data && !busy && (
          <section className="welcome">
            <div className="welcome-title">
              <span className="eyebrow">THE INTERNET, WITH A LITTLE BREATHING ROOM</span>
              <span className="edition">01 / THE READER</span>
            </div>
            <div className="welcome-grid">
              <div className="welcome-main">
                <span className="line-art" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
                <h2>
                  Follow the thought.
                  <br />
                  Keep the context.
                </h2>
                <p>
                  Nested replies stay nested. Code stays readable.
                  <br />
                  The conversation gets the attention it deserves.
                </p>
              </div>
              <div className="feature-list">
                <div>
                  <span>01</span>
                  <section>
                    <h3>Just bring a link</h3>
                    <p>Paste a public thread or subreddit. We open the page in a real browser.</p>
                  </section>
                </div>
                <div>
                  <span>02</span>
                  <section>
                    <h3>Read at your own pace</h3>
                    <p>
                      Collapse branches, find a reply, save a thread. Your reading list stays on
                      your device.
                    </p>
                  </section>
                </div>
                <div>
                  <span>03</span>
                  <section>
                    <h3>Know what’s available</h3>
                    <p>See what was retrieved. If Reddit limits access, we tell you clearly.</p>
                  </section>
                </div>
              </div>
            </div>
            <div className="local-callout">
              <div>
                <span className="local-symbol" aria-hidden="true">
                  ↳
                </span>
                <div>
                  <h3>Already have the thread open?</h3>
                  <p>The optional local reader cleans up content loaded in your own browser.</p>
                </div>
              </div>
              <a href="/threadglass.user.js" download>
                Get the userscript <Icon name="arrow" />
              </a>
            </div>
          </section>
        )}
      </main>
      <footer>
        <span className="footer-brand">
          threadglass <span> / </span> A quieter lens.
        </span>
        <span>Independent & open source. Not affiliated with Reddit.</span>
        <a
          href="https://github.com/icarus-online/threadglass#how-it-works"
          target="_blank"
          rel="noopener noreferrer"
        >
          How it works <Icon name="external" />
        </a>
      </footer>
    </div>
  );
}
