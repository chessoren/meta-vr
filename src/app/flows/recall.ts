import * as THREE from 'three';
import type { App } from '../app';
import type { Palace, PalaceProgress } from '../../core/types';
import { rayHitsFurniture } from '../xr/room-scan';
import { addTarget, getHovered, getHoverTime, pinchSelection, removeTarget, clearTargets } from '../xr/targeting';
import { until, wait, waitFor } from '../flow/runtime';
import { XR } from '../xr/context';
import { sfx } from '../sfx';
import { soundIndex } from './scan';

const _v = new THREE.Vector3();
const DWELL_SELECT = 1.6; // seconds of gaze to select hands-free

/** All scenes dissolve in route order; only a small ember stays on each object. */
export async function lightsOut(app: App) {
  const token = app.token;
  app.say('Lights out', 'sleepy', 2.2);
  await wait(0.9, token);
  sfx.play('lightsOut');
  const items = [...app.view.items.values()].sort((a, b) => a.placement.order - b.placement.order);
  for (const it of items) {
    app.view.setMode(it.notion.id, 'ember');
    sfx.play('dissolve', app.view.worldPos(it.notion.id, _v), { gain: 0.5 });
    await wait(0.28, token);
  }
  await wait(1.0, token);
}

export interface RecallOpts {
  /** Only ask notions never answered since placement (onboarding). */
  onlyUnanswered?: boolean;
  /** Explicit list (route order is applied). */
  ids?: string[];
  intro?: boolean;
}

/**
 * Walk the due objects. The next one on the route glows brightest and the flame waits next
 * to it; the learner may pick any glowing object (gaze + pinch, or just keep looking).
 * Correct: the scene relights on its object (the room comes back to life). Wrong: the scene
 * replays, exaggerated, with its caption, and the notion comes back at the end.
 */
