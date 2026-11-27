import { icons } from '../../components/icons';
import { getBentFrequency, HOLE_MAP, HoleId, PartitureNote, PartitureTrack, PitchBend, Playlist } from '../../types';
import { SAMPLE_SONGS } from '../../data/sampleSongs';
import { haptics } from '../../haptics/hapticEngine';
import { ocarinaSynth } from '../../audio/ocarinaSynth';
import { playMelodyChime, playMetronomeTick, playUiClick } from '../../audio/soundMachineSfx';
import { exportTrackToMp3 } from '../../audio/mp3Exporter';
import { detectSecretMotif, parsePartitureText, serializePartitureText } from './partitureFormat';


const LANES_TOP_TO_BOTTOM: HoleId[] = ['hole-up', 'hole-left', 'hole-right', 'hole-down', 'hole-a'];
/** Vertical score: one beat is this many pixels; time runs upward from each hole. */
const PX_PER_BEAT = 56;

type LanePos = Record<HoleId, { x: number; y: number }>;

/** Columns from left to right on screen (follows the ocarina's staggered holes). */
const LANES_ORDER_X = (): HoleId[] => ['hole-a', 'hole-up', 'hole-down', 'hole-left', 'hole-right'];

interface ActiveLiveNote {
  note: PartitureNote;
  startPerf: number;
}

export class FreePlayComposer {
  private container: HTMLElement;
  private dockLeft: HTMLElement;
  private dockRight: HTMLElement;
  private clearDialog: HTMLDialogElement;
  private playlists: Playlist[];
  private activePlaylistId: string;
  private currentTrack: PartitureTrack;
  private selectedNoteIds = new Set<string>();
  private snapBeats = 0; // Default: Free
  private isRecording = false;
  private isPlaying = false;
  private useMetronome = true;
  private ocarinaToPartiture = true;
  private autoBpm = true;

  private recordStartMs = 0;
  private activeLiveNotes = new Map<HoleId, ActiveLiveNote>();
  private liveHoldRaf: number | null = null;
  private lastStepGroupStartPerf = 0;
  private lastStepGroupStartBeat = 0;
  private lastOnsetPerf = 0;
  private recentOnsetIntervals: number[] = [];
  private recentMotifHoles: HoleId[] = [];

  private playTimer: number | null = null;
  private playStartPerf = 0;
  private playheadBeat = 0;
  private lastMetronomeBeat = -1;
  private playedNoteIds = new Set<string>();
  /** Beat sitting on the holes right now; the score scrolls by changing it. */
  private viewBeat = 0;
  private lanePos: LanePos | null = null;
  private laneW = 48;
  private resizeObs: ResizeObserver | null = null;
  private recordCursorRaf: number | null = null;
  private getHoleScreenPositions: () => LanePos | null;

  private onPlaylistsChange: (playlists: Playlist[]) => void;
  private onToast: (msg: string) => void;
  private onHighlightHole: (holeId: HoleId, active: boolean) => void;
  private onBackToMenu: () => void;

  constructor(
    container: HTMLElement,
    dockLeft: HTMLElement,
    dockRight: HTMLElement,
    playlists: Playlist[],
    callbacks: {
      onPlaylistsChange: (playlists: Playlist[]) => void;
      onToast: (msg: string) => void;
      onHighlightHole: (holeId: HoleId, active: boolean) => void;
      onBackToMenu: () => void;
      getHoleScreenPositions?: () => LanePos | null;
    }
  ) {
    this.container = container;
    this.dockLeft = dockLeft;
    this.dockRight = dockRight;
    this.playlists = playlists;
    this.activePlaylistId = playlists[0]?.id || '';
    const firstTrack = playlists[0]?.tracks[0];
    this.currentTrack = firstTrack
      ? structuredClone(firstTrack)
      : structuredClone(SAMPLE_SONGS[0]);
    this.onPlaylistsChange = callbacks.onPlaylistsChange;
    this.onToast = callbacks.onToast;
    this.onHighlightHole = callbacks.onHighlightHole;
    this.onBackToMenu = callbacks.onBackToMenu;
    this.getHoleScreenPositions = callbacks.getHoleScreenPositions ?? (() => null);
    this.resizeObs = new ResizeObserver(() => this.renderTimelineOnly());
    this.resizeObs.observe(this.container);

    this.clearDialog = document.createElement('dialog');
    this.clearDialog.className = 'game-dialog';
    this.clearDialog.id = 'composer-clear-dialog';
    this.clearDialog.innerHTML = `
      <div class="dialog-header">
        <h2>Clear Track?</h2>
        <button type="button" class="icon-btn" id="clear-dialog-close" aria-label="Close"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>
      </div>
      <div class="dialog-body">
        <p>This will remove all notes from <strong>the current partiture</strong>. Are you sure?</p>
      </div>
      <div class="dialog-footer">
        <button type="button" class="btn btn-secondary" id="clear-dialog-cancel">Cancel</button>
        <button type="button" class="btn btn-danger" id="clear-dialog-confirm">Clear All Notes</button>
      </div>
    `;
    document.body.appendChild(this.clearDialog);
    this.clearDialog.querySelector('#clear-dialog-close')?.addEventListener('click', () => this.clearDialog.close());
    this.clearDialog.querySelector('#clear-dialog-cancel')?.addEventListener('click', () => this.clearDialog.close());
    this.clearDialog.querySelector('#clear-dialog-confirm')?.addEventListener('click', () => {
      this.clearDialog.close();
      this.executeClear();
    });

    this.render();
  }

