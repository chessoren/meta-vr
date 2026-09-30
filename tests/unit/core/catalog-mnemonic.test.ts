import { describe, expect, it } from 'vitest';
import { CATALOG_INDEX, TEXT_MODEL_IDS, catalogEntry, isCatalogId, isTextModel } from '../../../src/core/catalog-index';
import { composeScene, isValidRecipe, phoneticKey, salientCount, soundAlikes, STRONG_LINK, MAX_LABEL, LABEL_CHARS } from '../../../src/core/mnemonic';
import type { AnimId, SceneRecipe } from '../../../src/core/types';
import { requiredIds } from './helpers';

const ANIMS: AnimId[] = ['idle', 'bounce', 'spin', 'wobble', 'orbit', 'juggle', 'float', 'shake', 'grow', 'march', 'fly', 'rain', 'stack', 'flip', 'dance'];
const REQUIRED = requiredIds();

describe('CATALOG_INDEX', () => {
  it('covers exactly the REQUIRED_IDS, once each', () => {
    const ids = CATALOG_INDEX.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...REQUIRED].sort());
    expect(REQUIRED.length).toBeGreaterThanOrEqual(90);
  });
  it('has rich, clean metadata', () => {
    for (const c of CATALOG_INDEX) {
      expect(c.name.length, c.id).toBeGreaterThan(1);
      expect(c.tags.length, c.id).toBeGreaterThanOrEqual(6);
      expect(c.soundsLike.length, c.id).toBeGreaterThanOrEqual(3);
      expect(c.anims.length, c.id).toBeGreaterThanOrEqual(3);
      for (const a of c.anims) expect(ANIMS, `${c.id}:${a}`).toContain(a);
      for (const s of [...c.tags, ...c.soundsLike]) expect(s, c.id).toMatch(/^[a-z0-9][a-z0-9 '-]*$/);
      expect(new Set(c.tags).size, `${c.id} tags`).toBe(c.tags.length);
      expect(new Set(c.soundsLike).size, `${c.id} soundsLike`).toBe(c.soundsLike.length);
      expect(['animal', 'person', 'food', 'nature', 'science', 'object', 'vehicle', 'structure']).toContain(c.category);
    }
  });
  it('text-capable models are exactly sign, plaque, scroll, flag, book', () => {
    expect([...TEXT_MODEL_IDS].sort()).toEqual(['book', 'flag', 'plaque', 'scroll', 'sign']);
    expect(isTextModel('sign')).toBe(true);
    expect(isTextModel('cat')).toBe(false);
    expect(isTextModel('nope')).toBe(false);
  });
  it('lookups', () => {
    expect(catalogEntry('avocado')?.soundsLike).toContain('avo');
    expect(catalogEntry('nope')).toBeUndefined();
    expect(isCatalogId('otter')).toBe(true);
    expect(isCatalogId(3)).toBe(false);
  });
});

describe('phonetics', () => {
  it.each([
    ['Avogadro', 'avgdr'],
    ['avocado', 'avkd'],
    ['Canberra', 'knbr'],
    ['photo', 'ft'],
    ['Ciel', 'sl'],
    ['Château', 'xt'],
    ['quiz', 'ks'],
    ['xylophone', 'kslfn'],
    ['', ''],
    ['123', ''],
    ['Thames', 'tms'],
    ['cygne', 'sn'],
    ['Ghana', 'gn'],
    ['Schubert', 'xbrt'],
  ])('%s → %s', (w, k) => expect(phoneticKey(w)).toBe(k));
  it('soundAlikes', () => {
    expect(soundAlikes('Avogadro')[0].id).toBe('avocado');
    expect(soundAlikes('Ottawa')[0].id).toBe('otter');
    expect(soundAlikes('Wellington').map((x) => x.id)).toContain('boot');
    expect(soundAlikes('ab')).toEqual([]);
    expect(soundAlikes('zzzzqqq')).toEqual([]);
  });
  it('salientCount', () => {
    expect(salientCount('6.02')).toBe(6);
    expect(salientCount('11')).toBe(11);
    expect(salientCount('1914')).toBe(4);
    expect(salientCount('1911')).toBe(11);
    expect(salientCount('1905')).toBe(5);
    expect(salientCount('1940')).toBe(4);
    expect(salientCount('1900')).toBe(9);
    expect(salientCount('0')).toBe(1);
    expect(salientCount('45')).toBe(5);
    expect(salientCount('300')).toBe(3);
  });
});

