/**
 * Sparkles — a pooled particle system rendered in ONE draw call.
 *
 * Particles are instanced camera-facing quads (not THREE.Points: gl_PointSize is in
 * pixels and would need the per-eye viewport under WebXR multiview; view-space quads
 * are world-sized in every eye for free). Velocity-stretched streaks, soft round cores,
 * a share of 4-point star glints. Additive ("light" premultiplied blending).
 *
 * WORLD SPACE: positions given to emit()/trail() are world coordinates, whatever the
 * parent of `root` is (the mesh ignores its parent transform), so a flame can own its
 * trail and fly away without dragging its sparks along.
 *
 * Motes — ambient golden dust, fully GPU-animated (zero CPU per frame).
 */
import * as THREE from 'three';
import { LIGHT_BLEND, prng } from './common';

const VERT = /* glsl */ `
attribute vec2 corner;
attribute vec4 iPos;   // xyz world, w size (m)
attribute vec4 iCol;   // rgb, a alpha
attribute vec4 iVel;   // xyz world velocity, w kind (0 round, 1 star)
varying vec2 vUv;
varying vec4 vCol;
varying float vKind;
varying float vStretch;
void main() {
  vec4 mv = modelViewMatrix * vec4(iPos.xyz, 1.0);
  vec2 v = (viewMatrix * vec4(iVel.xyz, 0.0)).xy;
  float sp = length(v);
  float st = 1.0 + min(sp * 0.9, 3.0) * step(iVel.w, 0.5);
  vec2 dir = sp > 1e-4 ? v / sp : vec2(0.0, 1.0);
  vec2 perp = vec2(-dir.y, dir.x);
  float s = iPos.w;
  mv.xy += (perp * corner.x + dir * corner.y * st) * s;
  vUv = corner;
  vCol = iCol;
  vKind = iVel.w;
  vStretch = st;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
varying vec2 vUv;
varying vec4 vCol;
varying float vKind;
varying float vStretch;
void main() {
  vec2 p = vUv;
  float r = length(p);
  float core = exp(-r * r * 22.0);
  float glow = exp(-r * 4.2) * 0.45;
  float a = core + glow;
  if (vKind > 0.5) {
    float rays = max(0.0, 1.0 - abs(p.x) * 14.0) * max(0.0, 1.0 - abs(p.y)) + max(0.0, 1.0 - abs(p.y) * 14.0) * max(0.0, 1.0 - abs(p.x));
    a = core * 1.2 + glow * 0.6 + rays * 0.9;
  }
  a *= smoothstep(1.0, 0.7, r) / sqrt(vStretch);
  vec3 c = mix(vCol.rgb, vec3(1.0, 0.97, 0.88), core * 0.65);
  float k = a * vCol.a;
  gl_FragColor = vec4(c * k, 0.0);
}`;

export interface SparkleOpts {
  /** Pool size (max simultaneous particles). Default 400. */
  max?: number;
  seed?: number;
}

export interface EmitOpts {
  /** Lifetime range in seconds. */
  life?: [number, number];
  /** Size range in metres (quad half-size). */
  size?: [number, number];
  /** Gravity (m/s², +down). Negative = rises like embers. Default 0.35. */
  gravity?: number;
  /** Share of 4-point star glints (0–1). Default 0.3. */
  stars?: number;
  /** Velocity drag per second. Default 2.2. */
  drag?: number;
  /** Extra velocity added to every particle. */
  vel?: THREE.Vector3;
}

const _c = new THREE.Color();
const _v = new THREE.Vector3();

export class Sparkles {
  readonly root: THREE.Mesh;
  private max: number;
  private n = 0;
  private rnd: () => number;
  // SoA state
  private px: Float32Array;
  private py: Float32Array;
  private pz: Float32Array;
  private vx: Float32Array;
  private vy: Float32Array;
  private vz: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private size: Float32Array;
  private cr: Float32Array;
  private cg: Float32Array;
  private cb: Float32Array;
  private kind: Float32Array;
  private grav: Float32Array;
  private drag: Float32Array;
  private tw: Float32Array;
  // GPU
  private aPos: THREE.InstancedBufferAttribute;
  private aCol: THREE.InstancedBufferAttribute;
  private aVel: THREE.InstancedBufferAttribute;
  private geo: THREE.InstancedBufferGeometry;
  private mat: THREE.ShaderMaterial;
  private lastTrail = new THREE.Vector3(1e9, 0, 0);
  private time = 0;

