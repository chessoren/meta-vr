/**
 * FX QA page — /gallery/fx.html
 *   (no params)          overview of every FX element
 *   ?only=<group>        one group: flame | flame-hero | glide | halo | trophy | sparkles | transitions |
 *                        question | bubble | caption | proof | qr | palm | shelf | toast | hand | reticle | ui
 *   ?t=<seconds>         freeze time: the page simulates 0→t at 60 Hz and renders once (deterministic)
 *   ?mood=<m>&say=<txt>  (flame-hero) mood and speech bubble
 *   ?moods=a,b,c         (flame) subset of moods; ≤ 4 → close-ups
 * Sets window.__shotReady = true once rendered.
 */
import * as THREE from 'three';
import { addLociLights } from '../lighting';
import { fxFontsReady, setFxViewer } from './common';
import { Flame, type FlameMood } from '../flame';
import { Sparkles, Motes } from './sparkles';
import { createHalo, type HaloState } from './halo';
import { createTrophy } from './trophy';
import { Transitions } from './transitions';
import { QuestionCard, AnswerBubble, Caption, ProofCard, QRPanel, PalmMenu, PalaceShelf, Toast, SummaryLine, HandHint, Reticle, type BubbleState } from './ui';
import { materials, box as kbox, cyl, sphere, mesh as kmesh } from '../kit';
import type { Tier } from '../../core/types';

const q = new URLSearchParams(location.search);
const tFixed = q.has('t') ? Number(q.get('t')) : null;
const only = q.get('only');

interface Cell {
  label: string;
  sub?: string;
  scene: THREE.Scene;
  cam: THREE.PerspectiveCamera;
  update: (dt: number, t: number) => void;
  span?: number; // columns spanned
}

function cell(label: string, dist: number, target: THREE.Vector3Tuple, update: (dt: number, t: number) => void, objs: THREE.Object3D[], o: { sub?: string; fov?: number; camY?: number; camX?: number; lights?: boolean; span?: number } = {}): Cell {
  const scene = new THREE.Scene();
  if (o.lights !== false) addLociLights(scene);
  for (const ob of objs) scene.add(ob);
  const cam = new THREE.PerspectiveCamera(o.fov ?? 30, 1, 0.01, 20);
  cam.position.set(target[0] + (o.camX ?? 0), target[1] + (o.camY ?? 0), target[2] + dist);
  cam.lookAt(...target);
  scene.add(cam);
  return { label, sub: o.sub, scene, cam, update, span: o.span };
}

// A stand-in piece of furniture: dark translucent box so halos read like on passthrough.
function furniture(size: THREE.Vector3, colorHex = '#5a3d2a') {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(size.x, size.y, size.z),
    new THREE.MeshLambertMaterial({ color: colorHex }),
  );
  return m;
}

// ─────────────────────────────────────────────────────────────────────────────
// Groups
// ─────────────────────────────────────────────────────────────────────────────
const MOODS: FlameMood[] = ['idle', 'happy', 'wave', 'point', 'beckon', 'celebrate', 'think', 'surprised', 'listen', 'sleepy'];
const SAY: Partial<Record<FlameMood, string>> = { wave: 'Hello!', beckon: 'Pinch me', celebrate: '5 / 5!', think: 'Hmm…', listen: 'Say it' };

function flameCell(m: FlameMood, big = false): Cell {
  const f = new Flame({ seed: MOODS.indexOf(m) + 1 });
  f.setMood(m);
  const pt = new THREE.Vector3(0.12, 0.07, 0.05);
  if (m === 'point') f.pointAt(pt);
  const say = big && q.has('say') ? q.get('say') : SAY[m];
  let said = false;
  const c = cell(m, big ? 0.3 : 0.36, [0, big ? 0.045 : 0.03, 0], (dt, t) => {
    if (say && !said && t > 0.4) {
      f.say(say, 1e6);
      said = true;
    }
    f.update(dt, t, c.cam.position);
  }, [f.root], { lights: false });
  return c;
}

