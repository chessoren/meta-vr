import type * as THREE from 'three';

/** The subset of the audio engine the app uses (implemented by src/audio/engine.ts). */
export type Cue =
  | 'pinch' | 'release' | 'bounce' | 'scanPing' | 'placeThunk' | 'appear' | 'dissolve' | 'lightsOut' | 'lightsOn'
  | 'correct' | 'wrong' | 'reveal' | 'tierUp' | 'tierAnchored' | 'proof' | 'hover' | 'menuOpen' | 'menuClose'
  | 'palaceLoaded' | 'phoneConnected' | 'importReady' | 'goodbye' | 'whoosh';

export interface AudioLike {
  unlock(): Promise<void>;
  readonly ready: boolean;
  setMuted(m: boolean): void;
  readonly muted: boolean;
  setListener(pos: { x: number; y: number; z: number }, forward: { x: number; y: number; z: number }, up: { x: number; y: number; z: number }): void;
  play(cue: Cue, at?: { x: number; y: number; z: number }, opts?: { gain?: number; pitch?: number }): void;
  objectVoice(index: number, at: { x: number; y: number; z: number }, kind?: 'select' | 'reveal' | 'place'): void;
  flameVoice(words: string, mood?: 'happy' | 'curious' | 'proud' | 'sleepy'): void;
  startAmbience(): void;
  stopAmbience(fadeSec?: number): void;
  suspend?(): void;
  resume?(): void;
}

const silent: AudioLike = {
  unlock: async () => {},
  ready: false,
  setMuted() {},
  muted: true,
  setListener() {},
  play() {},
  objectVoice() {},
  flameVoice() {},
  startAmbience() {},
  stopAmbience() {},
};

let engine: AudioLike = silent;
export function setAudio(a: AudioLike) {
  engine = a;
}
export const sfx = {
  get engine() {
    return engine;
  },
  play(cue: Cue, at?: THREE.Vector3, opts?: { gain?: number; pitch?: number }) {
    try {
      engine.play(cue, at, opts);
    } catch (e) {
      console.warn('[sfx]', e);
    }
  },
  object(index: number, at: THREE.Vector3, kind?: 'select' | 'reveal' | 'place') {
    try {
      engine.objectVoice(index, at, kind);
    } catch (e) {
      console.warn('[sfx]', e);
    }
  },
  flame(words: string, mood?: 'happy' | 'curious' | 'proud' | 'sleepy') {
    try {
      engine.flameVoice(words, mood);
    } catch (e) {
      console.warn('[sfx]', e);
    }
  },
};
