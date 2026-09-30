/**
 * Offline mnemonic composer: turns a question/answer pair into a SceneRecipe built from the model
 * library, following the rules memory athletes use — the image must be **exaggerated** (a giant
 * hero), **moving** (a lively anim), **absurd** (unexpected pairings) and **linked to the answer by
 * sound or meaning**, and the scene must **bind the question to the answer**.
 *
 * Used when the AI is unavailable (and as a safety net for bad AI output). Deterministic: the
 * same text always gives the same scene (seeded by the text). Pure and fast (< 1 ms per notion).
 *
 * Strategy (answer first, then question):
 * 1. **Salient words** of the answer — English + French, accent-insensitive, French elisions
 *    (l', d', qu') removed, stop words dropped, words also present in the question demoted, month
 *    names and units ignored in dates/quantities. French school words carry an English gloss
 *    (cœur → heart, centrale → power) so they reach the same meanings.
 * 2. **Links** from every salient word to every model, best first:
 *    - the model itself (house, apple…) or its name;
 *    - **sound-alikes** on the model's `soundsLike` syllables — prefix (AVO-gadro → avocado),
 *      suffix (dar-WIN → trophy), whole word, consonant-skeleton phonetics;
 *    - **compound parts** (POWER-HOUSE → house + lightning), and **anim puns** (SHAKE-SPEARe →
 *      a sword that shakes);
 *    - **meaning**: model tags, a curated concept table for school notions (oxygen → tree,
 *      power → lightning, heart → lion "Cœur de Lion"), multi-word tags ("de gaulle" → radio).
 *      A word that fits many models counts less than a specific one; a model linked by sound AND
 *      meaning, or to the answer AND the question, wins ties.
 * 3. **Hero** = the best answer link (concrete, animated with its natural anim, or the anim the
 *    pun asks for). For a number/date/formula answer, the hero comes from the question and the
 *    number is carried by a count actor + a label. The last model of `avoid` (the previous notion)
 *    is never reused as hero when anything else fits.
 * 4. **Second actor**: the other half of the pun (CAN-BERRA → can + kangaroo? no: can + berries;
 *    OTTA-WA → otter + wave), else a **question prop** linked to the question (Kenya → key), so the
 *    scene binds Q → A.
 * 5. **Numbers**: years/dates → brass plaque with the year or date; a salient digit 1–12 → that
 *    many copies of a question-linked (or generic) model (1914 → 4 helmets).
 * 6. **Label** only when needed (numbers, formulas, weak or meaning-only links): the key word or
 *    number, ≤ {@link LABEL_CHARS} characters, never a truncated sentence.
 * 7. **Caption**: one vivid English line, hook words in CAPS (listed in `hooks`), ending with the
 *    link to the answer ("— KEN-ya: NAI-robi!", "— MITOCHONDRIA: the POWER-HOUSE of the cell!").
 */
import type { AnimId, SceneActor, SceneRecipe } from './types';
import { CATALOG_INDEX, type CatalogEntry, catalogEntry, isTextModel } from './catalog-index';
import { baseTokens } from './matching';
import { wordsToDigits } from './numbers';
import { hashString, mulberry32, pick, type RandomSource } from './ids';

export interface ComposeOpts {
  /**
   * Models already used elsewhere in the palace (in placement order): avoided when an equally
   * good option exists. The last one is the previous notion's hero and is never reused as hero
   * when any other model fits.
   */
  avoid?: string[];
  /** Extra seed to get a different (still deterministic) variant. */
  seed?: string | number;
}

/** Score from which a sound/meaning link is considered strong enough to carry the memory alone. */
export const STRONG_LINK = 7;
/** Longest label accepted on a prop (validation of AI and stored scenes). */
export const MAX_LABEL = 24;
/** Longest label the offline composer writes: one key word or number that reads at a glance. */
export const LABEL_CHARS = 14;
/** Longest caption (same as the server limit). */
export const MAX_CAPTION = 160;

// ─────────────────────────────────────────────────────────────────────────────
// Lexicon
// ─────────────────────────────────────────────────────────────────────────────

const words = (s: string) => s.split(/\s+/).filter(Boolean);

const STOPWORDS = new Set(
  words(
    'what which who whom whose where when why how is was were are be been being the a an of in on at to for by with from and or not ' +
      'did does do done its it this that these those called name named known as year years date capital city country main first last ' +
      'his her their he she they them has have had gave give given can could would should will may might very much many more most ' +
      'about into over under than then there here also only such some any each other one two between during after before ' +
      'mean means meaning stand stands define definition called known used use uses make makes made get gets ' +
      'le la les l de du des un une quel quelle quels quelles est sont en dans au aux et ou qui que quoi par pour sur avec ' +
      'annee annees date nom pays ville capitale ce cette ces se sa son ses leur leurs il elle ils elles on ne pas plus moins tres ' +
      'quest qu c d s n j m t y a ete etait sont fut etre avoir fait faire'
  ),
);
// "son" is a French possessive but also "sound": keep it out of the stop words when glossed below.
STOPWORDS.delete('son');

/** Question words that say what kind of fact is asked, not what it is about (weak links). */
const WEAK_Q = new Set(
  words(
    'formula formule chemical chimique symbol symbole number nombre theory theorie law loi unit unite value valeur ' +
      'largest biggest smallest longest highest greatest plus grand premier premiere first president organ organe ' +
      'produce produces produced produit release releases gas gaz author auteur wrote ecrit painted peint discovered decouvert ' +
      'developed invented inventor who begin began start debut end fin signature signed date happen happened'
  ),
);

/** French school words → English meaning words (the catalog tags are mostly English). */
const GLOSS: Record<string, string[]> = parseTable(
  'centrale:power energetique:energy energie:energy cellule:cell coeur:heart sang:blood pompe:pump vitesse:speed son:sound ' +
    'lumiere:light eau:water sel:salt fer:iron argent:silver,money arbre:tree plante:plant plantes:plant soleil:sun lune:moon ' +
    'etoile:star terre:earth mer:sea fleuve:river riviere:river montagne:mountain guerre:war paix:peace roi:king reine:queen ' +
    'empereur:emperor couronnement:coronation sacre:coronation chute:fall mur:wall appel:appeal traite:treaty bataille:battle ' +
    'armee:army debarquement:landing francaise:french francais:french allemagne:germany espagne:spain bresil:brazil japon:japan ' +
    'chine:china angleterre:england anglais:english italie:italy romain:rome romaine:rome russie:russia amerique:america ' +
    'azote:nitrogen carbone:carbon dioxyde:dioxide oxygene:oxygen hydrogene:hydrogen acide:acid sucre:sugar poids:weight ' +
    'temps:time heure:hour livre:book ecrivain:writer peintre:painter musique:music nuit:night jour:day feu:fire glace:ice ' +
    'neige:snow froid:cold chaud:hot chaleur:heat vent:wind pluie:rain nuage:cloud oiseau:bird poisson:fish cheval:horse ' +
    'ours:bear decouverte:discovery ebullition:boiling liberte:liberty monde:world mondiale:world occident:west atmosphere:air ' +
    'planete:planet electricite:electricity lumineuse:light sonore:sound gravite:gravity mouvement:motion vie:life mort:death ' +
    'empire:empire revolution:revolution bastille:bastille portugal:portugal kenya:kenya ocean:ocean',
);

