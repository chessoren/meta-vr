/**
 * Minimal stand-ins for the art modules, used until (or if) the real ones are unavailable.
 * They implement the same interfaces so the whole flow can be exercised in tests.
 */
import * as THREE from 'three';
import type { SceneRecipe, Tier } from '../../core/types';
import { textPlane } from '../../lib3d/kit';
import type {
  BubbleState,
  FlameMood,
  HaloState,
  HintKind,
  IBubble,
  ICaption,
  IFlame,
  IHalo,
  IHandHint,
  IMenuButton,
  IPalaceShelf,
  IPalmMenu,
  IProofCard,
  IQRPanel,
  IQuestionCard,
  IReticle,
  IScene,
  ISparkles,
  ITrophy,
  ShelfBook,
  VisualFactory,
  Appearance,
} from './api';

abstract class Panel {
  root = new THREE.Group();
  setVisible(v: boolean) {
    this.root.visible = v;
  }
  update(_dt: number, _t: number) {}
  dispose() {
    this.root.removeFromParent();
  }
}

function replaceText(g: THREE.Group, text: string, opts: Parameters<typeof textPlane>[1] = {}) {
  for (const c of [...g.children]) if (c.name === 'text') g.remove(c);
  const t = textPlane(text || ' ', { bg: '#f1dfb8', lineHeight: 0.028, ...opts });
  g.add(t);
  return t;
}

class PFlame implements IFlame {
  root = new THREE.Group();
  private body: THREE.Mesh;
  private bubble = new THREE.Group();
  private target: THREE.Vector3 | null = null;
  private from = new THREE.Vector3();
  private dur = 1;
  private tt = 0;
  private done?: () => void;
  private sayLeft = 0;
  private bounceT = 0;
  constructor() {
    this.body = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.07, 10), new THREE.MeshBasicMaterial({ color: '#ffb347' }));
    this.root.add(this.body, this.bubble);
    this.bubble.position.y = 0.08;
  }
  get isGliding() {
    return !!this.target;
  }
  update(dt: number, t: number) {
    this.body.position.y = Math.sin(t * 2) * 0.006 + (this.bounceT > 0 ? Math.sin(this.bounceT * 12) * 0.02 : 0);
    this.bounceT = Math.max(0, this.bounceT - dt);
    if (this.target) {
      this.tt += dt;
      const u = Math.min(1, this.tt / this.dur);
      this.root.position.lerpVectors(this.from, this.target, u * u * (3 - 2 * u));
      this.root.position.y += Math.sin(u * Math.PI) * 0.1;
      if (u >= 1) {
        this.target = null;
        this.done?.();
      }
    }
    if (this.sayLeft > 0) {
      this.sayLeft -= dt;
      if (this.sayLeft <= 0) this.bubble.clear();
    }
  }
  setMood(_m: FlameMood) {}
  pointAt() {}
  say(text: string | null, seconds = 2.5) {
    this.bubble.clear();
    if (!text) return;
    replaceText(this.bubble, text, { lineHeight: 0.022 });
    this.sayLeft = seconds;
  }
  bounce() {
    this.bounceT = 0.5;
  }
  glideTo(p: THREE.Vector3, seconds: number, onDone?: () => void) {
    this.from.copy(this.root.position);
    this.target = p.clone();
    this.dur = seconds;
    this.tt = 0;
    this.done = onDone;
  }
  setScale(s: number) {
    this.root.scale.setScalar(s);
  }
  dispose() {
    this.root.removeFromParent();
  }
}

class PHalo implements IHalo {
  root = new THREE.Group();
  private box: THREE.LineSegments;
  constructor(size: THREE.Vector3) {
    this.box = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y, size.z)),
      new THREE.LineBasicMaterial({ color: '#e9b949', transparent: true }),
    );
    this.root.add(this.box);
  }
  setState(s: HaloState) {
    this.box.visible = s !== 'off';
    const m = this.box.material as THREE.LineBasicMaterial;
    m.opacity = s === 'active' ? 1 : s === 'due' ? 0.8 : s === 'ember' ? 0.15 : 0.45;
  }
  update() {}
  dispose() {
    this.root.removeFromParent();
  }
}

class PTrophy implements ITrophy {
  root = new THREE.Group();
  private m = new THREE.Mesh(new THREE.OctahedronGeometry(0.02), new THREE.MeshLambertMaterial({ color: '#5fa45a' }));
  constructor() {
    this.root.add(this.m);
    this.m.visible = false;
  }
  setTier(t: Tier) {
    this.m.visible = t === 'solid' || t === 'anchored';
    (this.m.material as THREE.MeshLambertMaterial).color.set(t === 'anchored' ? '#e9b949' : '#5fa45a');
  }
  update() {}
  dispose() {
    this.root.removeFromParent();
  }
}

