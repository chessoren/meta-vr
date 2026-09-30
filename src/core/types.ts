/**
 * Loci — shared domain model.
 *
 * Everything in `src/core` is pure TypeScript (no DOM, no Three.js) so it can run
 * in the headset, on the phone companion, in Vercel functions and in unit tests.
 */

export type Lang = 'en' | 'fr';

/** Plain 3-vector, serialisable. Metres, Y up (WebXR convention). */
export type Vec3 = [number, number, number];

// ─────────────────────────────────────────────────────────────────────────────
// Mnemonic scenes (built from the procedural model library, never generated 3D)
// ─────────────────────────────────────────────────────────────────────────────

/** Identifier of a model in the procedural library (see src/lib3d/catalog.ts). */
export type ModelId = string;

/** Identifier of an animation clip applicable to any actor (see src/lib3d/anims.ts). */
export type AnimId =
  | 'idle' // gentle breathing bob
  | 'bounce' // hops up and down
  | 'spin' // rotates on Y
  | 'wobble' // rocks side to side
  | 'orbit' // circles around the scene centre
  | 'juggle' // several copies arc over the hero
  | 'float' // hovers and drifts
  | 'shake' // trembles (fear, cold, earthquake)
  | 'grow' // pulses bigger/smaller
  | 'march' // walks in place with a stomp
  | 'fly' // flaps / banks in a small loop
  | 'rain' // copies fall from above and respawn
  | 'stack' // copies stack into a tower, collapse, repeat
  | 'flip' // somersaults
  | 'dance'; // twist + hop

export interface SceneActor {
  model: ModelId;
  /** hero = main subject, prop = secondary object, count = repeated copies expressing a number. */
  role: 'hero' | 'prop' | 'count';
  anim: AnimId;
  /** Number of copies for role 'count' (1–12). */
  count?: number;
  /** Relative scale multiplier (default 1). Library models are normalised to the 30 cm cube. */
  scale?: number;
  /** Optional colour override, CSS hex (#rrggbb). */
  tint?: string;
  /** Short text painted on the actor (only for text-capable models: sign, flag, scroll, plaque, book). */
  label?: string;
}

