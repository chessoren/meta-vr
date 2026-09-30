import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { App } from '../../src/app/app';
import { RoomManager } from '../../src/app/room/room-manager';
import type { Furniture, PalaceProgress } from '../../src/core/types';

/**
 * `spotOn` decides where a scene lands on a real object. Tested without a World: we call the
 * method with a minimal `this` (it only uses `this.room`).
 */
const spotOn = App.prototype.spotOn;

function ctx(furniture: Furniture[]) {
  const room = new RoomManager();
  room.begin({ id: 'r', createdAt: 0, updatedAt: 0, furniture, seat: [0, 1.2, 0], seatYaw: 0 });
  room.root.updateMatrixWorld(true);
  return { room } as unknown as App;
}
const desk: Furniture = { id: 'desk', label: 'table', center: [0, 0.375, -1.2], size: [1.2, 0.75, 0.6], yaw: 0, name: 'Desk' };
const lantern: Furniture = { id: 'l1', label: 'manual', center: [1, 1.5, -2], size: [0.18, 0.18, 0.18], yaw: 0, name: 'Lantern' };
const empty = (): PalaceProgress => ({ palaceId: 'p', roomId: 'r', placements: [], reviews: {} });

describe('spotOn', () => {
  it('lands on the top face of a desk, inside its footprint', () => {
    const c = ctx([desk]);
    const s = spotOn.call(c, desk, new THREE.Vector3(0.9, 0.6, -1.0), empty(), 'n1');
    expect(s.local[1]).toBeCloseTo(0.375, 5); // half height → the top face
    expect(Math.abs(s.local[0])).toBeLessThanOrEqual(0.6 - 0.07 + 1e-9);
    expect(Math.abs(s.local[2])).toBeLessThanOrEqual(0.3 - 0.07 + 1e-9);
    expect(s.room.y).toBeCloseTo(0.75, 5);
  });

  it('keeps ~22 cm between scenes on the same object', () => {
    const c = ctx([desk]);
    const p = empty();
    const a = spotOn.call(c, desk, new THREE.Vector3(0, 0.75, -1.2), p, 'n1');
    p.placements.push({ notionId: 'n1', furnitureId: 'desk', local: a.local, order: 0, placedAt: 0 });
    const b = spotOn.call(c, desk, new THREE.Vector3(0, 0.75, -1.2), p, 'n2');
    expect(Math.hypot(a.local[0] - b.local[0], a.local[2] - b.local[2])).toBeGreaterThanOrEqual(0.22);
  });

  it('spreads scenes along the wall around a hand-placed lantern instead of stacking them', () => {
    const c = ctx([lantern]);
    const p = empty();
    const xs: number[] = [];
    for (let i = 0; i < 5; i++) {
      const s = spotOn.call(c, lantern, new THREE.Vector3(1, 1.5, -2), p, `n${i}`);
      xs.push(s.local[0]);
      expect(s.local[1]).toBeLessThan(0.1); // not a tower
      p.placements.push({ notionId: `n${i}`, furnitureId: 'l1', local: s.local, order: i, placedAt: 0 });
    }
    expect(new Set(xs.map((x) => x.toFixed(2))).size).toBe(5);
  });
});
