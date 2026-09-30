import { describe, expect, it } from 'vitest';
import {
  baseTokens,
  canonicalTokens,
  damerauLevenshtein,
  matchAnswer,
  maxEdits,
  normalize,
  pickFromTranscript,
  similarity,
  spokenForms,
  voiceGrammar,
  MAX_SPOKEN_FORMS,
} from '../../../src/core/matching';
import type { Notion } from '../../../src/core/types';

const notion = (answer: string, distractors: [string, string], accept?: string[]): Pick<Notion, 'answer' | 'accept' | 'distractors'> => ({ answer, distractors, accept });

describe('normalize', () => {
  it.each([
    ['  The   Somme ', 'somme'],
    ['Zürich', 'zurich'],
    ["L'Allemagne", 'allemagne'],
    ['la Révolution française', 'revolution francaise'],
    ['Œuvre', 'oeuvre'],
    ['Straße', 'strasse'],
    ['Brest-Litovsk', 'brest litovsk'],
    ["it's Ottawa!", 'its ottawa'],
    ['6.02', '6.02'],
    ['6,02', '6.02'],
    ['1,000,000', '1000000'],
    ['End.', 'end'],
    ['June 6th, 1944', 'june 6 1944'],
    ['le 1er mai', '1 mai'],
    ['11am', '11 am'],
    ['50%', '50 percent'],
    ['Q&A', 'q and'], // 'a' is an article
    ['a', 'a'],
    ['the UN', 'un'],
    ['des  une les', 'les'],
    ['', ''],
    ['Łódź', 'lodz'],
    ['C++', 'c plus plus'],
    ['x²', 'x 2'],
  ])('%j → %j', (input, out) => expect(normalize(input)).toBe(out));

  it('survives non-string input', () => {
    expect(normalize(undefined as unknown as string)).toBe('');
    expect(baseTokens(null as unknown as string)).toEqual([]);
  });
});

describe('canonicalTokens', () => {
  it('puts dates in day-month order and merges a.m./p.m.', () => {
    expect(canonicalTokens('June 6, 1944')).toEqual(['6', 'june', '1944']);
    expect(canonicalTokens('the sixth of June nineteen forty four')).toEqual(['6', 'june', '1944']);
    expect(canonicalTokens('june the sixth')).toEqual(['6', 'june']);
    expect(canonicalTokens('6 juin 1944')).toEqual(['6', 'june', '1944']);
    expect(canonicalTokens('11 Nov')).toEqual(['11', 'november']);
    expect(canonicalTokens('eleven a.m.')).toEqual(['11', 'am']);
    expect(canonicalTokens('eleven p m')).toEqual(['11', 'pm']);
    expect(canonicalTokens('June 1944')).toEqual(['june', '1944']);
  });
});

describe('damerauLevenshtein & similarity', () => {
  it.each([
    ['', '', 0],
    ['abc', '', 3],
    ['', 'ab', 2],
    ['canberra', 'canberra', 0],
    ['canberra', 'camberra', 1],
    ['bern', 'bren', 1], // transposition
    ['ottawa', 'otawa', 1],
    ['kitten', 'sitting', 3],
    ['ca', 'abc', 3], // OSA (not unrestricted DL)
  ])('%s / %s = %i', (a, b, d) => expect(damerauLevenshtein(a, b)).toBe(d));
  it('ratio', () => {
    expect(similarity('', '')).toBe(1);
    expect(similarity('abcd', 'abce')).toBe(0.75);
  });
  it('tolerance grows with length', () => {
    expect([2, 3, 4, 6, 7, 11, 12, 20].map(maxEdits)).toEqual([0, 0, 1, 1, 2, 2, 2, 4]);
  });
});

