import { describe, expect, it } from 'vitest';
import { cardinalWords, decimalWords, digitWords, isNumberWord, ordinalWords, wordsToDigits, yearWords } from '../../../src/core/numbers';

const w2d = (s: string) => wordsToDigits(s.split(' ')).join(' ');

describe('cardinalWords', () => {
  it.each([
    [0, 'zero'],
    [7, 'seven'],
    [13, 'thirteen'],
    [20, 'twenty'],
    [44, 'forty four'],
    [100, 'one hundred'],
    [105, 'one hundred five'],
    [999, 'nine hundred ninety nine'],
    [1000, 'one thousand'],
    [1914, 'one thousand nine hundred fourteen'],
    [2001, 'two thousand one'],
    [21000, 'twenty one thousand'],
    [1_000_000, 'one million'],
    [6_022_140, 'six million twenty two thousand one hundred forty'],
  ])('%i → %s', (n, s) => expect(cardinalWords(n)).toBe(s));

  it('adds "and" British style', () => {
    expect(cardinalWords(1914, true)).toBe('one thousand nine hundred and fourteen');
    expect(cardinalWords(2001, true)).toBe('two thousand and one');
    expect(cardinalWords(120, true)).toBe('one hundred and twenty');
  });

  it('reads huge numbers digit by digit and rejects invalid input', () => {
    expect(cardinalWords(1234567890)).toBe('one two three four five six seven eight nine zero');
    expect(() => cardinalWords(-1)).toThrow(RangeError);
    expect(() => cardinalWords(1.5)).toThrow(RangeError);
  });
});

describe('ordinalWords', () => {
  it.each([
    [1, 'first'],
    [2, 'second'],
    [3, 'third'],
    [6, 'sixth'],
    [11, 'eleventh'],
    [12, 'twelfth'],
    [20, 'twentieth'],
    [21, 'twenty first'],
    [30, 'thirtieth'],
    [31, 'thirty first'],
    [100, 'one hundredth'],
    [101, 'one hundred first'],
    [1000, 'one thousandth'],
    [120, 'one hundred twentieth'],
  ])('%i → %s', (n, s) => expect(ordinalWords(n)).toBe(s));
  it('rejects invalid input, reads huge numbers as digits', () => {
    expect(() => ordinalWords(-3)).toThrow(RangeError);
    expect(ordinalWords(2e9)).toBe('two zero zero zero zero zero zero zero zero zero');
  });
});

describe('yearWords', () => {
  it('says years the natural way first', () => {
    expect(yearWords(1914)[0]).toBe('nineteen fourteen');
    expect(yearWords(1914)).toEqual(
      expect.arrayContaining(['nineteen hundred and fourteen', 'nineteen hundred fourteen', 'one thousand nine hundred fourteen', 'one thousand nine hundred and fourteen']),
    );
    expect(yearWords(1905)[0]).toBe('nineteen oh five');
    expect(yearWords(1900)).toEqual(['nineteen hundred', 'one thousand nine hundred']);
    expect(yearWords(2000)).toEqual(['two thousand']);
    expect(yearWords(2001)).toEqual(['two thousand one', 'two thousand and one', 'twenty oh one']);
    expect(yearWords(2026)[0]).toBe('twenty twenty six');
    expect(yearWords(1066)[0]).toBe('ten sixty six');
  });
  it('falls back to cardinals outside 1000–2999', () => {
    expect(yearWords(476)).toEqual(['four hundred seventy six']);
    expect(yearWords(3000)).toEqual(['three thousand']);
  });
});

describe('decimalWords & digitWords', () => {
  it('reads decimals', () => {
    expect(decimalWords('6.02')).toEqual(['six point zero two', 'six point oh two']);
    expect(decimalWords('3.14')).toEqual(['three point one four']);
    expect(decimalWords('0.5')).toEqual(['zero point five', 'point five']);
    expect(decimalWords('12')).toEqual([]);
  });
  it('reads digits', () => {
    expect(digitWords('007')).toBe('zero zero seven');
    expect(digitWords('007', 'oh')).toBe('oh oh seven');
  });
});

describe('wordsToDigits', () => {
  it.each([
    ['nineteen fourteen', '1914'],
    ['nineteen hundred and fourteen', '1914'],
    ['nineteen hundred fourteen', '1914'],
    ['one thousand nine hundred fourteen', '1914'],
    ['one thousand nine hundred and fourteen', '1914'],
    ['nineteen forty four', '1944'],
    ['nineteen oh five', '1905'],
    ['nineteen hundred', '1900'],
    ['two thousand', '2000'],
    ['two thousand and one', '2001'],
    ['twenty oh one', '2001'],
    ['twenty twenty six', '2026'],
    ['ten sixty six', '1066'],
    ['forty four', '44'],
    ['a hundred', '100'],
    ['a thousand years', '1000 years'],
    ['six point oh two', '6.02'],
    ['six point zero two', '6.02'],
    ['three point one four one five', '3.1415'],
    ['point five', '0.5'],
    ['sixth', '6'],
    ['twenty first', '21'],
    ['june sixth nineteen forty four', 'june 6 1944'],
    ['june six nineteen forty four', 'june 6 1944'],
    ['the eleventh of november', 'the 11 of november'],
    ['eleven a m', '11 a m'],
    ['one two three', '1 2 3'],
    ['zero', '0'],
    ['oh five', '05'],
    ['five million two hundred thousand', '5200000'],
    ['one hundred five hundred', '105 hundred'],
    ['hundred', 'hundred'],
    ['the point is', 'the point is'],
    ['canberra', 'canberra'],
    ['nineteen and fourteen', '19 and 14'],
  ])('%s → %s', (input, out) => expect(w2d(input)).toBe(out));

  it('recognises number words', () => {
    expect(isNumberWord('seventeen')).toBe(true);
    expect(isNumberWord('oh')).toBe(true);
    expect(isNumberWord('canberra')).toBe(false);
  });

  it('round-trips every cardinal, ordinal and year form it produces', () => {
    for (let n = 0; n <= 3000; n += n < 130 ? 1 : 17) {
      expect(w2d(cardinalWords(n))).toBe(String(n));
      expect(w2d(cardinalWords(n, true))).toBe(String(n));
      if (n > 0) expect(w2d(ordinalWords(n))).toBe(String(n));
    }
    for (let y = 1000; y <= 2999; y += 7) for (const f of yearWords(y)) expect(w2d(f)).toBe(String(y));
    for (const n of [12345, 99999, 100001, 7_654_321]) expect(w2d(cardinalWords(n))).toBe(String(n));
  });
});
