# Loci — Test protocol

Two parts:
- **A. In-headset QA**: every technical requirement of the brief, as the jury will check it, with pass/fail boxes.
- **B. A small learning study with classmates**: Loci vs. re-reading, measured honestly.

Print this file or copy it into a spreadsheet. Record **build hash, device, OS version, Quest Browser version, room and date** for every run.

---

## A. In-headset QA checklist

### A.0 Setup

| Item | Value |
|---|---|
| Build / commit | |
| URL | `https://<domain>/app/` |
| Devices | ☐ Quest 2 (primary test device) ☐ Quest 3 ☐ Quest 3S ☐ Meta VR Glasses (or the emulator profile) |
| Headset OS / Browser version | |
| Rooms | ☐ Bedroom (full Space Setup) ☐ Sparse room (≤ 2 boxes) ☐ Unknown room (no Space Setup) |
| Tester | |

Tools:
- **OVR Metrics Tool** (free, from Meta, in the Meta Horizon Store). Enable the **persistent overlay** with FPS, GPU/CPU level, GPU utilisation and stale frames. Enable CSV recording for a 60 s capture per test.
- **Meta Quest Developer Hub (MQDH)** on a computer, for the performance overlay, screen casting and logcat. Put the headset in developer mode.
- **Remote debugging**: USB + `chrome://inspect` on the computer → Quest Browser tab → Console and Performance. Never keep DevTools open during an FPS measurement.
- A stopwatch (or a phone filming the headset view via casting), a tape measure, and a printed French course page.
- Desktop emulation: `npm run dev`, then `http://localhost:5173/app/?emu=living_room&device=quest2|quest3|glasses` (IWER emulator plus a synthetic Meta Scene room; rooms: `living_room`, `office_small`, `office_large`, `music_room`, `meeting_room`, `empty`).

Result boxes: mark **☐ Pass ☐ Fail**, and write the measured value in *Notes*.

### A.1 Hands only (no controllers, end to end)

| ID | Steps | Expected | Result | Notes |
|---|---|---|---|---|
| H-1 | Put the controllers in a drawer, turned off. Launch Loci from the library or PWA and complete the full onboarding. | Every step is reachable with hands: pinch the flame, scan, place ×5, lights out, recall ×5, proof. No "pick up your controller" prompt. | ☐ Pass ☐ Fail | |
| H-2 | Daily session: reload, recall all due notions, place 3 new, see the summary. | Hands only, no dead end. | ☐ Pass ☐ Fail | |
| H-3 | Gaze + pinch selects an object with the arm resting on your lap. | Selection works without extending the arm. | ☐ Pass ☐ Fail | |
| H-4 | Palm up reveals the answer. Try 10 times, then try 10 random hand movements. | 10/10 reveals, 0 accidental reveals. | ☐ Pass ☐ Fail | ___/10, ___ false |
| H-5 | Look at your palm → pause menu → resume. | Platform-style menu. Resume works. | ☐ Pass ☐ Fail | |
| H-6 | Close your fist for 1 s → quit. | Exits cleanly. Progress is saved (see P-1). No accidental quit during normal pinches. | ☐ Pass ☐ Fail | |
| H-7 | Voice answer (mic allowed). Say the correct answer, then a wrong one. | Correct → chime and the scene revives. Wrong → a breath and an exaggerated replay. | ☐ Pass ☐ Fail | |
| H-8 | Deny the mic permission, or remove the voice model. | Bubbles still work. No error panel. | ☐ Pass ☐ Fail | |
| H-9 | Dim room (a single lamp). Repeat H-3 to H-6. | Still usable. Note any tracking loss. | ☐ Pass ☐ Fail | |

### A.2 Performance: 60 fps with 20 scenes

| ID | Steps | Expected | Result | Notes |
|---|---|---|---|---|
| F-1 | Quest 2. Load the 20-notion palace (WWI & WWII) with **all 20 scenes placed and visible** (new tier = the most animated). Start an OVR Metrics CSV. Look around slowly for 60 s, seated. | FPS ≥ 60 sustained (the target is the display rate: 72 Hz on Quest 2). **Stale frames ≈ 0.** No visible judder. | ☐ Pass ☐ Fail | avg ___ / min ___ fps, stale ___ |
| F-2 | Same, but turn to look at all 20 at once (step back if needed). | Same as F-1. | ☐ Pass ☐ Fail | |
| F-3 | Same test during a recall burst: 5 correct answers in a row (scene revive animations and sounds). | No drop below 60 fps. | ☐ Pass ☐ Fail | |
| F-4 | Quest 3 / 3S: repeat F-1. | ≥ 72 fps. | ☐ Pass ☐ Fail | |
| F-5 | Budget check in the emulator. In the console run `__world.renderer.info.render` (calls, triangles) with 20 scenes. **[verify: the exposed handle name with the app lead]** | ≤ 150 draw calls, ≤ 150k triangles. | ☐ Pass ☐ Fail | calls ___ tris ___ |
| F-6 | A 10-minute session on Quest 2. Watch the thermal and GPU level in OVR Metrics. | No throttling-induced drop, no memory growth (check heap in remote DevTools before and after). | ☐ Pass ☐ Fail | |

