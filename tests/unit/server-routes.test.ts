import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dispatch, CONSUMED_TTL_SEC } from '../../server/routes';
import { MemoryKV, setKV } from '../../server/storage';
import { devApiMiddleware } from '../../server/dev-middleware';
import type { ApiRequest } from '../../server/http';
import type { ExtractResponse, Notion, Palace } from '../../src/core/types';
import { EN_CHEM } from './fixtures/courses';

const call = (method: string, path: string, opts: { query?: Record<string, string>; body?: unknown; headers?: Record<string, string> } = {}) =>
  dispatch(path, { method, path, query: opts.query ?? {}, body: opts.body, headers: opts.headers ?? {} } as ApiRequest);

let store: MemoryKV;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-01T18:00:00Z'));
  store = new MemoryKV();
  setKV(store);
  delete process.env.ANTHROPIC_API_KEY;
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  setKV(undefined);
});

async function pair() {
  const r = await call('POST', '/api/pair');
  expect(r.status).toBe(200);
  return r.json as { code: string; secret: string; expiresAt: number; importPath: string };
}

async function offlinePalace(code: string): Promise<Omit<Palace, 'createdAt' | 'id'>> {
  const r = await call('POST', '/api/extract', { body: { code, kind: 'text', data: EN_CHEM } });
  expect(r.status).toBe(200);
  const x = r.json as ExtractResponse;
  return { title: x.title, subject: x.subject, lang: x.lang, notions: x.notions };
}

describe('pairing & palace hand-off', () => {
  it('runs the full flow: pair → phone connects → extract → send → headset downloads → re-fetch → expiry', async () => {
    const { code, secret, importPath, expiresAt } = await pair();
    expect(code).toMatch(/^[A-HJ-NP-Z]{4}$/);
    expect(secret).toMatch(/^[0-9a-f]{32}$/);
    expect(importPath).toBe(`/import/?c=${code}`);
    expect(expiresAt - Date.now()).toBe(30 * 60_000);

    let head = await call('GET', '/api/palace', { query: { code, secret } });
    expect(head.json).toMatchObject({ status: 'waiting' });

    const phone = await call('GET', '/api/pair', { query: { code: code.toLowerCase() } });
    expect(phone.status).toBe(200);
    expect(phone.json).toMatchObject({ status: 'importing' });
    head = await call('GET', '/api/palace', { query: { code, secret } });
    expect(head.json).toMatchObject({ status: 'importing' });
    expect((head.json as { palace?: unknown }).palace).toBeUndefined();

    const palace = await offlinePalace(code);
    expect(palace.notions.length).toBeGreaterThan(3);
    const sent = await call('POST', '/api/palace', { body: { code, palace: { ...palace, examDate: '2026-12-15' } } });
    expect(sent.status).toBe(200);
    expect(sent.json).toMatchObject({ ok: true, notions: palace.notions.length });

    const got = await call('GET', '/api/palace', { query: { code, secret } });
    expect(got.status).toBe(200);
    const body = got.json as { status: string; palace: Palace };
    expect(body.status).toBe('ready');
    expect(body.palace.notions).toHaveLength(palace.notions.length);
    expect(body.palace.examDate).toBe('2026-12-15');
    expect(body.palace.id).toMatch(/^p_/);
    expect(body.palace.createdAt).toBe(Date.now());
    expect(body.palace.builtin).toBeUndefined();

    // re-fetch allowed for 10 minutes
    vi.setSystemTime(Date.now() + (CONSUMED_TTL_SEC - 5) * 1000);
    const again = await call('GET', '/api/palace', { query: { code, secret } });
    expect(again.json).toMatchObject({ status: 'consumed' });
    expect((again.json as { palace: Palace }).palace.id).toBe(body.palace.id);
    vi.setSystemTime(Date.now() + 10_000);
    expect((await call('GET', '/api/palace', { query: { code, secret } })).status).toBe(404);
  });

  it('protects the palace with the secret', async () => {
    const { code } = await pair();
    const r = await call('GET', '/api/palace', { query: { code, secret: 'nope' } });
    expect(r.status).toBe(403);
    expect((await call('GET', '/api/palace', { query: { code } })).status).toBe(400);
  });

  it('expires codes after 30 minutes and rejects malformed ones', async () => {
    const { code } = await pair();
    vi.setSystemTime(Date.now() + 30 * 60_000 + 1000);
    const r = await call('GET', '/api/pair', { query: { code } });
    expect(r.status).toBe(404);
    expect(r.json).toMatchObject({ reason: 'expired' });
    expect((await call('GET', '/api/pair', { query: { code: 'AB1' } })).status).toBe(400);
    expect((await call('POST', '/api/extract', { body: { code, kind: 'text', data: EN_CHEM } })).status).toBe(404);
  });

  it('retries on code collisions', async () => {
    await store.set('loci:pair:AAAA', JSON.stringify({ code: 'AAAA', secret: 'x', status: 'waiting', createdAt: 0, expiresAt: Date.now() + 1e6 }), 1000);
    const real = crypto.getRandomValues.bind(crypto);
    let n = 0;
    vi.spyOn(crypto, 'getRandomValues').mockImplementation(<T extends ArrayBufferView | null>(arr: T): T => {
      if (arr instanceof Uint32Array && n < 4) {
        n++;
        arr[0] = 0; // → 'A'
        return arr;
      }
      return real(arr as never) as T;
    });
    const { code } = await pair();
    expect(n).toBe(4);
    expect(code).not.toBe('AAAA');
  });

  it('keeps a ready palace at least 15 minutes even if the code was about to expire', async () => {
    const { code, secret } = await pair();
    const palace = await offlinePalace(code);
    vi.setSystemTime(Date.now() + 29 * 60_000);
    expect((await call('POST', '/api/palace', { body: { code, palace } })).status).toBe(200);
    vi.setSystemTime(Date.now() + 10 * 60_000);
    expect((await call('GET', '/api/palace', { query: { code, secret } })).json).toMatchObject({ status: 'ready' });
  });

  it('refuses cross-origin POSTs and wrong methods', async () => {
    const r = await call('POST', '/api/pair', { headers: { origin: 'https://evil.example', host: 'loci.app' } });
    expect(r.status).toBe(403);
    const same = await call('POST', '/api/pair', { headers: { origin: 'https://loci.app', host: 'loci.app' } });
    expect(same.status).toBe(200);
    expect((await call('DELETE', '/api/pair')).status).toBe(405);
    expect((await call('GET', '/api/extract')).status).toBe(405);
    expect((await call('GET', '/api/nope')).status).toBe(404);
  });

  it('reports health', async () => {
    const r = await call('GET', '/api/health');
    expect(r.json).toEqual({ ok: true, ai: false, model: null, storage: 'memory' });
  });
});

