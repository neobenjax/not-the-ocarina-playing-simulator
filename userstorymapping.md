# User Story Mapping — Not The Ocarina Playing Simulator

## Agile Standards Applied

### The 3 Cs
- **Card**: The concise user story written in `"As a [role], I want [goal], so that [value]"` format.
- **Conversation**: Design clarifications, edge cases, and technical notes agreed upon before implementation.
- **Confirmation**: Testable Acceptance Criteria in `Given / When / Then` format.

### INVEST Checklist
Every story below is **I**ndependent, **N**egotiable, **V**aluable, **E**stimable, **S**mall, and **T**estable.

### Definition of Ready (DoR)
- Story has clear role, goal, value, and `Given / When / Then` acceptance criteria.
- UI/audio/haptic dependencies are identified.
- Target milestone branch is defined.

### Definition of Done (DoD)
- Code implemented in TypeScript/HTML/CSS with zero TypeScript or console errors.
- Haptic feedback (`web-haptics`) and Sound Machine SFX wired to all interactive elements.
- Responsive across Desktop (`1280×800`), Tablet (`768×1024`), and Mobile (`390×844`).
- Verified with Playwright E2E tests and merged to `main` via Pull Request.

---

## Milestone 1: Core Ocarina, Audio, Key Mapping & Haptics (`feature/m1-core-ocarina-audio-haptics`)

### US-1.1: Responsive Visual SVG Ocarina
**Card**: As a player on desktop, tablet, or mobile, I want to interact with a responsive SVG Ocarina of Time, so that I can play notes comfortably on any screen size.
- **Conversation**: SVG uses `viewBox` scaling, accessible `role="button"` / `aria-label` on holes, and pointer events (`pointerdown`/`pointerup`/`pointerleave`) for multi-touch and mouse support.
- **Confirmation (Acceptance Criteria)**:
  - **Given** I open the app on desktop, tablet, or mobile viewport
  - **When** the page loads
  - **Then** the Ocarina SVG renders crisply without horizontal overflow, and tapping/clicking any hole highlights it and triggers haptic + visual ripple feedback.
- **Tasks**:
  - [ ] Design Ocarina of Time SVG with 5 musical holes, mouthpiece, and Triforce band.
  - [ ] Implement procedural Web Audio Ocarina synthesizer (`ocarinaSynth.ts`).
  - [ ] Integrate `web-haptics` for hole press, blow air, and UI button taps.
  - [ ] Generate atmospheric Hyrule backdrop assets using Gemini Nano Banana (`generate_image`).

### US-1.2: Desktop Key Mapping & Blow Air Control
**Card**: As a desktop player, I want to customize keyboard keys for each Ocarina hole and a dedicated "Blow Air" key, so that I can play the Ocarina like a real wind instrument.
- **Conversation**: Key-bind badges must be visible on desktop (`pointer: fine`) and hidden automatically on touch devices (`pointer: coarse`). Supports Breath Mode (hold Blow Air + hole) and Direct Mode.
- **Confirmation (Acceptance Criteria)**:
  - **Given** I am on a desktop device
  - **When** I open Key Mapping and assign a new key to a hole or "Blow Air"
  - **Then** the new key badge updates on the Ocarina SVG, persists in `localStorage`, and pressing it plays the corresponding note when air is blown.
  - **Given** I am on a touch device
  - **When** I view the Ocarina
  - **Then** keyboard key-bind badges are hidden from the Ocarina interface.
- **Tasks**:
  - [ ] Build `KeyMapModal` with interactive "Press any key" capture and conflict detection.
  - [ ] Implement Blow Air state machine + breath airflow visual animation.
  - [ ] Add touch-device detection to hide key-bind labels on touch screens.

### US-1.3: Sound Machine Generator SFX & Menu BGM
**Card**: As a player, I want crisp game UI sounds, error sounds, and menu background music generated from Sound Machine Generator, so that the app feels like a polished Nintendo/arcade game.
- **Conversation**: Use `https://neobenjax.github.io/sound-machine-generator/` WebMCP console & DAW to compose and export Vanilla Web Audio recipes for UI click, modal open, melody chime, error buzz, fanfare, and Hyrule-inspired ambient BGM loop.
- **Confirmation (Acceptance Criteria)**:
  - **Given** I interact with buttons, modals, or toggle Menu BGM
  - **When** an action occurs
  - **Then** the corresponding Sound Machine Generator Web Audio recipe plays cleanly without external audio file failures.
- **Tasks**:
  - [ ] Compose and export SFX & BGM recipes from `sound-machine-generator` via WebMCP.
  - [ ] Implement `soundMachineSfx.ts` with volume controls and mute toggle.

