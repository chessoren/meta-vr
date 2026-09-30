import { describe, expect, it } from 'vitest';
import {
  IDENTITY,
  applyTransform,
  compose,
  composeYaw,
  invert,
  registerRoom,
  transformFurniture,
  wrapAngle,
  type RigidTransform,
} from '../../../src/core/registration';
import { mulberry32, type RandomSource } from '../../../src/core/ids';
import type { Furniture, SemanticLabel, Vec3 } from '../../../src/core/types';

const DEG = Math.PI / 180;

/** A realistic bedroom / living room in the ROOM frame. */
function room(): Furniture[] {
  const box = (id: string, label: SemanticLabel, center: Vec3, size: Vec3, yawDeg: number): Furniture => ({ id, label, center, size, yaw: yawDeg * DEG, name: id });
  return [
    box('desk', 'table', [1.4, 0.375, -1.8], [1.2, 0.75, 0.6], 0),
    box('couch', 'couch', [-1.6, 0.42, -0.4], [2.0, 0.85, 0.9], 90),
    box('bed', 'bed', [0.6, 0.3, 1.8], [1.4, 0.6, 2.0], 0),
    box('lamp', 'lamp', [-1.9, 0.8, -1.9], [0.35, 1.6, 0.35], 0),
    box('shelf', 'shelf', [2.4, 0.9, 0.2], [0.35, 1.8, 0.9], 0),
    box('chair', 'chair', [1.3, 0.45, -1.2], [0.5, 0.9, 0.5], 20),
    box('screen', 'screen', [1.4, 1.05, -2.0], [0.6, 0.4, 0.08], 0),
    box('plant', 'plant', [-0.4, 0.5, -2.3], [0.4, 1.0, 0.4], 0),
    box('storage', 'storage', [-2.3, 0.45, 1.2], [0.5, 0.9, 1.1], 0),
    box('art', 'wall_art', [0.0, 1.5, -2.45], [0.8, 0.6, 0.04], 0),
  ];
}

const T = (yawDeg: number, tx: number, tz: number): RigidTransform => ({ yaw: wrapAngle(yawDeg * DEG), tx, tz });

/** What the headset would detect in a new session: transformed, noisy, maybe with 90° box-yaw relabelling. */
function observe(saved: Furniture[], t: RigidTransform, rand: RandomSource, noise = { pos: 0.03, yaw: 3 * DEG, size: 0.02 }, relabel = true): Furniture[] {
  const n = (s: number) => (rand() * 2 - 1) * s;
  return saved.map((f, i) => {
    const moved = transformFurniture(t, f);
    let size: Vec3 = [f.size[0] + n(noise.size), f.size[1] + n(noise.size), f.size[2] + n(noise.size)];
    let yaw = moved.yaw + n(noise.yaw);
    const k = relabel ? Math.floor(rand() * 4) : 0; // the runtime may report the box rotated by k·90°
    if (k % 2 === 1) size = [size[2], size[1], size[0]];
    yaw += (k * Math.PI) / 2;
    return {
      ...moved,
      id: `cur-${i}`,
      center: [moved.center[0] + n(noise.pos), moved.center[1] + n(noise.pos / 2), moved.center[2] + n(noise.pos)],
      size,
      yaw: wrapAngle(yaw),
    };
  });
}

function expectClose(r: RigidTransform | null, t: RigidTransform, posTol = 0.08, yawTol = 2.5 * DEG) {
  expect(r).not.toBeNull();
  expect(Math.abs(wrapAngle(r!.yaw - t.yaw))).toBeLessThan(yawTol);
  expect(Math.abs(r!.tx - t.tx)).toBeLessThan(posTol);
  expect(Math.abs(r!.tz - t.tz)).toBeLessThan(posTol);
}

describe('transform algebra', () => {
  it('wrapAngle into (−π, π]', () => {
    expect(wrapAngle(0)).toBe(0);
    expect(wrapAngle(Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-3 * Math.PI / 2)).toBeCloseTo(Math.PI / 2);
    expect(wrapAngle(7)).toBeCloseTo(7 - 2 * Math.PI);
    expect(composeYaw(Math.PI * 0.75, Math.PI * 0.5)).toBeCloseTo(-Math.PI * 0.75);
  });
  it('applyTransform, invert and compose', () => {
    const t = T(90, 1, 2);
    const p: Vec3 = [1, 0.5, 0];
    const q = applyTransform(t, p);
    expect(q[0]).toBeCloseTo(1);
    expect(q[1]).toBe(0.5); // Y untouched
    expect(q[2]).toBeCloseTo(1); // (1,0) rotated +90° → (0,−1), + (1,2)
    const back = applyTransform(invert(t), q);
    back.forEach((v, i) => expect(v).toBeCloseTo(p[i]));
    const a = T(30, 0.5, -1);
    const b = T(-75, 2, 0.3);
    const ab = compose(a, b);
    const direct = applyTransform(a, applyTransform(b, p));
    applyTransform(ab, p).forEach((v, i) => expect(v).toBeCloseTo(direct[i]));
    const id = compose(t, invert(t));
    expect(id.yaw).toBeCloseTo(0);
    expect(id.tx).toBeCloseTo(0);
    expect(id.tz).toBeCloseTo(0);
    expect(applyTransform(IDENTITY, p)).toEqual(p);
  });
  it('transformFurniture moves the centre and composes the yaw', () => {
    const f = room()[0];
    const g = transformFurniture(T(90, 0, 0), f);
    expect(g.yaw).toBeCloseTo(Math.PI / 2);
    expect(g.center[0]).toBeCloseTo(f.center[2] * 1); // x' = z·sin90
    expect(g.id).toBe(f.id);
  });
});

