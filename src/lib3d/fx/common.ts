/**
 * Loci FX — shared foundations: style tokens, fonts, viewer (billboard target),
 * premultiplied "light" blending, easing, GLSL snippets and canvas helpers.
 *
 * Everything in src/lib3d/fx and src/lib3d/flame.ts builds on this file.
 */
import * as THREE from 'three';
import '@fontsource/fraunces/400.css';
import '@fontsource/fraunces/600.css';
import '@fontsource/fraunces/700.css';
import '@fontsource/fraunces/800.css';
import '@fontsource/fraunces/600-italic.css';
import { FONT_SERIF, wrap } from '../kit';

// ─────────────────────────────────────────────────────────────────────────────
// Style — "old library on a winter evening"
// ─────────────────────────────────────────────────────────────────────────────
export const STYLE = {
  parchment: '#f1dfb8',
  parchmentLight: '#f9eed6',
  parchmentDark: '#dcc08a',
  ink: '#2b1d14',
  inkSoft: '#5b4331',
  inkFaint: '#8a6f55',
  gold: '#e9b949',
  goldDeep: '#a8761f',
  goldLight: '#ffdc84',
  ember: '#ff9a3c',
  leather: '#3a2418',
  shadow: 'rgba(24, 12, 4, 0.5)',
  font: FONT_SERIF,
} as const;

export const GOLD = new THREE.Color(STYLE.gold);

// ─────────────────────────────────────────────────────────────────────────────
// Fonts — Fraunces from @fontsource; canvases draw with fallback then redraw.
// ─────────────────────────────────────────────────────────────────────────────
let fontsPromise: Promise<void> | null = null;
let fontsLoaded = false;
const redrawers = new Set<() => void>();

/** Resolves when the Fraunces weights used by the FX UI are ready (never rejects). */
export function fxFontsReady(): Promise<void> {
  if (!fontsPromise) {
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    if (!fonts) {
      fontsLoaded = true;
      fontsPromise = Promise.resolve();
    } else {
      const sample = 'AaÉéœŒ0123456789';
      const specs = ['400', '600', '700', '800'].map((w) => `${w} 48px Fraunces`).concat(['italic 600 48px Fraunces']);
      fontsPromise = Promise.all(specs.map((s) => fonts.load(s, sample)))
        .then(() => undefined)
        .catch(() => undefined)
        .then(() => {
          fontsLoaded = true;
          redrawers.forEach((f) => f());
        });
    }
  }
  return fontsPromise;
}

/** Register a redraw callback that runs once the fonts arrive. Returns an unregister function. */
export function onFontsReady(fn: () => void): () => void {
  void fxFontsReady();
  if (!fontsLoaded) redrawers.add(fn);
  return () => redrawers.delete(fn);
}

export const font = (weight: number, px: number, italic = false) => `${italic ? 'italic ' : ''}${weight} ${px}px ${FONT_SERIF}`;

// ─────────────────────────────────────────────────────────────────────────────
// Viewer — the head the UI and the flame face. The app sets it once (camera / head).
// ─────────────────────────────────────────────────────────────────────────────
let viewer: THREE.Object3D | null = null;
const _vp = new THREE.Vector3();
const _wp = new THREE.Vector3();

/** Set the object whose world position everything billboards towards (usually the XR camera). */
export function setFxViewer(obj: THREE.Object3D | null) {
  viewer = obj;
}
export function getFxViewer() {
  return viewer;
}
/** Writes the viewer world position into `out`; false if no viewer is set. */
export function viewerPosition(out: THREE.Vector3): boolean {
  if (!viewer) return false;
  viewer.getWorldPosition(out);
  return true;
}

