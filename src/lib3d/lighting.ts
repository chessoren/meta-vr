import * as THREE from 'three';

/** The one lighting rig used by the app and the gallery: warm key, cool-ish fill, soft sky/ground. */
export function addLociLights(scene: THREE.Object3D) {
  const hemi = new THREE.HemisphereLight('#fff1d6', '#5a4030', 1.35);
  hemi.name = 'lociHemi';
  const key = new THREE.DirectionalLight('#ffd9a0', 1.6);
  key.position.set(1.5, 3, 2);
  key.name = 'lociKey';
  const fill = new THREE.DirectionalLight('#b8c8ff', 0.45);
  fill.position.set(-2, 1.5, -1);
  fill.name = 'lociFill';
  scene.add(hemi, key, fill);
  return { hemi, key, fill };
}
