/** Post-validation & repair of mnemonic scenes; offline composition via core/mnemonic. */
import type { AnimId, SceneActor, SceneRecipe } from '../src/core/types';
import { composeScene } from '../src/core/mnemonic';
import { isAnim, isModel, isTextModel, modelEntry } from './catalog';
import { LIMITS } from './api-types';

const HEX = /^#[0-9a-fA-F]{6}$/;
const ROLES = new Set(['hero', 'prop', 'count']);

const clampStr = (s: unknown, max: number) =>
  typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max).trim() : '';

/** Hook words = explicit hooks present in the caption, else the ALL-CAPS words of the caption. */
export function hooksFor(caption: string, hooks?: unknown): string[] {
  const words = new Set((caption.match(/[\p{L}\p{N}'’-]+/gu) ?? []).map((w) => w.toLocaleLowerCase()));
  const given = Array.isArray(hooks)
    ? hooks
        .filter((h): h is string => typeof h === 'string')
        .map((h) => h.trim())
        .filter((h) => h && h.length <= 40 && h.split(/\s+/).every((w) => words.has(w.toLocaleLowerCase().replace(/[^\p{L}\p{N}'’-]/gu, ''))))
    : [];
  const caps = caption.match(/\b[\p{Lu}\p{N}][\p{Lu}\p{N}'’-]{1,}\b/gu) ?? [];
  const out = [...new Set([...given, ...caps.filter((c) => /\p{L}/u.test(c) || /\d/.test(c))])];
  return out.slice(0, 6);
}

function fixActor(v: unknown, index: number): SceneActor | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  const model = typeof o.model === 'string' ? o.model.trim().toLowerCase() : '';
  if (!isModel(model)) return null;
  const role = (typeof o.role === 'string' && ROLES.has(o.role) ? o.role : index === 0 ? 'hero' : 'prop') as SceneActor['role'];
  const natural = modelEntry(model)?.anims?.find((a) => isAnim(a)) as AnimId | undefined;
  const anim: AnimId = isAnim(o.anim) ? o.anim : (natural ?? 'idle');
  const a: SceneActor = { model, role: index === 0 && role === 'count' ? 'count' : role, anim };
  if (role === 'count') {
    const c = typeof o.count === 'number' && Number.isFinite(o.count) ? Math.round(o.count) : 3;
    a.count = Math.min(12, Math.max(1, c));
  }
  if (typeof o.scale === 'number' && Number.isFinite(o.scale) && o.scale !== 1) a.scale = Math.min(3, Math.max(0.2, o.scale));
  if (typeof o.tint === 'string' && HEX.test(o.tint)) a.tint = o.tint;
  const label = clampStr(o.label, LIMITS.labelChars);
  if (label && isTextModel(model)) a.label = label;
  return a;
}

export interface RepairResult {
  scene: SceneRecipe;
  /** 'ok' kept as is (modulo trimming), 'patched' some actors/fields fixed, 'composed' replaced by the offline composer. */
  status: 'ok' | 'patched' | 'composed';
}

/** Validate an AI scene against the catalog; unknown ids → dropped, and if the hero is lost → composeScene fallback. */
export function repairScene(raw: unknown, question: string, answer: string, avoid?: string[]): RepairResult {
  const compose = (): RepairResult => ({ scene: safeCompose(question, answer, avoid), status: 'composed' });
  if (typeof raw !== 'object' || raw === null) return compose();
  const o = raw as Record<string, unknown>;
  const rawActors = Array.isArray(o.actors) ? o.actors.slice(0, 3) : [];
  const actors = rawActors.map((a, i) => fixActor(a, i));
  if (!actors[0]) return compose();
  const kept = actors.filter((a): a is SceneActor => !!a);
  // a label on a non-text model is silently dropped by fixActor: keep the number/word by adding a sign
  let patched = kept.length !== rawActors.length;
  const lostLabel = rawActors.some((a, i) => {
    const l = (a as Record<string, unknown> | null)?.label;
    return typeof l === 'string' && l.trim() && !actors[i]?.label;
  });
  if (lostLabel && kept.length < 3 && !kept.some((a) => a.label) && isModel('sign')) {
    const l = rawActors.map((a) => (a as Record<string, unknown> | null)?.label).find((x) => typeof x === 'string' && x.trim()) as string;
    kept.push({ model: 'sign', role: 'prop', anim: 'idle', label: l.trim().slice(0, LIMITS.labelChars) });
    patched = true;
  }
  let caption = clampStr(o.caption, LIMITS.captionChars);
  if (!caption) {
    caption = safeCompose(question, answer).caption;
    patched = true;
  }
  const scene: SceneRecipe = { actors: kept, caption, hooks: hooksFor(caption, o.hooks) };
  if (typeof o.accent === 'string' && HEX.test(o.accent)) scene.accent = o.accent;
  return { scene, status: patched ? 'patched' : 'ok' };
}

/** composeScene, guarded so a bug there can never break an import. */
export function safeCompose(question: string, answer: string, avoid?: string[]): SceneRecipe {
  try {
    const s = composeScene(question, answer, avoid?.length ? { avoid } : {});
    if (s && Array.isArray(s.actors) && s.actors.length && s.actors.every((a) => isModel(a.model))) {
      return { ...s, caption: s.caption.slice(0, LIMITS.captionChars), hooks: hooksFor(s.caption, s.hooks) };
    }
  } catch (e) {
    console.warn('[loci] composeScene failed', e);
  }
  const fallback = isModel('book') ? 'book' : (modelEntry('scroll')?.id ?? 'book');
  const label = answer.slice(0, LIMITS.labelChars);
  return {
    actors: [{ model: fallback, role: 'hero', anim: 'bounce', ...(isTextModel(fallback) ? { label } : {}) }],
    caption: `A giant BOOK shouting "${label.toUpperCase()}"`,
    hooks: ['BOOK'],
  };
}
