/**
 * Offline mnemonic composer: turns a question/answer pair into a SceneRecipe built from the model
 * library, following the rules memory athletes use — the image must be **exaggerated** (a giant
 * hero), **moving** (a lively anim), **absurd** (unexpected pairings), **linked to the answer by
 * sound or meaning**, and it must **bind the question to the answer**.
 *
 * Used when the AI is unavailable (and as a safety net for bad AI output). Deterministic: the
 * same text always gives the same scene (seeded by the text). Pure and fast (well under 1 ms).
 *
 * Strategy — answer first, then question:
 * 1. **Salient words** (English + French, accent-insensitive): French elisions (l', d', qu') are
 *    removed, stop words dropped, words the question already says are demoted, month names and
 *    units are ignored in dates/quantities, the surname wins in a person's name, fixed pairs are
 *    merged ("World War", "D-Day", "guerre mondiale"). French school words carry an English gloss
 *    (cœur → heart, centrale → power) so they reach the same meanings.
 * 2. **Links** from each salient word to each model:
 *    - the model itself (house, apple…);
 *    - **sound-alikes** on the model's `soundsLike` syllables — prefix (AVO-gadro → avocado),
 *      suffix (dar-WIN → trophy), whole word, consonant-skeleton phonetics;
 *    - **compound parts** (POWER-HOUSE → house) and **anim puns** (SHAKE-SPEARe → a sword that
 *      shakes);
 *    - **meaning**: model tags, a curated concept table for school notions (oxygen → tree,
 *      power → lightning, heart → lion "Cœur de Lion"), multi-word tags ("de gaulle" → radio).
 *    A word that fits many models counts less than a specific one; a model linked by sound AND
 *    meaning, or to the answer AND the question, wins ties; proper nouns weigh more.
 * 3. **Hero** = the best answer link, animated with the anim its pun asks for (SHAKE-speare), or a
 *    movement the notion names (fall → shake), or its natural anim. For a number/date/formula
 *    answer the hero comes from the question and the number is carried by a count + a label. The
 *    last model of `avoid` (the previous notion's hero) is not reused when anything else fits.
 * 4. **Second actor**: the other half of the pun (CAN-BERRA → can + kangaroo's berries, OTTA-WA →
 *    otter + wave, POWER-HOUSE → house + lightning), else a **question prop** linked to the
 *    question (Kenya → key, Mona Lisa → moon), so the scene binds Q → A.
 * 5. **Numbers**: years/dates → a brass plaque with the year or date; a salient digit 1–12 → that
 *    many copies of a model tied to the question (1914 → 4 helmets) or of a toy.
 * 6. **Label** only when needed (numbers, formulas, weak or meaning-only links): the whole answer
 *    if short, else the date/number, else the key word — at most {@link LABEL_CHARS} characters,
 *    never a truncated sentence.
 * 7. **Caption**: one vivid English line (quoting French words when the course is French), hook
 *    words in CAPS (listed in `hooks`), ending with the link to the answer:
 *    "— KENYA: NAI-robi!", "— MITOCHONDRIA: the POWER-HOUSE of the cell!".
 */
import type { AnimId, SceneActor, SceneRecipe } from './types';
import { CATALOG_INDEX, type CatalogEntry, catalogEntry, isTextModel } from './catalog-index';
import { baseTokens } from './matching';
import { wordsToDigits } from './numbers';
import { hashString, mulberry32, pick, type RandomSource } from './ids';

export interface ComposeOpts {
  /**
   * Models already used elsewhere in the palace (in placement order): avoided when an equally
   * good option exists. The last one is the previous notion's hero and is not reused as hero when
   * any other model fits.
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
/** Longest caption (the server limit). */
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
      'mean means meaning stand stands define definition used use uses make makes made get gets ' +
      'le la les l de du des un une quel quelle quels quelles est sont en dans au aux et ou qui que quoi par pour sur avec ' +
      'annee annees nom pays ville capitale ce cette ces se sa ses leur leurs il elle ils elles on ne pas plus moins tres ' +
      'quest qu c d s n j m t y ete etait fut etre avoir fait faire'
  ),
);

/** Question words that say what kind of fact is asked, not what it is about (weak links). */
const WEAK_Q = new Set(
  words(
    'formula formule formulated chemical chimique symbol symbole number nombre theory theorie law loi unit unite value valeur ' +
      'largest biggest smallest longest highest greatest grand premier premiere first president organ organe atomic atomique ' +
      'produce produces produced produit release releases gas gaz author auteur wrote ecrit painted peint discovered decouvert ' +
      'developed invented inventor begin began start debut end fin signature signed happen happened abondant abundant ' +
      'walk walked marcher level niveau point'
  ),
);