/**
 * Curated school concepts → models, best first (meaning links the tags cannot express or order).
 * Keys are English words (French words reach them through GLOSS).
 */
const CONCEPTS: Record<string, string[]> = parseTable(
  'power:lightning,eagle energy:lightning,sun,atom electricity:lightning,lightbulb oxygen:tree,cloud nitrogen:balloon,cloud ' +
    'hydrogen:balloon,zeppelin carbon:fire,atom dioxide:cloud,fire gas:cloud,balloon air:balloon,cloud salt:sailor,wave ' +
    'water:wave,fish heart:lion,dove blood:poppy sound:bell,radio speed:lightning,rocket,car,horse speeds:rocket,lightning ' +
    'fast:rocket,lightning light:lightbulb,sun gold:coin,crown,trophy silver:coin iron:magnet,hammer planet:globe ' +
    'jupiter:lightning,globe mars:soldier,rocket venus:dove saturn:globe gravity:apple gravitation:apple relativity:clock,scientist ' +
    'time:clock short:clock reaction:flask acid:flask force:magnet,hammer theorem:pyramid triangle:pyramid president:eagle ' +
    'ocean:wave,ship pacific:wave,ship atlantic:ship,wave river:bridge,ship nile:pyramid rome:eagle,pizza japan:sun italy:pizza ' +
    'brazil:ball portugal:ship,sailor germany:eagle,zeppelin emperor:crown,king coronation:crown,king queen:crown war:soldier,tank,helmet ' +
    'revolution:fire,rooster bastille:castle landing:ship,wave peace:dove treaty:dove dna:flask,scientist gene:flask ' +
    'boiling:teacup,fire heat:fire,sun cold:snowflake,penguin ice:snowflake,penguin evolution:fish,frog species:fish,frog ' +
    'discovery:ship,telescope america:eagle,ship columbus:ship,globe liberty:bell,eagle freedom:dove,eagle wall:brickwall ' +
    'photosynthesis:tree,sun plant:tree cell:tower pump:gear wine:cheese love:dove music:radio,bell writer:book painter:owl',
);

function parseTable(src: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const item of words(src)) {
    const [k, v] = item.split(':');
    out[k] = v.split(',');
  }
  return out;
}

/** Words (answer or question) that ask for a particular movement of the hero. */
const ANIM_WORDS: Record<string, AnimId> = {
  fall: 'shake', chute: 'shake', collapse: 'shake', crash: 'shake', explosion: 'shake', boiling: 'shake', ebullition: 'shake',
  rise: 'grow', growth: 'grow', grow: 'grow', croissance: 'grow', pump: 'grow', pompe: 'grow', pumps: 'grow',
  speed: 'spin', speeds: 'spin', vitesse: 'spin', rotation: 'spin', spin: 'spin', turn: 'spin',
  flight: 'fly', fly: 'fly', vol: 'fly', dance: 'dance', danse: 'dance', jump: 'bounce', saut: 'bounce', march: 'march', marche: 'march',
};

/** Anim names that can start a word: SHAKE-speare → the hero shakes. */
const ANIM_PUNS: AnimId[] = ['shake', 'spin', 'bounce', 'dance', 'flip', 'march', 'grow', 'float', 'wobble', 'juggle'];

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

/** How a model is named in captions (short, and containing the word the puns hit). */
const SHORT_NAME: Record<string, string> = {
  house: 'HOUSE', can: 'CAN of berries', tank: 'TANK', plaque: 'PLAQUE', cannon: 'CANNON', helmet: 'HELMET', radio: 'RADIO',
  telephone: 'TELEPHONE', car: 'CAR', train: 'TRAIN', ship: 'SHIP', tower: 'TOWER', bridge: 'BRIDGE', balloon: 'BALLOON',
  clock: 'CLOCK', pyramid: 'PYRAMID', gear: 'COGWHEEL', sword: 'SWORD', sign: 'SIGN', ball: 'BALL', lightning: 'LIGHTNING bolt',
  boot: 'BOOT', tophat: 'TOP HAT', coin: 'GOLD COIN', brickwall: 'BRICK WALL', fire: 'FIRE', wave: 'WAVE',
};
const PLURAL_NAME: Record<string, string> = {
  can: 'CANS of berries', lightning: 'LIGHTNING bolts', sheep: 'SHEEP', fish: 'FISH', dice: 'DICE', fire: 'FIRES', gear: 'COGWHEELS',
};
/** How a secondary model joins the hero in the caption. */
const PROP_PHRASE: Record<string, string> = {
  lightning: 'crackling with LIGHTNING', fire: 'on FIRE', cloud: 'under a rain CLOUD', sun: 'under a blazing SUN',
  moon: 'under a full MOON', star: 'under a shooting STAR', wave: 'surfing a huge WAVE', snowflake: 'in a SNOWFLAKE blizzard',
  rainbow: 'on a RAINBOW', tophat: 'wearing a TOP HAT', crown: 'wearing a CROWN', helmet: 'wearing a HELMET',
  umbrella: 'under an UMBRELLA', key: 'waving a KEY', sword: 'waving a SWORD', flag: 'waving a FLAG',
};

const MONTHS: Record<string, [number, string]> = {};
(
  [
    ['january janvier jan janv', 'Jan'], ['february fevrier feb fevr', 'Feb'], ['march mars mar', 'Mar'], ['april avril apr avr', 'Apr'],
    ['may mai', 'May'], ['june juin jun', 'June'], ['july juillet jul juil', 'July'], ['august aout aug', 'Aug'],
    ['september septembre sep sept', 'Sept'], ['october octobre oct', 'Oct'], ['november novembre nov', 'Nov'], ['december decembre dec', 'Dec'],
  ] as const
).forEach(([names, abbr], i) => words(names).forEach((n) => (MONTHS[n] = [i + 1, abbr])));
const FR_MONTH_ABBR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const UNIT_WORDS = new Set(words('km s m h kg g mol cm mm c f k j w v n pa hz percent degres degrees degre degree celsius kelvin an ans ad bc jc av apr'));

