/**
 * Trophies — permanent traces of mastery left on the learner's furniture.
 *
 *   new      → nothing
 *   fragile  → a tiny seed (terracotta pot + sprout / a pebble with a crystal nub)
 *   solid    → a low-poly plant that grows leaves  OR  a crystal cluster (alternates by seed)
 *   anchored → the same, turned to GOLD by a sweep of light rising from the base, with an
 *              extra bloom / crystals and twinkling glints.
 *
 * ONE mesh + ONE material per trophy (vertex-coloured MeshStandardMaterial with an
 * onBeforeCompile growth shader: each part scales/unfolds from its own pivot inside a
 * growth window, so the whole grow animation is a single uniform) + one glint sprite mesh
 * (anchored / crystals only). ~6–9 cm tall, origin at the bottom contact point.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Tier } from '../../core/types';
import { part, cyl, cone, sphere, lathe, dodeca } from '../kit';
import { LIGHT_BLEND, damp, easeInOutCubic, prng, Spring } from './common';

export interface Trophy {
  root: THREE.Object3D;
  readonly kind: 'plant' | 'crystal';
  readonly tier: Tier;
  setTier(t: Tier, animate: boolean): void;
  update(dt: number, t: number): void;
  dispose(): void;
}

const GROW: Record<Tier, number> = { new: 0, fragile: 0.15, solid: 1, anchored: 1.5 };

// ─────────────────────────────────────────────────────────────────────────────
// Geometry helpers
// ─────────────────────────────────────────────────────────────────────────────
type V3 = [number, number, number];
function tag(g: THREE.BufferGeometry, pivot: V3, win: [number, number], axis: V3 = [1, 0, 0], angle = 0, sway = 0) {
  const n = g.getAttribute('position').count;
  const piv = new Float32Array(n * 3);
  const ax = new Float32Array(n * 4);
  const gr = new Float32Array(n * 3);
  const a = new THREE.Vector3(...axis).normalize();
  for (let i = 0; i < n; i++) {
    piv.set(pivot, i * 3);
    ax.set([a.x, a.y, a.z, angle], i * 4);
    gr.set([win[0], win[1], sway], i * 3);
  }
  g.setAttribute('aPivot', new THREE.BufferAttribute(piv, 3));
  g.setAttribute('aAxis', new THREE.BufferAttribute(ax, 4));
  g.setAttribute('aGrow', new THREE.BufferAttribute(gr, 3));
  return g;
}

/** A cupped low-poly leaf along +X (length L, width W), base at origin, edges curl up. */
function leafGeo(L: number, W: number) {
  const b = [0, 0, 0];
  const m1 = [L * 0.32, 0, 0];
  const m2 = [L * 0.68, 0, 0];
  const t = [L, W * 0.12, 0];
  const l1 = [L * 0.3, W * 0.22, W * 0.46];
  const l2 = [L * 0.66, W * 0.2, W * 0.36];
  const r1 = [l1[0], l1[1], -l1[2]];
  const r2 = [l2[0], l2[1], -l2[2]];
  const tri = (...p: number[][]) => p.flat();
  const v = [
    ...tri(b, l1, m1), ...tri(m1, l1, l2), ...tri(m1, l2, m2), ...tri(m2, l2, t),
    ...tri(b, m1, r1), ...tri(m1, r2, r1), ...tri(m1, m2, r2), ...tri(m2, t, r2),
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  return g;
}

interface Built {
  geo: THREE.BufferGeometry;
  glints: V3[];
  height: number;
}

function buildPlant(seed: number): Built {
  const r = prng(seed * 7 + 3);
  const parts: THREE.BufferGeometry[] = [];
  const potCols = ['#c46a3a', '#d98a5a', '#8fae8b', '#e7d3b0'];
  const potC = potCols[Math.floor(r() * potCols.length)];
  const leafA = r() < 0.5 ? '#6cbf5a' : '#62b45c';
  const leafB = '#9ad35e';
  // pot + soil (appear first)
  parts.push(tag(lathe([[0, 0], [0.0125, 0], [0.0152, 0.02], [0.0186, 0.021], [0.0186, 0.0305], [0.0166, 0.0305], [0.0166, 0.027], [0, 0.027]], potC, { seg: 10, ao: 0.3 }), [0, 0, 0], [0, 0.08]));
  parts.push(tag(cyl(0.0164, 0.0164, 0.003, '#4a3020', { pos: [0, 0.0272, 0], seg: 10 }), [0, 0.027, 0], [0, 0.08]));
  // seed sprout (fragile): a nub with two baby leaves
  parts.push(tag(sphere(0.0036, '#a9cf54', { pos: [0, 0.0302, 0], seg: 0 }), [0, 0.028, 0], [0.05, 0.12]));
  for (const az of [0.3, 0.3 + Math.PI]) parts.push(tag(part(leafGeo(0.009, 0.007), '#a9cf54', { pos: [0, 0.032, 0], rot: [0, az, 0.7], ao: 0 }), [0, 0.032, 0], [0.08, 0.16], [0, 0, 1], 0.6, 0.5));
  // stem with a slight lean
  const lean = (r() - 0.5) * 0.25;
  const stemH = 0.032;
  const topX = Math.sin(lean) * stemH;
  parts.push(tag(cyl(0.0017, 0.0026, stemH, '#5b9e4c', { pos: [topX / 2, 0.028 + stemH / 2, 0], rot: [0, 0, -lean], seg: 6 }), [0, 0.028, 0], [0.15, 0.5]));
  const glints: V3[] = [];
  // leaves: golden-angle spiral, lower ones wide and flat, upper ones smaller and upright
  const nLeaves = 6 + Math.floor(r() * 2);
  const az0 = r() * Math.PI * 2;
  for (let i = 0; i < nLeaves; i++) {
    const f = i / (nLeaves - 1);
    const y = 0.034 + f * (stemH - 0.004);
    const x = f * topX;
    const az = az0 + i * 2.39996;
    const L = 0.031 - f * 0.013 + r() * 0.004;
    const tilt = 0.18 + f * 0.75 + r() * 0.12;
    const g = part(leafGeo(L, L * 0.66), i % 2 ? leafA : leafB, { pos: [x, y, 0], rot: [0, az, tilt], ao: 0.04 });
    const D = new THREE.Vector3(Math.cos(az), 0, -Math.sin(az));
    const A = new THREE.Vector3().crossVectors(D, new THREE.Vector3(0, 1, 0));
    const w0 = 0.3 + f * 0.45;
    parts.push(tag(g, [x, y, 0], [w0, Math.min(1, w0 + 0.3)], [A.x, A.y, A.z], 1.25, 1));
    glints.push([x + D.x * L * 0.75, y + Math.sin(tilt) * L * 0.75, D.z * L * 0.75]);
  }
  // anchored bloom: a cup of petals + a round heart
  const top: V3 = [topX, 0.028 + stemH + 0.004, 0];
  for (let k = 0; k < 6; k++) {
    const az = (k / 6) * Math.PI * 2;
    parts.push(tag(part(leafGeo(0.014, 0.011), k % 2 ? '#f6c9d2' : '#f3b3c3', { pos: top, rot: [0, az, 0.95], ao: 0 }), top, [1.05 + k * 0.03, 1.35 + k * 0.02], [-Math.sin(az), 0, -Math.cos(az)], 0.0, 0.3));
  }
  parts.push(tag(sphere(0.0045, '#f6d354', { pos: [top[0], top[1] + 0.004, top[2]], seg: 1 }), top, [1.2, 1.45]));
  glints.push([top[0], top[1] + 0.012, top[2]]);
  return { geo: merge(parts), glints, height: top[1] + 0.02 };
}

function buildCrystal(seed: number): Built {
  const r = prng(seed * 13 + 1);
  const pals = [
    ['#8f6fd6', '#c6b3f5'],
    ['#46b7c2', '#b3eef0'],
    ['#e07fa0', '#f7c5d6'],
  ];
  const [cA, cB] = pals[Math.floor(r() * pals.length)];
  const parts: THREE.BufferGeometry[] = [];
  parts.push(tag(dodeca(0.022, '#8d8173', { pos: [0, 0.008, 0], scale: [1.15, 0.42, 1] }), [0, 0, 0], [0, 0.08]));
  parts.push(tag(dodeca(0.011, '#a39686', { pos: [0.016, 0.005, 0.01], scale: [1, 0.55, 1] }), [0.016, 0, 0.01], [0.02, 0.09]));
  const glints: V3[] = [];
  const prism = (x: number, z: number, h: number, rad: number, tilt: number, az: number, c: string, win: [number, number]) => {
    const g1 = cyl(rad, rad * 0.92, h, c, { pos: [0, h / 2, 0], seg: 6, ao: 0.45 });
    const g2 = cone(rad, rad * 2.1, c, { pos: [0, h + rad * 1.05, 0], seg: 6, ao: 0 });
    const g = mergeGeometries([g1, g2])!;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, 0.01, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt * Math.sin(az), 0, -tilt * Math.cos(az))), new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m);
    parts.push(tag(g, [x, 0.01, z], win));
    const tip = new THREE.Vector3(0, h + rad * 2.1, 0).applyMatrix4(m);
    glints.push([tip.x, tip.y, tip.z]);
  };
  // fragile nub
  prism(0.004, 0.004, 0.008, 0.0045, 0.2, 0.5, cB, [0.05, 0.15]);
  const n = 3 + Math.floor(r() * 2);
  prism(0, 0, 0.05 + r() * 0.012, 0.0085, 0.05, 0, cA, [0.15, 0.6]);
  for (let i = 1; i < n; i++) {
    const az = (i / n) * Math.PI * 2 + r();
    const d = 0.009 + r() * 0.004;
    prism(Math.cos(az) * d, Math.sin(az) * d, 0.022 + r() * 0.018, 0.005 + r() * 0.002, 0.35 + r() * 0.3, az, i % 2 ? cB : cA, [0.3 + i * 0.12, Math.min(1, 0.7 + i * 0.1)]);
  }
  // anchored extras
  for (let i = 0; i < 2; i++) {
    const az = r() * Math.PI * 2;
    prism(Math.cos(az) * 0.014, Math.sin(az) * 0.014, 0.016 + r() * 0.008, 0.0042, 0.6, az, cB, [1.05 + i * 0.12, 1.4 + i * 0.05]);
  }
  return { geo: merge(parts), glints, height: 0.07 };
}

