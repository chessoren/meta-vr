/**
 * Loci — sound bench (dev page at /audio/). Audition every cue, the 24 object signatures (flat or
 * spatialised around you), the flame's voice and the ambience, on a laptop or in the Quest browser.
 */
import { AudioEngine, pentatonicRatio, type Cue, type FlameMood, type Vec3 } from './engine';
import { CUES, CUE_NAMES } from './cues';
import { OBJECT_VOICE_COUNT, objectVoiceInfo, type ObjectVoiceKind } from './voices';
import { FLAME_SAMPLES } from './offline-check';

const audio = AudioEngine.get();
const app = document.getElementById('app')!;
const gate = document.getElementById('gate')!;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...kids: (Node | string)[]) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v; else e.setAttribute(k, v);
  }
  e.append(...kids);
  return e;
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ---------------------------------------------------------------- state */
let spatial = false;
/** Source position for spatial auditions (listener at origin, facing -Z). */
const src: Vec3 = { x: 0.6, y: 0, z: -1.0 };
const at = (): Vec3 | undefined => (spatial ? { ...src } : undefined);
/** Objects laid out on a left→right arc in front of the seat (like the palace route). */
const objectPos = (i: number): Vec3 => {
  const a = (-70 + (140 * i) / (OBJECT_VOICE_COUNT - 1)) * (Math.PI / 180);
  const r = 1.2 + 0.8 * ((i * 7) % 3) / 2;
  return { x: Math.sin(a) * r, y: 0, z: -Math.cos(a) * r };
};

/* ---------------------------------------------------------------- header / controls */
const status = el('div', { id: 'status' }, 'audio locked');
const vol = el('input', { type: 'range', min: '0', max: '1', step: '0.01', value: '0.8' }) as HTMLInputElement;
vol.oninput = () => audio.setMasterVolume(Number(vol.value));
const mute = el('button', {}, 'Mute');
mute.onclick = () => { audio.setMuted(!audio.muted); mute.classList.toggle('on', audio.muted); };
const amb = el('button', {}, 'Ambience: off');
let ambOn = false;
amb.onclick = () => {
  ambOn = !ambOn;
  if (ambOn) audio.startAmbience(); else audio.stopAmbience(1.5);
  amb.textContent = `Ambience: ${ambOn ? 'on' : 'off'}`;
  amb.classList.toggle('on', ambOn);
};
const ambLvl = el('input', { type: 'range', min: '0', max: '1', step: '0.01', value: '0.6' }) as HTMLInputElement;
ambLvl.oninput = () => audio.setAmbienceLevel(Number(ambLvl.value));
const sp = el('button', {}, 'Spatial: off');
sp.onclick = () => { spatial = !spatial; sp.textContent = `Spatial: ${spatial ? 'on' : 'off'}`; sp.classList.toggle('on', spatial); draw(); };

app.append(
  el('h1', {}, 'Loci sound bench'),
  el('p', { class: 'sub' }, 'Every sound is procedural (pure DSP → pre-rendered buffers → HRTF panners). One key: D major pentatonic. Ambience: an old library on a winter evening.'),
  el('div', { class: 'bar' },
    el('label', {}, 'Master', vol), mute, amb, el('label', {}, 'Ambience level', ambLvl), sp, status),
);

