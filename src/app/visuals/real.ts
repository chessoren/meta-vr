/**
 * Adapters from the art modules (src/lib3d) to the app's visual interfaces (./api.ts).
 */
import * as THREE from 'three';
import { Flame } from '../../lib3d/flame';
import { createHalo } from '../../lib3d/fx/halo';
import { createTrophy } from '../../lib3d/fx/trophy';
import { Sparkles } from '../../lib3d/fx/sparkles';
import { QuestionCard, AnswerBubble, Caption, ProofCard, QRPanel, PalmMenu, PalaceShelf, HandHint, Reticle, DEFAULT_PALM_ITEMS } from '../../lib3d/fx/ui';
import { composeScene } from '../../lib3d/compose';
import type {
  VisualFactory,
  IQuestionCard,
  IBubble,
  BubbleState,
  ICaption,
  IProofCard,
  IQRPanel,
  IPalmMenu,
  IMenuButton,
  IPalaceShelf,
  ShelfBook,
  IHandHint,
  HintKind,
  IReticle,
  IFlame,
} from './api';

class QuestionAdapter implements IQuestionCard {
  private card = new QuestionCard('', '');
  root = this.card.root;
  private q = '';
  private sub = '';
  setQuestion(text: string, sub = '') {
    this.q = text;
    this.sub = sub;
    this.card.setText(text, sub);
  }
  setAnswer(text: string | null) {
    // The answer takes the stage; the question becomes the kicker line.
    if (text) this.card.setText(text, this.q.length > 60 ? this.q.slice(0, 57) + '…' : this.q);
    else this.card.setText(this.q, this.sub);
  }
  setVisible(v: boolean, animate = true) {
    this.card.setVisible(v, animate);
  }
  update(dt: number, t: number) {
    this.card.update(dt, t);
  }
  dispose() {
    this.card.dispose();
  }
}

class BubbleAdapter implements IBubble {
  private b = new AnswerBubble('', 0.042);
  root = this.b.root;
  get radius() {
    return this.b.radius;
  }
  setText(text: string) {
    this.b.setText(text);
  }
  setState(s: BubbleState) {
    this.b.setState(s === 'dim' ? 'idle' : s);
    this.root.scale.setScalar(s === 'dim' ? 0.82 : 1);
  }
  containsPoint(p: THREE.Vector3) {
    return this.b.containsPoint(p);
  }
  setVisible(v: boolean, animate = true) {
    this.b.setVisible(v, animate);
  }
  update(dt: number, t: number) {
    this.b.update(dt, t);
  }
  dispose() {
    this.b.dispose();
  }
}

class CaptionAdapter implements ICaption {
  private c = new Caption('', []);
  root = this.c.root;
  setText(text: string, hooks?: string[]) {
    this.c.setText(text, hooks ?? []);
  }
  setVisible(v: boolean, animate = true) {
    this.c.setVisible(v, animate);
  }
  update(dt: number, t: number) {
    this.c.update(dt, t);
  }
  dispose() {
    this.c.dispose();
  }
}

class ProofAdapter implements IProofCard {
  private p = new ProofCard();
  root = this.p.root;
  setContent(big: string, line: string, sub?: string) {
    const m = big.match(/(\d+)\s*\/\s*(\d+)/);
    this.p.set(m ? Number(m[1]) : 0, m ? Number(m[2]) : 0, line, sub ?? '');
  }
  setVisible(v: boolean, animate = true) {
    this.p.setVisible(v, animate);
  }
  update(dt: number, t: number) {
    this.p.update(dt, t);
  }
  dispose() {
    this.p.dispose();
  }
}

class QRAdapter implements IQRPanel {
  private q = new QRPanel('https://loci.app', '····');
  root = this.q.root;
  setSlot(url: string, code: string) {
    this.q.setCode(url, code);
  }
  setState(s: 'waiting' | 'receiving' | 'ready' | 'error') {
    this.q.setState(s === 'error' ? 'waiting' : s);
  }
  setVisible(v: boolean, animate = true) {
    this.q.setVisible(v, animate);
  }
  update(dt: number, t: number) {
    this.q.update(dt, t);
  }
  dispose() {
    this.q.dispose();
  }
}