  destroy(): void {
    this.stopPlayback();
    this.stopLiveHoldLoop();
    this.isRecording = false;
    this.activeLiveNotes.clear();
    this.resizeObs?.disconnect();
    this.stopRecordCursor();
    this.clearDialog.remove();
  }

  deleteSelectedNotes(): void {
    if (this.selectedNoteIds.size === 0) return;
    playUiClick();
    haptics.tapButton();
    const count = this.selectedNoteIds.size;
    this.currentTrack.notes = this.currentTrack.notes.filter((n) => !this.selectedNoteIds.has(n.id));
    this.selectedNoteIds.clear();
    this.renderTimelineOnly();
    this.updateDeleteButtonState();
    this.onToast(`Deleted ${count} note${count > 1 ? 's' : ''}.`);
  }

  toggleRecord(): void {
    playUiClick();
    haptics.tapButton();
    if (this.isRecording) {
      this.isRecording = false;
      this.activeLiveNotes.clear();
      this.stopLiveHoldLoop();
      this.stopPlayback();
      this.onToast('Recording stopped!');
    } else {
      this.stopPlayback();
      this.isRecording = true;
      this.recordStartMs = performance.now();
      this.startRecordCursor();
      this.onToast('● Recording live! Play the Ocarina.');
    }
    this.render();
  }

  togglePlay(): void {
    playUiClick();
    haptics.tapButton();
    if (this.isPlaying) {
      this.pausePlayback();
    } else {
      this.startPlayback();
    }
  }

  requestClear(): void {
    playUiClick();
    haptics.tapButton();
    if (this.currentTrack.notes.length === 0) {
      this.onToast('Track is already empty.');
      return;
    }
    this.clearDialog.showModal();
  }

  private executeClear(): void {
    this.stopPlayback();
    this.activeLiveNotes.clear();
    this.stopLiveHoldLoop();
    this.currentTrack.notes = [];
    this.selectedNoteIds.clear();
    this.recentOnsetIntervals = [];
    this.lastOnsetPerf = 0;
    this.renderTimelineOnly();
    this.updateDeleteButtonState();
    this.onToast('Partiture cleared.');
  }

  private getScrollViewport(): HTMLElement | null {
    return this.container.querySelector<HTMLElement>('#partiture-scroll');
  }

  onLiveNoteStart(holeId: HoleId, pitchBend: PitchBend = 'normal'): void {
    const now = performance.now();
    this.recentMotifHoles.push(holeId);
    if (this.recentMotifHoles.length > 12) this.recentMotifHoles.shift();
    const detected = detectSecretMotif(this.recentMotifHoles);
    if (detected) {
      this.recentMotifHoles = [];
      playMelodyChime();
      haptics.melodyDiscovered();
      this.onToast(`Melody Discovered: ${detected}!`);
    }

    if (this.autoBpm && (this.isRecording || this.ocarinaToPartiture) && !this.isPlaying) {
      if (this.lastOnsetPerf > 0) {
        const dtSec = (now - this.lastOnsetPerf) / 1000;
        if (dtSec >= 0.14 && dtSec <= 2.2) {
          this.recentOnsetIntervals.push(dtSec);
          if (this.recentOnsetIntervals.length > 8) this.recentOnsetIntervals.shift();
          if (this.recentOnsetIntervals.length >= 3) {
            const sorted = [...this.recentOnsetIntervals].sort((a, b) => a - b);
            const median = sorted[Math.floor(sorted.length / 2)];
            const calcBpm = Math.max(40, Math.min(220, Math.round(60 / median)));
            this.currentTrack.bpm = calcBpm;
            this.syncBpmDisplay();
          }
          this.lastOnsetPerf = now;
        } else if (dtSec > 2.2) {
          this.recentOnsetIntervals = [];
          this.lastOnsetPerf = now;
        }
      } else {
        this.lastOnsetPerf = now;
      }
    }

    if (!this.isRecording && (!this.ocarinaToPartiture || this.isPlaying)) {
      return;
    }

    if (this.activeLiveNotes.has(holeId)) return;

    const secPerBeat = 60 / Math.max(40, this.currentTrack.bpm);
    let startBeat = 0;

    if (this.isRecording) {
      const rawStartBeat = Math.max(0, (now - this.recordStartMs) / 1000 / secPerBeat);
      startBeat = this.snap(rawStartBeat);
    } else {
      const isChord =
        this.activeLiveNotes.size > 0 || now - this.lastStepGroupStartPerf < 140;
      if (isChord) {
        startBeat = this.lastStepGroupStartBeat;
      } else {
        const nextBeat = this.currentTrack.notes.reduce(
          (max, n) => Math.max(max, n.startBeat + n.durationBeats),
          0
        );
        startBeat = this.snap(nextBeat);
        this.lastStepGroupStartBeat = startBeat;
        this.lastStepGroupStartPerf = now;
      }
    }

    const newNote: PartitureNote = {
      id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      holeId,
      startBeat,
      durationBeats: Math.max(0.25, this.snapBeats || 0.25),
      pitchBend,
    };
    this.currentTrack.notes.push(newNote);
    this.selectedNoteIds = new Set([newNote.id]);
    this.currentTrack.updatedAt = Date.now();
    this.activeLiveNotes.set(holeId, { note: newNote, startPerf: now });

    this.renderTimelineOnly();
    this.updateDeleteButtonState();
    this.ensureBeatVisibleSmooth(newNote.startBeat + newNote.durationBeats);
    this.startLiveHoldLoop();
  }

