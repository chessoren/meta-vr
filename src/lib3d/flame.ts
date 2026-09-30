/**
 * The Flame — Loci's only recurring character. It replaces every tutorial and menu.
 *
 * ~7 cm tall floating flame. Everything that makes it alive is procedural:
 *  - body: ONE camera-facing quad with a layered-noise fire shader (cream core → gold →
 *    orange → soft red tongues). Its face (two big glossy eyes, blush, a tiny mouth) is
 *    drawn in the same shader with SDFs, so blinks / squints / mouth shapes are uniforms;
 *    premultiplied "light" blending lets fire ADD light while the eyes stay opaque ink.
 *  - glow: a soft additive sprite behind it.
 *  - hands: two tiny floating ember mittens (wave, point, beckon, clap…).
 *  - speech bubble: 1–3 words on a parchment pill, always facing the viewer.
 *  - sparks: an owned world-space Sparkles pool (glide trail, claps, rising embers).
 *
 * Draw calls: body 1 + glow 1 + hands 2 + bubble 1 (only while talking) + sparks 1 (only
 * while alive) → 4–6. No per-frame allocations.
 */
import * as THREE from 'three';
import {
  LIGHT_BLEND,
  GLSL_NOISE,
  GLSL_FIRE,
  Spring,
  damp,
  clamp01,
  easeInOutSine,
  faceViewer,
  glowMaterial,
  CanvasPlane,
  onFontsReady,
  font,
  rrect,
  shadowed,
  STYLE,
  prng,
  smoothstep,
} from './fx/common';
import { Sparkles } from './fx/sparkles';

export type FlameMood = 'idle' | 'happy' | 'wave' | 'point' | 'beckon' | 'sleepy' | 'celebrate' | 'think' | 'surprised' | 'listen';

/** One flame unit in metres (body radius ≈ 0.56 u; tip at ≈ 1.5 u → ~7 cm tall at scale 1). */
const U = 0.034;

