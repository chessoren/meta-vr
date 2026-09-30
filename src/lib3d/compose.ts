/**
 * SceneRecipe → ComposedScene: a small animated diorama that fits the scene cube (default 30 cm).
 *
 * Layout rules
 *  - actors[0] is the hero: centred and biggest.
 *  - actors[1] (a prop) is placed by RELATION with the hero, chosen from a pairing table by prop
 *    id, or from the prop's shape (flat & wide → the hero stands ON it):
 *      on     hero rides on top of the prop (kangaroo bouncing on the can, otter on the wave)
 *      in     hero sits inside the prop (sheep in the boot, cat in the teacup)
 *      cling  hero hugs the prop's middle (turkey clinging to the swinging anchor)
 *      wear   the prop sits on the hero's head (crown, top hat, helmet), following head motion
 *      below  the prop is under the hero (cheese hovering over the campfire)
 *      behind the prop is a backdrop behind/above the hero (sun, moon, rainbow-like shapes)
 *      above  the prop hovers over the hero (umbrella, thunder cloud)
 *      beside default: front-right of the hero, both slightly turned towards each other
 *    In on/in/cling the hero is parented to the prop, so the prop's animation carries it.
 *  - role 'count' actors are instanced `count` times and arranged by their anim: juggle arc over
 *    the hero, orbit ring, stack tower, rain from the top of the cube, fly loop, or a front arc.
 *    More than a few copies share ONE InstancedMesh (merged prototype) → one draw call.
 *  - the whole animated envelope (sampled at intensity 2) is fitted into the cube.
 *
 * Prototypes are cached per (id, tint, label) and cloned (geometry & material shared).
 * Unknown ids fall back to a 'sign' showing the id (or a gift box) with a console.warn.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AnimId, SceneActor, SceneRecipe } from '../core/types';
import type { ModelSpec } from './spec';
import { getModel } from './catalog';
import { PAL, box, cyl, torus, model, normalize, materials, setAppearance as applyAppearance, type Appearance } from './kit';
import { applyAnim, initAnim, type AnimCtx, type AnimInit } from './anims';

export interface ComposedScene {
  root: THREE.Group;
  update(dt: number, t: number): void;
  setIntensity(k: number): void;
  setAppearance(mode: Appearance): void;
  /** Animated envelope in root space (inside the cube: x,z ∈ ±size/2, y ∈ [0, size]). */
  bounds: THREE.Box3;
  dispose(): void;
  /** Relation picked between hero and actors[1] (debug / QA). */
  relation: Relation;
  stats: { tris: number; meshes: number; drawCalls: number };
}

export type Relation = 'on' | 'in' | 'cling' | 'wear' | 'below' | 'behind' | 'above' | 'beside';

interface RelSpec {
  rel: Relation;
  /** Height fraction of the prop where the rider sits (on/in/cling). Default: detected support surface. */
  at?: number;
  /** Big bases (mountain, wave, ship…) are drawn larger than the rider; small ones (can, book…) smaller. */
  big?: boolean;
}

/** Good pairings, by prop id. Anything not listed falls back to shape analysis. */
export const RELATIONS: Record<string, RelSpec> = {
  // things you stand on
  can: { rel: 'on' }, book: { rel: 'on' }, cheese: { rel: 'on' }, cake: { rel: 'on' }, pizza: { rel: 'on' }, dice: { rel: 'on' },
  coin: { rel: 'on' }, clock: { rel: 'on' }, globe: { rel: 'on' }, trophy: { rel: 'on' }, plaque: { rel: 'on' }, scroll: { rel: 'on' },
  radio: { rel: 'on' }, telephone: { rel: 'on' }, envelope: { rel: 'on' }, gear: { rel: 'on' }, shield: { rel: 'on' },
  mountain: { rel: 'on', at: 0.96, big: true }, cloud: { rel: 'on', at: 0.85, big: true }, wave: { rel: 'on', at: 0.8, big: true }, star: { rel: 'on', at: 0.75 },
  ship: { rel: 'on', at: 0.5, big: true }, tank: { rel: 'on', at: 0.8, big: true }, car: { rel: 'on', at: 0.75, big: true }, train: { rel: 'on', at: 0.8, big: true },
  submarine: { rel: 'on', at: 0.75, big: true }, zeppelin: { rel: 'on', at: 0.9, big: true }, cannon: { rel: 'on', at: 0.7, big: true },
  brickwall: { rel: 'on', big: true }, bridge: { rel: 'on', big: true }, pyramid: { rel: 'on', at: 0.97, big: true }, tower: { rel: 'on', big: true },
  castle: { rel: 'on', big: true }, house: { rel: 'on', big: true },
  // things you sit in
  boot: { rel: 'in', at: 0.6 }, teacup: { rel: 'in', at: 0.45 }, balloon: { rel: 'in', at: 0.1 }, tent: { rel: 'in', at: 0.05 },
  // things you hug
  anchor: { rel: 'cling', at: 0.5 }, flag: { rel: 'cling', at: 0.45 }, rocket: { rel: 'cling', at: 0.4 }, sword: { rel: 'cling', at: 0.45 },
  tree: { rel: 'cling', at: 0.3 }, lightbulb: { rel: 'cling', at: 0.5 }, telescope: { rel: 'cling', at: 0.4 }, key: { rel: 'cling', at: 0.5 },
  // things you wear
  crown: { rel: 'wear' }, tophat: { rel: 'wear' }, helmet: { rel: 'wear' },
  // things around you
  fire: { rel: 'below' }, candle: { rel: 'beside' },
  sun: { rel: 'behind' }, moon: { rel: 'behind' }, rainbow: { rel: 'behind' },
  umbrella: { rel: 'above' }, lightning: { rel: 'above' },
};

