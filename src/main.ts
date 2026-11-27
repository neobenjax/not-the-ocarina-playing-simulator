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
  loadTutorialDone,
  saveCustomSkins,
  saveHighScore,
  saveKeyMapping,
  savePlaylists,
  saveSelectedSkinId,
  saveSettings,
  saveTutorialDone,
} from './storage/persistence';
import { haptics } from './haptics/hapticEngine';
import { ocarinaSynth, getSharedAudioContext } from './audio/ocarinaSynth';
import { menuBgm, playUiClick, setSfxVolumes } from './audio/soundMachineSfx';
import { isTouchPrimaryDevice } from './components/OcarinaSvg';
import { Ocarina3DController } from './components/Ocarina3D';
import { KeyMapModal } from './components/KeyMapModal';
import { SettingsModal } from './components/SettingsModal';
import { SkinGalleryModal } from './components/SkinGalleryModal';
import { OCARINA_SKINS } from './data/ocarinaSkins';
import { FreePlayComposer } from './modes/freePlay/FreePlayComposer';
import { ArcadeMode, ArcadePhase } from './modes/arcade/ArcadeMode';
import { Tutorial } from './tutorial/Tutorial';
import { icons } from './components/icons';
import {
  canPromptInstall,
  initPwaInstall,
  isStandaloneMode,
  onInstallAvailabilityChange,
  toggleFullscreen,
  triggerPwaInstall,
} from './utils/pwaFullscreen';

