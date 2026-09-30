/** Strict input validation for the import API. Every function rebuilds clean objects (unknown fields dropped). */
import type { ImportKind, Lang, Notion, Palace, SceneActor, SceneRecipe } from '../src/core/types';
import { MAX_NOTIONS } from '../src/core/types';
import { HttpError } from './http';
import { LIMITS, type ExtractRequestIn } from './api-types';
import { isAnim, isModel, isTextModel } from './catalog';

const fail = (path: string, msg: string): never => {
  throw new HttpError(400, `${path}: ${msg}`, { field: path });
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Collapse whitespace, strip control characters. */
export function cleanText(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
}

function str(v: unknown, path: string, max: number, opts: { min?: number; optional?: boolean } = {}): string {
  if (v === undefined || v === null || v === '') {
    if (opts.optional) return '';
    return fail(path, 'required');
  }
  if (typeof v !== 'string') return fail(path, 'must be a string');
  const s = cleanText(v);
  if (s.length < (opts.min ?? 1)) return opts.optional ? '' : fail(path, 'required');
  if (s.length > max) return fail(path, `too long (max ${max} characters)`);
  return s;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const CODE = /^[A-Z]{4}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Upper-cases and checks a 4-letter pairing code; returns null if malformed. */
export function normalizeCode(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const c = v.trim().toUpperCase();
  return CODE.test(c) ? c : null;
}

export function requireCode(v: unknown, path = 'code'): string {
  const c = normalizeCode(v);
  if (!c) fail(path, 'must be 4 letters');
  return c as string;
}

export function isValidIsoDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// ─── scenes ──────────────────────────────────────────────────────────────────

const ROLES = new Set<SceneActor['role']>(['hero', 'prop', 'count']);

export function validateActor(v: unknown, path: string): SceneActor {
  if (!isObj(v)) return fail(path, 'must be an object');
  if (!isModel(v.model)) return fail(`${path}.model`, `unknown model "${String(v.model)}"`);
  if (typeof v.role !== 'string' || !ROLES.has(v.role as SceneActor['role'])) return fail(`${path}.role`, 'must be hero, prop or count');
  if (!isAnim(v.anim)) return fail(`${path}.anim`, `unknown animation "${String(v.anim)}"`);
  const a: SceneActor = { model: v.model, role: v.role as SceneActor['role'], anim: v.anim };
  if (v.count !== undefined) {
    if (!Number.isInteger(v.count) || (v.count as number) < 1 || (v.count as number) > 12) fail(`${path}.count`, 'must be an integer 1–12');
    a.count = v.count as number;
  }
  if (v.scale !== undefined) {
    if (typeof v.scale !== 'number' || !Number.isFinite(v.scale) || v.scale < 0.2 || v.scale > 3) fail(`${path}.scale`, 'must be 0.2–3');
    a.scale = v.scale as number;
  }
  if (v.tint !== undefined) {
    if (typeof v.tint !== 'string' || !HEX.test(v.tint)) fail(`${path}.tint`, 'must be #rrggbb');
    a.tint = v.tint as string;
  }
  if (v.label !== undefined && v.label !== '') {
    const label = str(v.label, `${path}.label`, LIMITS.labelChars);
    if (!isTextModel(a.model)) fail(`${path}.label`, `model "${a.model}" cannot carry a label`);
    a.label = label;
  }
  return a;
}

export function validateScene(v: unknown, path: string): SceneRecipe {
  if (!isObj(v)) return fail(path, 'must be an object');
  if (!Array.isArray(v.actors) || v.actors.length < 1 || v.actors.length > 3) return fail(`${path}.actors`, 'must have 1–3 actors');
  const actors = v.actors.map((a, i) => validateActor(a, `${path}.actors[${i}]`));
  const scene: SceneRecipe = { actors, caption: str(v.caption, `${path}.caption`, LIMITS.captionChars) };
  if (v.hooks !== undefined) {
    if (!Array.isArray(v.hooks) || v.hooks.length > 6) fail(`${path}.hooks`, 'must be an array of at most 6 words');
    scene.hooks = (v.hooks as unknown[]).map((h, i) => str(h, `${path}.hooks[${i}]`, 40));
  }
  if (v.accent !== undefined) {
    if (typeof v.accent !== 'string' || !HEX.test(v.accent)) fail(`${path}.accent`, 'must be #rrggbb');
    scene.accent = v.accent as string;
  }
  return scene;
}

// ─── notions & palace ────────────────────────────────────────────────────────

const ID = /^[A-Za-z0-9_-]{1,64}$/;

export function validateNotion(v: unknown, path: string): Notion {
  if (!isObj(v)) return fail(path, 'must be an object');
  if (typeof v.id !== 'string' || !ID.test(v.id)) return fail(`${path}.id`, 'must be 1–64 characters [A-Za-z0-9_-]');
  const question = str(v.question, `${path}.question`, LIMITS.questionChars, { min: 3 });
  const answer = str(v.answer, `${path}.answer`, LIMITS.answerChars);
  let accept: string[] | undefined;
  if (v.accept !== undefined) {
    if (!Array.isArray(v.accept) || v.accept.length > 8) fail(`${path}.accept`, 'must be an array of at most 8 strings');
    accept = (v.accept as unknown[]).map((s, i) => str(s, `${path}.accept[${i}]`, LIMITS.answerChars));
  }
  if (!Array.isArray(v.distractors) || v.distractors.length !== 2) return fail(`${path}.distractors`, 'must be exactly 2 strings');
  const d0 = str(v.distractors[0], `${path}.distractors[0]`, LIMITS.answerChars);
  const d1 = str(v.distractors[1], `${path}.distractors[1]`, LIMITS.answerChars);
  const low = (s: string) => s.toLocaleLowerCase();
  if (low(d0) === low(d1) || low(d0) === low(answer) || low(d1) === low(answer))
    fail(`${path}.distractors`, 'must differ from each other and from the answer');
  const n: Notion = { id: v.id, question, answer, distractors: [d0, d1], scene: validateScene(v.scene, `${path}.scene`) };
  if (accept && accept.length) n.accept = accept;
  return n;
}

export function validatePalace(v: unknown, opts: { now: number; newId: () => string }): Palace {
  if (!isObj(v)) return fail('palace', 'must be an object');
  const title = str(v.title, 'palace.title', LIMITS.titleChars);
  const subject = str(v.subject, 'palace.subject', LIMITS.subjectChars);
  if (v.lang !== 'en' && v.lang !== 'fr') return fail('palace.lang', 'must be "en" or "fr"');
  if (!Array.isArray(v.notions) || v.notions.length < 1) return fail('palace.notions', 'at least one notion is required');
  if (v.notions.length > MAX_NOTIONS) return fail('palace.notions', `at most ${MAX_NOTIONS} notions`);
  const notions = v.notions.map((n, i) => validateNotion(n, `palace.notions[${i}]`));
  const ids = new Set<string>();
  notions.forEach((n, i) => {
    if (ids.has(n.id)) fail(`palace.notions[${i}].id`, 'duplicate id');
    ids.add(n.id);
  });
  const palace: Palace = {
    id: typeof v.id === 'string' && ID.test(v.id) ? v.id : opts.newId(),
    title,
    subject,
    lang: v.lang as Lang,
    createdAt: opts.now,
    notions,
  };
  if (v.examDate !== undefined && v.examDate !== null && v.examDate !== '') {
    if (typeof v.examDate !== 'string' || !isValidIsoDate(v.examDate)) fail('palace.examDate', 'must be YYYY-MM-DD');
    palace.examDate = v.examDate as string;
  }
  return palace;
}

// ─── extract request ─────────────────────────────────────────────────────────

const KINDS = new Set<ImportKind>(['text', 'image', 'pdf']);
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

function b64(v: unknown, path: string, max: number): string {
  if (typeof v !== 'string' || !v) return fail(path, 'required');
  const s = v.startsWith('data:') ? v.slice(v.indexOf(',') + 1) : v;
  if (s.length > max) throw new HttpError(413, `${path}: file too large (max ${Math.round((max * 0.75) / 1024 / 1024)} MB)`, { field: path });
  if (s.length % 4 !== 0 || !B64.test(s)) return fail(path, 'must be base64');
  return s;
}

function longText(v: unknown, path: string): string {
  if (typeof v !== 'string') return fail(path, 'must be a string');
  if (v.length > LIMITS.textChars) throw new HttpError(413, `${path}: text too long (max ${LIMITS.textChars} characters)`, { field: path });
  // keep line breaks (they carry structure), strip control characters
  // eslint-disable-next-line no-control-regex
  return v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
}

export function validateExtract(v: unknown): ExtractRequestIn {
  if (!isObj(v)) return fail('body', 'must be an object');
  const code = requireCode(v.code);
  if (typeof v.kind !== 'string' || !KINDS.has(v.kind as ImportKind)) return fail('kind', 'must be text, image or pdf');
  const kind = v.kind as ImportKind;
  const out: ExtractRequestIn = { code, kind, data: '' };
  if (v.offline === true) out.offline = true;
  if (v.title !== undefined && v.title !== null && v.title !== '') out.title = str(v.title, 'title', LIMITS.titleChars);
  if (v.textHint !== undefined && v.textHint !== null && v.textHint !== '') {
    // text layers of long PDFs are truncated rather than refused (the AI reads the PDF itself)
    out.textHint = longText(typeof v.textHint === 'string' ? v.textHint.slice(0, LIMITS.textChars) : v.textHint, 'textHint');
  }
  if (kind === 'text') {
    out.data = longText(v.data, 'data');
    if (out.data.trim().length < 10) fail('data', 'paste at least a few lines of your course');
    return out;
  }
  if (kind === 'pdf') {
    if (v.mime !== undefined && v.mime !== 'application/pdf') fail('mime', 'must be application/pdf');
    out.mime = 'application/pdf';
    out.data = b64(v.data, 'data', LIMITS.pdfB64);
    return out;
  }
  // image
  if (typeof v.mime !== 'string' || !IMAGE_MIMES.has(v.mime)) return fail('mime', 'must be image/jpeg, image/png, image/webp or image/gif');
  out.mime = v.mime;
  out.data = b64(v.data, 'data', LIMITS.imageB64);
  if (v.more !== undefined) {
    if (!Array.isArray(v.more) || v.more.length > LIMITS.images - 1) fail('more', `at most ${LIMITS.images} photos per import`);
    out.more = (v.more as unknown[]).map((m, i) => b64(m, `more[${i}]`, LIMITS.imageB64));
  }
  const total = out.data.length + (out.more ?? []).reduce((s, m) => s + m.length, 0);
  if (total > LIMITS.totalB64) throw new HttpError(413, 'photos too large in total — send fewer pages at once', { field: 'more' });
  return out;
}
