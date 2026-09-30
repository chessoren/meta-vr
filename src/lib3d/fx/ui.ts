/**
 * Loci 3D UI — warm, readable canvas-texture panels that always face the viewer.
 *
 * Style: parchment #f1dfb8, ink #2b1d14, gold #e9b949, Fraunces serif, soft baked shadows.
 * Sizes are chosen for reading at 0.5–0.8 m inside a ±20° field (Meta VR Glasses):
 * body text ≥ ~1.5 cm em-height, cards ≤ 30 cm wide.
 *
 * Every element: `root` (place it), `setVisible(v, animate)`, `update(dt, t)`, `dispose()`.
 * Billboarding uses the viewer set with `setFxViewer(camera)` (see fx/common.ts).
 * Canvases redraw only on content/state changes (and when the Fraunces fonts arrive).
 */
import * as THREE from 'three';
import qrcode from 'qrcode-generator';
import {
  CanvasPlane,
  LIGHT_BLEND,
  STYLE,
  clamp01,
  damp,
  easeOutBack,
  easeOutCubic,
  faceViewer,
  fitText,
  font,
  glowMaterial,
  onFontsReady,
  ornamentRule,
  parchment,
  rrect,
  shadowed,
  unitPlane,
  viewerPosition,
  makeCanvas,
} from './common';

const PX = 4000; // canvas pixels per metre (0.25 mm / px)
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

// ─────────────────────────────────────────────────────────────────────────────
// Base
// ─────────────────────────────────────────────────────────────────────────────
export abstract class Panel {
  readonly root = new THREE.Group();
  /** Billboarded towards the viewer. */
  protected pivot = new THREE.Group();
  /** Appear/disappear animation target. */
  protected content = new THREE.Group();
  /** Face the viewer every frame (default true). */
  billboard = true;
  private vis = 0;
  private target = 0;
  private showing = true;
  private unFonts: (() => void) | null = null;

  constructor(name: string) {
    this.root.name = name;
    this.root.add(this.pivot);
    this.pivot.add(this.content);
    this.root.visible = false;
  }

  /** Call once from the subclass constructor after the first draw. */
  protected redrawOnFonts(fn: () => void) {
    this.unFonts = onFontsReady(fn);
  }

  setVisible(v: boolean, animate = true) {
    this.target = v ? 1 : 0;
    this.showing = v;
    if (!animate) this.vis = this.target;
    if (v) this.root.visible = true;
    this.applyVis();
  }
  get visible() {
    return this.target > 0;
  }

  private applyVis() {
    const v = this.vis;
    let s: number;
    let o: number;
    let y: number;
    if (this.showing) {
      s = 0.72 + 0.28 * easeOutBack(v, 2.0);
      o = easeOutCubic(clamp01(v * 1.6));
      y = (1 - easeOutCubic(v)) * -0.014;
    } else {
      s = 0.9 + 0.1 * v;
      o = v;
      y = (1 - v) * 0.006;
    }
    this.content.scale.setScalar(Math.max(1e-4, s));
    this.content.position.y = y;
    this.setOpacity(o);
    this.root.visible = v > 0.001 || this.target > 0;
  }

  update(dt: number, t: number) {
    if (this.vis !== this.target) {
      const sp = this.target > this.vis ? dt / 0.42 : dt / 0.24;
      this.vis = this.target > this.vis ? Math.min(this.target, this.vis + sp) : Math.max(this.target, this.vis - sp);
      this.applyVis();
    }
    if (!this.root.visible) return;
    if (this.billboard) faceViewer(this.pivot);
    this.tick(dt, t);
  }

  protected abstract setOpacity(o: number): void;
  protected tick(_dt: number, _t: number): void {}

  dispose() {
    this.unFonts?.();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (m.geometry !== unitPlane()) m.geometry.dispose();
      const mat = m.material as THREE.ShaderMaterial | THREE.ShaderMaterial[];
      for (const mm of Array.isArray(mat) ? mat : [mat]) {
        const u = mm.uniforms as Record<string, { value: unknown }> | undefined;
        if (u) for (const k in u) if (u[k].value instanceof THREE.CanvasTexture) (u[k].value as THREE.Texture).dispose();
        mm.dispose();
      }
    });
    this.root.removeFromParent();
  }
}

/** Panel made of one CanvasPlane. */
abstract class CardPanel extends Panel {
  protected plane: CanvasPlane;
  constructor(name: string) {
    super(name);
    this.plane = new CanvasPlane(PX, 64, 64, 30);
    this.content.add(this.plane.mesh);
  }
  protected setOpacity(o: number) {
    this.plane.opacity = o;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Drawing helpers
// ─────────────────────────────────────────────────────────────────────────────
const M = 44; // shadow margin (px)

function cardBackground(ctx: CanvasRenderingContext2D, w: number, h: number, r = 34, seed = 3) {
  const x = M;
  const y = M;
  const cw = w - 2 * M;
  const ch = h - 2 * M;
  shadowed(ctx, 38, 12, () => {
    rrect(ctx, x, y, cw, ch, r);
    ctx.fillStyle = STYLE.parchment;
    ctx.fill();
  });
  rrect(ctx, x, y, cw, ch, r);
  parchment(ctx, x, y, cw, ch, seed);
  // double gold border
  ctx.strokeStyle = 'rgba(168,118,31,0.85)';
  ctx.lineWidth = 4;
  rrect(ctx, x + 16, y + 16, cw - 32, ch - 32, r - 12);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(168,118,31,0.4)';
  ctx.lineWidth = 2;
  rrect(ctx, x + 26, y + 26, cw - 52, ch - 52, r - 18);
  ctx.stroke();
  // corner flourishes
  ctx.fillStyle = STYLE.goldDeep;
  for (const [cx, cy] of [[x + 16, y + 16], [x + cw - 16, y + 16], [x + 16, y + ch - 16], [x + cw - 16, y + ch - 16]]) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - 9);
    ctx.lineTo(cx + 9, cy);
    ctx.lineTo(cx, cy + 9);
    ctx.lineTo(cx - 9, cy);
    ctx.closePath();
    ctx.fill();
  }
  return { x, y, cw, ch };
}

function spacedText(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, spacing: number) {
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let x = cx - total / 2;
  const align = ctx.textAlign;
  ctx.textAlign = 'left';
  chars.forEach((c, i) => {
    ctx.fillText(c, x, cy);
    x += widths[i] + spacing;
  });
  ctx.textAlign = align;
  return total;
}

// ─────────────────────────────────────────────────────────────────────────────
// QuestionCard
// ─────────────────────────────────────────────────────────────────────────────
export class QuestionCard extends CardPanel {
  private text = '';
  private kicker = '';
  constructor(text = '', kicker = '') {
    super('questionCard');
    this.text = text;
    this.kicker = kicker;
    this.draw();
    this.redrawOnFonts(() => this.draw());
  }
  /** Question text (1–3 lines) and an optional small kicker line (e.g. "Capitals · 3 of 5"). */
  setText(text: string, kicker = '') {
    this.text = text;
    this.kicker = kicker;
    this.draw();
  }
  private draw() {
    const W = 1200;
    const pad = 84;
    const maxW = W - 2 * M - 2 * pad;
    const { ctx: mctx } = measureCtx();
    const { px, lines } = fitText(mctx, this.text || ' ', maxW, 3, [88, 80, 72, 64], 600);
    const lh = px * 1.2;
    const kick = this.kicker ? 58 : 0;
    const H = Math.round(2 * M + pad * 0.8 + kick + lines.length * lh + 64 + pad * 0.55);
    const ctx = this.plane.size(W, H);
    const { y } = cardBackground(ctx, W, H, 36, 11);
    let cy = y + pad * 0.8;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (this.kicker) {
      ctx.font = font(700, 32);
      ctx.fillStyle = STYLE.goldDeep;
      spacedText(ctx, this.kicker.toUpperCase(), W / 2, cy + 14, 4);
      cy += kick;
    }
    ctx.font = font(600, px);
    ctx.fillStyle = STYLE.ink;
    lines.forEach((l, i) => ctx.fillText(l, W / 2, cy + lh * (i + 0.5)));
    cy += lines.length * lh + 30;
    ornamentRule(ctx, W / 2, cy + 8, 150, 20);
    this.plane.commit();
  }
}

