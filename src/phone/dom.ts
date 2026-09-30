/** Minimal DOM helpers (no framework). All user/AI text goes through textContent — never innerHTML. */

type Child = Node | string | number | false | null | undefined;
type Props = Record<string, unknown> & { class?: string; dataset?: Record<string, string> };

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props | null = null, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k === 'html') el.innerHTML = String(v); // trusted constants only (icons)
      else if (k === 'value') (el as HTMLInputElement).value = String(v);
      else if (k in el && typeof v !== 'string') (el as unknown as Record<string, unknown>)[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children.flat()) {
    if (c === undefined || c === null || c === false) continue;
    el.append(typeof c === 'number' ? String(c) : c);
  }
  return el;
}

/** Inline SVG icon from the constant set below. */
export function icon(name: keyof typeof ICONS, cls = 'icon'): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = cls;
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = ICONS[name];
  return s;
}

const stroke = (d: string, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;

export const ICONS = {
  camera: stroke('<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.3l1.4-2h5.6l1.4 2h1.3A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z"/><circle cx="12" cy="12.5" r="3.6"/>'),
  pdf: stroke('<path d="M14 3H7.5A2.5 2.5 0 0 0 5 5.5v13A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V8z"/><path d="M14 3v5h5"/><path d="M8.5 13.5h7M8.5 17h5"/>'),
  quill: stroke('<path d="M20 4c-6 .5-11 4.5-13 11l-1.5 5"/><path d="M20 4c-1 5.5-4.5 9.5-10.5 11"/><path d="M9.5 10.5h4"/>'),
  edit: stroke('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
  trash: stroke('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>'),
  check: stroke('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  close: stroke('<path d="M6 6l12 12M18 6L6 18"/>'),
  plus: stroke('<path d="M12 5v14M5 12h14"/>'),
  send: stroke('<path d="M4 12l16-8-6 16-2.5-6.5z"/><path d="M11.5 13.5L20 4"/>'),
  sparkle: stroke('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18"/>'),
  back: stroke('<path d="M15 5l-7 7 7 7"/>'),
  warn: stroke('<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.5v.01"/>'),
  calendar: stroke('<rect x="4" y="5.5" width="16" height="14.5" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>'),
  image: stroke('<rect x="4" y="4.5" width="16" height="15" rx="2.5"/><circle cx="9" cy="9.5" r="1.6"/><path d="M5 18l5-5 3.5 3.5L16 14l3 3"/>'),
  headset: stroke('<path d="M3.5 10.5a2.5 2.5 0 0 1 2.5-2.5h12a2.5 2.5 0 0 1 2.5 2.5v4a2.5 2.5 0 0 1-2.5 2.5h-2.6a2 2 0 0 1-1.7-1l-.6-1a1.3 1.3 0 0 0-2.2 0l-.6 1a2 2 0 0 1-1.7 1H6a2.5 2.5 0 0 1-2.5-2.5z"/>'),
  refresh: stroke('<path d="M19 11a7 7 0 1 0-2 5"/><path d="M19 5v6h-6"/>'),
  flame:
    '<svg viewBox="0 0 64 80" aria-hidden="true"><defs><linearGradient id="fo" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#c9491f"/><stop offset=".55" stop-color="#ec8a36"/><stop offset="1" stop-color="#f7bf52"/></linearGradient><linearGradient id="fi" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fff5de"/><stop offset="1" stop-color="#f8d65a"/></linearGradient></defs><path fill="url(#fo)" d="M32 4c4 12 22 22 22 44a22 22 0 0 1-44 0c0-10 5-16 10-21 1 7 4 10 7 11-2-12 1-24 5-34z"/><path fill="url(#fi)" d="M32 36c2 6 11 10 11 20a11 11 0 0 1-22 0c0-5 3-8 5-10 .5 3 2 5 3.5 5.5C28.5 46 30 41 32 36z"/></svg>',
} as const;

export function clear(el: Element) {
  while (el.firstChild) el.firstChild.remove();
}

/**
 * Caption with hook words emphasised: explicit hooks + ALL-CAPS words become <mark class="hook">.
 */
export function captionNode(caption: string, hooks: string[] = []): HTMLElement {
  const p = h('p', { class: 'caption' });
  const hookSet = new Set(hooks.map((x) => x.toLocaleLowerCase()));
  const parts = caption.split(/([\p{L}\p{N}'’-]+)/u);
  for (const part of parts) {
    if (!part) continue;
    const isWord = /[\p{L}\p{N}]/u.test(part);
    const caps = isWord && part.length >= 2 && part === part.toLocaleUpperCase() && /\p{Lu}/u.test(part);
    if (isWord && (caps || hookSet.has(part.toLocaleLowerCase()))) p.append(h('mark', { class: 'hook' }, part));
    else p.append(part);
  }
  return p;
}
