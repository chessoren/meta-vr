/**
 * People — chunky toy figures (big head ≈ 45 % of the height, stubby limbs, glossy eyes).
 * Six meshes each: body, head, armL, armR, legL, legR. L = the figure's left = +X (faces +Z).
 * Idle functions ADD to joint rotations (anims.ts resets joints each frame).
 * No weapons: the soldier carries nothing, the knight a shield only.
 */
import * as THREE from 'three';
import type { ModelSpec } from '../spec';
import {
  PAL, ball, box, cone, cyl, sphere, lathe, torus, extrude, dodeca, part, joint, model, sym, sweep, limb, curve, eyePair, smile, cheeks, tintOr, shade,
  type V3,
} from '../kit';

type Geo = THREE.BufferGeometry;
const ell = (c: V3, s: V3, col: string, seg: [number, number] = [9, 6], ao = 0.15, rot?: V3) =>
  ball(1, col, { pos: c, scale: s, w: seg[0], h: seg[1], ao, rot });
function add(root: THREE.Object3D, n: string, axis: 'x' | 'y' | 'z', v: number) {
  const j = root.getObjectByName(n);
  if (j) j.rotation[axis] += v;
}

/** A lathe split into horizontal colour bands (stripes cost no extra triangles). */
function bandLathe(profile: [number, number][], cuts: number[], cols: string[], o: { seg?: number; scale?: [number, number, number] } = {}): Geo[] {
  const rAt = (y: number) => {
    for (let i = 1; i < profile.length; i++) {
      const [r0, y0] = profile[i - 1];
      const [r1, y1] = profile[i];
      if (y <= y1 || i === profile.length - 1) return r0 + ((r1 - r0) * (y - y0)) / Math.max(1e-6, y1 - y0);
    }
    return 0;
  };
  const ys = [profile[0][1], ...cuts, profile[profile.length - 1][1]];
  const out: Geo[] = [];
  for (let b = 0; b < ys.length - 1; b++) {
    const pts: [number, number][] = [[rAt(ys[b]), ys[b]]];
    for (const [r, y] of profile) if (y > ys[b] && y < ys[b + 1]) pts.push([r, y]);
    pts.push([rAt(ys[b + 1]), ys[b + 1]]);
    if (b === 0 && profile[0][0] === 0) pts[0] = [0, ys[0]];
    out.push(lathe(pts, cols[b % cols.length], { seg: o.seg ?? 10, scale: o.scale, ao: 0.08 }));
  }
  return out;
}

/** Key heights of the toy figure (metres, before normalisation). */
const H = { hip: 0.075, shoulder: 0.148, neck: 0.158, head: 0.218, headR: 0.068, top: 0.29 };

interface Figure {
  id: string;
  skin?: string;
  top: string;
  bottom: string;
  shoes: string;
  sleeve?: string;
  hands?: string;
  /** Extra parts on the torso (belts, collars, buttons, robes). */
  torso?: Geo[];
  /** Extra parts on the head (hats, hair, glasses…), model frame. */
  head?: Geo[];
  /** Extra parts per arm (s = +1 left, −1 right). */
  arm?: (s: 1 | -1) => Geo[];
  /** Extra parts per leg. */
  leg?: (s: 1 | -1) => Geo[];
  /** Replace the default face details below the eyes (moustache, beard…). */
  face?: Geo[];
  /** Hide the default ears (helmets, caps). */
  noEars?: boolean;
  /** Torso lathe profile override (lab coats, robes flare). */
  torsoProfile?: [number, number][];
  /** Horizontal stripes on the torso: cut heights + alternating colours. */
  stripes?: { cuts: number[]; cols: string[] };
  /** Arm pose: outward angle of the upper arm (default 0.35 rad). */
  armOut?: number;
  eyeY?: number;
}

