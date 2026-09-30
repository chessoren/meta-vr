/**
 * Offline mnemonic composer: turns a question/answer pair into a SceneRecipe built from the model
 * library, following the rules memory athletes use — the image must be **exaggerated** (a giant
 * hero), **moving** (a lively anim), **absurd** (unexpected pairings) and **linked to the answer by
 * sound or meaning**.
 *
 * Used when the AI is unavailable (and as a safety net for bad AI output). Deterministic: the
 * same text always gives the same scene (seeded by the text).
 *
 * Strategy:
 * 1. **Sound-alike** — the answer's words are compared with every model's `soundsLike` syllables
 *    (raw prefixes, then a consonant-skeleton phonetic key): "Avogadro" → AVOcado,
 *    "Ottawa" → OTTer. A second model may pun on the rest of the word ("CAN-BERra" → can + bear).
 * 2. **Meaning** — otherwise, models whose `tags` match the answer or the question's keywords
 *    ("Treaty of …" → scroll, "peace" → dove).
 * 3. **Numbers** — a 'count' actor shows a salient digit (1–12) and a label-capable prop carries
 *    the full number.
 * 4. When there is no strong sound-alike, the answer is always written on a label-capable prop.
 */
import type { AnimId, SceneActor, SceneRecipe } from './types';
import { CATALOG_INDEX, type CatalogEntry, catalogEntry, isTextModel } from './catalog-index';
import { baseTokens } from './matching';
import { wordsToDigits } from './numbers';
import { hashString, mulberry32, pick, type RandomSource } from './ids';

export interface ComposeOpts {
  /** Models already used elsewhere in the palace: avoided when an equally good option exists. */
  avoid?: string[];
  /** Extra seed to get a different (still deterministic) variant. */
  seed?: string | number;
}

/** Score from which a sound/meaning link is considered strong enough to carry the memory alone. */
export const STRONG_LINK = 7;
/** Longest label that reads well on a prop. */
export const MAX_LABEL = 24;

const STOPWORDS = new Set(
  (
    'what which who whom whose where when why how is was were are be been the a an of in on at to for by with from and or not ' +
    'did does do its it this that these those called name named known as year date capital city country main first last ' +
    'le la les l de du des un une quel quelle quels quelles est sont en dans au aux et ou qui que quoi par pour sur avec ' +
    'annee date nom pays ville capitale ce cette ces se sa son ses leur'
  ).split(' '),
);

const ANIM_VERB: Record<AnimId, string> = {
  idle: 'sitting',
  bounce: 'bouncing',
  spin: 'spinning',
  wobble: 'wobbling',
  orbit: 'circling',
  juggle: 'juggling',
  float: 'floating',
  shake: 'shaking',
  grow: 'swelling',
  march: 'stomping',
  fly: 'flying',
  rain: 'tumbling',
  stack: 'stacking up',
  flip: 'somersaulting',
  dance: 'dancing',
};

const COUNT_MODELS = ['ball', 'coin', 'star', 'apple', 'bell', 'dice', 'snowflake', 'dove', 'balloon', 'candle', 'poppy', 'medal'];
const COUNT_ANIMS: AnimId[] = ['juggle', 'rain', 'stack', 'orbit', 'bounce'];
const FALLBACK_HEROES = ['owl', 'elephant', 'kangaroo', 'penguin', 'frog', 'cat', 'lightbulb', 'snail'];
const ACCENTS = ['#f5b942', '#7fd1ae', '#ff8a65', '#9fa8ff', '#f48fb1', '#80deea', '#ffd54f', '#aed581'];
const NO_PLURAL = new Set(['sheep', 'fish', 'dice']);

// ─────────────────────────────────────────────────────────────────────────────
// Phonetics
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Consonant skeleton of a word with simple English + French rules, e.g. "Avogadro" → "avgdr",
 * "Canberra" → "knbr", "photo" → "ft". The first letter is kept (vowel or not), later vowels and
 * h are dropped, doubled letters collapse.
 */
export function phoneticKey(word: string): string {
  let w = String(word ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z]/g, '');
  if (!w) return '';
  w = w
    .replace(/eau|au/g, 'o')
    .replace(/ph/g, 'f')
    .replace(/sch|sh|ch/g, 'X')
    .replace(/ck/g, 'k')
    .replace(/qu/g, 'k')
    .replace(/q/g, 'k')
    .replace(/x/g, 'ks')
    .replace(/c(?=[eiy])/g, 's')
    .replace(/c/g, 'k')
    .replace(/z/g, 's')
    .replace(/th/g, 't')
    .replace(/gh/g, 'g')
    .replace(/gn/g, 'n')
    .replace(/y/g, 'i')
    .replace(/X/g, 'x');
  const rest = w.slice(1).replace(/[aeiouh]/g, '');
  return (w[0] + rest).replace(/(.)\1+/g, '$1');
}

