import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SPECS as animals } from '../../src/lib3d/models/animals';
import { SPECS as people } from '../../src/lib3d/models/people';
import { SPECS as food } from '../../src/lib3d/models/food';
import { SPECS as nature } from '../../src/lib3d/models/nature';
import { SPECS as science } from '../../src/lib3d/models/science';
import { REQUIRED_IDS } from '../../src/lib3d/catalog';
import { normalize, stats } from '../../src/lib3d/kit';
import { JOINTS } from '../../src/lib3d/spec';

const MINE = [...animals, ...people, ...food, ...nature, ...science];
const MY_IDS = [...REQUIRED_IDS.animals, ...REQUIRED_IDS.people, ...REQUIRED_IDS.food, ...REQUIRED_IDS.nature, ...REQUIRED_IDS.science];

describe('character & nature library', () => {
  it('covers every required id of its categories', () => {
    const have = new Set(MINE.map((s) => s.id));
    expect(MY_IDS.filter((id) => !have.has(id))).toEqual([]);
  });

  for (const spec of MINE) {
    describe(spec.id, () => {
      const root = spec.build({});
      const s = stats(root);
      if (process.env.LIB3D_STATS) console.log(`${spec.id.padEnd(12)} tris=${String(s.tris).padStart(5)} meshes=${s.meshes}`);

      it('fits the budget (≤ 2000 tris, ≤ 6 meshes)', () => {
        expect(s.tris).toBeLessThanOrEqual(2000);
        expect(s.meshes).toBeLessThanOrEqual(6);
      });

      it('has rich metadata', () => {
        expect(spec.tags.length).toBeGreaterThanOrEqual(6);
        expect(spec.soundsLike.length).toBeGreaterThanOrEqual(3);
        expect(spec.anims.length).toBeGreaterThanOrEqual(2);
        expect(spec.tags.every((t) => t === t.toLowerCase())).toBe(true);
      });

      it('builds deterministically and normalises into the cube', () => {
        const a = normalize(spec.build({}));
        const b = normalize(spec.build({}));
        const pa = (a.getObjectByProperty('isMesh', true) as THREE.Mesh).geometry.getAttribute('position').array;
        const pb = (b.getObjectByProperty('isMesh', true) as THREE.Mesh).geometry.getAttribute('position').array;
        expect(Array.from(pa.slice(0, 60))).toEqual(Array.from(pb.slice(0, 60)));
        a.updateMatrixWorld(true);
        const bb = new THREE.Box3().setFromObject(a);
        const d = bb.getSize(new THREE.Vector3());
        expect(Math.max(d.x, d.y, d.z)).toBeCloseTo(0.3, 3);
        expect(bb.min.y).toBeCloseTo(0, 4);
      });

      it('names animated parts with the joint convention', () => {
        const names: string[] = [];
        root.traverse((o) => { if (o.type === 'Group' && o !== root && o.name) names.push(o.name); });
        const known = new Set<string>([...JOINTS, 'normalized', `${spec.id}Body`]);
        expect(names.filter((n) => !known.has(n))).toEqual([]);
      });

      it('respects tint', () => {
        const col = (r: THREE.Object3D) => {
          const out: number[] = [];
          r.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) out.push(...Array.from(m.geometry.getAttribute('color').array)); });
          return out;
        };
        const tinted = spec.build({ tint: '#123456' });
        expect(col(tinted)).not.toEqual(col(spec.build({})));
      });

      if (spec.idle) {
        it('idle runs without throwing', () => {
          expect(() => spec.idle!(root, 1.3, 2)).not.toThrow();
        });
      }
    });
  }
});
