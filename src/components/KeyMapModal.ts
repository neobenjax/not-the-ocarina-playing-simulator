import { DEFAULT_KEY_MAPPING, KeyMapping, OCARINA_HOLES } from '../types';
import { formatKeyCode } from '../storage/persistence';
import { haptics } from '../haptics/hapticEngine';
import { playModalOpen, playUiClick } from '../audio/soundMachineSfx';

export class KeyMapModal {
  private dialog: HTMLDialogElement;
  private mapping: KeyMapping;
  private breathMode: boolean;
  private listeningTarget: keyof KeyMapping | null = null;
  private onChange: (mapping: KeyMapping, breathMode: boolean) => void;

  constructor(
    mapping: KeyMapping,
    breathMode: boolean,
    onChange: (mapping: KeyMapping, breathMode: boolean) => void
  ) {
    this.mapping = { ...mapping };
    this.breathMode = breathMode;
    this.onChange = onChange;

    this.dialog = document.createElement('dialog');
    this.dialog.className = 'game-dialog';
    this.dialog.id = 'keymap-dialog';
    this.dialog.setAttribute('aria-labelledby', 'keymap-title');
    document.body.appendChild(this.dialog);

    window.addEventListener('keydown', (e) => {
      if (!this.dialog.open || !this.listeningTarget) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') {
        this.listeningTarget = null;
        this.render();
        return;
      }
      // Swap if already assigned
      const prevKey = this.mapping[this.listeningTarget];
      for (const k of Object.keys(this.mapping) as (keyof KeyMapping)[]) {
        if (this.mapping[k] === e.code && k !== this.listeningTarget) {
          this.mapping[k] = prevKey;
        }
      }
      this.mapping[this.listeningTarget] = e.code;
      this.listeningTarget = null;
      haptics.tapButton();
      playUiClick();
      this.onChange({ ...this.mapping }, this.breathMode);
      this.render();
    });
  }

  open(mapping: KeyMapping, breathMode: boolean): void {
    this.mapping = { ...mapping };
    this.breathMode = breathMode;
    this.listeningTarget = null;
    this.render();
    this.dialog.showModal();
    playModalOpen();
    haptics.tapButton();
  }

  private render(): void {
    const rows = [
      ...OCARINA_HOLES.map((h) => ({
        key: h.id as keyof KeyMapping,
        label: `${h.ootButton} (${h.noteName})`,
        color: h.color,
      })),
      { key: 'blow' as keyof KeyMapping, label: 'Blow Air (Breath)', color: '#00d2ff' },
      { key: 'prevCategory' as keyof KeyMapping, label: 'Prev Category / Playlist', color: '#f2c94c' },
      { key: 'nextCategory' as keyof KeyMapping, label: 'Next Category / Playlist', color: '#f2c94c' },
    ];

    this.dialog.innerHTML = `
      <div class="dialog-header">
        <h2 id="keymap-title">⌨️ Desktop Key Mapping</h2>
        <button type="button" class="icon-btn" id="keymap-close-btn" aria-label="Close">✕</button>
      </div>
      <div class="dialog-body">
        <label class="toggle-row">
          <div>
            <strong>Breath Mode (Require "Blow Air" Key)</strong>
            <p class="muted-text">When enabled, hold a note hole AND press/hold Blow Air to sound the Ocarina. Disable for instant tap-to-play.</p>
          </div>
          <input type="checkbox" id="keymap-breath-toggle" ${this.breathMode ? 'checked' : ''} />
        </label>

        <div class="keymap-grid">
          ${rows
            .map((r) => {
              const isListening = this.listeningTarget === r.key;
              return `
                <div class="keymap-row">
                  <span class="keymap-label">
                    <span class="color-dot" style="background:${r.color}"></span>
                    ${r.label}
                  </span>
                  <button type="button"
                          class="btn btn-outline key-capture-btn ${isListening ? 'is-listening' : ''}"
                          data-bind-target="${r.key}">
                    ${isListening ? 'Press any key...' : formatKeyCode(this.mapping[r.key])}
                  </button>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>
      <div class="dialog-footer">
        <button type="button" class="btn btn-secondary" id="keymap-reset-btn">Reset Defaults</button>
        <button type="button" class="btn btn-primary" id="keymap-done-btn">Done</button>
      </div>
    `;

    this.dialog.querySelector('#keymap-close-btn')?.addEventListener('click', () => {
      playUiClick();
      haptics.tapButton();
      this.dialog.close();
    });
    this.dialog.querySelector('#keymap-done-btn')?.addEventListener('click', () => {
      playUiClick();
      haptics.tapButton();
      this.dialog.close();
    });
    this.dialog.querySelector('#keymap-reset-btn')?.addEventListener('click', () => {
      playUiClick();
      haptics.tapButton();
      this.mapping = { ...DEFAULT_KEY_MAPPING };
      this.onChange({ ...this.mapping }, this.breathMode);
      this.render();
    });
    this.dialog.querySelector('#keymap-breath-toggle')?.addEventListener('change', (e) => {
      this.breathMode = (e.target as HTMLInputElement).checked;
      playUiClick();
      haptics.tapButton();
      this.onChange({ ...this.mapping }, this.breathMode);
    });
    this.dialog.querySelectorAll<HTMLButtonElement>('[data-bind-target]').forEach((btn) => {
      btn.addEventListener('click', () => {
        playUiClick();
        haptics.tapButton();
        this.listeningTarget = btn.dataset.bindTarget as keyof KeyMapping;
        this.render();
      });
    });
  }
}