interface SoundHit {
  entry: CatalogEntry;
  score: number;
  /** The word that matched. */
  word: string;
  /** Length of the matched prefix of `word` (0 when the match is inside the word or by meaning). */
  prefixLen: number;
  kind: 'sound' | 'meaning';
}

const lettersOnly = (s: string) => s.replace(/[^a-z]/g, '');

/** How well a word puns on a catalog entry (0 = not at all). */
function soundScore(word: string, entry: CatalogEntry): { score: number; prefixLen: number } {
  let best = { score: 0, prefixLen: 0 };
  const consider = (score: number, prefixLen: number) => {
    if (score > best.score) best = { score, prefixLen };
  };
  if (word === entry.id) consider(12, word.length);
  const wk = phoneticKey(word);
  for (const raw of entry.soundsLike) {
    const s = lettersOnly(raw);
    if (s.length < 2) continue;
    if (word === s) consider(11, word.length);
    else if (s.length >= 3 && word.startsWith(s)) consider(4 + s.length, s.length);
    else if (s.length >= 4 && word.includes(s)) consider(2 + s.length * 0.6, 0);
    const sk = phoneticKey(s);
    if (sk.length >= 3 && wk.startsWith(sk)) consider(3 + sk.length * 0.5, 0);
  }
  return best;
}

/** How well a set of words evokes an entry by meaning (tags). */
function meaningScore(words: string[], phrase: string, entry: CatalogEntry): number {
  let best = 0;
  for (const tag of entry.tags) {
    if (tag.includes(' ')) {
      if (` ${phrase} `.includes(` ${tag} `)) best = Math.max(best, 10);
    } else if (words.includes(tag)) best = Math.max(best, 9);
  }
  return best;
}

/** Candidate models ranked by how well they hook `words` (sound first, then meaning). */
function rankEntries(words: string[], rand: RandomSource, avoid: Set<string>, meaningOnly = false): SoundHit[] {
  const phrase = words.join(' ');
  const hits: SoundHit[] = [];
  // Seeded shuffle so ties are broken deterministically but not always alphabetically.
  const order = CATALOG_INDEX.map((entry) => ({ entry, r: rand() }));
  for (const { entry, r } of order) {
    let best: SoundHit | null = null;
    if (!meaningOnly) {
      for (const w of words) {
        if (w.length < 3) continue;
        const s = soundScore(w, entry);
        if (s.score > 0 && (!best || s.score > best.score)) best = { entry, score: s.score, word: w, prefixLen: s.prefixLen, kind: 'sound' };
      }
    }
    const m = meaningScore(words, phrase, entry);
    if (m > 0 && (!best || m > best.score)) best = { entry, score: m, word: '', prefixLen: 0, kind: 'meaning' };
    if (best) {
      if (avoid.has(entry.id)) best.score -= 3;
      best.score += r * 0.01;
      hits.push(best);
    }
  }
  return hits.sort((a, b) => b.score - a.score);
}

// ─────────────────────────────────────────────────────────────────────────────
// Numbers
// ─────────────────────────────────────────────────────────────────────────────

/** A digit count 1–12 that stands for a number: 6.02 → 6, 11 → 11, 1914 → 4, 1911 → 11, 1905 → 5. */
export function salientCount(num: string): number {
  const [intPart] = num.split('.');
  const n = Number(intPart);
  if (n >= 1 && n <= 12) return n;
  if (intPart.length >= 3) {
    const lastTwo = Number(intPart.slice(-2));
    if (lastTwo >= 1 && lastTwo <= 12) return lastTwo;
  }
  const digits = [...intPart].map(Number).filter((d) => d > 0);
  if (digits.length === 0) return 1;
  // Prefer the last non-zero digit (1914 → 4, 1940 → 4).
  return digits[digits.length - 1];
}

function numbersIn(answer: string): string[] {
  return wordsToDigits(baseTokens(answer)).filter((t) => /^\d+(\.\d+)?$/.test(t));
}

// ─────────────────────────────────────────────────────────────────────────────
// Composition
// ─────────────────────────────────────────────────────────────────────────────

const upper = (s: string) => s.toUpperCase();
const pluralName = (e: CatalogEntry, n: number) => {
  const name = upper(e.name);
  if (n === 1 || NO_PLURAL.has(e.id)) return name;
  return name + 'S';
};
const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