  onLiveNoteEnd(holeId: HoleId): void {
    const active = this.activeLiveNotes.get(holeId);
    if (!active) return;

    const secPerBeat = 60 / Math.max(40, this.currentTrack.bpm);
    const heldBeats = (performance.now() - active.startPerf) / 1000 / secPerBeat;
    const minDur = Math.max(0.25, this.snapBeats || 0.25);
    active.note.durationBeats = Math.max(minDur, this.snap(heldBeats));
    this.activeLiveNotes.delete(holeId);
    this.currentTrack.updatedAt = Date.now();

    if (this.activeLiveNotes.size === 0) {
      this.stopLiveHoldLoop();
    }
    this.renderTimelineOnly();
    this.ensureBeatVisibleSmooth(active.note.startBeat + active.note.durationBeats);
  }

  private startLiveHoldLoop(): void {
    if (this.liveHoldRaf !== null) return;
    const tick = () => {
      if (this.activeLiveNotes.size === 0) {
        this.liveHoldRaf = null;
        return;
      }
      const secPerBeat = 60 / Math.max(40, this.currentTrack.bpm);
      const now = performance.now();
      for (const [, entry] of this.activeLiveNotes) {
        const heldBeats = Math.max(0.25, (now - entry.startPerf) / 1000 / secPerBeat);
        entry.note.durationBeats = heldBeats;
        const noteEl = this.container.querySelector<HTMLElement>(
          `.partiture-note[data-note-id="${entry.note.id}"]`
        );
        if (noteEl) this.placeNoteEl(noteEl, entry.note);
      }
      this.liveHoldRaf = requestAnimationFrame(tick);
    };
    this.liveHoldRaf = requestAnimationFrame(tick);
  }

  private stopLiveHoldLoop(): void {
    if (this.liveHoldRaf !== null) {
      cancelAnimationFrame(this.liveHoldRaf);
      this.liveHoldRaf = null;
    }
  }

  private syncBpmDisplay(): void {
    const bpmInput = this.dockLeft.querySelector<HTMLInputElement>('#comp-bpm');
    if (bpmInput) bpmInput.value = String(this.currentTrack.bpm);
    const hudBpm = this.container.querySelector<HTMLElement>('#comp-hud-bpm');
    if (hudBpm) hudBpm.textContent = `${this.currentTrack.bpm} BPM`;
  }

  /** Keep a beat on screen: the score slides so the writing point stays in the upper part. */
  private ensureBeatVisibleSmooth(beat: number, _instant = false): void {
    const visible = this.visibleBeats();
    if (beat - this.viewBeat > visible * 0.8) this.setViewBeat(beat - visible * 0.5);
    else if (beat < this.viewBeat) this.setViewBeat(Math.max(0, beat - 1));
  }

  private visibleBeats(): number {
    if (!this.lanePos) return 8;
    const ys = Object.values(this.lanePos).map((p) => p.y);
    return Math.max(4, (Math.min(...ys) - 64) / PX_PER_BEAT);
  }

  private setViewBeat(beat: number): void {
    this.viewBeat = Math.max(0, beat);
    const shift = `translateY(${(this.viewBeat * PX_PER_BEAT).toFixed(1)}px)`;
    this.container.querySelectorAll<HTMLElement>('.lane-track, .score-beats-track').forEach((el) => {
      el.style.transform = shift;
    });
    this.placeCursor();
  }

  /** The recording cursor: where new notes are being written. */
  private placeCursor(): void {
    const cursor = this.container.querySelector<HTMLElement>('#score-cursor');
    if (!cursor || !this.lanePos) return;
    if (!this.isRecording) {
      cursor.hidden = true;
      return;
    }
    const secPerBeat = 60 / Math.max(40, this.currentTrack.bpm);
    const beat = (performance.now() - this.recordStartMs) / 1000 / secPerBeat;
    const base = this.baseline();
    cursor.hidden = false;
    cursor.style.transform = `translateY(${(base - (beat - this.viewBeat) * PX_PER_BEAT).toFixed(1)}px)`;
  }

  private startRecordCursor(): void {
    const tick = () => {
      if (!this.isRecording) {
        this.recordCursorRaf = null;
        this.placeCursor();
        return;
      }
      const secPerBeat = 60 / Math.max(40, this.currentTrack.bpm);
      this.ensureBeatVisibleSmooth((performance.now() - this.recordStartMs) / 1000 / secPerBeat);
      this.placeCursor();
      this.recordCursorRaf = requestAnimationFrame(tick);
    };
    if (this.recordCursorRaf === null) this.recordCursorRaf = requestAnimationFrame(tick);
  }

  private stopRecordCursor(): void {
    if (this.recordCursorRaf !== null) cancelAnimationFrame(this.recordCursorRaf);
    this.recordCursorRaf = null;
  }

  private baseline(): number {
    if (!this.lanePos) return 300;
    const ys = Object.values(this.lanePos).map((p) => p.y);
    return ys.reduce((a, b) => a + b, 0) / ys.length;
  }

  /** Note box inside its lane track: bottom at its start beat, growing upward with its length. */
  private placeNoteEl(el: HTMLElement, n: PartitureNote): void {
    const lane = this.lanePos?.[n.holeId];
    if (!lane) return;
    const h = Math.max(this.laneW * 0.55, n.durationBeats * PX_PER_BEAT);
    el.style.top = `${(lane.y - n.startBeat * PX_PER_BEAT - h).toFixed(1)}px`;
    el.style.height = `${h.toFixed(1)}px`;
  }

  private snap(beats: number): number {
    if (this.snapBeats <= 0) return Math.round(beats * 100) / 100;
    return Math.round(beats / this.snapBeats) * this.snapBeats;
  }

