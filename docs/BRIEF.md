# Loci (Palais de Mémoire) — Product brief

_Source: founder brief, Sep 30 2026 (@Oren). Condensed & translated; decisions taken with the founder are in **Decisions**._

## Pitch
Loci turns your **real bedroom** into a memory palace: each notion of your course is anchored on a real object, and you revise by looking around your room, seated, with your hands.

Promise: _"Import your course tonight. Tomorrow in the exam, close your eyes, see your room again, and the answers are there."_

Target: **Meta VR Start Developer Competition 2026** — Productivity track, **New Experience** division ($70k). Secondary special prizes: **Best Reason to Come Back**, **Best Agentic Interaction**, **Best First Five Minutes**. Judging: Innovation & Creativity, Experience Design, Technical Implementation, Polish & Presentation — 25 % each. Hard rules: fully usable with hands end-to-end (no controllers), seated-optimised, fast cold start, clean pause/resume, something satisfying in ≤ 10 minutes. Deadline Nov 18 2026 12:00 PST.

Users: high-school and university students preparing exams with facts to memorise (dates, formulas, definitions, vocabulary).

## Method
Re-reading notes is the most common and one of the least effective ways to revise. The **method of loci** (memory palace) is the core technique of memory champions: bind each piece of information to a precise place you know by heart; to recall, walk the route mentally. It is rarely used because it demands huge imaginative effort. Loci removes that effort: **AI builds the images, mixed reality places them physically on your real objects, spaced repetition decides when to review them.** All three levers at once, none sacrificed:
- **Real spatial anchoring** — the information is on *your* lamp, not in a virtual room.
- **Strong mental image** — each notion becomes a bizarre, funny, exaggerated, moving scene.
- **Active spaced recall** — the learner must retrieve the answer, at the right moment, never passively re-read.

## First five minutes (no reading, proof of learning)
1. 0:00 Passthrough on. A small **flame** floats in front of the user and waves. No text window.
2. 0:15 Learn the gesture. The flame: "Pinch me." User pinches, it bounces. Core interaction learned.
3. 0:30 Room scan. The flame glides to the furniture and lights them one by one with a soft halo. The room becomes a place.
4. 1:00 Demo content, no import needed: a fun universal trial palace — **5 world capitals**.
5. 1:30 Place. For each notion a scene appears in the user's hands; they look, pinch it and set it on the object of their choice (Canberra → a kangaroo bouncing on the lamp).
6. 3:00 Lights out. Scenes vanish; objects keep a small glow.
7. 3:30 Recall. Look at an object → the question appears → answer aloud or pick one of three bubbles by hand. The scene revives when correct.
8. 4:30 Proof. "5 out of 5. You just learned the way memory champions do. Tonight, import your real course."

## Daily session (day 2+) — 5 to 10 minutes
Palace reloads on the same objects → only **due** notions glow (typically 5–15) → answer one by one by gaze + hand (correct: scene consolidates; wrong: scene replays more exaggerated) → if time, place 3–5 new notions → one-line summary + number of "solid" notions.

## Key mechanics
1. **Import** from phone/computer (photo of notes, PDF, pasted text) via link/QR shown in the headset. Never type in the headset. AI splits into atomic notions (question + short answer), max 20 per palace; user validates/deletes each on the phone.
2. **Mental images**: per notion, the AI composes a short 3D scene following mnemonist rules (exaggerated, moving, absurd, linked to sound or meaning), **assembled from a library of existing 3D models and animations — no on-the-fly 3D generation**. Ex: Avogadro 6.02×10²³ → a giant avocado juggling six balls on your lamp.
3. **Placement on real objects**: detect furniture/surfaces (desk, bed, shelf, lamp, window). Each notion anchored on a real object and stays there across sessions. Placement order matters: objects form a fixed route, **left to right from the seat**.
4. **Active recall**: look at an object to select it, then answer by **voice**, by **pinching one of three bubbles**, or **reveal mode** (turn palm up to see the answer, then self-grade).
5. **Spaced repetition** (Anki-like): interval grows when right, shrinks when wrong. Only due notions glow.

