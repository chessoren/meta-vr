/**
 * Loci procedural modelling kit.
 *
 * Every library model is built from low-poly primitives coloured per-vertex and merged
 * into as few meshes as possible: one mesh per *rigid animated part*, all sharing ONE
 * flat-shaded Lambert material. That keeps 20 placed scenes well under the Quest 2
 * draw-call budget and gives the whole library one coherent, warm, storybook look.
 *
 * Conventions (all models):
 *  - metres; origin at the bottom-centre contact point (y = 0 is the surface it sits on);
 *  - faces +Z (towards the learner);
 *  - fits in a 0.30 m cube after `normalize()` (the composer scales actors further);
 *  - animated sub-parts are named Object3D children (e.g. "wingL", "legFR", "head") so
 *    anims.ts can drive them; the whole model root is also animatable.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ─────────────────────────────────────────────────────────────────────────────
// Palette — warm "old library on a winter evening", saturated enough to read in passthrough.
// ─────────────────────────────────────────────────────────────────────────────
export const PAL = {
  ink: '#2b1d14',
  wood: '#8a5a36',
  woodDark: '#5e3b22',
  woodLight: '#b98352',
  parchment: '#f1dfb8',
  cream: '#fff4dc',
  white: '#fbf7ef',
  gold: '#e9b949',
  brass: '#c9973d',
  copper: '#c46a3a',
  red: '#d9483b',
  crimson: '#a8323a',
  orange: '#ef8a3a',
  amber: '#f2b24a',
  yellow: '#f6d354',
  lime: '#a9cf54',
  green: '#5fa45a',
  forest: '#3f7a4a',
  teal: '#3aa39a',
  sky: '#6db6e0',
  blue: '#3f74c4',
  navy: '#2c3e75',
  purple: '#7b5bb6',
  plum: '#6a3f6e',
  pink: '#ef8fa6',
  skin: '#f0c49a',
  skinDark: '#b77b52',
  grey: '#9aa0a6',
  steel: '#6f7b86',
  charcoal: '#3a3d42',
  black: '#1e1e22',
  olive: '#6f7a3a',
  khaki: '#a8955e',
  sand: '#dcc28c',
  stone: '#b8ad9c',
} as const;
export type PalKey = keyof typeof PAL;
export type ColorLike = PalKey | string | number | THREE.Color;

export function color(c: ColorLike): THREE.Color {
  if (c instanceof THREE.Color) return c.clone();
  if (typeof c === 'number') return new THREE.Color(c);
  if (c in PAL) return new THREE.Color(PAL[c as PalKey]);
  return new THREE.Color(c);
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared materials (appearance modes swap these on every mesh of a scene)
// ─────────────────────────────────────────────────────────────────────────────
export type Appearance = 'full' | 'pale' | 'gold' | 'hidden';

let _mats: Record<Exclude<Appearance, 'hidden'>, THREE.Material> | null = null;
export function materials() {
  if (!_mats) {
    _mats = {
      full: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
      pale: new THREE.MeshLambertMaterial({
        vertexColors: true,
        flatShading: true,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
        emissive: new THREE.Color('#f7e3b0'),
        emissiveIntensity: 0.35,
      }),
      gold: new THREE.MeshStandardMaterial({
        color: new THREE.Color('#f0c24e'),
        metalness: 0.85,
        roughness: 0.28,
        emissive: new THREE.Color('#7a4f10'),
        emissiveIntensity: 0.55,
        flatShading: true,
      }),
    };
  }
  return _mats;
}

/** Apply an appearance mode to every library mesh under `root` (text meshes keep their own material). */
export function setAppearance(root: THREE.Object3D, mode: Appearance) {
  root.visible = mode !== 'hidden';
  if (mode === 'hidden') return;
  const m = materials()[mode];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && mesh.userData.lociKit) mesh.material = m;
    if (mesh.isMesh && mesh.userData.lociText) {
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = mode === 'pale' ? 0.45 : 1;
      mat.transparent = true;
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Parts: a Part is a geometry with baked vertex colours, positioned, not yet merged.
// ─────────────────────────────────────────────────────────────────────────────

export interface PartOpts {
  pos?: [number, number, number];
  rot?: [number, number, number]; // Euler XYZ radians
  scale?: number | [number, number, number];
  /** Darken the bottom of the part (fake ambient occlusion), 0–1. Default 0.18. */
  ao?: number;
}

function paint(geo: THREE.BufferGeometry, c: ColorLike, ao = 0.18): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.getAttribute('position');
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  const h = Math.max(1e-6, bb.max.y - bb.min.y);
  const base = color(c);
  const cols = new Float32Array(pos.count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) - bb.min.y) / h; // 0 bottom → 1 top
    const k = 1 - ao * (1 - t) * (1 - t);
    tmp.copy(base).multiplyScalar(k);
    cols[i * 3] = tmp.r;
    cols[i * 3 + 1] = tmp.g;
    cols[i * 3 + 2] = tmp.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  // Keep only attributes every part shares, so mergeGeometries never fails.
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'color') g.deleteAttribute(name);
  return g;
}