// ─────────────────────────────────────────────────────────────────────────────
// Shaders
// ─────────────────────────────────────────────────────────────────────────────
const BODY_VERT = /* glsl */ `
varying vec2 vP;
void main() {
  vP = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const BODY_FRAG = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uHeight;
uniform float uLean;
uniform float uBright;
uniform float uHeat;
uniform vec2 uFace;      // face offset (turning towards the gaze)
uniform vec4 uEye;       // x open, y happy-squint, z size, w lid (sleepy)
uniform vec2 uGaze;      // eye offset inside the face
uniform vec4 uMouth;     // x half width, y open, z smile, w roundness
uniform float uBlush;
varying vec2 vP;
${GLSL_NOISE}
${GLSL_FIRE}

float sdEll(vec2 q, vec2 r) { return (length(q / r) - 1.0) * min(r.x, r.y); }

float aaw;

// big glossy kawaii eye; returns mask, writes highlight mask
float eye(vec2 q, out float hl) {
  float s = uEye.z;
  vec2 r = vec2(0.108, 0.148) * s;
  float open = uEye.x;
  vec2 rr = vec2(r.x * mix(1.12, 1.0, open), max(r.y * open, 0.02));
  float m = smoothstep(aaw, -aaw, sdEll(q, rr));
  // sleepy lid clips from the top
  float lidY = r.y * (1.0 - 2.0 * uEye.w);
  m *= smoothstep(lidY + aaw, lidY - aaw, q.y);
  // highlights (fixed relative to the eye → reads as a glossy sphere looking around)
  float h1 = smoothstep(aaw, -aaw, length(q - vec2(-0.034, 0.052) * s) - 0.036 * s);
  float h2 = smoothstep(aaw, -aaw, length(q - vec2(0.036, -0.048) * s) - 0.016 * s);
  hl = (h1 + h2 * 0.9) * m * smoothstep(0.35, 0.8, open);
  // happy squint: a thick upward arc  ∩
  vec2 qa = q - vec2(0.0, -0.045 * s);
  float R = 0.08 * s;
  float dArc = qa.y > 0.0 ? abs(length(qa) - R) : length(vec2(abs(qa.x) - R, qa.y));
  float arcM = smoothstep(0.022 * s + aaw, 0.022 * s - aaw, dArc);
  hl *= 1.0 - uEye.y;
  return mix(m, arcM, uEye.y);
}

void main() {
  aaw = max(fwidth(vP.x), 0.002) * 0.9;
  float t = uTime;
  vec2 p = vP;
  float tipH = 1.45 * uHeight;
  float up = clamp(p.y / tipH, 0.0, 1.0);
  // sway: bend grows with height
  p.x -= (uLean + 0.07 * sin(t * 2.1 + p.y * 1.4) + 0.035 * sin(t * 3.7 + 1.3)) * up * up;
  // rising noise
  float n1 = fxFbm(vec2(p.x * 2.3, p.y * 1.7 - t * 2.5));
  float n2 = fxNoise(vec2(p.x * 5.2 + 3.0, p.y * 3.6 - t * 4.4));
  // teardrop: round bulb below, soft point above
  const float R = 0.6;
  float d;
  if (p.y < 0.0) d = length(vec2(p.x, p.y * 1.02)) - R;
  else d = max(abs(p.x) - R * pow(max(cos(up * 1.5707963), 0.0), 0.75), (p.y - tipH * (1.0 - abs(p.x) * 1.3)) * 0.6);
  // licking tongues: noise eats the upper edge
  d += (n1 - 0.47) * (0.06 + 0.42 * up * up) + (n2 - 0.5) * 0.09 * up;
  float body = smoothstep(0.03, -0.03, d) * smoothstep(2.45, 2.2, vP.y);
  // heat: deep inside + low = hot
  float inner = clamp(-d / R, 0.0, 1.0);
  float heat = clamp(inner * 1.55 + 0.12 - up * 0.55 + (n1 - 0.5) * 0.25, 0.0, 1.0);
  // creamy core where the face lives
  vec2 cq = (vP - vec2(uFace.x * 0.6, -0.02)) * vec2(1.05, 0.85);
  float core = smoothstep(0.52, 0.05, length(cq));
  heat = max(heat, core * 0.94) * uHeat;
  vec3 col = fxFire(heat) * body;
  // soft outer glow ring (inside the quad; the big glow is a separate sprite)
  float glow = exp(-max(d, 0.0) * 7.5) * (1.0 - body);
  // fade to zero at the quad border (x ±0.85, y -0.85..2.45)
  glow *= smoothstep(0.85, 0.6, abs(vP.x)) * smoothstep(-0.85, -0.6, vP.y) * smoothstep(2.45, 2.05, vP.y);
  col += vec3(1.0, 0.45, 0.12) * glow * 0.45;
  col *= uBright;
  float alpha = body * mix(0.35, 0.8, heat);

  // ── face ──
  vec2 fp = vP - uFace;
  fp.x -= (0.02 * sin(t * 2.1)) ; // follows the body sway a little
  float hlL, hlR;
  vec2 ge = uGaze;
  float eL = eye(fp - vec2(-0.2, 0.07) - ge, hlL);
  float eR = eye(fp - vec2(0.2, 0.07) - ge, hlR);
  float em = max(eL, eR);
  float hl = max(hlL, hlR);
  // blush
  float bl = (smoothstep(0.11, 0.02, length((fp - vec2(-0.31, -0.1)) * vec2(1.0, 1.5))) + smoothstep(0.11, 0.02, length((fp - vec2(0.31, -0.1)) * vec2(1.0, 1.5)))) * uBlush;
  col = mix(col, vec3(1.0, 0.36, 0.3) * uBright, bl * 0.7 * body);
  // mouth
  vec2 mq = fp - vec2(0.0, -0.115) - ge * 0.5;
  float w = uMouth.x;
  float xn = clamp(mq.x / w, -1.0, 1.0);
  float par = 1.0 - xn * xn;
  float top = uMouth.z * xn * xn + uMouth.w * uMouth.y * par * 0.7;
  float bot = uMouth.z * xn * xn - uMouth.y * par;
  float dm = max(abs(mq.x) - w, max(bot - mq.y, mq.y - top));
  float th = 0.017;
  float mm = smoothstep(th + aaw, th - aaw, dm);
  float inside = smoothstep(-0.004, -0.014, dm) * step(0.012, uMouth.y);
  vec3 ink = vec3(0.13, 0.06, 0.04);
  vec3 eyeCol = mix(ink, vec3(0.42, 0.16, 0.06), 0.0);
  col = mix(col, eyeCol, em);
  col = mix(col, vec3(1.0, 0.98, 0.93), hl);
  col = mix(col, ink, mm);
  col = mix(col, vec3(0.55, 0.12, 0.07), inside);
  alpha = max(alpha, max(max(em, mm), hl));
  gl_FragColor = vec4(col, alpha);
}`;