// ─────────────────────────────────────────────────────────────────────────────
// Phonetics & stems
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

/**
 * Crude English/French stem so cognates meet: oxygène/oxygen, photosynthèse/photosynthesis,
 * énergie/energy, mitochondrie/mitochondria, électricité/electricity, planète/planet, speeds/speed.
 */
export function stem(word: string): string {
  let s = word;
  if (s.length > 5) s = s.replace(/sis$/, 'se');
  s = s.replace(/(?<=..)(?:ie|ia|ies)$/, 'y').replace(/ite$/, 'ity').replace(/ique$/, 'ic').replace(/isme$/, 'ism');
  if (s.length > 4) s = s.replace(/(?:es|s|x)$/, '');
  if (s.length > 4) s = s.replace(/[ey]$/, '');
  return s;
}

const lettersOnly = (s: string) => s.replace(/[^a-z]/g, '');
const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '');

// ─────────────────────────────────────────────────────────────────────────────
// Catalog, precomputed
// ─────────────────────────────────────────────────────────────────────────────

interface EntryInfo {
  e: CatalogEntry;
  /** id + words of the name (≥ 3 letters). */
  names: string[];
  /** stem → rank (0..1, 0 = first tag = most central meaning). */
  tagStems: Map<string, number>;
  /** single-word tags ≥ 4 letters (for compound parts). */
  tagWords: string[];
  /** multi-word tags. */
  multi: string[];
  sounds: Array<{ s: string; k: string }>;
}

let INFO: EntryInfo[] | null = null;
let INFO_BY_ID: Map<string, EntryInfo> = new Map();
function info(): EntryInfo[] {
  if (INFO) return INFO;
  INFO = CATALOG_INDEX.map((e) => {
    const names = [...new Set([e.id, ...words(fold(e.name).replace(/[^a-z ]/g, ' '))])].filter((w) => w.length >= 3 && !STOPWORDS.has(w));
    const tagStems = new Map<string, number>();
    const multi: string[] = [];
    const tagWords: string[] = [];
    e.tags.forEach((t, i) => {
      if (t.includes(' ')) multi.push(t);
      else {
        const st = stem(t);
        if (!tagStems.has(st)) tagStems.set(st, i / Math.max(1, e.tags.length));
        if (t.length >= 4 && /^[a-z]+$/.test(t)) tagWords.push(t);
      }
    });
    const sounds = e.soundsLike.map((raw) => lettersOnly(raw)).filter((s) => s.length >= 2).map((s) => ({ s, k: phoneticKey(s) }));
    return { e, names, tagStems, tagWords, multi, sounds };
  });
  INFO_BY_ID = new Map(INFO.map((i) => [i.e.id, i]));
  return INFO;
}

// ─────────────────────────────────────────────────────────────────────────────
// Words
// ─────────────────────────────────────────────────────────────────────────────

interface Word {
  /** accent-free lower-case form. */
  norm: string;
  /** as written (accents, case). */
  raw: string;
  stem: string;
  /** English meaning words (itself, its stem, French gloss). */
  means: string[];
  /** 0 = first word of the text … 1 = last. */
  pos: number;
  /** Capitalised in the source and not the first word (a proper noun). */
  proper: boolean;
  /** 0-based index among the text's words. */
  index: number;
}