/** Yaw that shows a model's best side (profile animals & vehicles read better at 3/4). */
const YAW: Record<string, number> = {
  horse: 0.6, dog: 0.35, lion: 0.35, elephant: 0.45, sheep: 0.45, cat: 0.2, turkey: 0.15, rooster: 0.35, fish: -0.2, snail: -0.3,
  tank: 0.55, train: 0.55, car: 0.5, ship: 0.5, submarine: 0.5, biplane: 0.4, zeppelin: 0.45, cannon: 0.55, bee: 0.3, penguin: 0.1,
};

/** Triangle budget for all copies of a 'count' actor together (they are small on screen). */
const COUNT_TRI_BUDGET = 2600;

const MOBILE = new Set<AnimId>(['fly', 'orbit', 'rain', 'stack']);
const LOCOMOTION = new Set<AnimId>(['march', 'bounce', 'dance', 'wobble', 'spin', 'flip', 'shake']);
const IN_PLACE = new Set<AnimId>(['idle', 'shake', 'grow', 'dance', 'wobble']);
const CALM_BASE: Partial<Record<AnimId, AnimId>> = { fly: 'idle', orbit: 'idle', rain: 'idle', stack: 'idle', juggle: 'idle', flip: 'wobble', bounce: 'wobble' };

// ─────────────────────────────────────────────────────────────────────────────
// Prototype cache
// ─────────────────────────────────────────────────────────────────────────────
interface Proto {
  key: string;
  id: string;
  spec?: ModelSpec;
  root: THREE.Object3D;
  /** Normalised dimensions (max = 1): width, height, depth. */
  dim: [number, number, number];
  meshes: number;
  tris: number;
  hasText: boolean;
  verts?: Float32Array;
  merged?: THREE.BufferGeometry | null;
  lods?: Map<number, THREE.BufferGeometry>;
}
const cache = new Map<string, Proto>();
const warned = new Set<string>();

function giftBox(): THREE.Group {
  const parts = [
    box(0.2, 0.16, 0.2, PAL.red, { pos: [0, 0.08, 0] }),
    box(0.215, 0.035, 0.215, PAL.crimson, { pos: [0, 0.16, 0] }),
    box(0.04, 0.2, 0.222, PAL.gold, { pos: [0, 0.1, 0], ao: 0 }),
    box(0.222, 0.2, 0.04, PAL.gold, { pos: [0, 0.1, 0], ao: 0 }),
    torus(0.035, 0.012, PAL.gold, { pos: [-0.03, 0.2, 0], rot: [0, 0.6, 0.5], seg: 8 }),
    torus(0.035, 0.012, PAL.gold, { pos: [0.03, 0.2, 0], rot: [0, -0.6, -0.5], seg: 8 }),
    cyl(0.014, 0.014, 0.02, PAL.gold, { pos: [0, 0.19, 0], seg: 6 }),
  ];
  return model('gift', parts);
}

function countStats(root: THREE.Object3D) {
  let tris = 0;
  let meshes = 0;
  let text = false;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    meshes++;
    if (m.userData.lociText) text = true;
    const g = m.geometry;
    tris += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
  });
  return { tris: Math.round(tris), meshes, text };
}

