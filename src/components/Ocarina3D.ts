import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { HOLE_MAP, HoleId, KeyMapping, OCARINA_HOLES, PitchBend } from '../types';
import { formatKeyCode } from '../storage/persistence';
import { DEFAULT_OCARINA_THEME, isTouchPrimaryDevice, OcarinaSvgCallbacks, OcarinaTheme } from './OcarinaSvg';

/** Body half-lengths of the ellipsoid the ocarina is sculpted from. */
const A = 2.7; // half-length (x)
const B = 0.82; // half-height (y)
const C = 1.08; // half-depth (z)

/**
 * Hole layout mirrors the keyboard: the lower row J K L sits nearest the player,
 * the upper row U I sits behind it, staggered like the keys themselves.
 */
const HOLE_LAYOUT: Record<HoleId, { x: number; z: number; r: number }> = {
  'hole-a': { x: -1.15, z: 0.34, r: 0.17 },
  'hole-down': { x: -0.15, z: 0.4, r: 0.18 },
  'hole-right': { x: 0.85, z: 0.36, r: 0.18 },
  'hole-up': { x: -0.65, z: -0.12, r: 0.16 },
  'hole-left': { x: 0.35, z: -0.1, r: 0.16 },
};

/** Where the mouthpiece rises from the body (near the rounded end). */
const SPOUT = { x: 1.55, z: -0.2 };

/** Body thickness along its length: rounded head at +x, long pointed tail at -x. */
function taper(x: number): number {
  const t = x / A;
  if (t >= 0) return 1 - 0.12 * t * t;
  const u = -t;
  return Math.max(0.02, 1 - 0.35 * u - 0.45 * u * u);
}

/** Point on the top surface above (x, z), and its outward normal. */
function surfaceAt(x: number, z: number): { pos: THREE.Vector3; normal: THREE.Vector3 } {
  const f = taper(x);
  const b = B * f;
  const c = C * f;
  const k = Math.max(0.02, 1 - (x / A) ** 2 - (z / c) ** 2);
  const y = b * Math.sqrt(k);
  const normal = new THREE.Vector3(x / (A * A), y / (b * b), z / (c * c)).normalize();
  return { pos: new THREE.Vector3(x, y, z), normal };
}

