<p align="center">
  <img src="public/icon.svg" width="96" height="96" alt="Loci">
</p>

<h1 align="center">Loci</h1>
<p align="center"><b>Your room remembers.</b><br>
A mixed-reality memory palace for Meta Quest and Meta VR Glasses.</p>

---

Loci turns your **real bedroom** into a memory palace. Import your course from your phone tonight. Each fact becomes a small, absurd 3D scene that you pinch and set on a real object: your lamp, your shelf, your window. Tomorrow the scenes are gone, but your objects glow. Look at one, answer aloud or with a pinch, and the scene springs back to life. Spaced repetition decides what glows each day, so every notion is solid before your exam.

It combines the three things memory research keeps pointing to: **real spatial anchoring** (the 2,500-year-old method of loci), **vivid mnemonic images**, and **active spaced recall**. It's hands only, seated, and within 60 cm. It works without the AI.

> Built for the **Meta VR Start Developer Competition 2026**, Productivity track, New Experience division.
> Product brief: [`docs/BRIEF.md`](docs/BRIEF.md) · Engineering contract: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

## Screenshots

<!-- MEDIA PLACEHOLDER: replace with REAL in-headset captures (never AI-generated). Put the files in public/media/. -->
| First five minutes | Placing a scene | Recall |
|---|---|---|
| `public/media/step-import.jpg` *(to capture)* | `public/media/step-place.jpg` *(to capture)* | `public/media/step-recall.jpg` *(to capture)* |

Landing page renders: `test-results/landing-desktop.png`, `test-results/landing-mobile.png` (regenerate with the commands below).

## Quick start

Requirements: **Node ≥ 22.12**.

```bash
npm install
npm run dev
```

| Page | URL (dev) | What |
|---|---|---|
| Landing | http://localhost:5173/ | Marketing page |
| Headset app | http://localhost:5173/app/?emu=living_room | The full mixed-reality app on desktop, with Meta's WebXR emulator (IWER) and a synthetic Meta Scene room |
| Phone companion | http://localhost:5173/import/?c=CODE | Course import & validation (the headset shows the code) |
| 3D gallery | http://localhost:5173/gallery/ | QA of the procedural model library |

Emulation options (dev and tests only, never loaded on a device):
- `?emu=living_room | office_small | office_large | music_room | meeting_room | empty`
- `&device=quest2 | quest3 | glasses` (`glasses` = the ~70° field of view of Meta VR Glasses)

The API (`/api/*`) runs inside the Vite dev server with the same handlers Vercel uses, so `npm run dev` is full-stack. Without an API key, the offline splitter and scene composer are used.

### On a Meta Quest

WebXR needs **HTTPS**, so deploy first:

1. **Deploy to Vercel.** Import the repo in Vercel (framework: *Other*; `vercel.json` already sets `npm run build` → `dist/` and the API function), or run `npx vercel` / `npx vercel --prod` from the repo.
2. On the headset: finish **Space Setup** for the room (draw desk, bed, shelf, lamp, window…), and turn on **hand tracking**.
3. Open `https://<your-domain>/app/` in **Meta Quest Browser** and tap **Enter**. Allow hand tracking and spatial data, and the microphone for voice answers.
4. **Install as an app (PWA):** in Quest Browser, open the page menu and choose *Install app* / *Add to library* **[verify: wording on the current OS]**. Loci then launches from your app library, full screen, with its own icon. The manifest is `public/manifest.webmanifest` (scope `/app/`).

For quick local testing on the headset, you can also forward the dev server over USB (`adb reverse tcp:5173 tcp:5173`, then open `http://localhost:5173/app/`; localhost counts as a secure context).

### Voice model (optional)

Voice answers use Vosk in the browser (English, grammar-constrained). The model archive is not in git (`public/models/vosk-*` is ignored):

- Put `vosk-model-small-en-us-0.15.tar.gz` in `public/models/`, or point `VITE_VOSK_MODEL_URL` at a hosted copy.
- The official models are at <https://alphacephei.com/vosk/models> (they're distributed as `.zip`; repack the folder as `.tar.gz` for vosk-browser). See `src/app/voice/voice.ts`.
- Without the model, Loci simply offers the three answer bubbles.

## Environment variables

Set these in Vercel (Project → Settings → Environment Variables) or in `.env.local` for dev. **All are optional.**

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Enables Claude for course splitting and mnemonic scene composition. Without it, the offline engine is used. |
| `LOCI_MODEL` | `claude-sonnet-5-5` | Claude model id. |
| `LOCI_EFFORT` | `low` | `low` / `medium` / `high` reasoning effort. |
| `LOCI_AI_TIMEOUT_MS` | `25000` | Timeout of the splitter call. |
| `LOCI_SCENE_TIMEOUT_MS` | `20000` | Timeout of each scene-composition call. |
| `LOCI_AI_BUDGET_MS` | `52000` | Total AI budget per import before falling back to offline. |
| `LOCI_FALLBACKS` | on | `off` disables the offline fallback (debugging only). |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | — | Vercel KV / Upstash Redis REST (pairing codes and palaces in transit). |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | — | Same, if you use the Upstash integration names. Without either pair: in-memory storage (fine for dev, **not** for multi-instance production). |
| `VITE_PUBLIC_URL` | `location.origin` | Base URL the headset shows for pairing (QR + short link). |
| `VITE_VOSK_MODEL_URL` | `/models/vosk-model-small-en-us-0.15.tar.gz` | Where the headset downloads the voice model. |

