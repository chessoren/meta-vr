import * as THREE from 'three';
import type { Notion, Palace, PalaceProgress, Placement, Tier } from '../../core/types';
import { tierOf } from '../../core/tiers';
import type { RoomManager } from '../room/room-manager';
import { V } from '../visuals';
import type { HaloState, IHalo, IScene, ITrophy } from '../visuals/api';

/**
 * Everything the active palace shows in the room.
 *
 * Per notion (once placed): an anchor group on its furniture (room frame), its mnemonic
 * scene (built lazily), a trophy (plant → crystal → gold) and a small ember.
 * Per furniture: one golden halo whose state is the "strongest" state of its notions.
 *
 * Idle appearance by tier (the room fills up with what you know):
 *   new → full animated scene · fragile → pale ghost of the scene · solid → scene hidden, plant/crystal
 *   · anchored → the scene's hero as a small permanent gold statue.
 * A DUE notion always hides its scene (you must recall it) and shows a warm glow instead.
 */
export type ItemMode = 'idle' | 'hidden' | 'ember' | 'due' | 'active' | 'reveal' | 'replay' | 'held';

export interface Item {
  notion: Notion;
  placement: Placement;
  index: number; // stable index in the palace (object voice)
  anchor: THREE.Group; // child of room.root, positioned at the placement
  scene: IScene | null;
  trophy: ITrophy;
  ember: THREE.Mesh;
  mode: ItemMode;
  tier: Tier;
  modeTime: number;
  /** Last appearance applied to the scene (setAppearance/traverse only run on change). */
  shown: string;
}

const _v = new THREE.Vector3();
const EMBER_GEO = new THREE.SphereGeometry(0.012, 10, 8);
const HALO_RANK: Record<HaloState, number> = { off: 0, ember: 1, glow: 2, scan: 3, due: 4, active: 5 };

export class PalaceView {
  readonly root = new THREE.Group();
  palace: Palace | null = null;
  progress: PalaceProgress | null = null;
  readonly items = new Map<string, Item>();
  private halos = new Map<string, IHalo>();
  /** Hand-placed wall anchors are real objects too: a small floating candle-lantern. */
  private lanterns = new Map<string, IScene>();
  private haloScratch = new Map<string, HaloState>();
  private haloOverride = new Map<string, HaloState>();
  private globalHalo: HaloState | null = null;
  private emberMat = new THREE.MeshBasicMaterial({ color: '#ffcf7a', transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });

  constructor(private room: RoomManager) {
    this.root.name = 'PalaceView';
    room.root.add(this.root);
  }

  load(palace: Palace, progress: PalaceProgress) {
    this.clear();
    this.palace = palace;
    this.progress = progress;
    for (const p of progress.placements) this.addItem(p);
    this.showLanterns();
    this.refreshTiers(false);
  }

  clear() {
    for (const it of this.items.values()) {
      it.scene?.dispose();
      it.trophy.dispose();
      it.anchor.removeFromParent();
    }
    this.items.clear();
    for (const h of this.halos.values()) h.dispose();
    this.halos.clear();
    for (const l of this.lanterns.values()) l.dispose();
    this.lanterns.clear();
    this.haloOverride.clear();
    this.palace = null;
    this.progress = null;
  }

  notion(id: string) {
    return this.palace?.notions.find((n) => n.id === id);
  }

  /** Add (or move) the visual of a placement. */
  addItem(p: Placement): Item | null {
    const notion = this.notion(p.notionId);
    const f = this.room.getFurniture(p.furnitureId);
    if (!notion || !f || !this.palace) return null;
    let it = this.items.get(p.notionId);
    if (!it) {
      const anchor = new THREE.Group();
      anchor.name = `item-${notion.id}`;
      const trophy = V.trophy(this.palace.notions.indexOf(notion) + 7);
      trophy.root.position.set(0.09, 0, 0.04);
      anchor.add(trophy.root);
      const ember = new THREE.Mesh(EMBER_GEO, this.emberMat);
      ember.position.set(0, 0.05, 0);
      anchor.add(ember);
      this.root.add(anchor);
      it = {
        notion,
        placement: p,
        index: this.palace.notions.indexOf(notion),
        anchor,
        scene: null,
        trophy,
        ember,
        mode: 'idle',
        tier: 'new',
        modeTime: 0,
        shown: '',
      };
      this.items.set(notion.id, it);
    }
    it.placement = p;
    // Anchor = furniture frame · local offset (room frame).
    const m = new THREE.Matrix4().makeRotationY(f.yaw).setPosition(f.center[0], f.center[1], f.center[2]);
    it.anchor.position.set(p.local[0], p.local[1], p.local[2]).applyMatrix4(m);
    it.anchor.rotation.set(0, 0, 0);
    this.ensureHalo(p.furnitureId);
    return it;
  }

  sceneOf(it: Item): IScene {
    if (!it.scene) {
      it.scene = V.scene(it.notion.scene);
      it.anchor.add(it.scene.root);
    }
    return it.scene;
  }

  /** Face every scene towards the seat (so what you placed looks at you). */
  private faceSeat(it: Item) {
    const seat = this.room.room?.seat;
    if (!seat) return;
    const dx = seat[0] - it.anchor.position.x;
    const dz = seat[2] - it.anchor.position.z;
    it.anchor.rotation.y = Math.atan2(dx, dz);
  }