class PalmAdapter implements IPalmMenu {
  private m = new PalmMenu(DEFAULT_PALM_ITEMS);
  root = this.m.root;
  readonly buttons: IMenuButton[] = DEFAULT_PALM_ITEMS.map((it) => ({
    id: it.id,
    radius: 0.019 * 1.4,
    center: (out: THREE.Vector3) => this.m.buttonCenter(it.id, out),
  }));
  setHover(id: string | null) {
    this.m.setHover(id);
  }
  setToggle(id: string, on: boolean) {
    this.m.setToggle(id, on);
  }
  setVisible(v: boolean, animate = true) {
    this.m.setVisible(v, animate);
  }
  update(dt: number, t: number) {
    this.m.update(dt, t);
  }
  dispose() {
    this.m.dispose();
  }
}

class ShelfAdapter implements IPalaceShelf {
  private s = new PalaceShelf([]);
  root = this.s.root;
  buttons: IMenuButton[] = [];
  setBooks(books: ShelfBook[]) {
    this.s.setBooks(
      books.map((b) => ({
        id: b.id,
        title: b.title,
        subject: b.subject,
        solid: b.solid,
        total: b.total,
        examInDays: b.examLine ? Number(b.examLine.match(/\d+/)?.[0] ?? NaN) : null,
      })),
    );
    const inner = this.s as unknown as { spines: { id: string; x: number; plane: { mesh: THREE.Object3D } }[]; content: THREE.Object3D };
    this.buttons = books.map((b) => ({
      id: b.id,
      radius: 0.045,
      center: (out: THREE.Vector3) => {
        const sp = inner.spines?.find((x) => x.id === b.id);
        if (!sp) return this.root.getWorldPosition(out);
        return inner.content.localToWorld(out.set(sp.x, sp.plane.mesh.position.y, 0));
      },
    }));
  }
  setHover(id: string | null) {
    this.s.setHover(id);
  }
  setVisible(v: boolean, animate = true) {
    this.s.setVisible(v, animate);
  }
  update(dt: number, t: number) {
    this.s.update(dt, t);
  }
  dispose() {
    this.s.dispose();
  }
}

class HintAdapter implements IHandHint {
  private h = new HandHint('pinch', 0.1);
  root = this.h.root;
  setKind(k: HintKind) {
    this.h.setGesture(k === 'palmUp' ? 'palm-up' : k === 'fist' ? 'fist' : 'pinch');
  }
  setVisible(v: boolean, animate = true) {
    this.h.setVisible(v, animate);
  }
  update(dt: number, t: number) {
    this.h.update(dt, t);
  }
  dispose() {
    this.h.dispose();
  }
}

class ReticleAdapter implements IReticle {
  private r = new Reticle(0.018);
  root = this.r.root;
  setProgress(p: number | null) {
    this.r.setProgress(p ?? 0);
  }
  setActive(a: boolean) {
    this.r.setActive(a);
  }
  update(dt: number, t: number) {
    this.r.update(dt, t);
  }
}

export const realVisuals: VisualFactory = {
  flame: () => new Flame({ seed: 7 }) as unknown as IFlame,
  halo: (size) => createHalo(size),
  trophy: (seed) => createTrophy(seed),
  scene: (recipe) => composeScene(recipe),
  sparkles: () => new Sparkles({ max: 600, seed: 3 }),
  questionCard: () => new QuestionAdapter(),
  bubble: () => new BubbleAdapter(),
  caption: () => new CaptionAdapter(),
  proofCard: () => new ProofAdapter(),
  qrPanel: () => new QRAdapter(),
  palmMenu: () => new PalmAdapter(),
  palaceShelf: () => new ShelfAdapter(),
  handHint: () => new HintAdapter(),
  reticle: () => new ReticleAdapter(),
  toast: () => new CaptionAdapter(),
};
