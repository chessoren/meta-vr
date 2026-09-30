import { describe, expect, it } from 'vitest';
import { assignOrder, bearing, forwardOf, orderFurniture, placementWorld, rightOf, rotateY, toSeatFrame } from '../../../src/core/route';
import type { Furniture, Placement, Vec3 } from '../../../src/core/types';

const f = (id: string, x: number, z: number, yaw = 0): Furniture => ({ id, label: 'table', center: [x, 0.4, z], size: [1, 0.8, 0.6], yaw, name: id });
const close = (a: Vec3, b: Vec3) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 9));

describe('conventions', () => {
  it('yaw 0 faces −Z, +90° faces −X (counter-clockwise from above)', () => {
    close(forwardOf(0), [-0, 0, -1]);
    close(forwardOf(Math.PI / 2), [-1, 0, -0]);
    close(rightOf(0), [1, 0, -0]);
    close(rightOf(Math.PI / 2), [0, 0, -1]);
    // rotateY matches the facing vectors (Three.js rotation.y convention).
    close(rotateY([0, 0, -1], Math.PI / 2), forwardOf(Math.PI / 2));
    close(rotateY([1, 2, 0], Math.PI), [-1, 2, 0]);
  });
  it('seat frame', () => {
    expect(toSeatFrame([1, 1.5, -2], [0, 0, 0], 0)).toEqual({ right: 1, ahead: 2, up: 1.5 });
    const r = toSeatFrame([-1, 0, 0], [0, 0, 0], Math.PI / 2); // facing −X: −X is ahead
    expect(r.ahead).toBeCloseTo(1);
    expect(r.right).toBeCloseTo(0);
  });
  it('bearing: negative on the left, 0 ahead, π straight behind', () => {
    expect(bearing([-1, 0, -1], [0, 0, 0], 0)).toBeCloseTo(-Math.PI / 4);
    expect(bearing([1, 0, -1], [0, 0, 0], 0)).toBeCloseTo(Math.PI / 4);
    expect(bearing([0, 0, 1], [0, 0, 0], 0)).toBeCloseTo(Math.PI);
    expect(bearing([-0, 0, 1], [0, 0, 0], 0)).toBe(Math.PI);
    expect(bearing([0, 3, 0], [0, 0, 0], 0)).toBe(0);
  });
});

describe('orderFurniture', () => {
  const room = [f('right', 2, -2), f('left', -2, -2), f('ahead', 0, -3), f('behindL', -1, 2), f('behindR', 1, 2)];
  it('sweeps left → right from the seat facing −Z', () => {
    expect(orderFurniture(room, [0, 0, 0], 0)).toEqual(['behindL', 'left', 'ahead', 'right', 'behindR']);
  });
  it('depends on the seat yaw', () => {
    // Facing +Z (yaw π): −X is on the right; what was ahead is now straight behind (last).
    expect(orderFurniture(room, [0, 0, 0], Math.PI)).toEqual(['right', 'behindR', 'behindL', 'left', 'ahead']);
    // Facing −X (yaw +π/2): −Z is on the right.
    expect(orderFurniture(room, [0, 0, 0], Math.PI / 2)).toEqual(['behindR', 'behindL', 'left', 'ahead', 'right']);
  });
  it('depends on the seat position', () => {
    expect(orderFurniture([f('a', 0, -1), f('b', 1, -1)], [2, 0, 0], 0)).toEqual(['a', 'b']);
    expect(orderFurniture([f('a', 0, -1), f('b', 1, -1)], [0, 0, -2], 0)).toEqual(['b', 'a']); // both behind: b behind-right, a straight behind
  });
  it('ties in bearing: nearer first, then id', () => {
    expect(orderFurniture([f('far', 0, -4), f('near', 0, -1)], [0, 0, 0], 0)).toEqual(['near', 'far']);
    expect(orderFurniture([f('b', 0, -1), f('a', 0, -1)], [0, 0, 0], 0)).toEqual(['a', 'b']);
    expect(orderFurniture([], [0, 0, 0], 0)).toEqual([]);
  });
});

describe('placementWorld & assignOrder', () => {
  it('local offsets are rotated by the furniture yaw', () => {
    close(placementWorld({ local: [0.5, 0.4, 0] }, { center: [1, 0.4, -2], yaw: Math.PI / 2 }), [1, 0.8, -2.5]);
  });
  const desk = f('desk', 0, -2);
  const lamp = f('lamp', -2, -1);
  const shelf = f('shelf', 2, -1);
  const pl = (notionId: string, furnitureId: string, local: Vec3, order: number): Placement => ({ notionId, furnitureId, local, order, placedAt: 0 });
  it('renumbers along the route; several notions on one object go left → right', () => {
    const input = [pl('n1', 'shelf', [0, 0, 0], 0), pl('n2', 'desk', [0.3, 0, 0], 1), pl('n3', 'desk', [-0.3, 0, 0], 2), pl('n4', 'lamp', [0, 0, 0], 3)];
    const out = assignOrder(input, [desk, lamp, shelf], [0, 0, 0], 0);
    expect(out.map((p) => [p.notionId, p.order])).toEqual([
      ['n4', 0],
      ['n3', 1],
      ['n2', 2],
      ['n1', 3],
    ]);
    expect(input[0].order).toBe(0); // not mutated
  });
  it('uses the furniture yaw for the left/right of notions on one object', () => {
    const turned = f('desk', 0, -2, Math.PI); // local +X now points to world −X
    const out = assignOrder([pl('a', 'desk', [0.3, 0, 0], 0), pl('b', 'desk', [-0.3, 0, 0], 1)], [turned], [0, 0, 0], 0);
    expect(out.map((p) => p.notionId)).toEqual(['a', 'b']);
  });
  it('unknown furniture goes last, keeping its previous order; ties by id', () => {
    const out = assignOrder([pl('x', 'gone', [0, 0, 0], 5), pl('y', 'gone2', [0, 0, 0], 1), pl('b', 'desk', [0, 0, 0], 9), pl('a', 'desk', [0, 0, 0], 8)], [desk], [0, 0, 0], 0);
    expect(out.map((p) => p.notionId)).toEqual(['a', 'b', 'y', 'x']);
    expect(out.map((p) => p.order)).toEqual([0, 1, 2, 3]);
  });
});
