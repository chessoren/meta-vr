/**
 * Food — glossy, appetising, instantly readable silhouettes (cut avocado, Swiss cheese wheel,
 * pizza with a lifted slice, layered cake with flickering candles, steaming teacup).
 * Idle functions ADD to joint rotations (anims.ts resets joints each frame).
 */
import * as THREE from 'three';
import type { ModelSpec } from '../spec';
import { PAL, ball, cone, cyl, sphere, lathe, torus, extrude, part, joint, model, sweep, limb, curve, tintOr, shade, rng, type V3 } from '../kit';

type Geo = THREE.BufferGeometry;
const ell = (c: V3, s: V3, col: string, seg: [number, number] = [9, 6], ao = 0.15, rot?: V3) =>
  ball(1, col, { pos: c, scale: s, w: seg[0], h: seg[1], ao, rot });
function add(root: THREE.Object3D, n: string, axis: 'x' | 'y' | 'z', v: number) {
  const j = root.getObjectByName(n);
  if (j) j.rotation[axis] += v;
}
/** Circle outline (XY) as a polygon. */
const circle = (r: number, n: number, cx = 0, cy = 0, a0 = 0, a1 = Math.PI * 2): [number, number][] =>
  Array.from({ length: n }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / (a1 - a0 >= Math.PI * 2 - 1e-6 ? n : n - 1);
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as [number, number];
  });
/** Extrude an outline with holes (XY), centred on Z. */
function extrudeHoles(outline: [number, number][], holes: [number, number][][], depth: number, c: string, o: { pos?: V3; rot?: V3; bevel?: number } = {}) {
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  const b = o.bevel ?? 0;
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 1, curveSegments: 4 });
  g.translate(0, 0, -depth / 2);
  return part(g, c, { pos: o.pos, rot: o.rot, ao: 0.12 });
}

// ─── avocado (cut half, upright, pit facing the learner) ───────────────────
function avocado(o: { tint?: string }) {
  const skin = tintOr(o, '#3f6b2a') as string;
  const prof: [number, number][] = [[0, 0], [0.05, 0.004], [0.076, 0.03], [0.083, 0.068], [0.074, 0.11], [0.056, 0.148], [0.04, 0.178], [0.022, 0.198], [0, 0.205]];
  const shell = part(new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 12, Math.PI / 2, Math.PI), skin, { scale: [1, 1, 0.62], ao: 0.2 });
  const outline = (k: number): [number, number][] => {
    const right = prof.map(([r, y]) => [r * k, 0.103 + (y - 0.103) * k] as [number, number]);
    return [...right, ...right.slice(1, -1).reverse().map(([x, y]) => [-x, y] as [number, number])];
  };
  const body: Geo[] = [
    shell,
    extrude(outline(0.985), 0.01, '#b7d65c', { pos: [0, 0, 0.004], ao: 0 }),
    extrude(outline(0.8), 0.01, '#e4ec97', { pos: [0, 0.004, 0.009], ao: 0 }),
    ball(0.036, '#8a5230', { pos: [0, 0.066, 0.018], w: 10, h: 8, ao: 0.1 }),
    ell([-0.012, 0.08, 0.05], [0.009, 0.006, 0.003], shade('#8a5230', 0.45), [6, 4], 0),
  ];
  return model('avocado', body);
}

// ─── apple ──────────────────────────────────────────────────────────────────
function apple(o: { tint?: string }) {
  const c = tintOr(o, PAL.red) as string;
  const body = lathe(
    [[0, 0.01], [0.05, 0], [0.085, 0.03], [0.1, 0.07], [0.095, 0.11], [0.07, 0.14], [0.03, 0.135], [0, 0.12]],
    c,
    { seg: 12 },
  );
  const shine = ell([-0.045, 0.1, 0.07], [0.016, 0.022, 0.008], shade(c, 0.45), [6, 4], 0, [0.3, -0.6, 0.4]);
  const stem = cyl(0.006, 0.008, 0.045, PAL.woodDark, { pos: [0, 0.15, 0], rot: [0, 0, 0.2], seg: 5 });
  const leaf = joint('head', [0.012, 0.16, 0], [
    extrude([[0, 0], [0.03, 0.012], [0.055, 0], [0.03, -0.012]], 0.004, PAL.green, { pos: [0.012, 0.16, 0], rot: [0, 0.3, 0.5] }),
  ]);
  return model('apple', [body, shine, stem], [leaf]);
}