function place(g: THREE.BufferGeometry, o: PartOpts = {}): THREE.BufferGeometry {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(o.rot ?? [0, 0, 0])));
  const s = o.scale === undefined ? new THREE.Vector3(1, 1, 1) : typeof o.scale === 'number' ? new THREE.Vector3(o.scale, o.scale, o.scale) : new THREE.Vector3(...o.scale);
  m.compose(new THREE.Vector3(...(o.pos ?? [0, 0, 0])), q, s);
  g.applyMatrix4(m);
  return g;
}

/** Wrap any geometry as a coloured, placed part. */
export function part(geo: THREE.BufferGeometry, c: ColorLike, o: PartOpts = {}) {
  return place(paint(geo, c, o.ao), o);
}

// Primitive shortcuts (low segment counts on purpose — this is the low-poly style).
export const box = (w: number, h: number, d: number, c: ColorLike, o?: PartOpts) => part(new THREE.BoxGeometry(w, h, d), c, o);
export const sphere = (r: number, c: ColorLike, o?: PartOpts & { seg?: number }) =>
  part(new THREE.IcosahedronGeometry(r, o?.seg ?? 1), c, o);
export const ball = (r: number, c: ColorLike, o?: PartOpts & { w?: number; h?: number }) =>
  part(new THREE.SphereGeometry(r, o?.w ?? 10, o?.h ?? 7), c, o);
export const cyl = (rTop: number, rBot: number, h: number, c: ColorLike, o?: PartOpts & { seg?: number }) =>
  part(new THREE.CylinderGeometry(rTop, rBot, h, o?.seg ?? 10), c, o);
export const cone = (r: number, h: number, c: ColorLike, o?: PartOpts & { seg?: number }) =>
  part(new THREE.ConeGeometry(r, h, o?.seg ?? 10), c, o);
export const torus = (r: number, tube: number, c: ColorLike, o?: PartOpts & { seg?: number; arc?: number }) =>
  part(new THREE.TorusGeometry(r, tube, 6, o?.seg ?? 14, o?.arc ?? Math.PI * 2), c, o);
export const capsule = (r: number, len: number, c: ColorLike, o?: PartOpts) => part(new THREE.CapsuleGeometry(r, len, 3, 8), c, o);
export const dodeca = (r: number, c: ColorLike, o?: PartOpts) => part(new THREE.DodecahedronGeometry(r, 0), c, o);

/** Revolve a 2D profile (x = radius, y = height) around Y. */
export function lathe(profile: [number, number][], c: ColorLike, o?: PartOpts & { seg?: number }) {
  return part(new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), o?.seg ?? 12), c, o);
}

/** Extrude a 2D outline (XY plane) along Z by `depth`, centred on Z. */
export function extrude(outline: [number, number][], depth: number, c: ColorLike, o?: PartOpts & { bevel?: number }) {
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  const b = o?.bevel ?? 0;
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 1,
    curveSegments: 6,
  });
  g.translate(0, 0, -depth / 2);
  return part(g, c, o);
}

// ─────────────────────────────────────────────────────────────────────────────
// Assembling
// ─────────────────────────────────────────────────────────────────────────────

/** Merge parts into ONE mesh using the shared kit material. */
export function mesh(parts: THREE.BufferGeometry[], name = 'body'): THREE.Mesh {
  const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
  if (!merged) throw new Error(`mergeGeometries failed for ${name}`);
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  const m = new THREE.Mesh(merged, materials().full);
  m.name = name;
  m.userData.lociKit = true;
  return m;
}

/**
 * A named pivot group for an animated sub-part. `pivot` is where it rotates around
 * (e.g. the shoulder of a wing), in the parent's frame. Parts inside are given in the
 * PARENT frame and are re-expressed relative to the pivot automatically.
 */
export function joint(name: string, pivot: [number, number, number], parts: THREE.BufferGeometry[]): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(...pivot);
  for (const p of parts) p.translate(-pivot[0], -pivot[1], -pivot[2]);
  g.add(mesh(parts, `${name}Mesh`));
  return g;
}

