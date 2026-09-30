/**
 * Loci phone companion — send a course to the headset.
 *
 * Flow: code (from ?c= or typed) → source (photo / PDF / paste) → building → review (edit / delete) → send → done.
 * Vanilla TS, mobile-first, one hand. The draft survives refreshes (sessionStorage).
 */
import '@fontsource/fraunces/500.css';
import '@fontsource/fraunces/600.css';
import '@fontsource/fraunces/500-italic.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import './phone.css';

import type { ExtractResponse, Notion } from '../core/types';
import { MAX_NOTIONS } from '../core/types';
import { CATALOG_INDEX } from '../core/catalog-index';
import type { ExtractRequestIn } from '../../server/api-types';
import { ApiError, checkCode, extract, sendPalace } from './api';
import { clear, captionNode, h, icon } from './dom';
import { clearDraft, loadDraft, saveDraft } from './draft';
import { DIRECT_PDF_BYTES, fileToBase64, fitImages, MAX_PHOTOS, readPdf, SAFE_BODY_B64, type PdfInfo, type PreparedImage } from './files';
import { SAMPLE_COURSE } from './sample';

type Step = 'code' | 'checking' | 'source' | 'building' | 'review' | 'sending' | 'done' | 'expired';
type Source = 'photo' | 'pdf' | 'text';

interface State {
  step: Step;
  code: string | null;
  codeError?: string;
  source: Source | null;
  photos: { file: Blob; preview: string }[];
  pdf?: { file: File; info?: PdfInfo; error?: string };
  text: string;
  title: string;
  examDate: string;
  busy?: string;
  sourceError?: string;
  build: { phase: 'prepare' | 'upload' | 'thinking'; progress: number; startedAt: number; note?: string };
  result?: ExtractResponse;
  editing?: string;
  sendError?: string;
}

const MAX_TEXT = 60_000;
const app = document.getElementById('app')!;
const toastEl = document.getElementById('toast')!;
const params = new URLSearchParams(location.search);
const forceOffline = params.get('offline') === '1';
/** null = unknown yet; false = this server has no AI key (photos can't be read). */
let aiAvailable: boolean | null = null;
const modelName = new Map(CATALOG_INDEX.map((e) => [e.id, e.name]));

const s: State = {
  step: 'code',
  code: null,
  source: null,
  photos: [],
  text: '',
  title: '',
  examDate: '',
  build: { phase: 'prepare', progress: 0, startedAt: 0 },
};

// ─── helpers ─────────────────────────────────────────────────────────────────

const cleanCode = (v: string) => v.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
const fold = (x: string) =>
  x
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const todayIso = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

function persist() {
  // transient screens never overwrite the draft (a reload goes back through 'checking')
  if (!s.code || !['source', 'review', 'sending', 'done'].includes(s.step)) return;
  const step = s.step === 'review' || s.step === 'sending' ? 'review' : s.step === 'done' ? 'done' : 'source';
  saveDraft({ code: s.code, step, text: s.text, title: s.title, examDate: s.examDate, result: s.result });
}

let toastTimer = 0;
function toast(msg: string, action?: { label: string; run: () => void }) {
  clear(toastEl);
  toastEl.append(h('span', null, msg));
  if (action)
    toastEl.append(
      h(
        'button',
        {
          class: 'toast-action',
          type: 'button',
          onclick: () => {
            toastEl.classList.remove('show');
            action.run();
          },
        },
        action.label,
      ),
    );
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), action ? 6000 : 4000);
}

function go(step: Step) {
  if (step !== s.step) toastEl.classList.remove('show'); // an "Undo" never outlives its screen
  s.step = step;
  persist();
  render();
  window.scrollTo({ top: 0 });
  // move focus to the new screen title for screen readers
  requestAnimationFrame(() => (app.querySelector('h1') as HTMLElement | null)?.focus({ preventScroll: true }));
}

function header(): HTMLElement {
  const connected = s.code && !['code', 'checking', 'expired'].includes(s.step);
  return h(
    'header',
    { class: 'top' },
    h('div', { class: 'brand' }, icon('flame', 'brand-flame'), h('span', { class: 'brand-name' }, 'Loci')),
    connected ? h('div', { class: 'code-chip', title: 'Paired with your headset' }, h('span', { class: 'dot' }), s.code!) : null,
  );
}

function screen(...children: (Node | null | false | undefined)[]) {
  clear(app);
  app.append(header(), h('main', { class: `screen screen-${s.step}` }, ...children));
}

