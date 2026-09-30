/**
 * Loci — one entry point that renders any sound by key. Pure (runs in a Worker, on the main
 * thread as a fallback, and in Node for tests / WAV export).
 *
 * Keys:  cue:<name>:<variant> · obj:<index>:<kind> · flame:<mood>:<words> · ir ·
 *        amb:bed · amb:<pop|hiss|wind|rustle>:<variant>
 */
import { dcBlock, hashString, makeRoomIR, mulberry32, normalizeLoudness, normalizePeak, alloc, trimTail, type Channels } from './dsp';
import { CUES, type Cue } from './cues';
import { OBJECT_VOICE_COUNT, renderObjectVoiceRaw, type ObjectVoiceKind } from './voices';
import { planFlameVoice, renderFlameVoice, type FlameMood } from './flame';
import { AMB_PEAK, renderBed, renderHiss, renderPop, renderRustle, renderWind, type AmbKind } from './ambience';

/** Object voices are loudness-matched (200 ms RMS) so a bottle and a music box feel equally present. */
export const OBJECT_LOUDNESS: Record<ObjectVoiceKind, number> = { select: 0.17, place: 0.18, reveal: 0.18 };
export const OBJECT_MAX_PEAK = 0.78;
export const OBJECT_SEND = 0.34;
export const FLAME_LOUDNESS = 0.18;
export const FLAME_MAX_PEAK = 0.7;
export const FLAME_SEND = 0.2;
/** Room return level: the library is book-lined and absorptive — present but never washy. */
export const REVERB_RETURN = 0.65;
/** Room IR length (s). */
export const IR_SECONDS = 1.6;

export const cueKey = (cue: Cue, variant = 0) => `cue:${cue}:${variant}`;
export const objKey = (index: number, kind: ObjectVoiceKind) => `obj:${index}:${kind}`;
export const flameKey = (words: string, mood: FlameMood) => `flame:${mood}:${words}`;
export const ambKey = (kind: AmbKind, variant: number) => `amb:${kind}:${variant}`;
export const IR_KEY = 'ir';
export const BED_KEY = 'amb:bed';

function finish(x: Float32Array, sr: number, peak: number, loudness?: number): Float32Array {
  dcBlock(x, sr);
  if (loudness) normalizeLoudness(x, sr, loudness, peak);
  else normalizePeak([x], peak);
  return trimTail(x, sr);
}

export function renderCue(cue: Cue, sr: number, variant = 0): Float32Array {
  const spec = CUES[cue];
  if (!spec) throw new Error(`unknown cue ${cue}`);
  const out = alloc(sr, spec.dur);
  spec.render(out, sr, mulberry32(hashString(cue) + variant * 7919), variant);
  return finish(out, sr, spec.peak);
}

export function renderObjectVoice(index: number, kind: ObjectVoiceKind, sr: number): Float32Array {
  const i = ((Math.round(index) % OBJECT_VOICE_COUNT) + OBJECT_VOICE_COUNT) % OBJECT_VOICE_COUNT;
  return finish(renderObjectVoiceRaw(i, kind, sr), sr, OBJECT_MAX_PEAK, OBJECT_LOUDNESS[kind]);
}

export function renderFlame(words: string, mood: FlameMood, sr: number): Float32Array {
  return finish(renderFlameVoice(planFlameVoice(words, mood), sr), sr, FLAME_MAX_PEAK, FLAME_LOUDNESS);
}

export function renderAmb(kind: AmbKind, variant: number, sr: number): Channels {
  if (kind === 'wind') return normalizePeak(renderWind(sr, variant), AMB_PEAK.wind);
  const x = kind === 'pop' ? renderPop(sr, variant) : kind === 'hiss' ? renderHiss(sr, variant) : renderRustle(sr, variant);
  return [finish(x, sr, AMB_PEAK[kind])];
}

/** Render any job key into channels (1 = mono, 2 = stereo). */
export function renderJob(key: string, sr: number): Channels {
  const [type, a, ...rest] = key.split(':');
  const b = rest.join(':');
  switch (type) {
    case 'cue': return [renderCue(a as Cue, sr, Number(b) || 0)];
    case 'obj': return [renderObjectVoice(Number(a), b as ObjectVoiceKind, sr)];
    case 'flame': return [renderFlame(b, a as FlameMood, sr)];
    case 'ir': return makeRoomIR(sr, IR_SECONDS);
    case 'amb':
      if (a === 'bed') return renderBed(sr);
      return renderAmb(a as AmbKind, Number(b) || 0, sr);
  }
  throw new Error(`unknown render key ${key}`);
}
