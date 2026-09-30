import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { XR } from '../../src/app/xr/context';
import { addTarget, clearTargets, getHovered, updateTargeting } from '../../src/app/xr/targeting';

describe('gaze targeting', () => {
  beforeEach(() => {
    clearTargets();
    XR.eye.valid = false;
    XR.head.pos.set(0, 1.2, 0);
    XR.head.forward.set(0, 0, -1);
  });

  it('picks the target the head points at, within its angular radius', () => {
    addTarget({ id: 'a', kind: 'item', enabled: () => true, center: (o) => o.set(0, 1.2, -1), radius: 0.1 });
    addTarget({ id: 'b', kind: 'item', enabled: () => true, center: (o) => o.set(0.8, 1.2, -1), radius: 0.1 });
    updateTargeting(0.016);
    expect(getHovered()?.id).toBe('a');
  });

  it('UI (higher priority) wins over a precise furniture hit behind it', () => {
    addTarget({ id: 'desk', kind: 'item', enabled: () => true, center: (o) => o.set(0, 0.8, -1.5), radius: 0.3, hit: () => 1.4 });
    addTarget({ id: 'bubble', kind: 'bubble', enabled: () => true, center: (o) => o.set(0.02, 1.2, -0.5), radius: 0.05, priority: 3 });
    updateTargeting(0.016);
    expect(getHovered()?.id).toBe('bubble');
  });

  it('ignores disabled targets and accumulates hover time on the same target', () => {
    addTarget({ id: 'hidden', kind: 'bubble', enabled: () => false, center: (o) => o.set(0, 1.2, -1), radius: 0.2, priority: 9 });
    addTarget({ id: 'shown', kind: 'item', enabled: () => true, center: (o) => o.copy(new THREE.Vector3(0, 1.2, -2)), radius: 0.2 });
    updateTargeting(0.1);
    updateTargeting(0.1);
    expect(getHovered()?.id).toBe('shown');
  });
});
