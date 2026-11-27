import { AppSettings } from '../types';
import { haptics } from '../haptics/hapticEngine';
import { playModalOpen, playUiClick } from '../audio/soundMachineSfx';

export class SettingsModal {
  private dialog: HTMLDialogElement;
  private settings: AppSettings;
  private onChange: (settings: AppSettings) => void;

  constructor(settings: AppSettings, onChange: (settings: AppSettings) => void) {
    this.settings = { ...settings };
    this.onChange = onChange;

    this.dialog = document.createElement('dialog');
    this.dialog.className = 'game-dialog';
    this.dialog.id = 'settings-dialog';
    this.dialog.setAttribute('aria-labelledby', 'settings-title');
    document.body.appendChild(this.dialog);
  }

  open(settings: AppSettings): void {
    this.settings = { ...settings };
    this.render();
    this.dialog.showModal();
    playModalOpen();
    haptics.tapButton();
  }

  private render(): void {
    const s = this.settings;
    this.dialog.innerHTML = `
      <div class="dialog-header">
        <h2 id="settings-title">Audio, Rhythm & Haptics</h2>
        <button type="button" class="icon-btn" id="settings-close-btn" aria-label="Close"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>
      </div>
      <div class="dialog-body settings-body">
        <div class="setting-group">
          <h3>Audio Mix</h3>
          <label class="slider-row">
            <span>Master Volume (<strong id="val-master">${Math.round(s.masterVolume * 100)}%</strong>)</span>
            <input type="range" id="set-master-vol" min="0" max="1" step="0.05" value="${s.masterVolume}" />
          </label>
          <label class="slider-row">
            <span>Ocarina Volume (<strong id="val-ocarina">${Math.round(s.ocarinaVolume * 100)}%</strong>)</span>
            <input type="range" id="set-ocarina-vol" min="0" max="1" step="0.05" value="${s.ocarinaVolume}" />
          </label>
          <label class="slider-row">
            <span>Guide Melody (<strong id="val-guide">${Math.round(s.guideVolume * 100)}%</strong>)</span>
            <input type="range" id="set-guide-vol" min="0" max="1" step="0.05" value="${s.guideVolume}" />
          </label>
          <label class="slider-row">
            <span>SFX & Menu BGM (<strong id="val-sfx">${Math.round(s.sfxVolume * 100)}%</strong>)</span>
            <input type="range" id="set-sfx-vol" min="0" max="1" step="0.05" value="${s.sfxVolume}" />
          </label>
        </div>

        <div class="setting-group">
          <h3>Rhythm Calibration</h3>
          <label class="slider-row">
            <span>Audio/Visual Offset (<strong id="val-offset">${s.offsetMs > 0 ? '+' : ''}${s.offsetMs} ms</strong>)</span>
            <input type="range" id="set-offset" min="-250" max="250" step="5" value="${s.offsetMs}" />
          </label>
          <label class="slider-row">
            <span>Arcade Scroll Speed (<strong id="val-speed">${s.scrollSpeed.toFixed(1)}x</strong>)</span>
            <input type="range" id="set-speed" min="0.8" max="3.5" step="0.1" value="${s.scrollSpeed}" />
          </label>
        </div>

        <div class="setting-group">
          <h3>Tactile & Interface</h3>
          <label class="toggle-row">
            <span>Haptic Vibrations (WebHaptics)</span>
            <input type="checkbox" class="switch" id="set-haptics" ${s.hapticsEnabled ? 'checked' : ''} />
          </label>
          <label class="toggle-row">
            <span>Hide Keyboard Badges on Ocarina</span>
            <input type="checkbox" class="switch" id="set-hide-badges" ${s.forceHideKeyBadges ? 'checked' : ''} />
          </label>
        </div>
      </div>
      <div class="dialog-footer">
        <button type="button" class="btn btn-gold" id="settings-done-btn">Save & Close</button>
      </div>
    `;

    const bindRange = (id: string, valId: string, format: (v: number) => string, assign: (v: number) => void) => {
      const input = this.dialog.querySelector<HTMLInputElement>(id);
      const label = this.dialog.querySelector(valId);
      input?.addEventListener('input', () => {
        const val = parseFloat(input.value);
        assign(val);
        if (label) label.textContent = format(val);
        this.onChange({ ...this.settings });
      });
    };

    bindRange('#set-master-vol', '#val-master', (v) => `${Math.round(v * 100)}%`, (v) => (this.settings.masterVolume = v));
    bindRange('#set-ocarina-vol', '#val-ocarina', (v) => `${Math.round(v * 100)}%`, (v) => (this.settings.ocarinaVolume = v));
    bindRange('#set-guide-vol', '#val-guide', (v) => `${Math.round(v * 100)}%`, (v) => (this.settings.guideVolume = v));
    bindRange('#set-sfx-vol', '#val-sfx', (v) => `${Math.round(v * 100)}%`, (v) => (this.settings.sfxVolume = v));
    bindRange('#set-offset', '#val-offset', (v) => `${v > 0 ? '+' : ''}${v} ms`, (v) => (this.settings.offsetMs = v));
    bindRange('#set-speed', '#val-speed', (v) => `${v.toFixed(1)}x`, (v) => (this.settings.scrollSpeed = v));

    this.dialog.querySelector<HTMLInputElement>('#set-haptics')?.addEventListener('change', (e) => {
      this.settings.hapticsEnabled = (e.target as HTMLInputElement).checked;
      this.onChange({ ...this.settings });
      haptics.tapButton();
    });

    this.dialog.querySelector<HTMLInputElement>('#set-hide-badges')?.addEventListener('change', (e) => {
      this.settings.forceHideKeyBadges = (e.target as HTMLInputElement).checked;
      this.onChange({ ...this.settings });
      haptics.tapButton();
      playUiClick();
    });

    const close = () => {
      playUiClick();
      haptics.tapButton();
      this.dialog.close();
    };
    this.dialog.querySelector('#settings-close-btn')?.addEventListener('click', close);
    this.dialog.querySelector('#settings-done-btn')?.addEventListener('click', close);
  }
}