// ─── banana (a bunch of three) ─────────────────────────────────────────────
function banana(o: { tint?: string }) {
  const y = tintOr(o, '#f6d354') as string;
  const parts: Geo[] = [];
  [-0.034, 0, 0.034].forEach((z, i) => {
    const lift = i === 1 ? 0.03 : 0;
    const path = curve([-0.14, 0.11 + lift, z * 0.4], [0.0, -0.045 + lift, z], [0.14, 0.12 + lift, z * 1.3], 9);
    const rad = (u: number) => 0.004 + 0.024 * Math.pow(Math.sin(Math.PI * (0.06 + 0.88 * u)), 0.55);
    parts.push(sweep(path.slice(1), (u) => rad(0.12 + u * 0.88), y, { sides: 5, roll: 0.3 }));
    parts.push(limb(path[0], path[1], 0.007, 0.012, '#9bb04a', { sides: 5 }));
    const tip = path[path.length - 1];
    parts.push(ball(0.006, PAL.woodDark, { pos: tip, w: 5, h: 4, ao: 0 }));
  });
  parts.push(cyl(0.016, 0.014, 0.03, '#7a8a3a', { pos: [-0.145, 0.13, 0], rot: [0, 0, 0.9], seg: 6 }));
  return model('banana', parts);
}

// ─── cheese (Swiss wheel, wedge cut out, real holes) ───────────────────────
function cheese(o: { tint?: string }) {
  const c = tintOr(o, '#f5c843') as string;
  const hole = shade(c, -0.25);
  const R = 0.13;
  const cut = 0.85;
  const outline: [number, number][] = [[0, 0], ...circle(R, 20, 0, 0, cut / 2, Math.PI * 2 - cut / 2)];
  const holes: [number, number][][] = [
    circle(0.022, 8, -0.06, 0.03).reverse(),
    circle(0.016, 7, 0.02, -0.075).reverse(),
    circle(0.013, 7, -0.03, -0.05).reverse(),
    circle(0.018, 7, 0.0, 0.085).reverse(),
    circle(0.011, 6, -0.095, -0.03).reverse(),
  ];
  const body: Geo[] = [
    extrudeHoles(outline, holes, 0.085, c, { rot: [-Math.PI / 2, 0, -Math.PI / 2], pos: [0, 0.0425, 0] }),
  ];
  // dimples on the two cut faces (the gap is centred on +Z) and on the rind
  const faceDimple = (b: number, d: number, h: number, r: number) => {
    const n: V3 = b > 0 ? [-Math.cos(b), 0, Math.sin(b)] : [Math.cos(b), 0, -Math.sin(b)];
    return cyl(r, r, 0.004, hole, { pos: [Math.sin(b) * d + n[0] * 0.001, h, Math.cos(b) * d + n[2] * 0.001], rot: [0, b, Math.PI / 2], seg: 7, ao: 0 });
  };
  body.push(faceDimple(cut / 2, 0.06, 0.042, 0.013), faceDimple(cut / 2, 0.102, 0.058, 0.009), faceDimple(-cut / 2, 0.082, 0.036, 0.012), faceDimple(-cut / 2, 0.035, 0.06, 0.008));
  const r = rng(11);
  for (let i = 0; i < 6; i++) {
    const phi = cut / 2 + 0.45 + i * 0.85 + r() * 0.2;
    body.push(cyl(0.01 + r() * 0.006, 0.01, 0.006, hole, { pos: [Math.sin(phi) * R, 0.02 + r() * 0.045, Math.cos(phi) * R], rot: [0, phi + Math.PI / 2, Math.PI / 2], seg: 7, ao: 0 }));
  }
  // the cut wedge, lying in front
  const wedge: [number, number][] = [[0, 0], ...circle(0.11, 5, 0, 0, -0.36, 0.36)];
  body.push(extrudeHoles(wedge, [circle(0.012, 6, 0.06, 0.004).reverse()], 0.05, c, { rot: [-Math.PI / 2, 0, 0.35], pos: [0.02, 0.025, 0.12] }));
  return model('cheese', body);
}

