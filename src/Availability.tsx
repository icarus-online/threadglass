import { useEffect, useState } from 'react';
import type { Discussion } from '../shared/schema.ts';

const guidance = {
  source_blocked: { title: 'Reddit blocked this browser', local: true, retry: true },
  login_required: { title: 'Reddit requires access', local: false, retry: false },
  rate_limited: { title: 'Reddit needs a pause', local: true, retry: true },
  render_failure: { title: 'This page could not be read', local: true, retry: true },
  network_failure: { title: 'Reddit could not be reached', local: true, retry: true },
  promotional_overlay: { title: 'An app prompt remains on Reddit', local: true, retry: false },
  partial: { title: 'Part of the discussion is available', local: true, retry: false },
};
export function AvailabilityNotice({
  data,
  localMode,
  busy,
  retryAt,
  onRetry,
}: {
  data: Discussion;
  localMode: boolean;
  busy: boolean;
  retryAt: number;
  onRetry: () => void;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    if (retryAt <= Date.now()) return;
    const timer = setInterval(() => {
      const time = Date.now();
      setNow(time);
      if (time >= retryAt) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [retryAt]);
  const wait = Math.max(0, Math.ceil((retryAt - now) / 1000));
  if (data.status === 'public')
    return (
      <div className="availability public" role="status">
        <span className="status-dot" />
        <span>{data.message}</span>
      </div>
    );
  const help = guidance[data.status];
  return (
    <section className={'availability-help ' + data.status} aria-label="Reading availability">
      <div className={'availability ' + data.status} role="status">
        <span className="status-dot" />
        <div>
          <h2>{help.title}</h2>
          <p>{data.message}</p>
        </div>
      </div>
      {data.status === 'login_required' ? (
        <p className="recovery-note">
          Threadglass cannot unlock restricted content. Open the original to review Reddit’s access
          requirements.
        </p>
      ) : (
        help.local &&
        !localMode && (
          <p className="recovery-note">
            If the thread opens in your browser, the local reader can clean up content that has
            already loaded there.
          </p>
        )
      )}
      <div className="recovery-actions">
        <a href={data.url} target="_blank" rel="noopener noreferrer">
          Open original on Reddit <span aria-hidden="true">↗</span>
        </a>
        {help.local && !localMode && (
          <a href="/threadglass.user.js" download>
            Get the local reader
          </a>
        )}
        {help.retry && !localMode && (
          <button
            type="button"
            onClick={onRetry}
            disabled={busy || wait > 0}
            aria-label="Try reading again"
          >
            {wait > 0 ? `Try again in ${wait}s` : 'Try again'}
          </button>
        )}
      </div>
    </section>
  );
}
