/**
 * Heuristic distractors: two plausible wrong answers "of the same type" as the right one.
 * Used by the offline splitter and to repair AI output.
 */
import type { Lang } from '../src/core/types';
import { answerType, fold, rng, YEAR_RE, type AnswerType } from './nlp';

const SUPERSCRIPT: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' };
const TO_SUP = Object.fromEntries(Object.entries(SUPERSCRIPT).map(([k, v]) => [v, k]));

const same = (a: string, b: string) => fold(a).replace(/\s+/g, ' ').trim() === fold(b).replace(/\s+/g, ' ').trim();

function shuffle<T>(arr: T[], r: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Years near `y` (±1..5, both directions), deterministic order. */
function nearbyYears(y: number, r: () => number): number[] {
  const out: number[] = [];
  for (const k of shuffle([1, 2, 3, 4, 5, 6], r)) out.push(r() < 0.5 ? y - k : y + k);
  return out;
}

function replaceYear(s: string, y: number): string {
  return s.replace(YEAR_RE, String(y));
}

/** Perturb the scientific exponent if any (×10^23, 10²³, e23). */
function perturbExponent(s: string, r: () => number): string[] {
  const caret = s.match(/10\s*\^\s*(-?\d+)/);
  if (caret) {
    const e = parseInt(caret[1], 10);
    return shuffle([1, -1, 2, -2, 3], r).map((k) => s.replace(caret[0], `10^${e + k}`));
  }
  const sup = s.match(/10([⁻]?[⁰¹²³⁴⁵⁶⁷⁸⁹]+)/);
  if (sup) {
    const e = parseInt([...sup[1]].map((c) => SUPERSCRIPT[c]).join(''), 10);
    return shuffle([1, -1, 2, -2, 3], r).map((k) => {
      const n = String(e + k)
        .split('')
        .map((c) => TO_SUP[c])
        .join('');
      return s.replace(sup[0], `10${n}`);
    });
  }
  const en = s.match(/(\d)[eE]([+-]?\d+)/);
  if (en) {
    const e = parseInt(en[2], 10);
    return shuffle([1, -1, 2], r).map((k) => s.replace(en[0], `${en[1]}e${e + k}`));
  }
  return [];
}

/** Perturb the first plain number, preserving its decimals and decimal separator. */
function perturbNumber(s: string, r: () => number): string[] {
  const m = s.match(/-?\d+(?:[.,]\d+)?/);
  if (!m) return [];
  const raw = m[0];
  const sep = raw.includes(',') ? ',' : '.';
  const decimals = raw.includes(sep) ? raw.split(sep)[1].length : 0;
  const v = parseFloat(raw.replace(',', '.'));
  const fmt = (x: number) => {
    const t = decimals ? x.toFixed(decimals) : String(Math.round(x));
    return sep === ',' ? t.replace('.', ',') : t;
  };
  const cands = new Set<string>();
  // digit swap (6.02 → 6.20) keeps the "look" of the number
  const digits = raw.replace(/[^\d]/g, '');
  if (digits.length >= 2) {
    const i = digits.length - 2;
    const swapped = digits.slice(0, i) + digits[i + 1] + digits[i] + digits.slice(i + 2);
    if (swapped !== digits) {
      let k = 0;
      cands.add(raw.replace(/\d/g, () => swapped[k++]));
    }
  }
  const factors = shuffle([2, 0.5, 1.5, 0.75, 1.1, 0.9, 3, 10, 0.1], r);
  for (const f of factors) {
    const x = v * f;
    if (!decimals && Math.abs(v) < 20) cands.add(fmt(v + (r() < 0.5 ? -1 : 1) * (1 + Math.floor(r() * 3))));
    cands.add(fmt(x));
  }
  return [...cands].filter((c) => c !== raw && !/^-?0+([.,]0+)?$/.test(c)).map((c) => s.replace(raw, c));
}

const GENERIC: Record<Lang, [string, string]> = { en: ['None of these', 'Something else'], fr: ['Aucune de ces réponses', 'Autre chose'] };

export interface DistractorOpts {
  lang: Lang;
  /** Other answers of the same course (the best source of plausible confusions). */
  pool?: string[];
  /** Further candidate phrases (e.g. terms found in the course text). */
  extra?: string[];
  /** Seed, defaults to the answer itself. */
  seed?: string;
}

export function makeDistractors(answer: string, opts: DistractorOpts): [string, string] {
  const r = rng(opts.seed ?? answer);
  const type: AnswerType = answerType(answer);
  const out: string[] = [];
  const push = (c: string | undefined) => {
    if (!c) return;
    const t = c.trim();
    if (!t || t.length > 80 || same(t, answer) || out.some((o) => same(o, t))) return;
    if (fold(answer).length > 3 && (fold(t).includes(fold(answer)) || fold(answer).includes(fold(t))) && type !== 'number' && type !== 'year') return;
    out.push(t);
  };
  const pool = (opts.pool ?? []).filter((p) => !same(p, answer));

  if (type === 'year' || type === 'date') {
    const y = parseInt(answer.match(YEAR_RE)?.[1] ?? '', 10);
    // same-type answers from the course first (confusing WWI with WWII dates is the real exam trap)
    const sameType = pool.filter((p) => answerType(p) === type);
    const near = sameType
      .map((p) => ({ p, d: Math.abs(parseInt(p.match(YEAR_RE)?.[1] ?? '0', 10) - y) }))
      .filter((x) => x.d > 0 && x.d <= 30)
      .sort((a, b) => a.d - b.d);
    if (near[0]) push(near[0].p);
    if (Number.isFinite(y)) for (const ny of nearbyYears(y, r)) if (out.length < 2) push(replaceYear(answer, ny));
  } else if (type === 'number') {
    for (const c of perturbExponent(answer, r).slice(0, 1)) push(c);
    for (const c of perturbNumber(answer, r)) if (out.length < 2) push(c);
    for (const c of perturbExponent(answer, r)) if (out.length < 2) push(c);
  }

  if (out.length < 2) {
    const words = answer.split(/\s+/).length;
    const scored = pool
      .filter((p) => answerType(p) === type || (type === 'text' && answerType(p) === 'name') || (type === 'name' && answerType(p) === 'text'))
      .map((p) => ({ p, s: Math.abs(p.split(/\s+/).length - words) + (answerType(p) === type ? 0 : 2) + r() }))
      .sort((a, b) => a.s - b.s);
    for (const { p } of scored) if (out.length < 2) push(p);
  }
  if (out.length < 2) {
    const words = answer.split(/\s+/).length;
    const extra = (opts.extra ?? [])
      .map((p) => ({ p, s: Math.abs(p.split(/\s+/).length - words) + r() * 2 }))
      .sort((a, b) => a.s - b.s);
    for (const { p } of extra) if (out.length < 2) push(p);
  }
  for (const g of GENERIC[opts.lang]) if (out.length < 2) push(g);
  return [out[0], out[1]];
}
