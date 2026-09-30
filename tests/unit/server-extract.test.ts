import { describe, expect, it, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { extract } from '../../server/extract';
import { DEFAULT_MODEL, mnemonistSchema, TEACHER_SCHEMA } from '../../server/ai';
import { validateNotion } from '../../server/validate';
import { isCatalogId } from '../../src/core/catalog-index';
import type { ExtractRequestIn } from '../../server/api-types';
import type { ExtractResponse } from '../../src/core/types';
import { EN_CHEM, FR_WWI } from './fixtures/courses';

type Params = Anthropic.Beta.MessageCreateParamsNonStreaming;
type Reply = unknown | Error | ((p: Params) => unknown);

const msg = (json: unknown, stop: string = 'end_turn') => ({
  id: 'msg_test',
  type: 'message',
  role: 'assistant',
  model: DEFAULT_MODEL,
  stop_reason: stop,
  content: [{ type: 'text', text: typeof json === 'string' ? json : JSON.stringify(json) }],
  usage: { input_tokens: 1, output_tokens: 1 },
});

/** Mock client: teacher replies are consumed from `teacher`, mnemonist replies are computed from `scenes`. */
function mockClient(teacher: Reply[], scenes: Reply | ((p: Params) => unknown)) {
  const calls: { params: Params; opts: { timeout?: number; maxRetries?: number } }[] = [];
  const create = vi.fn(async (params: Params, opts: { timeout?: number; maxRetries?: number }) => {
    calls.push({ params, opts });
    const sys = (params.system as { text: string }[])[0].text;
    const r = sys.includes('course analyst') ? teacher.shift() : scenes;
    const v = typeof r === 'function' ? (r as (p: Params) => unknown)(params) : r;
    if (v instanceof Error) throw v;
    return msg(v);
  });
  return { client: { beta: { messages: { create } } } as unknown as Anthropic, calls, create };
}

const FR_TEACHER = {
  title: 'La Première Guerre mondiale',
  subject: 'History',
  lang: 'fr',
  warnings: [],
  notions: [
    { question: 'En quelle année a lieu la bataille de Verdun ?', answer: '1916', accept: ['en 1916'], distractors: ['1914', '1918'], type: 'date' },
    // distractor equal to the answer + duplicate → repaired
    { question: "Quand l'armistice est-il signé ?", answer: '11 novembre 1918', accept: ['1918'], distractors: ['11 novembre 1918', '8 mai 1945'], type: 'date' },
    { question: "Quand l'armistice est-il signé ?", answer: 'doublon', accept: [], distractors: ['a', 'b'], type: 'other' },
    // only one distractor → filled heuristically
    { question: 'Qui commande les troupes françaises à Verdun ?', answer: 'Philippe Pétain', accept: ['Pétain'], distractors: ['Foch'], type: 'person' },
    { question: 'Quel surnom donne-t-on aux soldats français ?', answer: 'Les poilus', accept: ['poilus'], distractors: ['Les grognards', 'Les tommies'], type: 'vocabulary' },
  ],
};

function scenesFor(p: Params) {
  const text = ((p.messages[0].content as { type: string; text: string }[])[0]).text;
  const items = JSON.parse(text.slice(text.indexOf('['))) as { index: number; answer: string }[];
  return {
    scenes: items.map((it) => {
      if (it.index === 1) return { index: 1, actors: [{ model: 'unicorn', role: 'hero', anim: 'fly', count: 1, scale: 1, label: '' }], caption: 'A UNICORN', hooks: ['UNICORN'], accent: '#ffcc00' };
      if (it.index === 2) return { index: 2, actors: [{ model: 'soldier', role: 'hero', anim: 'march', count: 1, scale: 1, label: 'PÉTAIN' }], caption: 'A giant SOLDIER shouting PÉTAIN', hooks: ['SOLDIER', 'PÉTAIN'], accent: 'blue' };
      return {
        index: it.index,
        actors: [
          { model: 'tank', role: 'hero', anim: 'march', count: 1, scale: 1.2, label: '' },
          { model: 'plaque', role: 'prop', anim: 'idle', count: 1, scale: 1, label: it.answer },
        ],
        caption: `A TANK stomping on a plaque reading ${it.answer}`,
        hooks: ['TANK', 'nothere'],
        accent: '#aa3322',
      };
    }),
  };
}

const textReq = (data: string, extra: Partial<ExtractRequestIn> = {}): ExtractRequestIn => ({ code: 'ABCD', kind: 'text', data, ...extra });

function expectValidNotions(r: ExtractResponse) {
  const ids = new Set(r.notions.map((n) => n.id));
  expect(ids.size).toBe(r.notions.length);
  r.notions.forEach((n, i) => {
    // every notion must pass the strict POST /api/palace validation as-is
    expect(() => validateNotion(n, `n[${i}]`)).not.toThrow();
    for (const a of n.scene.actors) expect(isCatalogId(a.model)).toBe(true);
  });
}

describe('extract — AI path (mocked Claude)', () => {
  it('runs teacher + mnemonist, then validates & repairs everything', async () => {
    const { client, calls } = mockClient([FR_TEACHER], scenesFor);
    const r = await extract(textReq(FR_WWI), { client, env: {} });
    expect(r.engine).toBe('ai');
    expect(r.lang).toBe('fr');
    expect(r.title).toBe('La Première Guerre mondiale');
    expect(r.notions).toHaveLength(4); // duplicate question dropped
    expectValidNotions(r);

    const [verdun, armistice, petain] = r.notions;
    expect(verdun.accept).toEqual(['en 1916']);
    // distractor equal to the answer removed, refilled with a nearby date
    expect(armistice.distractors).not.toContain('11 novembre 1918');
    expect(armistice.distractors).toContain('8 mai 1945');
    // unknown model → offline composer
    expect(armistice.scene.actors[0].model).not.toBe('unicorn');
    // label on a non-text model → moved to a sign
    expect(petain.scene.actors[0].label).toBeUndefined();
    expect(petain.scene.actors.some((a) => a.model === 'sign' && a.label === 'PÉTAIN')).toBe(true);
    expect(petain.scene.accent).toBeUndefined(); // invalid colour dropped
    expect(petain.distractors).toHaveLength(2);
    expect(petain.distractors[0]).toBe('Foch');
    // hooks must appear in the caption
    expect(verdun.scene.hooks).toContain('TANK');
    expect(verdun.scene.hooks).not.toContain('nothere');
    expect(r.warnings?.join(' ')).toMatch(/1 scene was composed offline/);

    // request shape
    const teacher = calls[0];
    expect(teacher.params.model).toBe(DEFAULT_MODEL);
    expect(teacher.params.output_config?.format).toEqual({ type: 'json_schema', schema: TEACHER_SCHEMA });
    expect(teacher.params.fallbacks).toBe('default');
    expect(teacher.params.betas).toContain('server-side-fallback-2026-07-01');
    expect(teacher.params.tool_choice).toBeUndefined();
    expect(teacher.opts.maxRetries).toBe(0);
    expect(teacher.opts.timeout).toBeLessThanOrEqual(25_000);
    expect(JSON.stringify(teacher.params.messages)).toContain('Verdun');
    // mnemonist: catalog in the (cached) system prompt, model ids constrained by the schema enum
    const mn = calls[1];
    const sys = (mn.params.system as { text: string; cache_control?: unknown }[])[0];
    expect(sys.text).toContain('kangaroo |');
    expect(sys.cache_control).toEqual({ type: 'ephemeral' });
    const schema = mn.params.output_config?.format?.schema as ReturnType<typeof mnemonistSchema>;
    expect(schema.properties.scenes.items.properties.actors.items.properties.model.enum).toContain('avocado');
  });

  it('honours LOCI_MODEL and splits scenes into parallel batches of 5', async () => {
    const many = { ...FR_TEACHER, notions: Array.from({ length: 12 }, (_, i) => ({ question: `Question numéro ${i + 1} ?`, answer: `${1900 + i}`, accept: [], distractors: [`${1880 + i}`, `${1850 + i}`], type: 'date' })) };
    const { client, calls } = mockClient([many], scenesFor);
    const r = await extract(textReq(FR_WWI), { client, env: { LOCI_MODEL: 'claude-opus-5-5' } });
    expect(r.notions).toHaveLength(12);
    expect(calls.every((c) => c.params.model === 'claude-opus-5-5')).toBe(true);
    expect(calls.filter((c) => (c.params.system as { text: string }[])[0].text.includes('mnemonist'))).toHaveLength(3);
    expectValidNotions(r);
  });

  it('retries once on a timeout', async () => {
    const { client, create } = mockClient([new Anthropic.APIConnectionTimeoutError(), FR_TEACHER], scenesFor);
    const r = await extract(textReq(FR_WWI), { client, env: {} });
    expect(r.engine).toBe('ai');
    expect(create.mock.calls.filter((c) => (c[0].system as { text: string }[])[0].text.includes('course analyst'))).toHaveLength(2);
  });

  it('retries once on unparsable JSON', async () => {
    const { client } = mockClient(['{"title": "cut', FR_TEACHER], scenesFor);
    expect((await extract(textReq(FR_WWI), { client, env: {} })).engine).toBe('ai');
  });

  it('falls back to the offline splitter when the AI keeps failing', async () => {
    const err = () => new Anthropic.InternalServerError(529, { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }, 'Overloaded', new Headers());
    const { client, create } = mockClient([err(), err()], scenesFor);
    const r = await extract(textReq(EN_CHEM), { client, env: {} });
    expect(create).toHaveBeenCalledTimes(2);
    expect(r.engine).toBe('offline');
    expect(r.warnings?.[0]).toMatch(/AI service is unavailable/);
    expect(r.notions.length).toBeGreaterThan(5);
    expectValidNotions(r);
  });

  it('does not retry non-retryable errors (bad key)', async () => {
    const { client, create } = mockClient([new Anthropic.AuthenticationError(401, {}, 'invalid x-api-key', new Headers())], scenesFor);
    const r = await extract(textReq(EN_CHEM), { client, env: {} });
    expect(create).toHaveBeenCalledTimes(1);
    expect(r.engine).toBe('offline');
  });

  it('treats a refusal as a failure (offline fallback)', async () => {
    const create = vi.fn(async () => ({ ...msg(''), stop_reason: 'refusal', content: [] }));
    const client = { beta: { messages: { create } } } as unknown as Anthropic;
    const r = await extract(textReq(EN_CHEM), { client, env: {} });
    expect(r.engine).toBe('offline');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('composes every scene offline when the mnemonist is down, but keeps the AI notions', async () => {
    const { client } = mockClient([FR_TEACHER], new Anthropic.APIConnectionError({ message: 'socket hang up' }));
    const r = await extract(textReq(FR_WWI), { client, env: {} });
    expect(r.engine).toBe('ai');
    expect(r.notions).toHaveLength(4);
    expect(r.warnings?.join(' ')).toMatch(/4 scenes were composed offline/);
    expectValidNotions(r);
  });

  it('sends photos as image blocks and PDFs as document blocks', async () => {
    const png = 'iVBORw0KGgo=';
    const a = mockClient([FR_TEACHER], scenesFor);
    await extract({ code: 'ABCD', kind: 'image', mime: 'image/jpeg', data: png, more: [png, png] }, { client: a.client, env: {} });
    const content = a.calls[0].params.messages[0].content as { type: string; source?: { media_type: string } }[];
    expect(content.filter((b) => b.type === 'image')).toHaveLength(3);
    expect(content.find((b) => b.type === 'image')?.source?.media_type).toBe('image/jpeg');

    const b = mockClient([FR_TEACHER], scenesFor);
    await extract({ code: 'ABCD', kind: 'pdf', mime: 'application/pdf', data: 'JVBERi0x', textHint: FR_WWI }, { client: b.client, env: {} });
    const pc = b.calls[0].params.messages[0].content as { type: string; source?: { media_type: string } }[];
    expect(pc[0]).toMatchObject({ type: 'document', source: { type: 'base64', media_type: 'application/pdf' } });
  });

  it('uses the PDF text layer offline when the AI is down', async () => {
    const r = await extract({ code: 'ABCD', kind: 'pdf', mime: 'application/pdf', data: 'JVBERi0x', textHint: FR_WWI }, { client: null });
    expect(r.engine).toBe('offline');
    expect(r.notions.length).toBeGreaterThan(8);
    expect(r.warnings?.join(' ')).toMatch(/text layer/);
  });

  it('never calls the AI for offline requests', async () => {
    const { client, create } = mockClient([FR_TEACHER], scenesFor);
    const r = await extract(textReq(EN_CHEM, { offline: true }), { client, env: {} });
    expect(create).not.toHaveBeenCalled();
    expect(r.engine).toBe('offline');
  });
});

describe('extract — offline path', () => {
  it('explains that photos need the AI', async () => {
    const r = await extract({ code: 'ABCD', kind: 'image', mime: 'image/jpeg', data: 'iVBORw0KGgo=' }, { client: null });
    expect(r.notions).toEqual([]);
    expect(r.warnings).toContain('Photos need the AI service — paste the text instead.');
  });

  it('builds a valid French palace from a WWI lesson', async () => {
    const r = await extract(textReq(FR_WWI), { client: null });
    expect(r.engine).toBe('offline');
    expect(r.lang).toBe('fr');
    expect(r.subject).toBe('History');
    expect(r.title).toBe('La Première Guerre mondiale (1914-1918)');
    expectValidNotions(r);
    const armistice = r.notions.find((n) => n.answer === '11 novembre 1918');
    expect(armistice?.question).toMatch(/armistice/i);
    expect(armistice?.accept).toContain('1918');
    // scenes vary across the palace
    const heroes = new Set(r.notions.map((n) => n.scene.actors[0].model));
    expect(heroes.size).toBeGreaterThan(r.notions.length / 2);
  });

  it('is used when no key is configured', async () => {
    const r = await extract(textReq(EN_CHEM), { env: {} });
    expect(r.engine).toBe('offline');
    expect(r.notions.find((n) => n.answer.startsWith('6.02'))?.question).toBe('Avogadro constant = ?');
  });
});
