# SPEC.MD — Not The Ocarina Playing Simulator

## 1. Project Vision & Scope
**Not The Ocarina Playing Simulator** is a responsive, highly visual browser-based Ocarina instrument and rhythm game inspired by *The Legend of Zelda: Ocarina of Time* and arcade rhythm games (*Taiko no Tatsujin*, *Pump It Up Phoenix 2*, *O2Jam*, *DDR*). It runs smoothly across desktop, tablet, and mobile devices and is deployed to GitHub Pages via GitHub Actions.

---

## 2. Core Features & Functional Requirements

### 2.1 Virtual Ocarina Instrument (Cross-Device)
- **Responsive SVG Ocarina**: Vector-based Ocarina of Time design with 5 primary musical holes (`A` / D5, `C-Down` / F5, `C-Right` / A5, `C-Left` / B5, `C-Up` / D6) plus extended chromatic/octave holes or pitch-bend support, mouthpiece, and ornamental Triforce/silver band.
- **Desktop Key Mapping**:
  - Fully customizable keyboard bindings for each Ocarina hole/note.
  - Dedicated **"Blow Air"** key binding (e.g., `Space` by default) and on-screen button that simulates blowing air into the ocarina.
  - **Breath Mode vs. Direct Mode**: In Breath Mode (default on desktop), notes sound while air is being blown and pitch changes with fingered holes; in Direct Mode (or on touch devices), tapping/holding holes triggers air + note automatically while still supporting the dedicated Blow Air button.
  - **Key-Bind Labels**: Displayed on the Ocarina SVG/interface on desktop (`pointer: fine`) and automatically hidden on touch devices (`pointer: coarse` / touch-only).
- **Ocarina Audio Engine**:
  - Real-time Web Audio API procedural ocarina synthesizer (warm sine/triangle blend, subtle breath noise filtered through bandpass, gentle vibrato LFO, smooth attack/release envelope).

### 2.2 Ocarina Mask / Design Gallery & Custom SVG Module
- **Design Gallery**: Built-in curated Ocarina skins:
  1. *Ocarina of Time (Royal Sapphire)*
  2. *Kokiri Fairy Ocarina (Forest Wood)*
  3. *Majora's Mask (Termina Violet & Gold)*
  4. *Sheikah Slate (Ancient Cyan)*
  5. *Golden Triforce (Sacred Relic)*
  6. *Zora Pearl (Luminous Teal)*
- **Custom SVG Module**:
  - Downloadable `.svg` template with documented `data-hole` / `id` attributes and `viewBox` guidelines.
  - Step-by-step customization instructions modal/panel.
  - Drag-and-drop / file picker SVG upload with sanitization, hole-mapping validation, live preview, and `localStorage` persistence.

### 2.3 Mode 1: Free Play & Partiture Composer
- **Free Play**:
  - Play freely with live musical staff / ocarina tab display.
  - Classic *Ocarina of Time* melody recognition easter egg (e.g., Zelda's Lullaby, Song of Storms, Saria's Song, Song of Time, Epona's Song, Sun's Song) with celebratory chime and visual banner.
- **Recording & Video-Editor-Style Partiture Timeline**:
  - Hit **Record** to capture live performance (note pitch, start beat/time, duration) against a configurable BPM & optional metronome.
  - **Partiture Timeline Editor**: Video-editor-inspired horizontal multi-lane musical staff timeline:
    - Drag notes horizontally (time) and vertically (hole/pitch).
    - Resize note duration handles.
    - Add, delete, duplicate notes; snap-to-grid (`1/4`, `1/8`, `1/16`, `Off`).
    - Scrubbable playhead with Play / Pause / Stop / Loop.
- **Playlists & Persistence**:
  - Create, rename, and delete customizable playlists in `localStorage`.
  - Save, edit, and organize composed tracks inside playlists.
- **Export & Import**:
  - **MP3 Export**: Offline-render the composed partiture via `OfflineAudioContext` and encode to `.mp3` in-browser (`lamejs`) for direct download.
  - **Partiture Text File (`.txt`)**: Human-readable song partiture text format (metadata header + beat/note/duration notation) that can be downloaded and re-imported by any player into Mode 1 or Mode 2.