// ─── cake (two tiers, drips, cherry, three candles) ────────────────────────
function cake(o: { tint?: string }) {
  const sponge = tintOr(o, '#f4a3b8') as string;
  const icing = PAL.cream;
  const drips: Geo[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const len = 0.014 + (i % 3) * 0.008;
    drips.push(ell([Math.sin(a) * 0.104, 0.098 - len / 2, Math.cos(a) * 0.104], [0.012, len, 0.008], icing, [6, 4], 0, [0, a, 0]));
  }
  const berries: Geo[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const p: V3 = [Math.sin(a) * 0.086, 0.117, Math.cos(a) * 0.086];
    berries.push(ell(p, [0.012, 0.014, 0.012], PAL.red, [6, 5], 0.1), cone(0.009, 0.006, PAL.green, { pos: [p[0], p[1] + 0.014, p[2]], seg: 5, ao: 0 }));
  }
  const candleX = [-0.03, 0, 0.03];
  const body: Geo[] = [
    cyl(0.135, 0.13, 0.012, PAL.white, { pos: [0, 0.006, 0], seg: 16 }),
    cyl(0.1, 0.1, 0.085, sponge, { pos: [0, 0.055, 0], seg: 14 }),
    cyl(0.104, 0.104, 0.012, icing, { pos: [0, 0.1, 0], seg: 14, ao: 0 }),
    cyl(0.101, 0.101, 0.008, shade(sponge, -0.2), { pos: [0, 0.055, 0], seg: 14, ao: 0 }),
    ...drips,
    ...berries,
    cyl(0.065, 0.065, 0.055, icing, { pos: [0, 0.133, 0], seg: 12 }),
    cyl(0.069, 0.069, 0.01, sponge, { pos: [0, 0.162, 0], seg: 12, ao: 0 }),
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => ball(0.007, sponge, { pos: [Math.sin(i * 0.785) * 0.066, 0.108, Math.cos(i * 0.785) * 0.066], w: 5, h: 4, ao: 0 })),
    ball(0.016, PAL.crimson, { pos: [0.035, 0.18, 0.03], w: 7, h: 6, ao: 0 }),
    sweep(curve([0.035, 0.192, 0.03], [0.04, 0.21, 0.03], [0.05, 0.215, 0.025], 4), 0.002, PAL.woodDark, { sides: 4 }),
    ...candleX.flatMap((x, i) => [
      cyl(0.006, 0.006, 0.045, [PAL.sky, PAL.yellow, PAL.pink][i], { pos: [x, 0.19, -0.015], seg: 6, ao: 0 }),
      cyl(0.0062, 0.0062, 0.006, PAL.white, { pos: [x, 0.185, -0.015], seg: 6, ao: 0 }),
      cyl(0.0062, 0.0062, 0.006, PAL.white, { pos: [x, 0.2, -0.015], seg: 6, ao: 0 }),
    ]),
  ];
  const flame = joint('flame', [0, 0.215, -0.015], candleX.flatMap((x) => [
    lathe([[0, 0], [0.006, 0.004], [0.007, 0.01], [0.004, 0.017], [0, 0.024]], PAL.orange, { seg: 6, pos: [x, 0.214, -0.015], ao: 0 }),
    lathe([[0, 0], [0.0035, 0.003], [0.004, 0.007], [0, 0.013]], PAL.yellow, { seg: 5, pos: [x, 0.215, -0.01], ao: 0 }),
  ]));
  return model('cake', body, [flame]);
}

// ─── teacup (porcelain with blue band, gold rim, steam) ────────────────────
function teacup(o: { tint?: string }) {
  const band = tintOr(o, PAL.blue) as string;
  const china = '#fbf7ef';
  const cup: [number, number][] = [[0, 0.02], [0.04, 0.02], [0.05, 0.028], [0.066, 0.06], [0.078, 0.094], [0.082, 0.11]];
  const body: Geo[] = [
    lathe([[0, 0], [0.1, 0.003], [0.13, 0.012], [0.132, 0.018], [0.1, 0.012], [0.05, 0.016], [0, 0.017]], china, { seg: 16 }),
    torus(0.118, 0.004, band, { pos: [0, 0.0145, 0], rot: [Math.PI / 2, 0, 0], seg: 16, ao: 0 }),
    lathe(cup.slice(0, 4), china, { seg: 14 }),
    lathe([[0.066, 0.06], [0.072, 0.076], [0.077, 0.092]], band, { seg: 14, ao: 0 }),
    lathe([[0.077, 0.092], [0.078, 0.094], [0.082, 0.11]], china, { seg: 14 }),
    torus(0.081, 0.004, PAL.gold, { pos: [0, 0.11, 0], rot: [Math.PI / 2, 0, 0], seg: 14, ao: 0 }),
    cyl(0.077, 0.077, 0.004, '#9a5a2a', { pos: [0, 0.102, 0], seg: 14, ao: 0 }),
    torus(0.028, 0.009, china, { pos: [0.085, 0.07, 0], seg: 10, arc: Math.PI * 1.3, rot: [0, 0, -Math.PI * 0.65] }),
    ...[0, 1, 2, 3, 4].map((i) => sphere(0.006, PAL.pink, { pos: [Math.sin(i * 1.26 + 0.3) * 0.074, 0.083, Math.cos(i * 1.26 + 0.3) * 0.074], seg: 0, ao: 0 })),
  ];
  const steam = joint('flame', [0, 0.11, 0], [
    sweep([[-0.02, 0.118, 0], [-0.035, 0.14, 0.004], [-0.018, 0.165, 0.006], [-0.03, 0.19, 0.004], [-0.015, 0.215, 0]], (u) => 0.006 * (1 - u) + 0.0025, '#f4f1ec', { sides: 5 }),
    sweep([[0.022, 0.118, 0.01], [0.034, 0.138, 0.012], [0.02, 0.158, 0.012], [0.03, 0.18, 0.01]], (u) => 0.005 * (1 - u) + 0.002, '#f4f1ec', { sides: 5 }),
  ]);
  return model('teacup', body, [steam]);
}

