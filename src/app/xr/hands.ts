import * as THREE from 'three';
import { XR } from './context';

/**
 * Hand-tracking gestures from raw WebXR joint poses (works identically on Quest and in IWER).
 *  - pinch (thumb tip ↔ index tip, with hysteresis) + pinch point
 *  - palm normal (WebXR joint convention: −Y of a joint points out of the palm)
 *  - palm up (reveal), palm facing the head (menu), closed fist held (exit)
 */
export type Handedness = 'left' | 'right';

const PINCH_ON = 0.018;
const PINCH_OFF = 0.034;
const FIST_TIP_DIST = 0.055;

export interface HandState {
  handedness: Handedness;
  tracked: boolean;
  wrist: THREE.Vector3;
  palm: THREE.Vector3; // middle metacarpal
  palmNormal: THREE.Vector3; // out of the palm
  indexTip: THREE.Vector3;
  thumbTip: THREE.Vector3;
  pinchPoint: THREE.Vector3;
  pinchDist: number;
  pinching: boolean;
  pinchStarted: boolean; // edge this frame
  pinchEnded: boolean; // edge this frame
  pinchStartTime: number;
  /** Ray from the system target-ray space (Quest "hand ray"), used as a secondary pointer. */
  rayOrigin: THREE.Vector3;
  rayDir: THREE.Vector3;
  rayValid: boolean;
  palmUp: boolean;
  palmUpTime: number; // seconds the palm has been up
  palmToFace: boolean;
  palmToFaceTime: number;
  fist: boolean;
  fistTime: number;
}

function blank(h: Handedness): HandState {
  return {
    handedness: h,
    tracked: false,
    wrist: new THREE.Vector3(),
    palm: new THREE.Vector3(),
    palmNormal: new THREE.Vector3(0, -1, 0),
    indexTip: new THREE.Vector3(),
    thumbTip: new THREE.Vector3(),
    pinchPoint: new THREE.Vector3(),
    pinchDist: 1,
    pinching: false,
    pinchStarted: false,
    pinchEnded: false,
    pinchStartTime: 0,
    rayOrigin: new THREE.Vector3(),
    rayDir: new THREE.Vector3(0, 0, -1),
    rayValid: false,
    palmUp: false,
    palmUpTime: 0,
    palmToFace: false,
    palmToFaceTime: 0,
    fist: false,
    fistTime: 0,
  };
}

export const Hands = {
  left: blank('left'),
  right: blank('right'),
  /** Debug/test overrides: force a gesture regardless of joints. */
  force: { palmUp: null as Handedness | null, fist: null as Handedness | null, pinch: null as Handedness | null, palmFace: null as Handedness | null },
  any(pred: (h: HandState) => boolean): HandState | null {
    if (pred(this.right)) return this.right;
    if (pred(this.left)) return this.left;
    return null;
  },
};

const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const TIPS: XRHandJoint[] = ['index-finger-tip', 'middle-finger-tip', 'ring-finger-tip', 'pinky-finger-tip'];

function readJoint(frame: XRFrame, hand: XRHand, name: XRHandJoint, ref: XRReferenceSpace, out: THREE.Vector3, quat?: THREE.Quaternion) {
  const space = hand.get(name);
  if (!space) return false;
  const p = frame.getJointPose?.(space, ref);
  if (!p) return false;
  out.set(p.transform.position.x, p.transform.position.y, p.transform.position.z);
  if (quat) quat.set(p.transform.orientation.x, p.transform.orientation.y, p.transform.orientation.z, p.transform.orientation.w);
  return true;
}