describe('matchAnswer — words', () => {
  const canberra = notion('Canberra', ['Sydney', 'Melbourne']);
  it('accepts exact, case/accents/punctuation-insensitive answers', () => {
    expect(matchAnswer('Canberra', canberra)).toEqual({ correct: true, score: 1, matched: 'Canberra' });
    expect(matchAnswer('  CANBERRA!! ', canberra).correct).toBe(true);
    expect(matchAnswer('Zürich', notion('Zurich', ['Bern', 'Basel'])).correct).toBe(true);
    expect(matchAnswer('zurich', notion('Zürich', ['Bern', 'Basel'])).correct).toBe(true);
  });
  it('tolerates small typos', () => {
    expect(matchAnswer('Camberra', canberra).correct).toBe(true);
    expect(matchAnswer('canbera', canberra).correct).toBe(true);
    expect(matchAnswer('Otawa', notion('Ottawa', ['Toronto', 'Vancouver'])).correct).toBe(true);
    expect(matchAnswer('Berne', notion('Bern', ['Zurich', 'Geneva'])).correct).toBe(true);
  });
  it('rejects wrong answers and distractors', () => {
    expect(matchAnswer('Sydney', canberra)).toMatchObject({ correct: false });
    expect(matchAnswer('Melbourne', canberra).correct).toBe(false);
    expect(matchAnswer('Canada', canberra).correct).toBe(false);
    expect(matchAnswer('', canberra)).toEqual({ correct: false, score: 0 });
    expect(matchAnswer('   ', canberra).correct).toBe(false);
  });
  it('short answers must be exact', () => {
    const rome = notion('Rome', ['Milan', 'Turin']);
    expect(matchAnswer('Rome', rome).correct).toBe(true);
    const ra = notion('Ra', ['Isis', 'Osiris']);
    expect(matchAnswer('Ra', ra).correct).toBe(true);
    expect(matchAnswer('Re', ra).correct).toBe(false);
  });
  it('never accepts an input closer to a distractor', () => {
    const n = notion('Stalingrad', ['Leningrad', 'Moscow']);
    expect(matchAnswer('Leningrad', n).correct).toBe(false);
    expect(matchAnswer('Stalingrad', n).correct).toBe(true);
    const austria = notion('Australia', ['Austria', 'Austral']);
    expect(matchAnswer('Austria', austria).correct).toBe(false);
  });
  it('uses the accept list and reports what matched', () => {
    const n = notion('Zimmermann telegram', ['Ems Dispatch', 'Balfour Declaration'], ['Zimmermann']);
    expect(matchAnswer('the Zimmerman telegram', n)).toMatchObject({ correct: true, matched: 'Zimmermann telegram' });
    expect(matchAnswer('zimmermann', n)).toMatchObject({ correct: true, matched: 'Zimmermann' });
    const un = notion('United Nations', ['League of Nations', 'NATO'], ['UN']);
    expect(matchAnswer('the UN', un).correct).toBe(true);
    expect(matchAnswer('League of nations', un).correct).toBe(false);
  });
  it('finds the answer inside a longer utterance', () => {
    expect(matchAnswer("I think it's Canberra", canberra).correct).toBe(true);
    const r = matchAnswer('canberra is the capital', canberra);
    expect(r.correct).toBe(true);
    expect(r.score).toBeLessThan(1);
  });
  it('matches French content accent-insensitively', () => {
    const n = notion('la Révolution française', ['la Commune', 'la Fronde']);
    expect(matchAnswer('revolution francaise', n).correct).toBe(true);
    expect(matchAnswer("L'Allemagne", notion('Allemagne', ['Autriche', 'Prusse'])).correct).toBe(true);
  });
  it('ignores garbage fields gracefully', () => {
    const n = { answer: 'Paris', accept: [42 as unknown as string, ''], distractors: ['Lyon', null as unknown as string] as [string, string] };
    expect(matchAnswer('paris', n).correct).toBe(true);
  });
});

