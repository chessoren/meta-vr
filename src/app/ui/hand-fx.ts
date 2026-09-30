import * as THREE from 'three';
import { Hands, type HandState } from '../xr/hands';
import { XR } from '../xr/context';

/**
 * Minimal, warm feedback on the learner's real hands (passthrough shows the hands themselves):
 * two soft fingertip glows that brighten as the pinch closes, a spark on pinch, and a ring
 * that fills while the fist is held (exit).
 */
export class HandFx {
  readonly root = new THREE.Group();
  private tips: Record<'left' | 'right', { index: THREE.Mesh; thumb: THREE.Mesh; ring: THREE.Mesh }>;
  private mat: THREE.MeshBasicMaterial;
  private ringMat: THREE.MeshBasicMaterial;
  fistProgress = 0;
  fistHand: 'left' | 'right' | null = null;

  constructor() {
    this.root.name = 'HandFx';
    this.mat = new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
    this.ringMat = new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
    const g = new THREE.SphereGeometry(0.006, 10, 8);
    const mk = () => {
      const index = new THREE.Mesh(g, this.mat);
      const thumb = new THREE.Mesh(g, this.mat);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.028, 0.034, 32, 1, 0, 0.001), this.ringMat);
      ring.visible = false;
      this.root.add(index, thumb, ring);
      return { index, thumb, ring };
    };
    this.tips = { left: mk(), right: mk() };
  }

  update() {
    for (const k of ['left', 'right'] as const) {
      const h: HandState = Hands[k];
      const t = this.tips[k];
      t.index.visible = t.thumb.visible = h.tracked;
      if (!h.tracked) {
        t.ring.visible = false;
        continue;
      }
      t.index.position.copy(h.indexTip);
      t.thumb.position.copy(h.thumbTip);
      const close = THREE.MathUtils.clamp(1 - (h.pinchDist - 0.015) / 0.05, 0, 1);
      const s = h.pinching ? 1.9 : 0.8 + close * 0.8;
      t.index.scale.setScalar(s);
      t.thumb.scale.setScalar(s);
      // Fist-hold ring around the wrist.
      const show = this.fistHand === k && this.fistProgress > 0.05;
      t.ring.visible = show;
      if (show) {
        t.ring.position.copy(h.palm);
        t.ring.lookAt(XR.head.pos);
        const geo = t.ring.geometry as THREE.RingGeometry;
        const want = Math.PI * 2 * this.fistProgress;
        if (Math.abs(geo.parameters.thetaLength - want) > 0.05) {
          geo.dispose();
          t.ring.geometry = new THREE.RingGeometry(0.028, 0.034, 32, 1, Math.PI / 2, want);
        }
      }
    }
  }
}
