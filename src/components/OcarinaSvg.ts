import * as THREE from 'three';
import { CSS3DObject, CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import { HOLE_MAP, HoleId, KeyMapping, OCARINA_HOLES, PitchBend } from '../types';
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
  emblemColor: string;
  holeRim: string;
  holeFill: string;
  glowColor: string;
}

export const DEFAULT_OCARINA_THEME: OcarinaTheme = {
  id: 'royal-sapphire',
  name: 'Royal Sapphire',
  description: 'Deep sapphire glazed ceramic with silver collar & wind-star crest.',
  bodyPrimary: '#2463cc',
  bodySecondary: '#0e2963',
  bodyStroke: '#8ec5ff',
  bandColor: '#dce6f5',
  bandAccent: '#f2c94c',
  emblemColor: '#f2c94c',
  holeRim: '#d7e3f7',
  holeFill: '#071124',
  glowColor: '#00d2ff',
};

export interface OcarinaSvgCallbacks {
  onHoleDown: (holeId: HoleId) => void;
  onHoleUp: (holeId: HoleId) => void;
  onBlowDown: () => void;
  onBlowUp: () => void;
  onPitchBendChange?: (bend: PitchBend) => void;
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
  private customSkinName = 'Custom Ocarina';
  private hideKeyBadges = false;
  private activeHoles = new Set<HoleId>();
  private isBlowing = false;
  private pitchBend: PitchBend = 'normal';
  private activePointers = new Map<number, HoleId | 'blow' | 'pitch-up' | 'pitch-down'>();

  // Three.js CSS3DRenderer 3D scene state
  private scene3d: THREE.Scene | null = null;
  private camera3d: THREE.PerspectiveCamera | null = null;
  private renderer3d: CSS3DRenderer | null = null;
  private ocarinaObj3d: CSS3DObject | null = null;
  private raf3d: number | null = null;
  private resizeObs: ResizeObserver | null = null;
  private targetRotX = 0.06;
  private targetRotY = 0;
  private missFlickUntil = 0;

  constructor(container: HTMLElement, keyMapping: KeyMapping, callbacks: OcarinaSvgCallbacks) {
    this.container = container;
    this.keyMapping = keyMapping;
    this.callbacks = callbacks;
    this.render();
  }

  destroy(): void {
    this.cleanup3d();
  }

