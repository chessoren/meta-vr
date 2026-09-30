import type { Palace, PairStatus } from '../../core/types';

/**
 * Headset side of the phone import: create a pairing slot (4-letter code shown as a QR),
 * then poll until the phone has sent a validated palace.
 */
export interface PairSlot {
  code: string;
  secret: string;
  url: string; // what the QR encodes
}

export function importBaseUrl() {
  const base = (import.meta.env.VITE_PUBLIC_URL as string | undefined) ?? location.origin;
  return base.replace(/\/$/, '');
}

export async function createPairSlot(): Promise<PairSlot> {
  const r = await fetch('/api/pair', { method: 'POST' });
  if (!r.ok) throw new Error(`pair failed: ${r.status}`);
  const j = (await r.json()) as { code: string; secret: string };
  return { ...j, url: `${importBaseUrl()}/${j.code}` };
}

export async function pollPalace(slot: PairSlot): Promise<{ status: PairStatus; palace?: Palace } | null> {
  try {
    const r = await fetch(`/api/palace?code=${encodeURIComponent(slot.code)}&secret=${encodeURIComponent(slot.secret)}`, { cache: 'no-store' });
    if (r.status === 404) return { status: 'consumed' };
    if (!r.ok) return null;
    return (await r.json()) as { status: PairStatus; palace?: Palace };
  } catch {
    return null;
  }
}
