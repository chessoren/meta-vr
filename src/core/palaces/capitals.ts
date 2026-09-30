/**
 * Onboarding palace: five "trick" capitals most adults get wrong (the famous big city is not the
 * capital). Each scene is a hand-crafted sound-alike, so the learner feels the method work in
 * under five minutes.
 */
import type { Palace } from '../types';

/** Fixed creation date so the built-in palace is byte-stable. */
const CREATED_AT = Date.UTC(2026, 8, 29);

export const CAPITALS: Palace = {
  id: 'capitals',
  title: 'Five tricky capitals',
  subject: 'Geography',
  lang: 'en',
  createdAt: CREATED_AT,
  builtin: true,
  notions: [
    {
      id: 'cap-australia',
      question: 'Capital of Australia?',
      answer: 'Canberra',
      accept: ['Camberra', 'Kanberra'],
      distractors: ['Sydney', 'Melbourne'],
      scene: {
        actors: [
          { model: 'kangaroo', role: 'hero', anim: 'bounce', scale: 1.1 },
          { model: 'can', role: 'prop', anim: 'wobble', scale: 1.3, tint: '#7b2d8e' },
        ],
        caption: 'A KANGAROO bouncing on a giant CAN of BERRIES — CAN-BERRA!',
        hooks: ['KANGAROO', 'CAN', 'BERRIES', 'CAN-BERRA'],
        accent: '#f5b942',
      },
    },
    {
      id: 'cap-switzerland',
      question: 'Capital of Switzerland?',
      answer: 'Bern',
      accept: ['Berne'],
      distractors: ['Zurich', 'Geneva'],
      scene: {
        actors: [
          { model: 'cheese', role: 'hero', anim: 'shake', scale: 1.2 },
          { model: 'fire', role: 'prop', anim: 'grow', scale: 1.1 },
        ],
        caption: 'A wheel of Swiss CHEESE on FIRE — it BURNS: BERN!',
        hooks: ['CHEESE', 'FIRE', 'BURNS', 'BERN'],
        accent: '#ff8a65',
      },
    },
    {
      id: 'cap-turkey',
      question: 'Capital of Turkey?',
      answer: 'Ankara',
      distractors: ['Istanbul', 'Izmir'],
      scene: {
        actors: [
          { model: 'turkey', role: 'hero', anim: 'shake', scale: 1.1 },
          { model: 'anchor', role: 'prop', anim: 'wobble', scale: 1.3 },
        ],
        caption: 'A TURKEY clinging to a swinging ANCHOR — ANCHOR-A: ANKARA!',
        hooks: ['TURKEY', 'ANCHOR', 'ANKARA'],
        accent: '#9fa8ff',
      },
    },
    {
      id: 'cap-canada',
      question: 'Capital of Canada?',
      answer: 'Ottawa',
      distractors: ['Toronto', 'Vancouver'],
      scene: {
        actors: [
          { model: 'otter', role: 'hero', anim: 'flip', scale: 1.1 },
          { model: 'wave', role: 'prop', anim: 'wobble', scale: 1.2, tint: '#4fc3f7' },
        ],
        caption: 'An OTTER splashing in the WATER — OTTA-WA: OTTAWA!',
        hooks: ['OTTER', 'WATER', 'OTTA-WA', 'OTTAWA'],
        accent: '#80deea',
      },
    },
    {
      id: 'cap-new-zealand',
      question: 'Capital of New Zealand?',
      answer: 'Wellington',
      distractors: ['Auckland', 'Christchurch'],
      scene: {
        actors: [
          { model: 'sheep', role: 'hero', anim: 'march', scale: 1.1 },
          { model: 'boot', role: 'count', anim: 'march', count: 4, tint: '#2e7d32' },
        ],
        caption: 'A SHEEP stomping around in four green WELLINGTON BOOTS — WELLINGTON!',
        hooks: ['SHEEP', 'WELLINGTON BOOTS', 'WELLINGTON'],
        accent: '#aed581',
      },
    },
  ],
};