describe('matchAnswer — numbers and dates', () => {
  const y1914 = notion('1914', ['1912', '1916']);
  it.each(['1914', 'nineteen fourteen', 'nineteen hundred and fourteen', 'one thousand nine hundred fourteen', 'one thousand nine hundred and fourteen', 'in 1914', 'it was nineteen fourteen'])(
    '1914 ⇐ %s',
    (input) => expect(matchAnswer(input, y1914).correct).toBe(true),
  );
  it.each(['1915', 'nineteen fifteen', '1912', '914', 'fourteen', 'nineteen', 'sarajevo'])('1914 ⇍ %s', (input) => expect(matchAnswer(input, y1914).correct).toBe(false));

  it('matches an answer written in words from digits', () => {
    expect(matchAnswer('1914', notion('nineteen fourteen', ['1912', '1916'])).correct).toBe(true);
  });

  it('decimals', () => {
    const avogadro = notion('6.02', ['6.2', '3.14']);
    for (const s of ['6.02', '6,02', 'six point oh two', 'six point zero two', '6.020']) expect(matchAnswer(s, avogadro).correct).toBe(true);
    for (const s of ['6.2', 'six point two', '60.2', '6']) expect(matchAnswer(s, avogadro).correct).toBe(false);
  });

  const dday = notion('6 June 1944', ['6 June 1943', '6 August 1944']);
  it.each([
    '6 June 1944',
    'June 6, 1944',
    'June 6th 1944',
    '6th of June 1944',
    'june sixth nineteen forty four',
    'the sixth of june nineteen forty four',
    'six june nineteen forty four',
    'june the sixth nineteen forty four',
    '6 juin 1944',
  ])('D-Day ⇐ %s', (input) => expect(matchAnswer(input, dday).correct).toBe(true));
  it.each(['6 June 1943', '5 June 1944', '6 July 1944', 'june 1944', '1944', 'august sixth nineteen forty four'])('D-Day ⇍ %s', (input) =>
    expect(matchAnswer(input, dday).correct).toBe(false),
  );

  it('times', () => {
    const n = notion('11 am', ['9 am', '11 pm']);
    for (const s of ['11 am', '11am', '11 a.m.', 'eleven a m', 'eleven am']) expect(matchAnswer(s, n).correct).toBe(true);
    expect(matchAnswer('eleven p m', n).correct).toBe(false);
  });

  it('ordinals', () => {
    const n = notion('21st', ['20th', '22nd']);
    expect(matchAnswer('twenty first', n).correct).toBe(true);
    expect(matchAnswer('21', n).correct).toBe(true);
    expect(matchAnswer('twenty second', n).correct).toBe(false);
  });

  it('a number is not a word answer', () => {
    expect(matchAnswer('1914', notion('Sarajevo', ['Vienna', 'Belgrade'])).correct).toBe(false);
  });
});

