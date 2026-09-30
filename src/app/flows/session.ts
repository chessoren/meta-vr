import * as THREE from 'three';
import type { App } from '../app';
import type { Palace } from '../../core/types';
import { planToday } from '../../core/planner';
import { dueNotions } from '../../core/srs';
import { until, wait, waitFor } from '../flow/runtime';
import { sfx } from '../sfx';
import { scanRoom, ensureLoci, seenRoute } from './scan';
import { lightsOut, recallAll } from './recall';
import { createPairSlot, pollPalace } from '../net/pair';
import { addTarget, getHovered, pinchSelection, clearTargets } from '../xr/targeting';

/**
 * A daily session (day 2+), 5–10 minutes:
 *   reload on the same objects → only DUE notions glow → recall them along the route →
 *   place 3–5 new notions if the plan says so → one-line summary.
 */
export async function dailySession(app: App, palaceId?: string) {
  const token = app.token;
  const palace = (palaceId ? app.store.palace(palaceId) : app.store.activePalace()) ?? app.store.palaces()[0];
  app.store.setActivePalace(palace.id);
  app.store.setFlow({ kind: 'session', step: 'start', palaceId: palace.id });
  const progress = app.store.progress(palace.id);
  app.view.load(palace, progress);
  app.view.setAllModes('ember');
  app.flame.root.visible = true;
  await until(() => app.room.ready, token);
  sfx.play('palaceLoaded');
  await app.flameTo(app.flameHome(), 1.0);
  await scanRoom(app, { introduce: false });

  const now = Date.now();
  const plan = planToday(palace, progress, now, { tzOffsetMin: -new Date().getTimezoneOffset() });
  const placed = new Set(progress.placements.map((p) => p.notionId));
  const due = plan.due.filter((id) => placed.has(id));
  app.view.setAllModes('idle');

  // ── Reviews ────────────────────────────────────────────────────────────────
  if (due.length) {
    app.say(due.length === 1 ? '1 to review' : `${due.length} to review`, 'happy', 2.4);
    await wait(1.6, token);
    for (const id of due) app.view.setMode(id, 'due');
    await recallAll(app, palace, progress, { ids: due, intro: false });
  } else if (placed.size) {
    app.say('All fresh!', 'happy', 2);
    await wait(1.4, token);
  }

  // ── New notions ────────────────────────────────────────────────────────────
  const unplaced = palace.notions.filter((n) => !placed.has(n.id));
  const n = Math.min(unplaced.length, Math.max(plan.newToPlace, placed.size === 0 ? Math.min(5, unplaced.length) : 0));
  if (n > 0) {
    app.store.setFlow({ kind: 'session', step: 'place', palaceId: palace.id });
    await ensureLoci(app, Math.min(5, n));
    app.say(n === 1 ? '1 new' : `${n} new`, 'happy', 2);
    await wait(1.4, token);
    const fresh: string[] = [];
    for (const notion of unplaced.slice(0, n)) {
      const suggest = suggestFurniture(app, palace, progress);
      if (suggest) app.flame.pointAt(app.room.toSession(app.room.getFurniture(suggest)!.center, new THREE.Vector3()));
      await app.place(palace, progress, notion, { suggest });
      app.flame.pointAt(null);
      fresh.push(notion.id);
      app.say(fresh.length < n ? 'Nice' : 'Done!', 'happy', 1.2);
      await wait(0.9, token);
    }
    // Encode → retrieve right away.
    const items = [...app.view.items.values()];
    for (const it of items) if (!fresh.includes(it.notion.id)) app.view.setMode(it.notion.id, 'idle');
    await lightsOut(app);
    await recallAll(app, palace, progress, { ids: fresh });
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const after = planToday(palace, progress, Date.now(), { tzOffsetMin: -new Date().getTimezoneOffset() });
  app.hideAllPanels();
  app.view.setAllModes('idle');
  app.flame.setMood('celebrate');
  sfx.play('proof');
  app.proof.setContent(`${after.solidCount} / ${after.total}`, 'solid notions', after.summaryLine);
  app.follow.snap();
  app.proof.setVisible(true, true);
  app.store.setFlow(null);
  app.store.save();
  await wait(4.5, token);
  app.proof.setVisible(false, true);
  app.say(nextLine(palace, progress), 'happy', 3);
}

/** Prefer the next free object on the route; else the least crowded one. */
export function suggestFurniture(app: App, _palace: Palace, progress: import('../../core/types').PalaceProgress): string | null {
  const route = seenRoute(app).concat(app.room.furniture().filter((f) => f.label === 'manual').map((f) => f.id));
  if (!route.length) return null;
  const count = (fid: string) => progress.placements.filter((p) => p.furnitureId === fid).length;
  let best = route[0];
  for (const fid of route) if (count(fid) < count(best)) best = fid;
  return best;
}

function nextLine(palace: Palace, progress: import('../../core/types').PalaceProgress) {
  const left = dueNotions(progress, Date.now() + 18 * 3600_000).length;
  if (palace.examDate) return 'See you tomorrow';
  return left ? 'See you tomorrow' : 'Rest well';
}

/**
 * Import from the phone: a QR code + 4-letter code; the palace arrives, then we place it.
 */
export async function importFlow(app: App) {
  const token = app.token;
  app.hideAllPanels();
  app.flame.root.visible = true;
  let slot;
  try {
    slot = await createPairSlot();
  } catch {
    app.say('Offline', 'think', 3);
    await wait(3, token);
    return null;
  }
  app.qr.setSlot(slot.url, slot.code);
  app.qr.setState('waiting');
  app.follow.snap();
  app.qr.setVisible(true, true);
  app.say('Scan me', 'point', 5);
  sfx.play('menuOpen');
  let connected = false;
  let result: Palace | null = null;
  // Polling loop (every 2 s of XR time; freezes while the headset is off).
  while (!result && !token.cancelled) {
    const r = await pollPalace(slot);
    if (r?.status === 'importing' && !connected) {
      connected = true;
      app.qr.setState('receiving');
      sfx.play('phoneConnected');
      app.say('Connected!', 'happy', 3);
    }
    if (r?.status === 'ready' && r.palace) {
      result = r.palace;
      break;
    }
    await wait(2, token);
  }
  if (!result) return null;
  app.qr.setState('ready');
  sfx.play('importReady');
  app.store.addPalace(result);
  app.say('New palace!', 'celebrate', 2.5);
  await wait(1.6, token);
  app.qr.setVisible(false, true);
  return result;
}

/** Pick a palace from the shelf (books with progress). Resolves with the id, 'import', or null. */
export async function shelfFlow(app: App): Promise<string | null> {
  const token = app.token;
  const books = app.store.palaces().map((p) => {
    const pr = app.store.progress(p.id);
    const plan = planToday(p, pr, Date.now(), {});
    return { id: p.id, title: p.title, subject: p.subject, solid: plan.solidCount, total: plan.total, examLine: plan.daysLeft !== undefined ? `exam in ${plan.daysLeft} d` : undefined };
  });
  books.push({ id: 'import', title: 'New from phone', subject: 'Import', solid: 0, total: 0, examLine: undefined, isNew: true } as never);
  app.hideAllPanels();
  app.shelf.setBooks(books);
  app.follow.snap();
  app.shelf.setVisible(true, true);
  for (const b of app.shelf.buttons)
    addTarget({ id: `shelf-${b.id}`, kind: 'shelf', enabled: () => app.shelf.root.visible, center: (o) => b.center(o), radius: b.radius, priority: 3, touchRadius: b.radius * 1.1 });
  app.say('Pick a palace', 'happy', 3);
  const chosen = await waitFor<string>(() => {
    const h = getHovered();
    app.shelf.setHover(h?.kind === 'shelf' ? h.id.slice(6) : null);
    const sel = pinchSelection();
    return sel?.target?.kind === 'shelf' ? sel.target.id.slice(6) : null;
  }, token, 30);
  clearTargets('shelf');
  app.shelf.setVisible(false, true);
  return chosen;
}
