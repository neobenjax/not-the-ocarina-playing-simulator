import './styles/main.css';
import {
  AppSettings,
  ArcadeHighScore,
  CustomSvgSkin,
  HOLE_MAP,
  HoleId,
  KeyMapping,
  Playlist,
} from './types';
import {
  loadCustomSkins,
  loadHighScores,
  loadKeyMapping,
  loadPlaylists,
  loadSelectedSkinId,
  loadSettings,
  saveCustomSkins,
  saveHighScore,
  saveKeyMapping,
  savePlaylists,
  saveSelectedSkinId,
  saveSettings,
} from './storage/persistence';
import { haptics } from './haptics/hapticEngine';
import { ocarinaSynth } from './audio/ocarinaSynth';
import { menuBgm, playUiClick, setSfxVolumes } from './audio/soundMachineSfx';
import { OcarinaSvgController } from './components/OcarinaSvg';
import { KeyMapModal } from './components/KeyMapModal';
import { SettingsModal } from './components/SettingsModal';
import { SkinGalleryModal } from './components/SkinGalleryModal';
import { OCARINA_SKINS } from './data/ocarinaSkins';
import { FreePlayComposer } from './modes/freePlay/FreePlayComposer';
import { ArcadeMode } from './modes/arcade/ArcadeMode';
import { initPwaInstall, toggleFullscreen, triggerPwaInstall } from './utils/pwaFullscreen';

type AppScreen = 'title' | 'composer' | 'arcade';

class OcarinaApp {
  private root: HTMLElement;
  private settings: AppSettings;
  private keyMapping: KeyMapping;
  private selectedSkinId: string;
  private customSkins: CustomSvgSkin[];
  private playlists: Playlist[];
  private highScores: Record<string, ArcadeHighScore>;
  private activeScreen: AppScreen = 'title';

  private ocarinaCtrl: OcarinaSvgController | null = null;
  private keyMapModal!: KeyMapModal;
  private settingsModal!: SettingsModal;
  private skinGalleryModal!: SkinGalleryModal;
  private freePlayComposer: FreePlayComposer | null = null;
  private arcadeMode: ArcadeMode | null = null;

  private heldHoles: HoleId[] = [];
  private isBlowKeyHeld = false;
  private toastTimer: number | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.settings = loadSettings();
    this.keyMapping = loadKeyMapping();
    this.selectedSkinId = loadSelectedSkinId();
    this.customSkins = loadCustomSkins();
    this.playlists = loadPlaylists();
    this.highScores = loadHighScores();