/** Build a model root from a body (merged) plus optional animated joints. */
export function model(id: string, body: THREE.BufferGeometry[], joints: THREE.Object3D[] = []): THREE.Group {
  const root = new THREE.Group();
  root.name = id;
  if (body.length) root.add(mesh(body, 'body'));
  for (const j of joints) root.add(j);
  return root;
}

/**
 * Scale uniformly so the model fits in a `size` cube and sits on y = 0, centred in X/Z.
 * Returns the same root (mutated). Stores the resulting scale in userData.baseScale.
 */
export function normalize(root: THREE.Object3D, size = 0.3): THREE.Object3D {
  root.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(root);
  const dim = bb.getSize(new THREE.Vector3());
  const s = size / Math.max(dim.x, dim.y, dim.z, 1e-6);
  const inner = new THREE.Group();
  inner.name = 'normalized';
  while (root.children.length) inner.add(root.children[0]);
  const c = bb.getCenter(new THREE.Vector3());
  inner.position.set(-c.x * s, -bb.min.y * s, -c.z * s);
  inner.scale.setScalar(s);
  root.add(inner);
  root.userData.baseScale = s;
  return root;
}

// ─────────────────────────────────────────────────────────────────────────────
// Text (canvas texture). Fonts are loaded by the app; falls back to Georgia/serif.
// ─────────────────────────────────────────────────────────────────────────────

export const FONT_SERIF = '"Fraunces", Georgia, "Times New Roman", serif';
export const FONT_SANS = '"Inter", system-ui, sans-serif';

export interface TextOpts {
  fg?: string;
  bg?: string | null;
  font?: string;
  weight?: number;
  /** World height of one text line in metres. */
  lineHeight?: number;
  maxWidthPx?: number;
  padding?: number;
  radius?: number;
}

/** A flat text plane facing +Z. Used for labels painted on signs, flags, scrolls, plaques and books. */
export function textPlane(text: string, o: TextOpts = {}): THREE.Mesh {
  const px = 96;
  const font = `${o.weight ?? 700} ${px}px ${o.font ?? FONT_SERIF}`;
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d')!;
  ctx.font = font;
  const maxW = o.maxWidthPx ?? 900;
  const lines = wrap(ctx, text, maxW);
  const pad = o.padding ?? 28;
  const w = Math.ceil(Math.min(maxW, Math.max(...lines.map((l) => ctx.measureText(l).width))) + pad * 2);
  const h = Math.ceil(lines.length * px * 1.15 + pad * 2);
  cv.width = w;
  cv.height = h;
  ctx.font = font;
  if (o.bg) {
    ctx.fillStyle = o.bg;
    roundRect(ctx, 0, 0, w, h, o.radius ?? 24);
    ctx.fill();
  }
  ctx.fillStyle = o.fg ?? PAL.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, w / 2, pad + px * 1.15 * (i + 0.5)));
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const lh = o.lineHeight ?? 0.04;
  const worldH = (h / (px * 1.15)) * lh;
  const worldW = worldH * (w / h);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(worldW, worldH),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
  );
  m.userData.lociText = true;
  m.name = 'text';
  return m;
}

export function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const t = line ? `${line} ${word}` : word;
      if (ctx.measureText(t).width > maxW && line) {
        out.push(line);
        line = word;
      } else line = t;
    }
    out.push(line);
  }
  return out;
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Deterministic PRNG for reproducible variation (never Math.random in builders). */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

/** Count triangles & meshes under a root (used by tests and the gallery). */
export function stats(root: THREE.Object3D) {
  let tris = 0;
  let meshes = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      meshes++;
      const g = m.geometry;
      tris += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    }
  });
  return { tris: Math.round(tris), meshes };
}

// ─────────────────────────────────────────────────────────────────────────────
// Organic modelling helpers (additive). Used by the character / nature libraries.
// ─────────────────────────────────────────────────────────────────────────────
export type V3 = [number, number, number];

/** `o.tint` if given, else the default colour: the one-liner every builder uses for its main colour. */
export const tintOr = (o: { tint?: string }, def: ColorLike): ColorLike => o.tint ?? def;

/** A lighter (k > 0) or darker (k < 0) variant of a colour, as CSS hex. k in −1…1. */
export function shade(c: ColorLike, k: number): string {
  const col = color(c);
  const hsl = { h: 0, s: 0, l: 0 };
  col.getHSL(hsl);
  hsl.l = k >= 0 ? hsl.l + (1 - hsl.l) * k : hsl.l * (1 + k);
  return '#' + col.setHSL(hsl.h, hsl.s, hsl.l).getHexString();
}

