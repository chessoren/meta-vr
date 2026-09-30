# Loci — Video shooting script (3:00)

> The jury watches the video **first**. It must make someone want Loci within 20 seconds and prove, by minute three, that it really works.
>
> **Non-negotiable: no AI-generated video, no AI-generated imagery of the app.** Every in-headset shot is a **real capture** from a headset running Loci. Every real-life shot is filmed with a real camera. Editing (cuts, titles, colour grading, picture-in-picture, speed ramps) is fine. Faking what the app does is not. If a moment doesn't work on device yet, we **don't show it**. We don't simulate it.

Storyline (from the brief): **Problem 0:00 → Switch 0:20 → Placement 0:40 → Recall 1:30 → Exam 2:10 → Proof 2:40.**
Demo content: the built-in **History — WWI & WWII** palace (English) for the main story, and the **5 capitals** for the onboarding glimpses.

Legend for the *Source* column:
- **HMD**: real headset capture (Quest system recording, or casting recorded on a computer).
- **CAM**: real-life camera (phone or camera on a tripod or gimbal).
- **PHONE**: screen recording of the phone companion (iOS/Android built-in screen recorder).
- **GFX**: typographic title card made in the editor (text only, on our brown/gold palette, no fake app UI).

---

## Characters, set and props

- **The student** (the founder, 18+). Hoodie, a real course binder, highlighters.
- **The bedroom**: a desk with a **desk lamp** at the left, a **shelf** in the middle, a **window** at the right, a bed edge in frame. The route runs left → right from the chair: lamp → shelf → window → desk corner → bed.
- **The exam room**: a real classroom or library (get written permission). One friend films. Any other people in frame are adults who have signed a release, or they are out of focus or out of frame.
- Props: printed WWI & WWII notes (the same text as the built-in palace), a phone, a Quest (Quest 3 preferred for colour passthrough, see checklist), a mug, warm bulbs.

---

## Shot list

### ACT 1 — The problem (0:00–0:20)

