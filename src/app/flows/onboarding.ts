import * as THREE from 'three';
import type { App } from '../app';
import { getBuiltinPalace } from '../../core/palaces';
import { until, wait, waitFor } from '../flow/runtime';
import { inFrontOfHead, XR } from '../xr/context';
import { Hands } from '../xr/hands';
import { addTarget, getHovered, pinchSelection, removeTarget } from '../xr/targeting';
import { sfx } from '../sfx';
import { scanRoom, ensureLoci, seenRoute } from './scan';
import { lightsOut, recallAll } from './recall';

/**
 * The first five minutes — no reading, and proof of learning at the end.
 *   0:00 hello · 0:15 pinch lesson · 0:30 room scan · 1:00 trial palace (5 tricky capitals)
 *   1:30 place ×5 · 3:00 lights out · 3:30 recall ×5 · 4:30 proof
 * Checkpoints are saved so taking the headset off (or a reload) resumes at the same step.
 */
export type OnboardingStep = 'hello' | 'pinch' | 'scan' | 'place' | 'lightsout' | 'recall' | 'proof';
const ORDER: OnboardingStep[] = ['hello', 'pinch', 'scan', 'place', 'lightsout', 'recall', 'proof'];

export async function onboarding(app: App, resumeAt: OnboardingStep = 'hello') {
  const token = app.token;
  const palace = getBuiltinPalace('capitals')!;
  const progress = app.store.progress(palace.id);
  app.store.setActivePalace(palace.id);
  app.view.load(palace, progress);
  let step = ORDER.indexOf(resumeAt);
  // If notions were already placed, we can't be before 'place'.
  if (progress.placements.length > 0 && step < ORDER.indexOf('place')) step = ORDER.indexOf('place');
  const at = (s: OnboardingStep) => step <= ORDER.indexOf(s);
  const checkpoint = (s: OnboardingStep) => {
    step = ORDER.indexOf(s);
    app.store.setFlow({ kind: 'onboarding', step: s, palaceId: palace.id });
  };

  // ── 0:00 Hello ─────────────────────────────────────────────────────────────
  app.flame.root.visible = true;
  app.flame.root.position.copy(inFrontOfHead(0.9, -0.1, 0.25));
  app.flame.setScale(0.2);
  await app.flameTo(app.flameHome(), 1.4);
  app.flame.setScale(1);
  if (at('hello')) {
    checkpoint('hello');
    app.say('Hi!', 'wave', 2.4);
    await wait(2.4, token);
  }

  // ── 0:15 Pinch lesson ──────────────────────────────────────────────────────
  if (at('pinch')) {
    checkpoint('pinch');
    app.say('Pinch me', 'beckon', 60);
    app.hint.setKind('pinch');
    app.hint.setVisible(true, true);
    const fid = 'flame';
    addTarget({
      id: fid,
      kind: 'flame',
      enabled: () => true,
      center: (o) => app.flame.root.getWorldPosition(o),
      radius: 0.07,
      priority: 2,
      touchRadius: 0.1,
    });
    const started = XR.time;
    // Pinching the flame (gaze or touch) counts; after 6 s any pinch counts, so nobody gets stuck.
    await waitFor(() => {
      const sel = pinchSelection();
      if (!sel) return null;
      return sel.target?.id === fid || XR.time - started > 6 ? true : null;
    }, token);
    removeTarget(fid);
    app.hint.setVisible(false, true);
    app.flame.bounce();
    sfx.play('bounce', app.flame.root.position);
    app.say('Yes!', 'happy', 1.6);
    await wait(1.4, token);
    // A second pinch cements it.
    app.say('Again!', 'beckon', 8);
    await waitFor(() => (Hands.left.pinchStarted || Hands.right.pinchStarted ? true : null), token, 6);
    app.flame.bounce();
    sfx.play('bounce', app.flame.root.position, { pitch: 1.2 });
    app.say('Perfect', 'happy', 1.6);
    await wait(1.2, token);
  }

  // ── 0:30 Room scan ─────────────────────────────────────────────────────────
  const introduceScan = at('scan');
  if (introduceScan) checkpoint('scan');
  await until(() => app.room.ready, token);
  // Resuming later than the scan: a quick glow of the objects, not the whole tour again.
  await scanRoom(app, { introduce: introduceScan });
  await ensureLoci(app, 5);

  // ── 1:00 – 3:00 Place the five capitals ───────────────────────────────────
  if (at('place')) {
    checkpoint('place');
    app.say('5 capitals', 'happy', 2.2);
    await wait(1.6, token);
    const route = routeSuggestions(app);
    let k = 0;
    for (const notion of palace.notions) {
      if (progress.placements.some((p) => p.notionId === notion.id)) continue;
      const suggest = route.find((fid) => !progress.placements.some((p) => p.furnitureId === fid)) ?? route[k % Math.max(1, route.length)] ?? null;
      k++;
      if (suggest) {
        const f = app.room.getFurniture(suggest)!;
        const p = app.room.toSession(f.center, new THREE.Vector3());
        app.flame.pointAt(p);
      }
      app.say(k === 1 ? 'Pinch it' : null, 'point', 3);
      if (k === 1) {
        app.hint.setKind('pinch');
        app.hint.setVisible(true, true);
      }
      const placed = app.place(palace, progress, notion, { suggest });
      if (k === 1) {
        // After the grab, teach "look where you want it, let go".
        void (async () => {
          await until(() => Hands.left.pinching || Hands.right.pinching, token);
          app.hint.setKind('look');
          app.say('Look · let go', 'point', 4);
        })().catch(() => {});
      }
      await placed;
      app.hint.setVisible(false, true);
      app.flame.pointAt(null);
      app.say(k < palace.notions.length ? pickOne(['Lovely', 'Nice!', 'Great', 'Yes!'], k) : 'All set!', 'happy', 1.4);
      await wait(1.1, token);
    }
  }

  // ── 3:00 Lights out ────────────────────────────────────────────────────────
  if (at('lightsout')) {
    checkpoint('lightsout');
    await wait(1.2, token);
    await lightsOut(app);
  } else {
    app.view.setAllModes('ember');
  }

  // ── 3:30 Recall ────────────────────────────────────────────────────────────
  checkpoint('recall');
  const score = await recallAll(app, palace, progress, {
    onlyUnanswered: true,
    intro: true,
  });

  // ── 4:30 Proof ─────────────────────────────────────────────────────────────
  checkpoint('proof');
  const correct = countFirstTryCorrect(progress, palace.notions.map((n) => n.id));
  const total = palace.notions.length;
  app.hideAllPanels();
  app.flame.setMood('celebrate');
  sfx.play('proof');
  app.proof.setContent(`${correct} / ${total}`, 'You just learned the way memory champions do.', 'Tonight, import your real course.');
  app.follow.snap();
  app.proof.setVisible(true, true);
  app.view.setAllModes('idle');
  await wait(4.5, token);
  void score;
  app.store.data.onboardingDone = true;
  app.store.setFlow(null);
  app.store.save();
}

function pickOne<T>(arr: T[], i: number) {
  return arr[i % arr.length];
}

/** Furniture ids in route order (left → right from the seat), seen in this session. */
export function routeSuggestions(app: App): string[] {
  return seenRoute(app);
}

/** Correct answers on the first recall after placement (the onboarding "proof"). */
export function countFirstTryCorrect(progress: import('../../core/types').PalaceProgress, ids: string[]) {
  let n = 0;
  for (const id of ids) {
    const first = progress.reviews[id]?.log[0];
    if (first && first.grade !== 'again') n++;
  }
  return n;
}

void getHovered;