function button(label: string | Node[], props: Record<string, unknown> = {}, variant = 'primary') {
  return h('button', { type: 'button', class: `btn btn-${variant}`, ...props }, ...(Array.isArray(label) ? label : [label]));
}

function errorBox(msg: string | undefined) {
  return msg ? h('div', { class: 'alert alert-error', role: 'alert' }, icon('warn'), h('span', null, msg)) : null;
}

// ─── code ────────────────────────────────────────────────────────────────────

async function connect(code: string) {
  s.code = code;
  s.codeError = undefined;
  go('checking');
  try {
    await checkCode(code);
    const d = loadDraft(code);
    if (d) {
      s.text = d.text ?? '';
      s.title = d.title ?? '';
      s.examDate = d.examDate ?? '';
      if (d.result && (d.step === 'review' || d.step === 'done')) {
        s.result = d.result;
        s.source = 'text';
        go(d.step === 'done' ? 'done' : 'review');
        if (d.step === 'review') toast('Welcome back — your draft is still here.');
        return;
      }
      if (s.text) s.source = 'text';
    }
    history.replaceState(null, '', `${location.pathname}?c=${code}${forceOffline ? '&offline=1' : ''}`);
    go('source');
  } catch (e) {
    if (e instanceof ApiError && e.kind === 'expired') {
      s.codeError = `We can't find "${code}". Check the 4 letters in your headset — codes expire after 30 minutes.`;
    } else s.codeError = e instanceof Error ? e.message : String(e);
    go('code');
  }
}

function renderCode() {
  const input = h('input', {
    id: 'code',
    class: 'code-input',
    inputmode: 'text',
    autocomplete: 'one-time-code',
    autocapitalize: 'characters',
    autocorrect: 'off',
    spellcheck: 'false',
    maxlength: '4',
    placeholder: '····',
    'aria-label': 'Four-letter code',
    'aria-describedby': 'code-help',
    value: s.code ?? '',
  }) as HTMLInputElement;
  const submit = button([h('span', null, 'Connect'), icon('sparkle')], { id: 'connect', disabled: true });
  const sync = () => {
    const v = cleanCode(input.value);
    if (input.value !== v) input.value = v;
    submit.disabled = v.length !== 4;
  };
  input.addEventListener('input', sync);
  const form = h(
    'form',
    {
      class: 'code-form',
      onsubmit: (e: Event) => {
        e.preventDefault();
        const v = cleanCode(input.value);
        if (v.length === 4) void connect(v);
      },
    },
    h('label', { for: 'code', class: 'sr-only' }, 'Code shown in your headset'),
    input,
    errorBox(s.codeError),
    submit,
  );
  submit.type = 'submit';
  screen(
    h(
      'section',
      { class: 'hero' },
      h('p', { class: 'eyebrow' }, 'Course import'),
      h('h1', { tabindex: '-1' }, 'Enter the code shown in your headset'),
      h('p', { id: 'code-help', class: 'lede' }, 'Four letters, floating next to the little flame. Or scan its QR code with your camera.'),
    ),
    form,
    h(
      'ol',
      { class: 'how', 'aria-label': 'How it works' },
      h('li', null, h('span', { class: 'how-n' }, '1'), h('span', null, h('strong', null, 'Send your course'), h('small', null, 'A photo of your notes, a PDF or pasted text.'))),
      h('li', null, h('span', { class: 'how-n' }, '2'), h('span', null, h('strong', null, 'Check the notions'), h('small', null, 'Up to 20 facts, each with its own absurd little scene.'))),
      h('li', null, h('span', { class: 'how-n' }, '3'), h('span', null, h('strong', null, 'Look up'), h('small', null, 'They appear in your headset, ready to place on your furniture.'))),
    ),
  );
  sync();
  requestAnimationFrame(() => input.focus());
}

function renderChecking() {
  screen(h('section', { class: 'hero center' }, h('div', { class: 'spinner', role: 'progressbar', 'aria-label': 'Connecting' }), h('h1', { tabindex: '-1' }, 'Finding your headset…')));
}

function renderExpired() {
  s.codeError = s.codeError ?? 'This pairing code has expired. Ask your headset for a new one and type it below.';
  renderCode();
}

// ─── source ──────────────────────────────────────────────────────────────────

