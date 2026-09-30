import * as THREE from 'three';
import type { ModelSpec } from '../spec';
import { box, cyl, cone, torus, sphere, lathe, extrude, part, model, joint, PAL, rng, shade, tintOr, sweep, type ColorLike } from '../kit';
import { J, rod, extrudeHoles, roundRectPts, puff, xform, type V3, type V2 } from './_shapes';

const PI = Math.PI;

/** Arched opening outline (door, window, gate): width 2w, straight up to `spring`, semicircle on top. */
function archPts(w: number, spring: number, bottom = 0, n = 8): V2[] {
  const pts: V2[] = [[-w, bottom], [w, bottom]];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * PI;
    pts.push([Math.cos(a) * w, spring + Math.sin(a) * w]);
  }
  return pts;
}

/** A glowing window: warm pane, white frame, cross mullions. Facing +Z at `pos`. */
function window(pos: V3, w: number, h: number, rotY = 0, glow: ColorLike = PAL.amber) {
  const parts = [
    box(w + 0.008, h + 0.008, 0.005, PAL.white, { pos: [0, 0, 0], ao: 0 }),
    box(w, h, 0.006, glow, { pos: [0, 0, 0.0005], ao: 0 }),
    box(0.004, h, 0.007, PAL.woodDark, { pos: [0, 0, 0.001], ao: 0 }),
    box(w, 0.004, 0.007, PAL.woodDark, { pos: [0, 0, 0.001], ao: 0 }),
    box(w + 0.014, 0.006, 0.012, PAL.white, { pos: [0, -h / 2 - 0.004, 0.004], ao: 0 }),
  ];
  return xform(xform(parts, { rot: [0, rotY, 0] }), { pos });
}

/** Small triangular pennant on a joint (castle, tent). */
function pennant(name: string, pole: V3, c: ColorLike) {
  return joint(name, pole, [extrude([[0, 0], [0.05, -0.012], [0, -0.026]], 0.003, c, { pos: pole, ao: 0 })]);
}

