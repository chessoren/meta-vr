/**
 * Connects the app to the art & audio modules. Kept in one place so integration is trivial
 * and the app still runs (with placeholders / silence) if a module fails to load.
 */
import { setAudio, type AudioLike } from './sfx';
import { useVisuals } from './visuals';

export async function installRealVisuals() {
  try {
    const [{ realVisuals }, { fxFontsReady }] = await Promise.all([import('./visuals/real'), import('../lib3d/fx/common')]);
    useVisuals(realVisuals);
    await Promise.race([fxFontsReady(), new Promise((r) => setTimeout(r, 2500))]);
  } catch (e) {
    console.warn('[loci] art modules unavailable, using placeholders', e);
  }
}

export async function installAudio() {
  try {
    const { AudioEngine } = await import('../audio/engine');
    setAudio(AudioEngine.get() as unknown as AudioLike);
  } catch (e) {
    console.warn('[loci] audio engine unavailable, running silent', e);
  }
}