function merge(parts: THREE.BufferGeometry[]) {
  for (const p of parts) for (const name of Object.keys(p.attributes)) if (!['position', 'color', 'aPivot', 'aAxis', 'aGrow'].includes(name)) p.deleteAttribute(name);
  const g = mergeGeometries(parts, false);
  if (!g) throw new Error('trophy merge failed');
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

// ─────────────────────────────────────────────────────────────────────────────
// Material: vertex colours → gold sweep, growth deformation
// ─────────────────────────────────────────────────────────────────────────────
function growMaterial(u: { uGrow: { value: number }; uGoldY: { value: number }; uTime: { value: number }; uGem: { value: number } }) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8, metalness: 0, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
attribute vec3 aPivot;
attribute vec4 aAxis;
attribute vec3 aGrow;
uniform float uGrow;
uniform float uTime;
varying float vGY;
vec3 lociRot(vec3 v, vec3 k, float a) { float c = cos(a), s = sin(a); return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c); }`,
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `vec3 transformed = vec3(position);
{
  float gl = clamp((uGrow - aGrow.x) / max(aGrow.y - aGrow.x, 1e-3), 0.0, 1.0);
  float x = gl - 1.0;
  float gk = gl <= 0.0 ? 0.0 : x * x * (2.9 * x + 1.9) + 1.0;
  vec3 pp = transformed - aPivot;
  float sway = aGrow.z * sin(uTime * 1.4 + aPivot.y * 90.0 + aPivot.x * 40.0) * 0.06;
  pp = lociRot(pp, aAxis.xyz, (1.0 - gl) * aAxis.w + sway);
  transformed = aPivot + pp * gk;
}
vGY = transformed.y;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
uniform float uGoldY;
uniform float uGem;
uniform float uTime;
varying float vGY;
float lociGold;`,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
lociGold = smoothstep(uGoldY + 0.004, uGoldY - 0.004, vGY);
vec3 lociBase = diffuseColor.rgb;
diffuseColor.rgb = mix(lociBase, vec3(0.92, 0.56, 0.12), lociGold);`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        /* glsl */ `#include <metalnessmap_fragment>
metalnessFactor = mix(metalnessFactor, 0.55, lociGold);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.28, lociGold);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
{
  float fres = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.5);
  totalEmissiveRadiance += lociBase * uGem * (0.35 + 0.5 * fres) * (1.0 - lociGold);
  // fake environment for polished gold: warm sky above, dark amber below, bright rim
  vec3 wn = inverseTransformDirection(normal, viewMatrix);
  vec3 env = mix(vec3(0.22, 0.08, 0.0), vec3(1.0, 0.74, 0.26), smoothstep(-0.3, 0.9, wn.y));
  env += vec3(1.0, 0.86, 0.5) * pow(fres, 1.5) * 0.7;
  totalEmissiveRadiance += env * lociGold * 0.5;
  float edge = exp(-pow((vGY - uGoldY) / 0.004, 2.0));
  totalEmissiveRadiance += vec3(1.0, 0.85, 0.5) * edge * step(0.0, uGoldY) * step(uGoldY, 0.2) * 2.0;
}`,
      );
  };
  mat.customProgramCacheKey = () => 'loci-trophy-grow-v1';
  return mat;
}