const HAND_FRAG = /* glsl */ `
precision highp float;
uniform float uPoint;
uniform float uBright;
uniform float uTime;
uniform float uPhase;
varying vec2 vP;
${GLSL_FIRE}
float sdCap(vec2 p, vec2 a, vec2 b, float r) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0); return length(pa - ba * h) - r; }
float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
void main() {
  float aa = max(fwidth(vP.x), 0.002);
  vec2 p = vP;
  float palm = (length((p - vec2(0.0, -0.01)) / vec2(0.105, 0.12)) - 1.0) * 0.105;
  float thumb = sdCap(p, vec2(-0.06, -0.02), vec2(-0.13, 0.045), 0.036);
  float d = smin(palm, thumb, 0.03);
  float fing = sdCap(p, vec2(0.012, 0.06), vec2(0.012, 0.061 + 0.17 * uPoint), 0.034);
  if (uPoint > 0.02) d = smin(d, fing, 0.03);
  float body = smoothstep(aa, -aa, d);
  float heat = clamp(-d * 9.0 + 0.25, 0.0, 1.0);
  float fl = 0.93 + 0.07 * sin(uTime * 17.0 + uPhase);
  vec3 col = fxFire(heat * 0.85 + 0.15) * body;
  float glow = exp(-max(d, 0.0) * 28.0) * (1.0 - body);
  glow *= smoothstep(0.23, 0.15, abs(vP.x)) * smoothstep(-0.22, -0.14, vP.y) * smoothstep(0.3, 0.22, vP.y);
  col += vec3(1.0, 0.5, 0.15) * glow * 0.5;
  gl_FragColor = vec4(max(col * uBright * fl, vec3(0.0)), body * 0.6);
}`;

// ─────────────────────────────────────────────────────────────────────────────
// Expressions
// ─────────────────────────────────────────────────────────────────────────────
interface Expr {
  open: number;
  happy: number;
  eye: number;
  lid: number;
  mw: number;
  mo: number;
  smile: number;
  round: number;
  blush: number;
  height: number;
  bright: number;
  bob: number;
  hz: number;
  tilt: number;
  heat: number;
}
const base: Expr = { open: 1, happy: 0, eye: 1, lid: 0, mw: 0.07, mo: 0, smile: 0.035, round: 0, blush: 0.45, height: 1, bright: 1, bob: 0.08, hz: 0.45, tilt: 0, heat: 1 };
const EXPR: Record<FlameMood, Expr> = {
  idle: { ...base },
  happy: { ...base, happy: 1, mw: 0.085, mo: 0.075, smile: 0.03, blush: 0.9, height: 1.08, bright: 1.12, bob: 0.1, hz: 0.9 },
  wave: { ...base, mw: 0.08, mo: 0.06, smile: 0.03, blush: 0.7, height: 1.04, bright: 1.08, bob: 0.08, hz: 0.7, tilt: 0.1 },
  point: { ...base, mw: 0.06, mo: 0.0, smile: 0.03, blush: 0.5, bob: 0.05, hz: 0.5 },
  beckon: { ...base, happy: 0.0, mw: 0.075, mo: 0.045, smile: 0.035, blush: 0.7, bob: 0.07, hz: 0.7 },
  sleepy: { ...base, lid: 0.55, open: 1, mw: 0.035, mo: 0.03, smile: 0.0, round: 1, blush: 0.3, height: 0.82, bright: 0.9, bob: 0.05, hz: 0.25, tilt: 0.12, heat: 0.72 },
  celebrate: { ...base, happy: 1, mw: 0.1, mo: 0.11, smile: 0.035, blush: 1, height: 1.15, bright: 1.25, bob: 0.0, hz: 1.6 },
  think: { ...base, mw: 0.045, mo: 0.0, smile: -0.012, blush: 0.35, bob: 0.05, hz: 0.35, tilt: -0.14 },
  surprised: { ...base, eye: 1.14, mw: 0.05, mo: 0.1, smile: 0.0, round: 1, blush: 0.4, height: 1.22, bright: 1.15, bob: 0.04, hz: 0.6 },
  listen: { ...base, mw: 0.05, mo: 0.0, smile: 0.028, blush: 0.55, bob: 0.05, hz: 0.4, tilt: 0.16 },
};
const KEYS = Object.keys(base) as (keyof Expr)[];

// scratch (module-level: no per-frame allocations)
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _q = new THREE.Quaternion();

interface Hand {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  pos: THREE.Vector3; // smoothed, units
  tgt: THREE.Vector3;
  rot: number;
  rotT: number;
  point: number;
  pointT: number;
}

export class Flame {
  readonly root = new THREE.Group();
  /** Owned world-space sparks (trail, claps, embers). Already parented under root. */
  readonly sparks: Sparkles;

  private face = new THREE.Group();
  private bobG = new THREE.Group();
  private squash = new THREE.Group();
  private body: THREE.Mesh;
  private bodyMat: THREE.ShaderMaterial;
  private glow: THREE.Mesh;
  private glowMat: THREE.ShaderMaterial;
  private hands: [Hand, Hand];
  private bubble: CanvasPlane;
  private bubbleText: string | null = null;
  private bubbleTime = 0;
  private bubbleVis = 0;
  private bubbleSpring = new Spring(260, 14);
  private unFonts: () => void;

