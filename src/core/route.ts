/**
 * The mental route: furniture ordered **left → right as seen from the seat**.
 *
 * ## Conventions (shared with registration.ts and the headset app)
 * - Right-handed, Y up, metres (WebXR). Seen from above (looking down −Y), +X points right and
 *   +Z points towards the viewer.
 * - **Yaw 0 faces −Z** (WebXR "forward").
 * - **Positive yaw rotates counter-clockwise seen from above** (right-hand rule about +Y, same as
 *   Three.js `object.rotation.y`): yaw +90° faces −X (a quarter turn to the left).
 * - Facing direction for yaw θ: `forward = (−sin θ, 0, −cos θ)`, right-hand side:
 *   `right = (cos θ, 0, −sin θ)`.
 * - Rotating a vector by θ: `x' = x cos θ + z sin θ`, `z' = −x sin θ + z cos θ`.
 *
 * The route sweeps from the far left (just behind the left shoulder) through straight ahead to
 * the far right: objects are sorted by their signed bearing in (−π, π], negative = left.
 */
import type { Furniture, Placement, Vec3 } from './types';

/** Rotates a vector about +Y by `yaw` (counter-clockwise seen from above). */
export function rotateY(v: Vec3, yaw: number): Vec3 {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
}

/** Unit facing vector for a yaw. */
export function forwardOf(yaw: number): Vec3 {
  return [-Math.sin(yaw), 0, -Math.cos(yaw)];
}

/** Unit right-hand vector for a yaw. */
export function rightOf(yaw: number): Vec3 {
  return [Math.cos(yaw), 0, -Math.sin(yaw)];
}

/** Coordinates of a world point in the seat frame: `right` (+ = right), `ahead` (+ = in front), `up`. */
export function toSeatFrame(p: Vec3, seat: Vec3, seatYaw: number): { right: number; ahead: number; up: number } {
  const dx = p[0] - seat[0];
  const dz = p[2] - seat[2];
  const c = Math.cos(seatYaw);
  const s = Math.sin(seatYaw);
  return { right: dx * c - dz * s, ahead: -dx * s - dz * c, up: p[1] - seat[1] };
}

/** Signed horizontal bearing of `p` from the seat, radians in (−π, π]: 0 ahead, negative left. */
export function bearing(p: Vec3, seat: Vec3, seatYaw: number): number {
  const f = toSeatFrame(p, seat, seatYaw);
  if (f.right === 0 && f.ahead === 0) return 0;
  const a = Math.atan2(f.right, f.ahead);
  return a <= -Math.PI ? Math.PI : a;
}

const horizDist = (p: Vec3, q: Vec3) => Math.hypot(p[0] - q[0], p[2] - q[2]);
const ANGLE_EPS = 1e-9;

/**
 * Furniture ids along the route, left → right from the seat. Ties in bearing (objects in line
 * with the learner) put the nearer one first; remaining ties are broken by id for stability.
 */
export function orderFurniture(furniture: Furniture[], seat: Vec3, seatYaw: number): string[] {
  return furniture
    .map((f) => ({ id: f.id, a: bearing(f.center, seat, seatYaw), d: horizDist(f.center, seat) }))
    .sort((x, y) => (Math.abs(x.a - y.a) > ANGLE_EPS ? x.a - y.a : x.d - y.d || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0)))
    .map((x) => x.id);
}

/** World (room-frame) position of a placement: furniture centre + local offset rotated by the furniture yaw. */
export function placementWorld(p: Pick<Placement, 'local'>, f: Pick<Furniture, 'center' | 'yaw'>): Vec3 {
  const r = rotateY(p.local, f.yaw);
  return [f.center[0] + r[0], f.center[1] + r[1], f.center[2] + r[2]];
}

/**
 * Renumbers `Placement.order` along the route and returns the placements sorted by it.
 * - Furniture is visited left → right ({@link orderFurniture}).
 * - Several notions on one object are ordered left → right by their X in the seat frame.
 * - Placements whose furniture is unknown keep their relative order and go last.
 * The input array and its objects are not mutated.
 */
export function assignOrder(placements: Placement[], furniture: Furniture[], seat: Vec3, seatYaw: number): Placement[] {
  const byId = new Map(furniture.map((f) => [f.id, f]));
  const rank = new Map(orderFurniture(furniture, seat, seatYaw).map((id, i) => [id, i]));
  const keyed = placements.map((p, i) => {
    const f = byId.get(p.furnitureId);
    const x = f ? toSeatFrame(placementWorld(p, f), seat, seatYaw).right : 0;
    return { p, i, r: f ? (rank.get(f.id) as number) : Number.POSITIVE_INFINITY, x };
  });
  keyed.sort((a, b) => {
    if (a.r !== b.r) return a.r - b.r;
    if (a.r === Number.POSITIVE_INFINITY) return a.p.order - b.p.order || a.i - b.i;
    return a.x - b.x || (a.p.notionId < b.p.notionId ? -1 : a.p.notionId > b.p.notionId ? 1 : 0);
  });
  return keyed.map((k, order) => ({ ...k.p, order }));
}