function sourceCard(kind: Source, title: string, sub: string, ic: Parameters<typeof icon>[0]) {
  const active = s.source === kind;
  return h(
    'button',
    {
      type: 'button',
      class: `source-card${active ? ' active' : ''}`,
      'aria-pressed': String(active),
      dataset: { source: kind },
      onclick: () => pickSource(kind),
    },
    h('span', { class: 'source-icon' }, icon(ic)),
    h('span', { class: 'source-text' }, h('strong', null, title), h('small', null, sub)),
  );
}

const cameraInput = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'sr-only', id: 'camera', tabindex: '-1' }) as HTMLInputElement;
const libraryInput = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'sr-only', id: 'library', tabindex: '-1' }) as HTMLInputElement;
const pdfInput = h('input', { type: 'file', accept: 'application/pdf,.pdf', class: 'sr-only', id: 'pdf', tabindex: '-1' }) as HTMLInputElement;

function addPhotos(files: FileList | null) {
  if (!files?.length) return;
  const room = MAX_PHOTOS - s.photos.length;
  const list = [...files].filter((f) => f.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name)).slice(0, room);
  if (files.length > room) toast(`Up to ${MAX_PHOTOS} pages per import.`);
  for (const f of list) s.photos.push({ file: f, preview: URL.createObjectURL(f) });
  s.source = 'photo';
  s.sourceError = undefined;
  render();
}
cameraInput.addEventListener('change', () => {
  addPhotos(cameraInput.files);
  cameraInput.value = '';
});
libraryInput.addEventListener('change', () => {
  addPhotos(libraryInput.files);
  libraryInput.value = '';
});
pdfInput.addEventListener('change', async () => {
  const f = pdfInput.files?.[0];
  pdfInput.value = '';
  if (!f) return;
  if (f.size > 40 * 1024 * 1024) {
    s.sourceError = 'That PDF is over 40 MB. Export just the chapter you need, or paste its text.';
    render();
    return;
  }
  s.pdf = { file: f };
  s.source = 'pdf';
  s.sourceError = undefined;
  s.busy = 'Reading your PDF…';
  render();
  try {
    s.pdf.info = await readPdf(f);
    if (!s.title) s.title = f.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').slice(0, 80);
  } catch (e) {
    console.warn(e);
    s.pdf.error = 'This PDF could not be opened on your phone. It may be protected — try another file or paste the text.';
  }
  s.busy = undefined;
  render();
});

function pickSource(kind: Source) {
  s.sourceError = undefined;
  if (kind === 'photo') {
    s.source = 'photo';
    if (!s.photos.length) cameraInput.click();
    render();
  } else if (kind === 'pdf') {
    pdfInput.click();
  } else {
    s.source = 'text';
    render();
    requestAnimationFrame(() => (document.getElementById('paste') as HTMLTextAreaElement | null)?.focus());
  }
}

function photoPanel() {
  return h(
    'div',
    { class: 'panel' },
    h(
      'ul',
      { class: 'thumbs', 'aria-label': 'Pages' },
      s.photos.map((p, i) =>
        h(
          'li',
          { class: 'thumb' },
          h('img', { src: p.preview, alt: `Page ${i + 1}` }),
          h('span', { class: 'thumb-n' }, String(i + 1)),
          h(
            'button',
            {
              type: 'button',
              class: 'thumb-x',
              'aria-label': `Remove page ${i + 1}`,
              onclick: () => {
                URL.revokeObjectURL(p.preview);
                s.photos.splice(i, 1);
                render();
              },
            },
            icon('close'),
          ),
        ),
      ),
      s.photos.length < MAX_PHOTOS
        ? h('li', null, h('button', { type: 'button', class: 'thumb-add', onclick: () => cameraInput.click() }, icon('plus'), h('span', null, s.photos.length ? 'Add a page' : 'Take a photo')))
        : null,
    ),
    h('button', { type: 'button', class: 'link', onclick: () => libraryInput.click() }, icon('image'), 'Choose from your photos'),
    h('p', { class: 'hint' }, 'Flat, well-lit pages work best. Handwriting is fine.'),
    aiAvailable === false || forceOffline ? errorBox('Reading photos needs the AI service, which is not available right now — paste the text instead.') : null,
  );
}

function pdfPanel() {
  const p = s.pdf;
  if (!p) return null;
  const info = p.info;
  const mb = p.file.size < 1024 * 1024 ? `${Math.max(1, Math.round(p.file.size / 1024))} KB` : `${(p.file.size / 1024 / 1024).toFixed(1)} MB`;
  return h(
    'div',
    { class: 'panel' },
    h(
      'div',
      { class: 'file-card' },
      icon('pdf'),
      h(
        'div',
        null,
        h('strong', null, p.file.name),
        h('small', null, s.busy ? s.busy : p.error ? 'Could not read' : info ? `${plural(info.pages, 'page')} · ${mb}${info.text ? '' : ' · scanned (no text layer)'}` : mb),
      ),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Choose another PDF', onclick: () => pdfInput.click() }, icon('refresh')),
    ),
    errorBox(p.error),
  );
}

