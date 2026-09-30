/**
 * Animals — chunky storybook critters: big heads, big glossy eyes, strong silhouettes.
 * Joints follow spec.ts (head, tail, wingL/R, legFL/FR/BL/BR, legL/R, armL/R). L = the animal's
 * left = +X (the model faces +Z, towards the learner). Idle functions ADD to joint rotations
 * (anims.ts resets every joint to its rest pose each frame before calling idle).
 * Profile-readable animals (fish, snail) are built facing +X and set `userData.faceYaw`.
 */
import * as THREE from 'three';
import type { ModelSpec } from '../spec';
import {
  PAL, ball, box, cone, cyl, sphere, lathe, torus, extrude, dodeca, joint, model, sym, mirrorX, sweep, limb, curve, eyePair, smile, cheeks, tintOr, shade, rng,
  type V3,
} from '../kit';

type Geo = THREE.BufferGeometry;
const ell = (c: V3, s: V3, col: string, seg: [number, number] = [9, 6], ao = 0.18, rot?: V3) =>
  ball(1, col, { pos: c, scale: s, w: seg[0], h: seg[1], ao, rot });
function add(root: THREE.Object3D, n: string, axis: 'x' | 'y' | 'z', v: number) {
  const j = root.getObjectByName(n);
  if (j) j.rotation[axis] += v;
}
const flap = (root: THREE.Object3D, a: number) => { add(root, 'wingL', 'z', a); add(root, 'wingR', 'z', -a); };
const move = (gs: Geo[], x: number, y: number, z: number) => gs.map((g) => g.translate(x, y, z));
/** A feathered wing silhouette (left wing, in the XY plane, root at the origin) extruded thin, posed, plus its mirrored twin. */
function wings(outline: [number, number][], accent: [number, number][] | null, col: string, acc: string, pivot: V3, rot: V3, depth = 0.012): [THREE.Group, THREE.Group] {
  const L: Geo[] = [extrude(outline, depth, col, { pos: pivot, rot, bevel: 0.002, ao: 0.08 })];
  if (accent) L.push(extrude(accent, depth * 0.6, acc, { pos: [pivot[0], pivot[1], pivot[2] + depth * 0.45], rot, bevel: 0.0015, ao: 0 }));
  const R = L.map(mirrorX);
  return [joint('wingL', pivot, L), joint('wingR', [-pivot[0], pivot[1], pivot[2]], R)];
}

// ─── cat ────────────────────────────────────────────────────────────────────
function cat(o: { tint?: string }) {
  const fur = tintOr(o, PAL.orange) as string;
  const dark = shade(fur, -0.25);
  const body: Geo[] = [
    lathe([[0, 0], [0.066, 0.002], [0.082, 0.03], [0.078, 0.08], [0.06, 0.125], [0.04, 0.158], [0, 0.17]], fur, { seg: 10, scale: [1, 1, 0.9] }),
    ell([0, 0.1, 0.055], [0.035, 0.045, 0.02], PAL.cream),
    ...sym(ell([0.03, 0.016, 0.066], [0.022, 0.016, 0.03], PAL.cream), ell([0.06, 0.035, 0.0], [0.03, 0.035, 0.05], fur)),
    ...[0.07, 0.105].map((y) => torus(0.07 - y * 0.2, 0.006, dark, { pos: [0, y, -0.012], rot: [Math.PI / 2 + 0.15, 0, 0], seg: 10, arc: Math.PI, ao: 0 }).rotateY(Math.PI)),
  ];
  const head = joint('head', [0, 0.16, 0.01], [
    ell([0, 0.215, 0.02], [0.095, 0.082, 0.078], fur, [10, 7]),
    ell([0, 0.188, 0.083], [0.042, 0.027, 0.02], PAL.cream),
    ...sym(
      cone(0.034, 0.065, fur, { pos: [0.058, 0.288, 0.005], rot: [0, 0, -0.38], seg: 4 }),
      cone(0.019, 0.038, PAL.pink, { pos: [0.056, 0.282, 0.024], rot: [0, 0, -0.38], seg: 4, ao: 0 }),
      box(0.05, 0.003, 0.003, PAL.ink, { pos: [0.072, 0.19, 0.085], rot: [0, -0.3, 0.12] }),
      box(0.05, 0.003, 0.003, PAL.ink, { pos: [0.072, 0.18, 0.083], rot: [0, -0.3, -0.08] }),
    ),
    ...[-0.024, 0, 0.024].map((x) => box(0.009, 0.03, 0.008, dark, { pos: [x, 0.285, 0.05], rot: [0.7, 0, 0] })),
    ...eyePair({ x: 0.037, y: 0.222, z: 0.074, r: 0.026, iris: '#8fcf3c', pupilR: 0.5, yaw: 0.35 }),
    cone(0.011, 0.012, PAL.pink, { pos: [0, 0.198, 0.101], rot: [Math.PI, 0, 0], seg: 3, ao: 0 }),
    smile([0, 0.182, 0.1], 0.026, PAL.ink, { tube: 0.003 }),
    ...cheeks(0.06, 0.195, 0.068, 0.012),
  ]);
  const tail = joint('tail', [0, 0.02, -0.07], [
    sweep(curve([0, 0.02, -0.06], [0.16, 0.0, -0.12], [0.11, 0.17, -0.03], 8), (u) => 0.022 - u * 0.008, fur, { sides: 6 }),
    ball(0.016, dark, { pos: [0.11, 0.172, -0.03], w: 6, h: 5 }),
  ]);
  return model('cat', body, [head, tail]);
}

// ─── dog ────────────────────────────────────────────────────────────────────
function dog(o: { tint?: string }) {
  const fur = tintOr(o, '#d9a05b') as string;
  const ear = shade(fur, -0.45);
  const legH = (x: number, z: number) => [limb([x, 0.09, z], [x, 0.02, z], 0.024, 0.021, fur), ell([x, 0.013, z + 0.012], [0.024, 0.014, 0.03], PAL.cream)];
  const body: Geo[] = [
    ell([0, 0.1, -0.025], [0.07, 0.062, 0.1], fur),
    ell([0, 0.098, 0.04], [0.05, 0.048, 0.045], PAL.cream),
    ...legH(0.042, -0.085), ...legH(-0.042, -0.085),
    torus(0.047, 0.01, PAL.red, { pos: [0, 0.14, 0.055], rot: [1.25, 0, 0], seg: 12 }),
    sphere(0.012, PAL.gold, { pos: [0, 0.108, 0.1], seg: 0 }),
  ];
  const legF = (n: string, x: number) => joint(n, [x, 0.09, 0.045], legH(x, 0.045));
  const head = joint('head', [0, 0.15, 0.06], [
    ell([0, 0.2, 0.075], [0.08, 0.072, 0.07], fur, [10, 7]),
    ell([0, 0.172, 0.135], [0.045, 0.033, 0.04], PAL.cream),
    ell([0, 0.19, 0.172], [0.018, 0.013, 0.012], PAL.ink, [8, 6], 0),
    ell([0.004, 0.148, 0.155], [0.014, 0.018, 0.006], PAL.pink, [8, 5], 0),
    ell([-0.034, 0.222, 0.118], [0.03, 0.028, 0.012], ear, [8, 6], 0),
    ...sym(sweep(curve([0.058, 0.262, 0.06], [0.105, 0.25, 0.07], [0.092, 0.15, 0.08], 5), [0.02, 0.03, 0.032, 0.03, 0.022], ear, { flat: 0.45, sides: 6 })),
    ...eyePair({ x: 0.034, y: 0.215, z: 0.126, r: 0.023, yaw: 0.25 }),
    smile([0, 0.163, 0.172], 0.03, PAL.ink, { tube: 0.003 }),
  ]);
  const tail = joint('tail', [0, 0.13, -0.11], [
    sweep(curve([0, 0.13, -0.11], [0, 0.2, -0.13], [0.01, 0.22, -0.09], 5), [0.016, 0.014, 0.012, 0.01, 0.007], fur),
  ]);
  return model('dog', body, [head, tail, legF('legFL', 0.042), legF('legFR', -0.042)]);
}

