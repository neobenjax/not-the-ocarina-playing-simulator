import { icons } from '../../components/icons';
import confetti from 'canvas-confetti';
import {
  AppSettings,
  ArcadeHighScore,
  getBentFrequency,
  HOLE_MAP,
  HoleId,
  KeyMapping,
  PartitureTrack,
  PitchBend,
  Playlist,
} from '../../types';
import { SAMPLE_SONGS } from '../../data/sampleSongs';
import { parsePartitureText } from '../freePlay/partitureFormat';
import { ocarinaSynth } from '../../audio/ocarinaSynth';
import {
  playGameOver,
  playMetronomeTick,
  playStageClear,
  playUiClick,
} from '../../audio/soundMachineSfx';
import { haptics } from '../../haptics/hapticEngine';
import { formatKeyCode } from '../../storage/persistence';
import { calculateArcadeScore, JudgementCounts } from './arcadeScoring';

interface ChartNoteRuntime {
  id: string;
  holeId: HoleId;
  pitchBend: PitchBend;
  targetSec: number;
  durationSec: number;
  judged: boolean;
  guidePlayed: boolean;
}

interface PoppingNote {
  holeId: HoleId;
  pitchBend: PitchBend;
  hitPerf: number;
  color: string;
  label: string;
}

interface ActiveSustain {
  note: ChartNoteRuntime;
  lastTickSec: number;
  lastSparkPerf: number;
  color: string;
}

type JudgementType = 'GOOD' | 'OKAY' | 'BAD';
export type ArcadePhase = 'select' | 'playing' | 'results' | 'gameover';

const LANES_TOP_TO_BOTTOM: HoleId[] = ['hole-up', 'hole-left', 'hole-right', 'hole-down', 'hole-a'];


export class ArcadeMode {
  private container: HTMLElement;
  private settings: AppSettings;
  private keyMapping: KeyMapping;
  private playlists: Playlist[];
  private highScores: Record<string, ArcadeHighScore>;
  private importedSongs: PartitureTrack[] = [];

  private activeCategoryIdx = 0;
  private selectedSong: PartitureTrack;
  private phase: ArcadePhase = 'select';

  private rafId: number | null = null;
  private songStartPerf = 0;
  private leadInSec = 3.0;
  private countdownZoomApplied = false;
  private isPaused = false;
  private pauseStartedPerf = 0;
  private hitstopUntilPerf = 0;
  private frozenSongSec = 0;

  private chartNotes: ChartNoteRuntime[] = [];
  private poppingNotes: PoppingNote[] = [];
  private activeSustains = new Map<HoleId, ActiveSustain>();
  private lastBeatTick = -1;

  private counts: JudgementCounts = {
    perfect: 0,
    great: 0,
    good: 0,
    bad: 0,
    miss: 0,
    maxCombo: 0,
    totalNotes: 0,
  };
  private currentCombo = 0;
  private sustainBonusScore = 0;
  private lifeMeter = 50; // 0..100
  private prevBestScore = 0;
  private lastJudgementText = '';
  private lastJudgementColor = '#ffffff';
  private lastJudgementPerf = 0;
  private comboBreakTimer: number | null = null;

  private onSettingsChange: (s: AppSettings) => void;
  private onSaveScore: (score: ArcadeHighScore) => void;
  private onToast: (msg: string) => void;
  private onPhaseChange: (phase: ArcadePhase) => void;
  private onZoomOcarina: (zoomed: boolean) => void;
  private onMissFlick: () => void;
  private getHoleScreenPositions: () => Record<HoleId, { x: number; y: number }> | null;
  private onBackToMenu: () => void;

  constructor(
    container: HTMLElement,
    settings: AppSettings,
    keyMapping: KeyMapping,
    playlists: Playlist[],
    highScores: Record<string, ArcadeHighScore>,
    callbacks: {
      onSettingsChange: (s: AppSettings) => void;
      onSaveScore: (score: ArcadeHighScore) => void;
      onToast: (msg: string) => void;
      onPhaseChange: (phase: ArcadePhase) => void;
      onZoomOcarina: (zoomed: boolean) => void;
      onMissFlick: () => void;
      getHoleScreenPositions?: () => Record<HoleId, { x: number; y: number }> | null;
      onBackToMenu: () => void;
    }
  ) {
    this.container = container;
    this.settings = settings;
    this.keyMapping = keyMapping;
    this.playlists = playlists;
    this.highScores = highScores;
    this.selectedSong = SAMPLE_SONGS[0];
    this.onSettingsChange = callbacks.onSettingsChange;
    this.onSaveScore = callbacks.onSaveScore;
    this.onToast = callbacks.onToast;
    this.onPhaseChange = callbacks.onPhaseChange;
    this.onZoomOcarina = callbacks.onZoomOcarina;
    this.onMissFlick = callbacks.onMissFlick;
    this.getHoleScreenPositions = callbacks.getHoleScreenPositions ?? (() => null);
    this.onBackToMenu = callbacks.onBackToMenu;
    this.onPhaseChange('select');
    this.render();
  }

  destroy(): void {
    this.stopLoop();
    this.activeSustains.clear();
    this.hidePauseOverlay();
    this.clearComboBanner();
    this.onZoomOcarina(false);
  }

  setKeyMapping(mapping: KeyMapping): void {
    this.keyMapping = mapping;
    if (this.phase === 'select') this.render();
  }

  updatePlaylists(playlists: Playlist[]): void {
    this.playlists = playlists;
    if (this.phase === 'select') this.render();
  }

  private getCategories(): Array<{ id: string; name: string; songs: PartitureTrack[] }> {
    const customTracks = [...this.playlists.flatMap((p) => p.tracks), ...this.importedSongs];
    const cats: Array<{ id: string; name: string; songs: PartitureTrack[] }> = [
      { id: 'all', name: 'All Songs', songs: [...SAMPLE_SONGS, ...customTracks] },
      { id: 'sample', name: 'Featured', songs: [...SAMPLE_SONGS] },
    ];
    for (const pl of this.playlists) {
      if (pl.tracks.length > 0) {
        cats.push({ id: pl.id, name: pl.name, songs: pl.tracks });
      }
    }
    if (this.importedSongs.length > 0) {
      cats.push({ id: 'imported', name: 'Imported', songs: this.importedSongs });
    }
    return cats;
  }

