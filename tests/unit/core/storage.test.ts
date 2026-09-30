import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  STORE_KEY,
  allPalaces,
  deletePalace,
  deserialize,
  emptyStore,
  getProgress,
  migrate,
  serialize,
  setExamDate,
  upsertPalace,
  upsertProgress,
  upsertRoom,
  type Store,
} from '../../../src/core/storage';
import { BUILTIN_PALACES, CAPITALS } from '../../../src/core/palaces';
import { newReview, applyReview } from '../../../src/core/srs';
import type { Palace, PalaceProgress, RoomModel } from '../../../src/core/types';

const room: RoomModel = {
  id: 'room1',
  createdAt: 1,
  updatedAt: 2,
  furniture: [{ id: 'desk', label: 'table', center: [1, 0.4, -2], size: [1.2, 0.75, 0.6], yaw: 0.1, name: 'Desk' }],
  seat: [0, 0, 0],
  seatYaw: 0.5,
  anchorUuid: 'anchor-123',
};
const imported: Palace = {
  id: 'bio',
  title: 'Biology',
  subject: 'Biology',
  lang: 'fr',
  createdAt: 5,
  examDate: '2026-11-10',
  notions: [
    {
      id: 'n1',
      question: 'Organite de la respiration cellulaire ?',
      answer: 'Mitochondrie',
      accept: ['la mitochondrie'],
      distractors: ['Ribosome', 'Noyau'],
      scene: { actors: [{ model: 'owl', role: 'hero', anim: 'float' }], caption: 'A giant OWL', hooks: ['OWL'], accent: '#ffaa00' },
    },
  ],
};
const review = applyReview(newReview('n1', 1000), 'good', 'voice', 2000);
const progress: PalaceProgress = {
  palaceId: 'bio',
  roomId: 'room1',
  placements: [{ notionId: 'n1', furnitureId: 'desk', local: [0, 0.4, 0], order: 0, placedAt: 1000 }],
  reviews: { n1: review },
  lastSessionAt: 3000,
};
const full = (): Store => ({
  version: 1,
  rooms: [room],
  palaces: [imported],
  progress: [progress],
  activePalaceId: 'bio',
  flow: { step: 'recall', index: 3, nested: { ok: true } },
  settings: { voice: false, sound: true, handedness: 'left' },
  onboardingDone: true,
  examDates: { capitals: '2026-12-01' },
});

describe('store basics', () => {
  it('empty store', () => {
    expect(emptyStore()).toEqual({ version: 1, rooms: [], palaces: [], progress: [], settings: { voice: true, sound: true }, onboardingDone: false });
    expect(emptyStore()).not.toBe(emptyStore());
    expect(STORE_KEY).toBe('loci.store');
    expect(DEFAULT_SETTINGS).toEqual({ voice: true, sound: true });
  });
  it('round-trips through serialize/deserialize unchanged', () => {
    const s = full();
    expect(deserialize(serialize(s))).toEqual(s);
    expect(migrate(s)).toEqual(s);
    expect(migrate(migrate(s))).toEqual(s);
  });
});

