import './styles/main.css';
import {
  AppSettings,
  ArcadeHighScore,
  CustomSvgSkin,
  getBentFrequency,
  HoleId,
  KeyMapping,
  PitchBend,
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
import { ocarinaSynth, getSharedAudioContext } from './audio/ocarinaSynth';
import { menuBgm, playUiClick, setSfxVolumes } from './audio/soundMachineSfx';
import { OcarinaSvgController } from './components/OcarinaSvg';
import { KeyMapModal } from './components/KeyMapModal';
import { SettingsModal } from './components/SettingsModal';
import { SkinGalleryModal } from './components/SkinGalleryModal';
import { OCARINA_SKINS } from './data/ocarinaSkins';
import { FreePlayComposer } from './modes/freePlay/FreePlayComposer';
import { ArcadeMode, ArcadePhase } from './modes/arcade/ArcadeMode';
import { initPwaInstall, toggleFullscreen, triggerPwaInstall } from './utils/pwaFullscreen';

type AppScreen = 'splash' | 'title' | 'composer' | 'arcade';

class OcarinaApp {
  private root: HTMLElement;
  private settings: AppSettings;
  private keyMapping: KeyMapping;
  private selectedSkinId: string;
  private customSkins: CustomSvgSkin[];
  private playlists: Playlist[];
  private highScores: Record<string, ArcadeHighScore>;
  private activeScreen: AppScreen = 'splash';
  private arcadePhase: ArcadePhase = 'select';

  private ocarinaCtrl: OcarinaSvgController | null = null;
  private keyMapModal!: KeyMapModal;
  private settingsModal!: SettingsModal;
  private skinGalleryModal!: SkinGalleryModal;
  private freePlayComposer: FreePlayComposer | null = null;
  private arcadeMode: ArcadeMode | null = null;

  private heldHoles: HoleId[] = [];
  private isBlowKeyHeld = false;
  private pitchUpHeld = false;
  private pitchDownHeld = false;
  private pitchBend: PitchBend = 'normal';
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
    if (this.activeScreen === 'splash') {
      menuBgm.setTrack('lullaby');
      menuBgm.start();
    } else if (this.activeScreen === 'title' && this.settings.bgmEnabled) {
      menuBgm.setTrack('emotional');
      menuBgm.start();
    } else {
      menuBgm.stop();
    }
  }

  private navigateTo(screen: AppScreen): void {
    playUiClick();
    haptics.tapButton();
    ocarinaSynth.stopAllVoices();
    this.heldHoles = [];
    this.freePlayComposer?.destroy();
    this.freePlayComposer = null;
    this.arcadeMode?.destroy();
    this.arcadeMode = null;
    this.ocarinaCtrl?.destroy();
    this.ocarinaCtrl = null;
    this.activeScreen = screen;
    this.applyAudioAndHaptics();
    this.renderScreen();
  }

  private renderScreen(): void {
    if (this.activeScreen === 'splash') {
      this.renderSplashScreen();
    } else if (this.activeScreen === 'title') {
      this.renderTitleScreen();
    } else if (this.activeScreen === 'arcade') {
      this.renderArcadeScreen();
    } else {
      this.renderComposerScreen();
    }
  }

  private renderSplashScreen(): void {
    this.root.innerHTML = `
      <div class="splash-screen" id="splash-enter-btn" role="button" tabindex="0" aria-label="Click or Press Enter to Start">
        <div class="title-backdrop">
          <img src="/not-the-ocarina-playing-simulator/assets/splash-bg.jpg" alt="" class="title-hero-img" />
          <div class="title-scrim"></div>
        </div>
        <main class="splash-center">
          <img src="/not-the-ocarina-playing-simulator/assets/ocarina-emblem.jpg" alt="Ocarina Emblem" class="splash-crest" />
          <h1 class="game-main-title">NOT THE OCARINA PLAYING SIMULATOR</h1>
          <div class="splash-prompt">CLICK OR PRESS ENTER</div>
          <p class="splash-disclaimer">
            This unofficial ocarina simulator is unaffiliated with Nintendo&reg; or The Legend of Zelda&trade;.
            This is a fan-made simulator built entirely with original and AI-generated assets, with no direct assets or sprites from Nintendo.
          </p>
        </main>
      </div>
    `;

    const unlockAudio = () => {
      try {
        void getSharedAudioContext().resume();
      } catch {
        // Ignore
      }
    };
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });

    const enter = () => {
      if (this.activeScreen !== 'splash') return;
      unlockAudio();
      this.navigateTo('title');
    };
    this.root.querySelector('#splash-enter-btn')?.addEventListener('click', enter);
  }

  private renderTitleScreen(): void {
    const isFs = Boolean(document.fullscreenElement);
    this.root.innerHTML = `
      <div class="title-screen">
        <div class="title-backdrop">
          <img src="/not-the-ocarina-playing-simulator/assets/mode-select-bg.jpg" alt="" class="title-hero-img" />
          <div class="title-scrim"></div>
        </div>

        <header class="title-top-bar">
          <div class="title-badge">OCARINA RHYTHM EDITION</div>
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

          <div class="title-mode-cards">
            <button type="button" class="mode-launch-card is-composer" id="launch-mode-composer">
              <span class="mode-card-icon">🎵</span>
              <div class="mode-card-body">
                <strong>MODE 1 · FREE PLAY &amp; COMPOSER</strong>
                <p>Play the polyphonic Ocarina into a 5-track partiture, load sample tunes, edit timelines &amp; export MP3s.</p>
              </div>
              <span class="mode-card-cta">PLAY ▶</span>
            </button>

            <button type="button" class="mode-launch-card is-arcade" id="launch-mode-arcade">
              <span class="mode-card-icon">🎯</span>
              <div class="mode-card-body">
                <strong>MODE 2 · ARCADE RHYTHM</strong>
                <p>9+ parody charts &amp; custom playlists, Novice/Original assist, 5-track rhythm highway &amp; live scoring.</p>
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

  private renderComposerScreen(): void {
    this.root.innerHTML = `
      <div class="composer-shell-5050">
        <section id="mode-panel" class="composer-top-half"></section>
        <section id="ocarina-stage" class="ocarina-stage arcade-ingame-bottom composer-bottom-half">
          <img src="/not-the-ocarina-playing-simulator/assets/arcade-stage-bg.jpg" alt="" class="arcade-stage-bg-img" />
          <div id="composer-dock-left" class="composer-float-dock is-left"></div>
          <div id="ocarina-stage-mount" class="arcade-ocarina-mount"></div>
          <div id="composer-dock-right" class="composer-float-dock is-right"></div>
        </section>
      </div>
      <div id="toast-banner" class="toast-banner" role="status" aria-live="polite"></div>
    `;

    const mountEl = this.root.querySelector<HTMLElement>('#ocarina-stage-mount')!;
    this.ocarinaCtrl = new OcarinaSvgController(mountEl, this.keyMapping, {
      onHoleDown: (id) => this.handleHoleDown(id),
      onHoleUp: (id) => this.handleHoleUp(id),
      onBlowDown: () => this.handleBlowDown(),
      onBlowUp: () => this.handleBlowUp(),
      onPitchBendChange: (bend) => this.setPitchBend(bend),
    });
    this.ocarinaCtrl.setHideKeyBadges(this.settings.forceHideKeyBadges);
    this.applySelectedSkin();

    const panel = this.root.querySelector<HTMLElement>('#mode-panel')!;
    const dockLeft = this.root.querySelector<HTMLElement>('#composer-dock-left')!;
    const dockRight = this.root.querySelector<HTMLElement>('#composer-dock-right')!;
    this.freePlayComposer = new FreePlayComposer(panel, dockLeft, dockRight, this.playlists, {
      onPlaylistsChange: (updated) => {
        this.playlists = updated;
        savePlaylists(updated);
      },
      onToast: (msg) => this.showToast(msg),
      onHighlightHole: (holeId, active) => this.ocarinaCtrl?.setHoleActive(holeId, active),
      onBackToMenu: () => this.navigateTo('title'),
    });
  }

  private renderArcadeScreen(): void {
    this.root.innerHTML = `
      <div class="arcade-shell is-phase-select" id="arcade-shell-root">
        <section id="mode-panel" class="arcade-mode-panel"></section>
        <section id="ocarina-stage" class="ocarina-stage arcade-ingame-bottom">
          <img src="/not-the-ocarina-playing-simulator/assets/arcade-stage-bg.jpg" alt="" class="arcade-stage-bg-img" />
          <div id="arcade-combo-banner" class="arcade-combo-banner" aria-live="polite"></div>
          <div id="ocarina-stage-mount" class="arcade-ocarina-mount"></div>
        </section>
        <div id="arcade-countdown-overlay" class="arcade-countdown-overlay" aria-live="assertive">3</div>
        <div id="arcade-pause-overlay" class="arcade-pause-overlay" aria-modal="true" role="dialog" aria-label="Game Paused"></div>
      </div>
      <div id="toast-banner" class="toast-banner" role="status" aria-live="polite"></div>
    `;

    const mountEl = this.root.querySelector<HTMLElement>('#ocarina-stage-mount')!;
    this.ocarinaCtrl = new OcarinaSvgController(mountEl, this.keyMapping, {
      onHoleDown: (id) => this.handleHoleDown(id),
      onHoleUp: (id) => this.handleHoleUp(id),
      onBlowDown: () => this.handleBlowDown(),
      onBlowUp: () => this.handleBlowUp(),
      onPitchBendChange: (bend) => this.setPitchBend(bend),
    });
    this.ocarinaCtrl.setHideKeyBadges(this.settings.forceHideKeyBadges);
    this.applySelectedSkin();

    const shellRoot = this.root.querySelector<HTMLElement>('#arcade-shell-root')!;
    const panel = this.root.querySelector<HTMLElement>('#mode-panel')!;
    this.arcadeMode = new ArcadeMode(panel, this.settings, this.keyMapping, this.playlists, this.highScores, {
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
      onPhaseChange: (phase) => {
        this.arcadePhase = phase;
        shellRoot.className = `arcade-shell is-phase-${phase}`;
      },
      onZoomOcarina: (zoomed) => {
        this.ocarinaCtrl?.setZoomed(zoomed);
      },
      onMissFlick: () => {
        this.ocarinaCtrl?.triggerMissFlick();
      },
      onBackToMenu: () => this.navigateTo('title'),
    });
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
      this.arcadeMode?.setKeyMapping(newMap);
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

      if (this.activeScreen === 'splash') {
        if (e.key === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          this.navigateTo('title');
        }
        return;
      }

      if (this.activeScreen === 'title') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (this.activeScreen === 'arcade' && this.arcadePhase === 'select') {
        if (this.arcadeMode?.handleSelectKeyDown(e)) return;
      }

      if (this.activeScreen === 'arcade' && this.arcadePhase === 'playing' && e.key === 'Escape') {
        e.preventDefault();
        this.arcadeMode?.togglePause();
        return;
      }

      if (this.activeScreen === 'composer') {
        if (e.code === 'Delete' || e.key === 'Delete') {
          e.preventDefault();
          this.freePlayComposer?.deleteSelectedNotes();
          return;
        }
        if (e.code === this.keyMapping.compRecord) {
          e.preventDefault();
          this.freePlayComposer?.toggleRecord();
          return;
        }
        if (e.code === this.keyMapping.compPlay) {
          e.preventDefault();
          this.freePlayComposer?.togglePlay();
          return;
        }
        if (e.code === this.keyMapping.compClear) {
          e.preventDefault();
          this.freePlayComposer?.requestClear();
          return;
        }
      }

      if (e.code === this.keyMapping.pitchUp) {
        e.preventDefault();
        this.pitchUpHeld = true;
        this.setPitchBend('up');
        return;
      }

      if (e.code === this.keyMapping.pitchDown) {
        e.preventDefault();
        this.pitchDownHeld = true;
        this.setPitchBend('down');
        return;
      }

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
      if (e.code === this.keyMapping.pitchUp) {
        this.pitchUpHeld = false;
        this.setPitchBend(this.pitchDownHeld ? 'down' : 'normal');
        return;
      }
      if (e.code === this.keyMapping.pitchDown) {
        this.pitchDownHeld = false;
        this.setPitchBend(this.pitchUpHeld ? 'up' : 'normal');
        return;
      }
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

  private setPitchBend(bend: PitchBend): void {
    this.pitchBend = bend;
    this.ocarinaCtrl?.setPitchBend(bend);
    if (!this.settings.breathMode || this.isBlowKeyHeld) {
      for (const id of this.heldHoles) {
        ocarinaSynth.startVoice(id, getBentFrequency(id, this.pitchBend));
      }
    }
  }

  private handleHoleDown(holeId: HoleId): void {
    if (!this.heldHoles.includes(holeId)) {
      this.heldHoles.push(holeId);
    }
    this.ocarinaCtrl?.setHoleActive(holeId, true);
    haptics.pressHole();

    if (this.activeScreen === 'arcade' && this.arcadeMode?.onPlayerInput(holeId, this.pitchBend)) {
      return;
    }

    if (!this.settings.breathMode || this.isBlowKeyHeld) {
      ocarinaSynth.startVoice(holeId, getBentFrequency(holeId, this.pitchBend));
      this.freePlayComposer?.onLiveNoteStart(holeId, this.pitchBend);
    }
  }

  private handleHoleUp(holeId: HoleId): void {
    this.heldHoles = this.heldHoles.filter((id) => id !== holeId);
    this.ocarinaCtrl?.setHoleActive(holeId, false);
    if (this.activeScreen === 'arcade') {
      this.arcadeMode?.onPlayerRelease(holeId);
    }
    this.freePlayComposer?.onLiveNoteEnd(holeId);
    ocarinaSynth.stopVoice(holeId);
  }

  private handleBlowDown(): void {
    this.isBlowKeyHeld = true;
    this.ocarinaCtrl?.setBlowActive(true);
    haptics.blowAir();

    for (const id of this.heldHoles) {
      ocarinaSynth.startVoice(id, getBentFrequency(id, this.pitchBend));
    }
  }

  private handleBlowUp(): void {
    this.isBlowKeyHeld = false;
    this.ocarinaCtrl?.setBlowActive(false);
    if (this.settings.breathMode) {
      ocarinaSynth.stopAllVoices();
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
