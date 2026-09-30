import { describe, expect, it } from 'vitest';
import { kvFromEnv, MemoryKV, UpstashKV } from '../../server/storage';

describe('MemoryKV', () => {
  it('stores with TTL and forgets after expiry', async () => {
    let t = 1_000;
    const kv = new MemoryKV(() => t);
    await kv.set('a', '1', 10);
    expect(await kv.get('a')).toBe('1');
    t += 9_999;
    expect(await kv.get('a')).toBe('1');
    t += 2;
    expect(await kv.get('a')).toBeNull();
  });

  it('counts with incr and resets with the window', async () => {
    let t = 0;
    const kv = new MemoryKV(() => t);
    expect(await kv.incr('c', 5)).toBe(1);
    expect(await kv.incr('c', 5)).toBe(2);
    t += 6_000;
    expect(await kv.incr('c', 5)).toBe(1);
    await kv.del('c');
    expect(await kv.get('c')).toBeNull();
  });
});

describe('UpstashKV (REST, mocked fetch)', () => {
  function fakeRedis() {
    const data = new Map<string, string>();
    const sent: string[][] = [];
    const fetchImpl = async (url: string, init: { headers: Record<string, string>; body: string }) => {
      expect(url).toBe('https://kv.example.com');
      expect(init.headers.authorization).toBe('Bearer tok');
      const cmd = JSON.parse(init.body) as string[];
      sent.push(cmd);
      let result: unknown = null;
      if (cmd[0] === 'GET') result = data.get(cmd[1]) ?? null;
      if (cmd[0] === 'SET') (data.set(cmd[1], cmd[2]), (result = 'OK'));
      if (cmd[0] === 'DEL') result = data.delete(cmd[1]) ? 1 : 0;
      if (cmd[0] === 'INCR') data.set(cmd[1], String((+(data.get(cmd[1]) ?? 0) || 0) + 1)), (result = +data.get(cmd[1])!);
      if (cmd[0] === 'EXPIRE') result = 1;
      return { ok: true, status: 200, json: async () => ({ result }) };
    };
    return { kv: new UpstashKV('https://kv.example.com/', 'tok', fetchImpl), sent };
  }

  it('speaks the Redis REST protocol', async () => {
    const { kv, sent } = fakeRedis();
    await kv.set('k', '{"x":1}', 1800);
    expect(sent[0]).toEqual(['SET', 'k', '{"x":1}', 'EX', '1800']);
    expect(await kv.get('k')).toBe('{"x":1}');
    expect(await kv.incr('n', 60)).toBe(1);
    expect(sent.at(-1)).toEqual(['EXPIRE', 'n', '60']);
    expect(await kv.incr('n', 60)).toBe(2);
    expect(sent.at(-1)).toEqual(['INCR', 'n']);
    await kv.del('k');
    expect(await kv.get('k')).toBeNull();
  });

  it('surfaces REST errors', async () => {
    const kv = new UpstashKV('https://kv', 't', async () => ({ ok: false, status: 401, json: async () => ({ error: 'WRONGPASS' }) }));
    await expect(kv.get('x')).rejects.toThrow(/WRONGPASS/);
  });

  it('is selected from Vercel KV or Upstash env vars, memory otherwise', () => {
    expect(kvFromEnv({ KV_REST_API_URL: 'https://a', KV_REST_API_TOKEN: 't' }).kind).toBe('upstash');
    expect(kvFromEnv({ UPSTASH_REDIS_REST_URL: 'https://a', UPSTASH_REDIS_REST_TOKEN: 't' }).kind).toBe('upstash');
    expect(kvFromEnv({}).kind).toBe('memory');
    expect(kvFromEnv({ KV_REST_API_URL: 'https://a' }).kind).toBe('memory');
  });
});