describe('migrate is robust (never throws)', () => {
  it.each([undefined, null, 0, 42, true, 'garbage', '{not json', '[]', '"str"', [], [1, 2], () => 1, Symbol('x')])('%s → empty store', (raw) => {
    expect(migrate(raw)).toEqual(emptyStore());
  });
  it('deserialize of nothing', () => {
    expect(deserialize(null)).toEqual(emptyStore());
    expect(deserialize('')).toEqual(emptyStore());
    expect(deserialize(undefined)).toEqual(emptyStore());
  });
  it('drops invalid entries, keeps valid ones, repairs fields', () => {
    const raw = {
      version: 1,
      rooms: [room, { id: '' }, null, { id: 'r2', furniture: [{ id: 'x', center: [0, 0], size: [1, 1, 1] }, { id: 'y', label: 'sofa??', center: [0, 0, 0], size: [1, 1, 1] }] }],
      palaces: [
        imported,
        { id: 'bad' }, // no notions → kept but empty
        { title: 'no id' },
        { ...CAPITALS }, // builtin → dropped
        {
          id: 'p2',
          lang: 'de',
          examDate: '2026-02-31',
          notions: [
            { id: 'a', question: 'Q?', answer: 'A', distractors: ['B', 'C'], scene: { actors: [], caption: '' } }, // scene regenerated
            { id: 'a', question: 'dup', answer: 'x', distractors: ['y', 'z'] }, // duplicate id → dropped
            { id: 'b', question: 'Q?', answer: 'A', distractors: ['B'] }, // one distractor → dropped
            { id: 'c', question: '', answer: 'A', distractors: ['B', 'C'] }, // no question → dropped
            {
              id: 'd',
              question: 'Q?',
              answer: 'A',
              distractors: ['B', 'C', 'D'],
              accept: ['a', 3, ''],
              scene: {
                actors: [
                  { model: 'cat', role: 'count', anim: 'teleport', count: 99, scale: 50, tint: 'red', label: 'x'.repeat(60) },
                  { model: 'dog' },
                  { model: '' },
                  { model: 'owl' },
                  { model: 'bee' },
                ],
                caption: 'ok',
                hooks: ['OK', 5],
                accent: 'blue',
              },
            },
          ],
        },
      ],
      progress: [progress, { palaceId: 'x' }, { palaceId: 'p', roomId: 'r', reviews: { a: { log: [{ at: 5, grade: 'good', mode: 'telepathy' }, { at: 'x' }, { at: 1, grade: 'meh' }] }, b: 'nope' }, placements: [{ notionId: 'a', furnitureId: 'f' }, { notionId: 'a', furnitureId: 'g' }, { notionId: 'b' }] }],
      settings: { voice: 'yes', sound: false, handedness: 'both' },
      onboardingDone: 'true',
      activePalaceId: '',
      examDates: { a: '2026-10-10', b: 'soon', c: 5 },
      flow: { fn: 1 },
    };
    const s = migrate(raw);
    expect(s.rooms.map((r) => r.id)).toEqual(['room1', 'r2']);
    expect(s.rooms[0].anchorUuid).toBe('anchor-123');
    expect(s.rooms[1]).toMatchObject({ seat: [0, 0, 0], seatYaw: 0, createdAt: 0, updatedAt: 0 });
    expect(s.rooms[1].furniture).toEqual([{ id: 'y', label: 'other', center: [0, 0, 0], size: [1, 1, 1], yaw: 0, name: 'other' }]);
    expect(s.palaces.map((p) => p.id)).toEqual(['bio', 'bad', 'p2']);
    const p2 = s.palaces[2];
    expect(p2.lang).toBe('en');
    expect(p2.examDate).toBeUndefined();
    expect(p2.title).toBe('Untitled palace');
    expect(p2.notions.map((n) => n.id)).toEqual(['a', 'd']);
    expect(p2.notions[0].scene.actors.length).toBeGreaterThan(0); // regenerated by composeScene
    const d = p2.notions[1];
    expect(d.distractors).toEqual(['B', 'C']);
    expect(d.accept).toEqual(['a']);
    expect(d.scene.actors).toHaveLength(3);
    expect(d.scene.actors[0]).toEqual({ model: 'cat', role: 'count', anim: 'idle', count: 12, scale: 5, label: 'x'.repeat(40) });
    expect(d.scene.actors[1]).toEqual({ model: 'dog', role: 'prop', anim: 'idle' });
    expect(d.scene.hooks).toEqual(['OK']);
    expect(d.scene.accent).toBeUndefined();
    expect(s.progress).toHaveLength(2);
    const pr = s.progress[1];
    expect(pr.reviews.a.log).toEqual([{ at: 5, grade: 'good', mode: 'bubble' }]);
    expect(pr.reviews.a).toMatchObject({ notionId: 'a', ease: 2.5, intervalDays: 0, streak: 0, lapses: 0 });
    expect(pr.reviews.b).toBeUndefined();
    expect(pr.placements).toEqual([{ notionId: 'a', furnitureId: 'f', local: [0, 0, 0], order: 0, placedAt: 0 }]);
    expect(s.settings).toEqual({ voice: true, sound: false });
    expect(s.onboardingDone).toBe(false);
    expect(s.activePalaceId).toBeUndefined();
    expect(s.examDates).toEqual({ a: '2026-10-10' });
    expect(s.flow).toEqual({ fn: 1 });
  });
  it('drops non-object entries at every level', () => {
    const s = migrate({
      version: 1,
      rooms: [{ id: 'r', furniture: [1, 'x', null] }],
      palaces: [{ id: 'p', notions: [1, { id: 'n', question: 'Q', answer: 'A', distractors: ['B', 'C'], scene: { actors: ['cat', { model: 'cat' }], caption: 'c' } }] }],
      progress: ['x', { palaceId: 'p', roomId: 'r', reviews: [], placements: [7] }, { palaceId: 'p', roomId: 'r2', reviews: { a: { log: ['x'] } } }],
    });
    expect(s.rooms[0].furniture).toEqual([]);
    expect(s.palaces[0].notions[0].scene.actors).toEqual([{ model: 'cat', role: 'prop', anim: 'idle' }]);
    expect(s.progress[0]).toEqual({ palaceId: 'p', roomId: 'r', placements: [], reviews: {} });
    expect(s.progress[1].reviews.a.log).toEqual([]);
  });
  it('keeps the last duplicate and sorts review logs', () => {
    const s = migrate({ version: 1, rooms: [{ ...room, seatYaw: 1 }, { ...room, seatYaw: 2 }], progress: [{ ...progress, reviews: { n1: { ...review, log: [{ at: 9, grade: 'good', mode: 'voice' }, { at: 3, grade: 'again', mode: 'voice' }] } } }] });
    expect(s.rooms).toHaveLength(1);
    expect(s.rooms[0].seatYaw).toBe(2);
    expect(s.progress[0].reviews.n1.log.map((l) => l.at)).toEqual([3, 9]);
  });
  it('drops a non-serialisable flow', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(migrate({ version: 1, flow: cyclic }).flow).toBeUndefined();
    const big = { version: 1, flow: 10n as unknown };
    expect(migrate(big).flow).toBeUndefined();
  });
  it('migrates version 0 (pre-release) stores', () => {
    const v0 = {
      room,
      palaces: [imported, CAPITALS],
      progress: { bio: { roomId: 'room1', placements: progress.placements, reviews: progress.reviews } },
      onboarded: true,
      voice: false,
      sound: false,
    };
    const s = migrate(v0);
    expect(s.version).toBe(1);
    expect(s.rooms.map((r) => r.id)).toEqual(['room1']);
    expect(s.palaces.map((p) => p.id)).toEqual(['bio']);
    expect(s.progress).toEqual([{ palaceId: 'bio', roomId: 'room1', placements: progress.placements, reviews: progress.reviews }]);
    expect(s.onboardingDone).toBe(true);
    expect(s.settings).toEqual({ voice: false, sound: false });
    expect(migrate(JSON.stringify(v0))).toEqual(s);
  });
  it('reads newer versions best-effort', () => {
    const s = migrate({ ...full(), version: 7, somethingNew: [1, 2, 3] });
    expect(s).toEqual(full());
  });
  it('survives a hostile getter', () => {
    const evil = {
      version: 1,
      get rooms() {
        throw new Error('boom');
      },
    };
    expect(migrate(evil)).toEqual(emptyStore());
  });
});