### 2.4 Mode 2: Arcade Play (Rhythm Game)
- **Horizontal Taiko-Style Highway**:
  - Notes scroll **right-to-left** toward a glowing Triforce/Drum receptor on the left.
  - Supports tap notes and hold notes with color-coded Ocarina hole icons.
- **Audio & Assist Modes**:
  - **Novice**: Full guide melody plays softly in the background; hitting notes on-beat plays the Ocarina louder & crisper.
  - **Original**: Melody note sounds **only** when the player hits the note in the correct timing window.
  - **Metronome Assist**: Toggleable on/off to mark the tempo.
  - **Miss Penalty**: Missing a note or hitting out of timing triggers a distorted note noise.
  - **Fail Condition**: **More than 10 consecutive misses** (> 10 in a row, i.e., 11th consecutive miss) triggers **Game Over**.
- **Scoring System — Pump It Up Phoenix 2**:
  - 1,000,000-point scale (also displayed as `1000.000k` / `1,000,000` max):
    $$\text{Score} = \left\lfloor \frac{0.995 \times (\text{PERFECT} + 0.6 \cdot \text{GREAT} + 0.2 \cdot \text{GOOD} + 0.1 \cdot \text{BAD}) + 0.005 \times \text{MAX\_COMBO}}{\text{TOTAL\_NOTES}} \times 1{,}000{,}000 \right\rfloor$$
  - **Grades**: `SSS+` (995k+), `SSS` (990k+), `SS+` (985k+), `SS` (980k+), `S+` (975k+), `S` (970k+), `AAA+` (960k+), `AAA` (950k+), `AA+` (940k+), `AA` (920k+), `A+` (900k+), `A` (800k+), `B` (700k+), `C` (600k+), `D` (500k+), `F` (<500k).
  - **Plates**: *Perfect Game*, *Ultimate Game*, *Extreme Game*, *Superb Game*, *Marvelous Game*, *Talented Game*, *Fair Game*, *Rough Game*.
- **Preloaded Zelda Partitures & Custom Songs**:
  - 9+ preloaded *Legend of Zelda* songs adapted to playable rhythm charts (Zelda's Lullaby, Song of Storms, Saria's Song, Song of Time, Epona's Song, Sun's Song, Bolero of Fire, Serenade of Water, Nocturne of Shadow).
  - Play user-composed songs from Mode 1 playlists or import `.txt` partitures from other players.
- **Rhythm Calibration & Options**:
  - Audio/Visual **Offset** calibration (ms slider + interactive tap-to-calibrate).
  - Scroll Speed multiplier (`1x` – `4x`), Volume mixers (Master, Ocarina, Guide, Metronome, SFX/BGM).

### 2.5 Sound Design & Haptics
- **Sound Machine Generator**: All UI SFX (button clicks, navigation, modal open, error/distorted miss, stage clear fanfare, game over) and Menu BGM generated via `https://neobenjax.github.io/sound-machine-generator/` (WebMCP Console & DAW) as zero-dependency Web Audio recipes.
- **WebHaptics (`web-haptics`)**: Tactile haptic feedback on all interactive buttons, ocarina holes, air-blow activation, arcade note hits/misses, score tallying, and win/game-over events.

---

