import { describe, expect, it } from 'vitest';
import { splitCourse } from '../../server/offline';
import { makeDistractors } from '../../server/distractors';
import { answerType, detectLang } from '../../server/nlp';
import { EN_BULLETS, EN_CHEM, EN_PROSE, FR_WWI } from './fixtures/courses';

const byAnswer = (r: ReturnType<typeof splitCourse>, a: string) => r.candidates.find((c) => c.answer === a);

describe('offline splitter', () => {
  it('reads a French WWI lesson (dates, definitions, Q/A, sentences)', () => {
    const r = splitCourse(FR_WWI);
    expect(r.lang).toBe('fr');
    expect(r.title).toBe('La Première Guerre mondiale (1914-1918)');
    expect(byAnswer(r, '28 juin 1914')?.question).toBe("À quelle date : Assassinat de l'archiduc François-Ferdinand à Sarajevo ?");
    expect(byAnswer(r, '28 juin 1914')?.accept).toContain('1914');
    expect(byAnswer(r, '1917')?.question).toBe('En quelle année : Entrée en guerre des États-Unis ?');
    expect(byAnswer(r, '28 juin 1919')?.question).toMatch(/Traité de Versailles/);
    expect(byAnswer(r, 'surnom donné aux soldats français')?.question).toBe("Qu'est-ce que « Poilu » ?");
    expect(byAnswer(r, 'Georges Clemenceau')?.kind).toBe('qa');
    expect(byAnswer(r, 'Philippe Pétain')?.question).toBe('Le commandant français à Verdun est… ?');
    expect(r.candidates.find((c) => c.kind === 'cloze-year')?.question).toBe('La bataille de Verdun a lieu en … et dure dix mois (année ?)');
    // headings are never notions
    expect(r.candidates.some((c) => /causes du conflit/i.test(c.question))).toBe(false);
  });

  it('reads an English chemistry sheet (formulas, units, Q/A labels)', () => {
    const r = splitCourse(EN_CHEM);
    expect(r.lang).toBe('en');
    expect(r.subject).toBe('Chemistry');
    expect(byAnswer(r, '6.02 × 10^23 mol⁻¹')?.question).toBe('Avogadro constant = ?');
    expect(byAnswer(r, '22.4 L/mol')?.accept).toContain('22.4');
    expect(byAnswer(r, 'Isotope')?.question).toMatch(/^Which term: “atoms with the same number of protons/);
    expect(byAnswer(r, 'John Dalton')?.question).toBe('Who proposed the atomic theory in 1803?');
    expect(byAnswer(r, 'negative')?.question).toBe('What is the charge of an electron?');
    expect(r.candidates.some((c) => c.question.includes('Chemistry'))).toBe(false);
  });

  it('understands bullet lists under a heading (capitals)', () => {
    const r = splitCourse(EN_BULLETS);
    expect(r.title).toBe('Capitals of the world');
    expect(r.subject).toBe('Geography');
    expect(r.candidates.map((c) => c.question)).toContain('What is the capital of Australia?');
    expect(byAnswer(r, 'Canberra')).toBeDefined();
  });

  it('turns prose with dates into cloze questions', () => {
    const r = splitCourse(EN_PROSE);
    expect(byAnswer(r, '1793')?.question).toBe('Louis XVI was executed in … (year?)');
    expect(byAnswer(r, '18 June 1815')?.accept).toContain('1815');
  });

  it('keeps at most 20 notions, the most exam-relevant, in course order', () => {
    const lines = Array.from({ length: 30 }, (_, i) => `${1800 + i * 3}: event number ${i + 1}`).join('\n');
    const prose = Array.from({ length: 10 }, (_, i) => `The committee number ${i + 1} is chaired by someone important.`).join('\n');
    const r = splitCourse(`${prose}\n${lines}`);
    expect(r.candidates).toHaveLength(20);
    expect(r.found).toBeGreaterThan(20);
    expect(r.candidates.every((c) => c.kind === 'date')).toBe(true);
    const orders = r.candidates.map((c) => c.order);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });

  it('supports "term = value", "Q? A" on one line and separators – — →', () => {
    const r = splitCourse('E = mc²\nWhat is the capital of Italy? Rome\nchien → dog\nchat — cat\nPhotosynthesis – process by which plants make sugar from light');
    expect(byAnswer(r, 'mc²')?.question).toBe('E = ?');
    expect(byAnswer(r, 'Rome')?.question).toBe('What is the capital of Italy?');
    expect(byAnswer(r, 'dog')?.question).toBe('chien → ?');
    expect(byAnswer(r, 'cat')?.question).toBe('chat → ?');
    expect(byAnswer(r, 'Photosynthesis')?.kind).toBe('term');
  });

  it('returns nothing for text without facts', () => {
    expect(splitCourse('hello there, how are you doing today my friend').candidates).toHaveLength(0);
  });
});