  private mood: FlameMood = 'idle';
  private moodTime = 0;
  private cur: Expr = { ...base };
  private spring = new Spring(190, 10);
  private scaleK = 1;
  private time = 0;
  private rnd = prng(4242);

  // blink & gaze
  private nextBlink = 1.6;
  private blinkT = -1;
  private doubleBlink = false;
  private sacc = new THREE.Vector2();
  private saccT = new THREE.Vector2();
  private nextSacc = 1.2;
  private gaze = new THREE.Vector2();
  private faceOff = new THREE.Vector2();
  private pointTarget = new THREE.Vector3();
  private hasPoint = false;
  private joy = 0; // short happy pulse after bounce()

  // glide
  private gFrom = new THREE.Vector3();
  private gTo = new THREE.Vector3();
  private gCtl = new THREE.Vector3();
  private gT = 0;
  private gDur = 1;
  private gliding = false;
  private gDone: (() => void) | undefined;
  private prevWorld = new THREE.Vector3();
  private vel = new THREE.Vector3(); // world velocity (m/s), smoothed
  private lean = 0;
  private emberT = 0;
  private clapPrev = 1;

  constructor(o: { seed?: number } = {}) {
    if (o.seed !== undefined) this.rnd = prng(o.seed);
    this.root.name = 'flame';
    this.root.add(this.face);
    this.face.add(this.bobG);
    this.bobG.add(this.squash);

    // body quad in flame units
    const g = new THREE.PlaneGeometry(1.7, 3.3, 1, 1);
    g.translate(0, 0.8, 0);
    this.bodyMat = new THREE.ShaderMaterial({
      ...LIGHT_BLEND,
      uniforms: {
        uTime: { value: 0 },
        uHeight: { value: 1 },
        uLean: { value: 0 },
        uBright: { value: 1 },
        uHeat: { value: 1 },
        uFace: { value: new THREE.Vector2() },
        uEye: { value: new THREE.Vector4(1, 0, 1, 0) },
        uGaze: { value: new THREE.Vector2() },
        uMouth: { value: new THREE.Vector4(0.07, 0, 0.035, 0) },
        uBlush: { value: 0.45 },
      },
      vertexShader: BODY_VERT,
      fragmentShader: BODY_FRAG,
    });
    this.body = new THREE.Mesh(g, this.bodyMat);
    this.body.name = 'flameBody';
    this.body.scale.setScalar(U);
    this.body.renderOrder = 12;
    this.squash.add(this.body);

    // glow sprite behind
    this.glowMat = glowMaterial('#ff9a3c', 0.55);
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.glowMat);
    this.glow.name = 'flameGlow';
    this.glow.scale.setScalar(0.16);
    this.glow.position.set(0, 0.012, -0.006);
    this.glow.renderOrder = 11;
    this.bobG.add(this.glow);

    // ember hands
    const hg = new THREE.PlaneGeometry(0.46, 0.52);
    hg.translate(0, 0.04, 0);
    const mk = (phase: number): Hand => {
      const mat = new THREE.ShaderMaterial({
        ...LIGHT_BLEND,
        uniforms: { uPoint: { value: 0 }, uBright: { value: 1 }, uTime: { value: 0 }, uPhase: { value: phase } },
        vertexShader: BODY_VERT,
        fragmentShader: HAND_FRAG,
      });
      const mesh = new THREE.Mesh(hg, mat);
      mesh.renderOrder = 13;
      mesh.scale.setScalar(U * 1.3);
      this.bobG.add(mesh);
      return { mesh, mat, pos: new THREE.Vector3(), tgt: new THREE.Vector3(), rot: 0, rotT: 0, point: 0, pointT: 0 };
    };
    this.hands = [mk(0), mk(2.1)];
    this.hands[0].mesh.name = 'handL';
    this.hands[1].mesh.name = 'handR';
    this.hands[0].mesh.scale.x = -U * 1.3; // mirror the left mitten (thumb inwards)
    this.hands[0].pos.set(-0.88, -0.1, 0.1);
    this.hands[1].pos.set(0.88, -0.1, 0.1);

    // speech bubble
    this.bubble = new CanvasPlane(6400, 1024, 320, 14);
    this.bubble.mesh.name = 'flameBubble';
    this.bubble.mesh.visible = false;
    this.face.add(this.bubble.mesh);
    this.unFonts = onFontsReady(() => this.drawBubble());

