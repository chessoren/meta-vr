/**
 * Science — desk globe (spins on a tilted axis), atom (electrons orbit), bubbling flask,
 * brass telescope, horseshoe magnet with field arcs, glowing "idea" lightbulb.
 * Joints: spin (globe: userData.axis = 'y', atom rings: local Z), head (telescope tube, bubbles),
 * flame (magnet field / bulb rays pulse). Idle functions ADD to joint rotations.
 */
import * as THREE from 'three';
import type { ModelSpec } from '../spec';
import { PAL, ball, box, cone, cyl, sphere, lathe, part, torus, joint, model, limb, tintOr, shade, type V3 } from '../kit';

type Geo = THREE.BufferGeometry;
function add(root: THREE.Object3D, n: string, axis: 'x' | 'y' | 'z', v: number) {
  const j = root.getObjectByName(n);
  if (j) j.rotation[axis] += v;
}

// ─── globe ──────────────────────────────────────────────────────────────────
/** Land mask on the unit sphere: a few soft "continent" blobs (deterministic). */
const CONTINENTS: [number, number, number, number][] = [
  // lon, lat, radius (rad), weight  — very roughly: Americas, Europe/Africa, Asia, Australia
  [-1.75, 0.75, 0.55, 1], [-1.2, -0.3, 0.45, 1], [0.35, 0.8, 0.45, 1], [0.35, 0.05, 0.5, 1], [1.6, 0.8, 0.7, 1], [1.9, 0.3, 0.35, 1], [2.35, -0.45, 0.28, 1],
];
function isLand(x: number, y: number, z: number) {
  const lat = Math.asin(Math.max(-1, Math.min(1, y)));
  const lon = Math.atan2(x, z);
  if (Math.abs(lat) > 1.25) return 'ice';
  for (const [lo, la, r] of CONTINENTS) {
    const d = Math.acos(Math.max(-1, Math.min(1, Math.sin(lat) * Math.sin(la) + Math.cos(lat) * Math.cos(la) * Math.cos(lon - lo))));
    if (d < r) return d < r * 0.45 && Math.abs(lat) < 0.5 ? 'sand' : 'land';
  }
  return null;
}
function globe(o: { tint?: string }) {
  const sea = tintOr(o, '#3f8fd0') as string;
  const R = 0.1;
  const C: V3 = [0, 0.165, 0];
  const g = part(new THREE.IcosahedronGeometry(R, 2), sea, { ao: 0 });
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const col = g.getAttribute('color') as THREE.BufferAttribute;
  const cLand = new THREE.Color('#6cbf4e');
  const cSand = new THREE.Color('#d9c27a');
  const cIce = new THREE.Color('#f4f7fb');
  const v = new THREE.Vector3();
  for (let i = 0; i + 2 < pos.count; i += 3) {
    v.set(0, 0, 0);
    for (let j = 0; j < 3; j++) v.x += pos.getX(i + j), v.y += pos.getY(i + j), v.z += pos.getZ(i + j);
    v.normalize();
    const k = isLand(v.x, v.y, v.z);
    const c = k === 'land' ? cLand : k === 'sand' ? cSand : k === 'ice' ? cIce : null;
    if (c) for (let j = 0; j < 3; j++) col.setXYZ(i + j, c.r, c.g, c.b);
  }
  const tilt = 0.41;
  const sphereJ = joint('spin', C, [g.translate(...C)]);
  sphereJ.rotation.order = 'ZYX';
  sphereJ.rotation.z = tilt;
  sphereJ.userData.axis = 'y';
  const body: Geo[] = [
    lathe([[0, 0], [0.075, 0], [0.078, 0.012], [0.06, 0.022], [0.02, 0.03], [0, 0.03]], PAL.wood, { seg: 12 }),
    cyl(0.009, 0.012, 0.035, PAL.brass, { pos: [0, 0.045, 0], seg: 7 }),
    torus(R + 0.012, 0.005, PAL.brass, { pos: C, rot: [0, Math.PI / 2, tilt], seg: 18, arc: Math.PI }),
    sphere(0.008, PAL.brass, { pos: [C[0] + Math.sin(tilt) * (R + 0.012), C[1] + Math.cos(tilt) * (R + 0.012), 0], seg: 0 }),
    sphere(0.008, PAL.brass, { pos: [C[0] - Math.sin(tilt) * (R + 0.012), C[1] - Math.cos(tilt) * (R + 0.012), 0], seg: 0 }),
  ];
  return model('globe', body, [sphereJ]);
}

/** Per-instance cache of the atom's ring joints (WeakMap: never serialised by clone()). */
const RINGS = new WeakMap<THREE.Object3D, THREE.Object3D[]>();