const ELISION = /(?<![\p{L}])(?:qu|[dljmnstc])['’](?=\p{L})/giu;

function tokenize(text: string): Word[] {
  const src = String(text ?? '').replace(ELISION, ' ');
  const out: Word[] = [];
  let first = true;
  for (const m of src.matchAll(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu)) {
    const raw = m[0];
    const toks = baseTokens(raw);
    for (const t of toks) {
      const st = stem(t);
      const gloss = GLOSS[t] ?? GLOSS[st] ?? [];
      out.push({
        norm: t,
        raw: toks.length === 1 ? raw : t,
        stem: st,
        means: [...new Set([t, st, ...gloss, ...gloss.map(stem)])],
        pos: 0,
        proper: !first && /^\p{Lu}/u.test(raw),
        index: out.length,
      });
    }
    first = false;
  }
  out.forEach((w, i) => (w.pos = out.length > 1 ? i / (out.length - 1) : 0));
  return out;
}

const isContent = (w: Word) => /[a-z]/.test(w.norm) && w.norm.length >= 3 && !STOPWORDS.has(w.norm);

// ─────────────────────────────────────────────────────────────────────────────
// Links
// ─────────────────────────────────────────────────────────────────────────────

type LinkKind = 'exact' | 'sound' | 'part' | 'anim' | 'meaning';

interface Link {
  entry: CatalogEntry;
  score: number;
  kind: LinkKind;
  word: Word;
  /** Slice of `word.norm` the pun hits ([0, len] for a whole-word or meaning link). */
  start: number;
  end: number;
  /** anim pun: the anim that starts the word (SHAKE-speare). */
  anim?: AnimId;
  source: 'answer' | 'question';
}

/** How well a word puns on an entry, and on which slice of the word. */
function soundLink(w: string, inf: EntryInfo): { score: number; start: number; end: number } {
  let best = { score: 0, start: 0, end: 0 };
  const consider = (score: number, start: number, end: number) => {
    if (score > best.score) best = { score, start, end };
  };
  const wk = phoneticKey(w);
  for (const { s, k } of inf.sounds) {
    if (w === s) consider(11, 0, w.length);
    else if (s.length >= 3 && w.startsWith(s)) consider(4 + s.length, 0, s.length);
    else if (s.length >= 3 && w.length - s.length >= 2 && w.endsWith(s)) consider(3 + s.length * 0.9, w.length - s.length, w.length);
    else if (s.length >= 4 && w.includes(s)) {
      const i = w.indexOf(s);
      consider(2 + s.length * 0.6, i, i + s.length);
    }
    if (k.length >= 3 && wk.startsWith(k)) consider(3 + k.length * 0.5, 0, Math.min(w.length, s.length));
  }
  return best;
}

/** Meaning score of a word for an entry (0 = none). */
function meaningLink(w: Word, inf: EntryInfo): number {
  let best = 0;
  for (const m of w.means) {
    const c = CONCEPTS[m];
    if (c) {
      const r = c.indexOf(inf.e.id);
      if (r >= 0) best = Math.max(best, 9.8 - 0.4 * r);
    }
    const rank = inf.tagStems.get(stem(m));
    if (rank !== undefined) best = Math.max(best, 9 + 0.6 * (1 - rank));
  }
  return best;
}

/** Every link from a list of words to the catalog (several per entry possible). */
function linksFor(ws: Word[], source: 'answer' | 'question'): Link[] {
  const out: Link[] = [];
  const all = info();
  const phrase = ` ${ws.map((w) => w.norm).join(' ')} `;
  const glossPhrase = ` ${ws.map((w) => w.means[w.means.length - 1] ?? w.norm).join(' ')} `;
  for (const w of ws) {
    if (!isContent(w)) continue;
    const n = w.norm;
    const perWord: Link[] = [];
    for (const inf of all) {
      const e = inf.e;
      const mk = (score: number, kind: LinkKind, start = 0, end = n.length, anim?: AnimId): Link => ({ entry: e, score, kind, word: w, start, end, anim, source });
      if (inf.names.includes(n) || inf.names.includes(w.stem)) perWord.push(mk(12, 'exact'));
      const s = soundLink(n, inf);
      if (s.score > 0) perWord.push(mk(s.score, 'sound', s.start, s.end));
      const m = meaningLink(w, inf);
      if (m > 0) perWord.push(mk(m, 'meaning'));
      if (n.length >= 6) {
        // Compound parts: POWER-HOUSE (the model's own name scores high, a tag less).
        for (const t of [...inf.names, ...inf.tagWords]) {
          if (t.length < 4 || t === n || n.length - t.length < 3) continue;
          const isName = inf.names.includes(t);
          if (n.startsWith(t)) perWord.push(mk(isName ? 10 : 7, 'part', 0, t.length));
          else if (n.endsWith(t)) perWord.push(mk(isName ? 10 : 7, 'part', n.length - t.length, n.length));
        }
      }
    }
    // Anim puns: SHAKE-SPEARe → the rest of the word puns on a model, which then shakes.
    for (const a of ANIM_PUNS) {
      if (n.length - a.length < 3 || !n.startsWith(a)) continue;
      const rest = n.slice(a.length);
      for (const inf of all) {
        if (!inf.e.anims.includes(a)) continue;
        const s = soundLink(rest, inf);
        if (s.score >= 7 && s.start === 0) perWord.push({ entry: inf.e, score: s.score + 1.5, kind: 'anim', word: w, start: a.length, end: a.length + s.end, anim: a, source });
      }
    }
    // Specificity: a word that means many things ("french": rooster, frog, cheese…) counts less.
    const meaningEntries = new Set(perWord.filter((l) => l.kind === 'meaning' && l.score >= 9).map((l) => l.entry.id));
    if (meaningEntries.size >= 2) {
      const cut = 0.35 * Math.log2(meaningEntries.size);
      for (const l of perWord) if (l.kind === 'meaning') l.score -= cut;
    }
    out.push(...perWord);
  }
  // Multi-word tags: "de gaulle" → radio, "world cup" → trophy.
  for (const inf of all) {
    for (const t of inf.multi) {
      if (!phrase.includes(` ${t} `) && !glossPhrase.includes(` ${t} `)) continue;
      const firstWord = t.split(' ')[0];
      const w = ws.find((x) => x.norm === firstWord || x.means.includes(firstWord)) ?? ws.find((x) => isContent(x));
      if (w) out.push({ entry: inf.e, score: 10, kind: 'meaning', word: w, start: 0, end: w.norm.length, source });
    }
  }
  return out;
}

interface Candidate {
  entry: CatalogEntry;
  link: Link;
  score: number;
}

/** Best link per entry, with the tie-breakers (double links, Q+A links, avoid list, seeded jitter). */
function rank(links: Link[], rand: RandomSource, avoid: Set<string>, last: string | undefined, other: Link[] = [], filter: (e: CatalogEntry) => boolean = () => true): Candidate[] {
  const byEntry = new Map<string, Link[]>();
  for (const l of links) {
    if (!filter(l.entry)) continue;
    const arr = byEntry.get(l.entry.id);
    if (arr) arr.push(l);
    else byEntry.set(l.entry.id, [l]);
  }
  const otherBest = new Map<string, number>();
  for (const l of other) otherBest.set(l.entry.id, Math.max(otherBest.get(l.entry.id) ?? 0, l.score));
  const out: Candidate[] = [];
  // Seeded jitter drawn in catalog order so results do not depend on the link order.
  const jitter = new Map(info().map((i) => [i.e.id, rand()]));
  for (const [id, ls] of byEntry) {
    ls.sort((a, b) => b.score - a.score || a.word.index - b.word.index);
    const best = ls[0];
    let score = best.score;
    const kinds = new Set(ls.filter((l) => l.score >= 6).map((l) => (l.kind === 'meaning' ? 'm' : 's')));
    if (kinds.size === 2) score += 0.8; // linked by sound AND meaning
    if ((otherBest.get(id) ?? 0) >= STRONG_LINK) score += 0.6; // linked to the other side too
    score += 0.4 * (1 - best.word.pos); // earlier words of the answer are usually the key ones
    if (avoid.has(id)) score -= 3;
    if (id === last) score -= 6;
    score += (jitter.get(id) ?? 0) * 0.05;
    out.push({ entry: best.entry, link: best, score });
  }
  return out.sort((a, b) => b.score - a.score);
}

// ─────────────────────────────────────────────────────────────────────────────
// Numbers, dates, formulas
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
  return wordsToDigits(baseTokens(String(answer ?? '').replace(ELISION, ' '))).filter((t) => /^\d+(\.\d+)?$/.test(t));
}

interface NumberInfo {
  nums: string[];
  date?: { day: number; month: number; year?: string; monthRaw: string };
  year?: string;
  formula: boolean;
  /** The answer is only a number (with a unit), a date or a formula. */
  pure: boolean;
}

