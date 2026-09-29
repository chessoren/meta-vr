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