// ─── owl ────────────────────────────────────────────────────────────────────
function owl(o: { tint?: string }) {
  const f = tintOr(o, '#9b6a3f') as string;
  const d = shade(f, -0.3);
  const body: Geo[] = [
    lathe([[0, 0.02], [0.06, 0.022], [0.088, 0.06], [0.094, 0.11], [0.082, 0.16], [0.06, 0.19], [0, 0.2]], f, { seg: 10 }),
    ell([0, 0.1, 0.06], [0.064, 0.078, 0.052], PAL.parchment, [10, 8], 0.06),
    ...[[-0.022, 0.12], [0.022, 0.12], [0, 0.098], [-0.03, 0.08], [0.03, 0.08], [0, 0.058]].map(([x, y]) =>
      ball(0.006, shade(f, 0.05), { pos: [x, y, 0.108 - Math.abs(x) * 0.4 - Math.abs(y - 0.1) * 0.35], scale: [1.4, 0.8, 0.5], w: 5, h: 3, ao: 0 })),
    ...sym(...[-0.012, 0, 0.012].map((dx) => box(0.008, 0.007, 0.03, PAL.orange, { pos: [0.03 + dx, 0.022, 0.06], rot: [0, dx * 8, 0] }))),
    cyl(0.018, 0.018, 0.3, PAL.woodDark, { pos: [0, 0.01, 0.045], rot: [0, 0, Math.PI / 2], seg: 6 }),
    ...sym(ball(0.01, PAL.green, { pos: [0.12, 0.03, 0.05], scale: [1.4, 0.5, 1], w: 5, h: 4 })),
  ];
  const head = joint('head', [0, 0.19, 0], [
    ell([0, 0.235, 0.005], [0.098, 0.08, 0.085], f, [10, 7]),
    ...sym(
      cone(0.022, 0.055, d, { pos: [0.07, 0.31, -0.005], rot: [0, 0, -0.5], seg: 4 }),
      ell([0.038, 0.238, 0.056], [0.046, 0.05, 0.03], PAL.cream, [9, 6], 0.05),
    ),
    ...eyePair({ x: 0.038, y: 0.24, z: 0.075, r: 0.031, iris: PAL.amber, pupilR: 0.5, yaw: 0.25 }),
    ...sym(box(0.05, 0.012, 0.012, d, { pos: [0.04, 0.285, 0.08], rot: [0, 0, 0.3] })),
    cone(0.013, 0.03, PAL.amber, { pos: [0, 0.207, 0.095], rot: [Math.PI + 0.35, 0, 0], seg: 4, ao: 0 }),
  ]);
  const wing = (n: string, s: number) =>
    joint(n, [s * 0.085, 0.16, 0], [ell([s * 0.098, 0.105, -0.01], [0.026, 0.07, 0.058], d), ell([s * 0.104, 0.065, -0.01], [0.018, 0.03, 0.04], shade(d, -0.2))]);
  return model('owl', body, [head, wing('wingL', 1), wing('wingR', -1)]);
}

// ─── bear ───────────────────────────────────────────────────────────────────
function bear(o: { tint?: string }) {
  const f = tintOr(o, '#9a6238') as string;
  const l = shade(f, 0.45);
  const body: Geo[] = [ell([0, 0.115, 0], [0.082, 0.085, 0.072], f, [10, 7]), ell([0, 0.105, 0.045], [0.055, 0.06, 0.035], l)];
  const leg = (n: string, s: number) =>
    joint(n, [s * 0.042, 0.06, 0], [limb([s * 0.042, 0.06, 0], [s * 0.046, 0.025, 0.01], 0.032, 0.03, f), ell([s * 0.046, 0.02, 0.025], [0.032, 0.02, 0.04], f), ell([s * 0.046, 0.022, 0.062], [0.02, 0.016, 0.006], l, [8, 5], 0)]);
  const arm = (n: string, s: number) =>
    joint(n, [s * 0.07, 0.155, 0], [limb([s * 0.07, 0.155, 0], [s * 0.1, 0.1, 0.03], 0.027, 0.024, f), ball(0.027, f, { pos: [s * 0.1, 0.095, 0.03], w: 7, h: 5 })]);
  const head = joint('head', [0, 0.185, 0], [
    ell([0, 0.235, 0.01], [0.08, 0.072, 0.07], f, [10, 7]),
    ...sym(ball(0.027, f, { pos: [0.058, 0.295, 0], w: 8, h: 6 }), ell([0.058, 0.294, 0.018], [0.015, 0.015, 0.008], l, [8, 5], 0)),
    ell([0, 0.21, 0.068], [0.04, 0.03, 0.028], l),
    ell([0, 0.222, 0.095], [0.016, 0.011, 0.01], PAL.ink, [8, 6], 0),
    ...eyePair({ x: 0.031, y: 0.248, z: 0.066, r: 0.019, yaw: 0.3 }),
    smile([0, 0.197, 0.094], 0.022, PAL.ink, { tube: 0.0028 }),
    ...cheeks(0.052, 0.222, 0.062, 0.011),
  ]);
  return model('bear', body, [head, arm('armL', 1), arm('armR', -1), leg('legL', 1), leg('legR', -1)]);
}

// ─── kangaroo ──────────────────────────────────────────────────────────────
function kangaroo(o: { tint?: string }) {
  const f = tintOr(o, '#c98a52') as string;
  const l = shade(f, 0.5);
  const body: Geo[] = [
    lathe([[0, 0.035], [0.05, 0.038], [0.072, 0.07], [0.07, 0.12], [0.052, 0.165], [0.034, 0.2], [0, 0.21]], f, { seg: 9, rot: [0.12, 0, 0] }),
    ell([0, 0.1, 0.045], [0.05, 0.06, 0.035], l),
    ell([0, 0.083, 0.068], [0.042, 0.03, 0.02], shade(l, -0.1)),
    ball(0.022, f, { pos: [0, 0.115, 0.078], w: 8, h: 6 }),
    ...sym(ell([0.014, 0.138, 0.075], [0.006, 0.013, 0.004], f, [6, 4], 0), ball(0.005, PAL.ink, { pos: [0.009, 0.119, 0.098], w: 5, h: 4, ao: 0 })),
    ball(0.005, PAL.ink, { pos: [0, 0.112, 0.101], w: 5, h: 4, ao: 0 }),
    ...sym(limb([0.045, 0.165, 0.045], [0.04, 0.13, 0.08], 0.013, 0.011, f), ball(0.012, f, { pos: [0.04, 0.128, 0.083], w: 6, h: 4 })),
  ];
  const head = joint('head', [0, 0.2, 0.025], [
    ell([0, 0.24, 0.035], [0.05, 0.048, 0.052], f),
    ell([0, 0.228, 0.085], [0.03, 0.026, 0.04], l),
    ell([0, 0.236, 0.123], [0.012, 0.009, 0.008], PAL.ink, [7, 5], 0),
    ...sym(
      ell([0.034, 0.3, 0.02], [0.017, 0.046, 0.01], f, [7, 5], 0.18, [0, 0, -0.28]),
      ell([0.035, 0.3, 0.029], [0.009, 0.034, 0.004], PAL.pink, [7, 5], 0, [0, 0, -0.28]),
    ),
    ...eyePair({ x: 0.025, y: 0.252, z: 0.073, r: 0.018, yaw: 0.35 }),
    smile([0, 0.214, 0.118], 0.018, PAL.ink, { tube: 0.0025 }),
  ]);
  const leg = (n: string, s: number) =>
    joint(n, [s * 0.05, 0.075, 0], [ell([s * 0.055, 0.062, -0.005], [0.035, 0.05, 0.055], f), ell([s * 0.05, 0.013, 0.04], [0.022, 0.013, 0.065], shade(f, -0.1))]);
  const tail = joint('tail', [0, 0.065, -0.05], [
    sweep([[0, 0.07, -0.04], [0, 0.045, -0.1], [0, 0.022, -0.16], [0, 0.012, -0.21]], [0.032, 0.025, 0.018, 0.01], f),
  ]);
  return model('kangaroo', body, [head, leg('legL', 1), leg('legR', -1), tail]);
}