describe('input validation', () => {
  let code: string;
  let palace: Omit<Palace, 'createdAt' | 'id'>;
  beforeEach(async () => {
    code = (await pair()).code;
    palace = await offlinePalace(code);
  });
  const post = (p: unknown) => call('POST', '/api/palace', { body: { code, palace: p } });
  const withNotion = (patch: (n: Notion) => unknown) => ({ ...palace, notions: [patch(structuredClone(palace.notions[0])), ...palace.notions.slice(1)] });
  const err = async (p: unknown) => {
    const r = await post(p);
    expect(r.status).toBe(400);
    return (r.json as { error: string }).error;
  };

  it('accepts the extract output as-is', async () => {
    expect((await post(palace)).status).toBe(200);
  });

  it('caps notions at 20', async () => {
    const notions = Array.from({ length: 21 }, (_, i) => ({ ...palace.notions[0], id: `n_${i}` }));
    expect(await err({ ...palace, notions })).toMatch(/at most 20/);
    expect(await err({ ...palace, notions: [] })).toMatch(/at least one/);
  });

  it('checks model ids against the catalog', async () => {
    const e = await err(withNotion((n) => ((n.scene.actors[0].model = 'unicorn'), n)));
    expect(e).toMatch(/palace\.notions\[0\]\.scene\.actors\[0\]\.model: unknown model "unicorn"/);
  });

  it('requires exactly 2 distinct distractors different from the answer', async () => {
    expect(await err(withNotion((n) => ((n.distractors = ['x'] as never), n)))).toMatch(/exactly 2/);
    expect(await err(withNotion((n) => ((n.distractors = [n.answer, 'x']), n)))).toMatch(/must differ/);
  });

  it('checks lengths, labels, animations, colours, dates and ids', async () => {
    expect(await err(withNotion((n) => ((n.question = 'x'.repeat(221)), n)))).toMatch(/question: too long/);
    expect(await err(withNotion((n) => ((n.answer = ''), n)))).toMatch(/answer: required/);
    expect(await err(withNotion((n) => ((n.scene.actors = [{ model: 'kangaroo', role: 'hero', anim: 'bounce', label: 'hi' }]), n)))).toMatch(/cannot carry a label/);
    expect(await err(withNotion((n) => ((n.scene.actors[0].anim = 'moonwalk' as never), n)))).toMatch(/unknown animation/);
    expect(await err(withNotion((n) => ((n.scene.accent = 'red'), n)))).toMatch(/accent/);
    expect(await err(withNotion((n) => ((n.scene.actors = [{ model: 'ball', role: 'count', anim: 'juggle', count: 13 }]), n)))).toMatch(/count/);
    expect(await err(withNotion((n) => ((n.id = 'bad id!'), n)))).toMatch(/id/);
    expect(await err({ ...palace, examDate: '2026-02-30' })).toMatch(/examDate/);
    expect(await err({ ...palace, lang: 'de' })).toMatch(/lang/);
    expect(await err({ ...palace, notions: [palace.notions[0], palace.notions[0]] })).toMatch(/duplicate id/);
  });

  it('strips unknown fields', async () => {
    const { code: c2, secret } = await pair();
    const extra = { ...palace, builtin: true, hack: 1, notions: palace.notions.map((n) => ({ ...n, evil: '<script>' })) };
    expect((await call('POST', '/api/palace', { body: { code: c2, palace: extra } })).status).toBe(200);
    const got = (await call('GET', '/api/palace', { query: { code: c2, secret } })).json as { palace: Palace & Record<string, unknown> };
    expect(got.palace.builtin).toBeUndefined();
    expect(got.palace.hack).toBeUndefined();
    expect(JSON.stringify(got.palace)).not.toContain('<script>');
  });

  it('enforces upload limits on /api/extract', async () => {
    const ex = (body: unknown) => call('POST', '/api/extract', { body });
    expect((await ex({ code, kind: 'text', data: 'a'.repeat(60_001) })).status).toBe(413);
    expect((await ex({ code, kind: 'image', mime: 'image/jpeg', data: 'A'.repeat(6 * 1024 * 1024 + 4) })).status).toBe(413);
    expect((await ex({ code, kind: 'pdf', mime: 'application/pdf', data: 'A'.repeat(12 * 1024 * 1024 + 4) })).status).toBe(413);
    expect((await ex({ code, kind: 'image', mime: 'image/tiff', data: 'AAAA' })).status).toBe(400);
    expect((await ex({ code, kind: 'image', mime: 'image/jpeg', data: 'not base64!' })).status).toBe(400);
    expect((await ex({ code, kind: 'video', data: 'x' })).status).toBe(400);
    expect((await ex({ code, kind: 'text', data: 'short' })).status).toBe(400);
    expect((await ex({ code, kind: 'image', mime: 'image/jpeg', data: 'AAAA', more: Array(6).fill('AAAA') })).status).toBe(400);
  });

  it('rate-limits extraction per code', async () => {
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await call('POST', '/api/extract', { body: { code, kind: 'text', data: 'x: y\nz: w\nq: r' } })).status;
    expect(last).toBe(429);
  });
});

describe('dev middleware (HTTP adapter)', () => {
  let server: Server;
  let base = '';
  const ready = new Promise<void>((resolve) => {
    const mw = devApiMiddleware();
    server = createServer((req, res) => void mw(req, res, () => ((res.statusCode = 404), res.end('static'))));
    server.listen(0, '127.0.0.1', () => {
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolve();
    });
  });
  afterAll(() => server.close());

  it('serves JSON, rejects bad JSON and passes non-API requests through', async () => {
    vi.useRealTimers();
    await ready;
    const h = await fetch(`${base}/api/health`);
    expect(h.headers.get('content-type')).toMatch(/application\/json/);
    expect(h.headers.get('cache-control')).toBe('no-store');
    expect((await h.json()).ok).toBe(true);
    const bad = await fetch(`${base}/api/palace`, { method: 'POST', body: '{nope', headers: { 'content-type': 'application/json' } });
    expect(bad.status).toBe(400);
    expect((await fetch(`${base}/index.html`)).status).toBe(404);
    const p = await fetch(`${base}/api/pair`, { method: 'POST' });
    expect(p.status).toBe(200);
  });
});