export function updateHands(frame: XRFrame, ref: XRReferenceSpace, dt: number, time: number) {
  const seen = { left: false, right: false };
  for (const src of frame.session.inputSources) {
    if (!src.hand || (src.handedness !== 'left' && src.handedness !== 'right')) continue;
    const h = Hands[src.handedness];
    seen[src.handedness] = true;
    const ok =
      readJoint(frame, src.hand, 'wrist', ref, h.wrist) &&
      readJoint(frame, src.hand, 'middle-finger-metacarpal', ref, h.palm, _q) &&
      readJoint(frame, src.hand, 'index-finger-tip', ref, h.indexTip) &&
      readJoint(frame, src.hand, 'thumb-tip', ref, h.thumbTip);
    h.tracked = ok;
    h.pinchStarted = h.pinchEnded = false;
    if (!ok) {
      if (h.pinching) {
        h.pinching = false;
        h.pinchEnded = true;
      }
      // Lost tracking: no stale gesture may keep a menu open or trigger a reveal.
      h.palmUp = h.palmToFace = h.fist = false;
      h.palmUpTime = h.palmToFaceTime = h.fistTime = 0;
      continue;
    }
    // Palm normal: −Y of the metacarpal joint.
    h.palmNormal.set(0, -1, 0).applyQuaternion(_q).normalize();

    // Pinch with hysteresis (or forced for tests).
    h.pinchDist = h.indexTip.distanceTo(h.thumbTip);
    const forced = Hands.force.pinch === h.handedness;
    const want = forced || (h.pinching ? h.pinchDist < PINCH_OFF : h.pinchDist < PINCH_ON);
    if (want && !h.pinching) {
      h.pinching = true;
      h.pinchStarted = true;
      h.pinchStartTime = time;
    } else if (!want && h.pinching) {
      h.pinching = false;
      h.pinchEnded = true;
    }
    h.pinchPoint.copy(h.indexTip).add(h.thumbTip).multiplyScalar(0.5);

    // Palm up (reveal): normal points to the sky AND the hand is raised in front of the eyes —
    // a hand resting palm-up in the lap must never reveal an answer.
    _v.copy(h.palm).sub(XR.head.pos);
    const inView = h.palm.y > XR.head.pos.y - 0.45 && _v.normalize().dot(XR.head.forward) > 0.55;
    const up = Hands.force.palmUp === h.handedness || (inView && h.palmNormal.y > (h.palmUp ? 0.55 : 0.78));
    h.palmUp = up;
    h.palmUpTime = up ? h.palmUpTime + dt : 0;

    // Palm facing the head (and close enough to be "looked at").
    _v.copy(XR.head.pos).sub(h.palm);
    const d = _v.length();
    _v.divideScalar(d || 1);
    const face = Hands.force.palmFace === h.handedness || (d < 0.6 && h.palmNormal.dot(_v) > (h.palmToFace ? 0.6 : 0.75));
    h.palmToFace = face;
    h.palmToFaceTime = face ? h.palmToFaceTime + dt : 0;

    // Fist: all four fingertips curled close to the palm, not pinching.
    let curled = !h.pinching;
    if (curled) {
      for (const tip of TIPS) {
        if (!readJoint(frame, src.hand, tip, ref, _v) || _v.distanceTo(h.palm) > FIST_TIP_DIST) {
          curled = false;
          break;
        }
      }
    }
    // Only a fist shown in front of the eyes counts: a relaxed hand curled on the lap must never exit.
    const fist = Hands.force.fist === h.handedness || (curled && inView);
    h.fist = fist;
    h.fistTime = fist ? h.fistTime + dt : 0;

    // System hand ray.
    const rp = frame.getPose(src.targetRaySpace, ref);
    h.rayValid = !!rp;
    if (rp) {
      _m.fromArray(rp.transform.matrix);
      h.rayOrigin.setFromMatrixPosition(_m);
      h.rayDir.set(0, 0, -1).transformDirection(_m);
    }
  }
  for (const k of ['left', 'right'] as const) {
    if (!seen[k]) {
      const h = Hands[k];
      h.pinchStarted = false;
      h.pinchEnded = h.pinching;
      h.pinching = false;
      h.tracked = false;
      h.palmUp = h.palmToFace = h.fist = false;
      h.palmUpTime = h.palmToFaceTime = h.fistTime = 0;
    }
  }
}
