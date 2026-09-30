import * as THREE from 'three';
import type { World } from '@iwsdk/core';
import type { AnswerMode, Grade, Notion, Palace, PalaceProgress, Placement } from '../core/types';
import { applyReview, newReview } from '../core/srs';
import { assignOrder } from '../core/route';
import { matchAnswer, pickFromTranscript, voiceGrammar } from '../core/matching';
import { XR, updateHead, inFrontOfHead } from './xr/context';
import { Hands, updateHands, type HandState } from './xr/hands';
import { addTarget, clearTargets, getHovered, pinchSelection, pointer, removeTarget, setPinchBlocked, touchedBy, updateTargeting } from './xr/targeting';
import { RoomScanner, rayHitsBox } from './xr/room-scan';
import { RoomManager } from './room/room-manager';
import { PalaceView } from './palace/palace-view';
import { LazyFollow } from './ui/layout';
import { HandFx } from './ui/hand-fx';
import { V } from './visuals';
import type { IBubble, ICaption, IFlame, IHandHint, IPalaceShelf, IPalmMenu, IProofCard, IQRPanel, IQuestionCard, IReticle, ISparkles, FlameMood } from './visuals/api';
import { Token, tickFlows, until, wait, waitFor, tween, easeOutBack, Cancelled } from './flow/runtime';
import { sfx } from './sfx';
import { voice } from './voice/voice';
import type { AppStore } from './state/store';
import { addLociLights } from '../lib3d/lighting';