/** Engraved silver band texture for the collar (original knot-work pattern). */
function collarTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#b9bec6';
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = '#6d727b';
  g.lineWidth = 5;
  g.strokeRect(-4, 10, 520, 108);
  g.lineWidth = 4;
  for (let i = 0; i < 16; i++) {
    const x = i * 32;
    g.beginPath();
    g.moveTo(x, 28);
    g.lineTo(x + 16, 28);
    g.lineTo(x + 16, 64);
    g.lineTo(x + 32, 64);
    g.moveTo(x + 8, 100);
    g.lineTo(x + 8, 76);
    g.lineTo(x + 24, 76);
    g.lineTo(x + 24, 100);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface HoleParts {
  group: THREE.Group;
  ring: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  finger: THREE.Mesh;
  hit: THREE.Mesh;
  press: number; // animated 0..1
}

export class Ocarina3DController {
  private container: HTMLElement;
  private callbacks: OcarinaSvgCallbacks;
  private keyMapping: KeyMapping;
  private theme: OcarinaTheme = DEFAULT_OCARINA_THEME;
  private hideKeyBadges = false;
  private activeHoles = new Set<HoleId>();
  private hintHole: HoleId | null = null;
  private isBlowing = false;
  private pitchBend: PitchBend = 'normal';
  private missFlickUntil = 0;
  private activePointers = new Map<number, HoleId | 'pitch-up' | 'pitch-down'>();

  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(28, 2, 0.1, 100);
  private root = new THREE.Group();
  private bodyMat = new THREE.MeshPhysicalMaterial({ roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.5, vertexColors: true, envMapIntensity: 0.3 });
  private tubeMat = new THREE.MeshPhysicalMaterial({ roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.5, envMapIntensity: 0.3 });
  private trimMat = new THREE.MeshStandardMaterial({ roughness: 0.55, envMapIntensity: 0.4 });
  private collarMat = new THREE.MeshStandardMaterial({ map: collarTexture(), metalness: 0.75, roughness: 0.38, side: THREE.DoubleSide });
  private holes = new Map<HoleId, HoleParts>();
  private raycaster = new THREE.Raycaster();
  private badgeEls = new Map<HoleId, HTMLElement>();
  private wrapper: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private raf: number | null = null;
  private resizeObs: ResizeObserver | null = null;
  private lastFrame = performance.now();
  private elapsed = 0;
  private reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  constructor(container: HTMLElement, keyMapping: KeyMapping, callbacks: OcarinaSvgCallbacks) {
    this.container = container;
    this.keyMapping = keyMapping;
    this.callbacks = callbacks;
    this.build();
  }

  // ---------- public API (same surface as OcarinaSvgController) ----------

  destroy(): void {
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.resizeObs?.disconnect();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
    this.scene.environment?.dispose();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.renderer = null;
  }

  setKeyMapping(mapping: KeyMapping): void {
    this.keyMapping = mapping;
    this.renderBadges();
  }

  setHideKeyBadges(forceHide: boolean): void {
    this.hideKeyBadges = forceHide;
    this.renderBadges();
  }

  setTheme(theme: OcarinaTheme): void {
    this.theme = theme;
    this.applyTheme();
  }

  /** Custom SVG skins can't be wrapped around a 3D body; keep the default glaze. */
  setCustomSvg(_svgMarkup: string, _name = 'Custom Ocarina'): void {
    this.theme = DEFAULT_OCARINA_THEME;
    this.applyTheme();
  }

  setZoomed(zoomed: boolean): void {
    this.wrapper?.classList.toggle('is-zoomed', zoomed);
  }

  triggerMissFlick(): void {
    this.missFlickUntil = performance.now() + 340;
  }

  setHoleActive(holeId: HoleId, active: boolean): void {
    if (active) this.activeHoles.add(holeId);
    else this.activeHoles.delete(holeId);
    this.badgeEls.get(holeId)?.classList.toggle('is-active', active);
  }

  setHoleHint(holeId: HoleId | null): void {
    this.hintHole = holeId;
  }

  setBlowActive(active: boolean): void {
    this.isBlowing = active;
  }

  setPitchBend(bend: PitchBend): void {
    this.pitchBend = bend;
    this.container.querySelector('[data-pitch="up"]')?.classList.toggle('is-active', bend === 'up');
    this.container.querySelector('[data-pitch="down"]')?.classList.toggle('is-active', bend === 'down');
  }

  /** Where each hole is on screen right now (client pixels), following zoom and idle motion. */
  getHoleScreenPositions(): Record<HoleId, { x: number; y: number }> | null {
    if (!this.canvas || !this.renderer) return null;
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    this.root.updateMatrixWorld();
    const v = new THREE.Vector3();
    const out = {} as Record<HoleId, { x: number; y: number }>;
    this.holes.forEach((parts, id) => {
      parts.group.getWorldPosition(v);
      v.project(this.camera);
      out[id] = { x: rect.left + (v.x * 0.5 + 0.5) * rect.width, y: rect.top + (-v.y * 0.5 + 0.5) * rect.height };
    });
    return out;
  }

  // ---------- scene ----------

  private build(): void {
    this.container.innerHTML = `
      <div class="ocarina-stage-inner">
        <div class="ocarina-svg-wrapper ocarina-3d" id="ocarina-3d-host">
          <canvas class="ocarina-3d-canvas" aria-label="Ocarina. Five holes; play with the keyboard or by touch." role="img"></canvas>
          <div class="ocarina-3d-badges" aria-hidden="true"></div>
          <div class="ocarina-3d-pitch">
            <button type="button" data-pitch="up" aria-label="Bend pitch up a semitone">+1</button>
            <button type="button" data-pitch="down" aria-label="Bend pitch down a semitone">−1</button>
          </div>
        </div>
      </div>
    `;
    this.wrapper = this.container.querySelector<HTMLElement>('#ocarina-3d-host');
    this.canvas = this.container.querySelector<HTMLCanvasElement>('.ocarina-3d-canvas');
    if (!this.wrapper || !this.canvas) return;

    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    } catch {
      this.wrapper.classList.add('is-no-webgl');
      return;
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.85;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const key = new THREE.DirectionalLight(0xfff1dc, 1.15);
    key.position.set(-3, 6, 4);
    const rim = new THREE.DirectionalLight(0xa8c4ff, 0.9);
    rim.position.set(4, 2, -5);
    this.scene.add(key, rim, new THREE.HemisphereLight(0xcfd8ff, 0x1a1408, 0.2));

    this.camera.position.set(0, 5.4, 4.3);
    this.camera.lookAt(0, -0.1, 0);

    this.root.add(this.buildBody(), this.buildMouthpiece(), this.buildShadow());
    OCARINA_HOLES.forEach((h) => this.root.add(this.buildHole(h.id)));
    this.buildSoundHoles();
    this.root.rotation.set(0.05, -0.08, 0);
    this.scene.add(this.root);

    this.applyTheme();
    this.renderBadges();
    this.bindInteractions();

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(this.wrapper);
    this.resize();
    this.loop();
  }

  private buildBody(): THREE.Mesh {
    const geo = new THREE.SphereGeometry(1, 128, 64);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) * A;
      const f = taper(x);
      let y = pos.getY(i) * B * f;
      const z = pos.getZ(i) * C * f;
      if (y < 0) y *= 0.85;
      pos.setXYZ(i, x, y, z);
      // satin glaze: lighter on top, deeper underneath
      const shade = 0.55 + 0.45 * THREE.MathUtils.clamp(0.5 + pos.getY(i) / (2 * B), 0, 1);
      colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = shade;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, this.bodyMat);
  }

  private buildMouthpiece(): THREE.Group {
    const g = new THREE.Group();
    const collarH = 0.42;
    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.58, collarH, 48, 1, true),
      this.collarMat
    );
    collar.position.y = collarH / 2;
    const capTop = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.4, 0.02, 48),
      new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.75, roughness: 0.4 })
    );
    capTop.position.y = collarH;
    // tapered spout, rounded at the lip
    const profile = [
      new THREE.Vector2(0.38, 0),
      new THREE.Vector2(0.3, 0.3),
      new THREE.Vector2(0.2, 0.62),
      new THREE.Vector2(0.15, 0.76),
      new THREE.Vector2(0.09, 0.82),
      new THREE.Vector2(0.0, 0.84),
    ];
    const spout = new THREE.Mesh(new THREE.LatheGeometry(profile, 48), this.tubeMat);
    spout.position.y = collarH;
    g.add(collar, capTop, spout);
    const { pos } = surfaceAt(SPOUT.x, SPOUT.z);
    g.position.set(SPOUT.x, pos.y - 0.12, SPOUT.z);
    g.rotation.set(-0.12, 0, -0.1);
    return g;
  }

  private buildShadow(): THREE.Mesh {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d')!;
    const grd = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    grd.addColorStop(0, 'rgba(0,0,0,0.55)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 128, 128);
    const mat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 2.6), mat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -0.74;
    return plane;
  }

  private buildHole(id: HoleId): THREE.Group {
    const { x, z, r } = HOLE_LAYOUT[id];
    const { pos, normal } = surfaceAt(x, z);
    const group = new THREE.Group();
    group.position.copy(pos);
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    const color = new THREE.Color(HOLE_MAP[id].color);

    const well = new THREE.Mesh(new THREE.CircleGeometry(r, 40), new THREE.MeshBasicMaterial({ color: 0x07090d }));
    well.rotation.x = -Math.PI / 2;
    well.position.y = 0.012;
    const lip = new THREE.Mesh(
      new THREE.TorusGeometry(r, r * 0.17, 16, 48),
      new THREE.MeshStandardMaterial({ color: 0xd4d8de, metalness: 0.8, roughness: 0.3 })
    );
    lip.rotation.x = Math.PI / 2;
    lip.position.y = 0.01;
    // the hole's own color: a gem ring that is always faintly lit
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(r * 1.42, r * 0.11, 10, 64),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.012;
    const finger = new THREE.Mesh(
      new THREE.SphereGeometry(r * 1.15, 32, 16),
      new THREE.MeshStandardMaterial({ color: 0xd9a587, roughness: 0.62 })
    );
    finger.scale.set(1, 0.45, 1.15);
    finger.visible = false;
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(r * 2.3, r * 2.3, 0.6, 16), new THREE.MeshBasicMaterial({ visible: false }));
    hit.userData.holeId = id;

    group.add(well, lip, ring, finger, hit);
    this.holes.set(id, { group, ring, finger, hit, press: 0 });
    return group;
  }

  /** Small decorative tuning holes near the tail, like a real 12-hole body. */
  private buildSoundHoles(): void {
    [
      { x: -1.95, z: 0.18, r: 0.07 },
      { x: -2.2, z: 0.05, r: 0.05 },
      { x: 1.3, z: 0.5, r: 0.08 },
    ].forEach(({ x, z, r }) => {
      const { pos, normal } = surfaceAt(x, z);
      const m = new THREE.Mesh(new THREE.CircleGeometry(r, 24), new THREE.MeshBasicMaterial({ color: 0x07090d }));
      m.position.copy(pos).addScaledVector(normal, 0.006);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
      this.root.add(m);
    });
  }

  private applyTheme(): void {
    const primary = new THREE.Color(this.theme.bodyPrimary);
    const secondary = new THREE.Color(this.theme.bodySecondary);
    this.bodyMat.color.copy(primary.clone().lerp(secondary, 0.3));
    this.tubeMat.color.copy(this.bodyMat.color);
    this.collarMat.color.set(0xffffff).lerp(new THREE.Color(this.theme.bandColor), 0.3);
    this.trimMat.color.copy(secondary.clone().lerp(new THREE.Color(this.theme.bandColor), 0.35));
  }

  private renderBadges(): void {
    const host = this.container.querySelector<HTMLElement>('.ocarina-3d-badges');
    if (!host) return;
    host.innerHTML = '';
    this.badgeEls.clear();
    if (this.hideKeyBadges || isTouchPrimaryDevice()) return;
    OCARINA_HOLES.forEach((h) => {
      const el = document.createElement('kbd');
      el.textContent = formatKeyCode(this.keyMapping[h.id]);
      host.appendChild(el);
      this.badgeEls.set(h.id, el);
    });
  }

  private resize(): void {
    if (!this.renderer || !this.wrapper) return;
    const w = this.wrapper.clientWidth;
    const h = this.wrapper.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // keep the whole body in frame on narrow screens
    this.camera.fov = w / h < 1.6 ? 28 * (1.6 / (w / h)) ** 0.85 : 28;
    this.camera.updateProjectionMatrix();
  }

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.renderer || document.hidden) return;
    const now = performance.now();
    const dt = Math.min((now - this.lastFrame) / 1000, 0.05);
    this.lastFrame = now;
    this.elapsed += dt;
    const t = this.elapsed;

    // idle breathing + pitch tilt + miss flick
    const idle = this.reducedMotion ? 0 : 1;
    const bendTilt = this.pitchBend === 'up' ? -0.07 : this.pitchBend === 'down' ? 0.07 : 0;
    const flick = now < this.missFlickUntil ? Math.sin(now / 22) * 0.06 : 0;
    this.root.position.y = idle * Math.sin(t * 1.1) * 0.04;
    this.root.rotation.x += (0.05 + bendTilt - this.root.rotation.x) * Math.min(1, dt * 10);
    this.root.rotation.z = idle * Math.sin(t * 0.7) * 0.015 + flick;
    this.root.rotation.y = -0.08 + idle * Math.sin(t * 0.45) * 0.03 + flick;

    const pulse = 0.5 + 0.5 * Math.sin(t * 4.5);
    this.holes.forEach((parts, id) => {
      const target = this.activeHoles.has(id) ? 1 : 0;
      parts.press += (target - parts.press) * Math.min(1, dt * 22);
      parts.finger.visible = parts.press > 0.02;
      parts.finger.position.y = 0.16 - 0.12 * parts.press;
      parts.finger.scale.setScalar(0.6 + 0.4 * parts.press).multiply(new THREE.Vector3(1, 0.45, 1.15));
      const hinted = this.hintHole === id && !this.activeHoles.has(id);
      parts.ring.material.opacity = hinted ? 0.35 + 0.65 * pulse : 0.5 + 0.5 * parts.press;
      parts.ring.scale.setScalar(1 + 0.12 * parts.press);
    });
    this.trimMat.emissive.setRGB(this.isBlowing ? 0.08 : 0, this.isBlowing ? 0.1 : 0, this.isBlowing ? 0.12 : 0);

    this.renderer.render(this.scene, this.camera);
    this.placeBadges();
  };

  private placeBadges(): void {
    if (!this.badgeEls.size || !this.wrapper) return;
    const w = this.wrapper.clientWidth;
    const h = this.wrapper.clientHeight;
    const v = new THREE.Vector3();
    this.badgeEls.forEach((el, id) => {
      const parts = this.holes.get(id)!;
      parts.group.getWorldPosition(v);
      v.project(this.camera);
      const x = (v.x * 0.5 + 0.5) * w;
      const y = (-v.y * 0.5 + 0.5) * h;
      el.style.transform = `translate(${x.toFixed(1)}px, ${(y + 26).toFixed(1)}px) translate(-50%, 0)`;
    });
  }

  // ---------- input ----------

  private pickHole(e: PointerEvent): HoleId | null {
    if (!this.canvas) return null;
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(Array.from(this.holes.values()).map((p) => p.hit), false);
    return (hits[0]?.object.userData.holeId as HoleId) ?? null;
  }

  private bindInteractions(): void {
    const canvas = this.canvas!;
    canvas.addEventListener('pointerdown', (e) => {
      const id = this.pickHole(e);
      if (!id) return;
      e.preventDefault();
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      this.activePointers.set(e.pointerId, id);
      this.callbacks.onHoleDown(id);
    });
    // sliding a finger across holes moves between notes
    canvas.addEventListener('pointermove', (e) => {
      const prev = this.activePointers.get(e.pointerId);
      if (!prev || prev === 'pitch-up' || prev === 'pitch-down') return;
      const id = this.pickHole(e);
      if (id && id !== prev) {
        this.callbacks.onHoleUp(prev);
        this.activePointers.set(e.pointerId, id);
        this.callbacks.onHoleDown(id);
      }
    });
    const release = (e: PointerEvent) => {
      const id = this.activePointers.get(e.pointerId);
      if (!id || id === 'pitch-up' || id === 'pitch-down') return;
      this.activePointers.delete(e.pointerId);
      this.callbacks.onHoleUp(id);
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('lostpointercapture', release);

    this.container.querySelectorAll<HTMLButtonElement>('[data-pitch]').forEach((el) => {
      const dir = el.dataset.pitch as 'up' | 'down';
      const key = dir === 'up' ? 'pitch-up' : 'pitch-down';
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
        this.activePointers.set(e.pointerId, key);
        this.setPitchBend(dir);
        this.callbacks.onPitchBendChange?.(dir);
      });
      const up = (e: PointerEvent) => {
        if (this.activePointers.get(e.pointerId) !== key) return;
        this.activePointers.delete(e.pointerId);
        this.setPitchBend('normal');
        this.callbacks.onPitchBendChange?.('normal');
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('lostpointercapture', up);
    });
  }
}
