import { World, SessionMode } from '@iwsdk/core';
import * as THREE from 'three';
import { installEmulator, emuLookAt, emuPose, installDesktopControls, type EmuRoom } from './emulation';
import { createBootUI } from './boot-ui';
import { App } from './app';
import { AppStore } from './state/store';
import { Cancelled, until, wait, waitFor } from './flow/runtime';
import { onboarding, type OnboardingStep } from './flows/onboarding';
import { dailySession, importFlow, shelfFlow } from './flows/session';
import { XR } from './xr/context';
import { Hands } from './xr/hands';
import { addTarget, clearTargets, getHovered, pinchSelection, removeTarget } from './xr/targeting';
import { sfx } from './sfx';
import { voice, findModelUrl } from './voice/voice';
import { installRealVisuals, installAudio } from './wiring';

const params = new URLSearchParams(location.search);
const emu = params.get('emu') as EmuRoom | null;

async function boot() {
  const ui = createBootUI();
  const t0 = performance.now();
  if (emu) await installEmulator(emu, params.get('device') ?? 'quest3');
  // Test/debug only: never let a stray URL wipe a learner's palaces in production.
  if (params.has('reset') && (emu || import.meta.env.DEV)) localStorage.removeItem('loci.store.v1');

  await Promise.all([installRealVisuals(), installAudio(), document.fonts?.ready]);
  const store = new AppStore();

  const world = await World.create(document.getElementById('scene-container') as HTMLDivElement, {
    xr: {
      sessionMode: SessionMode.ImmersiveAR,
      // On a real headset, also let the browser offer its own "Enter" prompt (one pinch to come back).
      offer: emu ? 'none' : 'always',
      launchOnSessionGranted: true,
      features: {
        handTracking: { required: true },
        anchors: true,
        planeDetection: true,
        meshDetection: true,
        hitTest: false,
        gazeTracking: true,
      },
    },
    features: { sceneUnderstanding: false, grabbing: false, locomotion: false, spatialUI: false },
    render: { near: 0.02, far: 40 },
  });
  world.renderer.setClearColor(0x000000, 0);
  const { setFxViewer } = await import('../lib3d/fx/common');
  setFxViewer(world.camera);
  const app = new App(world, store);
  const w = window as unknown as Record<string, unknown>;
  w.__world = world;
  w.__app = app;
  if (emu || import.meta.env.DEV) installDebugHooks(app);
  addEventListener('pagehide', () => store.saveNow());
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && store.saveNow());

  // ── Frame loop ──────────────────────────────────────────────────────────────
  world.onXRFrame((frame, delta) => {
    if (app.paused) return;
    app.frame(frame, Math.min(delta, 0.1), frame.predictedDisplayTime ? frame.predictedDisplayTime / 1000 : performance.now() / 1000);
  });

  // ── Session lifecycle ───────────────────────────────────────────────────────
  let running: Promise<void> | null = null;
  const onSession = (session: XRSession) => {
    ui.hide();
    XR.session = session;
    session.addEventListener('visibilitychange', () => {
      XR.visibility = session.visibilityState;
      // Headset off (hidden) or system overlay (visible-blurred): freeze every flow exactly where it is.
      app.paused = session.visibilityState !== 'visible';
      if (session.visibilityState === 'hidden') {
        store.saveNow();
        sfx.engine.suspend?.();
        voice.suspend();
      } else {
        sfx.engine.resume?.();
        voice.resume();
      }
    });
    session.addEventListener('end', () => {
      app.paused = false;
      XR.session = null;
      XR.frame = null;
      XR.head.valid = false;
      store.saveNow();
      app.newToken();
      app.hideAllPanels();
      app.closeMenu();
      voice.stop();
      voice.suspend();
      running = null;
      clearTargets();
      ui.show(store.data.onboardingDone ? 'Back to my palace' : 'Continue');
    });
    app.room.begin(store.room());
    app.scanner.reset();
    XR.head.valid = false;
    // Recentring moves the reference space: re-register the room on its furniture.
    const watchRef = () => {
      const ref = world.renderer.xr.getReferenceSpace();
      if (!ref) return void requestAnimationFrame(watchRef);
      ref.addEventListener('reset', () => {
        app.scanner.reset();
        app.room.reRegister();
      });
    };
    watchRef();
    void app.room.restoreAnchor(session);
    sfx.engine.startAmbience();
    running = director(app).catch((e) => {
      if (!(e instanceof Cancelled)) console.error('[loci] flow error', e);
    });
    void running;
  };
  // IWSDK adopts the session on the renderer; watch it.
  world.renderer.xr.addEventListener('sessionstart', () => {
    const s = world.renderer.xr.getSession();
    if (s) onSession(s);
  });

  if (emu && !params.has('test')) installDesktopControls(Hands);
  app.onMenu = (id) => void onMenu(app, id);
  app.onExit = () => void exit(app, world);

  const enter = () => {
    void sfx.engine.unlock();
    world.launchXR();
  };
  ui.setReady(enter, store.data.onboardingDone ? 'Enter your palace' : 'Begin');
  ui.setStatus(`Hands only · stay seated · ready in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  if (!navigator.xr && !emu) {
    ui.setError('This page runs in the <b>Meta Quest Browser</b>. On a computer, <a href="?emu=living_room">try the emulator</a>.');
  } else {
    const ar = await navigator.xr?.isSessionSupported('immersive-ar').catch(() => false);
    if (!ar) ui.setError('Mixed reality is not available in this browser. Open this page in the <b>Meta Quest Browser</b>.');
  }
  // Voice answers are opt-in (microphone permission must be asked in 2D, before entering).
  void offerVoice(ui.el);

  // Installed PWA on Horizon OS: there is no page to click — the app-icon tap is the user
  // activation, spent immediately on entering mixed reality (Meta's recommended pattern).
  if ('getDigitalGoodsService' in window && !emu) {
    navigator.xr
      ?.isSessionSupported('immersive-ar')
      .then((ok) => ok && enter())
      .catch(() => {});
  }
  // Offline after the first launch (built-in palaces never need the network).
  if (import.meta.env.PROD && 'serviceWorker' in navigator && !emu) {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((e) => console.info('[loci] no service worker', e));
  }
}

async function offerVoice(el: HTMLElement) {
  if (!(await findModelUrl())) return;
  const a = document.createElement('button');
  a.textContent = '🎙  Enable voice answers';
  a.style.cssText = 'margin-top:8px;background:none;border:1px solid #e9b94988;color:#f6e7c8;border-radius:999px;padding:12px 28px;font:600 18px Inter,system-ui;cursor:pointer';
  a.onclick = async () => {
    a.disabled = true;
    a.textContent = 'Loading voice…';
    const ok = await voice.init();
    a.textContent = ok ? '🎙  Voice answers on' : 'Voice unavailable — bubbles work fine';
  };
  el.querySelector('.wrap')?.appendChild(a);
}

/** Top-level sequencing: onboarding (first time) or the daily session, then idle practice. */
async function director(app: App) {
  // Never place anything from a stale head pose: wait for the first tracked frame.
  await until(() => XR.head.valid, app.token);
  const flow = app.store.flow();
  if (!app.store.data.onboardingDone) {
    await onboarding(app, (flow?.kind === 'onboarding' ? flow.step : 'hello') as OnboardingStep);
    await afterOnboarding(app);
  } else {
    await dailySession(app, flow?.palaceId);
  }
  await idle(app);
}

/** End of the first five minutes: offer to import a real course, or try the History palace. */
async function afterOnboarding(app: App) {
  app.proof.setVisible(false, true);
  app.say('What next?', 'happy', 40);
  const choice = await app.choose(['Import my course', 'Try History'], { timeoutSec: 40 });
  if (choice === 0) {
    const p = await importFlow(app);
    if (p) await dailySession(app, p.id);
  } else if (choice === 1) {
    await dailySession(app, 'world-wars');
  }
}

/** Idle: the room shows what you know; look at any object + pinch to practise it. */
async function idle(app: App) {
  const token = app.token;
  app.view.setAllModes('idle');
  app.flame.setMood('sleepy');
  await app.flameTo(app.flameHome(), 1.2);
  // Free practice: look at any object that holds a notion and pinch it to test yourself.
  const palace = app.view.palace;
  const progress = app.view.progress;
  if (!palace || !progress) return until(() => token.cancelled, token);
  for (;;) {
    const ids = [...app.view.items.keys()];
    if (!ids.length) return until(() => token.cancelled, token);
    const picked = await practicePick(app, ids);
    const it = picked ? app.view.items.get(picked) : undefined;
    if (!it) continue;
    app.flame.setMood('happy');
    const res = await app.ask(it.notion, { sub: 'Practice' });
    app.recordReview(progress, palace, it.notion.id, res);
    const pos = app.view.worldPos(it.notion.id, new THREE.Vector3());
    sfx.play(res.correct ? 'correct' : 'wrong', pos);
    app.view.setMode(it.notion.id, res.correct ? 'reveal' : 'replay');
    if (!res.correct) {
      app.caption.setText(it.notion.scene.caption, it.notion.scene.hooks);
      app.caption.setVisible(true, true);
    }
    await app.dismissQuestion(res.correct ? 1.2 : 2.6);
    app.caption.setVisible(false, true);
    await wait(1.4, token);
    app.view.setMode(it.notion.id, 'idle');
    app.flame.setMood('sleepy');
  }
}

/** Gaze + pinch (or a long look) on a placed notion; targets are removed on every exit path. */
async function practicePick(app: App, ids: string[]): Promise<string | null> {
  const token = app.token;
  const tids = ids.map((id) => {
    const tid = `item-${id}`;
    addTarget({ id: tid, kind: 'item', enabled: () => true, center: (o) => app.view.worldPos(id, o), radius: 0.12 });
    return tid;
  });
  const drop = () => tids.forEach(removeTarget);
  token.onCancel(drop);
  let last: string | null = null;
  try {
    return await waitFor<string>(() => {
      const h = getHovered();
      const hid = h?.kind === 'item' ? h.id.slice(5) : null;
      if (hid !== last) {
        if (last) app.view.setMode(last, 'idle');
        if (hid) app.view.setMode(hid, 'active');
        last = hid;
      }
      const sel = pinchSelection();
      if (sel?.target?.kind === 'item') return sel.target.id.slice(5);
      return null;
    }, token);
  } finally {
    if (last) app.view.setMode(last, 'idle');
    drop();
  }
}

async function onMenu(app: App, id: string) {
  if (id === 'sound') {
    const m = !sfx.engine.muted;
    sfx.engine.setMuted(m);
    app.store.data.settings.sound = !m;
    app.store.save();
    app.menu.setToggle('sound', !m);
    app.say(m ? 'Quiet' : 'Sound on', 'happy', 1.5);
    return;
  }
  if (id === 'exit') return exit(app, (window as unknown as { __world: World }).__world);
  const token = app.newToken();
  app.hideAllPanels();
  for (const fid of app.room.furniture().map((f) => f.id)) app.view.setHaloOverride(fid, null);
  app.view.setGlobalHalo(null);
  try {
    if (id === 'import') {
      const p = await importFlow(app);
      if (p) await dailySession(app, p.id);
    } else if (id === 'palaces') {
      const pick = await shelfFlow(app);
      if (pick === 'import') {
        const p = await importFlow(app);
        if (p) await dailySession(app, p.id);
      } else if (pick) await dailySession(app, pick);
    }
    if (!token.cancelled) await idle(app);
  } catch (e) {
    if (!(e instanceof Cancelled)) console.error('[loci] menu flow', e);
  }
}

async function exit(app: App, world: World) {
  app.store.saveNow();
  app.newToken();
  app.hideAllPanels();
  sfx.play('goodbye');
  app.say('Bye!', 'wave', 2);
  sfx.engine.stopAmbience(1);
  await new Promise((r) => setTimeout(r, 1300));
  world.exitXR();
}

/** Test/debug surface (used by Playwright + IWER). */
function installDebugHooks(app: App) {
  const w = window as unknown as Record<string, unknown>;
  w.__loci = {
    app,
    Hands,
    XR,
    THREE,
    lookAt: emuLookAt,
    pose: emuPose,
    menu: (id: string) => app.onMenu?.(id),
    /** Simulate taking the headset off / putting it back on. */
    visibility: (v: 'visible' | 'hidden' | 'visible-blurred') => (window as unknown as { __emu?: { device: { updateVisibilityState(s: string): void } } }).__emu?.device.updateVisibilityState(v),
    savedPlacements: () => {
      try {
        const s = JSON.parse(localStorage.getItem('loci.store.v1') ?? '{}');
        return (s.progress ?? []).reduce((n: number, p: { placements: unknown[] }) => n + p.placements.length, 0);
      } catch {
        return -1;
      }
    },
    /** Place every notion of a palace instantly (perf audits, screenshots). */
    placeAll: (palaceId: string, mode: 'idle' | 'reveal' = 'idle') => {
      const palace = app.store.palace(palaceId);
      if (!palace || !app.room.room) return 0;
      app.newToken();
      app.store.setActivePalace(palace.id);
      const progress = app.store.progress(palace.id);
      const seen = app.room.furniture().filter((f) => app.room.isSeen(f.id));
      palace.notions.forEach((n, i) => {
        if (progress.placements.some((p) => p.notionId === n.id)) return;
        const f = seen[i % seen.length];
        const hit = app.room.toSession([f.center[0] + (((i * 37) % 7) - 3) * 0.08, f.center[1] + f.size[1] / 2, f.center[2]], new THREE.Vector3());
        const spot = app.spotOn(f, hit, progress, n.id);
        progress.placements.push({ notionId: n.id, furnitureId: f.id, local: spot.local, order: i, placedAt: Date.now() });
      });
      app.view.load(palace, progress);
      app.view.setAllModes(mode);
      app.hideAllPanels();
      return progress.placements.length;
    },
    renderInfo: () => {
      const r = (window as unknown as { __world: World }).__world.renderer;
      return { calls: r.info.render.calls, triangles: r.info.render.triangles, geometries: r.info.memory.geometries, textures: r.info.memory.textures, programs: r.info.programs?.length ?? 0 };
    },
    /**
     * Max horizontal distance between each placed scene and the box of the object it was
     * placed on, as detected NOW by the headset (proves persistence + registration).
     */
    placementError: () => {
      let worst = 0;
      const v = new THREE.Vector3();
      for (const it of app.view.items.values()) {
        const sid = app.room.matchedSessionId(it.placement.furnitureId);
        const cur = sid ? app.scanner.furniture.get(sid) : undefined;
        if (!cur) continue;
        it.anchor.getWorldPosition(v);
        const d = Math.hypot(v.x - cur.center[0], v.z - cur.center[2]) - Math.hypot(cur.size[0], cur.size[2]) / 2;
        worst = Math.max(worst, d);
      }
      return worst;
    },
    /** World position of a placed notion's scene / a bubble / the flame (for tests). */
    posOf: (what: string) => {
      const v = new THREE.Vector3();
      if (what === 'flame') app.flame.root.getWorldPosition(v);
      else if (what.startsWith('bubble')) app.bubbles[Number(what.slice(6))].root.getWorldPosition(v);
      else if (what.startsWith('furniture:')) {
        const f = app.room.getFurniture(what.slice(10));
        if (f) app.room.toSession(f.center, v);
      } else app.view.worldPos(what, v);
      return [v.x, v.y, v.z];
    },
    state: () => ({
      session: !!XR.session,
      roomReady: app.room.ready,
      registration: app.room.source,
      furniture: app.room.furniture().map((f) => ({ id: f.id, label: f.label, name: f.name, seen: app.room.isSeen(f.id) })),
      flow: app.store.flow(),
      onboardingDone: app.store.data.onboardingDone,
      activePalace: app.store.data.activePalaceId,
      placements: app.view.progress?.placements.length ?? 0,
      reviews: Object.values(app.view.progress?.reviews ?? {}).reduce((n, r) => n + r.log.length, 0),
      card: app.card.root.visible,
      bubbles: app.bubbles.map((b) => b.root.visible),
      proof: app.proof.root.visible,
      qr: app.qr.root.visible,
      flameVisible: app.flame.root.visible,
      options: app.debug.options ?? null,
      currentNotion: app.debug.notion ?? null,
      due: [...app.view.items.values()].filter((i) => i.mode === 'due' || i.mode === 'active').map((i) => i.notion.id),
      presenting: app.debug.presenting ?? null,
      pair: app.debug.pair ?? null,
    }),
  };
}

boot().catch((e) => {
  console.error(e);
  const pre = document.createElement('pre');
  pre.style.cssText = 'position:fixed;bottom:0;left:0;right:0;color:#ffcf9e;background:#140d08;z-index:99;white-space:pre-wrap;padding:12px;font:13px monospace';
  pre.textContent = `Loci could not start: ${String(e?.message ?? e)}`;
  document.body.appendChild(pre);
});
