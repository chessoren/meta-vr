/**
 * On-device voice answers (English), hands-free.
 *
 * Uses Vosk (Kaldi compiled to WASM, the engine Lichess uses for voice moves) with a
 * GRAMMAR restricted to the spoken forms of the current question's answer + distractors,
 * which makes a small 40 MB model very accurate. Audio never leaves the headset.
 *
 * The model archive is served from VITE_VOSK_MODEL_URL (default /models/vosk-model-small-en-us-0.15.tar.gz,
 * fetched once and cached by the browser). If it is missing or the mic is denied, voice is
 * simply unavailable and the learner answers with bubbles — nothing breaks.
 */
import workerUrl from '@lichess-org/vosk-browser/dist/vosk.worker.js?url';
import wasmUrl from '@lichess-org/vosk-browser/dist/vosk.wasm?url';

type VoskModule = typeof import('@lichess-org/vosk-browser');
type Client = Awaited<ReturnType<VoskModule['createVoskClient']>>;
type Recognizer = InstanceType<Client['KaldiRecognizer']>;

export type VoiceStatus = 'off' | 'loading' | 'ready' | 'listening' | 'unavailable';

const MODEL_URL = (import.meta.env.VITE_VOSK_MODEL_URL as string | undefined) ?? '/models/vosk-model-small-en-us-0.15.tar.gz';

export class Voice {
  status: VoiceStatus = 'off';
  /** Last partial transcript (for the "listening" visual). */
  partial = '';
  /** Microphone input level 0–1 (smoothed), for a subtle listening meter. */
  level = 0;
  private client: Client | null = null;
  private recognizer: Recognizer | null = null;
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private proc: ScriptProcessorNode | null = null;
  private onFinal: ((text: string) => void) | null = null;
  private loading: Promise<boolean> | null = null;

  /** Load model + open the mic. Must be called from (or after) a user gesture. Resolves false if unavailable. */
  init(): Promise<boolean> {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      try {
        this.status = 'loading';
        const head = await fetch(MODEL_URL, { method: 'HEAD' }).catch(() => null);
        if (!head || !head.ok) throw new Error(`voice model not found at ${MODEL_URL}`);
        const vosk: VoskModule = await import('@lichess-org/vosk-browser');
        this.client = await vosk.createVoskClient({ modelUrl: MODEL_URL, workerUrl, wasmUrl, logLevel: -1 });
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
          video: false,
        });
        this.ctx = new AudioContext();
        const src = this.ctx.createMediaStreamSource(this.stream);
        this.proc = this.ctx.createScriptProcessor(4096, 1, 1);
        this.proc.onaudioprocess = (e) => {
          const data = e.inputBuffer.getChannelData(0);
          let s = 0;
          for (let i = 0; i < data.length; i += 16) s += data[i] * data[i];
          this.level = this.level * 0.7 + Math.min(1, Math.sqrt(s / (data.length / 16)) * 6) * 0.3;
          if (this.status === 'listening' && this.recognizer) this.recognizer.acceptWaveformFloat(new Float32Array(data), this.ctx!.sampleRate);
        };
        src.connect(this.proc);
        // ScriptProcessor only runs when connected to a destination; route through a muted gain.
        const mute = this.ctx.createGain();
        mute.gain.value = 0;
        this.proc.connect(mute).connect(this.ctx.destination);
        this.status = 'ready';
        return true;
      } catch (e) {
        console.info('[voice] unavailable:', (e as Error).message);
        this.status = 'unavailable';
        return false;
      }
    })();
    return this.loading;
  }

  get available() {
    return this.status === 'ready' || this.status === 'listening';
  }

  /** Start listening with a phrase grammar; `onFinal` receives each final transcript. */
  listen(grammar: string[], onFinal: (text: string) => void) {
    if (!this.client || !this.available || !this.ctx) return false;
    this.stop();
    void this.ctx.resume();
    const phrases = [...new Set(grammar.map((g) => g.toLowerCase().trim()).filter(Boolean))];
    if (!phrases.includes('[unk]')) phrases.push('[unk]');
    this.recognizer = new this.client.KaldiRecognizer(this.ctx.sampleRate, JSON.stringify(phrases));
    this.onFinal = onFinal;
    this.partial = '';
    this.recognizer.on('result', (m) => {
      if (m.event !== 'result') return;
      const text = m.result.text.replace(/\[unk\]/g, '').trim();
      if (text) this.onFinal?.(text);
    });
    this.recognizer.on('partialresult', (m) => {
      if (m.event === 'partialresult') this.partial = m.result.partial.replace(/\[unk\]/g, '').trim();
    });
    this.status = 'listening';
    return true;
  }

  stop() {
    if (this.recognizer) {
      try {
        this.recognizer.remove();
      } catch {
        /* already removed */
      }
    }
    this.recognizer = null;
    this.onFinal = null;
    this.partial = '';
    if (this.status === 'listening') this.status = 'ready';
  }

  suspend() {
    void this.ctx?.suspend();
  }
  resume() {
    void this.ctx?.resume();
  }
}

export const voice = new Voice();
