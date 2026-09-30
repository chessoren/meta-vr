# Loci — Devpost submission

> Meta VR Start Developer Competition 2026 · **Productivity** track · **New Experience** division
> Also entered for: **Best Reason to Come Back** · **Best Agentic Interaction** · **Best First Five Minutes**
> Submissions close **Nov 18 2026, 12:00 PST**.

Anything marked **[verify]** must be checked on a real headset (or against the final build) before we paste this text into Devpost. Remove the markers as items are confirmed. Numbers stay out of the text until we have measured them.

---

## Project name
**Loci**

## Tagline (≤ 200 characters)
**Your room remembers.** Loci turns your bedroom into a memory palace: your course, turned into vivid 3D scenes anchored on your real furniture, recalled with your hands.

Shorter alternatives:
- Import your course tonight. Tomorrow, close your eyes — the answers are where you left them.
- The 2,500-year-old memory palace, built for you in mixed reality.

## Built with (Devpost tags)
`webxr` `immersive-web-sdk` `three.js` `typescript` `vite` `meta-quest` `mixed-reality` `hand-tracking` `scene-understanding` `web-audio` `vosk` `claude` `anthropic` `vercel` `upstash` `vitest` `playwright`

---

## Inspiration

I'm a student. Before every exam I do what almost everyone does: I re-read my notes, highlight them, and re-read them again. It feels like work. It mostly isn't. The research has been clear for a long time. In a large 2013 review of study techniques, re-reading and highlighting were rated *low utility*. Testing yourself and spacing your reviews over time came out on top. Those are exactly the two things students skip, because they take effort and are hard to schedule.

Then I read about memory champions. Almost all of them use one technique, the **method of loci** (the memory palace). You bind each fact to a place you know by heart, then walk the route in your mind. The story goes that Simonides of Ceos invented it around 500 BC, after naming every guest of a collapsed banquet hall from where each one had been sitting. It works, and ordinary people who train with it improve a lot. But hardly anyone uses it for school, because inventing a vivid image for every fact and building a route for every chapter is exhausting.

One evening in my room, wearing a Quest, I realised the headset already knew my room. Space Setup had found my desk, my bed, my shelf and my lamp. My room was already a palace. It only needed furniture that could remember. So Loci does the exhausting part for you: **AI builds the images, mixed reality puts them on your real objects, and spaced repetition decides when you see them again.**

## What it does

Loci is a mixed-reality memory palace for Meta Quest, designed for the narrow field of view of Meta VR Glasses too.

**The first five minutes (no reading, no import, a proof of learning):**
1. Passthrough comes on. A small **flame** floats in front of you and waves. There is no text window.
2. "Pinch me." You pinch, and it bounces. You have learned the core interaction.
3. The flame glides around your room and lights each piece of furniture with a soft halo. The room becomes a place.
4. A trial palace appears: **5 world capitals**. For each one, a small absurd scene lands in your hands, like a kangaroo bouncing for Canberra. You pinch it and set it on the object you choose.
5. Lights out. The scenes vanish and your objects keep a faint glow.
6. You look at an object and its question appears. You say the answer, or pinch one of three bubbles. When you're right, the scene springs back to life.
7. "5 out of 5. You just learned the way memory champions do. Tonight, import your real course."

**Your real course:**
- **Import from your phone.** Take a photo of your notes, upload a PDF or paste text. A QR code (or a 4-letter code) floating in the headset pairs the two devices. There are no accounts, and you never type in the headset.
- **Atomic notions.** Claude splits the course into at most 20 question and short-answer pairs. You keep, edit or delete each one on your phone.
- **Mnemonic scenes.** For each notion, Claude composes a short 3D scene that follows the mnemonist's rules (exaggerated, moving, absurd, tied to a sound or a meaning). The scene is built only from Loci's own procedural model library and animations. Avogadro's 6.02 × 10²³ becomes a giant avocado juggling six balls on your lamp.
- **Placement on real furniture.** Scenes are anchored on your desk, bed, shelf, lamp and window, and they stay there across sessions. Your objects form a fixed route, left to right from your seat.
- **Active recall, three ways.** Look at an object, then **say** the answer, **pinch** one of three bubbles, or **turn your palm up** to reveal it and grade yourself.
- **Spaced repetition that knows your exam date.** Only the notions that are due glow. The palace paces itself so that every notion is solid the day before the exam.

**A daily session is 5 to 10 minutes.** The palace reloads on the same objects and only the due notions glow. You answer them one by one. A correct answer consolidates the scene. A wrong one replays it, even more exaggerated. If there's time, you place 3–5 new notions. The session ends with one line: how many notions are now solid.

