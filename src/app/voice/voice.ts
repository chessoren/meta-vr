/**
 * On-device voice answers (English), hands-free.
 *
 * Uses Vosk (Kaldi compiled to WASM, the engine Lichess uses for voice moves) with a
 * GRAMMAR restricted to the spoken forms of the current question's answer + distractors,
 * which makes a small 40 MB model very accurate. Audio never leaves the headset.
 *
 * The model archive (≈ 40 MB, fetched once, then cached by the browser) comes from the first
 * reachable of MODEL_URLS (see scripts/fetch-voice-model.sh to self-host it). If it is missing or the mic is denied, voice is
 * simply unavailable and the learner answers with bubbles — nothing breaks.
 */
import workerUrl from '@lichess-org/vosk-browser/dist/vosk.worker.js?url';
import wasmUrl from '@lichess-org/vosk-browser/dist/vosk.wasm?url';

type VoskModule = typeof import('@lichess-org/vosk-browser');
type Client = Awaited<ReturnType<VoskModule['createVoskClient']>>;
type Recognizer = InstanceType<Client['KaldiRecognizer']>;

export type VoiceStatus = 'off' | 'loading' | 'ready' | 'listening' | 'unavailable';

/** Candidate model locations, first reachable wins: explicit env → self-hosted → the vosk-browser project's public copy. */
export const MODEL_URLS = [
  import.meta.env.VITE_VOSK_MODEL_URL as string | undefined,
  '/models/vosk-model-small-en-us-0.15.tar.gz',
  'https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-en-us-0.15.tar.gz',
].filter((u): u is string => !!u);

/** First model URL that answers (HEAD), or null. */
export async function findModelUrl(): Promise<string | null> {
  for (const url of MODEL_URLS) {
    const r = await fetch(url, { method: 'HEAD' }).catch(() => null);
    if (r?.ok) return url;
  }
  return null;
}

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
        const modelUrl = await findModelUrl();
        if (!modelUrl) throw new Error(`voice model not found (${MODEL_URLS.join(', ')})`);
        const vosk: VoskModule = await import('@lichess-org/vosk-browser');
        this.client = await vosk.createVoskClient({ modelUrl, workerUrl, wasmUrl, logLevel: -1 });
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