function numberInfo(answer: string, question: string, aWords: Word[]): NumberInfo {
  const raw = String(answer ?? '').trim();
  const nums = numbersIn(raw);
  const formula =
    /^[\p{L}\d₀-₉²³⁰-⁹+=×·()\s^-]+$/u.test(raw) &&
    raw.length <= 16 &&
    (/[A-Za-z][\d₀-₉²³]|[\d₀-₉²³][A-Z]/.test(raw) || /^([A-Z][a-z]?\d*){1,4}$/.test(raw) || /=/.test(raw));
  const toks = baseTokens(raw.replace(ELISION, ' '));
  let date: NumberInfo['date'];
  for (let i = 0; i < toks.length; i++) {
    const m = MONTHS[toks[i]];
    if (!m) continue;
    const day = [toks[i - 1], toks[i + 1]].find((t) => t !== undefined && /^\d{1,2}$/.test(t) && +t >= 1 && +t <= 31);
    const year = toks.slice(i + 1, i + 3).find((t) => /^\d{3,4}$/.test(t));
    if (day || year) {
      const w = aWords.find((x) => x.norm === toks[i]);
      date = { day: day ? +day : 0, month: m[0], year, monthRaw: w?.raw ?? toks[i] };
      break;
    }
  }
  const yearish = /\b(year|when|date|annee|quand|debut|signature|chute|prise|couronnement|begin|began|start|end|ended|fell|founded)\b/.test(baseTokens(question).join(' '));
  const year = date?.year ?? nums.find((n) => /^\d{3,4}$/.test(n) && (yearish || nums.length === 1) && +n >= 100 && +n <= 2100 && !/[a-z]\s*\/|km|°/.test(raw.toLowerCase()));
  const leftover = aWords.filter((w) => isContent(w) && !MONTHS[w.norm] && !UNIT_WORDS.has(w.norm));
  const pure = formula || ((nums.length > 0 || !!date) && leftover.length === 0);
  return { nums, date, year, formula, pure };
}

// ─────────────────────────────────────────────────────────────────────────────
// Composition helpers
// ─────────────────────────────────────────────────────────────────────────────

const upper = (s: string) => s.toLocaleUpperCase('en');
const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

/** Caption name of a model, and the CAPS hook inside it. */
function nameOf(e: CatalogEntry): { text: string; hook: string } {
  const text = SHORT_NAME[e.id] ?? upper(e.name);
  return { text, hook: text.split(/ (?:of|in)\b/)[0].replace(/ [a-z].*$/, '') };
}
function pluralOf(e: CatalogEntry, n: number): { text: string; hook: string } {
  if (n === 1) return nameOf(e);
  const base = nameOf(e).text;
  let text = PLURAL_NAME[e.id];
  if (!text) {
    const [head, ...tail] = base.split(/(?= of )/);
    const p = /(S|X|CH|SH)$/.test(head) ? head + 'ES' : /[^AEIOU]Y$/.test(head) ? head.slice(0, -1) + 'IES' : head + 'S';
    text = [p, ...tail].join('');
  }
  return { text, hook: text.split(/ (?:of|in)\b/)[0].replace(/ [a-z].*$/, '') };
}

function naturalAnim(e: CatalogEntry, rand: RandomSource): AnimId {
  const lively = e.anims.filter((a) => a !== 'idle');
  return lively.length ? pick(rand, lively.slice(0, 3)) : 'bounce';
}

/** "riding a KANGAROO", "under a blazing SUN", "hugging a GOLD COIN". */
function joinPhrase(e: CatalogEntry, rand: RandomSource): string {
  if (PROP_PHRASE[e.id]) return PROP_PHRASE[e.id];
  const { text } = nameOf(e);
  const a = article(text);
  switch (e.category) {
    case 'vehicle':
      return `riding ${a} ${text}`;
    case 'structure':
      return pick(rand, [`on top of ${a} ${text}`, `bursting out of ${a} ${text}`]);
    case 'animal':
      return pick(rand, [`riding ${a} ${text}`, `chased by ${a} ${text}`]);
    case 'person':
      return pick(rand, [`carried by ${a} ${text}`, `with a tiny ${text}`]);
    default:
      return pick(rand, [`hugging ${a} ${text}`, `juggling ${a} ${text}`, `waving ${a} ${text}`]);
  }
}

function chooseTextModel(q: string[], info: NumberInfo, rand: RandomSource): string {
  const has = (...ws: string[]) => ws.some((w) => q.includes(w));
  if (info.year || info.date) return 'plaque';
  if (has('treaty', 'law', 'act', 'declaration', 'charter', 'constitution', 'traite', 'loi', 'decree', 'decret')) return 'scroll';
  if (has('country', 'nation', 'nations', 'flag', 'independence', 'pays', 'drapeau')) return 'flag';
  if (has('book', 'author', 'wrote', 'novel', 'poem', 'livre', 'auteur', 'ecrit', 'roman', 'poeme')) return 'book';
  if (has('who', 'person', 'memorial', 'died', 'born', 'qui')) return 'plaque';
  if (has('capital', 'capitale', 'city', 'ville', 'river', 'fleuve', 'formula', 'formule', 'symbol', 'symbole')) return 'sign';
  return pick(rand, ['sign', 'plaque', 'sign', 'scroll']);
}

const LEADING_ARTICLE = /^(?:(?:the|a|an|le|la|les|un|une|du|des|de la|de l['’]|de|l['’])\s*)+/i;
const clean = (s: string) => String(s ?? '').replace(/\s+/g, ' ').trim();
const fits = (s: string) => s.length > 0 && s.length <= LABEL_CHARS;

/** The short text written on the label: the whole answer if short, else the date/number, else the key word. */
function labelFor(answer: string, ni: NumberInfo, key: Word | undefined): string {
  const a = clean(answer).replace(LEADING_ARTICLE, '');
  if (ni.date) {
    const { day, month, year, monthRaw } = ni.date;
    const fr = /[éû]|^(?:janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)$/i.test(fold(monthRaw)) || /[éû]/.test(monthRaw);
    const tries = [
      [day || '', monthRaw, year ?? ''].join(' ').trim(),
      [day || '', fr ? FR_MONTH_ABBR[month - 1] : Object.values(MONTHS).find((m) => m[0] === month)![1], year ?? ''].join(' ').trim(),
      year ?? '',
    ];
    for (const t of tries) if (fits(t)) return t;
  }
  if (ni.pure && fits(a)) return a;
  if (ni.year) return ni.year;
  if (ni.nums.length && !key) {
    const m = /\d[\d  .,]*(?:\s?[×x]\s?10[⁰-⁹²³]+)?(?:\s?(?:°C|°F|%|km\/s|m\/s|km\/h|km|kg|mol|cm|mm|m|s|g|K|J|W|V|N|Pa|Hz)\b)?/.exec(clean(answer));
    const t = m ? m[0].trim() : ni.nums[0];
    return fits(t) ? t : ni.nums[0].slice(0, LABEL_CHARS);
  }
  if (fits(a)) return a;
  if (key && fits(key.raw)) return key.raw;
  return '';
}

