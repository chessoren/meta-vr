/**
 * Tiny key/value store with TTL.
 *
 * - Production: Upstash Redis over its REST API (Vercel KV / Upstash integration), plain fetch, no SDK.
 *   Env: KV_REST_API_URL + KV_REST_API_TOKEN, or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.
 * - Dev / tests: an in-process Map with expiry (shared across hot reloads through globalThis).
 */

export interface KV {
  readonly kind: 'upstash' | 'memory';
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Atomic-ish counter: increments and returns the new value; the TTL is set when the counter is created. */
  incr(key: string, ttlSec: number): Promise<number>;
}

// ─── in-memory ───────────────────────────────────────────────────────────────

interface Entry {
  value: string;
  expiresAt: number;
}

export class MemoryKV implements KV {
  readonly kind = 'memory' as const;
  private map = new Map<string, Entry>();
  constructor(private now: () => number = () => Date.now()) {}

  private live(key: string): Entry | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (e.expiresAt <= this.now()) {
      this.map.delete(key);
      return undefined;
    }
    return e;
  }

  private sweep() {
    if (this.map.size < 5000) return;
    const t = this.now();
    for (const [k, e] of this.map) if (e.expiresAt <= t) this.map.delete(k);
  }

  async get(key: string) {
    return this.live(key)?.value ?? null;
  }

  async set(key: string, value: string, ttlSec: number) {
    this.sweep();
    this.map.set(key, { value, expiresAt: this.now() + Math.max(1, ttlSec) * 1000 });
  }

  async del(key: string) {
    this.map.delete(key);
  }

  async incr(key: string, ttlSec: number) {
    const e = this.live(key);
    if (!e) {
      await this.set(key, '1', ttlSec);
      return 1;
    }
    const n = (parseInt(e.value, 10) || 0) + 1;
    e.value = String(n);
    return n;
  }
}

// ─── Upstash REST ────────────────────────────────────────────────────────────

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export class UpstashKV implements KV {
  readonly kind = 'upstash' as const;
  constructor(
    private url: string,
    private token: string,
    private fetchImpl: FetchLike = (u, i) => fetch(u, i),
  ) {
    this.url = url.replace(/\/+$/, '');
  }

  private async cmd(...args: (string | number)[]): Promise<unknown> {
    const res = await this.fetchImpl(this.url, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(args.map(String)),
    });
    const json = (await res.json().catch(() => ({}))) as { result?: unknown; error?: string };
    if (!res.ok || json.error) throw new Error(`KV ${String(args[0])} failed: ${json.error ?? res.status}`);
    return json.result ?? null;
  }

  async get(key: string) {
    const r = await this.cmd('GET', key);
    return typeof r === 'string' ? r : null;
  }

  async set(key: string, value: string, ttlSec: number) {
    await this.cmd('SET', key, value, 'EX', Math.max(1, Math.round(ttlSec)));
  }

  async del(key: string) {
    await this.cmd('DEL', key);
  }

  async incr(key: string, ttlSec: number) {
    const n = Number(await this.cmd('INCR', key));
    if (n === 1) await this.cmd('EXPIRE', key, Math.max(1, Math.round(ttlSec)));
    return n;
  }
}

// ─── factory ─────────────────────────────────────────────────────────────────

export function kvFromEnv(env: Record<string, string | undefined> = process.env): KV {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return new UpstashKV(url, token);
  const g = globalThis as { __lociMemoryKV?: MemoryKV };
  return (g.__lociMemoryKV ??= new MemoryKV());
}

let current: KV | undefined;

/** The process-wide store (lazily created from env). */
export function kv(): KV {
  return (current ??= kvFromEnv());
}

/** Tests: swap the store (pass undefined to reset to env default). */
export function setKV(store: KV | undefined) {
  current = store;
}