**Progress you can see, with no streaks and no guilt.** Every notion leaves a trace on its object that grows with mastery:

| Tier | Condition | On the object |
|---|---|---|
| New | just placed | full animated scene |
| Fragile | 1 correct | pale scene, faint halo |
| Solid | 3 correct, on spaced days | a small plant or crystal |
| Anchored | 5 correct over ≥ 2 weeks | a permanent golden object |

After a chapter, your room is visibly filled with what you know.

## How we built it

**Platform.** Loci is a **WebXR** app (`immersive-ar`) built on Meta's **Immersive Web SDK 1.0** and **Three.js** (r181, "super-three"), in strict TypeScript with Vite. It runs in Meta Quest Browser with no store install and can be installed as a PWA. It is hosted on **Vercel**: a static build plus one Node function for the API.

**Room understanding.** We read Meta's scene model through WebXR **mesh detection** (furniture as bounded 3D boxes with semantic labels: table, couch, bed, shelf, lamp, screen, storage…) and **plane detection** (walls, floor, windows, doors, wall art). On Quest 2 this comes from Space Setup furniture boxes. On Quest 3/3S, depth sensing gives richer meshes. **[verify: label coverage on each device]**

**Setting up any room.** If a Quest was never mapped, the flame first offers Meta's own **room capture** (`XRSession.initiateRoomCapture`); if the learner declines or the room is nearly bare, they plant glowing **candle-lanterns** on the walls by look + pinch, and scenes spread along the wall around each lantern. Recentring the headset (a long press) fires the reference-space `reset` event and Loci re-registers the room on its furniture on the spot.

**Room registration and persistence.** Positions live in a *room frame*. At each session, Loci computes a rigid transform (yaw plus horizontal translation) from the furniture it can match, using a small robust 2D registration in pure TypeScript. Every scene is stored **relative to its piece of furniture**, so it follows the object if the registration shifts, or if you redo Space Setup and the boxes move a little. When furniture can't be matched, Loci falls back to a persistent WebXR anchor, then to identity. In an unknown or bare room, the flame helps you pin **wall anchors by hand**, and those work as well as furniture. **[verify: persistence after Space Setup edits; wall fallback in an empty room]**

**Hands-only input.** There are no controllers anywhere. While a scene is carried, a golden **landing ring** shows exactly where it will settle on the object before you let go. Loci uses **gaze + pinch** to select, pinch–move–release to place, a **palm-up** pose to reveal an answer, look-at-palm for the pause menu, and a **fist held for one second** to quit (with an instant save). Everything a seated learner touches is within 60 cm. Everything they must read sits within ±20° of gaze centre, 45–80 cm away, which fits the ~70° × 66° field of view of Meta VR Glasses. **[verify: palm-up and fist-hold reliability in low light]**

**On-device voice.** Answers can be spoken. Recognition uses **Vosk** (Kaldi compiled to WebAssembly) with a **grammar limited to the current palace's answers and distractors**. That makes a small (~40 MB) English model accurate. Audio never leaves the headset. If the mic is denied or the model is missing, the three bubbles still work.

**Procedural 3D library.** Loci downloads no 3D assets. Every model (animals, people, food, nature, science, objects, vehicles, structures: 90+ ids **[verify final count]**) is built in code from a small construction kit with a shared palette and materials. Models are low-poly and fit a 30 cm cube. They come with a set of procedural animations: bounce, juggle, orbit, march, rain, stack, flip and more. Budget per model: ≤ 2,000 triangles and ≤ 6 meshes. Budget per frame with 20 scenes: ≤ 150 draw calls and ≤ 150k triangles, with no real-time shadows and no post-processing.

**Procedural audio.** Every sound is synthesised live with Web Audio: the room ambience, the flame's tiny sung voice, a unique spatialised motif per object (auditory memory reinforces spatial memory), a soft chime for a correct answer, and a breath (never a buzzer) for a wrong one.

**Spaced repetition.** An **SM-2 / Anki-style scheduler, made exam-aware**. New notions go through short learning steps inside the session. Reviews grow with an ease factor. Lapses reset gently. When an exam date is set, the scheduler never plans a review after the exam's eve, and it compresses intervals so every notion can reach *solid* before then. It is deterministic and unit-tested.

**AI, with the method in charge.** The server calls **Claude** in two stages, both with structured outputs:
1. **Splitter:** course text or photo → at most 20 atomic notions, each with a question, a short answer, accepted variants and two plausible distractors.
2. **Mnemonist:** several parallel calls → one scene recipe per notion, restricted by schema to the model catalog and animation list. It can't invent an object that doesn't exist.