describe('helpers', () => {
  it('getProgress returns stored or fresh progress without inserting', () => {
    const s = full();
    expect(getProgress(s, 'bio', 'room1')).toBe(s.progress[0]);
    const fresh = getProgress(s, 'capitals', 'room1');
    expect(fresh).toEqual({ palaceId: 'capitals', roomId: 'room1', placements: [], reviews: {} });
    expect(s.progress).toHaveLength(1);
  });
  it('upsertProgress adds or replaces', () => {
    const s = full();
    const p2 = { ...progress, lastSessionAt: 9 };
    const s2 = upsertProgress(s, p2);
    expect(s2.progress).toEqual([p2]);
    const s3 = upsertProgress(s2, { palaceId: 'capitals', roomId: 'room1', placements: [], reviews: {} });
    expect(s3.progress).toHaveLength(2);
    expect(s.progress[0].lastSessionAt).toBe(3000); // immutable
  });
  it('upsertPalace adds/replaces imported palaces; builtins only store their exam date', () => {
    const s = emptyStore();
    const s1 = upsertPalace(s, imported);
    expect(s1.palaces).toEqual([imported]);
    const renamed = { ...imported, title: 'Bio 2' };
    const s2 = upsertPalace(s1, renamed);
    expect(s2.palaces).toEqual([renamed]);
    const s3 = upsertPalace(s2, { ...CAPITALS, examDate: '2026-12-24' });
    expect(s3.palaces).toEqual([renamed]);
    expect(s3.examDates).toEqual({ capitals: '2026-12-24' });
    expect(s.palaces).toEqual([]);
  });
  it('setExamDate sets, validates and clears', () => {
    const s = setExamDate(emptyStore(), 'capitals', '2026-12-24');
    expect(s.examDates).toEqual({ capitals: '2026-12-24' });
    expect(setExamDate(s, 'capitals', 'nope').examDates).toBeUndefined();
    expect(setExamDate(s, 'capitals', undefined).examDates).toBeUndefined();
    expect(setExamDate(setExamDate(s, 'world-wars', '2026-12-01'), 'capitals', undefined).examDates).toEqual({ 'world-wars': '2026-12-01' });
  });
  it('deletePalace removes the palace, its progress, exam date and active flag', () => {
    const s = deletePalace(full(), 'bio');
    expect(s.palaces).toEqual([]);
    expect(s.progress).toEqual([]);
    expect(s.activePalaceId).toBeUndefined();
    expect(s.examDates).toEqual({ capitals: '2026-12-01' });
    const s2 = deletePalace(full(), 'capitals');
    expect(s2.examDates).toBeUndefined();
    expect(s2.activePalaceId).toBe('bio');
    expect(s2.palaces).toHaveLength(1);
  });
  it('upsertRoom', () => {
    const s = upsertRoom(upsertRoom(emptyStore(), room), { ...room, seatYaw: 3 });
    expect(s.rooms).toHaveLength(1);
    expect(s.rooms[0].seatYaw).toBe(3);
  });
  it('allPalaces: builtins with stored exam dates, then imported ones (no id clash)', () => {
    const s = upsertPalace(upsertPalace(full(), { ...imported, id: 'capitals' }), { ...imported, id: 'chem' });
    const all = allPalaces(s, [...BUILTIN_PALACES]);
    expect(all.map((p) => p.id)).toEqual(['capitals', 'world-wars', 'bio', 'chem']);
    expect(all[0].examDate).toBe('2026-12-01');
    expect(all[0].notions).toBe(CAPITALS.notions);
    expect(all[1].examDate).toBeUndefined();
    expect(CAPITALS.examDate).toBeUndefined();
  });
});