  private getActiveSongs(): PartitureTrack[] {
    const cats = this.getCategories();
    if (this.activeCategoryIdx >= cats.length) this.activeCategoryIdx = 0;
    return cats[this.activeCategoryIdx]?.songs ?? SAMPLE_SONGS;
  }

  handleSelectKeyDown(e: KeyboardEvent): boolean {
    if (this.phase !== 'select') return false;

    if (e.code === this.keyMapping.prevCategory) {
      e.preventDefault();
      this.switchCategory(-1);
      return true;
    }
    if (e.code === this.keyMapping.nextCategory) {
      e.preventDefault();
      this.switchCategory(1);
      return true;
    }

    const songs = this.getActiveSongs();
    if (songs.length === 0) return false;

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const idx = Math.max(0, songs.findIndex((s) => s.id === this.selectedSong.id));
      const nextIdx = (idx - 1 + songs.length) % songs.length;
      this.selectedSong = songs[nextIdx];
      playUiClick();
      haptics.tapButton();
      this.render();
      return true;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const idx = Math.max(0, songs.findIndex((s) => s.id === this.selectedSong.id));
      const nextIdx = (idx + 1) % songs.length;
      this.selectedSong = songs[nextIdx];
      playUiClick();
      haptics.tapButton();
      this.render();
      return true;
    }

    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      this.settings.arcadeAssist = this.settings.arcadeAssist === 'novice' ? 'original' : 'novice';
      playUiClick();
      haptics.tapButton();
      this.onSettingsChange({ ...this.settings });
      this.render();
      return true;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      playUiClick();
      haptics.tapButton();
      this.startGame();
      return true;
    }

    return false;
  }

  private switchCategory(delta: number): void {
    const cats = this.getCategories();
    this.activeCategoryIdx = (this.activeCategoryIdx + delta + cats.length) % cats.length;
    const songs = this.getActiveSongs();
    if (songs.length > 0 && !songs.some((s) => s.id === this.selectedSong.id)) {
      this.selectedSong = songs[0];
    }
    playUiClick();
    haptics.tapButton();
    this.render();
  }

  togglePause(): void {
    if (this.phase !== 'playing') return;
    if (this.isPaused) {
      this.resumeGame();
    } else {
      this.pauseGame();
    }
  }

  private pauseGame(): void {
    if (this.isPaused || this.phase !== 'playing') return;
    this.isPaused = true;
    this.pauseStartedPerf = performance.now();
    this.stopLoop();
    ocarinaSynth.stopAllVoices();
    this.activeSustains.clear();
    playUiClick();

    const overlay = document.getElementById('arcade-pause-overlay');
    if (overlay) {
      overlay.innerHTML = `
        <div class="pause-card">
          <p class="arcade-kicker-line">${this.selectedSong.title}</p>
          <h2>Paused</h2>
          <div class="arcade-menu-list">
            <button type="button" class="arcade-menu-item" id="btn-pause-resume">Resume <kbd>Esc</kbd></button>
            <button type="button" class="arcade-menu-item" id="btn-pause-restart">Start over</button>
            <button type="button" class="arcade-menu-item" id="btn-pause-quit">Back to songs</button>
          </div>
        </div>
      `;
      overlay.classList.add('is-active');
      overlay.querySelector('#btn-pause-resume')?.addEventListener('click', () => this.resumeGame());
      overlay.querySelector<HTMLButtonElement>('#btn-pause-resume')?.focus();
      overlay.querySelector('#btn-pause-restart')?.addEventListener('click', () => {
        this.hidePauseOverlay();
        this.startGame();
      });
      overlay.querySelector('#btn-pause-quit')?.addEventListener('click', () => {
        this.hidePauseOverlay();
        this.stopLoop();
        this.setPhase('select');
        this.render();
      });
    }
  }

  private resumeGame(): void {
    if (!this.isPaused || this.phase !== 'playing') return;
    const pausedDur = performance.now() - this.pauseStartedPerf;
    this.songStartPerf += pausedDur;
    this.isPaused = false;
    this.hidePauseOverlay();
    playUiClick();
    this.startLoop();
  }

  private hidePauseOverlay(): void {
    const overlay = document.getElementById('arcade-pause-overlay');
    if (overlay) {
      overlay.classList.remove('is-active');
      overlay.innerHTML = '';
    }
  }

  private fireHitSparks(holeId: HoleId, pitchBend: PitchBend, count = 16): void {
    const canvas = this.container.querySelector<HTMLCanvasElement>('#arcade-highway-canvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (w <= 0 || h <= 0) return;

    const lane = this.laneGeometry(w, h, rect)[holeId];
    const ox = (rect.left + lane.x) / window.innerWidth;
    const oy = (rect.top + lane.y - (pitchBend === 'up' ? 10 : pitchBend === 'down' ? -10 : 0)) / window.innerHeight;
    const color = HOLE_MAP[holeId].color;

    try {
      void confetti({
        particleCount: count,
        spread: 65,
        startVelocity: 24,
        gravity: 0.7,
        ticks: 40,
        scalar: 0.7,
        origin: { x: Math.max(0.02, Math.min(0.98, ox)), y: Math.max(0.02, Math.min(0.98, oy)) },
        colors: [color, '#f2c94c', '#ffffff'],
        disableForReducedMotion: true,
      });
    } catch {
      // Ignore if headless canvas unavailable
    }
  }

  private triggerJuiceShake(): void {
    const topEl = this.container.querySelector<HTMLElement>('.arcade-ingame-top');
    if (!topEl) return;
    topEl.classList.remove('is-juice-shake');
    void topEl.offsetWidth;
    topEl.classList.add('is-juice-shake');
  }

  private updateComboBanner(mode: 'hit' | 'break' | 'reset'): void {
    const el = document.getElementById('arcade-combo-banner');
    if (!el) return;

    if (this.comboBreakTimer !== null) {
      clearTimeout(this.comboBreakTimer);
      this.comboBreakTimer = null;
    }

    if (mode === 'reset') {
      el.className = 'arcade-combo-banner';
      el.innerHTML = '';
      return;
    }

    if (mode === 'break') {
      el.className = 'arcade-combo-banner is-visible is-combo-break';
      this.comboBreakTimer = window.setTimeout(() => {
        el.className = 'arcade-combo-banner';
        el.innerHTML = '';
      }, 420);
      return;
    }

    if (this.currentCombo <= 0) {
      el.className = 'arcade-combo-banner';
      el.innerHTML = '';
      return;
    }

    const isMilestone = this.currentCombo > 0 && this.currentCombo % 10 === 0;
    el.innerHTML = `<span class="combo-num">${this.currentCombo}</span><span class="combo-word">COMBO</span>`;
    el.className = 'arcade-combo-banner is-visible';
    void el.offsetWidth;
    el.classList.add(isMilestone ? 'is-milestone-pop' : 'is-hit-pop');
  }

  private clearComboBanner(): void {
    const el = document.getElementById('arcade-combo-banner');
    if (el) {
      el.className = 'arcade-combo-banner';
      el.innerHTML = '';
    }
  }

  onPlayerInput(holeId: HoleId, pitchBend: PitchBend = 'normal'): boolean {
    if (this.phase !== 'playing' || this.isPaused) return false;

    const nowSec = this.getCurrentSongSec();
    if (nowSec < -0.25) {
      return false;
    }
    const offsetSec = this.settings.offsetMs / 1000;

    let candidate: ChartNoteRuntime | null = null;
    let bestAbsDiff = Infinity;
    for (const n of this.chartNotes) {
      if (n.judged || n.holeId !== holeId || n.pitchBend !== pitchBend) continue;
      const diff = Math.abs(nowSec - (n.targetSec + offsetSec));
      if (diff <= 0.22 && diff < bestAbsDiff) {
        bestAbsDiff = diff;
        candidate = n;
      }
    }

    if (!candidate) {
      let wrongCandidate: ChartNoteRuntime | null = null;
      let wrongDiff = Infinity;
      for (const n of this.chartNotes) {
        if (n.judged) continue;
        const diff = Math.abs(nowSec - (n.targetSec + offsetSec));
        if (diff <= 0.16 && diff < wrongDiff) {
          wrongDiff = diff;
          wrongCandidate = n;
        }
      }
      if (wrongCandidate) {
        wrongCandidate.judged = true;
        this.registerMiss(getBentFrequency(wrongCandidate.holeId, wrongCandidate.pitchBend));
        return true;
      }
      return false;
    }

    candidate.judged = true;
    const msDiff = bestAbsDiff * 1000;
    let j: JudgementType = 'BAD';
    if (msDiff <= 95) j = 'GOOD';
    else if (msDiff <= 165) j = 'OKAY';

    const meta = HOLE_MAP[holeId];
    if (j === 'GOOD') {
      if (msDiff <= 50) this.counts.perfect++;
      else this.counts.great++;
      this.currentCombo++;
      this.lifeMeter = Math.min(100, this.lifeMeter + 4.5);
      haptics.hitPerfect();
      this.setJudgementPopup('GOOD!', '#4ade80');
      // Hitstop (28ms freeze frame) + Particle Burst + Note Pop + Juice Shake
      this.frozenSongSec = nowSec;
      this.hitstopUntilPerf = performance.now() + 28;
      this.fireHitSparks(holeId, candidate.pitchBend, 16);
      this.triggerJuiceShake();
      this.updateComboBanner('hit');
    } else if (j === 'OKAY') {
      this.counts.good++;
      this.currentCombo++;
      this.lifeMeter = Math.min(100, this.lifeMeter + 2);
      haptics.hitGood();
      this.setJudgementPopup('OKAY', '#f2c94c');
      this.fireHitSparks(holeId, candidate.pitchBend, 8);
      this.updateComboBanner('hit');
    } else {
      const hadCombo = this.currentCombo > 0;
      this.counts.bad++;
      this.currentCombo = 0;
      this.lifeMeter = Math.max(0, this.lifeMeter - 5);
      haptics.tapButton();
      this.setJudgementPopup('BAD', '#ff6b35');
      this.onMissFlick();
      if (hadCombo) this.updateComboBanner('break');
    }

    // Popping Note Scale Tween
    this.poppingNotes.push({
      holeId,
      pitchBend: candidate.pitchBend,
      hitPerf: performance.now(),
      color: meta.color,
      label:
        candidate.pitchBend === 'up'
          ? `${meta.ootButton}↑`
          : candidate.pitchBend === 'down'
            ? `${meta.ootButton}↓`
            : meta.ootButton,
    });

    // Long Note Sustain State
    if (candidate.durationSec >= 0.4 && j !== 'BAD') {
      this.activeSustains.set(holeId, {
        note: candidate,
        lastTickSec: nowSec,
        lastSparkPerf: performance.now(),
        color: meta.color,
      });
    }

    if (this.currentCombo > this.counts.maxCombo) {
      this.counts.maxCombo = this.currentCombo;
    }

    const vol = this.settings.masterVolume * this.settings.ocarinaVolume;
    ocarinaSynth.playOneShot(getBentFrequency(holeId, candidate.pitchBend), Math.min(0.75, candidate.durationSec), vol);
    this.updateLiveHud();
    if (this.lifeMeter <= 0) {
      this.triggerGameOver();
    }
    return true;
  }

  onPlayerRelease(holeId: HoleId): void {
    this.activeSustains.delete(holeId);
  }

  private registerMiss(freq: number): void {
    const hadCombo = this.currentCombo > 0;
    this.counts.miss++;
    this.currentCombo = 0;
    this.lifeMeter = Math.max(0, this.lifeMeter - 8);
    ocarinaSynth.playDistortedMiss(freq);
    haptics.miss();
    this.onMissFlick();
    this.setJudgementPopup('BAD!', '#e74c3c');
    if (hadCombo) this.updateComboBanner('break');
    this.updateLiveHud();

    if (this.settings.arcadeAssist === 'novice') {
      // Novice is for learning: the bar can run low but never ends the song
      this.lifeMeter = Math.max(8, this.lifeMeter);
      this.updateLiveHud();
    } else if (this.lifeMeter <= 0) {
      this.triggerGameOver();
    }
  }

  private setJudgementPopup(text: string, color: string): void {
    this.lastJudgementText = text;
    this.lastJudgementColor = color;
    this.lastJudgementPerf = performance.now();
  }

  private getCurrentSongSec(): number {
    if (performance.now() < this.hitstopUntilPerf) {
      return this.frozenSongSec;
    }
    return (performance.now() - this.songStartPerf) / 1000 - this.leadInSec;
  }

  private setPhase(phase: ArcadePhase): void {
    this.phase = phase;
    this.onPhaseChange(phase);
    if (phase !== 'playing') {
      this.onZoomOcarina(false);
      this.clearComboBanner();
    }
  }

  private startGame(): void {
    this.stopLoop();
    this.hidePauseOverlay();
    this.isPaused = false;
    this.activeSustains.clear();
    this.poppingNotes = [];

    const secPerBeat = 60 / Math.max(40, this.selectedSong.bpm);
    this.chartNotes = [...this.selectedSong.notes]
      .sort((a, b) => a.startBeat - b.startBeat)
      .map((n) => ({
        id: n.id,
        holeId: n.holeId,
        pitchBend: n.pitchBend ?? 'normal',
        targetSec: n.startBeat * secPerBeat,
        durationSec: Math.max(0.25, n.durationBeats * secPerBeat),
        judged: false,
        guidePlayed: false,
      }));

    if (this.chartNotes.length === 0) {
      this.onToast('This song has no notes!');
      return;
    }

    this.counts = {
      perfect: 0,
      great: 0,
      good: 0,
      bad: 0,
      miss: 0,
      maxCombo: 0,
      totalNotes: this.chartNotes.length,
    };
    this.currentCombo = 0;
    this.sustainBonusScore = 0;
    this.lifeMeter = 50;
    this.lastJudgementText = '';
    this.lastBeatTick = -10;
    this.countdownZoomApplied = false;
    this.hitstopUntilPerf = 0;
    this.songStartPerf = performance.now();
    this.updateComboBanner('reset');
    this.setPhase('playing');
    this.onZoomOcarina(false);
    this.render();
    this.startLoop();
  }

  /** Hole positions in canvas pixels; evenly spaced near the bottom if the ocarina can't report them. */
  private laneGeometry(w: number, h: number, rect: DOMRect): Record<HoleId, { x: number; y: number }> {
    const screen = this.getHoleScreenPositions();
    const out = {} as Record<HoleId, { x: number; y: number }>;
    if (screen) {
      for (const id of LANES_TOP_TO_BOTTOM) out[id] = { x: screen[id].x - rect.left, y: screen[id].y - rect.top };
      return out;
    }
    const order: HoleId[] = ['hole-a', 'hole-up', 'hole-down', 'hole-left', 'hole-right'];
    order.forEach((id, i) => {
      out[id] = { x: w * (0.3 + i * 0.1), y: h * 0.78 };
    });
    return out;
  }

  private alpha(hex: string, a: number): string {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }

  private startLoop(): void {
    const canvas = this.container.querySelector<HTMLCanvasElement>('#arcade-highway-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const secPerBeat = 60 / Math.max(40, this.selectedSong.bpm);
    const lastNoteEndSec =
      this.chartNotes.reduce((m, n) => Math.max(m, n.targetSec + n.durationSec), 0) + 1.2;

    const frame = () => {
      if (this.phase !== 'playing' || this.isPaused) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== Math.floor(rect.width * dpr) || canvas.height !== Math.floor(rect.height * dpr)) {
        canvas.width = Math.floor(rect.width * dpr);
        canvas.height = Math.floor(rect.height * dpr);
      }

      const w = rect.width;
      const h = rect.height;
      const nowPerf = performance.now();
      const nowSec = this.getCurrentSongSec();

      // Update 3-2-1 Countdown overlay & trigger Ocarina zoom-in
      const countdownEl = document.getElementById('arcade-countdown-overlay');
      if (nowSec < 0) {
        const countNum = Math.ceil(-nowSec);
        if (countdownEl) {
          countdownEl.classList.add('is-active');
          countdownEl.textContent = countNum > 0 ? String(countNum) : 'PLAY!';
        }
      } else {
        if (countdownEl) {
          countdownEl.classList.remove('is-active');
        }
        if (!this.countdownZoomApplied) {
          this.countdownZoomApplied = true;
          this.onZoomOcarina(true);
        }
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      // Lanes fall straight into the ocarina's holes.
      const lanes = this.laneGeometry(w, h, rect);
      const laneList = LANES_TOP_TO_BOTTOM.map((id) => ({ id, ...lanes[id] })).sort((p, q) => p.x - q.x);
      const spacing = laneList.length > 1 ? (laneList[laneList.length - 1].x - laneList[0].x) / (laneList.length - 1) : 60;
      const laneW = Math.max(26, Math.min(64, spacing * 0.78));
      const noteW = laneW * 0.62;
      const baseY = laneList.reduce((sum, l) => sum + l.y, 0) / laneList.length;
      const pxPerSec = 240 * this.settings.scrollSpeed;
      const offsetSec = this.settings.offsetMs / 1000;
      const leftEdge = laneList[0].x - laneW;
      const rightEdge = laneList[laneList.length - 1].x + laneW;

      // light beams, brightest where they meet the hole
      for (const l of laneList) {
        const beam = ctx.createLinearGradient(0, 0, 0, l.y);
        beam.addColorStop(0, 'rgba(0,0,0,0)');
        beam.addColorStop(1, this.alpha(HOLE_MAP[l.id].color, this.activeSustains.has(l.id) ? 0.22 : 0.09));
        ctx.fillStyle = beam;
        ctx.fillRect(l.x - laneW / 2, 0, laneW, l.y);
      }

      const currentBeat = Math.floor(nowSec / secPerBeat);
      if (nowSec >= -0.05 && currentBeat > this.lastBeatTick) {
        this.lastBeatTick = currentBeat;
        if (this.settings.metronomeEnabled) {
          playMetronomeTick(currentBeat % 4 === 0);
        }
      }

      // beat lines drift down with the notes
      const firstBeat = Math.max(0, Math.floor(nowSec / secPerBeat));
      const lastBeat = Math.ceil((nowSec + baseY / pxPerSec) / secPerBeat);
      for (let b = firstBeat; b <= lastBeat; b++) {
        const by = baseY - (b * secPerBeat - nowSec) * pxPerSec;
        if (by < 0 || by > baseY) continue;
        const fade = Math.min(1, by / (baseY * 0.6));
        ctx.strokeStyle = b % 4 === 0 ? `rgba(220, 198, 143, ${0.28 * fade})` : `rgba(244, 234, 210, ${0.07 * fade})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(leftEdge, by);
        ctx.lineTo(rightEdge, by);
        ctx.stroke();
      }

      // Update Active Long-Note Sustains (Hold ticks + continuous sparks)
      for (const [holeId, sus] of Array.from(this.activeSustains.entries())) {
        const endSec = sus.note.targetSec + offsetSec + sus.note.durationSec;
        if (nowSec >= endSec) {
          this.activeSustains.delete(holeId);
          continue;
        }
        if (nowSec - sus.lastTickSec >= 0.25) {
          sus.lastTickSec = nowSec;
          this.sustainBonusScore += 50;
          this.currentCombo++;
          if (this.currentCombo > this.counts.maxCombo) this.counts.maxCombo = this.currentCombo;
          this.updateComboBanner('hit');
          this.updateLiveHud();
        }
        if (nowPerf - sus.lastSparkPerf >= 100) {
          sus.lastSparkPerf = nowPerf;
          this.fireHitSparks(holeId, sus.note.pitchBend, 5);
        }
      }

      // target rings just outside each hole, breathing with the beat
      const beatPhase = nowSec > 0 ? (nowSec % secPerBeat) / secPerBeat : 1;
      const ringR = noteW * 0.62;
      for (const l of laneList) {
        const sus = this.activeSustains.get(l.id);
        const color = HOLE_MAP[l.id].color;
        if (sus) {
          const flare = ctx.createRadialGradient(l.x, l.y, 2, l.x, l.y, ringR * 2.4);
          flare.addColorStop(0, this.alpha('#ffffff', 0.9));
          flare.addColorStop(0.35, this.alpha(color, 0.6));
          flare.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = flare;
          ctx.beginPath();
          ctx.arc(l.x, l.y, ringR * 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(l.x, l.y, ringR * (1.08 + 0.08 * (1 - beatPhase)), 0, Math.PI * 2);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = this.alpha(color, 0.35 + 0.35 * (1 - beatPhase));
        ctx.stroke();
      }

      // falling notes
      for (const n of this.chartNotes) {
        const meta = HOLE_MAP[n.holeId];
        const lane = lanes[n.holeId];
        const target = n.targetSec + offsetSec;
        const isHeldSustain = this.activeSustains.get(n.holeId)?.note.id === n.id;

        if (!n.guidePlayed && nowSec >= target) {
          n.guidePlayed = true;
          if (this.settings.arcadeAssist === 'novice') {
            const guideVol = this.settings.masterVolume * this.settings.guideVolume * 0.45;
            ocarinaSynth.playOneShot(getBentFrequency(n.holeId, n.pitchBend), Math.min(0.55, n.durationSec), guideVol);
          }
        }

        if (!n.judged && nowSec - target > 0.22) {
          n.judged = true;
          this.registerMiss(getBentFrequency(n.holeId, n.pitchBend));
          if (this.phase !== 'playing') {
            ctx.restore();
            return;
          }
        }

        if (n.judged && !isHeldSustain) continue;

        const headY = isHeldSustain ? lane.y : lane.y - (target - nowSec) * pxPerSec;
        const remainingDur = isHeldSustain ? Math.max(0, target + n.durationSec - nowSec) : n.durationSec;
        const tail = Math.max(0, remainingDur * pxPerSec - noteW);
        const top = headY - noteW / 2 - tail;
        if (headY + noteW < 0 || top > h) continue;

        // fade in from the dark at the top of the screen
        const appear = Math.max(0, Math.min(1, (headY + 40) / (lane.y * 0.35)));
        const passed = Math.max(0, headY - lane.y);
        if (passed > 36) continue;
        ctx.save();
        ctx.globalAlpha = appear * (1 - passed / 36);
        if (tail > 0) {
          ctx.fillStyle = this.alpha(meta.color, isHeldSustain ? 0.75 : 0.45);
          ctx.beginPath();
          ctx.roundRect(lane.x - noteW * 0.22, top, noteW * 0.44, tail + noteW / 2, noteW * 0.22);
          ctx.fill();
        }
        // gem head
        const g = ctx.createRadialGradient(lane.x - noteW * 0.15, headY - noteW * 0.15, 1, lane.x, headY, noteW / 2);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.35, meta.color);
        g.addColorStop(1, this.alpha(meta.color, 0.85));
        ctx.fillStyle = g;
        if (isHeldSustain) {
          ctx.shadowColor = meta.color;
          ctx.shadowBlur = 18;
        }
        ctx.beginPath();
        ctx.arc(lane.x, headY, noteW / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.stroke();
        if (n.pitchBend !== 'normal') {
          // small chevron: bend up or down
          const d = n.pitchBend === 'up' ? -1 : 1;
          ctx.strokeStyle = '#0b0d16';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(lane.x - noteW * 0.18, headY - d * noteW * 0.08);
          ctx.lineTo(lane.x, headY + d * noteW * 0.12);
          ctx.lineTo(lane.x + noteW * 0.18, headY - d * noteW * 0.08);
          ctx.stroke();
        }
        ctx.restore();
      }

      // hit bloom: a ring opening out of the hole
      this.poppingNotes = this.poppingNotes.filter((pn) => nowPerf - pn.hitPerf < 260);
      for (const pn of this.poppingNotes) {
        const prog = (nowPerf - pn.hitPerf) / 260;
        const lane = lanes[pn.holeId];
        ctx.save();
        ctx.globalAlpha = 1 - prog;
        ctx.beginPath();
        ctx.arc(lane.x, lane.y, ringR * (1 + prog * 1.4), 0, Math.PI * 2);
        ctx.lineWidth = 3 * (1 - prog) + 1;
        ctx.strokeStyle = pn.color;
        ctx.stroke();
        ctx.restore();
      }

      if (this.lastJudgementText && nowPerf - this.lastJudgementPerf < 550) {
        const t = (nowPerf - this.lastJudgementPerf) / 550;
        ctx.save();
        ctx.globalAlpha = 1 - t * t;
        ctx.fillStyle = this.lastJudgementColor;
        ctx.font = '600 26px Cinzel, serif';
        ctx.textAlign = 'center';
        ctx.fillText(this.lastJudgementText, (leftEdge + rightEdge) / 2, Math.min(...laneList.map((l) => l.y)) - 70 - t * 10);
        ctx.restore();
      }

      ctx.restore();

      if (nowSec >= lastNoteEndSec) {
        this.finishStage();
        return;
      }

      this.rafId = requestAnimationFrame(frame);
    };

    this.rafId = requestAnimationFrame(frame);
  }

  private stopLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private triggerGameOver(): void {
    this.stopLoop();
    this.activeSustains.clear();
    this.setPhase('gameover');
    playGameOver();
    haptics.gameOver();
    this.render();
  }

  private finishStage(): void {
    this.stopLoop();
    this.activeSustains.clear();
    this.setPhase('results');
    const result = calculateArcadeScore(this.counts);
    const totalScore = result.score + this.sustainBonusScore;
    const correctNotes = this.counts.perfect + this.counts.great + this.counts.good;
    const missedNotes = this.counts.bad + this.counts.miss;
    const entry: ArcadeHighScore = {
      songId: this.selectedSong.id,
      score: totalScore,
      grade: result.grade,
      plate: result.plate,
      maxCombo: this.counts.maxCombo,
      correctNotes,
      missedNotes,
      totalNotes: this.counts.totalNotes,
      updatedAt: Date.now(),
    };
    const prev = this.highScores[entry.songId];
    this.prevBestScore = prev?.score ?? 0;
    const playCount = (prev?.playCount ?? 0) + 1;
    if (!prev || entry.score >= prev.score) {
      this.highScores[entry.songId] = { ...entry, playCount };
    } else {
      this.highScores[entry.songId] = { ...prev, playCount };
    }
    this.onSaveScore(entry);
    playStageClear();
    haptics.victory();
    this.render();
  }

  private updateLiveHud(): void {
    const scoreEl = this.container.querySelector('#arcade-live-score');
    const lifeFill = this.container.querySelector<HTMLElement>('#arcade-life-fill');
    const res = calculateArcadeScore(this.counts);
    if (scoreEl) scoreEl.textContent = (res.score + this.sustainBonusScore).toLocaleString();
    if (lifeFill) {
      lifeFill.style.width = `${Math.round(this.lifeMeter)}%`;
      lifeFill.classList.toggle('is-danger', this.lifeMeter < 25);
      lifeFill.classList.toggle('is-clear', this.lifeMeter >= 75);
    }
  }

  render(): void {
    if (this.phase === 'select') {
      this.renderSelectScreen();
    } else if (this.phase === 'playing') {
      this.renderPlayingScreen();
    } else if (this.phase === 'gameover') {
      this.renderGameOverScreen();
    } else {
      this.renderResultsScreen();
    }
  }

  private renderSelectScreen(): void {
    const categories = this.getCategories();
    const songs = this.getActiveSongs();
    let focusIdx = songs.findIndex((s) => s.id === this.selectedSong.id);
    if (focusIdx < 0 && songs.length > 0) {
      focusIdx = 0;
      this.selectedSong = songs[0];
    }

    const hs = this.highScores[this.selectedSong.id];
    const totalNotes = this.selectedSong.notes.length;
    const playedCount = hs?.playCount ?? 0;
    const correctNotes = hs?.correctNotes ?? 0;
    const missedNotes = hs?.missedNotes ?? 0;
    const bestScore = hs?.score ?? 0;

    const rollerItems: Array<{ song: PartitureTrack; offset: number }> = [];
    for (let d = -2; d <= 2; d++) {
      if (songs.length === 0) break;
      const idx = focusIdx + d;
      if (idx >= 0 && idx < songs.length) {
        rollerItems.push({ song: songs[idx], offset: d });
      }
    }

    const prevKey = formatKeyCode(this.keyMapping.prevCategory);
    const nextKey = formatKeyCode(this.keyMapping.nextCategory);

    const grade = hs?.grade && bestScore > 0 ? hs.grade : '';
    const novice = this.settings.arcadeAssist === 'novice';
    this.container.innerHTML = `
      <div class="arcade-select-fullscreen">
        <img src="/not-the-ocarina-playing-simulator/assets/arcade-select-bg.jpg" alt="" class="arcade-bg-img" />
        <div class="arcade-bg-scrim"></div>

        <header class="select-top-bar">
          <button type="button" class="comp-bar-btn" id="btn-arcade-menu">${icons.back}<span>Menu</span></button>

          <nav class="cat-tabs" aria-label="Song lists">
            <button type="button" class="cat-key" id="btn-cat-prev" aria-label="Previous list"><kbd>${prevKey}</kbd></button>
            ${categories
              .map(
                (c, i) => `<button type="button" class="cat-tab ${i === this.activeCategoryIdx ? 'is-active' : ''}" data-cat-idx="${i}" aria-pressed="${i === this.activeCategoryIdx}">${c.name}</button>`
              )
              .join('')}
            <button type="button" class="cat-key" id="btn-cat-next" aria-label="Next list"><kbd>${nextKey}</kbd></button>
          </nav>

          <div class="select-top-tools">
            <button type="button" class="hud-icon-btn ${this.settings.metronomeEnabled ? 'is-on' : ''}" id="btn-arcade-metro" aria-pressed="${this.settings.metronomeEnabled}" title="Metronome ${this.settings.metronomeEnabled ? 'on' : 'off'}" aria-label="Metronome">${icons.metronome}</button>
            <label class="hud-icon-btn file-btn" title="Open a notes file (.txt)" aria-label="Open a notes file">
              ${icons.upload}
              <input type="file" id="arcade-import-txt" accept=".txt,text/plain" hidden />
            </label>
          </div>
        </header>

        <main class="select-main-grid">
          <section class="song-roll" aria-label="Songs">
            ${songs
              .map((song, i) => {
                const best = this.highScores[song.id];
                const g = best && best.score > 0 ? best.grade : '';
                const focused = song.id === this.selectedSong.id;
                return `
                  <button type="button" class="roller-card ${focused ? 'is-focused' : 'is-side'}" data-select-song="${song.id}" aria-current="${focused}">
                    <span class="roll-num">${String(i + 1).padStart(2, '0')}</span>
                    <span class="roll-title">${song.title}</span>
                    <span class="roll-grade">${g}</span>
                    <span class="roll-bpm">${song.bpm} BPM</span>
                  </button>`;
              })
              .join('')}
            <p class="roll-hint"><kbd>↑</kbd><kbd>↓</kbd> choose · <kbd>Enter</kbd> play</p>
          </section>

          <aside class="stage-card" aria-label="Selected song">
            <p class="arcade-kicker-line">${this.selectedSong.artist || 'Your composition'} · ${this.selectedSong.bpm} BPM · ${totalNotes} notes</p>
            <h2 class="stage-title">${this.selectedSong.title}</h2>

            <div class="stage-record">
              ${
                bestScore > 0
                  ? `<span class="stage-grade">${grade}</span>
                     <span class="stage-best"><strong>${bestScore.toLocaleString()}</strong><span>best score</span></span>
                     <span class="stage-best"><strong>${correctNotes}<small>/${totalNotes}</small></strong><span>notes hit</span></span>
                     <span class="stage-best"><strong>${playedCount}</strong><span>plays</span></span>`
                  : `<span class="stage-fresh">Not played yet. Your first mark is waiting.</span>`
              }
            </div>

            <div class="stage-diff" role="radiogroup" aria-label="Difficulty">
              <button type="button" class="diff-option ${novice ? 'is-selected' : ''}" id="btn-assist-novice" role="radio" aria-checked="${novice}">
                <strong>Novice</strong><span>The melody guides you. You can't fail.</span>
              </button>
              <button type="button" class="diff-option ${!novice ? 'is-selected' : ''}" id="btn-assist-original" role="radio" aria-checked="${!novice}">
                <strong>Original</strong><span>Just you and the rhythm. Miss too many and the song ends.</span>
              </button>
            </div>

            <div class="offset-control-row">
              <span>Timing offset</span>
              <div class="offset-pill">
                <button type="button" class="icon-btn" id="btn-offset-minus" aria-label="Earlier">−</button>
                <span id="arcade-offset-val">${this.settings.offsetMs > 0 ? '+' : ''}${this.settings.offsetMs} ms</span>
                <button type="button" class="icon-btn" id="btn-offset-plus" aria-label="Later">+</button>
              </div>
            </div>

            <button type="button" class="stage-start" id="btn-arcade-start">
              <span>Play</span><kbd>Enter</kbd>
            </button>
          </aside>
        </main>
      </div>
    `;
    void missedNotes;
    void rollerItems;

    this.container.querySelector('#btn-arcade-menu')?.addEventListener('click', () => {
      playUiClick();
      haptics.tapButton();
      this.onBackToMenu();
    });

    this.container.querySelector('#btn-cat-prev')?.addEventListener('click', () => this.switchCategory(-1));
    this.container.querySelector('#btn-cat-next')?.addEventListener('click', () => this.switchCategory(1));
    this.container.querySelectorAll<HTMLButtonElement>('[data-cat-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.activeCategoryIdx = parseInt(btn.dataset.catIdx || '0', 10);
        const catSongs = this.getActiveSongs();
        if (catSongs.length > 0) this.selectedSong = catSongs[0];
        playUiClick();
        haptics.tapButton();
        this.render();
      });
    });

    this.container.querySelectorAll<HTMLElement>('.roller-card[data-select-song]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const found = songs.find((s) => s.id === btn.dataset.selectSong);
        if (!found) return;
        playUiClick();
        haptics.tapButton();
        this.selectedSong = found;
        this.render();
      });
    });

    this.container.querySelector('#btn-assist-novice')?.addEventListener('click', () => {
      playUiClick();
      haptics.tapButton();
      this.settings.arcadeAssist = 'novice';
      this.onSettingsChange({ ...this.settings });
      this.render();
    });
    this.container.querySelector('#btn-assist-original')?.addEventListener('click', () => {
      playUiClick();
      haptics.tapButton();
      this.settings.arcadeAssist = 'original';
      this.onSettingsChange({ ...this.settings });
      this.render();
    });

    this.container.querySelector('#btn-arcade-metro')?.addEventListener('click', () => {
      playUiClick();
      haptics.tapButton();
      this.settings.metronomeEnabled = !this.settings.metronomeEnabled;
      this.onSettingsChange({ ...this.settings });
      this.render();
    });

    this.container.querySelector('#btn-offset-minus')?.addEventListener('click', () => {
      playUiClick();
      this.settings.offsetMs = Math.max(-250, this.settings.offsetMs - 10);
      this.onSettingsChange({ ...this.settings });
      this.render();
    });
    this.container.querySelector('#btn-offset-plus')?.addEventListener('click', () => {
      playUiClick();
      this.settings.offsetMs = Math.min(250, this.settings.offsetMs + 10);
      this.onSettingsChange({ ...this.settings });
      this.render();
    });

    this.container.querySelector<HTMLInputElement>('#arcade-import-txt')?.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const parsed = parsePartitureText(await file.text());
      if (parsed.notes.length === 0) {
        haptics.miss();
        this.onToast('No valid notes found in partiture file.');
        return;
      }
      this.importedSongs.push(parsed);
      this.selectedSong = parsed;
      haptics.victory();
      this.onToast(`Loaded "${parsed.title}" for Arcade Mode!`);
      this.render();
    });

    this.container.querySelector('#btn-arcade-start')?.addEventListener('click', () => {
      playUiClick();
      haptics.tapButton();
      this.startGame();
    });
    this.container.querySelector('.roller-card.is-focused')?.scrollIntoView({ block: 'nearest' });
  }

  private renderPlayingScreen(): void {
    this.container.innerHTML = `
      <div class="arcade-ingame-top">
        <div class="ingame-hud-bar">
          <div class="ingame-song-info">
            <strong class="arcade-song-title">${this.selectedSong.title}</strong>
            <span class="ingame-diff-badge">${this.settings.arcadeAssist.toUpperCase()}</span>
          </div>

          <div class="ingame-life-wrap" aria-label="Life Bar">
            <span class="life-label">LIFE</span>
            <div class="life-track">
              <div class="life-fill" id="arcade-life-fill" style="width:${Math.round(this.lifeMeter)}%"></div>
            </div>
          </div>

          <div class="arcade-stats-pills">
            <span class="stat-pill" id="arcade-live-score">0</span>
            <button type="button" class="hud-icon-btn" id="btn-arcade-pause" title="Pause (Esc)" aria-label="Pause">${icons.pause}</button>
            <button type="button" class="hud-icon-btn" id="btn-arcade-restart" title="Restart" aria-label="Restart">${icons.restart}</button>
            <button type="button" class="hud-icon-btn" id="btn-arcade-quit" title="Quit to song list" aria-label="Quit">${icons.close}</button>
          </div>
        </div>

        <canvas id="arcade-highway-canvas" class="arcade-highway-canvas"></canvas>
      </div>
    `;

    this.container.querySelector('#btn-arcade-pause')?.addEventListener('click', () => {
      this.togglePause();
    });

    this.container.querySelector('#btn-arcade-restart')?.addEventListener('click', () => {
      playUiClick();
      haptics.tapButton();
      this.startGame();
    });

    this.container.querySelector('#btn-arcade-quit')?.addEventListener('click', () => {
      playUiClick();
      haptics.tapButton();
      this.stopLoop();
      this.setPhase('select');
      this.render();
    });
  }

  private renderGameOverScreen(): void {
    const hit = this.counts.perfect + this.counts.great + this.counts.good;
    const reason =
      hit === 0
        ? `No notes were heard. Cover the holes with <kbd>${formatKeyCode(this.keyMapping['hole-a'])}</kbd> <kbd>${formatKeyCode(this.keyMapping['hole-down'])}</kbd> <kbd>${formatKeyCode(this.keyMapping['hole-right'])}</kbd> <kbd>${formatKeyCode(this.keyMapping['hole-up'])}</kbd> <kbd>${formatKeyCode(this.keyMapping['hole-left'])}</kbd> as the notes reach them.`
        : `You played ${hit} of ${this.counts.totalNotes} notes before the song slipped away.`;
    this.container.innerHTML = `
      <div class="arcade-results-fullscreen">
        <img src="/not-the-ocarina-playing-simulator/assets/arcade-results-bg.jpg" alt="" class="arcade-bg-img" />
        <div class="arcade-bg-scrim is-dark"></div>
        <div class="arcade-outcome-card is-gameover">
          <p class="arcade-kicker-line">${this.selectedSong.title}</p>
          <h2>The song faded</h2>
          <p class="outcome-reason">${reason}</p>
          <div class="arcade-menu-list">
            <button type="button" class="arcade-menu-item" id="btn-arcade-retry">Try again <kbd>Enter</kbd></button>
            ${this.settings.arcadeAssist === 'original' ? '<button type="button" class="arcade-menu-item" id="btn-arcade-novice">Try it on Novice</button>' : ''}
            <button type="button" class="arcade-menu-item" id="btn-arcade-back">Back to songs <kbd>Esc</kbd></button>
          </div>
        </div>
      </div>
    `;
    this.bindOutcomeButtons();
    this.container.querySelector('#btn-arcade-novice')?.addEventListener('click', () => {
      playUiClick();
      this.settings.arcadeAssist = 'novice';
      this.onSettingsChange({ ...this.settings });
      this.startGame();
    });
  }

  private bindOutcomeButtons(): void {
    this.container.querySelector('#btn-arcade-retry')?.addEventListener('click', () => {
      playUiClick();
      this.startGame();
    });
    this.container.querySelector('#btn-arcade-back')?.addEventListener('click', () => {
      playUiClick();
      this.setPhase('select');
      this.render();
    });
    this.container.querySelector<HTMLButtonElement>('#btn-arcade-retry')?.focus();
  }

  /** Enter replays, Escape returns to the song list (results and game-over screens). */
  handleOutcomeKeyDown(e: KeyboardEvent): boolean {
    if (this.phase !== 'results' && this.phase !== 'gameover') return false;
    if (e.key === 'Escape') {
      e.preventDefault();
      playUiClick();
      this.setPhase('select');
      this.render();
      return true;
    }
    return false;
  }

  /** Score counts up like an arcade cabinet. */
  private countUp(el: HTMLElement, to: number): void {
    const start = performance.now();
    const dur = 1100;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(to * eased).toLocaleString();
      if (t < 1 && el.isConnected) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  private renderResultsScreen(): void {
    const res = calculateArcadeScore(this.counts);
    const totalScore = res.score + this.sustainBonusScore;
    const goodCount = this.counts.perfect + this.counts.great;
    const okayCount = this.counts.good;
    const badCount = this.counts.bad + this.counts.miss;

    const prevBest = this.prevBestScore;
    const isNewBest = totalScore > 0 && totalScore > prevBest;
    this.container.innerHTML = `
      <div class="arcade-results-fullscreen">
        <img src="/not-the-ocarina-playing-simulator/assets/arcade-results-bg.jpg" alt="" class="arcade-bg-img" />
        <div class="arcade-bg-scrim"></div>

        <main class="results-stage">
          <p class="arcade-kicker-line">${this.selectedSong.title} · ${this.settings.arcadeAssist === 'novice' ? 'Novice' : 'Original'}</p>
          <div class="results-grade" aria-label="Grade ${res.grade}">${res.grade}</div>
          ${isNewBest ? '<p class="results-new-best">New best</p>' : ''}
          <p class="results-score"><strong id="results-score-num">0</strong><span>score</span></p>

          <dl class="results-judges">
            <div class="is-good"><dt>Good</dt><dd>${goodCount}</dd></div>
            <div class="is-okay"><dt>Okay</dt><dd>${okayCount}</dd></div>
            <div class="is-bad"><dt>Missed</dt><dd>${badCount}</dd></div>
            <div><dt>Best combo</dt><dd>${this.counts.maxCombo}</dd></div>
          </dl>

          <div class="arcade-menu-list is-row">
            <button type="button" class="arcade-menu-item" id="btn-arcade-retry">Play again <kbd>Enter</kbd></button>
            <button type="button" class="arcade-menu-item" id="btn-arcade-back">Back to songs <kbd>Esc</kbd></button>
          </div>
        </main>
      </div>
    `;
    this.bindOutcomeButtons();
    const num = this.container.querySelector<HTMLElement>('#results-score-num');
    if (num) this.countUp(num, totalScore);
  }
}