function figure(f: Figure): THREE.Group {
  const skin = f.skin ?? PAL.skin;
  const sleeve = f.sleeve ?? f.top;
  const hands = f.hands ?? skin;
  const out = f.armOut ?? 0.35;
  const prof = f.torsoProfile ?? [[0, 0.064], [0.05, 0.066], [0.057, 0.09], [0.055, 0.128], [0.046, 0.152], [0.022, 0.16], [0, 0.161]];
  const body: Geo[] = [
    ...(f.stripes ? bandLathe(prof, f.stripes.cuts, f.stripes.cols, { scale: [1, 1, 0.82] }) : [lathe(prof, f.top, { seg: 10, scale: [1, 1, 0.82] })]),
    cyl(0.02, 0.022, 0.02, skin, { pos: [0, H.neck, 0], seg: 7, ao: 0 }),
    ...(f.torso ?? []),
  ];
  const eyeY = f.eyeY ?? 0.223;
  const head = joint('head', [0, H.neck, 0], [
    ell([0, H.head, 0.003], [H.headR, H.headR * 0.96, H.headR * 0.92], skin, [10, 7], 0.08),
    ...(f.noEars ? [] : sym(ell([0.066, 0.214, 0], [0.012, 0.016, 0.01], skin, [5, 4], 0))),
    ...eyePair({ x: 0.025, y: eyeY, z: 0.056, r: 0.0145, yaw: 0.38 }),
    ell([0, 0.207, 0.067], [0.009, 0.008, 0.008], shade(skin, -0.12), [5, 4], 0),
    ...(f.face ?? [smile([0, 0.19, 0.063], 0.022, PAL.ink, { tube: 0.0026 })]),
    ...cheeks(0.042, 0.2, 0.054, 0.0095, '#f19a9a', 0.62),
    ...(f.head ?? []),
  ]);
  const arm = (n: string, s: 1 | -1) => {
    const sh: V3 = [s * 0.054, H.shoulder - 0.006, 0];
    const hand: V3 = [s * (0.054 + Math.sin(out) * 0.06), H.shoulder - 0.006 - Math.cos(out) * 0.06, 0.012];
    return joint(n, sh, [
      limb([sh[0] - s * 0.004, sh[1] + 0.008, sh[2]], hand, 0.02, 0.016, sleeve, { sides: 6 }),
      ball(0.017, hands, { pos: [hand[0], hand[1] - 0.006, hand[2]], w: 6, h: 4, ao: 0.05 }),
      ...(f.arm?.(s) ?? []),
    ]);
  };
  const leg = (n: string, s: 1 | -1) => {
    const x = s * 0.026;
    return joint(n, [x, H.hip, 0], [
      limb([x, H.hip, 0], [x, 0.022, 0], 0.023, 0.021, f.bottom, { sides: 7 }),
      ell([x, 0.013, 0.01], [0.023, 0.014, 0.031], f.shoes, [7, 4], 0.1),
      ...(f.leg?.(s) ?? []),
    ]);
  };
  return model(f.id, body, [head, arm('armL', 1), arm('armR', -1), leg('legL', 1), leg('legR', -1)]);
}