function textPanel() {
  const count = h('span', { class: 'count' }, `${s.text.length.toLocaleString('en')} / 60,000`);
  const ta = h('textarea', {
    id: 'paste',
    class: 'paste',
    rows: '9',
    placeholder: 'Paste your notes here — one fact per line works great:\n1914: start of World War I\nAvogadro constant = 6.02 × 10²³ mol⁻¹',
    'aria-label': 'Course text',
    value: s.text,
    oninput: (e: Event) => {
      s.text = (e.target as HTMLTextAreaElement).value;
      count.textContent = `${s.text.length.toLocaleString('en')} / 60,000`;
      count.classList.toggle('over', s.text.length > MAX_TEXT);
      buildBtnSync();
      persist();
    },
  });
  count.classList.toggle('over', s.text.length > MAX_TEXT);
  return h(
    'div',
    { class: 'panel' },
    ta,
    h(
      'div',
      { class: 'row between' },
      h(
        'button',
        {
          type: 'button',
          class: 'link',
          id: 'sample',
          onclick: () => {
            s.text = SAMPLE_COURSE;
            s.title = s.title || 'World War I';
            persist();
            render();
          },
        },
        icon('sparkle'),
        'Try a sample',
      ),
      count,
    ),
  );
}

let buildBtnSync = () => {};

function canBuild(): boolean {
  if (s.busy) return false;
  if (s.source === 'photo') return s.photos.length > 0;
  if (s.source === 'pdf') return !!s.pdf?.info && !s.pdf.error;
  if (s.source === 'text') return s.text.trim().length >= 10 && s.text.length <= MAX_TEXT;
  return false;
}

function renderSource() {
  const build = button([h('span', null, 'Build my palace'), icon('sparkle')], { id: 'build', onclick: () => void startBuild() });
  buildBtnSync = () => {
    build.disabled = !canBuild();
  };
  const details = h(
    'details',
    { class: 'details', open: !!(s.title || s.examDate) },
    h('summary', null, 'Title & exam date', h('small', null, 'optional')),
    h(
      'div',
      { class: 'fields' },
      h(
        'label',
        { class: 'field' },
        h('span', null, 'Palace title'),
        h('input', {
          id: 'title',
          type: 'text',
          maxlength: '80',
          placeholder: 'e.g. WWI — Chapter 3',
          value: s.title,
          oninput: (e: Event) => {
            s.title = (e.target as HTMLInputElement).value;
            persist();
          },
        }),
      ),
      h(
        'label',
        { class: 'field' },
        h('span', null, icon('calendar'), 'Exam date'),
        h('input', {
          id: 'exam',
          type: 'date',
          min: todayIso(),
          value: s.examDate,
          oninput: (e: Event) => {
            s.examDate = (e.target as HTMLInputElement).value;
            persist();
          },
        }),
        h('small', null, 'Your palace will plan reviews so every notion is solid the day before.'),
      ),
    ),
  );
  screen(
    h(
      'section',
      { class: 'hero' },
      h('p', { class: 'eyebrow ok' }, icon('check'), 'Connected to your headset ✨'),
      h('h1', { tabindex: '-1' }, 'Bring your course'),
      h('p', { class: 'lede' }, 'Loci picks the facts worth remembering and imagines a scene for each one.'),
    ),
    h(
      'div',
      { class: 'sources', role: 'group', 'aria-label': 'Course source' },
      sourceCard('photo', 'Take a photo', 'Of your notes or textbook — several pages OK', 'camera'),
      sourceCard('pdf', 'Upload a PDF', 'Slides, handouts, exported notes', 'pdf'),
      sourceCard('text', 'Paste text', 'From your notes app or a website', 'quill'),
    ),
    s.source === 'photo' ? photoPanel() : null,
    s.source === 'pdf' ? pdfPanel() : null,
    s.source === 'text' ? textPanel() : null,
    errorBox(s.sourceError),
    s.source ? details : null,
    s.source ? h('div', { class: 'sticky-cta' }, build) : null,
    s.source ? null : h('p', { class: 'footnote' }, icon('check'), 'No account needed. Your code expires after 30 minutes, and your course is deleted from the Loci server within the hour.'),
    cameraInput,
    libraryInput,
    pdfInput,
  );
  buildBtnSync();
}

