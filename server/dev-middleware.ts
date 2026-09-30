import type { IncomingMessage, ServerResponse } from 'node:http';
import { dispatch } from './routes';
import { MAX_BODY_BYTES } from './http';

function send(res: ServerResponse, status: number, json: unknown, headers?: Record<string, string>) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'no-referrer');
  for (const [k, v] of Object.entries(headers ?? {})) res.setHeader(k, v);
  res.end(JSON.stringify(json));
}

/** Connect middleware serving /api/* locally with the same handlers as production (also used by api/[...route].ts). */
export function devApiMiddleware() {
  return async (req: IncomingMessage & { body?: unknown }, res: ServerResponse, next: () => void) => {
    if (!req.url || !req.url.startsWith('/api/')) return next();
    const url = new URL(req.url, 'http://localhost');

    let body: unknown;
    if (req.body !== undefined && req.body !== null && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      body = req.body; // a host already parsed it
    } else {
      const chunks: Buffer[] = [];
      let size = 0;
      try {
        for await (const c of req) {
          const b = Buffer.isBuffer(c) ? c : Buffer.from(c as string);
          size += b.length;
          if (size > MAX_BODY_BYTES) {
            send(res, 413, { error: 'Request too large' });
            req.destroy();
            return;
          }
          chunks.push(b);
        }
      } catch {
        return send(res, 400, { error: 'Could not read request body' });
      }
      const raw = Buffer.concat(chunks).toString('utf8');
      if (raw) {
        try {
          body = JSON.parse(raw);
        } catch {
          return send(res, 400, { error: 'Body must be JSON' });
        }
      }
    }

    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers[k.toLowerCase()] = v;
    else if (Array.isArray(v)) headers[k.toLowerCase()] = v.join(', ');

    const out = await dispatch(url.pathname, {
      method: req.method ?? 'GET',
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      body,
      headers,
    });
    send(res, out.status, out.json, out.headers);
  };
}