// ─── soldier (WWI "Tommy" toy: Brodie helmet, khaki, puttees — no weapon) ───
function soldier(o: { tint?: string }) {
  const kh = tintOr(o, '#a8955e') as string;
  const helmet = '#5f6a36';
  const leather = '#6b4226';
  return figure({
    id: 'soldier', top: kh, bottom: kh, shoes: leather,
    torso: [
      torus(0.052, 0.006, leather, { pos: [0, 0.082, 0], rot: [Math.PI / 2, 0, 0], seg: 12, scale: [1, 0.82, 1] }),
      box(0.01, 0.1, 0.006, leather, { pos: [0.005, 0.115, 0.043], rot: [0.12, 0, -0.62] }),
      box(0.018, 0.012, 0.01, PAL.brass, { pos: [0, 0.082, 0.046] }),
      ...[0.1, 0.12, 0.14].map((y) => sphere(0.0035, PAL.brass, { pos: [-0.012, y, 0.047 - (y - 0.1) * 0.12], seg: 0, ao: 0 })),
      ...sym(box(0.022, 0.018, 0.012, shade(kh, -0.12), { pos: [0.028, 0.125, 0.04], rot: [0.1, 0.25, 0] })),
      box(0.07, 0.06, 0.03, shade(kh, -0.2), { pos: [0, 0.118, -0.052] }),
      cyl(0.012, 0.012, 0.072, shade(kh, 0.1), { pos: [0, 0.155, -0.058], rot: [0, 0, Math.PI / 2], seg: 7 }),
    ],
    head: [
      lathe([[0.073, 0.25], [0.07, 0.268], [0.058, 0.29], [0.034, 0.306], [0.0, 0.31]], helmet, { seg: 12, rot: [-0.12, 0, 0] }),
      cyl(0.082, 0.09, 0.008, helmet, { pos: [0, 0.249, -0.003], rot: [-0.12, 0, 0], seg: 12 }),
      torus(0.089, 0.0045, shade(helmet, -0.3), { pos: [0, 0.2455, -0.003], rot: [Math.PI / 2 - 0.12, 0, 0], seg: 12, ao: 0 }),
    ],
    face: [
      smile([0, 0.19, 0.063], 0.022, PAL.ink, { tube: 0.0026 }),
      ...sym(ell([0.009, 0.198, 0.066], [0.011, 0.004, 0.005], '#6b4226', [6, 4], 0, [0, 0, -0.2])),
    ],
    leg: (s) => [0.03, 0.043, 0.056].map((y, i) => cyl(0.0245, 0.0245, 0.011, i % 2 ? shade(kh, -0.25) : shade(kh, -0.12), { pos: [s * 0.026, y, 0], rot: [0.2, 0, 0], seg: 7, ao: 0 })),
  });
}

// ─── king (crown, ermine-trimmed robe, beard, orb) ─────────────────────────
function king(o: { tint?: string }) {
  const robe = tintOr(o, PAL.crimson) as string;
  const ermine = PAL.white;
  const spots: Geo[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.5;
    spots.push(box(0.004, 0.009, 0.004, PAL.ink, { pos: [Math.sin(a) * 0.066, 0.143, Math.cos(a) * 0.057], rot: [0, a, 0] }));
  }
  const crownPts: Geo[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    crownPts.push(cone(0.012, 0.03, PAL.gold, { pos: [Math.sin(a) * 0.04, 0.3, Math.cos(a) * 0.04], seg: 4 }));
    crownPts.push(sphere(0.0055, PAL.gold, { pos: [Math.sin(a) * 0.04, 0.317, Math.cos(a) * 0.04], seg: 0 }));
  }
  return figure({
    id: 'king', top: robe, bottom: robe, shoes: PAL.gold, sleeve: robe,
    torsoProfile: [[0, 0.004], [0.075, 0.006], [0.07, 0.04], [0.062, 0.09], [0.055, 0.128], [0.046, 0.152], [0.022, 0.16], [0, 0.161]],
    torso: [
      torus(0.058, 0.014, ermine, { pos: [0, 0.148, 0], rot: [Math.PI / 2, 0, 0], seg: 10, scale: [1.1, 0.9, 1] }),
      ...spots,
      cyl(0.077, 0.078, 0.014, ermine, { pos: [0, 0.01, 0], seg: 12, scale: [1, 1, 0.86] }),
      box(0.03, 0.14, 0.01, ermine, { pos: [0, 0.075, 0.056], rot: [0.08, 0, 0] }),
      cyl(0.061, 0.061, 0.01, PAL.gold, { pos: [0, 0.086, 0], seg: 10, scale: [1, 1, 0.86], ao: 0 }),
    ],
    head: [
      cyl(0.05, 0.047, 0.03, PAL.gold, { pos: [0, 0.278, 0], seg: 9 }),
      cyl(0.046, 0.046, 0.02, robe, { pos: [0, 0.285, 0], seg: 9 }),
      ...crownPts,
      sphere(0.008, PAL.red, { pos: [0, 0.279, 0.049], seg: 0, ao: 0 }),
      ...sym(sphere(0.0065, PAL.blue, { pos: [0.033, 0.279, 0.037], seg: 0, ao: 0 })),
      ...sym(dodeca(0.022, PAL.white, { pos: [0.06, 0.24, -0.01] })),
    ],
    face: [
      ...[[0, 0.168, 0.05, 0.032], [0.028, 0.178, 0.045, 0.024], [-0.028, 0.178, 0.045, 0.024], [0.047, 0.194, 0.03, 0.02], [-0.047, 0.194, 0.03, 0.02]].map(([x, y, z, r]) => dodeca(r, PAL.white, { pos: [x, y, z] })),
      smile([0, 0.19, 0.07], 0.016, PAL.ink, { tube: 0.0024 }),
    ],
    arm: (s) => (s === -1 ? [ball(0.02, PAL.gold, { pos: [s * 0.078, 0.097, 0.02], w: 6, h: 5 }), cone(0.008, 0.016, PAL.gold, { pos: [s * 0.078, 0.122, 0.02], seg: 4 })] : []),
  });
}

