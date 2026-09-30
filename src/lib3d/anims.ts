/**
 * Procedural animation for library actors.
 *
 *   applyAnim(actorRoot, anim, t, k, ctx)
 *
 * drives the ROOT transform (hop, spin, orbit, flip…) relative to a base pose captured on the
 * first call (or set explicitly with `initAnim`), plus SECONDARY motion on the named joints of
 * spec.ts (wings flap, legs swing, arms wave, head bobs, tail wags, `spin` joints turn, `flame`
 * joints flicker). Joints are reset to their rest pose every frame, so a model's own `idle`
 * (called after applyAnim) may simply ADD to joint rotations.
 *
 * k is the intensity: 1 = normal, 2 = the exaggerated replay after a wrong answer (bigger,
 * faster, sillier: extra spins and squash). Amplitudes are relative to the actor's height and to
 * the scene size, so everything stays inside the scene cube (compose.ts also fits the envelope).
 *
 * Zero allocations per frame: the per-actor state (base pose, joint list) lives in
 * `actorRoot.userData.anim`, created once.
 */
import * as THREE from 'three';
import type { AnimId } from '../core/types';
import type { ModelSpec } from './spec';

export const ANIM_IDS: AnimId[] = ['idle', 'bounce', 'spin', 'wobble', 'orbit', 'juggle', 'float', 'shake', 'grow', 'march', 'fly', 'rain', 'stack', 'flip', 'dance'];

export interface AnimCtx {
  /** Index of this copy among `count` copies (0 for a single actor). */
  index: number;
  count: number;
  /** Cycle offset in [0, 1) so actors/copies don't move in lockstep. */
  phase: number;
  spec?: ModelSpec;
}

type JointKind = 'head' | 'tail' | 'wing' | 'arm' | 'legBi' | 'legF' | 'legB' | 'spin' | 'lid' | 'hand' | 'flame';

interface JointRec {
  o: THREE.Object3D;
  kind: JointKind;
  /** +1 = the model's left (+X), −1 = right. For quadruped legs: diagonal pairing sign. */
  side: number;
  rx: number; ry: number; rz: number;
  px: number; py: number; pz: number;
  sx: number; sy: number; sz: number;
  axis: 'x' | 'y' | 'z';
  n: number;
}

export interface AnimState {
  bx: number; by: number; bz: number;
  brx: number; bry: number; brz: number;
  bs: number;
  /** Actor height and footprint in PARENT units (at base scale). */
  h: number; w: number; d: number;
  /** Scene size in parent units (the cube edge). */
  size: number;
  /** Model forward yaw (0 = faces +Z). */
  faceYaw: number;
  /** Orbit / fly / juggle centre (parent units) and radius. */
  cx: number; cy: number; cz: number; radius: number;
  /** Juggle arc width & apex height; stack step height; rain drop height. */
  arcW: number; arcH: number; stackH: number; top: number;
  /** Hero juggler (arms toss) vs juggled object (flies along the arc). */
  juggler: boolean;
  joints: JointRec[];
}

export interface AnimInit {
  size?: number;
  /** Actor dimensions in its own (unscaled) units: [w, h, d]. */
  dim?: [number, number, number];
  faceYaw?: number;
  center?: [number, number, number];
  radius?: number;
  arcW?: number;
  arcH?: number;
  stackH?: number;
  top?: number;
  juggler?: boolean;
}

const KIND: Record<string, JointKind> = {
  head: 'head', tail: 'tail', wingL: 'wing', wingR: 'wing', armL: 'arm', armR: 'arm', legL: 'legBi', legR: 'legBi',
  legFL: 'legF', legFR: 'legF', legBL: 'legB', legBR: 'legB', spin: 'spin', lid: 'lid', hand: 'hand', flame: 'flame',
};

