import * as THREE from 'three';
import type { Furniture, RoomModel, Vec3 } from '../../core/types';
import { registerRoom } from '../../core/registration';
import { isLocusLabel, furnitureName, type RoomScanner } from '../xr/room-scan';
import { XR, headYaw } from '../xr/context';

/**
 * The learner's room across sessions.
 *
 * Everything persistent (furniture, placements, trophies) lives under `root`, whose transform
 * maps the ROOM frame (the reference space of the first session) into the current SESSION
 * frame. Each session we solve that transform:
 *   1. from the furniture itself (Meta Scene boxes are stable across sessions) — robust to recentring;
 *   2. else from a persistent WebXR anchor saved at the room origin;
 *   3. else identity (same reference space as last time, which is true unless the user recentred).
 */
export type RegistrationSource = 'new' | 'furniture' | 'anchor' | 'identity' | 'pending';

const MERGE_DIST = 0.35;

export class RoomManager {
  readonly root = new THREE.Group();
  room: RoomModel | null = null;
  source: RegistrationSource = 'pending';
  confidence = 0;
  /** Session-frame furniture currently seen, keyed by its id in the ROOM model (after matching). */
  private matched = new Map<string, string>();
  private anchor: XRAnchor | null = null;
  private anchorRestoring = false;
  private yaw = 0;
  onChange: (() => void) | null = null;

  constructor() {
    this.root.name = 'RoomRoot';
  }

  /** Start a session with the saved room (or null for a brand-new room). */
  begin(saved: RoomModel | null) {
    this.room = saved ? structuredClone(saved) : null;
    this.source = 'pending';
    this.confidence = 0;
    this.matched.clear();
    this.anchor = null;
    this.anchorRestoring = false;
    this.setTransform(0, 0, 0);
  }

  get ready() {
    return this.source !== 'pending';
  }

  private setTransform(yaw: number, tx: number, tz: number) {
    this.yaw = yaw;
    this.root.position.set(tx, 0, tz);
    this.root.rotation.set(0, yaw, 0);
    this.root.updateMatrixWorld(true);
  }

  /** Session → room point conversion. */
  toRoom(p: THREE.Vector3, out = new THREE.Vector3()) {
    return out.copy(p).applyMatrix4(new THREE.Matrix4().copy(this.root.matrixWorld).invert());
  }
  toSession(p: Vec3, out = new THREE.Vector3()) {
    return out.set(p[0], p[1], p[2]).applyMatrix4(this.root.matrixWorld);
  }

  /** Try to resolve the room transform; call every frame until `ready`. */
  update(scanner: RoomScanner, frame: XRFrame, ref: XRReferenceSpace, now: number) {
    this.pollAnchor(frame, ref);
    if (this.ready) return;
    const current = scanner.list().filter((f) => isLocusLabel(f.label));
    const settled = scanner.stableFor > 0.6 && scanner.scanningFor > 0.8;
    const timeout = scanner.scanningFor > 3.5;
    if (!settled && !timeout) return;

    if (!this.room) {
      // First session in this room: the room frame IS this session's frame.
      this.room = {
        id: `room-${now.toString(36)}`,
        createdAt: now,
        updatedAt: now,
        furniture: current.map((f) => ({ ...f, id: `f-${f.id}-${now.toString(36).slice(-4)}` })),
        seat: [XR.head.pos.x, XR.head.pos.y, XR.head.pos.z],
        seatYaw: headYaw(),
      };
      this.room.furniture.forEach((f, i) => this.matched.set(f.id, current[i].id));
      this.setTransform(0, 0, 0);
      this.source = 'new';
      this.confidence = 1;
      void this.createAnchor(frame, ref);
      this.onChange?.();
      return;
    }

    const reg = current.length ? registerRoom(this.room.furniture, current) : null;
    if (reg && reg.inliers >= Math.min(2, this.room.furniture.length) && reg.confidence > 0.35) {
      this.setTransform(reg.yaw, reg.tx, reg.tz);
      this.source = 'furniture';
      this.confidence = reg.confidence;
    } else if (this.anchorPose) {
      this.setTransform(this.anchorPose.yaw, this.anchorPose.tx, this.anchorPose.tz);
      this.source = 'anchor';
      this.confidence = 0.6;
    } else if (!timeout && this.anchorRestoring) {
      return; // give the anchor a chance
    } else {
      this.setTransform(0, 0, 0);
      this.source = 'identity';
      this.confidence = 0.3;
    }
    this.mergeFurniture(current, now);
    this.onChange?.();
  }