function swapVert(arr: THREE.TypedArray, size: number, i: number, j: number) {
  for (let c = 0; c < size; c++) {
    const t = arr[i * size + c];
    arr[i * size + c] = arr[j * size + c];
    arr[j * size + c] = t;
  }
}

/** A copy of a part mirrored across X = 0, with triangle winding fixed so faces stay outward. */
export function mirrorX(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const m = (g.index ? g.toNonIndexed() : g).clone();
  const pos = m.getAttribute('position') as THREE.BufferAttribute;
  const col = m.getAttribute('color') as THREE.BufferAttribute | undefined;
  for (let i = 0; i < pos.count; i++) pos.setX(i, -pos.getX(i));
  for (let i = 0; i + 2 < pos.count; i += 3) {
    swapVert(pos.array, 3, i + 1, i + 2);
    if (col) swapVert(col.array, col.itemSize, i + 1, i + 2);
  }
  pos.needsUpdate = true;
  return m;
}

/** The given parts plus their X-mirrored twins (left/right symmetry in one call). */
export function sym(...parts: THREE.BufferGeometry[]): THREE.BufferGeometry[] {
  return [...parts, ...parts.map(mirrorX)];
}

/** Place an already-painted part so its local +Z points along `dir` (scale applies in local axes first). */
export function orient(g: THREE.BufferGeometry, pos: V3, dir: V3, scale: V3 = [1, 1, 1]): THREE.BufferGeometry {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...dir).normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos), q, new THREE.Vector3(...scale)));
  return g;
}

export interface SweepOpts extends PartOpts {
  /** Sides of the cross-section (5–6 reads as low-poly). */
  sides?: number;
  /** Close both ends (default true). */
  caps?: boolean;
  /** Squash the cross-section along its binormal (1 = round, 0.5 = flat ribbon). */
  flat?: number;
  /** Roll of the cross-section around the path, radians. */
  roll?: number;
}

/**
 * Sweep a (tapered) tube along a polyline — tails, trunks, bananas, limbs, scarves, horns.
 * `radius` is a constant, one value per path point, or a function of u ∈ [0, 1].
 */
export function sweep(path: V3[], radius: number | number[] | ((u: number) => number), c: ColorLike, o: SweepOpts = {}): THREE.BufferGeometry {
  const n = path.length;
  const sides = o.sides ?? 6;
  const flat = o.flat ?? 1;
  const R = (i: number) =>
    typeof radius === 'number' ? radius : Array.isArray(radius) ? (radius[i] ?? radius[radius.length - 1]) : radius(n > 1 ? i / (n - 1) : 0);
  const P = path.map((p) => new THREE.Vector3(...p));
  const T = P.map((_, i) => new THREE.Vector3().subVectors(P[Math.min(n - 1, i + 1)], P[Math.max(0, i - 1)]).normalize());
  const N = Math.abs(T[0].y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const B = new THREE.Vector3();
  const v: number[] = [];
  const idx: number[] = [];
  const tmp = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    N.sub(tmp.copy(T[i]).multiplyScalar(N.dot(T[i]))).normalize();
    B.crossVectors(T[i], N);
    const r = R(i);
    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * Math.PI * 2 + (o.roll ?? 0);
      const cx = Math.cos(a) * r;
      const cy = Math.sin(a) * r * flat;
      v.push(P[i].x + N.x * cx + B.x * cy, P[i].y + N.y * cx + B.y * cy, P[i].z + N.z * cx + B.z * cy);
    }
  }
  for (let i = 0; i < n - 1; i++)
    for (let s = 0; s < sides; s++) {
      const a = i * sides + s;
      const b = i * sides + ((s + 1) % sides);
      const cc = (i + 1) * sides + s;
      const d = (i + 1) * sides + ((s + 1) % sides);
      idx.push(a, b, cc, b, d, cc);
    }
  if (o.caps ?? true) {
    const s0 = v.length / 3;
    v.push(P[0].x, P[0].y, P[0].z);
    const e0 = s0 + 1;
    v.push(P[n - 1].x, P[n - 1].y, P[n - 1].z);
    for (let s = 0; s < sides; s++) {
      const a = s;
      const b = (s + 1) % sides;
      idx.push(s0, b, a);
      idx.push(e0, (n - 1) * sides + a, (n - 1) * sides + b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex(idx);
  return part(g, c, o);
}

/** A straight tapered limb from a to b (6-sided tube with caps). */
export const limb = (a: V3, b: V3, r0: number, r1: number, c: ColorLike, o: SweepOpts = {}) => sweep([a, b], [r0, r1], c, o);

/** Sample a quadratic Bézier a→b with control point m into `n` points (for sweep paths). */
export function curve(a: V3, m: V3, b: V3, n = 6): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * m[0] + t * t * b[0], u * u * a[1] + 2 * u * t * m[1] + t * t * b[1], u * u * a[2] + 2 * u * t * m[2] + t * t * b[2]]);
  }
  return out;
}

