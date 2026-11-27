import { CustomSvgSkin } from '../types';
import {
  OCARINA_SKINS,
  OCARINA_SVG_TEMPLATE,
  sanitizeAndValidateCustomSvg,
} from '../data/ocarinaSkins';
import { haptics } from '../haptics/hapticEngine';
import { playModalOpen, playUiClick } from '../audio/soundMachineSfx';

export class SkinGalleryModal {
  private dialog: HTMLDialogElement;
  private activeTab: 'gallery' | 'custom' = 'gallery';
  private selectedSkinId: string;
  private customSkins: CustomSvgSkin[];
  private uploadError = '';
  private previewSvg: string | null = null;
  private onSelectSkin: (skinId: string) => void;
  private onAddCustomSkin: (skin: CustomSvgSkin) => void;
  private onDeleteCustomSkin: (skinId: string) => void;

  constructor(
    selectedSkinId: string,
    customSkins: CustomSvgSkin[],
    callbacks: {
      onSelectSkin: (skinId: string) => void;
      onAddCustomSkin: (skin: CustomSvgSkin) => void;
      onDeleteCustomSkin: (skinId: string) => void;
    }
  ) {
    this.selectedSkinId = selectedSkinId;
    this.customSkins = customSkins;
    this.onSelectSkin = callbacks.onSelectSkin;
    this.onAddCustomSkin = callbacks.onAddCustomSkin;
    this.onDeleteCustomSkin = callbacks.onDeleteCustomSkin;

    this.dialog = document.createElement('dialog');
    this.dialog.className = 'game-dialog game-dialog-wide';
    this.dialog.id = 'skin-gallery-dialog';
    this.dialog.setAttribute('aria-labelledby', 'skin-gallery-title');
    document.body.appendChild(this.dialog);
  }

  open(selectedSkinId: string, customSkins: CustomSvgSkin[]): void {
    this.selectedSkinId = selectedSkinId;
    this.customSkins = customSkins;
    this.uploadError = '';
    this.render();
    this.dialog.showModal();
    playModalOpen();
    haptics.tapButton();
  }

  private render(): void {
    this.dialog.innerHTML = `
      <div class="dialog-header">
        <h2 id="skin-gallery-title">🎨 Ocarina Mask &amp; Design Gallery</h2>
        <button type="button" class="icon-btn" id="skin-close-btn" aria-label="Close">✕</button>
      </div>

      <div class="dialog-tabs">
        <button type="button" class="btn ${this.activeTab === 'gallery' ? 'btn-gold' : 'btn-secondary'}" id="skin-tab-gallery">
          ✨ Skin Gallery
        </button>
        <button type="button" class="btn ${this.activeTab === 'custom' ? 'btn-gold' : 'btn-secondary'}" id="skin-tab-custom">
          🛠️ Customize &amp; Upload SVG
        </button>
      </div>

      <div class="dialog-body">
        ${this.activeTab === 'gallery' ? this.renderGalleryTab() : this.renderCustomTab()}
      </div>

      <div class="dialog-footer">
        <button type="button" class="btn btn-primary" id="skin-done-btn">Done</button>
      </div>
    `;

    this.bindEvents();
  }

  private renderGalleryTab(): string {
    return `
      <div class="skin-grid">
        ${OCARINA_SKINS.map(
          (skin) => `
          <button type="button"
                  class="skin-card ${this.selectedSkinId === skin.id ? 'is-selected' : ''}"
                  data-select-skin="${skin.id}">
            <div class="skin-swatch" style="background:linear-gradient(135deg, ${skin.bodyPrimary}, ${skin.bodySecondary}); border-color:${skin.bandAccent};">
              <span class="skin-triforce" style="color:${skin.triforceColor}">▲</span>
            </div>
            <div class="skin-info">
              <strong>${skin.name}</strong>
              <p>${skin.description}</p>
            </div>
          </button>
        `
        ).join('')}

        ${this.customSkins
          .map(
            (cs) => `
          <div class="skin-card custom-skin-card ${this.selectedSkinId === cs.id ? 'is-selected' : ''}">
            <button type="button" class="skin-select-overlay" data-select-skin="${cs.id}">
              <div class="skin-swatch custom-svg-thumb">${cs.svgContent}</div>
              <div class="skin-info">
                <strong>${cs.name} (Custom)</strong>
                <p>User-uploaded custom SVG mask</p>
              </div>
            </button>
            <button type="button" class="icon-btn delete-skin-btn" data-delete-skin="${cs.id}" aria-label="Delete ${cs.name}">🗑️</button>
          </div>
        `
          )
          .join('')}
      </div>
    `;
  }

