/**
 * Halo — a soft golden light hugging a real piece of furniture.
 *
 * `root` is placed by the app at the furniture box centre with the box yaw; `size` is the
 * box (x = width, y = height, z = depth, metres). Works from a 0.2 m lamp to a 2 m bed.
 *
 * Everything is ONE mesh / ONE draw call (kind attribute selects the part in the shader):
 *   0  luminous rounded outline on the top face (+ faint sheen, scan ripple)
 *   1  vertical gradient curtain rising from the footprint
 *   2  short light "crown" rising from the top outline
 *   3  ember mote (billboard, lights-out marker)
 *   4  a dozen rising dust motes (billboards, GPU animated)
 * Premultiplied light blending, alpha 0 → pure additive over passthrough.
 */
import * as THREE from 'three';
import { LIGHT_BLEND, GLSL_NOISE, damp } from './common';

export type HaloState = 'off' | 'scan' | 'glow' | 'due' | 'active' | 'ember';

export interface Halo {
  root: THREE.Object3D;
  setState(s: HaloState): void;
  readonly state: HaloState;
  /** Accent colour (default warm gold). */
  setColor(c: THREE.ColorRepresentation): void;
  update(dt: number, t: number): void;
  dispose(): void;
}

const VERT = /* glsl */ `
attribute vec4 aData;  // x kind, y v (height 0..1), zw billboard corner
attribute vec2 aSeed;  // curtains: x arc length (m); motes: seeds
uniform float uTime;
uniform float uTopY;
uniform vec2 uHalf;
uniform float uEmberSize;
varying vec3 vL;
varying vec4 vD;
varying vec2 vS;
void main() {
  vec3 p = position;
  vD = aData;
  vS = aSeed;
  vL = p;
  vec4 mv;
  float kind = aData.x;
  if (kind > 2.5) {
    vec3 c = p;
    float sz = uEmberSize;
    if (kind > 3.5) {
      float ph = aSeed.x;
      float y01 = fract(aSeed.y + uTime * (0.05 + 0.05 * ph));
      c = vec3((ph * 2.0 - 1.0) * uHalf.x * 0.8, uTopY + 0.01 + y01 * 0.2, (fract(ph * 7.13) * 2.0 - 1.0) * uHalf.y * 0.8);
      c.x += sin(uTime * 0.8 + ph * 20.0) * 0.012;
      c.z += cos(uTime * 0.6 + ph * 13.0) * 0.012;
      sz = 0.0035 * (0.6 + fract(ph * 3.7));
      vD.y = y01;
    } else {
      c.y += sin(uTime * 1.3) * 0.004;
    }
    mv = modelViewMatrix * vec4(c, 1.0);
    mv.xy += aData.zw * sz;
  } else {
    mv = modelViewMatrix * vec4(p, 1.0);
  }
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
precision highp float;
uniform float uTime;
uniform vec2 uHalf;
uniform float uRR;
uniform vec3 uColor;
uniform float uGlow;
uniform float uCurtain;
uniform float uAura;
uniform float uEmber;
uniform float uMotes;
uniform float uScan;
uniform float uSheen;
varying vec3 vL;
varying vec4 vD;
varying vec2 vS;
${GLSL_NOISE}
float sdRR(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main() {
  float kind = vD.x;
  vec3 cream = vec3(1.0, 0.96, 0.84);
  vec3 col = uColor;
  float a = 0.0;
  float reveal = smoothstep(0.85, 1.05, uScan);
  if (kind < 0.5) {
    float sd = sdRR(vL.xz, uHalf, uRR);
    float lw = 0.0045;
    float line = exp(-(sd * sd) / (lw * lw));
    float glow = exp(-abs(sd) / 0.02) * 0.45 + exp(-abs(sd) / 0.06) * 0.14;
    glow *= smoothstep(0.1, 0.06, sd);   // fade out before the quad border
    float inside = smoothstep(0.004, -0.004, sd);
    float sheen = inside * (0.05 + 0.04 * fxNoise(vL.xz * 6.0 + uTime * 0.15)) * uSheen;
    // scan ripple: 0 at centre → 1 at the edge
    float m = min(uHalf.x, uHalf.y);
    float u = clamp(1.0 + sd / m, 0.0, 1.2);
    float front = uScan * 1.15;
    float band = exp(-pow((u - front) / 0.07, 2.0)) * step(uScan, 1.0) * inside;
    float filled = smoothstep(front + 0.02, front - 0.08, u) * inside * step(uScan, 1.0) * 0.12;
    a = (line + glow) * uGlow * reveal + sheen * uGlow + (band * 0.9 + filled) * uGlow;
    col = mix(uColor, cream, line * 0.55 + band * 0.4);
  } else if (kind < 1.5) {
    float v = vD.y;
    float streak = 0.62 + 0.38 * fxNoise(vec2(vS.x * 14.0, v * 1.5 - uTime * 0.35));
    float rv = smoothstep(uScan * 1.3 + 0.05, uScan * 1.3 - 0.15, v);
    float base = exp(-v * 60.0) * 0.5;     // bright contact line on the floor
    a = (pow(1.0 - v, 3.2) * 0.2 * streak + base) * uCurtain * uGlow * rv;
  } else if (kind < 2.5) {
    float v = vD.y;
    float streak = 0.55 + 0.45 * fxNoise(vec2(vS.x * 22.0, v * 2.0 - uTime * 0.6));
    float streak2 = 0.35 + 0.65 * smoothstep(0.35, 0.8, fxNoise(vec2(vS.x * 9.0, v * 1.2 - uTime * 0.45)));
    a = pow(1.0 - v, 1.4) * 0.75 * uAura * uGlow * mix(streak, streak2, 0.6) * reveal;
    col = mix(uColor, cream, 0.3 * (1.0 - v));
  } else if (kind < 3.5) {
    float r = length(vD.zw);
    float core = exp(-r * r * 28.0);
    float halo = exp(-r * r * 9.0) * 0.45 + exp(-r * 3.5) * 0.25;
    a = (core * 1.4 + halo) * smoothstep(1.0, 0.7, r) * uEmber * (0.8 + 0.2 * sin(uTime * 2.1));
    col = mix(vec3(1.0, 0.62, 0.25), cream, core);
  } else {
    float r = length(vD.zw);
    float y01 = vD.y;
    a = (exp(-r * r * 14.0) + exp(-r * 4.0) * 0.3) * smoothstep(1.0, 0.6, r) * smoothstep(0.0, 0.15, y01) * smoothstep(1.0, 0.6, y01) * uMotes;
    col = mix(uColor, cream, 0.5);
  }
  gl_FragColor = vec4(col * a, 0.0);
}`;