How to read OVR Metrics: *FPS* is the app frame rate, and it should sit flat at the refresh rate. *Stale frames* counts frames the compositor had to reuse (> 0 means visible judder). *GPU U%* above ~90 % means no headroom.

### A.3 Cold start < 10 s

| ID | Steps | Expected | Result | Notes |
|---|---|---|---|---|
| C-1 | Returning user. Close Quest Browser completely (quit it from the universal menu). Start the stopwatch, tap the Loci PWA icon (or the bookmark), tap **Enter**. Stop when the due objects glow and the first can be selected. | **< 10 s.** | ☐ Pass ☐ Fail | ___ s (3 runs: ___ ___ ___) |
| C-2 | First ever launch (cleared site data). Measure until the flame waves. | < 10 s. Note: the voice model (~40 MB) must load **in the background** and never block. | ☐ Pass ☐ Fail | ___ s |
| C-3 | Slow network (phone hotspot, 3G-like). Repeat C-1. | Still < 10 s for a returning user (cached). | ☐ Pass ☐ Fail | ___ s |

### A.4 Pause / resume by removing the headset

| ID | Steps | Expected | Result | Notes |
|---|---|---|---|---|
| P-1 | During recall (question 3 of 5), take off the headset for 30 s, then put it back on. | You return to **the exact same point**: same question, same scene state, and no answer counted twice. | ☐ Pass ☐ Fail | |
| P-2 | During placement (while holding a scene), remove the headset. | On return, the scene is back in your hands or safely where it was. Nothing is lost. | ☐ Pass ☐ Fail | |
| P-3 | Press the Meta button → universal menu → resume. | Same as P-1. | ☐ Pass ☐ Fail | |
| P-4 | Remove the headset for 10+ minutes (the device sleeps). Wake it up. | Same step, or a reload that lands on the same step within 10 s. | ☐ Pass ☐ Fail | |
| P-5 | Kill Quest Browser during onboarding step "place ×5" (after 3 placements). Relaunch. | Continues at placement 4 of 5, with the 3 scenes on their objects. | ☐ Pass ☐ Fail | |

### A.5 Furniture detection & anchoring

| ID | Steps | Expected | Result | Notes |
|---|---|---|---|---|
| R-1 | Bedroom with a full Space Setup (desk, bed, shelf/storage, lamp, window, door). Onboarding scan. | The flame visits and halos **each** labelled object. The order is left → right from the seat. | ☐ Pass ☐ Fail | objects found: ___ |
| R-2 | Place scenes on 5 different objects. Walk around (stand up briefly), sit back down. | Scenes stay locked on their objects (no swimming or drifting). | ☐ Pass ☐ Fail | |
| R-3 | Quest 3: compare with Quest 2 on the same room. | Same objects detected (or better). Placement heights look right on surfaces. | ☐ Pass ☐ Fail | |

### A.6 Persistence across sessions and after Space Setup changes

| ID | Steps | Expected | Result | Notes |
|---|---|---|---|---|
| S-1 | Place 5 scenes. Quit (fist). Relaunch. | All 5 on the same objects, within ~5 cm. | ☐ Pass ☐ Fail | error ___ cm |
| S-2 | Next day (a real 24 h gap). Relaunch. | Same positions. Only due notions glow. | ☐ Pass ☐ Fail | |
| S-3 | Relaunch from a **different seat** in the same room (1 m away, rotated 45°). | Scenes still on their objects (registration from furniture). | ☐ Pass ☐ Fail | |
| S-4 | Edit Space Setup: move the desk box ~20 cm and redraw the lamp. Relaunch. | Scenes follow their furniture. Nothing floats in mid-air. | ☐ Pass ☐ Fail | |
| S-5 | Edit Space Setup: delete one box that held a scene. Relaunch. | That scene falls back gracefully (anchor or re-placement prompt by the flame). The others are unaffected. | ☐ Pass ☐ Fail | |
| S-6 | Redo the whole Space Setup from scratch (same furniture). Relaunch. | Scenes re-register onto the same real objects. | ☐ Pass ☐ Fail | |
| S-7 | Two palaces (History + Capitals) in the same room. Switch between them. | Each keeps its own placements and progress. | ☐ Pass ☐ Fail | |

