import { HOLE_MAP, HoleId, KeyMapping, OCARINA_HOLES } from '../types';
import { formatKeyCode } from '../storage/persistence';

export interface OcarinaTheme {
  id: string;
  name: string;
  description: string;
  bodyPrimary: string;
  bodySecondary: string;
  bodyStroke: string;
  bandColor: string;
  bandAccent: string;
  triforceColor: string;
  holeRim: string;
  holeFill: string;
  glowColor: string;
}

export const DEFAULT_OCARINA_THEME: OcarinaTheme = {
  id: 'ocarina-of-time',
  name: 'Ocarina of Time',
  description: 'Royal Hyrule sapphire ceramic with silver-gold Triforce band.',
  bodyPrimary: '#1e56b5',
  bodySecondary: '#0f2d6b',
  bodyStroke: '#7fb3ff',
  bandColor: '#dce6f5',
  bandAccent: '#f2c94c',
  triforceColor: '#f2c94c',
  holeRim: '#f2c94c',
  holeFill: '#081226',
  glowColor: '#00d2ff',
};

export interface OcarinaSvgCallbacks {
  onHoleDown: (holeId: HoleId) => void;
  onHoleUp: (holeId: HoleId) => void;
  onBlowDown: () => void;
  onBlowUp: () => void;
}

export function isTouchPrimaryDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const fine = window.matchMedia?.('(pointer: fine)').matches ?? false;
  return coarse && !fine;
}

export class OcarinaSvgController {
  private container: HTMLElement;
  private callbacks: OcarinaSvgCallbacks;
  private keyMapping: KeyMapping;
  private theme: OcarinaTheme = DEFAULT_OCARINA_THEME;
  private customSvg: string | null = null;
  private hideKeyBadges = false;
  private activeHoles = new Set<HoleId>();
  private isBlowing = false;
  private activePointers = new Map<number, HoleId | 'blow'>();

  constructor(container: HTMLElement, keyMapping: KeyMapping, callbacks: OcarinaSvgCallbacks) {
    this.container = container;
    this.keyMapping = keyMapping;
    this.callbacks = callbacks;
    this.render();
  }

  setKeyMapping(mapping: KeyMapping): void {
    this.keyMapping = mapping;
    this.render();
  }

  setHideKeyBadges(forceHide: boolean): void {
    this.hideKeyBadges = forceHide;
    this.render();
  }

  setTheme(theme: OcarinaTheme): void {
    this.theme = theme;
    this.customSvg = null;
    this.render();
  }

  setCustomSvg(svgMarkup: string): void {
    this.customSvg = svgMarkup;
    this.render();
  }

  setHoleActive(holeId: HoleId, active: boolean): void {
    if (active) this.activeHoles.add(holeId);
    else this.activeHoles.delete(holeId);

    const el = this.container.querySelector(`[data-hole="${holeId}"]`);
    if (el) {
      el.classList.toggle('is-active', active);
    }
    this.updateNoteReadout();
  }

  setBlowActive(active: boolean): void {
    this.isBlowing = active;
    const blowBtn = this.container.querySelector('#ocarina-blow-btn');
    const windStream = this.container.querySelector('#ocarina-airflow');
    const svgRoot = this.container.querySelector('.ocarina-svg');
    blowBtn?.classList.toggle('is-blowing', active);
    windStream?.classList.toggle('is-blowing', active);
    svgRoot?.classList.toggle('is-blowing', active);
    this.updateNoteReadout();
  }

  private updateNoteReadout(): void {
    const readout = this.container.querySelector('#ocarina-live-note');
    if (!readout) return;
    const activeList = Array.from(this.activeHoles);
    if (activeList.length > 0) {
      const last = activeList[activeList.length - 1];
      const meta = HOLE_MAP[last];
      readout.textContent = `${meta.ootButton} · ${meta.noteName}`;
      (readout as HTMLElement).style.color = meta.color;
    } else if (this.isBlowing) {
      readout.textContent = 'BLOWING AIR';
      (readout as HTMLElement).style.color = '#00d2ff';
    } else {
      readout.textContent = 'READY';
      (readout as HTMLElement).style.color = 'var(--text-muted)';
    }
  }