## Testing

```bash
npx tsc --noEmit        # type check (strict)
npx vitest run          # unit tests: SRS, tiers, planner, route, registration, matching, offline composer, storage
npx playwright test     # end-to-end: headless Chromium + IWER emulator + synthetic Meta Scene rooms
npm run check           # typecheck + unit tests
```

Screenshots of any page (a dev server must run on :5174: `npx vite --port 5174 --strictPort`):

```bash
node scripts/shoot.mjs "/" test-results/landing-desktop.png 1440 2400
node scripts/shoot.mjs "/" test-results/landing-mobile.png 390 2400
node scripts/shoot.mjs "/gallery/?id=kangaroo&t=1" test-results/kangaroo.png
node scripts/shoot.mjs "/app/?emu=living_room&device=glasses" test-results/glasses.png
```

Listen to every procedural sound: `node scripts/render-audio.mjs` → `test-results/audio/*.wav`.

The on-device QA checklist and the learning-study protocol are in [`docs/TEST_PROTOCOL.md`](docs/TEST_PROTOCOL.md).

## Project structure

```
index.html            landing page (Vite entry "landing") → src/landing/
app/index.html        headset app → src/app/main.ts
import/index.html     phone companion → src/phone/
gallery/index.html    3D library QA → src/lib3d/gallery.ts
src/core/             pure TypeScript domain logic (types, SRS, tiers, planner, route, registration, matching, mnemonic composer, built-in palaces, storage)
src/lib3d/            procedural low-poly model library, animations, scene composer, the flame, FX
src/audio/            procedural Web Audio engine (ambience, cues, flame voice, per-object motifs)
src/app/              headset app: state machine, room understanding, hands, placement, recall, voice, persistence
src/phone/            phone companion UI
src/landing/          landing page (vanilla TS + CSS, local fonts)
server/               API handlers (pairing, extraction with Claude + offline fallback, storage)
api/                  Vercel catch-all function → server/routes.ts
public/               icon.svg, manifest.webmanifest, media/ (real captures), models/ (voice model, not in git)
tests/unit, tests/e2e Vitest and Playwright + IWER
docs/                 BRIEF, ARCHITECTURE, DEVPOST, VIDEO_SCRIPT, TEST_PROTOCOL
scripts/              shoot.mjs (screenshots), render-audio.mjs (sound renders)
```

Ownership rules, performance budgets and the runtime model are in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Landing page media

The landing page (`/`) looks finished without media: every slot has a drawn CSS/SVG fallback. To swap in **real** captures, put the files in `public/media/` and flip `ready: true` in `src/landing/media.ts`:

| Slot | File | Format |
|---|---|---|
| hero | `hero-loop.mp4` + `hero-poster.jpg` | 4:5, ~8 s seamless loop, muted |
| import | `step-import.jpg` | 4:3 |
| place | `step-place.jpg` | 4:3 |
| recall | `step-recall.jpg` | 4:3 |
| room | `room-filled.jpg` | 16:9 |

Preview all slots with `/?media=all`, or see where each slot sits with `/?media=debug`. Add an `og:image` (`/media/og.jpg`, 1200×630) in `index.html` once captured.

## Icons

`public/icon.svg` is the master icon: a small warm flame inside an arched doorway, drawn within the 80 % maskable safe zone. The manifest currently uses the SVG, which Quest Browser and Chromium accept. To also ship PNGs (recommended for store listings and older installers), export them with the preinstalled Chromium while the dev server runs on :5174:

```bash
node --input-type=module -e "
import { chromium } from '@playwright/test';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [name, size, bg] of [['icon-192.png', 192, null], ['icon-512.png', 512, null], ['icon-maskable-512.png', 512, '#140d08']]) {
  const p = await b.newPage({ viewport: { width: size, height: size } });
  await p.setContent('<body style=\"margin:0;background:' + (bg ?? 'transparent') + '\"><img src=\"http://localhost:5174/icon.svg\" width=' + size + ' height=' + size + ' style=\"display:block\"></body>');
  await p.waitForLoadState('networkidle');
  await p.screenshot({ path: 'public/' + name, omitBackground: !bg });
}
await b.close();"
```

Then add them to `public/manifest.webmanifest`:

```json
{ "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
{ "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
{ "src": "/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
```

(Alternatives: `rsvg-convert -w 512 public/icon.svg > public/icon-512.png`, or Inkscape / Figma export.)

## Principles

- **Hands only**, seated, everything within 60 cm; essentials within ±20° for narrow fields of view.
- **No downloaded assets**: every model, animation and sound is procedural.
- **The AI serves the method**: Claude splits courses and composes scenes from a fixed library, and an offline twin covers everything. "Remove the third-party service — is there still a project?" **Yes.**
- **No streaks, no guilt**: progress is a room that fills with what you know.
- **Video honesty**: in-headset footage is always a real capture. Never AI-generated.

## License

**MIT is suggested.** It's pending a decision by the project lead; no `LICENSE` file has been added yet. Fonts: Fraunces and Inter (SIL Open Font License, via @fontsource).
