import type { IncomingMessage, ServerResponse } from 'node:http';
import { devApiMiddleware } from '../server/dev-middleware';

/** Vercel catch-all function: every /api/* request goes through the shared route table. */
const mw = devApiMiddleware();

export default async function handler(req: IncomingMessage & { body?: unknown }, res: ServerResponse) {
  await mw(req, res, () => {
    res.statusCode = 404;
    res.end('{"error":"not found"}');
  });
}

export const config = { api: { bodyParser: false } };
