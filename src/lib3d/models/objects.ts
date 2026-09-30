import * as THREE from 'three';
import type { ModelSpec } from '../spec';
import { box, cyl, cone, torus, sphere, capsule, lathe, extrude, part, model, joint, PAL, rng, shade, type ColorLike, tintOr, sweep, curve, orient } from '../kit';
import { labelPlane, J, keepRest, wave, rod, tube, extrudeHoles, starPts, roundRectPts, gearPts, holePts, disc, jitter, xform, bendZ, circlePts, type V3, type V2 } from './_shapes';

const PI = Math.PI;

/** Rotate parts so their local +Y points along `dir`, then move them to `pos`. */
function aimY(parts: THREE.BufferGeometry[], pos: V3, dir: V3) {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...dir).normalize());
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), q, new THREE.Vector3(1, 1, 1));
  for (const p of parts) p.applyMatrix4(m);
  return parts;
}

/** Grassy tuft mound used under plants and signs. */
function mound(r: number, rnd: () => number, blades = 7) {
  const out = [lathe([[0, 0], [r, 0], [r * 0.8, r * 0.22], [r * 0.35, r * 0.36], [0, r * 0.38]], PAL.green, { seg: 10 })];
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * PI * 2 + rnd();
    const d = r * (0.55 + rnd() * 0.35);
    out.push(cone(0.008, 0.03 + rnd() * 0.02, i % 2 ? PAL.lime : PAL.forest, { seg: 3, pos: [Math.cos(a) * d, r * 0.2 + 0.012, Math.sin(a) * d], rot: [(rnd() - 0.5) * 0.6, 0, (rnd() - 0.5) * 0.6] }));
  }
  return out;
}

/** Heater-shield outline: flat top, straight sides down to `split`, curving to a point at `bottom`. */
function heater(w: number, top: number, split: number, bottom: number, n = 6): V2[] {
  const pts: V2[] = [[-w, top], [w, top], [w, split]];
  for (let i = 1; i <= n; i++) {
    const s = i / n;
    pts.push([w * (1 - s * s), split - (split - bottom) * s]);
  }
  for (let i = n - 1; i >= 1; i--) {
    const s = i / n;
    pts.push([-w * (1 - s * s), split - (split - bottom) * s]);
  }
  pts.push([-w, split]);
  return pts;
}

/** Five-petal-ish flower head (daisy), facing +Y at the origin. */
function daisy(r: number, petal: ColorLike, heart: ColorLike) {
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2;
    out.push(sphere(1, petal, { seg: 0, scale: [r * 0.55, r * 0.14, r * 0.22], rot: [0, -a, 0], pos: [Math.cos(a) * r * 0.62, 0, Math.sin(a) * r * 0.62], ao: 0 }));
  }
  out.push(sphere(r * 0.34, heart, { seg: 1, scale: [1, 0.55, 1], pos: [0, r * 0.08, 0], ao: 0 }));
  return out;
}

/** Remembrance poppy head facing +Y at the origin. */
function poppyHead(r: number, red: ColorLike, rnd: () => number) {
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2 + PI / 4;
    const p = sphere(1, i % 2 ? red : shade(red, -0.08), { seg: 1, scale: [r * 0.62, r * 0.16, r * 0.56], ao: 0.1 });
    xform([p], { pos: [r * 0.46, 0, 0], rot: [0, 0, 0.42 + rnd() * 0.1] });
    xform([p], { rot: [0, -a, 0], pos: [0, (i % 2) * r * 0.05, 0] });
    out.push(p);
  }
  out.push(torus(r * 0.22, r * 0.07, PAL.ink, { rot: [PI / 2, 0, 0], pos: [0, r * 0.12, 0], seg: 8 }));
  out.push(sphere(r * 0.2, PAL.black, { seg: 1, scale: [1, 0.7, 1], pos: [0, r * 0.16, 0], ao: 0 }));
  out.push(cyl(r * 0.1, r * 0.13, r * 0.06, PAL.olive, { pos: [0, r * 0.3, 0], seg: 6 }));
  return out;
}