/** Particles inside people's names ("Leonardo da Vinci", "Charles de Gaulle"). */
const NAME_PARTICLES = new Set(words('da de di del della van von der le la du des'));

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
    'planete:planet electricite:electricity lumineuse:light sonore:sound gravite:gravity vie:life mort:death ' +
    'miserables:novel roman:novel',
);

/**
 * Curated school concepts → models, best first (meaning links the tags cannot express or order).
 * Keys are English words (French words reach them through GLOSS) or merged pairs (worldwar, dday).
 */
const CONCEPTS: Record<string, string[]> = parseTable(
  'power:lightning,eagle energy:lightning,sun,atom electricity:lightning,lightbulb oxygen:tree,cloud nitrogen:balloon,cloud ' +
    'hydrogen:balloon,zeppelin carbon:fire,atom dioxide:cloud,fire air:balloon,cloud salt:sailor,wave ' +
    'water:wave,fish heart:lion,dove blood:poppy sound:bell,radio speed:lightning,rocket,car,horse speeds:rocket,lightning ' +
    'fast:rocket,lightning light:lightbulb,sun gold:coin,crown,trophy silver:coin iron:magnet,hammer planet:globe ' +
    'jupiter:lightning,globe mars:soldier,rocket venus:dove saturn:globe gravity:apple gravitation:apple relativity:clock,scientist ' +
    'newton:apple time:clock reaction:flask acid:flask force:magnet,hammer theorem:pyramid triangle:pyramid pythagorean:pyramid ' +
    'ocean:wave,ship pacific:wave,fish atlantic:ship,wave river:bridge,ship nile:pyramid rome:eagle,pizza japan:sun italy:pizza ' +
    'brazil:ball portugal:ship,sailor germany:eagle,zeppelin emperor:crown,king coronation:crown,king queen:crown ' +
    'war:soldier,tank,helmet worldwar:soldier,helmet,tank,biplane dday:ship,soldier,wave ' +
    'revolution:fire,rooster bastille:castle landing:ship,wave peace:dove treaty:dove dna:flask,scientist gene:flask ' +
    'boiling:teacup,fire heat:fire,sun cold:snowflake,penguin ice:snowflake,penguin evolution:fish,frog species:fish,frog ' +
    'discovery:ship,telescope america:eagle,ship columbus:ship,globe liberty:bell,eagle freedom:dove,eagle wall:brickwall ' +
    'photosynthesis:tree,sun plant:tree cell:tower love:dove music:radio,bell novel:book writer:book',
);

function parseTable(src: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const item of words(src)) {
    const [k, v] = item.split(':');
    out[k] = v.split(',');
  }
  return out;
}

/** Fixed word pairs read as one notion ("World War" is not "world" + "war"). */
const PAIRS: Record<string, string> = {
  'world war': 'worldwar', 'great war': 'worldwar', 'guerre mondiale': 'worldwar', 'grande guerre': 'worldwar', 'd day': 'dday',
};

/** Words (answer or question) that ask for a particular movement of the hero. */
const ANIM_WORDS: Record<string, AnimId> = {
  fall: 'shake', fell: 'shake', chute: 'shake', collapse: 'shake', crash: 'shake', explosion: 'shake', boiling: 'shake', ebullition: 'shake',
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
  mountain: 'on top of a MOUNTAIN', tophat: 'wearing a TOP HAT', crown: 'wearing a CROWN', helmet: 'wearing a HELMET',
  umbrella: 'under an UMBRELLA', key: 'waving a KEY', sword: 'waving a SWORD', zeppelin: 'under a ZEPPELIN', globe: 'spinning a GLOBE',
  bridge: 'on a BRIDGE', brickwall: 'on a BRICK WALL', tower: 'on top of a TOWER', tent: 'in a TENT', clock: 'waving an alarm CLOCK',
};

const MONTHS: Record<string, [number, string]> = {};
(
  [
    ['january janvier jan janv', 'Jan'], ['february fevrier feb fevr', 'Feb'], ['march mars mar', 'Mar'], ['april avril apr avr', 'Apr'],
    ['may mai', 'May'], ['june juin jun', 'June'], ['july juillet jul juil', 'July'], ['august aout aug', 'Aug'],
    ['september septembre sep sept', 'Sept'], ['october octobre oct', 'Oct'], ['november novembre nov', 'Nov'], ['december decembre dec', 'Dec'],
  ] as const
).forEach(([names, abbr], i) => words(names).forEach((n) => (MONTHS[n] = [i + 1, abbr])));
const EN_MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
const FR_MONTH_ABBR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const FR_MONTHS = new Set(words('janvier fevrier mars avril mai juin juillet aout septembre octobre novembre decembre'));
const UNIT_WORDS = new Set(words('km s m h kg g mol cm mm c f k j w v n pa hz percent degres degrees degre degree celsius kelvin an ans ad bc jc'));

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
  s = s.replace(/(?<=..)(?:ies|ie|ia)$/, 'y').replace(/ite$/, 'ity').replace(/ique$/, 'ic').replace(/isme$/, 'ism');
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
// Catalog, precomputed once
// ─────────────────────────────────────────────────────────────────────────────

