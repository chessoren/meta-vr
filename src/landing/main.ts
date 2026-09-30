/**
 * Loci landing page. Vanilla TS, no framework, no external requests (fonts are bundled by @fontsource).
 */
import '@fontsource/fraunces/300.css';
import '@fontsource/fraunces/400.css';
import '@fontsource/fraunces/300-italic.css';
import '@fontsource/fraunces/400-italic.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import './style.css';
import { MEDIA } from './media';

const root = document.documentElement;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
/** Headless screenshots (scripts/shoot.mjs) and tests: show everything immediately. */
const automated = navigator.webdriver === true;
const params = new URLSearchParams(location.search);
if (automated) root.classList.add('static');

// ─── Nav state ────────────────────────────────────────────────────────────
const nav = document.querySelector<HTMLElement>('.nav');
const onScroll = () => nav?.classList.toggle('scrolled', window.scrollY > 24);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// ─── Headset hint shows the real address once deployed ───────────────────
const hostLine = document.querySelector<HTMLElement>('.host-line');
if (hostLine && !/^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname)) {
  hostLine.innerHTML = `open <b>${location.host}/app</b> in Meta Quest Browser`;
}

// ─── Reveal on scroll ─────────────────────────────────────────────────────
const reveals = document.querySelectorAll<HTMLElement>('.reveal');
if (automated || reduceMotion.matches || !('IntersectionObserver' in window)) {
  reveals.forEach((el) => el.classList.add('in'));
} else {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
  );
  reveals.forEach((el) => io.observe(el));
}

// ─── Embers drifting up through the hero ──────────────────────────────────
function embers(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  interface P { x: number; y: number; r: number; vy: number; ph: number; sp: number; a: number }
  let w = 0;
  let h = 0;
  let dpr = 1;
  let ps: P[] = [];
  const spawn = (p: P, anywhere: boolean) => {
    p.x = Math.random() * w;
    p.y = anywhere ? Math.random() * h : h + 10;
    p.r = 0.6 + Math.random() * Math.random() * 2.2;
    p.vy = 8 + Math.random() * 22; // px / s
    p.ph = Math.random() * Math.PI * 2;
    p.sp = 0.4 + Math.random() * 1.2;
    p.a = 0.25 + Math.random() * 0.6;
  };
  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.min(80, Math.round((w * h) / 16000));
    while (ps.length < n) {
      const p = {} as P;
      spawn(p, true);
      ps.push(p);
    }
    ps.length = n;
  };
  const draw = (t: number, dt: number) => {
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    for (const p of ps) {
      p.y -= p.vy * dt;
      if (p.y < -10) spawn(p, false);
      const x = p.x + Math.sin(t * p.sp + p.ph) * 14;
      // brighter towards the warm right-hand side, fading as they rise
      const lift = Math.max(0, Math.min(1, p.y / h));
      const flicker = 0.65 + 0.35 * Math.sin(t * 3 * p.sp + p.ph * 3);
      const a = p.a * flicker * (0.25 + 0.75 * lift) * (0.55 + 0.45 * (x / w));
      const g = ctx.createRadialGradient(x, p.y, 0, x, p.y, p.r * 4);
      g.addColorStop(0, `rgba(255, 214, 140, ${a})`);
      g.addColorStop(0.35, `rgba(246, 150, 70, ${a * 0.45})`);
      g.addColorStop(1, 'rgba(246, 150, 70, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, p.y, p.r * 4, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  resize();
  window.addEventListener('resize', resize);
  if (reduceMotion.matches) {
    draw(0, 0);
    return;
  }
  let visible = true;
  let last = performance.now();
  let raf = 0;
  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    draw(now / 1000, dt);
    raf = requestAnimationFrame(loop);
  };
  const setRunning = (run: boolean) => {
    cancelAnimationFrame(raf);
    if (run) {
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
  };
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    setRunning(visible && !document.hidden);
  }).observe(canvas);
  document.addEventListener('visibilitychange', () => setRunning(visible && !document.hidden));
  setRunning(true);
}
const emberCanvas = document.querySelector<HTMLCanvasElement>('.embers');
if (emberCanvas) embers(emberCanvas);

// ─── Forgetting curve (illustrative model, clearly labelled as such) ─────
const SVGNS = 'http://www.w3.org/2000/svg';
function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element) {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  parent?.appendChild(n);
  return n;
}