// ─── frog ───────────────────────────────────────────────────────────────────
function frog(o: { tint?: string }) {
  const g = tintOr(o, '#69b94b') as string;
  const belly = '#eae59c';
  const body: Geo[] = [
    ell([0, 0.065, 0], [0.1, 0.062, 0.085], g, [10, 7]),
    ell([0, 0.052, 0.042], [0.075, 0.042, 0.045], belly),
    ...sym(
      ball(0.04, g, { pos: [0.048, 0.118, 0.02], w: 9, h: 7 }),
      limb([0.06, 0.05, 0.06], [0.068, 0.012, 0.08], 0.017, 0.014, g),
      ell([0.072, 0.007, 0.09], [0.024, 0.007, 0.02], shade(g, 0.2), [7, 4]),
    ),
    ...eyePair({ x: 0.048, y: 0.126, z: 0.05, r: 0.031, yaw: 0.35 }),
    smile([0, 0.076, 0.084], 0.1, PAL.ink, { tube: 0.004, arc: Math.PI * 0.6 }),
    ...cheeks(0.072, 0.078, 0.068, 0.013, PAL.pink, 0.8),
  ];
  const leg = (n: string, s: number) =>
    joint(n, [s * 0.075, 0.045, -0.03], [ell([s * 0.088, 0.04, -0.025], [0.032, 0.03, 0.055], g), ell([s * 0.098, 0.008, 0.035], [0.035, 0.008, 0.03], shade(g, 0.2), [7, 4])]);
  return model('frog', body, [leg('legL', 1), leg('legR', -1)]);
}

// ─── elephant ───────────────────────────────────────────────────────────────
function elephant(o: { tint?: string }) {
  const f = tintOr(o, '#98a3b8') as string;
  const d = shade(f, -0.2);
  const leg = (x: number, z: number) => [cyl(0.03, 0.032, 0.07, f, { pos: [x, 0.035, z], seg: 8 }), ...[-0.014, 0, 0.014].map((dx) => ball(0.007, PAL.cream, { pos: [x + dx, 0.008, z + 0.029], w: 5, h: 4, ao: 0 }))];
  const body: Geo[] = [ell([0, 0.115, -0.03], [0.088, 0.078, 0.1], f, [10, 7]), ...leg(0.05, 0.03), ...leg(-0.05, 0.03), ...leg(0.05, -0.09), ...leg(-0.05, -0.09)];
  const head = joint('head', [0, 0.15, 0.05], [
    ell([0, 0.185, 0.075], [0.078, 0.072, 0.066], f, [10, 7]),
    sweep([[0, 0.17, 0.125], [0, 0.125, 0.16], [0, 0.085, 0.178], [0, 0.07, 0.2], [0, 0.085, 0.222], [0, 0.11, 0.232]], [0.028, 0.024, 0.02, 0.017, 0.015, 0.014], f, { sides: 7 }),
    ...sym(cone(0.009, 0.04, PAL.cream, { pos: [0.03, 0.128, 0.14], rot: [1.9, 0, -0.2], seg: 5, ao: 0 })),
    ...eyePair({ x: 0.04, y: 0.205, z: 0.12, r: 0.02, yaw: 0.35 }),
    ...cheeks(0.056, 0.172, 0.113, 0.012),
    ...sym(box(0.025, 0.006, 0.006, d, { pos: [0.04, 0.232, 0.128], rot: [0, 0, 0.2] })),
  ]);
  const ear = (n: string, s: number) => joint(n, [s * 0.06, 0.19, 0.06], [
    ell([s * 0.112, 0.175, 0.045], [0.06, 0.07, 0.012], f, [9, 6], 0.15, [0, s * 0.45, 0]),
    ell([s * 0.11, 0.172, 0.054], [0.045, 0.053, 0.006], '#eaa2aa', [9, 6], 0, [0, s * 0.45, 0]),
  ]);
  const tail = joint('tail', [0, 0.13, -0.125], [limb([0, 0.13, -0.125], [0, 0.07, -0.14], 0.006, 0.005, d), ball(0.011, d, { pos: [0, 0.066, -0.14], w: 5, h: 4 })]);
  return model('elephant', body, [head, ear('wingL', 1), ear('wingR', -1), tail]);
}

// ─── fish (clownfish, profile to the learner) ───────────────────────────────
function fish(o: { tint?: string }) {
  const f = tintOr(o, '#f07a2a') as string;
  const bands: Geo[] = [];
  for (const z of [0.055, -0.005, -0.07]) {
    const k = Math.sqrt(Math.max(0.05, 1 - (z / 0.12) ** 2));
    bands.push(ell([0, 0.12, z], [0.057 * k + 0.003, 0.087 * k + 0.003, 0.016], PAL.ink, [10, 6], 0));
    bands.push(ell([0, 0.12, z], [0.057 * k + 0.004, 0.087 * k + 0.004, 0.01], PAL.white, [10, 6], 0));
  }
  const fin = (pts: [number, number][], pos: V3, rot: V3, col: string) => extrude(pts, 0.01, col, { pos, rot, ao: 0 });
  const body: Geo[] = [
    ell([0, 0.12, 0], [0.055, 0.085, 0.12], f, [10, 8]),
    ...bands,
    fin([[0, 0], [0.03, 0.05], [0.075, 0.06], [0.09, 0.01]], [0, 0.2, -0.05], [0, -Math.PI / 2, 0], f),
    fin([[0, 0], [0.03, -0.035], [0.06, -0.03], [0.05, 0]], [0, 0.05, -0.04], [0, -Math.PI / 2, 0], f),
    ...sym(fin([[0, 0], [0.035, 0.02], [0.045, -0.012]], [0.052, 0.1, 0.035], [0, -Math.PI / 2 - 0.5, -0.4], shade(f, 0.15))),
    ...eyePair({ x: 0.038, y: 0.145, z: 0.075, r: 0.026, yaw: 0.85, look: [0.5, 0, 1] }),
    torus(0.013, 0.006, PAL.crimson, { pos: [0, 0.1, 0.118], seg: 8 }),
  ];
  const tail = joint('tail', [0, 0.12, -0.11], [
    fin([[0, 0], [0.075, 0.065], [0.06, 0], [0.075, -0.065]], [0, 0.12, -0.105], [0, Math.PI / 2, 0], f),
    fin([[0.058, 0.052], [0.08, 0.072], [0.064, 0.0], [0.08, -0.072], [0.058, -0.052], [0.062, 0]], [0, 0.12, -0.104], [0, Math.PI / 2, 0], PAL.ink),
  ]);
  const root = model('fish', [], []);
  const inner = model('fishBody', body, [tail]);
  inner.rotation.y = Math.PI / 2;
  root.add(inner);
  root.userData.faceYaw = Math.PI / 2;
  return root;
}

// ─── dove ───────────────────────────────────────────────────────────────────
function dove(o: { tint?: string }) {
  const w = tintOr(o, '#ffffff') as string;
  const g = shade(w, -0.1);
  const body: Geo[] = [
    ell([0, 0.1, -0.01], [0.058, 0.055, 0.085], w, [10, 7], 0.15, [-0.35, 0, 0]),
    ell([0, 0.135, -0.095], [0.045, 0.01, 0.055], g, [8, 5], 0.1, [0.6, 0, 0]),
    ...sym(limb([0.02, 0.06, 0.01], [0.022, 0.012, 0.02], 0.006, 0.005, PAL.orange), box(0.02, 0.005, 0.012, PAL.orange, { pos: [0.022, 0.006, 0.026] })),
  ];
  const leaves: Geo[] = [];
  const stem = curve([-0.012, 0.162, 0.13], [0.03, 0.15, 0.14], [0.075, 0.13, 0.12], 5);
  stem.slice(1).forEach((p, i) => leaves.push(ell([p[0], p[1] + (i % 2 ? -0.009 : 0.009), p[2]], [0.014, 0.006, 0.004], PAL.green, [6, 4], 0, [0, 0, i % 2 ? 0.6 : -0.6])));
  const head = joint('head', [0, 0.14, 0.05], [
    ball(0.046, w, { pos: [0, 0.172, 0.07], w: 9, h: 7 }),
    cone(0.013, 0.03, PAL.orange, { pos: [0, 0.164, 0.122], rot: [Math.PI / 2, 0, 0], seg: 5, ao: 0 }),
    sweep(stem, 0.0025, PAL.olive, { sides: 4 }),
    ...leaves,
    ...eyePair({ x: 0.024, y: 0.183, z: 0.1, r: 0.016, yaw: 0.45 }),
    ...cheeks(0.034, 0.166, 0.1, 0.008),
  ]);
  const [wl, wr] = wings(
    [[0, 0], [0.02, 0.05], [0.034, 0.1], [0.05, 0.14], [0.07, 0.15], [0.066, 0.124], [0.088, 0.128], [0.078, 0.1], [0.098, 0.098], [0.083, 0.07], [0.094, 0.052], [0.068, 0.034], [0.042, 0.004], [0.02, -0.012]],
    [[0.004, 0.002], [0.022, 0.05], [0.036, 0.09], [0.05, 0.07], [0.045, 0.03], [0.025, 0.0]],
    w, g, [0.035, 0.125, -0.02], [0.1, -0.35, -0.12], 0.01,
  );
  return model('dove', body, [head, wl, wr]);
}