interface EntryInfo {
  e: CatalogEntry;
  /** id and head noun of the name ("Tin can of berries" → can). */
  names: string[];
  /** Phonetic key of the id. */
  idKey: string;
  /** stem → rank (0..1, 0 = first tag = most central meaning); other name words count as tags. */
  tagStems: Map<string, number>;
  /** single-word tags ≥ 4 letters (compound parts). */
  tagWords: string[];
  /** multi-word tags. */
  multi: string[];
  sounds: Array<{ s: string; k: string }>;
}

let INFO: EntryInfo[] | null = null;
function info(): EntryInfo[] {
  if (INFO) return INFO;
  INFO = CATALOG_INDEX.map((e) => {
    const nameWords = words(fold(e.name).replace(/[^a-z ]/g, ' ')).filter((w) => w.length >= 3 && !STOPWORDS.has(w));
    const headPhrase = words(fold(e.name).split(/ (?:of|in) /)[0].replace(/[^a-z ]/g, ' '));
    const head = headPhrase[headPhrase.length - 1];
    const names = [...new Set([e.id, head].filter((w): w is string => !!w && w.length >= 3))];
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
    for (const w of nameWords) if (!names.includes(w) && !tagStems.has(stem(w))) tagStems.set(stem(w), 0.3);
    const sounds = e.soundsLike.map((raw) => lettersOnly(raw)).filter((s) => s.length >= 2).map((s) => ({ s, k: phoneticKey(s) }));
    return { e, names, idKey: phoneticKey(e.id), tagStems, tagWords, multi, sounds };
  });
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
  /** Phonetic key of `norm`. */
  key: string;
  /** English meaning words (itself, its stem, French gloss) and their stems. */
  means: string[];
  meanStems: string[];
  /** 0 = first word of the text … 1 = last. */
  pos: number;
  /** Capitalised in the source and not the first word (a proper noun). */
  proper: boolean;
  /** Capitalised in the source (even as first word). */
  capital: boolean;
  /** 0-based index among the text's words. */
  index: number;
  /** Salience adjustment (surname +, first name −). */
  bonus: number;
}

const ELISION = /(?<![\p{L}])(?:qu|[dljmnstc])['’](?=\p{L})/giu;

function makeWord(norm: string, raw: string, proper: boolean, capital: boolean): Word {
  const st = stem(norm);
  const gloss = GLOSS[norm] ?? GLOSS[st] ?? [];
  const means = [...new Set([norm, st, ...gloss])];
  return { norm, raw, stem: st, key: phoneticKey(norm), means, meanStems: [...new Set(means.map(stem))], pos: 0, proper, capital, index: 0, bonus: 0 };
}

function tokenize(text: string): Word[] {
  const src = String(text ?? '').replace(ELISION, ' ');
  let out: Word[] = [];
  let first = true;
  for (const m of src.matchAll(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*(?:-[\p{L}\p{N}]+)*/gu)) {
    const raw = m[0];
    const toks = baseTokens(raw);
    const capital = /^\p{Lu}/u.test(raw);
    for (const t of toks) {
      const w = makeWord(t, toks.length === 1 ? raw : t, !first && capital, capital);
      (w as Word & { chunk?: string }).chunk = raw;
      out.push(w);
    }
    first = false;
  }
  // Merge fixed pairs ("World War" → worldwar, "D-Day" → dday).
  const merged: Word[] = [];
  for (let i = 0; i < out.length; i++) {
    const a = out[i];
    const b = out[i + 1];
    const pair = b ? PAIRS[`${a.norm} ${b.norm}`] : undefined;
    if (pair && b) {
      const ca = (a as Word & { chunk?: string }).chunk;
      const raw = ca && ca === (b as Word & { chunk?: string }).chunk ? ca : `${a.raw} ${b.raw}`;
      const w = makeWord(pair, raw, a.proper || b.proper, a.capital);
      w.means.push(...b.means);
      w.meanStems.push(...b.meanStems);
      merged.push(w);
      i++;
    } else merged.push(a);
  }
  out = merged;
  out.forEach((w, i) => {
    w.index = i;
    w.pos = out.length > 1 ? i / (out.length - 1) : 0;
  });
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
  /** 'part' link found on a tag rather than on the model's name. */
  viaTag?: boolean;
  source: 'answer' | 'question';
}

/** How well a word puns on an entry, and on which slice of the word. */
function soundLink(w: string, wk: string, inf: EntryInfo): { score: number; start: number; end: number } {
  let best = { score: 0, start: 0, end: 0 };
  const consider = (score: number, start: number, end: number) => {
    if (score > best.score) best = { score, start, end };
  };
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
  // The word sounds like the model's own name (Mona ~ moon, Canberra ~ can): easier to hear.
  if (best.score > 0 && inf.idKey.length >= 2 && wk.startsWith(inf.idKey)) best.score += 0.5;
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
  }
  for (const st of w.meanStems) {
    const rank = inf.tagStems.get(st);
    if (rank !== undefined) best = Math.max(best, 9 + 0.6 * (1 - rank));
  }
  return best;
}

