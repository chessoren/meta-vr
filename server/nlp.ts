/** Small, dependency-free text helpers shared by the offline splitter, distractors and repair. */
import type { Lang } from '../src/core/types';

export const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Deterministic PRNG seeded by a string/number, so results are stable for a given course. */
export { seededRandom as rng } from '../src/core/ids';

const FR_WORDS = new Set(
  'le la les des du de un une et est sont en au aux dans pour par sur avec qui que quoi dont ou où ne pas plus cette ces cet son sa ses leur leurs il elle ils elles nous vous était ont été fut guerre année siècle traité mondiale première seconde chimie'.split(
    ' ',
  ),
);
const EN_WORDS = new Set(
  'the a an and is are was were of in on at to for by with which who what that this these those it its their they he she we you has have had been war year century treaty world first second chemistry'.split(' '),
);

export function detectLang(text: string): Lang {
  const words = fold(text).match(/[a-z']+/g) ?? [];
  let fr = 0;
  let en = 0;
  for (const w of words.slice(0, 4000)) {
    if (FR_WORDS.has(w)) fr++;
    if (EN_WORDS.has(w)) en++;
  }
  fr += (text.match(/[éèêàçùôîœ]/gi)?.length ?? 0) * 0.5;
  return fr > en ? 'fr' : 'en';
}

const STOP = new Set([...FR_WORDS, ...EN_WORDS, 'l', 'd', 'qu', 'c', 's', 'n', 'j', 'm', 't']);
export const isStop = (w: string) => STOP.has(fold(w));

export type AnswerType = 'year' | 'date' | 'number' | 'name' | 'text';

export const MONTHS =
  'january|february|march|april|may|june|july|august|september|october|november|december|janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre';
export const MONTH_RE = new RegExp(`\\b(${MONTHS})\\b`, 'i');
export const YEAR_RE = /\b(1[0-9]{3}|20[0-9]{2}|[1-9][0-9]{2})\b/;

export function answerType(a: string): AnswerType {
  const s = a.trim();
  if (/^(?:en\s+|in\s+)?-?\d{3,4}(?:\s*(?:av\.?\s*J\.?-?C\.?|BC|AD|BCE|CE))?$/i.test(s)) return 'year';
  if (MONTH_RE.test(s) && /\d/.test(s)) return 'date';
  if (/\d/.test(s) && s.replace(/[^\d]/g, '').length >= s.replace(/\s/g, '').length * 0.3) return 'number';
  if (/\d/.test(s) && s.split(/\s+/).length <= 4) return 'number';
  const words = s.split(/\s+/);
  if (words.length <= 4 && words.every((w) => /^[A-ZÀ-ÖØ-Þ][\p{L}'’.-]*$/u.test(w) || isStop(w)) && /^[A-ZÀ-ÖØ-Þ]/.test(s)) return 'name';
  return 'text';
}

export function trimAnswer(s: string): string {
  return s
    .replace(/^[\s"“«‘'(]+|[\s"”»’')]+$/g, '')
    .replace(/[\s.;,!]+$/, '')
    .trim();
}

export function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

export function cap(s: string): string {
  return s ? s[0].toLocaleUpperCase() + s.slice(1) : s;
}

/** Remove a leading article, e.g. "the Treaty of Versailles" → "Treaty of Versailles". */
export function stripArticle(s: string): string {
  return s.replace(/^(?:(?:the|a|an|le|la|les|un|une|des|du)\s+|l['’]\s*)/i, '').trim();
}