/** Collect named joints under `root`, not descending into nested actors (riders, hats). */
function collectJoints(root: THREE.Object3D, out: JointRec[]) {
  const counts: Record<string, number> = {};
  const visit = (o: THREE.Object3D) => {
    for (const c of o.children) {
      if (c.userData.lociActor) continue;
      const kind = KIND[c.name];
      if (kind) {
        const nm = c.name;
        let side = nm.endsWith('L') ? 1 : nm.endsWith('R') ? -1 : 0;
        if (side === 0 || Math.abs(c.position.x) > 1e-4) side = Math.sign(c.position.x) || side || 1;
        if (kind === 'legF' || kind === 'legB') side = (nm === 'legFL' || nm === 'legBR' ? 1 : -1);
        const n = (counts[kind] = (counts[kind] ?? 0) + 1) - 1;
        const ax = c.userData.axis;
        out.push({
          o: c, kind, side,
          rx: c.rotation.x, ry: c.rotation.y, rz: c.rotation.z,
          px: c.position.x, py: c.position.y, pz: c.position.z,
          sx: c.scale.x, sy: c.scale.y, sz: c.scale.z,
          axis: ax === 'x' || ax === 'y' ? ax : 'z',
          n,
        });
      }
      visit(c);
    }
  };
  visit(root);
}

/** Capture (or overwrite) the base pose & layout parameters of an actor. Allocates; call once. */
export function initAnim(root: THREE.Object3D, o: AnimInit = {}): AnimState {
  const s = root.scale.x;
  const size = o.size ?? 0.3;
  const dim = o.dim ?? (root.userData.dim as [number, number, number] | undefined) ?? [1, 1, 1];
  const st: AnimState = {
    bx: root.position.x, by: root.position.y, bz: root.position.z,
    brx: root.rotation.x, bry: root.rotation.y, brz: root.rotation.z,
    bs: s,
    w: dim[0] * s, h: dim[1] * s, d: dim[2] * s,
    size,
    faceYaw: o.faceYaw ?? (root.userData.faceYaw as number | undefined) ?? 0,
    cx: o.center?.[0] ?? 0, cy: o.center?.[1] ?? size * 0.45, cz: o.center?.[2] ?? 0,
    radius: o.radius ?? size * 0.33,
    arcW: o.arcW ?? size * 0.55, arcH: o.arcH ?? size * 0.3,
    stackH: o.stackH ?? dim[1] * s * 0.96,
    top: o.top ?? size,
    juggler: o.juggler ?? false,
    joints: [],
  };
  collectJoints(root, st.joints);
  root.userData.anim = st;
  return st;
}

/** Put every named joint back to its rest pose (e.g. before calling a model's idle in a viewer). */
export function resetJoints(root: THREE.Object3D) {
  const st = (root.userData.anim as AnimState | undefined) ?? initAnim(root);
  for (const j of st.joints) {
    j.o.rotation.set(j.rx, j.ry, j.rz);
    j.o.position.set(j.px, j.py, j.pz);
    j.o.scale.set(j.sx, j.sy, j.sz);
  }
}

// ─── scratch (module-level, reused every call → no allocations) ────────────
const M = {
  dx: 0, dy: 0, dz: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1,
  /** Absolute yaw override (orbit/fly face their direction); NaN = none. */
  yaw: NaN,
  /** Pivot for rotations about the actor's centre (flip), as a fraction of height. */
  flipX: 0,
  // secondary motion
  head: 0, headY: 0, headZ: 0, tail: 0, wing: 0, armZ: 0, armX: 0, armAlt: 0, leg: 0, lid: 0, spinK: 1, flick: 1,
};
function clearM() {
  M.dx = M.dy = M.dz = M.rx = M.ry = M.rz = 0;
  M.sx = M.sy = M.sz = 1;
  M.yaw = NaN;
  M.flipX = 0;
  M.head = M.headY = M.headZ = M.tail = M.wing = M.armZ = M.armX = M.armAlt = M.leg = M.lid = 0;
  M.spinK = 1;
  M.flick = 1;
}

const TAU = Math.PI * 2;
const frac = (x: number) => x - Math.floor(x);
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number) => { const c = clamp01(x); return c * c * (3 - 2 * c); };
/** Deterministic hash in [0, 1) for scattering copies. */
const hash = (i: number) => frac(Math.sin(i * 127.1 + 311.7) * 43758.5453);

/**
 * Animate one actor. `t` in seconds (absolute), `k` intensity (1 normal, 2 exaggerated).
 * The actor's base pose is captured on the first call unless `initAnim` was called.
 */
