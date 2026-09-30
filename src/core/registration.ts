/**
 * Rigid room registration: finds the transform mapping the saved ROOM frame onto the current
 * SESSION frame from furniture boxes detected in both (Meta Scene / WebXR mesh detection).
 *
 * The transform is a rotation about +Y (yaw, counter-clockwise seen from above — see route.ts
 * for the conventions) followed by a translation in XZ. Y is untouched (both frames are floor-
 * aligned by WebXR `local-floor`).
 *
 *     session = R(yaw) · room + (tx, 0, tz)
 *
 * ## Algorithm
 * 1. **Correspondence candidates** — only same-label boxes whose sizes agree, directly or with X/Z
 *    swapped (a box rotated by 90° reports swapped extents; 180° is indistinguishable).
 * 2. **Hypotheses** (RANSAC-style, deterministic):
 *    - single match: the box yaw difference (+ the 2 or 4 admissible quarter-turn ambiguities)
 *      and its centre;
 *    - pair of matches: the rotation of the segment between the two centres (robust to box yaw
 *      noise), when the segment lengths agree. Exhaustive when small, seeded sampling otherwise.
 * 3. **Scoring** — transform every saved box, greedily pair it one-to-one with the nearest
 *    compatible current box (centre distance < 0.25 m, similar size, consistent orientation).
 *    More inliers wins; ties go to the lower squared error, then to the smaller rotation.
 * 4. **Refinement** — least squares (2-D Procrustes) on the inliers' centres, or the circular mean
 *    of the box yaws when the inliers are too close together, iterated with re-scoring.
 * 5. **Confidence** in [0, 1] from coverage, support, residual and ambiguity (a runner-up
 *    hypothesis with the same support, e.g. the 180° flip of a single box, halves it).
 */
import type { Furniture, SemanticLabel, Vec3 } from './types';
import { rotateY } from './route';
import { seededRandom, randInt } from './ids';

export interface RigidTransform {
  /** Rotation about +Y, radians, in (−π, π]. */
  yaw: number;
  tx: number;
  tz: number;
}

export interface Registration extends RigidTransform {
  /** Number of saved boxes matched to a current box under the transform. */
  inliers: number;
  /** RMS horizontal centre residual of the inliers, metres. */
  rmsError: number;
  /** 0 (guess) … 1 (certain). The app should fall back to a persistent anchor below ~0.3. */
  confidence: number;
  /** The one-to-one matches (saved id → current id) supporting the transform. */
  matches: Array<{ saved: string; current: string }>;
}

export interface RegisterOpts {
  /** Maximum centre distance for an inlier, metres (default 0.25). */
  inlierDist?: number;
  /** Cap on pair hypotheses; above it they are sampled deterministically (default 3000). */
  maxPairHypotheses?: number;
}

export const IDENTITY: Readonly<RigidTransform> = Object.freeze({ yaw: 0, tx: 0, tz: 0 });

const TWO_PI = Math.PI * 2;