export const SPECS: ModelSpec[] = [
  // ───────────────────────────────────────── castle
  {
    id: 'castle',
    name: 'Castle',
    category: 'structure',
    tags: ['castle', 'fortress', 'king', 'kingdom', 'medieval', 'defence', 'siege', 'knight', 'princess', 'fairy tale', 'power', 'feudal', 'palace', 'stronghold', 'royal', 'home', 'bastille', 'prison'],
    soundsLike: ['castle', 'cast', 'chateau', 'castel', 'castille', 'cassel'],
    anims: ['grow', 'idle', 'wobble', 'bounce'],
    build: (o) => {
      const stone = PAL.stone;
      const roof = tintOr(o, PAL.blue);
      const rnd = rng(13);
      const body: THREE.BufferGeometry[] = [
        extrude(roundRectPts(0.32, 0.26, 0.05, 3), 0.016, PAL.green, { rot: [-PI / 2, 0, 0], pos: [0, 0.008, 0] }),
        box(0.2, 0.1, 0.024, stone, { pos: [0, 0.066, 0.08] }),
        box(0.2, 0.1, 0.024, shade(stone, -0.05), { pos: [0, 0.066, -0.08] }),
        box(0.024, 0.1, 0.16, shade(stone, -0.03), { pos: [-0.1, 0.066, 0] }),
        box(0.024, 0.1, 0.16, shade(stone, -0.03), { pos: [0.1, 0.066, 0] }),
        // keep
        box(0.1, 0.2, 0.09, shade(stone, 0.06), { pos: [0, 0.116, -0.02] }),
        cone(0.078, 0.1, roof, { seg: 4, rot: [0, PI / 4, 0], pos: [0, 0.266, -0.02], scale: [1, 1, 0.92] }),
        rod([0, 0.3, -0.02], [0, 0.36, -0.02], 0.003, PAL.woodDark, { seg: 4 }),
        // gate
        extrude(archPts(0.026, 0.035, 0.016), 0.006, PAL.woodDark, { pos: [0, 0, 0.092] }),
        extrude(archPts(0.032, 0.035, 0.016).map(([x, y]) => [x, y] as V2), 0.004, shade(stone, -0.18), { pos: [0, 0, 0.0905] }),
        box(0.05, 0.004, 0.05, PAL.wood, { pos: [0, 0.018, 0.12], rot: [0.12, 0, 0] }),
        sphere(0.004, PAL.gold, { seg: 0, pos: [0.012, 0.04, 0.096] }),
        // glowing windows
        ...window([-0.025, 0.17, 0.0265], 0.016, 0.024),
        ...window([0.025, 0.17, 0.0265], 0.016, 0.024),
        ...window([0, 0.105, 0.0265], 0.018, 0.022),
      ];
      // merlons
      const merlon = (x: number, z: number) => body.push(box(0.018, 0.018, 0.028, stone, { pos: [x, 0.125, z] }));
      for (const x of [-0.06, -0.03, 0.03, 0.06]) merlon(x, 0.08);
      for (const x of [-0.045, 0, 0.045]) merlon(x, -0.08);
      for (const z of [-0.035, 0.0, 0.035]) {
        body.push(box(0.028, 0.018, 0.018, stone, { pos: [-0.1, 0.125, z] }));
        body.push(box(0.028, 0.018, 0.018, stone, { pos: [0.1, 0.125, z] }));
      }
      for (const x of [-0.035, 0.035]) body.push(box(0.018, 0.016, 0.018, shade(stone, 0.06), { pos: [x, 0.224, 0.028] }));
      // corner towers
      const roofs = [roof, PAL.red, PAL.red, roof];
      [[-0.1, 0.08], [0.1, 0.08], [-0.1, -0.08], [0.1, -0.08]].forEach(([x, z], i) => {
        body.push(cyl(0.035, 0.038, 0.16, stone, { pos: [x, 0.096, z], seg: 8 }));
        body.push(cyl(0.042, 0.04, 0.016, shade(stone, -0.08), { pos: [x, 0.183, z], seg: 8 }));
        body.push(cone(0.048, 0.085, roofs[i], { seg: 8, pos: [x, 0.2335, z] }));
        body.push(sphere(0.006, PAL.gold, { seg: 0, pos: [x, 0.279, z] }));
        body.push(...window([x, 0.14, z + 0.037], 0.012, 0.02));
      });
      // grass tufts
      for (let i = 0; i < 6; i++) {
        const a = rnd() * PI * 2;
        body.push(cone(0.006, 0.02, i % 2 ? PAL.lime : PAL.forest, { seg: 3, pos: [Math.cos(a) * 0.14, 0.024, Math.sin(a) * 0.11] }));
      }
      const flag = pennant('flag', [0, 0.36, -0.02], PAL.red);
      return model('castle', body, [flag]);
    },
    idle: (root, t, k) => {
      const f = J(root, 'flag');
      if (f) f.rotation.y = Math.sin(t * 3) * 0.35 * k;
    },
  },

  // ───────────────────────────────────────── tower (Eiffel-like)
  {
    id: 'tower',
    name: 'Iron tower',
    category: 'structure',
    tags: ['tower', 'eiffel tower', 'paris', 'france', 'iron', 'engineering', 'world fair', '1889', 'height', 'landmark', 'monument', 'radio', 'antenna', 'modern', 'romance', 'tall'],
    soundsLike: ['tower', 'tour', 'eiffel', 'effel', 'paris', 'towel', 'tall'],
    anims: ['grow', 'idle', 'wobble', 'spin'],
    build: (o) => {
      const iron = tintOr(o, '#a8633c');
      const dark = shade(iron, -0.25);
      const hw = (y: number) => {
        // half-width of the leg line at height y (curved profile)
        const pts: V2[] = [[0, 0.108], [0.04, 0.083], [0.085, 0.058], [0.17, 0.032], [0.26, 0.017], [0.37, 0.007], [0.42, 0.004]];
        for (let i = 0; i < pts.length - 1; i++) {
          const [y0, w0] = pts[i];
          const [y1, w1] = pts[i + 1];
          if (y <= y1) return w0 + ((y - y0) / (y1 - y0)) * (w1 - w0);
        }
        return 0.01;
      };
      const body: THREE.BufferGeometry[] = [
        box(0.27, 0.01, 0.27, PAL.green, { pos: [0, 0.005, 0] }),
        box(0.235, 0.006, 0.235, PAL.sand, { pos: [0, 0.013, 0] }),
      ];
      const ys = [0.016, 0.04, 0.085, 0.125, 0.17, 0.215, 0.26, 0.32, 0.37];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        body.push(sweep(ys.map((y) => [sx * hw(y), y, sz * hw(y)] as V3), (u) => 0.012 - u * 0.009, iron, { sides: 4 }));
      }
      // arches on each face + lattice X-braces
      const face = (fn: (a: number, y: number) => V3) => {
        const arch = part(new THREE.TorusGeometry(0.074, 0.006, 3, 10, PI), iron, { scale: [1, 0.78, 1] });
        const p = fn(0, 0.018);
        arch.translate(0, p[1], 0);
        return arch;
      };
      for (let f = 0; f < 4; f++) {
        const ry = (f * PI) / 2;
        const fn = (a: number, y: number): V3 => [a, y, hw(y)];
        const parts: THREE.BufferGeometry[] = [face(fn)];
        xform(parts, { pos: [0, 0, hw(0.04)] });
        const braces: [number, number][] = [[0.085, 0.17], [0.17, 0.215], [0.215, 0.26], [0.26, 0.32]];
        for (const [y0, y1] of braces) {
          parts.push(rod([-hw(y0), y0, hw(y0)], [hw(y1), y1, hw(y1)], 0.0028, dark, { seg: 3 }));
          parts.push(rod([hw(y0), y0, hw(y0)], [-hw(y1), y1, hw(y1)], 0.0028, dark, { seg: 3 }));
        }
        xform(parts, { rot: [0, ry, 0] });
        body.push(...parts);
      }
      // platforms
      body.push(
        box(2 * hw(0.085) + 0.022, 0.012, 2 * hw(0.085) + 0.022, dark, { pos: [0, 0.085, 0] }),
        box(2 * hw(0.085) + 0.026, 0.005, 2 * hw(0.085) + 0.026, PAL.gold, { pos: [0, 0.093, 0], ao: 0 }),
        box(2 * hw(0.17) + 0.016, 0.01, 2 * hw(0.17) + 0.016, dark, { pos: [0, 0.17, 0] }),
        box(2 * hw(0.17) + 0.02, 0.004, 2 * hw(0.17) + 0.02, PAL.gold, { pos: [0, 0.177, 0], ao: 0 }),
        box(0.026, 0.02, 0.026, iron, { pos: [0, 0.365, 0] }),
        box(0.032, 0.004, 0.032, PAL.gold, { pos: [0, 0.376, 0], ao: 0 }),
        ...[-1, 1].flatMap((s) => [box(0.004, 0.01, 0.027, PAL.amber, { pos: [s * 0.0132, 0.365, 0], ao: 0 }), box(0.027, 0.01, 0.004, PAL.amber, { pos: [0, 0.365, s * 0.0132], ao: 0 })]),
        rod([0, 0.375, 0], [0, 0.43, 0], 0.003, dark, { seg: 4 }),
        sphere(0.008, PAL.yellow, { seg: 1, pos: [0, 0.434, 0], ao: 0 }),
      );
      return model('tower', body);
    },
  },

  // ───────────────────────────────────────── pyramid
  {
    id: 'pyramid',
    name: 'Pyramids',
    category: 'structure',
    tags: ['pyramid', 'egypt', 'pharaoh', 'ancient', 'giza', 'tomb', 'desert', 'cairo', 'mummy', 'nile', 'wonder', 'triangle', 'hierarchy', 'history', 'sand', 'mystery', 'pythagoras', 'pythagore', 'theorem'],
    soundsLike: ['pyramid', 'pyra', 'pira', 'pyramide', 'mid', 'pyre', 'amid', 'pytha', 'pita'],
    anims: ['grow', 'idle', 'bounce', 'spin'],
    build: (o) => {
      const sand = tintOr(o, PAL.sand);
      const rnd = rng(29);
      const pyr = (cx: number, cz: number, hw: number, h: number, n: number, cap: boolean) => {
        const out: THREE.BufferGeometry[] = [];
        const R = hw * Math.SQRT2;
        for (let i = 0; i < n; i++) {
          const y0 = (i / n) * h, y1 = ((i + 1) / n) * h;
          const r0 = R * (1 - y0 / h), r1 = R * (1 - y1 / h);
          const c = i % 2 ? shade(sand, -0.07) : sand;
          if (i === n - 1) out.push(cone(r0, y1 - y0, cap ? PAL.gold : c, { seg: 4, rot: [0, PI / 4, 0], pos: [cx, 0.012 + (y0 + y1) / 2, cz] }));
          else out.push(cyl(r1, r0, y1 - y0, c, { seg: 4, rot: [0, PI / 4, 0], pos: [cx, 0.012 + (y0 + y1) / 2, cz], ao: 0.06 }));
        }
        return out;
      };
      const leaf: V2[] = [[0, 0], [0.02, 0.01], [0.045, 0.008], [0.065, -0.004], [0.045, -0.002], [0.02, -0.006]];
      const palm = (x: number, z: number, s: number) => {
        const out: THREE.BufferGeometry[] = [sweep([[x, 0.012, z], [x + 0.006 * s, 0.05 * s, z], [x + 0.018 * s, 0.1 * s, z], [x + 0.03 * s, 0.13 * s, z]], (u) => 0.008 * s * (1 - u * 0.4), PAL.woodLight, { sides: 5 })];
        const top: V3 = [x + 0.03 * s, 0.13 * s, z];
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * PI * 2 + 0.3;
          out.push(extrude(leaf.map(([u, v]) => [u * s, v * s] as V2), 0.003, i % 2 ? PAL.green : PAL.forest, { pos: top, rot: [0, -a, -0.35] }));
        }
        out.push(sphere(0.008 * s, PAL.woodDark, { seg: 0, pos: [top[0] + 0.006, top[1] - 0.008, top[2] + 0.006] }));
        return out;
      };
      const body: THREE.BufferGeometry[] = [
        lathe([[0, 0], [0.19, 0], [0.18, 0.008], [0.1, 0.012], [0, 0.013]], shade(sand, 0.12), { seg: 14, scale: [1, 1, 0.82] }),
        ...pyr(0.015, -0.01, 0.105, 0.2, 7, true),
        ...pyr(-0.12, -0.07, 0.05, 0.095, 4, false),
        ...pyr(0.13, -0.08, 0.04, 0.075, 3, false),
        box(0.018, 0.022, 0.004, PAL.ink, { pos: [0.015, 0.024, 0.096], rot: [0.47, 0, 0], ao: 0 }),
        ...palm(0.12, 0.08, 1),
        ...palm(0.15, 0.04, 0.7),
        ...[0, 1, 2].map((i) => sphere(0.03, shade(sand, 0.06), { seg: 1, scale: [1.6, 0.25, 1], pos: [-0.12 + i * 0.04 + rnd() * 0.02, 0.01, 0.08 + rnd() * 0.02] })),
      ];
      return model('pyramid', body);
    },
  },

  // ───────────────────────────────────────── bridge (stone arch)
  {
    id: 'bridge',
    name: 'Stone bridge',
    category: 'structure',
    tags: ['bridge', 'crossing', 'river', 'connection', 'link', 'road', 'journey', 'border', 'sarajevo', 'latin bridge', 'engineering', 'arch', 'river crossing', 'pont', 'london bridge', 'union'],
    soundsLike: ['bridge', 'brij', 'pont', 'pons', 'brig', 'bruges', 'cambridge'],
    anims: ['idle', 'grow', 'wobble', 'bounce'],
    build: (o) => {
      const stone = tintOr(o, '#c7b595');
      const D = 0.09;
      const X = 0.16;
      const top = (x: number) => 0.1 + 0.022 * (1 - (x / X) * (x / X));
      const arches: [number, number][] = [[-0.1, 0.03], [0, 0.048], [0.1, 0.03]];
      const spring = 0.02;
      const outline: V2[] = [[-X, 0]];
      for (const [cx, r] of arches) {
        outline.push([cx - r, 0], [cx - r, spring]);
        for (let i = 1; i < 8; i++) {
          const a = PI - (i / 8) * PI;
          outline.push([cx + Math.cos(a) * r, spring + Math.sin(a) * r]);
        }
        outline.push([cx + r, spring], [cx + r, 0]);
      }
      outline.push([X, 0]);
      for (let i = 0; i <= 8; i++) {
        const x = X - (i / 8) * 2 * X;
        outline.push([x, top(x)]);
      }
      const body: THREE.BufferGeometry[] = [extrudeHoles(outline, [], D, stone, { ao: 0.25 })];
      for (const [cx, r] of arches) for (const z of [-D / 2 - 0.002, D / 2 + 0.002]) {
        body.push(part(new THREE.TorusGeometry(r + 0.006, 0.007, 4, 8, PI), shade(stone, 0.12), { pos: [cx, spring, z] }));
      }
      // parapets
      for (const z of [-D / 2 + 0.006, D / 2 - 0.006]) {
        const strip: V2[] = [];
        for (let i = 0; i <= 8; i++) {
          const x = -X + (i / 8) * 2 * X;
          strip.push([x, top(x) - 0.002]);
        }
        for (let i = 8; i >= 0; i--) {
          const x = -X + (i / 8) * 2 * X;
          strip.push([x, top(x) + 0.024]);
        }
        body.push(extrudeHoles(strip, [], 0.012, shade(stone, -0.06), { pos: [0, 0, z] }));
      }
      // lamps
      for (const [x, z] of [[-0.05, D / 2 - 0.006], [0.05, -D / 2 + 0.006]] as [number, number][]) {
        const y = top(x) + 0.024;
        body.push(
          rod([x, y, z], [x, y + 0.06, z], 0.003, PAL.charcoal, { seg: 4 }),
          box(0.014, 0.018, 0.014, PAL.amber, { pos: [x, y + 0.07, z], ao: 0 }),
          cone(0.012, 0.012, PAL.charcoal, { seg: 4, rot: [0, PI / 4, 0], pos: [x, y + 0.085, z] }),
        );
      }
      // water & banks
      body.push(box(0.3, 0.012, 0.22, '#4f9ec8', { pos: [0, 0.006, 0], ao: 0 }));
      [[-0.08, 0.07], [0.04, -0.07], [0.1, 0.08], [-0.03, 0.09]].forEach(([x, z]) => body.push(box(0.03, 0.002, 0.004, PAL.sky, { pos: [x, 0.0125, z], ao: 0 })));
      for (const s of [-1, 1]) {
        body.push(box(0.05, 0.1, 0.22, '#8a6242', { pos: [s * 0.175, 0.05, 0] }));
        body.push(box(0.054, 0.014, 0.224, PAL.green, { pos: [s * 0.175, 0.105, 0] }));
      }
      return model('bridge', body);
    },
  },

  // ───────────────────────────────────────── brick wall
  {
    id: 'brickwall',
    name: 'Brick wall',
    category: 'structure',
    tags: ['wall', 'brick wall', 'berlin', 'berlin wall', 'border', 'defence', 'division', 'barrier', 'obstacle', 'build', 'cold war', 'fall', 'separation', 'fortification', 'great wall', 'building', 'foundation'],
    soundsLike: ['wall', 'brick', 'brique', 'mur', 'mure', 'wal', 'berlin'],
    anims: ['shake', 'grow', 'stack', 'wobble', 'idle'],
    build: (o) => {
      const base = tintOr(o, '#b9553c');
      const rnd = rng(37);
      const reds = [base, shade(base, -0.12), shade(base, 0.1), PAL.copper, shade(base, -0.2)];
      const L = 0.058, Hb = 0.028, D = 0.04, g = 0.006;
      const P = L + g, PY = Hb + g, rows = 7, W = 4 * P;
      const y0 = 0.014;
      const body: THREE.BufferGeometry[] = [
        box(W + 0.02, 0.014, 0.056, PAL.stone, { pos: [0, 0.007, 0] }),
        box(W - 0.004, rows * PY - PY - 0.002, D - 0.012, '#d9ccb3', { pos: [0, y0 + (rows * PY - PY) / 2, 0], ao: 0.05 }),
      ];
      const brick = (x: number, y: number, w: number) => {
        const c = reds[Math.floor(rnd() * reds.length)];
        body.push(box(w - 0.001 * rnd(), Hb, D, c, { pos: [x + (rnd() - 0.5) * 0.002, y, (rnd() - 0.5) * 0.004], rot: [0, (rnd() - 0.5) * 0.05, (rnd() - 0.5) * 0.03], ao: 0.1 }));
      };
      for (let r = 0; r < rows; r++) {
        const y = y0 + g / 2 + r * PY + Hb / 2;
        const last = r === rows - 1;
        if (r % 2 === 0) {
          [-1.5, -0.5, 0.5, 1.5].forEach((k, i) => {
            if (last && i === 2) return; // crumbling top: one brick gone
            brick(k * P, y, L);
          });
        } else {
          const hl = (L - g) / 2;
          brick(-W / 2 + hl / 2 + g / 2, y, hl);
          [-1, 0, 1].forEach((k) => brick(k * P, y, L));
          brick(W / 2 - hl / 2 - g / 2, y, hl);
        }
      }
      // fallen bricks in front
      body.push(box(L, Hb, D, reds[1], { pos: [0.07, 0.014 + Hb / 2, 0.075], rot: [0, 0.5, 0] }));
      body.push(box(L, Hb, D, reds[3], { pos: [0.0, 0.0145 + D / 2, 0.08], rot: [PI / 2 - 0.05, -0.3, 0.1] }));
      body.push(box(0.02, 0.012, 0.018, reds[2], { pos: [-0.04, 0.02, 0.07], rot: [0.3, 0.7, 0.2] }));
      for (let i = 0; i < 5; i++) body.push(cone(0.006, 0.02 + rnd() * 0.015, i % 2 ? PAL.lime : PAL.green, { seg: 3, pos: [-0.13 + i * 0.065 + rnd() * 0.02, 0.022, 0.03 + rnd() * 0.01], rot: [(rnd() - 0.5) * 0.5, 0, (rnd() - 0.5) * 0.5] }));
      return model('brickwall', body);
    },
  },

  // ───────────────────────────────────────── house (winter cottage)
  {
    id: 'house',
    name: 'Cottage',
    category: 'structure',
    tags: ['house', 'home', 'family', 'cottage', 'village', 'winter', 'christmas', 'warmth', 'shelter', 'address', 'neighbour', 'domestic', 'parliament', 'house of commons', 'white house', 'dwelling', 'comfort'],
    soundsLike: ['house', 'maison', 'mais', 'haus', 'home', 'how', 'hause'],
    anims: ['grow', 'idle', 'bounce', 'wobble'],
    build: (o) => {
      const wall = tintOr(o, PAL.cream);
      const roofC = shade(PAL.red, -0.12);
      const snow = PAL.white;
      const rnd = rng(43);
      const W = 0.2, Dp = 0.16, wy = 0.15, ridge = 0.24;
      const body: THREE.BufferGeometry[] = [
        lathe([[0, 0], [0.19, 0], [0.18, 0.008], [0.12, 0.013], [0, 0.014]], snow, { seg: 14, scale: [1, 1, 0.85] }),
        box(W + 0.01, 0.02, Dp + 0.01, PAL.stone, { pos: [0, 0.02, 0] }),
        box(W, wy - 0.02, Dp, wall, { pos: [0, 0.02 + (wy - 0.02) / 2 + 0.01, 0], ao: 0.1 }),
        extrude([[-W / 2, 0], [W / 2, 0], [0, ridge - wy - 0.01]], Dp, wall, { pos: [0, wy + 0.01, 0], ao: 0 }),
      ];
      // roof slabs (ridge along Z)
      const eave: V2 = [W / 2 + 0.03, wy - 0.005];
      const rtop: V2 = [0, ridge + 0.012];
      const len = Math.hypot(eave[0] - rtop[0], eave[1] - rtop[1]);
      const ang = Math.atan2(rtop[1] - eave[1], eave[0] - rtop[0]);
      for (const s of [-1, 1]) {
        const cx = s * (eave[0] + rtop[0]) / 2, cy = (eave[1] + rtop[1]) / 2;
        body.push(box(len + 0.01, 0.018, Dp + 0.05, roofC, { pos: [cx, cy, 0], rot: [0, 0, s * -ang] }));
        body.push(box(len * 0.72, 0.012, Dp + 0.054, snow, { pos: [cx - s * Math.cos(ang) * len * 0.14 + 0, cy + Math.sin(ang) * len * 0.14 + 0.012, 0], rot: [0, 0, s * -ang], ao: 0 }));
        // icicles
        for (let i = 0; i < 4; i++) body.push(cone(0.004, 0.016 + rnd() * 0.01, PAL.white, { seg: 4, rot: [PI, 0, 0], pos: [s * (eave[0] - 0.006), eave[1] - 0.018, -0.07 + i * 0.047 + rnd() * 0.01], ao: 0 }));
      }
      body.push(cyl(0.016, 0.016, Dp + 0.056, snow, { rot: [PI / 2, 0, 0], pos: [0, ridge + 0.024, 0], seg: 6 }));
      // chimney
      body.push(box(0.036, 0.09, 0.036, '#a44a36', { pos: [0.055, 0.235, -0.035] }), box(0.044, 0.01, 0.044, PAL.charcoal, { pos: [0.055, 0.284, -0.035] }), sphere(0.022, snow, { seg: 1, scale: [1.1, 0.4, 1.1], pos: [0.055, 0.29, -0.035] }));
      // door, wreath, step
      const zf = Dp / 2;
      body.push(
        extrude(archPts(0.024, 0.075, 0.03, 6), 0.008, PAL.woodDark, { pos: [0, 0, zf + 0.002] }),
        sphere(0.004, PAL.gold, { seg: 0, pos: [0.013, 0.07, zf + 0.008] }),
        torus(0.013, 0.005, PAL.forest, { pos: [0, 0.088, zf + 0.008], seg: 10 }),
        sphere(0.005, PAL.red, { seg: 0, pos: [0, 0.076, zf + 0.011] }),
        box(0.06, 0.008, 0.02, PAL.stone, { pos: [0, 0.03, zf + 0.012] }),
        ...window([-0.062, 0.095, zf + 0.003], 0.034, 0.034),
        ...window([0.062, 0.095, zf + 0.003], 0.034, 0.034),
        ...window([W / 2 + 0.003, 0.095, 0], 0.034, 0.034, PI / 2),
        ...window([-W / 2 - 0.003, 0.095, 0], 0.034, 0.034, -PI / 2),
        cyl(0.017, 0.017, 0.006, PAL.amber, { rot: [PI / 2, 0, 0], pos: [0, 0.188, zf + 0.002], seg: 10 }),
        torus(0.018, 0.004, PAL.white, { pos: [0, 0.188, zf + 0.005], seg: 10 }),
        // tiny fir tree beside the house
        cyl(0.006, 0.006, 0.02, PAL.woodDark, { pos: [0.14, 0.02, 0.07], seg: 5 }),
        cone(0.03, 0.045, PAL.forest, { seg: 7, pos: [0.14, 0.05, 0.07] }),
        cone(0.023, 0.04, PAL.green, { seg: 7, pos: [0.14, 0.08, 0.07] }),
        cone(0.016, 0.03, PAL.white, { seg: 7, pos: [0.14, 0.1, 0.07], ao: 0 }),
      );
      const smoke = joint('smoke', [0.055, 0.3, -0.035], [...puff(0.018, '#e9e4dc', [0.055, 0.305, -0.035], rnd, 3), ...puff(0.013, '#dcd6cc', [0.065, 0.335, -0.045], rnd, 3)]);
      return model('house', body, [smoke]);
    },
    idle: (root, t, k) => {
      const s = J(root, 'smoke');
      if (!s) return;
      const p = (t * 0.3 * k) % 1;
      s.position.set(0.055 + p * 0.015, 0.3 + p * 0.04, -0.035);
      s.scale.setScalar(0.6 + p * 0.7);
    },
  },

  // ───────────────────────────────────────── tent
  {
    id: 'tent',
    name: 'Tent',
    category: 'structure',
    tags: ['tent', 'camp', 'camping', 'adventure', 'nomad', 'expedition', 'outdoors', 'scout', 'shelter', 'circus', 'refugee', 'army camp', 'holiday', 'night', 'wilderness', 'explorer'],
    soundsLike: ['tent', 'tente', 'tant', 'ten', 'tante', 'attente', 'content'],
    anims: ['idle', 'wobble', 'grow', 'bounce'],
    build: (o) => {
      const canvas = tintOr(o, PAL.orange);
      const rnd = rng(47);
      const hw = 0.13, h = 0.2, L = 0.24;
      const slope = Math.hypot(hw, h);
      const ang = Math.atan2(h, hw);
      const body: THREE.BufferGeometry[] = [
        extrude(roundRectPts(0.34, 0.33, 0.08, 3), 0.008, PAL.green, { rot: [-PI / 2, 0, 0], pos: [0, 0.004, 0.02] }),
        extrude([[-hw + 0.006, 0], [hw - 0.006, 0], [0, h - 0.008]], 0.006, shade(canvas, -0.12), { pos: [0, 0.008, -L / 2 + 0.004] }),
        extrude([[-hw + 0.02, 0], [hw - 0.02, 0], [0, h - 0.03]], 0.004, '#3b2618', { pos: [0, 0.008, L / 2 - 0.03], ao: 0 }),
        sphere(0.016, PAL.yellow, { seg: 1, pos: [0.035, 0.03, 0.02], ao: 0 }),
        box(0.012, 0.01, 0.012, PAL.charcoal, { pos: [0.035, 0.013, 0.02] }),
      ];
      for (const s of [-1, 1]) {
        body.push(box(slope, 0.008, L, canvas, { pos: [(s * hw) / 2, 0.008 + h / 2, 0], rot: [0, 0, s * -ang] }));
        body.push(box(slope * 0.16, 0.009, L + 0.002, shade(canvas, 0.25), { pos: [s * hw * 0.92, 0.008 + h * 0.08, 0], rot: [0, 0, s * -ang], ao: 0 }));
        // rolled-back door flaps
        body.push(rod([0, h + 0.004, L / 2 + 0.004], [s * (hw - 0.012), 0.016, L / 2 + 0.004], 0.011, PAL.cream, { seg: 6 }));
        // guy ropes & pegs
        body.push(rod([s * hw * 0.6, 0.008 + h * 0.4, 0.04], [s * 0.19, 0.008, 0.06], 0.0015, PAL.sand, { seg: 3 }));
        body.push(box(0.006, 0.02, 0.006, PAL.woodDark, { pos: [s * 0.19, 0.014, 0.06] }));
      }
      for (const z of [-1, 1]) {
        body.push(rod([0, h + 0.008, z * (L / 2 + 0.01)], [0, 0.008, z * 0.17], 0.0015, PAL.sand, { seg: 3 }));
        body.push(box(0.006, 0.02, 0.006, PAL.woodDark, { pos: [0, 0.014, z * 0.17] }));
      }
      body.push(cyl(0.006, 0.006, L + 0.03, PAL.woodDark, { rot: [PI / 2, 0, 0], pos: [0, h + 0.009, 0], seg: 6 }));
      body.push(rod([0, 0.008, L / 2 + 0.012], [0, h + 0.05, L / 2 + 0.012], 0.005, PAL.woodDark, { seg: 5 }));
      for (let i = 0; i < 6; i++) {
        const a = rnd() * PI * 2;
        body.push(cone(0.006, 0.02, i % 2 ? PAL.lime : PAL.forest, { seg: 3, pos: [Math.cos(a) * 0.15, 0.016, 0.02 + Math.sin(a) * 0.14] }));
      }
      const flag = pennant('flag', [0.004, h + 0.05, L / 2 + 0.012], PAL.red);
      return model('tent', body, [flag]);
    },
    idle: (root, t, k) => {
      const f = J(root, 'flag');
      if (f) f.rotation.y = Math.sin(t * 3.3) * 0.4 * k;
    },
  },
];