// ─── building ────────────────────────────────────────────────────────────────

const TIPS = [
  'Memory champions bind each fact to a place they know by heart.',
  'The stranger the image, the longer it stays.',
  'Tomorrow, only the notions that are due will glow.',
  'Each scene will sit on a real object of your room, left to right from your seat.',
  'Recalling beats re-reading: you will answer, never just look.',
];

async function prepareRequest(): Promise<ExtractRequestIn> {
  const code = s.code!;
  const base = { code, ...(s.title.trim() ? { title: s.title.trim().slice(0, 80) } : {}), ...(forceOffline ? { offline: true } : {}) };
  if (s.source === 'text') return { ...base, kind: 'text', data: s.text };
  if (s.source === 'photo') {
    s.build.note = `Preparing ${plural(s.photos.length, 'photo')}…`;
    renderBuilding();
    const imgs: PreparedImage[] = await fitImages(s.photos.map((p) => p.file));
    imgs.forEach((i) => URL.revokeObjectURL(i.preview));
    return { ...base, kind: 'image', mime: 'image/jpeg', data: imgs[0].data, ...(imgs.length > 1 ? { more: imgs.slice(1).map((i) => i.data) } : {}) };
  }
  // PDF: small → the PDF itself (+ text layer for the offline fallback); big → its text, or page images if scanned
  const p = s.pdf!;
  const text = p.info?.text ?? '';
  if (p.file.size <= DIRECT_PDF_BYTES) {
    const data = await fileToBase64(p.file);
    return { ...base, kind: 'pdf', mime: 'application/pdf', data, ...(text ? { textHint: text.slice(0, 60_000) } : {}) };
  }
  if (text.trim().length >= 200) {
    s.build.note = 'Large PDF — sending its text.';
    return { ...base, kind: 'text', data: text.slice(0, 60_000) };
  }
  const pages = Math.min(p.info?.pages ?? 1, MAX_PHOTOS);
  const imgs: PreparedImage[] = [];
  for (let i = 1; i <= pages; i++) {
    s.build.note = `Scanning page ${i} of ${pages}…`;
    renderBuilding();
    const img = await p.info!.renderPage(i);
    URL.revokeObjectURL(img.preview);
    if (imgs.reduce((t, x) => t + x.data.length, 0) + img.data.length > SAFE_BODY_B64) break;
    imgs.push(img);
  }
  if ((p.info?.pages ?? 0) > imgs.length) toast(`Scanned PDF: sending the first ${plural(imgs.length, 'page')}.`);
  return { ...base, kind: 'image', mime: 'image/jpeg', data: imgs[0].data, ...(imgs.length > 1 ? { more: imgs.slice(1).map((i) => i.data) } : {}) };
}

let buildTicker = 0;

async function startBuild() {
  if (!canBuild()) return;
  s.build = { phase: 'prepare', progress: 0, startedAt: Date.now() };
  s.sourceError = undefined;
  go('building');
  clearInterval(buildTicker);
  buildTicker = window.setInterval(() => updateBuilding(), 1000);
  try {
    const req = await prepareRequest();
    s.build.phase = 'upload';
    renderBuilding();
    const res = await extract(req, {
      onProgress: (f) => {
        s.build.progress = f;
        updateBuilding();
      },
      onUploaded: () => {
        s.build.phase = 'thinking';
        renderBuilding();
      },
    });
    clearInterval(buildTicker);
    if (!res.notions.length) {
      s.sourceError = res.warnings?.join(' ') || 'No facts found in this course.';
      go('source');
      return;
    }
    s.result = { ...res, notions: res.notions.slice(0, MAX_NOTIONS) };
    if (!s.title && res.title) s.title = res.title;
    go('review');
  } catch (e) {
    clearInterval(buildTicker);
    console.warn(e);
    if (e instanceof ApiError && e.kind === 'expired') {
      s.codeError = 'Your pairing code expired while building. Ask your headset for a new one — your text is saved.';
      go('expired');
      return;
    }
    s.sourceError = e instanceof Error ? e.message : String(e);
    go('source');
  }
}

function stepItem(label: string, state: 'done' | 'active' | 'todo', detail?: Node | string | null) {
  return h(
    'li',
    { class: `step ${state}` },
    h('span', { class: 'step-mark' }, state === 'done' ? icon('check') : null),
    h('span', { class: 'step-body' }, h('span', { class: 'step-label' }, label), detail ? h('span', { class: 'step-detail' }, detail) : null),
  );
}

