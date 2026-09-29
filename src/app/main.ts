import { World, SessionMode } from '@iwsdk/core';
import { installEmulator, type EmuRoom } from './emulation';

const params = new URLSearchParams(location.search);
const emu = params.get('emu') as EmuRoom | null;

async function boot() {
  if (emu) await installEmulator(emu, params.get('device') ?? 'quest3');

  const world = await World.create(document.getElementById('scene-container') as HTMLDivElement, {
    xr: {
      sessionMode: SessionMode.ImmersiveAR,
      offer: 'none',
      features: {
        handTracking: { required: true },
        anchors: true,
        planeDetection: true,
        meshDetection: true,
        hitTest: true,
        gazeTracking: true,
      },
    },
    features: { sceneUnderstanding: false, grabbing: false, locomotion: false, spatialUI: false },
    render: { near: 0.02, far: 50 },
  });
  const w = window as unknown as Record<string, unknown>;
  w.__world = world;

  const btn = document.createElement('button');
  btn.id = 'enter';
  btn.textContent = 'Enter';
  btn.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);font:600 28px system-ui;padding:18px 40px;border-radius:999px;border:0;background:#f2b24a;color:#1a120b';
  btn.onclick = () => world.launchXR();
  document.body.appendChild(btn);

  // Expose detected scene for tests.
  let last: { meshes: { label: string; n: number }[]; planes: string[] } = { meshes: [], planes: [] };
  world.onXRFrame((frame) => {
    const f = frame as XRFrame & { detectedMeshes?: Set<XRMesh & { semanticLabel?: string }>; detectedPlanes?: Set<XRPlane & { semanticLabel?: string }> };
    last = {
      meshes: [...(f.detectedMeshes ?? [])].map((m) => ({ label: m.semanticLabel ?? '?', n: m.vertices.length / 3 })),
      planes: [...(f.detectedPlanes ?? [])].map((p) => p.semanticLabel ?? p.orientation),
    };
  });
  w.__scene = () => last;
}

boot().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#f88">${String(e?.stack ?? e)}</pre>`);
});
