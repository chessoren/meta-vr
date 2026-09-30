/**
 * Deterministic id helpers.
 *
 * Nothing here calls `Math.random()` or `Date.now()` implicitly: callers pass a random source
 * (`() => number` in [0, 1)), so ids are reproducible in tests. In the app, pass `Math.random`
 * or a `crypto.getRandomValues`-backed source.
 */

/** A source of uniform floats in [0, 1). */
export type RandomSource = () => number;

/** 32-bit FNV-1a hash of a string (stable across platforms). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32: a tiny, fast, well-distributed seeded PRNG. */
export function mulberry32(seed: number): RandomSource {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** PRNG seeded by a string (hash of the text). */
export function seededRandom(seed: string | number): RandomSource {
  return mulberry32(typeof seed === 'number' ? seed : hashString(seed));
}

/** Integer in [0, n) from a random source. Robust to sources returning exactly 1 or garbage. */
export function randInt(rand: RandomSource, n: number): number {
  const r = rand();
  const x = Number.isFinite(r) ? r : 0;
  return Math.min(n - 1, Math.max(0, Math.floor(x * n)));
}

/** Picks one element of a non-empty array. */
export function pick<T>(rand: RandomSource, items: readonly T[]): T {
  return items[randInt(rand, items.length)];
}

const ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** `prefix_xxxxxxxxxx` with 10 base-36 characters (~51 bits) drawn from `rand`. */
export function uid(prefix: string, rand: RandomSource, length = 10): string {
  let s = '';
  for (let i = 0; i < length; i++) s += ID_ALPHABET[randInt(rand, ID_ALPHABET.length)];
  return prefix ? `${prefix}_${s}` : s;
}

/** Letters used by pairing codes: A–Z without the ambiguous I and O (24 letters). */
export const PAIR_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const PAIR_CODE_LENGTH = 4;

/** Whole 4-letter codes that must never be shown (I/O-free words only; others can't occur). */
const BLOCKED_WORDS = new Set([
  'ANAL', 'ANUS', 'ARSE', 'BUTT', 'CRAP', 'CUNT', 'DAMN', 'DUMB', 'DYKE', 'FUCK', 'FUKK', 'FUCC',
  'HELL', 'JERK', 'KUNT', 'NAZI', 'PAKI', 'PERV', 'PUKE', 'RAPE', 'SCUM', 'SEXY', 'SLAG', 'SLUT',
  'SPAZ', 'SUCK', 'TURD', 'TWAT', 'WANK', 'MUFF', 'NUTS', 'GAYS', 'FART', 'DEAD', 'KYKE',
  'HATE', 'UGLY', 'DRUG', 'MERD', 'CACA', 'PUTE', 'CULS', 'BITE',
]);
/** Three-letter fragments that make any code containing them unusable. */
const BLOCKED_FRAGMENTS = ['FUK', 'FUC', 'FCK', 'CUM', 'ASS', 'SEX', 'FAG', 'KKK', 'TIT', 'WTF', 'NGR', 'NGA', 'JEW', 'GAY', 'CUL', 'PUT', 'KUK', 'VAG', 'XXX'];

/** true if a code is well-formed (4 letters of {@link PAIR_ALPHABET}) and not offensive. */
export function isValidPairCode(code: string): boolean {
  if (typeof code !== 'string' || code.length !== PAIR_CODE_LENGTH) return false;
  for (const ch of code) if (!PAIR_ALPHABET.includes(ch)) return false;
  return !isBlockedPairCode(code);
}

/** true if the code spells or contains a rude word. */
export function isBlockedPairCode(code: string): boolean {
  const c = code.toUpperCase();
  if (BLOCKED_WORDS.has(c)) return true;
  return BLOCKED_FRAGMENTS.some((f) => c.includes(f));
}

/**
 * Generates a 4-letter pairing code (e.g. "KXPM") from `rand`, avoiding I/O and rude words.
 * Retries a bounded number of times; the fallback is a fixed, safe code.
 */
export function pairCode(rand: RandomSource): string {
  for (let attempt = 0; attempt < 64; attempt++) {
    let c = '';
    for (let i = 0; i < PAIR_CODE_LENGTH; i++) c += PAIR_ALPHABET[randInt(rand, PAIR_ALPHABET.length)];
    if (!isBlockedPairCode(c)) return c;
  }
  return 'LUMA';
}

/**
 * Cleans what a person typed on the phone into a candidate code: upper-case, letters only,
 * at most 4 characters. Validity (alphabet, blocklist) is checked by {@link isValidPairCode}.
 */
export function normalizePairCode(input: string): string {
  return String(input ?? '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, PAIR_CODE_LENGTH);
}
