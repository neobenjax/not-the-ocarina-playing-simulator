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

type JudgementType = 'GOOD' | 'OKAY' | 'BAD';
export type ArcadePhase = 'select' | 'playing' | 'results' | 'gameover';

const LANES_TOP_TO_BOTTOM: HoleId[] = ['hole-up', 'hole-left', 'hole-right', 'hole-down', 'hole-a'];

function difficultySvg(diff: 'novice' | 'original'): string {
  if (diff === 'novice') {
    return `
      <svg class="diff-svg-icon" viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="20" fill="#166534" stroke="#4ade80" stroke-width="3" />
        <path d="M24 12 C28 16, 30 22, 24 30 C18 22, 20 16, 24 12 Z" fill="#86efac" />
        <path d="M24 28 C16 26, 12 20, 14 14 C20 16, 23 21, 24 28 Z" fill="#4ade80" />
        <path d="M24 28 C32 26, 36 20, 34 14 C28 16, 25 21, 24 28 Z" fill="#4ade80" />
        <circle cx="24" cy="34" r="3" fill="#fde047" />
      </svg>
    `;
  }
  return `
    <svg class="diff-svg-icon" viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="20" fill="#7c2d12" stroke="#fb923c" stroke-width="3" />
      <path d="M24 8 L29 19 L40 16 L33 26 L38 36 L24 31 L10 36 L15 26 L8 16 L19 19 Z" fill="#fb923c" />
      <path d="M24 14 L27 21 L34 20 L29 26 L31 33 L24 29 L17 33 L19 26 L14 20 L21 21 Z" fill="#fde047" />
    </svg>
  `;
}

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
  private chartNotes: ChartNoteRuntime[] = [];
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
  private lifeMeter = 50; // 0..100
  private lastJudgementText = '';
  private lastJudgementColor = '#ffffff';
  private lastJudgementPerf = 0;

  private onSettingsChange: (s: AppSettings) => void;
  private onSaveScore: (score: ArcadeHighScore) => void;
  private onToast: (msg: string) => void;
  private onPhaseChange: (phase: ArcadePhase) => void;
  private onZoomOcarina: (zoomed: boolean) => void;
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
    this.onBackToMenu = callbacks.onBackToMenu;
    this.onPhaseChange('select');
    this.render();
  }

  destroy(): void {
    this.stopLoop();
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

  onPlayerInput(holeId: HoleId, pitchBend: PitchBend = 'normal'): boolean {
    if (this.phase !== 'playing') return false;

    const nowSec = this.getCurrentSongSec();
    if (nowSec < -0.25) {
      // Allow testing sound during countdown without penalizing
      return false;
    }
    const offsetSec = this.settings.offsetMs / 1000;

    // 1. Prefer matching an unjudged note on the exact pressed holeId AND pitchBend (enables chords!)
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

    // 2. If no exact match, check if a note (wrong hole or wrong pitchBend) is right on the receptor
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

    if (j === 'GOOD') {
      if (msDiff <= 50) this.counts.perfect++;
      else this.counts.great++;
      this.currentCombo++;
      this.lifeMeter = Math.min(100, this.lifeMeter + 4.5);
      haptics.hitPerfect();
      this.setJudgementPopup('GOOD!', '#27ae60');
    } else if (j === 'OKAY') {
      this.counts.good++;
      this.currentCombo++;
      this.lifeMeter = Math.min(100, this.lifeMeter + 2);
      haptics.hitGood();
      this.setJudgementPopup('OKAY', '#f2c94c');
    } else {
      this.counts.bad++;
      this.currentCombo = 0;
      this.lifeMeter = Math.max(0, this.lifeMeter - 5);
      haptics.tapButton();
      this.setJudgementPopup('BAD', '#ff6b35');
    }

    if (this.currentCombo > this.counts.maxCombo) {
      this.counts.maxCombo = this.currentCombo;
    }

    const vol = this.settings.masterVolume * this.settings.ocarinaVolume;
    ocarinaSynth.playOneShot(getBentFrequency(holeId, candidate.pitchBend), Math.min(0.65, candidate.durationSec), vol);
    this.updateLiveHud();
    if (this.lifeMeter <= 0) {
      this.triggerGameOver();
    }
    return true;
  }

  private registerMiss(freq: number): void {
    this.counts.miss++;
    this.currentCombo = 0;
    this.lifeMeter = Math.max(0, this.lifeMeter - 8);
    ocarinaSynth.playDistortedMiss(freq);
    haptics.miss();
    this.setJudgementPopup('BAD!', '#e74c3c');
    this.updateLiveHud();

    if (this.lifeMeter <= 0) {
      this.triggerGameOver();
    }
  }

  private setJudgementPopup(text: string, color: string): void {
    this.lastJudgementText = text;
    this.lastJudgementColor = color;
    this.lastJudgementPerf = performance.now();
  }

  private getCurrentSongSec(): number {
    return (performance.now() - this.songStartPerf) / 1000 - this.leadInSec;
  }

  private setPhase(phase: ArcadePhase): void {
    this.phase = phase;
    this.onPhaseChange(phase);
    if (phase !== 'playing') {
      this.onZoomOcarina(false);
    }
  }

  private startGame(): void {
    this.stopLoop();
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
    this.lifeMeter = 50;
    this.lastJudgementText = '';
    this.lastBeatTick = -10;
    this.countdownZoomApplied = false;
    this.songStartPerf = performance.now();
    this.setPhase('playing');
    this.onZoomOcarina(false);
    this.render();
    this.startLoop();
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
      if (this.phase !== 'playing') return;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== Math.floor(rect.width * dpr) || canvas.height !== Math.floor(rect.height * dpr)) {
        canvas.width = Math.floor(rect.width * dpr);
        canvas.height = Math.floor(rect.height * dpr);
      }

      const w = rect.width;
      const h = rect.height;
      const nowSec = this.getCurrentSongSec();

      // Update 3-2-1 Countdown overlay & trigger Ocarina zoom-in when countdown finishes
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

      // 5-Track Partiture Background
      ctx.fillStyle = '#0f1629';
      ctx.fillRect(0, 0, w, h);

      const labelColW = Math.min(64, Math.max(44, w * 0.08));
      const receptorX = labelColW + Math.min(54, w * 0.08);
      const laneH = h / LANES_TOP_TO_BOTTOM.length;

      // Draw 5 horizontal tracks (same order as Composer: ▲, ◀, ▶, ▼, A)
      LANES_TOP_TO_BOTTOM.forEach((holeId, idx) => {
        const meta = HOLE_MAP[holeId];
        const y0 = idx * laneH;
        ctx.fillStyle = idx % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.14)';
        ctx.fillRect(labelColW, y0, w - labelColW, laneH);

        // Track separator
        ctx.strokeStyle = 'rgba(255,255,255,0.09)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(labelColW, y0 + laneH);
        ctx.lineTo(w, y0 + laneH);
        ctx.stroke();

        // Left lane header badge
        ctx.fillStyle = '#0a0f1f';
        ctx.fillRect(0, y0, labelColW, laneH);
        ctx.fillStyle = meta.color;
        ctx.fillRect(0, y0, 5, laneH);
        ctx.fillStyle = '#ffffff';
        ctx.font = '800 13px Fredoka, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(meta.ootButton, labelColW * 0.52, y0 + laneH * 0.42);
        ctx.fillStyle = 'rgba(247,241,227,0.65)';
        ctx.font = '700 10px Nunito, sans-serif';
        ctx.fillText(meta.noteName, labelColW * 0.52, y0 + laneH * 0.72);
      });

      const pxPerSec = 240 * this.settings.scrollSpeed;
      const offsetSec = this.settings.offsetMs / 1000;

      const currentBeat = Math.floor(nowSec / secPerBeat);
      if (nowSec >= -0.05 && currentBeat > this.lastBeatTick) {
        this.lastBeatTick = currentBeat;
        if (this.settings.metronomeEnabled) {
          playMetronomeTick(currentBeat % 4 === 0);
        }
      }

      // Beat vertical lines across all 5 tracks
      const firstVisibleBeat = Math.floor((nowSec - 0.5) / secPerBeat);
      const lastVisibleBeat = Math.ceil((nowSec + (w - receptorX) / pxPerSec) / secPerBeat);
      for (let b = firstVisibleBeat; b <= lastVisibleBeat; b++) {
        if (b < 0) continue;
        const bx = receptorX + (b * secPerBeat - nowSec) * pxPerSec;
        if (bx < labelColW) continue;
        ctx.strokeStyle = b % 4 === 0 ? 'rgba(242, 201, 76, 0.35)' : 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = b % 4 === 0 ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(bx, 0);
        ctx.lineTo(bx, h);
        ctx.stroke();
      }

      // Hit Target Zone on the left (vertical judgement line + circular lane targets)
      ctx.fillStyle = 'rgba(242, 201, 76, 0.08)';
      ctx.fillRect(receptorX - 18, 0, 36, h);
      ctx.strokeStyle = 'rgba(242, 201, 76, 0.7)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(receptorX, 0);
      ctx.lineTo(receptorX, h);
      ctx.stroke();

      const targetRadius = Math.max(10, Math.min(18, laneH * 0.34));
      LANES_TOP_TO_BOTTOM.forEach((holeId, idx) => {
        const meta = HOLE_MAP[holeId];
        const cy = idx * laneH + laneH * 0.5;
        ctx.beginPath();
        ctx.arc(receptorX, cy, targetRadius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(11, 16, 33, 0.75)';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = meta.color;
        ctx.stroke();
      });

      // Render Notes per lane (right-to-left) with upper/lower/center pitch-bend positioning
      for (const n of this.chartNotes) {
        const meta = HOLE_MAP[n.holeId];
        const laneIdx = LANES_TOP_TO_BOTTOM.indexOf(n.holeId);
        const cy =
          n.pitchBend === 'up'
            ? laneIdx * laneH + laneH * 0.28
            : n.pitchBend === 'down'
              ? laneIdx * laneH + laneH * 0.72
              : laneIdx * laneH + laneH * 0.5;
        const noteR = n.pitchBend === 'normal' ? targetRadius - 1 : Math.max(8, targetRadius * 0.72);
        const target = n.targetSec + offsetSec;

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

        if (n.judged) continue;

        const x = receptorX + (target - nowSec) * pxPerSec;
        if (x < labelColW - 40 || x > w + 80) continue;

        // Sustain tail
        if (n.durationSec >= 0.4) {
          const tailW = n.durationSec * pxPerSec;
          ctx.fillStyle = meta.color;
          ctx.globalAlpha = 0.4;
          ctx.fillRect(x, cy - noteR * 0.5, tailW, noteR);
          ctx.globalAlpha = 1;
        }

        // Note circle
        ctx.beginPath();
        ctx.arc(x, cy, noteR, 0, Math.PI * 2);
        ctx.fillStyle = meta.color;
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = n.pitchBend === 'up' ? '#4ade80' : n.pitchBend === 'down' ? '#f87171' : '#ffffff';
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = `800 ${Math.max(9, Math.round(noteR * 0.72))}px Fredoka, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const label =
          n.pitchBend === 'up'
            ? `${meta.ootButton}↑`
            : n.pitchBend === 'down'
              ? `${meta.ootButton}↓`
              : meta.ootButton;
        ctx.fillText(label, x, cy + 1);
      }

      if (this.lastJudgementText && performance.now() - this.lastJudgementPerf < 550) {
        ctx.fillStyle = this.lastJudgementColor;
        ctx.font = '800 22px Fredoka, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(this.lastJudgementText, receptorX + 26, 22);
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
    this.setPhase('gameover');
    playGameOver();
    haptics.gameOver();
    this.render();
  }

  private finishStage(): void {
    this.stopLoop();
    this.setPhase('results');
    const result = calculateArcadeScore(this.counts);
    const correctNotes = this.counts.perfect + this.counts.great + this.counts.good;
    const missedNotes = this.counts.bad + this.counts.miss;
    const entry: ArcadeHighScore = {
      songId: this.selectedSong.id,
      score: result.score,
      grade: result.grade,
      plate: result.plate,
      maxCombo: this.counts.maxCombo,
      correctNotes,
      missedNotes,
      totalNotes: this.counts.totalNotes,
      updatedAt: Date.now(),
    };
    const prev = this.highScores[entry.songId];
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
    const comboEl = this.container.querySelector('#arcade-live-combo');
    const lifeFill = this.container.querySelector<HTMLElement>('#arcade-life-fill');
    const res = calculateArcadeScore(this.counts);
    if (scoreEl) scoreEl.textContent = res.score.toLocaleString();
    if (comboEl) comboEl.textContent = `${this.currentCombo} COMBO`;
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

    // Build roller window (up to 5 items centered on focusIdx)
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

    this.container.innerHTML = `
      <div class="arcade-select-fullscreen">
        <img src="/not-the-ocarina-playing-simulator/assets/arcade-select-bg.jpg" alt="" class="arcade-bg-img" />
        <div class="arcade-bg-scrim"></div>

        <header class="select-top-bar">
          <button type="button" class="btn btn-secondary" id="btn-arcade-menu">← Menu</button>

          <div class="category-bar" role="tablist" aria-label="Song Categories">
            <button type="button" class="cat-arrow-btn" id="btn-cat-prev" title="Previous Category (${prevKey})">
              ◀ <kbd>${prevKey}</kbd>
            </button>
            <div class="category-pills">
              ${categories
                .map(
                  (c, i) => `
                <button type="button" class="cat-pill ${i === this.activeCategoryIdx ? 'is-active' : ''}" data-cat-idx="${i}">
                  ${c.name}
                </button>`
                )
                .join('')}
            </div>
            <button type="button" class="cat-arrow-btn" id="btn-cat-next" title="Next Category (${nextKey})">
              <kbd>${nextKey}</kbd> ▶
            </button>
          </div>

          <div class="select-top-tools">
            <button type="button" class="btn btn-secondary ${this.settings.metronomeEnabled ? 'is-on' : ''}" id="btn-arcade-metro">
              🥁 ${this.settings.metronomeEnabled ? 'On' : 'Off'}
            </button>
            <label class="btn btn-secondary file-btn">
              📥 .txt
              <input type="file" id="arcade-import-txt" accept=".txt,text/plain" hidden />
            </label>
          </div>
        </header>

        <main class="select-main-grid">
          <section class="music-roller-col" aria-label="Music Roller">
            <div class="roller-nav-hint">▲ Up / Down ▼</div>
            <div class="music-roller-list">
              ${rollerItems
                .map(({ song, offset }) => {
                  const isCenter = offset === 0;
                  if (isCenter) {
                    return `
                      <div class="roller-card is-focused" data-select-song="${song.id}">
                        <div class="roller-focused-head">
                          <div>
                            <h2>${song.title}</h2>
                            <p class="roller-meta">${song.artist || 'Custom'} · ${song.bpm} BPM</p>
                          </div>
                        </div>
                        <div class="roller-diff-row" role="group" aria-label="Difficulty">
                          <button type="button" class="diff-card is-novice ${this.settings.arcadeAssist === 'novice' ? 'is-selected' : ''}" id="btn-assist-novice">
                            ${difficultySvg('novice')}
                            <div>
                              <strong>Novice</strong>
                              <span>Guide melody + hit</span>
                            </div>
                          </button>
                          <button type="button" class="diff-card is-original ${this.settings.arcadeAssist === 'original' ? 'is-selected' : ''}" id="btn-assist-original">
                            ${difficultySvg('original')}
                            <div>
                              <strong>Original</strong>
                              <span>Pure timing only</span>
                            </div>
                          </button>
                        </div>
                      </div>
                    `;
                  }
                  return `
                    <button type="button" class="roller-card is-side" data-select-song="${song.id}">
                      <span class="roller-side-title">${song.title}</span>
                      <span class="roller-side-bpm">${song.bpm} BPM</span>
                    </button>
                  `;
                })
                .join('')}
            </div>
          </section>

          <aside class="song-stats-panel" aria-label="Song Statistics">
            <h3>SONG RECORD</h3>
            <div class="stats-song-name">${this.selectedSong.title}</div>
            <div class="stats-rows">
              <div class="stat-row"><span>Total Notes</span><strong>${totalNotes}</strong></div>
              <div class="stat-row"><span>Played</span><strong>${playedCount}</strong></div>
              <div class="stat-row"><span>Correct Notes</span><strong class="is-good">${correctNotes}</strong></div>
              <div class="stat-row"><span>Missed Notes</span><strong class="is-bad">${missedNotes}</strong></div>
              <div class="stat-row is-score"><span>Best Score</span><strong class="is-gold">${bestScore.toLocaleString()}</strong></div>
            </div>

            <div class="offset-control-row">
              <span>Timing Offset</span>
              <div class="offset-pill">
                <button type="button" class="icon-btn" id="btn-offset-minus" aria-label="Decrease Offset">-</button>
                <span id="arcade-offset-val">${this.settings.offsetMs > 0 ? '+' : ''}${this.settings.offsetMs}ms</span>
                <button type="button" class="icon-btn" id="btn-offset-plus" aria-label="Increase Offset">+</button>
              </div>
            </div>

            <button type="button" class="btn btn-gold btn-lg start-stage-btn" id="btn-arcade-start">
              ▶ START STAGE
            </button>
          </aside>
        </main>
      </div>
    `;

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

    this.container.querySelectorAll<HTMLElement>('.roller-card.is-side[data-select-song]').forEach((btn) => {
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
            <span class="stat-pill combo-pill" id="arcade-live-combo">0 COMBO</span>
            <button type="button" class="btn btn-secondary" id="btn-arcade-restart" title="Restart">↻</button>
            <button type="button" class="btn btn-danger" id="btn-arcade-quit">⏹ Quit</button>
          </div>
        </div>

        <canvas id="arcade-highway-canvas" class="arcade-highway-canvas"></canvas>
      </div>
    `;

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
    this.container.innerHTML = `
      <div class="arcade-results-fullscreen">
        <img src="/not-the-ocarina-playing-simulator/assets/arcade-results-bg.jpg" alt="" class="arcade-bg-img" />
        <div class="arcade-bg-scrim is-dark"></div>
        <div class="arcade-outcome-card is-gameover">
          <h2>STAGE FAILED</h2>
          <p>Your Life Bar emptied on <strong>${this.selectedSong.title}</strong>.</p>
          <div class="outcome-actions">
            <button type="button" class="btn btn-gold btn-lg" id="btn-arcade-retry">🔄 Retry Stage</button>
            <button type="button" class="btn btn-secondary btn-lg" id="btn-arcade-back">🎵 Song Select</button>
          </div>
        </div>
      </div>
    `;
    this.container.querySelector('#btn-arcade-retry')?.addEventListener('click', () => {
      playUiClick();
      this.startGame();
    });
    this.container.querySelector('#btn-arcade-back')?.addEventListener('click', () => {
      playUiClick();
      this.setPhase('select');
      this.render();
    });
  }

  private renderResultsScreen(): void {
    const res = calculateArcadeScore(this.counts);
    const goodCount = this.counts.perfect + this.counts.great;
    const okayCount = this.counts.good;
    const badCount = this.counts.bad + this.counts.miss;

    this.container.innerHTML = `
      <div class="arcade-results-fullscreen">
        <img src="/not-the-ocarina-playing-simulator/assets/arcade-results-bg.jpg" alt="" class="arcade-bg-img" />
        <div class="arcade-bg-scrim"></div>

        <header class="results-top-bar">
          <div class="results-badge">STAGE RESULTS</div>
          <div class="results-song-title-right">${this.selectedSong.title}</div>
        </header>

        <main class="results-center-card">
          <div class="results-left-col">
            <div class="results-diff-pill">
              ${difficultySvg(this.settings.arcadeAssist)}
              <span>${this.settings.arcadeAssist.toUpperCase()}</span>
            </div>
            <div class="results-grade-badge">${res.grade}</div>
            <div class="results-score-box">
              <span class="score-caption">SCORE</span>
              <strong class="results-score">${res.score.toLocaleString()}</strong>
            </div>
          </div>

          <div class="results-right-col">
            <div class="judgement-grid-3">
              <div class="j-item is-good"><span>GOOD</span><strong>${goodCount}</strong></div>
              <div class="j-item is-okay"><span>OKAY</span><strong>${okayCount}</strong></div>
              <div class="j-item is-bad"><span>BAD</span><strong>${badCount}</strong></div>
              <div class="j-item is-combo"><span>MAX COMBO</span><strong>${this.counts.maxCombo}</strong></div>
            </div>

            <div class="outcome-actions">
              <button type="button" class="btn btn-gold btn-lg" id="btn-arcade-retry">🔄 Play Again</button>
              <button type="button" class="btn btn-primary btn-lg" id="btn-arcade-back">🎵 Song Select</button>
            </div>
          </div>
        </main>
      </div>
    `;

    this.container.querySelector('#btn-arcade-retry')?.addEventListener('click', () => {
      playUiClick();
      this.startGame();
    });
    this.container.querySelector('#btn-arcade-back')?.addEventListener('click', () => {
      playUiClick();
      this.setPhase('select');
      this.render();
    });
  }
}
