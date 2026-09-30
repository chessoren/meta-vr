import type { ApiRequest, ApiResponse, Handler } from './http';
import { bad, HttpError, ok } from './http';
import type { PairRecord } from '../src/core/types';
import { pairCode } from '../src/core/ids';
import { newId, random01 } from './ids';
import { kv } from './storage';
import { normalizeCode, requireCode, validateExtract, validatePalace } from './validate';
import { aiEnabled, extract } from './extract';
import { aiConfigFromEnv } from './ai';
import type { PairCreated, PairStatusResponse, PalaceStatusResponse } from './api-types';

/** Pairing slot lifetime. */
export const PAIR_TTL_SEC = 30 * 60;
/** After the headset downloaded the palace, it can re-fetch it for this long. */
export const CONSUMED_TTL_SEC = 10 * 60;
/** A palace that is ready waits at least this long for the headset. */
export const READY_MIN_TTL_SEC = 15 * 60;

interface StoredPair extends PairRecord {
  expiresAt: number;
  consumedAt?: number;
}

const now = () => Date.now();
const key = (code: string) => `loci:pair:${code}`;

function newSecret(): string {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function load(code: string): Promise<StoredPair | null> {
  const raw = await kv().get(key(code));
  if (!raw) return null;
  try {
    const rec = JSON.parse(raw) as StoredPair;
    return rec.expiresAt > now() ? rec : null;
  } catch {
    return null;
  }
}

async function save(rec: StoredPair) {
  const ttl = Math.max(1, Math.ceil((rec.expiresAt - now()) / 1000));
  await kv().set(key(rec.code), JSON.stringify(rec), ttl);
}

async function mustLoad(code: string): Promise<StoredPair> {
  const rec = await load(code);
  if (!rec) throw new HttpError(404, 'Unknown or expired code', { reason: 'expired' });
  return rec;
}

/** Fixed-window counter; throws 429 when exceeded. */
async function limit(scope: string, id: string, max: number, windowSec: number) {
  const n = await kv().incr(`loci:rl:${scope}:${id}`, windowSec);
  if (n > max) throw new HttpError(429, 'Too many requests — slow down a little', { retryAfter: windowSec });
}

function clientIp(req: ApiRequest): string {
  const h = req.headers ?? {};
  return (h['x-forwarded-for']?.split(',')[0] || h['x-real-ip'] || 'local').trim().slice(0, 64);
}

/** Same-origin only: a browser POST carrying a foreign Origin is refused (no CORS headers are ever sent). */
function sameOrigin(req: ApiRequest) {
  const origin = req.headers?.origin;
  if (!origin || origin === 'null') return;
  const host = req.headers?.['x-forwarded-host'] || req.headers?.host;
  let oHost = '';
  try {
    oHost = new URL(origin).host;
  } catch {
    /* malformed */
  }
  if (host && oHost !== host.split(',')[0].trim()) throw new HttpError(403, 'Cross-origin requests are not allowed');
}

function method(req: ApiRequest, ...allowed: string[]) {
  if (!allowed.includes(req.method.toUpperCase())) throw new HttpError(405, `Use ${allowed.join(' or ')}`);
}

// ─── handlers ────────────────────────────────────────────────────────────────

const health: Handler = async () =>
  ok({ ok: true, ai: aiEnabled(), model: aiEnabled() ? aiConfigFromEnv().model : null, storage: kv().kind });

async function createPair(req: ApiRequest): Promise<ApiResponse> {
  sameOrigin(req);
  await limit('pair-ip', clientIp(req), 40, 10 * 60);
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = normalizeCode(pairCode(random01));
    if (!code || (await kv().get(key(code)))) continue; // collision → retry
    const t = now();
    const rec: StoredPair = { code, secret: newSecret(), status: 'waiting', createdAt: t, expiresAt: t + PAIR_TTL_SEC * 1000 };
    await save(rec);
    const out: PairCreated = { code, secret: rec.secret, expiresAt: rec.expiresAt, importPath: `/import/?c=${code}` };
    return ok(out);
  }
  return bad('No pairing code available right now, try again', 503);
}

