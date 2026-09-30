import * as THREE from 'three';
import type { App } from '../app';
import { orderFurniture } from '../../core/route';
import { until, wait, waitFor } from '../flow/runtime';
import { XR, headYaw } from '../xr/context';
import { pinchSelection, pointer } from '../xr/targeting';
import { sfx } from '../sfx';

const _v = new THREE.Vector3();

/** Furniture currently seen, in route order (left → right from the seat). */
export function seenRoute(app: App): string[] {
  const room = app.room.room;
  if (!room) return [];
  const seen = app.room.furniture().filter((f) => app.room.isSeen(f.id));
  return orderFurniture(seen, room.seat, room.seatYaw);
}

/** Stable per-object sound index (the object's audio signature). */
export function soundIndex(app: App, fid: string) {
  return Math.max(0, app.room.furniture().findIndex((f) => f.id === fid));
}

/**
 * The flame glides from object to object, lighting each one with a soft halo and its own
 * sound: the bedroom becomes a place. `introduce=false` is the quick version for returning users.
 */
export async function scanRoom(app: App, opts: { introduce: boolean }) {
  const token = app.token;
  const route = seenRoute(app);
  if (!route.length) return;
  if (!opts.introduce) {
    for (const fid of route) app.view.setHaloOverride(fid, 'glow');
    sfx.play('lightsOn');
    await wait(1.0, token);
    for (const fid of route) app.view.setHaloOverride(fid, null);
    return;
  }
  app.say('Your room', 'happy', 2);
  await wait(1.2, token);
  let i = 0;
  for (const fid of route) {
    const f = app.room.getFurniture(fid);
    if (!f) continue;
    app.room.toSession([f.center[0], f.center[1] + f.size[1] / 2 + 0.12, f.center[2]], _v);
    // Stop a bit in front of the object (towards the learner) so the flame stays visible.
    const toHead = new THREE.Vector3().subVectors(XR.head.pos, _v).setY(0).normalize().multiplyScalar(0.12);
    _v.add(toHead);
    await app.flameTo(_v.clone(), i === 0 ? 1.1 : 0.75);
    app.view.setHaloOverride(fid, 'scan');
    sfx.play('scanPing', _v, { pitch: 1 + i * 0.08 });
    sfx.object(soundIndex(app, fid), _v, 'select');
    app.sparkles.emit(_v, '#ffd27a', 14, 0.35);
    i++;
    await wait(0.35, token);
  }
  await wait(0.6, token);
  for (const fid of route) app.view.setHaloOverride(fid, 'glow');
  await app.flameTo(app.flameHome(), 1.0);
  await wait(0.8, token);
  for (const fid of route) app.view.setHaloOverride(fid, null);
}

/**
 * Sparse room fallback: if fewer than 3 objects were detected, the learner plants glowing
 * lanterns on the walls (look + pinch), up to `want` loci in total.
 */
export async function ensureLoci(app: App, want: number) {
  const token = app.token;
  const seen = seenRoute(app).length;
  if (seen >= 3) return;
  const need = Math.max(1, want - seen);
  app.say('Tap the walls', 'point', 60);
  app.hint.setKind('pinch');
  app.hint.setVisible(true, true);
  let planted = 0;
  while (planted < need) {
    const hitPoint = await waitFor(() => {
      const sel = pinchSelection();
      if (!sel) return null;
      return wallHit(app) ?? pointer.origin.clone().addScaledVector(pointer.dir, 1.4);
    }, token);
    if (!hitPoint) continue;
    // Keep lanterns comfortably visible from the seat (no lower than the desk, no higher than the ceiling line).
    hitPoint.y = THREE.MathUtils.clamp(hitPoint.y, 0.7, 2.1);
    const yaw = Math.atan2(XR.head.pos.x - hitPoint.x, XR.head.pos.z - hitPoint.z);
    const f = app.room.addManual(hitPoint, yaw, Date.now());
    app.view.halo(f.id)?.setState('glow');
    app.view.setHaloOverride(f.id, 'scan');
    sfx.play('scanPing', hitPoint, { pitch: 1 + planted * 0.1 });
    sfx.object(soundIndex(app, f.id), hitPoint, 'select');
    app.sparkles.emit(hitPoint, '#ffd27a', 20, 0.4);
    planted++;
    app.say(planted < need ? `${need - planted} more` : 'Perfect', planted < need ? 'point' : 'happy', 60);
  }
  app.hint.setVisible(false, true);
  await wait(0.8, token);
  for (const f of app.room.furniture()) app.view.setHaloOverride(f.id, null);
  void headYaw;
  await until(() => true, token);
}

/** Intersection of the gaze with a detected wall plane (session frame), if any. */
function wallHit(app: App): THREE.Vector3 | null {
  let best: THREE.Vector3 | null = null;
  let bestD = Infinity;
  const plane = new THREE.Plane();
  const ray = new THREE.Ray(pointer.origin, pointer.dir);
  const p = new THREE.Vector3();
  for (const w of app.scanner.walls.values()) {
    plane.setFromNormalAndCoplanarPoint(w.normal, w.center);
    if (!ray.intersectPlane(plane, p)) continue;
    const d = p.distanceTo(pointer.origin);
    if (d < 0.4 || d > 6) continue;
    // Inside the wall rectangle (loosely).
    const local = p.clone().applyMatrix4(w.matrix.clone().invert());
    if (Math.abs(local.x) > w.width / 2 + 0.2 || Math.abs(local.z) > w.height / 2 + 0.2) continue;
    if (d < bestD) {
      bestD = d;
      best = p.clone().addScaledVector(w.normal, 0.06);
    }
  }
  return best;
}
