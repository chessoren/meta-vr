/**
 * Loci — procedural Web Audio engine (no audio files).
 *
 * Graph (built once, nodes pooled and reused):
 *
 *   source ─► slot gain ─► [HRTF panner] ─► dry bus ─┐
 *                  └─► send ─► reverb HP ─► Convolver ("old library" IR) ─► reverb return ─┤
 *   ambience (bed loop + one-shots via 5 fixed pan buses) ─► amb level ─► duck ────────────┤
 *                                                                              master gain ─► glue compressor ─► limiter ─► out
 *
 * Every sound is rendered ONCE by pure DSP code (src/audio/render.ts) inside a Worker (main-thread
 * idle fallback) into AudioBuffers; at runtime a play() costs one AudioBufferSourceNode.
 * Spatial one-shots go through a pool of 10 HRTF panners, flat ones through 8 plain slots;
 * the oldest voice is stolen with a 10 ms fade when a pool is full.
 */
import { CUES, CUE_NAMES, type Cue } from './cues';
import { AMB, AmbienceSequencer, type AmbEvent } from './ambience';
import { planFlameVoice, type FlameMood, type FlameUtterance } from './flame';
import { OBJECT_VOICE_COUNT, type ObjectVoiceKind } from './voices';
import { BED_KEY, FLAME_SEND, IR_KEY, OBJECT_SEND, REVERB_RETURN, ambKey, cueKey, flameKey, objKey, renderJob } from './render';
import type { Channels } from './dsp';

export type { Cue } from './cues';
export type { FlameMood, FlameUtterance } from './flame';
export type { ObjectVoiceKind } from './voices';
export { pentatonicRatio } from './music';

export interface Vec3 { x: number; y: number; z: number }
export interface PlayOpts {
  /** Linear gain multiplier (default 1). */
  gain?: number;
  /** Playback-rate ratio (1 = as designed). Use pentatonicRatio(steps) to stay in key. */
  pitch?: number;
}

/** Sample rate of pre-rendered one-shots (content is warm; 16 kHz Nyquist is plenty and saves ⅓ memory/CPU). */
export const RENDER_RATE = 32000;
const SPATIAL_SLOTS = 10;
const FLAT_SLOTS = 8;
const LATE_DROP_MS = 350;
const FLAME_CACHE = 24;
const AMB_PANS = [-0.6, -0.3, 0, 0.3, 0.6];

interface Slot {
  gain: GainNode;
  send: GainNode;
  panner: PannerNode | null;
  src: AudioBufferSourceNode | null;
  until: number;
}

type Waiter = (b: AudioBuffer | null) => void;

/** Keys rendered first at unlock, before `ready` turns true. */
const CORE_CUES: Cue[] = ['pinch', 'release', 'bounce', 'hover', 'appear', 'whoosh', 'scanPing', 'placeThunk', 'correct', 'wrong'];

export class AudioEngine {
  private static inst: AudioEngine | null = null;
  static get(): AudioEngine {
    if (!AudioEngine.inst) AudioEngine.inst = new AudioEngine();
    return AudioEngine.inst;
  }

  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private dry!: GainNode;
  private revIn!: GainNode;
  private reverb!: ConvolverNode;
  private ambLevel!: GainNode;
  private ambDuck!: GainNode;
  private ambPans: StereoPannerNode[] = [];
  private spatial: Slot[] = [];
  private flat: Slot[] = [];

  private buffers = new Map<string, AudioBuffer>();
  private waiting = new Map<string, Waiter[]>();
  private flameOrder: string[] = [];
  private roundRobin = new Map<Cue, number>();

  private worker: Worker | null = null;
  private workerFailed = false;
  private jobId = 0;
  private mainQueue: string[] = [];
  private mainPumping = false;
  private renderMs = 0;

  private _muted = false;
  private volume = 0.8;
  private ambienceLevel = 0.6;
  private coreReady = false;
  private unlockPromise: Promise<void> | null = null;

  private ambOn = false;
  private ambBed: AudioBufferSourceNode | null = null;
  private ambTimer: ReturnType<typeof setInterval> | null = null;
  private ambSeq: AmbienceSequencer | null = null;
  private ambT0 = 0;

  private constructor() {}

  /* ------------------------------------------------------------------ lifecycle */