function glideCell(): Cell {
  const f = new Flame({ seed: 5 });
  const A = new THREE.Vector3(-0.16, -0.03, 0);
  const B = new THREE.Vector3(0.16, 0.0, -0.05);
  f.root.position.copy(A);
  let toB = true;
  const c = cell('glide + trail', 0.62, [0, 0.03, 0], (dt, t) => {
    if (!f.isGliding && t > 0.2) {
      f.glideTo(toB ? B : A, 1.3);
      toB = !toB;
    }
    f.update(dt, t, c.cam.position);
  }, [f.root], { lights: false, span: 2 });
  return c;
}

const HALO_STATES: HaloState[] = ['scan', 'glow', 'due', 'active', 'ember'];
function haloCells(): Cell[] {
  const out: Cell[] = [];
  const sizes: [string, THREE.Vector3, number][] = [
    ['desk 1.2×0.75×0.6', new THREE.Vector3(1.2, 0.75, 0.6), 2.4],
    ['lamp 0.2×0.45×0.2', new THREE.Vector3(0.2, 0.45, 0.2), 1.2],
    ['bed 2.0×0.5×1.4', new THREE.Vector3(2.0, 0.5, 1.4), 3.6],
  ];
  const states = only === 'halo' ? HALO_STATES : (['due', 'active'] as HaloState[]);
  for (const st of states) {
    const [name, size, dist] = st === 'active' ? sizes[1] : st === 'due' ? sizes[0] : st === 'ember' ? sizes[0] : sizes[st === 'scan' ? 0 : 2];
    const h = createHalo(size);
    const furn = furniture(size);
    const g = new THREE.Group();
    g.add(furn, h.root);
    g.rotation.y = 0.5;
    let set = false;
    out.push(
      cell(`halo · ${st}`, dist, [0, 0, 0], (dt, t) => {
        if (!set) {
          h.setState(st);
          set = true;
        }
        h.update(dt, t);
      }, [g], { sub: name, camY: dist * 0.55 }),
    );
  }
  return out;
}

const TIERS: Tier[] = ['fragile', 'solid', 'anchored'];
function trophyCells(): Cell[] {
  const out: Cell[] = [];
  const seeds = q.has('seed') ? [Number(q.get('seed'))] : [2, 3];
  const tiers = q.has('tier') ? [q.get('tier') as Tier] : TIERS;
  const close = seeds.length * tiers.length <= 2;
  for (const seed of seeds) {
    for (const tier of tiers) {
      const tr = createTrophy(seed);
      const plinth = kmesh([cyl(0.045, 0.048, 0.012, 'woodDark', { pos: [0, -0.006, 0], seg: 20 })]);
      let set = false;
      out.push(
        cell(`${seed % 2 === 0 ? 'plant' : 'crystal'} · ${tier}`, close ? 0.2 : 0.34, [0, 0.045, 0], (dt, t) => {
          if (!set) {
            tr.setTier(tier, true);
            set = true;
          }
          tr.update(dt, t);
        }, [tr.root, plinth], { camY: close ? 0.07 : 0.12 }),
      );
    }
  }
  return out;
}

function sparkleCells(): Cell[] {
  const sp = new Sparkles({ max: 400, seed: 3 });
  const center = new THREE.Vector3(0, 0, 0);
  let next = 0;
  const colors = ['#ffd27a', '#ffb347', '#fff0c0'];
  let ci = 0;
  const a = cell('sparkles · emit', 0.6, [0, 0, 0], (dt, t) => {
    if (t >= next) {
      sp.emit(center, colors[ci++ % 3], 26, 0.4);
      next = t + 0.9;
    }
    sp.update(dt, t);
  }, [sp.root], { lights: false });
  const motes = new Motes({ count: 60, box: new THREE.Vector3(0.5, 0.4, 0.3) });
  const b = cell('motes · golden dust', 0.8, [0, 0, 0], (dt, t) => motes.update(dt, t), [motes.root], { lights: false });
  return [a, b];
}