function curveChart(svg: SVGSVGElement) {
  const W = 560, H = 330, L = 44, R = 548, T = 16, B = 292;
  const DAYS = 21;
  const REVIEWS = [1, 3, 7, 14];
  const STAB = [1.3, 3, 6.5, 14, 40];
  const FLOOR = 0.18;
  const x = (d: number) => L + (d / DAYS) * (R - L);
  const y = (r: number) => B - r * (B - T);
  const reread = (t: number) => FLOOR + (1 - FLOOR) * Math.exp(-t / 1.3);
  const spaced = (t: number) => {
    let last = 0, i = 0;
    for (const r of REVIEWS) if (t >= r) { last = r; i++; }
    return FLOOR + (1 - FLOOR) * Math.exp(-(t - last) / STAB[i]);
  };
  void W; void H;

  const defs = el('defs', {}, svg);
  const lg = el('linearGradient', { id: 'g-area-gold', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  el('stop', { offset: 0, 'stop-color': '#c28326', 'stop-opacity': 0.28 }, lg);
  el('stop', { offset: 1, 'stop-color': '#c28326', 'stop-opacity': 0 }, lg);

  // recessive grid + axes labels
  for (const r of [0, 0.25, 0.5, 0.75, 1]) {
    el('line', { x1: L, x2: R, y1: y(r), y2: y(r), class: 'grid' }, svg);
    const t = el('text', { x: L - 10, y: y(r) + 4, 'text-anchor': 'end', class: 'axis-t' }, svg);
    t.textContent = `${Math.round(r * 100)}%`;
  }
  for (const d of [0, ...REVIEWS, DAYS]) {
    const t = el('text', { x: x(d), y: B + 20, 'text-anchor': 'middle', class: 'axis-t' }, svg);
    t.textContent = d === 0 ? 'Day 0' : String(d);
  }

  // build paths
  const pts = (f: (t: number) => number, jumps: number[]) => {
    const out: string[] = [];
    for (let t = 0; t <= DAYS + 1e-6; t += 0.05) {
      const tt = Math.round(t * 100) / 100;
      for (const j of jumps) if (Math.abs(tt - j) < 0.025) out.push(`${x(j).toFixed(1)},${y(f(j - 1e-6)).toFixed(1)}`);
      out.push(`${x(tt).toFixed(1)},${y(f(tt)).toFixed(1)}`);
    }
    return out;
  };
  const gp = pts(spaced, REVIEWS);
  el('path', { d: `M${L},${B} L${gp.join(' L')} L${R},${B} Z`, class: 'area-gold' }, svg);
  const cool = el('path', { d: `M${pts(reread, []).join(' L')}`, class: 'line l-cool draw' }, svg);
  const gold = el('path', { d: `M${gp.join(' L')}`, class: 'line l-gold draw' }, svg);
  for (const p of [cool, gold]) p.style.setProperty('--len', String(Math.ceil(p.getTotalLength())));

  // review markers
  REVIEWS.forEach((d, i) => {
    el('circle', { cx: x(d), cy: y(1), r: 5, class: 'rev' }, svg);
    if (i === 0) {
      const t = el('text', { x: x(d) + 10, y: y(1) - 8, class: 'rev-t' }, svg);
      t.textContent = 'active recall';
    }
  });
  // direct labels at the line ends
  const dl1 = el('text', { x: R, y: y(spaced(DAYS)) - 12, 'text-anchor': 'end', class: 'dl' }, svg);
  dl1.textContent = 'Spaced recall';
  const dl2 = el('text', { x: R, y: y(reread(DAYS)) - 10, 'text-anchor': 'end', class: 'dl' }, svg);
  dl2.textContent = 'Re-read once';

  // hover layer: crosshair + tooltip
  const tip = svg.parentElement?.querySelector<HTMLElement>('.chart-tip');
  const cross = el('line', { x1: 0, x2: 0, y1: T, y2: B, class: 'cross', visibility: 'hidden' }, svg);
  const dA = el('circle', { r: 4.5, fill: '#5a86c0', stroke: '#1f150d', 'stroke-width': 2, visibility: 'hidden' }, svg);
  const dB = el('circle', { r: 4.5, fill: '#c28326', stroke: '#1f150d', 'stroke-width': 2, visibility: 'hidden' }, svg);
  const hit = el('rect', { x: L, y: T, width: R - L, height: B - T, fill: 'transparent' }, svg);
  const show = (clientX: number) => {
    const box = svg.getBoundingClientRect();
    const sx = ((clientX - box.left) / box.width) * 560;
    const d = Math.max(0, Math.min(DAYS, Math.round(((sx - L) / (R - L)) * DAYS)));
    const a = reread(d), b = spaced(d);
    for (const n of [cross, dA, dB]) n.setAttribute('visibility', 'visible');
    cross.setAttribute('x1', String(x(d)));
    cross.setAttribute('x2', String(x(d)));
    dA.setAttribute('cx', String(x(d))); dA.setAttribute('cy', String(y(a)));
    dB.setAttribute('cx', String(x(d))); dB.setAttribute('cy', String(y(b)));
    if (tip) {
      tip.hidden = false;
      tip.style.left = `${Math.max(18, Math.min(82, (x(d) / 560) * 100))}%`;
      const r5 = (v: number) => Math.round((v * 100) / 5) * 5;
      tip.innerHTML = `<b>Day ${d}</b><br><i style="background:#c28326"></i>Spaced recall ≈ ${r5(b)}%<br><i style="background:#5a86c0"></i>Re-read once ≈ ${r5(a)}%`;
    }
  };
  const hide = () => {
    for (const n of [cross, dA, dB]) n.setAttribute('visibility', 'hidden');
    if (tip) tip.hidden = true;
  };
  hit.addEventListener('pointermove', (e) => show(e.clientX));
  hit.addEventListener('pointerdown', (e) => show(e.clientX));
  hit.addEventListener('pointerleave', hide);
}
const curve = document.querySelector<SVGSVGElement>('#curve');
if (curve) curveChart(curve);

// ─── Decorative QR pattern for the import illustration ────────────────────
function qrPattern(host: HTMLElement) {
  const N = 21;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const finder = (r: number, c: number) => {
    for (const [or, oc] of [[0, 0], [0, N - 7], [N - 7, 0]]) {
      const rr = r - or, cc = c - oc;
      if (rr >= 0 && rr < 7 && cc >= 0 && cc < 7) {
        const edge = rr === 0 || rr === 6 || cc === 0 || cc === 6;
        const core = rr >= 2 && rr <= 4 && cc >= 2 && cc <= 4;
        return edge || core ? 1 : 0;
      }
      if (rr >= -1 && rr <= 7 && cc >= -1 && cc <= 7) return 0;
    }
    return -1;
  };
  const frag = document.createDocumentFragment();
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const f = finder(r, c);
      const on = f === -1 ? rnd() > 0.52 : f === 1;
      const i = document.createElement('i');
      if (!on) i.className = 'o';
      frag.appendChild(i);
    }
  }
  host.appendChild(frag);
}
const qr = document.querySelector<HTMLElement>('.qr');
if (qr) qrPattern(qr);