class PScene implements IScene {
  root = new THREE.Group();
  private k = 1;
  constructor(recipe: SceneRecipe) {
    const cube = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), new THREE.MeshLambertMaterial({ color: recipe.accent ?? '#ef8a3a' }));
    cube.position.y = 0.06;
    cube.name = 'cube';
    this.root.add(cube);
    const t = textPlane(recipe.actors.map((a) => a.model).join(' + '), { fg: '#fff', lineHeight: 0.02 });
    t.position.set(0, 0.16, 0);
    this.root.add(t);
  }
  update(_dt: number, t: number) {
    const c = this.root.getObjectByName('cube');
    if (c) c.rotation.y = t * this.k;
  }
  setIntensity(k: number) {
    this.k = k;
  }
  setAppearance(mode: Appearance) {
    this.root.visible = mode !== 'hidden';
  }
  dispose() {
    this.root.removeFromParent();
  }
}

class PSparkles implements ISparkles {
  root = new THREE.Group();
  emit() {}
  trail() {}
  update() {}
}

class PQuestion extends Panel implements IQuestionCard {
  private q = '';
  setQuestion(text: string, sub?: string) {
    this.q = text;
    replaceText(this.root, sub ? `${text}\n${sub}` : text);
  }
  setAnswer(text: string | null) {
    replaceText(this.root, text ? `${this.q}\n→ ${text}` : this.q);
  }
}

class PBubble extends Panel implements IBubble {
  readonly radius = 0.045;
  private sphere = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), new THREE.MeshBasicMaterial({ color: '#9fd3ff', transparent: true, opacity: 0.35 }));
  constructor() {
    super();
    this.root.add(this.sphere);
  }
  setText(text: string) {
    const t = replaceText(this.root, text, { bg: null, fg: '#ffffff', lineHeight: 0.018 });
    t.position.z = 0.046;
  }
  setState(s: BubbleState) {
    const c = s === 'correct' ? '#7ee081' : s === 'wrong' ? '#ff9f8f' : s === 'hover' ? '#ffe39a' : '#9fd3ff';
    (this.sphere.material as THREE.MeshBasicMaterial).color.set(c);
  }
  containsPoint(p: THREE.Vector3) {
    return this.root.getWorldPosition(new THREE.Vector3()).distanceTo(p) < this.radius * 1.2;
  }
}

class PCaption extends Panel implements ICaption {
  setText(text: string) {
    replaceText(this.root, text, { bg: '#2b1d14', fg: '#f6e7c8', lineHeight: 0.022 });
  }
}

class PProof extends Panel implements IProofCard {
  setContent(big: string, line: string, sub?: string) {
    replaceText(this.root, [big, line, sub].filter(Boolean).join('\n'), { lineHeight: 0.035 });
  }
}

class PQR extends Panel implements IQRPanel {
  setSlot(url: string, code: string) {
    replaceText(this.root, `${code}\n${url}`, { lineHeight: 0.03 });
  }
  setState() {}
}

class PMenu extends Panel implements IPalmMenu {
  readonly buttons: IMenuButton[];
  constructor(ids: string[]) {
    super();
    this.buttons = ids.map((id, i) => {
      const g = new THREE.Group();
      g.position.set((i - (ids.length - 1) / 2) * 0.06, 0, 0);
      g.add(textPlane(id, { bg: '#f1dfb8', lineHeight: 0.014 }));
      this.root.add(g);
      return { id, radius: 0.025, center: (out: THREE.Vector3) => g.getWorldPosition(out) };
    });
  }
  setHover() {}
  setToggle() {}
}

class PShelf extends Panel implements IPalaceShelf {
  buttons: IMenuButton[] = [];
  setBooks(books: ShelfBook[]) {
    this.root.clear();
    this.buttons = books.map((b, i) => {
      const g = new THREE.Group();
      g.position.set((i - (books.length - 1) / 2) * 0.11, 0, 0);
      g.add(textPlane(`${b.title}\n${b.solid}/${b.total}`, { bg: '#f1dfb8', lineHeight: 0.014, maxWidthPx: 400 }));
      this.root.add(g);
      return { id: b.id, radius: 0.05, center: (out: THREE.Vector3) => g.getWorldPosition(out) };
    });
  }
  setHover() {}
}

class PHint extends Panel implements IHandHint {
  setKind(k: HintKind) {
    replaceText(this.root, k, { lineHeight: 0.02 });
  }
}

class PReticle implements IReticle {
  root = new THREE.Mesh(new THREE.RingGeometry(0.004, 0.006, 16), new THREE.MeshBasicMaterial({ color: '#fff', depthTest: false, transparent: true, opacity: 0.6 }));
  setProgress() {}
  setActive() {}
  update() {}
}

export const placeholderVisuals: VisualFactory = {
  flame: () => new PFlame(),
  halo: (s) => new PHalo(s),
  trophy: () => new PTrophy(),
  scene: (r) => new PScene(r),
  sparkles: () => new PSparkles(),
  questionCard: () => new PQuestion(),
  bubble: () => new PBubble(),
  caption: () => new PCaption(),
  proofCard: () => new PProof(),
  qrPanel: () => new PQR(),
  palmMenu: () => new PMenu(['palaces', 'import', 'sound', 'exit']),
  palaceShelf: () => new PShelf(),
  handHint: () => new PHint(),
  reticle: () => new PReticle(),
  toast: () => new PCaption(),
};
