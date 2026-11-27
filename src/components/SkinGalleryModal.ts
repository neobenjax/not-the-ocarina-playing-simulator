import { CustomSvgSkin, getBentFrequency, HoleId, KeyMapping, OCARINA_HOLES } from '../types';
import { OCARINA_SKINS } from '../data/ocarinaSkins';
import { haptics } from '../haptics/hapticEngine';
import { playModalOpen, playUiClick } from '../audio/soundMachineSfx';
import { ocarinaSynth } from '../audio/ocarinaSynth';
import { Ocarina3DController } from './Ocarina3D';
import { icons } from './icons';

/**
 * Pick the ocarina's glaze. A live 3D preview shows each finish the moment
 * it is chosen, and can be played by touch or keys to hear it.
 */
export class SkinGalleryModal {
  private dialog: HTMLDialogElement;
  private selectedSkinId: string;
  private preview: Ocarina3DController | null = null;
  private onSelectSkin: (skinId: string) => void;
  private getKeyMapping: () => KeyMapping;

  constructor(
    selectedSkinId: string,
    _customSkins: CustomSvgSkin[],
    callbacks: {
      onSelectSkin: (skinId: string) => void;
      onAddCustomSkin: (skin: CustomSvgSkin) => void;
      onDeleteCustomSkin: (skinId: string) => void;
      getKeyMapping: () => KeyMapping;
    }
  ) {
    this.selectedSkinId = selectedSkinId;
    this.onSelectSkin = callbacks.onSelectSkin;
    this.getKeyMapping = callbacks.getKeyMapping;

    this.dialog = document.createElement('dialog');
    this.dialog.className = 'game-dialog game-dialog-wide finish-dialog';
    this.dialog.id = 'skin-gallery-dialog';
    this.dialog.setAttribute('aria-labelledby', 'skin-gallery-title');
    document.body.appendChild(this.dialog);
    // play the preview with the same keys as the game
    const holeFor = (code: string): HoleId | undefined => OCARINA_HOLES.find((h) => this.getKeyMapping()[h.id] === code)?.id;
    this.dialog.addEventListener('keydown', (e) => {
      const id = holeFor(e.code);
      if (!id) return;
      e.preventDefault();
      if (e.repeat) return;
      this.playHole(id, true);
    });
    this.dialog.addEventListener('keyup', (e) => {
      const id = holeFor(e.code);
      if (id) this.playHole(id, false);
    });
    this.dialog.addEventListener('close', () => {
      ocarinaSynth.stopAllVoices();
      this.preview?.destroy();
      this.preview = null;
    });
  }

  open(selectedSkinId: string, _customSkins: CustomSvgSkin[]): void {
    this.selectedSkinId = OCARINA_SKINS.some((s) => s.id === selectedSkinId) ? selectedSkinId : OCARINA_SKINS[0].id;
    this.render();
    this.dialog.showModal();
    playModalOpen();
    haptics.tapButton();
  }

  private render(): void {
    const current = OCARINA_SKINS.find((s) => s.id === this.selectedSkinId) ?? OCARINA_SKINS[0];
    this.dialog.innerHTML = `
      <div class="dialog-header">
        <h2 id="skin-gallery-title">Ocarina finish</h2>
        <button type="button" class="icon-btn" id="skin-close-btn" aria-label="Close">${icons.close}</button>
      </div>
      <div class="dialog-body finish-body">
        <div class="finish-stage">
          <div class="finish-preview" id="finish-preview"></div>
          <p class="finish-caption"><strong id="finish-name">${current.name}</strong><span id="finish-desc">${current.description}</span></p>
          <p class="finish-hint">Play it with your keys or tap the holes.</p>
        </div>
        <ul class="finish-list" role="listbox" aria-label="Finishes">
          ${OCARINA_SKINS.map(
            (s) => `
            <li>
              <button type="button" class="finish-option" role="option" aria-selected="${s.id === this.selectedSkinId}" data-skin="${s.id}">
                <span class="finish-swatch" style="--a:${s.bodyPrimary};--b:${s.bodySecondary};--band:${s.bandColor}"></span>
                <span class="finish-option-name">${s.name}</span>
              </button>
            </li>`
          ).join('')}
        </ul>
      </div>
      <div class="dialog-footer">
        <button type="button" class="btn btn-gold" id="skin-done-btn">Done</button>
      </div>
    `;

    const mount = this.dialog.querySelector<HTMLElement>('#finish-preview')!;
    this.preview?.destroy();
    this.preview = new Ocarina3DController(mount, this.getKeyMapping(), {
      onHoleDown: (id) => this.playHole(id, true),
      onHoleUp: (id) => this.playHole(id, false),
      onBlowDown: () => {},
      onBlowUp: () => {},
    });
    this.preview.setTheme(current);

    this.dialog.querySelectorAll<HTMLButtonElement>('[data-skin]').forEach((btn) => {
      btn.addEventListener('click', () => this.choose(btn.dataset.skin!));
    });
    const close = () => {
      playUiClick();
      haptics.tapButton();
      this.dialog.close();
    };
    this.dialog.querySelector('#skin-close-btn')?.addEventListener('click', close);
    this.dialog.querySelector('#skin-done-btn')?.addEventListener('click', close);
  }

  private playHole(id: HoleId, down: boolean): void {
    this.preview?.setHoleActive(id, down);
    if (down) {
      haptics.pressHole();
      ocarinaSynth.startVoice(id, getBentFrequency(id, 'normal'));
    } else {
      ocarinaSynth.stopVoice(id);
    }
  }

  private choose(skinId: string): void {
    const skin = OCARINA_SKINS.find((s) => s.id === skinId);
    if (!skin || skinId === this.selectedSkinId) return;
    this.selectedSkinId = skinId;
    playUiClick();
    haptics.tapButton();
    this.preview?.setTheme(skin);
    this.dialog.querySelectorAll<HTMLButtonElement>('[data-skin]').forEach((b) =>
      b.setAttribute('aria-selected', String(b.dataset.skin === skinId))
    );
    this.dialog.querySelector('#finish-name')!.textContent = skin.name;
    this.dialog.querySelector('#finish-desc')!.textContent = skin.description;
    this.onSelectSkin(skinId);
  }
}
