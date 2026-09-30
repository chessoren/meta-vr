/**
 * Visual QA page for the procedural library.
 *   /gallery/                       → every model in a labelled grid (front 3/4 view)
 *   /gallery/?id=kangaroo           → one model from front, side, back, top + stats
 *   /gallery/?cat=animal            → one category
 *   /gallery/?t=1.3                 → freeze animation time (deterministic screenshots)
 *   /gallery/?recipe=<json>         → a composed SceneRecipe from 4 angles (+ the 30 cm cube)
 *   /gallery/?anims=kangaroo        → that model in every AnimId at time t
 *   extra: &k=2 (intensity), &mode=pale|gold (appearance), &cube=0 (hide cube), &label=TEXT
 * window.__galleryReady is set to true once the frame is rendered.
 */
import * as THREE from 'three';
import type { AnimId, SceneRecipe } from '../core/types';
import { CATALOG, getModel } from './catalog';
import { normalize, stats, type Appearance } from './kit';
import { addLociLights } from './lighting';
import { ANIM_IDS, resetJoints } from './anims';
import { composeScene, type ComposedScene } from './compose';

const q = new URLSearchParams(location.search);
const W = innerWidth;
const H = innerHeight;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H);
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setScissorTest(true);
document.body.appendChild(renderer.domElement);
const hud = document.getElementById('hud')!;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#3a2a1e');
addLociLights(scene);
const floor = new THREE.Mesh(new THREE.CircleGeometry(0.3, 32), new THREE.MeshLambertMaterial({ color: '#6b4a33' }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.0005;
scene.add(floor);
const tFixed = q.has('t') ? Number(q.get('t')) : null;
const K = q.has('k') ? Number(q.get('k')) : 1;
const mode = (q.get('mode') as Appearance | null) ?? 'full';

const cube = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(0.3, 0.3, 0.3).translate(0, 0.15, 0)),
  new THREE.LineBasicMaterial({ color: '#f6e7c8', transparent: true, opacity: 0.22 }),
);

interface Cell { root: THREE.Object3D; tick?: (t: number) => void; cam: THREE.PerspectiveCamera; label: string; cube?: boolean }
const cells: Cell[] = [];

function cam(dir: THREE.Vector3, aspect: number, dist = 0.7) {
  const c = new THREE.PerspectiveCamera(35, aspect, 0.01, 10);
  c.position.copy(dir.normalize().multiplyScalar(dist)).add(new THREE.Vector3(0, 0.15, 0));
  c.lookAt(0, 0.145, 0);
  return c;
}
function gridOf(n: number) {
  const cols = Math.ceil(Math.sqrt(n * (W / H)));
  return { cols, rows: Math.ceil(n / cols) };
}
const VIEWS: [string, THREE.Vector3][] = [
  ['front 3/4', new THREE.Vector3(0.6, 0.35, 1)],
  ['side', new THREE.Vector3(1, 0.15, 0)],
  ['back', new THREE.Vector3(-0.4, 0.3, -1)],
  ['top', new THREE.Vector3(0.01, 1, 0.2)],
];
const SCENE_VIEWS: [string, THREE.Vector3][] = [
  ['learner view', new THREE.Vector3(0.05, 0.42, 1)],
  ['3/4 right', new THREE.Vector3(0.85, 0.35, 0.75)],
  ['3/4 left', new THREE.Vector3(-0.9, 0.3, 0.6)],
  ['top', new THREE.Vector3(0.01, 1, 0.3)],
];

const one = q.get('id');
const recipeParam = q.get('recipe');
const animsOf = q.get('anims');
const lines: string[] = [];
let grid = { cols: 2, rows: 2 };
const composed: ComposedScene[] = [];

function modelCell(id: string, view: THREE.Vector3, aspect: number, label: string): Cell {
  const spec = getModel(id)!;
  const root = normalize(spec.build({ label: q.get('label') ?? (one ? 'LOCI 1914' : 'LOCI') }));
  return { root, cam: cam(view, aspect), label, tick: (t) => { resetJoints(root); spec.idle?.(root, t, K); } };
}