// ─── sailor (French marin: striped marinière, beret with red pompom) ───────
function sailor(o: { tint?: string }) {
  const navy = tintOr(o, PAL.navy) as string;
  return figure({
    id: 'sailor', top: PAL.white, bottom: navy, shoes: PAL.ink, sleeve: PAL.white,
    stripes: { cuts: [0.075, 0.083, 0.091, 0.099, 0.107, 0.115, 0.123, 0.131], cols: [PAL.white, navy] },
    torso: [
      box(0.085, 0.045, 0.006, navy, { pos: [0, 0.14, -0.045], rot: [-0.25, 0, 0] }),
      box(0.087, 0.004, 0.007, PAL.white, { pos: [0, 0.121, -0.041], rot: [-0.25, 0, 0] }),
      ...sym(box(0.012, 0.05, 0.006, navy, { pos: [0.026, 0.14, 0.04], rot: [0.3, 0, -0.5] })),
      ...sym(cone(0.01, 0.03, PAL.red, { pos: [0.006, 0.125, 0.05], rot: [0.2, 0, 0.35], seg: 4, ao: 0 })),
      sphere(0.008, PAL.red, { pos: [0, 0.14, 0.047], seg: 0, ao: 0 }),
    ],
    head: [
      cyl(0.06, 0.065, 0.014, PAL.white, { pos: [0, 0.272, 0], rot: [-0.18, 0, 0.1], seg: 12 }),
      cyl(0.074, 0.074, 0.012, PAL.white, { pos: [0, 0.284, -0.004], rot: [-0.18, 0, 0.1], seg: 12 }),
      cyl(0.061, 0.061, 0.008, navy, { pos: [0, 0.268, 0.0], rot: [-0.18, 0, 0.1], seg: 12, ao: 0 }),
      dodeca(0.016, PAL.red, { pos: [0.004, 0.297, -0.006] }),
      ...sym(dodeca(0.014, '#5a3a22', { pos: [0.055, 0.25, 0.01] })),
    ],
    leg: (s) => [cyl(0.026, 0.022, 0.022, navy, { pos: [s * 0.026, 0.032, 0], seg: 8 })],
  });
}

// ─── pilot (WWI aviator: leather cap, goggles up, flowing scarf) ───────────
function pilot(o: { tint?: string }) {
  const jacket = tintOr(o, '#7a4a2a') as string;
  const cap = '#6b4226';
  const scarf = curve([0.02, 0.157, 0.04], [0.12, 0.18, -0.02], [0.14, 0.13, -0.09], 7);
  return figure({
    id: 'pilot', top: jacket, bottom: '#c2aa76', shoes: '#4a2c1c', sleeve: jacket, noEars: true,
    torso: [
      torus(0.035, 0.012, PAL.cream, { pos: [0, 0.155, 0.003], rot: [Math.PI / 2, 0, 0], seg: 10 }),
      box(0.004, 0.08, 0.004, '#4a2c1c', { pos: [0, 0.11, 0.048] }),
      sweep(scarf, (u) => 0.013 - u * 0.004, PAL.white, { flat: 0.35, sides: 6 }),
    ],
    head: [
      ell([0, 0.228, -0.004], [0.071, 0.07, 0.07], cap, [10, 7], 0.1),
      ...sym(ell([0.06, 0.2, 0.012], [0.014, 0.03, 0.022], cap, [5, 4], 0.05)),
      torus(0.06, 0.004, shade(cap, -0.25), { pos: [0, 0.265, 0.02], rot: [1.25, 0, 0], seg: 9, scale: [1.12, 1, 1] }),
      ...sym(torus(0.017, 0.0055, PAL.brass, { pos: [0.022, 0.268, 0.05], rot: [-0.55, 0.2, 0], seg: 7 }), ell([0.022, 0.268, 0.05], [0.014, 0.014, 0.004], '#9fd6ee', [6, 4], 0, [-0.55, 0.2, 0])),
    ],
    leg: (s) => [cyl(0.025, 0.024, 0.045, '#4a2c1c', { pos: [s * 0.026, 0.035, 0], seg: 8 }), ell([s * 0.03, 0.068, 0], [0.028, 0.018, 0.026], '#c2aa76', [7, 5], 0.1)],
  });
}