describe('distractors', () => {
  const two = (d: [string, string], answer: string) => {
    expect(d).toHaveLength(2);
    expect(d[0]).not.toBe(d[1]);
    expect(d).not.toContain(answer);
  };

  it('years: prefers other course years, else nearby years', () => {
    const d = makeDistractors('1916', { lang: 'en', pool: ['1914', '1918', 'Paris'] });
    two(d, '1916');
    expect(d[0]).toMatch(/^19(14|18)$/);
    const alone = makeDistractors('1789', { lang: 'en' });
    two(alone, '1789');
    for (const y of alone) expect(Math.abs(+y - 1789)).toBeLessThanOrEqual(6);
  });

  it('full dates keep their format', () => {
    const d = makeDistractors('11 novembre 1918', { lang: 'fr' });
    two(d, '11 novembre 1918');
    for (const x of d) expect(x).toMatch(/^11 novembre 19\d\d$/);
  });

  it('numbers: perturb the exponent or the mantissa, keep units', () => {
    const d = makeDistractors('6.02 × 10^23 mol⁻¹', { lang: 'en' });
    two(d, '6.02 × 10^23 mol⁻¹');
    for (const x of d) expect(x).toMatch(/mol⁻¹$/);
    expect(d.some((x) => /10\^2[0-6]/.test(x) && !x.includes('10^23'))).toBe(true);
    const v = makeDistractors('22,4 L', { lang: 'fr' });
    two(v, '22,4 L');
    for (const x of v) expect(x).toMatch(/^\d+,\d L$/);
  });

  it('names and terms: other answers of the same type', () => {
    const d = makeDistractors('Canberra', { lang: 'en', pool: ['Paris', 'Ottawa', '1914', 'Tokyo'] });
    two(d, 'Canberra');
    for (const x of d) expect(['Paris', 'Ottawa', 'Tokyo']).toContain(x);
  });

  it('is deterministic and always returns two strings', () => {
    expect(makeDistractors('Mitochondria', { lang: 'en' })).toEqual(makeDistractors('Mitochondria', { lang: 'en' }));
    two(makeDistractors('Mitochondria', { lang: 'en' }), 'Mitochondria');
    two(makeDistractors('Mitochondrie', { lang: 'fr' }), 'Mitochondrie');
  });
});

describe('nlp helpers', () => {
  it('detects the language', () => {
    expect(detectLang(FR_WWI)).toBe('fr');
    expect(detectLang(EN_CHEM)).toBe('en');
  });
  it('classifies answers', () => {
    expect(answerType('1916')).toBe('year');
    expect(answerType('28 juin 1919')).toBe('date');
    expect(answerType('June 18, 1815')).toBe('date');
    expect(answerType('6.02 × 10^23')).toBe('number');
    expect(answerType('Georges Clemenceau')).toBe('name');
    expect(answerType('zone entre les tranchées')).toBe('text');
  });
});