interface Params {
  glow: number;
  curtain: number;
  aura: number;
  ember: number;
  motes: number;
  pulse: number;
  hz: number;
  warm: number;
  sheen: number;
}
const P: Record<HaloState, Params> = {
  off: { glow: 0, curtain: 0, aura: 0, ember: 0, motes: 0, pulse: 0, hz: 0.3, warm: 0, sheen: 0 },
  scan: { glow: 0.85, curtain: 1, aura: 1, ember: 0, motes: 1, pulse: 0.05, hz: 0.3, warm: 0, sheen: 1 },
  glow: { glow: 0.62, curtain: 0.75, aura: 0.65, ember: 0, motes: 0.3, pulse: 0.06, hz: 0.22, warm: 0, sheen: 0.6 },
  due: { glow: 0.85, curtain: 1, aura: 1.05, ember: 0, motes: 0.7, pulse: 0.32, hz: 0.3, warm: 1, sheen: 1 },
  active: { glow: 1.35, curtain: 1.25, aura: 1.45, ember: 0, motes: 1, pulse: 0.08, hz: 0.8, warm: 0.2, sheen: 1.6 },
  ember: { glow: 0, curtain: 0, aura: 0, ember: 1, motes: 0, pulse: 0, hz: 0.3, warm: 0.6, sheen: 0 },
};

const PKEYS = Object.keys(P.off) as (keyof Params)[];