// ─── atom ───────────────────────────────────────────────────────────────────
function atom(o: { tint?: string }) {
  const ring = tintOr(o, '#6db6e0') as string;
  const C: V3 = [0, 0.15, 0];
  const nucleus: Geo[] = [];
  const pts: V3[] = [[0, 0, 0], [0.022, 0.012, 0.01], [-0.02, 0.015, -0.008], [0.004, -0.022, 0.012], [-0.012, -0.008, 0.022], [0.012, 0.004, -0.022], [0.0, 0.026, 0.0]];
  pts.forEach((p, i) => nucleus.push(sphere(0.02, i % 2 ? PAL.red : PAL.blue, { pos: [C[0] + p[0], C[1] + p[1], C[2] + p[2]], seg: 1, ao: 0.1 })));
  const rings = [0, 1, 2].map((i) => {
    const r = 0.13;
    const j = joint('spin', [0, 0, 0], [
      torus(r, 0.006, ring, { seg: 22, ao: 0 }),
      sphere(0.017, PAL.yellow, { pos: [r, 0, 0], seg: 1, ao: 0 }),
      sphere(0.008, '#fff4b0', { pos: [r, 0.004, 0.013], seg: 0, ao: 0 }),
    ]);
    j.rotation.z = i * 2.1;
    // static orientation (unnamed group): rings tilted 72° and fanned every 60° around the view axis
    const orient = new THREE.Group();
    orient.position.set(...C);
    orient.rotation.set(0, 0, (i * Math.PI) / 3, 'ZYX');
    const tilt = new THREE.Group();
    tilt.rotation.x = 1.25;
    tilt.add(j);
    orient.add(tilt);
    return orient;
  });
  return model('atom', nucleus, rings);
}

// ─── flask (Erlenmeyer, bubbling) ──────────────────────────────────────────
function flask(o: { tint?: string }) {
  const liquid = tintOr(o, '#7ed957') as string;
  const glass = '#d8eef7';
  const body: Geo[] = [
    lathe([[0, 0], [0.085, 0.0], [0.092, 0.012], [0.07, 0.06], [0.05, 0.09]], liquid, { seg: 12, ao: 0.1 }),
    lathe([[0.05, 0.09], [0.03, 0.125], [0.026, 0.14], [0.026, 0.2], [0, 0.2]], glass, { seg: 12, ao: 0 }),
    torus(0.03, 0.007, glass, { pos: [0, 0.2, 0], rot: [Math.PI / 2, 0, 0], seg: 12, ao: 0 }),
    torus(0.051, 0.004, shade(liquid, 0.35), { pos: [0, 0.089, 0], rot: [Math.PI / 2, 0, 0], seg: 12, ao: 0 }),
    box(0.008, 0.07, 0.004, PAL.white, { pos: [-0.042, 0.06, 0.06], rot: [0.3, 0.6, 0.38], ao: 0 }),
    box(0.006, 0.05, 0.004, PAL.white, { pos: [-0.012, 0.165, 0.025], ao: 0 }),
    ...[0.03, 0.05, 0.07].map((y) => box(0.018, 0.003, 0.003, shade(liquid, -0.35), { pos: [0.04, y, 0.075 - y * 0.35], rot: [0.35, -0.5, 0], ao: 0 })),
    ...[[0.03, 0.055, 0.05], [-0.02, 0.035, 0.07], [0.0, 0.07, 0.05]].map((p) => sphere(0.008, shade(liquid, 0.45), { pos: p as V3, seg: 0, ao: 0 })),
  ];
  const bubbles = joint('head', [0, 0.2, 0], [
    ball(0.016, shade(liquid, 0.3), { pos: [0.004, 0.225, 0], w: 7, h: 5, ao: 0 }),
    ball(0.012, shade(liquid, 0.4), { pos: [-0.012, 0.255, 0.004], w: 6, h: 5, ao: 0 }),
    ball(0.008, shade(liquid, 0.5), { pos: [0.01, 0.28, 0.0], w: 6, h: 4, ao: 0 }),
  ]);
  return model('flask', body, [bubbles]);
}

