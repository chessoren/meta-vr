/**
 * Answer matching for typed and spoken answers, and the phrase list of the offline voice grammar.
 *
 * - {@link normalize}: lower-case, no accents/diacritics, no punctuation, no articles
 *   (the/a/an/le/la/les/l'/un/une/des), single spaces. French content matches accent-insensitively.
 * - {@link matchAnswer}: fuzzy match (Damerau-Levenshtein, length-dependent tolerance) against the
 *   answer and its `accept` list. Numbers must match *exactly* (1914 ≠ 1915) but may be written
 *   in digits or words ("nineteen fourteen", "one thousand nine hundred fourteen", "nineteen
 *   hundred and fourteen"), decimals ("six point oh two"), ordinals and dates in any order
 *   ("6 June 1944" ⇄ "june sixth nineteen forty four"). An input closer to a distractor than to the
 *   answer is never accepted.
 * - {@link spokenForms}: every plausible way to *say* an answer, as lower-case words only (what an
 *   offline Vosk recogniser outputs).
 * - {@link voiceGrammar}: phrase list for a Vosk grammar restricted to a palace.
 * - {@link pickFromTranscript}: which of the three bubbles (answer / distractor 1 / distractor 2)
 *   a transcript designates.
 */
import type { Notion } from './types';
import { decimalWords, cardinalWords, digitWords, MAX_WORDS_NUMBER, ordinalWords, wordsToDigits, yearWords } from './numbers';

// ─────────────────────────────────────────────────────────────────────────────
// Normalisation
// ─────────────────────────────────────────────────────────────────────────────

const ARTICLES = new Set(['the', 'a', 'an', 'le', 'la', 'les', 'un', 'une', 'des']);