  render(): void {
    const showBadges = !this.hideKeyBadges && !isTouchPrimaryDevice();
    const t = this.theme;

    const holePositions: Record<HoleId, { cx: number; cy: number; r: number }> = {
      'hole-a': { cx: 295, cy: 200, r: 24 },
      'hole-down': { cx: 368, cy: 222, r: 22 },
      'hole-right': { cx: 438, cy: 186, r: 22 },
      'hole-left': { cx: 356, cy: 146, r: 22 },
      'hole-up': { cx: 422, cy: 118, r: 21 },
    };

    const builtInSvg = `
      <svg class="ocarina-svg" viewBox="0 0 640 340" role="group" aria-label="Interactive Legend of Zelda Ocarina">
        <defs>
          <radialGradient id="oc-body-grad" cx="42%" cy="34%" r="68%">
            <stop offset="0%" stop-color="${t.bodyPrimary}" />
            <stop offset="72%" stop-color="${t.bodySecondary}" />
            <stop offset="100%" stop-color="#060c1f" />
          </radialGradient>
          <linearGradient id="oc-band-grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#ffffff" stop-opacity="0.95" />
            <stop offset="50%" stop-color="${t.bandColor}" />
            <stop offset="100%" stop-color="#8b9ab8" />
          </linearGradient>
          <filter id="oc-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <!-- Drop Shadow -->
        <ellipse cx="340" cy="285" rx="220" ry="26" fill="rgba(0,0,0,0.45)" />

        <!-- Airflow Particles (visible when blowing) -->
        <g id="ocarina-airflow" class="ocarina-airflow">
          <path d="M 45 205 Q 85 185 120 205" stroke="${t.glowColor}" stroke-width="3" fill="none" stroke-linecap="round" stroke-dasharray="8 8" />
          <path d="M 30 225 Q 75 215 112 224" stroke="#ffffff" stroke-width="2" fill="none" stroke-linecap="round" stroke-dasharray="6 10" />
          <circle cx="52" cy="196" r="3" fill="${t.glowColor}" />
          <circle cx="72" cy="232" r="2.5" fill="#f2c94c" />
        </g>

        <!-- Mouthpiece -->
        <path d="M 102 204 L 188 184 L 204 236 L 114 252 C 102 254 94 242 94 228 C 94 214 96 206 102 204 Z"
              fill="url(#oc-body-grad)" stroke="${t.bodyStroke}" stroke-width="2.5" />
        <ellipse cx="104" cy="228" rx="9" ry="22" fill="#071024" stroke="${t.bandAccent}" stroke-width="2" />

        <!-- Main Sweet-Potato Ocarina Body -->
        <path d="M 176 176
                 C 210 100, 320 68, 435 80
                 C 515 88, 566 130, 562 178
                 C 558 225, 498 264, 415 270
                 C 320 278, 224 264, 180 232
                 C 164 220, 166 196, 176 176 Z"
              fill="url(#oc-body-grad)" stroke="${t.bodyStroke}" stroke-width="3" />

        <!-- Specular Ceramic Highlight -->
        <path d="M 220 126 C 280 95, 385 88, 468 102"
              stroke="rgba(255,255,255,0.28)" stroke-width="8" stroke-linecap="round" fill="none" />

        <!-- Decorative Metallic Band -->
        <path d="M 206 132 C 218 168, 220 218, 206 248 L 228 256 C 242 222, 240 166, 228 122 Z"
              fill="url(#oc-band-grad)" stroke="${t.bandAccent}" stroke-width="1.8" />

        <!-- Triforce Emblem on Band -->
        <g transform="translate(217, 190)" filter="url(#oc-glow)">
          <polygon points="0,-16 -9,0 9,0" fill="${t.triforceColor}" />
          <polygon points="-9,0 -18,16 0,16" fill="${t.triforceColor}" />
          <polygon points="9,0 0,16 18,16" fill="${t.triforceColor}" />
        </g>

        <!-- Small Acoustic Vent Holes (decorative) -->
        <circle cx="496" cy="148" r="7" fill="${t.holeFill}" stroke="${t.holeRim}" stroke-width="1.5" opacity="0.85" />
        <circle cx="516" cy="170" r="6" fill="${t.holeFill}" stroke="${t.holeRim}" stroke-width="1.5" opacity="0.85" />

        <!-- 5 Interactive Musical Holes -->
        ${OCARINA_HOLES.map((hole) => {
          const pos = holePositions[hole.id];
          const keyLabel = formatKeyCode(this.keyMapping[hole.id]);
          const isActive = this.activeHoles.has(hole.id);
          return `
            <g class="ocarina-hole ${isActive ? 'is-active' : ''}"
               data-hole="${hole.id}"
               role="button"
               tabindex="0"
               aria-label="${hole.ootButton} (${hole.noteName})${showBadges ? `, Key ${keyLabel}` : ''}">
              <circle class="hole-ripple" cx="${pos.cx}" cy="${pos.cy}" r="${pos.r + 8}" fill="none" stroke="${hole.color}" stroke-width="2.5" />
              <circle class="hole-rim" cx="${pos.cx}" cy="${pos.cy}" r="${pos.r + 3}" fill="${t.holeRim}" />
              <circle class="hole-core" cx="${pos.cx}" cy="${pos.cy}" r="${pos.r}" fill="${t.holeFill}" stroke="${hole.color}" stroke-width="3" />
              <text class="hole-note-label" x="${pos.cx}" y="${pos.cy + 4}" text-anchor="middle" fill="#ffffff" font-size="12" font-weight="800">${hole.ootButton}</text>
              ${
                showBadges
                  ? `<g class="hole-key-badge" transform="translate(${pos.cx}, ${pos.cy + pos.r + 17})">
                       <rect x="-15" y="-10" width="30" height="18" rx="5" fill="#0b1021" stroke="${hole.color}" stroke-width="1.5" />
                       <text x="0" y="3" text-anchor="middle" fill="#f7f1e3" font-size="10.5" font-weight="800">${keyLabel}</text>
                     </g>`
                  : ''
              }
            </g>
          `;
        }).join('')}
      </svg>
    `;

    const blowKeyLabel = formatKeyCode(this.keyMapping.blow);

    this.container.innerHTML = `
      <div class="ocarina-stage-inner">
        <div class="ocarina-status-bar">
          <span class="ocarina-live-badge">
            <span class="live-dot"></span>
            <span id="ocarina-live-note">READY</span>
          </span>
          <span class="ocarina-skin-pill" id="ocarina-skin-pill">${t.name}</span>
        </div>

        <div class="ocarina-svg-wrapper">
          ${this.customSvg ? this.customSvg : builtInSvg}
        </div>

        <div class="ocarina-controls-row">
          <button type="button"
                  id="ocarina-blow-btn"
                  class="blow-air-btn ${this.isBlowing ? 'is-blowing' : ''}"
                  aria-label="Blow Air into Ocarina">
            <span class="blow-icon" aria-hidden="true">💨</span>
            <span class="blow-text">BLOW AIR</span>
            ${showBadges ? `<kbd class="blow-kbd">${blowKeyLabel}</kbd>` : ''}
          </button>
        </div>
      </div>
    `;

    this.attachPointerHandlers();
    this.updateNoteReadout();
  }