  private getTotalBeats(): number {
    const maxNote = this.currentTrack.notes.reduce(
      (max, n) => Math.max(max, n.startBeat + n.durationBeats),
      16
    );
    return Math.max(16, Math.ceil((maxNote + 4) / 4) * 4);
  }

  render(): void {
    const activePl = this.playlists.find((p) => p.id === this.activePlaylistId) || this.playlists[0];

    this.container.innerHTML = `
      <div class="composer-top-clean">
        <div class="composer-minimal-bar">
          <button type="button" class="comp-bar-btn" id="btn-back-title">${icons.back}<span>Menu</span></button>
          <div class="composer-minimal-info">
            <strong id="comp-hud-title">${this.escapeHtml(this.currentTrack.title)}</strong>
            <span class="hud-bpm-pill" id="comp-hud-bpm">${this.currentTrack.bpm} BPM</span>
          </div>
          <button type="button" class="comp-bar-btn" id="btn-songbook" aria-expanded="${this.dockLeft.classList.contains('is-open')}" aria-controls="composer-dock-left">${icons.songbook}<span>Songbook</span></button>
        </div>
        <div class="partiture-timeline-scroll" id="partiture-scroll">
          <div class="partiture-timeline" id="partiture-timeline"></div>
        </div>
      </div>
    `;

    this.dockLeft.innerHTML = `
      <div class="songbook">
        <header class="songbook-head">
          <h2>Songbook</h2>
          <button type="button" class="icon-btn" id="btn-songbook-close" aria-label="Close songbook">${icons.close}</button>
        </header>

        <section class="songbook-section">
          <h3>This song</h3>
          <label class="field">
            <span>Name</span>
            <input type="text" id="comp-track-title" class="text-input dock-input" value="${this.escapeHtml(this.currentTrack.title)}" />
          </label>
          <div class="field-row">
            <label class="field">
              <span>Tempo</span>
              <span class="field-inline"><input type="number" id="comp-bpm" min="40" max="220" value="${this.currentTrack.bpm}" /> BPM</span>
            </label>
            <label class="field">
              <span>Snap notes to</span>
              <select id="comp-snap">
                <option value="0.25" ${this.snapBeats === 0.25 ? 'selected' : ''}>Quarter beat</option>
                <option value="0.5" ${this.snapBeats === 0.5 ? 'selected' : ''}>Half beat</option>
                <option value="1" ${this.snapBeats === 1 ? 'selected' : ''}>Whole beat</option>
                <option value="0" ${this.snapBeats === 0 ? 'selected' : ''}>Free</option>
              </select>
            </label>
          </div>
          <label class="toggle-row compact">
            <span><strong>Follow my tempo</strong><span class="muted-text">Set the BPM from how you play.</span></span>
            <input type="checkbox" class="switch" id="btn-comp-auto-bpm" ${this.autoBpm ? 'checked' : ''} />
          </label>
        </section>

        <section class="songbook-section">
          <h3>Collection</h3>
          <div class="field-row">
            <select id="comp-playlist-select" class="text-input dock-input" aria-label="Collection">
              ${this.playlists.map((pl) => `<option value="${pl.id}" ${pl.id === activePl?.id ? 'selected' : ''}>${this.escapeHtml(pl.name)} (${pl.tracks.length})</option>`).join('')}
            </select>
            <button type="button" class="btn btn-secondary" id="btn-pl-new" title="New collection" aria-label="New collection">+</button>
          </div>
          <button type="button" class="btn btn-gold" id="btn-comp-save">${icons.save}Save to collection</button>
        </section>

        <section class="songbook-section">
          <h3>Start from a tune</h3>
          <select id="comp-sample-select" class="text-input dock-input" aria-label="Start from a tune">
            <option value="">Choose a tune…</option>
            ${SAMPLE_SONGS.map(
              (s) => `<option value="sample:${s.id}" ${this.currentTrack.id === s.id ? 'selected' : ''}>${this.escapeHtml(s.title)}</option>`
            ).join('')}
          </select>
        </section>

        <section class="songbook-section">
          <h3>Files</h3>
          <div class="field-row">
            <button type="button" class="btn btn-secondary" id="btn-export-mp3">${icons.install}Audio (MP3)</button>
            <button type="button" class="btn btn-secondary" id="btn-export-txt">${icons.install}Notes (.txt)</button>
          </div>
          <label class="btn btn-secondary file-btn">
            ${icons.upload}Open notes file
            <input type="file" id="input-import-txt" accept=".txt,text/plain" hidden />
          </label>
        </section>
      </div>
    `;

    this.dockRight.innerHTML = `
      <div class="transport" role="toolbar" aria-label="Recording">
        <button type="button" class="transport-tool ${this.ocarinaToPartiture ? 'is-on' : ''}" id="btn-comp-step-input" aria-pressed="${this.ocarinaToPartiture}" title="Write notes as you play">${icons.quill}<span>Write</span></button>
        <button type="button" class="transport-tool ${this.useMetronome ? 'is-on' : ''}" id="btn-comp-metro" aria-pressed="${this.useMetronome}" title="Metronome">${icons.metronome}<span>Beat</span></button>
        <span class="transport-sep"></span>
        <button type="button" class="transport-main is-rec ${this.isRecording ? 'is-recording' : ''}" id="btn-comp-rec" aria-pressed="${this.isRecording}" title="Record">${icons.record}<span>${this.isRecording ? 'Recording' : 'Record'}</span></button>
        <button type="button" class="transport-main" id="btn-comp-play">${this.playLabel()}</button>
        <button type="button" class="transport-main" id="btn-comp-stop" title="Stop">${icons.stop}<span>Stop</span></button>
        <span class="transport-sep"></span>
        <button type="button" class="transport-tool" id="btn-comp-del-note" ${this.selectedNoteIds.size > 0 ? '' : 'disabled'} title="Delete selected notes">${icons.trash}<span>Delete</span></button>
        <button type="button" class="transport-tool" id="btn-comp-clear" title="Clear all notes">${icons.eraser}<span>Clear</span></button>
      </div>
    `;

    this.dockLeft.querySelector('#btn-songbook-close')?.addEventListener('click', () => this.setSongbookOpen(false));
    this.container.querySelector('#btn-songbook')?.addEventListener('click', () => this.setSongbookOpen(!this.dockLeft.classList.contains('is-open')));

    this.initScrollbar();
    this.renderTimelineOnly();
    this.bindEvents();
  }