Each call has its own timeout, one retry and an overall budget. An **offline pipeline** mirrors both stages. A heuristic splitter handles lists, definitions, dates and formulas, and a keyword / sound-alike scene composer uses the same catalog index. Two **built-in palaces** ship with the app (5 capitals; WWI & WWII, 20 notions). Pull out the API key and Loci still works end to end.

**Offline and installable.** A service worker caches the app after the first launch, so the built-in palaces work with no network at all. Installed as a PWA on Horizon OS, Loci spends the app-icon tap to go straight into mixed reality (Meta's recommended `getDigitalGoodsService` + `isSessionSupported` pattern), and the browser's own *Enter* prompt (`offerSession`) brings you back in one pinch.

**Phone companion and pairing.** The headset creates a pairing slot (4 letters + secret, 30-minute TTL). The phone uploads, validates and sends the palace, and the headset polls for it. Storage is Upstash Redis over REST in production and in-memory in development. Rate limits protect every route.

**Testing.** **Vitest** covers the pure core (SRS, tiers, planner, route, registration, matching, offline composer, storage migrations). **Playwright + IWER** (Meta's WebXR emulator) and `@iwer/sem` synthetic Meta Scene rooms run the whole mixed-reality flow headlessly, from the living room down to an empty room. A screenshot script renders every page, and every 3D model in a gallery, for visual QA. The e2e suite covers the first five minutes, a returning learner after recentring (registration keeps every scene on its object), the phone → server → headset import loop, taking the headset off mid-task and a full reload (exact resume), a bare room (wall lanterns), and a 20-scene performance budget (≈ 140 draw calls, ≈ 64k triangles). It runs against the production build too.

## Challenges we ran into

- **Quest 2 has no depth sensor.** Our test headset only knows the furniture boxes you drew in Space Setup, and passthrough is monochrome. We had to make the wall-anchor fallback excellent instead of treating it as an afterthought.
- **"Same place tomorrow."** WebXR sessions don't share a coordinate system across launches. Re-registering the room from furniture, storing placements relative to objects, and falling back to anchors took several iterations before scenes came back to the same spot. **[verify: measured drift]**
- **No text, no tutorials.** Teaching pinch, palm-up and fist-hold with a flame that speaks two or three words, and never a text panel, forced us to redesign the onboarding many times.
- **A narrow field of view.** Designing for ~70° (Meta VR Glasses) meant every question, bubble and hint had to live in a small central cone. Nothing important can sit at the edges.
- **Making AI output safe to render.** A free-form "3D scene" from an LLM is a performance and consistency risk. Constraining Claude to a schema of catalog ids and animations, plus a validator and an offline twin, made every scene renderable in a stable frame budget.
- **Voice in a WebXR page.** Speech recognition had to be offline, fast and light enough to run next to rendering. Grammar-constrained Vosk was the answer.
- **Performance with 20 scenes on a Quest 2.** Merged geometry, shared materials, no shadows, no allocations in update loops. **[verify: 60 fps with 20 scenes on Quest 2, OVR Metrics capture]**

## Accomplishments that we're proud of

- A first five minutes with **no reading at all**, which ends with you recalling five facts from memory.
- **The room is the interface.** Your real lamp, desk and shelf hold your course, and they still hold it tomorrow.
- **Hands only, seated, within 60 cm**, and readable in a ~70° field of view.
- **The AI serves the method and never replaces it.** Remove it and Loci still works: built-in palaces, an offline splitter and composer, on-device voice.
- **Zero downloaded assets.** Every model, animation and sound is generated in code.
- **Honest progress:** plants, crystals and gold that you earn. No streaks, and no guilt.

## What we learned

- The memory palace is powerful because it is *spatial* and *personal*. A generic virtual room loses most of that, and your own room keeps it.
- Retrieval beats review. Designing every interaction around *answering* rather than *reading* changed the whole app.
- In mixed reality, less UI is more. A glowing object and a two-word flame explain more than any panel.
- LLMs are best used as composers inside strict constraints, not as generators of arbitrary content.
- Building for the smallest device (a narrow field of view, a Quest 2 without depth) made the experience better on every device.

## What's next for Loci

- **A learning study with classmates** (protocol in `docs/TEST_PROTOCOL.md`): Loci vs. re-reading, recall after 48 h and 7 days. We will publish the result, whatever it is.
- **Class palaces:** a teacher publishes a chapter, and each student places it in their own room.
- **More languages** for voice answers (French first) and for the interface.
- **Shared and remixable palaces** for common exams.
- **Meta VR Glasses–first** sessions: short, seated, eyes-forward reviews on the go.
- Accessibility: larger text modes, one-handed input, and a colour-blind-safe tier palette.

---

## How Loci meets the judging criteria (25 % each)

### Innovation & Creativity
- The first memory palace built on **your real room**. Scene understanding turns your furniture into the loci.
- **Three levers at once:** real spatial anchoring, vivid mnemonic scenes and active spaced recall. Most apps pick one.
- **AI as a mnemonist:** Claude composes absurd, memorable scenes from a fixed procedural library. It never generates 3D.
- A room that **fills up** with plants, crystals and gold as you master notions.

### Experience Design
- **No text windows, ever.** A flame guide teaches everything with gestures and two or three words.
- A **seated, hands-only** design: gaze + pinch, palm-up reveal, fist-hold exit, all within 60 cm.
- Essentials within ±20° for a **~70° FOV** (Meta VR Glasses–ready).
- "Old library on a winter evening" art direction: warm halos on active objects, natural passthrough everywhere else.
- Kind feedback: a chime when you're right, a breath (never a buzzer) when you're wrong, and a scene that replays more exaggerated.

### Technical Implementation
- WebXR `immersive-ar` on Immersive Web SDK 1.0 with hand tracking, mesh and plane detection, anchors and hit-test.
- **Room registration** from matched furniture, placements stored relative to objects, and an anchor fallback, so scenes persist across sessions. **[verify]**
- **On-device, grammar-constrained voice** (Vosk WASM).
- **Procedural** 3D library, animations and audio, with a strict draw-call and triangle budget. **[verify 60 fps with 20 scenes]**
- **Exam-aware SRS**, deterministic and unit-tested. Emulated end-to-end tests with IWER + synthetic Meta Scene rooms.
- **Resilient AI pipeline:** structured outputs, timeouts, retries, and a full offline twin.

### Polish & Presentation
- A palace is usable **< 10 s after launch [verify]**. Remove the headset and put it back on, and you return to the exact step **[verify]**.
- A consistent visual and sound identity across the headset, the phone companion, the landing page and the video.
- A video made only from **real in-headset captures** and real-life footage. No AI-generated video.

## How Loci targets the special prizes

### Best Reason to Come Back
- **Only what's due glows.** Each day there is a small, finite, satisfying task (5–10 minutes).
- **The exam countdown** gives a real deadline you care about. The palace plans every review to be solid by the eve.
- **The room fills up.** Plants, crystals and golden objects accumulate on your furniture, a visible and permanent record of what you know.
- **No streaks, no guilt.** Coming back feels rewarding, not like a debt.
- **Several palaces**, one per subject or chapter, all living in the same room.

### Best Agentic Interaction
- **The flame** is an agent-like guide. It scans the room with you, lights furniture, suggests where scenes go and reacts to your answers, all without a text window.
- **Claude as a two-stage agent pipeline:** a splitter turns messy notes (photos, PDFs, French or English) into validated atomic notions, and a mnemonist composes a scene per notion under schema constraints from the model catalog.
- **Human in the loop:** the learner validates every notion on the phone before it reaches the room.
- **Graceful degradation:** an offline splitter and composer take over transparently when the AI is unavailable.

### Best First Five Minutes
- **0:00** passthrough and a waving flame · **0:15** "Pinch me" · **0:30** the flame lights your furniture · **1:00** 5 capitals, no import · **1:30** place scenes on your objects · **3:00** lights out · **3:30** recall by voice or bubble · **4:30** "5 out of 5."
- **No reading, no menus, no controllers**, and a real proof of learning before minute five. **[verify timings on device with a first-time user]**

---

## Links (fill in)
- Live app (Quest Browser): `https://<domain>/app/` **[founder: domain]**
- Landing page: `https://<domain>/`
- Video (YouTube/Vimeo, ≤ 3:00): `<link>`
- Source: `<GitHub link>` **[founder: public or private?]**

## Try it (for judges)
1. On Meta Quest (Quest 3/3S recommended; Quest 2 supported), make sure **Space Setup** is done and **hand tracking** is on.
2. Open `https://<domain>/app/` in **Meta Quest Browser** and tap **Enter**. Allow hand tracking and spatial data. Allow the microphone if you want voice answers.
3. Follow the flame. The 5-capitals palace needs no import.
4. To import your own course: open the link shown in the headset on your phone (or scan the QR code), then snap or paste your notes.
5. To test without AI, use the built-in **WWI & WWII** palace.
6. **No headset at hand?** `https://<domain>/app/?emu=living_room` runs the complete experience in a desktop browser with Meta's WebXR emulator and a real scanned living room: move the mouse to look, hold the click to pinch, <kbd>Space</kbd> palm up, <kbd>M</kbd> menu, hold <kbd>F</kbd> to exit.