  constructor(o: SparkleOpts = {}) {
    const max = (this.max = o.max ?? 400);
    this.rnd = prng(o.seed ?? 1234);
    const f = () => new Float32Array(max);
    this.px = f(); this.py = f(); this.pz = f();
    this.vx = f(); this.vy = f(); this.vz = f();
    this.life = f(); this.maxLife = f(); this.size = f();
    this.cr = f(); this.cg = f(); this.cb = f();
    this.kind = f(); this.grav = f(); this.drag = f(); this.tw = f();

    const geo = (this.geo = new THREE.InstancedBufferGeometry());
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
    geo.setAttribute('corner', new THREE.Float32BufferAttribute([-1, -1, 1, -1, 1, 1, -1, 1], 2));
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aVel = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.aPos);
    geo.setAttribute('iCol', this.aCol);
    geo.setAttribute('iVel', this.aVel);
    geo.instanceCount = 0;

    this.mat = new THREE.ShaderMaterial({ ...LIGHT_BLEND, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide });
    const m = (this.root = new THREE.Mesh(geo, this.mat));
    m.name = 'sparkles';
    m.frustumCulled = false;
    m.renderOrder = 20;
    m.visible = false;
    // World-space particles: ignore the parent transform entirely.
    m.matrixAutoUpdate = false;
    m.updateMatrixWorld = function () {
      this.matrixWorld.identity();
    };
    m.updateWorldMatrix = function () {
      this.matrixWorld.identity();
    };
  }

  get count() {
    return this.n;
  }

  /** Spawn one particle (world space). */
  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: THREE.ColorRepresentation, life: number, size: number, kind = 0, gravity = 0.35, drag = 2.2) {
    let i: number;
    if (this.n < this.max) i = this.n++;
    else i = Math.floor(this.rnd() * this.max); // pool full: recycle a random one
    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.life[i] = life; this.maxLife[i] = life; this.size[i] = size;
    _c.set(color);
    this.cr[i] = _c.r; this.cg[i] = _c.g; this.cb[i] = _c.b;
    this.kind[i] = kind; this.grav[i] = gravity; this.drag[i] = drag;
    this.tw[i] = this.rnd() * 6.283;
  }

  /** Radial burst of `n` sparkles from `pos` (world). */
  emit(pos: THREE.Vector3, color: THREE.ColorRepresentation = '#ffd27a', n = 16, speed = 0.35, o: EmitOpts = {}) {
    const r = this.rnd;
    const [l0, l1] = o.life ?? [0.55, 1.2];
    const [s0, s1] = o.size ?? [0.004, 0.009];
    const stars = o.stars ?? 0.3;
    for (let k = 0; k < n; k++) {
      // random direction on sphere
      const u = r() * 2 - 1;
      const th = r() * Math.PI * 2;
      const q = Math.sqrt(1 - u * u);
      const sp = speed * (0.35 + 0.65 * r());
      let vx = q * Math.cos(th) * sp;
      let vy = u * sp + speed * 0.25;
      let vz = q * Math.sin(th) * sp;
      if (o.vel) { vx += o.vel.x; vy += o.vel.y; vz += o.vel.z; }
      this.spawn(pos.x, pos.y, pos.z, vx, vy, vz, color, l0 + (l1 - l0) * r(), s0 + (s1 - s0) * r(), r() < stars ? 1 : 0, o.gravity ?? 0.35, o.drag ?? 2.2);
    }
  }

  /** Horizontal expanding ring of sparkles around `center` (used by pop-in). */
  ring(center: THREE.Vector3, radius: number, color: THREE.ColorRepresentation = '#ffd27a', n = 24, speed = 0.25) {
    const r = this.rnd;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + r() * 0.2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const sp = speed * (0.7 + 0.3 * r());
      this.spawn(center.x + c * radius, center.y + (r() - 0.5) * 0.01, center.z + s * radius, c * sp, 0.05 + r() * 0.12, s * sp, color, 0.6 + r() * 0.5, 0.004 + r() * 0.004, r() < 0.35 ? 1 : 0, -0.05, 2.6);
    }
  }

  /** Rising embers/dust inside a box (world centre + half extents): used by dissolves. */
  rise(center: THREE.Vector3, half: THREE.Vector3, color: THREE.ColorRepresentation = '#ffd27a', n = 20) {
    const r = this.rnd;
    for (let k = 0; k < n; k++) {
      this.spawn(
        center.x + (r() * 2 - 1) * half.x,
        center.y + (r() * 2 - 1) * half.y,
        center.z + (r() * 2 - 1) * half.z,
        (r() - 0.5) * 0.06, 0.08 + r() * 0.18, (r() - 0.5) * 0.06,
        color, 0.7 + r() * 0.9, 0.003 + r() * 0.005, r() < 0.25 ? 1 : 0, -0.12, 1.2,
      );
    }
  }

  /**
   * Trail for a moving emitter (the flame glide). Call every frame with the emitter's
   * world position; spawns sparks proportional to the distance travelled.
   */
  trail(pos: THREE.Vector3, color: THREE.ColorRepresentation = '#ffb347', density = 220) {
    const d = this.lastTrail.distanceTo(pos);
    if (d > 0.5) {
      this.lastTrail.copy(pos);
      return;
    }
    let count = d * density;
    const r = this.rnd;
    // stochastic rounding keeps slow motion sparkly without bursts
    while (count > 0) {
      if (count < 1 && r() > count) break;
      count -= 1;
      const t = r();
      _v.copy(this.lastTrail).lerp(pos, t);
      this.spawn(
        _v.x + (r() - 0.5) * 0.008, _v.y + (r() - 0.5) * 0.008, _v.z + (r() - 0.5) * 0.008,
        (r() - 0.5) * 0.05, (r() - 0.2) * 0.05, (r() - 0.5) * 0.05,
        r() < 0.3 ? '#fff0c0' : color, 0.45 + r() * 0.55, 0.0025 + r() * 0.004, r() < 0.2 ? 1 : 0, 0.18, 1.5,
      );
    }
    this.lastTrail.copy(pos);
  }

  /** Forget the last trail position (call when a new glide starts elsewhere). */
  resetTrail() {
    this.lastTrail.set(1e9, 0, 0);
  }

  update(dt: number, _t?: number) {
    this.time += dt;
    const P = this.aPos.array as Float32Array;
    const C = this.aCol.array as Float32Array;
    const V = this.aVel.array as Float32Array;
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // swap-remove with the last alive particle
        const j = --this.n;
        if (i !== j) this.move(j, i);
        continue;
      }
      const dr = Math.exp(-this.drag[i] * dt);
      this.vx[i] *= dr;
      this.vy[i] = this.vy[i] * dr - this.grav[i] * dt;
      this.vz[i] *= dr;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      const u = this.life[i] / this.maxLife[i]; // 1 → 0
      const fadeIn = Math.min(1, (1 - u) * 12);
      let a = fadeIn * Math.min(1, u * 2.2);
      const star = this.kind[i];
      if (star > 0.5) a *= 0.65 + 0.35 * Math.sin(this.time * 18 + this.tw[i]);
      const k = i * 4;
      P[k] = this.px[i]; P[k + 1] = this.py[i]; P[k + 2] = this.pz[i];
      P[k + 3] = this.size[i] * (0.45 + 0.55 * u) * (star > 0.5 ? 1.8 : 1);
      C[k] = this.cr[i]; C[k + 1] = this.cg[i]; C[k + 2] = this.cb[i]; C[k + 3] = a;
      V[k] = this.vx[i]; V[k + 1] = this.vy[i]; V[k + 2] = this.vz[i]; V[k + 3] = star;
      i++;
    }
    this.geo.instanceCount = this.n;
    this.root.visible = this.n > 0;
    if (this.n > 0) {
      this.aPos.clearUpdateRanges();
      this.aCol.clearUpdateRanges();
      this.aVel.clearUpdateRanges();
      this.aPos.addUpdateRange(0, this.n * 4);
      this.aCol.addUpdateRange(0, this.n * 4);
      this.aVel.addUpdateRange(0, this.n * 4);
      this.aPos.needsUpdate = true;
      this.aCol.needsUpdate = true;
      this.aVel.needsUpdate = true;
    }
  }

  private move(from: number, to: number) {
    this.px[to] = this.px[from]; this.py[to] = this.py[from]; this.pz[to] = this.pz[from];
    this.vx[to] = this.vx[from]; this.vy[to] = this.vy[from]; this.vz[to] = this.vz[from];
    this.life[to] = this.life[from]; this.maxLife[to] = this.maxLife[from]; this.size[to] = this.size[from];
    this.cr[to] = this.cr[from]; this.cg[to] = this.cg[from]; this.cb[to] = this.cb[from];
    this.kind[to] = this.kind[from]; this.grav[to] = this.grav[from]; this.drag[to] = this.drag[from]; this.tw[to] = this.tw[from];
  }

  clear() {
    this.n = 0;
    this.geo.instanceCount = 0;
    this.root.visible = false;
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
    this.root.removeFromParent();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Motes — ambient dust floating in golden light (GPU-only animation).
// ─────────────────────────────────────────────────────────────────────────────

const MOTE_VERT = /* glsl */ `
attribute vec2 corner;
attribute vec4 seed; // xyz 0..1 position in box, w phase
uniform float uTime;
uniform vec3 uBox;   // full size (m)
uniform float uSize;
varying vec2 vUv;
varying float vA;
void main() {
  float ph = seed.w * 6.2831;
  float sp = 0.03 + seed.x * 0.04;                 // rise speed (m/s)
  float y01 = fract(seed.y + uTime * sp / max(uBox.y, 0.01));
  vec3 p = (seed.xyz - 0.5) * uBox;
  p.y = (y01 - 0.5) * uBox.y;
  p.x += sin(uTime * (0.3 + seed.z * 0.4) + ph) * 0.02;
  p.z += cos(uTime * (0.25 + seed.x * 0.35) + ph * 1.3) * 0.02;
  float fade = smoothstep(0.0, 0.18, y01) * smoothstep(1.0, 0.7, y01);
  float tw = 0.55 + 0.45 * sin(uTime * (1.3 + seed.z * 2.0) + ph * 3.0);
  vA = fade * tw;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  mv.xy += corner * uSize * (0.6 + seed.z * 0.8);
  vUv = corner;
  gl_Position = projectionMatrix * mv;
}`;

const MOTE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
varying vec2 vUv;
varying float vA;
void main() {
  float r = length(vUv);
  float a = (exp(-r * r * 12.0) * 1.3 + exp(-r * 3.5) * 0.4) * smoothstep(1.0, 0.6, r);
  gl_FragColor = vec4(uColor * a * vA * uIntensity, 0.0);
}`;

export interface MotesOpts {
  count?: number;
  /** Size of the box the dust floats in (local space, centred on root). */
  box?: THREE.Vector3;
  color?: THREE.ColorRepresentation;
  /** Sprite half-size in metres. */
  size?: number;
  seed?: number;
}

export class Motes {
  readonly root: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private geo: THREE.InstancedBufferGeometry;
  private k = 1;
  private kTarget = 1;

  constructor(o: MotesOpts = {}) {
    const n = o.count ?? 40;
    const r = prng(o.seed ?? 77);
    const geo = (this.geo = new THREE.InstancedBufferGeometry());
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Array(12).fill(0), 3));
    geo.setAttribute('corner', new THREE.Float32BufferAttribute([-1, -1, 1, -1, 1, 1, -1, 1], 2));
    const seeds = new Float32Array(n * 4);
    for (let i = 0; i < n * 4; i++) seeds[i] = r();
    geo.setAttribute('seed', new THREE.InstancedBufferAttribute(seeds, 4));
    geo.instanceCount = n;
    const box = o.box ?? new THREE.Vector3(0.6, 0.5, 0.6);
    this.mat = new THREE.ShaderMaterial({
      ...LIGHT_BLEND,
      uniforms: {
        uTime: { value: 0 },
        uBox: { value: box.clone() },
        uSize: { value: o.size ?? 0.003 },
        uColor: { value: new THREE.Color(o.color ?? '#ffd68a') },
        uIntensity: { value: 1 },
      },
      vertexShader: MOTE_VERT,
      fragmentShader: MOTE_FRAG,
    });
    this.root = new THREE.Mesh(geo, this.mat);
    this.root.name = 'motes';
    this.root.frustumCulled = false;
    this.root.renderOrder = 18;
  }

  /** 0–1 brightness, eased. */
  setIntensity(k: number) {
    this.kTarget = k;
  }

  setBox(box: THREE.Vector3) {
    (this.mat.uniforms.uBox.value as THREE.Vector3).copy(box);
  }

  update(dt: number, t: number) {
    this.k += (this.kTarget - this.k) * (1 - Math.exp(-3 * dt));
    this.mat.uniforms.uTime.value = t % 3600;
    this.mat.uniforms.uIntensity.value = this.k;
    this.root.visible = this.k > 0.003;
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
    this.root.removeFromParent();
  }
}
