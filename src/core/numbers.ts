/**
 * English number words ⇄ digits, for answer matching and the offline voice grammar.
 *
 * - {@link cardinalWords}, {@link ordinalWords}, {@link yearWords}, {@link decimalWords} turn
 *   numbers into the words an English speaker (and an offline ASR like Vosk) produces.
 * - {@link wordsToDigits} does the reverse on a token list: every run of number words becomes a
 *   digit token, e.g. `nineteen fourteen` → `1914`, `six point oh two` → `6.02`,
 *   `one thousand nine hundred and fourteen` → `1914`, `sixth` → `6`.
 */

const SMALL = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const SMALL_ORD = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth'];
const TENS_ORD = ['', '', 'twentieth', 'thirtieth', 'fortieth', 'fiftieth', 'sixtieth', 'seventieth', 'eightieth', 'ninetieth'];

/** Largest number verbalised (exclusive). Bigger numbers are read digit by digit. */
export const MAX_WORDS_NUMBER = 1e9;

/**
 * Cardinal words of a non-negative integer < 1e9, e.g. 1914 → "one thousand nine hundred fourteen"
 * (or "… nine hundred and fourteen" with `and`).
 */
export function cardinalWords(n: number, and = false): string {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`cardinalWords: ${n}`);
  if (n >= MAX_WORDS_NUMBER) return digitWords(String(n));
  if (n < 20) return SMALL[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + SMALL[n % 10] : '');
  if (n < 1000) {
    const rest = n % 100;
    return SMALL[Math.floor(n / 100)] + ' hundred' + (rest ? (and ? ' and ' : ' ') + cardinalWords(rest) : '');
  }
  const scale = n >= 1e6 ? 1e6 : 1000;
  const name = scale === 1e6 ? 'million' : 'thousand';
  const head = Math.floor(n / scale);
  const rest = n % scale;
  return cardinalWords(head, and) + ' ' + name + (rest ? (and && rest < 100 ? ' and ' : ' ') + cardinalWords(rest, and) : '');
}

/** Ordinal words, e.g. 6 → "sixth", 21 → "twenty first", 100 → "one hundredth". */
export function ordinalWords(n: number): string {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`ordinalWords: ${n}`);
  if (n >= MAX_WORDS_NUMBER) return digitWords(String(n));
  if (n < 20) return SMALL_ORD[n];
  if (n < 100) return n % 10 ? TENS[Math.floor(n / 10)] + ' ' + SMALL_ORD[n % 10] : TENS_ORD[n / 10];
  const words = cardinalWords(n).split(' ');
  const last = words[words.length - 1];
  const lastOrd = last === 'hundred' || last === 'thousand' || last === 'million' ? last + 'th' : cardinalToOrdinalWord(last);
  words[words.length - 1] = lastOrd;
  return words.join(' ');
}

function cardinalToOrdinalWord(w: string): string {
  const i = SMALL.indexOf(w);
  if (i >= 0) return SMALL_ORD[i];
  const t = TENS.indexOf(w);
  return t >= 2 ? TENS_ORD[t] : w;
}

/** Each digit as a word: "0042" → "zero zero four two". */
export function digitWords(digits: string, zero: 'zero' | 'oh' = 'zero'): string {
  return [...digits].map((d) => (d === '0' ? zero : SMALL[Number(d)])).join(' ');
}

/**
 * Ways to say a year, most natural first: 1914 → "nineteen fourteen", "nineteen hundred and
 * fourteen", "nineteen hundred fourteen", "one thousand nine hundred fourteen", …;
 * 1905 → "nineteen oh five"; 2001 → "two thousand one", "two thousand and one", "twenty oh one".
 * Only meaningful for 1000 ≤ n ≤ 2999; other numbers fall back to their cardinal forms.
 */
export function yearWords(n: number): string[] {
  const out: string[] = [];
  const add = (s: string) => out.includes(s) || out.push(s);
  if (!Number.isInteger(n) || n < 1000 || n > 2999) {
    add(cardinalWords(Math.abs(Math.trunc(n))));
    return out;
  }
  const hi = Math.floor(n / 100);
  const lo = n % 100;
  const hiW = cardinalWords(hi);
  if (n >= 2000 && n < 2010) {
    add(cardinalWords(n));
    add(cardinalWords(n, true));
    if (lo > 0) add(`${hiW} oh ${SMALL[lo]}`);
    return out;
  }
  if (lo === 0) {
    if (hi % 10 === 0) add(cardinalWords(n));
    add(`${hiW} hundred`);
    add(cardinalWords(n));
    return out;
  }
  add(lo < 10 ? `${hiW} oh ${SMALL[lo]}` : `${hiW} ${cardinalWords(lo)}`);
  add(`${hiW} hundred and ${cardinalWords(lo)}`);
  add(`${hiW} hundred ${cardinalWords(lo)}`);
  add(cardinalWords(n));
  add(cardinalWords(n, true));
  return out;
}