export const SPECS: ModelSpec[] = [
  // ───────────────────────────────────────── book
  {
    id: 'book',
    name: 'Book',
    category: 'object',
    text: true,
    tags: ['book', 'reading', 'knowledge', 'study', 'library', 'story', 'novel', 'history', 'law', 'treaty', 'dictionary', 'literature', 'school', 'learning', 'author', 'chapter', 'record', 'bible', 'wisdom', 'poem', 'diary'],
    soundsLike: ['book', 'boo', 'buk', 'livre', 'liv', 'libr'],
    anims: ['float', 'wobble', 'flip', 'stack', 'bounce', 'spin'],
    build: (o) => {
      const W = 0.2, H = 0.26, T = 0.075, ct = 0.009;
      const cov = tintOr(o, PAL.crimson);
      const zf = T / 2 - ct / 2;
      const body = [
        box(W, H, ct, cov, { pos: [0, H / 2, -zf] }),
        box(0.016, H, T, shade(cov, -0.18), { pos: [-W / 2 + 0.008, H / 2, 0] }),
        box(W - 0.02, H - 0.016, T - 2 * ct + 0.002, PAL.cream, { pos: [0.004, H / 2, 0], ao: 0.06 }),
        box(0.02, 0.014, T + 0.004, PAL.gold, { pos: [-W / 2 + 0.008, 0.035, 0] }),
        box(0.02, 0.014, T + 0.004, PAL.gold, { pos: [-W / 2 + 0.008, H - 0.035, 0] }),
        box(0.02, 0.008, T + 0.004, PAL.gold, { pos: [-W / 2 + 0.008, H / 2, 0] }),
        ...[-0.016, 0, 0.016].map((z) => box(0.003, H - 0.03, 0.004, shade(PAL.parchment, -0.12), { pos: [W / 2 - 0.0045, H / 2, z], ao: 0 })),
        box(0.014, 0.03, 0.003, PAL.gold, { pos: [0.03, H + 0.004, -0.012], rot: [0.3, 0, 0] }),
        box(0.014, 0.07, 0.003, PAL.gold, { pos: [0.03, H - 0.022, -T / 2 - 0.004], rot: [-0.06, 0, 0.05] }),
      ];
      const zc = zf + ct / 2;
      const lidParts = [
        box(W, H, ct, cov, { pos: [0, H / 2, zf] }),
        box(W * 0.76, H * 0.44, 0.003, PAL.gold, { pos: [0.006, H * 0.61, zc + 0.0015], ao: 0 }),
        box(W * 0.7, H * 0.38, 0.004, PAL.parchment, { pos: [0.006, H * 0.61, zc + 0.002], ao: 0 }),
        extrude([[0, -0.018], [0.014, 0], [0, 0.018], [-0.014, 0]], 0.004, PAL.gold, { pos: [0.006, H * 0.24, zc + 0.001] }),
        extrude([[W / 2 + 0.002, H + 0.002], [W / 2 - 0.034, H + 0.002], [W / 2 + 0.002, H - 0.034]], ct + 0.004, PAL.gold, { pos: [0, 0, zf] }),
        extrude([[W / 2 + 0.002, -0.002], [W / 2 + 0.002, 0.034], [W / 2 - 0.034, -0.002]], ct + 0.004, PAL.gold, { pos: [0, 0, zf] }),
      ];
      const lid = joint('lid', [-W / 2, 0, zf], lidParts);
      const txt = labelPlane(o.label ?? '', W * 0.66, H * 0.34);
      txt.position.set(0.006 + W / 2, H * 0.61, ct / 2 + 0.0042);
      lid.add(txt);
      return model('book', body, [lid]);
    },
    idle: (root, t, k) => {
      const lid = J(root, 'lid');
      if (lid) lid.rotation.y = -Math.pow(Math.max(0, Math.sin(t * 1.1 - 2)), 4) * 0.45 * k;
    },
  },

  // ───────────────────────────────────────── clock
  {
    id: 'clock',
    name: 'Alarm clock',
    category: 'object',
    tags: ['clock', 'time', 'hour', 'minute', 'alarm', 'deadline', 'morning', 'wake up', 'late', 'punctual', 'countdown', 'schedule', 'midnight', 'watch', 'tick tock'],
    soundsLike: ['clock', 'clo', 'tick', 'tock', 'heure', 'horloge', 'reveil', 'time'],
    anims: ['shake', 'bounce', 'wobble', 'dance', 'idle'],
    build: (o) => {
      const R = 0.1, D = 0.06, cy = 0.14;
      const col = tintOr(o, PAL.red);
      const rz: V3 = [PI / 2, 0, 0];
      const zf = D / 2;
      const body = [
        cyl(R, R, D, col, { rot: rz, pos: [0, cy, 0], seg: 18 }),
        torus(R - 0.004, 0.011, PAL.gold, { pos: [0, cy, zf], seg: 18 }),
        cyl(R - 0.01, R - 0.01, 0.004, PAL.cream, { rot: rz, pos: [0, cy, zf + 0.001], seg: 18, ao: 0 }),
        cyl(R * 0.8, R * 0.8, 0.01, shade(col, -0.25), { rot: rz, pos: [0, cy, -zf - 0.004], seg: 14 }),
        // legs
        rod([-0.055, cy - 0.075, 0], [-0.085, 0.012, 0], 0.008, PAL.gold),
        rod([0.055, cy - 0.075, 0], [0.085, 0.012, 0], 0.008, PAL.gold),
        sphere(0.014, PAL.gold, { pos: [-0.087, 0.012, 0], seg: 0 }),
        sphere(0.014, PAL.gold, { pos: [0.087, 0.012, 0], seg: 0 }),
        // bells + hammer
        ...[-1, 1].flatMap((s) => [
          lathe([[0, 0], [0.042, 0], [0.04, 0.012], [0.032, 0.028], [0.018, 0.038], [0, 0.041]], PAL.gold, { seg: 12, pos: [s * 0.058, cy + R - 0.004, -0.004], rot: [0, 0, -s * 0.55] }),
          sphere(0.008, PAL.gold, { pos: [s * 0.083, cy + R + 0.035, -0.004], seg: 0 }),
        ]),
        rod([0, cy + R - 0.004, -0.004], [0, cy + R + 0.03, -0.004], 0.005, PAL.steel),
        sphere(0.011, PAL.steel, { pos: [0, cy + R + 0.032, -0.004], seg: 0 }),
        // hour marks
        ...Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * PI * 2;
          const big = i % 3 === 0;
          const r = R * 0.72;
          return box(big ? 0.009 : 0.005, big ? 0.02 : 0.012, 0.003, big ? PAL.ink : PAL.charcoal, { pos: [Math.sin(a) * r, cy + Math.cos(a) * r, zf + 0.004], rot: [0, 0, -a], ao: 0 });
        }),
      ];
      const hz = zf + 0.007;
      const hour = joint('handH', [0, cy, hz], [box(0.012, 0.05, 0.003, PAL.ink, { pos: [0, cy + 0.02, hz], ao: 0 })]);
      const minute = joint('hand', [0, cy, hz], [
        box(0.008, 0.075, 0.003, PAL.ink, { pos: [0, cy + 0.03, hz + 0.003], ao: 0 }),
        cyl(0.011, 0.011, 0.006, PAL.gold, { rot: rz, pos: [0, cy, hz + 0.004], seg: 8 }),
      ]);
      return model('clock', body, [hour, minute]);
    },
    idle: (root, t, k) => {
      const m = J(root, 'hand');
      const h = J(root, 'handH');
      const s = t * k;
      const f = s - Math.floor(s);
      const e = f < 0.12 ? (f / 0.12) * 1.18 : f < 0.24 ? 1.18 - ((f - 0.12) / 0.12) * 0.18 : 1;
      const ticks = Math.floor(s) + e;
      if (m) m.rotation.z = -(2 + ticks) * ((PI * 2) / 12);
      if (h) h.rotation.z = -(10 + (2 + ticks) / 12) * ((PI * 2) / 12);
    },
  },

  // ───────────────────────────────────────── bell
  {
    id: 'bell',
    name: 'Bell',
    category: 'object',
    tags: ['bell', 'ring', 'church', 'alarm', 'celebration', 'wedding', 'victory', 'armistice', 'peace', 'christmas', 'school', 'announcement', 'liberty', 'toll', 'news', 'chime'],
    soundsLike: ['bel', 'belle', 'bell', 'belgium', 'belgique', 'ding', 'dong', 'cloche', 'berlin'],
    anims: ['wobble', 'shake', 'bounce', 'dance'],
    build: (o) => {
      const metal = tintOr(o, PAL.gold);
      const rnd = rng(11);
      const body = [
        box(0.022, 0.29, 0.022, PAL.woodDark, { pos: [-0.105, 0.145, 0] }),
        box(0.022, 0.29, 0.022, PAL.woodDark, { pos: [0.105, 0.145, 0] }),
        box(0.03, 0.018, 0.13, PAL.woodDark, { pos: [-0.105, 0.009, 0] }),
        box(0.03, 0.018, 0.13, PAL.woodDark, { pos: [0.105, 0.009, 0] }),
        box(0.26, 0.026, 0.034, PAL.wood, { pos: [0, 0.286, 0] }),
        // little gabled roof
        box(0.17, 0.014, 0.075, PAL.crimson, { pos: [-0.064, 0.33, 0], rot: [0, 0, 0.5] }),
        box(0.17, 0.014, 0.075, PAL.crimson, { pos: [0.064, 0.33, 0], rot: [0, 0, -0.5] }),
        box(0.012, 0.05, 0.012, PAL.woodDark, { pos: [0, 0.32, 0] }),
        // holly sprig
        extrude([[0, 0], [0.012, 0.008], [0.022, 0.004], [0.032, 0.012], [0.044, 0], [0.032, -0.012], [0.022, -0.004], [0.012, -0.008]], 0.004, PAL.forest, { pos: [0.05, 0.298, 0.019], rot: [0.2, 0, 0.35] }),
        extrude([[0, 0], [0.012, 0.008], [0.022, 0.004], [0.032, 0.012], [0.044, 0], [0.032, -0.012], [0.022, -0.004], [0.012, -0.008]], 0.004, PAL.green, { pos: [0.05, 0.296, 0.02], rot: [0.2, 0, 2.6] }),
        ...[0, 1, 2].map((i) => sphere(0.008, PAL.red, { pos: [0.046 + i * 0.008 - 0.004, 0.304 + (i % 2) * 0.006, 0.024 + rnd() * 0.003], seg: 0, ao: 0 })),
      ];
      const swing = joint('swing', [0, 0.272, 0], [
        box(0.05, 0.014, 0.022, PAL.woodDark, { pos: [0, 0.266, 0] }),
        torus(0.012, 0.004, metal, { pos: [0, 0.25, 0], seg: 8 }),
        lathe([[0, 0.205], [0.035, 0.2], [0.05, 0.16], [0.062, 0.115], [0.077, 0.082], [0.085, 0.07], [0.094, 0.074], [0.091, 0.086], [0.073, 0.116], [0.061, 0.16], [0.052, 0.2], [0.036, 0.232], [0, 0.24]], metal, { seg: 16 }),
        torus(0.089, 0.005, shade(metal, -0.15), { rot: [PI / 2, 0, 0], pos: [0, 0.079, 0], seg: 16 }),
        rod([0, 0.2, 0], [0, 0.092, 0], 0.004, PAL.charcoal),
        sphere(0.015, PAL.charcoal, { pos: [0, 0.086, 0], seg: 1 }),
        // ribbon bow
        extrude([[0, 0], [0.024, 0.012], [0.024, -0.012]], 0.005, PAL.red, { pos: [0, 0.2, 0.05], rot: [-0.35, 0, 0] }),
        extrude([[0, 0], [-0.024, -0.012], [-0.024, 0.012]], 0.005, PAL.red, { pos: [0, 0.2, 0.05], rot: [-0.35, 0, 0] }),
        sphere(0.007, PAL.crimson, { pos: [0, 0.2, 0.052], seg: 0 }),
      ]);
      return model('bell', body, [swing]);
    },
    idle: (root, t, k) => {
      const s = J(root, 'swing');
      if (s) s.rotation.z = Math.sin(t * 2.4) * 0.32 * k;
    },
  },

  // ───────────────────────────────────────── crown
  {
    id: 'crown',
    name: 'Crown',
    category: 'object',
    tags: ['crown', 'king', 'queen', 'royal', 'monarchy', 'empire', 'emperor', 'power', 'throne', 'coronation', 'kingdom', 'tsar', 'kaiser', 'reign', 'winner', 'prince', 'rule'],
    soundsLike: ['crown', 'krone', 'couronne', 'roi', 'reine', 'king', 'crow', 'corona'],
    anims: ['spin', 'float', 'bounce', 'grow'],
    build: (o) => {
      const g = tintOr(o, PAL.gold);
      const body: THREE.BufferGeometry[] = [
        lathe([[0.1, 0.028], [0.108, 0.028], [0.114, 0.092], [0.104, 0.092], [0.098, 0.03]], g, { seg: 16 }),
        torus(0.104, 0.02, PAL.white, { rot: [PI / 2, 0, 0], pos: [0, 0.02, 0], seg: 16, ao: 0.1 }),
        sphere(0.095, PAL.purple, { seg: 1, scale: [1, 0.55, 1], pos: [0, 0.075, 0] }),
        torus(0.098, 0.007, g, { arc: PI, scale: [1, 0.62, 1], pos: [0, 0.084, 0], seg: 10 }),
        torus(0.098, 0.007, g, { arc: PI, scale: [1, 0.62, 1], pos: [0, 0.084, 0], rot: [0, PI / 2, 0], seg: 10 }),
        sphere(0.02, g, { seg: 1, pos: [0, 0.162, 0] }),
        box(0.01, 0.036, 0.01, g, { pos: [0, 0.196, 0] }),
        box(0.028, 0.01, 0.01, g, { pos: [0, 0.2, 0] }),
      ];
      const gems = [PAL.red, PAL.blue, PAL.green, PAL.red, PAL.blue, PAL.green, PAL.red, PAL.blue];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * PI * 2;
        const spike = [
          extrude([[-0.03, 0], [0.03, 0], [0.004, 0.058], [-0.004, 0.058]], 0.008, g, { rot: [-0.14, 0, 0] }),
          sphere(0.011, PAL.cream, { seg: 1, pos: [0, 0.066, -0.009], ao: 0 }),
        ];
        xform(spike, { rot: [0, a, 0] });
        xform(spike, { pos: [Math.sin(a) * 0.108, 0.086, Math.cos(a) * 0.108] });
        body.push(...spike);
        const b = a + PI / 8;
        body.push(sphere(0.011, gems[i], { seg: 0, pos: [Math.sin(b) * 0.112, 0.06, Math.cos(b) * 0.112], scale: [1, 1.2, 1], ao: 0 }));
        body.push(box(0.006, 0.014, 0.004, PAL.ink, { pos: [Math.sin(b) * 0.125, 0.02, Math.cos(b) * 0.125], rot: [0, b, 0], ao: 0 }));
      }
      return model('crown', body);
    },
  },

  // ───────────────────────────────────────── sword (in the stone)
  {
    id: 'sword',
    name: 'Sword in the stone',
    category: 'object',
    tags: ['sword', 'knight', 'excalibur', 'arthur', 'battle', 'war', 'honour', 'legend', 'duel', 'blade', 'courage', 'chivalry', 'victory', 'conquest', 'medieval'],
    soundsLike: ['sword', 'sord', 'saw', 'epee', 'excalibur', 'glaive'],
    anims: ['wobble', 'shake', 'grow', 'idle'],
    build: (o) => {
      const grip = tintOr(o, PAL.crimson);
      const rnd = rng(5);
      const blade = '#dfe5ec';
      const body = [
        part(jitter(new THREE.IcosahedronGeometry(0.1, 1), 0.012, 3), PAL.stone, { scale: [1.35, 0.62, 1.05], pos: [0, 0.04, 0], ao: 0.3 }),
        part(jitter(new THREE.IcosahedronGeometry(0.035, 0), 0.006, 4), shade(PAL.stone, -0.1), { pos: [0.14, 0.012, 0.06] }),
        ...[[-0.07, 0.078, 0.03], [0.05, 0.085, 0.045], [-0.02, 0.09, -0.05]].map((p) => sphere(0.028, rnd() > 0.5 ? PAL.green : PAL.forest, { seg: 0, scale: [1.3, 0.35, 1], pos: p as V3 })),
        ...[0, 1, 2, 3, 4].map((i) => {
          const a = i * 1.3 + 0.4;
          return cone(0.008, 0.035, i % 2 ? PAL.lime : PAL.green, { seg: 3, pos: [Math.cos(a) * 0.125, 0.012, Math.sin(a) * 0.1], rot: [0, 0, (rnd() - 0.5) * 0.6] });
        }),
      ];
      const sword = joint('sword', [0, 0.08, 0], [
        box(0.026, 0.19, 0.008, blade, { pos: [0, 0.17, 0], ao: 0 }),
        box(0.007, 0.16, 0.0095, '#aeb8c4', { pos: [0, 0.165, 0], ao: 0 }),
        box(0.115, 0.018, 0.024, PAL.gold, { pos: [0, 0.272, 0] }),
        sphere(0.013, PAL.gold, { seg: 0, pos: [-0.058, 0.272, 0] }),
        sphere(0.013, PAL.gold, { seg: 0, pos: [0.058, 0.272, 0] }),
        cyl(0.012, 0.012, 0.062, grip, { pos: [0, 0.312, 0], seg: 8 }),
        torus(0.0125, 0.003, PAL.gold, { rot: [PI / 2, 0, 0], pos: [0, 0.3, 0], seg: 8 }),
        torus(0.0125, 0.003, PAL.gold, { rot: [PI / 2, 0, 0], pos: [0, 0.322, 0], seg: 8 }),
        sphere(0.02, PAL.gold, { seg: 1, pos: [0, 0.352, 0] }),
        sphere(0.009, PAL.red, { seg: 0, pos: [0, 0.352, 0.016], ao: 0 }),
        sphere(0.008, PAL.sky, { seg: 0, pos: [0, 0.272, 0.013], ao: 0 }),
      ]);
      return model('sword', body, [sword]);
    },
    idle: (root, t, k) => {
      const s = J(root, 'sword');
      if (s) s.rotation.z = Math.sin(t * 16) * 0.035 * k * Math.pow(Math.max(0, Math.sin(t * 0.9)), 8);
    },
  },

  // ───────────────────────────────────────── shield
  {
    id: 'shield',
    name: 'Shield',
    category: 'object',
    tags: ['shield', 'defence', 'defense', 'protection', 'knight', 'coat of arms', 'heraldry', 'armour', 'guard', 'safety', 'alliance', 'medieval', 'family', 'crest', 'security'],
    soundsLike: ['shield', 'shiel', 'bouclier', 'ecu', 'sheal'],
    anims: ['wobble', 'spin', 'shake', 'bounce'],
    build: (o) => {
      const field = tintOr(o, PAL.blue);
      const parts = [
        extrudeHoles(heater(0.118, 0.3, 0.17, 0), [], 0.02, PAL.gold, { bevel: 0.004 }),
        extrudeHoles(heater(0.1, 0.287, 0.166, 0.022), [], 0.029, field),
        extrudeHoles([[0, 0.287], [0.1, 0.287], [0.1, 0.166], ...heater(0.1, 0.287, 0.166, 0.022).slice(3, 9)], [], 0.031, PAL.red),
        extrudeHoles(starPts(5, 0.05, 0.021, 0, 0.175), [], 0.036, PAL.gold, { bevel: 0.003 }),
        ...[-0.085, 0, 0.085].map((x) => sphere(0.007, PAL.cream, { seg: 0, pos: [x, 0.295, 0.014], ao: 0 })),
      ];
      xform(parts, { rot: [-0.13, 0, 0] });
      parts.push(rod([0, 0.16, -0.035], [0, 0.004, -0.11], 0.008, PAL.woodDark, { seg: 5 }));
      return model('shield', parts);
    },
  },

  // ───────────────────────────────────────── key
  {
    id: 'key',
    name: 'Key',
    category: 'object',
    tags: ['key', 'unlock', 'secret', 'solution', 'answer', 'access', 'door', 'treasure', 'freedom', 'password', 'opening', 'lock', 'important', 'city key', 'clue'],
    soundsLike: ['key', 'kee', 'ki', 'cairo', 'kiev', 'kyiv', 'cle', 'clef', 'quay', 'kenya'],
    anims: ['spin', 'float', 'wobble', 'bounce', 'orbit'],
    build: (o) => {
      const g = tintOr(o, PAL.gold);
      const y = 0.09, cx = -0.11;
      const rz: V3 = [0, 0, PI / 2];
      const body = [
        ...[PI, PI / 3, -PI / 3].map((a) => torus(0.027, 0.011, g, { pos: [cx + Math.cos(a) * 0.029, y + Math.sin(a) * 0.029, 0], seg: 10 })),
        sphere(0.016, PAL.red, { seg: 1, pos: [cx, y, 0], scale: [1, 1, 0.8] }),
        cyl(0.021, 0.021, 0.014, g, { rot: rz, pos: [-0.07, y, 0], seg: 8 }),
        cyl(0.017, 0.017, 0.012, shade(g, 0.1), { rot: rz, pos: [-0.055, y, 0], seg: 8 }),
        cyl(0.014, 0.014, 0.16, g, { rot: rz, pos: [0.02, y, 0], seg: 8 }),
        sphere(0.016, g, { seg: 0, pos: [0.1, y, 0] }),
        box(0.052, 0.022, 0.018, g, { pos: [0.072, y - 0.02, 0] }),
        box(0.014, 0.04, 0.018, g, { pos: [0.053, y - 0.04, 0] }),
        box(0.014, 0.026, 0.018, g, { pos: [0.074, y - 0.033, 0] }),
        box(0.014, 0.046, 0.018, g, { pos: [0.093, y - 0.043, 0] }),
      ];
      return model('key', body);
    },
  },

  // ───────────────────────────────────────── coin
  {
    id: 'coin',
    name: 'Gold coin',
    category: 'object',
    tags: ['coin', 'money', 'gold', 'wealth', 'price', 'cost', 'economy', 'trade', 'currency', 'bank', 'treasure', 'pay', 'reparations', 'debt', 'inflation', 'penny', 'euro', 'dollar', 'luck'],
    soundsLike: ['coin', 'coi', 'cash', 'piece', 'sou', 'or', 'euro', 'dollar'],
    anims: ['spin', 'flip', 'rain', 'stack', 'bounce'],
    build: (o) => {
      const g = tintOr(o, PAL.gold);
      const R = 0.1;
      const rz: V3 = [PI / 2, 0, 0];
      const body = [
        cyl(R, R, 0.022, g, { rot: rz, pos: [0, R, 0], seg: 20 }),
        torus(R - 0.007, 0.0065, shade(g, -0.14), { pos: [0, R, 0.011], seg: 20 }),
        torus(R - 0.007, 0.0065, shade(g, -0.14), { pos: [0, R, -0.011], seg: 20 }),
        extrudeHoles(starPts(5, 0.055, 0.024, 0, R), [], 0.03, shade(g, 0.12), { bevel: 0.002 }),
        ...[0, 1, 2].map((i) => cyl(0.045, 0.045, 0.011, i % 2 ? shade(g, -0.06) : g, { pos: [0.135 + (i - 1) * 0.004, 0.006 + i * 0.012, 0.05 + (i % 2) * 0.003], seg: 12 })),
        cyl(0.045, 0.045, 0.011, g, { pos: [-0.12, 0.006, 0.07], seg: 12 }),
      ];
      return model('coin', body);
    },
  },

  // ───────────────────────────────────────── trophy
  {
    id: 'trophy',
    name: 'Trophy',
    category: 'object',
    tags: ['trophy', 'cup', 'winner', 'victory', 'champion', 'prize', 'award', 'success', 'first', 'competition', 'world cup', 'olympics', 'sport', 'best', 'triumph'],
    soundsLike: ['trophy', 'tro', 'trophee', 'coupe', 'cup', 'win'],
    anims: ['spin', 'bounce', 'grow', 'float'],
    build: (o) => {
      const g = tintOr(o, PAL.gold);
      const body = [
        box(0.15, 0.036, 0.15, PAL.woodDark, { pos: [0, 0.018, 0] }),
        box(0.11, 0.03, 0.11, PAL.wood, { pos: [0, 0.051, 0] }),
        box(0.07, 0.018, 0.002, PAL.gold, { pos: [0, 0.018, 0.076], ao: 0 }),
        lathe([[0, 0.066], [0.045, 0.066], [0.045, 0.073], [0.02, 0.083], [0.012, 0.11], [0.022, 0.12], [0.012, 0.13], [0.016, 0.145], [0.06, 0.17], [0.08, 0.215], [0.088, 0.26], [0.094, 0.27], [0.086, 0.273], [0.078, 0.25], [0.066, 0.2], [0, 0.182]], g, { seg: 16 }),
        torus(0.042, 0.009, g, { arc: PI * 1.2, rot: [0, 0, -PI * 0.6], pos: [0.086, 0.215, 0], seg: 10 }),
        torus(0.042, 0.009, g, { arc: PI * 1.2, rot: [0, 0, PI * 0.4], pos: [-0.086, 0.215, 0], seg: 10 }),
        extrudeHoles(starPts(5, 0.026, 0.011), [], 0.006, PAL.red, { pos: [0, 0.218, 0.08], rot: [-0.18, 0, 0] }),
      ];
      return model('trophy', body);
    },
  },

  // ───────────────────────────────────────── candle
  {
    id: 'candle',
    name: 'Candle',
    category: 'object',
    tags: ['candle', 'light', 'flame', 'memory', 'remembrance', 'vigil', 'hope', 'night', 'birthday', 'church', 'prayer', 'peace', 'dark', 'idea', 'wax', 'christmas', 'evening'],
    soundsLike: ['candle', 'can', 'candel', 'bougie', 'chandelle', 'cierge', 'kandle'],
    anims: ['idle', 'float', 'wobble', 'grow'],
    build: (o) => {
      const wax = tintOr(o, PAL.cream);
      const brass = PAL.brass;
      const body = [
        lathe([[0, 0], [0.085, 0], [0.1, 0.012], [0.105, 0.022], [0.097, 0.023], [0.088, 0.014], [0, 0.012]], brass, { seg: 16 }),
        torus(0.022, 0.006, brass, { pos: [0.116, 0.028, 0], seg: 10 }),
        lathe([[0, 0.012], [0.036, 0.012], [0.036, 0.04], [0.043, 0.045], [0.036, 0.049], [0.03, 0.049], [0, 0.046]], shade(brass, 0.08), { seg: 12 }),
        cyl(0.028, 0.03, 0.14, wax, { pos: [0, 0.117, 0], seg: 12, ao: 0.08 }),
        torus(0.022, 0.007, shade(wax, 0.05), { rot: [PI / 2, 0, 0], pos: [0, 0.186, 0], seg: 10 }),
        capsule(0.0065, 0.03, wax, { pos: [0.027, 0.165, 0.008] }),
        capsule(0.0065, 0.06, wax, { pos: [-0.012, 0.15, 0.026] }),
        capsule(0.006, 0.018, wax, { pos: [-0.02, 0.172, -0.02] }),
        sphere(0.012, wax, { seg: 0, scale: [1.3, 0.5, 1.3], pos: [-0.014, 0.05, 0.034] }),
        cyl(0.0025, 0.0025, 0.016, PAL.ink, { pos: [0, 0.192, 0], seg: 4 }),
      ];
      const flame = joint('flame', [0, 0.19, 0], [
        lathe([[0, 0.192], [0.012, 0.2], [0.017, 0.214], [0.013, 0.232], [0.006, 0.25], [0, 0.262]], PAL.orange, { seg: 8, ao: 0 }),
        lathe([[0, 0.196], [0.009, 0.203], [0.012, 0.214], [0.007, 0.232], [0, 0.246]], PAL.yellow, { seg: 8, ao: 0, pos: [0, 0, 0.007] }),
        lathe([[0, 0.196], [0.009, 0.203], [0.012, 0.214], [0.007, 0.232], [0, 0.246]], PAL.yellow, { seg: 8, ao: 0, pos: [0, 0, -0.007] }),
      ]);
      return model('candle', body, [flame]);
    },
    idle: (root, t, k) => {
      const f = J(root, 'flame');
      if (!f) return;
      const n = Math.sin(t * 13) * 0.07 + Math.sin(t * 7.3 + 1) * 0.06 + Math.sin(t * 23) * 0.03;
      f.scale.set(1 - n * 0.6, 1 + n * k, 1 - n * 0.6);
      f.rotation.z = Math.sin(t * 4.1) * 0.08 * k;
    },
  },

  // ───────────────────────────────────────── umbrella
  {
    id: 'umbrella',
    name: 'Umbrella',
    category: 'object',
    tags: ['umbrella', 'rain', 'weather', 'protection', 'london', 'england', 'shelter', 'storm', 'autumn', 'gentleman', 'parasol', 'cover', 'insurance', 'chamberlain'],
    soundsLike: ['umbrella', 'um', 'brella', 'ella', 'parapluie', 'para', 'ombrelle', 'ombre'],
    anims: ['spin', 'float', 'wobble', 'dance'],
    build: (o) => {
      const c1 = tintOr(o, PAL.red);
      const c2 = PAL.cream;
      const R = 0.15, yA = 0.27, yR = 0.175, n = 8;
      const rings = [0.38, 0.72, 1];
      const Y = (t: number) => yA - (yA - yR) * t * t;
      const canopy: THREE.BufferGeometry[] = [];
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * PI * 2, a1 = ((i + 1) / n) * PI * 2, am = (a0 + a1) / 2;
        const P = (t: number, a: number, mid: boolean, drop = 0): V3 => {
          const rim = t === 1 && mid;
          const r = R * t * (mid ? (rim ? 0.955 : 0.985) : 1);
          return [Math.cos(a) * r, Y(t) + (rim ? 0.02 : 0) - drop, Math.sin(a) * r];
        };
        for (const under of [false, true]) {
          const d = under ? 0.003 : 0;
          const v: number[] = [];
          const tri = (p: V3, q: V3, s: V3) => (under ? v.push(...p, ...s, ...q) : v.push(...p, ...q, ...s));
          const apex: V3 = [0, yA - d, 0];
          tri(apex, P(rings[0], am, true, d), P(rings[0], a0, false, d));
          tri(apex, P(rings[0], a1, false, d), P(rings[0], am, true, d));
          for (let j = 0; j < rings.length - 1; j++) {
            const ta = rings[j], tb = rings[j + 1];
            for (const [x0, x1, m0, m1] of [[a0, am, false, true], [am, a1, true, false]] as [number, number, boolean, boolean][]) {
              tri(P(ta, x0, m0, d), P(ta, x1, m1, d), P(tb, x1, m1, d));
              tri(P(ta, x0, m0, d), P(tb, x1, m1, d), P(tb, x0, m0, d));
            }
          }
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
          canopy.push(part(g, under ? shade(i % 2 ? c2 : c1, -0.3) : i % 2 ? c2 : c1, { ao: 0.12 }));
        }
        canopy.push(sphere(0.006, PAL.charcoal, { seg: 0, pos: [Math.cos(a0) * R, yR - 0.002, Math.sin(a0) * R] }));
      }
      canopy.push(cyl(0.004, 0.008, 0.03, PAL.charcoal, { pos: [0, yA + 0.012, 0], seg: 6 }), sphere(0.008, PAL.gold, { seg: 0, pos: [0, yA + 0.03, 0] }));
      const spin = joint('spin', [0, 0, 0], canopy);
      spin.userData.axis = 'y';
      const body = [
        cyl(0.006, 0.006, yA - 0.04, PAL.charcoal, { pos: [0, 0.04 + (yA - 0.04) / 2, 0], seg: 6 }),
        tube([[0, 0.05, 0], [0, 0.03, 0], [0.006, 0.012, 0], [0.025, 0.004, 0], [0.044, 0.012, 0], [0.05, 0.03, 0], [0.046, 0.042, 0]], 0.009, PAL.woodDark, { seg: 14, radial: 6 }),
      ];
      return model('umbrella', body, [spin]);
    },
    idle: (root, t, k) => {
      const s = J(root, 'spin');
      if (s) s.rotation.y = t * 0.6 * k;
    },
  },

  // ───────────────────────────────────────── top hat
  {
    id: 'tophat',
    name: 'Top hat',
    category: 'object',
    tags: ['top hat', 'hat', 'magic', 'magician', 'gentleman', 'elegance', 'lincoln', 'churchill', 'victorian', 'party', 'rabbit', 'trick', 'aristocrat', 'banker', 'capitalism', 'formal'],
    soundsLike: ['hat', 'top', 'chapeau', 'haut', 'haute', 'tophat', 'magie'],
    anims: ['spin', 'bounce', 'flip', 'float', 'wobble'],
    build: (o) => {
      const c = tintOr(o, '#34353e');
      const oval: [number, number, number] = [1, 1, 0.86];
      const body = [
        lathe([[0, 0.004], [0.13, 0.0], [0.152, 0.008], [0.16, 0.018], [0.15, 0.022], [0.1, 0.017], [0.088, 0.02], [0.082, 0.06], [0.08, 0.12], [0.084, 0.19], [0.09, 0.205], [0.086, 0.212], [0, 0.214]], c, { seg: 18, scale: oval }),
        cyl(0.0848, 0.0895, 0.036, PAL.crimson, { pos: [0, 0.04, 0], seg: 18, scale: oval, ao: 0 }),
        box(0.032, 0.028, 0.004, PAL.gold, { pos: [0, 0.04, 0.077], ao: 0 }),
        box(0.018, 0.015, 0.005, PAL.crimson, { pos: [0, 0.04, 0.078], ao: 0 }),
      ];
      return model('tophat', body);
    },
  },

  // ───────────────────────────────────────── ball
  {
    id: 'ball',
    name: 'Beach ball',
    category: 'object',
    tags: ['ball', 'beach', 'play', 'game', 'summer', 'holiday', 'sport', 'bounce', 'round', 'fun', 'football', 'globe', 'party', 'childhood', 'volley'],
    soundsLike: ['ball', 'bal', 'balle', 'ballon', 'bol', 'bali', 'baltic'],
    anims: ['bounce', 'juggle', 'spin', 'rain', 'orbit'],
    build: (o) => {
      const R = 0.13;
      const cols = [tintOr(o, PAL.red), PAL.white, PAL.blue, PAL.yellow, PAL.white, PAL.green];
      const body: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 6; i++) body.push(part(new THREE.SphereGeometry(R, 3, 10, (i / 6) * PI * 2 + 0.9, PI / 3), cols[i], { pos: [0, R, 0], ao: 0.15 }));
      body.push(cyl(0.028, 0.03, 0.008, PAL.white, { pos: [0, 2 * R - 0.001, 0], seg: 10 }));
      body.push(cyl(0.006, 0.006, 0.01, PAL.white, { pos: [0.075, R + 0.09, 0.055], rot: [0.6, 0, -0.6], seg: 6 }));
      return model('ball', body);
    },
  },

  // ───────────────────────────────────────── dice
  {
    id: 'dice',
    name: 'Dice',
    category: 'object',
    tags: ['dice', 'die', 'chance', 'luck', 'gamble', 'risk', 'random', 'game', 'casino', 'probability', 'fate', 'caesar', 'rubicon', 'number', 'six', 'odds'],
    soundsLike: ['dice', 'dies', 'de', 'dais', 'hasard', 'die'],
    anims: ['bounce', 'flip', 'spin', 'juggle', 'rain', 'shake'],
    build: (o) => {
      const c = tintOr(o, PAL.red);
      const s = 0.09;
      const PIPS: Record<number, V2[]> = {
        1: [[0, 0]],
        2: [[-1, 1], [1, -1]],
        3: [[-1, 1], [0, 0], [1, -1]],
        4: [[-1, 1], [1, 1], [-1, -1], [1, -1]],
        5: [[-1, 1], [1, 1], [0, 0], [-1, -1], [1, -1]],
        6: [[-1, 1], [1, 1], [-1, 0], [1, 0], [-1, -1], [1, -1]],
      };
      // face: normal, u, v
      const F: [V3, V3, V3][] = [
        [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
        [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
        [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
        [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
        [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
        [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
      ];
      const die = (vals: number[]) => {
        const b = 0.009;
        const g = extrude(roundRectPts(s - 2 * b, s - 2 * b, 0.01, 2), s - 2 * b, c, { bevel: b, ao: 0.12 });
        const out = [g];
        vals.forEach((v, fi) => {
          const [n, u, w] = F[fi];
          for (const [pu, pv] of PIPS[v]) {
            const p: V3 = [0, 0, 0];
            for (let k = 0; k < 3; k++) p[k] = n[k] * (s / 2 + 0.0008) + (u[k] * pu + w[k] * pv) * 0.023;
            out.push(orient(disc(0.0095, PAL.white, { seg: 8 }), p, n));
          }
        });
        return out;
      };
      // [front, back, right, left, top, bottom]
      const a = xform(die([5, 2, 3, 4, 6, 1]), { rot: [0, 0.4, 0], pos: [-0.052, s / 2, 0] });
      const b = xform(die([3, 4, 1, 6, 2, 5]), { rot: [0, -0.62, 0], pos: [0.062, s / 2, 0.06] });
      return model('dice', [...a, ...b]);
    },
  },

  // ───────────────────────────────────────── anchor
  {
    id: 'anchor',
    name: 'Anchor',
    category: 'object',
    tags: ['anchor', 'navy', 'sea', 'sailor', 'ship', 'port', 'harbour', 'stability', 'hope', 'marine', 'ocean', 'dock', 'steady', 'fleet', 'admiralty', 'tattoo'],
    soundsLike: ['anc', 'anchor', 'ankara', 'ancre', 'anker', 'encre', 'anchorage'],
    anims: ['wobble', 'float', 'shake', 'spin', 'rain'],
    build: (o) => {
      const c = tintOr(o, '#4468a0');
      const rope = PAL.sand;
      const helix: V3[] = [];
      for (let i = 0; i <= 26; i++) {
        const u = i / 26;
        const a = u * PI * 2 * 3.2;
        helix.push([Math.cos(a) * 0.024, 0.07 + u * 0.13, Math.sin(a) * 0.024]);
      }
      const body = [
        cyl(0.014, 0.017, 0.225, c, { pos: [0, 0.14, 0], seg: 8 }),
        torus(0.028, 0.009, c, { pos: [0, 0.279, 0], seg: 12 }),
        cyl(0.019, 0.019, 0.014, shade(c, 0.1), { pos: [0, 0.249, 0], seg: 8 }),
        cyl(0.011, 0.011, 0.16, c, { rot: [0, 0, PI / 2], pos: [0, 0.218, 0], seg: 8 }),
        sphere(0.016, c, { seg: 1, pos: [-0.082, 0.218, 0] }),
        sphere(0.016, c, { seg: 1, pos: [0.082, 0.218, 0] }),
        torus(0.1, 0.014, c, { arc: PI, rot: [0, 0, PI], pos: [0, 0.125, 0], seg: 12 }),
        sphere(0.022, shade(c, 0.1), { seg: 1, pos: [0, 0.03, 0] }),
        extrude([[-0.03, 0], [0.03, 0], [0, 0.055]], 0.02, c, { pos: [0.1, 0.112, 0], rot: [0, 0, -0.4], bevel: 0.002 }),
        extrude([[-0.03, 0], [0.03, 0], [0, 0.055]], 0.02, c, { pos: [-0.1, 0.112, 0], rot: [0, 0, 0.4], bevel: 0.002 }),
        tube([...helix, [0.03, 0.212, 0.02], [0.07, 0.205, 0.03], [0.09, 0.18, 0.03], [0.1, 0.165, 0.028]], 0.006, rope, { seg: 64, radial: 5 }),
      ];
      return model('anchor', body);
    },
  },

  // ───────────────────────────────────────── gear
  {
    id: 'gear',
    name: 'Gears',
    category: 'object',
    tags: ['gear', 'machine', 'industry', 'industrial revolution', 'engineering', 'mechanism', 'factory', 'work', 'progress', 'cog', 'technology', 'clockwork', 'system', 'mechanics', 'settings'],
    soundsLike: ['gear', 'gea', 'cog', 'engrenage', 'rouage', 'roue', 'gare'],
    anims: ['spin', 'shake', 'bounce', 'idle'],
    build: (o) => {
      const big = tintOr(o, PAL.brass);
      const bc: V2 = [-0.05, 0.148];
      const sc: V2 = [bc[0] + 0.168 * Math.cos(0.62), bc[1] + 0.168 * Math.sin(0.62)];
      const body = [
        box(0.36, 0.03, 0.12, PAL.woodDark, { pos: [0, 0.015, 0] }),
        box(0.34, 0.008, 0.1, PAL.wood, { pos: [0, 0.034, 0] }),
        box(0.03, bc[1] - 0.03, 0.02, PAL.wood, { pos: [bc[0], 0.03 + (bc[1] - 0.03) / 2, -0.03] }),
        box(0.024, sc[1] - 0.03, 0.02, PAL.wood, { pos: [sc[0], 0.03 + (sc[1] - 0.03) / 2, -0.03] }),
      ];
      const holes = [0, 1, 2, 3, 4].map((i) => holePts(0.02, 8, Math.cos((i / 5) * PI * 2 + 0.3) * 0.057, Math.sin((i / 5) * PI * 2 + 0.3) * 0.057));
      const g1 = joint('spin', [bc[0], bc[1], 0.01], [
        extrudeHoles(gearPts(12, 0.112, 0.094), holes, 0.03, big, { pos: [bc[0], bc[1], 0.01] }),
        cyl(0.028, 0.028, 0.04, shade(big, -0.2), { rot: [PI / 2, 0, 0], pos: [bc[0], bc[1], 0.01], seg: 10 }),
        cyl(0.012, 0.012, 0.044, PAL.charcoal, { rot: [PI / 2, 0, 0], pos: [bc[0], bc[1], 0.01], seg: 6 }),
      ]);
      const g2 = joint('spin2', [sc[0], sc[1], 0.01], [
        extrudeHoles(gearPts(8, 0.074, 0.056), [holePts(0.012, 6, 0.032, 0), holePts(0.012, 6, -0.016, 0.028), holePts(0.012, 6, -0.016, -0.028)], 0.026, PAL.copper, { pos: [sc[0], sc[1], 0.01] }),
        cyl(0.018, 0.018, 0.034, shade(PAL.copper, -0.2), { rot: [PI / 2, 0, 0], pos: [sc[0], sc[1], 0.01], seg: 8 }),
      ]);
      return model('gear', body, [g1, g2]);
    },
    idle: (root, t, k) => {
      const a = J(root, 'spin');
      const b = J(root, 'spin2');
      const r = t * 0.7 * k;
      if (a) a.rotation.z = r;
      if (b) b.rotation.z = -r * 1.5 + 0.2;
    },
  },

  // ───────────────────────────────────────── hammer
  {
    id: 'hammer',
    name: 'Hammer',
    category: 'object',
    tags: ['hammer', 'tool', 'build', 'work', 'worker', 'nail', 'justice', 'judge', 'gavel', 'force', 'strike', 'labour', 'hammer and sickle', 'soviet', 'thor', 'construction', 'blacksmith'],
    soundsLike: ['ham', 'hammer', 'marteau', 'mart', 'hamm', 'hamburg'],
    anims: ['bounce', 'shake', 'wobble', 'march'],
    build: (o) => {
      const grip = tintOr(o, PAL.red);
      const steel = '#8f9aa6';
      const rz: V3 = [0, 0, PI / 2];
      const body = [
        box(0.11, 0.054, 0.054, steel, { pos: [0.005, 0.032, 0] }),
        cyl(0.029, 0.029, 0.03, steel, { rot: rz, pos: [0.072, 0.032, 0], seg: 10 }),
        cyl(0.033, 0.033, 0.018, shade(steel, 0.12), { rot: rz, pos: [0.095, 0.032, 0], seg: 10 }),
        ...[-0.014, 0.014].map((z) => sweep(curve([-0.045, 0.034, z], [-0.105, 0.03, z], [-0.13, 0.08, z], 6), (u) => 0.024 * (1 - u * 0.65), steel, { sides: 5, flat: 0.55 })),
        cyl(0.021, 0.025, 0.22, PAL.woodLight, { pos: [0, 0.168, 0], seg: 8 }),
        cyl(0.028, 0.029, 0.1, grip, { pos: [0, 0.25, 0], seg: 10 }),
        ...[0.215, 0.245, 0.275].map((y) => torus(0.028, 0.003, shade(grip, -0.2), { rot: [PI / 2, 0, 0], pos: [0, y, 0], seg: 10 })),
        cyl(0.03, 0.03, 0.012, shade(grip, -0.25), { pos: [0, 0.304, 0], seg: 10 }),
        box(0.024, 0.006, 0.024, PAL.charcoal, { pos: [0, 0.061, 0] }),
        // nail in a block
        box(0.08, 0.04, 0.06, PAL.woodLight, { pos: [0.175, 0.02, 0.05] }),
        cyl(0.005, 0.004, 0.05, PAL.steel, { pos: [0.175, 0.06, 0.05], seg: 5 }),
        cyl(0.013, 0.013, 0.005, PAL.steel, { pos: [0.175, 0.086, 0.05], seg: 8 }),
      ];
      return model('hammer', body);
    },
  },

  // ───────────────────────────────────────── envelope
  {
    id: 'envelope',
    name: 'Envelope',
    category: 'object',
    tags: ['envelope', 'letter', 'mail', 'post', 'message', 'telegram', 'zimmermann', 'secret', 'news', 'love letter', 'correspondence', 'diplomacy', 'invitation', 'ultimatum', 'note', 'send'],
    soundsLike: ['envelope', 'enve', 'lettre', 'letter', 'mail', 'poste', 'envoi', 'envoy'],
    anims: ['float', 'fly', 'flip', 'wobble', 'rain'],
    build: (o) => {
      const paper = tintOr(o, PAL.cream);
      const W = 0.24, H = 0.16, T = 0.012;
      const zb = T / 2;
      const body = [
        box(W, H, T, paper, { pos: [0, H / 2, 0], ao: 0.08 }),
        extrude([[-W / 2, 0], [W / 2, 0], [0, H * 0.56]], 0.002, shade(paper, -0.05), { pos: [0, 0, zb + 0.001], ao: 0 }),
        extrude([[-W / 2, 0.001], [-0.012, H * 0.5], [-W / 2, H]], 0.002, shade(paper, -0.1), { pos: [0, 0, zb + 0.0015], ao: 0 }),
        extrude([[W / 2, 0.001], [W / 2, H], [0.012, H * 0.5]], 0.002, shade(paper, -0.1), { pos: [0, 0, zb + 0.0015], ao: 0 }),
        // back: stamp + address lines
        box(0.036, 0.044, 0.002, PAL.white, { pos: [-W / 2 + 0.032, H - 0.032, -zb - 0.001], ao: 0 }),
        box(0.028, 0.034, 0.003, PAL.blue, { pos: [-W / 2 + 0.032, H - 0.032, -zb - 0.0012], ao: 0 }),
        ...[0, 1, 2].map((i) => box(0.1 - i * 0.015, 0.006, 0.002, PAL.ink, { pos: [0.01, H * 0.45 - i * 0.02, -zb - 0.001], ao: 0 })),
      ];
      const flapZ = zb + 0.003;
      const lid = joint('lid', [0, H, flapZ], [
        extrude([[-W / 2, H], [0, H * 0.36], [W / 2, H]], 0.002, shade(paper, 0.03), { pos: [0, 0, flapZ], ao: 0 }),
        cyl(0.021, 0.021, 0.006, PAL.crimson, { rot: [PI / 2, 0, 0], pos: [0, H * 0.4, flapZ + 0.003], seg: 10 }),
        cyl(0.013, 0.013, 0.006, PAL.red, { rot: [PI / 2, 0, 0], pos: [0, H * 0.4, flapZ + 0.005], seg: 8 }),
        sphere(0.008, PAL.crimson, { seg: 0, pos: [0.019, H * 0.4 - 0.012, flapZ + 0.003], scale: [1, 1, 0.5] }),
      ]);
      const letter = joint('letter', [0, 0, 0], [
        box(W * 0.86, H * 0.84, 0.003, PAL.white, { pos: [0, H * 0.46, 0.0015], ao: 0 }),
        ...[0, 1, 2].map((i) => box(W * (0.6 - i * 0.1), 0.006, 0.004, PAL.ink, { pos: [0, H * (0.8 - i * 0.075), 0.0015], ao: 0 })),
      ]);
      return model('envelope', body, [letter, lid]);
    },
    idle: (root, t, k) => {
      const lid = J(root, 'lid');
      const letter = J(root, 'letter');
      const p = (t * 0.2 * k) % 1;
      const sm = (a: number, b: number) => {
        const x = Math.min(1, Math.max(0, (p - a) / (b - a)));
        return x * x * (3 - 2 * x);
      };
      const open = sm(0.25, 0.38) - sm(0.85, 0.97);
      const rise = sm(0.4, 0.55) - sm(0.72, 0.84);
      if (lid) lid.rotation.x = -open * 3.35;
      if (letter) letter.position.y = rise * 0.075;
    },
  },

  // ───────────────────────────────────────── telephone
  {
    id: 'telephone',
    name: 'Rotary telephone',
    category: 'object',
    tags: ['telephone', 'phone', 'call', 'message', 'telegram', 'communication', 'hotline', 'bell', 'invention', 'news', 'ring', 'conversation', 'red phone', 'cold war', 'operator', 'number'],
    soundsLike: ['tele', 'phone', 'fon', 'telephone', 'allo', 'hello', 'ring', 'appel'],
    anims: ['shake', 'bounce', 'wobble', 'dance'],
    build: (o) => {
      const c = tintOr(o, PAL.red);
      const n: V3 = [0, 0.588, 0.809];
      const v: V3 = [0, 0.809, -0.588];
      const dc: V3 = [0, 0.068, 0.07];
      const on = (d: number, u: number, w: number): V3 => [u, dc[1] + n[1] * d + v[1] * w, dc[2] + n[2] * d + v[2] * w];
      const body: THREE.BufferGeometry[] = [
        box(0.21, 0.012, 0.22, shade(c, -0.4), { pos: [0, 0.006, 0] }),
        extrude([[-0.1, 0], [0.1, 0], [0.02, 0.11], [-0.065, 0.11], [-0.1, 0.06]], 0.17, c, { rot: [0, -PI / 2, 0], pos: [0, 0.012, 0], bevel: 0.012 }),
        orient(cyl(0.056, 0.056, 0.008, PAL.cream, { rot: [PI / 2, 0, 0], seg: 16 }), on(0.012, 0, 0), n),
        orient(disc(0.019, PAL.white, { seg: 10 }), on(0.017, 0, 0), n),
        orient(disc(0.008, c, { seg: 8 }), on(0.0175, 0, 0), n),
        orient(box(0.006, 0.02, 0.008, PAL.brass), on(0.018, 0.034, -0.03), n),
        box(0.012, 0.03, 0.012, shade(c, -0.2), { pos: [-0.07, 0.14, -0.03] }),
        box(0.012, 0.03, 0.012, shade(c, -0.2), { pos: [0.07, 0.14, -0.03] }),
      ];
      for (let i = 0; i < 10; i++) {
        const a = PI * 0.35 + (i / 10) * PI * 1.55;
        body.push(orient(disc(0.0085, PAL.charcoal, { seg: 8 }), on(0.0165, Math.cos(a) * 0.037, Math.sin(a) * 0.037), n));
      }
      // coiled cord
      const cord: V3[] = [];
      const base = curve([-0.1, 0.05, -0.06], [-0.2, 0.02, 0.04], [-0.105, 0.14, -0.03], 40);
      base.forEach((p, i) => {
        const a = i * 1.7;
        cord.push([p[0] + Math.cos(a) * 0.008, p[1] + Math.sin(a) * 0.008, p[2] + Math.sin(a) * 0.006]);
      });
      body.push(sweep(cord, 0.0035, shade(c, -0.15), { sides: 4 }));
      const hy = 0.172;
      const head = joint('head', [0, hy, -0.03], [
        capsule(0.017, 0.17, c, { rot: [0, 0, PI / 2], pos: [0, hy, -0.03] }),
        cyl(0.034, 0.022, 0.034, c, { pos: [-0.1, hy - 0.022, -0.03], seg: 12 }),
        cyl(0.034, 0.022, 0.034, c, { pos: [0.1, hy - 0.022, -0.03], seg: 12 }),
        cyl(0.028, 0.028, 0.004, shade(c, -0.3), { pos: [-0.1, hy - 0.04, -0.03], seg: 10 }),
      ]);
      return model('telephone', body, [head]);
    },
    idle: (root, t, k) => {
      const h = J(root, 'head');
      if (!h) return;
      const e = Math.pow(Math.max(0, Math.sin(t * 2.2)), 2);
      h.rotation.z = Math.sin(t * 40) * 0.06 * e * k;
      h.position.y = 0.172 + Math.abs(Math.sin(t * 40)) * 0.007 * e * k;
    },
  },

  // ───────────────────────────────────────── radio
  {
    id: 'radio',
    name: 'Valve radio',
    category: 'object',
    tags: ['radio', 'broadcast', 'news', 'music', 'bbc', 'speech', 'propaganda', 'announcement', 'wireless', 'de gaulle', 'appeal', 'resistance', 'churchill', 'songs', 'signal', 'waves', 'marconi'],
    soundsLike: ['radio', 'rad', 'radi', 'ray', 'tsf', 'poste', 'radium'],
    anims: ['dance', 'bounce', 'shake', 'wobble', 'idle'],
    build: (o) => {
      const wood = tintOr(o, PAL.wood);
      const arch = (w: number, spring: number, bottom: number, n = 10): V2[] => {
        const pts: V2[] = [[-w, bottom], [w, bottom]];
        for (let i = 0; i <= n; i++) {
          const a = (i / n) * PI;
          pts.push([Math.cos(a) * w, spring + Math.sin(a) * w]);
        }
        return pts;
      };
      const D = 0.1;
      const zf = D / 2 + 0.008;
      const grille = arch(0.082, 0.19, 0.1);
      const body: THREE.BufferGeometry[] = [
        box(0.27, 0.022, 0.13, PAL.woodDark, { pos: [0, 0.011, 0] }),
        extrudeHoles(arch(0.12, 0.18, 0.022), [], D, wood, { bevel: 0.008 }),
        extrudeHoles(arch(0.098, 0.19, 0.088), [grille.slice().reverse()], 0.01, PAL.woodDark, { pos: [0, 0, zf] }),
        extrudeHoles(grille, [], 0.004, '#e6c68a', { pos: [0, 0, zf - 0.002], ao: 0 }),
        ...[-0.05, 0, 0.05].map((x) => box(0.012, 0.19 + Math.sqrt(0.082 * 0.082 - x * x) - 0.1, 0.008, PAL.woodDark, { pos: [x, (0.19 + Math.sqrt(0.082 * 0.082 - x * x) + 0.1) / 2, zf] })),
        // dial
        extrudeHoles([[-0.036, 0.042], [0.036, 0.042], ...circlePts(0.036, 12, 0, 0.042).slice(1, 6)], [], 0.004, PAL.amber, { pos: [0, 0, zf], ao: 0 }),
        box(0.08, 0.006, 0.006, PAL.brass, { pos: [0, 0.041, zf] }),
        box(0.003, 0.03, 0.006, PAL.red, { pos: [0.006, 0.058, zf + 0.001], rot: [0, 0, -0.5], ao: 0 }),
        ...[-0.085, 0.085].flatMap((x) => [
          cyl(0.017, 0.019, 0.016, PAL.woodDark, { rot: [PI / 2, 0, 0], pos: [x, 0.058, zf], seg: 10 }),
          cyl(0.008, 0.008, 0.018, PAL.brass, { rot: [PI / 2, 0, 0], pos: [x, 0.058, zf + 0.002], seg: 6 }),
        ]),
        sphere(0.014, PAL.woodDark, { seg: 0, pos: [0, 0.31, 0], scale: [1, 1.3, 1] }),
      ];
      for (let i = 0; i < 5; i++) {
        const a = PI * 0.2 + (i / 4) * PI * 0.6;
        body.push(box(0.002, 0.008, 0.005, PAL.ink, { pos: [Math.cos(a) * 0.028, 0.042 + Math.sin(a) * 0.028, zf + 0.001], rot: [0, 0, a - PI / 2], ao: 0 }));
      }
      const note = (x: number, y: number, s: number): THREE.BufferGeometry[] => [
        sphere(0.014 * s, PAL.gold, { seg: 0, scale: [1.35, 1, 0.6], rot: [0, 0, 0.4], pos: [x, y, 0], ao: 0 }),
        box(0.005 * s, 0.05 * s, 0.006 * s, PAL.gold, { pos: [x + 0.016 * s, y + 0.025 * s, 0], ao: 0 }),
        box(0.018 * s, 0.006 * s, 0.006 * s, PAL.gold, { pos: [x + 0.024 * s, y + 0.045 * s, 0], rot: [0, 0, -0.7], ao: 0 }),
      ];
      const notes = joint('notes', [0.14, 0.26, 0], [...note(0.125, 0.24, 1), ...note(0.165, 0.29, 0.8)]);
      return model('radio', body, [notes]);
    },
    idle: (root, t, k) => {
      const n = J(root, 'notes');
      if (!n) return;
      n.position.y = 0.26 + Math.sin(t * 2.2) * 0.012 * k;
      n.rotation.z = Math.sin(t * 2.7) * 0.18 * k;
    },
  },

  // ───────────────────────────────────────── medal
  {
    id: 'medal',
    name: 'Medal',
    category: 'object',
    tags: ['medal', 'honour', 'bravery', 'hero', 'award', 'victory', 'soldier', 'decoration', 'war', 'veteran', 'olympics', 'gold', 'prize', 'merit', 'remembrance', 'victoria cross'],
    soundsLike: ['medal', 'med', 'medaille', 'meddle', 'metal'],
    anims: ['spin', 'wobble', 'bounce', 'grow'],
    build: (o) => {
      const g = PAL.gold;
      const stripes = o.tint ? [PAL.white, o.tint, o.tint, o.tint, PAL.white] : [PAL.red, PAL.yellow, PAL.green, PAL.purple, PAL.green, PAL.yellow, PAL.red];
      const body = [
        box(0.16, 0.022, 0.085, PAL.woodDark, { pos: [0, 0.011, 0] }),
        box(0.018, 0.3, 0.018, PAL.wood, { pos: [0, 0.172, -0.03] }),
        box(0.12, 0.016, 0.018, PAL.wood, { pos: [0, 0.322, -0.03] }),
        cyl(0.004, 0.004, 0.03, PAL.brass, { rot: [PI / 2, 0, 0], pos: [0, 0.314, -0.012], seg: 5 }),
      ];
      const top = 0.3, wR = 0.045;
      const yb = (x: number) => 0.2 - (wR - Math.abs(x)) * 0.45;
      const rib: THREE.BufferGeometry[] = [];
      stripes.forEach((c, i) => {
        const x0 = -wR + (i / stripes.length) * 2 * wR;
        const x1 = -wR + ((i + 1) / stripes.length) * 2 * wR;
        const pts: V2[] = [[x0, yb(x0)]];
        if (x0 < 0 && x1 > 0) pts.push([0, yb(0)]);
        pts.push([x1, yb(x1)], [x1, top], [x0, top]);
        rib.push(extrudeHoles(pts, [], 0.004, c, { ao: 0.1 }));
      });
      const swing = joint('swing', [0, 0.31, 0], [
        box(0.1, 0.014, 0.012, g, { pos: [0, 0.305, 0] }),
        ...rib,
        torus(0.01, 0.003, g, { pos: [0, 0.173, 0], seg: 8 }),
        extrudeHoles(starPts(5, 0.072, 0.034, 0, 0.1), [], 0.01, g, { bevel: 0.003 }),
        cyl(0.03, 0.03, 0.018, PAL.crimson, { rot: [PI / 2, 0, 0], pos: [0, 0.1, 0], seg: 12 }),
        torus(0.03, 0.004, g, { pos: [0, 0.1, 0.009], seg: 12 }),
        extrudeHoles(starPts(5, 0.017, 0.007, 0, 0.1), [], 0.022, g),
      ]);
      return model('medal', body, [swing]);
    },
    idle: (root, t, k) => {
      const s = J(root, 'swing');
      if (!s) return;
      s.rotation.z = Math.sin(t * 1.7) * 0.06 * k;
      s.rotation.y = Math.sin(t * 1.1) * 0.15 * k;
    },
  },

  // ───────────────────────────────────────── poppy
  {
    id: 'poppy',
    name: 'Poppy',
    category: 'object',
    tags: ['poppy', 'remembrance', 'armistice', 'flanders', 'memorial', 'veterans', 'sacrifice', 'peace', 'flower', 'november', '11 november', 'poem', 'fields', 'mourning', 'somme', 'opium', 'red flower'],
    soundsLike: ['poppy', 'pop', 'popi', 'coquelicot', 'coq', 'papi', 'pape'],
    anims: ['wobble', 'grow', 'idle', 'dance', 'rain'],
    build: (o) => {
      const red = tintOr(o, PAL.red);
      const rnd = rng(21);
      const leaf: V2[] = [[0, 0], [0.02, 0.012], [0.03, 0.006], [0.045, 0.016], [0.06, 0.004], [0.075, 0.01], [0.09, 0], [0.07, -0.01], [0.05, -0.006], [0.03, -0.012]];
      const body = [
        ...mound(0.085, rnd),
        sweep(curve([-0.01, 0.02, -0.01], [-0.05, 0.1, -0.02], [-0.07, 0.15, -0.03], 6), 0.004, PAL.green, { sides: 5 }),
        ...aimY(poppyHead(0.05, shade(red, -0.05), rnd), [-0.072, 0.152, -0.028], [-0.5, 0.75, 0.45]),
        sweep([[0.015, 0.02, 0.0], [0.04, 0.09, 0.0], [0.06, 0.13, 0.01], [0.075, 0.125, 0.015], [0.08, 0.108, 0.018]], 0.0035, PAL.green, { sides: 5 }),
        sphere(0.014, PAL.green, { seg: 1, scale: [0.8, 1.25, 0.8], pos: [0.081, 0.097, 0.018], rot: [0, 0, 0.3] }),
        extrude(leaf, 0.004, PAL.green, { pos: [0.005, 0.03, 0.02], rot: [-0.5, -0.6, 0.5] }),
        extrude(leaf, 0.004, PAL.forest, { pos: [-0.01, 0.03, 0.01], rot: [-0.4, 0.4 + PI, 0.6] }),
      ];
      const head = joint('head', [0, 0.02, 0], [
        sweep(curve([0, 0.02, 0], [0.03, 0.14, 0], [0.005, 0.225, 0.028], 7), 0.0048, PAL.green, { sides: 5 }),
        ...aimY(poppyHead(0.07, red, rnd), [0.004, 0.228, 0.03], [0.05, 0.72, 0.7]),
      ]);
      return model('poppy', body, [head]);
    },
    idle: (root, t, k) => {
      const h = J(root, 'head');
      if (!h) return;
      h.rotation.z = Math.sin(t * 1.4) * 0.05 * k;
      h.rotation.x = Math.sin(t * 1.1 + 1) * 0.03 * k;
    },
  },

  // ───────────────────────────────────────── helmet (Brodie)
  {
    id: 'helmet',
    name: 'Brodie helmet',
    category: 'object',
    tags: ['helmet', 'soldier', 'tommy', 'war', 'ww1', 'trenches', 'protection', 'army', 'brodie', 'infantry', 'battle', 'somme', 'verdun', 'veteran', 'armistice', 'front', 'safety'],
    soundsLike: ['helmet', 'hel', 'helm', 'casque', 'cask', 'tommy', 'hell'],
    anims: ['wobble', 'spin', 'bounce', 'shake'],
    build: (o) => {
      const c = tintOr(o, '#76803f');
      const oval: [number, number, number] = [1, 1, 0.88];
      const shell = new THREE.LatheGeometry(
        ([[0.158, 0], [0.163, 0.008], [0.135, 0.02], [0.112, 0.034], [0.102, 0.05], [0.094, 0.07], [0.078, 0.088], [0.05, 0.1], [0, 0.104], [0, 0.097], [0.048, 0.093], [0.072, 0.082], [0.087, 0.066], [0.095, 0.048], [0.105, 0.03], [0.13, 0.013], [0.153, 0.002]] as V2[]).map(([x, y]) => new THREE.Vector2(x, y)),
        16,
      );
      const shellParts = [
        part(jitter(shell.toNonIndexed(), 0.0022, 9), c, { scale: oval, ao: 0.25 }),
        torus(0.157, 0.0055, shade(c, 0.12), { rot: [PI / 2, 0, 0], pos: [0, 0.006, 0], seg: 16, scale: [1, 1, 0.88] }),
        sphere(0.013, shade(c, -0.12), { seg: 1, scale: [1, 0.5, 1], pos: [0, 0.103, 0] }),
        lathe([[0, 0.088], [0.03, 0.086], [0.058, 0.075], [0.078, 0.052], [0.084, 0.03], [0.082, 0.014]], '#5a3a22', { seg: 12, scale: oval, ao: 0 }),
        ...[-1, 1].map((sx) => box(0.012, 0.02, 0.006, PAL.woodDark, { pos: [sx * 0.098, 0.03, 0], rot: [0, PI / 2, sx * 0.35] })),
      ];
      const tilt = new THREE.Euler(0, 0, 0);
      xform(shellParts, { rot: [tilt.x, tilt.y, tilt.z] });
      let minY = Infinity;
      for (const g of shellParts) {
        g.computeBoundingBox();
        minY = Math.min(minY, g.boundingBox!.min.y);
      }
      xform(shellParts, { pos: [0, -minY, 0] });
      const at = (x: number, y: number, z: number): V3 => {
        const v = new THREE.Vector3(x, y, z).applyEuler(tilt);
        return [v.x, v.y - minY, v.z];
      };
      const L = at(-0.098, 0.022, 0.0), R = at(0.098, 0.022, 0.0);
      const body = [
        ...shellParts,
        sweep([R, [R[0] + 0.004, 0.006, 0.06], [0.05, 0.004, 0.13], [-0.02, 0.004, 0.14], [-0.075, 0.005, 0.1], [L[0] - 0.004, 0.006, 0.05], L], 0.008, PAL.woodDark, { sides: 4, flat: 0.35 }),
        box(0.02, 0.006, 0.016, PAL.brass, { pos: [0.015, 0.007, 0.137], rot: [0, 0.2, 0] }),
      ];
      return model('helmet', body);
    },
  },

  // ───────────────────────────────────────── cannon
  {
    id: 'cannon',
    name: 'Ceremonial cannon',
    category: 'object',
    tags: ['cannon', 'artillery', 'salute', 'ceremony', 'war', 'battle', 'fort', 'napoleon', 'gun salute', 'boom', 'siege', 'big bertha', 'pirate', 'fireworks', 'celebration', 'launch'],
    soundsLike: ['cannon', 'canon', 'can', 'cannes', 'kanon', 'boum', 'boom', 'canyon'],
    anims: ['shake', 'bounce', 'wobble', 'idle'],
    build: (o) => {
      const bronze = tintOr(o, PAL.brass);
      const wheel = PAL.red;
      const rnd = rng(3);
      const W = 0.075, ax = 0.0, ay = 0.075;
      const barrel = [
        lathe([[0, 0], [0.024, 0], [0.043, 0.012], [0.046, 0.03], [0.049, 0.032], [0.049, 0.046], [0.043, 0.05], [0.04, 0.1], [0.044, 0.104], [0.044, 0.116], [0.036, 0.12], [0.031, 0.198], [0.036, 0.212], [0.042, 0.226], [0.042, 0.236], [0.026, 0.236], [0.026, 0.222], [0, 0.215]], bronze, { seg: 12 }),
        sphere(0.016, bronze, { seg: 1, pos: [0, -0.014, 0] }),
        cyl(0.025, 0.025, 0.004, PAL.charcoal, { pos: [0, 0.228, 0], seg: 10, ao: 0 }),
        rod([0, 0.2, 0], [0, 0.262, 0], 0.003, PAL.green, { seg: 4 }),
        ...xform(daisy(0.026, PAL.white, PAL.yellow), { rot: [0.25, 0, -0.1], pos: [0, 0.266, 0.004] }),
      ];
      xform(barrel, { pos: [0, -0.085, 0] });
      xform(barrel, { rot: [0, 0, -PI / 2 + 0.38], pos: [0.005, 0.125, 0] });
      const body = [
        ...barrel,
        cyl(0.012, 0.012, 0.108, bronze, { rot: [PI / 2, 0, 0], pos: [0.005, 0.125, 0], seg: 8 }),
        extrude([[-0.06, 0.07], [0.05, 0.07], [0.05, 0.1], [0.025, 0.13], [-0.03, 0.13], [-0.065, 0.1]], 0.014, PAL.wood, { pos: [0, 0, 0.046] }),
        extrude([[-0.06, 0.07], [0.05, 0.07], [0.05, 0.1], [0.025, 0.13], [-0.03, 0.13], [-0.065, 0.1]], 0.014, PAL.wood, { pos: [0, 0, -0.046] }),
        box(0.24, 0.032, 0.07, PAL.wood, { pos: [-0.1, 0.045, 0], rot: [0, 0, 0.3] }),
        box(0.02, 0.012, 0.074, PAL.charcoal, { pos: [-0.2, 0.016, 0], rot: [0, 0, 0.3] }),
        cyl(0.008, 0.008, 0.17, PAL.charcoal, { rot: [PI / 2, 0, 0], pos: [ax, ay, 0], seg: 6 }),
        ...[[0.13, 0.022, 0.07], [0.176, 0.022, 0.07], [0.153, 0.022, 0.11], [0.153, 0.058, 0.084]].map((p) => sphere(0.023, PAL.charcoal, { seg: 1, pos: p as V3 })),
        ...[0, 1, 2, 3].map((i) => cone(0.007, 0.03, i % 2 ? PAL.lime : PAL.green, { seg: 3, pos: [-0.16 + i * 0.1, 0.012, -0.09 + rnd() * 0.02], rot: [0, 0, (rnd() - 0.5) * 0.5] })),
      ];
      const wparts: THREE.BufferGeometry[] = [];
      for (const z of [-W, W]) {
        wparts.push(torus(0.064, 0.012, PAL.charcoal, { pos: [ax, ay, z], seg: 14 }));
        wparts.push(cyl(0.017, 0.017, 0.028, shade(wheel, -0.25), { rot: [PI / 2, 0, 0], pos: [ax, ay, z], seg: 8 }));
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * PI * 2;
          wparts.push(box(0.011, 0.11, 0.009, wheel, { pos: [ax + Math.cos(a) * 0.035, ay + Math.sin(a) * 0.035, z], rot: [0, 0, a - PI / 2], ao: 0 }));
        }
      }
      const spin = joint('spin', [ax, ay, 0], wparts);
      return model('cannon', body, [spin]);
    },
  },

  // ───────────────────────────────────────── scroll
  {
    id: 'scroll',
    name: 'Scroll',
    category: 'object',
    text: true,
    tags: ['scroll', 'parchment', 'treaty', 'decree', 'proclamation', 'law', 'charter', 'declaration', 'versailles', 'magna carta', 'history', 'document', 'constitution', 'manuscript', 'ancient', 'contract', 'edict'],
    soundsLike: ['scroll', 'scro', 'roll', 'rouleau', 'parchemin', 'traite', 'charte'],
    anims: ['float', 'wobble', 'grow', 'spin'],
    build: (o) => {
      const paper = tintOr(o, PAL.parchment);
      const W = 0.2, y0 = 0.02, y1 = 0.25;
      const bend = (x: number) => 0.007 * Math.sin((x / W) * PI * 2);
      const sheet = part(new THREE.BoxGeometry(W, y1 - y0, 0.003, 10, 1, 1), paper, { pos: [0, (y0 + y1) / 2, 0], ao: 0.04 });
      bendZ(sheet, (x) => bend(x));
      const roll = (y: number) => [
        cyl(0.019, 0.019, W + 0.006, shade(paper, -0.06), { rot: [0, 0, PI / 2], pos: [0, y, 0], seg: 10 }),
        cyl(0.0075, 0.0075, W + 0.05, PAL.woodDark, { rot: [0, 0, PI / 2], pos: [0, y, 0], seg: 6 }),
        sphere(0.013, PAL.gold, { seg: 1, pos: [-W / 2 - 0.03, y, 0] }),
        sphere(0.013, PAL.gold, { seg: 1, pos: [W / 2 + 0.03, y, 0] }),
        torus(0.019, 0.003, shade(paper, -0.2), { rot: [0, PI / 2, 0], pos: [W / 2 - 0.004, y, 0], seg: 10 }),
      ];
      const body = [
        sheet,
        ...roll(y1),
        ...roll(0.019),
        // seal with ribbon tails
        box(0.012, 0.06, 0.003, PAL.crimson, { pos: [0.068, 0.045, 0.02], rot: [0, 0, 0.25], ao: 0 }),
        box(0.012, 0.055, 0.003, PAL.red, { pos: [0.084, 0.048, 0.021], rot: [0, 0, -0.2], ao: 0 }),
        cyl(0.02, 0.02, 0.006, PAL.crimson, { rot: [PI / 2, 0, 0], pos: [0.075, 0.068, 0.023], seg: 10 }),
        cyl(0.012, 0.012, 0.006, PAL.red, { rot: [PI / 2, 0, 0], pos: [0.075, 0.068, 0.025], seg: 8 }),
      ];
      const txt = labelPlane(o.label ?? '', W * 0.84, 0.15, { segX: 10 });
      bendZ(txt.geometry, (x) => bend(x) + 0.0022);
      txt.position.set(0, 0.148, 0);
      const root = model('scroll', body);
      root.add(txt);
      return root;
    },
  },

  // ───────────────────────────────────────── flag
  {
    id: 'flag',
    name: 'Flag',
    category: 'object',
    tags: ['flag', 'nation', 'country', 'victory', 'conquest', 'patriotism', 'independence', 'territory', 'claim', 'summit', 'banner', 'team', 'surrender', 'armistice', 'celebration', 'capital'],
    soundsLike: ['flag', 'fla', 'drapeau', 'drap', 'banner', 'banniere', 'flac'],
    anims: ['wobble', 'idle', 'grow', 'spin'],
    text: true,
    build: (o) => {
      const band = tintOr(o, PAL.red);
      const L = 0.21, Hc = 0.135, py = 0.25;
      const body = [
        lathe([[0, 0], [0.055, 0], [0.05, 0.014], [0.024, 0.022], [0.012, 0.03], [0, 0.03]], PAL.woodDark, { seg: 12 }),
        cyl(0.0065, 0.0075, 0.32, PAL.wood, { pos: [0, 0.18, 0], seg: 6 }),
        sphere(0.015, PAL.gold, { seg: 1, pos: [0, 0.345, 0] }),
        torus(0.009, 0.0025, PAL.gold, { rot: [PI / 2, 0, 0], pos: [0, py + Hc / 2 - 0.01, 0], seg: 8 }),
        torus(0.009, 0.0025, PAL.gold, { rot: [PI / 2, 0, 0], pos: [0, py - Hc / 2 + 0.01, 0], seg: 8 }),
      ];
      const x0 = 0.008;
      const seg = 12;
      const cloth = [
        part(new THREE.BoxGeometry(L, Hc * 0.72, 0.004, seg, 1, 1), PAL.cream, { pos: [x0 + L / 2, py, 0], ao: 0 }),
        part(new THREE.BoxGeometry(L, Hc * 0.14, 0.0046, seg, 1, 1), band, { pos: [x0 + L / 2, py + Hc * 0.43, 0], ao: 0 }),
        part(new THREE.BoxGeometry(L, Hc * 0.14, 0.0046, seg, 1, 1), band, { pos: [x0 + L / 2, py - Hc * 0.43, 0], ao: 0 }),
      ];
      const cj = joint('cloth', [x0, py, 0], cloth);
      const txt = labelPlane(o.label ?? '', L * 0.88, Hc * 0.64, { segX: seg });
      txt.geometry.translate(L / 2 + 0.002, 0, 0.0026);
      cj.add(txt);
      const cm = cj.children[0] as THREE.Mesh;
      keepRest(cm.geometry);
      keepRest(txt.geometry);
      wave(cm, 0.6, L, 0.016);
      wave(txt, 0.6, L, 0.016);
      cm.frustumCulled = false;
      txt.frustumCulled = false;
      return model('flag', body, [cj]);
    },
    idle: (root, t, k) => {
      const c = J(root, 'cloth');
      if (!c) return;
      const amp = 0.016 * Math.min(2, k);
      wave(c.children[0] as THREE.Mesh, t * (0.7 + 0.3 * k), 0.21, amp);
      wave(c.children[1] as THREE.Mesh, t * (0.7 + 0.3 * k), 0.21, amp);
    },
  },

  // ───────────────────────────────────────── sign
  {
    id: 'sign',
    name: 'Signpost',
    category: 'object',
    tags: ['sign', 'signpost', 'direction', 'way', 'road', 'place', 'destination', 'name', 'city', 'border', 'warning', 'notice', 'here', 'route', 'journey', 'label', 'placard'],
    soundsLike: ['sign', 'sin', 'sine', 'panneau', 'pan', 'signe', 'cygne'],
    anims: ['wobble', 'bounce', 'grow', 'idle'],
    text: true,
    build: (o) => {
      const frame = tintOr(o, PAL.woodDark);
      const rnd = rng(8);
      const cy = 0.215, bw = 0.27, bh = 0.15, bd = 0.018;
      const zf = bd / 2;
      const body = [
        ...mound(0.08, rnd, 6),
        box(0.026, 0.3, 0.026, PAL.wood, { pos: [0, 0.15, -0.022] }),
        cone(0.02, 0.018, PAL.wood, { seg: 4, rot: [0, PI / 4, 0], pos: [0, 0.309, -0.022] }),
        extrudeHoles(roundRectPts(bw, bh, 0.014, 2, 0, cy), [], bd, frame, { bevel: 0.002 }),
        box(bw - 0.026, bh - 0.026, 0.004, PAL.cream, { pos: [0, cy, zf + 0.002], ao: 0 }),
        ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) => sphere(0.005, PAL.charcoal, { seg: 0, pos: [sx * (bw / 2 - 0.007), cy + sy * (bh / 2 - 0.007), zf + 0.002] })),
        extrudeHoles([[-0.075, 0.1], [-0.055, 0.12], [0.06, 0.12], [0.06, 0.08], [-0.055, 0.08]], [], 0.014, PAL.woodLight, { pos: [0, 0, -0.004], rot: [0, 0, -0.04] }),
      ];
      const txt = labelPlane(o.label ?? '', bw - 0.04, bh - 0.04);
      txt.position.set(0, cy, zf + 0.0045);
      const root = model('sign', body);
      root.add(txt);
      return root;
    },
  },

  // ───────────────────────────────────────── plaque
  {
    id: 'plaque',
    name: 'Brass plaque',
    category: 'object',
    tags: ['plaque', 'date', 'year', 'number', 'memorial', 'commemoration', 'anniversary', 'record', 'museum', 'engraving', 'history', 'milestone', 'dedication', 'monument', 'label', 'title'],
    soundsLike: ['plaque', 'plac', 'plate', 'plaquette', 'plack', 'black'],
    anims: ['grow', 'wobble', 'float', 'idle', 'spin'],
    text: true,
    build: (o) => {
      const brass = tintOr(o, PAL.brass);
      const pw = 0.24, ph = 0.17, pd = 0.014;
      const piv = new THREE.Vector3(0, 0.043, 0);
      const tilt = -0.2;
      const cy = piv.y + ph / 2 + 0.004;
      const zf = pd / 2 + 0.004;
      const plaque = [
        extrudeHoles(roundRectPts(pw, ph, 0.016, 2, 0, cy), [], pd, brass, { bevel: 0.004 }),
        box(pw - 0.034, ph - 0.034, 0.004, PAL.cream, { pos: [0, cy, zf], ao: 0 }),
        ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) => cyl(0.006, 0.006, 0.004, shade(brass, 0.15), { rot: [PI / 2, 0, 0], pos: [sx * (pw / 2 - 0.009), cy + sy * (ph / 2 - 0.009), zf - 0.001], seg: 6 })),
      ];
      xform(plaque, { pos: [0, -piv.y, 0] });
      xform(plaque, { rot: [tilt, 0, 0], pos: [0, piv.y, 0] });
      const body = [
        box(0.27, 0.03, 0.12, PAL.woodDark, { pos: [0, 0.015, 0] }),
        box(0.25, 0.012, 0.1, PAL.wood, { pos: [0, 0.036, 0] }),
        ...plaque,
        rod([0, 0.12, -0.02], [0, 0.04, -0.045], 0.007, PAL.woodDark, { seg: 5 }),
      ];
      const txt = labelPlane(o.label ?? '', pw - 0.05, ph - 0.05, { maxLines: 2 });
      const p = new THREE.Vector3(0, cy - piv.y, zf + 0.0025).applyEuler(new THREE.Euler(tilt, 0, 0)).add(piv);
      txt.position.copy(p);
      txt.rotation.x = tilt;
      const root = model('plaque', body);
      root.add(txt);
      return root;
    },
  },

  // ───────────────────────────────────────── can (with berries: Canberra)
  {
    id: 'can',
    name: 'Tin can of berries',
    category: 'object',
    tags: ['can', 'tin', 'berries', 'canberra', 'food', 'preserve', 'jam', 'ration', 'recycling', 'canning', 'soup', 'supplies', 'fruit', 'australia', 'blueberry', 'raspberry'],
    soundsLike: ['can', 'canberra', 'canne', 'berry', 'berra', 'boite', 'conserve', 'cannes', 'kan'],
    anims: ['bounce', 'wobble', 'spin', 'stack', 'shake'],
    build: (o) => {
      const lab = tintOr(o, PAL.red);
      const steel = '#c7cdd3';
      const R = 0.07, H = 0.17;
      const body: THREE.BufferGeometry[] = [
        cyl(R, R, H, steel, { pos: [0, H / 2, 0], seg: 16, ao: 0.1 }),
        cyl(R + 0.003, R + 0.003, 0.009, shade(steel, -0.12), { pos: [0, H - 0.004, 0], seg: 16 }),
        cyl(R + 0.003, R + 0.003, 0.009, shade(steel, -0.12), { pos: [0, 0.0045, 0], seg: 16 }),
        cyl(R + 0.0015, R + 0.0015, 0.115, lab, { pos: [0, 0.085, 0], seg: 16, ao: 0 }),
        cyl(R + 0.0022, R + 0.0022, 0.03, PAL.cream, { pos: [0, 0.085, 0], seg: 16, ao: 0 }),
        orient(cyl(0.028, 0.028, 0.004, PAL.white, { rot: [PI / 2, 0, 0], seg: 12, scale: [1.2, 1, 1] }), [0, 0.085, R + 0.002], [0, 0, 1]),
        ...[[-0.009, 0.089], [0.009, 0.089], [0, 0.077]].map(([x, y]) => sphere(0.0095, PAL.purple, { seg: 0, pos: [x, y, R + 0.007], ao: 0 })),
        extrude([[0, 0], [0.01, 0.006], [0.02, 0]], 0.003, PAL.green, { pos: [-0.002, 0.097, R + 0.007], rot: [0, 0, 0.3] }),
        cyl(0.028, 0.03, 0.012, PAL.plum, { pos: [0, H - 0.004, 0], seg: 12 }),
      ];
      const berries: [number, number, number, number][] = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * PI * 2 + 0.3;
        berries.push([Math.cos(a) * 0.042, H + 0.012, Math.sin(a) * 0.042, 0.024]);
      }
      berries.push([0.012, H + 0.036, 0.01, 0.026], [-0.018, H + 0.034, -0.012, 0.024], [0.0, H + 0.058, 0.0, 0.022]);
      berries.forEach(([x, y, z, r], i) => {
        const rasp = i % 3 === 1;
        body.push(sphere(r, rasp ? PAL.crimson : i % 3 === 2 ? '#4a3f96' : '#3c4f9e', { seg: 1, pos: [x, y, z], ao: 0.1, scale: rasp ? [1, 1.15, 1] : 1 }));
        if (!rasp) body.push(sphere(r * 0.3, PAL.navy, { seg: 0, pos: [x * 1.05, y + r * 0.9, z * 1.05], scale: [1, 0.4, 1], ao: 0 }));
      });
      body.push(sphere(0.022, '#3c4f9e', { seg: 1, pos: [0.11, 0.022, 0.06] }));
      body.push(sphere(0.02, PAL.crimson, { seg: 1, pos: [0.085, 0.02, 0.1], scale: [1, 1.15, 1] }));
      const leaf: V2[] = [[0, 0], [0.018, 0.012], [0.04, 0.008], [0.055, 0], [0.04, -0.008], [0.018, -0.012]];
      body.push(extrude(leaf, 0.003, PAL.green, { pos: [0.02, H + 0.06, 0.02], rot: [0.4, -0.6, 0.6] }));
      body.push(extrude(leaf, 0.003, PAL.forest, { pos: [-0.02, H + 0.05, 0.03], rot: [0.5, 0.5 + PI, 0.4] }));
      const lid = joint('lid', [0, H + 0.002, -R + 0.004], [
        cyl(R - 0.004, R - 0.004, 0.003, shade(steel, 0.08), { pos: [0, H + 0.002, 0.004], seg: 16 }),
        torus(0.012, 0.003, steel, { rot: [PI / 2, 0, 0], pos: [0, H + 0.004, 0.035], seg: 8 }),
      ]);
      lid.rotation.x = -1.7;
      return model('can', body, [lid]);
    },
    idle: (root, t, k) => {
      const l = J(root, 'lid');
      if (l) l.rotation.x = -1.7 + Math.sin(t * 2.5) * 0.08 * k;
    },
  },

  // ───────────────────────────────────────── boot (Wellington)
  {
    id: 'boot',
    name: 'Wellington boot',
    category: 'object',
    tags: ['boot', 'wellington', 'rain', 'mud', 'walk', 'farm', 'garden', 'puddle', 'waterloo', 'duke', 'new zealand', 'march', 'kick', 'shoe', 'trench', 'countryside'],
    soundsLike: ['boot', 'wellington', 'welly', 'botte', 'bot', 'boots', 'butte'],
    anims: ['march', 'bounce', 'wobble', 'dance', 'stack'],
    build: (o) => {
      const rub = tintOr(o, PAL.green);
      const sole = PAL.charcoal;
      const sx = -0.03;
      const oval: [number, number, number] = [1, 1, 0.82];
      const parts = [
        lathe([[0, 0.03], [0.05, 0.03], [0.052, 0.12], [0.056, 0.22], [0.062, 0.262], [0.055, 0.265], [0.051, 0.244], [0, 0.244]], rub, { seg: 12, pos: [sx, 0, 0], scale: oval }),
        cyl(0.05, 0.05, 0.004, shade(rub, -0.55), { pos: [sx, 0.247, 0], seg: 12, scale: oval }),
        cyl(0.0635, 0.063, 0.016, shade(rub, -0.18), { pos: [sx, 0.254, 0], seg: 12, scale: oval }),
        sweep([[-0.05, 0.062, 0], [0.0, 0.058, 0], [0.05, 0.05, 0], [0.095, 0.043, 0], [0.13, 0.038, 0], [0.152, 0.034, 0]], [0.05, 0.05, 0.044, 0.036, 0.027, 0.014], rub, { sides: 10, flat: 1.12 }),
        extrudeHoles(roundRectPts(0.25, 0.112, 0.05, 3, 0.03, 0), [], 0.018, sole, { rot: [PI / 2, 0, 0], pos: [0, 0.009, 0] }),
        box(0.07, 0.032, 0.1, sole, { pos: [sx - 0.015, 0.016, 0] }),
        box(0.034, 0.014, 0.006, shade(rub, -0.25), { pos: [sx, 0.228, 0.05], ao: 0 }),
        box(0.016, 0.018, 0.008, PAL.gold, { pos: [sx + 0.012, 0.228, 0.052], ao: 0 }),
        torus(0.013, 0.0035, shade(rub, -0.25), { rot: [0, PI / 2, 0], pos: [sx - 0.062, 0.262, 0], seg: 8 }),
      ];
      xform(parts, { rot: [0, -0.55, 0] });
      return model('boot', parts);
    },
  },
];