  /** Add newly seen furniture (in room frame) and remember which session object each saved one matches. */
  mergeFurniture(current: Furniture[], now: number) {
    if (!this.room) return;
    const inv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    const v = new THREE.Vector3();
    const taken = new Set<string>();
    for (const cf of current) {
      v.set(cf.center[0], cf.center[1], cf.center[2]).applyMatrix4(inv);
      let best: Furniture | null = null;
      let bestD = MERGE_DIST;
      for (const rf of this.room.furniture) {
        if (rf.label !== cf.label || taken.has(rf.id)) continue;
        const d = Math.hypot(rf.center[0] - v.x, rf.center[2] - v.z);
        if (d < bestD) {
          bestD = d;
          best = rf;
        }
      }
      if (best) {
        taken.add(best.id);
        this.matched.set(best.id, cf.id);
      } else {
        const id = `f-${cf.id}-${now.toString(36).slice(-4)}`;
        this.room.furniture.push({
          ...cf,
          id,
          center: [v.x, v.y, v.z],
          yaw: cf.yaw - this.yaw,
          name: furnitureName(cf.label, cf.size),
        });
        this.matched.set(id, cf.id);
      }
    }
    this.room.updatedAt = now;
  }

  /** Add a hand-placed wall lantern (fallback anchor) at a session-frame point, facing the learner. */
  addManual(sessionPoint: THREE.Vector3, facingYaw: number, now: number): Furniture {
    if (!this.room) throw new Error('room not initialised');
    const p = this.toRoom(sessionPoint);
    const f: Furniture = {
      id: `lantern-${now.toString(36)}-${this.room.furniture.length}`,
      label: 'manual',
      center: [p.x, p.y, p.z],
      size: [0.18, 0.18, 0.18],
      yaw: facingYaw - this.yaw,
      name: 'Lantern',
    };
    this.room.furniture.push(f);
    this.room.updatedAt = now;
    this.onChange?.();
    return f;
  }

  furniture(): Furniture[] {
    return this.room?.furniture ?? [];
  }
  getFurniture(id: string) {
    return this.room?.furniture.find((f) => f.id === id);
  }
  /** Is this saved furniture currently seen by the headset (vs remembered only)? */
  isSeen(id: string) {
    return this.matched.has(id) || this.getFurniture(id)?.label === 'manual';
  }

  /** The session-frame id of the scanned object matched to saved furniture `id` (if seen now). */
  matchedSessionId(id: string) {
    return this.matched.get(id);
  }

  /** Matrix of a furniture box in the SESSION frame (for halos, hit-tests). */
  furnitureMatrix(f: Furniture, out = new THREE.Matrix4()) {
    out.makeRotationY(f.yaw).setPosition(f.center[0], f.center[1], f.center[2]);
    return out.premultiply(this.root.matrixWorld);
  }

  // ─── Persistent anchor (fallback registration) ──────────────────────────────
  private anchorPose: { yaw: number; tx: number; tz: number } | null = null;

  private async createAnchor(frame: XRFrame, ref: XRReferenceSpace) {
    if (!this.room || !frame.createAnchor) return;
    try {
      const a = await frame.createAnchor(new XRRigidTransform({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }), ref);
      if (!a) return;
      this.anchor = a;
      const handle = await (a as XRAnchor & { requestPersistentHandle?: () => Promise<string> }).requestPersistentHandle?.();
      if (handle && this.room) {
        this.room.anchorUuid = handle;
        this.onChange?.();
      }
    } catch (e) {
      console.info('[room] persistent anchor unavailable:', (e as Error).message);
    }
  }

  /** Called once per session start (after `begin`) with the XR session. */
  async restoreAnchor(session: XRSession) {
    const uuid = this.room?.anchorUuid;
    const restore = (session as XRSession & { restorePersistentAnchor?: (u: string) => Promise<XRAnchor> }).restorePersistentAnchor;
    if (!uuid || !restore) return;
    this.anchorRestoring = true;
    try {
      this.anchor = await restore.call(session, uuid);
    } catch (e) {
      console.info('[room] could not restore anchor:', (e as Error).message);
    } finally {
      this.anchorRestoring = false;
    }
  }

  private pollAnchor(frame: XRFrame, ref: XRReferenceSpace) {
    if (!this.anchor) return;
    const pose = frame.getPose(this.anchor.anchorSpace, ref);
    if (!pose) return;
    const q = new THREE.Quaternion(pose.transform.orientation.x, pose.transform.orientation.y, pose.transform.orientation.z, pose.transform.orientation.w);
    const x = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    this.anchorPose = { yaw: Math.atan2(-x.z, x.x), tx: pose.transform.position.x, tz: pose.transform.position.z };
  }
}