### A.7 Unknown rooms & the wall-anchor fallback

| ID | Steps | Expected | Result | Notes |
|---|---|---|---|---|
| U-1 | A room with **no Space Setup** (or a new boundary). Launch the onboarding. | The flame proposes **hand-placed wall anchors**. The user can pin 5 anchors on walls with pinch. No dead end. | ☐ Pass ☐ Fail | |
| U-2 | A sparse room (only 1–2 boxes). | Mix of furniture and wall anchors. The route is still left → right. | ☐ Pass ☐ Fail | |
| U-3 | Quit and relaunch in the U-1 room. | Wall-anchored scenes come back (persistent anchors). | ☐ Pass ☐ Fail | |
| U-4 | Emulator: `/app/?emu=empty`. Run the e2e flow. | Fallback path completes. | ☐ Pass ☐ Fail | |

### A.8 Reach ≤ 60 cm, seated

| ID | Steps | Expected | Result | Notes |
|---|---|---|---|---|
| E-1 | Seated with your back against the chair. Measure with a tape from the sternum to every point you had to pinch or touch (flame, scenes in hand, bubbles, pause menu). | **Every** interaction target ≤ 60 cm. | ☐ Pass ☐ Fail | max ___ cm |
| E-2 | Do a full session in an armchair (airplane-seat posture, elbows on armrests). | Completable without leaning or standing. | ☐ Pass ☐ Fail | |
| E-3 | Placing on a far object (bed, 2 m away). | Achieved via gaze + pinch / ray, without walking. | ☐ Pass ☐ Fail | |

### A.9 Narrow FOV (Meta VR Glasses, ~70° × 66°)

| ID | Steps | Expected | Result | Notes |
|---|---|---|---|---|
| V-1 | Emulator: `/app/?emu=living_room&device=glasses`. Take screenshots of every onboarding step and every recall state (`node scripts/shoot.mjs "/app/?emu=living_room&device=glasses" out.png`). | The question, bubbles, flame hints and summary are **fully inside the frame** and centred (±20°), 0.45–0.8 m away. | ☐ Pass ☐ Fail | |
| V-2 | On Quest, keep your head still and look straight ahead during recall. | You can read the question and see all 3 bubbles without moving your head. | ☐ Pass ☐ Fail | |
| V-3 | Text size check: the question is readable at 0.8 m on Quest 2 (the lowest clarity). | Readable without squinting. | ☐ Pass ☐ Fail | |

### A.10 AI down → built-in palaces & offline pipeline

| ID | Steps | Expected | Result | Notes |
|---|---|---|---|---|
| A-1 | Server without `ANTHROPIC_API_KEY` (Vercel preview env). Import the French and the English sample courses from the phone. | The offline splitter and composer produce notions and scenes (`engine: 'offline'`). The flow completes. | ☐ Pass ☐ Fail | time ___ s |
| A-2 | Key set but invalid (or Claude times out: set `LOCI_AI_TIMEOUT_MS=1`). | Falls back to offline within the budget. The user sees no error. | ☐ Pass ☐ Fail | |
| A-3 | Headset with **no network** after the app has loaded once (airplane mode / Wi-Fi off). Start the capitals onboarding and the WWI & WWII palace. | Both built-in palaces are fully playable. Voice works if the model is cached. **[verify: offline caching strategy]** | ☐ Pass ☐ Fail | |
| A-4 | With a valid key: import a 3-page PDF. | Notions arrive on the phone in seconds (note the time). ≤ 20 notions. Every scene uses catalog models only. | ☐ Pass ☐ Fail | time ___ s |
| A-5 | "Remove the third-party service — is there still a project?" Demo the whole app with no key. | **Yes.** | ☐ Pass ☐ Fail | |

### A.11 French course import

| ID | Steps | Expected | Result | Notes |
|---|---|---|---|---|
| L-1 | Phone: paste a French course with accents and ligatures (é è ê à ç ô œ « » ’), e.g. *« La bataille de Verdun commence en 1916. »*, *« L'œuvre de Molière… »*. | Notions are extracted in French. The UI stays English. | ☐ Pass ☐ Fail | |
| L-2 | Photo of handwritten French notes. | Reasonable notions (AI path). The offline path handles printed text via the PDF text layer. | ☐ Pass ☐ Fail | |
| L-3 | Headset: questions and answers with accents render correctly (no tofu boxes, no mojibake). | Correct glyphs. | ☐ Pass ☐ Fail | |
| L-4 | Answer matching is accent-insensitive (bubble labels, and typed answers on the phone when editing): *Nimes* = *Nîmes*. | Match. | ☐ Pass ☐ Fail | |
| L-5 | Voice on a French palace. | Voice is English-only for now: bubbles are offered, no confusing failure. | ☐ Pass ☐ Fail | |

