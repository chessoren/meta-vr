/**
 * Shared shape helpers for objects / vehicles / structures (NOT part of the kit contract).
 * Everything returns kit "parts" (painted, placed, non-indexed geometries) unless noted.
 */
import * as THREE from 'three';
import { part, PAL, FONT_SERIF, type ColorLike, type PartOpts } from '../kit';

export type V3 = [number, number, number];
export type V2 = [number, number];

// ─────────────────────────────────────────────────────────────────────────────
// Geometry helpers
// ─────────────────────────────────────────────────────────────────────────────

/** A cylinder (or `seg`-sided prism) between two points. */
export function rod(a: V3, b: V3, r: number, c: ColorLike, o: { seg?: number; r2?: number; ao?: number; open?: boolean } = {}) {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const d = B.clone().sub(A);
  const len = d.length();
  const g = new THREE.CylinderGeometry(o.r2 ?? r, r, len, o.seg ?? 6, 1, o.open ?? false);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  g.applyQuaternion(q);
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  return part(g, c, { ao: o.ao ?? 0.05 });
}

/** A tube along a smooth curve through points. */
export function tube(pts: V3[], r: number, c: ColorLike, o: { seg?: number; radial?: number; closed?: boolean; ao?: number } = {}) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), o.closed ?? false);
  return part(new THREE.TubeGeometry(curve, o.seg ?? 16, r, o.radial ?? 5, o.closed ?? false), c, { ao: o.ao ?? 0.05 });
}

/** A lathe whose revolution is split into `gores` coloured slices (balloons, beach balls). */
export function stripedLathe(profile: V2[], colors: ColorLike[], gores: number, segPer = 2, o: PartOpts = {}) {
  const pts = profile.map(([x, y]) => new THREE.Vector2(x, y));
  const out: THREE.BufferGeometry[] = [];
  const step = (Math.PI * 2) / gores;
  for (let i = 0; i < gores; i++) out.push(part(new THREE.LatheGeometry(pts, segPer, i * step, step), colors[i % colors.length], o));
  return out;
}

/** Lathe of a profile restricted to a y-range, so a revolved body can be painted in horizontal bands. */
export function bandedLathe(profile: V2[], bands: { to: number; c: ColorLike }[], seg = 14, o: PartOpts = {}) {
  const out: THREE.BufferGeometry[] = [];
  let from = -Infinity;
  for (const b of bands) {
    const pts: V2[] = [];
    for (let i = 0; i < profile.length; i++) {
      const [x, y] = profile[i];
      if (y >= from && y <= b.to) pts.push([x, y]);
      const n = profile[i + 1];
      if (n) {
        // add exact cut points where the segment crosses a band edge
        for (const cut of [from, b.to]) {
          if ((y - cut) * (n[1] - cut) < 0) {
            const t = (cut - y) / (n[1] - y);
            pts.push([x + (n[0] - x) * t, cut]);
          }
        }
      }
    }
    pts.sort((p, q) => p[1] - q[1]);
    if (pts.length >= 2) out.push(part(new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg), b.c, o));
    from = b.to;
  }
  return out;
}

/** Extrude a shape with optional holes; outline in XY, extruded along Z (centred). */
export function extrudeHoles(outline: V2[], holes: V2[][], depth: number, c: ColorLike, o: PartOpts & { bevel?: number; curve?: number } = {}) {
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  const b = o.bevel ?? 0;
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 1, curveSegments: o.curve ?? 6 });
  g.translate(0, 0, -depth / 2);
  return part(g, c, o);
}

export function circlePts(r: number, n: number, cx = 0, cy = 0, a0 = 0): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * Math.PI * 2;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

/** Hole path must wind opposite to the outline. */
export function holePts(r: number, n: number, cx = 0, cy = 0): V2[] {
  return circlePts(r, n, cx, cy).reverse();
}

export function starPts(n: number, rOut: number, rIn: number, cx = 0, cy = 0): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = Math.PI / 2 + (i / (n * 2)) * Math.PI * 2;
    const r = i % 2 ? rIn : rOut;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

export function roundRectPts(w: number, h: number, r: number, n = 3, cx = 0, cy = 0): V2[] {
  const out: V2[] = [];
  const corners: [number, number, number][] = [
    [w / 2 - r, h / 2 - r, 0],
    [-w / 2 + r, h / 2 - r, Math.PI / 2],
    [-w / 2 + r, -h / 2 + r, Math.PI],
    [w / 2 - r, -h / 2 + r, (3 * Math.PI) / 2],
  ];
  for (const [x, y, a0] of corners) for (let i = 0; i <= n; i++) {
    const a = a0 + (i / n) * (Math.PI / 2);
    out.push([cx + x + Math.cos(a) * r, cy + y + Math.sin(a) * r]);
  }
  return out;
}