// ─── scientist (lab coat, round glasses, wild hair, bubbling flask) ────────
function scientist(o: { tint?: string }) {
  const coat = tintOr(o, '#f6f4ef') as string;
  const hair = '#e9e6e0';
  return figure({
    id: 'scientist', top: coat, bottom: PAL.charcoal, shoes: PAL.woodDark, sleeve: coat,
    torsoProfile: [[0, 0.03], [0.066, 0.032], [0.064, 0.06], [0.058, 0.1], [0.055, 0.128], [0.046, 0.152], [0.022, 0.16], [0, 0.161]],
    torso: [
      extrude([[-0.022, 0], [0.022, 0], [0.0, -0.05]], 0.006, PAL.teal, { pos: [0, 0.158, 0.043], rot: [0.12, 0, 0] }),
      box(0.009, 0.045, 0.004, PAL.purple, { pos: [0, 0.128, 0.05], rot: [0.12, 0, 0] }),
      ...sym(box(0.004, 0.11, 0.004, shade(coat, -0.15), { pos: [0.008, 0.09, 0.052], rot: [0.08, 0, 0] })),
      box(0.02, 0.018, 0.004, shade(coat, -0.1), { pos: [0.03, 0.12, 0.046], rot: [0.1, 0.35, 0] }),
      box(0.003, 0.018, 0.003, PAL.blue, { pos: [0.026, 0.13, 0.049] }),
      box(0.003, 0.016, 0.003, PAL.red, { pos: [0.032, 0.13, 0.048] }),
    ],
    head: [
      ...sym(torus(0.016, 0.0028, PAL.ink, { pos: [0.025, 0.223, 0.07], seg: 8, ao: 0 }), box(0.03, 0.003, 0.003, PAL.ink, { pos: [0.05, 0.228, 0.045], rot: [0, 1.2, 0] })),
      box(0.012, 0.003, 0.003, PAL.ink, { pos: [0, 0.226, 0.074] }),
      ...[[0.058, 0.25, -0.01, 0.026], [-0.058, 0.25, -0.01, 0.026], [0.066, 0.225, -0.03, 0.022], [-0.066, 0.225, -0.03, 0.022], [0.04, 0.275, -0.02, 0.024], [-0.04, 0.275, -0.02, 0.024], [0, 0.28, -0.035, 0.028], [0, 0.245, -0.06, 0.03]].map(([x, y, z, r]) => dodeca(r, hair, { pos: [x, y, z] })),
      ...sym(ell([0.024, 0.244, 0.064], [0.014, 0.004, 0.005], hair, [6, 4], 0, [0, 0, -0.2])),
    ],
    face: [
      ell([0, 0.197, 0.066], [0.022, 0.007, 0.008], hair, [7, 4], 0),
      smile([0, 0.187, 0.064], 0.02, PAL.ink, { tube: 0.0025 }),
    ],
    arm: (s) => (s === -1 ? [
      lathe([[0, 0.0], [0.018, 0.0], [0.018, 0.004], [0.007, 0.026], [0.006, 0.036], [0, 0.036]], PAL.lime, { seg: 8, pos: [-0.08, 0.09, 0.03] }),
      cyl(0.0075, 0.0075, 0.012, '#dff3ff', { pos: [-0.08, 0.13, 0.03], seg: 7, ao: 0 }),
      sphere(0.006, PAL.lime, { pos: [-0.078, 0.142, 0.03], seg: 0, ao: 0 }),
      sphere(0.004, PAL.lime, { pos: [-0.083, 0.152, 0.032], seg: 0, ao: 0 }),
    ] : []),
  });
}

