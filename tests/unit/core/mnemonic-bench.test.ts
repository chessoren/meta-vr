/**
 * Quality benchmark of the offline mnemonic composer on realistic high-school notions, in English
 * and French (lycée). Every notion must give a valid, short-labelled, answer-linked scene; the set
 * as a whole must avoid generic fallback heroes and never repeat a hero twice in a row. A table of
 * question → caption is printed so a human can judge the images.
 */
import { describe, expect, it } from 'vitest';
import { catalogEntry, isTextModel } from '../../../src/core/catalog-index';
import { baseTokens } from '../../../src/core/matching';
import { composeScene, composeSceneDetailed, isValidRecipe, LABEL_CHARS, MAX_CAPTION, stem, type Composition } from '../../../src/core/mnemonic';
import { requiredIds } from './helpers';

const REQUIRED = requiredIds();

/** [question, answer] — in palace order (the composer gets the previous heroes as `avoid`). */
const BENCH: Array<[string, string]> = [
  // English
  ['What is the mitochondria?', 'the powerhouse of the cell'],
  ['In which year did World War I begin?', '1914'],
  ['Capital of Australia?', 'Canberra'],
  ['Capital of Canada?', 'Ottawa'],
  ["What is Avogadro's number?", '6.02 × 10²³'],
  ['Chemical formula of water?', 'H2O'],
  ['Which gas do plants release during photosynthesis?', 'Oxygen'],
  ['Who formulated the law of universal gravitation?', 'Isaac Newton'],
  ['Who painted the Mona Lisa?', 'Leonardo da Vinci'],
  ['Which treaty ended World War I?', 'Treaty of Versailles'],
  ['Capital of Japan?', 'Tokyo'],
  ['Speed of light in a vacuum?', '300,000 km/s'],
  ['In which year did Columbus reach America?', '1492'],
  ['Largest planet of the solar system?', 'Jupiter'],
  ['Chemical symbol of gold?', 'Au'],
  ['Who wrote Romeo and Juliet?', 'William Shakespeare'],
  ['What does DNA stand for?', 'deoxyribonucleic acid'],
  ['When did the Berlin Wall fall?', '9 November 1989'],
  ['First man to walk on the Moon?', 'Neil Armstrong'],
  ['Boiling point of water at sea level?', '100 °C'],
  ['Longest river in Africa?', 'the Nile'],
  ['Pythagorean theorem?', 'a² + b² = c²'],
  ['Who developed the theory of relativity?', 'Albert Einstein'],
  ["What does 'ephemeral' mean?", 'lasting a very short time'],
  ['Date of the D-Day landings?', '6 June 1944'],
  ['Atomic number of carbon?', '6'],
  ['First President of the United States?', 'George Washington'],
  ['What is the largest ocean on Earth?', 'the Pacific Ocean'],
  ['What does a catalyst do?', 'speeds up a chemical reaction'],
  ["Author of 'On the Origin of Species'?", 'Charles Darwin'],
  // Français (lycée)
  ['Début de la Révolution française ?', '1789'],
  ["Qu'est-ce que la mitochondrie ?", 'la centrale énergétique de la cellule'],
  ['Signature du traité de Versailles ?', '1919'],
  ['Capitale du Kenya ?', 'Nairobi'],
  ['Que produit la photosynthèse ?', "de l'oxygène"],
  ["Nombre d'Avogadro ?", '6,02 × 10²³'],
  ["Date de l'appel du général de Gaulle ?", '18 juin 1940'],
  ["Capitale de l'Espagne ?", 'Madrid'],
  ['Formule du sel de table ?', 'NaCl'],
  ['Prise de la Bastille ?', '14 juillet 1789'],
  ['Qui a écrit Les Misérables ?', 'Victor Hugo'],
  ["Chute de l'Empire romain d'Occident ?", '476'],
  ['Couronnement de Charlemagne ?', "l'an 800"],
  ["Capitale de l'Allemagne ?", 'Berlin'],
  ["Vitesse du son dans l'air ?", '340 m/s'],
  ['Organe qui pompe le sang ?', 'le cœur'],
  ['Unité de la force ?', 'le newton'],
  ['Premier empereur des Français ?', 'Napoléon Bonaparte'],
  ['Symbole chimique du fer ?', 'Fe'],
  ['Capitale du Brésil ?', 'Brasilia'],
  ['Formule du dioxyde de carbone ?', 'CO2'],
  ['Armistice de la Première Guerre mondiale ?', '11 novembre 1918'],
  ['Capitale du Portugal ?', 'Lisbonne'],
  ["Gaz le plus abondant de l'atmosphère ?", "l'azote"],
];