/* ---------------------------------------------------------------- spatial pad */
const cv = el('canvas', { width: '360', height: '300' }) as HTMLCanvasElement;
const g = cv.getContext('2d')!;
const SCALE = 90; // px per metre
function draw(): void {
  const w = cv.width, h = cv.height, cx = w / 2, cy = h * 0.7;
  g.clearRect(0, 0, w, h);
  g.strokeStyle = '#4a3524';
  for (let r = 1; r <= 3; r++) { g.beginPath(); g.arc(cx, cy, r * SCALE, 0, Math.PI * 2); g.stroke(); }
  for (let i = 0; i < OBJECT_VOICE_COUNT; i++) {
    const p = objectPos(i);
    g.fillStyle = '#8a6a44';
    g.beginPath(); g.arc(cx + p.x * SCALE, cy + p.z * SCALE, 3, 0, Math.PI * 2); g.fill();
  }
  // listener
  g.fillStyle = '#f6e7c8';
  g.beginPath(); g.moveTo(cx, cy - 12); g.lineTo(cx - 8, cy + 8); g.lineTo(cx + 8, cy + 8); g.closePath(); g.fill();
  // source
  g.fillStyle = spatial ? '#f2b24a' : '#6b5238';
  g.beginPath(); g.arc(cx + src.x * SCALE, cy + src.z * SCALE, 9, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#c9b08a'; g.font = '12px system-ui';
  g.fillText('you (facing up)', cx + 12, cy + 16);
  g.fillText('drag the gold dot', 10, 18);
}
cv.onpointerdown = cv.onpointermove = (e) => {
  if (e.type === 'pointermove' && !e.buttons) return;
  const r = cv.getBoundingClientRect();
  const k = cv.width / r.width;
  src.x = ((e.clientX - r.left) * k - cv.width / 2) / SCALE;
  src.z = ((e.clientY - r.top) * k - cv.height * 0.7) / SCALE;
  draw();
};
cv.onpointerup = () => { if (spatial) audio.play('scanPing', at()); };
app.append(el('h2', {}, 'Spatial position'), el('div', { class: 'spatial' }, cv,
  el('p', { class: 'hint' }, 'Turn "Spatial" on and every cue plays from the gold dot through an HRTF panner (headphones!). Object voices always play from their own spot on the left→right arc, like a real palace route.')));
draw();

/* ---------------------------------------------------------------- cues */
const cueGrid = el('div', { class: 'grid' });
for (const c of CUE_NAMES) {
  const b = el('button', { class: 'cue' }, el('b', {}, c), el('small', {}, CUES[c].note));
  b.onclick = () => audio.play(c, at());
  cueGrid.append(b);
}
const scanWalk = el('button', { class: 'cue' }, el('b', {}, 'scan walk'), el('small', {}, 'scanPing × 6 walking up the scale, left → right (always spatial)'));
scanWalk.onclick = async () => {
  for (let i = 0; i < 6; i++) {
    const a = (-60 + 24 * i) * (Math.PI / 180);
    audio.play('scanPing', { x: Math.sin(a) * 1.6, y: 0, z: -Math.cos(a) * 1.6 }, { pitch: pentatonicRatio(i) });
    await wait(420);
  }
};
cueGrid.append(scanWalk);
app.append(el('h2', {}, 'Cues'), cueGrid);

/* ---------------------------------------------------------------- object voices */
const objGrid = el('div', { class: 'grid' });
for (let i = 0; i < OBJECT_VOICE_COUNT; i++) {
  const info = objectVoiceInfo(i);
  const row = el('div', { class: 'row' });
  for (const k of ['select', 'place', 'reveal'] as ObjectVoiceKind[]) {
    const b = el('button', {}, k);
    b.onclick = () => audio.objectVoice(i, objectPos(i), k);
    row.append(b);
  }
  objGrid.append(el('div', { class: 'obj' },
    el('div', { class: 'h' }, el('span', {}, `#${i}`), el('span', {}, info.family)),
    el('small', {}, `motif ${info.steps.join(' ')} (pentatonic steps, 0 = D4)`), row));
}
const allSel = el('button', {}, 'Play all 24 signatures (select), left → right');
allSel.onclick = async () => { for (let i = 0; i < OBJECT_VOICE_COUNT; i++) { audio.objectVoice(i, objectPos(i)); await wait(900); } };
app.append(el('h2', {}, 'Object signatures'), el('p', { class: 'sub' }, '8 timbre families × 24 motifs × 3 registers — one unique, in-key sound per object.'), allSel, el('div', { style: 'height:10px' }), objGrid);

/* ---------------------------------------------------------------- flame voice */
const txt = el('input', { value: 'Pinch me!', placeholder: 'what the flame says' }) as HTMLInputElement;
const mood = el('select', {}, ...(['happy', 'curious', 'proud', 'sleepy'] as FlameMood[]).map((m) => el('option', { value: m }, m))) as HTMLSelectElement;
const syl = el('div', { id: 'syl' });
async function sing(words: string, m: FlameMood): Promise<void> {
  const plan = audio.flameVoice(words, m, at());
  syl.replaceChildren(...plan.syllables.map((s) => el('span', {}, `${s.onset === 'none' ? '' : s.onset[0]}${s.vowel}${s.vowelTo !== s.vowel ? '→' + s.vowelTo : ''}`)));
  const t0 = performance.now();
  const spans = [...syl.children];
  const tick = () => {
    const t = (performance.now() - t0) / 1000;
    plan.syllables.forEach((s, i) => spans[i].classList.toggle('lit', t >= s.t && t < s.t + s.dur));
    if (t < plan.duration + 0.1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  await wait(plan.duration * 1000);
}
const say = el('button', {}, 'Sing');
say.onclick = () => void sing(txt.value, mood.value as FlameMood);
txt.onkeydown = (e) => { if (e.key === 'Enter') say.click(); };
const presets = el('div', { class: 'grid', style: 'margin-top:10px' });
for (const [w, m] of FLAME_SAMPLES) {
  const b = el('button', { class: 'cue' }, el('b', {}, `“${w}”`), el('small', {}, m));
  b.onclick = () => void sing(w, m);
  presets.append(b);
}
app.append(el('h2', {}, 'Flame voice'), el('div', { class: 'flame' }, txt, mood, say), syl, presets);

/* ---------------------------------------------------------------- story */
const story = el('button', { class: 'primary', style: 'margin-top:8px' }, '▶ First five minutes (sound only)');
story.onclick = async () => {
  if (!ambOn) amb.click();
  await wait(800);
  await sing('Hello!', 'happy');
  audio.play('bounce'); await wait(500);
  await sing('Pinch me', 'happy');
  audio.play('pinch'); await wait(90); audio.play('bounce'); await wait(300); audio.play('release'); await wait(700);
  await sing('Your room?', 'curious');
  for (let i = 0; i < 5; i++) { audio.play('scanPing', objectPos(i * 5), { pitch: pentatonicRatio(i) }); await wait(450); }
  await wait(400);
  audio.play('palaceLoaded'); await wait(1800);
  for (let i = 0; i < 3; i++) {
    audio.play('appear'); await wait(900);
    audio.play('pinch'); await wait(250); audio.play('whoosh'); await wait(450);
    audio.play('placeThunk', objectPos(i * 5)); audio.objectVoice(i * 5, objectPos(i * 5), 'place'); await wait(1600);
  }
  audio.play('lightsOut'); await wait(2600);
  audio.play('hover', objectPos(0)); await wait(500); audio.play('pinch'); await wait(300);
  audio.play('correct'); audio.objectVoice(0, objectPos(0), 'reveal'); await wait(1800);
  audio.play('hover', objectPos(5)); await wait(500); audio.play('pinch'); await wait(300);
  audio.play('wrong'); await wait(1400); audio.objectVoice(5, objectPos(5), 'reveal'); await wait(1800);
  audio.play('hover', objectPos(10)); await wait(500); audio.play('pinch'); await wait(300);
  audio.play('correct'); audio.objectVoice(10, objectPos(10), 'reveal'); await wait(1400); audio.play('tierUp'); await wait(1600);
  audio.play('proof'); await wait(600); await sing('Five out of five!', 'proud'); await wait(1500);
  audio.play('tierAnchored'); await wait(3500);
  await sing('See you tomorrow', 'sleepy'); audio.play('goodbye');
};
app.append(el('h2', {}, 'Sequence'), story);

/* ---------------------------------------------------------------- unlock */
document.getElementById('unlock')!.onclick = async () => {
  const t = performance.now();
  const p = audio.unlock();
  gate.classList.add('hidden');
  audio.setListener({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 });
  audio.prepareFlame(FLAME_SAMPLES);
  await p;
  status.textContent = `ready in ${Math.round(performance.now() - t)} ms`;
};
setInterval(() => {
  const s = audio.stats();
  if (s.state === 'none') return;
  status.textContent = `${s.state} · ${s.sampleRate} Hz · ${s.buffers} buffers · ${s.megabytes.toFixed(1)} MB · ${s.worker ? 'worker' : 'main-thread'} render · ready=${audio.ready}`;
}, 500);

(window as unknown as { __shotReady?: boolean; __audio?: AudioEngine; __cues?: readonly Cue[] }).__shotReady = true;
(window as unknown as { __audio?: AudioEngine }).__audio = audio;