/** Turn `obj` (+Z) towards the viewer (or `fallback`), keeping world-up. Allocation-free. */
export function faceViewer(obj: THREE.Object3D, fallback?: THREE.Vector3 | null): boolean {
  let target: THREE.Vector3 | null = null;
  if (viewerPosition(_vp)) target = _vp;
  else if (fallback) target = fallback;
  if (!target) return false;
  obj.updateWorldMatrix(true, false);
  _wp.setFromMatrixPosition(obj.matrixWorld);
  if (_wp.distanceToSquared(target) < 1e-8) return false;
  obj.lookAt(target);
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Blending — premultiplied "light": rgb adds light, alpha darkens what is behind.
// Glows use alpha 0 (pure additive over passthrough), ink uses alpha 1 (opaque).
// ─────────────────────────────────────────────────────────────────────────────
export const LIGHT_BLEND = {
  transparent: true,
  depthWrite: false,
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneMinusSrcAlphaFactor,
  blendSrcAlpha: THREE.OneFactor,
  blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Math helpers
// ─────────────────────────────────────────────────────────────────────────────
export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Frame-rate independent exponential approach. */
export const damp = (cur: number, target: number, rate: number, dt: number) => target + (cur - target) * Math.exp(-rate * dt);
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
export const easeInCubic = (t: number) => clamp01(t) ** 3;
export const easeInOutCubic = (t: number) => {
  t = clamp01(t);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
export const easeInOutSine = (t: number) => -(Math.cos(Math.PI * clamp01(t)) - 1) / 2;
export const easeOutBack = (t: number, s = 1.70158) => {
  t = clamp01(t) - 1;
  return t * t * ((s + 1) * t + s) + 1;
};
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Critically-damped-ish spring for squash & stretch, allocation free. */
export class Spring {
  x = 0;
  v = 0;
  constructor(public k = 170, public c = 11) {}
  kick(v: number) {
    this.v += v;
  }
  step(dt: number, target = 0) {
    // sub-step for stability at low frame rates
    const n = dt > 1 / 50 ? 2 : 1;
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const a = -this.k * (this.x - target) - this.c * this.v;
      this.v += a * h;
      this.x += this.v * h;
    }
    return this.x;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GLSL snippets (GLSL ES 1 style; three compiles them as ES 3.00 with WebGL2)
// ─────────────────────────────────────────────────────────────────────────────
export const GLSL_NOISE = /* glsl */ `
float fxHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float fxNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(fxHash(i), fxHash(i + vec2(1.0, 0.0)), u.x), mix(fxHash(i + vec2(0.0, 1.0)), fxHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fxFbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    s += a * fxNoise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return s / 0.875;
}
`;

/** Warm fire colour ramp: 0 = deep red, 1 = cream-white. */
export const GLSL_FIRE = /* glsl */ `
vec3 fxFire(float k) {
  vec3 c = mix(vec3(0.78, 0.16, 0.08), vec3(1.0, 0.44, 0.09), smoothstep(0.0, 0.35, k));
  c = mix(c, vec3(1.0, 0.74, 0.26), smoothstep(0.3, 0.66, k));
  c = mix(c, vec3(1.0, 0.95, 0.80), smoothstep(0.62, 1.0, k));
  return c;
}
`;

// ─────────────────────────────────────────────────────────────────────────────
// Canvas helpers
// ─────────────────────────────────────────────────────────────────────────────
export function makeCanvas(w: number, h: number) {
  const cv = document.createElement('canvas');
  cv.width = Math.max(2, Math.ceil(w));
  cv.height = Math.max(2, Math.ceil(h));
  const ctx = cv.getContext('2d')!;
  return { cv, ctx };
}

export function canvasTexture(cv: HTMLCanvasElement) {
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

let _glowTex: THREE.Texture | null = null;
/** Shared soft radial glow (white, alpha-less brightness in rgb) — tint via material colour. */
export function glowTexture(): THREE.Texture {
  if (_glowTex) return _glowTex;
  const s = 128;
  const { cv, ctx } = makeCanvas(s, s);
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.18)');
  g.addColorStop(0.75, 'rgba(255,255,255,0.05)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  _glowTex = new THREE.CanvasTexture(cv);
  _glowTex.colorSpace = THREE.NoColorSpace;
  return _glowTex;
}

/** Additive glow sprite material (premultiplied light, alpha 0). */
export function glowMaterial(color: THREE.ColorRepresentation, opacity = 1) {
  return new THREE.ShaderMaterial({
    ...LIGHT_BLEND,
    uniforms: { uMap: { value: glowTexture() }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform sampler2D uMap; uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv;
      void main(){ float g = texture2D(uMap, vUv).a; gl_FragColor = vec4(uColor * g * uOpacity, 0.0); }`,
  });
}

/**
 * Wrap `text` so it fits `maxLines` lines of at most `maxW` px, trying font sizes from
 * `sizes` (largest first). Returns the chosen size and lines.
 */
export function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  maxLines: number,
  sizes: number[],
  weight = 600,
  italic = false,
): { px: number; lines: string[] } {
  for (const px of sizes) {
    ctx.font = font(weight, px, italic);
    const lines = wrap(ctx, text, maxW);
    if (lines.length <= maxLines && lines.every((l) => ctx.measureText(l).width <= maxW * 1.02)) return { px, lines };
  }
  const px = sizes[sizes.length - 1];
  ctx.font = font(weight, px, italic);
  let lines = wrap(ctx, text, maxW);
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '…';
  }
  return { px, lines };
}

/** Rounded rectangle path (like kit.roundRect but clamps the radius). */
export function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Fill the current path with a soft baked drop shadow. */
export function shadowed(ctx: CanvasRenderingContext2D, blur: number, dy: number, draw: () => void, color: string = STYLE.shadow) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetY = dy;
  draw();
  ctx.restore();
}

/** Parchment fill with warm vignette + faint fibres (deterministic). */
export function parchment(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed = 7) {
  const g = ctx.createRadialGradient(x + w * 0.5, y + h * 0.42, Math.min(w, h) * 0.1, x + w * 0.5, y + h * 0.5, Math.max(w, h) * 0.75);
  g.addColorStop(0, STYLE.parchmentLight);
  g.addColorStop(0.6, STYLE.parchment);
  g.addColorStop(1, STYLE.parchmentDark);
  ctx.fillStyle = g;
  ctx.fill();
  // fibres
  ctx.save();
  ctx.clip();
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  ctx.globalAlpha = 0.07;
  ctx.strokeStyle = STYLE.inkSoft;
  ctx.lineWidth = Math.max(1, w / 500);
  const n = Math.round((w * h) / 9000);
  for (let i = 0; i < n; i++) {
    const px = x + rnd() * w;
    const py = y + rnd() * h;
    const len = 6 + rnd() * 22;
    const a = (rnd() - 0.5) * 0.9;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len);
    ctx.stroke();
  }
  ctx.restore();
}

/** A small gold diamond ornament flanked by fading rules, centred at (cx, cy). */
export function ornamentRule(ctx: CanvasRenderingContext2D, cx: number, cy: number, halfW: number, s: number, color: string = STYLE.goldDeep) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.5, s * 0.14);
  for (const dir of [-1, 1]) {
    const g = ctx.createLinearGradient(cx + dir * s * 1.6, cy, cx + dir * halfW, cy);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(168,118,31,0)');
    ctx.strokeStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx + dir * s * 1.6, cy);
    ctx.lineTo(cx + dir * halfW, cy);
    ctx.stroke();
    // small dot
    ctx.beginPath();
    ctx.arc(cx + dir * s * 1.15, cy, s * 0.16, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(cx, cy - s * 0.55);
  ctx.lineTo(cx + s * 0.55, cy);
  ctx.lineTo(cx, cy + s * 0.55);
  ctx.lineTo(cx - s * 0.55, cy);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Deterministic PRNG (xorshift), same family as kit.rng but returns floats with full precision. */
export function prng(seed: number) {
  let s = (seed >>> 0) ^ 0x9e3779b9 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas planes — premultiplied textures (no dark fringes when mip-filtered),
// colours passed straight through (canvas sRGB in → framebuffer out).
// ─────────────────────────────────────────────────────────────────────────────
const PANEL_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const PANEL_FRAG = /* glsl */ `uniform sampler2D uMap; uniform float uOpacity; varying vec2 vUv;
void main(){ gl_FragColor = texture2D(uMap, vUv) * uOpacity; }`;

let _unitPlane: THREE.PlaneGeometry | null = null;
/** Shared 1×1 plane (never dispose it). */
export function unitPlane() {
  return (_unitPlane ??= new THREE.PlaneGeometry(1, 1));
}

export function panelMaterial(tex: THREE.Texture | null, depthTest = true) {
  return new THREE.ShaderMaterial({
    ...LIGHT_BLEND,
    depthTest,
    uniforms: { uMap: { value: tex }, uOpacity: { value: 1 } },
    vertexShader: PANEL_VERT,
    fragmentShader: PANEL_FRAG,
  });
}

function panelTexture(cv: HTMLCanvasElement) {
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  tex.premultiplyAlpha = true;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

/** A plane showing a canvas; world size follows the canvas size at `pxPerM`. */
export class CanvasPlane {
  readonly mesh: THREE.Mesh;
  readonly mat: THREE.ShaderMaterial;
  readonly cv: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  constructor(public pxPerM = 4000, wPx = 256, hPx = 256, renderOrder = 30) {
    const { cv, ctx } = makeCanvas(wPx, hPx);
    this.cv = cv;
    this.ctx = ctx;
    this.tex = panelTexture(cv);
    this.mat = panelMaterial(this.tex);
    this.mesh = new THREE.Mesh(unitPlane(), this.mat);
    this.mesh.renderOrder = renderOrder;
    this.mesh.scale.set(wPx / pxPerM, hPx / pxPerM, 1);
  }
  /** Resize (re-creating the GPU texture only when the size changes) and clear. */
  size(wPx: number, hPx: number) {
    wPx = Math.max(2, Math.ceil(wPx));
    hPx = Math.max(2, Math.ceil(hPx));
    if (wPx !== this.cv.width || hPx !== this.cv.height) {
      this.cv.width = wPx;
      this.cv.height = hPx;
      this.tex.dispose();
      this.tex = panelTexture(this.cv);
      this.mat.uniforms.uMap.value = this.tex;
    }
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, wPx, hPx);
    this.mesh.scale.set(wPx / this.pxPerM, hPx / this.pxPerM, 1);
    return this.ctx;
  }
  get widthM() {
    return this.cv.width / this.pxPerM;
  }
  get heightM() {
    return this.cv.height / this.pxPerM;
  }
  commit() {
    this.tex.needsUpdate = true;
  }
  set opacity(o: number) {
    this.mat.uniforms.uOpacity.value = o;
  }
  dispose() {
    this.tex.dispose();
    this.mat.dispose();
    this.mesh.removeFromParent();
  }
}