/**
 * Ways to say a decimal written with a point: "6.02" → "six point zero two", "six point oh two".
 * A leading "0." also gives the short form "point five".
 */
export function decimalWords(s: string): string[] {
  const m = /^(\d+)\.(\d+)$/.exec(s);
  if (!m) return [];
  const intPart = Number(m[1]);
  const intW = intPart >= MAX_WORDS_NUMBER ? digitWords(m[1]) : cardinalWords(intPart);
  const out = [`${intW} point ${digitWords(m[2])}`];
  if (m[2].includes('0')) out.push(`${intW} point ${digitWords(m[2], 'oh')}`);
  if (intPart === 0) out.push(`point ${digitWords(m[2])}`);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Words → digits
// ─────────────────────────────────────────────────────────────────────────────

type Kind = 'digit' | 'zero' | 'teen' | 'tens' | 'hundred' | 'scale';

interface NumWord {
  kind: Kind;
  value: number;
  ordinal: boolean;
}

const WORDS = new Map<string, NumWord>();
SMALL.forEach((w, i) => WORDS.set(w, { kind: i === 0 ? 'zero' : i < 10 ? 'digit' : 'teen', value: i, ordinal: false }));
SMALL_ORD.forEach((w, i) => i > 0 && WORDS.set(w, { kind: i < 10 ? 'digit' : 'teen', value: i, ordinal: true }));
TENS.forEach((w, i) => w && WORDS.set(w, { kind: 'tens', value: i * 10, ordinal: false }));
TENS_ORD.forEach((w, i) => w && WORDS.set(w, { kind: 'tens', value: i * 10, ordinal: true }));
WORDS.set('oh', { kind: 'zero', value: 0, ordinal: false });
WORDS.set('nought', { kind: 'zero', value: 0, ordinal: false });
WORDS.set('hundred', { kind: 'hundred', value: 100, ordinal: false });
WORDS.set('hundredth', { kind: 'hundred', value: 100, ordinal: true });
WORDS.set('thousand', { kind: 'scale', value: 1000, ordinal: false });
WORDS.set('thousandth', { kind: 'scale', value: 1000, ordinal: true });
WORDS.set('million', { kind: 'scale', value: 1e6, ordinal: false });
WORDS.set('millionth', { kind: 'scale', value: 1e6, ordinal: true });

/** true if the token is an English number word (cardinal or ordinal). */
export function isNumberWord(token: string): boolean {
  return WORDS.has(token);
}

/** Digit words allowed after "point": zero/oh/nought/one…nine. */
function singleDigit(token: string | undefined): number | null {
  if (token === undefined) return null;
  const w = WORDS.get(token);
  if (!w || w.ordinal) return null;
  if (w.kind === 'zero') return 0;
  return w.kind === 'digit' ? w.value : null;
}

interface Chunk {
  value: number;
  /** "oh five" style chunk (value 1–9 with a spoken leading zero). */
  leadingZero: boolean;
  /** Built only from digit/teen/tens words (no hundred/thousand): eligible for year pairing. */
  simple: boolean;
  /** Plain "zero"/"oh" chunk. */
  isZero: boolean;
}

class ChunkBuilder {
  total = 0;
  current = 0;
  last: Kind | null = null;
  lastScale = Infinity;
  leadingZero = false;
  simple = true;
  zeroOnly = false;

  canTake(w: NumWord): boolean {
    switch (this.last) {
      case null:
        return w.kind !== 'hundred' && w.kind !== 'scale';
      case 'zero':
        return this.zeroOnly && !this.leadingZero && w.kind === 'digit';
      case 'digit':
        if (this.leadingZero) return false;
        return (w.kind === 'hundred' && this.current < 100) || (w.kind === 'scale' && this.scaleOk(w));
      case 'teen':
        return (w.kind === 'hundred' && this.current < 100) || (w.kind === 'scale' && this.scaleOk(w));
      case 'tens':
        return (w.kind === 'digit' && this.current % 10 === 0) || (w.kind === 'hundred' && this.current < 100) || (w.kind === 'scale' && this.scaleOk(w));
      case 'hundred':
        return ((w.kind === 'digit' || w.kind === 'teen' || w.kind === 'tens') && this.current % 100 === 0) || (w.kind === 'scale' && this.scaleOk(w));
      case 'scale':
        return w.kind === 'digit' || w.kind === 'teen' || w.kind === 'tens';
    }
  }

  private scaleOk(w: NumWord): boolean {
    return w.value < this.lastScale && this.current > 0;
  }

  take(w: NumWord): void {
    switch (w.kind) {
      case 'zero':
        this.zeroOnly = true;
        break;
      case 'digit':
        if (this.last === 'zero') this.leadingZero = true;
        this.current += w.value;
        break;
      case 'teen':
      case 'tens':
        this.current += w.value;
        break;
      case 'hundred':
        this.current *= 100;
        this.simple = false;
        break;
      case 'scale':
        this.total += this.current * w.value;
        this.current = 0;
        this.lastScale = w.value;
        this.simple = false;
        break;
    }
    this.last = w.kind;
  }

  chunk(): Chunk {
    const value = this.total + this.current;
    return { value, leadingZero: this.leadingZero, simple: this.simple && !this.leadingZero && !this.zeroOnly, isZero: this.zeroOnly && !this.leadingZero };
  }
}

const isYearHead = (c: Chunk) => c.simple && c.value >= 10 && c.value <= 99;
const isYearTail = (c: Chunk) => (c.leadingZero && c.value >= 1 && c.value <= 9) || (c.simple && c.value >= 10 && c.value <= 99);

function chunkText(c: Chunk): string {
  return c.leadingZero ? `0${c.value}` : String(c.value);
}

/**
 * Replaces every run of English number words in `tokens` by digit tokens.
 * - Cardinals with hundred/thousand/million and optional "and": "nineteen hundred and fourteen" → "1914".
 * - Year style (two 2-digit groups): "nineteen fourteen" → "1914", "twenty oh one" → "2001".
 * - Decimals: "six point oh two" → "6.02", "point five" → "0.5".
 * - Ordinals end a run: "sixth" → "6", "twenty first" → "21".
 * - "a hundred" / "a thousand" → "100" / "1000".
 * Unrelated tokens are kept as they are.
 */
export function wordsToDigits(tokens: string[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];
    // "a hundred" / "a thousand"
    if (tok === 'a' && (tokens[i + 1] === 'hundred' || tokens[i + 1] === 'thousand' || tokens[i + 1] === 'million')) {
      tokens = [...tokens.slice(0, i), 'one', ...tokens.slice(i + 1)];
      continue;
    }
    // "point five" with no integer part
    if (tok === 'point' && singleDigit(tokens[i + 1]) !== null) {
      let j = i + 1;
      let frac = '';
      while (singleDigit(tokens[j]) !== null) frac += String(singleDigit(tokens[j++]));
      out.push(`0.${frac}`);
      i = j;
      continue;
    }
    const w = WORDS.get(tok);
    if (!w || w.kind === 'hundred' || w.kind === 'scale') {
      out.push(tok);
      i++;
      continue;
    }
    // A run of number words, possibly several chunks.
    const chunks: Chunk[] = [];
    let b = new ChunkBuilder();
    let j = i;
    let endedByOrdinal = false;
    while (j < tokens.length) {
      const t = tokens[j];
      if (t === 'and' && (b.last === 'hundred' || b.last === 'scale')) {
        const nx = WORDS.get(tokens[j + 1] ?? '');
        if (nx && (nx.kind === 'digit' || nx.kind === 'teen' || nx.kind === 'tens') && b.canTake(nx)) {
          j++;
          continue;
        }
        break;
      }
      const nw = WORDS.get(t);
      if (!nw) break;
      if (!b.canTake(nw)) {
        if (b.last === null || nw.kind === 'hundred' || nw.kind === 'scale') break;
        chunks.push(b.chunk());
        b = new ChunkBuilder();
        continue;
      }
      b.take(nw);
      j++;
      if (nw.ordinal) {
        endedByOrdinal = true;
        break;
      }
    }
    if (b.last !== null) chunks.push(b.chunk());
    // Year pairing on the last two chunks of the run.
    const texts: string[] = [];
    let k = 0;
    const n = chunks.length;
    while (k < n) {
      if (k === n - 2 && isYearHead(chunks[k]) && isYearTail(chunks[k + 1]) && !endedByOrdinal) {
        texts.push(String(chunks[k].value * 100 + chunks[k + 1].value));
        k += 2;
      } else {
        texts.push(chunkText(chunks[k]));
        k++;
      }
    }
    // Decimal part: "<number> point <digit>+"
    if (!endedByOrdinal && tokens[j] === 'point' && singleDigit(tokens[j + 1]) !== null) {
      let frac = '';
      j++;
      while (singleDigit(tokens[j]) !== null) frac += String(singleDigit(tokens[j++]));
      texts[texts.length - 1] = `${texts[texts.length - 1]}.${frac}`;
    }
    out.push(...texts);
    i = j;
  }
  return out;
}