### A.12 First five minutes (Best First Five Minutes)

| ID | Steps | Expected | Result | Notes |
|---|---|---|---|---|
| O-1 | A first-time user (has never seen Loci), with no instructions from us. Film via casting. | They reach **"5 out of 5"** (or n/5) by ~5:00, **without reading any text panel** and without our help. | ☐ Pass ☐ Fail | time ___, help given: ___ |
| O-2 | Timecodes: flame waves ≤ 0:15 · pinch learned ≤ 0:30 · scan ≤ 1:00 · first placement ≤ 1:45 · recall starts ≤ 3:30. | Within ±30 s. | ☐ Pass ☐ Fail | |

### A.13 Automated checks (before every on-device run)

```bash
npx tsc --noEmit          # types
npx vitest run            # unit tests (core logic: SRS, tiers, planner, route, registration, matching, composer, storage)
npx playwright test       # e2e in headless Chromium + IWER emulator + synthetic Meta Scene rooms
node scripts/shoot.mjs "/" test-results/landing-desktop.png 1440 2400   # landing visual check
```

☐ All green on commit ________

---

## B. Learning study: Loci vs. re-reading

### B.1 Question & hypothesis
**Question:** For facts of the kind students memorise for exams, does learning with Loci lead to better recall than re-reading notes for the same time?
**Hypothesis (write it down before collecting data):** Recall of Loci-learned facts is higher than recall of re-read facts at **48 hours** and at **7 days**. The immediate difference may be small.

Write the hypothesis, design, scoring rules and analysis in a dated document (or a git commit) **before the first participant**. That is our pre-registration. Don't change them afterwards. Report any deviation.

### B.2 Ethics
- **Informed consent.** Before starting, each participant reads and signs a one-page consent sheet: what they will do, how long it takes (~25 min on day 0, then 5 min on day 2 and 5 min on day 7), that participation is **voluntary**, that they may **stop at any time** without giving a reason, and how their data is used.
- **Adults.** The competition team is 18+. Recruit **classmates aged 18 or over** for simplicity. **Minors need written consent from a parent or guardian plus their own agreement**, and the school may need to approve. If in doubt, don't include minors.
- **Anonymity.** Each participant gets a code (P01, P02…). Names live only on the consent sheets, stored separately. No names in any shared file, chart or video. Report only aggregates and per-code results.
- **No pressure.** No link to grades. No incentive big enough to feel coercive (a coffee is fine). Friends must feel free to say no.
- **Headset safety.** Seated only. Clean the facial interface between users. Offer breaks. Stop at any sign of discomfort or motion sickness. Ask about photosensitive epilepsy and exclude it if relevant.
- **Data.** Paper answer sheets and a spreadsheet on one encrypted laptop. Delete raw sheets after the competition, or keep them anonymised.

### B.3 Design: within-subjects, counterbalanced
Each participant learns **two sets of 20 facts**, one with **Loci** and one by **re-reading notes**. Set and order are counterbalanced across four groups:

| Group | First (day 0, block 1) | Second (day 0, block 2) |
|---|---|---|
| 1 | Set A with Loci | Set B re-reading |
| 2 | Set B with Loci | Set A re-reading |
| 3 | Set A re-reading | Set B with Loci |
| 4 | Set B re-reading | Set A with Loci |

Assign participants to groups in rotation (P01 → 1, P02 → 2, …). Aim for **N ≥ 12** (3 per group), ideally 16–20.

**Materials**
- **Set A** and **Set B**: 20 question–answer facts each, **matched in difficulty and type** (e.g. 8 dates, 6 names/places, 6 definitions or numbers). Use topics the participants don't already know well: e.g. Set A = WWI & WWII dates and events, Set B = lesser-known capitals and landmarks, or two halves of the same unseen chapter. Pilot on 2 people and swap items so both sets score similarly under re-reading.
- **Re-reading condition:** the same 20 facts on one printed page, in the note style students actually use (headings plus sentences, answers in bold). Highlighters allowed.
- **Loci condition:** the same 20 facts imported as a palace, placed in the room where the study happens. Use the participant's own room if possible, otherwise a quiet bedroom-like room with the same furniture for everyone.