function transitionCells(): Cell[] {
  const tr = new Transitions();
  const mk = () => {
    const m = kmesh([
      sphere(0.05, 'red', { pos: [0, 0.07, 0] }),
      cyl(0.006, 0.006, 0.03, 'woodDark', { pos: [0, 0.125, 0] }),
      kbox(0.025, 0.004, 0.012, 'green', { pos: [0.014, 0.135, 0], rot: [0, 0, 0.5] }),
    ]);
    const g = new THREE.Group();
    g.add(m);
    return g;
  };
  const inObj = mk();
  const outObj = mk();
  inObj.position.x = -0.12;
  outObj.position.x = 0.12;
  let phase = -1;
  const c = cell('pop in · dissolve out', 0.7, [0, 0.07, 0], (dt, t) => {
    const p = Math.floor(t / 2.4);
    if (p !== phase) {
      phase = p;
      inObj.visible = false;
      tr.popIn(inObj, { delay: 0.1 });
      outObj.visible = true;
      outObj.scale.setScalar(1);
      outObj.position.y = 0;
      tr.dissolveOut(outObj, { delay: 0.3 });
    }
    tr.update(dt, t);
  }, [inObj, outObj, tr.root], { span: 2 });
  void materials;
  return [c];
}

function uiCells(which: string | null): Cell[] {
  const out: Cell[] = [];
  const want = (n: string) => !which || which === 'ui' || which === n;
  if (want('question')) {
    const qc = new QuestionCard();
    qc.setText('What is the capital of Australia?', 'Capitals · 3 of 5');
    qc.setVisible(true, true);
    out.push(cell('QuestionCard', 0.62, [0, 0, 0], (dt, t) => qc.update(dt, t), [qc.root], { lights: false, span: 2 }));
  }
  if (want('bubble')) {
    const states: BubbleState[] = ['idle', 'hover', 'pressed', 'correct', 'wrong'];
    const words = ['Sydney', 'Canberra', 'Melbourne', 'Canberra', 'Perth'];
    const g = new THREE.Group();
    const bs = states.map((s, i) => {
      const b = new AnswerBubble(words[i]);
      b.root.position.x = (i - 2) * 0.1;
      b.setVisible(true, true);
      b.setState(s);
      g.add(b.root);
      return b;
    });
    out.push(cell('AnswerBubble · idle hover pressed correct wrong', 0.7, [0, 0, 0], (dt, t) => bs.forEach((b) => b.update(dt, t)), [g], { lights: false, span: 2 }));
  }
  if (want('caption')) {
    const cp = new Caption();
    cp.setText('A giant KANGAROO bounces on a CAN of BERRIES', ['kangaroo', 'can', 'berries']);
    cp.setVisible(true, true);
    out.push(cell('Caption', 0.6, [0, 0, 0], (dt, t) => cp.update(dt, t), [cp.root], { lights: false, span: 2 }));
  }
  if (want('proof')) {
    const pc = new ProofCard();
    pc.set(5, 5, 'You just learned the way memory champions do.', 'Tonight, import your real course.');
    pc.setVisible(true, true);
    out.push(cell('ProofCard', 0.62, [0, 0, 0], (dt, t) => pc.update(dt, t), [pc.root], { lights: false }));
  }
  if (want('qr')) {
    const panels = (['waiting', 'receiving', 'ready'] as const).map((s, i) => {
      const p = new QRPanel('https://loci.study/KQZM', 'KQZM');
      p.setState(s);
      p.setVisible(true, true);
      p.root.position.x = (i - 1) * 0.3;
      return p;
    });
    const g = new THREE.Group();
    panels.forEach((p) => g.add(p.root));
    out.push(cell('QRPanel · waiting receiving ready', which === 'qr' ? 1.25 : 1.3, [0, 0, 0], (dt, t) => panels.forEach((p) => p.update(dt, t)), [g], { lights: false, span: 2 }));
  }
  if (want('palm')) {
    const pm = new PalmMenu();
    pm.setVisible(true, true);
    pm.setHover('import');
    pm.setToggle('sound', false);
    out.push(cell('PalmMenu (hover: import, sound off)', 0.42, [0, 0.04, 0], (dt, t) => pm.update(dt, t), [pm.root], { lights: false }));
  }
  if (want('shelf')) {
    const sh = new PalaceShelf([
      { id: 'cap', title: 'World Capitals', subject: 'Geography', solid: 5, total: 5 },
      { id: 'ww', title: 'WWI & WWII', subject: 'History', solid: 12, total: 20, examInDays: 9 },
      { id: 'bio', title: 'La cellule', subject: 'Biologie', solid: 3, total: 18, examInDays: 21 },
      { id: 'chem', title: 'Organic Chemistry', subject: 'Chemistry', solid: 0, total: 14, examInDays: 2 },
    ]);
    sh.setVisible(true, true);
    sh.setHover('ww');
    out.push(cell('PalaceShelf (hover: WWI & WWII)', 0.75, [0, 0.1, 0], (dt, t) => sh.update(dt, t), [sh.root], { lights: false }));
  }
  if (want('toast')) {
    const to = new Toast();
    to.show('Saved. See you tomorrow!', 1e6);
    const sl = new SummaryLine();
    sl.setLine('*7* reviewed · *5* solid · *2* to go tomorrow');
    sl.setVisible(true, true);
    to.root.position.y = 0.035;
    sl.root.position.y = -0.035;
    const g = new THREE.Group();
    g.add(to.root, sl.root);
    out.push(cell('Toast · SummaryLine', 0.55, [0, 0, 0], (dt, t) => { to.update(dt, t); sl.update(dt, t); }, [g], { lights: false, span: 2 }));
  }
  if (want('hand')) {
    const gs = (q.get('g')?.split(',') ?? ['pinch', 'palm-up', 'fist']) as ('pinch' | 'palm-up' | 'fist')[];
    const hs = gs.map((gname, i) => {
      const h = new HandHint(gname);
      h.setVisible(true, true);
      h.root.position.x = (i - (gs.length - 1) / 2) * 0.14;
      return h;
    });
    const g = new THREE.Group();
    hs.forEach((h) => g.add(h.root));
    out.push(cell(`HandHint · ${gs.join(' ')}`, gs.length === 1 ? 0.3 : 0.62, [0, 0, 0], (dt, t) => hs.forEach((h) => h.update(dt, t)), [g], { lights: false, span: 2 }));
  }
  if (want('reticle')) {
    const rs = [0, 0.45, 1].map((p, i) => {
      const r = new Reticle();
      r.setVisible(true, false);
      r.setActive(p > 0);
      r.setProgress(p);
      r.root.position.x = (i - 1) * 0.05;
      return r;
    });
    const g = new THREE.Group();
    rs.forEach((r) => g.add(r.root));
    out.push(cell('Reticle · rest dwell 45% done', 0.3, [0, 0, 0], (dt, t) => rs.forEach((r) => r.update(dt, t)), [g], { lights: false }));
  }
  return out;
}