  private ensureHalo(fid: string) {
    if (this.halos.has(fid)) return;
    const f = this.room.getFurniture(fid);
    if (!f) return;
    const h = V.halo(new THREE.Vector3(...f.size));
    h.root.position.set(...f.center);
    h.root.rotation.y = f.yaw;
    this.room.root.add(h.root);
    h.setState('off');
    this.halos.set(fid, h);
    if (f.label === 'manual' && !this.lanterns.has(fid)) {
      const lantern = V.scene({ actors: [{ model: 'candle', role: 'hero', anim: 'float' }], caption: 'Lantern', accent: '#ffd27a' });
      lantern.root.position.set(f.center[0], f.center[1] - 0.09, f.center[2]);
      lantern.root.scale.setScalar(0.45);
      lantern.setAppearance('full');
      this.room.root.add(lantern.root);
      this.lanterns.set(fid, lantern);
    }
  }

  /** Make sure every hand-placed lantern of the room is visible (even with no notion on it yet). */
  showLanterns() {
    for (const f of this.room.furniture()) if (f.label === 'manual') this.ensureHalo(f.id);
  }

  /** Halo for any furniture (also ones without notions: scan & placement highlights). */
  halo(fid: string): IHalo | undefined {
    this.ensureHalo(fid);
    return this.halos.get(fid);
  }

  setHaloOverride(fid: string, s: HaloState | null) {
    if (s) this.haloOverride.set(fid, s);
    else this.haloOverride.delete(fid);
  }
  /** Force every halo to one state (e.g. 'glow' while choosing where to place). null = automatic. */
  setGlobalHalo(s: HaloState | null) {
    this.globalHalo = s;
    if (s) for (const f of this.room.furniture()) this.ensureHalo(f.id);
  }

  setMode(notionId: string, mode: ItemMode) {
    const it = this.items.get(notionId);
    if (!it || it.mode === mode) return;
    it.mode = mode;
    it.modeTime = 0;
  }
  setAllModes(mode: ItemMode) {
    for (const id of this.items.keys()) this.setMode(id, mode);
  }

  refreshTiers(animate: boolean): { notionId: string; from: Tier; to: Tier }[] {
    const ups: { notionId: string; from: Tier; to: Tier }[] = [];
    for (const it of this.items.values()) {
      const st = this.progress?.reviews[it.notion.id];
      const t = st ? tierOf(st) : 'new';
      if (t !== it.tier) {
        ups.push({ notionId: it.notion.id, from: it.tier, to: t });
        it.tier = t;
      }
      it.trophy.setTier(t, animate);
    }
    return ups;
  }

  worldPos(notionId: string, out = new THREE.Vector3()) {
    const it = this.items.get(notionId);
    if (!it) return out.set(0, 0, 0);
    return it.anchor.getWorldPosition(out).add(_v.set(0, 0.12, 0));
  }

  update(dt: number, t: number) {
    const haloState = this.haloScratch;
    haloState.clear();
    const rank = HALO_RANK;
    for (const it of this.items.values()) {
      it.modeTime += dt;
      this.faceSeat(it);
      const mode = it.mode;
      let appearance: 'full' | 'pale' | 'gold' | 'hidden' = 'hidden';
      let intensity = 1;
      let emberOn = false;
      let hs: HaloState = 'off';
      switch (mode) {
        case 'idle':
          appearance = it.tier === 'new' ? 'full' : it.tier === 'fragile' ? 'pale' : it.tier === 'anchored' ? 'gold' : 'hidden';
          emberOn = it.tier !== 'new';
          hs = 'ember';
          break;
        case 'hidden':
          appearance = 'hidden';
          break;
        case 'ember':
          emberOn = true;
          hs = 'ember';
          break;
        case 'due':
          emberOn = true;
          hs = 'due';
          break;
        case 'active':
          emberOn = true;
          hs = 'active';
          break;
        case 'reveal':
          appearance = 'full';
          hs = 'glow';
          break;
        case 'replay':
          appearance = 'full';
          intensity = 2;
          hs = 'active';
          break;
        case 'held':
          appearance = 'full';
          break;
      }
      if (appearance !== 'hidden' || it.scene) {
        const sc = this.sceneOf(it);
        const key = `${appearance}:${intensity}`;
        if (key !== it.shown) {
          it.shown = key;
          sc.setAppearance(appearance);
          // Ghosts and statues never show text (it would give the answer away).
          const ghost = appearance === 'pale' || appearance === 'gold';
          sc.root.traverse((o) => {
            if (o.userData.lociText) o.visible = !ghost;
          });
          sc.root.scale.setScalar(appearance === 'gold' ? 0.55 : appearance === 'pale' ? 0.9 : 1);
          sc.setIntensity(intensity);
        }
        if (appearance === 'full') sc.update(dt, t);
      }
      it.ember.visible = emberOn;
      if (emberOn) {
        const s = mode === 'due' || mode === 'active' ? 1.6 + Math.sin(t * 3 + it.index) * 0.35 : 1;
        it.ember.scale.setScalar(s);
      }
      it.trophy.root.visible = mode !== 'held' && mode !== 'hidden';
      it.trophy.update(dt, t);
      const cur = haloState.get(it.placement.furnitureId) ?? 'off';
      if (rank[hs] > rank[cur]) haloState.set(it.placement.furnitureId, hs);
    }
    for (const l of this.lanterns.values()) l.update(dt, t);
    for (const [fid, h] of this.halos) {
      const s = this.haloOverride.get(fid) ?? this.globalHalo ?? haloState.get(fid) ?? 'off';
      h.setState(s);
      h.update(dt, t);
    }
  }
}