export interface AskResult {
  correct: boolean;
  grade: Grade;
  mode: AnswerMode;
  chosen?: string;
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

/**
 * The headset application: owns the frame loop, input, the room, the active palace and all
 * shared UI, and exposes high-level verbs (say, ask, present/place…) that flows compose.
 */
export class App {
  readonly scene: THREE.Scene;
  readonly scanner = new RoomScanner();
  readonly room = new RoomManager();
  readonly view: PalaceView;
  readonly follow = new LazyFollow(0.55, 0.1, 22);
  readonly handFx = new HandFx();
  flame!: IFlame;
  sparkles!: ISparkles;
  card!: IQuestionCard;
  bubbles: IBubble[] = [];
  caption!: ICaption;
  proof!: IProofCard;
  qr!: IQRPanel;
  menu!: IPalmMenu;
  shelf!: IPalaceShelf;
  hint!: IHandHint;
  reticle!: IReticle;
  toast!: ICaption;
  /** The current top-level flow; cancelled when the learner switches palace, imports, or exits. */
  token = new Token();
  sessionStartedAt = 0;
  paused = false;
  private flameLook = new THREE.Vector3();
  /** Where a carried scene will land: a soft golden ring on the object's surface. */
  private landing = (() => {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.085, 0.11, 40),
      new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    );
    m.name = 'landingRing';
    m.visible = false;
    m.renderOrder = 5;
    return m;
  })();
  private landingFrom = new THREE.Vector3(Infinity, 0, 0);
  private menuOpenFor = 0;
  private menuHand: HandState | null = null;
  onMenu: ((id: string) => void) | null = null;
  onExit: (() => void) | null = null;
  /** Whether the palm menu may open (not during critical interactions). */
  menuAllowed = true;
  debug: Record<string, unknown> = {};

  constructor(
    readonly world: World,
    readonly store: AppStore,
  ) {
    this.scene = world.scene;
    this.scene.add(this.room.root, this.follow.anchor, this.handFx.root, this.landing);
    addLociLights(this.scene);
    this.view = new PalaceView(this.room);
    this.room.onChange = () => {
      if (this.room.room) this.store.setRoom(this.room.room);
    };
    this.buildUI();
  }

  private buildUI() {
    this.flame = V.flame();
    this.sparkles = V.sparkles();
    this.card = V.questionCard();
    this.caption = V.caption();
    this.proof = V.proofCard();
    this.qr = V.qrPanel();
    this.menu = V.palmMenu();
    this.shelf = V.palaceShelf();
    this.hint = V.handHint();
    this.reticle = V.reticle();
    this.toast = V.toast();
    this.bubbles = [V.bubble(), V.bubble(), V.bubble()];
    this.scene.add(this.flame.root, this.sparkles.root, this.reticle.root, this.menu.root);
    for (const p of [this.card, this.caption, this.proof, this.qr, this.shelf, this.hint, this.toast, ...this.bubbles]) {
      this.follow.anchor.add(p.root);
      p.setVisible(false, false);
    }
    this.menu.setVisible(false, false);
    this.flame.root.visible = false;
    // Layout in the reading spot (anchor frame: x right, y up, +z towards the learner).
    this.card.root.position.set(0, 0.035, 0);
    this.caption.root.position.set(0, 0.13, 0.02);
    this.proof.root.position.set(0, 0.02, 0);
    this.qr.root.position.set(0, 0.02, 0);
    this.shelf.root.position.set(0, 0, 0.02);
    this.hint.root.position.set(0.16, -0.12, 0.12);
    this.toast.root.position.set(0, 0.12, 0.05);
    this.bubbles.forEach((b, i) => b.root.position.set((i - 1) * 0.12, -0.115, 0.07));
  }

  // ─── Frame loop ────────────────────────────────────────────────────────────
  frame(frame: XRFrame, dt: number, t: number) {
    const ref = this.world.xrReferenceSpace;
    if (!ref) return;
    XR.frame = frame;
    XR.ref = ref;
    XR.session = frame.session;
    XR.dt = dt;
    XR.time = t;
    updateHead(frame, ref);
    updateHands(frame, ref, dt, t);
    this.scanner.update(frame, ref, dt);
    this.room.update(this.scanner, frame, ref, Date.now());
    updateTargeting(dt);
    this.follow.update(dt);
    tickFlows(dt);
    this.updateMenu(dt);
    this.updateExit(dt);

    // Visual updates.
    this.flameLook.copy(XR.head.pos);
    this.flame.update(dt, t, this.flameLook);
    this.view.update(dt, t);
    this.sparkles.update(dt, t);
    for (const p of [this.card, this.caption, this.proof, this.qr, this.shelf, this.hint, this.toast, ...this.bubbles, this.menu]) p.update(dt, t);
    this.updateReticle(dt, t);
    this.handFx.update();
    sfx.engine.setListener(XR.head.pos, XR.head.forward, XR.head.up);
    this.hideSdkInputVisuals(dt);
  }

  private sdkHideTimer = 0;
  /** Passthrough shows the real hands: hide IWSDK's default hand models and pointer rays. */
  private hideSdkInputVisuals(dt: number) {
    this.sdkHideTimer -= dt;
    if (this.sdkHideTimer > 0) return;
    this.sdkHideTimer = 0.5;
    const origin = this.world.player as unknown as THREE.Object3D;
    origin.traverse((o) => {
      if (o === origin || o === this.world.camera || (o as unknown as THREE.Camera).isCamera) return;
      if ((o as THREE.Mesh).isMesh || (o as THREE.Line).isLine || (o as THREE.Points).isPoints || (o as THREE.Sprite).isSprite) o.visible = false;
    });
  }

  private updateReticle(dt: number, t: number) {
    const h = getHovered();
    const show = pointer.source === 'head' && XR.head.valid;
    this.reticle.root.visible = show;
    if (show) {
      if (h) h.center(_v);
      else _v.copy(pointer.origin).addScaledVector(pointer.dir, 0.9);
      const d = _v.distanceTo(XR.head.pos);
      this.reticle.root.position.copy(XR.head.pos).addScaledVector(pointer.dir, Math.min(d, 1.2));
      this.reticle.root.quaternion.copy(XR.head.quat);
      this.reticle.root.scale.setScalar(Math.min(d, 1.2));
      this.reticle.setActive(!!h);
    }
    this.reticle.update(dt, t);
  }

  // ─── Flame verbs ───────────────────────────────────────────────────────────
  say(words: string | null, mood?: FlameMood, seconds = 2.8) {
    if (mood) this.flame.setMood(mood);
    this.flame.say(words, seconds);
    if (words) sfx.flame(words, mood === 'sleepy' ? 'sleepy' : mood === 'celebrate' || mood === 'happy' ? 'happy' : mood === 'think' ? 'curious' : 'proud');
  }

  /** Home spot of the flame: a little to the right of the reading spot, at eye level. */
  flameHome(out = new THREE.Vector3()) {
    return inFrontOfHead(0.5, 0.02, 0.2, out);
  }

  async flameTo(p: THREE.Vector3, sec = 1.2) {
    let done = false;
    this.flame.glideTo(p, sec, () => (done = true));
    await until(() => done || !this.flame.isGliding, this.token);
  }

  // ─── Panels ────────────────────────────────────────────────────────────────
  hideAllPanels() {
    for (const p of [this.card, this.caption, this.proof, this.qr, this.shelf, this.hint, this.toast, ...this.bubbles]) p.setVisible(false, true);
    for (const k of ['bubble', 'shelf', 'item', 'flame']) clearTargets(k);
    this.reticle.setProgress(null);
  }

  // ─── Asking a question (active recall) ────────────────────────────────────
  /**
   * Show the question for `notion` and resolve when the learner answers by:
   *  - pinching one of three bubbles (direct touch or gaze + pinch),
   *  - saying the answer (on-device voice, grammar-constrained),
   *  - or turning the palm up to reveal, then self-grading.
   */
  async ask(notion: Notion, opts: { sub?: string; token?: Token } = {}): Promise<AskResult> {
    const token = opts.token ?? this.token;
    this.follow.snap();
    this.card.setQuestion(notion.question, opts.sub);
    this.card.setAnswer(null);
    this.card.setVisible(true, true);
    const options = shuffle([notion.answer, ...notion.distractors], hashCode(notion.id + Date.now().toString().slice(0, -5)));
    this.debug.options = options;
    this.debug.notion = { id: notion.id, answer: notion.answer };
    this.bubbles.forEach((b, i) => {
      b.setText(options[i]);
      b.setState('idle');
      b.setVisible(true, true);
    });
    const ids = this.bubbles.map((b, i) => {
      const id = `bubble-${i}`;
      addTarget({
        id,
        kind: 'bubble',
        enabled: () => b.root.visible,
        center: (out) => b.root.getWorldPosition(out),
        radius: b.radius * 1.15,
        priority: 3,
        touchRadius: b.radius * 1.3,
      });
      return id;
    });
    this.menuAllowed = false;
    let voiceText = '';
    try {
      if (voice.available && this.store.data.settings.voice !== false) {
        voice.listen(voiceGrammar([notion]), (text) => (voiceText = text));
        this.flame.setMood('listen');
      }
      // The reveal only arms once no palm is up, so a palm already turned up can't skip the question.
      let revealArmed = !Hands.any((hh) => hh.palmUp);
      let result = await waitFor<AskResult>(() => {
        const h = getHovered();
        this.bubbles.forEach((b, i) => b.setState(h?.id === ids[i] ? 'hover' : 'idle'));
        const sel = pinchSelection();
        if (sel?.target?.kind === 'bubble') {
          const chosen = options[ids.indexOf(sel.target.id)];
          const correct = chosen === notion.answer;
          return { correct, grade: correct ? 'good' : 'again', mode: 'bubble', chosen } as AskResult;
        }
        if (voiceText) {
          const said = voiceText;
          voiceText = '';
          const pick = pickFromTranscript(said, notion);
          const m = matchAnswer(said, notion);
          if (m.correct || pick?.index === 0) return { correct: true, grade: 'good', mode: 'voice', chosen: notion.answer } as AskResult;
          if (pick) return { correct: false, grade: 'again', mode: 'voice', chosen: notion.distractors[pick.index - 1] } as AskResult;
        }
        if (!Hands.any((hh) => hh.palmUp)) revealArmed = true;
        if (revealArmed && Hands.any((hh) => hh.palmUpTime > 0.45)) return { correct: false, grade: 'again', mode: 'reveal' } as AskResult;
        return null;
      }, token);
      voice.stop();
      if (!result) throw new Cancelled();

      if (result.mode === 'reveal') {
        sfx.play('reveal');
        this.card.setAnswer(notion.answer);
        this.say('Knew it?', 'think', 4);
        this.bubbles[0].setText('I knew it');
        this.bubbles[2].setText('Not yet');
        this.bubbles[1].setVisible(false, true);
        this.bubbles[0].setState('idle');
        this.bubbles[2].setState('idle');
        const graded = await waitFor<'y' | 'n'>(() => {
          const h = getHovered();
          this.bubbles[0].setState(h?.id === ids[0] ? 'hover' : 'idle');
          this.bubbles[2].setState(h?.id === ids[2] ? 'hover' : 'idle');
          const sel = pinchSelection();
          if (sel?.target?.id === ids[0]) return 'y';
          if (sel?.target?.id === ids[2]) return 'n';
          return null;
        }, token);
        const knew = graded === 'y';
        result = { correct: knew, grade: knew ? 'good' : 'again', mode: 'reveal' };
        this.bubbles[knew ? 0 : 2].setState(knew ? 'correct' : 'dim');
      } else {
        const i = options.indexOf(result.chosen ?? '');
        const ci = options.indexOf(notion.answer);
        this.bubbles.forEach((b, j) => b.setState(j === ci ? 'correct' : j === i ? 'wrong' : 'dim'));
        this.card.setAnswer(notion.answer, result.correct);
      }
      return result;
    } finally {
      // Runs on success AND on cancellation (menu switch, exit, session end).
      voice.stop();
      for (const id of ids) removeTarget(id);
      this.menuAllowed = true;
      this.debug.options = null;
      this.debug.notion = null;
    }
  }

  /**
   * A choice between 2–3 short options shown as answer bubbles (gaze + pinch or touch).
   * Resolves with the chosen index, or null after `timeoutSec`.
   */
  async choose(labels: string[], opts: { timeoutSec?: number } = {}): Promise<number | null> {
    const token = this.token;
    const slots = labels.length === 2 ? [0, 2] : [0, 1, 2];
    this.follow.snap();
    const ids: string[] = [];
    this.bubbles.forEach((b, i) => {
      const k = slots.indexOf(i);
      if (k < 0) return b.setVisible(false, false);
      b.setText(labels[k]);
      b.setState('idle');
      b.setVisible(true, true);
      const id = `choice-${i}`;
      ids[k] = id;
      addTarget({ id, kind: 'bubble', enabled: () => b.root.visible, center: (o) => b.root.getWorldPosition(o), radius: b.radius * 1.2, priority: 3, touchRadius: b.radius * 1.3 });
    });
    try {
      return await waitFor<number>(() => {
        const h = getHovered();
        slots.forEach((i, k) => this.bubbles[i].setState(h?.id === ids[k] ? 'hover' : 'idle'));
        const sel = pinchSelection();
        const k = sel?.target ? ids.indexOf(sel.target.id) : -1;
        return k >= 0 ? k + 1 : null; // +1 so index 0 is truthy
      }, token, opts.timeoutSec).then((v) => (v === null ? null : v - 1));
    } finally {
      for (const id of ids) removeTarget(id);
      this.bubbles.forEach((b) => b.setVisible(false, true));
    }
  }

  async dismissQuestion(delay = 0.9) {
    await wait(delay, this.token);
    this.card.setVisible(false, true);
    this.bubbles.forEach((b) => b.setVisible(false, true));
  }

  /** Record a review in the progress and persist. Returns the tier-ups. */
  recordReview(progress: PalaceProgress, palace: Palace, notionId: string, res: AskResult) {
    const now = Date.now();
    const prev = progress.reviews[notionId] ?? newReview(notionId, now);
    progress.reviews[notionId] = applyReview(prev, res.grade, res.mode, now, {
      examDate: palace.examDate,
      tzOffsetMin: -new Date().getTimezoneOffset(),
    });
    progress.lastSessionAt = now;
    this.store.save();
    return this.view.refreshTiers(true);
  }

  // ─── Placing a scene on a real object ─────────────────────────────────────
  /**
   * Present a notion's scene in the learner's hands; they pinch it, look at an object and
   * release — the scene flies onto the object. Resolves with the new placement.
   */
  async place(palace: Palace, progress: PalaceProgress, notion: Notion, opts: { caption?: string; suggest?: string | null } = {}): Promise<Placement> {
    const token = this.token;
    const item = this.view.items.get(notion.id);
    // Temporary holder for the presented scene (not yet on furniture).
    const holder = new THREE.Group();
    this.scene.add(holder);
    const scene = V.scene(notion.scene);
    holder.add(scene.root);
    scene.setAppearance('full');
    inFrontOfHead(0.44, 0.3, 0, holder.position);
    holder.lookAt(XR.head.pos.x, holder.position.y, XR.head.pos.z);
    const rest = holder.position.clone();
    const HELD_SCALE = 0.72; // ≈ 22 cm in the hands, full 30 cm on the object
    holder.scale.setScalar(0.01);
    sfx.play('appear', holder.position);
    await tween(0.5, (u) => holder.scale.setScalar(Math.max(0.01, u * HELD_SCALE)), token, easeOutBack);
    this.follow.snap();
    // Headline card (the answer, big) + the mnemonic ribbon, both above the scene.
    this.card.setQuestion(notion.answer, notion.question.replace(/\?$/, ''));
    this.card.root.position.set(0, 0.17, 0);
    this.card.setVisible(true, true);
    this.caption.setText(notion.scene.caption, notion.scene.hooks);
    this.caption.root.position.set(0, 0.075, 0.02);
    this.caption.setVisible(true, true);
    void opts.caption;
    this.view.setGlobalHalo('glow');
    if (opts.suggest) this.view.setHaloOverride(opts.suggest, 'due');

    this.debug.presenting = notion.id;
    let held: HandState | null = null;
    const grabOffset = new THREE.Vector3();
    let spinT = 0;
    let target: { fid: string; point: THREE.Vector3 } | null = null;
    const furn = () => this.room.furniture().filter((f) => this.room.isSeen(f.id) || f.label === 'manual');
    const m4 = new THREE.Matrix4();
    let placed: Placement | null = null;
    this.menuAllowed = false;
    try {
      await until(() => {
        spinT += XR.dt;
        scene.update(XR.dt, XR.time);
        if (!held) {
          holder.position.lerp(rest, Math.min(1, XR.dt * 6));
          holder.position.y = rest.y + Math.sin(spinT * 2) * 0.008;
          // Any pinch grabs the presented scene (forgiving); prefer the hand nearest to it.
          const h = [Hands.right, Hands.left].find((hh) => hh.pinchStarted);
          if (h) {
            held = h;
            grabOffset.copy(holder.position).sub(h.pinchPoint);
            if (grabOffset.length() > 0.2) grabOffset.setLength(0.06);
            sfx.play('pinch', holder.position);
            this.card.setVisible(false, true);
          }
          return false;
        }
        // Held: follow the pinch smoothly; aim with the gaze.
        const hand: HandState = held;
        _v.copy(hand.pinchPoint).add(grabOffset);
        holder.position.lerp(_v, Math.min(1, XR.dt * 14));
        holder.lookAt(XR.head.pos.x, holder.position.y, XR.head.pos.z);
        let best: { fid: string; d: number } | null = null;
        for (const f of furn()) {
          this.room.furnitureMatrix(f, m4);
          const d = rayHitsBox(pointer.origin, pointer.dir, f.size, m4, 0.06);
          if (d !== null && (!best || d < best.d)) best = { fid: f.id, d };
        }
        const prevFid = target?.fid;
        target = best ? { fid: best.fid, point: pointer.origin.clone().addScaledVector(pointer.dir, best.d) } : null;
        if (prevFid !== target?.fid) {
          if (prevFid) this.view.setHaloOverride(prevFid, prevFid === opts.suggest ? 'due' : null);
          if (target) {
            this.view.setHaloOverride(target.fid, 'active');
            sfx.play('hover', target.point, { gain: 0.5 });
          }
        }
        this.updateLanding(target, progress, notion.id);
        if (!hand.pinching) {
          if (target) return true;
          // Released on nothing: float back to the hands.
          held = null;
          sfx.play('release', holder.position);
          this.card.setVisible(true, true);
        }
        return false;
      }, token);

      this.landing.visible = false;
      this.landingFrom.set(Infinity, 0, 0);
      // Fly onto the object.
      const t0 = target as unknown as { fid: string; point: THREE.Vector3 };
      const f = this.room.getFurniture(t0.fid)!;
      const spot = this.spotOn(f, t0.point, progress, notion.id);
      const from = holder.position.clone();
      const to = this.room.toSession([spot.room.x, spot.room.y, spot.room.z]);
      sfx.play('whoosh', from);
      await tween(0.7, (u) => {
        holder.position.lerpVectors(from, to, u);
        holder.scale.setScalar(HELD_SCALE + (1 - HELD_SCALE) * u);
        holder.position.y += Math.sin(u * Math.PI) * 0.18;
        scene.update(XR.dt, XR.time);
      }, token);
      sfx.play('placeThunk', to);
      const index = palace.notions.indexOf(notion);
      sfx.object(index, to, 'place');
      this.sparkles.emit(to, '#ffd27a', 24, 0.6);

      placed = { notionId: notion.id, furnitureId: f.id, local: spot.local, order: 0, placedAt: Date.now() };
      progress.placements = progress.placements.filter((p) => p.notionId !== notion.id);
      progress.placements.push(placed);
      const room = this.room.room!;
      progress.placements = assignOrder(progress.placements, room.furniture, room.seat, room.seatYaw);
      progress.reviews[notion.id] ??= newReview(notion.id, Date.now());
      this.store.save();
      this.view.addItem(progress.placements.find((p) => p.notionId === notion.id)!);
      this.view.setMode(notion.id, 'idle');
      void item;
      return placed;
    } finally {
      this.landing.visible = false;
      this.debug.presenting = null;
      this.menuAllowed = true;
      scene.dispose();
      holder.removeFromParent();
      this.caption.setVisible(false, true);
      this.card.setVisible(false, true);
      this.card.root.position.set(0, 0.035, 0);
      this.view.setGlobalHalo(null);
      for (const fu of this.room.furniture()) this.view.setHaloOverride(fu.id, null);
    }
  }

  /** Show the landing ring where the carried scene would go (recomputed only when the aim moves). */
  private updateLanding(target: { fid: string; point: THREE.Vector3 } | null, progress: PalaceProgress, notionId: string) {
    if (!target) {
      this.landing.visible = false;
      this.landingFrom.set(Infinity, 0, 0);
      return;
    }
    if (this.landingFrom.distanceTo(target.point) > 0.03) {
      this.landingFrom.copy(target.point);
      const f = this.room.getFurniture(target.fid);
      if (!f) return;
      const spot = this.spotOn(f, target.point, progress, notionId);
      this.room.toSession([spot.room.x, spot.room.y + 0.005, spot.room.z], this.landing.position);
      const wall = f.label === 'wall_art' || f.label === 'window_frame' || f.label === 'door_frame' || f.label === 'screen' || f.label === 'manual';
      if (wall) this.landing.rotation.set(0, f.yaw + this.room.root.rotation.y, 0);
      else this.landing.rotation.set(-Math.PI / 2, 0, 0);
    }
    this.landing.visible = true;
    const k = 1 + Math.sin(XR.time * 6) * 0.06;
    this.landing.scale.setScalar(k);
  }

  /**
   * A free spot for a scene on furniture `f` near `hit` (session frame): on the top face for
   * tables/shelves/beds, in front for wall objects. Avoids other scenes on the same object.
   */
  spotOn(f: import('../core/types').Furniture, hit: THREE.Vector3, progress: PalaceProgress, notionId: string) {
    const inv = this.room.furnitureMatrix(f, new THREE.Matrix4()).invert();
    const local = hit.clone().applyMatrix4(inv);
    const [sx, sy, sz] = f.size;
    const wall = f.label === 'wall_art' || f.label === 'window_frame' || f.label === 'door_frame' || f.label === 'screen' || f.label === 'manual';
    const margin = 0.07;
    if (wall) {
      local.x = THREE.MathUtils.clamp(local.x, -sx / 2 + margin, sx / 2 - margin);
      local.y = THREE.MathUtils.clamp(local.y - 0.12, -sy / 2, sy / 2 - 0.15);
      local.z = sz / 2 + 0.14;
      if (f.label === 'manual') {
        // A lantern is tiny: spread its scenes along the wall, left/right of it, facing the room.
        const n = progress.placements.filter((p) => p.furnitureId === f.id && p.notionId !== notionId).length;
        const slots = [0, -0.26, 0.26, -0.52, 0.52, -0.78, 0.78];
        local.set(slots[n % slots.length], -0.06 - Math.floor(n / slots.length) * 0.3, 0.1);
        const room = new THREE.Vector3(local.x, local.y, local.z).applyMatrix4(new THREE.Matrix4().makeRotationY(f.yaw).setPosition(...f.center));
        return { local: [local.x, local.y, local.z] as [number, number, number], room };
      }
    } else {
      local.x = THREE.MathUtils.clamp(local.x, -sx / 2 + margin, sx / 2 - margin);
      local.z = THREE.MathUtils.clamp(local.z, -sz / 2 + margin, sz / 2 - margin);
      local.y = sy / 2;
    }
    // Keep 22 cm between scenes on the same object.
    const others = progress.placements.filter((p) => p.furnitureId === f.id && p.notionId !== notionId);
    for (let tries = 0; tries < 12; tries++) {
      const clash = others.find((o) => Math.hypot(o.local[0] - local.x, o.local[2] - local.z) < 0.22 && Math.abs(o.local[1] - local.y) < 0.2);
      if (!clash) break;
      const axis = sx >= sz ? 'x' : 'z';
      const dir = tries % 2 === 0 ? 1 : -1;
      const step = 0.23 * Math.ceil((tries + 1) / 2) * dir;
      if (axis === 'x') local.x = THREE.MathUtils.clamp(clash.local[0] + step, -sx / 2 + margin, sx / 2 - margin);
      else local.z = THREE.MathUtils.clamp(clash.local[2] + step, -sz / 2 + margin, sz / 2 - margin);
      if (tries >= 6) local.y += 0.18; // stack upwards if the object is full
    }
    const room = new THREE.Vector3(local.x, local.y, local.z).applyMatrix4(new THREE.Matrix4().makeRotationY(f.yaw).setPosition(...f.center));
    return { local: [local.x, local.y, local.z] as [number, number, number], room };
  }

  // ─── Palm menu & exit ──────────────────────────────────────────────────────
  private updateMenu(dt: number) {
    const h = this.menuAllowed ? Hands.any((hh) => hh.palmToFaceTime > 0.45) : null;
    if (h) {
      if (this.menuOpenFor === 0) {
        setPinchBlocked(true);
        this.menu.setVisible(true, true);
        sfx.play('menuOpen', h.palm);
        for (const b of this.menu.buttons)
          addTarget({ id: `menu-${b.id}`, kind: 'menu', enabled: () => this.menu.root.visible, center: (o) => b.center(o), radius: b.radius, priority: 4, touchRadius: b.radius * 1.2 });
      }
      this.menuHand = h;
      this.menuGrace = 0;
      this.menuOpenFor += dt;
    } else if (this.menuOpenFor > 0) {
      // Grace period: pinching changes the hand pose, the menu must not vanish under the finger.
      this.menuGrace += dt;
      this.menuOpenFor += dt;
      if (this.menuGrace > 0.8 || !this.menuAllowed) this.closeMenu();
    }
    if (this.menuOpenFor > 0 && this.menuHand) {
      _v.copy(this.menuHand.palm).addScaledVector(this.menuHand.palmNormal, 0.07);
      _v.y += 0.06;
      this.menu.root.position.lerp(_v, Math.min(1, dt * 12));
      this.menu.root.lookAt(XR.head.pos);
      const hov = getHovered();
      this.menu.setHover(hov?.kind === 'menu' ? hov.id.slice(5) : null);
      const other = this.menuHand === Hands.left ? Hands.right : Hands.left;
      let chosen: string | null = null;
      // Select with the OTHER hand only: palm-to-face + pinch with the same hand is the
      // Quest system gesture, and pinching bends the palm away anyway.
      if (other.pinchStarted) {
        const t = touchedBy(other) ?? getHovered();
        if (t?.kind === 'menu') chosen = t.id.slice(5);
      }
      // Poke with the other index finger.
      for (const b of this.menu.buttons) {
        if (other.tracked && b.center(_v2).distanceTo(other.indexTip) < b.radius) chosen = b.id;
      }
      if (chosen) {
        this.closeMenu();
        sfx.play('pinch');
        this.onMenu?.(chosen);
      }
    }
  }
  private menuGrace = 0;
  closeMenu() {
    if (this.menuOpenFor === 0) return;
    this.menuOpenFor = 0;
    this.menuGrace = 0;
    setPinchBlocked(false);
    this.menu.setVisible(false, true);
    clearTargets('menu');
    sfx.play('menuClose');
  }

  private exitArmed = true;
  private updateExit(_dt: number) {
    const h = Hands.any((hh) => hh.fistTime > 0.15);
    this.handFx.fistHand = h?.handedness ?? null;
    this.handFx.fistProgress = h ? Math.min(1, (h.fistTime - 0.15) / 0.85) : 0;
    if (h && h.fistTime >= 1.0 && this.exitArmed) {
      this.exitArmed = false;
      this.onExit?.();
    }
    if (!h) this.exitArmed = true;
  }

  /** Cancel the current top-level flow and start a new token. */
  newToken() {
    this.token.cancel('switch');
    this.token = new Token();
    return this.token;
  }
}

export function shuffle<T>(arr: T[], seed: number): T[] {
  const a = arr.slice();
  let s = seed >>> 0 || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function hashCode(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