---

## Milestone 2: Ocarina Mask/Design Gallery & Custom SVG Module (`feature/m2-ocarina-gallery-custom-svg`)

### US-2.1: Ocarina Skin Gallery
**Card**: As a player, I want to switch my Ocarina's visual mask/design from a gallery of themed skins, so that I can personalize my instrument.
- **Conversation**: Include 6 distinct skins (Ocarina of Time, Kokiri Fairy, Majora's Mask, Sheikah Slate, Golden Triforce, Zora Pearl) with live preview cards.
- **Confirmation (Acceptance Criteria)**:
  - **Given** I open the Ocarina Gallery
  - **When** I select a different skin
  - **Then** the main Ocarina SVG immediately updates its colors, textures, and emblems, and persists across reloads.
- **Tasks**:
  - [ ] Author 6 themed SVG skin definitions in `ocarinaSkins.ts`.
  - [ ] Build `SkinGalleryModal` with preview cards and haptic selection.

### US-2.2: Custom SVG Template Download & Re-Upload
**Card**: As a creative player, I want to download an SVG template with instructions, customize it in an editor, and upload it back, so that I can play with my own custom Ocarina design.
- **Conversation**: Template must document required `data-hole="hole-a|hole-down|hole-right|hole-left|hole-up"` attributes. Uploader must sanitize `<script>` tags and validate hole elements.
- **Confirmation (Acceptance Criteria)**:
  - **Given** I am in the Customize Ocarina tab
  - **When** I download the SVG template, edit it, and upload the `.svg` file
  - **Then** the app validates the hole elements, previews the custom Ocarina, and lets me select it as my active instrument.
- **Tasks**:
  - [ ] Generate downloadable `ocarina-template.svg` and step-by-step instructions.
  - [ ] Implement SVG sanitizer, hole validator, and `localStorage` custom skin storage.

---

## Milestone 3: Mode 1 — Free Play, Partiture Timeline Editor & MP3 Export (`feature/m3-free-play-composer-mp3`)

### US-3.1: Free Play & Live Recording
**Card**: As a creative player, I want to play freely and record my performance into a partiture track, so that I can capture musical ideas in real time.
- **Conversation**: Live staff displays played notes; classic Zelda melody easter egg detects iconic 6–8 note motifs.
- **Confirmation (Acceptance Criteria)**:
  - **Given** I am in Mode 1 (Free Play)
  - **When** I click Record and play notes on the Ocarina
  - **Then** each note's pitch, timestamp, and duration are captured into the active partiture timeline.
- **Tasks**:
  - [ ] Build live musical staff / ocarina tab visualizer.
  - [ ] Implement real-time note recorder with BPM & optional metronome.
  - [ ] Add classic OoT melody recognition toast + fanfare.

### US-3.2: Video-Editor-Style Partiture Timeline Editor
**Card**: As a composer, I want to edit my recorded notes on a visual partiture timeline, so that I can refine timing, pitch, and note lengths like in a video editor.
- **Conversation**: Horizontal multi-lane musical staff where each row is an Ocarina hole, with drag-to-move, right-edge drag-to-resize, click-to-add, delete, snap-to-grid, and scrubbing playhead.
- **Confirmation (Acceptance Criteria)**:
  - **Given** I have a recorded or new track in the Timeline Editor
  - **When** I drag a note, resize its duration, or add/delete a note and press Play
  - **Then** the partiture reflects my edits and plays back the updated melody accurately.
- **Tasks**:
  - [ ] Build interactive HTML/SVG/Canvas partiture timeline with playhead & grid snap.
  - [ ] Implement drag-move, resize-duration, add-note, and delete-note interactions.

### US-3.3: Customizable Playlists, Partiture `.txt` & MP3 Export
**Card**: As a composer, I want to save tracks into custom playlists, export them as `.mp3` audio, and download/load partiture `.txt` files, so that I can listen to and share my music.
- **Conversation**: Use `OfflineAudioContext` + `lamejs` for client-side MP3 export. Partiture `.txt` format is human-readable and shareable between Mode 1 and Mode 2.
- **Confirmation (Acceptance Criteria)**:
  - **Given** I have composed a song in Mode 1
  - **When** I save it to a playlist, export MP3, or download Partiture `.txt`
  - **Then** the playlist persists in `localStorage`, a valid `.mp3` file downloads, and the `.txt` file can be re-imported cleanly.
- **Tasks**:
  - [ ] Build Playlist manager (create, rename, delete playlists & tracks).
  - [ ] Implement `mp3Exporter.ts` using `OfflineAudioContext` + `lamejs`.
  - [ ] Implement human-readable `.ocarina.txt` serializer and parser/importer.

---

## Milestone 4: Mode 2 — Arcade Play & PIU Phoenix 2 Scoring (`feature/m4-arcade-mode-piu-phoenix2`)

### US-4.1: Horizontal Taiko-Style Rhythm Highway & Preloaded Zelda Songs
**Card**: As an arcade player, I want to tap Ocarina notes scrolling from right to left in sync with Legend of Zelda songs, so that I experience an exciting rhythm game.
- **Conversation**: 9+ preloaded Zelda partitures. Notes scroll right-to-left toward the receptor. Supports keyboard, mouse, and touch taps.
- **Confirmation (Acceptance Criteria)**:
  - **Given** I select a preloaded Zelda song in Mode 2 and press Start
  - **When** notes scroll from right to left across the receptor
  - **Then** hitting the matching note at the right time triggers judgement popups (PERFECT/GREAT/GOOD/BAD), combo increment, and haptic feedback.
- **Tasks**:
  - [ ] Author 9+ *Legend of Zelda* rhythm charts in `zeldaSongs.ts`.
  - [ ] Build 60fps `requestAnimationFrame` horizontal scrolling highway & receptor.

### US-4.2: Assist Modes (Novice / Original), Metronome, Miss Distortion & Game Over
**Card**: As an arcade player, I want to choose Novice or Original assist, toggle a metronome, hear a distorted note on misses, and fail if I miss more than 10 notes in a row, so that the game scales from beginner-friendly to arcade-authentic.
- **Conversation**: Novice plays backing guide melody softly + loud hit note; Original plays melody ONLY on hit. Missing > 10 consecutive notes (11th miss in a row) triggers Game Over.
- **Confirmation (Acceptance Criteria)**:
  - **Given** I play in Original mode with Metronome on
  - **When** I miss a note
  - **Then** a distorted note sound plays, no clean melody note sounds, and if my consecutive miss streak exceeds 10, the Game Over screen appears.
- **Tasks**:
  - [ ] Implement Novice vs. Original audio routing & Metronome assist.
  - [ ] Implement distorted note synthesizer for misses & >10 consecutive miss Game Over.

### US-4.3: Pump It Up Phoenix 2 Scoring, Offset Calibration & Custom Song Play
**Card**: As a rhythm game enthusiast, I want PIU Phoenix 2 scoring (1,000,000 max / SSS+ to F), offset calibration, and the ability to play my own or imported songs, so that I can chase high scores and practice my own compositions.
- **Conversation**: Exact PIU Phoenix 2 formula (`0.995 * accuracy + 0.005 * maxCombo/totalNotes`, floored to 1,000,000) + grades (`SSS+` to `F`) + plates.
- **Confirmation (Acceptance Criteria)**:
  - **Given** I complete a song in Mode 2
  - **When** the Results screen appears
  - **Then** my score (out of 1,000,000), PIU Phoenix 2 letter grade, plate, and judgement breakdown are calculated accurately and saved as a personal best.
  - **Given** I adjust the audio/visual offset or load a custom/imported `.txt` song
  - **When** I play Mode 2
  - **Then** the chart timing shifts by the configured offset and plays the custom song cleanly.
- **Tasks**:
  - [ ] Implement PIU Phoenix 2 scoring calculator, grade & plate evaluator.
  - [ ] Add Offset calibration (ms slider + tap-to-calibrate) & Scroll Speed options.
  - [ ] Enable selecting Mode 1 playlist tracks and importing `.txt` files in Mode 2.

---

## Milestone 5: E2E Verification, Audit & Live GitHub Pages Deployment (`feature/m5-e2e-verification-polish`)

### US-5.1: Automated E2E Testing & Live GitHub Pages Verification
**Card**: As the project owner, I want the full application deployed to GitHub Pages and verified end-to-end in a real browser across desktop and mobile viewports, so that every feature is guaranteed to work online.
- **Confirmation (Acceptance Criteria)**:
  - **Given** the app is merged to `main` and deployed via GitHub Actions
  - **When** Playwright tests run against the live GitHub Pages URL on desktop and mobile
  - **Then** all modes, key mapping, gallery/custom SVG, composer/MP3, arcade scoring, and settings pass with zero console or page errors.
- **Tasks**:
  - [ ] Write Playwright E2E test suite (`tests/e2e.spec.ts`).
  - [ ] Run local E2E suite, fix any defects, merge to `main`.
  - [ ] Verify GitHub Actions deployment succeeds and run Playwright verification against `https://neobenjax.github.io/not-the-ocarina-playing-simulator/`.


---

## Stage 2 Milestones (MVPs 6–9)

## Milestone 6: Dedicated Game Screens, Title Art, Fullscreen & PWA (`feature/m6-game-screens-pwa-fullscreen`)

### US-6.1: Title Screen & Dedicated Mode Screens
**Card**: As a player, I want a dedicated Title Screen displaying "Not The Ocarina Playing Simulator" with game illustrations and separate full-screen views for each mode, so that it feels like a real video game rather than a web dashboard.
- **Confirmation (Acceptance Criteria)**:
  - **Given** I open the application
  - **When** the page loads
  - **Then** I see the Title Screen with the game title, Gemini Nano Banana key art, and buttons to enter Mode 1 (Composer) or Mode 2 (Arcade), each opening its own dedicated screen with a Back to Menu button.
- **Tasks**:
  - [ ] Build `TitleScreen` with `title-hero-art.jpg` and arcade mode cards.
  - [ ] Refactor `main.ts` into a screen-based router (`title`, `composer`, `arcade-select`, `arcade-play`, `arcade-results`).

### US-6.2: Fullscreen Toggle & PWA Installability
**Card**: As a mobile or desktop player, I want a Fullscreen button and PWA "Add to Home Screen" support, so that I can play without browser chrome and launch the game like a native app.
- **Confirmation (Acceptance Criteria)**:
  - **Given** I tap the Fullscreen button or Install App button
  - **When** supported by the browser
  - **Then** the game toggles fullscreen mode, and the PWA manifest + service worker allow installing the app to the home screen.
- **Tasks**:
  - [ ] Add `public/manifest.webmanifest` and `public/sw.js`.
  - [ ] Implement Fullscreen toggle and `beforeinstallprompt` + iOS install helper.

---

## Milestone 7: Composer Ocarina-First Input, Sample Dropdown & Auto-Scroll (`feature/m7-composer-ocarina-input-samples`)

### US-7.1: Sample Partitures Dropdown & Ocarina-First Note Input
**Card**: As a composer, I want a dropdown preloaded with all Zelda sample songs and the ability to insert notes into the partiture simply by playing the Ocarina, so that I can learn and compose naturally using the instrument.
- **Confirmation (Acceptance Criteria)**:
  - **Given** I am in Mode 1 (Composer)
  - **When** I select a sample song from the dropdown, its partiture loads; and when I hit a note on the Ocarina, that note is added to the partiture automatically.
- **Tasks**:
  - [ ] Add Sample Partiture dropdown with all 9 Zelda songs + saved playlist tracks.
  - [ ] Insert notes into the partiture on Ocarina hole hits (Step Input & Record modes).
  - [ ] Auto-scroll the partiture timeline horizontally during playback and recording.
  - [ ] Anchor the Ocarina SVG at the bottom of the Composer screen.

---

## Milestone 8: Taiko-Style Arcade Stage & Results Redesign (`feature/m8-arcade-taiko-stage-redesign`)

### US-8.1: Dedicated Song Select, Gameplay Stage & Results Screens
**Card**: As an arcade player, I want a dedicated Song Select screen, a Taiko-style Gameplay Stage with the highway at the top and Ocarina at the bottom, and an illustrated Results screen, so that Arcade Mode feels like Taiko Web & Pump It Up.
- **Confirmation (Acceptance Criteria)**:
  - **Given** I enter Mode 2 (Arcade)
  - **When** I pick any of the 9+ Zelda songs and start the stage
  - **Then** the Gameplay Stage displays the festival HUD, Soul Gauge, scrolling highway at the top, stage art in the middle, and interactive Ocarina at the bottom, followed by a celebratory Results screen.
- **Tasks**:
  - [ ] Build dedicated `arcade-select` screen with clear song cards + quick selector for all 9+ songs.
  - [ ] Redesign `arcade-play` layout with top Soul Gauge/HUD, highway, `arcade-stage-banner.jpg`, and bottom Ocarina.
  - [ ] Redesign `arcade-results` screen with `results-victory-art.jpg` and PIU Phoenix 2 breakdown.

---

## Milestone 9: Stage 2 E2E Verification & Live GitHub Pages Deployment (`feature/m9-stage2-e2e-deploy`)
- **Tasks**:
  - [ ] Update `tests/e2e.spec.ts` for all Stage 2 screens, sample dropdowns, Ocarina-to-partiture input, auto-scroll, and PWA manifest.
  - [ ] Merge to `main`, deploy via GitHub Actions, and verify live on `https://neobenjax.github.io/not-the-ocarina-playing-simulator/`.