describe('spokenForms', () => {
  it('words are lower-cased with accents and punctuation removed', () => {
    expect(spokenForms('Canberra')).toEqual(['canberra']);
    expect(spokenForms('Zürich')).toEqual(['zurich']);
    expect(spokenForms('Brest-Litovsk')).toEqual(['brest litovsk']);
    expect(spokenForms('The Somme')).toEqual(['the somme', 'somme']);
  });
  it('years', () => {
    const f = spokenForms('1914');
    expect(f[0]).toBe('nineteen fourteen');
    expect(f).toContain('nineteen hundred and fourteen');
    expect(f).toContain('one thousand nine hundred fourteen');
  });
  it('dates', () => {
    const f = spokenForms('6 June 1944');
    expect(f[0]).toBe('june sixth nineteen forty four');
    expect(f).toContain('the sixth of june nineteen forty four');
    expect(f).toContain('june six nineteen forty four');
    expect(spokenForms('June 6')).toContain('june sixth');
    expect(spokenForms('11 November')[0]).toBe('november eleventh');
  });
  it('decimals, times, small numbers, leading zeros, huge numbers', () => {
    expect(spokenForms('6.02')).toEqual(['six point zero two', 'six point oh two']);
    expect(spokenForms('11 am')).toEqual(['eleven a m', 'eleven am']);
    expect(spokenForms('120')).toEqual(['one hundred twenty', 'one hundred and twenty', 'a hundred twenty']);
    expect(spokenForms('007')).toEqual(['oh oh seven', 'zero zero seven']);
    expect(spokenForms('12345678901')[0]).toBe('one two three four five six seven eight nine zero one');
    expect(spokenForms('')).toEqual([]);
  });
  it('is capped and only contains lower-case words', () => {
    const f = spokenForms('6 June 1944 and 11 November 1918 at 11 am');
    expect(f.length).toBeGreaterThan(0);
    expect(f.length).toBeLessThanOrEqual(MAX_SPOKEN_FORMS);
    for (const s of f) expect(s).toMatch(/^[a-z]+( [a-z]+)*$/);
  });
  it('every spoken form matches its answer (round trip)', () => {
    const answers = ['1914', '1905', '2001', '6 June 1944', '11 November', '8 May 1945', '6.02', '3.14', '11 am', 'Canberra', 'Brest-Litovsk', '7 December 1941', '42', '1,000', 'June 6'];
    for (const a of answers) {
      const n = notion(a, ['zzzz', 'yyyy']);
      for (const f of spokenForms(a)) expect(matchAnswer(f, n).correct, `${a} ⇐ ${f}`).toBe(true);
    }
  });
});

describe('voiceGrammar', () => {
  it('lists every spoken form of answers, accepts and distractors, plus [unk]', () => {
    const g = voiceGrammar([
      { answer: 'Canberra', distractors: ['Sydney', 'Melbourne'] },
      { answer: '1914', distractors: ['1912', '1916'], accept: ['WW1 start'] },
    ]);
    expect(g).toContain('canberra');
    expect(g).toContain('sydney');
    expect(g).toContain('nineteen fourteen');
    expect(g).toContain('nineteen sixteen');
    expect(g).toContain('ww one start');
    expect(g[g.length - 1]).toBe('[unk]');
    expect(new Set(g).size).toBe(g.length);
  });
  it('handles an empty palace', () => expect(voiceGrammar([])).toEqual(['[unk]']));
});

describe('pickFromTranscript', () => {
  const n = notion('Canberra', ['Sydney', 'Melbourne']);
  it('designates the answer or a distractor', () => {
    expect(pickFromTranscript('canberra', n)).toEqual({ index: 0, option: 'Canberra', score: 1 });
    expect(pickFromTranscript('sydney', n)).toMatchObject({ index: 1, option: 'Sydney' });
    expect(pickFromTranscript('um [unk] melbourne', n)).toMatchObject({ index: 2, option: 'Melbourne' });
  });
  it('handles spoken numbers', () => {
    const y = notion('1914', ['1912', '1916']);
    expect(pickFromTranscript('nineteen fourteen', y)?.index).toBe(0);
    expect(pickFromTranscript('nineteen sixteen', y)?.index).toBe(2);
    expect(pickFromTranscript('nineteen twelve', y)?.index).toBe(1);
  });
  it('returns the answer text even when an accepted form was said', () => {
    const un = notion('United Nations', ['League of Nations', 'NATO'], ['UN']);
    expect(pickFromTranscript('u n', un)).toBeNull(); // "u n" is not "un"
    expect(pickFromTranscript('un', un)).toMatchObject({ index: 0, option: 'United Nations' });
  });
  it('returns null for silence, noise or ambiguity', () => {
    expect(pickFromTranscript('', n)).toBeNull();
    expect(pickFromTranscript('[unk]', n)).toBeNull();
    expect(pickFromTranscript('paris', n)).toBeNull();
    expect(pickFromTranscript('canberra sydney', notion('Canberra', ['Sydney', 'Perth']))).toBeNull();
    expect(pickFromTranscript(undefined as unknown as string, n)).toBeNull();
  });
});