function heroAnim(e: CatalogEntry, rand: RandomSource): AnimId {
  const lively = e.anims.filter((a) => a !== 'idle');
  return lively.length ? pick(rand, lively.slice(0, 3)) : 'bounce';
}

function clampLabel(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= MAX_LABEL ? t : t.slice(0, MAX_LABEL - 1).trimEnd() + '…';
}

function chooseTextModel(questionWords: string[], rand: RandomSource): string {
  const has = (...ws: string[]) => ws.some((w) => questionWords.includes(w));
  if (has('treaty', 'law', 'act', 'declaration', 'charter', 'constitution', 'traite', 'loi', 'decree')) return 'scroll';
  if (has('country', 'nation', 'nations', 'flag', 'independence', 'pays', 'drapeau')) return 'flag';
  if (has('book', 'author', 'wrote', 'novel', 'poem', 'livre', 'auteur', 'ecrit')) return 'book';
  if (has('who', 'person', 'memorial', 'died', 'born', 'qui')) return 'plaque';
  return pick(rand, ['sign', 'plaque', 'sign', 'scroll']);
}

/**
 * Composes a vivid mnemonic scene for a notion (1–3 actors, only catalog models, labels only on
 * text-capable props, counts 1–12). The caption puts the hook words in CAPS and lists them in
 * `hooks`.
 */
export function composeScene(question: string, answer: string, opts: ComposeOpts = {}): SceneRecipe {
  const seedText = `${question}\u0000${answer}\u0000${opts.seed ?? ''}`;
  const rand = mulberry32(hashString(seedText));
  const avoid = new Set(opts.avoid ?? []);

  const ansTokens = baseTokens(answer).filter((t) => /[a-z]/.test(t));
  const ansWords = ansTokens.filter((t) => !STOPWORDS.has(t));
  const qWords = baseTokens(question).filter((t) => /[a-z]/.test(t) && !STOPWORDS.has(t));
  const nums = numbersIn(answer);

  const nonText = (h: SoundHit) => !h.entry.text;
  const answerHits = rankEntries(ansWords, rand, avoid).filter(nonText);
  const strong = answerHits.length > 0 && answerHits[0].score >= STRONG_LINK && answerHits[0].kind === 'sound';
  const answerMeaning = answerHits.find((h) => h.kind === 'meaning' && h.score >= STRONG_LINK);

  let heroHit: SoundHit | undefined;
  if (strong) heroHit = answerHits[0];
  else if (answerMeaning) heroHit = answerMeaning;
  else {
    const qHits = rankEntries(qWords, rand, avoid, false).filter(nonText);
    heroHit = qHits.find((h) => h.kind === 'meaning') ?? (qHits[0] && qHits[0].score >= STRONG_LINK ? qHits[0] : undefined);
  }
  const hero = heroHit?.entry ?? entryOf(pickAvoiding(rand, FALLBACK_HEROES, avoid));
  const used = new Set([hero.id]);

  const hAnim = heroAnim(hero, rand);
  const heroActor: SceneActor = { model: hero.id, role: 'hero', anim: hAnim, scale: 1.2 };

  // Second pun on the rest of the word: CAN-BERra → can + bear.
  let second: { entry: CatalogEntry; part: string } | undefined;
  if (strong && heroHit && heroHit.prefixLen > 0 && heroHit.prefixLen < heroHit.word.length) {
    const rest = heroHit.word.slice(heroHit.prefixLen);
    if (rest.length >= 3) {
      const hits = rankEntries([rest], rand, avoid)
        .filter((h) => nonText(h) && !used.has(h.entry.id) && h.kind === 'sound' && h.prefixLen >= 3)
        .slice(0, 1);
      if (hits.length) second = { entry: hits[0].entry, part: rest.slice(0, hits[0].prefixLen) };
    }
  }

  // Number → count actor.
  let countActor: SceneActor | undefined;
  let countEntry: CatalogEntry | undefined;
  let count = 0;
  if (nums.length) {
    count = salientCount(nums[0]);
    const id = pickAvoiding(rand, COUNT_MODELS.filter((m) => !used.has(m)), avoid);
    countEntry = entryOf(id);
    used.add(countEntry.id);
    const natural = COUNT_ANIMS.filter((a) => countEntry!.anims.includes(a));
    const anim: AnimId = hAnim === 'juggle' && countEntry.anims.includes('juggle') ? 'juggle' : natural.length ? pick(rand, natural) : 'bounce';
    countActor = { model: countEntry.id, role: 'count', anim, count };
  }

  // Label: always when the sound link is weak, and whenever there is a number.
  const needLabel = !strong || nums.length > 0;
  let labelActor: SceneActor | undefined;
  let labelEntry: CatalogEntry | undefined;
  let labelText = '';
  if (needLabel) {
    const id = chooseTextModel(baseTokens(question), rand);
    labelEntry = entryOf(id);
    labelText = clampLabel(answer.length <= MAX_LABEL || !nums.length ? answer : nums[0]);
    labelActor = { model: labelEntry.id, role: 'prop', anim: labelEntry.anims.includes('float') ? 'float' : labelEntry.anims[0], label: labelText };
  }

  const actors: SceneActor[] = [heroActor];
  if (labelActor) actors.push(labelActor);
  if (countActor && actors.length < 3) actors.push(countActor);
  if (second && actors.length < 3) {
    actors.push({ model: second.entry.id, role: 'prop', anim: heroAnim(second.entry, rand) });
  } else second = undefined;

  // ── Caption ──
  const HERO = upper(hero.name);
  const hooks: string[] = [HERO];
  let caption = `A giant ${HERO} ${ANIM_VERB[hAnim]}`;
  if (countActor && countEntry) {
    const things = pluralName(countEntry, count);
    const phrase =
      countActor.anim === 'juggle'
        ? ` juggling ${count} ${things}`
        : countActor.anim === 'rain'
          ? ` under ${count} falling ${things}`
          : countActor.anim === 'stack'
            ? ` beside a stack of ${count} ${things}`
            : ` with ${count} ${things}`;
    caption += hAnim === 'juggle' && countActor.anim === 'juggle' ? phrase.replace(' juggling', '') : phrase;
    hooks.push(things);
  }
  if (second) {
    const S = upper(second.entry.name);
    caption += `${countActor ? ' and' : ' with'} ${article(S)} ${S}`;
    hooks.push(S);
  }
  if (strong && heroHit) {
    const w = heroHit.word;
    const pre = heroHit.prefixLen > 0 ? heroHit.prefixLen : w.length;
    let display = upper(w.slice(0, pre));
    hooks.push(display);
    let rest = w.slice(pre);
    if (second && rest.startsWith(second.part)) {
      display += '-' + upper(second.part);
      rest = rest.slice(second.part.length);
    }
    if (rest) display += '-' + rest;
    caption += ` — ${display}!`;
    if (labelActor) caption += ` (${upper(labelText)} on ${article(labelEntry!.name)} ${labelEntry!.name.toLowerCase()})`;
  } else if (labelActor && labelEntry) {
    const L = upper(labelText);
    caption += ` beside ${article(labelEntry.name)} ${labelEntry.name.toLowerCase()} that reads "${L}"`;
    hooks.push(L);
  }
  if (!caption.endsWith('!') && !caption.endsWith(')')) caption += '!';

  return {
    actors,
    caption,
    hooks: [...new Set(hooks)].filter((h) => caption.includes(h)),
    accent: ACCENTS[hashString(seedText) % ACCENTS.length],
  };
}

