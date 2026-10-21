import type { Discussion, ReadInput } from '../shared/schema.ts';
import { validateRedditUrl } from '../shared/urls.ts';
import { ReaderError } from './browser.ts';

export interface Reader {
  read(input: ReadInput, signal: AbortSignal): Promise<Discussion>;
  close(): Promise<void>;
}
export interface CoordinatedRead {
  data: Discussion;
  cache: 'miss' | 'hit' | 'shared';
  retryAfterSeconds?: number;
}
interface Entry {
  data: Discussion;
  expires: number;
  bytes: number;
  cooldown: boolean;
}
interface Flight {
  controller: AbortController;
  promise: Promise<Discussion>;
  subscribers: number;
  settled: boolean;
}
interface Options {
  maxEntries: number;
  maxBytes: number;
  maxEntryBytes: number;
  maxFlights: number;
  maxSubscribers: number;
  contentTtlMs: number;
  blockedTtlMs: number;
  rateLimitTtlMs: number;
  transientTtlMs: number;
}
const defaults: Options = {
  maxEntries: 30,
  maxBytes: 8 * 1024 * 1024,
  maxEntryBytes: 1024 * 1024,
  maxFlights: 2,
  maxSubscribers: 50,
  contentTtlMs: 60_000,
  blockedTtlMs: 15_000,
  rateLimitTtlMs: 30_000,
  transientTtlMs: 5_000,
};

/** Shares only anonymous snapshots of the same canonical URL and viewport. */
export class ReadCoordinator {
  private readonly options: Options;
  private readonly entries = new Map<string, Entry>();
  private readonly flights = new Map<string, Flight>();
  private cacheBytes = 0;
  private subscribers = 0;
  private closed = false;

  constructor(
    private readonly reader: Reader,
    options: Partial<Options> = {},
    private readonly now: () => number = Date.now,
  ) {
    this.options = { ...defaults, ...options };
  }

  async read(input: ReadInput, signal: AbortSignal): Promise<CoordinatedRead> {
    if (signal.aborted) throw new ReaderError('cancelled', 'Reading cancelled.', 499);
    if (this.closed) throw new ReaderError('busy', 'The reader is shutting down.', 503);
    let normalized: ReadInput;
    try {
      normalized = { ...input, url: validateRedditUrl(input.url).href };
    } catch {
      throw new ReaderError('invalid_url', 'Paste an HTTPS Reddit thread or subreddit URL.', 400);
    }
    const key = `${normalized.url}:${normalized.viewport}`;
    this.prune();
    const cached = this.entries.get(key);
    if (cached) {
      // Refresh LRU position without changing source freshness or expiry.
      this.entries.delete(key);
      this.entries.set(key, cached);
      return this.response(cached.data, 'hit', cached);
    }
    if (this.subscribers >= this.options.maxSubscribers)
      throw new ReaderError(
        'busy',
        'The reader has too many waiting requests. Try again shortly.',
        429,
      );
    let flight = this.flights.get(key);
    const shared = !!flight;
    if (flight?.controller.signal.aborted)
      throw new ReaderError('busy', 'The previous read is stopping. Try again shortly.', 429);
    if (!flight) {
      if (this.flights.size >= this.options.maxFlights)
        throw new ReaderError('busy', 'The browser is busy. Try again shortly.', 429);
      const controller = new AbortController();
      // This closure starts on the next microtask, after current is initialized
      // and the first subscriber's cancellation handler has been installed.
      const current: Flight = {
        controller,
        subscribers: 0,
        settled: false,
        promise: Promise.resolve()
          .then(() => {
            if (controller.signal.aborted)
              throw new ReaderError('cancelled', 'Reading cancelled.', 499);
            return this.reader.read(normalized, controller.signal);
          })
          .then((data) => {
            if (!controller.signal.aborted && !this.closed) this.remember(key, data);
            return data;
          })
          .finally(() => {
            current.settled = true;
            this.flights.delete(key);
          }),
      };
      flight = current;
      this.flights.set(key, current);
    }
    return this.subscribe(flight, signal, shared ? 'shared' : 'miss', key);
  }

  private subscribe(
    flight: Flight,
    signal: AbortSignal,
    cache: 'miss' | 'shared',
    key: string,
  ): Promise<CoordinatedRead> {
    flight.subscribers++;
    this.subscribers++;
    return new Promise((resolve, reject) => {
      let done = false;
      const release = () => {
        done = true;
        signal.removeEventListener('abort', cancelled);
        flight.subscribers--;
        this.subscribers--;
        if (!flight.subscribers && !flight.settled) flight.controller.abort();
      };
      const cancelled = () => {
        if (done) return;
        release();
        reject(new ReaderError('cancelled', 'Reading cancelled.', 499));
      };
      signal.addEventListener('abort', cancelled, { once: true });
      if (signal.aborted) cancelled();
      // Rejection handlers stay attached even if all subscribers have disconnected.
      flight.promise.then(
        (data) => {
          if (done) return;
          release();
          resolve(this.response(data, cache, this.entries.get(key)));
        },
        (error: unknown) => {
          if (done) return;
          release();
          reject(error);
        },
      );
    });
  }

  private response(
    data: Discussion,
    cache: CoordinatedRead['cache'],
    entry?: Entry,
  ): CoordinatedRead {
    return {
      data,
      cache,
      ...(entry?.cooldown
        ? { retryAfterSeconds: Math.max(1, Math.ceil((entry.expires - this.now()) / 1000)) }
        : {}),
    };
  }

  private remember(key: string, data: Discussion) {
    const content = !!(data.post || data.listing.length);
    const readable = content && ['public', 'partial', 'promotional_overlay'].includes(data.status);
    const ttl = readable
      ? this.options.contentTtlMs
      : data.status === 'rate_limited'
        ? this.options.rateLimitTtlMs
        : ['source_blocked', 'login_required'].includes(data.status)
          ? this.options.blockedTtlMs
          : ['network_failure', 'render_failure'].includes(data.status)
            ? this.options.transientTtlMs
            : 0;
    if (!ttl) return;
    const bytes = Buffer.byteLength(JSON.stringify(data), 'utf8');
    if (bytes > this.options.maxEntryBytes || bytes > this.options.maxBytes) return;
    this.prune();
    while (
      this.entries.size >= this.options.maxEntries ||
      this.cacheBytes + bytes > this.options.maxBytes
    ) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) return;
      this.remove(oldest);
    }
    this.entries.set(key, { data, bytes, expires: this.now() + ttl, cooldown: !readable });
    this.cacheBytes += bytes;
  }

  private remove(key: string) {
    const entry = this.entries.get(key);
    if (entry) this.cacheBytes -= entry.bytes;
    this.entries.delete(key);
  }

  private prune() {
    for (const [key, entry] of this.entries) if (entry.expires <= this.now()) this.remove(key);
  }

  async close() {
    this.closed = true;
    for (const flight of this.flights.values()) flight.controller.abort();
    this.entries.clear();
    this.cacheBytes = 0;
    await this.reader.close();
  }
}