// ─── telescope ──────────────────────────────────────────────────────────────
function telescope(o: { tint?: string }) {
  const tube = tintOr(o, PAL.navy) as string;
  const hub: V3 = [0, 0.15, 0];
  const legs: Geo[] = [0, 2.1, 4.2].flatMap((a) => [
    limb(hub, [Math.sin(a) * 0.11, 0.0, Math.cos(a) * 0.11], 0.011, 0.009, PAL.wood, { sides: 5 }),
    cyl(0.009, 0.01, 0.008, PAL.brass, { pos: [Math.sin(a) * 0.11, 0.004, Math.cos(a) * 0.11], seg: 5 }),
  ]);
  const body: Geo[] = [...legs, ball(0.016, PAL.brass, { pos: hub, w: 7, h: 5 }), cyl(0.006, 0.006, 0.03, PAL.brass, { pos: [0, 0.165, 0], seg: 5 })];
  const T = (g: Geo) => g.rotateX(-0.62).rotateY(Math.PI - 0.7).translate(0, 0.182, 0);
  const tubeParts: Geo[] = [
    cyl(0.028, 0.034, 0.2, tube, { rot: [Math.PI / 2, 0, 0], pos: [0, 0, 0.03], seg: 10 }),
    cyl(0.038, 0.038, 0.03, PAL.brass, { rot: [Math.PI / 2, 0, 0], pos: [0, 0, 0.13], seg: 10 }),
    cyl(0.033, 0.033, 0.006, '#9fd6ee', { rot: [Math.PI / 2, 0, 0], pos: [0, 0, 0.146], seg: 10, ao: 0 }),
    cyl(0.031, 0.031, 0.012, PAL.brass, { rot: [Math.PI / 2, 0, 0], pos: [0, 0, -0.03], seg: 10 }),
    cyl(0.015, 0.018, 0.05, PAL.brass, { rot: [Math.PI / 2, 0, 0], pos: [0, 0, -0.095], seg: 7 }),
    cyl(0.018, 0.018, 0.01, PAL.ink, { rot: [Math.PI / 2, 0, 0], pos: [0, 0, -0.121], seg: 7 }),
    cyl(0.03, 0.03, 0.006, PAL.gold, { rot: [Math.PI / 2, 0, 0], pos: [0, 0, 0.05], seg: 10 }),
    cyl(0.009, 0.009, 0.05, PAL.brass, { rot: [Math.PI / 2, 0, 0], pos: [0, 0.04, 0.02], seg: 5 }),
    box(0.006, 0.02, 0.006, PAL.brass, { pos: [0, 0.03, 0.0] }),
  ].map(T);
  return model('telescope', body, [joint('head', [0, 0.182, 0], tubeParts)]);
}

// ─── magnet ─────────────────────────────────────────────────────────────────
function magnet(o: { tint?: string }) {
  const red = tintOr(o, PAL.red) as string;
  const tip = '#dfe4ea';
  const R = 0.07;
  const t = 0.032;
  const base = 0.1;
  const body: Geo[] = [
    torus(R, t, red, { pos: [0, base, 0], rot: [0, 0, Math.PI], seg: 12, arc: Math.PI }),
    ...[1, -1].flatMap((s) => [
      cyl(t, t, 0.08, red, { pos: [s * R, base + 0.04, 0], seg: 12 }),
      cyl(t + 0.001, t + 0.001, 0.04, tip, { pos: [s * R, base + 0.1, 0], seg: 12, ao: 0 }),
    ]),
  ];
  // lift so the bottom of the U sits on y = 0
  const lift = -(base - R - t);
  body.forEach((g) => g.translate(0, lift, 0));
  const fy = base + 0.125 + lift;
  const arcs = joint('flame', [0, fy, 0], [
    ...[0, 1].map((i) => torus(R + 0.012 + i * 0.03, 0.0032, PAL.sky, { pos: [0, fy, 0], seg: 12, arc: Math.PI, ao: 0, scale: [1, 0.7 + i * 0.15, 1] })),
    ...[1, -1].map((s) => cone(0.008, 0.022, PAL.yellow, { pos: [s * (R + 0.04), fy + 0.035, 0], rot: [0, 0, s * 0.7], seg: 4, ao: 0 })),
  ]);
  return model('magnet', body, [arcs]);
}

// ─── lightbulb ──────────────────────────────────────────────────────────────
function lightbulb(o: { tint?: string }) {
  const glow = tintOr(o, '#ffe27a') as string;
  const body: Geo[] = [
    lathe([[0.03, 0.075], [0.036, 0.1], [0.06, 0.13], [0.078, 0.165], [0.076, 0.2], [0.058, 0.235], [0.03, 0.252], [0, 0.256]], glow, { seg: 12, ao: 0 }),
    sphere(0.011, PAL.white, { pos: [-0.035, 0.215, 0.05], seg: 0, ao: 0 }),
    box(0.012, 0.045, 0.006, '#fff7d6', { pos: [-0.05, 0.175, 0.052], rot: [0, -0.7, 0.15], ao: 0 }),
    ...[0, 1, 2, 3].map((i) => cyl(0.033 - i * 0.0012, 0.033 - i * 0.0012, 0.011, i % 2 ? PAL.steel : PAL.grey, { pos: [0, 0.07 - i * 0.012, 0], seg: 10, ao: 0 })),
    cyl(0.026, 0.012, 0.018, PAL.charcoal, { pos: [0, 0.012, 0], seg: 8 }),
    cyl(0.009, 0.009, 0.006, PAL.brass, { pos: [0, 0.003, 0], seg: 6, ao: 0 }),
  ];
  const rays: Geo[] = [];
  for (let i = 0; i < 7; i++) {
    const a = -1.2 + (i / 6) * 2.4;
    rays.push(box(0.009, 0.03, 0.006, PAL.amber, { pos: [Math.sin(a) * 0.115, 0.17 + Math.cos(a) * 0.115, 0], rot: [0, 0, -a], ao: 0 }));
  }
  return model('lightbulb', body, [joint('flame', [0, 0.17, 0], rays)]);
}