// ─── eagle ──────────────────────────────────────────────────────────────────
function eagle(o: { tint?: string }) {
  const f = tintOr(o, '#5e3b22') as string;
  const l = shade(f, 0.2);
  const body: Geo[] = [
    ell([0, 0.115, 0], [0.066, 0.082, 0.064], f, [10, 7]),
    ell([0, 0.12, 0.035], [0.045, 0.06, 0.035], l),
    extrude([[0, 0], [0.035, -0.06], [0.015, -0.07], [0, -0.075], [-0.015, -0.07], [-0.035, -0.06]], 0.012, PAL.white, { pos: [0, 0.06, -0.04], rot: [0.5, 0, 0], bevel: 0.002, ao: 0 }),
    ...sym(
      limb([0.025, 0.055, 0.02], [0.028, 0.012, 0.03], 0.01, 0.008, PAL.yellow),
      ...[-0.01, 0, 0.01].map((dx) => cone(0.004, 0.018, PAL.ink, { pos: [0.028 + dx, 0.006, 0.045], rot: [Math.PI / 2, 0, 0], seg: 4, ao: 0 })),
    ),
  ];
  const head = joint('head', [0, 0.17, 0.01], [
    ell([0, 0.205, 0.02], [0.05, 0.048, 0.052], PAL.white, [9, 7], 0.12),
    sweep([[0, 0.2, 0.055], [0, 0.2, 0.09], [0, 0.19, 0.108], [0, 0.175, 0.112]], [0.02, 0.014, 0.008, 0.002], PAL.yellow, { sides: 5 }),
    ...eyePair({ x: 0.022, y: 0.214, z: 0.055, r: 0.016, yaw: 0.35, iris: PAL.amber, pupilR: 0.55 }),
    ...sym(box(0.03, 0.008, 0.012, PAL.cream, { pos: [0.024, 0.232, 0.063], rot: [0, 0, -0.35] })),
  ]);
  const [wl, wr] = wings(
    [[0, 0], [0.03, 0.035], [0.07, 0.07], [0.11, 0.1], [0.15, 0.125], [0.18, 0.13], [0.16, 0.108], [0.19, 0.104], [0.165, 0.084], [0.19, 0.074], [0.16, 0.06], [0.178, 0.042], [0.145, 0.036], [0.15, 0.012], [0.12, 0.012], [0.11, -0.012], [0.085, 0.0], [0.07, -0.022], [0.05, -0.008], [0.03, -0.03], [0.0, -0.035]],
    [[0.0, 0.0], [0.03, 0.035], [0.07, 0.07], [0.11, 0.1], [0.13, 0.1], [0.1, 0.07], [0.06, 0.035], [0.02, 0.005]],
    f, l, [0.05, 0.14, -0.01], [0, -0.25, 0.25], 0.014,
  );
  return model('eagle', body, [head, wl, wr]);
}

// ─── lion ───────────────────────────────────────────────────────────────────
function lion(o: { tint?: string }) {
  const f = tintOr(o, '#e3a84c') as string;
  const mane = '#b8562a';
  const maneD = '#93401f';
  const legs = (x: number, z: number) => [limb([x, 0.1, z], [x, 0.02, z], 0.025, 0.022, f), ell([x, 0.014, z + 0.012], [0.026, 0.015, 0.032], shade(f, 0.25))];
  const body: Geo[] = [ell([0, 0.11, -0.03], [0.068, 0.06, 0.1], f, [10, 7]), ...legs(0.04, -0.09), ...legs(-0.04, -0.09)];
  const tufts: Geo[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    tufts.push(dodeca(0.037, i % 2 ? mane : maneD, { pos: [Math.cos(a) * 0.066, 0.205 + Math.sin(a) * 0.066, 0.065] }));
  }
  const head = joint('head', [0, 0.15, 0.05], [
    ball(0.08, mane, { pos: [0, 0.205, 0.045], w: 8, h: 6 }),
    ...tufts,
    ell([0, 0.2, 0.095], [0.06, 0.058, 0.045], f, [10, 7]),
    ell([0, 0.178, 0.132], [0.036, 0.024, 0.02], PAL.cream),
    cone(0.012, 0.014, '#8a4a3a', { pos: [0, 0.192, 0.15], rot: [Math.PI, 0, 0], seg: 3, ao: 0 }),
    ...sym(ball(0.02, f, { pos: [0.048, 0.258, 0.085], w: 6, h: 5 })),
    ...eyePair({ x: 0.027, y: 0.213, z: 0.13, r: 0.018, yaw: 0.3 }),
    smile([0, 0.17, 0.148], 0.022, PAL.ink, { tube: 0.0028 }),
    ...cheeks(0.046, 0.188, 0.12, 0.01),
  ]);
  const leg = (n: string, x: number) => joint(n, [x, 0.1, 0.045], legs(x, 0.045));
  const tail = joint('tail', [0, 0.12, -0.12], [
    sweep(curve([0, 0.12, -0.12], [0, 0.2, -0.2], [0, 0.1, -0.2], 6), 0.007, f, { sides: 5 }),
    dodeca(0.018, mane, { pos: [0, 0.095, -0.2] }),
  ]);
  return model('lion', body, [head, tail, leg('legFL', 0.04), leg('legFR', -0.04)]);
}

// ─── rooster (le coq gaulois: blue tail, white body, red comb) ─────────────
function rooster(o: { tint?: string }) {
  const w = tintOr(o, '#fbf1dc') as string;
  const body: Geo[] = [
    ell([0, 0.12, -0.01], [0.06, 0.065, 0.075], w, [10, 7]),
    ell([0, 0.14, 0.04], [0.045, 0.05, 0.04], shade(w, -0.04)),
    ...sym(
      limb([0.022, 0.07, 0.0], [0.024, 0.012, 0.01], 0.008, 0.007, PAL.amber),
      ...[-0.5, 0, 0.5].map((a) => box(0.005, 0.005, 0.024, PAL.amber, { pos: [0.024 + Math.sin(a) * 0.01, 0.004, 0.02], rot: [0, a, 0] })),
    ),
  ];
  const head = joint('head', [0, 0.17, 0.035], [
    ball(0.04, w, { pos: [0, 0.2, 0.052], w: 9, h: 7 }),
    ...[0, 1, 2].map((i) => ball(0.02 - i * 0.002, PAL.red, { pos: [0, 0.245 - i * 0.004, 0.075 - i * 0.022], scale: [0.55, 1, 1], w: 7, h: 5 })),
    ell([0, 0.168, 0.085], [0.011, 0.02, 0.01], PAL.red),
    cone(0.012, 0.028, PAL.amber, { pos: [0, 0.198, 0.1], rot: [Math.PI / 2, 0, 0], seg: 4, ao: 0 }),
    ...eyePair({ x: 0.022, y: 0.212, z: 0.075, r: 0.014, yaw: 0.5 }),
  ]);
  const tailCols = [PAL.navy, PAL.blue, PAL.teal, PAL.blue, PAL.navy];
  const tail = joint('tail', [0, 0.14, -0.07], tailCols.map((c, i) => {
    const x = (i - 2) * 0.016;
    const h = 0.26 - Math.abs(i - 2) * 0.025;
    return sweep(curve([x, 0.13, -0.06], [x * 1.6, h + 0.04, -0.11], [x * 2.2, h - 0.08, -0.17], 6), (u) => 0.018 * (1 - u) + 0.003, c, { flat: 0.35, sides: 6, roll: Math.PI / 2 });
  }));
  const wing = (n: string, s: number) => joint(n, [s * 0.055, 0.14, 0], [ell([s * 0.058, 0.115, -0.015], [0.02, 0.045, 0.062], '#e0a040', [8, 6], 0.1, [0.25, 0, 0])]);
  return model('rooster', body, [head, tail, wing('wingL', 1), wing('wingR', -1)]);
}