const STOP = new Set('the a an of le la les de du des l d un une up very'.split(' '));

/** The answer's key tokens: its content words and numbers (normalised). */
function keyTokens(answer: string): string[] {
  const toks = baseTokens(answer.replace(/(?<![\p{L}])(?:qu|[dljmnstc])['’](?=\p{L})/giu, ' ')).filter((t) => !STOP.has(t));
  const long = toks.filter((t) => t.length >= 3 || /\d/.test(t));
  return long.length ? long : toks;
}

function runBench(): Array<{ q: string; a: string; c: Composition }> {
  const heroes: string[] = [];
  return BENCH.map(([q, a]) => {
    const c = composeSceneDetailed(q, a, { avoid: [...heroes] });
    heroes.push(c.recipe.actors[0].model);
    return { q, a, c };
  });
}

describe('mnemonic benchmark (EN + FR high-school notions)', () => {
  const results = runBench();

  it('prints the table for human review', () => {
    const rows = results.map(({ q, a, c }, i) => {
      const r = c.recipe;
      const actors = r.actors.map((x) => x.model + (x.count ? `×${x.count}` : '') + (x.label ? `["${x.label}"]` : '')).join(' + ');
      return `${String(i + 1).padStart(2)}. ${q} → ${a}\n    [${c.heroSource}${c.heroKind ? '/' + c.heroKind : ''}] ${actors}\n    ${r.caption}`;
    });
    console.log(`\nOffline mnemonic benchmark (${results.length} notions)\n\n${rows.join('\n')}\n`);
    expect(rows.length).toBe(BENCH.length);
  });

  it.each(BENCH.map((qa, i) => [i + 1, ...qa] as const))('#%i %s → %s: valid, short, answer-linked', (i) => {
    const { a, c } = results[i - 1];
    const r = c.recipe;
    // Valid recipe: 1–3 known actors, labels only on text models, counts 1–12, distinct models.
    expect(isValidRecipe(r, (id) => REQUIRED.includes(id))).toBe(true);
    expect(r.actors.length).toBeGreaterThanOrEqual(1);
    expect(r.actors.length).toBeLessThanOrEqual(3);
    expect(new Set(r.actors.map((x) => x.model)).size).toBe(r.actors.length);
    expect(r.actors[0].role).toBe('hero');
    for (const x of r.actors) {
      expect(catalogEntry(x.model), x.model).toBeDefined();
      if (x.label !== undefined) {
        expect(isTextModel(x.model)).toBe(true);
        expect(x.label.length).toBeLessThanOrEqual(LABEL_CHARS);
        expect(x.label.trim()).toBe(x.label);
        expect(x.label).not.toMatch(/…|\.\.\./);
      }
      if (x.role === 'count') {
        expect(Number.isInteger(x.count)).toBe(true);
        expect(x.count).toBeGreaterThanOrEqual(1);
        expect(x.count).toBeLessThanOrEqual(12);
      }
      const anims = catalogEntry(x.model)!.anims;
      if (x.role !== 'count') expect(anims, `${x.model}:${x.anim}`).toContain(x.anim);
    }
    // Caption: one line, ≤ 160, no truncation, hooks in CAPS present in it, ends with the link.
    expect(r.caption.length).toBeLessThanOrEqual(MAX_CAPTION);
    expect(r.caption).not.toMatch(/\n|…/);
    expect(r.caption).toMatch(/^A giant [A-Z]/);
    expect(r.caption).toMatch(/ — .+!$/);
    expect(r.hooks?.length).toBeGreaterThan(0);
    for (const h of r.hooks ?? []) {
      expect(r.caption).toContain(h);
      expect(h).toBe(h.toLocaleUpperCase('en'));
    }
    // The answer's key word or number appears in the caption or on the label.
    // (Pun hyphens are joined: "CAN-BER-ra" spells Canberra.)
    const spelled = r.caption.replace(/(?<=\p{L})-(?=\p{L})/gu, '');
    const shown = new Set(baseTokens([r.caption, spelled, ...r.actors.map((x) => x.label ?? '')].join(' ')));
    const shownStems = new Set([...shown].map(stem));
    const keys = keyTokens(a);
    expect(
      keys.some((k) => shown.has(k) || shownStems.has(stem(k))),
      `none of ${keys.join('/')} in "${r.caption}"`,
    ).toBe(true);
  });

  it('heroes are linked, not generic fallbacks (≥ 80 %), and mostly linked to the answer itself', () => {
    const generic = results.filter(({ c }) => c.heroSource === 'fallback' || (c.heroSource === 'weak' && ['owl', 'elephant'].includes(c.recipe.actors[0].model)));
    expect(generic.length / results.length).toBeLessThanOrEqual(0.2);
    expect(results.filter(({ c }) => ['owl', 'elephant'].includes(c.recipe.actors[0].model)).length / results.length).toBeLessThanOrEqual(0.2);
    // Word answers (not numbers/formulas): the hero comes from the answer for most of them.
    const wordAnswers = results.filter(({ a }) => /\p{L}{3}/u.test(a) && !/\d/.test(a));
    const fromAnswer = wordAnswers.filter(({ c }) => c.heroSource === 'answer');
    expect(fromAnswer.length / wordAnswers.length).toBeGreaterThanOrEqual(0.75);
  });

  it('never gives two consecutive notions the same hero, and varies heroes across the palace', () => {
    for (let i = 1; i < results.length; i++) {
      expect(results[i].c.recipe.actors[0].model, `#${i + 1}`).not.toBe(results[i - 1].c.recipe.actors[0].model);
    }
    expect(new Set(results.map(({ c }) => c.recipe.actors[0].model)).size).toBeGreaterThanOrEqual(30);
  });

  it('binds the question to the answer: most scenes name a question hook before the answer', () => {
    const bound = results.filter(({ c }) => / — [^:]+: /.test(c.recipe.caption));
    expect(bound.length / results.length).toBeGreaterThanOrEqual(0.8);
  });

  it('is deterministic and fast (< 2 ms per notion)', () => {
    expect(runBench().map((x) => x.c)).toEqual(results.map((x) => x.c));
    for (let k = 0; k < 3; k++) runBench(); // warm up
    const t0 = performance.now();
    const rounds = 5;
    for (let k = 0; k < rounds; k++) runBench();
    const ms = (performance.now() - t0) / (rounds * BENCH.length);
    expect(ms).toBeLessThan(2);
  });
});

describe('mnemonist rules (golden scenes, no palace context)', () => {
  const scene = (q: string, a: string) => composeScene(q, a);
  const models = (q: string, a: string) => scene(q, a).actors.map((x) => x.model);

  it('compound words split into two images: POWER-HOUSE → house + lightning', () => {
    const r = scene('What is the mitochondria?', 'the powerhouse of the cell');
    expect(r.actors.map((x) => x.model)).toEqual(['house', 'lightning']);
    expect(r.caption).toContain('POWER-HOUSE');
    expect(r.hooks).toEqual(expect.arrayContaining(['HOUSE', 'POWER', 'MITOCHONDRIA']));
    expect(r.actors.some((x) => x.label)).toBe(false);
  });

  it('anim puns: SHAKE-SPEARe → a shaking sword', () => {
    const r = scene('Who wrote Romeo and Juliet?', 'William Shakespeare');
    expect(r.actors[0]).toMatchObject({ model: 'sword', anim: 'shake' });
    expect(r.caption).toMatch(/SHAKE-SPEAR/);
  });

  it('two-syllable puns + a question prop: NAI-robi → knight, KENYA → key', () => {
    expect(models('Capitale du Kenya ?', 'Nairobi')).toEqual(['knight', 'key']);
    expect(scene('Capital of Canada?', 'Ottawa').caption).toMatch(/OTTA-WA/);
    expect(models('Capital of Canada?', 'Ottawa').slice(0, 2)).toEqual(['otter', 'wave']);
  });

  it('meaning links in French: cœur → lion (Cœur de Lion), oxygène → tree, azote → balloon', () => {
    expect(scene('Organe qui pompe le sang ?', 'le cœur').actors[0].model).toBe('lion');
    expect(scene('Que produit la photosynthèse ?', "de l'oxygène").actors[0].model).toBe('tree');
    expect(scene("Gaz le plus abondant de l'atmosphère ?", "l'azote").actors[0].model).toBe('balloon');
  });

  it('years: hero from the question, plaque with the year, count from its digits', () => {
    const r = scene('In which year did World War I begin?', '1914');
    expect(['soldier', 'helmet', 'tank']).toContain(r.actors[0].model);
    expect(r.actors.find((x) => x.label)).toMatchObject({ model: 'plaque', label: '1914' });
    expect(r.actors.find((x) => x.role === 'count')?.count).toBe(4);
    expect(r.caption).toContain('WORLD WAR I: 1914');
  });

  it('dates: French month abbreviated only when needed, day as the count when ≤ 12', () => {
    const a = scene('Armistice de la Première Guerre mondiale ?', '11 novembre 1918');
    expect(a.actors.find((x) => x.label)?.label).toBe('11 nov. 1918');
    expect(a.actors.find((x) => x.role === 'count')?.count).toBe(11);
    const b = scene("Date de l'appel du général de Gaulle ?", '18 juin 1940');
    expect(b.actors[0].model).toBe('radio');
    expect(b.actors.find((x) => x.label)?.label).toBe('18 juin 1940');
    expect(b.actors.some((x) => x.role === 'count')).toBe(false);
  });

  it('formulas and symbols: no count, the formula on a sign, hero from the question', () => {
    const r = scene('Chemical formula of water?', 'H2O');
    expect(r.actors[0].model).toBe('wave');
    expect(r.actors.find((x) => x.label)?.label).toBe('H2O');
    expect(r.actors.some((x) => x.role === 'count')).toBe(false);
    expect(scene('Chemical symbol of gold?', 'Au').actors.find((x) => x.label)?.label).toBe('Au');
  });

  it('French elisions and articles never leak into labels', () => {
    expect(scene("Gaz le plus abondant de l'atmosphère ?", "l'azote").actors.find((x) => x.label)?.label).toBe('azote');
    expect(scene('Who developed the theory of relativity?', 'Albert Einstein').actors.find((x) => x.label)?.label).toBe('Einstein');
    expect(scene('Couronnement de Charlemagne ?', "l'an 800").actors.find((x) => x.label)?.label).toBe('800');
  });

  it('a pun on a first name still writes the surname (VICTOR Hugo)', () => {
    const r = scene('Qui a écrit Les Misérables ?', 'Victor Hugo');
    expect(r.actors[0].model).toBe('trophy');
    expect(r.actors.find((x) => x.label)).toMatchObject({ model: 'book', label: 'Victor Hugo' });
  });

  it('the previous hero is not reused even when it is the best link', () => {
    const first = composeScene('Longest river in Africa?', 'the Nile');
    expect(first.actors[0].model).toBe('pyramid');
    const next = composeScene('Pythagorean theorem?', 'a² + b² = c²', { avoid: ['pyramid'] });
    expect(next.actors[0].model).not.toBe('pyramid');
    expect(next.actors.map((x) => x.model)).toContain('pyramid'); // still there, as the question prop
  });

  it('stems meet across English and French', () => {
    expect(stem('oxygene')).toBe(stem('oxygen'));
    expect(stem('photosynthese')).toBe(stem('photosynthesis'));
    expect(stem('energie')).toBe(stem('energy'));
    expect(stem('electricite')).toBe(stem('electricity'));
    expect(stem('mitochondrie')).toBe(stem('mitochondria'));
    expect(stem('speeds')).toBe(stem('speed'));
  });
});