function buildCells(): Cell[] {
  switch (only) {
    case 'flame': {
      const list = (q.get('moods')?.split(',') as FlameMood[] | undefined) ?? MOODS;
      return list.map((m) => flameCell(m, list.length <= 4));
    }
    case 'flame-hero':
      return [flameCell((q.get('mood') as FlameMood) ?? 'idle', true)];
    case 'glide':
      return [glideCell()];
    case 'halo':
      return haloCells();
    case 'trophy':
      return trophyCells();
    case 'sparkles':
      return sparkleCells();
    case 'transitions':
      return transitionCells();
    case null:
    case '':
      return [
        flameCell('wave'),
        flameCell('happy'),
        flameCell('point'),
        flameCell('think'),
        ...haloCells(),
        ...trophyCells().filter((_, i) => i === 1 || i === 2 || i === 4 || i === 5),
        ...sparkleCells(),
        ...uiCells(null),
      ];
    default:
      return uiCells(only);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout + render
// ─────────────────────────────────────────────────────────────────────────────
const W = innerWidth;
const H = innerHeight;
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, premultipliedAlpha: true });
renderer.setSize(W, H);
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x000000, 0);
renderer.setScissorTest(true);
document.body.appendChild(renderer.domElement);

await fxFontsReady();
const cells = buildCells();

