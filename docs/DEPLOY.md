# Deploying Loci

## 1. Vercel (≈ 1 minute)
1. <https://vercel.com/new> → **Import** the GitHub repo `chessoren/meta-vr` (branch `claude/palais-memoire-competition-ov2256` or `main` once merged).
2. Framework preset: **Other**. Leave build settings empty — `vercel.json` runs `npm run build:vercel`, which produces `.vercel/output` (Build Output API v3):
   - `static/` — landing `/`, headset app `/app/`, phone companion `/import/` (+ the short `/<CODE>` route), dev pages;
   - `functions/api.func` — the whole API bundled by esbuild into one Node 22 function (`/api/*`).
3. **Storage (required for pairing in production):** Project → *Storage* → add **Upstash for Redis** (a.k.a. Vercel KV). It injects `KV_REST_API_URL` / `KV_REST_API_TOKEN`; without it each function instance has its own memory and the phone ↔ headset pairing can fail.
4. **AI (optional but recommended):** Project → Settings → Environment Variables → `ANTHROPIC_API_KEY`. Optional: `LOCI_MODEL` (default `claude-sonnet-5-5`). Without a key, imports use the offline splitter and scene composer (text & PDF text only; photos need the AI).
5. Redeploy. Check `https://<domain>/api/health` → `{"ok":true,"ai":true,"storage":"upstash"}`.

## 2. On the Quest (2, 3, 3S)
1. Settings → Physical space → **Space Setup** in the bedroom (walls, desk, bed, shelf, lamp…). Loci also offers Meta's room capture itself when a room was never mapped, and falls back to hand-placed lanterns on the walls.
2. Settings → Movement tracking → **Hand tracking** on (controllers are never needed).
3. Quest Browser → `https://<domain>/app/` → **Begin**. Accept hand tracking + spatial data (and the microphone if you enable voice).
4. Install it: page menu → *Install app* / *Add to library*. It then starts straight into mixed reality from the library and works offline after the first launch.

## 3. The phone
The headset shows a 4-letter code and `https://<domain>/<CODE>`. Open that on the phone (camera QR scanning is not possible from inside the headset, hence the big code), paste text / pick a PDF / take photos, review the notions, send.

## 4. Local
`npm install && npm run dev` → `http://localhost:5173/app/?emu=living_room` (desktop preview). E2E: `npx playwright test` (dev server) or `E2E_PROD=1 npx playwright test` (production build).
