/**
 * Versioned persistence schema of the headset app (pure: the app provides the localStorage
 * adapter, e.g. `localStorage.setItem(STORE_KEY, serialize(store))`).
 *
 * - {@link migrate} accepts anything (garbage, older or newer versions, partial objects) and
 *   always returns a valid {@link Store}; invalid entries are dropped, never thrown on.
 * - Built-in palaces are NOT stored (they ship with the code); only imported ones are. An exam
 *   date chosen for a built-in palace is kept in `examDates`.
 * - All helpers are immutable: they return a new store.
 */
import type {
  AnswerMode,
  Furniture,
  Grade,
  Lang,
  Notion,
  Palace,
  PalaceProgress,
  Placement,
  ReviewLog,
  ReviewState,
  RoomModel,
  SceneActor,
  SceneRecipe,
  SemanticLabel,
  Vec3,
  AnimId,
} from './types';
import { MAX_NOTIONS } from './types';
import { composeScene } from './mnemonic';
import { parseIsoDate } from './time';

export const STORE_VERSION = 1;
/** Suggested localStorage key. */
export const STORE_KEY = 'loci.store';

export interface Settings {
  voice: boolean;
  sound: boolean;
  handedness?: 'left' | 'right';
}

export interface Store {
  version: 1;
  rooms: RoomModel[];
  /** Imported palaces only; builtins come from code. */
  palaces: Palace[];
  progress: PalaceProgress[];
  activePalaceId?: string;
  /** Opaque app snapshot for pause/resume (must be JSON-serialisable). */
  flow?: unknown;
  settings: Settings;
  onboardingDone: boolean;
  /** Exam dates (YYYY-MM-DD) set on built-in palaces, by palace id. */
  examDates?: Record<string, string>;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({ voice: true, sound: true });

export function emptyStore(): Store {
  return { version: 1, rooms: [], palaces: [], progress: [], settings: { ...DEFAULT_SETTINGS }, onboardingDone: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation helpers
// ─────────────────────────────────────────────────────────────────────────────

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const nonEmpty = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const vec3 = (v: unknown): Vec3 | undefined =>
  Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && Number.isFinite(x)) ? [v[0], v[1], v[2]] : undefined;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const HEX = /^#[0-9a-fA-F]{6}$/;

const LABELS: ReadonlySet<SemanticLabel> = new Set<SemanticLabel>([
  'table', 'couch', 'bed', 'lamp', 'plant', 'screen', 'storage', 'wall_art', 'window_frame', 'door_frame', 'shelf', 'chair', 'wall_face', 'floor', 'ceiling', 'other', 'manual',
]);
const ANIMS: ReadonlySet<AnimId> = new Set<AnimId>(['idle', 'bounce', 'spin', 'wobble', 'orbit', 'juggle', 'float', 'shake', 'grow', 'march', 'fly', 'rain', 'stack', 'flip', 'dance']);
const GRADES: ReadonlySet<Grade> = new Set<Grade>(['again', 'hard', 'good', 'easy']);
const MODES: ReadonlySet<AnswerMode> = new Set<AnswerMode>(['voice', 'bubble', 'reveal']);

function sanitizeFurniture(v: unknown): Furniture | null {
  if (!isObj(v)) return null;
  const id = nonEmpty(v.id);
  const center = vec3(v.center);
  const size = vec3(v.size);
  if (!id || !center || !size) return null;
  const label = (typeof v.label === 'string' && LABELS.has(v.label as SemanticLabel) ? v.label : 'other') as SemanticLabel;
  return { id, label, center, size, yaw: num(v.yaw) ?? 0, name: str(v.name) ?? label };
}

function sanitizeRoom(v: unknown): RoomModel | null {
  if (!isObj(v)) return null;
  const id = nonEmpty(v.id);
  if (!id) return null;
  const createdAt = num(v.createdAt) ?? 0;
  const room: RoomModel = {
    id,
    createdAt,
    updatedAt: num(v.updatedAt) ?? createdAt,
    furniture: arr(v.furniture).map(sanitizeFurniture).filter((f): f is Furniture => !!f),
    seat: vec3(v.seat) ?? [0, 0, 0],
    seatYaw: num(v.seatYaw) ?? 0,
  };
  const anchor = nonEmpty(v.anchorUuid);
  if (anchor) room.anchorUuid = anchor;
  return room;
}

function sanitizeActor(v: unknown, index: number): SceneActor | null {
  if (!isObj(v)) return null;
  const model = nonEmpty(v.model);
  if (!model) return null;
  const role = v.role === 'hero' || v.role === 'prop' || v.role === 'count' ? v.role : index === 0 ? 'hero' : 'prop';
  const anim = (typeof v.anim === 'string' && ANIMS.has(v.anim as AnimId) ? v.anim : 'idle') as AnimId;
  const a: SceneActor = { model, role, anim };
  const count = num(v.count);
  if (role === 'count') a.count = clamp(Math.round(count ?? 3), 1, 12);
  const scale = num(v.scale);
  if (scale !== undefined) a.scale = clamp(scale, 0.1, 5);
  if (typeof v.tint === 'string' && HEX.test(v.tint)) a.tint = v.tint;
  if (typeof v.label === 'string' && v.label) a.label = v.label.slice(0, 40);
  return a;
}

function sanitizeScene(v: unknown): SceneRecipe | null {
  if (!isObj(v)) return null;
  const actors = arr(v.actors)
    .map(sanitizeActor)
    .filter((a): a is SceneActor => !!a)
    .slice(0, 3);
  const caption = nonEmpty(v.caption);
  if (actors.length === 0 || !caption) return null;
  const scene: SceneRecipe = { actors, caption };
  const hooks = arr(v.hooks).filter((h): h is string => typeof h === 'string');
  if (hooks.length) scene.hooks = hooks;
  if (typeof v.accent === 'string' && HEX.test(v.accent)) scene.accent = v.accent;
  return scene;
}

function sanitizeNotion(v: unknown): Notion | null {
  if (!isObj(v)) return null;
  const id = nonEmpty(v.id);
  const question = nonEmpty(v.question);
  const answer = nonEmpty(v.answer);
  const d = arr(v.distractors).filter((x): x is string => typeof x === 'string' && !!x.trim());
  if (!id || !question || !answer || d.length < 2) return null;
  const n: Notion = { id, question, answer, distractors: [d[0], d[1]], scene: sanitizeScene(v.scene) ?? composeScene(question, answer) };
  const accept = arr(v.accept).filter((x): x is string => typeof x === 'string' && !!x.trim());
  if (accept.length) n.accept = accept;
  return n;
}

function sanitizePalace(v: unknown): Palace | null {
  if (!isObj(v)) return null;
  const id = nonEmpty(v.id);
  if (!id) return null;
  const seen = new Set<string>();
  const notions = arr(v.notions)
    .map(sanitizeNotion)
    .filter((n): n is Notion => !!n && !seen.has(n.id) && !!seen.add(n.id))
    .slice(0, MAX_NOTIONS);
  const lang: Lang = v.lang === 'fr' ? 'fr' : 'en';
  const p: Palace = { id, title: nonEmpty(v.title) ?? 'Untitled palace', subject: str(v.subject) ?? '', lang, createdAt: num(v.createdAt) ?? 0, notions };
  const exam = str(v.examDate);
  if (exam && parseIsoDate(exam) !== null) p.examDate = exam;
  if (v.builtin === true) p.builtin = true;
  return p;
}

function sanitizeLog(v: unknown): ReviewLog | null {
  if (!isObj(v)) return null;
  const at = num(v.at);
  if (at === undefined || !GRADES.has(v.grade as Grade)) return null;
  return { at, grade: v.grade as Grade, mode: (MODES.has(v.mode as AnswerMode) ? v.mode : 'bubble') as AnswerMode };
}

function sanitizeReview(v: unknown, fallbackId: string): ReviewState | null {
  if (!isObj(v)) return null;
  const notionId = nonEmpty(v.notionId) ?? fallbackId;
  if (!notionId) return null;
  const placedAt = num(v.placedAt) ?? 0;
  return {
    notionId,
    placedAt,
    due: num(v.due) ?? placedAt,
    intervalDays: Math.max(0, num(v.intervalDays) ?? 0),
    ease: clamp(num(v.ease) ?? 2.5, 1.3, 3),
    streak: Math.max(0, Math.round(num(v.streak) ?? 0)),
    lapses: Math.max(0, Math.round(num(v.lapses) ?? 0)),
    log: arr(v.log)
      .map(sanitizeLog)
      .filter((l): l is ReviewLog => !!l)
      .sort((a, b) => a.at - b.at),
  };
}

function sanitizePlacement(v: unknown): Placement | null {
  if (!isObj(v)) return null;
  const notionId = nonEmpty(v.notionId);
  const furnitureId = nonEmpty(v.furnitureId);
  if (!notionId || !furnitureId) return null;
  return { notionId, furnitureId, local: vec3(v.local) ?? [0, 0, 0], order: num(v.order) ?? 0, placedAt: num(v.placedAt) ?? 0 };
}

function sanitizeProgress(v: unknown): PalaceProgress | null {
  if (!isObj(v)) return null;
  const palaceId = nonEmpty(v.palaceId);
  const roomId = nonEmpty(v.roomId);
  if (!palaceId || !roomId) return null;
  const reviews: Record<string, ReviewState> = {};
  const rawReviews = isObj(v.reviews) ? v.reviews : {};
  for (const [k, r] of Object.entries(rawReviews)) {
    const s = sanitizeReview(r, k);
    if (s) reviews[s.notionId] = s;
  }
  const seen = new Set<string>();
  const placements = arr(v.placements)
    .map(sanitizePlacement)
    .filter((p): p is Placement => !!p && !seen.has(p.notionId) && !!seen.add(p.notionId));
  const p: PalaceProgress = { palaceId, roomId, placements, reviews };
  const last = num(v.lastSessionAt);
  if (last !== undefined) p.lastSessionAt = last;
  return p;
}

function sanitizeSettings(v: unknown): Settings {
  const o = isObj(v) ? v : {};
  const s: Settings = {
    voice: typeof o.voice === 'boolean' ? o.voice : DEFAULT_SETTINGS.voice,
    sound: typeof o.sound === 'boolean' ? o.sound : DEFAULT_SETTINGS.sound,
  };
  if (o.handedness === 'left' || o.handedness === 'right') s.handedness = o.handedness;
  return s;
}

const uniqueBy = <T>(items: T[], key: (t: T) => string): T[] => {
  const map = new Map<string, T>();
  for (const it of items) map.set(key(it), it); // last one wins
  return [...map.values()];
};

// ─────────────────────────────────────────────────────────────────────────────
// Migration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Brings anything back to a valid current store. Never throws.
 * - a JSON string is parsed first;
 * - version 0 / no version (pre-release builds): `progress` may be a map keyed by palace id,
 *   `onboarded` stands for `onboardingDone`, `voice`/`sound` may sit at the top level, and
 *   built-in palaces may have been stored (they are dropped — they come from code);
 * - versions newer than this build: known fields are kept on a best-effort basis.
 */
export function migrate(raw: unknown): Store {
  try {
    let v = raw;
    if (typeof v === 'string') {
      try {
        v = JSON.parse(v);
      } catch {
        return emptyStore();
      }
    }
    if (!isObj(v)) return emptyStore();
    const version = num(v.version) ?? 0;
    const src: Obj = version < 1 ? fromV0(v) : v;

    const rooms = uniqueBy(arr(src.rooms).map(sanitizeRoom).filter((r): r is RoomModel => !!r), (r) => r.id);
    const palaces = uniqueBy(
      arr(src.palaces)
        .map(sanitizePalace)
        .filter((p): p is Palace => !!p && !p.builtin),
      (p) => p.id,
    );
    const progress = uniqueBy(
      arr(src.progress)
        .map(sanitizeProgress)
        .filter((p): p is PalaceProgress => !!p),
      (p) => `${p.palaceId}\u0000${p.roomId}`,
    );
    const store: Store = {
      version: 1,
      rooms,
      palaces,
      progress,
      settings: sanitizeSettings(src.settings),
      onboardingDone: src.onboardingDone === true,
    };
    const active = nonEmpty(src.activePalaceId);
    if (active) store.activePalaceId = active;
    if (src.flow !== undefined && isJsonSafe(src.flow)) store.flow = src.flow;
    if (isObj(src.examDates)) {
      const ed: Record<string, string> = {};
      for (const [k, d] of Object.entries(src.examDates)) if (typeof d === 'string' && parseIsoDate(d) !== null) ed[k] = d;
      if (Object.keys(ed).length) store.examDates = ed;
    }
    return store;
  } catch {
    return emptyStore();
  }
}

function fromV0(v: Obj): Obj {
  const out: Obj = { ...v };
  if (isObj(v.progress)) {
    out.progress = Object.entries(v.progress).map(([palaceId, p]) => (isObj(p) ? { palaceId, ...p } : p));
  }
  if (v.onboardingDone === undefined && typeof v.onboarded === 'boolean') out.onboardingDone = v.onboarded;
  if (!isObj(v.settings)) out.settings = { voice: v.voice, sound: v.sound, handedness: v.handedness };
  if (isObj(v.room) && !Array.isArray(v.rooms)) out.rooms = [v.room];
  return out;
}

function isJsonSafe(v: unknown): boolean {
  try {
    JSON.stringify(v);
    return true;
  } catch {
    return false;
  }
}

/** JSON text of a store. */
export function serialize(store: Store): string {
  return JSON.stringify(store);
}

/** Store from JSON text (or null/garbage → empty store). Never throws. */
export function deserialize(text: string | null | undefined): Store {
  if (typeof text !== 'string' || !text) return emptyStore();
  return migrate(text);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers (immutable)
// ─────────────────────────────────────────────────────────────────────────────

/** Progress of a palace in a room; a fresh empty one (not yet stored) when none exists. */
export function getProgress(store: Store, palaceId: string, roomId: string): PalaceProgress {
  return store.progress.find((p) => p.palaceId === palaceId && p.roomId === roomId) ?? { palaceId, roomId, placements: [], reviews: {} };
}

/** Stores (adds or replaces) the progress of a palace in a room. */
export function upsertProgress(store: Store, progress: PalaceProgress): Store {
  const rest = store.progress.filter((p) => !(p.palaceId === progress.palaceId && p.roomId === progress.roomId));
  return { ...store, progress: [...rest, progress] };
}

/**
 * Adds or replaces an imported palace. For a built-in palace nothing but its exam date is
 * stored (in `examDates`).
 */
export function upsertPalace(store: Store, palace: Palace): Store {
  if (palace.builtin) return setExamDate(store, palace.id, palace.examDate);
  const i = store.palaces.findIndex((p) => p.id === palace.id);
  const palaces = i >= 0 ? store.palaces.map((p, k) => (k === i ? palace : p)) : [...store.palaces, palace];
  return { ...store, palaces };
}

/** Removes a palace, its progress in every room and its exam date; clears it if active. */
export function deletePalace(store: Store, palaceId: string): Store {
  const next: Store = {
    ...store,
    palaces: store.palaces.filter((p) => p.id !== palaceId),
    progress: store.progress.filter((p) => p.palaceId !== palaceId),
  };
  if (next.activePalaceId === palaceId) delete next.activePalaceId;
  return next.examDates && palaceId in next.examDates ? setExamDate(next, palaceId, undefined) : next;
}

/** Sets (or clears with undefined) the exam date of a built-in palace. */
export function setExamDate(store: Store, palaceId: string, examDate: string | undefined): Store {
  const ed = { ...(store.examDates ?? {}) };
  if (examDate && parseIsoDate(examDate) !== null) ed[palaceId] = examDate;
  else delete ed[palaceId];
  const next: Store = { ...store };
  if (Object.keys(ed).length) next.examDates = ed;
  else delete next.examDates;
  return next;
}

/** Adds or replaces a room. */
export function upsertRoom(store: Store, room: RoomModel): Store {
  return { ...store, rooms: [...store.rooms.filter((r) => r.id !== room.id), room] };
}

/**
 * Every palace the learner can open: the built-ins (with their stored exam dates) followed by the
 * imported ones. An imported palace with the id of a built-in is ignored.
 */
export function allPalaces(store: Store, builtins: Palace[]): Palace[] {
  const ids = new Set(builtins.map((b) => b.id));
  const withDates = builtins.map((b) => {
    const d = store.examDates?.[b.id];
    return d ? { ...b, examDate: d } : b;
  });
  return [...withDates, ...store.palaces.filter((p) => !ids.has(p.id))];
}