// ─── Media slots: real captures replace drawn fallbacks when available ────
const mediaMode = params.get('media');
if (mediaMode === 'debug') document.body.classList.add('media-debug');
document.querySelectorAll<HTMLElement>('.media[data-slot]').forEach((slot) => {
  const m = MEDIA[slot.dataset.slot ?? ''];
  if (!m) return;
  slot.dataset.src = m.src;
  if (!m.ready && mediaMode !== 'all') return;
  const isVideo = /\.(mp4|webm|mov)$/i.test(m.src);
  const done = () => {
    slot.classList.add('has-media');
    slot.closest('.hero-art')?.classList.add('has-media');
  };
  let node: HTMLImageElement | HTMLVideoElement;
  if (isVideo) {
    const v = document.createElement('video');
    Object.assign(v, { muted: true, loop: true, playsInline: true, autoplay: !reduceMotion.matches, preload: 'metadata' });
    if (m.poster) v.poster = m.poster;
    v.setAttribute('aria-label', m.alt);
    v.addEventListener('loadeddata', done, { once: true });
    v.src = m.src;
    node = v;
  } else {
    const img = new Image();
    img.alt = m.alt;
    img.decoding = 'async';
    img.loading = 'lazy';
    img.addEventListener('load', done, { once: true });
    img.src = m.src;
    node = img;
  }
  node.className = 'media-real';
  node.addEventListener('error', () => node.remove(), { once: true });
  slot.appendChild(node);
});

// ─── Ready flag for scripts/shoot.mjs ─────────────────────────────────────
Promise.all(
  ['300 1em Fraunces', 'italic 300 1em Fraunces', '400 1em Fraunces', '400 1em Inter', '600 1em Inter'].map((f) => document.fonts.load(f).catch(() => [])),
)
  .then(() => document.fonts.ready)
  .then(() =>
  requestAnimationFrame(() => requestAnimationFrame(() => ((window as unknown as { __shotReady: boolean }).__shotReady = true))),
);
