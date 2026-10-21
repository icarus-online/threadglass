import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { BrowserService, ReaderError } from './browser.ts';
import { readRequest, type Discussion } from '../shared/schema.ts';
import { validateRedditUrl } from './security.ts';
export function createApp(service = new BrowserService()) {
  const app = express();
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'https://*.redd.it', 'https://*.redditmedia.com'],
          mediaSrc: ['https://*.redd.it', 'https://*.redditmedia.com'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameSrc: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'self'"],
        },
      },
    }),
  );
  app.use(express.json({ limit: '4kb' }));
  const cache = new Map<string, { expires: number; data: Discussion }>();
  const limiter = rateLimit({
    windowMs: 60000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      error: { code: 'rate_limited', message: 'Too many requests. Please wait a minute.' },
    },
  });
  app.get('/api/health', (_req, res) =>
    res.json({ status: 'ok', service: 'threadglass', version: '0.1.0' }),
  );
  app.post('/api/read', limiter, async (req, res) => {
    const id = randomUUID(),
      started = Date.now();
    res.setHeader('Cache-Control', 'no-store');
    // JSON-only, same-origin requests. Local userscript uses no backend.
    if (!req.is('application/json')) {
      res.status(415).json({ error: { code: 'content_type', message: 'Send application/json.' } });
      return;
    }
    const origin = req.get('origin');
    if (origin) {
      try {
        if (new URL(origin).host !== req.get('host')) {
          res
            .status(403)
            .json({ error: { code: 'origin', message: 'Use the reader on this server.' } });
          return;
        }
      } catch {
        res.status(403).end();
        return;
      }
    }
    const parsed = readRequest.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'invalid_request',
          message: 'Provide a supported Reddit URL and viewport.',
        },
      });
      return;
    }
    let key: string;
    try {
      key = validateRedditUrl(parsed.data.url).href + ':' + parsed.data.viewport;
    } catch {
      res.status(400).json({
        error: { code: 'invalid_url', message: 'Paste an HTTPS Reddit thread or subreddit URL.' },
      });
      return;
    }
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now()) {
      res.json(cached.data);
      return;
    }
    const controller = new AbortController();
    req.on('aborted', () => controller.abort());
    res.on('close', () => {
      if (!res.writableEnded) controller.abort();
    });
    try {
      const data = await service.read(parsed.data, controller.signal);
      if (
        ['public', 'partial', 'promotional_overlay'].includes(data.status) &&
        (data.post || data.listing.length)
      ) {
        for (const [k, v] of cache) if (v.expires < Date.now()) cache.delete(k);
        if (cache.size >= 30) cache.delete(cache.keys().next().value!);
        cache.set(key, { expires: Date.now() + 60000, data });
      }
      console.info(
        JSON.stringify({
          id,
          event: 'read',
          status: data.status,
          comments: data.evidence.renderedComments,
          elapsedMs: Date.now() - started,
        }),
      );
      if (!res.destroyed) res.json(data);
    } catch (error) {
      const e =
        error instanceof ReaderError
          ? error
          : new ReaderError('internal', 'The reader could not complete this request.');
      console.error(
        JSON.stringify({ id, event: 'read_error', code: e.code, elapsedMs: Date.now() - started }),
      );
      if (!res.destroyed)
        res
          .status(e.httpStatus)
          .json({ error: { code: e.code, message: e.message, requestId: id } });
    }
  });
  app.use('/api', (_req, res) =>
    res.status(404).json({ error: { code: 'not_found', message: 'Unknown endpoint.' } }),
  );
  app.use(express.static(path.resolve('dist'), { dotfiles: 'deny' }));
  app.get('/{*path}', (_req, res) => res.sendFile(path.resolve('dist/index.html')));
  app.use(
    (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(400).json({ error: { code: 'bad_request', message: 'Invalid request.' } });
    },
  );
  return { app, close: () => service.close() };
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('server/index.ts')) {
  const { app, close } = createApp();
  const server = app.listen(Number(process.env.PORT || 3001), process.env.HOST || '127.0.0.1', () =>
    console.log('Threadglass listening on port ' + (process.env.PORT || 3001)),
  );
  const stop = () => {
    server.close();
    void close().finally(() => process.exit(0));
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