export interface SceneRecipe {
  /** 1 to 3 actors. actors[0] is the hero. */
  actors: SceneActor[];
  /** One-line mnemonic story shown while encoding, e.g. "A giant AVOCADO juggling 6 balls". */
  caption: string;
  /** Words of the caption that carry the memory hook; rendered emphasised. */
  hooks?: string[];
  /** Accent colour of the scene halo, CSS hex. */
  accent?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Notions and palaces
// ─────────────────────────────────────────────────────────────────────────────

/** One atomic fact: a question and a short answer. */
export interface Notion {
  id: string;
  question: string;
  answer: string;
  /** Other accepted spellings / forms of the answer (used by the matcher and the voice grammar). */
  accept?: string[];
  /** Exactly two plausible wrong answers used for the three answer bubbles. */
  distractors: [string, string];
  scene: SceneRecipe;
}

export interface Palace {
  id: string;
  title: string;
  /** Short subject tag shown on the palace shelf, e.g. "History". */
  subject: string;
  lang: Lang;
  /** ISO date (YYYY-MM-DD) of the real exam, if the learner set one. */
  examDate?: string;
  createdAt: number;
  /** true for palaces shipped with the app (they still work when the AI is unavailable). */
  builtin?: boolean;
  notions: Notion[];
}

/** Maximum notions per palace — more saturates a bedroom. */
export const MAX_NOTIONS = 20;

// ─────────────────────────────────────────────────────────────────────────────
// Spaced repetition
// ─────────────────────────────────────────────────────────────────────────────

export type Grade = 'again' | 'hard' | 'good' | 'easy';

/** How the learner answered, for analytics and tier logic. */
export type AnswerMode = 'voice' | 'bubble' | 'reveal';

export interface ReviewLog {
  at: number; // epoch ms
  grade: Grade;
  mode: AnswerMode;
}

export interface ReviewState {
  notionId: string;
  /** Epoch ms when the notion was placed in the room (first encoding). */
  placedAt: number;
  /** Epoch ms of the next due review. */
  due: number;
  /** Current interval in days (fractional allowed for same-day learning steps). */
  intervalDays: number;
  /** SM-2 style ease factor, 1.3 – 3.0. */
  ease: number;
  /** Consecutive correct answers since the last lapse. */
  streak: number;
  lapses: number;
  log: ReviewLog[];
}

/** Visible progression of a notion on its object. */
export type Tier = 'new' | 'fragile' | 'solid' | 'anchored';

// ─────────────────────────────────────────────────────────────────────────────
// Room understanding & placement
// ─────────────────────────────────────────────────────────────────────────────

/** Semantic labels exposed by Meta Scene / WebXR mesh+plane detection (lower-cased). */
export type SemanticLabel =
  | 'table'
  | 'couch'
  | 'bed'
  | 'lamp'
  | 'plant'
  | 'screen'
  | 'storage'
  | 'wall_art'
  | 'window_frame'
  | 'door_frame'
  | 'shelf'
  | 'chair'
  | 'wall_face'
  | 'floor'
  | 'ceiling'
  | 'other'
  | 'manual'; // anchor placed by hand on a wall (fallback for sparse rooms)

/** A physical object of the room, expressed in the ROOM frame (see RoomModel). */
export interface Furniture {
  id: string;
  label: SemanticLabel;
  /** Centre of the oriented bounding box, room frame. */
  center: Vec3;
  /** Full extents along the object's local X, Y, Z. */
  size: Vec3;
  /** Rotation about world Y, radians. */
  yaw: number;
  /** Human name shown in debug/phone views, e.g. "Desk", "Lamp". */
  name: string;
}

/**
 * The learner's room. Its frame is the reference space of the first session;
 * later sessions compute a rigid transform (registration) from matched furniture.
 */
export interface RoomModel {
  id: string;
  createdAt: number;
  updatedAt: number;
  furniture: Furniture[];
  /** Where the learner sits (room frame): the route is ordered left→right from here. */
  seat: Vec3;
  /** Direction the learner faces when seated (yaw, radians). */
  seatYaw: number;
  /** Persistent WebXR anchor handle placed at the room origin (fallback registration). */
  anchorUuid?: string;
}

/** A notion placed on (or near) a piece of furniture. */
export interface Placement {
  notionId: string;
  furnitureId: string;
  /** Position of the scene in the furniture's local frame (so it follows the object on re-registration). */
  local: Vec3;
  /** Rank in the mental route (0 = first, left-most from the seat). */
  order: number;
  placedAt: number;
}

/** Persisted progress of one palace in one room. */
export interface PalaceProgress {
  palaceId: string;
  roomId: string;
  placements: Placement[];
  reviews: Record<string, ReviewState>;
  lastSessionAt?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Import pipeline (phone → server → headset)
// ─────────────────────────────────────────────────────────────────────────────

export type ImportKind = 'text' | 'image' | 'pdf';

export interface ExtractRequest {
  code: string;
  kind: ImportKind;
  /** Plain text for 'text'; base64 (no data: prefix) for 'image' and 'pdf'. */
  data: string;
  /** MIME type for image/pdf, e.g. image/jpeg, application/pdf. */
  mime?: string;
  /** Optional text already extracted client-side (PDF text layer), used by the offline fallback. */
  textHint?: string;
  title?: string;
}

export interface ExtractResponse {
  title: string;
  subject: string;
  lang: Lang;
  notions: Notion[];
  /** 'ai' when Claude produced the notions, 'offline' when the heuristic fallback did. */
  engine: 'ai' | 'offline';
  warnings?: string[];
}

export type PairStatus = 'waiting' | 'importing' | 'ready' | 'consumed';

export interface PairRecord {
  code: string;
  /** Secret known only by the headset, required to download the palace. */
  secret: string;
  status: PairStatus;
  createdAt: number;
  palace?: Palace;
}