const GLINT_VERT = /* glsl */ `
attribute vec2 corner;
attribute float phase;
uniform float uTime;
uniform float uK;
varying vec2 vUv;
varying float vA;
void main() {
  float tw = pow(max(0.0, sin(uTime * 1.9 + phase * 6.2831)), 10.0);
  vA = tw * uK;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float s = 0.0065 * (0.4 + tw);
  float a = uTime * 0.8 + phase * 3.0;
  mat2 R = mat2(cos(a), -sin(a), sin(a), cos(a));
  mv.xy += R * corner * s;
  vUv = corner;
  gl_Position = projectionMatrix * mv;
}`;
const GLINT_FRAG = /* glsl */ `
uniform vec3 uColor;
varying vec2 vUv;
varying float vA;
void main() {
  vec2 p = vUv;
  float rays = max(0.0, 1.0 - abs(p.x) * 9.0) * max(0.0, 1.0 - abs(p.y)) + max(0.0, 1.0 - abs(p.y) * 9.0) * max(0.0, 1.0 - abs(p.x));
  float core = exp(-dot(p, p) * 30.0);
  float a = (rays * 0.9 + core) * vA;
  gl_FragColor = vec4(mix(uColor, vec3(1.0), core) * a, 0.0);
}`;

function glintMesh(points: V3[]) {
  const pos: number[] = [];
  const cor: number[] = [];
  const ph: number[] = [];
  const idx: number[] = [];
  points.forEach((p, i) => {
    const b = pos.length / 3;
    for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      pos.push(...p);
      cor.push(cx, cy);
      ph.push((i * 0.618) % 1);
    }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('corner', new THREE.Float32BufferAttribute(cor, 2));
  g.setAttribute('phase', new THREE.Float32BufferAttribute(ph, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const mat = new THREE.ShaderMaterial({
    ...LIGHT_BLEND,
    uniforms: { uTime: { value: 0 }, uK: { value: 0 }, uColor: { value: new THREE.Color('#ffd97a') } },
    vertexShader: GLINT_VERT,
    fragmentShader: GLINT_FRAG,
  });
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = 15;
  m.name = 'glints';
  return { m, mat, g };
}

// ─────────────────────────────────────────────────────────────────────────────
export function createTrophy(seed: number): Trophy {
  const kind: 'plant' | 'crystal' = seed % 2 === 0 ? 'plant' : 'crystal';
  const built = kind === 'plant' ? buildPlant(seed) : buildCrystal(seed);
  const uni = { uGrow: { value: 0 }, uGoldY: { value: -1 }, uTime: { value: 0 }, uGem: { value: kind === 'crystal' ? 0.55 : 0.08 } };
  const mat = growMaterial(uni);
  const body = new THREE.Mesh(built.geo, mat);
  body.name = `trophy-${kind}`;
  const gl = glintMesh(built.glints);
  if (kind === 'crystal') (gl.mat.uniforms.uColor.value as THREE.Color).set('#e8f6ff');
  const root = new THREE.Group();
  root.name = 'trophy';
  const pop = new THREE.Group();
  pop.add(body, gl.m);
  root.add(pop);
  const spring = new Spring(160, 9);

  let tier: Tier = 'new';
  let grow = 0;
  let from = 0;
  let to = 0;
  let tt = 1;
  let dur = 1;
  let gold = 0; // 0 → none, >height → fully gold (sweep height in metres)
  let goldTarget = -0.01;
  let glintK = 0;

  const apply = () => {
    uni.uGrow.value = grow;
    uni.uGoldY.value = gold;
    body.visible = grow > 0.001;
    root.visible = body.visible;
  };
  apply();

  return {
    root,
    kind,
    get tier() {
      return tier;
    },
    setTier(t: Tier, animate: boolean) {
      const prev = tier;
      tier = t;
      to = GROW[t];
      goldTarget = t === 'anchored' ? built.height + 0.02 : -0.01;
      if (!animate) {
        grow = to;
        tt = 1;
        gold = goldTarget;
        apply();
        return;
      }
      from = grow;
      tt = 0;
      dur = t === 'solid' ? 2.0 : t === 'anchored' ? 1.8 : t === 'fragile' ? 0.8 : 0.5;
      if (prev !== t) spring.kick(t === 'new' ? 0 : 2.2);
    },
    update(dt: number, t: number) {
      if (tt < 1) {
        tt = Math.min(1, tt + dt / dur);
        grow = from + (to - from) * easeInOutCubic(tt);
      }
      // gold sweep rises from the base
      if (goldTarget > gold) gold = Math.min(goldTarget, (gold < 0 ? 0 : gold) + dt * 0.07);
      else if (goldTarget < gold) gold = goldTarget;
      uni.uTime.value = t % 1000;
      apply();
      const s = 1 + spring.step(dt) * 0.08;
      pop.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
      const gk = tier === 'anchored' ? (gold >= built.height ? 1 : 0.4) : kind === 'crystal' && grow > 0.9 ? 0.45 : 0;
      glintK = damp(glintK, gk, 3, dt);
      gl.mat.uniforms.uK.value = glintK;
      gl.mat.uniforms.uTime.value = t % 1000;
      gl.m.visible = glintK > 0.01 && body.visible;
    },
    dispose() {
      built.geo.dispose();
      mat.dispose();
      gl.g.dispose();
      gl.mat.dispose();
      root.removeFromParent();
    },
  };
}
