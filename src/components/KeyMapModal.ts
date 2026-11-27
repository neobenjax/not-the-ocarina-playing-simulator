import { DEFAULT_KEY_MAPPING, HOLE_MAP, HoleId, KeyMapping, OCARINA_HOLES } from '../types';
import { icons } from './icons';
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
    const holeRows: Array<{ key: keyof KeyMapping; label: string; color: string }> = [
      { key: 'hole-a', label: 'Lower left', color: HOLE_MAP['hole-a'].color },
      { key: 'hole-down', label: 'Lower middle', color: HOLE_MAP['hole-down'].color },
      { key: 'hole-right', label: 'Lower right', color: HOLE_MAP['hole-right'].color },
      { key: 'hole-up', label: 'Upper left', color: HOLE_MAP['hole-up'].color },
      { key: 'hole-left', label: 'Upper right', color: HOLE_MAP['hole-left'].color },
    ];
    const groups: Array<{ title: string; rows: Array<{ key: keyof KeyMapping; label: string; color?: string; note?: string }> }> = [
      { title: 'Holes', rows: holeRows.map((r) => ({ ...r, note: HOLE_MAP[r.key as HoleId].noteName })) },
      {
        title: 'Breath & pitch',
        rows: [
          { key: 'blow', label: 'Blow', color: BREATH_COLOR, note: this.breathMode ? 'needed to sound' : 'optional' },
          { key: 'pitchUp', label: 'Bend up', note: '+1 semitone' },
          { key: 'pitchDown', label: 'Bend down', note: '−1 semitone' },
        ],
      },
      {
        title: 'Menus & composer',
        rows: [
          { key: 'prevCategory', label: 'Previous list' },
          { key: 'nextCategory', label: 'Next list' },
          { key: 'compRecord', label: 'Record' },
          { key: 'compPlay', label: 'Play / pause' },
          { key: 'compClear', label: 'Clear track' },
        ],
      },
    ];

    this.dialog.innerHTML = `
      <div class="dialog-header">
        <h2 id="keymap-title">Controls</h2>
        <button type="button" class="icon-btn" id="keymap-close-btn" aria-label="Close">${icons.close}</button>
      </div>
      <div class="dialog-body">
        <figure class="controls-figure" aria-label="The keys mirror the ocarina: the lower row of holes is J K L, the upper row is U I.">
          ${this.ocarinaSketch()}
          ${this.keyboardSketch()}
          <figcaption>The keys sit where the holes sit: lower row on the home row, upper row just above it.</figcaption>
        </figure>

        <label class="toggle-row">
          <span>
            <strong>Breath mode</strong>
            <span class="muted-text">Hold <kbd>${formatKeyCode(this.mapping.blow)}</kbd> while covering a hole to make it sound.</span>
          </span>
          <input type="checkbox" class="switch" id="keymap-breath-toggle" ${this.breathMode ? 'checked' : ''} />
        </label>

        ${groups
          .map(
            (g) => `
          <section class="keymap-group">
            <h3>${g.title}</h3>
            ${g.rows
              .map((r) => {
                const listening = this.listeningTarget === r.key;
                return `
                <div class="keymap-row" data-k="${r.key}">
                  <span class="keymap-label">
                    ${r.color ? `<span class="color-dot" style="--dot:${r.color}"></span>` : '<span class="color-dot is-empty"></span>'}
                    ${r.label}
                    ${r.note ? `<span class="keymap-note">${r.note}</span>` : ''}
                  </span>
                  <button type="button" class="key-capture-btn ${listening ? 'is-listening' : ''}" data-bind-target="${r.key}"
                          aria-label="Change key for ${r.label}">
                    ${listening ? 'Press a key…' : `<kbd>${formatKeyCode(this.mapping[r.key])}</kbd>`}
                  </button>
                </div>`;
              })
              .join('')}
          </section>`
          )
          .join('')}
      </div>
      <div class="dialog-footer">
        <button type="button" class="btn btn-secondary" id="keymap-reset-btn">Restore defaults</button>
        <button type="button" class="btn btn-gold" id="keymap-done-btn">Done</button>
      </div>
    `;

    // hovering a row lights its hole and its key in the sketches
    this.dialog.querySelectorAll<HTMLElement>('.keymap-row').forEach((row) => {
      const k = row.dataset.k!;
      const lit = (on: boolean) => this.dialog.querySelectorAll(`[data-k="${k}"]`).forEach((el) => el.classList.toggle('is-lit', on));
      row.addEventListener('mouseenter', () => lit(true));
      row.addEventListener('mouseleave', () => lit(false));
    });

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

  /** Who owns a key code in the current mapping, with that action's color. */
  private ownerOf(code: string): { key: keyof KeyMapping; color: string } | null {
    for (const h of OCARINA_HOLES) if (this.mapping[h.id] === code) return { key: h.id, color: h.color };
    if (this.mapping.blow === code) return { key: 'blow', color: BREATH_COLOR };
    for (const k of ['pitchUp', 'pitchDown', 'prevCategory', 'nextCategory', 'compRecord', 'compPlay', 'compClear'] as const) {
      if (this.mapping[k] === code) return { key: k, color: '#c9b98f' };
    }
    return null;
  }

  private ocarinaSketch(): string {
    const holes = OCARINA_HOLES.map((h) => {
      const p = SKETCH_HOLES[h.id];
      return `
        <g class="sketch-hole" data-k="${h.id}">
          <circle cx="${p.x}" cy="${p.y}" r="${p.r + 4}" fill="none" stroke="${h.color}" stroke-width="2" opacity="0.85"/>
          <circle cx="${p.x}" cy="${p.y}" r="${p.r}" fill="#0a0c12" stroke="#d4d8de" stroke-width="1.6"/>
          <text x="${p.x}" y="${p.y + p.r + 17}" text-anchor="middle">${formatKeyCode(this.mapping[h.id])}</text>
        </g>`;
    }).join('');
    return `
      <svg class="sketch-ocarina" viewBox="0 0 360 150" role="img" aria-hidden="true">
        <defs>
          <linearGradient id="sk-body" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#3a62b8"/><stop offset="1" stop-color="#1b3570"/>
          </linearGradient>
        </defs>
        <ellipse cx="190" cy="138" rx="150" ry="7" fill="#000" opacity="0.35"/>
        <path d="M14 96 C52 70 150 50 250 52 C318 54 346 80 342 102 C338 124 296 134 226 133 C140 132 60 120 14 96 Z" fill="url(#sk-body)" stroke="#6f8fd6" stroke-width="1.2"/>
        <path d="M60 84 C110 66 190 58 262 62" fill="none" stroke="#ffffff" stroke-opacity="0.22" stroke-width="3" stroke-linecap="round"/>
        <path d="M262 56 L270 30 L310 30 L318 58 Z" fill="#b9bec6" stroke="#7d828b" stroke-width="1.2"/>
        <path d="M270 38 h40 M268 46 h44" stroke="#7d828b" stroke-width="1"/>
        <path d="M273 30 C276 12 284 4 290 4 C296 4 304 12 307 30 Z" fill="#2f57ad" stroke="#6f8fd6" stroke-width="1.2"/>
        ${holes}
      </svg>`;
  }

  private keyboardSketch(): string {
    const key = (code: string, x: number, y: number, w: number, label: string) => {
      const owner = this.ownerOf(code);
      return `
        <g class="sketch-key ${owner ? 'is-mapped' : ''}" ${owner ? `data-k="${owner.key}" style="--key:${owner.color}"` : ''}>
          <rect x="${x}" y="${y}" width="${w}" height="30" rx="5"/>
          <text x="${x + w / 2}" y="${y + 20}" text-anchor="middle">${label}</text>
        </g>`;
    };
    const rows = KEY_ROWS.map((row) =>
      row.codes.map((c, i) => key(c, row.x + i * 34, row.y, 30, SHORT_LABEL[c] ?? formatKeyCode(c))).join('')
    ).join('');
    const space = key('Space', 105, 102, 170, 'Space');
    const arrows = ARROWS.map((a) => key(a.code, a.x, a.y, 30, a.label)).join('');
    return `<svg class="sketch-keyboard" viewBox="-4 -4 480 140" role="img" aria-hidden="true">${rows}${space}${arrows}</svg>`;
  }
}

