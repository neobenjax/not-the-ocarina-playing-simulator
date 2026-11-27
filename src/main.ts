import './styles/main.css';
import { HoleId, HOLE_MAP, KeyMapping, AppSettings, CustomSvgSkin } from './types';
import {
  loadCustomSkins,
  loadKeyMapping,
  loadSelectedSkinId,
  loadSettings,
  saveCustomSkins,
  saveKeyMapping,
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

class OcarinaApp {
  private root: HTMLElement;
  private settings: AppSettings;
  private keyMapping: KeyMapping;
  private selectedSkinId: string;
  private customSkins: CustomSvgSkin[];
  private activeMode: 'free' | 'arcade' = 'free';

  private ocarinaCtrl!: OcarinaSvgController;
  private keyMapModal!: KeyMapModal;
  private settingsModal!: SettingsModal;
  private skinGalleryModal!: SkinGalleryModal;

  private heldHoles: HoleId[] = [];
  private isBlowKeyHeld = false;
  private toastTimer: number | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.settings = loadSettings();
    this.keyMapping = loadKeyMapping();
    this.selectedSkinId = loadSelectedSkinId();
    this.customSkins = loadCustomSkins();

    this.applyAudioAndHaptics();
    this.renderShell();
    this.applySelectedSkin();
    this.initModals();
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

  private renderShell(): void {
    this.root.innerHTML = `
      <div class="app-shell">
        <header class="top-hud">
          <div class="brand">
            <img class="brand-emblem" src="/not-the-ocarina-playing-simulator/assets/ocarina-emblem.jpg" alt="Ocarina Emblem" />
            <div>
              <h1 class="brand-title">Ocarina of Time Simulator</h1>
              <p class="brand-subtitle">Hyrule Partiture &amp; Arcade Rhythm</p>
            </div>
          </div>

          <nav class="mode-tabs" aria-label="Game Modes">
            <button type="button" class="mode-tab ${this.activeMode === 'free' ? 'is-active' : ''}" id="tab-mode-free">
              🎵 Free Play &amp; Composer
            </button>
            <button type="button" class="mode-tab ${this.activeMode === 'arcade' ? 'is-active' : ''}" id="tab-mode-arcade">
              🥁 Arcade Mode
            </button>
          </nav>

          <div class="hud-actions">
            <button type="button" class="btn btn-secondary" id="btn-skin-gallery">🎨 Skins</button>
            <button type="button" class="btn btn-secondary" id="btn-key-map">⌨️ Keys</button>
            <button type="button" class="btn btn-secondary ${this.settings.bgmEnabled ? 'is-on' : ''}" id="btn-toggle-bgm">
              🎶 BGM ${this.settings.bgmEnabled ? 'On' : 'Off'}
            </button>
            <button type="button" class="btn btn-secondary" id="btn-settings">⚙️ Settings</button>
          </div>
        </header>

        <main class="main-workspace">
          <section id="mode-panel" class="panel-card"></section>
          <section id="ocarina-stage" class="panel-card ocarina-stage"></section>
        </main>
      </div>
      <div id="toast-banner" class="toast-banner" role="status" aria-live="polite"></div>
    `;

    const stageEl = this.root.querySelector<HTMLElement>('#ocarina-stage')!;
    this.ocarinaCtrl = new OcarinaSvgController(stageEl, this.keyMapping, {
      onHoleDown: (id) => this.handleHoleDown(id),
      onHoleUp: (id) => this.handleHoleUp(id),
      onBlowDown: () => this.handleBlowDown(),
      onBlowUp: () => this.handleBlowUp(),
    });
    this.ocarinaCtrl.setHideKeyBadges(this.settings.forceHideKeyBadges);

    this.renderModePanel();
    this.bindHudEvents();
  }

  private renderModePanel(): void {
    const panel = this.root.querySelector<HTMLElement>('#mode-panel');
    if (!panel) return;
    if (this.activeMode === 'free') {
      panel.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.75rem;">
          <div>
            <h2 style="margin:0;font-family:var(--font-display);color:var(--zelda-gold);">Mode 1: Free Play</h2>
            <p class="muted-text">Play notes on the Ocarina below, or configure Breath Mode &amp; custom keys in ⌨️ Keys.</p>
          </div>
        </div>
      `;
    } else {
      panel.innerHTML = `
        <div>
          <h2 style="margin:0;font-family:var(--font-display);color:var(--taiko-orange);">Mode 2: Arcade Rhythm</h2>
          <p class="muted-text">Arcade highway &amp; Pump It Up Phoenix 2 scoring arriving in Milestone 4.</p>
        </div>
      `;
    }
  }

  private bindHudEvents(): void {
    this.root.querySelector('#tab-mode-free')?.addEventListener('click', () => {
      playUiClick();
      haptics.tapButton();
      this.activeMode = 'free';
      this.updateModeTabs();
      this.renderModePanel();
    });

    this.root.querySelector('#tab-mode-arcade')?.addEventListener('click', () => {
      playUiClick();
      haptics.tapButton();
      this.activeMode = 'arcade';
      this.updateModeTabs();
      this.renderModePanel();
    });

    this.root.querySelector('#btn-key-map')?.addEventListener('click', () => {
      this.keyMapModal.open(this.keyMapping, this.settings.breathMode);
    });

    this.root.querySelector('#btn-settings')?.addEventListener('click', () => {
      this.settingsModal.open(this.settings);
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

    this.root.querySelector('#btn-skin-gallery')?.addEventListener('click', () => {
      this.skinGalleryModal.open(this.selectedSkinId, this.customSkins);
    });
  }

  private applySelectedSkin(): void {
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

  private updateModeTabs(): void {
    this.root.querySelector('#tab-mode-free')?.classList.toggle('is-active', this.activeMode === 'free');
    this.root.querySelector('#tab-mode-arcade')?.classList.toggle('is-active', this.activeMode === 'arcade');
  }

  private initModals(): void {
    this.keyMapModal = new KeyMapModal(this.keyMapping, this.settings.breathMode, (newMap, breathMode) => {
      this.keyMapping = newMap;
      this.settings.breathMode = breathMode;
      saveKeyMapping(newMap);
      saveSettings(this.settings);
      this.ocarinaCtrl.setKeyMapping(newMap);
    });

    this.settingsModal = new SettingsModal(this.settings, (newSettings) => {
      this.settings = newSettings;
      saveSettings(newSettings);
      this.applyAudioAndHaptics();
      this.ocarinaCtrl.setHideKeyBadges(newSettings.forceHideKeyBadges);
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
    this.ocarinaCtrl.setHoleActive(holeId, true);
    haptics.pressHole();

    if (!this.settings.breathMode || this.isBlowKeyHeld) {
      ocarinaSynth.startNote(HOLE_MAP[holeId].frequency);
    }
  }

  private handleHoleUp(holeId: HoleId): void {
    this.heldHoles = this.heldHoles.filter((id) => id !== holeId);
    this.ocarinaCtrl.setHoleActive(holeId, false);

    if (this.heldHoles.length > 0 && (!this.settings.breathMode || this.isBlowKeyHeld)) {
      const top = this.heldHoles[this.heldHoles.length - 1];
      ocarinaSynth.startNote(HOLE_MAP[top].frequency);
    } else {
      ocarinaSynth.stopNote();
    }
  }

  private handleBlowDown(): void {
    this.isBlowKeyHeld = true;
    this.ocarinaCtrl.setBlowActive(true);
    haptics.blowAir();

    if (this.heldHoles.length > 0) {
      const top = this.heldHoles[this.heldHoles.length - 1];
      ocarinaSynth.startNote(HOLE_MAP[top].frequency);
    }
  }

  private handleBlowUp(): void {
    this.isBlowKeyHeld = false;
    this.ocarinaCtrl.setBlowActive(false);
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