// ─── knight (silver armour, red plume, blue tabard, shield — no sword) ─────
function knight(o: { tint?: string }) {
  const tabard = tintOr(o, PAL.blue) as string;
  const steel = '#bcc6cf';
  const dark = '#8a96a2';
  const plume = curve([0, 0.305, -0.005], [0.01, 0.35, -0.04], [0.0, 0.3, -0.1], 7);
  return figure({
    id: 'knight', top: steel, bottom: steel, shoes: dark, sleeve: steel, hands: dark, noEars: true, armOut: 0.3,
    torso: [
      lathe([[0, 0.06], [0.058, 0.062], [0.062, 0.09], [0.06, 0.13], [0.0, 0.132]], tabard, { seg: 10, scale: [1, 1, 0.86] }),
      box(0.05, 0.012, 0.008, PAL.gold, { pos: [0, 0.108, 0.053] }),
      box(0.012, 0.05, 0.008, PAL.gold, { pos: [0, 0.1, 0.053] }),
      torus(0.058, 0.006, PAL.woodDark, { pos: [0, 0.07, 0], rot: [Math.PI / 2, 0, 0], seg: 12, scale: [1, 0.86, 1] }),
      ...sym(ell([0.05, 0.15, 0], [0.028, 0.018, 0.028], dark, [8, 5], 0.1)),
    ],
    head: [
      lathe([[0.075, 0.245], [0.064, 0.28], [0.04, 0.3], [0, 0.305]], steel, { seg: 12 }),
      part(new THREE.LatheGeometry([[0.06, 0.155], [0.07, 0.16], [0.076, 0.19], [0.075, 0.245]].map(([x, y]) => new THREE.Vector2(x, y)), 10, 0.85, Math.PI * 2 - 1.7), steel),
      torus(0.075, 0.005, dark, { pos: [0, 0.248, 0.0], rot: [Math.PI / 2 + 0.05, 0, 0], seg: 12, arc: Math.PI * 1.2, ao: 0 }).rotateY(-Math.PI * 0.1),
      box(0.006, 0.05, 0.006, dark, { pos: [0, 0.28, 0.066], rot: [-0.3, 0, 0] }),
      sweep(plume, (u) => 0.022 * Math.sin(Math.PI * (0.15 + u * 0.8)), PAL.red, { flat: 0.5, sides: 6, roll: Math.PI / 2 }),
      cyl(0.01, 0.012, 0.012, PAL.gold, { pos: [0, 0.306, -0.004], seg: 6 }),
    ],
    arm: (s) => (s === 1 ? [
      extrude([[-0.035, 0.03], [0.035, 0.03], [0.035, -0.01], [0, -0.05], [-0.035, -0.01]], 0.008, PAL.red, { pos: [0.1, 0.1, 0.025], rot: [0, 1.25, 0], bevel: 0.003 }),
      box(0.01, 0.06, 0.004, PAL.white, { pos: [0.108, 0.1, 0.027], rot: [0, 1.25, 0] }),
      box(0.045, 0.01, 0.004, PAL.white, { pos: [0.108, 0.108, 0.027], rot: [0, 1.25, 0] }),
    ] : []),
    face: [smile([0, 0.19, 0.063], 0.022, PAL.ink, { tube: 0.0026 })],
  });
}

