/** Draft persistence in sessionStorage, so a refresh (or iOS killing the tab) doesn't lose work. */
import type { ExtractResponse } from '../core/types';

const KEY = 'loci:phone:draft:v1';

export interface Draft {
  code: string;
  step: 'source' | 'review' | 'done';
  text?: string;
  title?: string;
  examDate?: string;
  result?: ExtractResponse;
  savedAt: number;
}

export function loadDraft(code: string | null): Draft | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    if (!d || typeof d !== 'object' || typeof d.code !== 'string') return null;
    if (code && d.code !== code) return null;
    if (Date.now() - (d.savedAt ?? 0) > 6 * 3600_000) return null;
    return d;
  } catch {
    return null;
  }
}

export function saveDraft(d: Omit<Draft, 'savedAt'>) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...d, savedAt: Date.now() }));
  } catch {
    /* private mode / quota: the draft is a convenience only */
  }
}

export function clearDraft() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
