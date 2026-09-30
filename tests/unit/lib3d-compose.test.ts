import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import type { AnimId, SceneRecipe } from '../../src/core/types';
import { composeScene, pickRelation, countLayout } from '../../src/lib3d/compose';
import { applyAnim, initAnim, ANIM_IDS } from '../../src/lib3d/anims';
import { SPECS as animals } from '../../src/lib3d/models/animals';

const S = 0.3;
const inCube = (b: THREE.Box3, tol = 0.012) =>
  b.min.x >= -S / 2 - tol && b.max.x <= S / 2 + tol && b.min.z >= -S / 2 - tol && b.max.z <= S / 2 + tol && b.min.y >= -tol - 0.03 && b.max.y <= S + tol;

/** Sample the world-space box of every mesh while the scene animates. */
function sampledBox(cs: ReturnType<typeof composeScene>, k: number) {
  const box = new THREE.Box3().makeEmpty();
  const tmp = new THREE.Box3();
  cs.setIntensity(k);
  for (let i = 0; i < 30; i++) {
    cs.update(0.05, i * 0.173);
    cs.root.updateMatrixWorld(true);
    cs.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh) return;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      tmp.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld);
      if (m.matrixWorld.getMaxScaleOnAxis() > 1e-3) box.union(tmp);
    });
  }
  return box;
}

const ONBOARDING: SceneRecipe[] = [
  { caption: 'A KANGAROO bouncing on a CAN', actors: [{ model: 'kangaroo', role: 'hero', anim: 'bounce' }, { model: 'can', role: 'prop', anim: 'idle' }] },
  { caption: 'Swiss CHEESE wobbling over a FIRE', actors: [{ model: 'cheese', role: 'hero', anim: 'wobble' }, { model: 'fire', role: 'prop', anim: 'idle' }] },
  { caption: 'A TURKEY clinging to a swinging ANCHOR', actors: [{ model: 'turkey', role: 'hero', anim: 'shake' }, { model: 'anchor', role: 'prop', anim: 'wobble' }] },
  { caption: 'An OTTER riding a WAVE', actors: [{ model: 'otter', role: 'hero', anim: 'float' }, { model: 'wave', role: 'prop', anim: 'idle' }] },
  { caption: 'A SHEEP marching inside a BOOT', actors: [{ model: 'sheep', role: 'hero', anim: 'march' }, { model: 'boot', role: 'prop', anim: 'idle' }] },
];

describe('pickRelation', () => {
  it('uses the pairing table', () => {
    expect(pickRelation('bounce', 'can')).toBe('on');
    expect(pickRelation('march', 'boot')).toBe('in');
    expect(pickRelation('shake', 'anchor')).toBe('cling');
    expect(pickRelation('idle', 'crown')).toBe('wear');
    expect(pickRelation('wobble', 'fire')).toBe('below');
    expect(pickRelation('idle', 'sun')).toBe('behind');
  });
  it('falls back to shape: flat & wide props become a base', () => {
    expect(pickRelation('idle', 'mystery', [1, 0.2, 0.8])).toBe('on');
    expect(pickRelation('idle', 'mystery', [0.5, 1, 0.5])).toBe('beside');
  });
  it('travelling heroes never ride', () => {
    expect(pickRelation('fly', 'can')).toBe('beside');
    expect(pickRelation('orbit', 'boot')).toBe('beside');
  });
});

describe('countLayout', () => {
  const hero = { x: 0, y: 0, z: 0, w: 0.15, h: 0.2, d: 0.12 };
  for (const anim of ['juggle', 'orbit', 'stack', 'rain', 'bounce', 'fly'] as AnimId[]) {
    it(`${anim}: one position per copy, finite`, () => {
      const l = countLayout(anim, 6, S, hero, { dim: [1, 0.8, 0.6] });
      expect(l.pos).toHaveLength(6);
      expect(l.pos.flat().every(Number.isFinite)).toBe(true);
      expect(l.size).toBeGreaterThan(0);
    });
  }
  it('stack copies fit the cube height', () => {
    const l = countLayout('stack', 8, S, hero, { dim: [1, 1, 1] });
    expect(l.size * 8).toBeLessThanOrEqual(0.8 * S + 1e-9);
  });
});