## 3. Milestones & Branching Strategy
Every milestone is developed on a dedicated `feature/*` branch, tested, pushed, opened as a PR, and merged into `main`:
1. **Milestone 1 (`feature/m1-core-ocarina-audio-haptics`)**: Core SVG Ocarina, Web Audio synth, key mapping + Blow Air, touch detection, Sound Machine SFX/BGM, WebHaptics, Gemini Nano Banana assets.
2. **Milestone 2 (`feature/m2-ocarina-gallery-custom-svg`)**: Ocarina Mask/Design Gallery + Custom SVG template download, instructions, upload, and persistence.
3. **Milestone 3 (`feature/m3-free-play-composer-mp3`)**: Mode 1 Free Play, Live Recording, Partiture Timeline Editor, Playlists, `.txt` Partiture Export/Import, MP3 Export.
4. **Milestone 4 (`feature/m4-arcade-mode-piu-phoenix2`)**: Mode 2 Arcade Play, Taiko horizontal highway, 9+ Zelda songs, Novice/Original, Metronome, >10 miss Game Over, PIU Phoenix 2 scoring, Offset calibration, Custom song play.
5. **Milestone 5 (`feature/m5-e2e-verification-polish`)**: Comprehensive Playwright E2E tests (desktop & mobile), accessibility & modern-web-guidance audit, live GitHub Pages deployment & online verification.


---

## 4. Stage 2 — Game-First Screen Architecture & Enhancements

### 4.1 Dedicated Game Screens (Single-Focus Views)
Inspired by *Taiko Web* (`taikoapp.uk/#game`) and arcade rhythm games:
1. **Title / Main Game Screen**: Displays **"NOT THE OCARINA PLAYING SIMULATOR"**, Gemini Nano Banana hero key-art (`title-hero-art.jpg`), big arcade mode launch buttons (**Mode 1: Free Play & Composer**, **Mode 2: Arcade Rhythm**), and quick actions (**Skins**, **Keys**, **Settings**, **Fullscreen**, **Install App**).
2. **Mode 1 Composer Screen**: Full-screen game layout with Partiture Timeline + **Sample Song Dropdown** (all 9 Zelda samples + user playlists) at the top, and the **Interactive Ocarina** anchored at the bottom. Hitting notes on the Ocarina directly inserts notes into the partiture (both Live Step Input and Real-Time Record), and hitting **Play** auto-scrolls the partiture horizontally with the playhead.
3. **Mode 2 Song Select Screen**: Dedicated arcade song-select screen showcasing all 9+ Zelda partitures, custom/imported songs, Novice/Original assist, Metronome, Offset, and a prominent **PLAY STAGE** button.
4. **Mode 2 Gameplay Stage Screen**: Taiko-Web-style layout with top festival HUD (Song Title, **Soul Gauge**, Score, Combo, Miss Streak, Fullscreen, Restart, Quit), upper-middle **Right-to-Left Note Highway**, illustrated **Hyrule Festival Stage** (`arcade-stage-banner.jpg`), and the **Interactive Ocarina** anchored at the bottom.
5. **Mode 2 Results / Game Over Screen**: Celebratory Stage Clear screen (`results-victory-art.jpg`) with Soul Gauge, PIU Phoenix 2 Score (`1,000,000` & `1000` scale), Grade (`SSS+`–`F`), Plate, and Judgement Breakdown.

### 4.2 Fullscreen & PWA Installability
- **Fullscreen Button**: Available in the Title Screen and every mode's HUD (`document.documentElement.requestFullscreen()`).
- **PWA ("Add to Home Screen")**: `manifest.webmanifest`, `sw.js`, Apple touch icons, and an in-app **Install App** button (`beforeinstallprompt` + iOS fallback instructions).

### Stage 2 Milestones
- **Milestone 6 (`feature/m6-game-screens-pwa-fullscreen`)**: Dedicated Game Screens, Title Screen with Gemini Nano Banana art, Fullscreen toggle, PWA manifest & service worker.
- **Milestone 7 (`feature/m7-composer-ocarina-input-samples`)**: Composer Sample Song Dropdown, Ocarina-first note insertion into partiture, horizontal auto-scroll on play/record, bottom-anchored Ocarina layout.
- **Milestone 8 (`feature/m8-arcade-taiko-stage-redesign`)**: Taiko-Web-inspired Song Select, Gameplay Stage (top highway + festival stage + bottom Ocarina + Soul Gauge), and Results/Game Over screens.
- **Milestone 9 (`feature/m9-stage2-e2e-deploy`)**: Stage 2 Playwright E2E verification, PR merge to `main`, GitHub Pages deployment, and live online verification.