if (recipeParam) {
  let recipe: SceneRecipe;
  try {
    recipe = JSON.parse(recipeParam) as SceneRecipe;
  } catch {
    recipe = { actors: [{ model: 'gift', role: 'hero', anim: 'idle' }], caption: 'invalid recipe JSON' };
  }
  for (const [label, d] of SCENE_VIEWS) {
    const cs = composeScene(recipe);
    cs.setIntensity(K);
    cs.setAppearance(mode);
    composed.push(cs);
    cells.push({ root: cs.root, cam: cam(d, W / 2 / (H / 2), 0.78), label, tick: (t) => cs.update(0, t), cube: q.get('cube') !== '0' });
  }
  const cs = composed[0];
  const b = cs.bounds;
  lines.push(
    `“${recipe.caption ?? ''}”  relation=${cs.relation}  k=${K}`,
    `actors: ${recipe.actors.map((a) => `${a.model}(${a.role}${a.count ? '×' + a.count : ''}, ${a.anim})`).join(' + ')}`,
    `tris=${cs.stats.tris} meshes=${cs.stats.meshes}  bounds x[${b.min.x.toFixed(3)}, ${b.max.x.toFixed(3)}] y[${b.min.y.toFixed(3)}, ${b.max.y.toFixed(3)}] z[${b.min.z.toFixed(3)}, ${b.max.z.toFixed(3)}]`,
  );
} else if (animsOf) {
  if (!getModel(animsOf)) lines.push(`unknown id ${animsOf} — showing fallback`);
  grid = gridOf(ANIM_IDS.length);
  const aspect = W / grid.cols / (H / grid.rows);
  for (const anim of ANIM_IDS) {
    const actors: SceneRecipe['actors'] = [{ model: animsOf, role: 'hero', anim: anim as AnimId }];
    const cs = composeScene({ actors, caption: anim });
    cs.setIntensity(K);
    cs.setAppearance(mode);
    composed.push(cs);
    cells.push({ root: cs.root, cam: cam(new THREE.Vector3(0.35, 0.4, 1), aspect, 0.82), label: anim, tick: (t) => cs.update(0, t), cube: true });
  }
  lines.push(`${animsOf} in every anim  t=${tFixed ?? 'live'}  k=${K}`);
} else if (one) {
  const spec = getModel(one);
  if (!spec) throw new Error(`unknown id ${one}`);
  for (const [label, d] of VIEWS) cells.push(modelCell(one, d, W / 2 / (H / 2), label));
  const s = stats(cells[0].root);
  lines.push(`${spec.id} — ${spec.name} [${spec.category}]  tris=${s.tris} meshes=${s.meshes}`, `tags: ${spec.tags.join(', ')}`, `sounds: ${spec.soundsLike.join(', ')}`, `anims: ${spec.anims.join(', ')}`);
} else {
  const cat = q.get('cat');
  const list = CATALOG.filter((s) => !cat || s.category === cat);
  grid = gridOf(list.length);
  const aspect = W / grid.cols / (H / grid.rows);
  let totalTris = 0;
  for (const spec of list) {
    const c = modelCell(spec.id, new THREE.Vector3(0.6, 0.35, 1), aspect, spec.id);
    totalTris += stats(c.root).tris;
    cells.push(c);
  }
  lines.push(`${list.length} models  avg tris=${Math.round(totalTris / Math.max(1, list.length))}`);
}
hud.textContent = lines.join('\n');

{
  const cw = W / grid.cols;
  const ch = H / grid.rows;
  cells.forEach((c, i) => {
    const d = document.createElement('div');
    d.textContent = c.label;
    d.style.cssText = `position:fixed;left:${(i % grid.cols) * cw}px;top:${(Math.floor(i / grid.cols) + 1) * ch - 22}px;width:${cw}px;text-align:center;font:600 13px system-ui;color:#f6e7c8;opacity:.85;pointer-events:none`;
    document.body.appendChild(d);
  });
}

function frame(ms: number) {
  const t = tFixed ?? ms / 1000;
  const cw = W / grid.cols;
  const ch = H / grid.rows;
  cells.forEach((c, i) => {
    const x = (i % grid.cols) * cw;
    const y = H - (Math.floor(i / grid.cols) + 1) * ch;
    renderer.setViewport(x, y, cw, ch);
    renderer.setScissor(x, y, cw, ch);
    c.tick?.(t);
    scene.add(c.root);
    if (c.cube) scene.add(cube);
    renderer.render(scene, c.cam);
    scene.remove(c.root, cube);
  });
  (window as unknown as { __galleryReady: boolean }).__galleryReady = true;
  if (tFixed === null) requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