/** Lower-cases, strips accents and punctuation; keeps digits and decimal points. Articles are kept. */
export function baseTokens(s: string): string[] {
  let t = String(s ?? '').toLowerCase();
  t = t.replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/ß/g, 'ss').replace(/ø/g, 'o').replace(/ł/g, 'l').replace(/đ/g, 'd');
  t = t.normalize('NFKD').replace(/\p{M}/gu, '');
  t = t.replace(/[’‘`´]/g, "'");
  // French elided article "l'" (l'Allemagne → Allemagne); other apostrophes just vanish (it's → its).
  t = t.replace(/(^|[^a-z0-9])l'(?=[a-z])/g, '$1 ');
  t = t.replace(/'/g, '');
  // Numbers: thousands separators "1,000" → "1000"; French decimal comma "6,02" → "6.02".
  t = t.replace(/(\d)[,  ](\d{3})(?!\d)/g, '$1$2').replace(/(\d)[,  ](\d{3})(?!\d)/g, '$1$2');
  t = t.replace(/(\d),(\d)/g, '$1.$2');
  // Ordinal suffixes: 6th, 1st, 22nd, 3rd, 1er, 2e, 2eme, 2ieme.
  t = t.replace(/\b(\d+)(?:st|nd|rd|th|er|re|eme|ieme|e)\b/g, '$1');
  t = t.replace(/%/g, ' percent ').replace(/&/g, ' and ').replace(/\+/g, ' plus ');
  // Split digits glued to letters: "11am" → "11 am", "ww2" → "ww 2".
  t = t.replace(/(\d)([a-z])/g, '$1 $2').replace(/([a-z])(\d)/g, '$1 $2');
  t = t.replace(/[^a-z0-9.]+/g, ' ');
  t = t.replace(/\.(?!\d)|(?<!\d)\./g, ' ');
  return t.split(/\s+/).filter(Boolean);
}

/** Drops articles; if the phrase is nothing but articles, keeps its last word ("the UN" → "un"). */
function dropArticles(tokens: string[]): string[] {
  const kept = tokens.filter((t) => !ARTICLES.has(t));
  if (kept.length > 0 || tokens.length === 0) return kept;
  return [tokens[tokens.length - 1]];
}

/** Normalised form of a phrase: lower-case, no accents/punctuation/articles, single spaces. */
export function normalize(s: string): string {
  return dropArticles(baseTokens(s)).join(' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Canonical form (numbers, dates, times) used for comparisons
// ─────────────────────────────────────────────────────────────────────────────

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTH_ALIASES: Record<string, string> = {
  jan: 'january', feb: 'february', apr: 'april', jun: 'june', jul: 'july', aug: 'august', sep: 'september', sept: 'september', oct: 'october', nov: 'november', dec: 'december',
  janvier: 'january', fevrier: 'february', mars: 'march', avril: 'april', mai: 'may', juin: 'june', juillet: 'july', aout: 'august', septembre: 'september', octobre: 'october', novembre: 'november', decembre: 'december',
};
const monthOf = (t: string | undefined): string | null => (t === undefined ? null : MONTHS.includes(t) ? t : (MONTH_ALIASES[t] ?? null));
const isDayNumber = (t: string | undefined) => t !== undefined && /^\d{1,2}$/.test(t) && Number(t) >= 1 && Number(t) <= 31;

/** Canonical tokens: number words → digits, "a m" → "am", dates as "<day> <month> [year]", no articles. */
export function canonicalTokens(s: string): string[] {
  let toks = wordsToDigits(baseTokens(s));
  // Times: "11 a m" / "11 p m" → "11 am" / "11 pm".
  const t2: string[] = [];
  for (let i = 0; i < toks.length; i++) {
    if (/^\d/.test(toks[i - 1] ?? '') && (toks[i] === 'a' || toks[i] === 'p') && toks[i + 1] === 'm') {
      t2.push(toks[i] + 'm');
      i++;
    } else t2.push(toks[i]);
  }
  toks = dropArticles(t2).map((t) => monthOf(t) ?? t);
  // Dates: "june 6" / "6 of june" / "the 6 of june" → "6 june".
  for (let i = 0; i < toks.length; i++) {
    if (!monthOf(toks[i])) continue;
    if (isDayNumber(toks[i - 1])) continue;
    if (toks[i - 1] === 'of' && isDayNumber(toks[i - 2])) {
      toks.splice(i - 1, 1);
      i--;
      continue;
    }
    if (isDayNumber(toks[i + 1])) {
      const [day] = toks.splice(i + 1, 1);
      toks.splice(i, 0, day);
      i++;
    }
  }
  return toks;
}

interface Canon {
  source: string;
  tokens: string[];
  nums: string[];
  words: string[];
}

const NUMERIC = /^\d+(\.\d+)?$/;

function canon(s: string): Canon {
  const tokens = canonicalTokens(s);
  return {
    source: s,
    tokens,
    nums: tokens.filter((t) => NUMERIC.test(t)).map(canonNumber),
    words: tokens.filter((t) => !NUMERIC.test(t)),
  };
}

/** "06" → "6", "6.020" → "6.02" (numerically equal numbers compare equal). */
function canonNumber(t: string): string {
  if (!t.includes('.')) return t.replace(/^0+(?=\d)/, '');
  const [a, b] = t.split('.');
  const frac = b.replace(/0+$/, '');
  return (a.replace(/^0+(?=\d)/, '') || '0') + (frac ? '.' + frac : '');
}

// ─────────────────────────────────────────────────────────────────────────────
// Similarity
// ─────────────────────────────────────────────────────────────────────────────

/** Damerau-Levenshtein distance (optimal string alignment: insert, delete, substitute, adjacent transposition). */
export function damerauLevenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = a.length;
  const n = b.length;
  let prev2 = new Array<number>(n + 1).fill(0);
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let cur = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
    }
    [prev2, prev, cur] = [prev, cur, prev2];
  }
  return prev[n];
}

/** Similarity ratio in [0, 1]: 1 − distance / longest length. */
export function similarity(a: string, b: string): number {
  const L = Math.max(a.length, b.length);
  return L === 0 ? 1 : 1 - damerauLevenshtein(a, b) / L;
}

/**
 * Edits tolerated for a target of `len` characters (spaces excluded): exact up to 3 letters,
 * 1 edit up to 6 ("Berne" for "Bern"), 2 up to 11 ("Camberra"), then 20 % of the length.
 */
export function maxEdits(len: number): number {
  if (len <= 3) return 0;
  if (len <= 6) return 1;
  if (len <= 11) return 2;
  return Math.floor(len * 0.2);
}

interface WordsMatch {
  pass: boolean;
  score: number;
}

/** Best fuzzy match of the target words inside the input words (whole input or a window of it). */
function matchWords(input: string[], target: string[]): WordsMatch {
  const t = target.join(' ');
  if (!t) return { pass: true, score: 1 };
  const tol = maxEdits(t.replace(/ /g, '').length);
  let best: WordsMatch = { pass: false, score: 0 };
  const consider = (words: string[], penalty: number) => {
    const s = words.join(' ');
    const d = damerauLevenshtein(s, t);
    const score = (1 - d / Math.max(s.length, t.length, 1)) * penalty;
    const pass = d <= tol;
    if ((pass && !best.pass) || (pass === best.pass && score > best.score)) best = { pass, score };
  };
  consider(input, 1);
  // Also: "it's ottawa", "i think canberra" — windows of the input the size of the target (±1).
  if (input.length > 1) {
    for (let size = Math.max(1, target.length - 1); size <= Math.min(input.length - 1, target.length + 1); size++) {
      for (let k = 0; k + size <= input.length; k++) consider(input.slice(k, k + size), 0.97);
    }
  }
  return best;
}

const sameMultiset = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

/** Score (0–1) and verdict of an input against one candidate phrase. */
function scoreCandidate(input: Canon, cand: Canon): WordsMatch {
  if (cand.tokens.length === 0) return { pass: false, score: 0 };
  if (cand.nums.length > 0) {
    if (!sameMultiset(cand.nums, input.nums)) {
      const w = matchWords(input.words, cand.words);
      return { pass: false, score: 0.5 * (cand.words.length ? w.score : 0) };
    }
    if (cand.words.length === 0) return { pass: true, score: input.words.length ? 0.95 : 1 };
    return matchWords(input.words, cand.words);
  }
  if (input.nums.length > 0 && input.words.length === 0) return { pass: false, score: 0 };
  return matchWords(input.words, cand.words);
}

export interface MatchResult {
  correct: boolean;
  /** Best similarity with the answer (or an accepted form), 0–1. */
  score: number;
  /** The answer or `accept` entry that matched best (set when correct). */
  matched?: string;
}

/**
 * Checks a typed or transcribed answer against a notion.
 * `correct` requires a close-enough match with the answer or an `accept` entry AND a strictly
 * better match with it than with either distractor.
 */
export function matchAnswer(input: string, notion: Pick<Notion, 'answer' | 'accept' | 'distractors'>): MatchResult {
  const inp = canon(input);
  if (inp.tokens.length === 0) return { correct: false, score: 0 };
  const cands = [notion.answer, ...(notion.accept ?? [])].filter((c) => typeof c === 'string' && c.trim());
  let best: WordsMatch = { pass: false, score: 0 };
  let bestCand: string | undefined;
  for (const c of cands) {
    const r = scoreCandidate(inp, canon(c));
    if ((r.pass && !best.pass) || (r.pass === best.pass && r.score > best.score)) {
      best = r;
      bestCand = c;
    }
  }
  let distractor = 0;
  for (const d of notion.distractors ?? []) {
    if (typeof d !== 'string') continue;
    const r = scoreCandidate(inp, canon(d));
    if (r.pass || r.score > 0) distractor = Math.max(distractor, r.pass ? Math.max(r.score, 0.5) : r.score);
  }
  const correct = best.pass && best.score > distractor;
  return correct ? { correct, score: round3(best.score), matched: bestCand } : { correct, score: round3(best.score) };
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

// ─────────────────────────────────────────────────────────────────────────────
// Spoken forms & voice grammar
// ─────────────────────────────────────────────────────────────────────────────

/** Maximum number of spoken forms generated per phrase. */
export const MAX_SPOKEN_FORMS = 40;

function integerForms(t: string): string[] {
  const n = Number(t);
  if (t.length > 1 && t.startsWith('0')) return [digitWords(t, 'oh'), digitWords(t)];
  if (n >= MAX_WORDS_NUMBER) return [digitWords(t)];
  if (t.length === 4 && n >= 1000 && n <= 2999) return yearWords(n);
  const out = [cardinalWords(n)];
  const withAnd = cardinalWords(n, true);
  if (withAnd !== out[0]) out.push(withAnd);
  if (n >= 100 && n < 200) out.push('a ' + cardinalWords(n).replace(/^one /, ''));
  return out;
}

function tokenForms(t: string): string[] {
  if (/^\d+$/.test(t)) return integerForms(t);
  if (/^\d+\.\d+$/.test(t)) return decimalWords(t);
  if (t === 'am' || t === 'pm') return [`${t[0]} m`, t];
  return [t];
}

/** Cartesian product of alternatives, first alternatives first, capped. */
function product(parts: string[][], cap: number): string[] {
  let acc: string[] = [''];
  for (const alts of parts) {
    const next: string[] = [];
    for (const a of acc) for (const b of alts) {
      if (next.length >= cap * 4) break;
      next.push(a ? (b ? `${a} ${b}` : a) : b);
    }
    acc = next;
  }
  // Order: interleave so the first forms of every part are favoured (already the case), then cap.
  return acc.slice(0, cap);
}

/**
 * Every plausible spoken English form of an answer, lower-case words only, most natural first.
 * Examples: "1914" → ["nineteen fourteen", "nineteen hundred and fourteen", …];
 * "6 June 1944" → ["june sixth nineteen forty four", "the sixth of june nineteen forty four", …];
 * "6.02" → ["six point zero two", "six point oh two"]; "Canberra" → ["canberra"].
 */
export function spokenForms(answer: string): string[] {
  const toks = baseTokens(answer).map((t) => monthOf(t) ?? t);
  const out: string[] = [];
  const add = (f: string) => {
    const clean = f.replace(/\s+/g, ' ').trim();
    if (clean && /^[a-z]+( [a-z]+)*$/.test(clean) && !out.includes(clean)) out.push(clean);
  };
  expandTokens(toks).forEach(add);
  // Article-less variants ("the somme" → "somme").
  const bare = dropArticles(toks);
  if (bare.length !== toks.length) expandTokens(bare).forEach(add);
  return out.slice(0, MAX_SPOKEN_FORMS);
}

/** Spoken alternatives of a token list (numbers, dates, times expanded), capped. */
function expandTokens(toks: string[]): string[] {
  const parts: string[][] = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    const month = monthOf(t);
    // Date "<day> <month> [year]" or "<month> <day> [year]".
    if (month && (isDayNumber(toks[i - 1]) || isDayNumber(toks[i + 1]))) {
      const dayBefore = isDayNumber(toks[i - 1]);
      const day = Number(dayBefore ? toks[i - 1] : toks[i + 1]);
      if (dayBefore) parts.pop();
      const ord = ordinalWords(day);
      const card = cardinalWords(day);
      parts.push([`${month} ${ord}`, `the ${ord} of ${month}`, `${ord} of ${month}`, `${month} the ${ord}`, `${ord} ${month}`, `${month} ${card}`, `${card} ${month}`]);
      if (!dayBefore) i++;
      continue;
    }
    parts.push(tokenForms(t));
  }
  return product(parts, MAX_SPOKEN_FORMS);
}

/**
 * Phrase list for a Vosk grammar restricted to the palace: all spoken forms of every answer,
 * accepted form and distractor, plus "[unk]" so out-of-grammar speech is not forced onto a phrase.
 */
export function voiceGrammar(notions: Array<Pick<Notion, 'answer' | 'accept' | 'distractors'>>): string[] {
  const set = new Set<string>();
  for (const n of notions) {
    for (const phrase of [n.answer, ...(n.accept ?? []), ...(n.distractors ?? [])]) {
      if (typeof phrase === 'string') for (const f of spokenForms(phrase)) set.add(f);
    }
  }
  return [...set, '[unk]'];
}

export interface TranscriptPick {
  /** 0 = the answer, 1 = distractors[0], 2 = distractors[1] (the three bubbles). */
  index: 0 | 1 | 2;
  /** The option text that was recognised. */
  option: string;
  score: number;
}

/**
 * Which of the three options a voice transcript designates, or null if none clearly does.
 * "[unk]" tokens are ignored; the transcript may contain extra words ("i think canberra").
 */
export function pickFromTranscript(transcript: string, notion: Pick<Notion, 'answer' | 'accept' | 'distractors'>): TranscriptPick | null {
  const clean = String(transcript ?? '').replace(/\[unk\]/gi, ' ');
  const inp = canon(clean);
  if (inp.tokens.length === 0) return null;
  const options: Array<{ index: 0 | 1 | 2; texts: string[] }> = [
    { index: 0, texts: [notion.answer, ...(notion.accept ?? [])] },
    { index: 1, texts: [notion.distractors?.[0]] as string[] },
    { index: 2, texts: [notion.distractors?.[1]] as string[] },
  ];
  const results: Array<TranscriptPick> = [];
  for (const o of options) {
    let best: { score: number; text: string } | null = null;
    for (const text of o.texts) {
      if (typeof text !== 'string' || !text.trim()) continue;
      const r = scoreCandidate(inp, canon(text));
      if (r.pass && (!best || r.score > best.score)) best = { score: r.score, text };
    }
    if (best) results.push({ index: o.index, option: o.index === 0 ? notion.answer : best.text, score: round3(best.score) });
  }
  if (results.length === 0) return null;
  results.sort((a, b) => b.score - a.score);
  if (results.length > 1 && results[0].score - results[1].score < 0.02) return null;
  return results[0];
}