// ─── snail (profile to the learner, face turned towards them) ──────────────
function snail(o: { tint?: string }) {
  const shell = tintOr(o, '#ef8a4a') as string;
  const skin = '#bfe0a0';
  const pts: V3[] = [];
  const rad: number[] = [];
  for (let i = 0; i <= 22; i++) {
    const th = (i / 22) * Math.PI * 3.2;
    const r = 0.075 * Math.exp(-0.21 * th);
    pts.push([-0.015 + Math.cos(-th - Math.PI / 2) * r, 0.105 + Math.sin(-th - Math.PI / 2) * r, 0]);
    rad.push(r * 0.52 + 0.002);
  }
  const body: Geo[] = [
    sweep([[-0.11, 0.012, 0], [-0.05, 0.018, 0], [0.04, 0.022, 0], [0.09, 0.035, 0], [0.11, 0.07, 0]], [0.012, 0.028, 0.032, 0.03, 0.028], skin, { flat: 0.8, sides: 7 }),
    ell([-0.015, 0.105, 0], [0.062, 0.062, 0.026], shade(shell, -0.25), [10, 7]),
    sweep(pts, rad, shell, { sides: 7 }),
    ...[1, -1].map((sz) => sweep(pts.slice(0, 20).map((p, i) => [p[0], p[1], sz * rad[i] * 0.93] as V3), (u) => 0.0055 - u * 0.003, PAL.cream, { sides: 4 })),
  ];
  const face: Geo[] = [
    ball(0.034, skin, { pos: [0, 0.09, 0.005], w: 8, h: 6 }),
    ...sym(limb([0.012, 0.11, 0.005], [0.024, 0.15, 0.012], 0.005, 0.004, skin)),
    ...eyePair({ x: 0.025, y: 0.158, z: 0.014, r: 0.014, yaw: 0.2 }),
    smile([0, 0.083, 0.037], 0.02, PAL.ink, { tube: 0.0025 }),
    ...cheeks(0.024, 0.088, 0.03, 0.007),
  ];
  const head = joint('head', [0.11, 0.06, 0], move(face, 0.115, 0, 0));
  const root = model('snail', body, [head]);
  root.userData.faceYaw = Math.PI / 2;
  return root;
}

// ─── bee ────────────────────────────────────────────────────────────────────
function bee(o: { tint?: string }) {
  const y = tintOr(o, PAL.yellow) as string;
  const bands: Geo[] = [];
  const L = 0.085;
  const R = 0.062;
  const segs = [-1, -0.62, -0.26, 0.1, 0.46, 1];
  for (let b = 0; b < segs.length - 1; b++) {
    const prof: [number, number][] = [];
    for (let k = 0; k <= 3; k++) {
      const u = segs[b] + ((segs[b + 1] - segs[b]) * k) / 3;
      prof.push([Math.max(0.0005, R * Math.sqrt(Math.max(0, 1 - u * u))), u * L]);
    }
    bands.push(lathe(prof, b % 2 ? PAL.ink : y, { seg: 10, ao: 0 }).rotateX(-Math.PI / 2).translate(0, 0.1, -0.035));
  }
  const body: Geo[] = [
    ...bands,
    cone(0.012, 0.025, PAL.ink, { pos: [0, 0.1, -0.128], rot: [-Math.PI / 2, 0, 0], seg: 5, ao: 0 }),
    ball(0.055, y, { pos: [0, 0.125, 0.06], w: 10, h: 7 }),
    ...eyePair({ x: 0.024, y: 0.135, z: 0.1, r: 0.02, yaw: 0.35 }),
    smile([0, 0.105, 0.11], 0.025, PAL.ink, { tube: 0.003 }),
    ...cheeks(0.042, 0.115, 0.093, 0.009, PAL.orange),
    ...sym(
      sweep(curve([0.018, 0.175, 0.07], [0.03, 0.22, 0.08], [0.05, 0.215, 0.1], 4), 0.003, PAL.ink, { sides: 4 }),
      ball(0.009, PAL.ink, { pos: [0.05, 0.215, 0.1], w: 5, h: 4, ao: 0 }),
      limb([0.03, 0.06, 0.0], [0.04, 0.02, 0.015], 0.005, 0.004, PAL.ink),
      limb([0.03, 0.06, -0.05], [0.04, 0.02, -0.055], 0.005, 0.004, PAL.ink),
    ),
  ];
  const wing = (n: string, s: number) => joint(n, [s * 0.02, 0.155, -0.02], [
    ell([s * 0.06, 0.19, -0.03], [0.05, 0.008, 0.03], '#dff3ff', [8, 4], 0, [0, s * 0.3, s * 0.45]),
    ell([s * 0.045, 0.175, -0.065], [0.03, 0.006, 0.02], '#cbe9fb', [7, 4], 0, [0, s * 0.8, s * 0.4]),
  ]);
  return model('bee', body, [wing('wingL', 1), wing('wingR', -1)]);
}

// ─── penguin ────────────────────────────────────────────────────────────────
function penguin(o: { tint?: string }) {
  const b = tintOr(o, '#2b3040') as string;
  const body: Geo[] = [
    lathe([[0, 0.012], [0.055, 0.015], [0.075, 0.05], [0.075, 0.1], [0.062, 0.15], [0.04, 0.175], [0, 0.18]], b, { seg: 10 }),
    ell([0, 0.088, 0.042], [0.06, 0.078, 0.05], PAL.white, [10, 7], 0.1),
    ...sym(ell([0.03, 0.009, 0.045], [0.024, 0.009, 0.03], PAL.orange, [7, 4], 0, [0, -0.3, 0])),
    torus(0.05, 0.014, PAL.red, { pos: [0, 0.165, 0.005], rot: [Math.PI / 2 + 0.1, 0, 0], seg: 10 }),
    box(0.026, 0.05, 0.012, PAL.red, { pos: [0.04, 0.14, 0.05], rot: [0.3, 0.4, 0.25] }),
  ];
  const head = joint('head', [0, 0.17, 0], [
    ball(0.062, b, { pos: [0, 0.215, 0.005], w: 10, h: 7 }),
    ...sym(ell([0.022, 0.212, 0.04], [0.028, 0.033, 0.025], PAL.white, [8, 6], 0.05)),
    ...eyePair({ x: 0.024, y: 0.218, z: 0.057, r: 0.017, yaw: 0.3 }),
    cone(0.014, 0.028, PAL.orange, { pos: [0, 0.196, 0.073], rot: [Math.PI / 2 + 0.2, 0, 0], seg: 5, ao: 0 }),
    ...cheeks(0.038, 0.197, 0.05, 0.009),
  ]);
  const wing = (n: string, s: number) => joint(n, [s * 0.068, 0.14, 0], [ell([s * 0.082, 0.095, -0.005], [0.014, 0.055, 0.03], b, [7, 5], 0.1, [0, 0, s * 0.3])]);
  return model('penguin', body, [head, wing('wingL', 1), wing('wingR', -1)]);
}

