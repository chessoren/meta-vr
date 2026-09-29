import type { ModelSpec } from '../spec';
import { lathe, cyl, extrude, model, joint, PAL } from '../kit';

/** Models of this category. Each entry: id, name, tags, soundsLike, anims, build(). */
export const SPECS: ModelSpec[] = [
  {
    id: 'apple',
    name: 'Apple',
    category: 'food',
    tags: ['apple', 'fruit', 'newton', 'gravity', 'health', 'teacher', 'new york', 'temptation'],
    soundsLike: ['app', 'appl', 'pomme', 'pom'],
    anims: ['bounce', 'spin', 'rain', 'juggle'],
    build: (o) => {
      const body = lathe(
        [[0, 0.01], [0.05, 0], [0.085, 0.03], [0.1, 0.07], [0.095, 0.11], [0.07, 0.14], [0.03, 0.135], [0, 0.12]],
        o.tint ?? PAL.red,
        { seg: 12 },
      );
      const stem = cyl(0.006, 0.008, 0.045, PAL.woodDark, { pos: [0, 0.15, 0], rot: [0, 0, 0.2], seg: 5 });
      const leaf = joint('head', [0.012, 0.16, 0], [
        extrude([[0, 0], [0.03, 0.012], [0.055, 0], [0.03, -0.012]], 0.004, PAL.green, { pos: [0.012, 0.16, 0], rot: [0, 0.3, 0.5] }),
      ]);
      return model('apple', [body, stem], [leaf]);
    },
    idle: (root, t, k) => {
      const leaf = root.getObjectByName('head');
      if (leaf) leaf.rotation.z = Math.sin(t * 3) * 0.15 * k;
    },
  },
];