| # | Time | Source | On screen | App moment / how to trigger | Voice-over | On-screen text | Music / SFX |
|---|---|---|---|---|---|---|---|
| 1 | 0:00–0:04 | CAM | Night. Tight on a desk: a highlighter drags across a page that's already yellow. | — | *(none, let it breathe)* | — | Room tone, clock ticking, the marker squeak. |
| 2 | 0:04–0:10 | CAM | Wide: the student hunched over notes, lamp on, rubbing their eyes. Slow push-in. | — | "The night before an exam, we all do the same thing. Read. Highlight. Read it again." | — | A single low piano note enters. |
| 3 | 0:10–0:16 | CAM | Close-up: eyes drifting off the page. Cut to the page: words out of focus. | — | "It feels like studying. It mostly isn't." | **Re-reading: rated low utility** · Dunlosky et al., 2013 | Tick stops. |
| 4 | 0:16–0:20 | CAM | The student looks up from the notes, around the room: lamp, shelf, window. Hold on the lamp. | — | "But there's something you already know by heart." | — | A soft breath of air (Loci's "wrong" sound, reused as a transition). |

### ACT 2 — The switch (0:20–0:40)

| # | Time | Source | On screen | App moment / how to trigger | Voice-over | On-screen text | Music / SFX |
|---|---|---|---|---|---|---|---|
| 5 | 0:20–0:24 | CAM | The student puts on the Quest, still seated. Over-the-shoulder, lamp bokeh. | — | "Your room." | — | Music opens up: warm pad (Loci ambience, see *Music*). |
| 6 | 0:24–0:30 | HMD | Passthrough. The **flame** appears in front of you and waves. | **Fresh onboarding**: on Loci's start page tap **Start over** twice (erases palaces and progress on this headset) → **Begin**. | "Two and a half thousand years ago, the Greeks found the best way to remember anything: put each idea in a place you know." | — | The flame's tiny sung "hello". |
| 7 | 0:30–0:36 | HMD | The flame glides to the furniture and lights each piece with a halo: lamp, shelf, window. | Onboarding step **scan** (it follows "Pinch me"; pinch the flame once). Hold your head still and pan slowly left → right. | "Memory champions still do it. It's called a memory palace. We made it effortless." | — | One soft chime per object, rising. |
| 8 | 0:36–0:40 | GFX over HMD | The last halo blooms. Title fades up in the centre. | Continue from shot 7 (freeze the last frame if needed). | — | **Loci** · *your room remembers* | Music swell, then drop to a pulse. |

### ACT 3 — Placement (0:40–1:30)

| # | Time | Source | On screen | App moment / how to trigger | Voice-over | On-screen text | Music / SFX |
|---|---|---|---|---|---|---|---|
| 9 | 0:40–0:46 | CAM | Over-the-shoulder: the student, headset pushed up on the forehead **[or a second take without it]**, snaps a photo of the notes with a phone. | Open the pairing link or QR shown in the headset on the phone. | "Import your course tonight: a photo, a PDF, or just paste the text." | — | Camera shutter. |
| 10 | 0:46–0:52 | PHONE | The phone companion shows the notions appearing: *1914 · Assassination in Sarajevo*, *1916 · Battle of the Somme*… One gets swiped away. | Phone: `/import/?c=CODE` → upload the photo → wait for the notions → delete one → **Send**. Use the real printed WWI notes. With no API key, the offline splitter runs (show whichever is true). | "Loci splits it into questions and short answers. You keep what matters." | **≤ 20 notions per palace** | Soft paper sounds. |
| 11 | 0:52–0:56 | HMD | The QR / 4-letter code floating in the room, then the palace arriving with a warm pulse. | Headset: pairing screen → it polls → the palace arrives. | "Then your room takes over." | — | Arrival chime. |
| 12 | 0:56–1:06 | HMD | **A scene lands in your hands.** Pinch it, carry it, set it down on the lamp. The scene starts animating on the lamp. | Session → place new notions. Hold your hands low and centred in frame. Move slowly, and hold 2 s after the release. Pick the most readable WWI scene (check `src/core/palaces/ww.ts` for the recipes). | "Every fact becomes a small, absurd scene. You pick it up… and put it somewhere real." | Caption the scene with its notion, e.g. **1916 · The Somme** | The object's own spatial motif starts. |
| 13 | 1:06–1:14 | HMD | Second and third placements in fast succession: shelf, window. | Continue placing. Cut on each release. | "The shelf. The window. Left to right from your chair: the same route every night." | — | Each object has its own motif, and they layer musically. |
| 14 | 1:14–1:22 | CAM | Wide, real room: the student seated, pinching in the air, calm. Nothing floating is added in post: the real-world view is honest. | Film during an actual placement so the gestures are real. | "Hands only. Seated. Everything within reach." | **Hands only · no controllers** | — |
| 15 | 1:22–1:30 | HMD | Slow pan across the room: five scenes alive on five objects. | After the placements, look left → right slowly (≈ 8 s for 90°). | "It's not a virtual room you'll forget. It's your lamp." | — | Music thins out. |

### ACT 4 — Recall (1:30–2:10)

| # | Time | Source | On screen | App moment / how to trigger | Voice-over | On-screen text | Music / SFX |
|---|---|---|---|---|---|---|---|
| 16 | 1:30–1:35 | HMD | **Lights out.** The scenes vanish, and the objects keep a faint glow. | Onboarding "lights-out" step, or the session recall loop. | "Then the scenes disappear." | — | Everything drops to the ambience, like a candle being blown out. |
| 17 | 1:35–1:44 | HMD | You look at the lamp and its question appears: *When did the Battle of the Somme begin?* Three bubbles. You **say** "Nineteen sixteen". The scene springs back to life. | Recall loop: gaze at the object. Speak clearly (voice needs the Vosk model deployed and mic permission). **[verify: the question text for this notion]** | "Look at an object. Answer out loud…" | — | Mic-listening shimmer → correct **chime**. |
| 18 | 1:44–1:50 | HMD | Next object: you **pinch a bubble**. Correct. | Recall loop, answer with a bubble. | "…or with a pinch." | — | Chime (a different pitch, one per object). |
| 19 | 1:50–1:56 | HMD | Next: you **turn your palm up**. The answer reveals. Grade yourself. | Recall loop, palm-up reveal. Keep the palm well lit and facing the headset. | "Not sure? Turn your hand over." | — | Soft page-turn. |
| 20 | 1:56–2:02 | HMD | A **wrong answer**: a gentle breath, and the scene replays bigger and sillier. | Pick a wrong bubble on purpose. | "Get it wrong, and the scene comes back even stranger. That's what makes it stick." | — | The breath (never a buzzer). |
| 21 | 2:02–2:10 | HMD | **Day 2 / day 5**: the palace reloads, and only 3 objects glow. A small plant and a crystal have grown on others. | Real multi-day progress: play the palace over several real days before the shoot (see *Schedule*). If it isn't ready, cut this shot. **Do not fake tiers.** | "Tomorrow, only what's due will glow. What you've mastered grows into something permanent." | **Spaced repetition · exam-aware** | Music returns, fuller. |

### ACT 5 — The exam (2:10–2:40)

| # | Time | Source | On screen | App moment / how to trigger | Voice-over | On-screen text | Music / SFX |
|---|---|---|---|---|---|---|---|
| 22 | 2:10–2:16 | CAM | Exam room. Rows of desks, a clock. The student sits down, turns the paper over. | Friend films (see checklist). | "The next morning." | — | Silence and room tone. The clock is back. |
| 23 | 2:16–2:22 | CAM | Close-up on the paper: *"In which year did the Battle of the Somme begin?"* (a prop question sheet we print). The pen hesitates. | — | — | — | Clock ticks. |
| 24 | 2:22–2:30 | CAM → HMD | The student **closes their eyes**. Match-cut to the **real headset capture** of the lamp from shot 12, with the scene alive. Hold 2 s, then cut back. | Reuse footage from shot 12 (a real capture). Dissolve at most 8 frames. | "Close your eyes. See your room." | — | The lamp's motif plays softly: auditory memory. |
| 25 | 2:30–2:40 | CAM | Eyes open. A small smile. The pen writes **1916**. | — | "The answer is where you left it." | — | Music resolves. |

### ACT 6 — Proof (2:40–3:00)

| # | Time | Source | On screen | App moment / how to trigger | Voice-over | On-screen text | Music / SFX |
|---|---|---|---|---|---|---|---|
| 26 | 2:40–2:46 | HMD | The onboarding proof moment: **"5 out of 5."** The flame celebrates. | Onboarding "proof" step, from a real first-time run (film a friend's first session: most honest). | "Five minutes, five facts, from memory, on the first try." | — | Flame's little sung phrase. |
| 27 | 2:46–2:52 | HMD | The room after a chapter: plants, crystals, golden objects on the furniture. | Real accumulated progress (see *Schedule*). Otherwise use the summary screen. | "Your room fills up with what you know." | **Works without AI · on-device voice · Quest & Meta VR Glasses** | — |
| 28 | 2:52–2:56 | GFX | Our study result, **only if we have real data**. Otherwise skip, or say "Study with classmates in progress". | From `docs/TEST_PROTOCOL.md` part B. | *(only if real)* "In our study with classmates…" | e.g. **"N = 12 · 7-day recall: Loci x/20 vs re-reading y/20"** (real numbers only) | — |
| 29 | 2:56–3:00 | GFX | End card: the flame-in-arch logo, the name, the URL. | — | "Loci. Your room remembers." | **Loci** · *your room remembers* · `<domain>` | Final chime. |

**Total VO: about 230 words.** Read it slowly, warmly, close to the mic, like telling a friend a secret. Record in a closet or under a duvet to kill the reverb.

---

## Music & sound

- **Base bed:** Loci's own procedural ambience plus the object motifs, rendered to WAV. Run `node scripts/render-audio.mjs` → `test-results/audio/*.wav` (includes a 45 s ambience preview). This keeps the video's sound identical to the app's.
- If we add music: only royalty-free or licensed tracks, with the licence saved in the project folder. Warm piano or a celesta, around 70–80 BPM, no drums before 1:30.
- SFX from the app: correct chime, the breath, the flame's sung voice, the pairing arrival, per-object motifs. Room tone from the real bedroom (record 30 s of silence on set).
- Mix: VO at −16 LUFS integrated for the final export; music ducked −12 dB under VO.

## Editing notes

- **Format:** export **16:9, 1920×1080 (or 3840×2160), 30 or 60 fps**, H.264, ≤ 3:00 exactly.
- **Square headset captures (1:1)**: put them on a blurred, darkened copy of themselves, or crop the centre band to 16:9. Loci keeps essentials within ±20°, so a centre crop keeps the UI.
- **Captions:** burn in English subtitles (many judges watch muted).
- **Colour:** gently warm the CAM footage to match passthrough. Never recolour the in-headset UI.
- **Legibility:** on-screen text uses Fraunces (titles) and Inter (labels), parchment `#f3e6c8` on brown `#140d08`, with gold `#e9b949` accents.
- **Honesty cards:** if a shot is sped up, add a small "2× speed" tag. If a Quest 2 was used, passthrough is grey. That's fine, don't colourise it.

---

## Capture checklist

### Quest recording settings
- [ ] Update the headset OS and Quest Browser. Space Setup is done in the bedroom (furniture boxes drawn for desk, lamp, shelf, window, bed).
- [ ] **Recording on the headset:** open the Camera app → Settings. Choose **landscape 16:9 (1920×1080)** where available, otherwise square 1:1. Pick the highest available frame rate. **[verify: options on your OS version]** Start and stop from the Camera app, from the quick settings, or with the voice command. We need hands free for Loci, so start the recording first, then go back to the browser.
- [ ] **Passthrough in recordings:** confirm that system recording captures passthrough plus the WebXR layer in Quest Browser (`immersive-ar`). **[verify on Quest 3 and on Quest 2: do a 10 s test first]** If it doesn't, cast to a computer instead (Meta Horizon app casting, or `https://www.oculus.com/casting` in Chrome) and record the computer screen with OBS at 1080p60.
- [ ] **Quest 3 strongly preferred** for hero shots (colour passthrough). A Quest 2 recording is grey passthrough: acceptable, but less warm.
- [ ] Turn on **Do Not Disturb**. Hide the system guardian, notifications and battery warnings. Headset battery above 80 %, or plugged in with a long cable.
- [ ] Clear the browser's other tabs. Hide the address bar if possible (PWA install gives a cleaner launch).
- [ ] Deploy the exact build you film. Write the commit hash in the shoot log.

### Mixed-reality capture tips
- [ ] **Move your head half as fast as feels natural.** Recordings are from one eye and exaggerate motion. Pan 90° in about 8 s.
- [ ] Hold every "hero" moment for **3 seconds** before and after, for edit handles.
- [ ] Keep hands **low and centred**: they must be visible in the recording frame, which is narrower than your view.
- [ ] Look at objects from **0.8–1.5 m**. Close enough for halos, far enough for context.
- [ ] Do each shot **3 times**. Pick the best in the edit.
- [ ] Record a clean 20 s "room pan" with nothing happening, as edit filler.
- [ ] For onboarding (shots 6–8, 26), film a **real first-time user** (a friend, 18+, signed release). It's more honest and more charming.

### Lighting the bedroom warmly
- [ ] Hand tracking and passthrough need light. **"Lights out" is an in-app effect, not a dark room.** Keep the room reasonably lit.
- [ ] Use **warm bulbs (2700 K)**: the desk lamp, one floor lamp bouncing off a wall, and fairy lights on the shelf for bokeh in CAM shots.
- [ ] Switch off cold overhead lights. Avoid mixing daylight and warm bulbs. Shoot after sunset or with curtains closed.
- [ ] No strong backlight behind the hands (it breaks hand tracking). No mirrors in the scene (they confuse tracking).
- [ ] Tidy the room but keep it lived-in: books, a mug, a plant. It's a memory palace, not a showroom.

### Real-life camera (CAM)
- [ ] Phone on a tripod or gimbal, **4K 24/25 fps**, locked exposure and white balance (3200 K), the 1× lens for faces and 2× for details.
- [ ] Film the "problem" shots (1–4) at night with only the desk lamp: moody, but with some detail in the shadows.
- [ ] Record clean audio separately (the phone's voice memo near the desk) for room tone.

### The exam scene (friend filming)
- [ ] Get **written permission** from the school or library to film. Film outside exam periods. Never film a real exam.
- [ ] Brief the friend with this sheet: shots 22–25, a slow push-in on 24, a static tripod shot for 25.
- [ ] Print a prop question sheet: *"In which year did the Battle of the Somme begin?"* plus 3 other questions from the palace.
- [ ] Extras: only adults who signed a release. Otherwise keep the frame tight on the student.
- [ ] Shoot the eyes-closed moment 5 times: breathing, a small head tilt toward where the lamp would be.

### Release & rights
- [ ] Signed appearance releases for everyone identifiable (all 18+).
- [ ] Music licence saved. No copyrighted posters or brands visible in the room.
- [ ] **Log** every clip: its source (HMD/CAM/PHONE), the device, the date and the build hash. This is our proof that no footage is AI-generated.

## Schedule (so the "room fills up" shots are real)

- **Day 0 (at least 16 days before the edit deadline):** start the WWI & WWII palace in the bedroom. Do daily sessions, and record the placement and recall shots on day 0 or 1.
- **Days 1–15:** a short daily session. Tiers grow for real (*anchored* needs 5 correct answers over ≥ 2 weeks).
- **Day ~16:** film shots 21 and 27 (the room filled). Film the exam scene the same week.
- **Edit:** 3 evenings. Leave 2 days of buffer before **Nov 18, 12:00 PST**.