// ─── pizza (a slice lifted with stretchy cheese) ───────────────────────────
function pizza(o: { tint?: string }) {
  const cheeseC = tintOr(o, '#f6cf55') as string;
  const crust = '#d9923f';
  const sauce = '#c9402f';
  const cut = Math.PI / 4;
  const R = 0.14;
  const disc = (r: number, a0: number, a1: number, n: number): [number, number][] => [[0, 0], ...circle(r, n, 0, 0, a0, a1)];
  const flat: V3 = [-Math.PI / 2, 0, 0];
  const pepperoni = (x: number, z: number, y: number) => cyl(0.017, 0.017, 0.005, PAL.crimson, { pos: [x, y, z], seg: 8, ao: 0 });
  const toppings = (a0: number, a1: number, n: number, y: number, rr: ReturnType<typeof rng>) => {
    const out: Geo[] = [];
    for (let i = 0; i < n; i++) {
      const a = a0 + (a1 - a0) * ((i + 0.5) / n) + (rr() - 0.5) * 0.3;
      const d = 0.04 + rr() * 0.07;
      const x = Math.cos(a) * d;
      const z = -Math.sin(a) * d;
      if (i % 3 === 2) out.push(ell([x, y + 0.003, z], [0.012, 0.004, 0.007], PAL.forest, [5, 3], 0, [0, a, 0]));
      else out.push(pepperoni(x, z, y + 0.002));
    }
    return out;
  };
  const r = rng(5);
  const a0 = -Math.PI / 2 + cut / 2;
  const a1 = Math.PI * 1.5 - cut / 2;
  const body: Geo[] = [
    extrude(disc(R, a0, a1, 18), 0.012, crust, { rot: flat, pos: [0, 0.006, 0] }),
    extrude(disc(R - 0.012, a0 + 0.04, a1 - 0.04, 16), 0.005, sauce, { rot: flat, pos: [0, 0.013, 0], ao: 0 }),
    extrude(disc(R - 0.02, a0 + 0.06, a1 - 0.06, 16), 0.005, cheeseC, { rot: flat, pos: [0, 0.016, 0], ao: 0 }),
    torus(R - 0.004, 0.011, crust, { rot: [-Math.PI / 2, 0, a0], pos: [0, 0.014, 0], seg: 16, arc: a1 - a0 }),
    ...toppings(a0 + 0.2, a1 - 0.2, 10, 0.018, r),
    sweep(curve([0.004, 0.02, 0.05], [0.006, 0.05, 0.075], [0.004, 0.06, 0.095], 4), 0.0035, cheeseC, { sides: 4 }),
    sweep(curve([-0.012, 0.02, 0.07], [-0.014, 0.045, 0.09], [-0.012, 0.055, 0.105], 4), 0.003, cheeseC, { sides: 4 }),
  ];
  const s0 = -Math.PI / 2 - cut / 2 + 0.03;
  const s1 = -Math.PI / 2 + cut / 2 - 0.03;
  const slice = joint('lid', [0, 0.012, 0.02], [
    extrude(disc(R, s0, s1, 5), 0.012, crust, { rot: flat, pos: [0, 0.006, 0.02] }),
    extrude(disc(R - 0.014, s0 + 0.05, s1 - 0.05, 5), 0.005, cheeseC, { rot: flat, pos: [0, 0.014, 0.02], ao: 0 }),
    torus(R - 0.004, 0.011, crust, { rot: [-Math.PI / 2, 0, s0], pos: [0, 0.014, 0.02], seg: 4, arc: s1 - s0 }),
    pepperoni(0.0, 0.1, 0.019), pepperoni(-0.012, 0.065, 0.019),
    ell([0.014, 0.022, 0.12], [0.012, 0.004, 0.007], PAL.forest, [5, 3], 0, [0, 0.4, 0]),
  ]);
  slice.rotation.x = -0.32;
  slice.position.y += 0.03;
  return model('pizza', body, [slice]);
}

