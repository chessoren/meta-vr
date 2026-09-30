import * as THREE from 'three';
import type { ModelSpec } from '../spec';
import { box, cyl, cone, torus, sphere, capsule, lathe, extrude, model, joint, PAL, rng, shade, tintOr, orient, type ColorLike } from '../kit';
import { J, rod, stripedLathe, bandedLathe, roundRectPts, disc, puff, xform, type V3, type V2 } from './_shapes';

const PI = Math.PI;

/** Lathe along +Z (profile y = position along the axis, x = radius). */
function latheZ(profile: V2[], c: ColorLike, seg = 12, pos: V3 = [0, 0, 0], scale: V3 = [1, 1, 1]) {
  return lathe(profile, c, { seg, rot: [PI / 2, 0, 0], pos, scale });
}

/** Spin joint: sets the axis hint the anims use. */
function spinJoint(name: string, pivot: V3, parts: THREE.BufferGeometry[], axis?: 'x' | 'y') {
  const j = joint(name, pivot, parts);
  if (axis) j.userData.axis = axis;
  return j;
}

/** A simple wheel lying in the YZ plane (axle along X): tyre, painted disc, hub, counterweight wedge so rotation reads. */
function wheelX(x: number, y: number, z: number, r: number, paint: ColorLike, o: { tyre?: ColorLike; spokes?: number; w?: number } = {}) {
  const w = o.w ?? 0.014;
  const rz: V3 = [0, 0, PI / 2];
  const out = [
    cyl(r, r, w, o.tyre ?? PAL.charcoal, { rot: rz, pos: [x, y, z], seg: 12 }),
    cyl(r * 0.78, r * 0.78, w + 0.003, paint, { rot: rz, pos: [x, y, z], seg: 12 }),
    cyl(r * 0.28, r * 0.28, w + 0.008, PAL.gold, { rot: rz, pos: [x, y, z], seg: 8 }),
  ];
  const n = o.spokes ?? 0;
  const sx = x + Math.sign(x || 1) * (w / 2 + 0.002);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI;
    out.push(box(0.003, r * 1.5, 0.006, shade(paint, -0.3), { pos: [sx, y, z], rot: [a, 0, 0], ao: 0 }));
  }
  return out;
}

