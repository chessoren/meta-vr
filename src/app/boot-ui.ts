/**
 * The 2D page shown before entering immersive mode (and after exiting): one big pinchable
 * button, the flame, the name. Designed to be pressed with a hand ray in the Quest Browser.
 */
import '@fontsource/fraunces/600.css';
import '@fontsource/fraunces/800.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';

const CSS = `
#boot{position:fixed;inset:0;display:grid;place-items:center;background:radial-gradient(ellipse at 50% 38%,#4a2e18 0%,#24160c 55%,#140d08 100%);color:#f6e7c8;font-family:Inter,system-ui,sans-serif;z-index:10;transition:opacity .5s}
#boot.hidden{opacity:0;pointer-events:none}
#boot .wrap{display:flex;flex-direction:column;align-items:center;gap:18px;text-align:center;padding:24px}
#boot .flame{width:120px;height:150px;filter:drop-shadow(0 0 28px #ffb34799)}
#boot h1{font:800 88px/1 Fraunces,Georgia,serif;letter-spacing:.02em;margin:0;color:#fbe6b6}
#boot p.tag{font:600 24px Fraunces,Georgia,serif;margin:0;color:#e9b949;font-style:italic}
#boot button{margin-top:18px;font:600 30px Inter,system-ui,sans-serif;padding:26px 64px;border-radius:999px;border:0;background:linear-gradient(180deg,#ffd27a,#e9a13b);color:#2b1d14;box-shadow:0 10px 40px #e9a13b66,inset 0 -3px 0 #0002;cursor:pointer;min-width:360px}
#boot button:hover{filter:brightness(1.08)}
#boot button:disabled{opacity:.5}
#boot .hint{font-size:17px;color:#cdb58f;opacity:.85}
#boot .err{max-width:560px;font-size:18px;color:#ffcf9e;line-height:1.45}
#boot a{color:#ffd27a}
#boot .reset{margin-top:26px;background:none;border:0;color:#cdb58f;opacity:.6;font:500 15px Inter,system-ui,sans-serif;cursor:pointer;text-decoration:underline;text-underline-offset:3px}
#boot .reset.armed{opacity:1;color:#ffb27a}
@keyframes flick{0%,100%{transform:scale(1,1) translateY(0)}50%{transform:scale(1.04,.96) translateY(2px)}}
#boot .flame path{transform-origin:60px 140px;animation:flick 1.6s ease-in-out infinite}
@media (prefers-reduced-motion:reduce){#boot .flame path{animation:none}}
`;

const FLAME = `<svg class="flame" viewBox="0 0 120 150" aria-hidden="true"><defs>
<radialGradient id="fg" cx="50%" cy="70%" r="65%"><stop offset="0" stop-color="#fff6d6"/><stop offset=".35" stop-color="#ffd27a"/><stop offset=".7" stop-color="#ff8a3a"/><stop offset="1" stop-color="#d9483b"/></radialGradient></defs>
<path d="M60 8C72 40 104 58 100 98c-3 28-22 44-40 44S23 126 20 98C17 70 38 60 44 36c4 14 10 22 18 26C62 42 58 26 60 8z" fill="url(#fg)"/>
<ellipse cx="48" cy="96" rx="6" ry="8" fill="#2b1d14"/><ellipse cx="72" cy="96" rx="6" ry="8" fill="#2b1d14"/>
<circle cx="50" cy="93" r="2" fill="#fff"/><circle cx="74" cy="93" r="2" fill="#fff"/></svg>`;

export interface BootUI {
  el: HTMLElement;
  /** Show a discreet "Start over" (erase all palaces) with a two-tap confirmation. */
  offerReset(onReset: () => void): void;
  setReady(onEnter: () => void, label?: string): void;
  setError(html: string): void;
  setStatus(text: string): void;
  hide(): void;
  show(label?: string): void;
}

export function createBootUI(): BootUI {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const el = document.getElementById('boot') ?? document.body.appendChild(Object.assign(document.createElement('div'), { id: 'boot' }));
  el.innerHTML = `<div class="wrap">${FLAME}<h1>Loci</h1><p class="tag">your room remembers</p>
    <button id="enter" disabled>Loading…</button><div class="hint" id="boot-hint">Hands only · stay seated · about 5 minutes</div><div class="err" id="boot-err"></div><button class="reset" id="boot-reset" hidden>Start over</button></div>`;
  const btn = el.querySelector<HTMLButtonElement>('#enter')!;
  const err = el.querySelector<HTMLElement>('#boot-err')!;
  const hint = el.querySelector<HTMLElement>('#boot-hint')!;
  let handler: (() => void) | null = null;
  btn.addEventListener('click', () => handler?.());
  const reset = el.querySelector<HTMLButtonElement>('#boot-reset')!;
  return {
    el,
    offerReset(onReset) {
      reset.hidden = false;
      let armed = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      reset.onclick = () => {
        if (!armed) {
          armed = true;
          reset.classList.add('armed');
          reset.textContent = 'Tap again to erase your palaces and progress';
          timer = setTimeout(() => {
            armed = false;
            reset.classList.remove('armed');
            reset.textContent = 'Start over';
          }, 4000);
          return;
        }
        clearTimeout(timer);
        onReset();
      };
    },
    setReady(onEnter, label = 'Enter your palace') {
      handler = onEnter;
      btn.disabled = false;
      btn.textContent = label;
    },
    setError(html) {
      err.innerHTML = html;
    },
    setStatus(text) {
      hint.textContent = text;
    },
    hide() {
      el.classList.add('hidden');
    },
    show(label) {
      el.classList.remove('hidden');
      if (label) btn.textContent = label;
    },
  };
}