  private playLabel(): string {
    return this.isPlaying ? `${icons.pause}<span>Pause</span>` : `${icons.play}<span>Play</span>`;
  }

  private setSongbookOpen(open: boolean): void {
    this.dockLeft.classList.toggle('is-open', open);
    this.container.querySelector('#btn-songbook')?.setAttribute('aria-expanded', String(open));
    if (open) this.dockLeft.querySelector<HTMLElement>('input, select, button')?.focus();
  }

  private initScrollbar(): void {
    // the vertical score scrolls itself (wheel / touch drag), no scrollbar needed
  }

  private renderTimelineOnly(): void {
    const timeline = this.container.querySelector<HTMLElement>('#partiture-timeline');
    const scoreEl = this.getScrollViewport();
    if (!timeline || !scoreEl) return;

    // Columns sit straight above the ocarina's holes.
    const rect = scoreEl.getBoundingClientRect();
    const screen = this.getHoleScreenPositions();
    const pos = {} as LanePos;
    LANES_TOP_TO_BOTTOM.forEach((id, i) => {
      pos[id] = screen
        ? { x: screen[id].x - rect.left, y: screen[id].y - rect.top }
        : { x: rect.width * (0.3 + i * 0.1), y: rect.height * 0.7 };
    });
    this.lanePos = pos;
    const xs = Object.values(pos).map((p) => p.x).sort((a, b) => a - b);
    const gap = xs.length > 1 ? (xs[xs.length - 1] - xs[0]) / (xs.length - 1) : 60;
    this.laneW = Math.max(30, Math.min(64, gap * 0.82));
    const base = this.baseline();
    const left = xs[0] - this.laneW;
    const width = xs[xs.length - 1] - xs[0] + this.laneW * 2;

    const totalBeats = this.getTotalBeats() + Math.ceil(this.visibleBeats()) + 4;
    const beatLines = Array.from({ length: totalBeats + 1 }, (_, b) => {
      const isBar = b % 4 === 0;
      return `<div class="score-beat ${isBar ? 'is-bar' : ''}" style="top:${(base - b * PX_PER_BEAT).toFixed(1)}px">${isBar ? `<span>${b / 4 + 1}</span>` : ''}</div>`;
    }).join('');

    const lanesHtml = LANES_TOP_TO_BOTTOM.map((holeId) => {
      const meta = HOLE_MAP[holeId];
      const p = pos[holeId];
      const notes = this.currentTrack.notes
        .filter((n) => n.holeId === holeId)
        .map((n) => {
          const selected = this.selectedNoteIds.has(n.id);
          const bend = n.pitchBend ?? 'normal';
          const bendCls = bend === 'up' ? 'is-bend-up' : bend === 'down' ? 'is-bend-down' : '';
          return `
            <div class="partiture-note ${selected ? 'is-selected' : ''} ${bendCls}" data-note-id="${n.id}">
              <span class="note-resize-handle" data-resize-note="${n.id}" title="Drag to change length"></span>
              <span class="note-pill-text">${meta.noteName.replace(/\d/, '')}${bend === 'up' ? '↑' : bend === 'down' ? '↓' : ''}</span>
            </div>`;
        })
        .join('');
      return `
        <div class="lane-grid" data-grid-hole="${holeId}"
             style="--lane:${meta.color};left:${(p.x - this.laneW / 2).toFixed(1)}px;width:${this.laneW.toFixed(1)}px;height:${p.y.toFixed(1)}px">
          <div class="lane-track">${notes}</div>
        </div>`;
    }).join('');

    timeline.innerHTML = `
      <div class="score-beats" style="left:${left.toFixed(1)}px;width:${width.toFixed(1)}px;height:${(base + 1).toFixed(1)}px">
        <div class="score-beats-track">${beatLines}</div>
      </div>
      ${lanesHtml}
      <div class="score-cursor" id="score-cursor" hidden style="left:${left.toFixed(1)}px;width:${width.toFixed(1)}px"></div>
      <div class="selection-marquee" id="selection-marquee"></div>
    `;

    timeline.querySelectorAll<HTMLElement>('.partiture-note').forEach((el) => {
      const n = this.currentTrack.notes.find((x) => x.id === el.dataset.noteId);
      if (n) this.placeNoteEl(el, n);
    });
    this.setViewBeat(this.viewBeat);
    this.bindTimelineInteractions();
  }

  private beatAt(grid: HTMLElement, clientY: number): number {
    const r = grid.getBoundingClientRect();
    return (r.height - (clientY - r.top)) / PX_PER_BEAT + this.viewBeat;
  }