export const SPECS: ModelSpec[] = [
  {
    id: 'globe', name: 'Globe', category: 'science',
    tags: ['globe', 'world', 'earth', 'planet', 'geography', 'travel', 'map', 'global', 'international', 'columbus', 'magellan', 'explorer', 'atlas', 'united nations', 'capital', 'country'],
    soundsLike: ['globe', 'glob', 'globo', 'monde', 'world', 'terre', 'earth', 'lobe'],
    anims: ['spin', 'idle', 'float', 'wobble'], build: globe,
  },
  {
    id: 'atom', name: 'Atom', category: 'science',
    tags: ['atom', 'physics', 'chemistry', 'nuclear', 'electron', 'proton', 'bohr', 'rutherford', 'energy', 'bomb', 'hiroshima', 'manhattan project', 'element', 'science', 'particle', 'curie'],
    soundsLike: ['atom', 'atome', 'at', 'tom', 'adam', 'atomic', 'bohr'],
    anims: ['spin', 'float', 'grow', 'shake', 'idle'], build: atom,
    idle: (r, t, k) => {
      let rings = RINGS.get(r);
      if (!rings) {
        const found: THREE.Object3D[] = [];
        r.traverse((o) => { if (o.name === 'spin') found.push(o); });
        RINGS.set(r, (rings = found));
      }
      for (let i = 0; i < rings.length; i++) rings[i].rotation.z += t * (0.6 + 0.5 * i) * k;
    },
  },
  {
    id: 'flask', name: 'Flask', category: 'science',
    tags: ['flask', 'chemistry', 'lab', 'experiment', 'potion', 'reaction', 'acid', 'solution', 'alchemy', 'pasteur', 'science', 'formula', 'test', 'poison', 'magic'],
    soundsLike: ['flask', 'flas', 'fiole', 'flacon', 'ask', 'flash', 'potion'],
    anims: ['shake', 'wobble', 'idle', 'bounce', 'grow'], build: flask,
    idle: (r, t, k) => { const b = r.getObjectByName('head'); if (b) { b.position.y += ((t * 0.6) % 1) * 0.02 * k; b.rotation.y += t * 0.8; } },
  },
  {
    id: 'telescope', name: 'Telescope', category: 'science',
    tags: ['telescope', 'astronomy', 'galileo', 'stars', 'space', 'observe', 'discover', 'hubble', 'newton', 'kepler', 'planets', 'sky', 'vision', 'future', 'explore'],
    soundsLike: ['tele', 'scope', 'telescope', 'lunette', 'galileo', 'tell', 'escape'],
    anims: ['idle', 'spin', 'wobble'], build: telescope,
    idle: (r, t, k) => { add(r, 'head', 'y', Math.sin(t * 0.5) * 0.35 * k); add(r, 'head', 'x', Math.sin(t * 0.7) * 0.06 * k); },
  },
  {
    id: 'magnet', name: 'Magnet', category: 'science',
    tags: ['magnet', 'magnetism', 'attraction', 'north', 'south', 'pole', 'compass', 'force', 'field', 'iron', 'faraday', 'electromagnet', 'physics', 'charisma', 'pull'],
    soundsLike: ['magnet', 'mag', 'aimant', 'magna', 'magnate', 'net', 'maggie'],
    anims: ['shake', 'wobble', 'spin', 'idle', 'grow'], build: magnet,
  },
  {
    id: 'lightbulb', name: 'Lightbulb', category: 'science',
    tags: ['lightbulb', 'light', 'idea', 'invention', 'edison', 'electricity', 'bright', 'genius', 'innovation', 'eureka', 'lamp', 'energy', 'think', 'creativity', 'tesla'],
    soundsLike: ['bulb', 'light', 'ampoule', 'lampe', 'idea', 'idee', 'edison', 'bob'],
    anims: ['grow', 'shake', 'float', 'spin', 'idle'], build: lightbulb,
  },
];
