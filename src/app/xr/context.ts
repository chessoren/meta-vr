import * as THREE from 'three';

/**
 * Per-frame XR state shared by every app module. Filled once per XR frame by main.ts,
 * read everywhere (no allocations in hot paths: vectors are reused).
 * All positions are in the session reference space (local-floor), which is also the
 * Three.js scene frame (the IWSDK player origin is kept at identity).
 */
export const XR = {
  session: null as XRSession | null,
  frame: null as XRFrame | null,
  ref: null as XRReferenceSpace | null,
  time: 0,
  dt: 0,
  head: {
    pos: new THREE.Vector3(0, 1.2, 0),
    quat: new THREE.Quaternion(),
    forward: new THREE.Vector3(0, 0, -1),
    up: new THREE.Vector3(0, 1, 0),
    right: new THREE.Vector3(1, 0, 0),
    valid: false,
  },
  /** Eye-gaze ray if the runtime grants gaze tracking (Quest Pro / VR Glasses), else null. */
  eye: { origin: new THREE.Vector3(), dir: new THREE.Vector3(), valid: false },
  visibility: 'visible' as XRVisibilityState,
};

const _m = new THREE.Matrix4();

/** Update head (and eye gaze) from the current frame. */
export function updateHead(frame: XRFrame, ref: XRReferenceSpace) {
  const pose = frame.getViewerPose(ref);
  if (!pose) {
    XR.head.valid = false;
    return;
  }
  const t = pose.transform;
  XR.head.pos.set(t.position.x, t.position.y, t.position.z);
  XR.head.quat.set(t.orientation.x, t.orientation.y, t.orientation.z, t.orientation.w);
  XR.head.forward.set(0, 0, -1).applyQuaternion(XR.head.quat);
  XR.head.up.set(0, 1, 0).applyQuaternion(XR.head.quat);
  XR.head.right.set(1, 0, 0).applyQuaternion(XR.head.quat);
  XR.head.valid = true;

  XR.eye.valid = false;
  for (const src of frame.session.inputSources) {
    if (src.targetRayMode !== ('gaze' as XRTargetRayMode)) continue;
    const p = frame.getPose(src.targetRaySpace, ref);
    if (!p) continue;
    _m.fromArray(p.transform.matrix);
    XR.eye.origin.setFromMatrixPosition(_m);
    XR.eye.dir.set(0, 0, -1).transformDirection(_m);
    XR.eye.valid = true;
  }
}

/** A point `dist` metres in front of the head, `down` metres below eye line, on a yaw-only frame (comfortable for seated UI). */
export function inFrontOfHead(dist: number, down = 0, side = 0, out = new THREE.Vector3()) {
  const f = XR.head.forward;
  const flat = Math.hypot(f.x, f.z) || 1;
  const fx = f.x / flat;
  const fz = f.z / flat;
  out.set(XR.head.pos.x + fx * dist - fz * side, XR.head.pos.y - down, XR.head.pos.z + fz * dist + fx * side);
  return out;
}

/** Yaw (radians) of the head's forward direction; 0 faces −Z. */
export function headYaw() {
  return Math.atan2(-XR.head.forward.x, -XR.head.forward.z);
}
