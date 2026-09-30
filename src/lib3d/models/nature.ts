/**
 * Nature — storybook elements: lollipop tree, snow-capped peaks, smiling sun, sleepy moon,
 * chunky star, puffy cloud, thunder cloud, snowflake, campfire, curling wave.
 * Joints: head (sway), spin (rays / flake rotate around local Z), flame (flicker).
 * Idle functions ADD to joint rotations (anims.ts resets joints each frame).
 */
import * as THREE from 'three';
import type { ModelSpec } from '../spec';
import { PAL, ball, box, cone, cyl, sphere, lathe, extrude, part, dodeca, joint, model, sym, limb, eyePair, smile, cheeks, tintOr, shade, rng, torus, type V3 } from '../kit';

type Geo = THREE.BufferGeometry;
const ell = (c: V3, s: V3, col: string, seg: [number, number] = [9, 6], ao = 0.15, rot?: V3) =>
  ball(1, col, { pos: c, scale: s, w: seg[0], h: seg[1], ao, rot });
function add(root: THREE.Object3D, n: string, axis: 'x' | 'y' | 'z', v: number) {
  const j = root.getObjectByName(n);
  if (j) j.rotation[axis] += v;
}
/** Deterministically jitter the vertices of a part (craggy rocks), keeping y ≥ 0 vertices at y = 0 fixed. */
function jitter(g: Geo, amt: number, seed: number) {
  const r = rng(seed);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const key = (i: number) => `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
  const off = new Map<string, [number, number, number]>();
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    if (!off.has(k)) off.set(k, [(r() - 0.5) * amt, (r() - 0.5) * amt, (r() - 0.5) * amt]);
  }
  const ks = Array.from({ length: pos.count }, (_, i) => key(i));
  for (let i = 0; i < pos.count; i++) {
    const [dx, dy, dz] = off.get(ks[i])!;
    const y = pos.getY(i);
    pos.setXYZ(i, pos.getX(i) + dx, y > 1e-4 ? y + dy : y, pos.getZ(i) + dz);
  }
  return g;
}

/** Recolour whole faces of a painted part: fn(centroid) returns a colour or null to keep it. */
function paintFaces(g: Geo, fn: (x: number, y: number, z: number) => string | null) {
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const col = g.getAttribute('color') as THREE.BufferAttribute;
  const c = new THREE.Color();
  for (let i = 0; i + 2 < pos.count; i += 3) {
    const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    const k = fn(cx, cy, cz);
    if (!k) continue;
    c.set(k);
    for (let j = 0; j < 3; j++) col.setXYZ(i + j, c.r, c.g, c.b);
  }
  return g;
}

// ─── tree ───────────────────────────────────────────────────────────────────
function tree(o: { tint?: string }) {
  const leaf = tintOr(o, PAL.green) as string;
  const bark = '#7a4a2a';
  const body: Geo[] = [
    lathe([[0, 0], [0.045, 0.0], [0.028, 0.02], [0.022, 0.06], [0.02, 0.13], [0, 0.135]], bark, { seg: 7 }),
    ...[0, 2.1, 4.2].map((a) => limb([0, 0.012, 0], [Math.sin(a) * 0.05, 0.004, Math.cos(a) * 0.05], 0.014, 0.006, bark, { sides: 5 })),
    limb([0, 0.1, 0], [0.05, 0.15, 0.01], 0.012, 0.007, bark, { sides: 5 }),
  ];
  const canopy = joint('head', [0, 0.13, 0], [
    sphere(0.085, leaf, { pos: [0, 0.2, 0], seg: 1 }),
    sphere(0.06, shade(leaf, -0.15), { pos: [-0.07, 0.165, -0.01], seg: 1 }),
    sphere(0.062, shade(leaf, 0.12), { pos: [0.07, 0.175, 0.015], seg: 1 }),
    sphere(0.055, shade(leaf, 0.06), { pos: [0.01, 0.27, -0.01], seg: 1 }),
    sphere(0.05, shade(leaf, -0.08), { pos: [-0.03, 0.18, 0.07], seg: 1 }),
    ...[[0.05, 0.22, 0.07], [-0.06, 0.24, 0.04], [0.085, 0.15, 0.06]].map((p) => ball(0.011, PAL.red, { pos: p as V3, w: 6, h: 4, ao: 0 })),
  ]);
  return model('tree', body, [canopy]);
}

// ─── mountain ───────────────────────────────────────────────────────────────
function mountain(o: { tint?: string }) {
  const rock = tintOr(o, '#8e98ad') as string;
  const snow = PAL.white;
  const peak = (r: number, h: number, x: number, z: number, seed: number, col: string) => {
    const g = jitter(part(new THREE.ConeGeometry(r, h, 7, 4), col, { ao: 0.3 }), r * 0.16, seed);
    const rr = rng(seed + 5);
    paintFaces(g, (_x, y) => (y > h * (0.12 + rr() * 0.12) ? snow : null));
    g.translate(x, h / 2, z);
    return [g];
  };
  const pines = [[0.12, 0.08], [0.15, 0.03], [-0.14, 0.07], [0.02, 0.12]].flatMap(([x, z], i) => [
    cone(0.018, 0.045, i % 2 ? PAL.forest : PAL.green, { pos: [x, 0.03, z], seg: 5 }),
    cyl(0.004, 0.004, 0.01, PAL.woodDark, { pos: [x, 0.005, z], seg: 4 }),
  ]);
  const body: Geo[] = [
    ...peak(0.15, 0.25, 0.0, -0.02, 3, rock),
    ...peak(0.1, 0.16, -0.11, 0.02, 9, shade(rock, -0.12)),
    ...peak(0.085, 0.125, 0.11, 0.03, 17, shade(rock, 0.1)),
    ell([0, 0.004, 0.04], [0.2, 0.012, 0.1], PAL.lime, [10, 4], 0.1),
    ...pines,
  ];
  return model('mountain', body);
}

// ─── sun (smiling, rays spin) ──────────────────────────────────────────────
function sun(o: { tint?: string }) {
  const c = tintOr(o, '#f7c23a') as string;
  const C: V3 = [0, 0.15, 0];
  const body: Geo[] = [
    sphere(0.085, c, { pos: C, seg: 2, ao: 0.05 }),
    ...eyePair({ x: 0.03, y: 0.165, z: 0.072, r: 0.016, yaw: 0.3, sclera: null }),
    smile([0, 0.13, 0.082], 0.045, PAL.ink, { tube: 0.004, tilt: -0.3 }),
    ...cheeks(0.052, 0.138, 0.066, 0.013, PAL.orange, 0.65),
  ];
  const rays: Geo[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const long = i % 2 === 0;
    const len = long ? 0.06 : 0.04;
    const d = 0.098 + len / 2;
    rays.push(cone(long ? 0.022 : 0.016, len, long ? PAL.orange : PAL.amber, { pos: [C[0] + Math.sin(a) * d, C[1] + Math.cos(a) * d, -0.01], rot: [0, 0, -a], seg: 4, ao: 0 }));
  }
  return model('sun', body, [joint('spin', C, rays)]);
}

// ─── moon (sleepy crescent) ────────────────────────────────────────────────
function moon(o: { tint?: string }) {
  const c = tintOr(o, '#f3dc8a') as string;
  const shape = crescent(0.13, [0.07, 0.035], 0.112, 18, 14);
  const cx = -0.02;
  const body: Geo[] = [
    extrude(shape, 0.04, c, { pos: [cx, 0.13, 0], bevel: 0.012, ao: 0.1 }),
    torus(0.012, 0.0028, PAL.ink, { pos: [cx - 0.075, 0.155, 0.033], rot: [0, 0.35, Math.PI + 0.3], arc: Math.PI * 0.8, seg: 6, ao: 0 }),
    ell([cx - 0.07, 0.125, 0.034], [0.012, 0.008, 0.004], PAL.pink, [6, 4], 0, [0, 0.35, 0]),
    torus(0.011, 0.0026, PAL.ink, { pos: [cx - 0.095, 0.108, 0.03], rot: [0, 0.35, Math.PI + 0.5], arc: Math.PI * 0.7, seg: 6, ao: 0 }),
  ];
  // a tiny star keeping it company
  const star = (x: number, y: number, s: number) => starGeo(s, s * 0.45, s * 0.3, PAL.yellow).translate(x, y, 0.01);
  body.push(star(0.075, 0.2, 0.025), star(0.1, 0.1, 0.016));
  return model('moon', body);
}

/** Crescent outline: outer circle (radius R at origin) minus inner circle (centre C, radius r). */
function crescent(R: number, C: [number, number], r: number, nOut: number, nIn: number): [number, number][] {
  const d = Math.hypot(C[0], C[1]);
  const al = Math.atan2(C[1], C[0]);
  const a = (R * R - r * r + d * d) / (2 * d);
  const be = Math.atan2(Math.sqrt(Math.max(0, R * R - a * a)), a);
  const pts: [number, number][] = [];
  for (let i = 0; i <= nOut; i++) {
    const t = al + be + ((2 * Math.PI - 2 * be) * i) / nOut;
    pts.push([Math.cos(t) * R, Math.sin(t) * R]);
  }
  const pm = pts[pts.length - 1];
  const pp = pts[0];
  const psiM = Math.atan2(pm[1] - C[1], pm[0] - C[0]);
  const psiP = Math.atan2(pp[1] - C[1], pp[0] - C[0]);
  let D = (psiP - psiM + 4 * Math.PI) % (2 * Math.PI);
  const mid = (dd: number) => { const q = psiM + dd / 2; return Math.hypot(C[0] + Math.cos(q) * r, C[1] + Math.sin(q) * r); };
  if (mid(D - 2 * Math.PI) < mid(D)) D -= 2 * Math.PI;
  for (let i = 1; i < nIn; i++) {
    const q = psiM + (D * i) / nIn;
    pts.push([C[0] + Math.cos(q) * r, C[1] + Math.sin(q) * r]);
  }
  return pts;
}

/** A chunky 5-point star (pyramids front & back), 20 triangles. Faces +Z, centred on origin. */
function starGeo(R: number, r: number, depth: number, col: string): Geo {
  const v: number[] = [];
  const rim: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i / 10) * Math.PI * 2;
    const rr = i % 2 ? r : R;
    rim.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  for (let i = 0; i < 10; i++) {
    const [x0, y0] = rim[i];
    const [x1, y1] = rim[(i + 1) % 10];
    v.push(0, 0, depth, x0, y0, 0, x1, y1, 0);
    v.push(0, 0, -depth, x1, y1, 0, x0, y0, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  return part(g, col, { ao: 0 });
}

// ─── star ───────────────────────────────────────────────────────────────────
function star(o: { tint?: string }) {
  const c = tintOr(o, '#f6cf3a') as string;
  const body = starGeo(0.15, 0.064, 0.05, c).translate(0, 0.15 * Math.cos(Math.PI / 5) + 0.0, 0);
  const inner = starGeo(0.085, 0.036, 0.058, shade(c, 0.35)).translate(0, 0.15 * Math.cos(Math.PI / 5), 0.002);
  return model('star', [body, inner]);
}

// ─── cloud ──────────────────────────────────────────────────────────────────
function cloudPuffs(col: string, face: boolean): Geo[] {
  const lo = shade(col, -0.2);
  const g: Geo[] = [
    ell([0, 0.055, 0], [0.15, 0.045, 0.075], lo, [10, 6], 0.1),
    sphere(0.075, col, { pos: [0, 0.1, 0], seg: 1, ao: 0.25 }),
    sphere(0.058, col, { pos: [-0.08, 0.075, 0.01], seg: 1, ao: 0.25 }),
    sphere(0.06, col, { pos: [0.085, 0.078, -0.005], seg: 1, ao: 0.25 }),
    sphere(0.048, col, { pos: [-0.035, 0.155, -0.01], seg: 1, ao: 0.2 }),
    sphere(0.042, col, { pos: [0.045, 0.145, 0.0], seg: 1, ao: 0.2 }),
  ];
  if (face) g.push(...eyePair({ x: 0.028, y: 0.105, z: 0.07, r: 0.012, yaw: 0.3, sclera: null }), smile([0, 0.083, 0.074], 0.022, PAL.ink, { tube: 0.003 }), ...cheeks(0.05, 0.088, 0.064, 0.01));
  return g;
}
function cloud(o: { tint?: string }) {
  const c = tintOr(o, '#f7f9fc') as string;
  const all = cloudPuffs(c, true);
  const top = all.splice(4, 2);
  return model('cloud', all, [joint('head', [0, 0.13, 0], top)]);
}

// ─── lightning (thunder cloud + zigzag bolt) ───────────────────────────────
function lightning(o: { tint?: string }) {
  const bolt = tintOr(o, '#ffd23a') as string;
  const puffs = cloudPuffs('#7d8697', false).map((g) => g.translate(0, 0.13, -0.02));
  const zz: [number, number][] = [[0.025, 0.16], [-0.04, 0.16], [-0.06, 0.08], [-0.02, 0.085], [-0.045, 0.0], [0.04, 0.1], [0.0, 0.095]];
  const big = zz.map(([x, y]) => [x * 1.45, y * 1.25 - 0.05] as [number, number]);
  const flame = joint('flame', [0, 0.14, 0.02], [
    extrude(big, 0.026, bolt, { pos: [0.01, 0.05, 0.02], bevel: 0.005, ao: 0 }),
    extrude(big.map(([x, y]) => [x * 0.55 + 0.004, y * 0.8 + 0.02] as [number, number]), 0.01, '#fff3b0', { pos: [0.008, 0.05, 0.04], ao: 0 }),
  ]);
  return model('lightning', puffs, [flame]);
}

// ─── snowflake ─────────────────────────────────────────────────────────────
function snowflake(o: { tint?: string }) {
  const c = tintOr(o, '#bfe6ff') as string;
  const d = shade(c, -0.25);
  const arms: Geo[] = [cyl(0.03, 0.03, 0.018, d, { rot: [Math.PI / 2, 0, 0], seg: 6, ao: 0 })];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const g: Geo[] = [
      box(0.02, 0.15, 0.014, c, { pos: [0, 0.075, 0], ao: 0 }),
      ...sym(box(0.012, 0.05, 0.012, c, { pos: [0.017, 0.085, 0], rot: [0, 0, -0.8], ao: 0 }), box(0.01, 0.035, 0.012, c, { pos: [0.013, 0.12, 0], rot: [0, 0, -0.8], ao: 0 })),
      cone(0.016, 0.028, PAL.white, { pos: [0, 0.158, 0], seg: 4, ao: 0 }),
    ];
    for (const p of g) arms.push(p.rotateZ(a));
  }
  return model('snowflake', [], [joint('spin', [0, 0.172, 0], arms.map((g) => g.translate(0, 0.172, 0)))]);
}

// ─── fire (campfire) ───────────────────────────────────────────────────────
function fire(o: { tint?: string }) {
  const f = tintOr(o, '#e8502f') as string;
  const logs: Geo[] = [];
  [0.4, -0.4, 1.57].forEach((a, i) => {
    logs.push(cyl(0.022, 0.022, 0.2, i === 2 ? '#8a5a36' : '#7a4a2a', { pos: [0, 0.024 + i * 0.012, 0], rot: [0, a, Math.PI / 2], seg: 7 }));
    for (const s of [1, -1]) logs.push(cyl(0.017, 0.017, 0.004, PAL.woodLight, { pos: [Math.cos(a) * 0.1 * s, 0.024 + i * 0.012, -Math.sin(a) * 0.1 * s], rot: [0, a, Math.PI / 2], seg: 7, ao: 0 }));
  });
  const stones: Geo[] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    stones.push(dodeca(0.024, i % 2 ? PAL.stone : shade(PAL.stone, -0.15), { pos: [Math.sin(a) * 0.125, 0.014, Math.cos(a) * 0.125], scale: [1, 0.65, 1] }));
  }
  const drop = (h: number, r: number, col: string, pos: V3, tilt = 0) =>
    lathe([[0, 0], [r * 0.8, h * 0.08], [r, h * 0.28], [r * 0.75, h * 0.55], [r * 0.3, h * 0.82], [0, h]], col, { seg: 7, pos, rot: [0, 0, tilt], scale: [1, 1, 0.7], ao: 0 });
  const flame = joint('flame', [0, 0.04, 0], [
    drop(0.22, 0.07, f, [0, 0.03, 0]),
    drop(0.13, 0.045, f, [0.06, 0.03, 0.01], -0.35),
    drop(0.12, 0.04, f, [-0.058, 0.03, 0.0], 0.4),
    drop(0.16, 0.05, PAL.orange, [0, 0.035, 0.022]),
    drop(0.085, 0.03, PAL.orange, [0.05, 0.035, 0.03], -0.3),
    drop(0.09, 0.028, '#ffd84a', [0, 0.04, 0.042]),
  ]);
  return model('fire', [...logs, ...stones], [flame]);
}

// ─── wave ───────────────────────────────────────────────────────────────────
function wave(o: { tint?: string }) {
  const c = tintOr(o, '#2f86c9') as string;
  const curl: [number, number][] = [
    [-0.15, 0], [0.15, 0], [0.14, 0.04], [0.12, 0.1], [0.09, 0.16], [0.05, 0.21], [0.0, 0.24], [-0.05, 0.248], [-0.1, 0.232],
    [-0.13, 0.2], [-0.137, 0.165], [-0.115, 0.148], [-0.1, 0.17], [-0.07, 0.19], [-0.04, 0.195], [-0.012, 0.178], [0.006, 0.148],
    [-0.002, 0.108], [-0.04, 0.078], [-0.09, 0.06], [-0.15, 0.05],
  ];
  const band: [number, number][] = [[0.14, 0.02], [0.13, 0.06], [0.1, 0.13], [0.06, 0.19], [0.02, 0.22], [0.035, 0.17], [0.05, 0.12], [0.06, 0.06], [0.07, 0.02]];
  const body: Geo[] = [
    extrude(curl, 0.12, c, { pos: [0, 0, -0.01], bevel: 0.01, ao: 0.1 }),
    extrude(band, 0.02, shade(c, 0.3), { pos: [0, 0, 0.055], ao: 0 }),
    ell([0, 0.006, 0.01], [0.19, 0.012, 0.11], shade(c, -0.15), [10, 4], 0.05),
    ...[-0.12, -0.05, 0.03, 0.1].map((x, i) => ell([x, 0.012, 0.075], [0.03 + (i % 2) * 0.01, 0.01, 0.012], PAL.white, [6, 4], 0)),
  ];
  const r = rng(3);
  const foam: Geo[] = [];
  const crest: V3[] = [[0.03, 0.235, 0.0], [-0.02, 0.25, 0.0], [-0.07, 0.245, 0.0], [-0.11, 0.225, 0.0], [-0.135, 0.19, 0.0], [-0.13, 0.16, 0.0]];
  crest.forEach((p, i) => {
    foam.push(sphere(0.02 + r() * 0.008, PAL.white, { pos: [p[0], p[1], p[2] + (i % 2 ? 0.035 : -0.035)], seg: 1, ao: 0.05 }));
    foam.push(sphere(0.018 + r() * 0.006, '#e8f4fb', { pos: [p[0], p[1] + 0.005, p[2] + 0.06 * (i % 2 ? -1 : 1) * 0.5], seg: 0, ao: 0 }));
  });
  foam.push(sphere(0.008, PAL.white, { pos: [-0.16, 0.2, 0.03], seg: 0, ao: 0 }), sphere(0.006, PAL.white, { pos: [-0.165, 0.17, -0.02], seg: 0, ao: 0 }));
  return model('wave', body, [joint('head', [0, 0.2, 0], foam)]);
}

export const SPECS: ModelSpec[] = [
  {
    id: 'tree', name: 'Tree', category: 'nature',
    tags: ['tree', 'forest', 'nature', 'family tree', 'genealogy', 'oak', 'growth', 'life', 'roots', 'ecology', 'lebanon', 'cedar', 'knowledge', 'eden', 'wood', 'oxygen', 'plant', 'leaf', 'breath', 'o2'],
    soundsLike: ['tree', 'three', 'tri', 'arbre', 'arb', 'oak', 'tre', 'try'],
    anims: ['idle', 'wobble', 'grow', 'shake'], build: tree,
    idle: (r, t, k) => { add(r, 'head', 'z', Math.sin(t * 1.1) * 0.04 * k); add(r, 'head', 'x', Math.sin(t * 0.8) * 0.02 * k); },
  },
  {
    id: 'mountain', name: 'Mountain', category: 'nature',
    tags: ['mountain', 'alps', 'everest', 'himalaya', 'summit', 'peak', 'climb', 'challenge', 'switzerland', 'nepal', 'andes', 'fuji', 'high', 'altitude', 'olympus', 'snow'],
    soundsLike: ['mount', 'mountain', 'mont', 'montagne', 'mon', 'moun', 'tain', 'pic'],
    anims: ['idle', 'grow', 'shake', 'wobble'], build: mountain,
  },
  {
    id: 'sun', name: 'Sun', category: 'nature',
    tags: ['sun', 'sunlight', 'day', 'summer', 'heat', 'energy', 'star', 'solar', 'japan', 'rising sun', 'louis xiv', 'sun king', 'ra', 'apollo', 'helios', 'argentina', 'light', 'tokyo', 'photosynthesis', 'rising'],
    soundsLike: ['sun', 'son', 'soleil', 'sol', 'sunny', 'sunday', 'sans'],
    anims: ['spin', 'float', 'grow', 'idle'], build: sun,
  },
  {
    id: 'moon', name: 'Moon', category: 'nature',
    tags: ['moon', 'night', 'lunar', 'apollo', 'armstrong', '1969', 'space', 'crescent', 'islam', 'turkey', 'month', 'tide', 'sleep', 'dream', 'luna'],
    soundsLike: ['moon', 'mun', 'lune', 'lun', 'luna', 'monday', 'lundi', 'mon'],
    anims: ['float', 'wobble', 'idle', 'spin'], build: moon,
  },
  {
    id: 'star', name: 'Star', category: 'nature',
    tags: ['star', 'night', 'sky', 'fame', 'celebrity', 'excellence', 'wish', 'usa', 'europe', 'eu', 'israel', 'soviet', 'china', 'christmas', 'bethlehem', 'hollywood', 'five'],
    soundsLike: ['star', 'star', 'etoile', 'stella', 'stal', 'stalin', 'astro', 'aster'],
    anims: ['spin', 'rain', 'float', 'orbit', 'juggle', 'grow'], build: star,
  },
  {
    id: 'cloud', name: 'Cloud', category: 'nature',
    tags: ['cloud', 'sky', 'weather', 'rain', 'dream', 'daydream', 'cloud nine', 'computing', 'data', 'fog', 'grey', 'london', 'soft', 'heaven', 'atmosphere', 'gas', 'air', 'steam', 'vapour', 'smoke'],
    soundsLike: ['cloud', 'clou', 'nuage', 'claude', 'loud', 'clown', 'crowd'],
    anims: ['float', 'idle', 'wobble', 'rain', 'grow'], build: cloud,
    idle: (r, t, k) => { add(r, 'head', 'z', Math.sin(t * 0.9) * 0.05 * k); add(r, 'head', 'y', Math.sin(t * 0.6) * 0.08 * k); },
  },
  {
    id: 'lightning', name: 'Lightning', category: 'nature',
    tags: ['lightning', 'thunder', 'storm', 'electricity', 'energy', 'zeus', 'thor', 'bolt', 'flash', 'speed', 'franklin', 'power', 'idea', 'shock', 'blitz', 'blitzkrieg', 'jupiter'],
    soundsLike: ['light', 'lightning', 'bolt', 'eclair', 'foudre', 'zeus', 'blitz', 'flash'],
    anims: ['shake', 'idle', 'float', 'wobble'], build: lightning,
  },
  {
    id: 'snowflake', name: 'Snowflake', category: 'nature',
    tags: ['snow', 'snowflake', 'winter', 'cold', 'ice', 'freeze', 'christmas', 'unique', 'crystal', 'russia', 'siberia', 'december', 'frost', 'six'],
    soundsLike: ['snow', 'flake', 'flocon', 'neige', 'no', 'snowflake', 'flic'],
    anims: ['spin', 'rain', 'float', 'orbit'], build: snowflake,
  },
  {
    id: 'fire', name: 'Fire', category: 'nature',
    tags: ['fire', 'flame', 'heat', 'burn', 'camp', 'campfire', 'prometheus', 'danger', 'passion', 'london', '1666', 'war', 'energy', 'bern', 'burn', 'revolution', 'carbon', 'combustion', 'boiling', 'smoke'],
    soundsLike: ['fire', 'fi', 'feu', 'flame', 'flamme', 'burn', 'bern', 'fyre'],
    anims: ['idle', 'shake', 'grow', 'dance'], build: fire,
  },
  {
    id: 'wave', name: 'Wave', category: 'nature',
    tags: ['wave', 'sea', 'ocean', 'water', 'surf', 'tsunami', 'tide', 'hokusai', 'japan', 'ottawa', 'beach', 'sound', 'frequency', 'physics', 'hello', 'goodbye', 'salt', 'pacific', 'wash'],
    soundsLike: ['wave', 'wa', 'wah', 'vague', 'vag', 'onde', 'ottawa', 'way', 'wash', 'washing'],
    anims: ['idle', 'wobble', 'float', 'shake'], build: wave,
    idle: (r, t, k) => { add(r, 'head', 'z', Math.sin(t * 1.6) * 0.06 * k); add(r, 'head', 'x', Math.sin(t * 1.1) * 0.04 * k); },
  },
];