export function createHalo(size: THREE.Vector3, o: { color?: THREE.ColorRepresentation } = {}): Halo {
  const w = Math.max(0.05, size.x);
  const h = Math.max(0.02, size.y);
  const d = Math.max(0.05, size.z);
  const pad = 0.018;
  const ha = w / 2 + pad;
  const hb = d / 2 + pad;
  const rr = Math.min(0.07, 0.4 * Math.min(ha, hb));
  const topY = h / 2 + 0.004;
  const bottomY = -h / 2;
  const G = 0.1; // glow reach of the top quad

  const pos: number[] = [];
  const data: number[] = [];
  const seed: number[] = [];
  const idx: number[] = [];
  const vert = (x: number, y: number, z: number, kind: number, v: number, cx: number, cy: number, s0: number, s1: number) => {
    pos.push(x, y, z);
    data.push(kind, v, cx, cy);
    seed.push(s0, s1);
    return pos.length / 3 - 1;
  };
  const quad = (a: number, b: number, c: number, dd: number) => idx.push(a, b, c, a, c, dd);

  // 0: top plane
  {
    const x0 = -ha - G, x1 = ha + G, z0 = -hb - G, z1 = hb + G;
    const a = vert(x0, topY, z1, 0, 0, 0, 0, 0, 0);
    const b = vert(x1, topY, z1, 0, 0, 0, 0, 0, 0);
    const c = vert(x1, topY, z0, 0, 0, 0, 0, 0, 0);
    const e = vert(x0, topY, z0, 0, 0, 0, 0, 0, 0);
    quad(a, b, c, e);
  }
  // perimeter of the rounded rect
  const perim: [number, number][] = [];
  const corners: [number, number, number][] = [
    [ha - rr, hb - rr, 0],
    [-ha + rr, hb - rr, Math.PI / 2],
    [-ha + rr, -hb + rr, Math.PI],
    [ha - rr, -hb + rr, (3 * Math.PI) / 2],
  ];
  const CS = 6;
  for (const [cx, cz, a0] of corners) for (let i = 0; i <= CS; i++) {
    const a = a0 + (i / CS) * (Math.PI / 2);
    perim.push([cx + Math.cos(a) * rr, cz + Math.sin(a) * rr]);
  }
  perim.push(perim[0]);
  const arc: number[] = [0];
  for (let i = 1; i < perim.length; i++) arc.push(arc[i - 1] + Math.hypot(perim[i][0] - perim[i - 1][0], perim[i][1] - perim[i - 1][1]));
  const strip = (kind: number, y0: number, y1: number) => {
    let prevB = -1;
    let prevT = -1;
    for (let i = 0; i < perim.length; i++) {
      const [x, z] = perim[i];
      const b = vert(x, y0, z, kind, 0, 0, 0, arc[i], 0);
      const t = vert(x, y1, z, kind, 1, 0, 0, arc[i], 0);
      if (i > 0) quad(prevB, b, t, prevT);
      prevB = b;
      prevT = t;
    }
  };
  // 1: footprint curtain (never taller than 0.55 m)
  strip(1, bottomY, bottomY + Math.min(h + 0.02, 0.55));
  // 2: crown above the top outline (scaled to the object a little)
  strip(2, topY, topY + THREE.MathUtils.clamp(Math.max(ha, hb) * 0.2, 0.06, 0.14));
  // 3: ember (billboard)
  const billboard = (kind: number, x: number, y: number, z: number, s0: number, s1: number) => {
    const a = vert(x, y, z, kind, 0, -1, -1, s0, s1);
    const b = vert(x, y, z, kind, 0, 1, -1, s0, s1);
    const c = vert(x, y, z, kind, 0, 1, 1, s0, s1);
    const e = vert(x, y, z, kind, 0, -1, 1, s0, s1);
    quad(a, b, c, e);
  };
  billboard(3, 0, topY + 0.018, 0, 0, 0);
  // 4: motes
  const nm = THREE.MathUtils.clamp(Math.round((ha * hb) * 60), 6, 16);
  for (let i = 0; i < nm; i++) billboard(4, 0, topY, 0, (i * 0.618034) % 1, (i * 0.37 + 0.13) % 1);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aData', new THREE.Float32BufferAttribute(data, 4));
  geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 2));
  geo.setIndex(idx);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.05, 0), Math.hypot(ha + G, h / 2 + 0.3, hb + G));

  const baseColor = new THREE.Color(o.color ?? '#ffcb62');
  const warmColor = new THREE.Color('#ff9f3d');
  const col = new THREE.Color().copy(baseColor);
  const mat = new THREE.ShaderMaterial({
    ...LIGHT_BLEND,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uTopY: { value: topY },
      uHalf: { value: new THREE.Vector2(ha, hb) },
      uRR: { value: rr },
      uEmberSize: { value: 0.045 },
      uColor: { value: col },
      uGlow: { value: 0 },
      uCurtain: { value: 0 },
      uAura: { value: 0 },
      uEmber: { value: 0 },
      uMotes: { value: 0 },
      uScan: { value: 2 },
      uSheen: { value: 0 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
  });
  const m = new THREE.Mesh(geo, mat);
  m.name = 'halo';
  m.renderOrder = 5;
  const root = new THREE.Group();
  root.name = 'haloRoot';
  root.add(m);

  let state: HaloState = 'off';
  const cur: Params = { ...P.off };
  let scanT = -1;
  const U = mat.uniforms;
  const SCAN_DUR = 1.5;

  return {
    root,
    get state() {
      return state;
    },
    setState(s: HaloState) {
      if (s === state && s !== 'scan') return;
      state = s;
      if (s === 'scan') scanT = 0;
    },
    setColor(c: THREE.ColorRepresentation) {
      baseColor.set(c);
    },
    update(dt: number, t: number) {
      let tgt = P[state];
      if (state === 'scan') {
        if (scanT >= 0) {
          scanT += dt;
          if (scanT >= SCAN_DUR) scanT = -1;
        }
        if (scanT < 0) tgt = P.glow;
      }
      const rate = 3.5;
      for (const k of PKEYS) cur[k] = damp(cur[k], tgt[k], k === 'ember' ? 2 : rate, dt);
      const pulse = 1 + cur.pulse * Math.sin(t * Math.PI * 2 * cur.hz);
      U.uTime.value = t % 1000;
      U.uGlow.value = cur.glow * pulse;
      U.uCurtain.value = cur.curtain;
      U.uAura.value = cur.aura;
      U.uEmber.value = cur.ember;
      U.uMotes.value = cur.motes;
      U.uSheen.value = cur.sheen;
      U.uScan.value = scanT >= 0 ? scanT / SCAN_DUR : 2;
      col.copy(baseColor).lerp(warmColor, cur.warm * 0.55);
      m.visible = cur.glow + cur.ember + cur.motes > 0.004 || scanT >= 0;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      root.removeFromParent();
    },
  };
}