describe('registerRoom', () => {
  it('exact identity', () => {
    const r = registerRoom(room(), room());
    expectClose(r, IDENTITY, 1e-6, 1e-6);
    expect(r!.inliers).toBe(10);
    expect(r!.rmsError).toBeLessThan(1e-6);
    expect(r!.confidence).toBeGreaterThan(0.95);
    expect(r!.matches).toContainEqual({ saved: 'desk', current: 'desk' });
  });

  it('recovers random transforms with noise and 90° box relabelling (50 trials)', () => {
    const rand = mulberry32(2026);
    for (let trial = 0; trial < 50; trial++) {
      const t = T(rand() * 360 - 180, rand() * 6 - 3, rand() * 6 - 3);
      const cur = observe(room(), t, rand);
      const r = registerRoom(room(), cur);
      expectClose(r, t);
      expect(r!.inliers).toBeGreaterThanOrEqual(9);
      expect(r!.rmsError).toBeLessThan(0.06);
      expect(r!.confidence).toBeGreaterThan(0.6);
      // Matches map every saved box to its true counterpart.
      for (const m of r!.matches) expect(m.current).toBe(`cur-${room().findIndex((f) => f.id === m.saved)}`);
    }
  });

  it('30 % of the furniture missing + extra furniture', () => {
    const rand = mulberry32(7);
    for (let trial = 0; trial < 30; trial++) {
      const t = T(rand() * 360 - 180, rand() * 4 - 2, rand() * 4 - 2);
      const all = observe(room(), t, rand);
      const kept = all.filter(() => rand() > 0.3);
      if (kept.length < 3) continue;
      const extras: Furniture[] = [
        { id: 'x1', label: 'table', center: [rand() * 6 - 3, 0.37, rand() * 6 - 3], size: [0.8, 0.74, 0.8], yaw: 0, name: 'side table' },
        { id: 'x2', label: 'chair', center: [rand() * 6 - 3, 0.45, rand() * 6 - 3], size: [0.5, 0.9, 0.5], yaw: 1, name: 'chair 2' },
        { id: 'x3', label: 'other', center: [rand() * 6 - 3, 0.2, rand() * 6 - 3], size: [0.3, 0.4, 0.3], yaw: 0, name: 'box' },
      ];
      const r = registerRoom(room(), [...kept, ...extras]);
      expectClose(r, t, 0.1, 3 * DEG);
      expect(r!.inliers).toBeGreaterThanOrEqual(kept.length - 1);
    }
  });

  it('duplicate labels: 4 identical tables + a couch', () => {
    const tbl = (id: string, x: number, z: number): Furniture => ({ id, label: 'table', center: [x, 0.375, z], size: [1.2, 0.75, 0.6], yaw: 0, name: id });
    const saved = [tbl('t1', -2, -2), tbl('t2', 0.5, -2.2), tbl('t3', 2.2, -0.3), tbl('t4', -1.2, 1.5), { id: 'c', label: 'couch' as const, center: [0.8, 0.42, 1.9] as Vec3, size: [2, 0.85, 0.9] as Vec3, yaw: 0, name: 'couch' }];
    const rand = mulberry32(11);
    for (let trial = 0; trial < 30; trial++) {
      const t = T(rand() * 360 - 180, rand() * 4 - 2, rand() * 4 - 2);
      const cur = observe(saved, t, rand);
      // shuffle so ids do not reveal the correspondence
      cur.sort(() => rand() - 0.5);
      const r = registerRoom(saved, cur);
      expectClose(r, t);
      expect(r!.inliers).toBe(5);
    }
  });

  it('only tables (all the same label), no couch', () => {
    const tbl = (id: string, x: number, z: number): Furniture => ({ id, label: 'table', center: [x, 0.375, z], size: [1.2, 0.75, 0.6], yaw: 0, name: id });
    const saved = [tbl('t1', -2, -2), tbl('t2', 0.5, -2.2), tbl('t3', 2.2, -0.3), tbl('t4', -1.2, 1.5)];
    const t = T(137, 1.1, -0.7);
    const r = registerRoom(saved, observe(saved, t, mulberry32(3)));
    expectClose(r, t);
  });

  it('two objects: pair hypothesis', () => {
    const saved = room().slice(0, 2);
    const t = T(-120, 0.4, 2.5);
    const r = registerRoom(saved, observe(saved, t, mulberry32(5)));
    expectClose(r, t, 0.1, 4 * DEG);
    expect(r!.inliers).toBe(2);
    expect(r!.confidence).toBeLessThan(0.9);
  });

  it('degenerate: one object → its own yaw and centre, low confidence (180° ambiguity)', () => {
    const saved = [room()[0]];
    const t = T(40, 1, -1);
    const cur = observe(saved, t, mulberry32(9), { pos: 0, yaw: 0, size: 0 }, false);
    const r = registerRoom(saved, cur)!;
    expect(r.inliers).toBe(1);
    const yawErr = Math.abs(wrapAngle(r.yaw - t.yaw));
    expect(Math.min(yawErr, Math.abs(yawErr - Math.PI))).toBeLessThan(1e-6);
    // The centre always maps exactly.
    applyTransform(r, saved[0].center).forEach((v, i) => expect(v).toBeCloseTo(cur[0].center[i]));
    expect(r.confidence).toBeLessThan(0.3);
    // Prefers the rotation closest to identity.
    expect(r.yaw).toBeCloseTo(t.yaw);
  });

  it('square footprints (lamp only) still align the centre', () => {
    const lamp = [room()[3]];
    const cur = observe(lamp, T(10, 0.5, 0.5), mulberry32(1), { pos: 0, yaw: 0, size: 0 }, false);
    const r = registerRoom(lamp, cur)!;
    applyTransform(r, lamp[0].center).forEach((v, i) => expect(v).toBeCloseTo(cur[0].center[i]));
    expect(r.confidence).toBeLessThan(0.3);
  });

  it('returns null when nothing can be matched', () => {
    expect(registerRoom([], room())).toBeNull();
    expect(registerRoom(room(), [])).toBeNull();
    expect(registerRoom([], [])).toBeNull();
    expect(registerRoom(null as unknown as Furniture[], room())).toBeNull();
    const bed = [room()[2]];
    const couch = [room()[1]];
    expect(registerRoom(bed, couch)).toBeNull(); // different labels
    const hugeBed = [{ ...room()[2], size: [3, 0.6, 3] as Vec3 }];
    expect(registerRoom(bed, hugeBed)).toBeNull(); // same label, incompatible size
  });

  it('ignores manual anchors and invalid boxes', () => {
    const saved = [...room(), { id: 'm', label: 'manual' as const, center: [0, 1, -2] as Vec3, size: [0.1, 0.1, 0.1] as Vec3, yaw: 0, name: 'm' }];
    const bad = { id: 'bad', label: 'table' as const, center: [NaN, 0, 0] as Vec3, size: [1, 1, 1] as Vec3, yaw: 0, name: 'bad' };
    const t = T(33, -1, 0.5);
    const cur = [...observe(room(), t, mulberry32(4)), bad];
    const r = registerRoom(saved, cur);
    expectClose(r, t);
    expect(r!.matches.some((m) => m.saved === 'm' || m.current === 'bad')).toBe(false);
  });

  it('a moved object does not fool the consensus', () => {
    const t = T(75, 0.3, -0.2);
    const cur = observe(room(), t, mulberry32(8));
    cur[0] = { ...cur[0], center: [cur[0].center[0] + 1.5, cur[0].center[1], cur[0].center[2] - 1] }; // desk moved
    const r = registerRoom(room(), cur);
    expectClose(r, t);
    expect(r!.inliers).toBe(9);
  });

  it('samples pair hypotheses deterministically when there are many', () => {
    const rand = mulberry32(12);
    const chairs: Furniture[] = Array.from({ length: 14 }, (_, i) => ({ id: `c${i}`, label: 'chair', center: [rand() * 8 - 4, 0.45, rand() * 8 - 4], size: [0.5, 0.9, 0.5], yaw: rand() * 6, name: `c${i}` }));
    const t = T(-50, 1, 1);
    const cur = observe(chairs, t, rand, { pos: 0.02, yaw: 2 * DEG, size: 0.01 });
    const a = registerRoom(chairs, cur, { maxPairHypotheses: 400 });
    const b = registerRoom(chairs, cur, { maxPairHypotheses: 400 });
    expect(a).toEqual(b);
    expectClose(a, t, 0.1, 3 * DEG);
  });
});
