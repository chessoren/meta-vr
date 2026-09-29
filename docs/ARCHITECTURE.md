# Loci — Architecture

Read `docs/BRIEF.md` first (the product). This file is the engineering contract.

## Stack
- **WebXR** via **Immersive Web SDK 1.0** (`@iwsdk/core`, built on Three.js r181 "super-three").
  `three` is aliased to `super-three@0.181.0` and deduped, so `import * as THREE from 'three'` and `@iwsdk/core` share one instance.
- **Vite** multi-page app, **TypeScript strict**. **Vitest** for unit tests, **Playwright + IWER** (Meta's WebXR emulator, `iwer` + `@iwer/sem` synthetic Meta Scene rooms) for end-to-end tests in headless Chromium (SwiftShader WebGL2).
- **Vercel**: static `dist/` + one catch-all Node function `api/[...route].ts` → `server/routes.ts`.

## Pages
| URL | Entry | Who |
|---|---|---|
| `/` | `index.html` → `src/landing/*` | Landing page (marketing) |
| `/app/` | `app/index.html` → `src/app/main.ts` | Headset experience (WebXR immersive-ar) |
| `/import/?c=CODE` (and `/CODE` rewrite) | `import/index.html` → `src/phone/*` | Phone companion (course import & validation) |
| `/gallery/` | `gallery/index.html` → `src/lib3d/gallery.ts` | Dev QA of the 3D library |

`/app/?emu=living_room[&device=quest2|quest3|glasses]` installs IWER + a synthetic room (dev & tests only; dynamic import, never on device).

## Source layout & ownership
```
src/core/        PURE TS (no DOM/Three). Domain types + logic shared by headset, phone, server, tests.
  types.ts         ← the domain contract (do not change shapes without updating all users)
  srs.ts           spaced repetition (SM-2 variant, exam-aware)
  tiers.ts         new/fragile/solid/anchored
  planner.ts       exam countdown plan (what to review / how many new today)
  route.ts         left→right route ordering from the seat
  matching.ts      answer normalisation & fuzzy matching (voice + typed), number words
  registration.ts  rigid 2D (yaw + XZ translation) room alignment from matched furniture
  mnemonic.ts      offline scene composer (keywords/sound-alikes → SceneRecipe from the catalog index)
  catalog-index.ts pure data mirror of the model catalog (id, tags, soundsLike, text, anims) for server/offline use
  palaces/         built-in palaces: capitals.ts (5, onboarding), ww.ts (WWI & WWII, 20)
  storage.ts       versioned persistence schema + migrations (pure; adapters live in app)
src/lib3d/       Procedural low-poly model library (Three.js)
  kit.ts           construction kit: palette, shared materials, primitives, merge, normalize, text planes
  spec.ts          ModelSpec contract + joint naming convention
  catalog.ts       registry; REQUIRED_IDS is the id contract
  models/*.ts      one file per category
  anims.ts         AnimId → procedural animation (root motion + joint secondary motion), intensity k
  compose.ts       SceneRecipe → ComposedScene { root, update(dt,t), setIntensity, setAppearance, dispose }
  flame.ts         the guide character (hero art)
  fx/*.ts          halos, glows, tier trophies (plant, crystal, gold), sparkles, dissolves
  gallery.ts       QA page
src/audio/       Procedural Web Audio engine (no files)
src/app/         Headset app: state machine, room understanding, input, placement, recall, UI, voice, persistence
src/phone/       Phone companion UI
src/landing/     Landing page
server/          API handlers (framework-agnostic) + storage + Claude extraction
api/             Vercel entry (catch-all)
tests/unit/      Vitest
tests/e2e/       Playwright + IWER
docs/            Brief, architecture, Devpost, video script, test protocol
scripts/         shoot.mjs (screenshot any page headlessly), helpers
```

## Rules for every contributor (humans and agents)
1. **Stay in your area.** Only edit files you own for your task. If you need a change elsewhere, write it down in your final report instead.
2. **No `git commit` / `git push`** — the lead integrates and commits.
3. **Do not run `npm install`** of new packages without being told; preinstalled: `@iwsdk/core`, `three`(super-three), `iwer`, `@iwer/sem`, `qrcode-generator`, `pdfjs-dist`, `@anthropic-ai/sdk`, `@lichess-org/vosk-browser`, `@fontsource/fraunces`, `@fontsource/inter`, `vitest`, `@playwright/test`.
4. `npx tsc --noEmit` must pass for your files. `npx vitest run` must pass.
5. Pure code in `src/core` — no DOM, no Three, no Node APIs.
6. Headless screenshots: a dev server may be running on port 5174 (`npx vite --port 5174 --strictPort` if not). `node scripts/shoot.mjs "<path>" out.png [w h]` saves a PNG; view it with the Read tool. Chromium: `/opt/pw-browsers/chromium` (do not run `playwright install`).
7. Performance budget (Quest 2, stereo, 72 Hz): whole frame ≤ 150 draw calls and ≤ 150k triangles with 20 scenes placed. A library model: ≤ 2 000 tris, ≤ 6 meshes. No per-frame allocations in update loops. No real-time shadows. No post-processing.
8. The FOV of Meta VR Glasses is ~70°×66°: anything the learner must read sits within ±20° of gaze centre, 0.45–0.8 m away. All interactions within 60 cm of a seated user.
9. English UI. French course content must render (accents) and match (accent-insensitive).

## Runtime model (headset)
- Session: `immersive-ar`, features: hand-tracking (required), anchors, plane-detection, mesh-detection, hit-test, gaze-tracking (optional).
- Room understanding reads `frame.detectedMeshes` (bounded 3D boxes with `semanticLabel`: table, couch, shelf, lamp, screen, plant, bed, …) and `frame.detectedPlanes` (walls, floor, window, door, wall art). Labels arrive lower-case with spaces.
- **Persistence frame**: positions are stored in a *room frame*. Each session computes `session ← room` from matched furniture (`core/registration.ts`); fallback: a persistent WebXR anchor; fallback: identity.
- Placements are stored **relative to their furniture** (`Placement.local`) so they follow the object if registration shifts.
- State machine: `boot → (first run) onboarding | (returning) session`; onboarding: flame-hello → pinch-lesson → scan → place×5 → lights-out → recall×5 → proof. Session: reload → due glow → recall loop → place new → summary.
- Persistence: `localStorage` (small JSON, versioned). Save on every state change + on `visibilitychange`/`session end` → pause/resume returns to the exact step.

## API (server/routes.ts)
| Route | Method | Body / query | Returns |
|---|---|---|---|
| `/api/health` | GET | – | `{ok}` |
| `/api/pair` | POST | – | `{code, secret}` (headset creates a pairing slot, 4 letters, 30 min TTL) |
| `/api/pair` | GET | `?code` | `{status}` (phone checks the code) |
| `/api/extract` | POST | `ExtractRequest` | `ExtractResponse` (Claude if `ANTHROPIC_API_KEY`, else offline heuristic) |
| `/api/palace` | POST | `{code, palace}` | `{ok}` (phone sends the validated palace) |
| `/api/palace` | GET | `?code&secret` | `{status, palace?}` (headset polls) |

Storage: Upstash Redis REST if `KV_REST_API_URL`/`KV_REST_API_TOKEN` (Vercel KV / Upstash integration) or `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` are set; otherwise in-memory (dev/tests).