/** Every link from a list of words to the catalog (several per entry possible). */
function linksFor(ws: Word[], source: 'answer' | 'question'): Link[] {
  const out: Link[] = [];
  const all = info();
  const phrase = ` ${ws.map((w) => w.norm).join(' ')} `;
  for (const w of ws) {
    if (!isContent(w)) continue;
    const n = w.norm;
    const perWord: Link[] = [];
    for (const inf of all) {
      const e = inf.e;
      const mk = (score: number, kind: LinkKind, start = 0, end = n.length): Link => ({ entry: e, score, kind, word: w, start, end, source });
      if (inf.names.includes(n) || inf.names.includes(w.stem)) perWord.push(mk(12, 'exact'));
      const s = soundLink(n, w.key, inf);
      if (s.score > 0) perWord.push(mk(s.score, 'sound', s.start, s.end));
      const m = meaningLink(w, inf);
      if (m > 0) perWord.push(mk(m, 'meaning'));
      if (n.length >= 6) {
        // Compound parts: POWER-HOUSE (the model's own name scores high; a tag only on the answer).
        for (const t of source === 'answer' ? [...inf.names, ...inf.tagWords] : inf.names) {
          if (t.length < 4 || t === n || n.length - t.length < 3) continue;
          const isName = inf.names.includes(t);
          const at = n.startsWith(t) ? 0 : n.endsWith(t) ? n.length - t.length : -1;
          if (at >= 0) perWord.push({ ...mk(isName ? 10 : 7, 'part', at, at + t.length), viaTag: !isName });
        }
      }
    }
    // Anim puns: SHAKE-SPEARe → the rest of the word puns on a model, which then shakes.
    for (const a of ANIM_PUNS) {
      if (n.length - a.length < 3 || !n.startsWith(a)) continue;
      const rest = n.slice(a.length);
      const rk = phoneticKey(rest);
      for (const inf of all) {
        if (!inf.e.anims.includes(a)) continue;
        const s = soundLink(rest, rk, inf);
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
  // Multi-word tags: "de gaulle" → radio, "tea party" → teacup (names, so specific).
  for (const inf of all) {
    for (const t of inf.multi) {
      if (!phrase.includes(` ${t} `)) continue;
      const firstWord = t.split(' ')[0];
      const w = ws.find((x) => x.norm === firstWord) ?? ws.find(isContent);
      if (w) out.push({ entry: inf.e, score: 11, kind: 'meaning', word: w, start: 0, end: w.norm.length, source });
    }
  }
  return out;
}

interface Candidate {
  entry: CatalogEntry;
  link: Link;
  score: number;
}

const isPun = (k: LinkKind) => k !== 'meaning';

/** Best link per entry, with the tie-breakers (double links, Q+A links, avoid list, seeded jitter). */
function rank(
  links: Link[],
  rand: RandomSource,
  avoid: Set<string>,
  last: string | undefined,
  other: Link[] = [],
  filter: (e: CatalogEntry) => boolean = () => true,
): Candidate[] {
  const byEntry = new Map<string, Link[]>();
  for (const l of links) {
    if (!filter(l.entry)) continue;
    const arr = byEntry.get(l.entry.id);
    if (arr) arr.push(l);
    else byEntry.set(l.entry.id, [l]);
  }
  const otherBest = new Map<string, number>();
  for (const l of other) otherBest.set(l.entry.id, Math.max(otherBest.get(l.entry.id) ?? 0, l.score));
  // Seeded jitter drawn in catalog order so results do not depend on the link order.
  const jitter = new Map(info().map((i) => [i.e.id, rand()]));
  const out: Candidate[] = [];
  for (const [id, ls] of byEntry) {
    const adj = (l: Link) => l.score + l.word.bonus + (l.word.proper ? 0.6 : 0) + 0.4 * (1 - l.word.pos);
    ls.sort((a, b) => adj(b) - adj(a) || a.word.index - b.word.index);
    const best = ls[0];
    let score = adj(best);
    // Linked by sound AND meaning through the same word (BERlin → bear, the Berlin bear).
    const same = ls.filter((l) => l.word === best.word && l.score >= 6);
    if (same.some((l) => isPun(l.kind) && !l.viaTag) && same.some((l) => l.kind === 'meaning')) score += 0.8;
    if ((otherBest.get(id) ?? 0) >= STRONG_LINK) score += 0.6; // linked to the other side too
    if (avoid.has(id)) score -= 2;
    if (id === last) score -= 6;
    score += (jitter.get(id) ?? 0) * 0.05;
    out.push({ entry: best.entry, link: best, score });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** A question link good enough to be the prop that binds the question to the answer. */
function goodQuestionLink(l: Link): boolean {
  if (l.score < STRONG_LINK) return false;
  if (l.kind === 'meaning' || l.kind === 'exact') return true;
  const cover = (l.end - l.start) / Math.max(1, l.word.norm.length);
  return l.score >= 8 || cover >= 0.6;
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
  const yearish = /\b(year|when|date|annee|quand|debut|signature|chute|prise|couronnement|begin|began|start|end|ended|fell|founded|reach|reached)\b/.test(
    baseTokens(question).join(' '),
  );
  const unit = /[a-z]\s*\/|km|°|%/i.test(raw);
  const year = date?.year ?? nums.find((n) => /^\d{3,4}$/.test(n) && (yearish || nums.length === 1) && +n >= 100 && +n <= 2100 && !unit);
  const leftover = aWords.filter((w) => isContent(w) && !MONTHS[w.norm] && !UNIT_WORDS.has(w.norm));
  const pure = formula || ((nums.length > 0 || !!date) && leftover.length === 0);
  return { nums, date, year, formula, pure };
}

// ─────────────────────────────────────────────────────────────────────────────
// Composition helpers
// ─────────────────────────────────────────────────────────────────────────────

const upper = (s: string) => s.toLocaleUpperCase('en');
const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a');
const hookOf = (text: string) => text.split(/ (?:of|in)\b/)[0].replace(/ [a-z].*$/, '');

/** Caption name of a model, and the CAPS hook inside it. */
function nameOf(e: CatalogEntry): { text: string; hook: string } {
  const text = SHORT_NAME[e.id] ?? upper(e.name);
  return { text, hook: hookOf(text) };
}
function pluralOf(e: CatalogEntry, n: number): { text: string; hook: string } {
  if (n === 1) return nameOf(e);
  let text = PLURAL_NAME[e.id];
  if (!text) {
    const [head, ...tail] = nameOf(e).text.split(/(?= of )/);
    const p = /(S|X|CH|SH)$/.test(head) ? head + 'ES' : /[^AEIOU]Y$/.test(head) ? head.slice(0, -1) + 'IES' : head + 'S';
    text = [p, ...tail].join('');
  }
  return { text, hook: hookOf(text) };
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

function chooseTextModel(q: string[], ni: NumberInfo, rand: RandomSource): string {
  const has = (...ws: string[]) => ws.some((w) => q.includes(w));
  if (ni.year || ni.date) return 'plaque';
  if (has('treaty', 'law', 'act', 'declaration', 'charter', 'constitution', 'traite', 'loi', 'decree', 'decret')) return 'scroll';
  if (has('country', 'nation', 'nations', 'flag', 'independence', 'pays', 'drapeau')) return 'flag';
  if (has('book', 'author', 'wrote', 'novel', 'poem', 'livre', 'auteur', 'ecrit', 'roman', 'poeme')) return 'book';
  if (has('who', 'person', 'memorial', 'died', 'born', 'qui')) return 'plaque';
  if (has('capital', 'capitale', 'city', 'ville', 'river', 'fleuve', 'formula', 'formule', 'symbol', 'symbole', 'speed', 'vitesse', 'point')) return 'sign';
  return pick(rand, ['sign', 'plaque', 'sign', 'scroll']);
}

const LEADING_ARTICLE = /^(?:(?:the|a|an|le|la|les|un|une|du|des|de la|de)\s+|(?:de\s+)?l['’](?=\p{L}))+/iu;
const clean = (s: string) => String(s ?? '').replace(/\s+/g, ' ').trim();
const fits = (s: string) => s.length > 0 && s.length <= LABEL_CHARS;

/** The short text written on the label: the whole answer if short, else the date/number, else the key word. */
function labelFor(answer: string, ni: NumberInfo, key: Word | undefined): string {
  const a = clean(answer).replace(LEADING_ARTICLE, '');
  if (ni.date) {
    const { day, month, year, monthRaw } = ni.date;
    const fr = FR_MONTHS.has(fold(monthRaw));
    const tries = [
      [day || '', monthRaw, year ?? ''].join(' ').trim(),
      [day || '', fr ? FR_MONTH_ABBR[month - 1] : EN_MONTH_ABBR[month - 1], year ?? ''].join(' ').trim(),
      year ?? '',
    ];
    for (const t of tries) if (fits(t)) return t;
  }
  if (ni.pure && fits(a) && !(ni.year && /\p{L}{2}/u.test(a))) return a;
  if (ni.year) return ni.year;
  if (ni.nums.length && (ni.pure || !key)) {
    const m = /\d[\d  .,]*(?:\s?[×x]\s?10[⁰-⁹²³]+)?(?:\s?(?:°C|°F|%|km\/s|m\/s|km\/h|km|kg|mol|cm|mm|m|s|g|K|J|W|V|N|Pa|Hz)\b)?/.exec(clean(answer));
    const t = m ? m[0].trim() : ni.nums[0];
    return fits(t) ? t : ni.nums[0].slice(0, LABEL_CHARS);
  }
  if (fits(a)) return a;
  if (key && fits(key.raw)) return key.raw;
  return '';
}

/** Where a pun splits its word: [start, end) is the hit, `second` the other half's hit. */
interface PunCut {
  start: number;
  end: number;
  lead?: number;
  second?: { start: number; end: number };
}

/** "POWER-HOUSE", "AVO-gadro", "dar-WIN", "SHAKE-SPEARe", or the whole word in CAPS. */
function punDisplay(w: Word, cut: PunCut | null): string {
  const src = fold(w.raw) === w.norm ? w.raw : w.norm;
  if (!cut || (cut.start === 0 && cut.end >= src.length && !cut.second)) return upper(src);
  const marks = new Set([0, src.length, cut.start, cut.end]);
  if (cut.lead) marks.add(cut.lead);
  if (cut.second) {
    marks.add(cut.second.start);
    marks.add(cut.second.end);
  }
  const pts = [...marks].filter((c) => c >= 0 && c <= src.length).sort((a, b) => a - b);
  const pieces: string[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    const hit = (a >= cut.start && b <= cut.end) || (cut.lead !== undefined && b <= cut.lead) || (cut.second && a >= cut.second.start && b <= cut.second.end);
    pieces.push(hit ? upper(src.slice(a, b)) : src.slice(a, b).toLowerCase());
  }
  return pieces.join('-');
}

/**
 * Where a sound link cuts its word. A whole-word match is split on the entry's longest shorter
 * prefix syllable when that syllable sounds like the model's name (Avogadro → AVO-gadro,
 * Berlin → BER-lin) — never when it does not (water ↛ WAT-er on a wave).
 */
function soundCut(l: Link): PunCut | null {
  const n = l.word.norm;
  if (l.kind === 'meaning' || l.kind === 'exact') return null;
  if (l.kind === 'anim') return { start: l.start, end: l.end, lead: l.start };
  if (l.start === 0 && l.end >= n.length) {
    const inf = info().find((i) => i.e.id === l.entry.id)!;
    const idKey = inf.idKey;
    let best = 0;
    for (const { s, k } of inf.sounds) {
      if (s.length >= 3 && s.length < n.length && n.startsWith(s) && s.length > best && k.length >= 1 && (idKey.startsWith(k) || k.startsWith(idKey))) best = s.length;
    }
    return best ? { start: 0, end: best } : null;
  }
  return { start: l.start, end: l.end };
}

/** The answer, short, with its key word replaced by `display` ("the POWER-HOUSE of the cell"). */
function answerDisplay(answer: string, w: Word | undefined, display: string): string {
  const a = clean(answer);
  if (!w || a.length > 40) return display;
  const i = a.indexOf(w.raw);
  if (i < 0) return display;
  return a.slice(0, i) + display + a.slice(i + w.raw.length);
}

/** The question's proper-noun run containing `w` ("Mona Lisa", "World War I"), or `display` alone. */
function questionPhrase(qWords: Word[], w: Word, display: string): string {
  if (!w.proper) return display;
  let a = w.index;
  let b = w.index;
  while (a > 0 && qWords[a - 1].proper) a--;
  while (b + 1 < qWords.length && qWords[b + 1].proper) b++;
  if (b - a > 3) return display;
  return qWords
    .slice(a, b + 1)
    .map((x) => (x === w ? display : upper(x.raw)))
    .join(' ');
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
  // Answer words: dates/quantities keep no month or unit words; formulas none.
  const aWords = ni.formula ? [] : aAll.filter((w) => isContent(w) && !(ni.nums.length && (MONTHS[w.norm] || UNIT_WORDS.has(w.norm))));
  const qWords = qAll.filter((w) => isContent(w) && !aNorms.has(w.norm));
  // A person's name ("Isaac Newton", "Leonardo da Vinci"): the surname is the key.
  const nameWords = aAll.filter((w) => !NAME_PARTICLES.has(w.norm));
  if (nameWords.length >= 2 && nameWords.length <= 4 && nameWords.every((w) => w.capital && /[a-z]/.test(w.norm))) {
    nameWords.forEach((w, i) => (w.bonus = i === nameWords.length - 1 ? 1.5 : -1));
  }

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
  const heroCut = heroLink && heroSource !== 'weak' ? soundCut(heroLink) : null;

  // ── Second half of the pun: CAN-BERRA, OTTA-WA, POWER-HOUSE ──
  let part: { entry: CatalogEntry; start: number; end: number } | undefined;
  if (heroLink && heroCut && !heroLink.anim && (heroLink.kind === 'sound' || heroLink.kind === 'part')) {
    const n = heroLink.word.norm;
    const [rs, re] = heroCut.start === 0 ? [heroCut.end, n.length] : [0, heroCut.start];
    const rest = n.slice(rs, re);
    if (rest.length >= 2) {
      const pw = makeWord(rest, rest, false, false);
      pw.index = heroLink.word.index;
      pw.pos = heroLink.word.pos;
      const restLinks: Link[] = [];
      const mk = (entry: CatalogEntry, score: number, kind: LinkKind, start: number, end: number): Link => ({ entry, score, kind, word: pw, start, end, source: 'answer' });
      for (const inf of info()) {
        if (inf.e.text || used.has(inf.e.id)) continue;
        if (inf.sounds.some((x) => x.s === rest)) restLinks.push(mk(inf.e, 11, 'sound', 0, rest.length));
        else if (rest.length >= 3) {
          const s = soundLink(rest, pw.key, inf);
          if (s.score >= 7 && s.start === 0) restLinks.push(mk(inf.e, s.score, 'sound', 0, s.end));
        }
        if (heroLink.kind === 'part' && rest.length >= 3) {
          const m = meaningLink(pw, inf);
          if (m > 0) restLinks.push(mk(inf.e, m, 'meaning', 0, rest.length));
          if (inf.names.includes(rest)) restLinks.push(mk(inf.e, 12, 'exact', 0, rest.length));
        }
      }
      const best = rank(restLinks, rand, avoid, undefined)[0];
      if (best && best.link.score >= STRONG_LINK) {
        const len = best.link.kind === 'sound' ? best.link.end : rest.length;
        part = { entry: best.entry, start: rs, end: rs + len };
        used.add(best.entry.id);
      }
    }
  }

  // ── Question prop: binds the question to the answer (Kenya → KEY, Mona Lisa → MOON) ──
  let qProp: Candidate | undefined;
  if (heroSource === 'answer' || heroSource === 'weak') {
    qProp = qRank.find((c) => !used.has(c.entry.id) && goodQuestionLink(c.link));
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
  let countLink: Link | undefined;
  if (count) {
    // Prefer copies of something the notion is about (1914 → helmets, 1919 → doves), else a toy.
    const countable = (e: CatalogEntry) => !e.text && e.category !== 'structure' && !used.has(e.id) && (hAnim !== 'juggle' || e.anims.includes('juggle'));
    const linked = rank([...qLinks, ...aLinks], rand, avoid, last, [], countable).find((c) => goodQuestionLink(c.link));
    countLink = linked?.link;
    const toys = COUNT_MODELS.filter((m) => !used.has(m) && (hAnim !== 'juggle' || entryOf(m).anims.includes('juggle')));
    countEntry = linked?.entry ?? entryOf(pickAvoiding(rand, toys.length ? toys : COUNT_MODELS.filter((m) => !used.has(m)), avoid, last));
    used.add(countEntry.id);
    const fall = [...aWords, ...qWords].some((w) => /^(fall|fell|chute|collapse)$/.test(w.norm));
    const natural = COUNT_ANIMS.filter((a) => countEntry!.anims.includes(a));
    const anim: AnimId =
      fall && countEntry.anims.includes('rain')
        ? 'rain'
        : hAnim === 'juggle' && countEntry.anims.includes('juggle')
          ? 'juggle'
          : natural.length
            ? pick(rand, natural)
            : countEntry.anims.includes('orbit')
              ? 'orbit'
              : 'bounce';
    countActor = { model: countEntry.id, role: 'count', anim, count };
  }

  // ── Key word ──
  const keyWord: Word | undefined =
    heroSource === 'answer' && heroLink
      ? heroLink.word
      : aWords.slice().sort((a, b) => b.bonus - a.bonus || Number(b.capital) - Number(a.capital) || b.norm.length - a.norm.length || a.index - b.index)[0];

  // ── Label ──
  const strongPun = heroSource === 'answer' && !!heroLink && heroLink.kind !== 'meaning';
  const needLabel = ni.nums.length > 0 || ni.formula || !!ni.date || !strongPun;
  const labelText = needLabel ? labelFor(answer, ni, keyWord) : '';
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
    const d = punDisplay(heroLink.word, heroCut ? { ...heroCut, second: part ? { start: part.start, end: part.end } : undefined } : null);
    punHooks.push(...d.split('-').filter((p) => p.length >= 2 && p === upper(p) && /\p{L}/u.test(p)));
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
    keyword = clean(answer);
    aDisp = upper(keyword.slice(0, 30)) || '?';
  }
  // Question side: the linked question word, else its most salient word (proper noun or long word).
  let qDisp = '';
  const qLink = heroSource === 'question' ? heroLink : qProp?.link;
  if (qLink) qDisp = questionPhrase(qAll, qLink.word, punDisplay(qLink.word, soundCut(qLink)));
  else {
    const salient = qWords
      .filter((w) => !WEAK_Q.has(w.norm) && (w.proper || w.norm.length >= 7))
      .sort((a, b) => Number(b.proper) - Number(a.proper) || b.norm.length - a.norm.length)[0];
    if (salient) qDisp = questionPhrase(qAll, salient, upper(salient.raw));
  }
  if (qDisp && fold(aDisp).includes(fold(qDisp))) qDisp = '';
  // The count's own pun, when it has one ("8 TANKS — CHAR-lemagne").
  const countDisp = countLink && countLink.kind !== 'meaning' && countLink.kind !== 'exact' ? punDisplay(countLink.word, soundCut(countLink)) : '';

  // ── Caption (drop optional pieces until it fits) ──
  const HERO = nameOf(hero);
  const verb = heroLink?.anim ? upper(ANIM_VERB[hAnim]) : ANIM_VERB[hAnim];
  const countPhrase = (): string => {
    if (!countActor || !countEntry) return '';
    const things = pluralOf(countEntry, count).text + (countDisp && countDisp !== qDisp ? ` (${countDisp})` : '');
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
  const partActor: SceneActor | undefined = part ? { model: part.entry.id, role: 'prop', anim: naturalAnim(part.entry, rand) } : undefined;
  const qActor: SceneActor | undefined = qProp ? { model: qProp.entry.id, role: 'prop', anim: naturalAnim(qProp.entry, rand) } : undefined;
  const numeric = ni.nums.length > 0 || ni.formula || !!ni.date;

  const actorsFor = (withQ: boolean, withPart: boolean, withCount: boolean): SceneActor[] => {
    const extras = numeric
      ? [labelActor, withCount ? countActor : undefined, withPart ? partActor : undefined, withQ ? qActor : undefined]
      : [withPart ? partActor : undefined, labelActor, withQ ? qActor : undefined];
    const list: SceneActor[] = [heroActor];
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
    const cp = has(countEntry?.id) ? countPhrase() : '';
    if (cp) segs.push(cp);
    if (v.l && labelActor && has(labelEntry?.id)) segs.push(labelPhrase());
    let c = `A giant ${HERO.text} ${verb}`;
    if (segs.length) c += (segs[0] === cp && hAnim === 'juggle' && countActor?.anim === 'juggle' ? ' ' : ', ') + segs.join(', ');
    c += ` — ${v.qd && qDisp ? `${qDisp}: ${aDisp}` : aDisp}`;
    c = c.replace(/\s+/g, ' ').trim();
    if (!/[!?.]$/.test(c)) c += '!';
    caption = c;
    if (caption.length <= MAX_CAPTION) break;
  }
  if (caption.length > MAX_CAPTION) caption = caption.slice(0, MAX_CAPTION - 1).replace(/\s+\S*$/, '') + '!';

  // ── Hooks ──
  const inScene = (id: string | undefined) => !!id && actors.some((a) => a.model === id);
  const hooks: string[] = [HERO.hook];
  if (part && inScene(part.entry.id)) hooks.push(nameOf(part.entry).hook);
  if (qProp && inScene(qProp.entry.id)) hooks.push(nameOf(qProp.entry).hook);
  if (countEntry && inScene(countEntry.id)) hooks.push(pluralOf(countEntry, count).hook);
  if (labelText) hooks.push(upper(labelText));
  hooks.push(...punHooks);
  const capsPieces = (s: string) => s.split(/[-\s]/).filter((p) => p.length >= 2 && p === upper(p) && /\p{L}/u.test(p));
  hooks.push(...capsPieces(qDisp), ...capsPieces(countDisp));
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
  const wk = phoneticKey(w);
  return info()
    .map((i) => ({ id: i.e.id, score: Math.max(soundLink(w, wk, i).score, i.names.includes(w) ? 12 : 0) }))
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