// ─── horse ──────────────────────────────────────────────────────────────────
function horse(o: { tint?: string }) {
  const f = tintOr(o, '#b8683a') as string;
  const m = '#4a2c1c';
  const body: Geo[] = [
    ell([0, 0.145, -0.01], [0.06, 0.055, 0.1], f, [10, 7]),
    sweep(curve([0, 0.17, -0.1], [0, 0.18, -0.16], [0, 0.07, -0.15], 6), (u) => 0.012 + u * 0.016, m, { flat: 0.5, sides: 6 }),
  ];
  const leg = (n: string, x: number, z: number, sock: boolean) => joint(n, [x, 0.13, z], [
    limb([x, 0.13, z], [x, 0.03, z], 0.025, 0.02, f),
    cyl(0.021, 0.021, 0.02, sock ? PAL.cream : f, { pos: [x, 0.03, z], seg: 7 }),
    cyl(0.022, 0.025, 0.02, PAL.ink, { pos: [x, 0.01, z], seg: 7 }),
  ]);
  const maneTufts: Geo[] = [];
  for (let i = 0; i < 6; i++) {
    const u = i / 5;
    maneTufts.push(cone(0.016, 0.04, m, { pos: [0, 0.285 - u * 0.1, 0.085 - u * 0.05], rot: [-0.9 - u * 0.3, 0, 0], seg: 4 }));
  }
  const headParts: Geo[] = [
    limb([0, 0.16, 0.06], [0, 0.245, 0.1], 0.04, 0.033, f),
    ell([0, 0.262, 0.125], [0.042, 0.042, 0.056], f, [9, 7], 0.12, [0.45, 0, 0]),
    ell([0, 0.232, 0.168], [0.034, 0.03, 0.03], shade(f, 0.35)),
    ...sym(ball(0.005, PAL.ink, { pos: [0.014, 0.232, 0.197], w: 5, h: 4, ao: 0 })),
    box(0.014, 0.06, 0.01, PAL.cream, { pos: [0, 0.27, 0.165], rot: [0.5, 0, 0] }),
    ...sym(cone(0.013, 0.035, f, { pos: [0.022, 0.31, 0.105], rot: [-0.2, 0, -0.25], seg: 4 })),
    ...maneTufts,
    cone(0.016, 0.035, m, { pos: [0.005, 0.3, 0.13], rot: [1.2, 0, 0.3], seg: 4 }),
    ...eyePair({ x: 0.03, y: 0.275, z: 0.145, r: 0.017, yaw: 0.5 }),
    smile([0, 0.215, 0.19], 0.02, PAL.ink, { tube: 0.0025 }),
  ];
  // chunky toy proportions: scale the head up around the neck base
  for (const g of headParts) g.translate(0, -0.17, -0.07).scale(1.22, 1.22, 1.22).translate(0, 0.17, 0.07);
  const head = joint('head', [0, 0.17, 0.07], headParts);
  return model('horse', body, [head, leg('legFL', 0.035, 0.06, true), leg('legFR', -0.035, 0.06, true), leg('legBL', 0.035, -0.075, false), leg('legBR', -0.035, -0.075, false)]);
}

// ─── turkey ─────────────────────────────────────────────────────────────────
function turkey(o: { tint?: string }) {
  const f = tintOr(o, '#7a4a2a') as string;
  const body: Geo[] = [
    ell([0, 0.1, 0], [0.075, 0.07, 0.068], f),
    ell([0, 0.1, 0.04], [0.05, 0.05, 0.035], shade(f, 0.15)),
    ...sym(
      limb([0.025, 0.05, 0.01], [0.028, 0.01, 0.02], 0.008, 0.007, PAL.orange),
      ...[-0.5, 0, 0.5].map((a) => box(0.005, 0.005, 0.022, PAL.orange, { pos: [0.028 + Math.sin(a) * 0.009, 0.004, 0.03], rot: [0, a, 0] })),
    ),
  ];
  const fan: Geo[] = [ell([0, 0.1, -0.045], [0.075, 0.075, 0.012], '#6a3a22', [10, 6], 0.1)];
  const cols = [PAL.crimson, PAL.orange, PAL.amber, PAL.red, PAL.amber, PAL.orange, PAL.crimson];
  cols.forEach((c, i) => {
    const a = -1.32 + (i / (cols.length - 1)) * 2.64;
    const dx = Math.sin(a);
    const dy = Math.cos(a);
    const z = -0.075 + Math.abs(i - 3) * 0.004;
    fan.push(ell([dx * 0.12, 0.1 + dy * 0.12, z], [0.038, 0.1, 0.008], c, [8, 5], 0.05, [0, 0, -a]));
    fan.push(ell([dx * 0.19, 0.1 + dy * 0.19, z + 0.006], [0.028, 0.02, 0.006], i % 2 ? PAL.cream : shade(c, -0.45), [7, 4], 0, [0, 0, -a]));
  });
  const tail = joint('tail', [0, 0.1, -0.05], fan);
  const head = joint('head', [0, 0.15, 0.04], [
    limb([0, 0.14, 0.04], [0, 0.2, 0.065], 0.024, 0.02, '#c9a58a'),
    ball(0.042, '#d8b8a0', { pos: [0, 0.22, 0.07], w: 9, h: 7 }),
    cone(0.011, 0.026, PAL.amber, { pos: [0, 0.214, 0.118], rot: [Math.PI / 2, 0, 0], seg: 4, ao: 0 }),
    sweep(curve([0.004, 0.232, 0.105], [0.016, 0.228, 0.13], [0.012, 0.19, 0.125], 4), [0.006, 0.007, 0.008, 0.008], PAL.red, { sides: 5 }),
    ell([0, 0.186, 0.1], [0.012, 0.022, 0.012], PAL.red),
    ...eyePair({ x: 0.021, y: 0.232, z: 0.1, r: 0.017, yaw: 0.4 }),
    ...cheeks(0.032, 0.212, 0.1, 0.008),
  ]);
  const wing = (n: string, s: number) => joint(n, [s * 0.07, 0.12, 0], [ell([s * 0.072, 0.095, -0.01], [0.02, 0.045, 0.055], shade(f, -0.2), [7, 5])]);
  return model('turkey', body, [head, tail, wing('wingL', 1), wing('wingR', -1)]);
}

// ─── otter ──────────────────────────────────────────────────────────────────
function otter(o: { tint?: string }) {
  const f = tintOr(o, '#8b5a3c') as string;
  const l = '#ead0ae';
  const body: Geo[] = [
    lathe([[0, 0.02], [0.05, 0.022], [0.066, 0.06], [0.062, 0.12], [0.05, 0.16], [0.04, 0.18], [0, 0.19]], f, { seg: 10 }),
    ell([0, 0.1, 0.04], [0.042, 0.07, 0.03], shade(f, 0.35)),
    ...sym(ell([0.03, 0.012, 0.045], [0.022, 0.012, 0.035], shade(f, -0.2), [7, 4])),
  ];
  const tail = joint('tail', [0, 0.03, -0.04], [sweep(curve([0, 0.035, -0.04], [0.02, 0.01, -0.13], [0.09, 0.008, -0.12], 6), (u) => 0.03 - u * 0.02, f, { flat: 0.6, sides: 6 })]);
  const arm = (n: string, s: number, extra: Geo[] = []) => joint(n, [s * 0.045, 0.15, 0.03], [
    limb([s * 0.045, 0.15, 0.03], [s * 0.016, 0.125, 0.07], 0.014, 0.012, f), ball(0.014, shade(f, -0.1), { pos: [s * 0.014, 0.122, 0.074], w: 6, h: 5 }), ...extra,
  ]);
  const shell = [ell([0, 0.12, 0.085], [0.024, 0.02, 0.008], PAL.pink, [8, 5], 0), ...[-0.5, 0, 0.5].map((a) => box(0.003, 0.03, 0.002, shade(PAL.pink, -0.25), { pos: [Math.sin(a) * 0.006, 0.12, 0.093], rot: [0, 0, a] }))];
  const head = joint('head', [0, 0.18, 0.01], [
    ell([0, 0.218, 0.015], [0.056, 0.05, 0.05], f, [10, 7]),
    ell([0, 0.212, 0.04], [0.045, 0.04, 0.03], l),
    ell([0, 0.2, 0.058], [0.03, 0.022, 0.022], l),
    ell([0, 0.21, 0.08], [0.012, 0.008, 0.007], PAL.ink, [7, 5], 0),
    ...sym(
      ball(0.014, f, { pos: [0.045, 0.25, 0.0], w: 6, h: 5 }),
      box(0.04, 0.002, 0.002, PAL.cream, { pos: [0.045, 0.2, 0.068], rot: [0, -0.3, 0.1] }),
    ),
    ...eyePair({ x: 0.024, y: 0.228, z: 0.05, r: 0.016, yaw: 0.3 }),
    smile([0, 0.19, 0.078], 0.018, PAL.ink, { tube: 0.0025 }),
  ]);
  return model('otter', body, [head, tail, arm('armL', 1, shell), arm('armR', -1)]);
}