/** "POWER-HOUSE", "AVO-gadro", "dar-WIN", "SHAKE-SPEARe". */
function punDisplay(l: Link, second?: { start: number; end: number }): string {
  const w = l.word;
  const src = fold(w.raw) === w.norm ? w.raw : w.norm;
  let start = l.start;
  let end = l.end;
  if (l.kind === 'sound' && start === 0 && end >= src.length) {
    // Whole-word pun (avocado ↔ "avogadro"): emphasise the syllables both words share.
    const name = l.entry.id;
    let k = 0;
    while (k < Math.min(name.length, w.norm.length) && name[k] === w.norm[k]) k++;
    if (k >= 2 && k < w.norm.length) end = k;
    else return upper(src);
  }
  if (l.kind === 'meaning' || l.kind === 'exact') return upper(src);
  const cuts = new Set([0, src.length, start, end, l.anim ? 0 : start]);
  if (l.anim) cuts.add(start);
  if (second) {
    cuts.add(second.start);
    cuts.add(second.end);
  }
  const pts = [...cuts].filter((c) => c >= 0 && c <= src.length).sort((a, b) => a - b);
  const pieces: string[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    if (a === b) continue;
    const hit = (a >= start && b <= end) || (l.anim && b <= start) || (second && a >= second.start && b <= second.end);
    pieces.push(hit ? upper(src.slice(a, b)) : src.slice(a, b).toLowerCase());
  }
  return pieces.join('-');
}

/** The answer, short, with its key word replaced by `display` ("the POWER-HOUSE of the cell"). */
function answerDisplay(answer: string, w: Word | undefined, display: string): string {
  const a = clean(answer);
  if (!w || a.length > 34) return display;
  const i = a.indexOf(w.raw);
  if (i < 0) return display;
  return a.slice(0, i) + display + a.slice(i + w.raw.length);
}