export function applyAnim(actorRoot: THREE.Object3D, anim: AnimId, t: number, k: number, ctx: AnimCtx) {
  const st = (actorRoot.userData.anim as AnimState | undefined) ?? initAnim(actorRoot);
  const A = 1 + 0.6 * (k - 1); // amplitude
  const sp = 1 + 0.35 * (k - 1); // speed
  const silly = clamp01(k - 1);
  const T = t * sp;
  const ph = ctx.phase;
  const h = st.h;
  clearM();

  switch (anim) {
    case 'bounce': {
      const p = frac(T / 0.9 + ph);
      if (p < 0.72) {
        const q = p / 0.72;
        M.dy = h * 0.36 * A * 4 * q * (1 - q);
        const str = 0.14 * A * (2 * q - 1) * (2 * q - 1);
        M.sy = 1 + str;
        M.sx = M.sz = 1 / Math.sqrt(M.sy);
        M.ry = silly * TAU * smooth(q);
        M.leg = -0.6 * A * Math.sin(Math.PI * q);
        M.armZ = 0.9 * A * Math.sin(Math.PI * q);
        M.wing = 0.7 * A * Math.sin(Math.PI * q * 3);
        M.tail = 0.35 * Math.sin(Math.PI * q);
        M.lid = 0.5 * A * Math.sin(Math.PI * q);
      } else {
        const q = (p - 0.72) / 0.28;
        const s = Math.sin(Math.PI * q);
        M.sy = 1 - 0.26 * A * s;
        M.sx = M.sz = 1 + 0.15 * A * s;
        M.head = 0.18 * s;
      }
      break;
    }
    case 'spin': {
      const a = T * (TAU / 1.6) + ph * TAU;
      M.ry = a * (1 + silly);
      M.dy = h * 0.03 * A * (0.5 + 0.5 * Math.sin(a * 2));
      M.rz = 0.06 * A * Math.sin(a);
      M.armZ = 0.9 * A;
      M.wing = 0.5 * A;
      M.headZ = -0.12 * Math.sin(a);
      M.spinK = 3;
      break;
    }
    case 'wobble': {
      const a = T * (TAU / 1.2) + ph * TAU;
      M.rz = 0.22 * A * Math.sin(a);
      M.rx = 0.05 * A * Math.sin(a * 2);
      M.sy = 1 + 0.03 * A * Math.sin(a * 2);
      M.headZ = -0.5 * M.rz;
      M.armZ = 0.3 + 0.3 * A * Math.sin(a + 1);
      M.tail = 0.4 * Math.sin(a);
      M.wing = 0.2 * Math.sin(a * 2);
      M.ry = silly * 0.6 * Math.sin(a * 0.5);
      break;
    }
    case 'orbit': {
      const a = T * (TAU / 4) + (ctx.count > 1 ? ctx.index / ctx.count : ph) * TAU;
      const R = st.radius;
      M.dx = st.cx + Math.cos(a) * R - st.bx;
      M.dz = st.cz + Math.sin(a) * R * 0.85 - st.bz;
      M.dy = h * 0.06 * Math.sin(a * 4);
      M.yaw = Math.atan2(-Math.sin(a), Math.cos(a) * 0.85) - st.faceYaw;
      M.rz = -0.12 * A;
      M.leg = 0.5 * Math.sin(T * 10);
      M.armX = 0.4 * Math.sin(T * 10);
      M.wing = 0.3 + 0.5 * Math.sin(T * 14);
      M.tail = 0.3 * Math.sin(T * 8);
      break;
    }
    case 'juggle': {
      if (st.juggler || (ctx.count <= 1 && !actorRoot.userData.juggled)) {
        // the juggler: rhythmic hop, alternating arms, head follows the balls
        const a = T * (TAU / 0.7) + ph * TAU;
        M.dy = h * 0.04 * A * Math.abs(Math.sin(a));
        M.armZ = 0.7;
        M.armAlt = 0.55 * A * Math.sin(a);
        M.headY = 0.3 * Math.sin(a * 0.5);
        M.head = -0.15;
        M.rz = 0.04 * A * Math.sin(a);
        M.wing = 0.4 * Math.sin(a);
      } else {
        const p = frac(T / 1.5 + ctx.index / Math.max(1, ctx.count) + (ctx.count > 1 ? 0 : ph));
        const w = st.arcW;
        let x: number;
        let y: number;
        if (p < 0.78) {
          const q = p / 0.78;
          x = -w / 2 + w * q;
          y = st.cy + st.arcH * A * 4 * q * (1 - q);
        } else {
          const q = (p - 0.78) / 0.22;
          x = w / 2 - w * q;
          y = st.cy - st.size * 0.03 * Math.sin(Math.PI * q);
        }
        M.dx = st.cx + x - st.bx;
        M.dy = y - st.by;
        M.dz = st.cz - st.bz;
        M.rz = -p * TAU * (1 + silly);
        M.rx = 0.4 * Math.sin(p * TAU);
      }
      break;
    }
    case 'float': {
      const a = T * (TAU / 3) + ph * TAU;
      M.dy = h * (0.1 + 0.12 * A * (0.5 + 0.5 * Math.sin(a)));
      M.dx = h * 0.05 * Math.sin(a * 0.6);
      M.dz = h * 0.04 * Math.sin(a * 0.7 + 1);
      M.rz = 0.08 * A * Math.sin(a * 0.8);
      M.rx = 0.05 * Math.sin(a * 0.9);
      M.ry = 0.2 * Math.sin(a * 0.43) + silly * a * 0.3;
      M.wing = 0.25 + 0.25 * Math.sin(a * 2);
      M.leg = 0.15 * Math.sin(a);
      M.armZ = 0.45;
      M.tail = 0.3 * Math.sin(a);
      break;
    }
    case 'shake': {
      const e = 0.6 + 0.4 * Math.sin(T * (TAU / 1.5) + ph * TAU) ** 2;
      const u = T * TAU;
      M.dx = h * 0.03 * A * e * (Math.sin(u * 9.3) + 0.5 * Math.sin(u * 14.1));
      M.dz = h * 0.02 * A * e * Math.sin(u * 11.7);
      M.rz = 0.07 * A * e * Math.sin(u * 12.9);
      M.sy = 1 + 0.025 * A * Math.sin(u * 17);
      M.headY = 0.15 * A * Math.sin(u * 13);
      M.armZ = 0.25 + 0.15 * A * Math.sin(u * 15);
      M.wing = 0.3 * Math.sin(u * 16);
      M.tail = 0.3 * Math.sin(u * 12);
      M.leg = 0.12 * Math.sin(u * 14);
      break;
    }
    case 'grow': {
      const p = frac(T / 1.8 + ph);
      // quick swell with overshoot, slow settle
      const up = p < 0.35 ? Math.sin((p / 0.35) * Math.PI * 0.5) : Math.cos(((p - 0.35) / 0.65) * Math.PI * 0.5);
      const wob = p < 0.45 ? Math.sin((p / 0.45) * Math.PI * 3) * 0.04 * (1 - p / 0.45) : 0;
      const s = 1 + (0.24 * A * up - 0.06) + wob;
      M.sx = M.sy = M.sz = s;
      M.armZ = 1.2 * up;
      M.wing = 0.8 * up;
      M.head = -0.2 * up;
      M.ry = silly * Math.sin(p * TAU) * 0.4;
      break;
    }
    case 'march': {
      const a = T * (TAU / 0.6) + ph * TAU;
      const s = Math.sin(a);
      M.dy = h * 0.035 * A * Math.abs(s);
      M.rz = 0.07 * A * s;
      M.ry = 0.1 * Math.sin(a * 0.5) + silly * 0.5 * Math.sin(a * 0.25);
      const c = 1 - Math.abs(s);
      M.sy = 1 - 0.05 * A * c * c * c * c;
      M.sx = M.sz = 1 + 0.025 * A * c * c * c * c;
      M.leg = 0.55 * A * s;
      M.armX = -0.5 * A * s;
      M.head = 0.08 * Math.sin(a * 2);
      M.tail = 0.3 * s;
      M.wing = 0.25 * Math.abs(s);
      break;
    }
    case 'fly': {
      const a = T * (TAU / 3.2) + (ctx.count > 1 ? ctx.index / ctx.count : ph) * TAU;
      const R = Math.min(st.radius, st.size * 0.3);
      M.dx = st.cx + Math.cos(a) * R - st.bx;
      M.dz = st.cz + Math.sin(a) * R * 0.6 - st.bz;
      M.dy = h * 0.2 + st.size * 0.04 * A + h * 0.05 * Math.sin(a * 2);
      M.yaw = Math.atan2(-Math.sin(a), Math.cos(a) * 0.6) - st.faceYaw;
      M.rz = -0.3 * A;
      M.rx = 0.1 * Math.sin(a);
      const f = T * (TAU / 0.35);
      M.wing = 0.15 + 0.75 * A * Math.sin(f);
      M.leg = 0.5;
      M.armZ = 1.3;
      M.tail = 0.2 * Math.sin(f * 0.5);
      M.head = -0.1;
      break;
    }
    case 'rain': {
      const p = frac(T / 1.3 + (ctx.count > 1 ? hash(ctx.index + 1) : ph));
      const top = Math.max(h * 0.5, st.top - st.by - h);
      let appear = 1;
      if (p < 0.8) {
        const q = p / 0.8;
        M.dy = top * (1 - q * q);
        M.ry = q * 3 + ctx.index;
        M.rz = 0.4 * Math.sin(q * 7 + ctx.index);
        appear = smooth(p / 0.08);
        M.sy = 1 + 0.12 * q;
        M.sx = M.sz = 1 / Math.sqrt(M.sy);
      } else {
        const q = (p - 0.8) / 0.2;
        const s = Math.sin(Math.PI * Math.min(1, q * 2));
        M.sy = 1 - 0.32 * A * s;
        M.sx = M.sz = 1 + 0.18 * A * s;
        appear = 1 - smooth((q - 0.55) / 0.45);
        M.ry = 3 + ctx.index;
      }
      M.sx *= appear;
      M.sy *= appear;
      M.sz *= appear;
      M.wing = 0.5 * Math.sin(T * 20);
      M.armZ = 1.2;
      break;
    }
    case 'stack': {
      const n = Math.max(1, ctx.count);
      const i = ctx.count > 1 ? ctx.index : 0;
      const step = 0.45;
      const T0 = step * n + 1.8;
      const tt = frac(T / T0 + (ctx.count > 1 ? 0 : ph)) * T0;
      const ti = step * i;
      const yi = i * st.stackH;
      const tc = step * n + 0.7;
      const drop = Math.max(h * 0.6, st.size * 0.2);
      if (tt < ti) {
        M.sx = M.sy = M.sz = 0.001;
      } else if (tt < ti + 0.3) {
        const q = (tt - ti) / 0.3;
        M.dy = yi + drop * (1 - q * q);
        M.sy = 1.1;
      } else if (tt < tc) {
        const q = Math.min(1, (tt - ti - 0.3) / 0.25);
        const s = Math.sin(Math.PI * q);
        M.dy = yi;
        M.sy = 1 - 0.18 * A * s;
        M.sx = M.sz = 1 + 0.1 * A * s;
        M.rz = 0.02 * A * Math.sin(tt * 9) * (i + 1) * 0.5;
        M.armZ = 0.8;
      } else {
        const e = Math.min(1, (tt - tc) / 0.9);
        const dir = i % 2 ? 1 : -1;
        M.dx = dir * (0.3 + i * 0.25) * st.size * 0.25 * e;
        M.rz = dir * e * (1.1 + 0.2 * silly);
        M.dy = Math.max(0, yi * (1 - e * e)) + st.w * 0.5 * Math.abs(Math.sin(M.rz));
        M.rx = 0.3 * e;
        const fade = 1 - smooth((tt - tc - 0.7) / 0.4);
        M.sx = M.sy = M.sz = Math.max(0.001, fade);
        M.armZ = 1.4 * e;
      }
      break;
    }
    case 'flip': {
      const p = frac(T / 1.4 + ph);
      const turns = 1 + (silly > 0.5 ? 1 : 0);
      if (p < 0.6) {
        const q = p / 0.6;
        M.dy = h * 0.55 * A * 4 * q * (1 - q);
        M.flipX = -TAU * turns * smooth(q);
        M.leg = -0.8 * Math.sin(Math.PI * q);
        M.armZ = 1.2 * Math.sin(Math.PI * q);
        M.wing = 0.8 * Math.sin(Math.PI * q);
        M.head = 0.3 * Math.sin(Math.PI * q);
      } else if (p < 0.8) {
        const q = (p - 0.6) / 0.2;
        const s = Math.sin(Math.PI * q);
        M.sy = 1 - 0.22 * A * s;
        M.sx = M.sz = 1 + 0.12 * A * s;
        M.armZ = 1.4 * s;
      } else {
        M.armZ = 1.2 * (1 - (p - 0.8) / 0.2);
      }
      break;
    }
    case 'dance': {
      const a = T * (TAU / 0.5) + ph * TAU;
      const b = a * 0.5;
      M.ry = 0.45 * A * Math.sin(b) + silly * frac(T / 2) * TAU * (Math.sin(b * 0.25) > 0.7 ? 1 : 0);
      M.dy = h * 0.06 * A * Math.abs(Math.sin(a));
      M.rz = 0.12 * A * Math.sin(b);
      M.sy = 1 - 0.05 * A * (1 - Math.abs(Math.sin(a)));
      M.armZ = 1.5 + 0.5 * Math.sin(a);
      M.armAlt = 0.6 * Math.sin(b);
      M.leg = 0.4 * Math.sin(b);
      M.headZ = 0.18 * Math.sin(b);
      M.tail = 0.6 * Math.sin(a);
      M.wing = 0.4 + 0.4 * Math.sin(a);
      break;
    }
    case 'idle':
    default: {
      const a = T * (TAU / 2.4) + ph * TAU;
      M.sy = 1 + 0.035 * A * Math.sin(a);
      M.sx = M.sz = 1 - 0.015 * A * Math.sin(a);
      M.ry = 0.1 * A * Math.sin(a * 0.4);
      M.head = 0.06 * A * Math.sin(a + 0.6);
      M.tail = 0.15 * Math.sin(a * 1.3);
      M.wing = 0.06 * Math.sin(a * 2);
      M.armZ = 0.06 * Math.sin(a);
      M.lid = 0.1 * Math.max(0, Math.sin(a));
      break;
    }
  }

  // ─── root ───
  const r = actorRoot;
  let px = st.bx + M.dx;
  let py = st.by + M.dy;
  let pz = st.bz + M.dz;
  let rx = st.brx + M.rx;
  if (M.flipX !== 0) {
    // somersault about the actor's centre, not its feet
    const c = h * 0.5 * M.sy;
    py += c - c * Math.cos(M.flipX);
    pz += -c * Math.sin(M.flipX);
    rx += M.flipX;
  }
  r.position.set(px, py, pz);
  r.rotation.set(rx, Number.isNaN(M.yaw) ? st.bry + M.ry : M.yaw + M.ry, st.brz + M.rz);
  r.scale.set(st.bs * M.sx, st.bs * M.sy, st.bs * M.sz);

  // ─── joints ───
  const js = st.joints;
  for (let i = 0; i < js.length; i++) {
    const j = js[i];
    const o = j.o;
    o.rotation.set(j.rx, j.ry, j.rz);
    o.position.set(j.px, j.py, j.pz);
    o.scale.set(j.sx, j.sy, j.sz);
    switch (j.kind) {
      case 'head':
        o.rotation.x += M.head;
        o.rotation.y += M.headY;
        o.rotation.z += M.headZ;
        break;
      case 'tail':
        o.rotation.y += M.tail;
        break;
      case 'wing':
        o.rotation.z += j.side * M.wing;
        break;
      case 'arm':
        o.rotation.z += j.side * (M.armZ + j.side * M.armAlt);
        o.rotation.x += j.side > 0 ? M.armX : -M.armX;
        break;
      case 'legBi':
        o.rotation.x += j.side > 0 ? M.leg : -M.leg;
        break;
      case 'legF':
      case 'legB':
        o.rotation.x += j.side * M.leg;
        break;
      case 'spin':
        o.rotation[j.axis] += t * (1.6 + 0.4 * j.n) * sp * M.spinK;
        break;
      case 'lid':
        o.rotation.x -= Math.max(0, M.lid);
        break;
      case 'hand':
        o.rotation.z -= t * sp * (j.n === 0 ? 2.4 : 0.4) * (1 + silly * 3);
        break;
      case 'flame': {
        const f = t * 17 + j.n * 1.7;
        const fl = 0.1 * A * Math.sin(f) + 0.05 * Math.sin(f * 1.7 + 1);
        o.scale.set(j.sx * (1 - fl * 0.5), j.sy * (1 + fl) * M.flick, j.sz * (1 - fl * 0.5));
        o.rotation.z += 0.05 * A * Math.sin(t * 7 + j.n);
        break;
      }
    }
  }
}
