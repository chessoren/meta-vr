import * as THREE from 'three';
import { XR } from './context';
import { Hands, type HandState } from './hands';

/**
 * Gaze + pinch targeting. The pointer is the eye-gaze ray when available (VR Glasses,
 * Quest Pro), else the head ray (Quest 2/3). Candidates are scored by angular distance,
 * which is far more forgiving than a thin raycast and needs no outstretched arm.
 * Near UI (bubbles, buttons) can also be pinched directly with the fingertips.
 */
export interface Target {
  id: string;
  kind: string;
  enabled: () => boolean;
  /** World centre used for angular scoring. */
  center: (out: THREE.Vector3) => THREE.Vector3;
  /** Angular tolerance radius in metres at the target (≈ its visual radius). */
  radius: number;
  /** Higher wins when angular scores are close (UI > scenes > furniture). */
  priority?: number;
  /** Optional precise test; return distance along the ray or null. Overrides angular scoring for acceptance. */
  hit?: (origin: THREE.Vector3, dir: THREE.Vector3) => number | null;
  /** Direct-touch radius around center for fingertip pinch (0 = no direct touch). */
  touchRadius?: number;
}

export interface Pointer {
  origin: THREE.Vector3;
  dir: THREE.Vector3;
  source: 'eye' | 'head';
}

export const pointer: Pointer = { origin: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, -1), source: 'head' };

const targets = new Map<string, Target>();
let hovered: Target | null = null;
let hoverTime = 0;
const _c = new THREE.Vector3();
const _to = new THREE.Vector3();

export function addTarget(t: Target) {
  targets.set(t.id, t);
  return () => removeTarget(t.id);
}
export function removeTarget(id: string) {
  targets.delete(id);
  if (hovered?.id === id) hovered = null;
}
export function clearTargets(kind?: string) {
  for (const [id, t] of targets) if (!kind || t.kind === kind) targets.delete(id);
  if (hovered && !targets.has(hovered.id)) hovered = null;
}
export function getHovered() {
  return hovered;
}
export function getHoverTime() {
  return hoverTime;
}

/** Angular score in radians (≤ 0 means the pointer is inside the target's radius). */
function score(t: Target): number {
  t.center(_c);
  _to.copy(_c).sub(pointer.origin);
  const dist = _to.length();
  if (dist < 1e-4) return -1;
  const ang = pointer.dir.angleTo(_to.divideScalar(dist));
  const tol = Math.atan2(t.radius, dist);
  return ang - tol;
}

/** Update the pointer + hovered target. Call once per frame. */
export function updateTargeting(dt: number) {
  if (XR.eye.valid) {
    pointer.origin.copy(XR.eye.origin);
    pointer.dir.copy(XR.eye.dir);
    pointer.source = 'eye';
  } else {
    pointer.origin.copy(XR.head.pos);
    pointer.dir.copy(XR.head.forward);
    pointer.source = 'head';
  }
  // Priority first (UI > items > furniture), then angular score. A precise hit counts as
  // "inside" (slightly negative score, nearer hits first) but never outranks higher-priority UI.
  let best: Target | null = null;
  let bestScore = Infinity;
  let bestPri = -Infinity;
  const slack = pointer.source === 'eye' ? 0.05 : 0.035; // ~2–3° grace
  for (const t of targets.values()) {
    if (!t.enabled()) continue;
    let s: number;
    if (t.hit) {
      const d = t.hit(pointer.origin, pointer.dir);
      s = d === null ? score(t) + 0.02 : -0.02 + Math.min(d, 10) * 0.001;
    } else s = score(t);
    if (s >= slack) continue;
    const pri = t.priority ?? 0;
    if (pri > bestPri || (pri === bestPri && s < bestScore)) {
      bestPri = pri;
      bestScore = s;
      best = t;
    }
  }
  if (best?.id !== hovered?.id) hoverTime = 0;
  else hoverTime += dt;
  hovered = best;
}

/** Target touched directly by a fingertip pinch point, if any. */
export function touchedBy(hand: HandState): Target | null {
  let best: Target | null = null;
  let bestD = Infinity;
  for (const t of targets.values()) {
    if (!t.enabled() || !t.touchRadius) continue;
    const d = t.center(_c).distanceTo(hand.pinchPoint);
    if (d < t.touchRadius && d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}

/**
 * The target a pinch that STARTED this frame selects: direct touch first, else the gazed target.
 * Returns the hand too, so callers can grab with it.
 */
let pinchBlocked = false;
/** While a modal UI (the palm menu) is open, flows must not consume pinches. */
export function setPinchBlocked(b: boolean) {
  pinchBlocked = b;
}

export function pinchSelection(): { target: Target | null; hand: HandState } | null {
  if (pinchBlocked) return null;
  for (const hand of [Hands.right, Hands.left]) {
    if (!hand.pinchStarted) continue;
    return { target: touchedBy(hand) ?? hovered, hand };
  }
  return null;
}

/** Debug: current targets and hover (tests). */
export function debugTargets() {
  return { hovered: hovered?.id ?? null, blocked: pinchBlocked, targets: [...targets.values()].filter((t) => t.enabled()).map((t) => `${t.kind}:${t.id}`) };
}