/** Gear outline (trapezoid teeth). */
export function gearPts(teeth: number, rOut: number, rRoot: number): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const s = (Math.PI * 2) / teeth;
    const p = (f: number, r: number) => out.push([Math.cos(a + f * s) * r, Math.sin(a + f * s) * r]);
    p(0, rRoot);
    p(0.18, rRoot);
    p(0.3, rOut);
    p(0.62, rOut);
    p(0.74, rRoot);
  }
  return out;
}

/** A fluffy puff of 3–5 icospheres (smoke, clouds, steam). */
export function puff(r: number, c: ColorLike, pos: V3, rnd: () => number, n = 4, detail = 0) {
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd();
    const rr = r * (0.55 + rnd() * 0.35);
    const g = new THREE.IcosahedronGeometry(rr, detail);
    out.push(part(g, c, { pos: [pos[0] + Math.cos(a) * r * 0.55, pos[1] + (rnd() - 0.3) * r * 0.5, pos[2] + Math.sin(a) * r * 0.45], ao: 0.12 }));
  }
  out.push(part(new THREE.IcosahedronGeometry(r * 0.75, detail), c, { pos: [pos[0], pos[1] + r * 0.35, pos[2]], ao: 0.12 }));
  return out;
}

/** Flat disc facing +Z (pips, portholes, roundels). */
export function disc(r: number, c: ColorLike, o: PartOpts & { seg?: number } = {}) {
  return part(new THREE.CircleGeometry(r, o.seg ?? 10), c, { ao: 0, ...o });
}

/** Deterministic, crack-free vertex jitter (identical positions move identically). */
export function jitter(g: THREE.BufferGeometry, amt: number, seed = 1): THREE.BufferGeometry {
  const pos = g.getAttribute('position');
  const h = (x: number, y: number, z: number, k: number) => {
    const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + k * 19.19 + seed * 3.7) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
  };
  for (let i = 0; i < pos.count; i++) {
    const x = Math.round(pos.getX(i) * 1e4) / 1e4;
    const y = Math.round(pos.getY(i) * 1e4) / 1e4;
    const z = Math.round(pos.getZ(i) * 1e4) / 1e4;
    pos.setXYZ(i, x + h(x, y, z, 1) * amt, y + h(x, y, z, 2) * amt, z + h(x, y, z, 3) * amt);
  }
  pos.needsUpdate = true;
  return g;
}

/** Transform an already built part in place (rotate/translate a finished sub-assembly). */
export function xform(parts: THREE.BufferGeometry[], o: { pos?: V3; rot?: V3; scale?: number | V3 }) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(o.rot ?? [0, 0, 0])));
  const s = o.scale === undefined ? new THREE.Vector3(1, 1, 1) : typeof o.scale === 'number' ? new THREE.Vector3(o.scale, o.scale, o.scale) : new THREE.Vector3(...o.scale);
  m.compose(new THREE.Vector3(...(o.pos ?? [0, 0, 0])), q, s);
  for (const p of parts) p.applyMatrix4(m);
  return parts;
}

/** Offset z of every vertex by f(x, y) — bends flat sheets (scrolls, flags). Works on painted parts and plain geometries. */
export function bendZ(g: THREE.BufferGeometry, f: (x: number, y: number) => number) {
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) + f(pos.getX(i), pos.getY(i)));
  pos.needsUpdate = true;
  return g;
}

// ─────────────────────────────────────────────────────────────────────────────
// Joints lookup (cached, allocation-free per frame, clone-safe: nothing stored in userData)
// ─────────────────────────────────────────────────────────────────────────────