/** Wraps an angle into (−π, π]. */
export function wrapAngle(a: number): number {
  let x = ((a + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;
  if (x <= -Math.PI) x += TWO_PI;
  return x;
}

/** Sum of two yaws, wrapped into (−π, π]. */
export function composeYaw(a: number, b: number): number {
  return wrapAngle(a + b);
}

/** Applies a transform to a point (Y unchanged). */
export function applyTransform(t: RigidTransform, p: Vec3): Vec3 {
  const r = rotateY(p, t.yaw);
  return [r[0] + t.tx, r[1], r[2] + t.tz];
}

/** Inverse transform (SESSION → ROOM when given ROOM → SESSION). */
export function invert(t: RigidTransform): RigidTransform {
  const r = rotateY([t.tx, 0, t.tz], -t.yaw);
  return { yaw: wrapAngle(-t.yaw), tx: -r[0], tz: -r[2] };
}

/** `a ∘ b`: applies `b` first, then `a`. */
export function compose(a: RigidTransform, b: RigidTransform): RigidTransform {
  const r = rotateY([b.tx, 0, b.tz], a.yaw);
  return { yaw: composeYaw(a.yaw, b.yaw), tx: r[0] + a.tx, tz: r[2] + a.tz };
}

/** A furniture box moved by a transform (centre transformed, yaw composed). */
export function transformFurniture(t: RigidTransform, f: Furniture): Furniture {
  return { ...f, center: applyTransform(t, f.center), yaw: composeYaw(f.yaw, t.yaw) };
}

// ─────────────────────────────────────────────────────────────────────────────

/** Labels that cannot be re-detected by the headset, hence useless for registration. */
const UNMATCHABLE: ReadonlySet<SemanticLabel> = new Set<SemanticLabel>(['manual']);

interface Compat {
  direct: boolean;
  swapped: boolean;
}

const sizeTol = (a: number, b: number) => Math.max(0.1, 0.2 * Math.max(Math.abs(a), Math.abs(b)));
const near = (a: number, b: number) => Math.abs(a - b) <= sizeTol(a, b);

function sizeCompat(a: Furniture, b: Furniture): Compat {
  if (!near(a.size[1], b.size[1])) return { direct: false, swapped: false };
  return {
    direct: near(a.size[0], b.size[0]) && near(a.size[2], b.size[2]),
    swapped: near(a.size[0], b.size[2]) && near(a.size[2], b.size[0]),
  };
}

/** Quarter-turn offsets that map box `a`'s yaw onto box `b`'s for a given size compatibility. */
function yawOffsets(c: Compat): number[] {
  const out: number[] = [];
  if (c.direct) out.push(0, Math.PI);
  if (c.swapped) out.push(Math.PI / 2, -Math.PI / 2);
  return out;
}

const isFiniteVec = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && Number.isFinite(x));
const usable = (f: Furniture) => !!f && !UNMATCHABLE.has(f.label) && isFiniteVec(f.center) && isFiniteVec(f.size) && Number.isFinite(f.yaw);

interface Candidate {
  i: number;
  j: number;
  compat: Compat;
}

interface Scored {
  t: RigidTransform;
  pairs: Array<[number, number]>;
  cost: number;
}

/** Circular angular distance. */
const angDist = (a: number, b: number) => Math.abs(wrapAngle(a - b));
const ORIENT_TOL = (25 * Math.PI) / 180;
/** Footprints this close to square carry no usable yaw information. */
const SQUARE_EPS = 0.08;

/**
 * Registers the current session against a saved room. Returns null when nothing can be matched
 * (no furniture, or no label in common with compatible sizes).
 */
export function registerRoom(saved: Furniture[], current: Furniture[], opts: RegisterOpts = {}): Registration | null {
  const inlierDist = opts.inlierDist ?? 0.25;
  const maxPairs = opts.maxPairHypotheses ?? 3000;
  const S = (saved ?? []).filter(usable);
  const C = (current ?? []).filter(usable);
  if (S.length === 0 || C.length === 0) return null;

  // Compatibility table (same label, similar size).
  const compat: Array<Array<Compat | null>> = S.map((s) =>
    C.map((c) => {
      if (s.label !== c.label) return null;
      const k = sizeCompat(s, c);
      return k.direct || k.swapped ? k : null;
    }),
  );
  const cands: Candidate[] = [];
  S.forEach((_, i) => C.forEach((_, j) => compat[i][j] && cands.push({ i, j, compat: compat[i][j] as Compat })));
  if (cands.length === 0) return null;

  const score = (t: RigidTransform): Scored => {
    const edges: Array<{ i: number; j: number; d2: number }> = [];
    for (let i = 0; i < S.length; i++) {
      const s = S[i];
      const p = applyTransform(t, s.center);
      const yawT = s.yaw + t.yaw;
      for (let j = 0; j < C.length; j++) {
        const k = compat[i][j];
        if (!k) continue;
        const c = C[j];
        const dx = p[0] - c.center[0];
        const dz = p[2] - c.center[2];
        const d2 = dx * dx + dz * dz;
        if (d2 > inlierDist * inlierDist || Math.abs(p[1] - c.center[1]) > 0.3) continue;
        if (!orientationOk(s, c, k, yawT)) continue;
        edges.push({ i, j, d2 });
      }
    }
    edges.sort((a, b) => a.d2 - b.d2 || a.i - b.i || a.j - b.j);
    const usedS = new Set<number>();
    const usedC = new Set<number>();
    const pairs: Array<[number, number]> = [];
    let cost = 0;
    for (const e of edges) {
      if (usedS.has(e.i) || usedC.has(e.j)) continue;
      usedS.add(e.i);
      usedC.add(e.j);
      pairs.push([e.i, e.j]);
      cost += e.d2;
    }
    return { t, pairs, cost };
  };

  // ── Hypotheses ────────────────────────────────────────────────────────────
  const hyps: RigidTransform[] = [];
  const fromYaw = (yaw: number, sc: Vec3, cc: Vec3): RigidTransform => {
    const r = rotateY(sc, yaw);
    return { yaw: wrapAngle(yaw), tx: cc[0] - r[0], tz: cc[2] - r[2] };
  };
  for (const { i, j, compat: k } of cands) {
    const s = S[i];
    const c = C[j];
    const offs = isSquare(s) ? [0, Math.PI / 2, Math.PI, -Math.PI / 2] : yawOffsets(k);
    for (const o of offs) hyps.push(fromYaw(c.yaw - s.yaw + o, s.center, c.center));
  }
  const pairHyps: RigidTransform[] = [];
  for (let a = 0; a < cands.length; a++) {
    for (let b = a + 1; b < cands.length; b++) {
      const A = cands[a];
      const B = cands[b];
      if (A.i === B.i || A.j === B.j) continue;
      const s1 = S[A.i].center;
      const s2 = S[B.i].center;
      const c1 = C[A.j].center;
      const c2 = C[B.j].center;
      const vsx = s2[0] - s1[0];
      const vsz = s2[2] - s1[2];
      const vcx = c2[0] - c1[0];
      const vcz = c2[2] - c1[2];
      const ls = Math.hypot(vsx, vsz);
      const lc = Math.hypot(vcx, vcz);
      if (ls < 0.3 || Math.abs(ls - lc) > inlierDist) continue;
      const yaw = Math.atan2(-vcz, vcx) - Math.atan2(-vsz, vsx);
      const ms: Vec3 = [(s1[0] + s2[0]) / 2, 0, (s1[2] + s2[2]) / 2];
      const mc: Vec3 = [(c1[0] + c2[0]) / 2, 0, (c1[2] + c2[2]) / 2];
      pairHyps.push(fromYaw(yaw, ms, mc));
    }
  }
  if (pairHyps.length > maxPairs) {
    const rand = seededRandom(pairHyps.length * 7919 + S.length * 31 + C.length);
    for (let n = 0; n < maxPairs; n++) hyps.push(pairHyps[randInt(rand, pairHyps.length)]);
  } else {
    hyps.push(...pairHyps);
  }

  // ── Score, keep the best few distinct hypotheses, refine them ────────────
  const better = (a: Scored, b: Scored) =>
    a.pairs.length !== b.pairs.length ? a.pairs.length > b.pairs.length : Math.abs(a.cost - b.cost) > 1e-9 ? a.cost < b.cost : Math.abs(a.t.yaw) < Math.abs(b.t.yaw);
  const scored = hyps.map(score).filter((h) => h.pairs.length > 0);
  if (scored.length === 0) return null;
  scored.sort((a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : 0));
  const top: Scored[] = [];
  for (const h of scored) {
    if (top.length >= 6) break;
    if (!top.some((x) => sameTransform(x.t, h.t))) top.push(h);
  }
  const refined = top.map((h) => {
    let cur = h;
    for (let it = 0; it < 4; it++) {
      const next = score(refine(cur, S, C, compat));
      if (!better(next, cur)) break;
      cur = next;
    }
    return cur;
  });
  refined.sort((a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : 0));
  const best = refined[0];
  const runnerUp = refined.find((h) => !sameTransform(h.t, best.t));

  const n = best.pairs.length;
  const rms = Math.sqrt(best.cost / n);
  const labelsS = new Set(S.map((f) => f.label));
  const matchable = Math.min(S.filter((f) => C.some((c) => c.label === f.label)).length, C.filter((c) => labelsS.has(c.label)).length);
  const coverage = Math.min(1, n / Math.max(1, matchable));
  const support = n >= 3 ? 1 : n === 2 ? 0.7 : 0.35;
  const precision = Math.max(0, 1 - rms / inlierDist);
  let confidence = Math.sqrt(coverage) * support * (0.5 + 0.5 * precision);
  if (runnerUp && runnerUp.pairs.length >= n) confidence *= 0.5;
  return {
    yaw: wrapAngle(best.t.yaw),
    tx: best.t.tx,
    tz: best.t.tz,
    inliers: n,
    rmsError: rms,
    confidence: Math.max(0, Math.min(1, confidence)),
    matches: best.pairs.map(([i, j]) => ({ saved: S[i].id, current: C[j].id })),
  };
}

function isSquare(f: Furniture): boolean {
  return Math.abs(f.size[0] - f.size[2]) < SQUARE_EPS;
}

function orientationOk(s: Furniture, c: Furniture, k: Compat, yawT: number): boolean {
  if (isSquare(s) || isSquare(c)) return true;
  return yawOffsets(k).some((o) => angDist(yawT + o, c.yaw) <= ORIENT_TOL);
}

function sameTransform(a: RigidTransform, b: RigidTransform): boolean {
  return angDist(a.yaw, b.yaw) < 0.1 && Math.hypot(a.tx - b.tx, a.tz - b.tz) < 0.2;
}

/** Least-squares transform from a hypothesis' inlier pairs. */
function refine(h: Scored, S: Furniture[], C: Furniture[], compat: Array<Array<Compat | null>>): RigidTransform {
  const n = h.pairs.length;
  let msx = 0;
  let msz = 0;
  let mcx = 0;
  let mcz = 0;
  for (const [i, j] of h.pairs) {
    msx += S[i].center[0];
    msz += S[i].center[2];
    mcx += C[j].center[0];
    mcz += C[j].center[2];
  }
  msx /= n;
  msz /= n;
  mcx /= n;
  mcz /= n;
  let spread = 0;
  let sin = 0;
  let cos = 0;
  for (const [i, j] of h.pairs) {
    const xs = S[i].center[0] - msx;
    const zs = S[i].center[2] - msz;
    const xc = C[j].center[0] - mcx;
    const zc = C[j].center[2] - mcz;
    spread = Math.max(spread, Math.hypot(xs, zs));
    sin += xc * zs - zc * xs;
    cos += xc * xs + zc * zs;
  }
  let yaw: number;
  if (n >= 2 && spread >= 0.3) {
    yaw = Math.atan2(sin, cos);
  } else {
    // Circular mean of the box yaw differences, each resolved to the admissible offset nearest the hypothesis.
    let sx = 0;
    let sy = 0;
    for (const [i, j] of h.pairs) {
      const k = compat[i][j] as Compat;
      const offs = isSquare(S[i]) || isSquare(C[j]) ? [] : yawOffsets(k);
      if (offs.length === 0) continue;
      const base = C[j].yaw - S[i].yaw;
      let bestA = base + offs[0];
      for (const o of offs) if (angDist(base + o, h.t.yaw) < angDist(bestA, h.t.yaw)) bestA = base + o;
      sx += Math.cos(bestA);
      sy += Math.sin(bestA);
    }
    yaw = sx === 0 && sy === 0 ? h.t.yaw : Math.atan2(sy, sx);
  }
  const r = rotateY([msx, 0, msz], yaw);
  return { yaw: wrapAngle(yaw), tx: mcx - r[0], tz: mcz - r[2] };
}