    this.sparks = new Sparkles({ max: 220, seed: 99 });
    this.root.add(this.sparks.root);
  }

  // ── public API ────────────────────────────────────────────────────────────
  setMood(m: FlameMood) {
    if (m === this.mood) return;
    this.mood = m;
    this.moodTime = 0;
    if (m === 'surprised') this.spring.kick(3.2);
    if (m === 'happy' || m === 'celebrate') this.spring.kick(-2.2);
    if (m === 'celebrate') this.burst(18);
  }
  get currentMood() {
    return this.mood;
  }

  /** Point (hand + eyes) at a world position; null to stop. Switches mood to 'point' when given. */
  pointAt(p: THREE.Vector3 | null) {
    if (p) {
      this.pointTarget.copy(p);
      this.hasPoint = true;
      this.setMood('point');
    } else {
      this.hasPoint = false;
      if (this.mood === 'point') this.setMood('idle');
    }
  }

  /** Show 1–3 words in a small bubble above the flame (null hides). */
  say(text: string | null, seconds = 2.4) {
    if (!text) {
      this.bubbleTime = 0;
      return;
    }
    const was = this.bubbleText;
    this.bubbleText = text;
    this.bubbleTime = seconds;
    if (was !== text) this.drawBubble();
    if (this.bubbleVis < 0.5) this.bubbleSpring.x = 0;
    this.bubbleSpring.kick(3);
  }

  /** Reaction to being pinched. */
  bounce() {
    this.spring.kick(-4.2);
    this.joy = 0.9;
    this.burst(12);
  }

  /** Smooth arcing flight to `p` (in the parent space of root) with trailing sparks. */
  glideTo(p: THREE.Vector3, seconds: number, onDone?: () => void) {
    this.gFrom.copy(this.root.position);
    this.gTo.copy(p);
    const dist = this.gFrom.distanceTo(this.gTo);
    this.gCtl.copy(this.gFrom).lerp(this.gTo, 0.5);
    this.gCtl.y += 0.06 + dist * 0.35;
    this.gT = 0;
    this.gDur = Math.max(0.05, seconds);
    this.gliding = true;
    this.gDone = onDone;
    this.spring.kick(-1.8);
    this.sparks.resetTrail();
  }
  get isGliding() {
    return this.gliding;
  }

  setScale(s: number) {
    this.scaleK = s;
  }

  // ── frame ─────────────────────────────────────────────────────────────────
  update(dt: number, t: number, lookTarget?: THREE.Vector3) {
    dt = Math.min(dt, 0.1);
    this.time += dt;
    this.moodTime += dt;
    const mood = this.mood;
    const mt = this.moodTime;

    // glide
    if (this.gliding) {
      this.gT += dt / this.gDur;
      const u = easeInOutSine(Math.min(1, this.gT));
      const iu = 1 - u;
      this.root.position.set(
        iu * iu * this.gFrom.x + 2 * iu * u * this.gCtl.x + u * u * this.gTo.x,
        iu * iu * this.gFrom.y + 2 * iu * u * this.gCtl.y + u * u * this.gTo.y,
        iu * iu * this.gFrom.z + 2 * iu * u * this.gCtl.z + u * u * this.gTo.z,
      );
      if (this.gT >= 1) {
        this.gliding = false;
        this.root.position.copy(this.gTo);
        this.spring.kick(-2.6);
        const cb = this.gDone;
        this.gDone = undefined;
        cb?.();
      }
    }

    // world velocity (for lean + stretch)
    this.root.updateWorldMatrix(true, false);
    _a.setFromMatrixPosition(this.root.matrixWorld);
    if (dt > 0) {
      _b.copy(_a).sub(this.prevWorld).divideScalar(dt);
      if (_b.lengthSq() > 25) _b.set(0, 0, 0); // teleport
      this.vel.lerp(_b, 1 - Math.exp(-10 * dt));
    }
    this.prevWorld.copy(_a);
    const speed = this.vel.length();

    // billboard to the viewer (or the look target)
    faceViewer(this.face, lookTarget);

    // expression easing
    const tgt = EXPR[mood];
    const rate = 9;
    for (const k of KEYS) this.cur[k] = damp(this.cur[k], tgt[k], rate, dt);
    const e = this.cur;
    this.joy = Math.max(0, this.joy - dt);
    const joyK = smoothstep(0, 0.25, this.joy);

    // blink
    if (this.time > this.nextBlink && this.blinkT < 0) {
      this.blinkT = 0;
      const second = this.doubleBlink;
      this.doubleBlink = !second && this.rnd() < 0.18;
      this.nextBlink = this.time + 2.2 + this.rnd() * 3.4;
    }
    let blink = 1;
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      const dur = 0.15;
      const ph = this.blinkT / dur;
      blink = 1 - Math.sin(Math.PI * Math.min(1, ph));
      if (ph >= 1) {
        this.blinkT = -1;
        if (this.doubleBlink) this.nextBlink = this.time + 0.1; // quick second blink
      }
    }

    // gaze: point target > look target; plus saccades
    if (this.time > this.nextSacc) {
      this.nextSacc = this.time + 0.9 + this.rnd() * 2.6;
      this.saccT.set((this.rnd() - 0.5) * 0.05, (this.rnd() - 0.5) * 0.03);
      if (mood === 'think') this.saccT.set(0.05 + this.rnd() * 0.02, 0.05);
    }
    this.sacc.lerp(this.saccT, 1 - Math.exp(-25 * dt));
    let gx = 0;
    let gy = 0;
    const tgtW = this.hasPoint ? this.pointTarget : lookTarget ?? null;
    if (tgtW) {
      _c.copy(tgtW);
      this.bobG.worldToLocal(_c);
      const len = _c.length();
      if (len > 1e-5) {
        gx = (_c.x / len) * 0.085;
        gy = (_c.y / len) * 0.06;
      }
    }
    if (mood === 'think') {
      gx = 0.06;
      gy = 0.055;
    }
    if (mood === 'sleepy') gy -= 0.03;
    gx += this.sacc.x;
    gy += this.sacc.y;
    this.gaze.x = damp(this.gaze.x, gx, 14, dt);
    this.gaze.y = damp(this.gaze.y, gy, 14, dt);
    this.faceOff.x = damp(this.faceOff.x, this.gaze.x * 0.9, 6, dt);
    this.faceOff.y = damp(this.faceOff.y, this.gaze.y * 0.7, 6, dt);

    // squash & stretch
    const sq = this.spring.step(dt);
    const stretch = Math.min(0.35, speed * 0.6);
    const sy = 1 + sq + stretch;
    const sx = 1 / Math.sqrt(Math.max(0.3, sy));
    this.squash.scale.set(sx, sy, 1);

    // bob / hop
    const s = this.scaleK;
    let bobY = Math.sin(t * Math.PI * 2 * e.hz) * e.bob * U;
    if (mood === 'celebrate') bobY = Math.abs(Math.sin(t * Math.PI * 1.6)) * 0.5 * U;
    this.bobG.position.set(0, bobY * s, 0);
    this.bobG.scale.setScalar(s);

    // lean into the motion (in face-local x)
    _c.copy(this.vel);
    this.face.getWorldQuaternion(_q).invert();
    _c.applyQuaternion(_q);
    this.lean = damp(this.lean, THREE.MathUtils.clamp(-_c.x * 1.4, -0.5, 0.5), 8, dt);
    let tilt = e.tilt * Math.sin(t * 0.7) * 0.4 + e.tilt;
    if (mood === 'listen') tilt = e.tilt + Math.sin(t * 2.2) * 0.04;
    if (mood === 'beckon') tilt = Math.sin(mt * Math.PI * 2 * 0.9) * 0.08;
    this.bobG.rotation.z = tilt * 0.6 + this.lean * 0.45;

    // uniforms
    const flick = 1 + 0.05 * Math.sin(t * 13.1) + 0.035 * Math.sin(t * 23.7 + 1.1);
    const U2 = this.bodyMat.uniforms;
    U2.uTime.value = t % 600;
    U2.uHeight.value = Math.min(1.3, e.height * (1 + 0.04 * Math.sin(t * 5.3)) + stretch * 0.4);
    U2.uLean.value = this.lean * 0.55;
    U2.uBright.value = e.bright * flick;
    U2.uHeat.value = e.heat;
    (U2.uFace.value as THREE.Vector2).set(this.faceOff.x, this.faceOff.y);
    const happy = Math.max(e.happy, joyK);
    (U2.uEye.value as THREE.Vector4).set(Math.min(e.open, blink), happy, e.eye, e.lid * (0.85 + 0.15 * Math.sin(t * 0.9)));
    (U2.uGaze.value as THREE.Vector2).set(this.gaze.x, this.gaze.y);
    let mo = e.mo;
    if (mood === 'celebrate') mo *= 0.75 + 0.25 * Math.sin(t * 10);
    (U2.uMouth.value as THREE.Vector4).set(e.mw + joyK * 0.02, Math.max(mo, joyK * 0.07), e.smile, e.round);
    U2.uBlush.value = Math.max(e.blush, joyK);
    this.glowMat.uniforms.uOpacity.value = 0.5 * e.bright * flick;
    this.glow.scale.setScalar(0.15 * (0.95 + 0.05 * Math.sin(t * 3.1)) * (0.9 + 0.1 * e.height));

    this.updateHands(dt, t, mood, mt);
    this.updateBubble(dt);
    this.updateSparks(dt, t, mood);
  }

  // ── hands ─────────────────────────────────────────────────────────────────
  private updateHands(dt: number, t: number, mood: FlameMood, mt: number) {
    const [L, R] = this.hands;
    const fl = Math.sin(t * 1.9) * 0.05;
    const fl2 = Math.sin(t * 2.3 + 1.7) * 0.05;
    // defaults: floating at the sides
    L.tgt.set(-0.86, -0.12 + fl, 0.1);
    R.tgt.set(0.86, -0.12 + fl2, 0.1);
    L.rotT = 0.35;
    R.rotT = -0.35;
    L.pointT = 0;
    R.pointT = 0;
    let rate = 12;
    switch (mood) {
      case 'happy': {
        const h = Math.abs(Math.sin(t * 5.5)) * 0.1;
        L.tgt.set(-0.88, 0.12 + h, 0.1);
        R.tgt.set(0.88, 0.12 + h, 0.1);
        L.rotT = 0.6 + Math.sin(t * 11) * 0.15;
        R.rotT = -0.6 - Math.sin(t * 11) * 0.15;
        break;
      }
      case 'wave': {
        const w = Math.sin(mt * Math.PI * 2 * 1.6);
        R.tgt.set(0.92 + w * 0.12, 0.95 + Math.abs(w) * 0.04, 0.12);
        R.rotT = -0.15 - w * 0.5;
        rate = 22;
        break;
      }
      case 'point': {
        if (this.hasPoint) {
          _c.copy(this.pointTarget);
          this.bobG.worldToLocal(_c);
          _c.divideScalar(U);
          const l2 = Math.hypot(_c.x, _c.y);
          let dx = 1;
          let dy = 0;
          if (l2 > 1e-4) {
            dx = _c.x / l2;
            dy = _c.y / l2;
          }
          const side = dx >= 0 ? R : L;
          const poke = Math.sin(mt * 5) * 0.04;
          side.tgt.set(dx * (1.02 + poke), 0.25 + dy * 0.95 + poke * dy, THREE.MathUtils.clamp(_c.z * 0.02, -0.3, 0.5));
          side.rotT = Math.atan2(dy, dx) - Math.PI / 2;
          if (side === L) side.rotT = -side.rotT; // mirrored mesh
          side.pointT = 1;
        }
        break;
      }
      case 'beckon': {
        const c = Math.sin(mt * Math.PI * 2 * 1.1);
        R.tgt.set(0.72 - c * 0.14, 0.22 + c * 0.1, 0.35);
        R.rotT = 0.35 + c * 0.55;
        R.pointT = 0.6 + 0.4 * c;
        rate = 18;
        break;
      }
      case 'sleepy': {
        L.tgt.set(-0.72, -0.42 + fl * 0.4, 0.1);
        R.tgt.set(0.72, -0.42 + fl2 * 0.4, 0.1);
        L.rotT = 0.9;
        R.rotT = -0.9;
        rate = 4;
        break;
      }
      case 'celebrate': {
        // clap overhead: sin <0 → apart, peak → together
        const c = 0.5 + 0.5 * Math.sin(mt * Math.PI * 2 * 1.3 - Math.PI / 2);
        const apart = 1 - Math.pow(c, 3);
        L.tgt.set(-0.12 - apart * 0.62, 1.55 - apart * 0.2, 0.2);
        R.tgt.set(0.12 + apart * 0.62, 1.55 - apart * 0.2, 0.2);
        L.rotT = -0.8 * (1 - apart) + 0.3 * apart;
        R.rotT = 0.8 * (1 - apart) - 0.3 * apart;
        rate = 26;
        if (c > 0.97 && this.clapPrev <= 0.97) {
          _a.set(0, 1.62 * U, 0.2 * U);
          this.bobG.localToWorld(_a);
          this.sparks.emit(_a, '#ffd27a', 10, 0.28, { size: [0.002, 0.005] });
        }
        this.clapPrev = c;
        break;
      }
      case 'think': {
        R.tgt.set(0.3, -0.42 + Math.abs(Math.sin(t * 3)) * 0.04, 0.35);
        R.rotT = 0.5;
        R.pointT = 0.8;
        L.tgt.set(-0.8, -0.3 + fl * 0.5, 0.1);
        break;
      }
      case 'surprised': {
        const j = Math.sin(t * 30) * 0.015 * Math.max(0, 1 - mt);
        L.tgt.set(-0.98 + j, 0.62, 0.12);
        R.tgt.set(0.98 - j, 0.62, 0.12);
        L.rotT = 0.45;
        R.rotT = -0.45;
        rate = 20;
        break;
      }
      case 'listen': {
        R.tgt.set(0.86, 0.42 + Math.sin(t * 2.2) * 0.03, 0.05);
        R.rotT = 0.35;
        L.tgt.set(-0.85, -0.2 + fl, 0.1);
        break;
      }
      default:
        break;
    }
    for (const h of this.hands) {
      const k = 1 - Math.exp(-rate * dt);
      h.pos.lerp(h.tgt, k);
      h.rot += (h.rotT - h.rot) * k;
      h.point = damp(h.point, h.pointT, 10, dt);
      h.mesh.position.set(h.pos.x * U, h.pos.y * U, h.pos.z * U);
      h.mesh.rotation.z = h.rot;
      h.mat.uniforms.uPoint.value = h.point;
      h.mat.uniforms.uTime.value = t % 600;
      h.mat.uniforms.uBright.value = this.cur.bright;
    }
  }

  // ── speech bubble ─────────────────────────────────────────────────────────
  private drawBubble() {
    const W = 1024;
    const ctx = this.bubble.size(W, 320);
    const text = this.bubbleText;
    if (!text) return;
    let px = 104;
    ctx.font = font(700, px);
    let tw = ctx.measureText(text).width;
    const maxTw = W - 170;
    if (tw > maxTw) {
      px = Math.floor((px * maxTw) / tw);
      ctx.font = font(700, px);
      tw = ctx.measureText(text).width;
    }
    const bw = tw + 110;
    const bh = 170;
    const x = (W - bw) / 2;
    const y = 36;
    const tail = () => {
      ctx.moveTo(W / 2 - 26, y + bh - 2);
      ctx.lineTo(W / 2 + 4, y + bh + 44);
      ctx.lineTo(W / 2 + 30, y + bh - 2);
    };
    shadowed(ctx, 26, 8, () => {
      rrect(ctx, x, y, bw, bh, bh / 2);
      ctx.fillStyle = STYLE.parchmentLight;
      ctx.fill();
      ctx.beginPath();
      tail();
      ctx.closePath();
      ctx.fill();
    });
    // warm rim
    rrect(ctx, x + 5, y + 5, bw - 10, bh - 10, (bh - 10) / 2);
    ctx.strokeStyle = 'rgba(233,185,73,0.9)';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = STYLE.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font(700, px);
    ctx.fillText(text, W / 2, y + bh / 2 + px * 0.04);
    this.bubble.commit();
  }

  private updateBubble(dt: number) {
    const on = this.bubbleText !== null && this.bubbleTime > 0;
    if (this.bubbleTime > 0) this.bubbleTime -= dt;
    this.bubbleVis = damp(this.bubbleVis, on ? 1 : 0, on ? 14 : 9, dt);
    const sp = this.bubbleSpring.step(dt, on ? 1 : 0);
    const vis = this.bubbleVis;
    const m = this.bubble.mesh;
    m.visible = vis > 0.01;
    if (!m.visible) return;
    const s = Math.max(0.001, sp);
    m.scale.set((1024 / 6400) * s, (320 / 6400) * s, 1);
    this.bubble.opacity = clamp01(vis * 1.2);
    const top = (1.95 * U + 0.028) * this.scaleK;
    m.position.set(0, top + this.bobG.position.y + (1 - vis) * -0.01, 0.01);
  }

  // ── sparks ────────────────────────────────────────────────────────────────
  private updateSparks(dt: number, _t: number, mood: FlameMood) {
    // glide trail from just below the bulb
    if (this.gliding) {
      _a.set(0, -0.35 * U, -0.004);
      this.bobG.localToWorld(_a);
      this.sparks.trail(_a, '#ffb347', 260);
    }
    // occasional ember rising from the tip
    this.emberT -= dt;
    if (this.emberT <= 0) {
      this.emberT = mood === 'celebrate' ? 0.08 : mood === 'sleepy' ? 0.9 : 0.35 + this.rnd() * 0.3;
      _a.set((this.rnd() - 0.5) * 0.3 * U, 1.35 * U * this.cur.height, 0);
      this.bobG.localToWorld(_a);
      const up = mood === 'celebrate' ? 0.16 : 0.07;
      this.sparks.spawn(_a.x, _a.y, _a.z, (this.rnd() - 0.5) * 0.02, up + this.rnd() * 0.04, (this.rnd() - 0.5) * 0.02, this.rnd() < 0.5 ? '#ffc56a' : '#ff8a3a', 0.8 + this.rnd() * 0.7, 0.0018 + this.rnd() * 0.0018, 0, -0.02, 1.2);
    }
    this.sparks.update(dt);
  }

  private burst(n: number) {
    _a.set(0, 0.4 * U, 0);
    this.bobG.localToWorld(_a);
    this.sparks.emit(_a, '#ffd27a', n, 0.32, { size: [0.0025, 0.006] });
  }

  dispose() {
    this.unFonts();
    this.body.geometry.dispose();
    this.bodyMat.dispose();
    this.glow.geometry.dispose();
    this.glowMat.dispose();
    this.hands[0].mesh.geometry.dispose();
    for (const h of this.hands) h.mat.dispose();
    this.bubble.dispose();
    this.sparks.dispose();
    this.root.removeFromParent();
  }
}