**Procedure (day 0)**
1. Consent, a demographics line (age bracket, prior VR use: none / some / a lot), and a 1-minute pre-check: "Do you already know any of these?" → mark items already known. Exclude known items from scoring for that participant.
2. **Block 1: study for 12 minutes** in the assigned condition.
   - Loci: a short onboarding (capitals) **not counted** in the 12 minutes. Then place and recall the 20 notions with the app's normal flow.
   - Re-reading: read, re-read and highlight the page for 12 minutes. No self-testing allowed (a timer, and the experimenter present).
3. **Distractor**: 5 minutes of an unrelated task (a simple puzzle), to clear working memory.
4. **Immediate test** on block 1 (cued recall, see B.4).
5. 5-minute break. **Block 2** with the other condition and set, then the same distractor and immediate test.
6. Instruct: "Please don't study or look up these facts before the next test." Ask them to note it honestly if they did.

**Delayed tests:** **48 hours** and **7 days** after day 0: the same cued-recall tests for both sets, in a random order of items. Tests are on paper, 5 minutes per set, with no headset.

> The tests themselves are retrieval practice, so they help both conditions equally. The 48 h test therefore slightly inflates the 7-day scores for **both** conditions. That's fine for a comparison, but say so in the report.
>
> Loci is normally used with daily spaced sessions. This design deliberately tests a **single study session** so the comparison is fair on time. Optionally, run a second "as designed" arm later (daily 5-minute Loci sessions vs. daily 5-minute re-reading). Report it separately.

### B.4 Tests & scoring
- **Cued recall:** each question printed exactly as in the app (e.g. "In which year did the Battle of the Somme begin?"). The participant writes the answer. No multiple choice (bubbles would give Loci an unfair advantage).
- **Scoring rubric, fixed in advance:**
  - **1 point:** correct (spelling mistakes that don't change the answer are OK; for a year, the exact year).
  - **0.5 point:** partially correct (right decade; a surname without the first name when both were required).
  - **0 points:** wrong or blank.
- **Blind scoring:** someone who doesn't know which condition each set was learned in scores the sheets (the experimenter removes condition labels and uses codes). A second scorer re-scores 25 % of the sheets. Report their agreement (% identical).
- **Per participant and time point:** `% recalled = points / (20 − items already known)` for each condition.

### B.5 Analysis
- The primary outcome is the **difference Loci − re-reading in % recalled at 7 days**, per participant. Secondary outcomes: 48 h and immediate.
- Report the **mean and SD of each condition**, the **mean difference with a 95 % confidence interval**, and the **number of participants for whom Loci > re-reading, = and <**.
- Test: **Wilcoxon signed-rank** (small N, paired) on the per-participant differences. Also give the paired t-test for reference. Effect size: Cohen's *d_z* (mean difference / SD of differences).
- Check **order and set effects** (did Set A turn out easier? did the first block score higher?). With a counterbalanced design they should cancel out. Report them anyway.
- Plot one line per participant (re-reading → Loci) at each time point. Show everyone, not just the average.

### B.6 Reporting honestly
- Publish **all** results, including a null or negative result. "We found no difference at 7 days in 14 classmates" is a valid and useful finding.
- State the limits plainly: **small sample**, **friends of the developer** (they may want Loci to win), **novelty effect** of VR, **single session**, **our own item sets**, **not peer-reviewed**.
- Never extrapolate ("Loci doubles your grades"). Say exactly what was measured: *"In a pilot with N = __ classmates, facts learned with Loci were recalled at __ % vs __ % for re-reading after 7 days (mean difference __ points, 95 % CI __ to __)."*
- In the video and on Devpost, only show numbers from this study, with **N** and the time point visible. If the study isn't finished by the deadline, say "study in progress". Don't show numbers.
- Keep the anonymised spreadsheet and this protocol in the repo (`docs/study/`), so anyone can check them.

### B.7 Materials checklist
- [ ] Consent sheet (plus a parental consent version, if minors are ever included)
- [ ] Set A and Set B (20 items each) + the printed re-reading pages + the Loci palaces (imported or built in)
- [ ] Distractor puzzles
- [ ] Test sheets: immediate, 48 h and 7 d, for each set, with item order randomised per time point
- [ ] Participant code list (kept separate from the consent sheets)
- [ ] Scoring rubric + a blind scorer
- [ ] Spreadsheet template: `code, group, set_loci, known_items, imm_loci, imm_reread, h48_loci, h48_reread, d7_loci, d7_reread, prior_vr, studied_between (y/n), notes`