function renderBuilding() {
  const b = s.build;
  const secs = Math.max(0, Math.round((Date.now() - b.startedAt) / 1000));
  const upState = b.phase === 'prepare' || b.phase === 'upload' ? 'active' : 'done';
  const pct = Math.round(b.progress * 100);
  const aiNote = forceOffline ? 'Quick offline build' : 'Usually 10–40 seconds';
  screen(
    h(
      'section',
      { class: 'hero center' },
      h(
        'div',
        { class: 'forge', 'aria-hidden': 'true' },
        h('div', { class: 'arch' }),
        h('div', { class: 'slip s1' }),
        h('div', { class: 'slip s2' }),
        h('div', { class: 'slip s3' }),
        icon('flame', 'forge-flame'),
      ),
      h('h1', { tabindex: '-1' }, 'Building your palace…'),
      h('p', { class: 'lede', id: 'tip' }, TIPS[Math.floor(secs / 6) % TIPS.length]),
    ),
    h(
      'ol',
      { class: 'steps', role: 'status', 'aria-live': 'polite' },
      stepItem(
        b.phase === 'prepare' ? b.note ?? 'Preparing your course' : 'Sending your course',
        upState,
        upState === 'active' && b.phase === 'upload' ? h('span', { class: 'bar' }, h('span', { class: 'bar-fill', style: `width:${pct}%` })) : null,
      ),
      stepItem('Picking the facts that matter & imagining a scene for each', b.phase === 'thinking' ? 'active' : 'todo', b.phase === 'thinking' ? h('span', { id: 'elapsed' }, `${secs} s · ${aiNote}`) : null),
      stepItem('Ready for your review', 'todo'),
    ),
  );
}

function updateBuilding() {
  if (s.step !== 'building') return;
  const secs = Math.max(0, Math.round((Date.now() - s.build.startedAt) / 1000));
  const el = document.getElementById('elapsed');
  if (el) el.textContent = `${secs} s · ${forceOffline ? 'Quick offline build' : 'Usually 10–40 seconds'}`;
  const tip = document.getElementById('tip');
  if (tip) tip.textContent = TIPS[Math.floor(secs / 6) % TIPS.length];
  const fill = app.querySelector('.bar-fill') as HTMLElement | null;
  if (fill) fill.style.width = `${Math.round(s.build.progress * 100)}%`;
}

// ─── review ──────────────────────────────────────────────────────────────────

function updateAnswer(n: Notion, next: string) {
  const prev = n.answer;
  if (fold(prev) === fold(next)) {
    n.answer = next;
    return;
  }
  n.answer = next;
  // a distractor equal to the new answer becomes the old answer (now a plausible wrong one)
  n.distractors = n.distractors.map((d) => (fold(d) === fold(next) ? prev : d)) as [string, string];
  if (fold(n.distractors[0]) === fold(n.distractors[1])) n.distractors[1] = `${n.distractors[1]} ?`;
  n.accept = undefined;
  // keep labels in the scene in sync ("1916" on the plaque)
  for (const a of n.scene.actors) if (a.label && fold(a.label) === fold(prev)) a.label = next.slice(0, 24);
}