| Action | Gesture | Why |
|---|---|---|
| Select an object | Gaze + pinch | No outstretched arm, fits an airplane seat |
| Place a scene | Pinch, move, release | Natural "put down" |
| Answer | Voice or pinch a bubble | Two options, one hands-free |
| See the answer | Turn palm up | Readable, impossible by accident |
| Pause | Look at palm, pinch menu | Platform standard |
| Quit | Close fist 1 second | Instant save |

## Retention & progression (no streaks, no guilt)
- The room fills up: each mastered notion leaves a permanent trace on its object (a plant grows, a crystal grows). After a chapter the room is visibly "inhabited" by what you know.
- Exam countdown: learner enters the exam date; the palace plans so that every notion is solid the day before.
- Several palaces (one per subject/chapter).

| Tier | Condition | On the object |
|---|---|---|
| New | just placed | full animated scene |
| Fragile | 1 correct | pale scene, faint halo |
| Solid | 3 correct, spaced | small plant or crystal |
| Anchored | 5 correct over ≥ 2 weeks | permanent golden object |

## Art & sound
Ambience: **an old library on a winter evening** — warm, calm, a little magical. Opposite of a cold productivity app.
- Guide: the little flame, the only recurring character; replaces all tutorials and text menus.
- Scenes: colourful low-poly, slightly cartoon; each fits in a ~30 cm cube.
- Light: active objects get a golden halo; the rest stays natural passthrough.
- Sound: a unique spatialised sound per object (auditory memory reinforces spatial memory). Correct = soft chime; wrong = a breath, never a buzzer.
- UI: essentials in a narrow central field of view (works on Quest and on Meta VR Glasses, ~70°×66° FOV).
- Any random screenshot must make you want it. The video is judged first.

## Technical requirements (checked in headset by the jury)
Hands only · 60 fps on Quest with 20 scenes · palace usable < 10 s after launch · remove & re-wear headset returns to exact same point · furniture detection & anchoring · persistence across sessions · works in an unknown room, fallback to hand-placed wall anchors · all interactions within 60 cm of a seated user · essentials centred for narrow FOV · AI (splitting + scene choice) off-headset in seconds; **core works without AI** via preloaded palaces · UI in English, course import may be French. "Remove the third-party service — is there still a project?" must be **yes**.

## MVP scope
In: full 5-minute onboarding with capitals palace · import by photo/PDF from phone · ≤ 20 validated notions · ~50 model library + animations · furniture detection + persistent anchoring · hand and voice recall · simple SRS + visible tiers · multiple saved palaces.
Out: shared palaces, custom 3D generation, virtual-room mode, web dashboard, monetisation.

## Decisions (with the founder, Sep 29 2026)
- Team is 18+ and a Meta VR Start member.
- Name: **Loci** ("your room remembers"). UI in English.
- Stack: **WebXR + Immersive Web SDK 1.0** (Three.js), hosted on **Vercel**. Test device: **Quest 2** (mono passthrough, no depth sensor → Space Setup furniture boxes; manual wall fallback must be excellent). Also target Quest 3/3S and Meta VR Glasses.
- 3D library and sounds are **procedural in code** (no downloaded assets).
- Voice: **on-device**, English only (vosk-browser with a grammar restricted to the palace's answers). Bubbles always available.
- Flame "speaks" with gestures + 2–3 words + a tiny synthesized sung voice.
- Pairing phone ↔ headset: QR code + 4-letter code, no accounts.
- AI: Claude API (no key yet) + **offline heuristic splitter** fallback.
- Demo palace for the video: **History — WWI & WWII** (English), besides the 5 capitals.
- Deliverables beyond the app: Devpost text, video shooting script, landing page, test protocol.