export interface EyeOpts {
  /** Centre of the character's LEFT eye (+X); the right eye is mirrored. */
  x: number;
  y: number;
  z: number;
  /** Eye radius. */
  r: number;
  /** Outward turn of each eye, radians (eyes sit on a round head). */
  yaw?: number;
  /** Pupil colour (default ink). */
  pupil?: ColorLike;
  /** Sclera colour; null → toy style (glossy bead eye, no white). */
  sclera?: ColorLike | null;
  /** Pupil size relative to r (default 0.62). */
  pupilR?: number;
  /** Where the pupils look (default straight at the learner, +Z). */
  look?: V3;
  /** Iris ring colour between sclera and pupil (owls, cats). */
  iris?: ColorLike;
  /** Vertical stretch of the eye (default 1.1 — slightly tall ovals read cuter). */
  tall?: number;
}

/** Big expressive cartoon eyes (pair): sclera + pupil + catch-light, mirrored across X. */
export function eyePair(o: EyeOpts): THREE.BufferGeometry[] {
  const yaw = o.yaw ?? 0.3;
  const tall = o.tall ?? 1.1;
  const r = o.r;
  const dir: V3 = [Math.sin(yaw), 0, Math.cos(yaw)];
  const lk = new THREE.Vector3(...(o.look ?? [0, 0, 1])).normalize();
  const pd = new THREE.Vector3(...dir).multiplyScalar(0.3).addScaledVector(lk, 0.7).normalize();
  const c: V3 = [o.x, o.y, o.z];
  const at = (d: number, up = 0, side = 0): V3 => [c[0] + pd.x * d + side, c[1] + pd.y * d + up, c[2] + pd.z * d];
  const pdir: V3 = [pd.x, pd.y, pd.z];
  const parts: THREE.BufferGeometry[] = [];
  const pr = r * (o.pupilR ?? 0.66);
  if (o.sclera !== null) {
    parts.push(orient(part(new THREE.IcosahedronGeometry(r, 1), o.sclera ?? '#ffffff', { ao: 0 }), c, dir, [1, tall, 0.8]));
    if (o.iris) parts.push(orient(part(new THREE.IcosahedronGeometry(pr * 1.3, 1), o.iris, { ao: 0 }), at(r * 0.58), pdir, [1, tall, 0.4]));
    parts.push(orient(part(new THREE.IcosahedronGeometry(pr, 1), o.pupil ?? PAL.ink, { ao: 0 }), at(r * (o.iris ? 0.66 : 0.56)), pdir, [1, tall, 0.45]));
    parts.push(orient(part(new THREE.IcosahedronGeometry(r * 0.17, 0), PAL.white, { ao: 0 }), at(r * 0.84, r * 0.26 * tall, r * 0.2), pdir));
  } else {
    parts.push(orient(part(new THREE.IcosahedronGeometry(r, 1), o.pupil ?? PAL.ink, { ao: 0 }), c, pdir, [0.85, tall, 0.55]));
    parts.push(orient(part(new THREE.IcosahedronGeometry(r * 0.26, 0), PAL.white, { ao: 0 }), at(r * 0.5, r * 0.34 * tall, r * 0.22), pdir));
  }
  return sym(...parts);
}

/** A smiling mouth arc facing +Z (torus segment, lower half). */
export function smile(pos: V3, w: number, c: ColorLike = PAL.ink, o: { tube?: number; arc?: number; tilt?: number } = {}) {
  const arc = o.arc ?? Math.PI * 0.8;
  const g = part(new THREE.TorusGeometry(w / 2, o.tube ?? w * 0.09, 4, 8, arc), c, { ao: 0 });
  g.rotateZ(-Math.PI / 2 - arc / 2);
  g.rotateX(o.tilt ?? 0);
  g.translate(pos[0], pos[1] + w * 0.25, pos[2]);
  return g;
}

/** Rosy cheeks pair (flat discs) at ±x. */
export function cheeks(x: number, y: number, z: number, r: number, c: ColorLike = PAL.pink, yaw = 0.5): THREE.BufferGeometry[] {
  return sym(orient(part(new THREE.CylinderGeometry(r, r, r * 0.25, 8), c, { ao: 0 }).rotateX(Math.PI / 2), [x, y, z], [Math.sin(yaw), 0, Math.cos(yaw)], [1, 0.7, 1]));
}
