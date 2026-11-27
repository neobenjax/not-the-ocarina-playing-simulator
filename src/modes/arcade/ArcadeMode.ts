import {
  AppSettings,
  ArcadeHighScore,
  HOLE_MAP,
  HoleId,
  PartitureTrack,
  Playlist,
} from '../../types';
import { ZELDA_SONGS } from '../../data/zeldaSongs';
import { parsePartitureText } from '../freePlay/partitureFormat';
import { ocarinaSynth } from '../../audio/ocarinaSynth';
import {
  playGameOver,
  playMetronomeTick,
  playStageClear,
  playUiClick,
} from '../../audio/soundMachineSfx';
import { haptics } from '../../haptics/hapticEngine';
import { calculatePhoenix2Score, JudgementCounts } from './phoenixScoring';

interface ChartNoteRuntime {
  id: string;
  holeId: HoleId;
  targetSec: number;
  durationSec: number;
  judged: boolean;
  guidePlayed: boolean;
}

type JudgementType = 'PERFECT' | 'GREAT' | 'GOOD' | 'BAD' | 'MISS';

export class ArcadeMode {
  private container: HTMLElement;
  private settings: AppSettings;
  private playlists: Playlist[];
  private highScores: Record<string, ArcadeHighScore>;
  private importedSongs: PartitureTrack[] = [];

  private selectedSong: PartitureTrack;
  private phase: 'select' | 'playing' | 'results' | 'gameover' = 'select';

  private rafId: number | null = null;
  private songStartPerf = 0;
  private leadInSec = 2.0;
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
  private consecutiveMisses = 0;
  private soulMeter = 0; // 0..100
  private lastJudgementText = '';
  private lastJudgementColor = '#ffffff';
  private lastJudgementPerf = 0;

  private onSettingsChange: (s: AppSettings) => void;
  private onSaveScore: (score: ArcadeHighScore) => void;
  private onToast: (msg: string) => void;

  constructor(
    container: HTMLElement,
    settings: AppSettings,
    playlists: Playlist[],
    highScores: Record<string, ArcadeHighScore>,
    callbacks: {
      onSettingsChange: (s: AppSettings) => void;
      onSaveScore: (score: ArcadeHighScore) => void;
      onToast: (msg: string) => void;
    }
  ) {
    this.container = container;
    this.settings = settings;
    this.playlists = playlists;
    this.highScores = highScores;
    this.selectedSong = ZELDA_SONGS[0];
    this.onSettingsChange = callbacks.onSettingsChange;
    this.onSaveScore = callbacks.onSaveScore;
    this.onToast = callbacks.onToast;
    this.render();
  }

  destroy(): void {
    this.stopLoop();
  }

  updatePlaylists(playlists: Playlist[]): void {
    this.playlists = playlists;
    if (this.phase === 'select') this.render();
  }

  onPlayerInput(holeId: HoleId): boolean {
    if (this.phase !== 'playing') return false;

    const nowSec = this.getCurrentSongSec();
    const offsetSec = this.settings.offsetMs / 1000;

    let candidate: ChartNoteRuntime | null = null;
    let bestAbsDiff = Infinity;
    for (const n of this.chartNotes) {
      if (n.judged) continue;
      const diff = Math.abs(nowSec - (n.targetSec + offsetSec));
      if (diff <= 0.22 && diff < bestAbsDiff) {
        bestAbsDiff = diff;
        candidate = n;
      }
    }

    if (!candidate) return false;

    if (candidate.holeId !== holeId) {
      candidate.judged = true;
      this.registerMiss(HOLE_MAP[candidate.holeId].frequency);
      return true;
    }

    candidate.judged = true;
    const msDiff = bestAbsDiff * 1000;
    let j: JudgementType = 'MISS';
    if (msDiff <= 55) j = 'PERFECT';
    else if (msDiff <= 100) j = 'GREAT';
    else if (msDiff <= 145) j = 'GOOD';
    else if (msDiff <= 190) j = 'BAD';

    if (j === 'MISS') {
      this.registerMiss(HOLE_MAP[holeId].frequency);
      return true;
    }

    this.consecutiveMisses = 0;
    const soulStep = 100 / Math.max(1, this.counts.totalNotes);
    if (j === 'PERFECT') {
      this.counts.perfect++;
      this.currentCombo++;
      this.soulMeter = Math.min(100, this.soulMeter + soulStep * 1.15);
      haptics.hitPerfect();
      this.setJudgementPopup('PERFECT!', '#27ae60');
    } else if (j === 'GREAT') {
      this.counts.great++;
      this.currentCombo++;
      this.soulMeter = Math.min(100, this.soulMeter + soulStep * 0.9);
      haptics.hitGreat();
      this.setJudgementPopup('GREAT!', '#00d2ff');
    } else if (j === 'GOOD') {
      this.counts.good++;
      this.soulMeter = Math.min(100, this.soulMeter + soulStep * 0.5);
      haptics.hitGood();
      this.setJudgementPopup('GOOD', '#f2c94c');
    } else {
      this.counts.bad++;
      this.currentCombo = 0;
      haptics.tapButton();
      this.setJudgementPopup('BAD', '#ff6b35');
    }

    if (this.currentCombo > this.counts.maxCombo) {
      this.counts.maxCombo = this.currentCombo;
    }

    const vol = this.settings.masterVolume * this.settings.ocarinaVolume;
    ocarinaSynth.playOneShot(HOLE_MAP[holeId].frequency, Math.min(0.65, candidate.durationSec), vol);
    this.updateLiveHud();
    return true;
  }

