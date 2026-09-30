/**
 * Loci — background renderer. Receives render keys, fills Float32Arrays with the pure DSP code
 * and transfers them back, so pre-rendering never costs a frame on the headset.
 * Priority jobs jump the queue; one job per macrotask keeps the worker responsive.
 */
import { renderJob } from './render';

interface Job { id: number; key: string; sr: number }
const scope = self as unknown as { postMessage(msg: unknown, transfer?: Transferable[]): void };
const queue: Job[] = [];
let scheduled = false;

function pump(): void {
  scheduled = false;
  const job = queue.shift();
  if (!job) return;
  try {
    const ch = renderJob(job.key, job.sr);
    scope.postMessage({ id: job.id, key: job.key, sr: job.sr, ch }, ch.map((c) => c.buffer as ArrayBuffer));
  } catch (e) {
    scope.postMessage({ id: job.id, key: job.key, error: String(e) });
  }
  schedule();
}

function schedule(): void {
  if (!scheduled && queue.length) {
    scheduled = true;
    setTimeout(pump, 0);
  }
}

self.onmessage = (ev: MessageEvent<Job & { prio?: boolean }>) => {
  const { id, key, sr, prio } = ev.data;
  const dup = queue.findIndex((j) => j.key === key && j.sr === sr);
  if (dup >= 0) {
    // already queued: a priority re-post just moves it to the front
    if (prio) queue.unshift(...queue.splice(dup, 1));
    return;
  }
  if (prio) queue.unshift({ id, key, sr });
  else queue.push({ id, key, sr });
  schedule();
};
