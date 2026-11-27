# CONTEXT.md — Project Architecture & Engineering Context

## 1. Repository & Deployment
- **Repository**: `neobenjax/not-the-ocarina-playing-simulator`
- **Live URL**: `https://neobenjax.github.io/not-the-ocarina-playing-simulator/`
- **Deployment**: GitHub Actions (`.github/workflows/deploy.yml`) building the Vite bundle (`base: '/not-the-ocarina-playing-simulator/'`) and deploying to GitHub Pages on push to `main`.

## 2. Technology Stack
- **Build Tool**: Vite 6 + TypeScript (strict mode)
- **UI & Styling**: Semantic HTML5 (`<dialog>`, `<main>`, `<nav>`, `<header>`), Vanilla CSS with CSS Custom Properties, CSS Grid/Flexbox, Container Queries, and `oklch` / HSL color tokens.
- **Audio**:
  - Native Web Audio API (`AudioContext`, `OfflineAudioContext`, `DynamicsCompressorNode`, `BiquadFilterNode`, `ConvolverNode`).
  - Procedural Ocarina synthesis + Sound Machine Generator (`https://neobenjax.github.io/sound-machine-generator/`) Vanilla Web Audio recipes for UI SFX & Menu BGM.
  - `lamejs` (or `@breezystack/lamejs`) for client-side PCM-to-MP3 encoding.
- **Haptics**: `web-haptics` (`https://haptics.lochie.me/`) for cross-platform mobile vibration & audio debug fallback.
- **Visual Assets**: Custom responsive SVGs + Gemini Nano Banana generated artwork (`public/assets/`).
- **Testing**: Playwright (`@playwright/test` / `playwright`) for desktop & mobile E2E verification, both locally and against the live GitHub Pages URL.

## 3. Design System Tokens
- **Palette (Ocarina of Time × Taiko no Tatsujin)**:
  - `--zelda-sapphire`: `#1b4b9c` (Primary Ocarina royal blue)
  - `--zelda-gold`: `#f2c94c` (Triforce gold accent)
  - `--zelda-emerald`: `#27ae60` (Kokiri green / Perfect / Success)
  - `--zelda-ruby`: `#e74c3c` (Goron red / Miss / Record)
  - `--zelda-cyan`: `#00d2ff` (Sheikah / Navi glow)
  - `--taiko-orange`: `#ff6b35` (Arcade Don/hit energy)
  - `--bg-temple`: `#0b1021` (Deep Hyrule night slate)
  - `--parchment`: `#f7f1e3` (Partiture / sheet music surface)
- **Typography**:
  - Display / Game Headers: `'Fredoka'`, `'Bungee'` / `'Cinzel'` (chunky Taiko-inspired arcade readability + Zelda crest accents)
  - UI & Body: `'Nunito'`, system-ui, sans-serif
  - Monospace / Timestamps / Partiture: `'JetBrains Mono'`, monospace

## 4. Directory Structure
```text
not-the-ocarina-playing-simulator/
├── .github/workflows/deploy.yml   # GitHub Pages CI/CD
├── public/
│   └── assets/                    # Gemini Nano Banana generated images & favicon
├── src/
│   ├── audio/
│   │   ├── ocarinaSynth.ts        # Procedural Ocarina Web Audio synth + breath envelope
│   │   ├── soundMachineSfx.ts     # SFX & BGM recipes from sound-machine-generator
│   │   └── mp3Exporter.ts         # OfflineAudioContext + lamejs MP3 encoder
│   ├── data/
│   │   ├── zeldaSongs.ts          # Preloaded OoT partitures & rhythm charts
│   │   └── ocarinaSkins.ts        # Built-in SVG mask/design gallery
│   ├── haptics/
│   │   └── hapticEngine.ts        # web-haptics wrapper with presets & settings
│   ├── modes/
│   │   ├── freePlay/              # Mode 1: Free Play, Recorder, Partiture Timeline Editor, Playlists
│   │   └── arcade/                # Mode 2: Taiko-style Arcade Engine, PIU Phoenix 2 Scorer, Calibration
│   ├── components/
│   │   ├── OcarinaSvg.ts          # Interactive SVG Ocarina + custom SVG loader
│   │   ├── KeyMapModal.ts         # Desktop key-binding & Blow Air configurator
│   │   ├── SkinGalleryModal.ts    # Gallery + SVG Template download & upload
│   │   └── SettingsModal.ts       # Offset, Scroll Speed, Volume, Haptics settings
│   ├── storage/
│   │   └── persistence.ts         # localStorage schema for settings, keybinds, playlists, scores, skins
│   ├── styles/
│   │   └── main.css               # Design tokens, responsive layouts, animations
│   └── main.ts                    # App shell, navigation, state coordination
├── tests/
│   └── e2e.spec.ts                # Playwright E2E test suite
├── SPEC.MD
├── CONTEXT.md
├── userstorymapping.md
└── package.json
```

## 5. Note & Hole Mapping Standard
| Hole ID | OoT Button | Musical Note | Frequency (Hz) | Default Desktop Key | Color Token |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `hole-a` | `A` | D5 | 587.33 | `J` | `#2f80ed` (Blue) |
| `hole-down` | `C-Down` | F5 | 698.46 | `K` | `#f2c94c` (Yellow) |
| `hole-right` | `C-Right` | A5 | 880.00 | `L` | `#27ae60` (Green) |
| `hole-left` | `C-Left` | B5 | 987.77 | `I` | `#ff6b35` (Orange) |
| `hole-up` | `C-Up` | D6 | 1174.66 | `U` | `#e74c3c` (Red) |
| `blow` | Breath | Air Flow | — | `Space` | `#00d2ff` (Cyan) |
