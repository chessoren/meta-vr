import type { Palace, PalaceProgress, RoomModel } from '../../core/types';
import { emptyStore, migrate, serialize, type Store } from '../../core/storage';
import { BUILTIN_PALACES, getBuiltinPalace } from '../../core/palaces';

/**
 * Headset persistence: one small versioned JSON document in localStorage, saved (debounced)
 * on every change and immediately when the headset is taken off or the session ends.
 */
const KEY = 'loci.store.v1';

export interface FlowSnapshot {
  kind: 'onboarding' | 'session';
  step: string;
  palaceId: string;
}

export class AppStore {
  data: Store;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private currentRoomId: string | null = null;

  constructor(private storage: Storage | null = safeLocalStorage()) {
    let raw: unknown = null;
    try {
      const s = this.storage?.getItem(KEY);
      raw = s ? JSON.parse(s) : null;
    } catch {
      raw = null;
    }
    this.data = raw ? migrate(raw) : emptyStore();
    const last = [...this.data.rooms].sort((a, b) => b.updatedAt - a.updatedAt)[0];
    this.currentRoomId = last?.id ?? null;
  }

  /** The room last used (the palace reloads onto it). */
  room(): RoomModel | null {
    return this.data.rooms.find((r) => r.id === this.currentRoomId) ?? null;
  }

  setRoom(room: RoomModel) {
    const i = this.data.rooms.findIndex((r) => r.id === room.id);
    const copy = structuredClone(room);
    if (i >= 0) this.data.rooms[i] = copy;
    else this.data.rooms.push(copy);
    // Progress created before the room was known belongs to it.
    for (const p of this.data.progress) if (!p.roomId) p.roomId = room.id;
    this.currentRoomId = room.id;
    this.save();
  }

  palaces(): Palace[] {
    return [...BUILTIN_PALACES, ...this.data.palaces];
  }
  palace(id: string): Palace | undefined {
    return getBuiltinPalace(id) ?? this.data.palaces.find((p) => p.id === id);
  }
  addPalace(p: Palace) {
    this.data.palaces = this.data.palaces.filter((x) => x.id !== p.id);
    this.data.palaces.push(p);
    this.setActivePalace(p.id);
    this.save();
  }
  setActivePalace(id: string) {
    this.data.activePalaceId = id;
    this.save();
  }
  activePalace(): Palace | undefined {
    return (this.data.activePalaceId && this.palace(this.data.activePalaceId)) || undefined;
  }

  /** Progress of a palace in the current room (created on demand). */
  progress(palaceId: string): PalaceProgress {
    const roomId = this.currentRoomId ?? '';
    let p = this.data.progress.find((x) => x.palaceId === palaceId && (x.roomId === roomId || !x.roomId));
    if (!p) {
      p = { palaceId, roomId, placements: [], reviews: {} };
      this.data.progress.push(p);
    }
    return p;
  }

  setFlow(f: FlowSnapshot | null) {
    this.data.flow = f ?? undefined;
    this.save();
  }
  flow(): FlowSnapshot | null {
    const f = this.data.flow as FlowSnapshot | undefined;
    return f && typeof f === 'object' && typeof f.kind === 'string' ? f : null;
  }

  save() {
    if (this.timer) return;
    this.timer = setTimeout(() => this.saveNow(), 250);
  }
  saveNow() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    try {
      this.storage?.setItem(KEY, serialize(this.data));
    } catch (e) {
      console.warn('[store] save failed', e);
    }
  }

  /** Forget everything (debug / "start over"). */
  reset() {
    this.data = emptyStore();
    this.currentRoomId = null;
    this.saveNow();
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