async function pairStatus(req: ApiRequest): Promise<ApiResponse> {
  const code = requireCode(req.query.code);
  await limit('pair-get', code, 400, PAIR_TTL_SEC);
  const rec = await mustLoad(code);
  if (rec.status === 'waiting') {
    rec.status = 'importing'; // the phone has opened the link: the headset can say "phone connected"
    await save(rec);
  }
  const out: PairStatusResponse = { status: rec.status, expiresAt: rec.expiresAt };
  return ok(out);
}

const pair: Handler = async (req) => (req.method.toUpperCase() === 'POST' ? createPair(req) : (method(req, 'GET', 'POST'), pairStatus(req)));

const extractRoute: Handler = async (req) => {
  method(req, 'POST');
  sameOrigin(req);
  const body = validateExtract(req.body);
  const rec = await mustLoad(body.code);
  await limit('extract', body.code, 12, PAIR_TTL_SEC);
  if (rec.status === 'waiting') {
    rec.status = 'importing';
    await save(rec);
  }
  return ok(await extract(body));
};

async function sendPalace(req: ApiRequest): Promise<ApiResponse> {
  sameOrigin(req);
  const b = req.body as { code?: unknown; palace?: unknown } | undefined;
  if (!b || typeof b !== 'object') throw new HttpError(400, 'body: must be {code, palace}');
  const code = requireCode(b.code);
  await limit('palace-post', code, 30, PAIR_TTL_SEC);
  const rec = await mustLoad(code);
  if (JSON.stringify(b.palace ?? null).length > 400_000) throw new HttpError(413, 'palace: too large');
  const palace = validatePalace(b.palace, { now: now(), newId: () => newId('p') });
  rec.palace = palace;
  rec.status = 'ready';
  delete rec.consumedAt;
  rec.expiresAt = Math.max(rec.expiresAt, now() + READY_MIN_TTL_SEC * 1000);
  await save(rec);
  return ok({ ok: true, id: palace.id, notions: palace.notions.length, expiresAt: rec.expiresAt });
}

async function fetchPalace(req: ApiRequest): Promise<ApiResponse> {
  const code = requireCode(req.query.code);
  const secret = typeof req.query.secret === 'string' ? req.query.secret : '';
  if (!secret) throw new HttpError(400, 'secret: required');
  await limit('palace-get', code, 3000, PAIR_TTL_SEC);
  const rec = await mustLoad(code);
  if (!safeEqual(secret, rec.secret)) throw new HttpError(403, 'Wrong secret for this code');
  if (rec.status === 'ready' && rec.palace) {
    const out: PalaceStatusResponse = { status: 'ready', expiresAt: rec.expiresAt, palace: rec.palace };
    rec.status = 'consumed';
    rec.consumedAt = now();
    rec.expiresAt = now() + CONSUMED_TTL_SEC * 1000;
    await save(rec);
    return ok(out);
  }
  if (rec.status === 'consumed' && rec.palace) {
    const out: PalaceStatusResponse = { status: 'consumed', expiresAt: rec.expiresAt, palace: rec.palace };
    return ok(out);
  }
  const out: PalaceStatusResponse = { status: rec.status, expiresAt: rec.expiresAt };
  return ok(out);
}

const palace: Handler = async (req) => (req.method.toUpperCase() === 'POST' ? sendPalace(req) : (method(req, 'GET', 'POST'), fetchPalace(req)));

/**
 * Route table: path → handler.
 * Keep this the single source of truth; api/[...route].ts and the dev middleware both read it.
 */
export const routes: Record<string, Handler> = {
  '/api/health': health,
  '/api/pair': pair,
  '/api/extract': extractRoute,
  '/api/palace': palace,
};

export async function dispatch(path: string, req: Parameters<Handler>[0]): Promise<ApiResponse> {
  const h = routes[path.replace(/\/+$/, '') || path];
  if (!h) return bad(`No route ${path}`, 404);
  try {
    return await h(req);
  } catch (e) {
    if (e instanceof HttpError) {
      const res = bad(e.message, e.status, e.extra);
      if (e.status === 429 && e.extra?.retryAfter) res.headers = { 'retry-after': String(e.extra.retryAfter) };
      return res;
    }
    console.error('[api]', path, e);
    return bad('Internal error', 500);
  }
}