function notionCard(n: Notion, i: number) {
  if (s.editing === n.id) {
    const q = h('textarea', { class: 'edit-q', rows: '3', maxlength: '220', value: n.question, 'aria-label': 'Question' }) as HTMLTextAreaElement;
    const a = h('input', { class: 'edit-a', type: 'text', maxlength: '80', value: n.answer, 'aria-label': 'Answer' }) as HTMLInputElement;
    const err = h('p', { class: 'field-error', role: 'alert' });
    const save = () => {
      const qv = q.value.replace(/\s+/g, ' ').trim();
      const av = a.value.replace(/\s+/g, ' ').trim();
      if (qv.length < 3) return void (err.textContent = 'The question needs a few words.');
      if (!av) return void (err.textContent = 'The answer cannot be empty.');
      n.question = qv;
      updateAnswer(n, av);
      s.editing = undefined;
      persist();
      render();
      toast('Notion updated');
    };
    return h(
      'li',
      { class: 'card editing', dataset: { id: n.id } },
      h('span', { class: 'num' }, String(i + 1)),
      h(
        'div',
        { class: 'card-body' },
        h('label', { class: 'field' }, h('span', null, 'Question'), q),
        h('label', { class: 'field' }, h('span', null, 'Answer'), a),
        err,
        h(
          'div',
          { class: 'row end' },
          button('Cancel', { class: 'btn btn-ghost', onclick: () => ((s.editing = undefined), render()) }, 'ghost'),
          button([icon('check'), h('span', null, 'Save')], { class: 'btn btn-primary btn-small save', onclick: save }),
        ),
      ),
    );
  }
  const chips = n.scene.actors.map((a) =>
    h('span', { class: `chip${a.role === 'hero' ? ' chip-hero' : ''}` }, modelName.get(a.model) ?? a.model, a.role === 'count' && a.count && a.count > 1 ? ` ×${a.count}` : '', a.label ? h('em', null, ` “${a.label}”`) : null),
  );
  return h(
    'li',
    { class: 'card', dataset: { id: n.id }, style: n.scene.accent ? `--accent:${n.scene.accent}` : undefined },
    h('span', { class: 'num' }, String(i + 1)),
    h(
      'div',
      { class: 'card-body' },
      h('p', { class: 'q' }, n.question),
      h('p', { class: 'a' }, n.answer),
      h('div', { class: 'scene' }, captionNode(n.scene.caption, n.scene.hooks), h('div', { class: 'chips' }, chips)),
      h('p', { class: 'decoys' }, h('span', null, 'Decoys'), ` ${n.distractors[0]} · ${n.distractors[1]}`),
      h(
        'div',
        { class: 'card-actions' },
        h('button', { type: 'button', class: 'icon-btn edit', 'aria-label': `Edit notion ${i + 1}`, onclick: () => ((s.editing = n.id), render(), focusEdit()) }, icon('edit'), h('span', null, 'Edit')),
        h('button', { type: 'button', class: 'icon-btn delete', 'aria-label': `Delete notion ${i + 1}`, onclick: () => removeNotion(n.id) }, icon('trash'), h('span', null, 'Delete')),
      ),
    ),
  );
}

function focusEdit() {
  requestAnimationFrame(() => (app.querySelector('.card.editing textarea') as HTMLElement | null)?.focus());
}

function removeNotion(id: string) {
  const r = s.result!;
  const index = r.notions.findIndex((n) => n.id === id);
  if (index < 0) return;
  const [removed] = r.notions.splice(index, 1);
  persist();
  render();
  toast('Notion removed', {
    label: 'Undo',
    run: () => {
      r.notions.splice(Math.min(index, r.notions.length), 0, removed);
      persist();
      render();
    },
  });
}

function renderReview() {
  const r = s.result!;
  const count = r.notions.length;
  const warnings = [...(r.warnings ?? [])];
  if (r.engine === 'offline' && !warnings.some((w) => /offline|without AI/i.test(w))) warnings.unshift('Built offline, without AI — check each notion.');
  const send = button([icon('send'), h('span', null, count ? `Send ${plural(count, 'notion')} to headset` : 'Nothing to send')], {
    id: 'send',
    disabled: count === 0 || s.step === 'sending',
    onclick: () => void doSend(),
  });
  if (s.step === 'sending') send.replaceChildren(h('span', { class: 'spinner small' }), h('span', null, 'Sending…'));
  screen(
    h(
      'section',
      { class: 'hero' },
      h('p', { class: 'eyebrow' }, r.engine === 'ai' ? 'Composed by Claude' : 'Offline build', ' · ', r.subject),
      h(
        'div',
        { class: 'title-row' },
        h('h1', { tabindex: '-1', class: 'palace-title' }, s.title || r.title),
        h('span', { class: `badge${count >= MAX_NOTIONS ? ' full' : ''}`, 'aria-label': `${count} of ${MAX_NOTIONS} notions` }, `${count}/${MAX_NOTIONS}`),
      ),
      h('p', { class: 'lede' }, 'Keep what you need to know by heart. Edit anything that looks off — you can delete freely.'),
    ),
    warnings.length ? h('div', { class: 'alert alert-warn' }, icon('warn'), h('div', null, warnings.map((w) => h('p', null, w)))) : null,
    h('ol', { class: 'cards', 'aria-label': 'Notions' }, r.notions.map((n, i) => notionCard(n, i))),
    count === 0 ? h('p', { class: 'empty' }, 'All notions removed. Start over to import another course.') : null,
    errorBox(s.sendError),
    h('div', { class: 'sticky-cta' }, send),
    h(
      'button',
      {
        type: 'button',
        class: 'link center',
        onclick: () => {
          if (count && !confirm('Discard these notions and import another course?')) return;
          s.result = undefined;
          s.editing = undefined;
          go('source');
        },
      },
      icon('back'),
      'Start over with another course',
    ),
  );
}