function entryOf(id: string): CatalogEntry {
  const e = catalogEntry(id);
  if (!e) throw new Error(`mnemonic: unknown model ${id}`);
  return e;
}

function pickAvoiding(rand: RandomSource, ids: string[], avoid: Set<string>): string {
  const fresh = ids.filter((id) => !avoid.has(id));
  return pick(rand, fresh.length ? fresh : ids);
}

/** Models that pun on a word, best first (for tools and the AI prompt). */
export function soundAlikes(word: string, limit = 5): Array<{ id: string; score: number }> {
  const w = lettersOnly(baseTokens(word).join(''));
  if (w.length < 3) return [];
  return CATALOG_INDEX.map((e) => ({ id: e.id, score: soundScore(w, e).score }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1))
    .slice(0, limit);
}

/** true if every actor of a recipe respects the library contract (used by tests and validators). */
export function isValidRecipe(r: SceneRecipe, knownIds: (id: string) => boolean): boolean {
  if (!r || !Array.isArray(r.actors) || r.actors.length < 1 || r.actors.length > 3) return false;
  if (typeof r.caption !== 'string' || !r.caption.trim()) return false;
  return r.actors.every(
    (a) =>
      knownIds(a.model) &&
      (a.label === undefined || (isTextModel(a.model) && a.label.length <= MAX_LABEL)) &&
      (a.role !== 'count' || (Number.isInteger(a.count) && (a.count as number) >= 1 && (a.count as number) <= 12)),
  );
}
