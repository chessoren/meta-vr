import { describe, expect, it } from 'vitest';
import { BUILTIN_PALACES, CAPITALS, WORLD_WARS, getBuiltinPalace, isBuiltinPalaceId } from '../../../src/core/palaces';
import { matchAnswer, normalize, pickFromTranscript, spokenForms, voiceGrammar } from '../../../src/core/matching';
import { isTextModel } from '../../../src/core/catalog-index';
import { MAX_NOTIONS, type AnimId, type Palace } from '../../../src/core/types';
import { requiredIds } from './helpers';

const REQUIRED = new Set(requiredIds());
const ANIMS = new Set<AnimId>(['idle', 'bounce', 'spin', 'wobble', 'orbit', 'juggle', 'float', 'shake', 'grow', 'march', 'fly', 'rain', 'stack', 'flip', 'dance']);
const TEXT_CAPABLE = new Set(['sign', 'plaque', 'scroll', 'flag', 'book']);

function validatePalace(p: Palace) {
  expect(p.builtin).toBe(true);
  expect(p.lang).toBe('en');
  expect(p.notions.length).toBeLessThanOrEqual(MAX_NOTIONS);
  const ids = p.notions.map((n) => n.id);
  expect(new Set(ids).size, 'unique notion ids').toBe(ids.length);
  for (const n of p.notions) {
    const ctx = `${p.id}/${n.id}`;
    expect(n.question.trim(), ctx).not.toBe('');
    expect(n.question.length, ctx).toBeLessThanOrEqual(90);
    expect(n.answer.length, ctx).toBeLessThanOrEqual(24);
    // Distractors: exactly two, distinct from each other and from the answer.
    expect(n.distractors, ctx).toHaveLength(2);
    const [d1, d2] = n.distractors.map(normalize);
    expect(d1, ctx).not.toBe(d2);
    expect(d1, ctx).not.toBe(normalize(n.answer));
    expect(d2, ctx).not.toBe(normalize(n.answer));
    for (const a of n.accept ?? []) for (const d of n.distractors) expect(normalize(a), `${ctx} accept vs distractor`).not.toBe(normalize(d));
    // Matching sanity: the answer (and its spoken forms) is right, the distractors are wrong.
    expect(matchAnswer(n.answer, n).correct, `${ctx} answer`).toBe(true);
    for (const a of n.accept ?? []) expect(matchAnswer(a, n).correct, `${ctx} accept ${a}`).toBe(true);
    for (const d of n.distractors) expect(matchAnswer(d, n).correct, `${ctx} distractor ${d}`).toBe(false);
    const forms = spokenForms(n.answer);
    expect(forms.length, `${ctx} spoken forms`).toBeGreaterThan(0);
    for (const f of forms) expect(matchAnswer(f, n).correct, `${ctx} spoken ${f}`).toBe(true);
    expect(pickFromTranscript(forms[0], n)?.index, `${ctx} voice`).toBe(0);
    for (const [i, d] of n.distractors.entries()) {
      const df = spokenForms(d);
      expect(df.length).toBeGreaterThan(0);
      expect(pickFromTranscript(df[0], n)?.index, `${ctx} voice distractor ${d}`).toBe(i + 1);
    }
    // Scene contract.
    const s = n.scene;
    expect(s.actors.length, ctx).toBeGreaterThanOrEqual(1);
    expect(s.actors.length, ctx).toBeLessThanOrEqual(3);
    expect(s.actors[0].role, ctx).toBe('hero');
    for (const a of s.actors) {
      expect(REQUIRED.has(a.model), `${ctx} model ${a.model}`).toBe(true);
      expect(ANIMS.has(a.anim), `${ctx} anim ${a.anim}`).toBe(true);
      if (a.label !== undefined) {
        expect(TEXT_CAPABLE.has(a.model), `${ctx} label on ${a.model}`).toBe(true);
        expect(isTextModel(a.model)).toBe(true);
        expect(a.label.length, ctx).toBeLessThanOrEqual(24);
      }
      if (a.role === 'count') {
        expect(Number.isInteger(a.count), ctx).toBe(true);
        expect(a.count!, ctx).toBeGreaterThanOrEqual(1);
        expect(a.count!, ctx).toBeLessThanOrEqual(12);
      } else expect(a.count, ctx).toBeUndefined();
      if (a.tint) expect(a.tint).toMatch(/^#[0-9a-f]{6}$/i);
      if (a.scale !== undefined) expect(a.scale).toBeGreaterThan(0);
    }
    expect(s.caption.length, ctx).toBeLessThanOrEqual(130);
    expect(s.hooks?.length, ctx).toBeGreaterThan(0);
    for (const h of s.hooks ?? []) expect(s.caption, `${ctx} hook ${h}`).toContain(h);
    expect(s.accent).toMatch(/^#[0-9a-f]{6}$/i);
  }
  // The whole palace works with a restricted voice grammar.
  const g = voiceGrammar(p.notions);
  expect(g).toContain('[unk]');
  for (const phrase of g) if (phrase !== '[unk]') expect(phrase).toMatch(/^[a-z]+( [a-z]+)*$/);
}

describe('CAPITALS (onboarding)', () => {
  it('is valid', () => validatePalace(CAPITALS));
  it('has exactly the five trick capitals, in order, with the famous wrong answers', () => {
    expect(CAPITALS).toMatchObject({ id: 'capitals', builtin: true, lang: 'en', subject: 'Geography', title: 'Five tricky capitals' });
    expect(CAPITALS.notions.map((n) => [n.question, n.answer])).toEqual([
      ['Capital of Australia?', 'Canberra'],
      ['Capital of Switzerland?', 'Bern'],
      ['Capital of Turkey?', 'Ankara'],
      ['Capital of Canada?', 'Ottawa'],
      ['Capital of New Zealand?', 'Wellington'],
    ]);
    expect(CAPITALS.notions.map((n) => n.distractors)).toEqual([
      ['Sydney', 'Melbourne'],
      ['Zurich', 'Geneva'],
      ['Istanbul', 'Izmir'],
      ['Toronto', 'Vancouver'],
      ['Auckland', 'Christchurch'],
    ]);
  });
  it('uses the hand-crafted sound-alike scenes', () => {
    const models = CAPITALS.notions.map((n) => n.scene.actors.map((a) => a.model));
    expect(models).toEqual([
      ['kangaroo', 'can'],
      ['cheese', 'fire'],
      ['turkey', 'anchor'],
      ['otter', 'wave'],
      ['sheep', 'boot'],
    ]);
    expect(CAPITALS.notions[0].scene.actors[0].anim).toBe('bounce');
    expect(CAPITALS.notions[4].scene.actors[1].anim).toBe('march');
  });
});

describe('WORLD_WARS (video demo)', () => {
  it('is valid', () => validatePalace(WORLD_WARS));
  it('has 20 notions: 10 WWI then 10 WWII', () => {
    expect(WORLD_WARS).toMatchObject({ id: 'world-wars', builtin: true, lang: 'en', subject: 'History', title: 'World Wars I & II' });
    expect(WORLD_WARS.notions).toHaveLength(20);
    expect(WORLD_WARS.notions.slice(0, 10).every((n) => n.id.startsWith('ww1-'))).toBe(true);
    expect(WORLD_WARS.notions.slice(10).every((n) => n.id.startsWith('ww2-'))).toBe(true);
  });
  it('covers the key facts', () => {
    const answers = WORLD_WARS.notions.map((n) => n.answer);
    for (const a of ['1914', 'Sarajevo', '11 November', '1919', 'Verdun', '1917', 'Zimmermann telegram', 'Brest-Litovsk', 'League of Nations', 'Gallipoli', 'Poland', '1940', 'Operation Barbarossa', '7 December 1941', 'Stalingrad', '6 June 1944', 'Normandy', 'Bletchley Park', '8 May 1945', 'United Nations'])
      expect(answers).toContain(a);
  });
  it('stays tasteful: no weapons among the models', () => {
    const banned = new Set(['sword', 'cannon']);
    for (const n of WORLD_WARS.notions) for (const a of n.scene.actors) expect(banned.has(a.model), n.id).toBe(false);
    for (const n of WORLD_WARS.notions) expect(n.scene.caption.toLowerCase()).not.toMatch(/swastika|blood|kill|dead|corpse|gun/);
  });
  it('date answers accept spoken variants', () => {
    const dday = WORLD_WARS.notions.find((n) => n.id === 'ww2-d-day')!;
    expect(matchAnswer('june sixth nineteen forty four', dday).correct).toBe(true);
    expect(matchAnswer('June 6', dday).correct).toBe(true);
    expect(matchAnswer('6 June 1943', dday).correct).toBe(false);
    const armistice = WORLD_WARS.notions.find((n) => n.id === 'ww1-armistice')!;
    expect(matchAnswer('the eleventh of november', armistice).correct).toBe(true);
    expect(matchAnswer('ninth of november', armistice).correct).toBe(false);
  });
});

describe('BUILTIN_PALACES', () => {
  it('lists onboarding first and resolves by id', () => {
    expect(BUILTIN_PALACES.map((p) => p.id)).toEqual(['capitals', 'world-wars']);
    expect(getBuiltinPalace('world-wars')).toBe(WORLD_WARS);
    expect(getBuiltinPalace('nope')).toBeUndefined();
    expect(isBuiltinPalaceId('capitals')).toBe(true);
    expect(isBuiltinPalaceId('mine')).toBe(false);
  });
  it('notion ids are unique across built-in palaces', () => {
    const ids = BUILTIN_PALACES.flatMap((p) => p.notions.map((n) => n.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