export async function recallAll(app: App, palace: Palace, progress: PalaceProgress, opts: RecallOpts = {}) {
  const token = app.token;
  const byOrder = (a: string, b: string) => (app.view.items.get(a)?.placement.order ?? 0) - (app.view.items.get(b)?.placement.order ?? 0);
  let queue = (opts.ids ?? [...app.view.items.keys()]).filter((id) => app.view.items.has(id));
  if (opts.onlyUnanswered) queue = queue.filter((id) => !(progress.reviews[id]?.log.length));
  queue.sort(byOrder);
  const retried = new Set<string>();
  let correct = 0;
  let asked = 0;
  for (const id of queue) app.view.setMode(id, 'due');

  if (opts.intro && queue.length) {
    app.say('Look · pinch', 'point', 3);
    app.hint.setKind('look');
    app.hint.setVisible(true, true);
  }

  while (queue.length) {
    const nextId = queue[0];
    // Flame waits beside the suggested object.
    const p = app.view.worldPos(nextId, new THREE.Vector3());
    const toHead = new THREE.Vector3().subVectors(XR.head.pos, p).setY(0).normalize().multiplyScalar(0.16);
    void app.flameTo(p.clone().add(toHead).add(new THREE.Vector3(0, 0.06, 0)), 0.9).catch(() => {});
    app.flame.pointAt(p);

    // Selection targets for every due item.
    const tids: string[] = [];
    for (const id of queue) {
      const it = app.view.items.get(id)!;
      const f = app.room.getFurniture(it.placement.furnitureId);
      const tid = `item-${id}`;
      tids.push(tid);
      const m4 = new THREE.Matrix4();
      addTarget({
        id: tid,
        kind: 'item',
        enabled: () => true,
        center: (o) => app.view.worldPos(id, o),
        radius: 0.13,
        priority: id === nextId ? 1 : 0,
        hit: f
          ? (origin, dir) => {
              // Gazing at the furniture selects the due item on it closest to the gaze.
              app.room.furnitureMatrix(f, m4);
              const d = rayHitsFurniture(origin, dir, { ...f, center: [0, 0, 0], yaw: 0 }, m4, 0.08);
              if (d === null) return null;
              const hitP = _v.copy(origin).addScaledVector(dir, d);
              let bestId = id;
              let bestD = Infinity;
              for (const q of queue) {
                const qi = app.view.items.get(q);
                if (qi?.placement.furnitureId !== f.id) continue;
                const dd = app.view.worldPos(q, new THREE.Vector3()).distanceTo(hitP);
                if (dd < bestD) {
                  bestD = dd;
                  bestId = q;
                }
              }
              return bestId === id ? d : null;
            }
          : undefined,
      });
    }
    let lastHover: string | null = null;
    const chosenTid = await waitFor<string>(() => {
      const h = getHovered();
      const hid = h?.kind === 'item' ? h.id.slice(5) : null;
      if (hid !== lastHover) {
        if (lastHover && queue.includes(lastHover)) app.view.setMode(lastHover, 'due');
        if (hid) {
          app.view.setMode(hid, 'active');
          sfx.play('hover', app.view.worldPos(hid, _v), { gain: 0.4 });
        }
        lastHover = hid;
      }
      app.reticle.setProgress(hid ? Math.min(1, getHoverTime() / DWELL_SELECT) : null);
      const sel = pinchSelection();
      if (sel?.target?.kind === 'item') return sel.target.id;
      if (hid && getHoverTime() >= DWELL_SELECT) return h!.id;
      return null;
    }, token);
    app.reticle.setProgress(null);
    for (const t of tids) removeTarget(t);
    if (!chosenTid) continue;
    const id = chosenTid.slice(5);
    const it = app.view.items.get(id)!;
    app.hint.setVisible(false, true);
    const fid = it.placement.furnitureId;
    const pos = app.view.worldPos(id, new THREE.Vector3());
    sfx.object(soundIndex(app, fid), pos, 'select');
    app.view.setMode(id, 'active');
    app.flame.pointAt(null);
    void app.flameTo(app.flameHome(), 0.8).catch(() => {});

    const res = await app.ask(it.notion);
    asked++;
    const ups = app.recordReview(progress, palace, id, res);
    queue = queue.filter((q) => q !== id);
    if (res.correct) {
      correct++;
      sfx.play('correct', pos);
      app.say(pick(['Yes!', 'Right!', 'Bravo', 'Exactly'], asked), 'happy', 1.6);
      app.view.setMode(id, 'reveal');
      app.sparkles.emit(pos, '#ffe7a3', 30, 0.7);
      await wait(0.25, token);
      sfx.object(soundIndex(app, fid), pos, 'reveal');
    } else {
      sfx.play('wrong', pos);
      app.say(res.mode === 'reveal' ? 'Look again' : 'Watch', 'think', 2.4);
      app.view.setMode(id, 'replay');
      app.caption.setText(it.notion.scene.caption, it.notion.scene.hooks);
      app.caption.root.position.set(0, 0.16, 0.02);
      app.caption.setVisible(true, true);
      if (!retried.has(id)) {
        retried.add(id);
        queue.push(id); // comes back at the end of this session
      }
    }
    for (const u of ups) {
      if (u.to === 'solid' || u.to === 'anchored') {
        sfx.play(u.to === 'anchored' ? 'tierAnchored' : 'tierUp', pos);
        app.sparkles.emit(pos, u.to === 'anchored' ? '#f0c24e' : '#9be38f', 40, 0.9);
      }
    }
    await app.dismissQuestion(res.correct ? 1.1 : 2.6);
    app.caption.setVisible(false, true);
    await wait(res.correct ? 1.2 : 0.4, token);
    // The answered object stays lit (idle look for its tier); a retry goes back to glowing.
    app.view.setMode(id, queue.includes(id) ? 'due' : 'idle');
  }
  clearTargets('item');
  app.hint.setVisible(false, true);
  await until(() => true, token);
  return { correct, asked };
}

function pick<T>(arr: T[], i: number) {
  return arr[i % arr.length];
}