const jcache = new WeakMap<THREE.Object3D, Map<string, THREE.Object3D | null>>();
export function J(root: THREE.Object3D, name: string): THREE.Object3D | null {
  let m = jcache.get(root);
  if (!m) jcache.set(root, (m = new Map()));
  let o = m.get(name);
  if (o === undefined) {
    o = root.getObjectByName(name) ?? null;
    m.set(name, o);
  }
  return o;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cloth waving (flag): vertex displacement of a mesh, rest positions kept per geometry
// ─────────────────────────────────────────────────────────────────────────────

const rest = new WeakMap<THREE.BufferGeometry, Float32Array>();
export function keepRest(g: THREE.BufferGeometry) {
  rest.set(g, (g.getAttribute('position').array as Float32Array).slice());
}
/** z += amp · (x/len)^1.2 · sin(kx − ωt) ; y droops slightly towards the free end. */
export function wave(m: THREE.Mesh, t: number, len: number, amp: number, x0 = 0) {
  const g = m.geometry;
  const r = rest.get(g);
  if (!r) return;
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const a = pos.array as Float32Array;
  for (let i = 0; i < a.length; i += 3) {
    const u = Math.max(0, (r[i] - x0) / len);
    const w = Math.pow(u, 1.2);
    const ph = u * 7 - t * 5.5;
    a[i] = r[i] - w * amp * 0.25 * (1 - Math.cos(ph)) * 0.5;
    a[i + 1] = r[i + 1] + w * amp * 0.25 * Math.sin(ph * 0.7 + 1);
    a[i + 2] = r[i + 2] + w * amp * Math.sin(ph);
  }
  pos.needsUpdate = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Labels: fitted canvas text on a plane (dark ink, transparent background)
// ─────────────────────────────────────────────────────────────────────────────

export interface LabelOpts {
  fg?: string;
  font?: string;
  weight?: number;
  maxLines?: number;
  segX?: number;
  /** Canvas pixels along the longest side. */
  res?: number;
  /** Double-sided (flags). */
  both?: boolean;
  /** Fraction of the height reserved as top/bottom padding. */
  padY?: number;
  padX?: number;
}

function drawLabel(ctx: CanvasRenderingContext2D, W: number, H: number, text: string, o: LabelOpts) {
  ctx.clearRect(0, 0, W, H);
  const fg = o.fg ?? PAL.ink;
  const t = text.trim();
  const padX = W * (o.padX ?? 0.05);
  const padY = H * (o.padY ?? 0.08);
  const aw = W - padX * 2;
  const ah = H - padY * 2;
  if (!t) {
    // decorative "writing": a few ink lines of varied lengths
    ctx.fillStyle = fg;
    ctx.globalAlpha = 0.45;
    const n = Math.max(2, Math.min(4, Math.round(ah / (W * 0.09))));
    const lens = [0.92, 0.8, 0.88, 0.55];
    const lh = ah / n;
    for (let i = 0; i < n; i++) {
      const lw = aw * lens[i % lens.length];
      const th = Math.min(lh * 0.28, H * 0.07);
      const y = padY + lh * (i + 0.5) - th / 2;
      ctx.beginPath();
      const x = (W - lw) / 2;
      ctx.roundRect ? ctx.roundRect(x, y, lw, th, th / 2) : ctx.rect(x, y, lw, th);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    return;
  }
  const weight = o.weight ?? 700;
  const fam = o.font ?? FONT_SERIF;
  const ref = 100;
  ctx.font = `${weight} ${ref}px ${fam}`;
  const words = t.split(/\s+/);
  const ww = words.map((w) => ctx.measureText(w).width);
  const sp = ctx.measureText(' ').width;
  const greedy = (maxW: number) => {
    const lines: string[] = [];
    let cur = '';
    let cw = 0;
    words.forEach((w, i) => {
      const nw = cur ? cw + sp + ww[i] : ww[i];
      if (cur && nw > maxW) {
        lines.push(cur);
        cur = w;
        cw = ww[i];
      } else {
        cur = cur ? `${cur} ${w}` : w;
        cw = nw;
      }
    });
    lines.push(cur);
    return lines;
  };
  const total = ww.reduce((a, b) => a + b, 0) + sp * (words.length - 1);
  let best = { size: 0, lines: [t] };
  const maxLines = Math.min(o.maxLines ?? 3, words.length);
  for (let n = 1; n <= maxLines; n++) {
    // smallest width that wraps into ≤ n lines
    let lo = Math.max(...ww);
    let hi = total;
    for (let k = 0; k < 20; k++) {
      const mid = (lo + hi) / 2;
      if (greedy(mid).length <= n) hi = mid;
      else lo = mid;
    }
    const lines = greedy(hi);
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const size = Math.min((ref * aw) / widest, ah / (lines.length * 1.08) / 0.78);
    if (size > best.size * 1.12) best = { size, lines };
  }
  const size = best.size;
  ctx.font = `${weight} ${size}px ${fam}`;
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const lh = size * 1.08 * 0.78;
  const blockH = lh * best.lines.length;
  // alphabetic baseline: cap height ≈ 0.7 em, centre the caps block
  best.lines.forEach((l, i) => {
    const y = H / 2 - blockH / 2 + lh * (i + 0.5) + size * 0.34;
    ctx.fillText(l, W / 2, y);
  });
}

/** A text plane of exact world size w × h facing +Z, text fitted (shrinks, wraps ≤ maxLines). Empty text → decorative lines. */
export function labelPlane(text: string, w: number, h: number, o: LabelOpts = {}): THREE.Mesh {
  const res = o.res ?? 512;
  const W = w >= h ? res : Math.round((res * w) / h);
  const H = w >= h ? Math.round((res * h) / w) : res;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d')!;
  drawLabel(ctx, W, H, text, o);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    side: o.both ? THREE.DoubleSide : THREE.FrontSide,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h, o.segX ?? 1, 1), mat);
  m.userData.lociText = true;
  m.name = 'text';
  m.renderOrder = 2;
  // Redraw once the web font is available (the app loads Fraunces asynchronously).
  const fonts = typeof document !== 'undefined' ? (document as Document & { fonts?: FontFaceSet }).fonts : undefined;
  if (text.trim() && fonts && fonts.load) {
    const fam = o.font ?? FONT_SERIF;
    fonts
      .load(`${o.weight ?? 700} 100px ${fam}`, text)
      .then((faces) => {
        if (faces.length) {
          drawLabel(ctx, W, H, text, o);
          tex.needsUpdate = true;
        }
      })
      .catch(() => {});
  }
  return m;
}