describe('applyAnim', () => {
  it('every anim moves the root deterministically and keeps joints bounded', () => {
    const spec = animals.find((s) => s.id === 'dog')!;
    for (const anim of ANIM_IDS) {
      const a = spec.build({});
      const b = spec.build({});
      for (const r of [a, b]) initAnim(r, { size: S, dim: [1, 1, 1] });
      applyAnim(a, anim, 1.37, 2, { index: 1, count: 3, phase: 0.2 });
      applyAnim(b, anim, 1.37, 2, { index: 1, count: 3, phase: 0.2 });
      expect(a.position.toArray()).toEqual(b.position.toArray());
      expect(a.rotation.toArray()).toEqual(b.rotation.toArray());
      a.traverse((o) => { for (const v of [o.rotation.x, o.rotation.y, o.rotation.z]) expect(Number.isFinite(v)).toBe(true); });
    }
  });
  it('resets joints every frame (no drift)', () => {
    const spec = animals.find((s) => s.id === 'rooster')!;
    const r = spec.build({});
    initAnim(r, { size: S });
    applyAnim(r, 'march', 0.5, 1, { index: 0, count: 1, phase: 0 });
    const x1 = r.getObjectByName('legL')?.rotation.x;
    for (let i = 0; i < 10; i++) applyAnim(r, 'march', 0.5, 1, { index: 0, count: 1, phase: 0 });
    expect(r.getObjectByName('legL')?.rotation.x).toBe(x1);
  });
});

describe('composeScene', () => {
  for (const recipe of ONBOARDING) {
    it(`onboarding: ${recipe.caption}`, () => {
      const cs = composeScene(recipe);
      expect(cs.stats.tris).toBeLessThanOrEqual(6000);
      expect(cs.stats.meshes).toBeLessThanOrEqual(12);
      expect(inCube(cs.bounds)).toBe(true);
      const b = sampledBox(cs, 2);
      if (process.env.LIB3D_STATS) console.log(recipe.caption, cs.relation, cs.stats, b.min.toArray().map((v) => v.toFixed(3)), b.max.toArray().map((v) => v.toFixed(3)));
      expect(inCube(b, 0.03)).toBe(true);
      cs.dispose();
    });
  }

  it('picks the smart relations for the onboarding pairs', () => {
    expect(ONBOARDING.map((r) => composeScene(r).relation)).toEqual(['on', 'below', 'cling', 'on', 'in']);
  });

  it('instances many copies into one draw call', () => {
    const cs = composeScene({ caption: 'avocado juggling 6 balls', actors: [{ model: 'avocado', role: 'hero', anim: 'juggle' }, { model: 'apple', role: 'count', count: 6, anim: 'juggle' }] });
    const inst: THREE.InstancedMesh[] = [];
    cs.root.traverse((o) => { if ((o as THREE.InstancedMesh).isInstancedMesh) inst.push(o as THREE.InstancedMesh); });
    expect(inst).toHaveLength(1);
    expect(inst[0].count).toBe(6);
    expect(cs.stats.meshes).toBeLessThanOrEqual(4);
    cs.update(0.016, 2);
    expect(inCube(sampledBox(cs, 2), 0.03)).toBe(true);
  });

  it('every anim on a hero stays inside the cube at intensity 2', () => {
    for (const anim of ANIM_IDS) {
      const cs = composeScene({ caption: anim, actors: [{ model: 'bear', role: 'hero', anim }] });
      const b = sampledBox(cs, 2);
      if (process.env.LIB3D_STATS) console.log(anim, b.min.toArray().map((v) => v.toFixed(3)), b.max.toArray().map((v) => v.toFixed(3)), 'size', b.getSize(new THREE.Vector3()).toArray().map((v) => v.toFixed(3)));
      expect(inCube(b, 0.03), anim).toBe(true);
    }
  });

  it('unknown ids fall back gracefully with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cs = composeScene({ caption: '?', actors: [{ model: 'definitely-not-a-model', role: 'hero', anim: 'spin' }, { model: 'nope', role: 'count', count: 5, anim: 'rain' }] });
    expect(cs.root.children.length).toBeGreaterThan(0);
    expect(() => cs.update(0.016, 1)).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('shares geometry between scenes (prototype cache)', () => {
    const a = composeScene({ caption: 'a', actors: [{ model: 'frog', role: 'hero', anim: 'bounce' }] });
    const b = composeScene({ caption: 'b', actors: [{ model: 'frog', role: 'hero', anim: 'idle' }] });
    const geo = (r: THREE.Object3D) => (r.getObjectByProperty('isMesh', true) as THREE.Mesh).geometry;
    expect(geo(a.root)).toBe(geo(b.root));
  });

  it('update does not allocate new objects per frame (stable children)', () => {
    const cs = composeScene(ONBOARDING[0]);
    const before = cs.root.children.length;
    for (let i = 0; i < 100; i++) cs.update(0.016, i * 0.016);
    expect(cs.root.children.length).toBe(before);
  });
});
