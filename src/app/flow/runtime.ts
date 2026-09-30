/**
 * Frame-driven async runtime for scripted flows (onboarding, sessions, recall…).
 *
 * Flows are plain async functions that `await` helpers resolved from the XR frame loop:
 * when the headset is removed the runtime stops ticking, so every flow freezes exactly
 * where it is and resumes on its own when the learner puts the headset back on.
 */
export class Cancelled extends Error {
  constructor(reason = 'cancelled') {
    super(reason);
  }
}

export class Token {
  cancelled = false;
  reason = '';
  private listeners: (() => void)[] = [];
  cancel(reason = 'cancelled') {
    if (this.cancelled) return;
    this.cancelled = true;
    this.reason = reason;
    for (const l of this.listeners.splice(0)) l();
  }
  onCancel(fn: () => void) {
    if (this.cancelled) fn();
    else this.listeners.push(fn);
  }
  throwIfCancelled() {
    if (this.cancelled) throw new Cancelled(this.reason);
  }
}

interface Waiter {
  check: () => boolean;
  resolve: () => void;
  reject: (e: unknown) => void;
  token?: Token;
}

let clock = 0;
const waiters: Waiter[] = [];

/** Advance the flow clock and resolve satisfied waiters. Call once per XR frame. */
export function tickFlows(dt: number) {
  clock += dt;
  for (let i = waiters.length - 1; i >= 0; i--) {
    const w = waiters[i];
    if (w.token?.cancelled) {
      waiters.splice(i, 1);
      w.reject(new Cancelled(w.token.reason));
      continue;
    }
    let ok = false;
    try {
      ok = w.check();
    } catch (e) {
      waiters.splice(i, 1);
      w.reject(e);
      continue;
    }
    if (ok) {
      waiters.splice(i, 1);
      w.resolve();
    }
  }
}

export function flowTime() {
  return clock;
}

/** Resolve when `pred()` becomes true (checked every frame). */
export function until(pred: () => boolean, token?: Token): Promise<void> {
  if (token?.cancelled) return Promise.reject(new Cancelled(token.reason));
  return new Promise((resolve, reject) => waiters.push({ check: pred, resolve, reject, token }));
}

/** Wait `sec` seconds of XR time (freezes while the headset is off). */
export function wait(sec: number, token?: Token): Promise<void> {
  const end = clock + sec;
  return until(() => clock >= end, token);
}

/** Resolve with the first truthy value returned by `probe()`; null on timeout (if given). */
export function waitFor<T>(probe: () => T | null | undefined | false, token?: Token, timeoutSec?: number): Promise<T | null> {
  const end = timeoutSec === undefined ? Infinity : clock + timeoutSec;
  let value: T | null = null;
  return until(() => {
    const v = probe();
    if (v) {
      value = v as T;
      return true;
    }
    return clock >= end;
  }, token).then(() => value);
}

/** Tween helper: calls fn(u) with u ∈ [0,1] eased, over `sec` seconds. */
export async function tween(sec: number, fn: (u: number) => void, token?: Token, ease: (x: number) => number = easeInOut) {
  const start = clock;
  fn(0);
  await until(() => {
    const u = Math.min(1, (clock - start) / Math.max(1e-6, sec));
    fn(ease(u));
    return u >= 1;
  }, token);
}

export const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
export const easeOut = (x: number) => 1 - (1 - x) ** 3;
export const easeOutBack = (x: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
};

/** Number of pending waiters (debug). */
export function pendingWaiters() {
  return waiters.length;
}