  private registerMiss(freq: number): void {
    this.counts.miss++;
    this.currentCombo = 0;
    this.consecutiveMisses++;
    this.soulMeter = Math.max(0, this.soulMeter - 4);
    ocarinaSynth.playDistortedMiss(freq);
    haptics.miss();
    this.setJudgementPopup('MISS!', '#e74c3c');
    this.updateLiveHud();

    if (this.consecutiveMisses > 10) {
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

  private startGame(): void {
    this.stopLoop();
    const secPerBeat = 60 / Math.max(40, this.selectedSong.bpm);
    this.chartNotes = [...this.selectedSong.notes]
      .sort((a, b) => a.startBeat - b.startBeat)
      .map((n) => ({
        id: n.id,
        holeId: n.holeId,
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
    this.consecutiveMisses = 0;
    this.soulMeter = 0;
    this.lastJudgementText = '';
    this.lastBeatTick = -10;
    this.songStartPerf = performance.now();
    this.phase = 'playing';
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
      ctx.save();
      ctx.scale(dpr, dpr);

      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, '#161b2e');
      grad.addColorStop(0.5, '#1d2233');
      grad.addColorStop(1, '#261a2e');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      const centerY = h * 0.52;
      const receptorX = Math.min(92, w * 0.16);
      ctx.strokeStyle = 'rgba(242, 201, 76, 0.25)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(w, centerY);
      ctx.stroke();

      const nowSec = this.getCurrentSongSec();
      const pxPerSec = 240 * this.settings.scrollSpeed;
      const offsetSec = this.settings.offsetMs / 1000;

      const currentBeat = Math.floor(nowSec / secPerBeat);
      if (nowSec >= -0.05 && currentBeat > this.lastBeatTick) {
        this.lastBeatTick = currentBeat;
        if (this.settings.metronomeEnabled) {
          playMetronomeTick(currentBeat % 4 === 0);
        }
      }

      const firstVisibleBeat = Math.floor((nowSec - 0.5) / secPerBeat);
      const lastVisibleBeat = Math.ceil((nowSec + (w - receptorX) / pxPerSec) / secPerBeat);
      for (let b = firstVisibleBeat; b <= lastVisibleBeat; b++) {
        if (b < 0) continue;
        const bx = receptorX + (b * secPerBeat - nowSec) * pxPerSec;
        ctx.strokeStyle = b % 4 === 0 ? 'rgba(242, 201, 76, 0.36)' : 'rgba(255, 255, 255, 0.09)';
        ctx.lineWidth = b % 4 === 0 ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(bx, 12);
        ctx.lineTo(bx, h - 12);
        ctx.stroke();
      }

      // Taiko Drum / Triforce Receptor
      ctx.beginPath();
      ctx.arc(receptorX, centerY, 30, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(242, 201, 76, 0.15)';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#f2c94c';
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(receptorX, centerY, 20, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0, 210, 255, 0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();

      for (const n of this.chartNotes) {
        const meta = HOLE_MAP[n.holeId];
        const target = n.targetSec + offsetSec;

        if (!n.guidePlayed && nowSec >= target) {
          n.guidePlayed = true;
          if (this.settings.arcadeAssist === 'novice') {
            const guideVol = this.settings.masterVolume * this.settings.guideVolume * 0.45;
            ocarinaSynth.playOneShot(meta.frequency, Math.min(0.55, n.durationSec), guideVol);
          }
        }

        if (!n.judged && nowSec - target > 0.2) {
          n.judged = true;
          this.registerMiss(meta.frequency);
          if (this.phase !== 'playing') {
            ctx.restore();
            return;
          }
        }

        if (n.judged) continue;

        const x = receptorX + (target - nowSec) * pxPerSec;
        if (x < -80 || x > w + 80) continue;

        if (n.durationSec >= 0.45) {
          const tailW = n.durationSec * pxPerSec;
          ctx.fillStyle = meta.color;
          ctx.globalAlpha = 0.38;
          ctx.fillRect(x, centerY - 10, tailW, 20);
          ctx.globalAlpha = 1;
        }

        ctx.beginPath();
        ctx.arc(x, centerY, 22, 0, Math.PI * 2);
        ctx.fillStyle = meta.color;
        ctx.fill();
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = '800 12px Fredoka, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(meta.ootButton, x, centerY + 1);
      }

      if (nowSec < 0) {
        const countNum = Math.ceil(-nowSec);
        ctx.fillStyle = '#f2c94c';
        ctx.font = '800 40px Fredoka, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(countNum > 0 ? String(countNum) : 'PLAY!', w * 0.5, h * 0.25);
      }

      if (this.lastJudgementText && performance.now() - this.lastJudgementPerf < 650) {
        ctx.fillStyle = this.lastJudgementColor;
        ctx.font = '800 24px Fredoka, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(this.lastJudgementText, receptorX + 82, centerY - 42);
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
    this.phase = 'gameover';
    playGameOver();
    haptics.gameOver();
    this.render();
  }

  private finishStage(): void {
    this.stopLoop();
    this.phase = 'results';
    const result = calculatePhoenix2Score(this.counts);
    const entry: ArcadeHighScore = {
      songId: this.selectedSong.id,
      score: result.score,
      grade: result.grade,
      plate: result.plate,
      maxCombo: this.counts.maxCombo,
      updatedAt: Date.now(),
    };
    if (!this.highScores[entry.songId] || entry.score > this.highScores[entry.songId].score) {
      this.highScores[entry.songId] = entry;
    }
    this.onSaveScore(entry);
    playStageClear();
    haptics.victory();
    this.render();
  }

  private updateLiveHud(): void {
    const scoreEl = this.container.querySelector('#arcade-live-score');
    const comboEl = this.container.querySelector('#arcade-live-combo');
    const missEl = this.container.querySelector('#arcade-live-miss-streak');
    const soulFill = this.container.querySelector<HTMLElement>('#arcade-soul-fill');
    const res = calculatePhoenix2Score(this.counts);
    if (scoreEl) scoreEl.textContent = `${res.score.toLocaleString()} (${res.grade})`;
    if (comboEl) comboEl.textContent = `${this.currentCombo} COMBO`;
    if (missEl) {
      missEl.textContent = `Miss: ${this.consecutiveMisses}/10`;
      missEl.classList.toggle('is-danger', this.consecutiveMisses >= 7);
    }
    if (soulFill) {
      soulFill.style.width = `${Math.round(this.soulMeter)}%`;
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
    const customTracks = this.playlists.flatMap((p) => p.tracks);
    const allCustom = [...customTracks, ...this.importedSongs];
    const allSongs = [...ZELDA_SONGS, ...allCustom];

    this.container.innerHTML = `
      <div class="arcade-select-shell">
        <div class="arcade-header-row">
          <div class="arcade-select-title-wrap">
            <select id="arcade-song-dropdown" class="text-input arcade-song-dropdown" aria-label="Select Song">
              ${ZELDA_SONGS.map(
                (s) => `<option value="${s.id}" ${this.selectedSong.id === s.id ? 'selected' : ''}>🎵 ${s.title} (LV.${s.level} · ${s.bpm} BPM)</option>`
              ).join('')}
              ${allCustom.map(
                (s) => `<option value="${s.id}" ${this.selectedSong.id === s.id ? 'selected' : ''}>⭐ ${s.title} (Custom · ${s.bpm} BPM)</option>`
              ).join('')}
            </select>
          </div>

          <div class="arcade-options-bar">
            <div class="assist-toggle" role="group" aria-label="Assist Difficulty">
              <button type="button" class="btn ${this.settings.arcadeAssist === 'novice' ? 'btn-gold' : 'btn-secondary'}" id="btn-assist-novice">
                🌟 Novice
              </button>
              <button type="button" class="btn ${this.settings.arcadeAssist === 'original' ? 'btn-gold' : 'btn-secondary'}" id="btn-assist-original">
                🔥 Original
              </button>
            </div>
            <button type="button" class="btn btn-secondary ${this.settings.metronomeEnabled ? 'is-on' : ''}" id="btn-arcade-metro">
              🥁 Metro ${this.settings.metronomeEnabled ? 'On' : 'Off'}
            </button>
            <div class="offset-pill">
              <button type="button" class="icon-btn" id="btn-offset-minus" aria-label="Decrease Offset">-</button>
              <span id="arcade-offset-val">${this.settings.offsetMs > 0 ? '+' : ''}${this.settings.offsetMs}ms</span>
              <button type="button" class="icon-btn" id="btn-offset-plus" aria-label="Increase Offset">+</button>
            </div>
            <label class="btn btn-secondary file-btn">
              📥 Load .txt
              <input type="file" id="arcade-import-txt" accept=".txt,text/plain" hidden />
            </label>
          </div>
        </div>

        <div class="arcade-song-grid">
          ${ZELDA_SONGS.map((song) => {
            const hs = this.highScores[song.id];
            const selected = this.selectedSong.id === song.id;
            return `
              <button type="button" class="song-card ${selected ? 'is-selected' : ''}" data-select-song="${song.id}">
                <div class="song-card-top">
                  <span class="song-lv">LV.${song.level}</span>
                  ${hs ? `<span class="song-grade">${hs.grade} · ${hs.score.toLocaleString()}</span>` : '<span class="song-grade muted-text">NEW</span>'}
                </div>
                <strong>${song.title}</strong>
                <p>${song.subtitle} · ${song.bpm} BPM</p>
              </button>
            `;
          }).join('')}

          ${allCustom
            .map((song) => {
              const hs = this.highScores[song.id];
              const selected = this.selectedSong.id === song.id;
              return `
                <button type="button" class="song-card is-custom-song ${selected ? 'is-selected' : ''}" data-select-custom="${song.id}">
                  <div class="song-card-top">
                    <span class="song-lv">CUSTOM</span>
                    ${hs ? `<span class="song-grade">${hs.grade} · ${hs.score.toLocaleString()}</span>` : '<span class="song-grade muted-text">USER</span>'}
                  </div>
                  <strong>${song.title}</strong>
                  <p>${song.notes.length} notes · ${song.bpm} BPM</p>
                </button>
              `;
            })
            .join('')}
        </div>

        <div class="arcade-launch-bar">
          <div class="selected-summary">
            <strong>Selected: ${this.selectedSong.title}</strong>
            <span class="muted-text">
              ${this.settings.arcadeAssist === 'novice' ? 'Novice: Guide melody plays softly + loud hit' : 'Original: Melody sounds ONLY on accurate hits'}
            </span>
          </div>
          <button type="button" class="btn btn-gold btn-lg" id="btn-arcade-start">▶ START STAGE</button>
        </div>
      </div>
    `;

    this.container.querySelector<HTMLSelectElement>('#arcade-song-dropdown')?.addEventListener('change', (e) => {
      const id = (e.target as HTMLSelectElement).value;
      const found = allSongs.find((s) => s.id === id);
      if (!found) return;
      playUiClick();
      haptics.tapButton();
      this.selectedSong = found;
      this.render();
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

    this.container.querySelectorAll<HTMLButtonElement>('[data-select-song]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const found = ZELDA_SONGS.find((s) => s.id === btn.dataset.selectSong);
        if (!found) return;
        playUiClick();
        haptics.tapButton();
        this.selectedSong = found;
        this.render();
      });
    });

    this.container.querySelectorAll<HTMLButtonElement>('[data-select-custom]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const found = allCustom.find((s) => s.id === btn.dataset.selectCustom);
        if (!found) return;
        playUiClick();
        haptics.tapButton();
        this.selectedSong = found;
        this.render();
      });
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
      <div class="taiko-stage-shell">
        <div class="taiko-top-banner">
          <div class="taiko-banner-info">
            <strong class="arcade-song-title">${this.selectedSong.title}</strong>
            <span class="taiko-bpm-badge">BPM ${this.selectedSong.bpm} · ${this.settings.arcadeAssist.toUpperCase()}</span>
          </div>
          <div class="arcade-stats-pills">
            <span class="stat-pill" id="arcade-live-score">0 (F)</span>
            <span class="stat-pill combo-pill" id="arcade-live-combo">0 COMBO</span>
            <span class="stat-pill miss-pill" id="arcade-live-miss-streak">Miss: 0/10</span>
            <button type="button" class="btn btn-secondary" id="btn-arcade-restart" title="Restart">↻</button>
            <button type="button" class="btn btn-danger" id="btn-arcade-quit">⏹ Quit</button>
          </div>
        </div>

        <div class="taiko-soul-gauge">
          <span class="soul-label">SOUL</span>
          <div class="soul-track">
            <div class="soul-fill" id="arcade-soul-fill" style="width:0%"></div>
          </div>
          <span class="soul-clear-tag">CLEAR</span>
        </div>

        <canvas id="arcade-highway-canvas" class="arcade-highway-canvas"></canvas>

        <div class="taiko-festival-stage">
          <img src="/not-the-ocarina-playing-simulator/assets/arcade-stage-banner.jpg" alt="" class="festival-bg-img" />
          <div class="festival-overlay">
            <span>Tap the Ocarina holes below in rhythm!</span>
          </div>
        </div>
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
      this.phase = 'select';
      this.render();
    });
  }

  private renderGameOverScreen(): void {
    this.container.innerHTML = `
      <div class="arcade-outcome-card is-gameover">
        <h2>💀 STAGE FAILED — GAME OVER</h2>
        <p>You missed more than 10 notes in a row on <strong>${this.selectedSong.title}</strong>.</p>
        <div class="outcome-actions">
          <button type="button" class="btn btn-gold" id="btn-arcade-retry">🔄 Retry Stage</button>
          <button type="button" class="btn btn-secondary" id="btn-arcade-back">🎵 Song Select</button>
        </div>
      </div>
    `;
    this.container.querySelector('#btn-arcade-retry')?.addEventListener('click', () => {
      playUiClick();
      this.startGame();
    });
    this.container.querySelector('#btn-arcade-back')?.addEventListener('click', () => {
      playUiClick();
      this.phase = 'select';
      this.render();
    });
  }

  private renderResultsScreen(): void {
    const res = calculatePhoenix2Score(this.counts);
    this.container.innerHTML = `
      <div class="arcade-outcome-card is-clear taiko-results-card">
        <div class="taiko-results-hero">
          <img src="/not-the-ocarina-playing-simulator/assets/results-victory-art.jpg" alt="Stage Clear Celebration" class="results-hero-img" />
          <div class="results-hero-scrim"></div>
          <div class="results-top">
            <div>
              <p class="muted-text" style="margin:0;color:#fde68a;">STAGE CLEAR · ${this.selectedSong.title}</p>
              <h2 class="results-score">${res.score.toLocaleString()}</h2>
              <p class="muted-text" style="margin:0;color:#f8fafc;">PIU Phoenix 2 Scale: <strong>${res.scoreThousand} / 1000</strong> · ${res.plate}</p>
            </div>
            <div class="results-grade-badge">${res.grade}</div>
          </div>
        </div>

        <div class="judgement-grid">
          <div class="j-item"><span>PERFECT</span><strong style="color:#27ae60">${this.counts.perfect}</strong></div>
          <div class="j-item"><span>GREAT</span><strong style="color:#00d2ff">${this.counts.great}</strong></div>
          <div class="j-item"><span>GOOD</span><strong style="color:#f2c94c">${this.counts.good}</strong></div>
          <div class="j-item"><span>BAD</span><strong style="color:#ff6b35">${this.counts.bad}</strong></div>
          <div class="j-item"><span>MISS</span><strong style="color:#e74c3c">${this.counts.miss}</strong></div>
          <div class="j-item"><span>MAX COMBO</span><strong style="color:#ffffff">${this.counts.maxCombo}</strong></div>
        </div>

        <div class="outcome-actions">
          <button type="button" class="btn btn-gold" id="btn-arcade-retry">🔄 Play Again</button>
          <button type="button" class="btn btn-primary" id="btn-arcade-back">🎵 Song Select</button>
        </div>
      </div>
    `;
    this.container.querySelector('#btn-arcade-retry')?.addEventListener('click', () => {
      playUiClick();
      this.startGame();
    });
    this.container.querySelector('#btn-arcade-back')?.addEventListener('click', () => {
      playUiClick();
      this.phase = 'select';
      this.render();
    });
  }
}
