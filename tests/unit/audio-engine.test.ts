import { describe, expect, it } from 'vitest';
import { AudioEngine, pentatonicRatio } from '../../src/audio/engine';

describe('audio engine (node, no Web Audio)', () => {
  it('is a singleton that is safe to call before unlock / without Web Audio', async () => {
    const a = AudioEngine.get();
    expect(AudioEngine.get()).toBe(a);
    expect(a.ready).toBe(false);
    await a.unlock();
    a.setMuted(true);
    expect(a.muted).toBe(true);
    a.setMuted(false);
    a.setMasterVolume(0.5);
    a.setListener({ x: 0, y: 1.2, z: 0 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 });
    a.play('correct');
    a.play('scanPing', { x: 1, y: 0, z: -1 }, { pitch: pentatonicRatio(2) });
    a.objectVoice(3, { x: 0, y: 0, z: -1 }, 'reveal');
    a.startAmbience();
    a.setAmbienceLevel(0.4);
    a.stopAmbience();
    const plan = a.flameVoice('Pinch me', 'happy');
    expect(plan.syllables.length).toBe(2);
    expect(plan.duration).toBeGreaterThan(0.2);
  });
});