export const SPECS: ModelSpec[] = [
  // ───────────────────────────────────────── tank (WWI rhomboid)
  {
    id: 'tank',
    name: 'WWI tank',
    category: 'vehicle',
    tags: ['tank', 'ww1', 'armour', 'armor', 'cambrai', 'somme', 'mark iv', 'army', 'war', 'invention', 'trench', 'breakthrough', 'tracks', 'military', 'battle', 'fish tank', 'water tank', 'panzer'],
    soundsLike: ['tank', 'tan', 'thank', 'char', 'chars', 'tanque', 'tango'],
    anims: ['march', 'shake', 'bounce', 'wobble', 'idle'],
    build: (o) => {
      const kh = tintOr(o, PAL.khaki);
      const track = PAL.charcoal;
      const rnd = rng(19);
      // rhomboid side outline in (z, y)
      const outline: V2[] = [[-0.12, 0], [0.07, 0], [0.175, 0.1], [0.15, 0.155], [-0.125, 0.15], [-0.165, 0.08]];
      const cz = 0.005, cyy = 0.078;
      const inset = outline.map(([z, y]) => [cz + (z - cz) * 0.8, cyy + (y - cyy) * 0.74] as V2);
      const body: THREE.BufferGeometry[] = [box(0.15, 0.1, 0.25, kh, { pos: [0, 0.085, 0] })];
      for (const sx of [-1, 1]) {
        const x = sx * 0.1;
        body.push(extrude(outline, 0.058, track, { rot: [0, -PI / 2, 0], pos: [x, 0, 0], bevel: 0.004 }));
        body.push(extrude(inset, 0.068, kh, { rot: [0, -PI / 2, 0], pos: [x, 0, 0] }));
        // tread ribs all around the belt
        for (let e = 0; e < outline.length; e++) {
          const [z0, y0] = outline[e];
          const [z1, y1] = outline[(e + 1) % outline.length];
          const len = Math.hypot(z1 - z0, y1 - y0);
          const n = Math.max(1, Math.round(len / 0.03));
          const nz = (y1 - y0) / len, ny = -(z1 - z0) / len; // outward normal (outline is CCW in (z,y) after the flip)
          for (let i = 0; i < n; i++) {
            const t = (i + 0.5) / n;
            const pz = z0 + (z1 - z0) * t, py = y0 + (y1 - y0) * t;
            body.push(box(0.066, 0.009, 0.011, shade(track, 0.35), { pos: [x, py - ny * 0.004, pz - nz * 0.004], rot: [Math.atan2(y1 - y0, z1 - z0) * -1, 0, 0], ao: 0 }));
          }
        }
        // sponson with stubby gun
        body.push(box(0.03, 0.05, 0.075, kh, { pos: [sx * 0.145, 0.085, 0.0] }));
        body.push(cyl(0.01, 0.012, 0.05, PAL.charcoal, { rot: [0, 0, PI / 2], pos: [sx * 0.175, 0.09, 0.015], seg: 6 }));
        body.push(sphere(0.012, shade(kh, -0.15), { seg: 0, pos: [sx * 0.161, 0.09, 0.015] }));
        // rivets & camo patches
        for (let i = 0; i < 5; i++) body.push(box(0.004, 0.006, 0.006, shade(kh, -0.25), { pos: [sx * 0.135, 0.125, -0.09 + i * 0.045], ao: 0 }));
        const camo = [PAL.forest, PAL.woodDark, PAL.sand];
        for (let i = 0; i < 3; i++) {
          const z = -0.1 + i * 0.075 + rnd() * 0.02, y = 0.05 + rnd() * 0.05;
          body.push(extrude([[-0.025, -0.012], [0.02, -0.018], [0.03, 0.01], [0.0, 0.02], [-0.03, 0.008]], 0.002, camo[i], { rot: [0, -PI / 2, 0], pos: [sx * (0.1 + 0.035), y, z], ao: 0 }));
        }
      }
      body.push(
        box(0.1, 0.04, 0.06, kh, { pos: [0, 0.15, 0.095] }),
        box(0.06, 0.006, 0.004, PAL.ink, { pos: [0, 0.155, 0.126], ao: 0 }),
        box(0.05, 0.03, 0.05, shade(kh, -0.1), { pos: [0, 0.148, -0.06] }),
        cyl(0.008, 0.008, 0.04, PAL.charcoal, { pos: [0.03, 0.18, -0.07], seg: 6 }),
        rod([0, 0.07, -0.12], [0, 0.04, -0.2], 0.008, PAL.woodDark),
        rod([0.03, 0.07, -0.12], [0.03, 0.04, -0.2], 0.006, PAL.woodDark),
        rod([-0.03, 0.07, -0.12], [-0.03, 0.04, -0.2], 0.006, PAL.woodDark),
      );
      const tail = spinJoint('spin', [0, 0.034, -0.205], [...wheelX(-0.035, 0.034, -0.205, 0.034, PAL.woodLight, { spokes: 3 }), ...wheelX(0.035, 0.034, -0.205, 0.034, PAL.woodLight, { spokes: 3 }), cyl(0.005, 0.005, 0.08, PAL.charcoal, { rot: [0, 0, PI / 2], pos: [0, 0.034, -0.205], seg: 5 })], 'x');
      return model('tank', body, [tail]);
    },
    idle: (root, t, k) => {
      const s = J(root, 'spin');
      if (s) s.rotation.x = t * 3 * k;
    },
  },

  // ───────────────────────────────────────── biplane
  {
    id: 'biplane',
    name: 'Biplane',
    category: 'vehicle',
    tags: ['biplane', 'plane', 'aeroplane', 'flight', 'pilot', 'red baron', 'ace', 'dogfight', 'ww1', 'aviation', 'wright brothers', 'sky', 'air force', 'raf', 'travel', 'wings', 'blériot'],
    soundsLike: ['plane', 'plain', 'avion', 'biplan', 'bi', 'baron', 'aero', 'air'],
    anims: ['fly', 'orbit', 'float', 'wobble', 'bounce'],
    build: (o) => {
      const red = tintOr(o, PAL.red);
      const wing = PAL.yellow;
      const fy = 0.1;
      const flat: V3 = [-PI / 2, 0, 0];
      const body: THREE.BufferGeometry[] = [
        latheZ([[0, -0.2], [0.012, -0.195], [0.03, -0.1], [0.045, 0.0], [0.05, 0.06], [0.048, 0.1], [0.04, 0.12], [0, 0.125]], red, 10, [0, fy, 0]),
        torus(0.043, 0.009, PAL.charcoal, { pos: [0, fy, 0.118], seg: 12 }),
        extrude(roundRectPts(0.42, 0.075, 0.03, 2), 0.01, wing, { rot: flat, pos: [0, 0.064, 0.03] }),
        extrude(roundRectPts(0.44, 0.078, 0.03, 2), 0.01, wing, { rot: flat, pos: [0, 0.172, 0.045] }),
        // roundels on the top wing
        ...[-0.15, 0.15].flatMap((x) => [
          disc(0.026, PAL.blue, { rot: flat, pos: [x, 0.1775, 0.045], seg: 12 }),
          disc(0.018, PAL.white, { rot: flat, pos: [x, 0.178, 0.045], seg: 12 }),
          disc(0.009, PAL.red, { rot: flat, pos: [x, 0.1785, 0.045], seg: 10 }),
        ]),
        // struts
        ...[-0.15, 0.15].flatMap((x) => [rod([x, 0.068, 0.012], [x, 0.168, 0.025], 0.0035, PAL.woodDark, { seg: 4 }), rod([x, 0.068, 0.055], [x, 0.168, 0.068], 0.0035, PAL.woodDark, { seg: 4 })]),
        rod([-0.02, 0.14, 0.03], [-0.035, 0.168, 0.045], 0.003, PAL.woodDark, { seg: 4 }),
        rod([0.02, 0.14, 0.03], [0.035, 0.168, 0.045], 0.003, PAL.woodDark, { seg: 4 }),
        // tail
        extrude(roundRectPts(0.15, 0.05, 0.018, 2), 0.008, wing, { rot: flat, pos: [0, fy + 0.004, -0.175] }),
        extrude([[0, 0], [0.06, 0], [0.048, 0.065], [0.02, 0.07]], 0.008, red, { rot: [0, PI / 2, 0], pos: [0, fy + 0.005, -0.14] }),
        box(0.009, 0.05, 0.012, PAL.blue, { pos: [0, fy + 0.04, -0.2] }),
        box(0.009, 0.05, 0.012, PAL.white, { pos: [0, fy + 0.04, -0.188] }),
        // cockpit
        cyl(0.024, 0.024, 0.01, PAL.ink, { pos: [0, fy + 0.045, -0.03], seg: 10 }),
        torus(0.024, 0.005, PAL.woodDark, { rot: [PI / 2, 0, 0], pos: [0, fy + 0.05, -0.03], seg: 10 }),
        box(0.04, 0.02, 0.003, '#cfe8f2', { pos: [0, fy + 0.058, 0.0], rot: [-0.4, 0, 0], ao: 0 }),
        // gear
        rod([-0.03, fy - 0.04, 0.06], [-0.065, 0.028, 0.07], 0.004, PAL.charcoal, { seg: 4 }),
        rod([0.03, fy - 0.04, 0.06], [0.065, 0.028, 0.07], 0.004, PAL.charcoal, { seg: 4 }),
        rod([-0.065, 0.028, 0.07], [0.065, 0.028, 0.07], 0.003, PAL.charcoal, { seg: 4 }),
        ...[-1, 1].flatMap((s) => [
          cyl(0.028, 0.028, 0.016, PAL.charcoal, { rot: [0, 0, PI / 2], pos: [s * 0.075, 0.028, 0.07], seg: 12 }),
          cyl(0.012, 0.012, 0.018, PAL.cream, { rot: [0, 0, PI / 2], pos: [s * 0.075, 0.028, 0.07], seg: 8 }),
        ]),
        rod([0, fy - 0.01, -0.17], [0, 0.004, -0.205], 0.004, PAL.charcoal, { seg: 4 }),
      ];
      const prop = spinJoint('spin', [0, fy, 0.13], [
        cone(0.02, 0.035, PAL.cream, { rot: [PI / 2, 0, 0], pos: [0, fy, 0.14], seg: 8 }),
        box(0.016, 0.17, 0.006, PAL.woodLight, { pos: [0, fy, 0.133], rot: [0, 0, 0.3] }),
        box(0.017, 0.02, 0.007, PAL.red, { pos: [Math.sin(-0.3) * 0.075, fy + Math.cos(0.3) * 0.075, 0.133], rot: [0, 0, 0.3], ao: 0 }),
        box(0.017, 0.02, 0.007, PAL.red, { pos: [-Math.sin(-0.3) * 0.075, fy - Math.cos(0.3) * 0.075, 0.133], rot: [0, 0, 0.3], ao: 0 }),
      ]);
      const root = model('biplane', body, [prop]);
      // taildragger stance: nose slightly up
      const tilt = new THREE.Group();
      tilt.name = 'attitude';
      while (root.children.length) tilt.add(root.children[0]);
      tilt.rotation.x = -0.1;
      tilt.position.set(0, 0.006, 0);
      root.add(tilt);
      return root;
    },
    idle: (root, t, k) => {
      const s = J(root, 'spin');
      if (s) s.rotation.z = t * 22 * k;
    },
  },

  // ───────────────────────────────────────── zeppelin
  {
    id: 'zeppelin',
    name: 'Zeppelin',
    category: 'vehicle',
    tags: ['zeppelin', 'airship', 'dirigible', 'hindenburg', 'germany', 'ww1', 'bombing', 'flight', 'balloon', 'sky', 'airship raid', 'blimp', 'count zeppelin', 'travel', 'giant', 'float'],
    soundsLike: ['zeppelin', 'zep', 'zeppe', 'lin', 'dirigeable', 'zeste', 'zebre'],
    anims: ['float', 'fly', 'orbit', 'wobble'],
    build: (o) => {
      const silver = tintOr(o, '#cfd4da');
      const fin = PAL.red;
      const cy = 0.1;
      const env = stripedLathe([[0, -0.17], [0.02, -0.16], [0.04, -0.12], [0.055, -0.06], [0.06, 0.0], [0.058, 0.06], [0.05, 0.11], [0.035, 0.145], [0.015, 0.165], [0, 0.17]], [silver, shade(silver, -0.1)], 12, 1, { ao: 0.12 });
      xform(env, { rot: [PI / 2, 0, 0], pos: [0, cy, 0], scale: [1, 1, 1] });
      const body: THREE.BufferGeometry[] = [
        ...env,
        latheZ([[0, 0.155], [0.022, 0.158], [0.012, 0.168], [0, 0.172]], fin, 10, [0, cy, 0]),
        torus(0.058, 0.004, fin, { pos: [0, cy, 0.03], seg: 14 }),
      ];
      for (let i = 0; i < 4; i++) {
        const f = extrude([[-0.075, 0.016], [-0.02, 0.016], [-0.06, 0.068], [-0.085, 0.068]], 0.006, fin, { rot: [0, -PI / 2, 0], ao: 0.05 });
        xform([f], { rot: [0, 0, (i * PI) / 2] });
        xform([f], { pos: [0, cy, -0.09] });
        body.push(f);
      }
      body.push(
        capsule(0.02, 0.065, PAL.cream, { rot: [PI / 2, 0, 0], pos: [0, 0.022, 0.03] }),
        box(0.03, 0.012, 0.03, PAL.cream, { pos: [0, 0.042, 0.03] }),
        ...[-1, 1].flatMap((s) => [0, 1, 2, 3].map((i) => box(0.004, 0.01, 0.012, PAL.ink, { pos: [s * 0.0195, 0.026, 0.0 + i * 0.019], ao: 0 }))),
        box(0.012, 0.012, 0.012, PAL.charcoal, { pos: [0, 0.022, -0.018] }),
      );
      const prop = spinJoint('spin', [0, 0.022, -0.026], [
        box(0.008, 0.07, 0.004, PAL.woodLight, { pos: [0, 0.022, -0.026], rot: [0, 0, 0.5] }),
        sphere(0.006, PAL.gold, { seg: 0, pos: [0, 0.022, -0.028] }),
      ]);
      return model('zeppelin', body, [prop]);
    },
    idle: (root, t, k) => {
      const s = J(root, 'spin');
      if (s) s.rotation.z = t * 18 * k;
    },
  },

  // ───────────────────────────────────────── ship (steamship)
  {
    id: 'ship',
    name: 'Steamship',
    category: 'vehicle',
    tags: ['ship', 'boat', 'steamship', 'liner', 'navy', 'sea', 'ocean', 'voyage', 'titanic', 'lusitania', 'transatlantic', 'harbour', 'sailor', 'fleet', 'emigration', 'cruise', 'port', 'trade', 'portugal', 'lisbon', 'lisbonne', 'columbus', 'new world', 'discovery'],
    soundsLike: ['ship', 'chip', 'sheep', 'navire', 'bateau', 'nav', 'paquebot', 'titan'],
    anims: ['wobble', 'float', 'orbit', 'bounce'],
    build: (o) => {
      const hull = tintOr(o, PAL.navy);
      const rnd = rng(23);
      const deck: V2[] = [[0, 0.175], [0.045, 0.12], [0.06, 0.04], [0.06, -0.1], [0.052, -0.14], [0.03, -0.162], [-0.03, -0.162], [-0.052, -0.14], [-0.06, -0.1], [-0.06, 0.04], [-0.045, 0.12]];
      const sc = (pts: V2[], k: number) => pts.map(([x, z]) => [x * k, z * (1 + (k - 1) * 0.5)] as V2);
      const flat = (pts: V2[], depth: number, c: ColorLike, y: number) => extrude(pts, depth, c, { rot: [PI / 2, 0, 0], pos: [0, y, 0] });
      const body: THREE.BufferGeometry[] = [
        flat(sc(deck, 0.96), 0.03, PAL.red, 0.015),
        flat(deck, 0.042, hull, 0.051),
        flat(sc(deck, 1.02), 0.006, PAL.gold, 0.07),
        flat(sc(deck, 0.94), 0.004, PAL.woodLight, 0.074),
        box(0.08, 0.035, 0.19, PAL.cream, { pos: [0, 0.093, -0.02] }),
        box(0.064, 0.03, 0.13, PAL.white, { pos: [0, 0.125, -0.01] }),
        box(0.09, 0.022, 0.03, PAL.white, { pos: [0, 0.151, 0.065] }),
        box(0.07, 0.008, 0.003, PAL.ink, { pos: [0, 0.153, 0.081], ao: 0 }),
      ];
      // windows
      for (const sx of [-1, 1]) {
        for (let i = 0; i < 7; i++) body.push(box(0.002, 0.01, 0.012, PAL.ink, { pos: [sx * 0.041, 0.097, -0.1 + i * 0.027], ao: 0 }));
        for (let i = 0; i < 5; i++) body.push(box(0.002, 0.009, 0.011, PAL.amber, { pos: [sx * 0.033, 0.127, -0.06 + i * 0.024], ao: 0 }));
        for (let i = 0; i < 7; i++) body.push(disc(0.0055, PAL.cream, { rot: [0, sx * PI / 2, 0], pos: [sx * 0.0612, 0.052, -0.11 + i * 0.03], seg: 8 }));
        for (let i = 0; i < 3; i++) body.push(capsule(0.007, 0.02, PAL.white, { rot: [PI / 2, 0, 0], pos: [sx * 0.046, 0.117, -0.08 + i * 0.045] }));
      }
      // funnels
      [0.035, -0.03, -0.095].forEach((z) => {
        body.push(cyl(0.017, 0.019, 0.075, PAL.red, { rot: [-0.14, 0, 0], pos: [0, 0.175, z], seg: 10, scale: [1, 1, 1.25] }));
        body.push(cyl(0.0175, 0.0175, 0.018, PAL.ink, { rot: [-0.14, 0, 0], pos: [0, 0.21, z - 0.005], seg: 10, scale: [1, 1, 1.25] }));
      });
      // masts + bunting
      const fore: V3 = [0, 0.25, 0.12], aft: V3 = [0, 0.25, -0.14], bow: V3 = [0, 0.08, 0.172], stern: V3 = [0, 0.08, -0.16];
      body.push(rod([0, 0.074, 0.12], fore, 0.0035, PAL.woodDark, { seg: 4 }), rod([0, 0.074, -0.14], aft, 0.0035, PAL.woodDark, { seg: 4 }));
      const flags = [PAL.red, PAL.yellow, PAL.blue, PAL.green, PAL.white];
      const line = (a: V3, b: V3, n: number) => {
        body.push(rod(a, b, 0.0012, PAL.ink, { seg: 3 }));
        for (let i = 1; i < n; i++) {
          const t = i / n;
          const p: V3 = [0, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
          body.push(extrude([[-0.007, 0], [0.007, 0], [0, -0.016]], 0.002, flags[(i + Math.floor(rnd() * 2)) % flags.length], { rot: [0, PI / 2, 0], pos: [p[0], p[1], p[2]], ao: 0 }));
        }
      };
      line(fore, bow, 4);
      line(fore, aft, 7);
      line(aft, stern, 4);
      const smoke = joint('smoke', [0, 0.23, 0.03], [...puff(0.022, '#ece6da', [0, 0.235, 0.025], rnd, 3), ...puff(0.016, '#ddd6c8', [0, 0.27, 0.0], rnd, 3)]);
      return model('ship', body, [smoke]);
    },
    idle: (root, t, k) => {
      const s = J(root, 'smoke');
      if (!s) return;
      const p = (t * 0.35 * k) % 1;
      s.position.set(0, 0.23 + p * 0.05, 0.03 - p * 0.04);
      s.scale.setScalar(0.6 + p * 0.7);
    },
  },

  // ───────────────────────────────────────── submarine
  {
    id: 'submarine',
    name: 'Submarine',
    category: 'vehicle',
    tags: ['submarine', 'u-boat', 'underwater', 'navy', 'sea', 'ocean', 'periscope', 'torpedo', 'ww1', 'lusitania', 'secret', 'deep', 'yellow submarine', 'dive', 'nautilus', 'blockade'],
    soundsLike: ['sub', 'submarine', 'sous-marin', 'marin', 'marine', 'u-boot', 'soup'],
    anims: ['float', 'orbit', 'wobble', 'bounce', 'fly'],
    build: (o) => {
      const y = tintOr(o, PAL.yellow);
      const trim = PAL.orange;
      const cy = 0.06;
      const body: THREE.BufferGeometry[] = [
        latheZ([[0, -0.17], [0.018, -0.165], [0.035, -0.13], [0.05, -0.07], [0.056, 0.0], [0.056, 0.07], [0.051, 0.11], [0.039, 0.14], [0.02, 0.158], [0, 0.163]], y, 12, [0, cy, 0]),
        cyl(0.026, 0.031, 0.05, shade(y, -0.06), { pos: [0, cy + 0.07, 0.01], seg: 10, scale: [0.72, 1, 1.35] }),
        cyl(0.028, 0.028, 0.008, trim, { pos: [0, cy + 0.097, 0.01], seg: 10, scale: [0.72, 1, 1.35] }),
        // front window "face"
        torus(0.016, 0.005, PAL.brass, { pos: [0, cy, 0.158], seg: 10 }),
        disc(0.014, PAL.sky, { pos: [0, cy, 0.161], seg: 10 }),
        disc(0.004, PAL.white, { pos: [0.005, cy + 0.006, 0.1615], seg: 6 }),
        // dive planes
        ...[-1, 1].map((s) => box(0.035, 0.005, 0.02, trim, { pos: [s * 0.065, cy + 0.01, 0.09] })),
        // tail fins (cross)
        extrude([[0, 0], [0.04, 0], [0.015, 0.05], [-0.01, 0.05]], 0.006, trim, { rot: [0, PI / 2, 0], pos: [0, cy + 0.02, -0.12] }),
        extrude([[0, 0], [0.04, 0], [0.015, 0.05], [-0.01, 0.05]], 0.006, trim, { rot: [PI, PI / 2, 0], pos: [0, cy - 0.02, -0.12] }),
        box(0.13, 0.005, 0.03, trim, { pos: [0, cy, -0.145] }),
        // deck rail
        box(0.012, 0.008, 0.18, shade(y, -0.15), { pos: [0, cy + 0.056, 0.0] }),
      ];
      for (const s of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const z = 0.055 - i * 0.05;
          body.push(cyl(0.013, 0.013, 0.006, PAL.brass, { rot: [0, 0, PI / 2], pos: [s * 0.055, cy + 0.008, z], seg: 10 }));
          body.push(disc(0.0095, PAL.sky, { rot: [0, s * PI / 2, 0], pos: [s * 0.0585, cy + 0.008, z], seg: 10 }));
        }
      }
      const peri = joint('head', [0, cy + 0.1, 0.02], [
        cyl(0.005, 0.005, 0.07, PAL.charcoal, { pos: [0, cy + 0.13, 0.02], seg: 6 }),
        box(0.012, 0.014, 0.024, PAL.charcoal, { pos: [0, cy + 0.168, 0.028] }),
        disc(0.005, PAL.sky, { pos: [0, cy + 0.168, 0.0405], seg: 8 }),
      ]);
      peri.userData.axis = 'y';
      const prop = spinJoint('spin', [0, cy, -0.172], [
        cone(0.012, 0.02, PAL.brass, { rot: [-PI / 2, 0, 0], pos: [0, cy, -0.178], seg: 8 }),
        ...[0, 1, 2].map((i) => box(0.014, 0.045, 0.004, PAL.brass, { pos: [Math.sin((i * 2 * PI) / 3) * 0.022, cy + Math.cos((i * 2 * PI) / 3) * 0.022, -0.172], rot: [0.35, 0, -(i * 2 * PI) / 3] })),
      ]);
      return model('submarine', body, [peri, prop]);
    },
    idle: (root, t, k) => {
      const s = J(root, 'spin');
      const h = J(root, 'head');
      if (s) s.rotation.z = t * 9 * k;
      if (h) h.rotation.y = Math.sin(t * 0.8) * 0.9 * k;
    },
  },

  // ───────────────────────────────────────── train (steam locomotive)
  {
    id: 'train',
    name: 'Steam locomotive',
    category: 'vehicle',
    tags: ['train', 'locomotive', 'steam', 'railway', 'industrial revolution', 'travel', 'journey', 'station', 'orient express', 'transport', 'stephenson', 'rails', 'engine', 'progress', 'express', 'armistice carriage'],
    soundsLike: ['train', 'tren', 'choo', 'loco', 'locomotive', 'trait', 'rail'],
    anims: ['march', 'bounce', 'orbit', 'shake', 'idle'],
    build: (o) => {
      const g = tintOr(o, PAL.forest);
      const red = PAL.red;
      const rx: V3 = [PI / 2, 0, 0];
      const rnd = rng(31);
      const body: THREE.BufferGeometry[] = [
        box(0.1, 0.026, 0.28, PAL.charcoal, { pos: [0, 0.048, 0] }),
        box(0.13, 0.03, 0.012, red, { pos: [0, 0.05, 0.146] }),
        ...[-0.045, 0.045].map((x) => cyl(0.01, 0.01, 0.014, PAL.charcoal, { rot: rx, pos: [x, 0.05, 0.158], seg: 8 })),
        cyl(0.047, 0.047, 0.16, g, { rot: rx, pos: [0, 0.112, 0.035], seg: 12 }),
        ...[-0.03, 0.02, 0.07].map((z) => cyl(0.049, 0.049, 0.007, PAL.gold, { rot: rx, pos: [0, 0.112, z], seg: 12 })),
        cyl(0.049, 0.049, 0.03, PAL.charcoal, { rot: rx, pos: [0, 0.112, 0.128], seg: 12 }),
        cyl(0.037, 0.037, 0.008, shade(PAL.charcoal, 0.15), { rot: rx, pos: [0, 0.112, 0.146], seg: 12 }),
        sphere(0.006, PAL.gold, { seg: 0, pos: [0, 0.112, 0.152] }),
        cyl(0.013, 0.013, 0.014, PAL.gold, { rot: rx, pos: [0, 0.167, 0.13], seg: 8 }),
        disc(0.009, PAL.yellow, { pos: [0, 0.167, 0.1375], seg: 8 }),
        lathe([[0, 0], [0.017, 0], [0.013, 0.032], [0.021, 0.048], [0.024, 0.055], [0, 0.055]], PAL.charcoal, { seg: 10, pos: [0, 0.152, 0.11] }),
        sphere(0.022, PAL.gold, { seg: 1, scale: [1, 0.8, 1], pos: [0, 0.158, 0.035] }),
        sphere(0.012, PAL.gold, { seg: 0, pos: [0, 0.16, -0.01] }),
        // cab
        box(0.115, 0.1, 0.075, g, { pos: [0, 0.11, -0.095] }),
        box(0.132, 0.012, 0.095, red, { pos: [0, 0.166, -0.097] }),
        ...[-1, 1].map((s) => box(0.003, 0.034, 0.034, PAL.amber, { pos: [s * 0.058, 0.13, -0.095], ao: 0 })),
        ...[-1, 1].map((s) => disc(0.011, PAL.amber, { pos: [s * 0.036, 0.145, -0.057], seg: 8 })),
        box(0.12, 0.012, 0.08, PAL.gold, { pos: [0, 0.058, -0.095] }),
        // cowcatcher
        extrude([[0, 0], [0.045, 0], [0, 0.034]], 0.11, red, { rot: [0, -PI / 2, 0], pos: [0, 0.012, 0.152] }),
        // leading wheels + rods
        ...[-1, 1].flatMap((s) => [
          cyl(0.024, 0.024, 0.012, red, { rot: [0, 0, PI / 2], pos: [s * 0.052, 0.026, 0.098], seg: 10 }),
          cyl(0.009, 0.009, 0.015, PAL.gold, { rot: [0, 0, PI / 2], pos: [s * 0.052, 0.026, 0.098], seg: 6 }),
          box(0.005, 0.008, 0.085, PAL.steel, { pos: [s * 0.067, 0.04, -0.035] }),
          cyl(0.014, 0.014, 0.05, PAL.charcoal, { rot: rx, pos: [s * 0.045, 0.068, 0.085], seg: 8 }),
        ]),
      ];
      const drive = (name: string, z: number) =>
        spinJoint(name, [0, 0.042, z], [
          ...[-1, 1].flatMap((s) => [
            cyl(0.042, 0.042, 0.012, PAL.charcoal, { rot: [0, 0, PI / 2], pos: [s * 0.054, 0.042, z], seg: 14 }),
            cyl(0.035, 0.035, 0.014, red, { rot: [0, 0, PI / 2], pos: [s * 0.054, 0.042, z], seg: 14 }),
            cyl(0.01, 0.01, 0.018, PAL.gold, { rot: [0, 0, PI / 2], pos: [s * 0.054, 0.042, z], seg: 6 }),
            box(0.004, 0.022, 0.03, PAL.charcoal, { pos: [s * 0.062, 0.042 + 0.02, z], ao: 0 }),
          ]),
        ], 'x');
      const steam = joint('steam', [0, 0.215, 0.11], [...puff(0.024, PAL.white, [0, 0.225, 0.105], rnd, 4), ...puff(0.017, '#ece8e0', [0, 0.262, 0.085], rnd, 3)]);
      return model('train', body, [drive('spin', -0.07), drive('spin2', 0.0), steam]);
    },
    idle: (root, t, k) => {
      const a = J(root, 'spin');
      const b = J(root, 'spin2');
      const st = J(root, 'steam');
      if (a) a.rotation.x = t * 4 * k;
      if (b) b.rotation.x = t * 4 * k;
      if (st) {
        const p = (t * 0.5 * k) % 1;
        st.position.set(0, 0.215 + p * 0.04, 0.11 - p * 0.03);
        st.scale.setScalar(0.65 + p * 0.6);
      }
    },
  },

  // ───────────────────────────────────────── car (vintage)
  {
    id: 'car',
    name: 'Vintage car',
    category: 'vehicle',
    tags: ['car', 'automobile', 'ford', 'model t', 'vintage', 'drive', 'road', 'travel', 'motor', 'assembly line', 'mass production', 'taxi', 'sarajevo', 'journey', 'speed', 'roaring twenties'],
    soundsLike: ['car', 'kar', 'voiture', 'auto', 'ford', 'carre', 'cara'],
    anims: ['bounce', 'orbit', 'march', 'shake', 'wobble'],
    build: (o) => {
      const paint = tintOr(o, PAL.teal);
      const rx: V3 = [PI / 2, 0, 0];
      const glass = '#d6ecf3';
      const body: THREE.BufferGeometry[] = [
        box(0.12, 0.05, 0.25, paint, { pos: [0, 0.07, -0.005] }),
        box(0.1, 0.042, 0.085, paint, { pos: [0, 0.112, 0.08] }),
        box(0.102, 0.004, 0.087, shade(paint, 0.15), { pos: [0, 0.134, 0.08], ao: 0 }),
        box(0.09, 0.075, 0.012, PAL.gold, { pos: [0, 0.1, 0.126] }),
        box(0.07, 0.058, 0.004, PAL.charcoal, { pos: [0, 0.1, 0.1325], ao: 0 }),
        ...[0, 1, 2, 3].map((i) => box(0.064, 0.003, 0.005, PAL.gold, { pos: [0, 0.08 + i * 0.013, 0.1335], ao: 0 })),
        sphere(0.008, PAL.gold, { seg: 0, pos: [0, 0.14, 0.123] }),
        // cabin
        box(0.12, 0.09, 0.11, paint, { pos: [0, 0.14, -0.05] }),
        box(0.132, 0.012, 0.126, PAL.charcoal, { pos: [0, 0.19, -0.05] }),
        box(0.1, 0.048, 0.004, glass, { pos: [0, 0.155, 0.006], ao: 0 }),
        ...[-1, 1].map((s) => box(0.004, 0.04, 0.075, glass, { pos: [s * 0.0605, 0.157, -0.045], ao: 0 })),
        box(0.09, 0.035, 0.004, glass, { pos: [0, 0.158, -0.106], ao: 0 }),
        // running boards & fenders
        ...[-1, 1].flatMap((s) => [
          box(0.028, 0.006, 0.1, PAL.charcoal, { pos: [s * 0.072, 0.042, 0.0] }),
          torus(0.048, 0.012, PAL.charcoal, { arc: PI, rot: [0, PI / 2, 0], scale: [1, 1, 2.1], pos: [s * 0.072, 0.042, 0.09], seg: 8 }),
          torus(0.048, 0.012, PAL.charcoal, { arc: PI, rot: [0, PI / 2, 0], scale: [1, 1, 2.1], pos: [s * 0.072, 0.042, -0.095], seg: 8 }),
          cyl(0.016, 0.014, 0.022, PAL.gold, { rot: rx, pos: [s * 0.058, 0.128, 0.12], seg: 8 }),
          disc(0.013, PAL.cream, { pos: [s * 0.058, 0.128, 0.1315], seg: 8 }),
        ]),
        box(0.16, 0.008, 0.01, PAL.gold, { pos: [0, 0.045, 0.14] }),
        box(0.16, 0.008, 0.01, PAL.gold, { pos: [0, 0.045, -0.14] }),
        torus(0.032, 0.011, PAL.charcoal, { pos: [0, 0.1, -0.138], seg: 12 }),
        disc(0.02, paint, { pos: [0, 0.1, -0.1385], rot: [0, PI, 0], seg: 10 }),
        torus(0.012, 0.003, PAL.ink, { pos: [0.028, 0.152, -0.02], rot: [-0.9, 0, 0], seg: 8 }),
      ];
      const axle = (name: string, z: number) =>
        spinJoint(name, [0, 0.04, z], [
          ...[-1, 1].flatMap((s) => [
            cyl(0.04, 0.04, 0.022, PAL.charcoal, { rot: [0, 0, PI / 2], pos: [s * 0.072, 0.04, z], seg: 12 }),
            cyl(0.024, 0.024, 0.024, PAL.cream, { rot: [0, 0, PI / 2], pos: [s * 0.072, 0.04, z], seg: 10 }),
            cyl(0.009, 0.009, 0.028, PAL.red, { rot: [0, 0, PI / 2], pos: [s * 0.072, 0.04, z], seg: 6 }),
            ...[0, 1, 2].map((i) => box(0.004, 0.044, 0.005, shade(PAL.cream, -0.3), { pos: [s * 0.0835, 0.04, z], rot: [(i * PI) / 3, 0, 0], ao: 0 })),
          ]),
        ], 'x');
      return model('car', body, [axle('spin', 0.09), axle('spin2', -0.095)]);
    },
    idle: (root, t, k) => {
      const a = J(root, 'spin');
      const b = J(root, 'spin2');
      if (a) a.rotation.x = t * 5 * k;
      if (b) b.rotation.x = t * 5 * k;
    },
  },

  // ───────────────────────────────────────── rocket
  {
    id: 'rocket',
    name: 'Rocket',
    category: 'vehicle',
    tags: ['rocket', 'space', 'launch', 'moon', 'apollo', 'sputnik', 'space race', 'astronaut', 'blast off', 'speed', 'v2', 'science', 'future', 'exploration', 'nasa', 'cold war', 'fast growth'],
    soundsLike: ['rocket', 'rock', 'roquette', 'fusee', 'fuse', 'rocky', 'racket'],
    anims: ['float', 'fly', 'shake', 'bounce', 'spin'],
    build: (o) => {
      const red = tintOr(o, PAL.red);
      const rnd = rng(41);
      const prof: V2[] = [[0, 0.1], [0.045, 0.1], [0.055, 0.13], [0.06, 0.18], [0.058, 0.23], [0.05, 0.27], [0.036, 0.305], [0.018, 0.332], [0, 0.346]];
      const body: THREE.BufferGeometry[] = [
        ...bandedLathe(prof, [{ to: 0.128, c: red }, { to: 0.14, c: PAL.navy }, { to: 0.268, c: PAL.cream }, { to: 1, c: red }], 14),
        orient(torus(0.02, 0.006, PAL.brass, { seg: 10 }), [Math.sin(0.5) * 0.058, 0.21, Math.cos(0.5) * 0.058], [Math.sin(0.5), 0, Math.cos(0.5)]),
        orient(disc(0.018, PAL.sky, { seg: 10 }), [Math.sin(0.5) * 0.0595, 0.21, Math.cos(0.5) * 0.0595], [Math.sin(0.5), 0, Math.cos(0.5)]),
        orient(disc(0.005, PAL.white, { seg: 6 }), [Math.sin(0.5) * 0.06 + 0.004, 0.217, Math.cos(0.5) * 0.06 - 0.002], [Math.sin(0.5), 0, Math.cos(0.5)]),
        lathe([[0, 0.1], [0.03, 0.1], [0.036, 0.083], [0.04, 0.068], [0.033, 0.068], [0.027, 0.082], [0, 0.087]], PAL.charcoal, { seg: 10 }),
        sphere(0.007, PAL.gold, { seg: 0, pos: [0, 0.348, 0] }),
      ];
      for (let i = 0; i < 3; i++) {
        const f = extrude([[0.044, 0.112], [0.05, 0.19], [0.098, 0.105], [0.104, 0.055], [0.086, 0.058]], 0.012, red, { bevel: 0.002 });
        xform([f], { rot: [0, (i * 2 * PI) / 3, 0] });
        body.push(f);
      }
      const puffs: V3[] = [[0.055, 0.026, 0.045], [-0.06, 0.026, 0.035], [0.0, 0.024, -0.065]];
      puffs.forEach((p, i) => body.push(...puff(0.036, i % 2 ? PAL.cream : PAL.white, p, rnd, 2, 1)));
      const flame = joint('flame', [0, 0.07, 0], [
        ...bandedLathe([[0, 0.012], [0.012, 0.024], [0.026, 0.044], [0.03, 0.06], [0.026, 0.068], [0, 0.07]], [{ to: 0.03, c: PAL.red }, { to: 0.05, c: PAL.orange }, { to: 1, c: PAL.yellow }], 8, { ao: 0 }),
      ]);
      return model('rocket', body, [flame]);
    },
    idle: (root, t, k) => {
      const f = J(root, 'flame');
      if (!f) return;
      const n = Math.sin(t * 17) * 0.1 + Math.sin(t * 9.3) * 0.08;
      f.scale.set(1 - n * 0.3, 1 + n * k, 1 - n * 0.3);
    },
  },

  // ───────────────────────────────────────── hot-air balloon
  {
    id: 'balloon',
    name: 'Hot-air balloon',
    category: 'vehicle',
    tags: ['balloon', 'hot air balloon', 'montgolfier', 'flight', 'sky', 'adventure', 'journey', 'travel', 'around the world', 'float', 'lift', 'rise', 'inflation', 'party', 'freedom', 'lightness', 'air', 'gas', 'helium', 'nitrogen', 'atmosphere'],
    soundsLike: ['balloon', 'ballon', 'ball', 'montgolfiere', 'golf', 'loon', 'balle'],
    anims: ['float', 'fly', 'orbit', 'wobble', 'bounce'],
    build: (o) => {
      const c1 = tintOr(o, PAL.red);
      const env = stripedLathe([[0.034, 0.2], [0.06, 0.215], [0.088, 0.245], [0.108, 0.29], [0.113, 0.325], [0.104, 0.362], [0.078, 0.392], [0.04, 0.408], [0, 0.413]], [c1, PAL.yellow], 12, 2, { ao: 0.2 });
      const body: THREE.BufferGeometry[] = [
        ...env,
        lathe([[0.022, 0.165], [0.028, 0.168], [0.036, 0.2], [0.03, 0.2]], PAL.blue, { seg: 12 }),
        torus(0.036, 0.004, PAL.gold, { rot: [PI / 2, 0, 0], pos: [0, 0.201, 0], seg: 12 }),
        torus(0.108, 0.005, PAL.gold, { rot: [PI / 2, 0, 0], pos: [0, 0.29, 0], seg: 18 }),
        // ropes
        ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => rod([sx * 0.02, 0.166, sz * 0.02], [sx * 0.032, 0.066, sz * 0.032], 0.0018, PAL.woodDark, { seg: 3 })),
        // burner
        box(0.02, 0.014, 0.02, PAL.charcoal, { pos: [0, 0.1, 0] }),
        ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => rod([sx * 0.008, 0.1, sz * 0.008], [sx * 0.03, 0.066, sz * 0.03], 0.0015, PAL.charcoal, { seg: 3 })),
        // basket
        box(0.07, 0.06, 0.07, PAL.woodLight, { pos: [0, 0.03, 0] }),
        box(0.072, 0.005, 0.072, PAL.wood, { pos: [0, 0.02, 0], ao: 0 }),
        box(0.072, 0.005, 0.072, PAL.wood, { pos: [0, 0.04, 0], ao: 0 }),
        box(0.078, 0.01, 0.078, PAL.woodDark, { pos: [0, 0.063, 0] }),
        sphere(0.011, PAL.sand, { seg: 0, scale: [0.9, 1.2, 0.9], pos: [0.042, 0.045, 0.018] }),
        sphere(0.011, PAL.sand, { seg: 0, scale: [0.9, 1.2, 0.9], pos: [-0.042, 0.045, -0.01] }),
      ];
      const flame = joint('flame', [0, 0.108, 0], [
        ...bandedLathe([[0, 0.106], [0.01, 0.114], [0.012, 0.124], [0.006, 0.138], [0, 0.146]], [{ to: 0.116, c: PAL.orange }, { to: 1, c: PAL.yellow }], 8, { ao: 0 }),
      ]);
      return model('balloon', body, [flame]);
    },
    idle: (root, t, k) => {
      const f = J(root, 'flame');
      if (!f) return;
      const n = Math.max(0, Math.sin(t * 3)) * 0.4 + Math.sin(t * 19) * 0.08;
      f.scale.set(1, 0.7 + n * k, 1);
    },
  },
];

