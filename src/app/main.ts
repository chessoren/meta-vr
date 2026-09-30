import { World, SessionMode } from '@iwsdk/core';
import * as THREE from 'three';
import { installEmulator, emuLookAt, emuPose, type EmuRoom } from './emulation';
import { createBootUI } from './boot-ui';
import { App } from './app';
import { AppStore } from './state/store';
import { Cancelled, until, waitFor } from './flow/runtime';
import { onboarding, type OnboardingStep } from './flows/onboarding';
import { dailySession, importFlow, shelfFlow } from './flows/session';
import { XR } from './xr/context';
import { Hands } from './xr/hands';
import { addTarget, clearTargets, pinchSelection } from './xr/targeting';
import { sfx } from './sfx';
import { voice } from './voice/voice';
import { installRealVisuals, installAudio } from './wiring';

const params = new URLSearchParams(location.search);
const emu = params.get('emu') as EmuRoom | null;

async function boot() {
  const ui = createBootUI();
  const t0 = performance.now();
  if (emu) await installEmulator(emu, params.get('device') ?? 'quest3');
  if (params.has('reset')) localStorage.removeItem('loci.store.v1');

  await Promise.all([installRealVisuals(), installAudio(), document.fonts?.ready]);
  const store = new AppStore();

  const world = await World.create(document.getElementById('scene-container') as HTMLDivElement, {
    xr: {
      sessionMode: SessionMode.ImmersiveAR,
      offer: 'none',
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
  installDebugHooks(app);

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
      XR.session = null;
      XR.frame = null;
      store.saveNow();
      app.newToken();
      running = null;
      clearTargets();
      ui.show(store.data.onboardingDone ? 'Back to my palace' : 'Continue');
    });
    app.room.begin(store.room());
    app.scanner.reset();
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
}

async function offerVoice(el: HTMLElement) {
  const url = (import.meta.env.VITE_VOSK_MODEL_URL as string | undefined) ?? '/models/vosk-model-small-en-us-0.15.tar.gz';
  const head = await fetch(url, { method: 'HEAD' }).catch(() => null);
  if (!head?.ok) return;
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
  const token = app.token;
  app.proof.setVisible(false, true);
  app.bubbles[0].setText('Import my course');
  app.bubbles[2].setText('Try History');
  app.bubbles[1].setVisible(false, false);
  for (const i of [0, 2]) {
    const b = app.bubbles[i];
    b.setState('idle');
    b.setVisible(true, true);
    addTarget({ id: `next-${i}`, kind: 'bubble', enabled: () => b.root.visible, center: (o) => b.root.getWorldPosition(o), radius: b.radius * 1.2, priority: 3, touchRadius: b.radius * 1.3 });
  }
  app.follow.snap();
  app.say('What next?', 'happy', 20);
  const choice = await waitFor(() => {
    const s = pinchSelection();
    return s?.target?.id === 'next-0' ? 'import' : s?.target?.id === 'next-2' ? 'history' : null;
  }, token, 40);
  clearTargets('bubble');
  app.bubbles.forEach((b) => b.setVisible(false, true));
  if (choice === 'import') {
    const p = await importFlow(app);
    if (p) await dailySession(app, p.id);
  } else if (choice === 'history') {
    await dailySession(app, 'world-wars');
  }
}

/** Idle: the room shows what you know; look at any object + pinch to practise it. */
async function idle(app: App) {
  const token = app.token;
  app.view.setAllModes('idle');
  app.flame.setMood('sleepy');
  await app.flameTo(app.flameHome(), 1.2);
  await until(() => token.cancelled, token);
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
    }),
  };
}

boot().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;bottom:0;left:0;color:#f88;z-index:99">${String(e?.stack ?? e)}</pre>`);
});