// ─── sheep ──────────────────────────────────────────────────────────────────
function sheep(o: { tint?: string }) {
  const w = tintOr(o, '#f7f1e3') as string;
  const face = '#2f2a2e';
  const r = rng(7);
  const wool: Geo[] = [ell([0, 0.13, -0.01], [0.075, 0.06, 0.088], w)];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 * 2.618;
    const yy = 1 - (2 * (i + 0.5)) / 18;
    const rr = Math.sqrt(1 - yy * yy);
    const dy = Math.max(-0.35, yy);
    wool.push(dodeca(0.03 + r() * 0.012, i % 3 ? w : shade(w, -0.05), { pos: [Math.cos(a) * rr * 0.07, 0.13 + dy * 0.058, Math.sin(a) * rr * 0.085 - 0.01], rot: [r() * 3, r() * 3, 0] }));
  }
  const leg = (n: string, x: number, z: number) => joint(n, [x, 0.09, z], [limb([x, 0.09, z], [x, 0.016, z], 0.013, 0.012, face), cyl(0.014, 0.015, 0.014, PAL.ink, { pos: [x, 0.007, z], seg: 6 })]);
  const head = joint('head', [0, 0.14, 0.07], [
    ell([0, 0.165, 0.105], [0.04, 0.045, 0.045], face, [9, 7], 0.1, [0.3, 0, 0]),
    ...sym(ell([0.05, 0.178, 0.095], [0.028, 0.011, 0.016], face, [7, 4], 0.1, [0, 0.3, -0.35]), ell([0.052, 0.177, 0.101], [0.018, 0.006, 0.008], PAL.pink, [6, 4], 0, [0, 0.3, -0.35])),
    ...[[-0.02, 0.205, 0.1], [0.02, 0.205, 0.1], [0, 0.215, 0.085]].map((p) => dodeca(0.02, w, { pos: p as V3 })),
    ...eyePair({ x: 0.021, y: 0.176, z: 0.137, r: 0.016, yaw: 0.35 }),
    ell([0, 0.14, 0.14], [0.016, 0.01, 0.008], '#6a5a60', [7, 4], 0),
    ...cheeks(0.03, 0.155, 0.135, 0.008),
  ]);
  return model('sheep', wool, [head, leg('legFL', 0.04, 0.05), leg('legFR', -0.04, 0.05), leg('legBL', 0.04, -0.07), leg('legBR', -0.04, -0.07)]);
}