  private laneNearest(clientX: number): HoleId {
    const scoreRect = this.getScrollViewport()!.getBoundingClientRect();
    let best: HoleId = LANES_TOP_TO_BOTTOM[0];
    let bestD = Infinity;
    for (const id of LANES_TOP_TO_BOTTOM) {
      const d = Math.abs(this.lanePos![id].x + scoreRect.left - clientX);
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    return best;
  }

  private bindTimelineInteractions(): void {
    const timeline = this.container.querySelector<HTMLElement>('#partiture-timeline');
    const scoreEl = this.getScrollViewport();
    const marquee = this.container.querySelector<HTMLElement>('#selection-marquee');
    if (!timeline || !scoreEl) return;

    // scroll the score: wheel, or drag with a finger
    if (!scoreEl.dataset.wheelBound) {
      scoreEl.dataset.wheelBound = '1';
      scoreEl.addEventListener(
        'wheel',
        (e) => {
          if (this.isPlaying) return;
          e.preventDefault();
          this.setViewBeat(this.viewBeat + e.deltaY / PX_PER_BEAT);
        },
        { passive: false }
      );
    }

    // Empty column: tap adds a note; drag draws a selection box (mouse) or scrolls (touch)
    timeline.querySelectorAll<HTMLElement>('.lane-grid').forEach((grid) => {
      grid.addEventListener('pointerdown', (e) => {
        if ((e.target as HTMLElement).closest('.partiture-note')) return;
        const startClientX = e.clientX;
        const startClientY = e.clientY;
        const startView = this.viewBeat;
        const isTouch = e.pointerType === 'touch';
        const scoreRect = scoreEl.getBoundingClientRect();
        let dragged = false;

        const onMove = (me: PointerEvent) => {
          if (Math.hypot(me.clientX - startClientX, me.clientY - startClientY) <= 6) return;
          dragged = true;
          if (isTouch) {
            if (!this.isPlaying) this.setViewBeat(startView + (me.clientY - startClientY) / PX_PER_BEAT);
            return;
          }
          if (!marquee) return;
          const x1 = Math.min(startClientX, me.clientX);
          const y1 = Math.min(startClientY, me.clientY);
          const x2 = Math.max(startClientX, me.clientX);
          const y2 = Math.max(startClientY, me.clientY);
          marquee.style.display = 'block';
          marquee.style.left = `${x1 - scoreRect.left}px`;
          marquee.style.top = `${y1 - scoreRect.top}px`;
          marquee.style.width = `${x2 - x1}px`;
          marquee.style.height = `${y2 - y1}px`;
          const nextSel = new Set<string>();
          timeline.querySelectorAll<HTMLElement>('.partiture-note').forEach((nEl) => {
            const nr = nEl.getBoundingClientRect();
            const hit = !(nr.right < x1 || nr.left > x2 || nr.bottom < y1 || nr.top > y2);
            if (hit && nEl.dataset.noteId) nextSel.add(nEl.dataset.noteId);
            nEl.classList.toggle('is-selected', hit);
          });
          this.selectedNoteIds = nextSel;
          this.updateDeleteButtonState();
        };

        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          if (marquee) marquee.style.display = 'none';
          if (dragged) return;
          const holeId = grid.dataset.gridHole as HoleId;
          const note: PartitureNote = {
            id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            holeId,
            startBeat: Math.max(0, this.snap(this.beatAt(grid, startClientY))),
            durationBeats: Math.max(0.5, this.snapBeats || 0.5),
            pitchBend: 'normal',
          };
          this.currentTrack.notes.push(note);
          this.selectedNoteIds = new Set([note.id]);
          ocarinaSynth.playOneShot(getBentFrequency(holeId, 'normal'), 0.25, 0.7);
          this.onHighlightHole(holeId, true);
          window.setTimeout(() => this.onHighlightHole(holeId, false), 180);
          haptics.pressHole();
          this.renderTimelineOnly();
          this.updateDeleteButtonState();
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      });
    });

    // Notes: Ctrl/Cmd+click toggles selection; drag moves (across columns too); the top grip changes length
    timeline.querySelectorAll<HTMLElement>('.partiture-note').forEach((el) => {
      const noteId = el.dataset.noteId!;
      el.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        const syncSel = () => {
          this.updateDeleteButtonState();
          timeline.querySelectorAll<HTMLElement>('.partiture-note').forEach((nEl) => {
            nEl.classList.toggle('is-selected', this.selectedNoteIds.has(nEl.dataset.noteId || ''));
          });
        };
        if (e.ctrlKey || e.metaKey) {
          if (this.selectedNoteIds.has(noteId)) this.selectedNoteIds.delete(noteId);
          else this.selectedNoteIds.add(noteId);
          syncSel();
          return;
        }
        if (!this.selectedNoteIds.has(noteId)) {
          this.selectedNoteIds = new Set([noteId]);
          syncSel();
        }

        const isResize = (e.target as HTMLElement).classList.contains('note-resize-handle');
        const startY = e.clientY;
        const startLane = this.laneNearest(e.clientX);
        const targets = this.currentTrack.notes.filter((n) => this.selectedNoteIds.has(n.id));
        const orig = targets.map((n) => ({ note: n, beat: n.startBeat, dur: n.durationBeats, laneIdx: LANES_ORDER_X().indexOf(n.holeId) }));
        let moved = false;

        const onMove = (me: PointerEvent) => {
          const dBeats = (startY - me.clientY) / PX_PER_BEAT;
          if (Math.abs(me.clientY - startY) > 3) moved = true;
          const laneShift = LANES_ORDER_X().indexOf(this.laneNearest(me.clientX)) - LANES_ORDER_X().indexOf(startLane);
          for (const item of orig) {
            if (isResize) {
              item.note.durationBeats = Math.max(0.25, this.snap(item.dur + dBeats));
            } else {
              item.note.startBeat = Math.max(0, this.snap(item.beat + dBeats));
              const order = LANES_ORDER_X();
              item.note.holeId = order[Math.max(0, Math.min(order.length - 1, item.laneIdx + laneShift))];
            }
          }
          this.renderNotesOnly();
        };

        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          if (moved) this.currentTrack.updatedAt = Date.now();
          this.renderTimelineOnly();
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      });
    });
  }

  /** Cheap redraw while dragging: move note boxes between columns without rebinding everything. */
  private renderNotesOnly(): void {
    const timeline = this.container.querySelector<HTMLElement>('#partiture-timeline');
    if (!timeline) return;
    for (const n of this.currentTrack.notes) {
      const el = timeline.querySelector<HTMLElement>(`.partiture-note[data-note-id="${n.id}"]`);
      if (!el) continue;
      const track = timeline.querySelector<HTMLElement>(`.lane-grid[data-grid-hole="${n.holeId}"] .lane-track`);
      if (track && el.parentElement !== track) track.appendChild(el);
      this.placeNoteEl(el, n);
    }
  }

  private updateDeleteButtonState(): void {
    const delBtn = this.dockRight.querySelector<HTMLButtonElement>('#btn-comp-del-note');
    if (delBtn) delBtn.disabled = this.selectedNoteIds.size === 0;
  }

  private bindEvents(): void {
    this.container.querySelector('#btn-back-title')?.addEventListener('click', () => {
      this.onBackToMenu();
    });

    this.dockLeft.querySelector<HTMLSelectElement>('#comp-sample-select')?.addEventListener('change', (e) => {
      const val = (e.target as HTMLSelectElement).value;
      if (!val.startsWith('sample:')) return;
      const songId = val.slice(7);
      const sample = SAMPLE_SONGS.find((s) => s.id === songId);
      if (!sample) return;
      playUiClick();
      haptics.tapButton();
      this.stopPlayback();
      this.currentTrack = structuredClone(sample);
      this.selectedNoteIds.clear();
      this.recentOnsetIntervals = [];
      this.lastOnsetPerf = 0;
      this.onToast(`Loaded sample: ${sample.title}`);
      this.render();
    });

    this.dockLeft.querySelector<HTMLInputElement>('#comp-track-title')?.addEventListener('input', (e) => {
      this.currentTrack.title = (e.target as HTMLInputElement).value;
      const hudTitle = this.container.querySelector('#comp-hud-title');
      if (hudTitle) hudTitle.textContent = this.currentTrack.title;
    });

    this.dockLeft.querySelector<HTMLInputElement>('#comp-bpm')?.addEventListener('change', (e) => {
      const val = Math.max(40, Math.min(220, parseInt((e.target as HTMLInputElement).value, 10) || 100));
      this.currentTrack.bpm = val;
      this.autoBpm = false;
      const autoEl = this.dockLeft.querySelector<HTMLInputElement>('#btn-comp-auto-bpm');
      if (autoEl) autoEl.checked = false;
      this.syncBpmDisplay();
    });

    this.dockLeft.querySelector('#btn-comp-auto-bpm')?.addEventListener('click', (e) => {
      this.autoBpm = !this.autoBpm;
      this.recentOnsetIntervals = [];
      this.lastOnsetPerf = 0;
      playUiClick();
      haptics.tapButton();
      (e.currentTarget as HTMLButtonElement).classList.toggle('is-on', this.autoBpm);
    });

    this.dockLeft.querySelector<HTMLSelectElement>('#comp-snap')?.addEventListener('change', (e) => {
      this.snapBeats = parseFloat((e.target as HTMLSelectElement).value);
      playUiClick();
      haptics.tapButton();
    });

    this.dockRight.querySelector('#btn-comp-step-input')?.addEventListener('click', (e) => {
      this.ocarinaToPartiture = !this.ocarinaToPartiture;
      playUiClick();
      haptics.tapButton();
      const btn = e.currentTarget as HTMLButtonElement;
      btn.classList.toggle('is-on', this.ocarinaToPartiture);
      btn.setAttribute('aria-pressed', String(this.ocarinaToPartiture));
    });

    this.dockRight.querySelector('#btn-comp-rec')?.addEventListener('click', () => this.toggleRecord());
    this.dockRight.querySelector('#btn-comp-play')?.addEventListener('click', () => this.togglePlay());
    this.dockRight.querySelector('#btn-comp-stop')?.addEventListener('click', () => {
      playUiClick();
      haptics.tapButton();
      this.stopPlayback();
    });

    this.dockRight.querySelector('#btn-comp-metro')?.addEventListener('click', (e) => {
      this.useMetronome = !this.useMetronome;
      playUiClick();
      haptics.tapButton();
      (e.currentTarget as HTMLButtonElement).classList.toggle('is-on', this.useMetronome);
      (e.currentTarget as HTMLButtonElement).setAttribute('aria-pressed', String(this.useMetronome));
    });

    this.dockRight.querySelector('#btn-comp-del-note')?.addEventListener('click', () => this.deleteSelectedNotes());
    this.dockRight.querySelector('#btn-comp-clear')?.addEventListener('click', () => this.requestClear());

    this.dockLeft.querySelector('#comp-playlist-select')?.addEventListener('change', (e) => {
      this.activePlaylistId = (e.target as HTMLSelectElement).value;
      playUiClick();
      this.render();
    });

    this.dockLeft.querySelector('#btn-pl-new')?.addEventListener('click', () => {
      playUiClick();
      haptics.tapButton();
      const name = window.prompt('New Playlist Name:', `Playlist ${this.playlists.length + 1}`);
      if (!name?.trim()) return;
      const pl: Playlist = { id: `pl-${Date.now()}`, name: name.trim(), tracks: [] };
      this.playlists = [...this.playlists, pl];
      this.activePlaylistId = pl.id;
      this.onPlaylistsChange(this.playlists);
      this.render();
    });

    this.dockLeft.querySelector('#btn-comp-save')?.addEventListener('click', () => {
      const pl = this.playlists.find((p) => p.id === this.activePlaylistId) || this.playlists[0];
      if (!pl) return;
      playUiClick();
      haptics.victory();
      this.currentTrack.updatedAt = Date.now();
      const idx = pl.tracks.findIndex((t) => t.id === this.currentTrack.id);
      if (idx >= 0) {
        pl.tracks[idx] = structuredClone(this.currentTrack);
      } else {
        pl.tracks.push(structuredClone(this.currentTrack));
      }
      this.onPlaylistsChange(this.playlists);
      this.onToast(`Saved "${this.currentTrack.title}" to ${pl.name}!`);
      this.render();
    });

    this.dockLeft.querySelector('#btn-export-mp3')?.addEventListener('click', async () => {
      if (this.currentTrack.notes.length === 0) {
        this.onToast('Add or record some notes before exporting MP3!');
        haptics.miss();
        return;
      }
      playUiClick();
      haptics.tapButton();
      this.onToast('Rendering MP3 audio...');
      try {
        const blob = await exportTrackToMp3(this.currentTrack);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.slugify(this.currentTrack.title)}.mp3`;
        a.click();
        URL.revokeObjectURL(url);
        haptics.victory();
        this.onToast('MP3 exported!');
      } catch (err) {
        console.error(err);
        this.onToast('MP3 export failed.');
      }
    });

    this.dockLeft.querySelector('#btn-export-txt')?.addEventListener('click', () => {
      playUiClick();
      haptics.tapButton();
      const text = serializePartitureText(this.currentTrack);
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${this.slugify(this.currentTrack.title)}.ocarina.txt`;
      a.click();
      URL.revokeObjectURL(url);
      this.onToast('Partiture .txt downloaded!');
    });

    this.dockLeft.querySelector<HTMLInputElement>('#input-import-txt')?.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const raw = await file.text();
      const parsed = parsePartitureText(raw);
      if (parsed.notes.length === 0) {
        haptics.miss();
        this.onToast('No valid notes found in partiture file.');
        return;
      }
      this.stopPlayback();
      this.currentTrack = parsed;
      this.selectedNoteIds.clear();
      haptics.victory();
      this.onToast(`Loaded "${parsed.title}" (${parsed.notes.length} notes)!`);
      this.render();
    });
  }

  private startPlayback(): void {
    this.isPlaying = true;
    const secPerBeat = 60 / this.currentTrack.bpm;
    this.playStartPerf = performance.now() - this.playheadBeat * secPerBeat * 1000;
    this.lastMetronomeBeat = Math.floor(this.playheadBeat) - 1;

    const btn = this.dockRight.querySelector('#btn-comp-play');
    if (btn) btn.innerHTML = this.playLabel();

    const maxEndBeat = Math.max(
      4,
      this.currentTrack.notes.reduce((m, n) => Math.max(m, n.startBeat + n.durationBeats), 0) + 0.5
    );

    const tick = () => {
      if (!this.isPlaying) return;
      const elapsedSec = (performance.now() - this.playStartPerf) / 1000;
      this.playheadBeat = elapsedSec / secPerBeat;

      const wholeBeat = Math.floor(this.playheadBeat);
      if (this.useMetronome && wholeBeat > this.lastMetronomeBeat) {
        this.lastMetronomeBeat = wholeBeat;
        playMetronomeTick(wholeBeat % 4 === 0);
      }

      for (const n of this.currentTrack.notes) {
        if (!this.playedNoteIds.has(n.id) && this.playheadBeat >= n.startBeat) {
          this.playedNoteIds.add(n.id);
          const durSec = n.durationBeats * secPerBeat;
          ocarinaSynth.playOneShot(getBentFrequency(n.holeId, n.pitchBend ?? 'normal'), durSec, 0.8);
          this.onHighlightHole(n.holeId, true);
          window.setTimeout(() => this.onHighlightHole(n.holeId, false), Math.min(400, durSec * 900));
        }
      }

      // the score slides down so each note lands in its hole as it sounds
      this.setViewBeat(this.playheadBeat);

      if (this.playheadBeat >= maxEndBeat) {
        this.stopPlayback();
        return;
      }
      this.playTimer = requestAnimationFrame(tick);
    };

    this.playTimer = requestAnimationFrame(tick);
  }

  private pausePlayback(): void {
    this.isPlaying = false;
    if (this.playTimer !== null) cancelAnimationFrame(this.playTimer);
    this.playTimer = null;
    const btn = this.dockRight.querySelector('#btn-comp-play');
    if (btn) btn.innerHTML = this.playLabel();
  }

  private stopPlayback(): void {
    this.pausePlayback();
    this.playheadBeat = 0;
    this.playedNoteIds.clear();
    this.lastMetronomeBeat = -1;
    this.setViewBeat(0);
  }

  private slugify(s: string): string {
    return (s || 'ocarina-song').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'ocarina-song';
  }

  private escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}
