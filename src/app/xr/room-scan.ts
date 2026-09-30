import * as THREE from 'three';
import type { Furniture, SemanticLabel } from '../../core/types';

/**
 * Reads the runtime's scene understanding (Meta Scene via WebXR mesh + plane detection)
 * and turns it into Furniture boxes in the SESSION frame.
 *
 *  - bounded 3D meshes (Space Setup boxes: table, couch, bed, lamp, storage, screen, plant…) → oriented boxes;
 *  - vertical planes with object labels (wall art, window, door) → thin boxes on the wall;
 *  - horizontal object planes (table/couch tops, Quest 2 without meshes) → boxes from floor to the plane;
 *  - wall planes are kept separately for the hand-placed fallback anchors.
 */
export interface WallPlane {
  id: string;
  center: THREE.Vector3;
  normal: THREE.Vector3; // pointing into the room
  width: number;
  height: number;
  matrix: THREE.Matrix4; // plane space → session
}

const LOCUS_LABELS = new Set<SemanticLabel>(['table', 'couch', 'bed', 'lamp', 'plant', 'screen', 'storage', 'shelf', 'wall_art', 'window_frame', 'door_frame', 'chair', 'other']);

export function normalizeLabel(raw: string | undefined): SemanticLabel | 'global_mesh' | null {
  if (!raw) return 'other';
  const s = raw.toLowerCase().trim().replace(/[\s-]+/g, '_');
  switch (s) {
    case 'global_mesh':
      return 'global_mesh';
    case 'wall':
    case 'wall_face':
    case 'invisible_wall_face':
      return 'wall_face';
    case 'window':
    case 'window_frame':
      return 'window_frame';
    case 'door':
    case 'door_frame':
      return 'door_frame';
    case 'shelf':
    case 'storage':
      return 'storage';
    case 'desk':
    case 'table':
      return 'table';
    case 'sofa':
    case 'couch':
      return 'couch';
    case 'monitor':
    case 'screen':
      return 'screen';
    case 'wall_art':
    case 'picture':
      return 'wall_art';
    case 'floor':
    case 'ceiling':
    case 'bed':
    case 'lamp':
    case 'plant':
    case 'chair':
      return s as SemanticLabel;
    default:
      return 'other';
  }
}

export function furnitureName(label: SemanticLabel, size: readonly number[]): string {
  switch (label) {
    case 'table':
      return size[1] > 0.6 && Math.max(size[0], size[2]) < 1.8 ? 'Desk' : 'Table';
    case 'couch':
      return 'Couch';
    case 'bed':
      return 'Bed';
    case 'lamp':
      return 'Lamp';
    case 'plant':
      return 'Plant';
    case 'screen':
      return 'Screen';
    case 'storage':
    case 'shelf':
      return 'Shelf';
    case 'wall_art':
      return 'Picture';
    case 'window_frame':
      return 'Window';
    case 'door_frame':
      return 'Door';
    case 'chair':
      return 'Chair';
    case 'manual':
      return 'Lantern';
    default:
      return 'Object';
  }
}

export function isLocusLabel(l: SemanticLabel) {
  return LOCUS_LABELS.has(l) || l === 'manual';
}

type Detected = XRMesh | XRPlane;
const ids = new WeakMap<object, string>();
let nextId = 1;
function idOf(o: object, prefix: string) {
  let id = ids.get(o);
  if (!id) {
    id = `${prefix}${nextId++}`;
    ids.set(o, id);
  }
  return id;
}

const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _box = new THREE.Box3();

function yawOf(q: THREE.Quaternion) {
  // Yaw of the local X axis projected on the floor (robust for boxes and vertical planes alike).
  _v.set(1, 0, 0).applyQuaternion(q);
  return Math.atan2(-_v.z, _v.x);
}

export class RoomScanner {
  /** Furniture in the session frame, by id. Stable ids while the runtime keeps the same objects. */
  furniture = new Map<string, Furniture>();
  walls = new Map<string, WallPlane>();
  floorY = 0;
  /** Seconds since the furniture set last changed. */
  stableFor = 0;
  /** Seconds since scanning began. */
  scanningFor = 0;
  meshDetection = false;
  planeDetection = false;
  private signature = '';
  private throttle = 0;

  reset() {
    this.furniture.clear();
    this.walls.clear();
    this.stableFor = 0;
    this.scanningFor = 0;
    this.signature = '';
  }

