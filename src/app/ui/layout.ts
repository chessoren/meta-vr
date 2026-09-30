import * as THREE from 'three';
import { XR } from '../xr/context';

/**
 * Lazy-follow "reading spot" for panels: a comfortable place in front of the seated learner
 * (≈ 0.55 m, slightly below the eye line) that only re-centres when the head turns away by
 * more than a threshold — steady while reading, never lost. Keeps everything inside the
 * narrow central FOV of Meta VR Glasses (±20°).
 */
export class LazyFollow {
  readonly anchor = new THREE.Object3D();
  private yaw = 0;
  private targetYaw = 0;
  private initialized = false;
  constructor(
    public dist = 0.55,
    public down = 0.1,
    public thresholdDeg = 22,
  ) {}

  /** Snap in front of the current gaze immediately. */
  snap() {
    this.targetYaw = this.yaw = this.headYaw();
    this.initialized = true;
    this.apply(1);
  }

  update(dt: number) {
    if (!XR.head.valid) return;
    if (!this.initialized) this.snap();
    const hy = this.headYaw();
    let d = hy - this.targetYaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    if (Math.abs(d) > (this.thresholdDeg * Math.PI) / 180) this.targetYaw = hy;
    let e = this.targetYaw - this.yaw;
    e = Math.atan2(Math.sin(e), Math.cos(e));
    this.yaw += e * Math.min(1, dt * 4);
    this.apply(Math.min(1, dt * 6));
  }

  private headYaw() {
    const f = XR.head.forward;
    return Math.atan2(-f.x, -f.z);
  }

  private apply(k: number) {
    const x = XR.head.pos.x - Math.sin(this.yaw) * this.dist;
    const z = XR.head.pos.z - Math.cos(this.yaw) * this.dist;
    const y = XR.head.pos.y - this.down;
    this.anchor.position.x += (x - this.anchor.position.x) * k;
    this.anchor.position.y += (y - this.anchor.position.y) * k;
    this.anchor.position.z += (z - this.anchor.position.z) * k;
    this.anchor.rotation.set(0, this.yaw, 0);
  }

  /** World position of a point in the anchor's local frame (x right, y up, z towards the learner). */
  local(x: number, y: number, z: number, out = new THREE.Vector3()) {
    return out.set(x, y, z).applyMatrix4(this.anchor.matrixWorld);
  }
}

/** Make an object face the head (billboard around Y only, keeps text upright). */
export function faceHeadY(o: THREE.Object3D) {
  const dx = XR.head.pos.x - o.position.x;
  const dz = XR.head.pos.z - o.position.z;
  o.rotation.set(0, Math.atan2(dx, dz), 0);
}