  private cleanup3d(): void {
    if (this.raf3d !== null) {
      cancelAnimationFrame(this.raf3d);
      this.raf3d = null;
    }
    this.resizeObs?.disconnect();
    this.resizeObs = null;
    this.renderer3d = null;
    this.scene3d = null;
    this.camera3d = null;
    this.ocarinaObj3d = null;
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

  setCustomSvg(svgMarkup: string, name = 'Custom Ocarina'): void {
    this.customSvg = svgMarkup;
    this.customSkinName = name;
    this.render();
  }

  setZoomed(zoomed: boolean): void {
    const wrapper = this.container.querySelector('.ocarina-svg-wrapper');
    wrapper?.classList.toggle('is-zoomed', zoomed);
  }

  /**
   * Triggers a side-to-side 3D axis vibration/flick when the player misses notes in Arcade Mode.
   */
  triggerMissFlick(): void {
    this.missFlickUntil = performance.now() + 340;
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

  /** Marks one hole as the next one to play (tutorial guidance); null clears it. */
  setHoleHint(holeId: HoleId | null): void {
    this.container.querySelectorAll('[data-hole].is-hint').forEach((el) => el.classList.remove('is-hint'));
    if (holeId) this.container.querySelector(`[data-hole="${holeId}"]`)?.classList.add('is-hint');
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

  setPitchBend(bend: PitchBend): void {
    this.pitchBend = bend;
    this.container.querySelector('[data-pitch="up"]')?.classList.toggle('is-active', bend === 'up');
    this.container.querySelector('[data-pitch="down"]')?.classList.toggle('is-active', bend === 'down');
    this.updateNoteReadout();
  }

  private updateNoteReadout(): void {
    const readout = this.container.querySelector('#ocarina-live-note');
    if (!readout) return;
    const activeList = Array.from(this.activeHoles);
    if (activeList.length > 0) {
      const labels = activeList.map((id) => `${HOLE_MAP[id].ootButton}(${HOLE_MAP[id].noteName})`);
      readout.textContent = labels.join(' + ');
      const last = activeList[activeList.length - 1];
      (readout as HTMLElement).style.color = HOLE_MAP[last].color;
    } else if (this.isBlowing) {
      readout.textContent = 'BLOWING AIR';
      (readout as HTMLElement).style.color = '#00d2ff';
    } else {
      readout.textContent = 'READY';
      (readout as HTMLElement).style.color = 'var(--text-muted)';
    }
  }

  render(): void {
    this.cleanup3d();
    const showBadges = !this.hideKeyBadges && !isTouchPrimaryDevice();
    const t = this.theme;

    const holePositions: Record<HoleId, { cx: number; cy: number; r: number }> = {
      'hole-a': { cx: 248, cy: 222, r: 24 },
      'hole-down': { cx: 320, cy: 242, r: 22 },
      'hole-right': { cx: 396, cy: 214, r: 22 },
      'hole-left': { cx: 312, cy: 174, r: 22 },
      'hole-up': { cx: 382, cy: 152, r: 21 },
    };

    const builtInSvg = `
      <svg class="ocarina-svg" viewBox="0 0 640 340" role="group" aria-label="Interactive Transverse Ocarina">
        <defs>
          <radialGradient id="oc-body-grad" cx="55%" cy="38%" r="65%">
            <stop offset="0%" stop-color="${t.bodyPrimary}" />
            <stop offset="68%" stop-color="${t.bodySecondary}" />
            <stop offset="100%" stop-color="#050a18" />
          </radialGradient>
          <linearGradient id="oc-mouth-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="${t.bodySecondary}" />
            <stop offset="45%" stop-color="${t.bodyPrimary}" />
            <stop offset="100%" stop-color="${t.bodySecondary}" />
          </linearGradient>
          <linearGradient id="oc-band-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#94a3b8" />
            <stop offset="35%" stop-color="#ffffff" />
            <stop offset="65%" stop-color="${t.bandColor}" />
            <stop offset="100%" stop-color="#64748b" />
          </linearGradient>
          <filter id="oc-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <!-- Soft Drop Shadow -->
        <ellipse cx="325" cy="306" rx="205" ry="20" fill="rgba(0,0,0,0.45)" />

        <!-- Airflow Particles (top mouthpiece, visible when blowing) -->
        <g id="ocarina-airflow" class="ocarina-airflow">
          <path d="M 380 28 Q 395 10 412 24" stroke="${t.glowColor}" stroke-width="3" fill="none" stroke-linecap="round" stroke-dasharray="6 6" />
          <path d="M 405 18 Q 422 6 435 26" stroke="#ffffff" stroke-width="2" fill="none" stroke-linecap="round" stroke-dasharray="5 8" />
          <circle cx="372" cy="32" r="3" fill="${t.glowColor}" />
          <circle cx="428" cy="32" r="2.5" fill="#f2c94c" />
        </g>

        <!-- Perpendicular / Angled Transverse Mouthpiece (top-right neck) -->
        <path d="M 382 44 C 386 32, 412 32, 416 44 L 434 114 L 364 114 Z"
              fill="url(#oc-mouth-grad)" stroke="${t.bodyStroke}" stroke-width="2.2" />
        <ellipse cx="399" cy="42" rx="16" ry="5" fill="#060d1f" stroke="${t.bandAccent}" stroke-width="1.6" />

        <!-- Metallic Collar Band around Mouthpiece Neck -->
        <path d="M 358 96 C 382 90, 416 90, 440 96 L 452 132 C 418 124, 380 124, 346 132 Z"
              fill="url(#oc-band-grad)" stroke="${t.bandAccent}" stroke-width="1.8" />

        <!-- Original Wind-Star Crest on Collar -->
        <g transform="translate(399, 111)" filter="url(#oc-glow)">
          <polygon points="0,-11 3.5,-3.5 11,0 3.5,3.5 0,11 -3.5,3.5 -11,0 -3.5,-3.5" fill="${t.emblemColor}" />
          <circle cx="0" cy="0" r="3" fill="#ffffff" opacity="0.85" />
        </g>

        <!-- Main Realistic Sweet-Potato Transverse Ocarina Body -->
        <path d="M 102 226
                 C 138 176, 232 132, 346 126
                 C 418 122, 492 142, 514 196
                 C 532 242, 494 286, 414 294
                 C 314 304, 182 284, 108 244
                 C 94 236, 94 232, 102 226 Z"
              fill="url(#oc-body-grad)" stroke="${t.bodyStroke}" stroke-width="3" />

        <!-- Ceramic Specular Gloss Highlight -->
        <path d="M 164 194 C 228 158, 304 146, 356 146"
              stroke="rgba(255,255,255,0.28)" stroke-width="7" stroke-linecap="round" fill="none" />
        <path d="M 442 158 C 474 170, 494 192, 496 218"
              stroke="rgba(255,255,255,0.2)" stroke-width="6" stroke-linecap="round" fill="none" />

        <!-- Decorative Small Acoustic Sub-Holes -->
        <circle cx="176" cy="222" r="8" fill="${t.holeFill}" stroke="${t.holeRim}" stroke-width="1.8" opacity="0.85" />
        <circle cx="446" cy="238" r="9" fill="${t.holeFill}" stroke="${t.holeRim}" stroke-width="1.8" opacity="0.85" />
        <circle cx="468" cy="206" r="7.5" fill="${t.holeFill}" stroke="${t.holeRim}" stroke-width="1.8" opacity="0.85" />

        <!-- 2 Pitch-Bend Control Buttons on RIGHT Side of Ocarina -->
        <g class="ocarina-pitch-btn ${this.pitchBend === 'up' ? 'is-active' : ''}" data-pitch="up" role="button" tabindex="0" aria-label="Pitch Bend Up (+1 semitone)">
          <rect x="556" y="136" width="56" height="44" rx="12" fill="#0b1633" stroke="#4ade80" stroke-width="2.5" />
          <text x="584" y="156" text-anchor="middle" fill="#4ade80" font-size="14" font-weight="800">▲ +1</text>
          <text x="584" y="172" text-anchor="middle" fill="#a6b4d0" font-size="9.5" font-weight="700">${showBadges ? formatKeyCode(this.keyMapping.pitchUp) : 'PITCH'}</text>
        </g>
        <g class="ocarina-pitch-btn ${this.pitchBend === 'down' ? 'is-active' : ''}" data-pitch="down" role="button" tabindex="0" aria-label="Pitch Bend Down (-1 semitone)">
          <rect x="556" y="190" width="56" height="44" rx="12" fill="#0b1633" stroke="#f87171" stroke-width="2.5" />
          <text x="584" y="210" text-anchor="middle" fill="#f87171" font-size="14" font-weight="800">▼ -1</text>
          <text x="584" y="226" text-anchor="middle" fill="#a6b4d0" font-size="9.5" font-weight="700">${showBadges ? formatKeyCode(this.keyMapping.pitchDown) : 'PITCH'}</text>
        </g>

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
              <circle class="hole-rim" cx="${pos.cx}" cy="${pos.cy}" r="${pos.r + 3.5}" fill="${t.holeRim}" />
              <circle class="hole-core" cx="${pos.cx}" cy="${pos.cy}" r="${pos.r}" fill="${t.holeFill}" stroke="${hole.color}" stroke-width="3.2" />
              <text class="hole-note-label" x="${pos.cx}" y="${pos.cy + 4}" text-anchor="middle" fill="#ffffff" font-size="13" font-weight="800">${hole.ootButton}</text>
              ${
                showBadges
                  ? `<g class="hole-key-badge" transform="translate(${pos.cx}, ${pos.cy + pos.r + 16})">
                       <rect x="-14" y="-9" width="28" height="17" rx="5" fill="#0b1021" stroke="${hole.color}" stroke-width="1.5" />
                       <text x="0" y="3" text-anchor="middle" fill="#f7f1e3" font-size="10" font-weight="800">${keyLabel}</text>
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
          <span class="ocarina-skin-pill" id="ocarina-skin-pill">${this.customSvg ? this.customSkinName : t.name}</span>
        </div>

        <div class="ocarina-svg-wrapper" id="ocarina-3d-host">
          ${this.customSvg ? this.customSvg : builtInSvg}
        </div>

        <div class="ocarina-blow-dock">
          <button type="button" id="ocarina-blow-btn" class="blow-air-btn" aria-label="Blow Air">
            <span class="blow-icon"></span>
            <span>BLOW AIR</span>
            ${showBadges ? `<kbd class="blow-kbd">${blowKeyLabel}</kbd>` : ''}
          </button>
        </div>
      </div>
    `;

    this.init3dScene();
    this.bindInteractions();
  }

  private init3dScene(): void {
    const host = this.container.querySelector<HTMLElement>('#ocarina-3d-host');
    const svg = host?.querySelector<SVGSVGElement>('.ocarina-svg');
    if (!host || !svg) return;

    const w = Math.max(300, host.clientWidth || 560);
    const h = Math.max(180, host.clientHeight || Math.round(w * (340 / 640)));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, w / h, 1, 3000);
    const dist = (h / 2) / Math.tan((32 * Math.PI) / 360);
    camera.position.set(0, 0, dist);

    const renderer = new CSS3DRenderer();
    renderer.setSize(w, h);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';

    // Wrap the interactive SVG inside a CSS3DObject preserving exact size & aspect ratio
    const card = document.createElement('div');
    card.style.width = `${w}px`;
    card.style.height = `${h}px`;
    card.style.display = 'flex';
    card.style.alignItems = 'center';
    card.style.justifyContent = 'center';
    svg.style.width = '100%';
    svg.style.height = '100%';
    card.appendChild(svg);

    const obj = new CSS3DObject(card);
    scene.add(obj);
    host.innerHTML = '';
    host.appendChild(renderer.domElement);

    this.scene3d = scene;
    this.camera3d = camera;
    this.renderer3d = renderer;
    this.ocarinaObj3d = obj;

    host.addEventListener('pointermove', (e) => {
      const r = host.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      const nx = (e.clientX - r.left) / r.width - 0.5;
      const ny = (e.clientY - r.top) / r.height - 0.5;
      this.targetRotY = nx * 0.16;
      this.targetRotX = 0.06 - ny * 0.12;
    });

    host.addEventListener('pointerleave', () => {
      this.targetRotX = 0.06;
      this.targetRotY = 0;
    });

    this.resizeObs = new ResizeObserver(() => {
      if (!this.renderer3d || !this.camera3d || !this.ocarinaObj3d) return;
      const nw = Math.max(260, host.clientWidth);
      const nh = Math.max(160, host.clientHeight || Math.round(nw * (340 / 640)));
      this.renderer3d.setSize(nw, nh);
      this.camera3d.aspect = nw / nh;
      this.camera3d.position.z = (nh / 2) / Math.tan((32 * Math.PI) / 360);
      this.camera3d.updateProjectionMatrix();
      card.style.width = `${nw}px`;
      card.style.height = `${nh}px`;
    });
    this.resizeObs.observe(host);

    const animate = () => {
      if (!this.renderer3d || !this.scene3d || !this.camera3d || !this.ocarinaObj3d) return;
      const now = performance.now();
      let flickY = 0;
      let flickZ = 0;
      if (now < this.missFlickUntil) {
        const rem = (this.missFlickUntil - now) / 340;
        const osc = Math.sin(now * 0.065);
        flickY = osc * 0.28 * rem;
        flickZ = osc * 0.09 * rem;
      }

      this.ocarinaObj3d.rotation.x += (this.targetRotX - this.ocarinaObj3d.rotation.x) * 0.14;
      this.ocarinaObj3d.rotation.y += (this.targetRotY + flickY - this.ocarinaObj3d.rotation.y) * 0.22;
      this.ocarinaObj3d.rotation.z += (flickZ - this.ocarinaObj3d.rotation.z) * 0.25;

      this.renderer3d.render(this.scene3d, this.camera3d);
      this.raf3d = requestAnimationFrame(animate);
    };
    this.raf3d = requestAnimationFrame(animate);
  }

  private bindInteractions(): void {
    const holeEls = this.container.querySelectorAll<SVGGElement>('[data-hole]');
    holeEls.forEach((el) => {
      const holeId = el.dataset.hole as HoleId;

      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          // Ignore if unsupported
        }
        if (this.activePointers.get(e.pointerId) === holeId) return;
        this.activePointers.set(e.pointerId, holeId);
        this.callbacks.onHoleDown(holeId);
      });

      const release = (e: PointerEvent) => {
        if (this.activePointers.get(e.pointerId) !== holeId) return;
        this.activePointers.delete(e.pointerId);
        this.callbacks.onHoleUp(holeId);
      };

      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('lostpointercapture', release);

      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.callbacks.onHoleDown(holeId);
        }
      });
      el.addEventListener('keyup', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          this.callbacks.onHoleUp(holeId);
        }
      });
    });

    const blowBtn = this.container.querySelector<HTMLButtonElement>('#ocarina-blow-btn');
    if (blowBtn) {
      blowBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        try {
          blowBtn.setPointerCapture(e.pointerId);
        } catch {
          // Ignore
        }
        this.activePointers.set(e.pointerId, 'blow');
        this.callbacks.onBlowDown();
      });

      const releaseBlow = (e: PointerEvent) => {
        if (this.activePointers.get(e.pointerId) !== 'blow') return;
        this.activePointers.delete(e.pointerId);
        this.callbacks.onBlowUp();
      };

      blowBtn.addEventListener('pointerup', releaseBlow);
      blowBtn.addEventListener('pointercancel', releaseBlow);
      blowBtn.addEventListener('lostpointercapture', releaseBlow);
    }

    this.container.querySelectorAll<SVGGElement>('[data-pitch]').forEach((el) => {
      const dir = el.dataset.pitch as 'up' | 'down';
      const pointerKey = dir === 'up' ? 'pitch-up' : 'pitch-down';

      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          // Ignore
        }
        this.activePointers.set(e.pointerId, pointerKey);
        this.setPitchBend(dir);
        this.callbacks.onPitchBendChange?.(dir);
      });

      const releasePitch = (e: PointerEvent) => {
        if (this.activePointers.get(e.pointerId) !== pointerKey) return;
        this.activePointers.delete(e.pointerId);
        this.setPitchBend('normal');
        this.callbacks.onPitchBendChange?.('normal');
      };

      el.addEventListener('pointerup', releasePitch);
      el.addEventListener('pointercancel', releasePitch);
      el.addEventListener('lostpointercapture', releasePitch);
    });
  }
}