  /**
   * Call from a user gesture (pinch / tap). Creates or resumes the AudioContext synchronously,
   * then renders the core cues in the background. Resolves once core cues are playable (the rest
   * keeps rendering; anything played before its buffer exists is rendered on demand).
   */
  unlock(): Promise<void> {
    if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return Promise.resolve();
    if (!this.ctx) this.build();
    const ctx = this.ctx!;
    const resumed = ctx.state === 'running' ? Promise.resolve() : ctx.resume().catch(() => undefined);
    // silent tick: unlocks output on browsers that need a started source inside the gesture
    try {
      const s = ctx.createBufferSource();
      s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      s.connect(ctx.destination);
      s.start();
    } catch { /* ignore */ }
    if (!this.unlockPromise) this.unlockPromise = this.prerender();
    return Promise.all([resumed, this.unlockPromise]).then(() => undefined);
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running' && this.coreReady;
  }

  /** Suspend audio processing entirely (e.g. app paused / headset removed). */
  suspend(): void { void this.ctx?.suspend().catch(() => undefined); }
  resume(): void { void this.ctx?.resume().catch(() => undefined); }

  setMuted(m: boolean): void {
    this._muted = m;
    this.applyMaster();
  }
  get muted(): boolean { return this._muted; }

  setMasterVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    this.applyMaster();
  }

  /** Update the listener from the head pose (every frame). Allocation-free. */
  setListener(pos: Vec3, forward: Vec3, up: Vec3): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const l = ctx.listener;
    if (l.positionX) {
      l.positionX.value = pos.x; l.positionY.value = pos.y; l.positionZ.value = pos.z;
      l.forwardX.value = forward.x; l.forwardY.value = forward.y; l.forwardZ.value = forward.z;
      l.upX.value = up.x; l.upY.value = up.y; l.upZ.value = up.z;
    } else {
      l.setPosition(pos.x, pos.y, pos.z);
      l.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }

  /* ------------------------------------------------------------------ playback */

  /** Play a UI / game cue. Spatialised (HRTF) when `at` is given. */
  play(cue: Cue, at?: Vec3, opts?: PlayOpts): void {
    const spec = CUES[cue];
    if (!spec || !this.canPlay()) return;
    const n = spec.variants ?? 1;
    const v = this.roundRobin.get(cue) ?? 0;
    this.roundRobin.set(cue, (v + 1) % n);
    const jitter = spec.jitter ? 1 + (Math.random() * 2 - 1) * spec.jitter : 1;
    this.fire(cueKey(cue, v), at, opts?.gain ?? 1, spec.send, (opts?.pitch ?? 1) * jitter, !!spec.duck);
  }

  /**
   * The unique signature of object #index (0..23, wraps): a timbre family × motif × register,
   * always the same for that object. 'select' = the motif, 'place' = a soft landing + the motif,
   * 'reveal' = the motif answered an octave up with a little sparkle.
   */
  objectVoice(index: number, at: Vec3, kind: ObjectVoiceKind = 'select'): void {
    if (!this.canPlay()) return;
    const i = ((Math.round(index) % OBJECT_VOICE_COUNT) + OBJECT_VOICE_COUNT) % OBJECT_VOICE_COUNT;
    this.fire(objKey(i, kind), at, 1, OBJECT_SEND, 1, false);
  }

  /**
   * The flame sings a tiny wordless phrase with the rhythm of `words`. Returns the plan
   * (syllable timings, vowels, pitches) so the flame's body/mouth can animate in sync.
   * Ducks the ambience while it sings. Optional `at` spatialises it at the flame.
   */
  flameVoice(words: string, mood: FlameMood = 'happy', at?: Vec3): FlameUtterance {
    const plan = planFlameVoice(words, mood);
    if (!this.canPlay()) return plan;
    const key = flameKey(words, mood);
    this.touchFlame(key);
    this.fire(key, at, 1, FLAME_SEND, 1, false, LATE_DROP_MS + 150);
    this.duck(plan.duration + 0.15);
    return plan;
  }

  /** Pre-render flame phrases you know are coming (e.g. the onboarding script). */
  prepareFlame(lines: readonly (readonly [string, FlameMood])[]): void {
    for (const [w, m] of lines) this.request(flameKey(w, m), false);
  }

  /* ------------------------------------------------------------------ ambience */

  /** Fireplace, distant wind, the odd page — very quiet. Safe to call before unlock (starts after). */
  startAmbience(): void {
    this.ambOn = true;
    const ctx = this.ctx;
    if (!ctx) return;
    if (this.ambTimer) return;
    const now = ctx.currentTime;
    this.ambLevel.gain.cancelScheduledValues(now);
    this.ambLevel.gain.setValueAtTime(this.ambLevel.gain.value, now);
    this.ambLevel.gain.setTargetAtTime(this.ambienceLevel, now, 1.2);
    this.startBed();
    this.ambSeq = new AmbienceSequencer((Math.random() * 1e9) | 0);
    this.ambT0 = now + 0.2;
    this.ambTimer = setInterval(() => this.ambTick(), 250);
  }

  stopAmbience(fadeSec = 2): void {
    this.ambOn = false;
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const g = this.ambLevel.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + Math.max(0.02, fadeSec));
    if (this.ambTimer) clearInterval(this.ambTimer);
    this.ambTimer = null;
    const bed = this.ambBed;
    this.ambBed = null;
    if (bed) { try { bed.stop(now + Math.max(0.02, fadeSec) + 0.05); } catch { /* ignore */ } }
  }

  setAmbienceLevel(v: number): void {
    this.ambienceLevel = Math.max(0, Math.min(1, v));
    if (this.ctx && this.ambOn) this.ambLevel.gain.setTargetAtTime(this.ambienceLevel, this.ctx.currentTime, 0.3);
  }

  /** Debug numbers for the demo page. */
  stats(): { buffers: number; megabytes: number; renderMs: number; worker: boolean; state: string; sampleRate: number } {
    let bytes = 0;
    for (const b of this.buffers.values()) bytes += b.length * b.numberOfChannels * 4;
    return {
      buffers: this.buffers.size, megabytes: bytes / 1e6, renderMs: this.renderMs,
      worker: !!this.worker && !this.workerFailed, state: this.ctx?.state ?? 'none', sampleRate: this.ctx?.sampleRate ?? 0,
    };
  }

  /* ================================================================== internals */

  private build(): void {
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.master = ctx.createGain();
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -14; glue.knee.value = 10; glue.ratio.value = 3; glue.attack.value = 0.005; glue.release.value = 0.25;
    const limit = ctx.createDynamicsCompressor();
    limit.threshold.value = -2; limit.knee.value = 0; limit.ratio.value = 20; limit.attack.value = 0.001; limit.release.value = 0.1;
    this.master.connect(glue).connect(limit).connect(ctx.destination);
    this.applyMaster();

    this.dry = ctx.createGain();
    this.dry.connect(this.master);

    this.revIn = ctx.createGain();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 160; hp.Q.value = 0.6;
    this.reverb = ctx.createConvolver();
    this.reverb.normalize = false;
    const revOut = ctx.createGain();
    revOut.gain.value = REVERB_RETURN;
    this.revIn.connect(hp).connect(this.reverb).connect(revOut).connect(this.master);

    this.ambDuck = ctx.createGain();
    this.ambLevel = ctx.createGain();
    this.ambLevel.gain.value = 0;
    this.ambLevel.connect(this.ambDuck).connect(this.master);
    for (const p of AMB_PANS) {
      const sp = ctx.createStereoPanner();
      sp.pan.value = p;
      sp.connect(this.ambLevel);
      this.ambPans.push(sp);
    }

    for (let i = 0; i < SPATIAL_SLOTS; i++) this.spatial.push(this.makeSlot(true));
    for (let i = 0; i < FLAT_SLOTS; i++) this.flat.push(this.makeSlot(false));

    try {
      this.worker = new Worker(new URL('./render-worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<{ key: string; sr: number; ch?: Channels; error?: string }>) => {
        const { key, sr, ch, error } = e.data;
        if (error || !ch) { console.warn('[audio] render failed', key, error); this.deliver(key, null); return; }
        this.deliverChannels(key, ch, sr);
      };
      this.worker.onerror = (e) => {
        console.warn('[audio] worker unavailable, rendering on main thread', e.message);
        this.workerFailed = true;
        this.worker?.terminate();
        this.worker = null;
        for (const key of this.waiting.keys()) this.enqueueMain(key, false);
      };
    } catch {
      this.workerFailed = true;
      this.worker = null;
    }
    if (this.ambOn) queueMicrotask(() => { this.ambOn = false; this.startAmbience(); });
  }

  private makeSlot(spatial: boolean): Slot {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    const send = ctx.createGain();
    send.gain.value = 0;
    gain.connect(send).connect(this.revIn);
    let panner: PannerNode | null = null;
    if (spatial) {
      panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 1;
      panner.rolloffFactor = 0.8;
      panner.maxDistance = 20;
      gain.connect(panner).connect(this.dry);
    } else {
      gain.connect(this.dry);
    }
    return { gain, send, panner, src: null, until: 0 };
  }

  private applyMaster(): void {
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(this._muted ? 0 : this.volume, this.ctx.currentTime, 0.03);
  }

  private canPlay(): boolean {
    const ctx = this.ctx;
    if (!ctx || this._muted) return false;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    return true;
  }

  /** Play buffer `key` now, or as soon as it is rendered (dropped if it would arrive too late). */
  private fire(key: string, at: Vec3 | undefined, gain: number, send: number, rate: number, duck: boolean, lateMs = LATE_DROP_MS): void {
    const buf = this.buffers.get(key);
    const spatial = !!at;
    const x = at?.x ?? 0, y = at?.y ?? 0, z = at?.z ?? 0;
    if (buf) { this.start(buf, spatial, x, y, z, gain, send, rate, duck); return; }
    const t = performance.now();
    this.request(key, true, (b) => {
      if (b && performance.now() - t < lateMs) this.start(b, spatial, x, y, z, gain, send, rate, duck);
    });
  }

  private start(buf: AudioBuffer, spatial: boolean, x: number, y: number, z: number, gain: number, send: number, rate: number, duck: boolean): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const pool = spatial ? this.spatial : this.flat;
    let slot = pool[0];
    for (const s of pool) {
      if (s.until <= now) { slot = s; break; }
      if (s.until < slot.until) slot = s;
    }
    let t0 = now;
    if (slot.src && slot.until > now) {
      // steal: quick fade then reuse
      slot.gain.gain.cancelScheduledValues(now);
      slot.gain.gain.setValueAtTime(slot.gain.gain.value, now);
      slot.gain.gain.linearRampToValueAtTime(0, now + 0.01);
      try { slot.src.stop(now + 0.012); } catch { /* ignore */ }
      t0 = now + 0.012;
    }
    slot.gain.gain.cancelScheduledValues(t0);
    slot.gain.gain.setValueAtTime(gain, t0);
    slot.send.gain.setValueAtTime(send, t0);
    if (slot.panner) {
      slot.panner.positionX.setValueAtTime(x, t0);
      slot.panner.positionY.setValueAtTime(y, t0);
      slot.panner.positionZ.setValueAtTime(z, t0);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    src.connect(slot.gain);
    src.start(t0);
    slot.src = src;
    slot.until = t0 + buf.duration / rate;
    src.onended = () => {
      src.disconnect();
      if (slot.src === src) slot.src = null;
    };
    if (duck) this.duck(buf.duration / rate);
  }

  private duck(seconds: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const g = this.ambDuck.gain as AudioParam & { cancelAndHoldAtTime?: (t: number) => AudioParam };
    if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(now);
    else { g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); }
    g.setTargetAtTime(0.35, now, 0.06);
    g.setTargetAtTime(1, now + seconds, 0.6);
  }

  /* ------------------------------------------------------------------ rendering service */

  private request(key: string, prio: boolean, cb?: Waiter): void {
    if (this.buffers.has(key)) { cb?.(this.buffers.get(key)!); return; }
    const w = this.waiting.get(key);
    if (w) {
      if (cb) w.push(cb);
      if (prio) this.bump(key);
      return;
    }
    this.waiting.set(key, cb ? [cb] : []);
    const sr = key === IR_KEY ? this.ctx!.sampleRate : RENDER_RATE;
    if (this.worker && !this.workerFailed) this.worker.postMessage({ id: ++this.jobId, key, sr, prio });
    else this.enqueueMain(key, prio);
  }

  /** Re-post a waiting key as a priority job (the worker dedups by delivering to all waiters). */
  private bump(key: string): void {
    if (this.worker && !this.workerFailed) {
      const sr = key === IR_KEY ? this.ctx!.sampleRate : RENDER_RATE;
      this.worker.postMessage({ id: ++this.jobId, key, sr, prio: true });
    } else {
      const i = this.mainQueue.indexOf(key);
      if (i > 0) { this.mainQueue.splice(i, 1); this.mainQueue.unshift(key); }
    }
  }

  private enqueueMain(key: string, prio: boolean): void {
    if (this.mainQueue.includes(key)) return;
    if (prio) this.mainQueue.unshift(key); else this.mainQueue.push(key);
    if (!this.mainPumping) {
      this.mainPumping = true;
      setTimeout(() => this.pumpMain(), 0);
    }
  }

  private pumpMain(): void {
    const key = this.mainQueue.shift();
    if (!key) { this.mainPumping = false; return; }
    if (!this.buffers.has(key)) {
      const sr = key === IR_KEY ? this.ctx!.sampleRate : RENDER_RATE;
      const t = performance.now();
      try {
        const ch = renderJob(key, sr);
        this.renderMs += performance.now() - t;
        this.deliverChannels(key, ch, sr);
      } catch (e) {
        console.warn('[audio] render failed', key, e);
        this.deliver(key, null);
      }
    }
    // yield between jobs so frames keep flowing
    setTimeout(() => this.pumpMain(), 4);
  }

  private deliverChannels(key: string, ch: Channels, sr: number): void {
    if (this.buffers.has(key)) { this.deliver(key, this.buffers.get(key)!); return; }
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(ch.length, ch[0].length, sr);
    ch.forEach((c, i) => buf.copyToChannel(c as Float32Array<ArrayBuffer>, i));
    this.buffers.set(key, buf);
    if (key === IR_KEY) this.reverb.buffer = buf;
    this.deliver(key, buf);
  }

  private deliver(key: string, buf: AudioBuffer | null): void {
    const w = this.waiting.get(key);
    this.waiting.delete(key);
    if (w) for (const cb of w) cb(buf);
  }

  private touchFlame(key: string): void {
    const i = this.flameOrder.indexOf(key);
    if (i >= 0) this.flameOrder.splice(i, 1);
    this.flameOrder.push(key);
    while (this.flameOrder.length > FLAME_CACHE) {
      const old = this.flameOrder.shift()!;
      this.buffers.delete(old);
    }
  }

  private whenRendered(key: string): Promise<void> {
    return new Promise((res) => this.request(key, false, () => res()));
  }

  /** Background pre-render, most urgent first. Resolves when the core set is ready. */
  private prerender(): Promise<void> {
    const t0 = performance.now();
    const core: Promise<void>[] = [this.whenRendered(IR_KEY)];
    for (const c of CORE_CUES) for (let v = 0; v < (CUES[c].variants ?? 1); v++) core.push(this.whenRendered(cueKey(c, v)));
    const later: string[] = [];
    if (this.ambOn) later.push(BED_KEY);
    for (const c of CUE_NAMES) if (!CORE_CUES.includes(c)) for (let v = 0; v < (CUES[c].variants ?? 1); v++) later.push(cueKey(c, v));
    later.push(BED_KEY);
    for (let v = 0; v < AMB.pops; v++) later.push(ambKey('pop', v));
    for (let v = 0; v < AMB.hiss; v++) later.push(ambKey('hiss', v));
    for (let v = 0; v < AMB.wind; v++) later.push(ambKey('wind', v));
    for (let v = 0; v < AMB.rustle; v++) later.push(ambKey('rustle', v));
    for (const kind of ['select', 'place', 'reveal'] as ObjectVoiceKind[]) for (let i = 0; i < OBJECT_VOICE_COUNT; i++) later.push(objKey(i, kind));
    for (const k of later) this.request(k, false);
    const timeout = new Promise<void>((res) => setTimeout(res, 5000));
    return Promise.race([Promise.all(core).then(() => undefined), timeout]).then(() => {
      this.coreReady = true;
      if (this.renderMs === 0) this.renderMs = performance.now() - t0;
    });
  }

  /* ------------------------------------------------------------------ ambience internals */

  private startBed(): void {
    this.request(BED_KEY, true, (b) => {
      if (!b || !this.ambOn || this.ambBed || !this.ctx) return;
      const src = this.ctx.createBufferSource();
      src.buffer = b;
      src.loop = true;
      src.connect(this.ambPans[2]);
      src.start(this.ctx.currentTime + 0.05, Math.random() * b.duration);
      this.ambBed = src;
    });
  }

  private ambTick(): void {
    const ctx = this.ctx;
    if (!ctx || !this.ambSeq || !this.ambOn) return;
    const horizon = ctx.currentTime - this.ambT0 + 0.5;
    const events = this.ambSeq.advance(horizon);
    if (this._muted || this.ambienceLevel <= 0 || ctx.state !== 'running') return;
    for (const e of events) this.ambFire(e);
  }

  private ambFire(e: AmbEvent): void {
    const ctx = this.ctx!;
    const key = ambKey(e.kind, e.variant);
    const buf = this.buffers.get(key);
    if (!buf) { this.request(key, false); return; }
    const when = Math.max(ctx.currentTime, this.ambT0 + e.t);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = e.rate;
    let bus = 2, best = 9;
    AMB_PANS.forEach((p, i) => { const d = Math.abs(p - e.pan); if (d < best) { best = d; bus = i; } });
    if (e.gain !== 1) {
      const g = ctx.createGain();
      g.gain.value = e.gain;
      src.connect(g).connect(this.ambPans[buf.numberOfChannels === 2 ? 2 : bus]);
      src.onended = () => { src.disconnect(); g.disconnect(); };
    } else {
      src.connect(this.ambPans[buf.numberOfChannels === 2 ? 2 : bus]);
      src.onended = () => src.disconnect();
    }
    src.start(when);
  }
}