async function doSend() {
  const r = s.result;
  if (!r || !r.notions.length || !s.code) return;
  s.sendError = undefined;
  s.editing = undefined;
  s.step = 'sending';
  render();
  try {
    await sendPalace(s.code, {
      id: '',
      title: (s.title || r.title).slice(0, 80),
      subject: r.subject.slice(0, 40) || 'Course',
      lang: r.lang,
      ...(s.examDate ? { examDate: s.examDate } : {}),
      notions: r.notions,
    });
    go('done');
  } catch (e) {
    if (e instanceof ApiError && e.kind === 'expired') {
      s.codeError = 'Your pairing code expired. Ask your headset for a new code — your notions are saved on this phone.';
      go('expired');
      return;
    }
    s.sendError = e instanceof Error ? e.message : String(e);
    s.step = 'review';
    render();
  }
}

// ─── done ────────────────────────────────────────────────────────────────────

function examLine(iso: string): string | null {
  const days = Math.round((Date.parse(`${iso}T00:00:00`) - Date.parse(`${todayIso()}T00:00:00`)) / 86_400_000);
  if (!Number.isFinite(days) || days < 0) return null;
  if (days === 0) return 'Exam today — a last review is planned.';
  return `Exam in ${plural(days, 'day')} — reviews are planned so every notion is solid the day before.`;
}

function renderDone() {
  const r = s.result;
  const n = r?.notions.length ?? 0;
  const exam = s.examDate ? examLine(s.examDate) : null;
  screen(
    h(
      'section',
      { class: 'hero center done' },
      h(
        'div',
        { class: 'arrival', 'aria-hidden': 'true' },
        h('div', { class: 'rays' }),
        h('span', { class: 'spark p1' }),
        h('span', { class: 'spark p2' }),
        h('span', { class: 'spark p3' }),
        h('span', { class: 'spark p4' }),
        icon('headset', 'arrival-headset'),
        icon('flame', 'arrival-flame'),
      ),
      h('p', { class: 'eyebrow ok' }, icon('check'), 'Sent to your headset'),
      h('h1', { tabindex: '-1' }, 'Look up — your palace is arriving'),
      h('p', { class: 'lede' }, 'Put your headset back on. Each notion will appear in your hands, ready to be placed on an object of your room.'),
    ),
    r
      ? h(
          'div',
          { class: 'summary' },
          h('div', { class: 'summary-head' }, h('strong', null, s.title || r.title), h('span', { class: 'badge' }, plural(n, 'notion'))),
          h(
            'ul',
            { class: 'summary-list' },
            r.notions.slice(0, 3).map((x) => h('li', null, captionNode(x.scene.caption, x.scene.hooks))),
            n > 3 ? h('li', { class: 'more' }, `+ ${n - 3} more`) : null,
          ),
          exam ? h('p', { class: 'summary-exam' }, icon('calendar'), exam) : null,
        )
      : null,
    h(
      'div',
      { class: 'stack' },
      button([icon('plus'), h('span', null, 'Import another course')], {
        onclick: () => {
          s.result = undefined;
          s.text = '';
          s.title = '';
          s.examDate = '';
          s.source = null;
          s.photos = [];
          s.pdf = undefined;
          clearDraft();
          void connect(s.code!);
        },
      }, 'secondary'),
    ),
  );
}

// ─── render & boot ───────────────────────────────────────────────────────────

function render() {
  switch (s.step) {
    case 'code':
      return renderCode();
    case 'checking':
      return renderChecking();
    case 'expired':
      return renderExpired();
    case 'source':
      return renderSource();
    case 'building':
      return renderBuilding();
    case 'review':
    case 'sending':
      return renderReview();
    case 'done':
      return renderDone();
  }
}

function boot() {
  fetch('/api/health')
    .then((r) => r.json())
    .then((j: { ai?: boolean }) => {
      aiAvailable = !!j.ai;
    })
    .catch(() => {});
  const fromUrl = cleanCode(params.get('c') ?? params.get('code') ?? location.pathname.replace(/^\/+|\/+$/g, '').replace(/^import$/, ''));
  if (fromUrl.length === 4) void connect(fromUrl);
  else {
    const d = loadDraft(null);
    if (d?.code) s.code = d.code;
    render();
  }
  (window as unknown as { __shotReady: boolean }).__shotReady = true;
}

boot();
