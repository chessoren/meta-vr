/**
 * Offline heuristic splitter: course text → atomic question/answer candidates.
 * No AI, deterministic, works on French and English notes.
 *
 * Recognised shapes (in priority order):
 *   Q/A        "Q: … A: …", "Question : … Réponse : …", "What …? Answer", a question line followed by its answer
 *   date       "1914: start of WWI", "11 novembre 1918 – armistice", "Armistice (1918)"
 *   formula    "N_A = 6.02 × 10^23 mol⁻¹"
 *   definition "term: definition", "term – definition", "term → definition"
 *   sentence   sentences containing a year / a number (cloze), "X is Y" / "X est Y" copulas
 */
import type { Lang } from '../src/core/types';
import { MAX_NOTIONS } from '../src/core/types';
import { answerType, cap, detectLang, fold, MONTHS, stripArticle, trimAnswer, wordCount } from './nlp';

export type CandidateKind = 'qa' | 'date' | 'formula' | 'definition' | 'term' | 'cloze-year' | 'cloze-number' | 'copula';

export interface Candidate {
  question: string;
  answer: string;
  accept: string[];
  kind: CandidateKind;
  score: number;
  /** Position in the course, to keep the learner's order. */
  order: number;
}

export interface SplitResult {
  lang: Lang;
  title?: string;
  subject: string;
  candidates: Candidate[];
  /** Number of facts found before capping to MAX_NOTIONS. */
  found: number;
  /** Candidate phrases (terms, names) usable as distractors. */
  terms: string[];
}

const BASE_SCORE: Record<CandidateKind, number> = {
  qa: 10,
  date: 9,
  formula: 8,
  definition: 7,
  term: 6.5,
  'cloze-year': 5,
  'cloze-number': 4.5,
  copula: 3,
};

// ─── line helpers ────────────────────────────────────────────────────────────

const BULLET = /^\s*(?:[-*•·▪◦‣►▶✓✔→]|\d{1,2}[.)](?!\d)|[a-zA-Z][.)](?=\s))\s*/;
const HEADING_WORDS = /^(chapitre|chapter|leçon|lecon|lesson|partie|part|unit|unité|unite|section|thème|theme|module|cours|course)\b/i;

function isHeading(line: string, next: string | undefined): boolean {
  if (/^#{1,6}\s/.test(line)) return true;
  const letters = line.replace(/[^\p{L}]/gu, '');
  if (letters.length >= 4 && letters === letters.toLocaleUpperCase() && wordCount(line) <= 8) return true;
  if (/^[^:]{2,60}:\s*$/.test(line)) return true;
  if (HEADING_WORDS.test(line) && wordCount(line) <= 10 && !/[.?!]$/.test(line)) return true;
  if (/^(I|II|III|IV|V|VI|VII|VIII|IX|X)[.)-]\s+\S/.test(line) && wordCount(line) <= 10) return true;
  return next === '' && wordCount(line) <= 6 && !/[.?!:;,]$/.test(line) && /^[A-ZÀ-Ý]/.test(line) && !/\d{3,4}/.test(line) && !/[:=–—→]/.test(line);
}

const cleanHeading = (s: string) =>
  s
    .replace(/^#+\s*/, '')
    .replace(/^(chapitre|chapter|leçon|lecon|lesson|partie|part|unit|unité|unite|module|thème|theme)\s*[\w.]*\s*[—–:-]\s*(?=\S)/i, '')
    .replace(/^(I|II|III|IV|V|VI|VII|VIII|IX|X)[.)-]\s+/, '')
    .replace(/:\s*$/, '')
    .trim();

const endQ = (lang: Lang, q: string) => {
  const t = q.replace(/[\s.;,:!?]+$/, '');
  return lang === 'fr' ? `${t} ?` : `${t}?`;
};

/** "Louis XVI was executed in … (year?)" */
const cloze = (sentence: string, what: string) => `${sentence.replace(/[\s.;,:!?]+$/, '')} (${what})`;