export const SPECS: ModelSpec[] = [
  {
    id: 'avocado', name: 'Avocado', category: 'food',
    tags: ['avocado', 'avogadro', 'mole', 'chemistry', 'guacamole', 'mexico', 'green', 'healthy', 'brunch', 'toast', 'lawyer', 'fruit', 'aztec'],
    soundsLike: ['avo', 'avoca', 'avogadro', 'avocat', 'avocado', 'cado', 'advocate', 'lawyer'],
    anims: ['juggle', 'bounce', 'spin', 'wobble', 'dance'], build: avocado,
  },
  {
    id: 'apple', name: 'Apple', category: 'food',
    tags: ['apple', 'fruit', 'newton', 'gravity', 'health', 'teacher', 'new york', 'temptation', 'eve', 'snow white', 'tell', 'switzerland', 'red'],
    soundsLike: ['app', 'appl', 'pomme', 'pom', 'apple', 'pompom'],
    anims: ['bounce', 'spin', 'rain', 'juggle'], build: apple,
    idle: (root, t, k) => add(root, 'head', 'z', Math.sin(t * 3) * 0.15 * k),
  },
  {
    id: 'banana', name: 'Banana', category: 'food',
    tags: ['banana', 'fruit', 'yellow', 'monkey', 'republic', 'tropical', 'slip', 'potassium', 'split', 'bunch', 'caribbean', 'ecuador', 'curve'],
    soundsLike: ['banana', 'bana', 'nana', 'banane', 'ban', 'bandana', 'havana'],
    anims: ['wobble', 'spin', 'dance', 'flip', 'rain'], build: banana,
  },
  {
    id: 'cheese', name: 'Cheese', category: 'food',
    tags: ['cheese', 'swiss', 'switzerland', 'bern', 'emmental', 'gruyere', 'holes', 'mouse', 'fondue', 'france', 'dairy', 'wheel', 'smile', 'moon'],
    soundsLike: ['cheese', 'chi', 'chiz', 'fromage', 'from', 'emmental', 'gruyere', 'swiss', 'suisse', 'cheers'],
    anims: ['wobble', 'spin', 'bounce', 'grow', 'shake'], build: cheese,
  },
  {
    id: 'cake', name: 'Cake', category: 'food',
    tags: ['cake', 'birthday', 'party', 'celebration', 'anniversary', 'candles', 'marie antoinette', 'brioche', 'dessert', 'sweet', 'wedding', 'age', 'years', 'jubilee'],
    soundsLike: ['cake', 'kek', 'gateau', 'gato', 'cap', 'cook', 'quake', 'bake'],
    anims: ['idle', 'spin', 'grow', 'wobble', 'bounce'], build: cake,
  },
  {
    id: 'teacup', name: 'Teacup', category: 'food',
    tags: ['tea', 'teacup', 'cup', 'england', 'british', 'london', 'boston', 'tea party', 'india', 'china', 'porcelain', 'five o clock', 'break', 'calm', 'tempest', 'boiling', 'kettle', 'hot water'],
    soundsLike: ['tea', 'tee', 't', 'the', 'thé', 'tasse', 'cup', 'teacup', 'tic'],
    anims: ['idle', 'wobble', 'spin', 'float', 'shake'], build: teacup,
    idle: (root, t, k) => add(root, 'flame', 'y', Math.sin(t * 1.2) * 0.4 * k),
  },
  {
    id: 'pizza', name: 'Pizza', category: 'food',
    tags: ['pizza', 'italy', 'italian', 'naples', 'rome', 'slice', 'pie', 'circle', 'fraction', 'party', 'cheese', 'margherita', 'pisa', 'share'],
    soundsLike: ['pizza', 'pisa', 'piz', 'pizz', 'peace', 'pieza', 'pi', 'pie'],
    anims: ['spin', 'float', 'flip', 'wobble', 'rain'], build: pizza,
    idle: (root, t, k) => add(root, 'lid', 'x', -Math.max(0, Math.sin(t * 1.4)) * 0.12 * k),
  },
];