// grid: honour spans
const units = cells.reduce((s, c) => s + (c.span ?? 1), 0);
let cols = Math.max(1, Math.round(Math.sqrt(units * (W / H) * 0.9)));
if (cells.length === 1) cols = 1;
if (q.has('cols')) cols = Math.max(1, Number(q.get('cols')));
cols = Math.min(cols, Math.max(...cells.map((c) => c.span ?? 1)) > cols ? Math.max(...cells.map((c) => c.span ?? 1)) : cols);
const rects: { x: number; y: number; w: number; h: number }[] = [];
{
  let cx = 0;
  let row = 0;
  const placed: { c: number; r: number; s: number }[] = [];
  for (const c of cells) {
    const s = Math.min(cols, c.span ?? 1);
    if (cx + s > cols) {
      cx = 0;
      row++;
    }
    placed.push({ c: cx, r: row, s });
    cx += s;
  }
  const rows = row + 1;
  const cw = W / cols;
  const ch = H / rows;
  for (const p of placed) rects.push({ x: p.c * cw, y: p.r * ch, w: p.s * cw, h: ch });
}
cells.forEach((c, i) => {
  const r = rects[i];
  c.cam.aspect = r.w / r.h;
  // keep the subject framed when the cell is wide
  if (c.cam.aspect < 1) c.cam.fov = 2 * THREE.MathUtils.radToDeg(Math.atan(Math.tan(THREE.MathUtils.degToRad(c.cam.fov / 2)) / c.cam.aspect));
  c.cam.updateProjectionMatrix();
  const l = document.createElement('div');
  l.className = 'lbl';
  l.textContent = c.label;
  l.style.left = `${r.x + 10}px`;
  l.style.top = `${r.y + 8}px`;
  document.body.appendChild(l);
  if (c.sub) {
    const s = document.createElement('div');
    s.className = 'sub';
    s.textContent = c.sub;
    s.style.left = `${r.x + 10}px`;
    s.style.top = `${r.y + 26}px`;
    document.body.appendChild(s);
  }
});

function step(dt: number, t: number) {
  for (const c of cells) {
    setFxViewer(c.cam);
    c.update(dt, t);
  }
}
const stats: Record<string, { calls: number; triangles: number }> = {};
function render() {
  cells.forEach((c, i) => {
    const r = rects[i];
    const y = H - r.y - r.h;
    renderer.setViewport(r.x, y, r.w, r.h);
    renderer.setScissor(r.x, y, r.w, r.h);
    renderer.clear();
    renderer.render(c.scene, c.cam);
    stats[c.label] = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  });
}

const w = window as unknown as { __shotReady: boolean; __fxStats: unknown };
if (tFixed !== null) {
  const dt = 1 / 60;
  const n = Math.round(tFixed / dt);
  for (let i = 1; i <= n; i++) step(dt, i * dt);
  if (n === 0) step(0, 0);
  render();
  w.__fxStats = stats;
  w.__shotReady = true;
} else {
  let last = performance.now();
  const t0 = last;
  const loop = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    step(dt, (now - t0) / 1000);
    render();
    w.__shotReady = true;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