// French typography: space before : ? ! ;
const colon = (lang: Lang) => (lang === 'fr' ? ' : ' : ': ');

const DATE_FULL = new RegExp(
  String.raw`(?:(?:le\s+)?\d{1,2}(?:er)?\s+(?:${MONTHS})\s+\d{3,4}|(?:${MONTHS})\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{3,4}|\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:${MONTHS}),?\s+\d{3,4})`,
  'i',
);
const YEAR_ONLY = String.raw`(?:(?:en|in)\s+)?(?:1[0-9]{3}|20[0-9]{2})(?:\s*[-–]\s*(?:1[0-9]{3}|20[0-9]{2}))?`;
const DATE_ANY = `(?:${DATE_FULL.source}|${YEAR_ONLY})`;
const SEP = String.raw`\s*(?:[:：=→>]|–|—|\s-\s)\s*`;

const RE_DATE_FIRST = new RegExp(`^(${DATE_ANY})${SEP}(.{3,200})$`, 'i');
const RE_DATE_LAST = new RegExp(String.raw`^(.{3,200}?)\s*(?:[:：→]|–|—|\s-\s|,)?\s*\(?\s*(${DATE_ANY})\s*\)?\s*\.?$`, 'i');
const RE_FORMULA = /^([^=]{1,60}?)\s*=\s*([^=]{1,80})$/;
const RE_DEF = /^([^:：–—→=]{1,80}?)(?:\s*[:：]\s*|\s+[–—-]\s+|\s*→\s*|\s*[–—]\s*)(.{2,300})$/;
const RE_QA_LABELS = /^(?:q(?:uestion)?)\s*[:.)-]\s*(.+?)\s*(?:r(?:éponse|eponse)?|a(?:nswer)?)\s*[:.)-]\s*(.+)$/i;
const RE_Q_LABEL = /^(?:q(?:uestion)?)\s*[:.)-]\s*(.+)$/i;
const RE_A_LABEL = /^(?:r(?:éponse|eponse)?|a(?:nswer)?|rép)\s*[:.)-]\s*(.+)$/i;
const RE_Q_THEN_A = /^(.{6,220}?\?)\s*(?:[-–—:→=>]+\s*)?([^?]{1,80})$/;