// ─────────────────────────────────────────────────────────────────────────────
export const SPECS: ModelSpec[] = [
  {
    id: 'kangaroo', name: 'Kangaroo', category: 'animal',
    tags: ['kangaroo', 'australia', 'canberra', 'sydney', 'jump', 'hop', 'pouch', 'mother', 'boxing', 'marsupial', 'outback', 'joey'],
    soundsLike: ['kang', 'can', 'canberra', 'roo', 'garou', 'kangourou', 'guru'],
    anims: ['bounce', 'flip', 'dance', 'shake'], build: kangaroo,
    idle: (r, t, k) => { add(r, 'tail', 'x', Math.sin(t * 2.2) * 0.08 * k); add(r, 'head', 'z', Math.sin(t * 1.3) * 0.06 * k); },
  },
  {
    id: 'elephant', name: 'Elephant', category: 'animal',
    tags: ['elephant', 'memory', 'never forgets', 'india', 'africa', 'thailand', 'hannibal', 'alps', 'carthage', 'republican', 'ivory', 'circus', 'big', 'heavy', 'trunk'],
    soundsLike: ['ele', 'elephant', 'eleph', 'fant', 'jumbo', 'dumbo', 'ivory'],
    anims: ['march', 'wobble', 'fly', 'dance', 'idle'], build: elephant,
    idle: (r, t, k) => { flap(r, Math.sin(t * 2.4) * 0.12 * k); add(r, 'head', 'x', Math.sin(t * 1.2) * 0.04 * k); add(r, 'tail', 'z', Math.sin(t * 3) * 0.3 * k); },
  },
  {
    id: 'owl', name: 'Owl', category: 'animal',
    tags: ['owl', 'wisdom', 'night', 'athena', 'athens', 'minerva', 'knowledge', 'study', 'exam', 'bird', 'hoot', 'philosophy', 'greece'],
    soundsLike: ['owl', 'ow', 'hibou', 'chouette', 'hoot', 'who'],
    anims: ['idle', 'fly', 'wobble', 'float'], build: owl,
    idle: (r, t, k) => { add(r, 'head', 'y', Math.sin(t * 0.7) * 0.35 * k); flap(r, Math.max(0, Math.sin(t * 2.1)) * 0.08 * k); },
  },
  {
    id: 'cat', name: 'Cat', category: 'animal',
    tags: ['cat', 'kitten', 'pet', 'curiosity', 'nine lives', 'egypt', 'bastet', 'luck', 'witch', 'independence', 'purr', 'schrodinger', 'mouse'],
    soundsLike: ['cat', 'kat', 'chat', 'cath', 'catho', 'catastrophe', 'minou', 'puss'],
    anims: ['idle', 'wobble', 'dance', 'shake', 'flip'], build: cat,
    idle: (r, t, k) => { add(r, 'tail', 'y', Math.sin(t * 1.6) * 0.25 * k); add(r, 'head', 'z', Math.sin(t * 0.9) * 0.07 * k); },
  },
  {
    id: 'dog', name: 'Dog', category: 'animal',
    tags: ['dog', 'puppy', 'pet', 'loyalty', 'friend', 'bark', 'bone', 'guard', 'pavlov', 'laika', 'hound', 'fetch', 'faithful'],
    soundsLike: ['dog', 'dogue', 'chien', 'chi', 'pup', 'hound', 'doge'],
    anims: ['bounce', 'march', 'dance', 'spin', 'shake'], build: dog,
    idle: (r, t, k) => { add(r, 'tail', 'z', Math.sin(t * 9) * 0.35 * k); add(r, 'head', 'z', Math.sin(t * 1.4) * 0.08 * k); },
  },
  {
    id: 'fish', name: 'Fish', category: 'animal',
    tags: ['fish', 'sea', 'ocean', 'water', 'swim', 'aquarium', 'clownfish', 'nemo', 'reef', 'pisces', 'christian', 'ichthys', 'fishing', 'memory'],
    soundsLike: ['fish', 'fi', 'fiche', 'poisson', 'poison', 'pisc', 'fission'],
    anims: ['float', 'orbit', 'wobble', 'flip', 'rain'], build: fish,
    idle: (r, t, k) => add(r, 'tail', 'y', Math.sin(t * 6) * 0.35 * k),
  },
  {
    id: 'dove', name: 'Dove', category: 'animal',
    tags: ['dove', 'peace', 'armistice', 'treaty', 'olive branch', 'hope', 'noah', 'love', 'holy spirit', 'pigeon', 'bird', 'white', 'truce', 'un', 'united nations'],
    soundsLike: ['dove', 'dov', 'love', 'colombe', 'colom', 'pigeon', 'paix', 'peace'],
    anims: ['fly', 'float', 'idle', 'orbit'], build: dove,
    idle: (r, t, k) => { flap(r, Math.sin(t * 3) * 0.15 * k); add(r, 'head', 'x', Math.sin(t * 2) * 0.05 * k); },
  },
  {
    id: 'eagle', name: 'Eagle', category: 'animal',
    tags: ['eagle', 'usa', 'america', 'freedom', 'germany', 'empire', 'rome', 'napoleon', 'austria', 'mexico', 'power', 'emblem', 'sky', 'hunter', 'reich', 'legion'],
    soundsLike: ['eagle', 'eag', 'aigle', 'egal', 'legal', 'eagl', 'ego'],
    anims: ['fly', 'float', 'idle', 'orbit'], build: eagle,
    idle: (r, t, k) => { flap(r, Math.sin(t * 1.8) * 0.1 * k); add(r, 'head', 'y', Math.sin(t * 0.8) * 0.2 * k); },
  },
  {
    id: 'bear', name: 'Bear', category: 'animal',
    tags: ['bear', 'russia', 'moscow', 'strength', 'teddy', 'honey', 'winter', 'hibernate', 'berlin', 'bern', 'california', 'market', 'grizzly', 'ussr'],
    soundsLike: ['bear', 'bare', 'bair', 'ours', 'our', 'bern', 'berlin', 'teddy', 'bruin'],
    anims: ['dance', 'march', 'wobble', 'shake', 'idle'], build: bear,
    idle: (r, t, k) => { add(r, 'head', 'z', Math.sin(t * 1.1) * 0.07 * k); add(r, 'armL', 'z', Math.sin(t * 1.5) * 0.08 * k); add(r, 'armR', 'z', -Math.sin(t * 1.5 + 1) * 0.08 * k); },
  },
  {
    id: 'lion', name: 'Lion', category: 'animal',
    tags: ['lion', 'king', 'courage', 'england', 'britain', 'richard', 'lionheart', 'pride', 'africa', 'leo', 'roar', 'belgium', 'netherlands', 'judah', 'royal'],
    soundsLike: ['lion', 'lyon', 'leo', 'leon', 'lio', 'lie on', 'roar'],
    anims: ['idle', 'march', 'shake', 'grow', 'dance'], build: lion,
    idle: (r, t, k) => { add(r, 'tail', 'z', Math.sin(t * 1.7) * 0.3 * k); add(r, 'head', 'z', Math.sin(t * 0.8) * 0.05 * k); },
  },
  {
    id: 'rooster', name: 'Rooster', category: 'animal',
    tags: ['rooster', 'france', 'french', 'gaul', 'coq', 'dawn', 'morning', 'pride', 'wake up', 'farm', 'chicken', 'cock', 'china', 'zodiac', 'vigilance'],
    soundsLike: ['rooster', 'roost', 'coq', 'cock', 'coco', 'gaul', 'gallic', 'rust'],
    anims: ['march', 'bounce', 'dance', 'shake', 'idle'], build: rooster,
    idle: (r, t, k) => { add(r, 'head', 'x', Math.max(0, Math.sin(t * 2.5)) * 0.15 * k); add(r, 'tail', 'x', Math.sin(t * 1.3) * 0.06 * k); },
  },
  {
    id: 'frog', name: 'Frog', category: 'animal',
    tags: ['frog', 'jump', 'pond', 'prince', 'kiss', 'france', 'french', 'metamorphosis', 'rain', 'croak', 'amphibian', 'lily', 'plague'],
    soundsLike: ['frog', 'fro', 'grenouille', 'croak', 'crapaud', 'toad', 'ribbit'],
    anims: ['bounce', 'flip', 'idle', 'shake'], build: frog,
    idle: (r, t, k) => { add(r, 'legL', 'x', Math.sin(t * 1.7) * 0.05 * k); add(r, 'legR', 'x', Math.sin(t * 1.7 + 0.8) * 0.05 * k); },
  },
  {
    id: 'snail', name: 'Snail', category: 'animal',
    tags: ['snail', 'slow', 'patience', 'spiral', 'shell', 'escargot', 'france', 'garden', 'slime', 'mail', 'delay', 'fibonacci', 'home'],
    soundsLike: ['snail', 'nail', 'sn', 'escargot', 'cargo', 'escar', 'limace', 'mail'],
    anims: ['idle', 'wobble', 'march', 'float'], build: snail,
    idle: (r, t, k) => { add(r, 'head', 'z', Math.sin(t * 1.2) * 0.1 * k); add(r, 'head', 'y', Math.sin(t * 0.7) * 0.12 * k); },
  },
  {
    id: 'bee', name: 'Bee', category: 'animal',
    tags: ['bee', 'honey', 'work', 'busy', 'hive', 'queen', 'napoleon', 'empire', 'sting', 'buzz', 'pollen', 'flower', 'spelling bee', 'team', 'b'],
    soundsLike: ['bee', 'be', 'b', 'abeille', 'bi', 'buzz', 'bzz', 'bey'],
    anims: ['fly', 'float', 'orbit', 'rain', 'shake'], build: bee,
    idle: (r, t, k) => flap(r, Math.sin(t * 38) * 0.45 * k),
  },
  {
    id: 'penguin', name: 'Penguin', category: 'animal',
    tags: ['penguin', 'antarctica', 'south pole', 'cold', 'ice', 'winter', 'tuxedo', 'linux', 'waddle', 'snow', 'bird', 'emperor', 'polar'],
    soundsLike: ['penguin', 'pen', 'pengu', 'pingouin', 'pin', 'manchot', 'gwen'],
    anims: ['march', 'wobble', 'dance', 'bounce', 'shake'], build: penguin,
    idle: (r, t, k) => { flap(r, (0.5 + 0.5 * Math.sin(t * 2.6)) * 0.15 * k); add(r, 'head', 'z', Math.sin(t * 1.3) * 0.08 * k); },
  },
  {
    id: 'horse', name: 'Horse', category: 'animal',
    tags: ['horse', 'cavalry', 'knight', 'troy', 'trojan', 'gallop', 'race', 'napoleon', 'farm', 'ride', 'pony', 'stallion', 'power', 'horsepower', 'mongol', 'cowboy'],
    soundsLike: ['horse', 'hors', 'cheval', 'chev', 'whores', 'hoarse', 'force', 'pony'],
    anims: ['march', 'bounce', 'idle', 'dance', 'flip'], build: horse,
    idle: (r, t, k) => add(r, 'head', 'x', Math.sin(t * 1.4) * 0.07 * k),
  },
  {
    id: 'turkey', name: 'Turkey', category: 'animal',
    tags: ['turkey', 'ankara', 'istanbul', 'ottoman', 'thanksgiving', 'feast', 'november', 'usa', 'gobble', 'bird', 'farm', 'christmas', 'harvest'],
    soundsLike: ['turkey', 'turk', 'turquie', 'dinde', 'dind', 'gobble', 'key'],
    anims: ['march', 'dance', 'shake', 'wobble', 'idle'], build: turkey,
    idle: (r, t, k) => { add(r, 'tail', 'z', Math.sin(t * 1.5) * 0.06 * k); add(r, 'head', 'x', Math.max(0, Math.sin(t * 3)) * 0.12 * k); },
  },
  {
    id: 'otter', name: 'Otter', category: 'animal',
    tags: ['otter', 'ottawa', 'canada', 'river', 'water', 'swim', 'play', 'cute', 'shell', 'float', 'holding hands', 'beaver'],
    soundsLike: ['otter', 'otta', 'ottawa', 'other', 'loutre', 'outre', 'utter', 'hot'],
    anims: ['float', 'wobble', 'dance', 'spin', 'idle'], build: otter,
    idle: (r, t, k) => { add(r, 'tail', 'y', Math.sin(t * 1.4) * 0.15 * k); add(r, 'head', 'z', Math.sin(t * 1.1) * 0.08 * k); },
  },
  {
    id: 'sheep', name: 'Sheep', category: 'animal',
    tags: ['sheep', 'lamb', 'wool', 'flock', 'follow', 'sleep', 'counting', 'dolly', 'clone', 'new zealand', 'wales', 'farm', 'shepherd', 'meek'],
    soundsLike: ['sheep', 'ship', 'cheap', 'mouton', 'mout', 'baa', 'bah', 'ewe', 'you'],
    anims: ['march', 'bounce', 'rain', 'stack', 'wobble'], build: sheep,
    idle: (r, t, k) => add(r, 'head', 'z', Math.sin(t * 1.2) * 0.08 * k),
  },
];