const BREATH_COLOR = '#9fd8e8';

/** Where each hole sits on the 2D sketch (same arrangement as the 3D ocarina). */
const SKETCH_HOLES: Record<HoleId, { x: number; y: number; r: number }> = {
  'hole-a': { x: 112, y: 100, r: 9 },
  'hole-down': { x: 172, y: 104, r: 9.5 },
  'hole-right': { x: 232, y: 100, r: 9.5 },
  'hole-up': { x: 142, y: 72, r: 8.5 },
  'hole-left': { x: 202, y: 72, r: 8.5 },
};

const KEY_ROWS: Array<{ y: number; x: number; codes: string[] }> = [
  { y: 0, x: 0, codes: ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP'] },
  { y: 34, x: 10, codes: ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon'] },
  { y: 68, x: 27, codes: ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period'] },
];
const ARROWS: Array<{ code: string; x: number; y: number; label: string }> = [
  { code: 'ArrowUp', x: 404, y: 68, label: '↑' },
  { code: 'ArrowLeft', x: 370, y: 102, label: '←' },
  { code: 'ArrowDown', x: 404, y: 102, label: '↓' },
  { code: 'ArrowRight', x: 438, y: 102, label: '→' },
];

const SHORT_LABEL: Record<string, string> = { Semicolon: ';', Comma: ',', Period: '.' };
