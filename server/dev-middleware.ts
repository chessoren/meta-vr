import type { IncomingMessage, ServerResponse } from 'node:http';
import { dispatch } from './routes';

/** Connect middleware serving /api/* locally with the same handlers as production. */
export function devApiMiddleware() {
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url || !req.url.startsWith('/api/')) return next();
    const url = new URL(req.url, 'http://localhost');
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks).toString('utf8');
    let body: unknown;
    try {
      body = raw ? JSON.parse(raw) : undefined;
    } catch {
      body = undefined;
    }
    const out = await dispatch(url.pathname, {
      method: req.method ?? 'GET',
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      body,
    });
    res.statusCode = out.status;
    res.setHeader('content-type', 'application/json');
    res.setHeader('cache-control', 'no-store');
    res.end(JSON.stringify(out.json));
  };
}