const COPULA_EN = /^(.{3,90}?)\s+(is|are|was|were|means|refers to|is called|was called)\s+(.{2,160}?)\.?$/i;
const COPULA_FR = /^(.{3,90}?)\s+(est|sont|était|étaient|fut|furent|signifie|désigne|s'appelle|se nomme)\s+(.{2,160}?)\.?$/i;

function years(s: string): string[] {
  return s.match(/\b(1[0-9]{3}|20[0-9]{2})\b/g) ?? [];
}

function acceptFor(answer: string): string[] {
  const acc = new Set<string>();
  const a = answer.trim();
  const noArt = stripArticle(a);
  if (noArt && noArt !== a) acc.add(noArt);
  const paren = a.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  if (paren && paren !== a) acc.add(paren);
  const type = answerType(a);
  if (type === 'date' || /^(en|in)\s+\d/i.test(a)) years(a).forEach((y) => acc.add(y));
  if (type === 'number') {
    const n = a.match(/-?\d+(?:[.,]\d+)?/);
    if (n && n[0] !== a) acc.add(n[0]);
  }
  acc.delete(a);
  return [...acc].slice(0, 6);
}

function subjectOf(text: string, title = ''): string {
  const t = fold(`${text}\n${title}\n${title}\n${title}`);
  const score = (words: string[]) => words.reduce((s, w) => s + (t.match(new RegExp(`\\b${w}`, 'g'))?.length ?? 0), 0);
  const subjects: [string, string[]][] = [
    ['History', ['guerre', 'war', 'bataille', 'battle', 'traite', 'treaty', 'empire', 'revolution', 'roi', 'king', 'siecle', 'century', 'armistice', 'republique', 'republic']],
    ['Chemistry', ['mol', 'atom', 'chimi', 'chemi', 'molecul', 'reaction', 'avogadro', 'ion', 'acide', 'acid', 'element']],
    ['Physics', ['energie', 'energy', 'force', 'newton', 'vitesse', 'velocity', 'masse', 'mass', 'joule', 'watt', 'gravit']],
    ['Biology', ['cellul', 'cell', 'adn', 'dna', 'gene', 'organ', 'mitochond', 'protein', 'photosynth', 'enzym']],
    ['Geography', ['capital', 'pays', 'country', 'fleuve', 'river', 'montagne', 'mountain', 'continent', 'ocean', 'population']],
    ['Maths', ['theorem', 'equation', 'fonction', 'function', 'derive', 'integral', 'triangle', 'nombre', 'formula', 'formule']],
    ['Literature', ['roman', 'novel', 'poem', 'poeme', 'auteur', 'author', 'ecrivain', 'writer', 'personnage', 'character']],
    ['Vocabulary', ['vocabulary', 'vocabulaire', 'translate', 'traduction', 'word', 'mot']],
  ];
  let best = 'Course';
  let bestScore = 2;
  for (const [name, words] of subjects) {
    const s = score(words);
    if (s > bestScore) {
      best = name;
      bestScore = s;
    }
  }
  return best;
}

// ─── the splitter ────────────────────────────────────────────────────────────

export function splitCourse(input: string, opts: { title?: string; max?: number } = {}): SplitResult {
  const max = opts.max ?? MAX_NOTIONS;
  const text = input.replace(/\r\n?/g, '\n').replace(/ /g, ' ');
  const lang = detectLang(text);
  const raw = text.split('\n').map((l) => l.replace(/\s+/g, ' ').trim());
  const cands: Candidate[] = [];
  const terms = new Set<string>();
  let title: string | undefined;
  let heading = '';
  let seenContent = false;
  let order = 0;

  const add = (kind: CandidateKind, question: string, answer: string, extraScore = 0) => {
    const a = trimAnswer(answer);
    const q = question.trim();
    if (!a || !q || q.length > 220 || a.length > 80 || fold(q) === fold(a)) return;
    const words = wordCount(a);
    let score = BASE_SCORE[kind] + extraScore;
    if (words > 6) score -= 2;
    if (words > 10) {
      if (kind !== 'qa') return;
      score -= 3;
    }
    if (words <= 3) score += 0.5;
    cands.push({ question: q, answer: a, accept: acceptFor(a), kind, score, order: order++ });
  };

  const sentenceFacts = (sentence: string) => {
    const s = sentence.trim().replace(/\s+/g, ' ');
    const wc = wordCount(s);
    if (wc < 4 || wc > 45) return;
    // cloze on a full date or a year
    const full = s.match(DATE_FULL);
    if (full) {
      const q = s.replace(full[0], '…');
      add('cloze-year', cloze(q, lang === 'fr' ? 'date ?' : 'date?'), full[0].replace(/^le\s+/i, ''));
      return;
    }
    const ys = years(s);
    if (ys.length) {
      const y = ys[0];
      const q = s.replace(new RegExp(`\\b(en |in )?${y}\\b`), (m) => (m.startsWith('en ') ? 'en …' : m.startsWith('in ') ? 'in …' : '…'));
      add('cloze-year', cloze(q, lang === 'fr' ? 'année ?' : 'year?'), y);
      return;
    }
    // cloze on a number with unit / scientific notation
    const num = s.match(/-?\d+(?:[.,]\d+)?(?:\s*(?:×|x|\*)\s*10\s*(?:\^\s*-?\d+|[⁻]?[⁰¹²³⁴⁵⁶⁷⁸⁹]+))?(?:\s*(?:%|[a-zA-Zµ°][\w⁻¹²³/·.]*))?/);
    if (num && /\d/.test(num[0]) && num[0].trim().length >= 2) {
      const q = s.replace(num[0], '…');
      add('cloze-number', cloze(q, lang === 'fr' ? 'valeur ?' : 'value?'), num[0].trim());
      return;
    }
    const cop = /\?$/.test(s) ? null : s.match(lang === 'fr' ? COPULA_FR : COPULA_EN);
    if (cop && !/[,;]/.test(cop[1]) && !/\b(how|what|why|where|who|when|you|i|we|comment|pourquoi|où|tu|je|vous|nous)\b/i.test(cop[1])) {
      const [, left, verb, right] = cop;
      if (wordCount(right) <= 6 && wordCount(left) <= 12) add('copula', endQ(lang, `${left} ${verb}…`), right);
      else if (wordCount(left) <= 4 && wordCount(right) <= 18) {
        const who = /^[A-ZÀ-Ý]/.test(left) && !/^(the|le|la|les|l'|un|une|a|an)\b/i.test(left);
        const q =
          lang === 'fr'
            ? `${who ? 'Qui' : "Qu'est-ce qui"} ${verb} ${right}`
            : `${who ? 'Who' : 'What'} ${verb} ${right}`;
        add('copula', endQ(lang, q), left, -0.5);
        terms.add(trimAnswer(left));
      }
    }
  };

  for (let i = 0; i < raw.length; i++) {
    const line0 = raw[i];
    if (!line0) continue;
    const next = raw[i + 1];
    const hadBullet = BULLET.test(line0);
    const line = line0.replace(BULLET, '').trim();
    if (!line) continue;

    const firstLine = !seenContent && next === '' && wordCount(line0) <= 10 && !/[.?!;]$/.test(line0) && !RE_DATE_FIRST.test(line0);
    seenContent = true;
    if (!hadBullet && (firstLine || isHeading(line0, next))) {
      heading = cleanHeading(line0);
      if (!title) title = heading.slice(0, 80);
      continue;
    }

    // explicit Q/A
    let m = line.match(RE_QA_LABELS);
    if (m) {
      add('qa', endQ(lang, m[1]), m[2]);
      continue;
    }
    m = line.match(RE_Q_LABEL);
    if (m && next && RE_A_LABEL.test(next)) {
      add('qa', endQ(lang, m[1]), next.match(RE_A_LABEL)![1]);
      i++;
      continue;
    }
    if (/\?\s*$/.test(line) && next && !next.endsWith('?') && wordCount(next) <= 12 && wordCount(line) >= 2) {
      const ans = next.replace(BULLET, '').replace(RE_A_LABEL, '$1');
      add('qa', endQ(lang, line.replace(RE_Q_LABEL, '$1')), ans);
      i++;
      continue;
    }
    m = line.match(RE_Q_THEN_A);
    if (m && wordCount(m[2]) <= 10) {
      add('qa', endQ(lang, m[1]), m[2]);
      continue;
    }

    // dates
    m = line.match(RE_DATE_FIRST);
    if (m && wordCount(m[2]) <= 30) {
      const date = m[1].replace(/^(en|in|le)\s+/i, '');
      const isFull = DATE_FULL.test(date);
      const ev = cap(m[2].replace(/[.;]\s*$/, ''));
      const q = lang === 'fr' ? `${isFull ? 'À quelle date' : 'En quelle année'}${colon(lang)}${ev}` : `${isFull ? 'On what date' : 'In what year'}${colon(lang)}${ev}`;
      add('date', endQ(lang, q), date);
      continue;
    }
    m = line.match(RE_DATE_LAST);
    if (m && wordCount(m[1]) <= 25 && wordCount(m[1]) >= 1 && !/\b(1[0-9]{3}|20[0-9]{2})\b/.test(m[1])) {
      const date = m[2].replace(/^(en|in|le)\s+/i, '');
      const isFull = DATE_FULL.test(date);
      const ev = cap(m[1].replace(/[\s:,–—-]+$/, ''));
      // "La bataille de Verdun a lieu en 1916" is a sentence; "Armistice (1918)" is an event label
      if (wordCount(ev) <= 10) {
        const q = lang === 'fr' ? `${isFull ? 'À quelle date' : 'En quelle année'}${colon(lang)}${ev}` : `${isFull ? 'On what date' : 'In what year'}${colon(lang)}${ev}`;
        add('date', endQ(lang, q), date);
        terms.add(ev);
        continue;
      }
    }

    // formula / value
    m = line.match(RE_FORMULA);
    if (m && wordCount(m[1]) <= 8) {
      const term = m[1].replace(/^[-•*]\s*/, '');
      add('formula', `${term} = ${lang === 'fr' ? '?' : '?'}`, m[2]);
      terms.add(trimAnswer(term));
      continue;
    }

    // definition
    m = line.match(RE_DEF);
    if (m && wordCount(m[1]) <= 8 && !/[.?!]$/.test(m[1]) && !/^(http|www)/i.test(m[1])) {
      const term = trimAnswer(m[1]);
      const def = trimAnswer(m[2]);
      terms.add(term);
      if (wordCount(def) <= 6) {
        let q: string;
        if (/capital/i.test(heading) && wordCount(term) <= 4 && wordCount(def) <= 3)
          q = lang === 'fr' ? `Quelle est la capitale${colon(lang)}${term}` : `What is the capital of ${term}`;
        else if (wordCount(term) <= 3 && wordCount(def) <= 3 && !/\b(is|est|are|sont)\b/i.test(def)) q = `${term} →`;
        else q = lang === 'fr' ? `Qu'est-ce que « ${term} »` : `What is ${/^(the|a|an)\s/i.test(term) ? term : `“${term}”`}`;
        add('definition', endQ(lang, q).replace(/→ \?$|→\?$/, '→ ?'), def);
        terms.add(def);
      } else if (wordCount(term) <= 5) {
        const shortDef = def.length > 170 ? def.slice(0, 167).replace(/\s+\S*$/, '') + '…' : def;
        const q = lang === 'fr' ? `Quel terme${colon(lang)}« ${shortDef} »` : `Which term${colon(lang)}“${shortDef}”`;
        add('term', endQ(lang, q), term);
      }
      continue;
    }

    // free sentences (paragraphs)
    const sentences = line.split(/(?<=[.!?;])\s+(?=[A-ZÀ-Ý0-9«"“])/);
    for (const s of sentences) sentenceFacts(s);
    // capitalised multi-word names as distractor material
    for (const nm of line.match(/\b[A-ZÀ-Ý][\p{L}'’-]+(?:\s+(?:de|du|des|of|the|la|le)?\s*[A-ZÀ-Ý][\p{L}'’-]+)*/gu) ?? []) {
      if (nm.length >= 4 && wordCount(nm) <= 4) terms.add(nm);
    }
  }

  // dedupe (same answer & similar question, or same question)
  const seen = new Set<string>();
  const unique = cands.filter((c) => {
    const kq = fold(c.question).replace(/[^a-z0-9]/g, '');
    const ka = fold(c.answer).replace(/[^a-z0-9]/g, '') + '|' + kq.slice(0, 40);
    if (seen.has(kq) || seen.has(ka)) return false;
    seen.add(kq);
    seen.add(ka);
    return true;
  });

  const found = unique.length;
  const kept = [...unique]
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, max)
    .sort((a, b) => a.order - b.order);

  const answers = new Set(kept.map((c) => fold(c.answer)));
  return {
    lang,
    title: opts.title || title,
    subject: subjectOf(text, title),
    candidates: kept,
    found,
    terms: [...terms].filter((t) => t && t.length <= 60 && !answers.has(fold(t))).slice(0, 200),
  };
}
