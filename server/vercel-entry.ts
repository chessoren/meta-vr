import type { IncomingMessage, ServerResponse } from 'node:http';
import { devApiMiddleware } from './dev-middleware';

/**
 * Vercel function entry (bundled by scripts/build-vercel.mjs into .vercel/output).
 * Every /api/* request is routed here with the original sub-path in `__path`.
 */
const mw = devApiMiddleware();

export default async function handler(req: IncomingMessage & { body?: unknown }, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const sub = url.searchParams.get('__path');
  if (sub !== null) {
    url.searchParams.delete('__path');
    const qs = url.searchParams.toString();
    req.url = `/api/${sub}${qs ? `?${qs}` : ''}`;
  }
  await mw(req, res, () => {
    res.statusCode = 404;
    res.setHeader('content-type', 'application/json');
    res.end('{"error":"not found"}');
  });
}