function buildProto(id: string, tint?: string, label?: string): Proto {
  const key = `${id}|${tint ?? ''}|${label ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let spec = getModel(id);
  let root: THREE.Object3D | null = null;
  let buildLabel = label;
  if (!spec) {
    if (!warned.has(id)) {
      console.warn(`[loci/compose] unknown model id "${id}" — using a fallback`);
      warned.add(id);
    }
    const sign = getModel('sign');
    if (sign?.text && typeof document !== 'undefined') {
      spec = sign;
      buildLabel = label ?? id;
    }
  }
  if (spec) {
    try {
      root = spec.build({ tint, label: buildLabel });
    } catch (e) {
      console.warn(`[loci/compose] model "${id}" failed to build — using a gift box`, e);
      root = null;
      spec = undefined;
    }
  }
  if (!root) root = giftBox();
  normalize(root, 1);
  root.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(root);
  const d = bb.getSize(new THREE.Vector3());
  const s = countStats(root);
  const p: Proto = { key, id, spec, root, dim: [d.x, d.y, d.z], meshes: s.meshes, tris: s.tris, hasText: s.text };
  cache.set(key, p);
  return p;
}

/** Vertex positions of a prototype in its own (normalised) space, cached. */
function protoVerts(p: Proto, under?: THREE.Object3D): Float32Array {
  if (!under && p.verts) return p.verts;
  const out: number[] = [];
  const v = new THREE.Vector3();
  p.root.updateMatrixWorld(true);
  (under ?? p.root).traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.userData.lociText) return;
    const pos = m.geometry.getAttribute('position');
    const step = Math.max(1, Math.floor(pos.count / 1500));
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      out.push(v.x, v.y, v.z);
    }
  });
  const arr = new Float32Array(out);
  if (!under) p.verts = arr;
  return arr;
}

interface Band { cx: number; cz: number; minX: number; maxX: number; minZ: number; maxZ: number; maxY: number; n: number }
/** Horizontal extent of the prototype between heights y0..y1 (normalised units). */
function probe(p: Proto, y0: number, y1: number, under?: THREE.Object3D): Band {
  const vs = protoVerts(p, under);
  const b: Band = { cx: 0, cz: 0, minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, maxY: -Infinity, n: 0 };
  for (let i = 0; i < vs.length; i += 3) {
    const y = vs[i + 1];
    if (y < y0 || y > y1) continue;
    const x = vs[i];
    const z = vs[i + 2];
    b.cx += x;
    b.cz += z;
    b.n++;
    if (x < b.minX) b.minX = x;
    if (x > b.maxX) b.maxX = x;
    if (z < b.minZ) b.minZ = z;
    if (z > b.maxZ) b.maxZ = z;
    if (y > b.maxY) b.maxY = y;
  }
  if (b.n === 0) {
    const [w, h, d] = p.dim;
    return { cx: 0, cz: 0, minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2, maxY: h, n: 0 };
  }
  b.cx = (b.minX + b.maxX) / 2 * 0.5 + (b.cx / b.n) * 0.5;
  b.cz = (b.minZ + b.maxZ) / 2 * 0.5 + (b.cz / b.n) * 0.5;
  return b;
}

/** Height (normalised) of the highest horizontal slice at least `frac` as wide as the whole prop: where a rider can stand. */
function supportHeight(p: Proto, frac = 0.5): number {
  const [w, h, d] = p.dim;
  const need = frac * Math.max(w, d);
  const N = 16;
  for (let i = N - 1; i >= 0; i--) {
    const b = probe(p, (h * i) / N, (h * (i + 1)) / N);
    if (b.n && Math.max(b.maxX - b.minX, b.maxZ - b.minZ) >= need) return b.maxY;
  }
  return h;
}

/** One merged geometry (all kit meshes of the prototype) for instancing. null if impossible. */
function mergedGeometry(p: Proto): THREE.BufferGeometry | null {
  if (p.merged !== undefined) return p.merged;
  const geos: THREE.BufferGeometry[] = [];
  p.root.updateMatrixWorld(true);
  p.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.userData.lociKit) return;
    const g = m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'color' && n !== 'normal') g.deleteAttribute(n);
    if (g.index) geos.push(g.toNonIndexed());
    else geos.push(g);
  });
  let merged: THREE.BufferGeometry | null = null;
  try {
    merged = geos.length ? mergeGeometries(geos, false) : null;
  } catch {
    merged = null;
  }
  if (merged) merged.computeBoundingSphere();
  p.merged = merged;
  return merged;
}

/**
 * Vertex-clustering decimation of a non-indexed, vertex-coloured geometry: snap vertices to a
 * `res`³ grid over the bounding box, drop collapsed triangles. Keeps the chunky low-poly look;
 * used for small instanced copies so 8 bees don't cost 8 full bees.
 */
export function decimate(g: THREE.BufferGeometry, res: number): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g;
  const pos = src.getAttribute('position');
  const col = src.getAttribute('color');
  src.computeBoundingBox();
  const bb = src.boundingBox!;
  const size = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z, 1e-6);
  const cell = size / res;
  const ids = new Int32Array(pos.count);
  const acc = new Map<number, [number, number, number, number]>();
  for (let i = 0; i < pos.count; i++) {
    const ix = Math.floor((pos.getX(i) - bb.min.x) / cell);
    const iy = Math.floor((pos.getY(i) - bb.min.y) / cell);
    const iz = Math.floor((pos.getZ(i) - bb.min.z) / cell);
    const id = ix + iy * 1024 + iz * 1048576;
    ids[i] = id;
    const a = acc.get(id);
    if (a) { a[0] += pos.getX(i); a[1] += pos.getY(i); a[2] += pos.getZ(i); a[3]++; } else acc.set(id, [pos.getX(i), pos.getY(i), pos.getZ(i), 1]);
  }
  const P: number[] = [];
  const C: number[] = [];
  for (let i = 0; i + 2 < pos.count; i += 3) {
    const a = ids[i], b = ids[i + 1], c = ids[i + 2];
    if (a === b || b === c || a === c) continue;
    for (const [v, id] of [[i, a], [i + 1, b], [i + 2, c]] as const) {
      const s = acc.get(id)!;
      P.push(s[0] / s[3], s[1] / s[3], s[2] / s[3]);
      if (col) C.push(col.getX(v), col.getY(v), col.getZ(v));
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  if (col) out.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  out.computeVertexNormals();
  out.computeBoundingSphere();
  return out;
}

/** The merged prototype, decimated until it costs ≤ `maxTris` triangles (cached per budget step). */
function instanceGeometry(p: Proto, maxTris: number): THREE.BufferGeometry | null {
  const full = mergedGeometry(p);
  if (!full) return null;
  const tris = full.getAttribute('position').count / 3;
  if (tris <= maxTris) return full;
  const lods = (p.lods ??= new Map());
  for (const res of [40, 32, 26, 21, 17, 14, 11, 9, 7]) {
    let g = lods.get(res);
    if (!g) { g = decimate(full, res); lods.set(res, g); }
    if (g.getAttribute('position').count / 3 <= maxTris || res === 7) return g;
  }
  return full;
}

/** Free every cached prototype (call when leaving the app; scenes must be disposed first). */
export function clearCompositionCache() {
  for (const p of cache.values()) {
    p.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        if (m.userData.lociText) {
          const mat = m.material as THREE.MeshBasicMaterial;
          mat.map?.dispose();
          mat.dispose();
        }
      }
    });
    p.merged?.dispose();
    p.lods?.forEach((g) => g.dispose());
  }
  cache.clear();
}

// ─────────────────────────────────────────────────────────────────────────────
// Relations
// ─────────────────────────────────────────────────────────────────────────────

/** Pick how actors[1] relates to the hero (pure: only reads the pairing table and dimensions). */
export function pickRelation(heroAnim: AnimId, propId: string, propDim?: [number, number, number]): Relation {
  let rel: Relation = RELATIONS[propId]?.rel ?? 'beside';
  if (!RELATIONS[propId] && propDim) {
    const [w, h, d] = propDim;
    if (h < 0.45 * Math.max(w, d)) rel = 'on';
  }
  if (MOBILE.has(heroAnim) && (rel === 'on' || rel === 'in' || rel === 'cling' || rel === 'below' || rel === 'above')) rel = 'beside';
  if (heroAnim === 'juggle' && (rel === 'in' || rel === 'cling')) rel = 'beside';
  return rel;
}

// ─────────────────────────────────────────────────────────────────────────────
// Composition
// ─────────────────────────────────────────────────────────────────────────────
interface Item {
  node: THREE.Object3D;
  model: THREE.Object3D;
  anim: AnimId;
  ctx: AnimCtx;
  spec?: ModelSpec;
  animate: boolean;
}
interface Inst {
  mesh: THREE.InstancedMesh;
  proxies: THREE.Object3D[];
  ctxs: AnimCtx[];
  anim: AnimId;
}

const ANIM_OK = new Set<string>(['idle', 'bounce', 'spin', 'wobble', 'orbit', 'juggle', 'float', 'shake', 'grow', 'march', 'fly', 'rain', 'stack', 'flip', 'dance']);
const safeAnim = (a: string | undefined): AnimId => (a && ANIM_OK.has(a) ? (a as AnimId) : 'idle');

export function composeScene(recipe: SceneRecipe, opts: { size?: number } = {}): ComposedScene {
  const S = opts.size ?? 0.3;
  const root = new THREE.Group();
  root.name = 'lociScene';
  root.userData.accent = recipe.accent;
  const stage = new THREE.Group();
  stage.name = 'stage';
  root.add(stage);

  const items: Item[] = [];
  const insts: Inst[] = [];
  const ownedMaterials: THREE.Material[] = [];
  let k = 1;

  const actors: SceneActor[] = (recipe.actors ?? []).filter((a) => a && typeof a.model === 'string').slice(0, 3);
  if (!actors.length) actors.push({ model: 'gift', role: 'hero', anim: 'idle' });
  const heroA = actors[0];
  const heroP = buildProto(heroA.model, heroA.tint, heroA.label);
  const heroAnim = safeAnim(heroA.anim);

  /** Make an actor node (lociActor) holding a clone of the prototype, scaled so its max dim = size. */
  const makeNode = (p: Proto, size: number, name: string) => {
    const node = new THREE.Group();
    node.name = name;
    node.userData.lociActor = true;
    node.userData.dim = p.dim;
    node.userData.faceYaw = p.root.userData.faceYaw ?? 0;
    const m = p.root.clone(true);
    m.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.userData.lociText) {
        const mat = (mesh.material as THREE.Material).clone();
        mesh.material = mat;
        ownedMaterials.push(mat);
      }
    });
    node.add(m);
    node.scale.setScalar(size);
    return { node, model: m };
  };
  const addItem = (node: THREE.Object3D, m: THREE.Object3D, anim: AnimId, p: Proto, phase: number, init: AnimInit, animate = true) => {
    initAnim(node, { dim: p.dim, faceYaw: node.userData.faceYaw, ...init });
    items.push({ node, model: m, anim, ctx: { index: 0, count: 1, phase, spec: p.spec }, spec: p.spec, animate });
  };

  // ── hero & first prop relation ──
  const second = actors[1];
  const secondIsProp = second && second.role !== 'count';
  const propP = secondIsProp ? buildProto(second.model, second.tint, second.label) : null;
  const rel: Relation = propP ? pickRelation(heroAnim, second!.model, propP.dim) : 'beside';
  const countA = actors.find((a, i) => i > 0 && a.role === 'count');
  const extraProps = actors.filter((a, i) => i > 0 && a.role !== 'count' && a !== second);
  const heroJuggles = heroAnim === 'juggle' || countA?.anim === 'juggle' || (secondIsProp && second!.anim === 'juggle');

  const sc = (a: SceneActor) => Math.max(0.3, Math.min(2, a.scale ?? 1));
  let heroSize = (propP || countA ? 0.64 : 0.74) * S * sc(heroA);
  if (heroJuggles) heroSize = Math.min(heroSize, 0.56 * S);
  const heroYaw = (YAW[heroA.model] ?? 0) + (propP && rel === 'beside' ? 0.25 : 0);

  // Hero world-frame footprint (updated by layout) — used by count arrangements.
  const heroBox = { x: 0, y: 0, z: 0, w: 0, h: 0, d: 0 };

  const pAnim = propP ? safeAnim(second!.anim) : 'idle';
  if (propP && (rel === 'on' || rel === 'in' || rel === 'cling')) {
    // carrier = prop, rider = hero (child of the carrier so its motion carries the hero)
    const spec = RELATIONS[second!.model];
    const bigBase = spec?.big ?? false;
    const carrierSize = (rel === 'on' ? (bigBase ? 0.68 : 0.46) : rel === 'in' ? 0.66 : 0.76) * S * sc(second!);
    const carrier = makeNode(propP, carrierSize, 'prop');
    carrier.node.rotation.y = (YAW[second!.model] ?? 0) * 0.5;
    stage.add(carrier.node);
    let carrierAnim: AnimId = CALM_BASE[pAnim] ?? pAnim;
    let riderAnim: AnimId = heroAnim;
    const [, ph] = propP.dim;
    let pos: [number, number, number];
    let riderScale: number;
    if (rel === 'on') {
      const y = spec?.at === undefined ? supportHeight(propP) : ph * spec.at;
      const band = probe(propP, y - ph * 0.12, y + 1e-3);
      pos = [band.cx, y, band.cz];
      riderScale = ((bigBase ? 0.46 : 0.62) * S) / carrierSize * sc(heroA);
      if (heroJuggles) riderScale *= 0.85;
    } else if (rel === 'in') {
      if (pAnim === 'idle' && LOCOMOTION.has(heroAnim)) {
        carrierAnim = heroAnim;
        riderAnim = 'idle';
      } else if (!IN_PLACE.has(heroAnim)) riderAnim = 'idle';
      const band = probe(propP, ph * 0.78, ph + 1e-3);
      const openW = Math.max(0.12, band.maxX - band.minX);
      const at = spec?.at ?? 0.4;
      pos = [band.cx, ph * at, band.cz + 0.01];
      riderScale = Math.min(0.8, Math.max(0.32, (openW * 1.25) / Math.max(0.2, heroP.dim[0]))) * sc(heroA);
    } else {
      if (pAnim === 'idle' && (heroAnim === 'wobble' || heroAnim === 'spin' || heroAnim === 'dance')) {
        carrierAnim = heroAnim;
        riderAnim = 'shake';
      } else if (!IN_PLACE.has(heroAnim)) riderAnim = 'idle';
      const at = spec?.at ?? 0.5;
      const band = probe(propP, ph * (at - 0.15), ph * (at + 0.15));
      riderScale = (0.6 / 0.76) * sc(heroA) / sc(second!);
      const rd = heroP.dim[2] * riderScale;
      pos = [band.cx + heroP.dim[0] * riderScale * 0.12, ph * at - heroP.dim[1] * riderScale * 0.45, band.maxZ + rd * 0.05];
    }
    const rider = makeNode(heroP, riderScale, 'hero');
    rider.node.position.set(...pos);
    rider.node.rotation.y = (rel === 'in' ? 0 : heroYaw) - carrier.node.rotation.y;
    carrier.node.add(rider.node);
    addItem(carrier.node, carrier.model, carrierAnim, propP, 0.37, { size: S, top: S });
    addItem(rider.node, rider.model, riderAnim, heroP, 0, { size: S / carrierSize, juggler: heroJuggles });
    heroBox.w = heroP.dim[0] * riderScale * carrierSize;
    heroBox.d = heroP.dim[2] * riderScale * carrierSize;
    heroBox.h = propP.dim[1] * carrierSize + heroP.dim[1] * riderScale * carrierSize;
    heroBox.x = pos[0] * carrierSize;
    heroBox.z = pos[2] * carrierSize;
  } else {
    const hero = makeNode(heroP, heroSize, 'hero');
    hero.node.rotation.y = heroYaw;
    stage.add(hero.node);
    const hw = heroP.dim[0] * heroSize;
    const hh = heroP.dim[1] * heroSize;
    const hd = heroP.dim[2] * heroSize;
    Object.assign(heroBox, { x: 0, y: 0, z: 0, w: hw, h: hh, d: hd });
    const heroInit: AnimInit = { size: S, juggler: heroJuggles, center: [0, hh * 0.5, 0], radius: S * (heroAnim === 'fly' ? 0.07 : 0.1) };
    if (propP) {
      const pSize = 0.42 * S * sc(second!);
      if (rel === 'wear') {
        addItem(hero.node, hero.model, heroAnim, heroP, 0, heroInit);
        attachHat(hero.model, heroP, propP, second!);
      } else if (rel === 'below') {
        const fs = 0.52 * S * sc(second!);
        const f = makeNode(propP, fs, 'prop');
        stage.add(f.node);
        addItem(f.node, f.model, pAnim === 'idle' ? 'idle' : CALM_BASE[pAnim] ?? pAnim, propP, 0.3, { size: S });
        hero.node.scale.setScalar((heroSize = 0.5 * S * sc(heroA)));
        Object.assign(heroBox, { w: heroP.dim[0] * heroSize, h: heroP.dim[1] * heroSize, d: heroP.dim[2] * heroSize });
        hero.node.position.y = propP.dim[1] * fs * 0.62;
        hero.node.position.z = 0.01 * S;
        heroBox.y = hero.node.position.y;
        heroBox.h += heroBox.y;
        addItem(hero.node, hero.model, heroAnim, heroP, 0, heroInit);
      } else if (rel === 'behind') {
        const bs = 0.5 * S * sc(second!);
        const b = makeNode(propP, bs, 'prop');
        b.node.position.set(0.2 * S, 0.3 * S, -0.24 * S);
        b.node.rotation.y = -0.2;
        stage.add(b.node);
        hero.node.position.set(-0.05 * S, 0, 0.05 * S);
        heroBox.x = -0.05 * S;
        heroBox.z = 0.05 * S;
        addItem(b.node, b.model, pAnim, propP, 0.4, { size: S, center: [0.2 * S, 0.3 * S, -0.24 * S], radius: S * 0.08 });
        addItem(hero.node, hero.model, heroAnim, heroP, 0, heroInit);
      } else if (rel === 'above') {
        const as = 0.46 * S * sc(second!);
        const a = makeNode(propP, as, 'prop');
        a.node.position.set(0, hh + 0.03 * S, 0);
        stage.add(a.node);
        addItem(a.node, a.model, pAnim === 'idle' ? 'float' : pAnim, propP, 0.2, { size: S });
        addItem(hero.node, hero.model, heroAnim, heroP, 0, heroInit);
      } else {
        // beside: hero left, prop front-right, turned towards each other
        const pw = propP.dim[0] * pSize;
        const hx = -pw * 0.35;
        hero.node.position.set(hx, 0, -0.03 * S);
        heroBox.x = hx;
        heroBox.z = -0.03 * S;
        const p = makeNode(propP, pSize, 'prop');
        const px = hx + hw / 2 + pw * 0.35;
        p.node.position.set(px, 0, 0.12 * S);
        p.node.rotation.y = (YAW[second!.model] ?? 0) - 0.35;
        stage.add(p.node);
        const pInit = propInit(pAnim, S, heroBox, propP, pSize);
        if (pInit.pos) p.node.position.set(...pInit.pos);
        if (pAnim === 'juggle') p.node.userData.juggled = true;
        addItem(p.node, p.model, pAnim, propP, 0.37, pInit.init);
        heroInit.center = [hx, hh * 0.5, heroBox.z];
        addItem(hero.node, hero.model, heroAnim, heroP, 0, heroInit);
      }
    } else addItem(hero.node, hero.model, heroAnim, heroP, 0, heroInit);
  }

  // ── wear helper (hat on the head joint, follows head bob) ──
  function attachHat(heroM: THREE.Object3D, hp: Proto, hatP: Proto, a: SceneActor) {
    heroM.updateMatrixWorld(true);
    const head = heroM.getObjectByName('head');
    let top: THREE.Vector3;
    let headW: number;
    if (head) {
      const bb = new THREE.Box3().setFromObject(head);
      top = new THREE.Vector3((bb.min.x + bb.max.x) / 2, bb.max.y, (bb.min.z + bb.max.z) / 2);
      headW = bb.max.x - bb.min.x;
    } else {
      const band = probe(hp, hp.dim[1] * 0.85, hp.dim[1] + 1e-3);
      top = new THREE.Vector3(band.cx, band.maxY, band.cz);
      headW = Math.max(0.2, band.maxX - band.minX);
    }
    const hatW = Math.max(0.3, hatP.dim[0]);
    const s = Math.min(0.6, (headW * 0.72) / hatW) * sc(a);
    top.y -= hatP.dim[1] * s * 0.28;
    const parent = head ?? heroM;
    const inv = new THREE.Matrix4().copy(parent.matrixWorld).invert();
    const local = top.clone().applyMatrix4(inv);
    const ps = parent.matrixWorld.getMaxScaleOnAxis() / heroM.matrixWorld.getMaxScaleOnAxis();
    const hat = makeNode(hatP, s / ps, 'prop');
    hat.node.position.copy(local);
    hat.node.rotation.set(-0.08, 0, 0.14);
    parent.add(hat.node);
    items.push({ node: hat.node, model: hat.model, anim: 'idle', ctx: { index: 0, count: 1, phase: 0, spec: hatP.spec }, spec: hatP.spec, animate: false });
  }

  // ── extra props (third actor): front-left of the hero ──
  for (const a of extraProps) {
    const p = buildProto(a.model, a.tint, a.label);
    const size = 0.34 * S * sc(a);
    const n = makeNode(p, size, 'prop2');
    const x = heroBox.x - heroBox.w / 2 - p.dim[0] * size * 0.3;
    n.node.position.set(x, 0, 0.13 * S);
    n.node.rotation.y = (YAW[a.model] ?? 0) + 0.35;
    stage.add(n.node);
    const an = safeAnim(a.anim);
    const pi = propInit(an, S, heroBox, p, size);
    if (pi.pos) n.node.position.set(...pi.pos);
    if (an === 'juggle') n.node.userData.juggled = true;
    addItem(n.node, n.model, an, p, 0.61, pi.init);
  }

  // ── count copies ──
  if (countA) {
    const p = buildProto(countA.model, countA.tint, countA.label);
    const c = Math.max(1, Math.min(12, Math.round(countA.count ?? 3)));
    const an = safeAnim(countA.anim);
    const lay = countLayout(an, c, S, heroBox, p, sc(countA));
    const usedMeshes = countStats(stage).meshes;
    const clones = c <= 3 && usedMeshes + c * p.meshes <= 12 && c * p.tris <= 2400;
    const geo = clones ? null : instanceGeometry(p, Math.max(120, Math.floor(COUNT_TRI_BUDGET / c)));
    if (geo) {
      const mesh = new THREE.InstancedMesh(geo, materials().full, c);
      mesh.name = `count:${p.id}`;
      mesh.userData.lociKit = true;
      mesh.frustumCulled = false;
      stage.add(mesh);
      const proxies: THREE.Object3D[] = [];
      const ctxs: AnimCtx[] = [];
      for (let i = 0; i < c; i++) {
        const o = new THREE.Object3D();
        o.userData.dim = p.dim;
        o.userData.faceYaw = p.root.userData.faceYaw ?? 0;
        o.userData.juggled = an === 'juggle';
        o.position.set(...lay.pos[i]);
        o.rotation.y = lay.yaw[i];
        o.scale.setScalar(lay.size);
        initAnim(o, { dim: p.dim, ...lay.init });
        proxies.push(o);
        ctxs.push({ index: i, count: c, phase: i / c, spec: p.spec });
      }
      insts.push({ mesh, proxies, ctxs, anim: an });
    } else {
      for (let i = 0; i < c; i++) {
        const n = makeNode(p, lay.size, `count${i}`);
        n.node.position.set(...lay.pos[i]);
        n.node.rotation.y = lay.yaw[i];
        if (an === 'juggle') n.node.userData.juggled = true;
        stage.add(n.node);
        initAnim(n.node, { dim: p.dim, faceYaw: n.node.userData.faceYaw, ...lay.init });
        items.push({ node: n.node, model: n.model, anim: an, ctx: { index: i, count: c, phase: i / c, spec: p.spec }, spec: p.spec, animate: true });
      }
    }
  }

  // ── update ──
  function step(t: number, kk: number) {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.animate) applyAnim(it.node, it.anim, t, kk, it.ctx);
      it.spec?.idle?.(it.model, t, kk);
    }
    for (let i = 0; i < insts.length; i++) {
      const ins = insts[i];
      for (let j = 0; j < ins.proxies.length; j++) {
        const o = ins.proxies[j];
        applyAnim(o, ins.anim, t, kk, ins.ctxs[j]);
        o.updateMatrix();
        ins.mesh.setMatrixAt(j, o.matrix);
      }
      ins.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // ── fit the animated envelope (sampled at k = 2) into the cube ──
  const env = new THREE.Box3();
  const corner = new THREE.Vector3();
  const lb = new THREE.Box3();
  const accumulate = () => {
    root.updateMatrixWorld(true);
    for (const it of items) {
      if (!it.animate && it.node.parent !== stage) continue;
      const [w, h, d] = it.node.userData.dim as [number, number, number];
      lb.min.set(-w / 2, 0, -d / 2);
      lb.max.set(w / 2, h, d / 2);
      addBox(lb, it.node.matrixWorld);
    }
    for (const ins of insts) {
      for (const o of ins.proxies) {
        if (o.scale.x < 0.05 * (o.userData.anim?.bs ?? 1)) continue;
        const [w, h, d] = o.userData.dim as [number, number, number];
        lb.min.set(-w / 2, 0, -d / 2);
        lb.max.set(w / 2, h, d / 2);
        addBox(lb, o.matrix);
      }
    }
  };
  function addBox(b: THREE.Box3, m: THREE.Matrix4) {
    for (let i = 0; i < 8; i++) {
      corner.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(m);
      env.expandByPoint(corner);
    }
  }
  env.makeEmpty();
  for (let i = 0; i < 40; i++) {
    step(i * 0.137, 2);
    accumulate();
  }
  step(0, 1);
  accumulate();
  const cx = (env.min.x + env.max.x) / 2;
  const cz = (env.min.z + env.max.z) / 2;
  const w = env.max.x - env.min.x;
  const dd = env.max.z - env.min.z;
  const hgt = Math.max(1e-6, env.max.y - Math.min(0, env.min.y));
  const f = Math.min(1.25, (S * 0.95) / Math.max(w, dd, 1e-6), (S * 0.95) / hgt);
  stage.scale.setScalar(f);
  stage.position.set(-cx * f, 0, -cz * f);
  const bounds = new THREE.Box3(
    new THREE.Vector3((env.min.x - cx) * f, env.min.y * f, (env.min.z - cz) * f),
    new THREE.Vector3((env.max.x - cx) * f, env.max.y * f, (env.max.z - cz) * f),
  );
  step(0, 1);

  let tris = 0;
  let meshes = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    meshes++;
    const g = m.geometry;
    const n = (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    tris += (m as THREE.InstancedMesh).isInstancedMesh ? n * (m as THREE.InstancedMesh).count : n;
  });

  return {
    root,
    relation: rel,
    bounds,
    stats: { tris: Math.round(tris), meshes, drawCalls: meshes },
    update(_dt: number, t: number) {
      step(t, k);
    },
    setIntensity(v: number) {
      k = Math.max(0, Math.min(3, v));
    },
    setAppearance(mode: Appearance) {
      applyAppearance(root, mode);
    },
    dispose() {
      root.removeFromParent();
      for (const ins of insts) ins.mesh.dispose();
      for (const m of ownedMaterials) m.dispose();
      items.length = 0;
      insts.length = 0;
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Arrangements
// ─────────────────────────────────────────────────────────────────────────────
interface HeroBox { x: number; y: number; z: number; w: number; h: number; d: number }

/** Where a single (non-count) prop goes for travelling anims, relative to the hero. */
function propInit(anim: AnimId, S: number, hero: HeroBox, p: Proto, size: number): { init: AnimInit; pos?: [number, number, number] } {
  const top = hero.y + hero.h;
  switch (anim) {
    case 'orbit':
      return { init: { size: S, center: [hero.x, 0, hero.z], radius: Math.max(hero.w, hero.d) * 0.5 + p.dim[0] * size * 0.7 }, pos: [hero.x, hero.h * 0.35, hero.z] };
    case 'fly':
      return { init: { size: S, center: [hero.x, 0, hero.z], radius: Math.max(hero.w, hero.d) * 0.5 + size * 0.4 }, pos: [hero.x, hero.h * 0.3, hero.z] };
    case 'juggle':
      return { init: { size: S, center: [hero.x, top * 0.85, hero.z + 0.04 * S], arcW: Math.max(hero.w * 1.4, 0.5 * S), arcH: 0.28 * S }, pos: [hero.x, top, hero.z] };
    case 'rain':
      return { init: { size: S, top: S * 1.05 } };
    default:
      return { init: { size: S, center: [hero.x, 0, hero.z], radius: S * 0.3 } };
  }
}

/** Positions, yaw, size and anim parameters for `c` copies with anim `anim`. */
export function countLayout(anim: AnimId, c: number, S: number, hero: HeroBox, p: { dim: [number, number, number] }, scale = 1) {
  const pos: [number, number, number][] = [];
  const yaw: number[] = [];
  const [wN, hN] = p.dim;
  let size = (c <= 6 ? 0.15 : 0.115) * S * scale;
  const init: AnimInit = { size: S };
  const top = hero.y + hero.h;
  switch (anim) {
    case 'juggle': {
      const cy = top * 0.85;
      size = (c <= 3 ? 0.13 : c <= 6 ? 0.1 : 0.08) * S * scale;
      Object.assign(init, { center: [hero.x, cy, hero.z + 0.05 * S], arcW: Math.max(hero.w * 1.5, 0.56 * S), arcH: 0.3 * S });
      for (let i = 0; i < c; i++) { pos.push([hero.x, cy, hero.z]); yaw.push(0); }
      break;
    }
    case 'orbit': {
      size = Math.min(size, 0.14 * S * scale);
      const R = Math.max(hero.w, hero.d) * 0.5 + wN * size * 0.8;
      Object.assign(init, { center: [hero.x, 0, hero.z], radius: R });
      for (let i = 0; i < c; i++) { pos.push([hero.x + R, top * 0.4, hero.z]); yaw.push(0); }
      break;
    }
    case 'fly': {
      size = Math.min(size, 0.13 * S * scale);
      const R = Math.max(hero.w, hero.d) * 0.5 + wN * size * 0.6;
      Object.assign(init, { center: [hero.x, 0, hero.z], radius: R });
      for (let i = 0; i < c; i++) { pos.push([hero.x + R, top * 0.35, hero.z]); yaw.push(0); }
      break;
    }
    case 'stack': {
      size = Math.min(0.2 * S * scale, (0.8 * S) / Math.max(1e-3, c * hN));
      Object.assign(init, { stackH: hN * size * 0.97 });
      const x = hero.x + hero.w / 2 + wN * size * 0.55 + 0.02 * S;
      for (let i = 0; i < c; i++) { pos.push([x, 0, hero.z + 0.05 * S]); yaw.push(-0.3); }
      break;
    }
    case 'rain': {
      size = Math.min(size, 0.13 * S * scale);
      Object.assign(init, { top: S * 1.02 });
      for (let i = 0; i < c; i++) {
        const r = 0.42 * S * Math.sqrt((i + 0.5) / c);
        const a = i * 2.39996 + 0.5;
        pos.push([hero.x + Math.cos(a) * r, 0, hero.z + Math.sin(a) * r * 0.8 + 0.03 * S]);
        yaw.push(a);
      }
      break;
    }
    default: {
      const R = Math.max(hero.w, hero.d) * 0.5 + wN * size * 0.65;
      const spread = Math.min(2.6, 0.55 * c);
      for (let i = 0; i < c; i++) {
        const a = c === 1 ? 0.6 : -spread / 2 + (spread * i) / (c - 1);
        pos.push([hero.x + Math.sin(a) * R, 0, hero.z + Math.cos(a) * R * 0.85]);
        yaw.push(a * 0.5);
      }
      Object.assign(init, { center: [hero.x, 0, hero.z], radius: R });
    }
  }
  return { pos, yaw, size, init };
}