let _mc: { cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null = null;
function measureCtx() {
  return (_mc ??= makeCanvas(8, 8));
}

// ─────────────────────────────────────────────────────────────────────────────
// AnswerBubble — shader bubble (animated states) + canvas text
// ─────────────────────────────────────────────────────────────────────────────
export type BubbleState = 'idle' | 'hover' | 'pressed' | 'correct' | 'wrong';

const BUBBLE_FRAG = /* glsl */ `
uniform sampler2D uText;
uniform vec3 uFill;
uniform float uFillA;
uniform vec3 uRim;
uniform float uGlow;
uniform float uTextA;
uniform float uOpacity;
uniform float uTime;
uniform float uShine;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * 2.0 * 1.3;  // bubble edge at r = 1
  float r = length(p);
  float aa = max(fwidth(r), 0.002) * 1.2;
  float body = smoothstep(1.0 + aa, 1.0 - aa, r);
  // fill: lighter top, deeper bottom; faint swirl
  float sw = 0.5 + 0.5 * sin(atan(p.y, p.x) * 3.0 + uTime * 0.6 + r * 4.0);
  vec3 fill = uFill * (0.9 + 0.14 * p.y + 0.04 * sw);
  vec3 col = fill * uFillA * body;
  float a = uFillA * body;
  // rim: thin bright ring + inner fresnel
  float ring = exp(-pow((r - 0.965) / 0.03, 2.0));
  float fres = smoothstep(0.55, 1.0, r) * body;
  col += uRim * (ring * 0.9 + fres * 0.25);
  // glossy highlight arc (top-left)
  vec2 hd = normalize(vec2(-0.55, 0.83));
  float hl = exp(-pow((r - 0.8) / 0.06, 2.0)) * smoothstep(0.55, 0.95, dot(p / max(r, 1e-3), hd)) * body;
  col += vec3(1.0, 0.98, 0.92) * hl * (0.45 + uShine * 0.4);
  // outer glow (pure light)
  float glow = exp(-max(r - 1.0, 0.0) * 9.0) * (1.0 - body) * uGlow * smoothstep(1.29, 1.08, r);
  col += uRim * glow * 0.55;
  col += fill * body * 0.16;   // a little inner light: luminous, not grey
  // text (premultiplied canvas)
  vec4 tx = texture2D(uText, vUv);
  col = col * (1.0 - tx.a * uTextA) + tx.rgb * uTextA;
  a = max(a, tx.a * uTextA);
  gl_FragColor = vec4(col, a) * uOpacity;
}`;

interface BubbleLook {
  fill: THREE.Color;
  fillA: number;
  rim: THREE.Color;
  glow: number;
  textA: number;
  scale: number;
  shine: number;
}
const BL = (fill: string, fillA: number, rim: string, glow: number, textA: number, scale: number, shine: number): BubbleLook => ({ fill: new THREE.Color(fill), fillA, rim: new THREE.Color(rim), glow, textA, scale, shine });
const BUBBLE_LOOKS: Record<BubbleState, BubbleLook> = {
  idle: BL('#f6e6c4', 0.8, '#e9b949', 0.4, 1, 1, 0.2),
  hover: BL('#fbeed2', 0.86, '#ffd36a', 1.0, 1, 1.1, 0.6),
  pressed: BL('#fff6e2', 0.95, '#ffe08a', 1.3, 1, 0.94, 1),
  correct: BL('#ffd978', 0.94, '#fff1b8', 1.7, 1, 1.12, 1),
  wrong: BL('#9b8a80', 0.5, '#8e6a5a', 0.08, 0.55, 0.94, 0),
};

let bubbleCounter = 0;
export class AnswerBubble extends Panel {
  /** Bubble radius in metres (unscaled). */
  readonly radius: number;
  private mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private tctx: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private text: string;
  private state: BubbleState = 'idle';
  private look = { fill: new THREE.Color(), fillA: 0, rim: new THREE.Color(), glow: 0, textA: 1, scale: 1, shine: 0 };
  private opacity = 1;
  private shake = 0;
  private pulse = 0;
  private phase: number;
  private float = new THREE.Group();

  constructor(text = '', radius = 0.042) {
    super('answerBubble');
    this.radius = Math.max(0.035, radius);
    this.text = text;
    this.phase = (bubbleCounter++ * 2.39996) % 6.2832;
    const { cv, ctx } = makeCanvas(512, 512);
    this.tctx = ctx;
    this.tex = new THREE.CanvasTexture(cv);
    this.tex.colorSpace = THREE.NoColorSpace;
    this.tex.premultiplyAlpha = true;
    this.tex.anisotropy = 4;
    const L = BUBBLE_LOOKS.idle;
    this.look.fill.copy(L.fill);
    this.look.rim.copy(L.rim);
    Object.assign(this.look, { fillA: L.fillA, glow: L.glow, textA: 1, scale: 1, shine: 0 });
    this.mat = new THREE.ShaderMaterial({
      ...LIGHT_BLEND,
      uniforms: {
        uText: { value: this.tex },
        uFill: { value: this.look.fill },
        uFillA: { value: L.fillA },
        uRim: { value: this.look.rim },
        uGlow: { value: L.glow },
        uTextA: { value: 1 },
        uOpacity: { value: 1 },
        uTime: { value: 0 },
        uShine: { value: 0 },
      },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: BUBBLE_FRAG,
    });
    this.mesh = new THREE.Mesh(unitPlane(), this.mat);
    this.mesh.renderOrder = 32;
    const d = this.radius * 2 * 1.3;
    this.mesh.scale.set(d, d, 1);
    this.content.add(this.float);
    this.float.add(this.mesh);
    this.draw();
    this.redrawOnFonts(() => this.draw());
  }

  setText(text: string) {
    this.text = text;
    this.draw();
  }

  setState(s: BubbleState) {
    if (s === this.state) return;
    this.state = s;
    if (s === 'wrong') this.shake = 1;
    if (s === 'correct') this.pulse = 1;
  }
  get currentState() {
    return this.state;
  }

  /** Pinch hit-test: is `p` (world) inside the bubble sphere (+ tolerance, m)? */
  containsPoint(p: THREE.Vector3, tolerance = 0.012): boolean {
    if (!this.root.visible) return false;
    this.mesh.getWorldPosition(_v);
    this.content.getWorldScale(_w);
    const r = this.radius * _w.x * this.look.scale + tolerance;
    return _v.distanceToSquared(p) <= r * r;
  }

  private draw() {
    const ctx = this.tctx;
    const S = 512;
    ctx.clearRect(0, 0, S, S);
    // circle diameter in the canvas = S / 1.3
    const inner = (S / 1.3) * 0.86;
    const { px, lines } = fitText(ctx, this.text || ' ', inner, 2, [112, 100, 90, 80, 72, 64, 56, 48], 700);
    ctx.font = font(700, px);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lh = px * 1.08;
    const y0 = S / 2 - ((lines.length - 1) * lh) / 2 + px * 0.04;
    // soft light halo behind the letters for legibility over the glossy fill
    ctx.shadowColor = 'rgba(255,248,230,0.9)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = STYLE.ink;
    lines.forEach((l, i) => ctx.fillText(l, S / 2, y0 + i * lh));
    ctx.shadowBlur = 0;
    this.tex.needsUpdate = true;
  }

  protected setOpacity(o: number) {
    this.opacity = o;
  }

  protected tick(dt: number, t: number) {
    const L = BUBBLE_LOOKS[this.state];
    const k = 1 - Math.exp(-12 * dt);
    const lk = this.look;
    lk.fill.lerp(L.fill, k);
    lk.rim.lerp(L.rim, k);
    lk.fillA = damp(lk.fillA, L.fillA, 12, dt);
    lk.glow = damp(lk.glow, L.glow, 10, dt);
    lk.textA = damp(lk.textA, L.textA, 8, dt);
    lk.scale = damp(lk.scale, L.scale, 16, dt);
    lk.shine = damp(lk.shine, L.shine, 10, dt);
    this.shake = Math.max(0, this.shake - dt * 1.8);
    this.pulse = Math.max(0, this.pulse - dt * 1.5);
    const u = this.mat.uniforms;
    u.uFillA.value = lk.fillA;
    u.uGlow.value = lk.glow * (1 + this.pulse * 0.8) * (1 + 0.08 * Math.sin(t * 2.2 + this.phase));
    u.uTextA.value = lk.textA;
    u.uOpacity.value = this.opacity;
    u.uTime.value = t % 1000;
    u.uShine.value = lk.shine;
    const pulseS = 1 + Math.sin(this.pulse * Math.PI) * 0.12;
    this.float.scale.setScalar(lk.scale * pulseS);
    this.float.position.set(Math.sin(this.shake * 30) * this.shake * 0.008, Math.sin(t * 1.3 + this.phase) * 0.0025, 0);
  }

  override dispose() {
    this.tex.dispose();
    super.dispose();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Caption — dark ribbon, hook words in gold caps
// ─────────────────────────────────────────────────────────────────────────────
export class Caption extends CardPanel {
  private text = '';
  private hooks: string[] = [];
  constructor(text = '', hooks: string[] = []) {
    super('caption');
    this.text = text;
    this.hooks = hooks;
    this.draw();
    this.redrawOnFonts(() => this.draw());
  }
  setText(text: string, hooks: string[] = []) {
    this.text = text;
    this.hooks = hooks;
    this.draw();
  }
  private draw() {
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]/gu, '');
    const hooks = new Set(this.hooks.map(norm));
    const words = (this.text || ' ').split(/\s+/).filter(Boolean);
    const { ctx: m } = measureCtx();
    const maxW = 1180;
    let px = 70;
    type Tok = { s: string; hook: boolean; w: number };
    let lines: Tok[][] = [];
    const layout = () => {
      const fN = font(600, px, true);
      const fH = font(800, px);
      const toks: Tok[] = words.map((w) => {
        const hook = hooks.has(norm(w)) || (w.length > 1 && w === w.toUpperCase() && /\p{L}/u.test(w));
        const s = hook ? w.toUpperCase() : w;
        m.font = hook ? fH : fN;
        return { s, hook, w: m.measureText(s).width + (hook ? s.length * 3 : 0) };
      });
      m.font = fN;
      const space = m.measureText(' ').width;
      lines = [[]];
      let lw = 0;
      for (const tk of toks) {
        const add = (lines[lines.length - 1].length ? space : 0) + tk.w;
        if (lw + add > maxW && lines[lines.length - 1].length) {
          lines.push([tk]);
          lw = tk.w;
        } else {
          lines[lines.length - 1].push(tk);
          lw += add;
        }
      }
      return space;
    };
    let space = layout();
    while (lines.length > 2 && px > 50) {
      px -= 6;
      space = layout();
    }
    const lineW = (l: Tok[]) => l.reduce((a, t) => a + t.w, 0) + space * (l.length - 1);
    const contentW = Math.max(...lines.map(lineW));
    const lh = px * 1.25;
    const tail = 96;
    const W = Math.ceil(contentW + 2 * 70 + 2 * tail + 2 * M);
    const H = Math.ceil(lines.length * lh + 80 + 2 * M + 26);
    const ctx = this.plane.size(W, H);
    const x0 = M + tail;
    const x1 = W - M - tail;
    const y0 = M + 10;
    const y1 = H - M - 36;
    // swallow-tail ends (behind, lower, with a fold)
    const drop = 26;
    const ends = (dir: number) => {
      const xa = dir < 0 ? x0 + 30 : x1 - 30;
      const xb = dir < 0 ? M : W - M;
      ctx.beginPath();
      ctx.moveTo(xa, y0 + drop);
      ctx.lineTo(xb, y0 + drop);
      ctx.lineTo(xb - dir * 44, (y0 + y1) / 2 + drop);
      ctx.lineTo(xb, y1 + drop);
      ctx.lineTo(xa, y1 + drop);
      ctx.closePath();
    };
    for (const dir of [-1, 1]) {
      shadowed(ctx, 24, 8, () => {
        ends(dir);
        const g = ctx.createLinearGradient(0, y0 + drop, 0, y1 + drop);
        g.addColorStop(0, '#5a3a26');
        g.addColorStop(1, '#3a2418');
        ctx.fillStyle = g;
        ctx.fill();
      });
      ends(dir);
      ctx.strokeStyle = 'rgba(233,185,73,0.8)';
      ctx.lineWidth = 3;
      ctx.stroke();
      // fold: dark triangle tucking the tail under the band
      const xe = dir < 0 ? x0 : x1;
      ctx.beginPath();
      ctx.moveTo(xe, y1);
      ctx.lineTo(xe - dir * 30, y1 + drop);
      ctx.lineTo(xe - dir * 30, y1 - 10);
      ctx.closePath();
      ctx.fillStyle = '#1c110a';
      ctx.fill();
    }
    // main band
    shadowed(ctx, 34, 12, () => {
      rrect(ctx, x0, y0, x1 - x0, y1 - y0, 14);
      const g = ctx.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, '#4a3020');
      g.addColorStop(0.5, '#3a2418');
      g.addColorStop(1, '#2b1a10');
      ctx.fillStyle = g;
      ctx.fill();
    });
    ctx.strokeStyle = STYLE.gold;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x0 + 12, y0 + 12);
    ctx.lineTo(x1 - 12, y0 + 12);
    ctx.moveTo(x0 + 12, y1 - 12);
    ctx.lineTo(x1 - 12, y1 - 12);
    ctx.stroke();
    // text
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const top = (y0 + y1) / 2 - ((lines.length - 1) * lh) / 2;
    lines.forEach((l, li) => {
      let x = W / 2 - lineW(l) / 2;
      const y = top + li * lh;
      for (const tk of l) {
        if (tk.hook) {
          ctx.font = font(800, px);
          ctx.fillStyle = '#ffd36a';
          ctx.shadowColor = 'rgba(255,190,70,0.65)';
          ctx.shadowBlur = 16;
          let cx = x;
          for (const ch of tk.s) {
            ctx.fillText(ch, cx, y + px * 0.03);
            cx += ctx.measureText(ch).width + 3;
          }
          ctx.shadowBlur = 0;
        } else {
          ctx.font = font(600, px, true);
          ctx.fillStyle = '#f6e7c8';
          ctx.fillText(tk.s, x, y);
        }
        x += tk.w + space;
      }
    });
    this.plane.commit();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ProofCard — "5 / 5", laurels, rays
// ─────────────────────────────────────────────────────────────────────────────
const RAYS_FRAG = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float a = atan(p.y, p.x);
  float rays = pow(0.5 + 0.5 * cos(a * 14.0 + uTime * 0.25), 5.0) * 0.8 + pow(0.5 + 0.5 * cos(a * 9.0 - uTime * 0.18 + 1.0), 7.0) * 0.5;
  float fall = smoothstep(1.0, 0.25, r) * smoothstep(0.05, 0.3, r);
  float core = exp(-r * r * 5.0) * 0.35;
  vec3 c = vec3(1.0, 0.78, 0.36);
  gl_FragColor = vec4(c * (rays * fall * 0.55 + core) * uOpacity, 0.0);
}`;

export class ProofCard extends CardPanel {
  private score = 5;
  private total = 5;
  private line = '';
  private sub = '';
  private rays: THREE.Mesh;
  private raysMat: THREE.ShaderMaterial;
  private op = 1;
  constructor() {
    super('proofCard');
    this.raysMat = new THREE.ShaderMaterial({
      ...LIGHT_BLEND,
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: RAYS_FRAG,
    });
    this.rays = new THREE.Mesh(unitPlane(), this.raysMat);
    this.rays.scale.set(0.5, 0.5, 1);
    this.rays.position.set(0, 0.03, -0.01);
    this.rays.renderOrder = 29;
    this.content.add(this.rays);
    this.draw();
    this.redrawOnFonts(() => this.draw());
  }
  set(score: number, total: number, line: string, subline = '') {
    Object.assign(this, { score, total, line, sub: subline });
    this.draw();
  }
  protected override setOpacity(o: number) {
    super.setOpacity(o);
    this.op = o;
  }
  protected override tick(_dt: number, t: number) {
    this.raysMat.uniforms.uTime.value = t % 1000;
    this.raysMat.uniforms.uOpacity.value = this.op * (0.85 + 0.15 * Math.sin(t * 1.7));
  }
  private draw() {
    const W = 1240;
    const H = 880;
    const ctx = this.plane.size(W, H);
    const { y, ch } = cardBackground(ctx, W, H, 40, 21);
    const cx = W / 2;
    const numY = y + 240;
    // laurels
    laurel(ctx, cx - 345, numY + 30, -1);
    laurel(ctx, cx + 345, numY + 30, 1);
    // big score
    const txt = `${this.score} / ${this.total}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font(800, 250);
    const g = ctx.createLinearGradient(0, numY - 110, 0, numY + 110);
    g.addColorStop(0, '#ffe39a');
    g.addColorStop(0.45, '#e9b949');
    g.addColorStop(1, '#a8761f');
    ctx.lineJoin = 'round';
    ctx.lineWidth = 14;
    ctx.strokeStyle = STYLE.ink;
    shadowed(ctx, 18, 8, () => ctx.strokeText(txt, cx, numY), 'rgba(40,20,5,0.45)');
    ctx.fillStyle = g;
    ctx.fillText(txt, cx, numY);
    // sparkles around
    for (const [sx, sy, s] of [[cx - 250, numY - 150, 24], [cx + 262, numY - 158, 18], [cx + 440, numY - 60, 13], [cx - 445, numY - 50, 12], [cx + 8, numY - 172, 14]] as const) star(ctx, sx, sy, s);
    ornamentRule(ctx, cx, numY + 175, 220, 20);
    // line + sub
    const maxW = W - 2 * M - 180;
    const f1 = fitText(ctx, this.line || ' ', maxW, 2, [62, 56, 50], 600);
    ctx.font = font(600, f1.px);
    ctx.fillStyle = STYLE.ink;
    let ty = numY + 250;
    f1.lines.forEach((l, i) => ctx.fillText(l, cx, ty + i * f1.px * 1.18));
    ty += f1.lines.length * f1.px * 1.18 + 16;
    if (this.sub) {
      const f2 = fitText(ctx, this.sub, maxW, 2, [48, 44, 40], 600, true);
      ctx.font = font(600, f2.px, true);
      ctx.fillStyle = STYLE.inkSoft;
      f2.lines.forEach((l, i) => ctx.fillText(l, cx, ty + i * f2.px * 1.2));
    }
    void ch;
    this.plane.commit();
    this.rays.position.y = (H / 2 - (numY)) / PX;
  }
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.save();
  ctx.fillStyle = STYLE.gold;
  ctx.shadowColor = 'rgba(233,185,73,0.8)';
  ctx.shadowBlur = s * 0.8;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? s : s * 0.28;
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function laurel(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  ctx.strokeStyle = STYLE.goldDeep;
  ctx.fillStyle = STYLE.goldDeep;
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  // stem arc
  const R = 190;
  const a0 = Math.PI * 0.62;
  const a1 = Math.PI * 1.32;
  ctx.beginPath();
  ctx.arc(R * 0.72, -20, R, a0, a1);
  ctx.stroke();
  for (let i = 0; i <= 7; i++) {
    const a = a0 + ((a1 - a0) * i) / 7.4;
    const px = R * 0.72 + Math.cos(a) * R;
    const py = -20 + Math.sin(a) * R;
    for (const side of [-1, 1]) {
      const la = a + Math.PI / 2 + side * 0.9 - 0.35;
      const len = 44 - i * 2.4;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(la);
      ctx.beginPath();
      ctx.ellipse(len / 2, 0, len / 2, len * 0.2, 0, 0, Math.PI * 2);
      ctx.globalAlpha = side > 0 ? 0.95 : 0.7;
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();
}

// ─────────────────────────────────────────────────────────────────────────────
// QRPanel
// ─────────────────────────────────────────────────────────────────────────────
export type QRState = 'waiting' | 'receiving' | 'ready';

export class QRPanel extends CardPanel {
  private status: CanvasPlane;
  private state: QRState = 'waiting';
  private url: string;
  private code: string;
  private statusT = 0;
  private frame = -1;
  private progress = -1;
  constructor(url: string, code: string) {
    super('qrPanel');
    this.url = url;
    this.code = code;
    this.status = new CanvasPlane(PX, 900, 150, 31);
    this.content.add(this.status.mesh);
    this.draw();
    this.drawStatus(0);
    this.redrawOnFonts(() => {
      this.draw();
      this.drawStatus(this.frame);
    });
  }
  setCode(url: string, code: string) {
    this.url = url;
    this.code = code;
    this.draw();
  }
  setState(s: QRState) {
    if (s === this.state) return;
    this.state = s;
    this.drawStatus(0);
  }
  /** Optional receiving progress 0–1 (shows a bar); -1 = indeterminate. */
  setProgress(p: number) {
    this.progress = p;
    if (this.state === 'receiving') this.drawStatus(this.frame);
  }
  protected override setOpacity(o: number) {
    super.setOpacity(o);
    this.status.opacity = o;
  }
  protected override tick(dt: number) {
    if (this.state === 'ready') return;
    this.statusT += dt;
    const f = Math.floor(this.statusT * 5); // 5 fps redraw of the small status strip only
    if (f !== this.frame) this.drawStatus(f);
  }
  private draw() {
    const W = 1000;
    const qr = qrcode(0, 'M');
    qr.addData(this.url);
    qr.make();
    const n = qr.getModuleCount();
    const cell = Math.max(4, Math.floor(560 / (n + 8)));
    const qrPx = cell * (n + 8); // 4-module quiet zone each side
    const H = Math.round(2 * M + 110 + qrPx + 40 + 230 + 90 + 190);
    const ctx = this.plane.size(W, H);
    const { y } = cardBackground(ctx, W, H, 40, 31);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font(700, 34);
    ctx.fillStyle = STYLE.goldDeep;
    spacedText(ctx, 'IMPORT YOUR COURSE', W / 2, y + 78, 5);
    // QR on a cream tile
    const qx = Math.round((W - qrPx) / 2);
    const qy = Math.round(y + 120);
    shadowed(ctx, 16, 5, () => {
      rrect(ctx, qx - 10, qy - 10, qrPx + 20, qrPx + 20, 22);
      ctx.fillStyle = '#fffaf0';
      ctx.fill();
    }, 'rgba(60,35,15,0.35)');
    ctx.fillStyle = STYLE.ink;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect(qx + (c + 4) * cell, qy + (r + 4) * cell, cell, cell);
    // the code, huge
    let cy = qy + qrPx + 40 + 110;
    ctx.font = font(800, 200);
    ctx.fillStyle = STYLE.ink;
    spacedText(ctx, this.code.toUpperCase(), W / 2, cy, 34);
    cy += 140;
    ctx.font = font(600, 44);
    ctx.fillStyle = STYLE.inkSoft;
    ctx.fillText(this.url.replace(/^https?:\/\//, ''), W / 2, cy);
    cy += 64;
    ctx.font = font(600, 34, true);
    ctx.fillStyle = STYLE.inkFaint;
    ctx.fillText('scan with your phone, or type the address', W / 2, cy);
    this.plane.commit();
    // status strip sits at the bottom of the card
    this.status.mesh.position.set(0, -H / 2 / PX + (M + 95) / PX, 0.0015);
  }
  private drawStatus(frame: number) {
    this.frame = frame;
    const ctx = this.status.size(900, 150);
    const W = 900;
    const cy = 75;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (this.state === 'waiting') {
      ctx.font = font(600, 50);
      ctx.fillStyle = STYLE.ink;
      const label = 'Waiting for your phone';
      const tw = ctx.measureText(label).width;
      ctx.fillText(label, W / 2 - 30, cy);
      for (let i = 0; i < 3; i++) {
        const on = (frame % 4) > i;
        ctx.beginPath();
        ctx.arc(W / 2 - 30 + tw / 2 + 26 + i * 24, cy + 12, 7, 0, Math.PI * 2);
        ctx.fillStyle = on ? STYLE.goldDeep : 'rgba(168,118,31,0.25)';
        ctx.fill();
      }
    } else if (this.state === 'receiving') {
      ctx.font = font(600, 50);
      ctx.fillStyle = STYLE.ink;
      ctx.fillText('Receiving your course…', W / 2 + 36, cy);
      // spinner
      const sx = 150;
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(168,118,31,0.25)';
      ctx.beginPath();
      ctx.arc(sx, cy, 28, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = STYLE.goldDeep;
      ctx.beginPath();
      if (this.progress >= 0) ctx.arc(sx, cy, 28, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp01(this.progress));
      else {
        const a = frame * 0.9;
        ctx.arc(sx, cy, 28, a, a + Math.PI * 1.2);
      }
      ctx.stroke();
    } else {
      // ready: gold seal with a check
      const sx = 250;
      ctx.beginPath();
      ctx.arc(sx, cy, 40, 0, Math.PI * 2);
      ctx.fillStyle = STYLE.gold;
      ctx.fill();
      ctx.strokeStyle = STYLE.ink;
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(sx - 18, cy + 1);
      ctx.lineTo(sx - 5, cy + 15);
      ctx.lineTo(sx + 20, cy - 14);
      ctx.stroke();
      ctx.font = font(700, 58);
      ctx.fillStyle = STYLE.ink;
      ctx.textAlign = 'left';
      ctx.fillText('Course ready', sx + 66, cy + 2);
    }
    this.status.commit();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Procedural icons (canvas paths, no emoji fonts)
// ─────────────────────────────────────────────────────────────────────────────
export type IconId = 'palaces' | 'import' | 'sound' | 'sound-off' | 'exit' | 'check' | 'back';

export function drawIcon(ctx: CanvasRenderingContext2D, id: IconId, cx: number, cy: number, s: number, color: string) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s / 100, s / 100);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const line = (pts: number[]) => {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.stroke();
  };
  switch (id) {
    case 'palaces': {
      // a little temple: pediment, columns, steps
      line([-40, -14, 0, -40, 40, -14, -40, -14]);
      ctx.beginPath();
      ctx.arc(0, -24, 4, 0, Math.PI * 2);
      ctx.fill();
      for (const x of [-28, -9, 9, 28]) line([x, -4, x, 26]);
      line([-40, 34, 40, 34]);
      line([-46, 42, 46, 42]);
      break;
    }
    case 'import': {
      // phone with an arrow coming out towards you
      ctx.beginPath();
      rrect(ctx, -22, -40, 44, 80, 9);
      ctx.stroke();
      line([-7, 30, 7, 30]);
      line([0, -24, 0, 12]);
      line([-13, 0, 0, 13, 13, 0]);
      break;
    }
    case 'sound':
    case 'sound-off': {
      ctx.beginPath();
      ctx.moveTo(-40, -12);
      ctx.lineTo(-24, -12);
      ctx.lineTo(-4, -30);
      ctx.lineTo(-4, 30);
      ctx.lineTo(-24, 12);
      ctx.lineTo(-40, 12);
      ctx.closePath();
      ctx.stroke();
      if (id === 'sound') {
        ctx.beginPath();
        ctx.arc(-4, 0, 20, -0.8, 0.8);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(-4, 0, 36, -0.75, 0.75);
        ctx.stroke();
      } else {
        line([14, -14, 40, 14]);
        line([40, -14, 14, 14]);
      }
      break;
    }
    case 'exit': {
      // door + arrow
      line([6, -40, -30, -40, -30, 40, 6, 40]);
      line([-2, 0, 42, 0]);
      line([28, -14, 42, 0, 28, 14]);
      ctx.beginPath();
      ctx.arc(-16, 2, 3.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'check':
      line([-30, 2, -8, 24, 32, -22]);
      break;
    case 'back':
      line([12, -30, -18, 0, 12, 30]);
      break;
  }
  ctx.restore();
}

// ─────────────────────────────────────────────────────────────────────────────
// PalmMenu — an arc of round icon buttons above the open palm (ONE draw call + label)
// ─────────────────────────────────────────────────────────────────────────────
export interface PalmItem {
  id: string;
  label: string;
  icon: IconId;
  /** Icon shown when toggled off (e.g. 'sound-off'). */
  iconOff?: IconId;
}
export const DEFAULT_PALM_ITEMS: PalmItem[] = [
  { id: 'palaces', label: 'Palaces', icon: 'palaces' },
  { id: 'import', label: 'Import', icon: 'import' },
  { id: 'sound', label: 'Sound', icon: 'sound', iconOff: 'sound-off' },
  { id: 'exit', label: 'Exit', icon: 'exit' },
];

const PALM_VERT = /* glsl */ `
attribute vec2 corner;   // ±1
attribute float btn;
uniform float uHover[6];
uniform float uPress[6];
uniform float uR;        // button radius (m)
varying vec2 vUv;        // button edge at |vUv| = 0.5
varying float vH;
varying float vP;
varying float vI;
void main() {
  int i = int(btn + 0.5);
  float h = uHover[i];
  float pr = uPress[i];
  vH = h;
  vP = pr;
  vI = btn;
  vec3 p = position;
  float s = 1.0 + h * 0.16 - pr * 0.1;
  p.xy += corner * uR * 1.35 * s;
  p.z += h * 0.008;
  vUv = corner * 0.675;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const PALM_FRAG = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uOpacity;
uniform float uIcon[6];
uniform float uCells;
varying vec2 vUv;
varying float vH;
varying float vP;
varying float vI;
void main() {
  float r = length(vUv) * 2.0;  // 1 at the button edge
  float aa = max(fwidth(r), 0.002) * 1.2;
  float body = smoothstep(1.0 + aa, 1.0 - aa, r);
  vec3 ink = vec3(0.17, 0.11, 0.075);
  vec3 fill = mix(ink, vec3(0.32, 0.21, 0.12), vH * 0.6 + vP * 0.5) * (1.0 + 0.2 * vUv.y);
  float a = body * 0.9;
  vec3 col = fill * a;
  vec3 gold = vec3(0.92, 0.72, 0.29);
  float ring = exp(-pow((r - 0.9) / 0.045, 2.0));
  col += gold * ring * (0.65 + vH * 0.6);
  float glow = exp(-max(r - 1.0, 0.0) * 9.0) * (1.0 - body) * (0.15 + vH * 0.9 + vP);
  col += gold * glow * 0.6;
  vec2 s = vUv + 0.5;
  float inb = step(0.0, s.x) * step(s.x, 1.0) * step(0.0, s.y) * step(s.y, 1.0);
  float icon = uIcon[int(vI + 0.5)];
  vec4 ic = texture2D(uAtlas, vec2((icon + clamp(s.x, 0.0, 1.0)) / uCells, clamp(s.y, 0.0, 1.0))) * inb * body;
  col = col * (1.0 - ic.a) + ic.rgb * (0.85 + 0.15 * vH);
  gl_FragColor = vec4(col, a) * uOpacity;
}`;

export class PalmMenu extends Panel {
  readonly items: PalmItem[];
  private mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private atlas: THREE.CanvasTexture;
  private atlasCv: HTMLCanvasElement;
  private label: CanvasPlane;
  private centers: THREE.Vector2[] = [];
  private hover: string | null = null;
  private hoverK: number[];
  private pressK: number[];
  private toggles = new Map<string, boolean>();
  private labelText = '';
  private opacity = 1;
  /** Button radius (m). */
  readonly buttonRadius = 0.019;

  constructor(items: PalmItem[] = DEFAULT_PALM_ITEMS) {
    super('palmMenu');
    this.items = items.slice(0, 6);
    const n = this.items.length;
    this.hoverK = new Array(6).fill(0);
    this.pressK = new Array(6).fill(0);
    // atlas: one cell per item icon + one per off-icon
    const cells: IconId[] = [];
    for (const it of this.items) {
      cells.push(it.icon);
      if (it.iconOff) cells.push(it.iconOff);
    }
    const C = 256;
    const { cv } = makeCanvas(C * cells.length, C);
    this.atlasCv = cv;
    this.atlas = new THREE.CanvasTexture(cv);
    this.atlas.colorSpace = THREE.NoColorSpace;
    this.atlas.premultiplyAlpha = true;
    this.atlas.anisotropy = 4;
    this.drawAtlas(cells);
    // geometry: arc of quads
    const R = 0.062;
    const pos: number[] = [];
    const cor: number[] = [];
    const btn: number[] = [];
    const idx: number[] = [];
    const span = Math.min(Math.PI * 0.75, 0.62 * (n - 1));
    for (let i = 0; i < n; i++) {
      const a = Math.PI / 2 + span / 2 - (n === 1 ? 0 : (i / (n - 1)) * span);
      const cx = Math.cos(a) * R;
      const cy = Math.sin(a) * R - R * 0.55;
      this.centers.push(new THREE.Vector2(cx, cy));
      const b = pos.length / 3;
      for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        pos.push(cx, cy, 0);
        cor.push(x, y);
        btn.push(i);
      }
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('corner', new THREE.Float32BufferAttribute(cor, 2));
    g.setAttribute('btn', new THREE.Float32BufferAttribute(btn, 1));
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0.12);
    const iconIdx = this.items.map((it) => cells.indexOf(it.icon));
    this.mat = new THREE.ShaderMaterial({
      ...LIGHT_BLEND,
      uniforms: {
        uAtlas: { value: this.atlas },
        uHover: { value: this.hoverK },
        uPress: { value: this.pressK },
        uIcon: { value: [...iconIdx, 0, 0, 0, 0, 0, 0].slice(0, 6) },
        uCells: { value: cells.length },
        uR: { value: this.buttonRadius },
        uOpacity: { value: 1 },
      },
      vertexShader: PALM_VERT,
      fragmentShader: PALM_FRAG,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.renderOrder = 33;
    this.content.add(this.mesh);
    this.label = new CanvasPlane(PX, 520, 130, 34);
    this.content.add(this.label.mesh);
    this.drawLabel('');
    this.redrawOnFonts(() => this.drawLabel(this.labelText, true));
    this.cells = cells;
  }
  private cells: IconId[];

  private drawAtlas(cells: IconId[]) {
    const ctx = this.atlasCv.getContext('2d')!;
    const C = 256;
    ctx.clearRect(0, 0, this.atlasCv.width, C);
    cells.forEach((id, i) => {
      ctx.save();
      ctx.shadowColor = 'rgba(255,200,90,0.55)';
      ctx.shadowBlur = 10;
      drawIcon(ctx, id, i * C + C / 2, C / 2, 120, '#ffe3a0');
      ctx.restore();
    });
    this.atlas.needsUpdate = true;
  }

  private drawLabel(text: string, force = false) {
    if (text === this.labelText && !force) return;
    this.labelText = text;
    const ctx = this.label.size(520, 130);
    if (text) {
      ctx.font = font(700, 58);
      const tw = ctx.measureText(text).width;
      const w = tw + 70;
      shadowed(ctx, 18, 5, () => {
        rrect(ctx, 260 - w / 2, 22, w, 86, 43);
        ctx.fillStyle = STYLE.parchmentLight;
        ctx.fill();
      });
      ctx.fillStyle = STYLE.ink;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 260, 67);
    }
    this.label.commit();
  }

  /** Highlight one button (id) or none. */
  setHover(id: string | null) {
    this.hover = id;
    const it = this.items.find((i) => i.id === id);
    this.drawLabel(it ? it.label : '');
  }
  /** Visual press feedback. */
  press(id: string) {
    const i = this.items.findIndex((it) => it.id === id);
    if (i >= 0) this.pressK[i] = 1;
  }
  /** Toggle a two-state item (e.g. sound on/off). */
  setToggle(id: string, on: boolean) {
    this.toggles.set(id, on);
    const i = this.items.findIndex((it) => it.id === id);
    if (i < 0) return;
    const it = this.items[i];
    const icon = !on && it.iconOff ? it.iconOff : it.icon;
    (this.mat.uniforms.uIcon.value as number[])[i] = this.cells.indexOf(icon);
  }
  getToggle(id: string) {
    return this.toggles.get(id) ?? true;
  }
  /** Which button (id) contains the world point (fingertip / pinch point)? */
  hitTest(p: THREE.Vector3, tolerance = 0.008): string | null {
    if (!this.root.visible) return null;
    _v.copy(p);
    this.content.worldToLocal(_v);
    if (Math.abs(_v.z) > 0.04) return null;
    let best: string | null = null;
    let bd = Infinity;
    this.centers.forEach((c, i) => {
      const d = Math.hypot(_v.x - c.x, _v.y - c.y);
      if (d < this.buttonRadius + tolerance && d < bd) {
        bd = d;
        best = this.items[i].id;
      }
    });
    return best;
  }
  /** Local centre of a button (for placing fingertip hints). */
  buttonCenter(id: string, out: THREE.Vector3) {
    const i = this.items.findIndex((it) => it.id === id);
    const c = this.centers[Math.max(0, i)];
    return this.content.localToWorld(out.set(c.x, c.y, 0));
  }
  protected setOpacity(o: number) {
    this.opacity = o;
    this.mat.uniforms.uOpacity.value = o;
    this.label.opacity = o;
  }
  protected tick(dt: number) {
    let hi = -1;
    for (let i = 0; i < this.items.length; i++) {
      const on = this.items[i].id === this.hover;
      if (on) hi = i;
      this.hoverK[i] = damp(this.hoverK[i], on ? 1 : 0, 14, dt);
      this.pressK[i] = Math.max(0, this.pressK[i] - dt * 4);
    }
    if (hi >= 0) {
      const c = this.centers[hi];
      this.label.mesh.position.set(c.x, c.y + this.buttonRadius * 1.9, 0.012);
    }
    this.label.opacity = this.opacity * (hi >= 0 ? 1 : 0);
  }
  override dispose() {
    this.atlas.dispose();
    super.dispose();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PalaceShelf — pick a palace from leather book spines
// ─────────────────────────────────────────────────────────────────────────────
export interface ShelfBook {
  id: string;
  title: string;
  subject: string;
  solid: number;
  total: number;
  /** Days until the exam (null/undefined = no exam set). */
  examInDays?: number | null;
}
const LEATHER = ['#7c2630', '#24395e', '#2f5a3a', '#5a3163', '#6b4323'];
const BOOK_W = 0.066;
const BOOK_H = 0.2;

export class PalaceShelf extends Panel {
  private books: ShelfBook[] = [];
  private spines: { plane: CanvasPlane; id: string; hover: number; sel: number; x: number }[] = [];
  private plank: CanvasPlane;
  private glow: THREE.Mesh;
  private glowMat: THREE.ShaderMaterial;
  private hover: string | null = null;
  private selected: string | null = null;
  private opacity = 1;
  constructor(books: ShelfBook[] = []) {
    super('palaceShelf');
    this.plank = new CanvasPlane(PX, 400, 80, 30);
    this.content.add(this.plank.mesh);
    this.glowMat = glowMaterial('#ffc45a', 0);
    this.glow = new THREE.Mesh(unitPlane(), this.glowMat);
    this.glow.renderOrder = 29;
    this.content.add(this.glow);
    this.setBooks(books);
    this.redrawOnFonts(() => this.setBooks(this.books));
  }
  setBooks(books: ShelfBook[]) {
    this.books = books.slice(0, 5);
    for (const s of this.spines) s.plane.dispose();
    this.spines = [];
    const n = this.books.length;
    const gap = 0.008;
    const total = n * BOOK_W + (n - 1) * gap;
    this.books.forEach((b, i) => {
      const plane = new CanvasPlane(PX, 64, 64, 31);
      this.drawSpine(plane, b, i);
      const x = -total / 2 + BOOK_W / 2 + i * (BOOK_W + gap);
      plane.mesh.position.set(x, BOOK_H / 2, 0);
      this.content.add(plane.mesh);
      this.spines.push({ plane, id: b.id, hover: 0, sel: 0, x });
    });
    // plank
    const pw = Math.round((total + 0.05) * PX);
    const ctx = this.plank.size(pw, 150);
    shadowed(ctx, 20, 8, () => {
      rrect(ctx, 20, 30, pw - 40, 70, 12);
      const g = ctx.createLinearGradient(0, 30, 0, 100);
      g.addColorStop(0, '#b98352');
      g.addColorStop(0.35, '#8a5a36');
      g.addColorStop(1, '#5e3b22');
      ctx.fillStyle = g;
      ctx.fill();
    });
    ctx.strokeStyle = 'rgba(255,220,160,0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(34, 34);
    ctx.lineTo(pw - 34, 34);
    ctx.stroke();
    this.plank.commit();
    this.plank.mesh.position.set(0, -0.0115, 0.003);
    this.setOpacity(this.opacity);
  }
  private drawSpine(plane: CanvasPlane, b: ShelfBook, i: number) {
    const w = Math.round(BOOK_W * PX) + 2 * 30;
    const h = Math.round(BOOK_H * PX) + 2 * 30;
    const ctx = plane.size(w, h);
    const x = 30;
    const y = 30;
    const bw = w - 60;
    const bh = h - 60;
    const col = LEATHER[i % LEATHER.length];
    shadowed(ctx, 26, 10, () => {
      rrect(ctx, x, y, bw, bh, 18);
      ctx.fillStyle = col;
      ctx.fill();
    });
    // rounded-spine shading
    rrect(ctx, x, y, bw, bh, 18);
    const g = ctx.createLinearGradient(x, 0, x + bw, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.35)');
    g.addColorStop(0.18, 'rgba(255,255,255,0.10)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.03)');
    g.addColorStop(0.85, 'rgba(0,0,0,0.12)');
    g.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = g;
    ctx.fill();
    // gold bands
    ctx.strokeStyle = STYLE.gold;
    for (const by of [y + 50, y + 64, y + bh - 64, y + bh - 50]) {
      ctx.lineWidth = by === y + 50 || by === y + bh - 50 ? 6 : 3;
      ctx.beginPath();
      ctx.moveTo(x + 8, by);
      ctx.lineTo(x + bw - 8, by);
      ctx.stroke();
    }
    const cx = x + bw / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // subject
    ctx.font = font(700, 30);
    ctx.fillStyle = STYLE.goldLight;
    const subj = fitText(ctx, b.subject.toUpperCase(), bw - 30, 1, [30, 26, 22], 700);
    ctx.font = font(700, subj.px);
    ctx.fillText(subj.lines[0], cx, y + 112);
    ornamentRule(ctx, cx, y + 150, bw / 2 - 20, 10, STYLE.gold);
    // title
    const tf = fitText(ctx, b.title, bw - 34, 4, [58, 52, 46, 40], 700);
    ctx.font = font(700, tf.px);
    ctx.fillStyle = '#fbefd6';
    const tlh = tf.px * 1.12;
    const ty = y + 200;
    tf.lines.forEach((l, k) => ctx.fillText(l, cx, ty + tlh * (k + 0.5)));
    // progress
    const py = y + bh - 300;
    const barW = bw - 50;
    rrect(ctx, cx - barW / 2, py, barW, 22, 11);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();
    const frac = b.total > 0 ? clamp01(b.solid / b.total) : 0;
    if (frac > 0) {
      rrect(ctx, cx - barW / 2, py, Math.max(22, barW * frac), 22, 11);
      const pg = ctx.createLinearGradient(0, py, 0, py + 22);
      pg.addColorStop(0, '#ffe08a');
      pg.addColorStop(1, '#c9973d');
      ctx.fillStyle = pg;
      ctx.fill();
    }
    ctx.font = font(700, 40);
    ctx.fillStyle = '#fbefd6';
    ctx.fillText(`${b.solid}/${b.total}`, cx, py + 66);
    ctx.font = font(600, 28, true);
    ctx.fillStyle = 'rgba(251,239,214,0.8)';
    ctx.fillText('solid', cx, py + 104);
    // exam countdown
    if (b.examInDays !== undefined && b.examInDays !== null) {
      const d = Math.max(0, Math.round(b.examInDays));
      const txt = d === 0 ? 'exam today' : d === 1 ? 'exam tomorrow' : `exam in ${d} days`;
      const f = fitText(ctx, txt, bw - 24, 2, [30, 27, 24], 700);
      ctx.font = font(700, f.px);
      ctx.fillStyle = d <= 3 ? '#ffb27a' : STYLE.goldLight;
      f.lines.forEach((l, k) => ctx.fillText(l, cx, y + bh - 116 + (k - (f.lines.length - 1) / 2) * f.px * 1.1));
    }
    plane.commit();
  }
  setHover(id: string | null) {
    this.hover = id;
  }
  /** Pull a book out (selection feedback). */
  select(id: string | null) {
    this.selected = id;
  }
  /** Which book (id) contains the world point? */
  hitTest(p: THREE.Vector3, tolerance = 0.006): string | null {
    if (!this.root.visible) return null;
    _v.copy(p);
    this.content.worldToLocal(_v);
    if (Math.abs(_v.z) > 0.05) return null;
    for (const s of this.spines) {
      const y0 = s.plane.mesh.position.y - BOOK_H / 2;
      if (Math.abs(_v.x - s.x) <= BOOK_W / 2 + tolerance && _v.y >= y0 - tolerance && _v.y <= y0 + BOOK_H + tolerance) return s.id;
    }
    return null;
  }
  protected setOpacity(o: number) {
    this.opacity = o;
    this.plank.opacity = o;
    for (const s of this.spines) s.plane.opacity = o;
    this.glowMat.uniforms.uOpacity.value = 0;
  }
  protected tick(dt: number, t: number) {
    let gx = 0;
    let gk = 0;
    for (const s of this.spines) {
      s.hover = damp(s.hover, s.id === this.hover ? 1 : 0, 12, dt);
      s.sel = damp(s.sel, s.id === this.selected ? 1 : 0, 8, dt);
      const lift = s.hover * 0.014 + s.sel * 0.03;
      s.plane.mesh.position.set(s.x, BOOK_H / 2 + lift, s.hover * 0.012 + s.sel * 0.02);
      s.plane.mesh.rotation.z = Math.sin(t * 2) * 0.01 * s.hover;
      const sc = 1 + s.hover * 0.04;
      s.plane.mesh.scale.set((BOOK_W * PX + 60) / PX * sc, (BOOK_H * PX + 60) / PX * sc, 1);
      if (s.hover + s.sel > gk) {
        gk = Math.min(1, s.hover + s.sel);
        gx = s.x;
      }
    }
    this.glow.position.set(gx, BOOK_H / 2 + 0.01, -0.004);
    this.glow.scale.set(0.2, 0.3, 1);
    this.glowMat.uniforms.uOpacity.value = gk * 0.9 * this.opacity;
    this.glow.visible = gk > 0.01;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Toast / SummaryLine — one-line pills
// ─────────────────────────────────────────────────────────────────────────────
/** Draw `*gold*` rich text centred at (cx, cy). */
function richLine(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, px: number, base: string, gold: string, measureOnly = false) {
  const segs = text.split('*').map((s, i) => ({ s, g: i % 2 === 1 }));
  const fN = font(600, px);
  const fG = font(800, px);
  let total = 0;
  for (const sg of segs) {
    ctx.font = sg.g ? fG : fN;
    total += ctx.measureText(sg.s).width;
  }
  if (measureOnly) return total;
  let x = cx - total / 2;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (const sg of segs) {
    ctx.font = sg.g ? fG : fN;
    ctx.fillStyle = sg.g ? gold : base;
    ctx.fillText(sg.s, x, cy);
    x += ctx.measureText(sg.s).width;
  }
  return total;
}

export class Toast extends CardPanel {
  protected text = '';
  private left = 0;
  protected dark = true;
  constructor(text = '') {
    super('toast');
    this.text = text;
    this.draw();
    this.redrawOnFonts(() => this.draw());
  }
  /** Show `text` (supports *gold* segments) for `seconds`, then fade out. */
  show(text: string, seconds = 2.8) {
    this.text = text;
    this.left = seconds;
    this.draw();
    this.setVisible(true, true);
  }
  protected override tick(dt: number) {
    if (this.left > 0) {
      this.left -= dt;
      if (this.left <= 0) this.setVisible(false, true);
    }
  }
  protected draw() {
    const px = 64;
    const { ctx: m } = measureCtx();
    const tw = richLine(m, this.text || ' ', 0, 0, px, '', '', true);
    const icon = 80;
    const W = Math.ceil(tw + 2 * 60 + icon + 2 * M);
    const H = 130 + 2 * M;
    const ctx = this.plane.size(W, H);
    shadowed(ctx, 30, 10, () => {
      rrect(ctx, M, M, W - 2 * M, H - 2 * M, (H - 2 * M) / 2);
      ctx.fillStyle = this.dark ? 'rgba(40,26,17,0.94)' : STYLE.parchment;
      ctx.fill();
    });
    rrect(ctx, M, M, W - 2 * M, H - 2 * M, (H - 2 * M) / 2);
    if (!this.dark) parchment(ctx, M, M, W - 2 * M, H - 2 * M, 5);
    rrect(ctx, M + 8, M + 8, W - 2 * M - 16, H - 2 * M - 16, (H - 2 * M - 16) / 2);
    ctx.strokeStyle = this.dark ? 'rgba(233,185,73,0.7)' : 'rgba(168,118,31,0.7)';
    ctx.lineWidth = 3;
    ctx.stroke();
    // little flame-ember dot
    const ix = M + 60 + 18;
    const cy = H / 2;
    const g = ctx.createRadialGradient(ix, cy, 2, ix, cy, 30);
    g.addColorStop(0, '#fff3cf');
    g.addColorStop(0.35, '#ffb347');
    g.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(ix, cy, 30, 0, Math.PI * 2);
    ctx.fill();
    richLine(ctx, this.text, M + 60 + icon + tw / 2, cy + 2, px, this.dark ? '#f6e7c8' : STYLE.ink, this.dark ? '#ffd36a' : '#8f5f0e');
    this.plane.commit();
  }
}

/** End-of-session one-liner on parchment, e.g. "*7* reviewed · *5* solid". */
export class SummaryLine extends Toast {
  constructor(text = '') {
    super(text);
    this.root.name = 'summaryLine';
    this.dark = false;
    this.draw();
  }
  setLine(text: string) {
    this.text = text;
    this.draw();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HandHint — ghost hand animating pinch / palm-up / fist (pre-rendered sprite sheet)
// ─────────────────────────────────────────────────────────────────────────────
export type HandGesture = 'pinch' | 'palm-up' | 'fist';
const HF = 12; // frames
const HC = 256; // cell px
const HCOLS = 4;

type Chain = { x: number; y: number; a: number; len: number[]; bend: number[]; w: number };

function chainPts(c: Chain, flex = 0): [number, number][] {
  // a: base angle (radians, 0 = up, + = clockwise); bend: per-joint bends; flex: foreshortening factor
  const pts: [number, number][] = [[c.x, c.y]];
  let x = c.x;
  let y = c.y;
  let a = c.a;
  let cum = 0;
  c.len.forEach((l, i) => {
    if (i > 0) a += c.bend[i - 1] ?? 0;
    cum += flex ? (c.bend[i - 1] ?? 0) : 0;
    const f = flex ? Math.cos(Math.min(Math.PI, Math.abs(cum) + flex)) : 1;
    x += Math.sin(a) * l * f;
    y -= Math.cos(a) * l * f;
    pts.push([x, y]);
  });
  return pts;
}

function lerpN(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/** Hand pose silhouette parts in hand units (≈ 1 = hand length), y down. */
function handParts(g: HandGesture, p: number) {
  const chains: { pts: [number, number][]; w: number }[] = [];
  const blobs: { x: number; y: number; rx: number; ry: number; rot: number }[] = [];
  const dots: { x: number; y: number; r: number }[] = [];
  let flipX = 1;
  let palmSide = false;
  if (g === 'pinch') {
    // side view, hand pointing right: index + thumb close from a "C" into a pinch
    chains.push({ pts: [[-0.42, 0.22], [-0.26, 0.1]], w: 0.25 }); // wrist
    blobs.push({ x: -0.1, y: 0.03, rx: 0.235, ry: 0.19, rot: -0.22 });
    // relaxed middle/ring/pinky, curled under the palm
    for (let k = 0; k < 3; k++) {
      const c: Chain = { x: 0.05 - k * 0.04, y: 0.0 + k * 0.065, a: 1.95 + k * 0.08, len: [0.11, 0.07], bend: [1.5 + p * 0.1], w: 0.1 - k * 0.008 };
      chains.push({ pts: chainPts(c), w: c.w });
    }
    const idx: Chain = { x: 0.08, y: -0.08, a: lerpN(1.32, 1.7, p), len: [0.17, 0.1, 0.08], bend: [lerpN(0.38, 0.8, p), lerpN(0.34, 0.72, p)], w: 0.1 };
    const th: Chain = { x: -0.05, y: 0.1, a: lerpN(2.02, 1.7, p), len: [0.165, 0.135], bend: [lerpN(-0.2, -0.3, p)], w: 0.112 };
    const ip = chainPts(idx);
    const tp = chainPts(th);
    chains.push({ pts: ip, w: idx.w }, { pts: tp, w: th.w });
    if (p > 0.8) {
      const a = ip[ip.length - 1];
      const b = tp[tp.length - 1];
      dots.push({ x: (a[0] + b[0]) / 2 + 0.02, y: (a[1] + b[1]) / 2, r: (0.07 * (p - 0.8)) / 0.2 });
    }
  } else {
    // back of a right hand as the learner sees it (fingers up, thumb on the left)
    let curl = 0;
    let spread = 0.09;
    if (g === 'palm-up') {
      flipX = Math.cos(Math.PI * p);
      palmSide = flipX < 0;
      spread = 0.12;
    } else curl = p;
    blobs.push({ x: 0, y: 0.1, rx: 0.205, ry: 0.215, rot: 0 });
    chains.push({ pts: [[0, 0.3], [0, 0.5]], w: 0.25 });
    const fingers: [number, number, number, number][] = [
      // x, y, length, angle
      [-0.135, -0.07, 0.34, -spread],
      [-0.045, -0.105, 0.37, -spread * 0.3],
      [0.048, -0.095, 0.35, spread * 0.35],
      [0.138, -0.045, 0.28, spread * 1.1],
    ];
    for (const [fx, fy, L, fa] of fingers) {
      // curl folds the finger away from the viewer: segments foreshorten, then tuck behind
      const segs = [L * 0.46, L * 0.3, L * 0.24];
      const pts: [number, number][] = [[fx, fy]];
      let x = fx;
      let y = fy;
      let cum = curl * 1.45;
      segs.forEach((l, i) => {
        if (i > 0) cum += curl * 1.4;
        const f = Math.cos(Math.min(Math.PI, cum));
        x += Math.sin(fa) * l * f;
        y -= Math.cos(fa) * l * f;
        pts.push([x, y]);
      });
      chains.push({ pts, w: 0.094 - (fx > 0.1 ? 0.01 : 0) });
    }
    // thumb: relaxed out to the left, wraps across the knuckles in a fist
    const tc: Chain = { x: -0.17, y: 0.2, a: lerpN(-0.62, 1.25, curl), len: [lerpN(0.14, 0.12, curl), lerpN(0.12, 0.13, curl)], bend: [lerpN(0.28, 0.25, curl)], w: 0.1 };
    chains.push({ pts: chainPts(tc), w: tc.w });
    if (palmSide) dots.push({ x: 0, y: 0.12, r: 0.06 * Math.min(1, -flipX * 1.4) });
  }
  return { chains, blobs, dots, flipX, palmSide };
}

function drawHandFrame(ctx: CanvasRenderingContext2D, g: HandGesture, p: number, ox: number, oy: number) {
  const S = HC * (g === 'pinch' ? 0.72 : 0.78);
  const { chains, blobs, dots, flipX, palmSide } = handParts(g, p);
  const tmp = makeCanvas(HC, HC);
  ctx.save();
  ctx.beginPath();
  ctx.rect(ox, oy, HC, HC);
  ctx.clip();
  const sil = (c: CanvasRenderingContext2D, shrink: number) => {
    c.save();
    c.translate(HC / 2 + (g === 'pinch' ? HC * 0.02 : 0), HC * (g === 'pinch' ? 0.52 : 0.46));
    c.scale(S * (Math.abs(flipX) < 0.06 ? 0.06 * Math.sign(flipX || 1) : flipX), S);
    c.fillStyle = '#fff';
    c.strokeStyle = '#fff';
    c.lineCap = 'round';
    c.lineJoin = 'round';
    for (const b of blobs) {
      c.beginPath();
      c.ellipse(b.x, b.y, Math.max(0.001, b.rx - shrink), Math.max(0.001, b.ry - shrink), b.rot, 0, Math.PI * 2);
      c.fill();
    }
    for (const ch of chains) {
      c.lineWidth = Math.max(0.001, ch.w - shrink * 2);
      c.beginPath();
      c.moveTo(ch.pts[0][0], ch.pts[0][1]);
      for (let i = 1; i < ch.pts.length; i++) c.lineTo(ch.pts[i][0], ch.pts[i][1]);
      c.stroke();
    }
    c.restore();
  };
  const t = tmp.ctx;
  sil(t, 0);
  // interior (translucent)
  const inner = makeCanvas(HC, HC);
  sil(inner.ctx, 0.022);
  t.globalCompositeOperation = 'destination-out';
  t.drawImage(inner.cv, 0, 0);
  t.globalCompositeOperation = 'source-in';
  t.fillStyle = '#ffe9b8';
  t.fillRect(0, 0, HC, HC);
  inner.ctx.globalCompositeOperation = 'source-in';
  inner.ctx.fillStyle = 'rgba(255,226,160,0.2)';
  inner.ctx.fillRect(0, 0, HC, HC);
  ctx.drawImage(inner.cv, ox, oy);
  ctx.save();
  ctx.shadowColor = 'rgba(255,190,80,0.9)';
  ctx.shadowBlur = 14;
  ctx.drawImage(tmp.cv, ox, oy);
  ctx.drawImage(tmp.cv, ox, oy);
  ctx.restore();
  // palm lines when the palm faces us
  if (palmSide) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, -flipX * 1.5) * 0.6;
    ctx.strokeStyle = '#ffe9b8';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    const cx = ox + HC / 2;
    const cy = oy + HC * 0.46;
    const sx = S * -flipX;
    ctx.beginPath();
    ctx.moveTo(cx - 0.14 * sx, cy + 0.02 * S);
    ctx.quadraticCurveTo(cx, cy + 0.08 * S, cx + 0.15 * sx, cy - 0.01 * S);
    ctx.moveTo(cx - 0.1 * sx, cy + 0.13 * S);
    ctx.quadraticCurveTo(cx - 0.02 * sx, cy + 0.2 * S, cx + 0.08 * sx, cy + 0.25 * S);
    ctx.stroke();
    ctx.restore();
  }
  for (const d of dots) {
    if (d.r <= 0) continue;
    const cx = ox + HC / 2 + (g === 'pinch' ? HC * 0.02 : 0) + d.x * S * flipX;
    const cy = oy + HC * (g === 'pinch' ? 0.52 : 0.46) + d.y * S;
    const r = d.r * S;
    const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.2);
    gr.addColorStop(0, 'rgba(255,250,230,1)');
    gr.addColorStop(0.3, 'rgba(255,200,90,0.9)');
    gr.addColorStop(1, 'rgba(255,150,40,0)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

const HAND_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uOpacity;
uniform vec2 uA;   // atlas cell of frame A (col,row)
uniform vec2 uB;
uniform float uMix;
uniform vec2 uGrid;
varying vec2 vUv;
void main() {
  vec2 lc = clamp(vec2(vUv.x, 1.0 - vUv.y), 0.012, 0.988);  // no bleeding between atlas cells
  vec2 ca = (uA + lc) / uGrid;
  vec2 cb = (uB + lc) / uGrid;
  ca.y = 1.0 - ca.y; cb.y = 1.0 - cb.y;
  vec4 c = mix(texture2D(uMap, ca), texture2D(uMap, cb), uMix);
  gl_FragColor = vec4(c.rgb, c.a * 0.6) * uOpacity;
}`;

export class HandHint extends Panel {
  private gesture: HandGesture;
  private cv: HTMLCanvasElement;
  private tex: THREE.CanvasTexture;
  private mat: THREE.ShaderMaterial;
  private mesh: THREE.Mesh;
  private time = 0;
  /** Seconds per full gesture loop. */
  period = 1.8;
  constructor(gesture: HandGesture = 'pinch', size = 0.12) {
    super('handHint');
    this.gesture = gesture;
    const rows = Math.ceil(HF / HCOLS);
    this.cv = makeCanvas(HC * HCOLS, HC * rows).cv;
    this.tex = new THREE.CanvasTexture(this.cv);
    this.tex.colorSpace = THREE.NoColorSpace;
    this.tex.premultiplyAlpha = true;
    this.tex.generateMipmaps = false;
    this.tex.minFilter = THREE.LinearFilter;
    this.mat = new THREE.ShaderMaterial({
      ...LIGHT_BLEND,
      uniforms: { uMap: { value: this.tex }, uOpacity: { value: 1 }, uA: { value: new THREE.Vector2() }, uB: { value: new THREE.Vector2() }, uMix: { value: 0 }, uGrid: { value: new THREE.Vector2(HCOLS, rows) } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: HAND_FRAG,
    });
    this.mesh = new THREE.Mesh(unitPlane(), this.mat);
    this.mesh.scale.set(size, size, 1);
    this.mesh.renderOrder = 35;
    this.content.add(this.mesh);
    this.render();
  }
  setGesture(g: HandGesture) {
    if (g === this.gesture) return;
    this.gesture = g;
    this.time = 0;
    this.render();
  }
  /** Mirror for the left hand. */
  setHand(side: 'left' | 'right') {
    this.mesh.scale.x = Math.abs(this.mesh.scale.x) * (side === 'left' ? -1 : 1);
  }
  private render() {
    const ctx = this.cv.getContext('2d')!;
    ctx.clearRect(0, 0, this.cv.width, this.cv.height);
    this.period = this.gesture === 'palm-up' ? 2.4 : this.gesture === 'fist' ? 2.2 : 1.7;
    for (let f = 0; f < HF; f++) drawHandFrame(ctx, this.gesture, f / (HF - 1), (f % HCOLS) * HC, Math.floor(f / HCOLS) * HC);
    this.tex.needsUpdate = true;
  }
  protected setOpacity(o: number) {
    this.mat.uniforms.uOpacity.value = o;
  }
  protected tick(dt: number) {
    this.time += dt;
    const u = (this.time / this.period) % 1;
    // rise, hold, fall, rest
    let p: number;
    if (u < 0.3) p = easeOutCubic(u / 0.3);
    else if (u < 0.62) p = 1;
    else if (u < 0.86) p = 1 - easeOutCubic((u - 0.62) / 0.24);
    else p = 0;
    const fi = p * (HF - 1);
    const a = Math.floor(fi);
    const b = Math.min(HF - 1, a + 1);
    (this.mat.uniforms.uA.value as THREE.Vector2).set(a % HCOLS, Math.floor(a / HCOLS));
    (this.mat.uniforms.uB.value as THREE.Vector2).set(b % HCOLS, Math.floor(b / HCOLS));
    this.mat.uniforms.uMix.value = fi - a;
    this.mesh.position.y = Math.sin(this.time * 1.6) * 0.002;
  }
  override dispose() {
    this.tex.dispose();
    super.dispose();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reticle — gaze / ray target: dot + ring that fills during dwell
// ─────────────────────────────────────────────────────────────────────────────
const RET_FRAG = /* glsl */ `
uniform float uProgress;
uniform float uActive;
uniform float uOpacity;
uniform float uTime;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float aa = max(fwidth(r), 0.004) * 1.2;
  // dot with a dark rim (reads on bright and dark passthrough)
  float dotR = mix(0.2, 0.15, uActive);
  float dotM = smoothstep(dotR + aa, dotR - aa, r);
  float rim = smoothstep(dotR + 0.09 + aa, dotR + 0.09 - aa, r) * (1.0 - dotM);
  // ring
  float rr = mix(0.52, 0.72, uActive);
  float ringW = 0.075;
  float ring = smoothstep(ringW + aa, ringW - aa, abs(r - rr));
  float ang = atan(p.x, p.y);             // 0 at top, clockwise
  float frac = (ang < 0.0 ? ang + 6.2831853 : ang) / 6.2831853;
  float filled = step(frac, uProgress) * ring;
  float track = ring * (1.0 - step(frac, uProgress));
  vec3 gold = vec3(1.0, 0.8, 0.36);
  vec3 cream = vec3(1.0, 0.97, 0.9);
  vec3 col = cream * dotM + gold * filled + cream * track * 0.35;
  float a = dotM + rim * 0.55 + filled * 0.9 + track * 0.25 * uActive;
  float glow = exp(-abs(r - rr) * 14.0) * filled * 0.4;
  col += gold * glow;
  a *= mix(0.85, 1.0, uActive);
  col = mix(col, vec3(0.12, 0.07, 0.04) * a, rim * (1.0 - filled) * 0.8);
  gl_FragColor = vec4(col, a) * uOpacity;
}`;

export class Reticle extends Panel {
  private mat: THREE.ShaderMaterial;
  private mesh: THREE.Mesh;
  private progress = 0;
  private active = 0;
  private activeT = 0;
  /** Keep a constant angular size (scales with distance to the viewer). */
  constantSize = true;
  constructor(size = 0.022) {
    super('reticle');
    this.mat = new THREE.ShaderMaterial({
      ...LIGHT_BLEND,
      depthTest: false,
      uniforms: { uProgress: { value: 0 }, uActive: { value: 0 }, uOpacity: { value: 1 }, uTime: { value: 0 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: RET_FRAG,
    });
    this.mesh = new THREE.Mesh(unitPlane(), this.mat);
    this.mesh.scale.set(size, size, 1);
    this.mesh.renderOrder = 60;
    this.content.add(this.mesh);
  }
  /** Dwell progress 0–1 (ring fills clockwise from the top). */
  setProgress(p: number) {
    this.progress = clamp01(p);
  }
  /** Hovering something selectable (ring grows in). */
  setActive(a: boolean) {
    this.activeT = a ? 1 : 0;
  }
  protected setOpacity(o: number) {
    this.mat.uniforms.uOpacity.value = o;
  }
  protected tick(dt: number, t: number) {
    this.active = damp(this.active, this.activeT, 12, dt);
    this.mat.uniforms.uActive.value = this.active;
    this.mat.uniforms.uProgress.value = this.progress;
    this.mat.uniforms.uTime.value = t % 1000;
    if (this.constantSize && viewerPosition(_w)) {
      this.pivot.getWorldPosition(_v);
      const d = _v.distanceTo(_w);
      this.pivot.scale.setScalar(THREE.MathUtils.clamp(d / 0.6, 0.4, 4));
    }
  }
}