/** The question's proper-noun run containing `w` ("Mona Lisa", "World War I"), or `w` alone. */
function questionPhrase(qWords: Word[], w: Word, display: string): string {
  if (!w.proper) return display;
  let a = w.index;
  let b = w.index;
  while (a > 0 && qWords[a - 1].proper && qWords[a - 1].index === a - 1) a--;
  while (b + 1 < qWords.length && qWords[b + 1].proper) b++;
  if (b - a > 3) return display;
  const run = qWords.slice(a, b + 1).map((x) => (x === w ? display : upper(x.raw)));
  return run.join(' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Composition
// ─────────────────────────────────────────────────────────────────────────────

/** How the hero was found (for tools, tests and the benchmark). */
export type HeroSource = 'answer' | 'question' | 'weak' | 'fallback';

export interface Composition {
  recipe: SceneRecipe;
  heroSource: HeroSource;
  heroKind?: LinkKind;
  /** The answer word or number the scene encodes. */
  keyword: string;
}

/**
 * Composes a vivid mnemonic scene for a notion (1–3 actors, only catalog models, labels only on
 * text-capable props, counts 1–12). The caption puts the hook words in CAPS and lists them in
 * `hooks`.
 */
export function composeScene(question: string, answer: string, opts: ComposeOpts = {}): SceneRecipe {
  return composeSceneDetailed(question, answer, opts).recipe;
}

/** {@link composeScene} plus how the scene was found. */
export function composeSceneDetailed(question: string, answer: string, opts: ComposeOpts = {}): Composition {
  question = String(question ?? '');
  answer = String(answer ?? '');
  const seedText = `${question}\u0000${answer}\u0000${opts.seed ?? ''}`;
  const rand = mulberry32(hashString(seedText));
  const avoid = new Set(opts.avoid ?? []);
  const last = opts.avoid?.length ? opts.avoid[opts.avoid.length - 1] : undefined;

  const aAll = tokenize(answer);
  const qAll = tokenize(question);
  const ni = numberInfo(answer, question, aAll);
  const qNorms = new Set(qAll.map((w) => w.norm));
  const aNorms = new Set(aAll.map((w) => w.norm));
  // Answer words: dates/quantities keep no month or unit words.
  const aWords = aAll.filter((w) => isContent(w) && !(ni.nums.length && (MONTHS[w.norm] || UNIT_WORDS.has(w.norm))) && !ni.formula);
  const qWords = qAll.filter((w) => isContent(w) && !aNorms.has(w.norm));

  const nonText = (e: CatalogEntry) => !e.text;
  const aLinks = linksFor(aWords, 'answer');
  for (const l of aLinks) if (qNorms.has(l.word.norm)) l.score -= 4; // the question already says it
  const qLinks = linksFor(qWords, 'question');
  for (const l of qLinks) if (WEAK_Q.has(l.word.norm)) l.score -= 2.5;

  const aRank = rank(aLinks, rand, avoid, last, qLinks, nonText);
  const qRank = rank(qLinks, rand, avoid, last, aLinks, nonText);

  // ── Hero ──
  let heroC: Candidate | undefined;
  let heroSource: HeroSource;
  const strongA = aRank.find((c) => c.link.score >= STRONG_LINK);
  const strongQ = qRank.find((c) => c.link.score >= STRONG_LINK);
  if (strongA && !ni.pure) [heroC, heroSource] = [strongA, 'answer'];
  else if (strongQ) [heroC, heroSource] = [strongQ, 'question'];
  else if (strongA) [heroC, heroSource] = [strongA, 'answer'];
  else {
    const weak = [...aRank, ...qRank].filter((c) => c.link.score >= 4.5).sort((a, b) => b.score - a.score)[0];
    if (weak) [heroC, heroSource] = [weak, 'weak'];
    else heroSource = 'fallback';
  }
  const heroLink = heroC?.link;
  const hero = heroC?.entry ?? entryOf(pickAvoiding(rand, FALLBACK_HEROES, avoid, last));
  const used = new Set([hero.id]);

  // Hero anim: the pun's anim (SHAKE-speare), else a movement the notion names, else a natural one.
  const wanted = [...aWords, ...qWords].map((w) => ANIM_WORDS[w.norm]).find((a) => a && hero.anims.includes(a));
  const hAnim: AnimId = heroLink?.anim ?? wanted ?? naturalAnim(hero, rand);
  const heroActor: SceneActor = { model: hero.id, role: 'hero', anim: hAnim, scale: 1.2 };

  // ── Second half of the pun: CAN-BERRA, OTTA-WA, POWER-HOUSE ──
  let part: { entry: CatalogEntry; start: number; end: number } | undefined;
  if (heroLink && (heroLink.kind === 'sound' || heroLink.kind === 'part') && heroSource !== 'weak') {
    const n = heroLink.word.norm;
    const whole = heroLink.start === 0 && heroLink.end >= n.length;
    const [rs, re] = whole ? [0, 0] : heroLink.start === 0 ? [heroLink.end, n.length] : [0, heroLink.start];
    const rest = n.slice(rs, re);
    if (rest.length >= 2) {
      const pseudo: Word = { ...heroLink.word, norm: rest, stem: stem(rest), means: [rest, stem(rest), ...(GLOSS[rest] ?? [])], index: heroLink.word.index };
      const restLinks: Link[] = [];
      for (const inf of info()) {
        if (inf.e.text || used.has(inf.e.id)) continue;
        const s = soundLink(rest, inf);
        const exactSound = inf.sounds.some((x) => x.s === rest);
        if (exactSound) restLinks.push({ entry: inf.e, score: 11, kind: 'sound', word: pseudo, start: 0, end: rest.length, source: 'answer' });
        else if (s.score >= 7 && s.start === 0 && rest.length >= 3) restLinks.push({ entry: inf.e, score: s.score, kind: 'sound', word: pseudo, start: s.start, end: s.end, source: 'answer' });
        if (heroLink.kind === 'part' && rest.length >= 3) {
          const m = meaningLink(pseudo, inf);
          if (m > 0) restLinks.push({ entry: inf.e, score: m, kind: 'meaning', word: pseudo, start: 0, end: rest.length, source: 'answer' });
          if (inf.names.includes(rest)) restLinks.push({ entry: inf.e, score: 12, kind: 'exact', word: pseudo, start: 0, end: rest.length, source: 'answer' });
        }
      }
      const best = rank(restLinks, rand, avoid, undefined)[0];
      if (best && best.link.score >= STRONG_LINK) {
        const len = best.link.kind === 'sound' ? best.link.end - best.link.start : rest.length;
        part = { entry: best.entry, start: rs + best.link.start, end: rs + best.link.start + len };
        used.add(best.entry.id);
      }
    }
  }

  // ── Question prop: binds the question to the answer (Kenya → KEY, Mona Lisa → MOON) ──
  let qProp: Candidate | undefined;
  if (heroSource === 'answer' || heroSource === 'weak') {
    qProp = qRank.find((c) => !used.has(c.entry.id) && c.link.score >= STRONG_LINK && c.link.source === 'question');
    if (qProp) used.add(qProp.entry.id);
  }

  // ── Count actor ──
  let count = 0;
  if (!ni.formula && (ni.nums.length || ni.date)) {
    if (ni.date) count = ni.date.day >= 1 && ni.date.day <= 12 ? ni.date.day : 0;
    else count = salientCount(ni.year ?? ni.nums[0]);
    if (count < 2) count = 0;
  }
  let countActor: SceneActor | undefined;
  let countEntry: CatalogEntry | undefined;
  if (count) {
    // Prefer copies of something the notion is about (1914 → helmets, 1919 → doves), else a toy.
    const countable = (e: CatalogEntry) => !e.text && e.category !== 'structure' && !used.has(e.id);
    const linked = rank([...qLinks, ...aLinks], rand, avoid, last, [], countable).find((c) => c.link.score >= STRONG_LINK);
    countEntry = linked?.entry ?? entryOf(pickAvoiding(rand, COUNT_MODELS.filter((m) => !used.has(m)), avoid, last));
    used.add(countEntry.id);
    const fall = [...aWords, ...qWords].some((w) => ANIM_WORDS[w.norm] === 'shake' && /fall|chute|collapse/.test(w.norm));
    const natural = COUNT_ANIMS.filter((a) => countEntry!.anims.includes(a));
    const anim: AnimId =
      fall && countEntry.anims.includes('rain')
        ? 'rain'
        : hAnim === 'juggle' && countEntry.anims.includes('juggle')
          ? 'juggle'
          : natural.length
            ? pick(rand, natural)
            : countEntry.anims.includes('orbit') ? 'orbit' : 'bounce';
    countActor = { model: countEntry.id, role: 'count', anim, count };
  }

  // ── Key word ──
  const keyWord: Word | undefined =
    heroSource === 'answer' && heroLink
      ? heroLink.word
      : aWords.slice().sort((a, b) => Number(b.proper) - Number(a.proper) || b.norm.length - a.norm.length || a.index - b.index)[0];

  // ── Label ──
  const strongPun = heroSource === 'answer' && heroLink && heroLink.kind !== 'meaning';
  const needLabel = ni.nums.length > 0 || ni.formula || !!ni.date || !strongPun;
  let labelText = needLabel ? labelFor(answer, ni, heroSource === 'answer' ? keyWord : (keyWord ?? undefined)) : '';
  let labelEntry: CatalogEntry | undefined;
  let labelActor: SceneActor | undefined;
  if (labelText) {
    labelEntry = entryOf(chooseTextModel(baseTokens(question), ni, rand));
    labelActor = { model: labelEntry.id, role: 'prop', anim: labelEntry.anims.includes('float') ? 'float' : labelEntry.anims[0], label: labelText };
  }

  // ── Explanation (how the image gives the answer) ──
  let aDisp: string;
  let keyword: string;
  const punHooks: string[] = [];
  if (heroSource === 'answer' && heroLink && heroLink.kind !== 'meaning') {
    const d = punDisplay(heroLink, part && part.start >= 0 ? { start: part.start, end: part.end } : undefined);
    punHooks.push(...d.split('-').filter((p) => p && p === upper(p) && /\p{L}/u.test(p)));
    aDisp = answerDisplay(answer, heroLink.word, d);
    keyword = heroLink.word.raw;
  } else if (ni.pure && labelText) {
    aDisp = upper(labelText);
    keyword = labelText;
  } else if (keyWord) {
    const K = upper(keyWord.raw);
    aDisp = answerDisplay(answer, keyWord, K);
    keyword = keyWord.raw;
    punHooks.push(K);
  } else {
    aDisp = upper(clean(answer).slice(0, 30)) || '?';
    keyword = clean(answer);
  }
  // Question side: the linked question word, else its most salient word (proper noun or long word).
  let qDisp = '';
  const qLink = heroSource === 'question' ? heroLink : qProp?.link;
  if (qLink) {
    const d = qLink.kind === 'meaning' || qLink.kind === 'exact' ? upper(qLink.word.raw) : punDisplay(qLink);
    qDisp = questionPhrase(qAll, qLink.word, d);
  } else {
    const salient = qWords.filter((w) => !WEAK_Q.has(w.norm) && (w.proper || w.norm.length >= 7)).sort((a, b) => Number(b.proper) - Number(a.proper) || b.norm.length - a.norm.length)[0];
    if (salient) qDisp = questionPhrase(qAll, salient, upper(salient.raw));
  }
  if (qDisp && fold(aDisp).includes(fold(qDisp))) qDisp = '';

  // ── Caption (drop optional pieces until it fits) ──
  const HERO = nameOf(hero);
  const verb = heroLink?.anim ? upper(ANIM_VERB[hAnim]) : ANIM_VERB[hAnim];
  const countPhrase = (): string => {
    if (!countActor || !countEntry) return '';
    const things = pluralOf(countEntry, count).text;
    if (countActor.anim === 'juggle') return hAnim === 'juggle' ? `${count} ${things}` : `juggling ${count} ${things}`;
    if (countActor.anim === 'rain') return `under ${count} falling ${things}`;
    if (countActor.anim === 'stack') return `beside a stack of ${count} ${things}`;
    return `with ${count} ${things}`;
  };
  const labelPhrase = (): string => {
    if (!labelActor || !labelEntry) return '';
    const L = `"${upper(labelText)}"`;
    switch (labelEntry.id) {
      case 'plaque':
        return `beside a brass PLAQUE reading ${L}`;
      case 'scroll':
        return `unrolling a SCROLL that says ${L}`;
      case 'flag':
        return `planting a FLAG that says ${L}`;
      case 'book':
        return `reading a BOOK titled ${L}`;
      default:
        return `beside a SIGN reading ${L}`;
    }
  };
  const partPhrase = part ? joinPhrase(part.entry, rand) : '';
  const qPhrase = qProp ? joinPhrase(qProp.entry, rand) : '';

  const actorsFor = (withQ: boolean, withPart: boolean, withCount: boolean): SceneActor[] => {
    const list: SceneActor[] = [heroActor];
    const extras: Array<SceneActor | undefined> = ni.nums.length || ni.formula || ni.date
      ? [labelActor, withCount ? countActor : undefined, withPart && part ? { model: part.entry.id, role: 'prop', anim: naturalAnim(part.entry, rand) } : undefined, withQ && qProp ? { model: qProp.entry.id, role: 'prop', anim: naturalAnim(qProp.entry, rand) } : undefined]
      : [withPart && part ? { model: part.entry.id, role: 'prop', anim: naturalAnim(part.entry, rand) } : undefined, labelActor, withQ && qProp ? { model: qProp.entry.id, role: 'prop', anim: naturalAnim(qProp.entry, rand) } : undefined];
    for (const x of extras) if (x && list.length < 3) list.push(x);
    return list;
  };

  let actors: SceneActor[] = [];
  let caption = '';
  // Variants from richest to leanest; the first that fits wins.
  const variants: Array<{ q: boolean; p: boolean; c: boolean; qd: boolean; l: boolean }> = [
    { q: true, p: true, c: true, qd: true, l: true },
    { q: true, p: true, c: true, qd: false, l: true },
    { q: false, p: true, c: true, qd: true, l: true },
    { q: false, p: true, c: true, qd: false, l: true },
    { q: false, p: false, c: true, qd: false, l: true },
    { q: false, p: false, c: false, qd: false, l: true },
    { q: false, p: false, c: false, qd: false, l: false },
  ];
  for (const v of variants) {
    actors = actorsFor(v.q, v.p, v.c);
    const has = (m: string | undefined) => !!m && actors.some((a) => a.model === m);
    const segs: string[] = [];
    if (has(part?.entry.id) && partPhrase) segs.push(partPhrase);
    if (has(qProp?.entry.id) && qPhrase) segs.push(qPhrase);
    if (has(countEntry?.id)) segs.push(countPhrase());
    if (v.l && labelActor && has(labelEntry?.id)) segs.push(labelPhrase());
    let c = `A giant ${HERO.text} ${verb}`;
    if (segs.length) c += (hAnim === 'juggle' && countActor?.anim === 'juggle' && segs[0] === countPhrase() ? ' ' : ', ') + segs.join(', ');
    const explain = v.qd && qDisp ? `${qDisp}: ${aDisp}` : aDisp;
    c += ` — ${explain}`;
    c = c.replace(/\s+/g, ' ').trim();
    if (!/[!?.]$/.test(c)) c += '!';
    caption = c;
    if (caption.length <= MAX_CAPTION) break;
  }
  if (caption.length > MAX_CAPTION) caption = caption.slice(0, MAX_CAPTION - 1).replace(/\s+\S*$/, '') + '!';

  // ── Hooks ──
  const hooks: string[] = [HERO.hook];
  if (part) hooks.push(nameOf(part.entry).hook);
  if (qProp && actors.some((a) => a.model === qProp!.entry.id)) hooks.push(nameOf(qProp.entry).hook);
  if (countEntry && actors.some((a) => a.model === countEntry!.id)) hooks.push(pluralOf(countEntry, count).hook);
  if (labelText) hooks.push(upper(labelText));
  hooks.push(...punHooks);
  if (qDisp) hooks.push(...qDisp.split(/[-\s]/).filter((p) => p.length >= 2 && p === upper(p) && /\p{L}/u.test(p)));
  if (heroLink?.anim) hooks.push(verb);
  const finalHooks = [...new Set(hooks.map((h) => h.trim()).filter((h) => h && h === upper(h) && caption.includes(h)))];

  return {
    recipe: {
      actors,
      caption,
      hooks: finalHooks.length ? finalHooks : [HERO.hook].filter((h) => caption.includes(h)),
      accent: ACCENTS[hashString(seedText) % ACCENTS.length],
    },
    heroSource,
    heroKind: heroLink?.kind,
    keyword,
  };
}

function entryOf(id: string): CatalogEntry {
  const e = catalogEntry(id);
  if (!e) throw new Error(`mnemonic: unknown model ${id}`);
  return e;
}

function pickAvoiding(rand: RandomSource, ids: string[], avoid: Set<string>, last?: string): string {
  const pool = ids.filter((id) => id !== last);
  const fresh = pool.filter((id) => !avoid.has(id));
  return pick(rand, fresh.length ? fresh : pool.length ? pool : ids);
}

/** Models that pun on a word, best first (for tools and the AI prompt). */
export function soundAlikes(word: string, limit = 5): Array<{ id: string; score: number }> {
  const w = lettersOnly(baseTokens(word).join(''));
  if (w.length < 3) return [];
  return info()
    .map((i) => ({ id: i.e.id, score: Math.max(soundLink(w, i).score, i.names.includes(w) ? 12 : 0) }))
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

// Keep the lookup table warm for the first call.
void INFO_BY_ID;
