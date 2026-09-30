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