function checkRecipe(r: SceneRecipe) {
  expect(isValidRecipe(r, (id) => REQUIRED.includes(id))).toBe(true);
  expect(r.actors[0].role === 'hero' || r.actors[0].role === 'count').toBe(true);
  expect(new Set(r.actors.map((a) => a.model)).size).toBe(r.actors.length);
  for (const a of r.actors) {
    expect(catalogEntry(a.model)).toBeDefined();
    if (a.label !== undefined) expect(isTextModel(a.model)).toBe(true);
    if (a.role === 'count') expect(a.count).toBeGreaterThanOrEqual(1);
  }
  expect(r.caption.length).toBeLessThan(160);
  expect(r.caption).not.toMatch(/\n/);
  for (const h of r.hooks ?? []) {
    expect(r.caption).toContain(h);
    expect(h).toBe(h.toUpperCase());
  }
  expect(r.hooks?.length).toBeGreaterThan(0);
  expect(r.accent).toMatch(/^#[0-9a-f]{6}$/i);
}

describe('composeScene', () => {
  it('Avogadro → a giant AVOCADO juggling 6 of something + the number on a label', () => {
    const r = composeScene("What is Avogadro's number (×10²³)?", '6.02');
    checkRecipe(r);
    const a = composeScene('Who gave his name to the number 6.02×10²³?', 'Avogadro');
    checkRecipe(a);
    expect(a.actors[0].model).toBe('avocado');
    expect(a.caption).toContain('AVOCADO');
    expect(a.caption).toMatch(/AVO-gadro!/);
    expect(a.hooks).toEqual(expect.arrayContaining(['AVOCADO', 'AVO']));
    expect(a.actors.some((x) => x.label)).toBe(false); // strong sound-alike: no label needed
  });

  it('numbers → count actor with a salient digit and a text prop carrying the number', () => {
    const r = composeScene('Year World War I began?', '1914');
    checkRecipe(r);
    const count = r.actors.find((a) => a.role === 'count');
    expect(count?.count).toBe(4);
    const label = r.actors.find((a) => a.label);
    expect(label?.label).toBe('1914');
    expect(r.caption).toMatch(/4 [A-Z]+/);
  });

  it('weak sound link → label with the answer on a text-capable prop, meaning link from the question', () => {
    const r = composeScene('Which treaty ended World War I?', 'Treaty of Versailles');
    checkRecipe(r);
    const label = r.actors.find((a) => a.label);
    expect(label).toBeDefined();
    expect(label!.model).toBe('scroll');
    // The label carries the key word only (short, never a truncated sentence) …
    expect(label!.label).toBe('Versailles');
    expect(r.caption).toContain('"VERSAILLES"');
    // … and the hero is the Versailles castle, not a generic fallback.
    expect(r.actors[0].model).toBe('castle');
  });

  it('two-part puns: CAN-BERra', () => {
    const r = composeScene('Capital of Australia?', 'Canberra');
    checkRecipe(r);
    expect(['can', 'kangaroo', 'cannon']).toContain(r.actors[0].model);
    expect(r.caption).toMatch(/CAN/);
  });

  it('is deterministic and varies with the seed', () => {
    expect(composeScene('Q?', 'Photosynthesis')).toEqual(composeScene('Q?', 'Photosynthesis'));
    const variants = new Set(Array.from({ length: 8 }, (_, i) => JSON.stringify(composeScene('Capital of Peru?', 'Lima', { seed: i }))));
    expect(variants.size).toBeGreaterThan(1);
  });

  it('avoids models already used when possible', () => {
    const base = composeScene('Capital of Canada?', 'Ottawa');
    expect(base.actors[0].model).toBe('otter');
    const other = composeScene('Capital of Canada?', 'Ottawa', { avoid: ['otter'] });
    checkRecipe(other);
  });

  it('falls back gracefully on hard inputs', () => {
    const inputs: Array<[string, string]> = [
      ['', ''],
      ['?', 'x'],
      ['Quelle est la capitale de la France ?', 'Paris'],
      ['Formule de l’eau ?', 'H₂O'],
      ['Mitochondria function?', 'Produces ATP, the energy currency of the cell, through cellular respiration'],
      ['Speed of light?', '299 792 458 m/s'],
      ['Pi?', '3.14159'],
      ['Zero?', '0'],
      ['Big number?', '123456789012'],
      ['Emoji?', '🦘🦘'],
    ];
    for (const [q, a] of inputs) {
      const r = composeScene(q, a);
      checkRecipe(r);
      for (const act of r.actors) if (act.label) expect(act.label.length).toBeLessThanOrEqual(MAX_LABEL);
    }
  });

  it('produces valid scenes for a large variety of answers', () => {
    const answers = ['Napoleon', 'Einstein', 'Mitochondria', 'Photosynthesis', 'Berlin', 'Moscow', 'Tokyo', 'Lima', 'Oxygen', 'Hydrogen', 'Mars', 'Jupiter', 'Shakespeare', 'Mozart', 'Beethoven', 'Da Vinci', 'Picasso', 'Nile', 'Amazon', 'Everest', '1789', '1492', '42', '3', '12', 'Pythagoras', 'Archimedes', 'Newton', 'Darwin', 'Curie', 'Magna Carta', 'Renaissance', 'Bastille', 'Waterloo', 'Trafalgar', 'Kilimanjaro', 'Sahara', 'Antarctica', 'Pacific', 'Atlantic'];
    const heroes = new Set<string>();
    for (const a of answers) {
      const r = composeScene(`Question about ${a}?`, a);
      checkRecipe(r);
      heroes.add(r.actors[0].model);
    }
    expect(heroes.size).toBeGreaterThan(12);
  });

  it('meaning link from the answer itself (Newton → apple)', () => {
    const r = composeScene('Who formulated the law of universal gravitation?', 'Newton');
    checkRecipe(r);
    expect(r.actors[0].model).toBe('apple');
  });

  it('picks the text prop from the question', () => {
    const label = (q: string, a: string) => composeScene(q, a).actors.find((x) => x.label)?.model;
    expect(label('Which country borders Chad to the north?', 'Libya')).toBe('flag');
    expect(label('Who wrote Les Misérables?', 'Hugo')).toBe('book');
    expect(label('Who discovered penicillin?', 'Fleming')).toBe('plaque');
    expect(['sign', 'plaque', 'scroll']).toContain(label('Magic word?', 'Xyzzy'));
  });

  it('long answers with a date carry just the (short) date on the label, never a truncated sentence', () => {
    const r = composeScene('When did the Berlin Wall fall?', 'On the 9th of November 1989 in Berlin');
    checkRecipe(r);
    expect(r.actors.find((a) => a.label)?.label).toBe('9 Nov 1989');
    const long = composeScene('Motto?', 'Liberty, equality, fraternity for everyone');
    checkRecipe(long);
    for (const a of long.actors) if (a.label) expect(a.label.length).toBeLessThanOrEqual(LABEL_CHARS);
    expect(JSON.stringify(long)).not.toContain('…');
  });

  it('many seeds keep every scene valid (count phrases, puns, labels)', () => {
    const qa: Array<[string, string]> = [['Avogadro number?', '6.02'], ['Capital of Australia?', 'Canberra'], ['Year?', '1789'], ['Pi?', '3.14'], ['Planets?', '8'], ['Months?', '12']];
    const phrases = new Set<string>();
    for (const [q, a] of qa)
      for (let seed = 0; seed < 25; seed++) {
        const r = composeScene(q, a, { seed });
        checkRecipe(r);
        const m = /(juggling|falling|stack of|with) \d+/.exec(r.caption);
        if (m) phrases.add(m[1]);
      }
    expect(phrases.size).toBeGreaterThanOrEqual(3);
  });

  it('exports its threshold', () => expect(STRONG_LINK).toBeGreaterThan(0));
});

describe('isValidRecipe', () => {
  const ok = (id: string) => REQUIRED.includes(id);
  it('rejects broken recipes', () => {
    expect(isValidRecipe(null as unknown as SceneRecipe, ok)).toBe(false);
    expect(isValidRecipe({ actors: [], caption: 'x' }, ok)).toBe(false);
    expect(isValidRecipe({ actors: [{ model: 'cat', role: 'hero', anim: 'idle' }], caption: ' ' }, ok)).toBe(false);
    expect(isValidRecipe({ actors: [{ model: 'unicorn', role: 'hero', anim: 'idle' }], caption: 'x' }, ok)).toBe(false);
    expect(isValidRecipe({ actors: [{ model: 'cat', role: 'hero', anim: 'idle', label: 'x' }], caption: 'x' }, ok)).toBe(false);
    expect(isValidRecipe({ actors: [{ model: 'cat', role: 'count', anim: 'idle', count: 13 }], caption: 'x' }, ok)).toBe(false);
    const four = Array.from({ length: 4 }, () => ({ model: 'cat', role: 'prop' as const, anim: 'idle' as const }));
    expect(isValidRecipe({ actors: four, caption: 'x' }, ok)).toBe(false);
    expect(isValidRecipe({ actors: [{ model: 'sign', role: 'hero', anim: 'idle', label: 'OK' }], caption: 'x' }, ok)).toBe(true);
  });
});