  private renderCustomTab(): string {
    return `
      <div class="custom-svg-module">
        <div class="instruction-box">
          <h3>How to Create Your Own Ocarina Mask</h3>
          <ol>
            <li><strong>Download</strong> the official <code>ocarina-template.svg</code> below.</li>
            <li>Open it in <strong>Inkscape, Figma, Illustrator, or any text editor</strong> to customize colors, shapes, or artwork.</li>
            <li>Keep all 5 <code>data-hole</code> attributes (<code>hole-a</code>, <code>hole-down</code>, <code>hole-right</code>, <code>hole-left</code>, <code>hole-up</code>) intact so notes stay clickable.</li>
            <li><strong>Upload</strong> your edited <code>.svg</code> below and activate it!</li>
          </ol>
          <button type="button" class="btn btn-gold" id="btn-download-svg-template">⬇️ Download SVG Template</button>
        </div>

        <div class="upload-box">
          <label class="field-label">
            <span>Custom Skin Name</span>
            <input type="text" id="custom-skin-name" class="text-input" placeholder="e.g. Fierce Deity Ocarina" value="My Custom Ocarina" />
          </label>

          <label class="file-drop-zone" for="custom-svg-file">
            <span>📁 Choose or drop a customized <strong>.svg</strong> file</span>
            <input type="file" id="custom-svg-file" accept=".svg,image/svg+xml" />
          </label>

          ${this.uploadError ? `<p class="error-banner" role="alert">⚠️ ${this.uploadError}</p>` : ''}

          ${
            this.previewSvg
              ? `<div class="custom-preview-box">
                   <p class="muted-text">Preview:</p>
                   <div class="custom-preview-stage">${this.previewSvg}</div>
                   <button type="button" class="btn btn-primary" id="btn-save-custom-svg">✅ Save &amp; Equip Custom Ocarina</button>
                 </div>`
              : ''
          }
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    const close = () => {
      playUiClick();
      haptics.tapButton();
      this.dialog.close();
    };
    this.dialog.querySelector('#skin-close-btn')?.addEventListener('click', close);
    this.dialog.querySelector('#skin-done-btn')?.addEventListener('click', close);

    this.dialog.querySelector('#skin-tab-gallery')?.addEventListener('click', () => {
      playUiClick();
      haptics.tapButton();
      this.activeTab = 'gallery';
      this.render();
    });

    this.dialog.querySelector('#skin-tab-custom')?.addEventListener('click', () => {
      playUiClick();
      haptics.tapButton();
      this.activeTab = 'custom';
      this.render();
    });

    this.dialog.querySelectorAll<HTMLElement>('[data-select-skin]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.selectSkin!;
        this.selectedSkinId = id;
        playUiClick();
        haptics.tapButton();
        this.onSelectSkin(id);
        this.render();
      });
    });

    this.dialog.querySelectorAll<HTMLButtonElement>('[data-delete-skin]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.deleteSkin!;
        playUiClick();
        haptics.tapButton();
        this.customSkins = this.customSkins.filter((s) => s.id !== id);
        if (this.selectedSkinId === id) {
          this.selectedSkinId = 'ocarina-of-time';
          this.onSelectSkin('ocarina-of-time');
        }
        this.onDeleteCustomSkin(id);
        this.render();
      });
    });

    this.dialog.querySelector('#btn-download-svg-template')?.addEventListener('click', () => {
      playUiClick();
      haptics.tapButton();
      const blob = new Blob([OCARINA_SVG_TEMPLATE], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ocarina-template.svg';
      a.click();
      URL.revokeObjectURL(url);
    });

    const fileInput = this.dialog.querySelector<HTMLInputElement>('#custom-svg-file');
    fileInput?.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      const text = await file.text();
      const result = sanitizeAndValidateCustomSvg(text);
      if (!result.valid || !result.sanitizedSvg) {
        this.uploadError = result.error || 'Invalid SVG file.';
        this.previewSvg = null;
        haptics.miss();
      } else {
        this.uploadError = '';
        this.previewSvg = result.sanitizedSvg;
        haptics.hitPerfect();
      }
      this.render();
    });

    this.dialog.querySelector('#btn-save-custom-svg')?.addEventListener('click', () => {
      if (!this.previewSvg) return;
      const nameInput = this.dialog.querySelector<HTMLInputElement>('#custom-skin-name');
      const name = nameInput?.value.trim() || 'Custom Ocarina';
      const newSkin: CustomSvgSkin = {
        id: `custom-${Date.now()}`,
        name,
        svgContent: this.previewSvg,
        createdAt: Date.now(),
      };
      this.customSkins = [...this.customSkins, newSkin];
      this.selectedSkinId = newSkin.id;
      this.previewSvg = null;
      this.activeTab = 'gallery';
      playUiClick();
      haptics.victory();
      this.onAddCustomSkin(newSkin);
      this.onSelectSkin(newSkin.id);
      this.render();
    });
  }
}
