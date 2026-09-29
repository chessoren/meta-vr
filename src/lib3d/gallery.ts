/**
 * Visual QA page for the procedural library.
 *   /gallery/                 → every model in a labelled grid (front 3/4 view)
 *   /gallery/?id=kangaroo     → one model from front, side, back, top + stats
 *   /gallery/?cat=animal      → one category
 *   /gallery/?t=1.3           → freeze animation time (deterministic screenshots)
 *   /gallery/?recipe=<json>   → a composed scene (if compose.ts exists)
 * window.__galleryReady is set to true once the frame is rendered.
 */
import * as THREE from 'three';
import { CATALOG, getModel } from './catalog';
import { normalize, stats, textPlane } from './kit';
import { addLociLights } from './lighting';

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
const tFixed = q.has('t') ? Number(q.get('t')) : null;

interface Cell { root: THREE.Object3D; idle?: (r: THREE.Object3D, t: number, k: number) => void; cam: THREE.PerspectiveCamera; label: string }
const cells: Cell[] = [];

function cam(dir: THREE.Vector3, aspect: number) {
  const c = new THREE.PerspectiveCamera(35, aspect, 0.01, 10);
  c.position.copy(dir.normalize().multiplyScalar(0.62)).add(new THREE.Vector3(0, 0.15, 0));
  c.lookAt(0, 0.13, 0);
  return c;
}

const one = q.get('id');
const lines: string[] = [];
if (one) {
  const spec = getModel(one);
  if (!spec) throw new Error(`unknown id ${one}`);
  const views: [string, THREE.Vector3][] = [
    ['front 3/4', new THREE.Vector3(0.6, 0.35, 1)],
    ['side', new THREE.Vector3(1, 0.15, 0)],
    ['back', new THREE.Vector3(-0.4, 0.3, -1)],
    ['top', new THREE.Vector3(0.01, 1, 0.2)],
  ];
  for (const [label, d] of views) {
    const root = normalize(spec.build({ label: q.get('label') ?? 'LOCI 1914' }));
    cells.push({ root, idle: spec.idle, cam: cam(d, W / 2 / (H / 2)), label });
  }
  const s = stats(cells[0].root);
  lines.push(`${spec.id} — ${spec.name} [${spec.category}]  tris=${s.tris} meshes=${s.meshes}`, `tags: ${spec.tags.join(', ')}`, `sounds: ${spec.soundsLike.join(', ')}`, `anims: ${spec.anims.join(', ')}`);
} else {
  const cat = q.get('cat');
  const list = CATALOG.filter((s) => !cat || s.category === cat);
  const cols = Math.ceil(Math.sqrt(list.length * (W / H)));
  const rows = Math.ceil(list.length / cols);
  const aspect = W / cols / (H / rows);
  let totalTris = 0;
  for (const spec of list) {
    const root = normalize(spec.build({ label: 'LOCI' }));
    totalTris += stats(root).tris;
    cells.push({ root, idle: spec.idle, cam: cam(new THREE.Vector3(0.6, 0.35, 1), aspect), label: spec.id });
  }
  lines.push(`${list.length} models  avg tris=${Math.round(totalTris / Math.max(1, list.length))}`);
}
hud.textContent = lines.join('\n');

const grid = one ? { cols: 2, rows: 2 } : (() => { const cols = Math.ceil(Math.sqrt(cells.length * (W / H))); return { cols, rows: Math.ceil(cells.length / cols) }; })();
const labels = cells.map((c) => { const m = textPlane(c.label, { fg: '#f6e7c8', lineHeight: 0.035, weight: 600 }); m.position.set(0, -0.035, 0.16); return m; });

function frame(ms: number) {
  const t = tFixed ?? ms / 1000;
  const cw = W / grid.cols;
  const ch = H / grid.rows;
  cells.forEach((c, i) => {
    const x = (i % grid.cols) * cw;
    const y = H - (Math.floor(i / grid.cols) + 1) * ch;
    renderer.setViewport(x, y, cw, ch);
    renderer.setScissor(x, y, cw, ch);
    c.idle?.(c.root, t, 1);
    scene.add(c.root, floor, labels[i]);
    labels[i].lookAt(c.cam.position);
    renderer.render(scene, c.cam);
    scene.remove(c.root, labels[i]);
  });
  (window as unknown as { __galleryReady: boolean }).__galleryReady = true;
  if (tFixed === null) requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