  private attachPointerHandlers(): void {
    const holeEls = this.container.querySelectorAll<SVGGElement | HTMLElement>('[data-hole]');
    holeEls.forEach((el) => {
      const holeId = el.getAttribute('data-hole') as HoleId;
      if (!holeId || !HOLE_MAP[holeId]) return;

      el.addEventListener('pointerdown', (e) => {
        const pe = e as PointerEvent;
        pe.preventDefault();
        try {
          (el as Element).setPointerCapture?.(pe.pointerId);
        } catch {
          // Ignore
        }
        this.activePointers.set(pe.pointerId, holeId);
        this.callbacks.onHoleDown(holeId);
      });

      const release = (e: Event) => {
        const pe = e as PointerEvent;
        if (this.activePointers.get(pe.pointerId) === holeId) {
          this.activePointers.delete(pe.pointerId);
          this.callbacks.onHoleUp(holeId);
        }
      };

      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('keydown', (e) => {
        const ke = e as KeyboardEvent;
        if (ke.key === 'Enter') {
          ke.preventDefault();
          this.callbacks.onHoleDown(holeId);
        }
      });
      el.addEventListener('keyup', (e) => {
        const ke = e as KeyboardEvent;
        if (ke.key === 'Enter') {
          this.callbacks.onHoleUp(holeId);
        }
      });
    });

    const blowBtn = this.container.querySelector('#ocarina-blow-btn');
    if (blowBtn) {
      blowBtn.addEventListener('pointerdown', (e) => {
        const pe = e as PointerEvent;
        pe.preventDefault();
        this.activePointers.set(pe.pointerId, 'blow');
        this.callbacks.onBlowDown();
      });
      const releaseBlow = (e: Event) => {
        const pe = e as PointerEvent;
        if (this.activePointers.get(pe.pointerId) === 'blow') {
          this.activePointers.delete(pe.pointerId);
          this.callbacks.onBlowUp();
        }
      };
      blowBtn.addEventListener('pointerup', releaseBlow);
      blowBtn.addEventListener('pointercancel', releaseBlow);
      blowBtn.addEventListener('pointerleave', releaseBlow);
    }
  }
}