    initPwaInstall();
    this.applyAudioAndHaptics();
    this.initModals();
    this.renderScreen();
    this.bindKeyboard();
  }

  private applyAudioAndHaptics(): void {
    haptics.setEnabled(this.settings.hapticsEnabled);
    ocarinaSynth.setVolume(this.settings.masterVolume * this.settings.ocarinaVolume);
    setSfxVolumes(this.settings.masterVolume, this.settings.sfxVolume);
    if (this.settings.bgmEnabled) {
      menuBgm.start();
    } else {
      menuBgm.stop();
    }
  }

  private navigateTo(screen: AppScreen): void {
    playUiClick();
    haptics.tapButton();
    this.freePlayComposer?.destroy();
    this.freePlayComposer = null;
    this.arcadeMode?.destroy();
    this.arcadeMode = null;
    this.ocarinaCtrl = null;
    this.activeScreen = screen;
    this.renderScreen();
  }

  private renderScreen(): void {
    if (this.activeScreen === 'title') {
      this.renderTitleScreen();
    } else {
      this.renderModeScreen();
    }
  }

  private renderTitleScreen(): void {
    const isFs = Boolean(document.fullscreenElement);
    this.root.innerHTML = `
      <div class="title-screen">
        <div class="title-backdrop">
          <img src="/not-the-ocarina-playing-simulator/assets/title-hero-art.jpg" alt="" class="title-hero-img" />
          <div class="title-scrim"></div>
        </div>

        <header class="title-top-bar">
          <div class="title-badge">HYRULE RHYTHM EDITION</div>
          <div class="title-utility-btns">
            <button type="button" class="btn btn-secondary" id="btn-skin-gallery">🎨 Skins</button>
            <button type="button" class="btn btn-secondary" id="btn-key-map">⌨️ Keys</button>
            <button type="button" class="btn btn-secondary ${this.settings.bgmEnabled ? 'is-on' : ''}" id="btn-toggle-bgm">
              🎶 BGM ${this.settings.bgmEnabled ? 'On' : 'Off'}
            </button>
            <button type="button" class="btn btn-secondary" id="btn-settings">⚙️ Settings</button>
            <button type="button" class="btn btn-secondary" id="btn-fullscreen" title="Toggle Fullscreen">
              ${isFs ? '🗗 Exit FS' : '⛶ Fullscreen'}
            </button>
            <button type="button" class="btn btn-gold" id="btn-install-pwa">📲 Install App</button>
          </div>
        </header>

        <main class="title-center">
          <img src="/not-the-ocarina-playing-simulator/assets/ocarina-emblem.jpg" alt="Ocarina Emblem" class="title-crest" />
          <h1 class="game-main-title">NOT THE OCARINA PLAYING SIMULATOR</h1>
          <p class="game-main-subtitle">Play the Ocarina of Time · Compose Partitures · Master Taiko &amp; PIU Phoenix 2 Arcade</p>

          <div class="title-mode-cards">
            <button type="button" class="mode-launch-card is-composer" id="launch-mode-composer">
              <span class="mode-card-icon">🎵</span>
              <div class="mode-card-body">
                <strong>MODE 1 · FREE PLAY &amp; COMPOSER</strong>
                <p>Play the Ocarina directly into a musical partiture, load Zelda samples, edit timelines &amp; export MP3s.</p>
              </div>
              <span class="mode-card-cta">PLAY ▶</span>
            </button>

            <button type="button" class="mode-launch-card is-arcade" id="launch-mode-arcade">
              <span class="mode-card-icon">🥁</span>
              <div class="mode-card-body">
                <strong>MODE 2 · ARCADE RHYTHM</strong>
                <p>9+ Legend of Zelda charts, Novice/Original assist, Metronome &amp; Pump It Up Phoenix 2 SSS+ scoring.</p>
              </div>
              <span class="mode-card-cta">PLAY ▶</span>
            </button>
          </div>
        </main>
      </div>
      <div id="toast-banner" class="toast-banner" role="status" aria-live="polite"></div>
    `;

    this.root.querySelector('#launch-mode-composer')?.addEventListener('click', () => this.navigateTo('composer'));
    this.root.querySelector('#launch-mode-arcade')?.addEventListener('click', () => this.navigateTo('arcade'));
    this.bindCommonUtilityButtons();
  }

  private renderModeScreen(): void {
    const isComposer = this.activeScreen === 'composer';
    const isFs = Boolean(document.fullscreenElement);

    this.root.innerHTML = `
      <div class="game-screen-shell">
        <header class="game-mode-hud">
          <div class="hud-left">
            <button type="button" class="btn btn-secondary" id="btn-back-title">← Menu</button>
            <h1 class="hud-mode-title">${isComposer ? '🎵 Free Play & Composer' : '🥁 Arcade Rhythm'}</h1>
          </div>
          <div class="hud-actions">
            <button type="button" class="btn btn-secondary" id="btn-skin-gallery">🎨 Skins</button>
            <button type="button" class="btn btn-secondary" id="btn-key-map">⌨️ Keys</button>
            <button type="button" class="btn btn-secondary ${this.settings.bgmEnabled ? 'is-on' : ''}" id="btn-toggle-bgm">
              🎶 BGM ${this.settings.bgmEnabled ? 'On' : 'Off'}
            </button>
            <button type="button" class="btn btn-secondary" id="btn-settings">⚙️ Settings</button>
            <button type="button" class="btn btn-secondary" id="btn-fullscreen" title="Toggle Fullscreen">
              ${isFs ? '🗗' : '⛶'}
            </button>
          </div>
        </header>

        <main class="game-screen-body">
          <section id="mode-panel" class="panel-card mode-top-workspace"></section>
          <section id="ocarina-stage" class="panel-card ocarina-stage ocarina-bottom-dock"></section>
        </main>
      </div>
      <div id="toast-banner" class="toast-banner" role="status" aria-live="polite"></div>
    `;

    this.root.querySelector('#btn-back-title')?.addEventListener('click', () => this.navigateTo('title'));
    this.bindCommonUtilityButtons();

    const stageEl = this.root.querySelector<HTMLElement>('#ocarina-stage')!;
    this.ocarinaCtrl = new OcarinaSvgController(stageEl, this.keyMapping, {
      onHoleDown: (id) => this.handleHoleDown(id),
      onHoleUp: (id) => this.handleHoleUp(id),
      onBlowDown: () => this.handleBlowDown(),
      onBlowUp: () => this.handleBlowUp(),
    });
    this.ocarinaCtrl.setHideKeyBadges(this.settings.forceHideKeyBadges);
    this.applySelectedSkin();

    const panel = this.root.querySelector<HTMLElement>('#mode-panel')!;
    if (isComposer) {
      this.freePlayComposer = new FreePlayComposer(panel, this.playlists, {
        onPlaylistsChange: (updated) => {
          this.playlists = updated;
          savePlaylists(updated);
        },
        onToast: (msg) => this.showToast(msg),
        onHighlightHole: (holeId, active) => this.ocarinaCtrl?.setHoleActive(holeId, active),
      });
    } else {
      this.arcadeMode = new ArcadeMode(panel, this.settings, this.playlists, this.highScores, {
        onSettingsChange: (s) => {
          this.settings = s;
          saveSettings(s);
          this.applyAudioAndHaptics();
        },
        onSaveScore: (entry) => {
          saveHighScore(entry);
          this.highScores = loadHighScores();
        },
        onToast: (msg) => this.showToast(msg),
      });
    }
  }

  private bindCommonUtilityButtons(): void {
    this.root.querySelector('#btn-key-map')?.addEventListener('click', () => {
      this.keyMapModal.open(this.keyMapping, this.settings.breathMode);
    });

    this.root.querySelector('#btn-settings')?.addEventListener('click', () => {
      this.settingsModal.open(this.settings);
    });

    this.root.querySelector('#btn-skin-gallery')?.addEventListener('click', () => {
      this.skinGalleryModal.open(this.selectedSkinId, this.customSkins);
    });

    this.root.querySelector('#btn-toggle-bgm')?.addEventListener('click', (e) => {
      playUiClick();
      haptics.tapButton();
      this.settings.bgmEnabled = !this.settings.bgmEnabled;
      saveSettings(this.settings);
      this.applyAudioAndHaptics();
      const btn = e.currentTarget as HTMLButtonElement;
      btn.classList.toggle('is-on', this.settings.bgmEnabled);
      btn.textContent = `🎶 BGM ${this.settings.bgmEnabled ? 'On' : 'Off'}`;
    });

    this.root.querySelector('#btn-fullscreen')?.addEventListener('click', async (e) => {
      playUiClick();
      haptics.tapButton();
      const entered = await toggleFullscreen();
      const btn = e.currentTarget as HTMLButtonElement;
      if (this.activeScreen === 'title') {
        btn.textContent = entered ? '🗗 Exit FS' : '⛶ Fullscreen';
      } else {
        btn.textContent = entered ? '🗗' : '⛶';
      }
    });

    this.root.querySelector('#btn-install-pwa')?.addEventListener('click', () => {
      playUiClick();
      haptics.tapButton();
      void triggerPwaInstall((msg) => this.showToast(msg));
    });
  }

  private applySelectedSkin(): void {
    if (!this.ocarinaCtrl) return;
    const builtIn = OCARINA_SKINS.find((s) => s.id === this.selectedSkinId);
    if (builtIn) {
      this.ocarinaCtrl.setTheme(builtIn);
      return;
    }
    const custom = this.customSkins.find((s) => s.id === this.selectedSkinId);
    if (custom) {
      this.ocarinaCtrl.setCustomSvg(custom.svgContent, custom.name);
      return;
    }
    this.ocarinaCtrl.setTheme(OCARINA_SKINS[0]);
  }

  private initModals(): void {
    this.keyMapModal = new KeyMapModal(this.keyMapping, this.settings.breathMode, (newMap, breathMode) => {
      this.keyMapping = newMap;
      this.settings.breathMode = breathMode;
      saveKeyMapping(newMap);
      saveSettings(this.settings);
      this.ocarinaCtrl?.setKeyMapping(newMap);
    });

    this.settingsModal = new SettingsModal(this.settings, (newSettings) => {
      this.settings = newSettings;
      saveSettings(newSettings);
      this.applyAudioAndHaptics();
      this.ocarinaCtrl?.setHideKeyBadges(newSettings.forceHideKeyBadges);
    });

    this.skinGalleryModal = new SkinGalleryModal(this.selectedSkinId, this.customSkins, {
      onSelectSkin: (skinId) => {
        this.selectedSkinId = skinId;
        saveSelectedSkinId(skinId);
        this.applySelectedSkin();
        this.showToast('Ocarina skin equipped!');
      },
      onAddCustomSkin: (skin) => {
        this.customSkins = [...this.customSkins, skin];
        saveCustomSkins(this.customSkins);
      },
      onDeleteCustomSkin: (skinId) => {
        this.customSkins = this.customSkins.filter((s) => s.id !== skinId);
        saveCustomSkins(this.customSkins);
      },
    });
  }

  private bindKeyboard(): void {
    const codeToHole = (): Map<string, HoleId> => {
      const m = new Map<string, HoleId>();
      (['hole-a', 'hole-down', 'hole-right', 'hole-left', 'hole-up'] as HoleId[]).forEach((id) => {
        m.set(this.keyMapping[id], id);
      });
      return m;
    };

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (document.querySelector('dialog[open]')) return;
      if (this.activeScreen === 'title') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === this.keyMapping.blow) {
        e.preventDefault();
        this.handleBlowDown();
        return;
      }

      const holeId = codeToHole().get(e.code);
      if (holeId) {
        e.preventDefault();
        this.handleHoleDown(holeId);
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === this.keyMapping.blow) {
        this.handleBlowUp();
        return;
      }
      const holeId = codeToHole().get(e.code);
      if (holeId) {
        this.handleHoleUp(holeId);
      }
    });
  }

  private handleHoleDown(holeId: HoleId): void {
    if (!this.heldHoles.includes(holeId)) {
      this.heldHoles.push(holeId);
    }
    this.ocarinaCtrl?.setHoleActive(holeId, true);
    haptics.pressHole();

    if (this.activeScreen === 'arcade' && this.arcadeMode?.onPlayerInput(holeId)) {
      return;
    }

    if (!this.settings.breathMode || this.isBlowKeyHeld) {
      ocarinaSynth.startNote(HOLE_MAP[holeId].frequency);
      this.freePlayComposer?.onLiveNoteStart(holeId);
    }
  }

  private handleHoleUp(holeId: HoleId): void {
    this.heldHoles = this.heldHoles.filter((id) => id !== holeId);
    this.ocarinaCtrl?.setHoleActive(holeId, false);
    this.freePlayComposer?.onLiveNoteEnd(holeId);

    if (this.heldHoles.length > 0 && (!this.settings.breathMode || this.isBlowKeyHeld)) {
      const top = this.heldHoles[this.heldHoles.length - 1];
      ocarinaSynth.startNote(HOLE_MAP[top].frequency);
    } else {
      ocarinaSynth.stopNote();
    }
  }

  private handleBlowDown(): void {
    this.isBlowKeyHeld = true;
    this.ocarinaCtrl?.setBlowActive(true);
    haptics.blowAir();

    if (this.heldHoles.length > 0) {
      const top = this.heldHoles[this.heldHoles.length - 1];
      ocarinaSynth.startNote(HOLE_MAP[top].frequency);
    }
  }

  private handleBlowUp(): void {
    this.isBlowKeyHeld = false;
    this.ocarinaCtrl?.setBlowActive(false);
    if (this.settings.breathMode) {
      ocarinaSynth.stopNote();
    }
  }

  showToast(msg: string): void {
    const el = this.root.querySelector('#toast-banner');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('is-visible');
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => el.classList.remove('is-visible'), 2800);
  }
}

const root = document.getElementById('app');
if (root) {
  new OcarinaApp(root);
}