type AppScreen = 'splash' | 'tutorial' | 'title' | 'composer' | 'arcade';

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

  private ocarinaCtrl: Ocarina3DController | null = null;
  private keyMapModal!: KeyMapModal;
  private settingsModal!: SettingsModal;
  private skinGalleryModal!: SkinGalleryModal;
  private freePlayComposer: FreePlayComposer | null = null;
  private arcadeMode: ArcadeMode | null = null;
  private tutorial: Tutorial | null = null;

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
    onInstallAvailabilityChange(() => {
      if (this.activeScreen === 'title') this.renderTitleScreen();
    });
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
    this.tutorial?.destroy();
    this.tutorial = null;
    this.ocarinaCtrl?.destroy();
    this.ocarinaCtrl = null;
    this.activeScreen = screen;
    this.applyAudioAndHaptics();
    this.renderScreen();
  }

  private renderScreen(): void {
    if (this.activeScreen === 'splash') {
      this.renderSplashScreen();
    } else if (this.activeScreen === 'tutorial') {
      this.renderTutorialScreen();
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
      <div class="splash-screen" id="splash-enter-btn" role="button" tabindex="0" aria-label="Press any key to begin">
        <div class="title-backdrop">
          <img src="/not-the-ocarina-playing-simulator/assets/splash-bg.jpg" alt="" class="title-hero-img splash-drift" />
          <div class="title-scrim splash-scrim"></div>
        </div>
        <main class="splash-center">
          <h1 class="splash-title">Not the Ocarina<span>Playing Simulator</span></h1>
          <p class="splash-prompt">${isTouchPrimaryDevice() ? 'Tap anywhere to begin' : 'Press any key'}</p>
        </main>
        <p class="splash-disclaimer">A fan project. Not affiliated with Nintendo.</p>
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
      this.enterFromSplash();
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
          <button type="button" class="title-icon-toggle" id="btn-toggle-bgm" aria-pressed="${this.settings.bgmEnabled}"
                  aria-label="Music" title="Music ${this.settings.bgmEnabled ? 'on' : 'off'}">${this.musicLabel()}</button>
          <div class="title-options">
            <button type="button" class="title-options-toggle" id="btn-options" aria-expanded="false" aria-controls="title-options-menu">
              ${icons.menu}
              Options
            </button>
            <div class="title-options-menu" id="title-options-menu" hidden>
              <button type="button" id="btn-key-map">${icons.controls}<span>Controls</span></button>
              <button type="button" id="btn-skin-gallery">${icons.finish}<span>Ocarina finish</span></button>
              <button type="button" id="btn-settings">${icons.sound}<span>Sound &amp; timing</span></button>
              <hr />
              <button type="button" id="btn-fullscreen">${this.fullscreenLabel(isFs)}</button>
              ${this.installMenuItem()}
              <button type="button" id="btn-menu-lesson">${icons.lesson}<span>Replay the first lesson</span></button>
            </div>
          </div>
        </header>

        <main class="title-center">
          <h1 class="splash-title title-heading">Not the Ocarina<span>Playing Simulator</span></h1>

          <nav class="title-menu" aria-label="Choose how to play">
            <button type="button" class="title-menu-item" id="launch-mode-composer">
              <strong>Wander &amp; Compose</strong>
              <span>Play freely, record what you play and shape it into songs.</span>
            </button>
            <button type="button" class="title-menu-item" id="launch-mode-arcade">
              <strong>Trial of Rhythm</strong>
              <span>Follow the falling notes and earn your mark on each song.</span>
            </button>
          </nav>

        </main>
      </div>
      <div id="toast-banner" class="toast-banner" role="status" aria-live="polite"></div>
    `;

    this.root.querySelector('#btn-menu-lesson')?.addEventListener('click', () => this.transitionTo('tutorial'));
    this.root.querySelector('#launch-mode-composer')?.addEventListener('click', () => this.transitionTo('composer'));
    this.root.querySelector('#launch-mode-arcade')?.addEventListener('click', () => this.transitionTo('arcade'));

    const toggle = this.root.querySelector<HTMLButtonElement>('#btn-options')!;
    const menu = this.root.querySelector<HTMLElement>('#title-options-menu')!;
    const setOpen = (open: boolean) => {
      menu.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      if (open) menu.querySelector<HTMLButtonElement>('button')?.focus();
    };
    toggle.addEventListener('click', () => {
      playUiClick();
      setOpen(menu.hidden);
    });
    menu.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).closest('#btn-install-ios')) setOpen(false);
    });
    this.root.querySelector('#btn-install-ios')?.addEventListener('click', () => {
      this.root.querySelector('#install-ios-guide')?.toggleAttribute('hidden');
    });
    this.root.querySelector('.title-screen')?.addEventListener('pointerdown', (e) => {
      if (!(e.target as HTMLElement).closest('.title-options')) setOpen(false);
    });
    this.root.querySelector('.title-screen')?.addEventListener('keydown', (e) => {
      const ke = e as KeyboardEvent;
      if (ke.key === 'Escape' && !menu.hidden) {
        setOpen(false);
        toggle.focus();
      }
    });

    this.bindCommonUtilityButtons();
    window.setTimeout(() => this.root.querySelector<HTMLButtonElement>('#launch-mode-composer')?.focus({ preventScroll: true }), 50);
  }

  private renderTutorialScreen(): void {
    this.root.innerHTML = `
      <div class="tutorial-screen is-entering">
        <div class="title-backdrop">
          <img src="/not-the-ocarina-playing-simulator/assets/splash-bg.jpg" alt="" class="title-hero-img" />
          <div class="title-scrim tutorial-scrim"></div>
        </div>
        <button type="button" class="tutorial-skip" id="tutorial-skip">Skip <kbd>Esc</kbd></button>
        <section class="tutorial-panel" id="tutorial-panel" aria-live="polite"></section>
        <section class="tutorial-stage">
          <div id="ocarina-stage-mount" class="arcade-ocarina-mount"></div>
        </section>
      </div>
    `;

    const mountEl = this.root.querySelector<HTMLElement>('#ocarina-stage-mount')!;
    this.ocarinaCtrl = new Ocarina3DController(mountEl, this.keyMapping, {
      onHoleDown: (id) => this.handleHoleDown(id),
      onHoleUp: (id) => this.handleHoleUp(id),
      onBlowDown: () => this.handleBlowDown(),
      onBlowUp: () => this.handleBlowUp(),
      onPitchBendChange: (bend) => this.setPitchBend(bend),
    });
    this.ocarinaCtrl.setHideKeyBadges(this.settings.forceHideKeyBadges);
    this.applySelectedSkin();

    this.root.querySelector('#tutorial-skip')?.addEventListener('click', () => this.skipTutorial());
    const panel = this.root.querySelector<HTMLElement>('#tutorial-panel')!;
    this.tutorial = new Tutorial(panel, this.keyMapping, this.settings.breathMode, {
      onHint: (id) => this.ocarinaCtrl?.setHoleHint(id),
      onDemoNote: (id, ms) => {
        this.ocarinaCtrl?.setHoleActive(id, true);
        ocarinaSynth.startVoice(`demo-${id}`, getBentFrequency(id, 'normal'));
        window.setTimeout(() => {
          this.ocarinaCtrl?.setHoleActive(id, false);
          ocarinaSynth.stopVoice(`demo-${id}`);
        }, ms);
      },
      onFinish: () => this.finishTutorial(),
    }, 1500);
  }

  /** First skip plays the closing song; skipping again during it goes straight on. */
  private skipTutorial(): void {
    if (this.tutorial && !this.tutorial.isFinished) {
      this.tutorial.skipToFinale();
      this.root.querySelector('#tutorial-skip')?.classList.add('is-hidden');
      return;
    }
    this.finishTutorial();
  }

  private finishTutorial(): void {
    saveTutorialDone(true);
    this.tutorial?.destroy();
    this.tutorial = null;
    this.transitionTo('title');
  }

  private isTransitioning = false;

  /** Fades the current screen into a dark veil, swaps screens, then lifts the veil. */
  private transitionTo(screen: AppScreen): void {
    if (this.isTransitioning) return;
    this.isTransitioning = true;
    let veil = document.querySelector<HTMLElement>('.screen-veil');
    if (!veil) {
      veil = document.createElement('div');
      veil.className = 'screen-veil';
      document.body.appendChild(veil);
    }
    const v = veil;
    requestAnimationFrame(() => v.classList.add('is-on'));
    window.setTimeout(() => {
      this.navigateTo(screen);
      this.root.firstElementChild?.classList.add('is-arriving');
      requestAnimationFrame(() => v.classList.remove('is-on'));
      this.isTransitioning = false;
    }, 900);
  }

  /** Splash text fades away, the same lake stays, and the lesson begins over it. */
  private enterFromSplash(): void {
    if (this.isTransitioning) return;
    const next: AppScreen = loadTutorialDone() ? 'title' : 'tutorial';
    if (next === 'title') {
      this.transitionTo('title');
      return;
    }
    this.isTransitioning = true;
    const splash = this.root.querySelector<HTMLElement>('.splash-screen');
    const img = splash?.querySelector<HTMLElement>('.title-hero-img');
    const bgTransform = img ? getComputedStyle(img).transform : 'none';
    splash?.classList.add('is-leaving');
    window.setTimeout(() => {
      this.isTransitioning = false;
      this.navigateTo('tutorial');
      const tutImg = this.root.querySelector<HTMLElement>('.tutorial-screen .title-hero-img');
      if (tutImg && bgTransform !== 'none') {
        tutImg.style.transform = bgTransform;
        requestAnimationFrame(() => {
          tutImg.style.transition = 'transform 6s cubic-bezier(0.16, 1, 0.3, 1)';
          tutImg.style.transform = 'scale(1.02)';
        });
      }
    }, 850);
  }

  private renderComposerScreen(): void {
    this.root.innerHTML = `
      <div class="composer-stage-shell">
        <section id="ocarina-stage" class="ocarina-stage composer-stage">
          <img src="/not-the-ocarina-playing-simulator/assets/arcade-stage-bg.jpg" alt="" class="arcade-stage-bg-img" />
          <div id="ocarina-stage-mount" class="arcade-ocarina-mount"></div>
        </section>
        <section id="mode-panel" class="composer-score-layer"></section>
        <div id="composer-dock-left" class="composer-float-dock is-left"></div>
        <div id="composer-dock-right" class="composer-float-dock is-right"></div>
      </div>
      <div id="toast-banner" class="toast-banner" role="status" aria-live="polite"></div>
    `;

    const mountEl = this.root.querySelector<HTMLElement>('#ocarina-stage-mount')!;
    this.ocarinaCtrl = new Ocarina3DController(mountEl, this.keyMapping, {
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
      getHoleScreenPositions: () => this.ocarinaCtrl?.getHoleScreenPositions() ?? null,
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
    this.ocarinaCtrl = new Ocarina3DController(mountEl, this.keyMapping, {
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
      getHoleScreenPositions: () => this.ocarinaCtrl?.getHoleScreenPositions() ?? null,
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
      btn.innerHTML = this.musicLabel();
      btn.setAttribute('aria-pressed', String(this.settings.bgmEnabled));
      btn.title = `Music ${this.settings.bgmEnabled ? 'on' : 'off'}`;
    });

    this.root.querySelector('#btn-fullscreen')?.addEventListener('click', async (e) => {
      playUiClick();
      haptics.tapButton();
      const entered = await toggleFullscreen();
      const btn = e.currentTarget as HTMLButtonElement;
      btn.innerHTML = this.fullscreenLabel(entered);
    });

    this.root.querySelector('#btn-install-pwa')?.addEventListener('click', () => {
      playUiClick();
      haptics.tapButton();
      void triggerPwaInstall((msg) => this.showToast(msg));
    });
  }

  private musicLabel(): string {
    const on = this.settings.bgmEnabled;
    return `${on ? icons.music : icons.musicOff}<span class="title-icon-state">${on ? 'On' : 'Off'}</span>`;
  }

  /**
   * Install appears only where it can actually happen: one click where the browser
   * offers native install, a short visual guide on iPhone/iPad, nothing elsewhere.
   */
  private installMenuItem(): string {
    if (isStandaloneMode()) return '';
    if (canPromptInstall()) {
      return `<button type="button" id="btn-install-pwa">${icons.install}<span>Install as app</span></button>`;
    }
    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
      return `
        <button type="button" id="btn-install-ios">${icons.install}<span>Add to Home Screen</span></button>
        <div class="install-guide" id="install-ios-guide" hidden>
          <span>${icons.share}</span> Tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.
        </div>`;
    }
    return '';
  }

  private fullscreenLabel(isFs: boolean): string {
    return `${icons.fullscreen}<span>${isFs ? 'Leave full screen' : 'Full screen'}</span>`;
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
      },
      onAddCustomSkin: (skin) => {
        this.customSkins = [...this.customSkins, skin];
        saveCustomSkins(this.customSkins);
      },
      onDeleteCustomSkin: (skinId) => {
        this.customSkins = this.customSkins.filter((s) => s.id !== skinId);
        saveCustomSkins(this.customSkins);
      },
      getKeyMapping: () => this.keyMapping,
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
        if (['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(e.key)) return;
        e.preventDefault();
        void getSharedAudioContext().resume();
        this.enterFromSplash();
        return;
      }

      if (this.activeScreen === 'tutorial') {
        if (e.key === 'Escape') {
          e.preventDefault();
          this.skipTutorial();
          return;
        }

      }

      if (this.activeScreen === 'title') {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          const items = Array.from(this.root.querySelectorAll<HTMLButtonElement>('.title-menu-item'));
          const i = items.indexOf(document.activeElement as HTMLButtonElement);
          const next = items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length];
          if (next && !this.root.querySelector('#title-options-menu:not([hidden])')) {
            e.preventDefault();
            next.focus();
          }
        }
        return;
      }
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (this.activeScreen === 'arcade' && this.arcadeMode?.handleOutcomeKeyDown(e)) return;

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

    this.tutorial?.onNote(holeId);

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
