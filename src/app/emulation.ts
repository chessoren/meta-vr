/**
 * Development / test emulation: installs IWER (Meta's WebXR emulator) with a synthetic
 * Meta Scene room so the whole mixed-reality flow runs in a desktop or headless browser.
 *
 * Enabled with `?emu=<room>` where room ∈ living_room | office_small | office_large | music_room | meeting_room | empty.
 * Optional `&device=quest2|quest3|glasses`. Never loaded on a real headset (dynamic import).
 */
export type EmuRoom = 'living_room' | 'office_small' | 'office_large' | 'music_room' | 'meeting_room' | 'empty';

export interface Emulator {
  device: import('iwer').XRDevice;
  room: EmuRoom;
}

export async function installEmulator(room: EmuRoom, deviceName = 'quest3'): Promise<Emulator> {
  const iwer = await import('iwer');
  const { SyntheticEnvironmentModule } = await import('@iwer/sem');
  const cfg = deviceName === 'quest2' ? iwer.metaQuest2 : deviceName === 'glasses' ? iwer.metaVRGlasses : iwer.metaQuest3;
  const device = new iwer.XRDevice(cfg, { stereoEnabled: false });
  device.primaryInputMode = 'hand';
  // Seated learner: eyes ~1.2 m above the floor.
  device.position.set(0, 1.2, 0);
  device.installRuntime({ forceInstall: true });
  device.installSEM(SyntheticEnvironmentModule as never);
  if (room !== 'empty') {
    const url = new URL(`../../node_modules/@iwer/sem/captures/${room}.json`, import.meta.url).href;
    const json = await (await fetch(url)).json();
    device.sem?.loadEnvironment(json);
  }
  // Emulator only: tint the synthetic grey room like a bedroom on a winter evening (warm, dim),
  // so the desktop preview reads like the real thing. Real headsets show the real room.
  const envCanvas = device.sem?.environmentCanvas;
  if (envCanvas) envCanvas.style.filter = 'sepia(0.75) saturate(1.7) hue-rotate(-12deg) brightness(0.5) contrast(1.1)';
  (window as unknown as { __emu: Emulator }).__emu = { device, room };
  return { device, room };
}

/** Point the emulated headset at a world point (tests drive the gaze with this). */
export function emuLookAt(x: number, y: number, z: number) {
  const emu = (window as unknown as { __emu?: Emulator }).__emu;
  if (!emu) return;
  const p = emu.device.position;
  const dx = x - p.x;
  const dy = y - p.y;
  const dz = z - p.z;
  const yaw = Math.atan2(-dx, -dz);
  const pitch = Math.atan2(dy, Math.hypot(dx, dz));
  // q = yaw(Y) * pitch(X)
  const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2);
  const cp = Math.cos(pitch / 2), sp = Math.sin(pitch / 2);
  emu.device.quaternion.set(cy * sp, sy * cp, -sy * sp, cy * cp);
}

/** Move/turn the emulated headset (e.g. to simulate sitting elsewhere) and recentre the reference space. */
export function emuPose(x: number, y: number, z: number, yawDeg: number, recenter = false) {
  const emu = (window as unknown as { __emu?: Emulator }).__emu;
  if (!emu) return;
  emu.device.position.set(x, y, z);
  const h = (yawDeg * Math.PI) / 360;
  emu.device.quaternion.set(0, Math.sin(h), 0, Math.cos(h));
  if (recenter) emu.device.recenter();
}

/**
 * Desktop preview controls (for people without a headset — e.g. a jury browsing Devpost):
 *   move the mouse → look around · hold the left button → pinch · Space → palm up (reveal)
 *   M → palm menu · F (hold) → closed fist (exit).
 * Installed only with ?emu=… and not in automated tests (?test).
 */
export function installDesktopControls(hands: { force: { pinch: string | null; palmUp: string | null; fist: string | null; palmFace: string | null } }) {
  const emu = (window as unknown as { __emu?: Emulator }).__emu;
  if (!emu) return;
  let yaw = 0;
  let pitch = -0.15;
  const apply = () => {
    const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2);
    const cp = Math.cos(pitch / 2), sp = Math.sin(pitch / 2);
    emu.device.quaternion.set(cy * sp, sy * cp, -sy * sp, cy * cp);
  };
  window.addEventListener('mousemove', (e) => {
    const nx = e.clientX / innerWidth - 0.5;
    const ny = e.clientY / innerHeight - 0.5;
    yaw = -nx * 2.4; // ±70°
    pitch = -ny * 1.4 - 0.1; // ±40°
    apply();
  });
  window.addEventListener('mousedown', (e) => {
    if (e.button === 0 && (e.target as HTMLElement)?.tagName === 'CANVAS') hands.force.pinch = 'right';
  });
  window.addEventListener('mouseup', () => (hands.force.pinch = null));
  const keys: Record<string, 'palmUp' | 'fist' | 'palmFace'> = { ' ': 'palmUp', f: 'fist', m: 'palmFace' };
  window.addEventListener('keydown', (e) => {
    const k = keys[e.key.toLowerCase()];
    if (k) {
      hands.force[k] = 'right';
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    const k = keys[e.key.toLowerCase()];
    if (k) hands.force[k] = null;
  });
  const legend = document.createElement('div');
  legend.id = 'desktop-legend';
  legend.innerHTML =
    '<b>Desktop preview</b> · move mouse: look · hold click: pinch · <kbd>Space</kbd> palm up · <kbd>M</kbd> menu · hold <kbd>F</kbd>: exit';
  legend.style.cssText =
    'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:2147483647;background:#1a120bcc;color:#f6e7c8;font:500 14px Inter,system-ui,sans-serif;padding:8px 16px;border-radius:999px;border:1px solid #e9b94955;pointer-events:none;white-space:nowrap';
  document.body.appendChild(legend);
  apply();
}