export const SPECS: ModelSpec[] = [
  {
    id: 'soldier', name: 'Soldier', category: 'person',
    tags: ['soldier', 'war', 'army', 'wwi', 'ww1', 'great war', 'trench', 'tommy', 'poilu', 'infantry', 'veteran', 'armistice', 'remembrance', 'somme', 'verdun', 'marne', 'conscription', 'duty'],
    soundsLike: ['soldier', 'sold', 'solder', 'soldat', 'solde', 'tommy', 'poilu', 'troop'],
    anims: ['march', 'idle', 'shake', 'dance'], build: soldier,
    idle: (r, t, k) => { add(r, 'head', 'z', Math.sin(t * 1.1) * 0.05 * k); add(r, 'armR', 'x', Math.sin(t * 1.4) * 0.06 * k); },
  },
  {
    id: 'king', name: 'King', category: 'person',
    tags: ['king', 'monarch', 'royal', 'crown', 'throne', 'kingdom', 'louis', 'henry', 'george', 'charles', 'empire', 'power', 'rule', 'monarchy', 'coronation', 'regal', 'sovereign'],
    soundsLike: ['king', 'kin', 'roi', 'roy', 'rex', 'reign', 'rain', 'king kong'],
    anims: ['idle', 'wobble', 'dance', 'grow', 'spin'], build: king,
    idle: (r, t, k) => { add(r, 'head', 'z', Math.sin(t * 0.9) * 0.05 * k); add(r, 'armR', 'z', -Math.sin(t * 1.2) * 0.08 * k); },
  },
  {
    id: 'sailor', name: 'Sailor', category: 'person',
    tags: ['sailor', 'navy', 'sea', 'ship', 'marine', 'boat', 'ocean', 'port', 'harbour', 'jutland', 'fleet', 'voyage', 'france', 'brittany', 'popeye', 'captain'],
    soundsLike: ['sailor', 'sail', 'sale', 'marin', 'matelot', 'navy', 'marine', 'tailor'],
    anims: ['dance', 'wobble', 'march', 'idle'], build: sailor,
    idle: (r, t, k) => { add(r, 'armL', 'z', Math.sin(t * 1.6) * 0.1 * k); add(r, 'head', 'z', Math.sin(t * 1.1) * 0.06 * k); },
  },
  {
    id: 'pilot', name: 'Pilot', category: 'person',
    tags: ['pilot', 'aviator', 'flight', 'plane', 'air', 'sky', 'red baron', 'ace', 'wwi', 'raf', 'lindbergh', 'bleriot', 'wright', 'aviation', 'flying', 'captain'],
    soundsLike: ['pilot', 'pile', 'pilote', 'pie lot', 'ace', 'aviator', 'plot'],
    anims: ['fly', 'idle', 'march', 'float'], build: pilot,
    idle: (r, t, k) => { add(r, 'armR', 'z', -Math.max(0, Math.sin(t * 1.3)) * 0.4 * k); add(r, 'head', 'x', Math.sin(t * 0.9) * 0.04 * k); },
  },
  {
    id: 'scientist', name: 'Scientist', category: 'person',
    tags: ['scientist', 'science', 'lab', 'laboratory', 'experiment', 'chemistry', 'einstein', 'curie', 'newton', 'pasteur', 'research', 'discovery', 'genius', 'professor', 'doctor', 'invention'],
    soundsLike: ['scientist', 'science', 'sign', 'savant', 'scient', 'eins', 'stein', 'prof'],
    anims: ['idle', 'shake', 'dance', 'bounce', 'wobble'], build: scientist,
    idle: (r, t, k) => { add(r, 'armR', 'x', -Math.max(0, Math.sin(t * 1.5)) * 0.3 * k); add(r, 'head', 'z', Math.sin(t * 1.2) * 0.07 * k); },
  },
  {
    id: 'knight', name: 'Knight', category: 'person',
    tags: ['knight', 'medieval', 'middle ages', 'armour', 'armor', 'chivalry', 'crusade', 'castle', 'honour', 'quest', 'arthur', 'templar', 'hero', 'joust', 'noble', 'protect'],
    soundsLike: ['knight', 'night', 'nite', 'chevalier', 'cheval', 'sir', 'nuit', 'k-night'],
    anims: ['march', 'idle', 'shake', 'dance', 'wobble'], build: knight,
    idle: (r, t, k) => { add(r, 'head', 'z', Math.sin(t * 1.0) * 0.05 * k); add(r, 'armL', 'z', Math.sin(t * 1.3) * 0.05 * k); },
  },
];