  update(frame: XRFrame, ref: XRReferenceSpace, dt: number) {
    this.scanningFor += dt;
    this.stableFor += dt;
    this.throttle -= dt;
    if (this.throttle > 0) return;
    this.throttle = 0.25; // 4 Hz is plenty — Space Setup data is static

    const f = frame as XRFrame & { detectedMeshes?: Set<XRMesh>; detectedPlanes?: Set<XRPlane> };
    this.meshDetection = !!f.detectedMeshes;
    this.planeDetection = !!f.detectedPlanes;
    const next = new Map<string, Furniture>();
    const walls = new Map<string, WallPlane>();

    for (const mesh of f.detectedMeshes ?? []) {
      const label = normalizeLabel((mesh as Detected & { semanticLabel?: string }).semanticLabel);
      if (!label || label === 'global_mesh' || !isLocusLabel(label)) continue;
      const pose = frame.getPose(mesh.meshSpace, ref);
      if (!pose) continue;
      _m.fromArray(pose.transform.matrix);
      _q.setFromRotationMatrix(_m);
      const v = mesh.vertices;
      _box.makeEmpty();
      for (let i = 0; i < v.length; i += 3) _box.expandByPoint(_v.set(v[i], v[i + 1], v[i + 2]));
      if (_box.isEmpty()) continue;
      const size = _box.getSize(new THREE.Vector3());
      const c = _box.getCenter(new THREE.Vector3()).applyMatrix4(_m);
      // Box extents are along the mesh space axes; if the space is tilted (rare), fall back to world AABB height.
      _e.setFromQuaternion(_q, 'YXZ');
      const id = idOf(mesh, 'm');
      next.set(id, {
        id,
        label,
        center: [c.x, c.y, c.z],
        size: [size.x, size.y, size.z],
        yaw: yawOf(_q),
        name: furnitureName(label, [size.x, size.y, size.z]),
      });
    }

    for (const plane of f.detectedPlanes ?? []) {
      const label = normalizeLabel((plane as Detected & { semanticLabel?: string }).semanticLabel);
      if (!label || label === 'global_mesh') continue;
      const pose = frame.getPose(plane.planeSpace, ref);
      if (!pose) continue;
      _m.fromArray(pose.transform.matrix);
      _q.setFromRotationMatrix(_m);
      // Plane polygon lies in the plane's local XZ; local +Y is the normal.
      _box.makeEmpty();
      for (const p of plane.polygon) _box.expandByPoint(_v.set(p.x, 0, p.z));
      if (_box.isEmpty()) continue;
      const w = _box.max.x - _box.min.x;
      const d = _box.max.z - _box.min.z;
      const c = _box.getCenter(new THREE.Vector3()).applyMatrix4(_m);
      const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(_q).normalize();
      const vertical = Math.abs(normal.y) < 0.5;
      if (label === 'floor') {
        this.floorY = c.y;
        continue;
      }
      if (label === 'ceiling') continue;
      const id = idOf(plane, 'p');
      if (label === 'wall_face') {
        walls.set(id, { id, center: c, normal, width: w, height: d, matrix: _m.clone() });
        continue;
      }
      if (!isLocusLabel(label)) continue;
      // Skip planes that duplicate a detected 3D box (Quest reports both for Space Setup furniture).
      let dup = false;
      for (const fu of next.values()) {
        if (fu.label !== label) continue;
        const dx = fu.center[0] - c.x;
        const dz = fu.center[2] - c.z;
        if (Math.hypot(dx, dz) < Math.max(fu.size[0], fu.size[2]) * 0.6 + 0.1) {
          dup = true;
          break;
        }
      }
      if (dup) continue;
      if (vertical) {
        // Thin box on the wall; local X of the box = along the wall.
        const along = new THREE.Vector3(1, 0, 0).applyQuaternion(_q);
        along.y = 0;
        along.normalize();
        next.set(id, {
          id,
          label,
          center: [c.x + normal.x * 0.02, c.y, c.z + normal.z * 0.02],
          size: [w, d, 0.04],
          yaw: Math.atan2(-along.z, along.x),
          name: furnitureName(label, [w, d, 0.04]),
        });
      } else {
        // Horizontal top (table / couch seat): box from the floor to the plane.
        const h = Math.max(0.05, c.y - this.floorY);
        next.set(id, {
          id,
          label,
          center: [c.x, c.y - h / 2, c.z],
          size: [w, h, d],
          yaw: yawOf(_q),
          name: furnitureName(label, [w, h, d]),
        });
      }
    }

    const sig = [...next.keys()].sort().join(',');
    if (sig !== this.signature) {
      this.signature = sig;
      this.stableFor = 0;
    }
    this.furniture = next;
    this.walls = walls;
  }

  list(): Furniture[] {
    return [...this.furniture.values()];
  }
}

/** Ray vs oriented box (Furniture in some frame). Returns distance or null. */
export function rayHitsFurniture(origin: THREE.Vector3, dir: THREE.Vector3, f: Furniture, frameMatrix?: THREE.Matrix4, pad = 0.04): number | null {
  const m = new THREE.Matrix4().makeRotationY(f.yaw).setPosition(f.center[0], f.center[1], f.center[2]);
  if (frameMatrix) m.premultiply(frameMatrix);
  const inv = m.clone().invert();
  const o = origin.clone().applyMatrix4(inv);
  const d = dir.clone().transformDirection(inv);
  const half = new THREE.Vector3(f.size[0] / 2 + pad, f.size[1] / 2 + pad, f.size[2] / 2 + pad);
  const box = new THREE.Box3(half.clone().negate(), half);
  const hit = new THREE.Ray(o, d).intersectBox(box, new THREE.Vector3());
  if (!hit) return null;
  return hit.applyMatrix4(m).distanceTo(origin);
}
