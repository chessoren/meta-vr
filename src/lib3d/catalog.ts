import type { ModelSpec } from './spec';
import { SPECS as animals } from './models/animals';
import { SPECS as people } from './models/people';
import { SPECS as food } from './models/food';
import { SPECS as nature } from './models/nature';
import { SPECS as science } from './models/science';
import { SPECS as objects } from './models/objects';
import { SPECS as vehicles } from './models/vehicles';
import { SPECS as structures } from './models/structures';

export const CATALOG: ModelSpec[] = [...animals, ...people, ...food, ...nature, ...science, ...objects, ...vehicles, ...structures];

const byId = new Map(CATALOG.map((s) => [s.id, s]));
export function getModel(id: string): ModelSpec | undefined {
  return byId.get(id);
}

/** Required ids (the contract shared with palaces, the AI prompt and the offline composer). */
export const REQUIRED_IDS = {
  animals: ['kangaroo', 'elephant', 'owl', 'cat', 'dog', 'fish', 'dove', 'eagle', 'bear', 'lion', 'rooster', 'frog', 'snail', 'bee', 'penguin', 'horse'],
  people: ['soldier', 'king', 'sailor', 'pilot', 'scientist', 'knight'],
  food: ['avocado', 'apple', 'banana', 'cheese', 'cake', 'teacup', 'pizza'],
  nature: ['tree', 'mountain', 'sun', 'moon', 'star', 'cloud', 'lightning', 'snowflake', 'fire', 'wave'],
  science: ['globe', 'atom', 'flask', 'telescope', 'magnet', 'lightbulb'],
  objects: ['book', 'clock', 'bell', 'crown', 'sword', 'shield', 'key', 'coin', 'trophy', 'candle', 'umbrella', 'tophat', 'ball', 'dice', 'anchor', 'gear', 'hammer', 'envelope', 'telephone', 'radio', 'medal', 'poppy', 'helmet', 'cannon', 'scroll', 'flag', 'sign', 'plaque'],
  vehicles: ['tank', 'biplane', 'zeppelin', 'ship', 'submarine', 'train', 'car', 'rocket', 'balloon'],
  structures: ['castle', 'tower', 'pyramid', 'bridge', 'brickwall', 'house', 'tent'],
} as const;
export const ALL_REQUIRED_IDS: string[] = Object.values(REQUIRED_IDS).flat();
