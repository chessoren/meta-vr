/**
 * Appear / disappear helpers for mnemonic scenes (and any Object3D).
 *
 *   popIn:       scale 0 → overshoot → 1, a small hop, and an expanding ring of sparkles.
 *   dissolveOut: shrink + rise + fade, shedding golden dust; hidden at the end.
 *
 * Driven by `update(dt, t)`. Owns one world-space Sparkles pool (1 draw call) unless one
 * is passed in. Fading clones the target's materials for the duration of the dissolve
 * only (shared kit materials are never modified) and restores them afterwards.
 */
import * as THREE from 'three';
import { Sparkles } from './sparkles';
import { clamp01, easeInCubic, easeOutBack, easeOutCubic } from './common';

export interface PopOpts {
  duration?: number;
  delay?: number;
  /** Sparkle ring colour. */
  color?: THREE.ColorRepresentation;
  /** Ring radius (m). Default: from the target's bounds. */
  radius?: number;
  /** Final scale (default: the target's current scale, or 1 if it is ~0). */
  scale?: number;
  onDone?: () => void;
}
export interface DissolveOpts {
  duration?: number;
  delay?: number;
  /** How far it rises (m). Default 0.06. */
  rise?: number;
  color?: THREE.ColorRepresentation;
  /** Hide (visible=false) and restore scale/position at the end. Default true. */
  hide?: boolean;
  onDone?: () => void;
}

interface Job {
  kind: 'in' | 'out';
  obj: THREE.Object3D;
  t: number;
  delay: number;
  dur: number;
  baseScale: THREE.Vector3;
  baseY: number;
  rise: number;
  color: THREE.Color;
  radius: number;
  hide: boolean;
  fired: boolean;
  onDone?: () => void;
  swaps: { mesh: THREE.Mesh; orig: THREE.Material | THREE.Material[] }[];
  clones: THREE.Material[];
  dustT: number;
}

const _box = new THREE.Box3();
const _v = new THREE.Vector3();
const _h = new THREE.Vector3();

export class Transitions {
  readonly root = new THREE.Group();
  readonly sparks: Sparkles;
  private jobs: Job[] = [];

  constructor(sparks?: Sparkles) {
    this.root.name = 'transitions';
    this.sparks = sparks ?? new Sparkles({ max: 300, seed: 17 });
    if (!sparks) this.root.add(this.sparks.root);
  }

  isBusy(obj: THREE.Object3D) {
    return this.jobs.some((j) => j.obj === obj);
  }

  popIn(obj: THREE.Object3D, o: PopOpts = {}) {
    this.cancel(obj);
    const s = o.scale ?? (obj.scale.x > 1e-3 ? obj.scale.x : 1);
    obj.updateWorldMatrix(true, true);
    _box.setFromObject(obj);
    const r = o.radius ?? (_box.isEmpty() ? 0.12 : Math.max(0.05, Math.hypot(_box.max.x - _box.min.x, _box.max.z - _box.min.z) * 0.45));
    const job = this.job('in', obj, o.duration ?? 0.7, o.delay ?? 0, o.onDone);
    job.baseScale.setScalar(s);
    job.radius = r;
    job.color.set(o.color ?? '#ffd27a');
    obj.scale.setScalar(1e-4);
    obj.visible = true;
  }

  dissolveOut(obj: THREE.Object3D, o: DissolveOpts = {}) {
    this.cancel(obj);
    const job = this.job('out', obj, o.duration ?? 0.9, o.delay ?? 0, o.onDone);
    job.baseScale.copy(obj.scale);
    job.rise = o.rise ?? 0.06;
    job.hide = o.hide ?? true;
    job.color.set(o.color ?? '#ffd27a');
    // fade: clone materials once per dissolve
    const map = new Map<THREE.Material, THREE.Material>();
    obj.traverse((ob) => {
      const m = ob as THREE.Mesh;
      if (!m.isMesh || !m.material) return;
      const one = (src: THREE.Material) => {
        let c = map.get(src);
        if (!c) {
          c = src.clone();
          c.transparent = true;
          c.userData.baseOpacity = src.opacity;
          map.set(src, c);
          job.clones.push(c);
        }
        return c;
      };
      job.swaps.push({ mesh: m, orig: m.material });
      m.material = Array.isArray(m.material) ? m.material.map(one) : one(m.material);
    });
  }

  /** Stop any transition on obj, restoring materials (the object keeps its current pose). */
  cancel(obj: THREE.Object3D) {
    for (let i = this.jobs.length - 1; i >= 0; i--) if (this.jobs[i].obj === obj) this.finish(i, false);
  }

  private job(kind: 'in' | 'out', obj: THREE.Object3D, dur: number, delay: number, onDone?: () => void): Job {
    const j: Job = { kind, obj, t: 0, delay, dur, baseScale: new THREE.Vector3(1, 1, 1), baseY: obj.position.y, rise: 0, color: new THREE.Color(), radius: 0.1, hide: true, fired: false, onDone, swaps: [], clones: [], dustT: 0 };
    this.jobs.push(j);
    return j;
  }

  private finish(i: number, complete: boolean) {
    const j = this.jobs[i];
    for (const s of j.swaps) s.mesh.material = s.orig;
    for (const c of j.clones) c.dispose();
    if (complete) {
      if (j.kind === 'in') j.obj.scale.copy(j.baseScale);
      else if (j.hide) {
        j.obj.visible = false;
        j.obj.scale.copy(j.baseScale);
        j.obj.position.y = j.baseY;
      }
    }
    this.jobs.splice(i, 1);
    if (complete) j.onDone?.();
  }

  update(dt: number, t: number) {
    for (let i = this.jobs.length - 1; i >= 0; i--) {
      const j = this.jobs[i];
      if (j.delay > 0) {
        j.delay -= dt;
        continue;
      }
      j.t += dt;
      const u = clamp01(j.t / j.dur);
      const o = j.obj;
      if (j.kind === 'in') {
        const k = easeOutBack(u, 2.2);
        o.scale.copy(j.baseScale).multiplyScalar(Math.max(1e-4, k));
        o.position.y = j.baseY + Math.sin(Math.PI * clamp01(u * 1.4)) * 0.015;
        if (!j.fired) {
          j.fired = true;
          o.getWorldPosition(_v);
          _v.y += 0.01;
          this.sparks.ring(_v, j.radius * 0.6, j.color, 28, 0.32);
          _v.y += j.radius * 0.5;
          this.sparks.emit(_v, '#fff0c0', 10, 0.25, { size: [0.002, 0.005], stars: 0.6 });
        }
      } else {
        const e = easeInCubic(u);
        o.scale.copy(j.baseScale).multiplyScalar(Math.max(1e-4, 1 - e * 0.85));
        o.position.y = j.baseY + easeOutCubic(u) * j.rise;
        const op = 1 - clamp01((u - 0.15) / 0.85);
        for (const c of j.clones) c.opacity = (c.userData.baseOpacity as number) * op;
        j.dustT -= dt;
        if (j.dustT <= 0 && u < 0.9) {
          j.dustT = 0.05;
          o.updateWorldMatrix(true, true);
          _box.setFromObject(o);
          if (!_box.isEmpty()) {
            _box.getCenter(_v);
            _box.getSize(_h).multiplyScalar(0.45);
            this.sparks.rise(_v, _h, j.color, 4);
          }
        }
      }
      if (u >= 1) this.finish(i, true);
    }
    this.sparks.update(dt, t);
  }

  dispose() {
    for (let i = this.jobs.length - 1; i >= 0; i--) this.finish(i, false);
    this.sparks.dispose();
    this.root.removeFromParent();
  }
}
