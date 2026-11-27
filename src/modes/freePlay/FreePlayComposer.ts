import 'overlayscrollbars/overlayscrollbars.css';
import { OverlayScrollbars } from 'overlayscrollbars';
import { getBentFrequency, HOLE_MAP, HoleId, PartitureNote, PartitureTrack, PitchBend, Playlist } from '../../types';
import { SAMPLE_SONGS } from '../../data/sampleSongs';
import { haptics } from '../../haptics/hapticEngine';
import { ocarinaSynth } from '../../audio/ocarinaSynth';
import { playMelodyChime, playMetronomeTick, playUiClick } from '../../audio/soundMachineSfx';
import { exportTrackToMp3 } from '../../audio/mp3Exporter';
import { detectSecretMotif, parsePartitureText, serializePartitureText } from './partitureFormat';

const LANES_TOP_TO_BOTTOM: HoleId[] = ['hole-up', 'hole-left', 'hole-right', 'hole-down', 'hole-a'];
const PX_PER_BEAT = 64;

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
  private osInstance: ReturnType<typeof OverlayScrollbars> | null = null;

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

    this.clearDialog = document.createElement('dialog');
    this.clearDialog.className = 'game-dialog';
    this.clearDialog.id = 'composer-clear-dialog';
    this.clearDialog.innerHTML = `
      <div class="dialog-header">
        <h2>Clear Track?</h2>
        <button type="button" class="icon-btn" id="clear-dialog-close" aria-label="Close">✕</button>
      </div>
      <div class="dialog-body">
        <p>This will remove all notes from <strong>the current partiture</strong>. Are you sure?</p>
      </div>
      <div class="dialog-footer">
        <button type="button" class="btn btn-secondary" id="clear-dialog-cancel">Cancel</button>
        <button type="button" class="btn btn-danger" id="clear-dialog-confirm">🧹 Clear All Notes</button>
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
    this.osInstance?.destroy();
    this.osInstance = null;
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
    if (this.osInstance) {
      return this.osInstance.elements().viewport;
    }
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
      this.onToast(`✨ Melody Discovered: ${detected}!`);
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
        if (noteEl) {
          noteEl.style.width = `${Math.max(18, heldBeats * PX_PER_BEAT)}px`;
        }
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

  private ensureBeatVisibleSmooth(beat: number, instant = false): void {
    const viewport = this.getScrollViewport();
    if (!viewport) return;
    const targetX = 84 + beat * PX_PER_BEAT;
    const viewW = viewport.clientWidth;
    const currentLeft = viewport.scrollLeft;

    if (targetX > currentLeft + viewW - 72) {
      const nextLeft = Math.max(0, targetX - viewW + 120);
      viewport.scrollTo({ left: nextLeft, behavior: instant ? 'auto' : 'smooth' });
    } else if (targetX < currentLeft + 84 && currentLeft > 0) {
      const nextLeft = Math.max(0, targetX - 110);
      viewport.scrollTo({ left: nextLeft, behavior: instant ? 'auto' : 'smooth' });
    }
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
          <button type="button" class="btn btn-secondary" id="btn-back-title">← Menu</button>
          <div class="composer-minimal-info">
            <strong id="comp-hud-title">${this.escapeHtml(this.currentTrack.title)}</strong>
            <span class="hud-bpm-pill" id="comp-hud-bpm">${this.currentTrack.bpm} BPM</span>
          </div>
        </div>
        <div class="partiture-timeline-scroll" id="partiture-scroll">
          <div class="partiture-timeline" id="partiture-timeline"></div>
        </div>
      </div>
    `;

    this.dockLeft.innerHTML = `
      <div class="dock-card">
        <select id="comp-sample-select" class="text-input dock-input" aria-label="Load Sample Partiture">
          <option value="">🎼 Sample...</option>
          ${SAMPLE_SONGS.map(
            (s) => `<option value="sample:${s.id}" ${this.currentTrack.id === s.id ? 'selected' : ''}>${this.escapeHtml(s.title)}</option>`
          ).join('')}
        </select>

        <input type="text" id="comp-track-title" class="text-input dock-input" value="${this.escapeHtml(this.currentTrack.title)}" aria-label="Track Title" />

        <div class="dock-row">
          <label class="bpm-pill dock-pill">
            <span>BPM</span>
            <input type="number" id="comp-bpm" min="40" max="220" value="${this.currentTrack.bpm}" />
          </label>
          <button type="button" class="btn ${this.autoBpm ? 'is-on' : 'btn-secondary'} dock-btn" id="btn-comp-auto-bpm" title="Auto-calculate BPM from Ocarina rhythm">
            ⚡ Auto
          </button>
          <label class="bpm-pill dock-pill">
            <span>Snap</span>
            <select id="comp-snap">
              <option value="0.25" ${this.snapBeats === 0.25 ? 'selected' : ''}>1/4</option>
              <option value="0.5" ${this.snapBeats === 0.5 ? 'selected' : ''}>1/2</option>
              <option value="1" ${this.snapBeats === 1 ? 'selected' : ''}>1</option>
              <option value="0" ${this.snapBeats === 0 ? 'selected' : ''}>Free</option>
            </select>
          </label>
        </div>

        <div class="dock-row">
          <select id="comp-playlist-select" class="text-input dock-input" aria-label="Select Playlist">
            ${this.playlists.map((pl) => `<option value="${pl.id}" ${pl.id === activePl?.id ? 'selected' : ''}>📁 ${this.escapeHtml(pl.name)} (${pl.tracks.length})</option>`).join('')}
          </select>
          <button type="button" class="btn btn-secondary dock-btn" id="btn-pl-new" title="New Playlist">+</button>
          <button type="button" class="btn btn-gold dock-btn" id="btn-comp-save" title="Save Track">💾 Save</button>
        </div>

        <div class="dock-row">
          <button type="button" class="btn btn-primary dock-btn" id="btn-export-mp3">🎧 MP3</button>
          <button type="button" class="btn btn-outline dock-btn" id="btn-export-txt">📄 .txt</button>
          <label class="btn btn-secondary dock-btn file-btn">
            📥 Load
            <input type="file" id="input-import-txt" accept=".txt,text/plain" hidden />
          </label>
        </div>
      </div>
    `;

    this.dockRight.innerHTML = `
      <div class="dock-card">
        <button type="button" class="btn ${this.ocarinaToPartiture ? 'is-on' : 'btn-secondary'} dock-btn" id="btn-comp-step-input" title="Add notes to partiture as you play">
          ✍️ Input ${this.ocarinaToPartiture ? 'On' : 'Off'}
        </button>
        <button type="button" class="btn ${this.isRecording ? 'btn-danger is-recording' : 'btn-outline'} dock-btn" id="btn-comp-rec">
          ${this.isRecording ? '⏹ Stop Rec' : '● Record'}
        </button>
        <div class="dock-row">
          <button type="button" class="btn btn-primary dock-btn" id="btn-comp-play">
            ${this.isPlaying ? '⏸ Pause' : '▶ Play'}
          </button>
          <button type="button" class="btn btn-secondary dock-btn" id="btn-comp-stop">⏹ Stop</button>
        </div>
        <div class="dock-row">
          <button type="button" class="btn btn-secondary ${this.useMetronome ? 'is-on' : ''} dock-btn" id="btn-comp-metro">🥁 Metro</button>
          <button type="button" class="btn btn-secondary dock-btn" id="btn-comp-del-note" ${this.selectedNoteIds.size > 0 ? '' : 'disabled'}>🗑️ Del</button>
          <button type="button" class="btn btn-secondary dock-btn" id="btn-comp-clear">🧹 Clear</button>
        </div>
      </div>
    `;

    this.initScrollbar();
    this.renderTimelineOnly();
    this.bindEvents();
  }

  private initScrollbar(): void {
    this.osInstance?.destroy();
    this.osInstance = null;
    const scrollEl = this.container.querySelector<HTMLElement>('#partiture-scroll');
    if (scrollEl) {
      this.osInstance = OverlayScrollbars(scrollEl, {
        overflow: { x: 'scroll', y: 'hidden' },
        scrollbars: {
          theme: 'os-theme-light',
          autoHide: 'never',
          clickScroll: true,
        },
      });
    }
  }

  private renderTimelineOnly(): void {
    const timeline = this.container.querySelector<HTMLElement>('#partiture-timeline');
    if (!timeline) return;

    const viewport = this.getScrollViewport();
    const prevScrollLeft = viewport ? viewport.scrollLeft : 0;

    const totalBeats = this.getTotalBeats();
    const widthPx = totalBeats * PX_PER_BEAT;

    const rulerTicks = Array.from({ length: totalBeats + 1 }, (_, b) => {
      const isBar = b % 4 === 0;
      return `<div class="beat-tick ${isBar ? 'is-bar' : ''}" style="left:${b * PX_PER_BEAT}px">${isBar ? `Bar ${b / 4 + 1}` : ''}</div>`;
    }).join('');

    const lanesHtml = LANES_TOP_TO_BOTTOM.map((holeId) => {
      const meta = HOLE_MAP[holeId];
      const laneNotes = this.currentTrack.notes.filter((n) => n.holeId === holeId);
      return `
        <div class="partiture-lane" data-lane-hole="${holeId}" style="width:${widthPx}px">
          <div class="lane-header" style="border-left: 4px solid ${meta.color}">
            <strong>${meta.ootButton}</strong>
            <span>${meta.noteName}</span>
          </div>
          <div class="lane-grid" data-grid-hole="${holeId}">
            ${laneNotes
              .map((n) => {
                const left = n.startBeat * PX_PER_BEAT;
                const width = Math.max(18, n.durationBeats * PX_PER_BEAT);
                const selected = this.selectedNoteIds.has(n.id);
                const bend = n.pitchBend ?? 'normal';
                const bendCls = bend === 'up' ? 'is-bend-up' : bend === 'down' ? 'is-bend-down' : '';
                const bendBadge = bend === 'up' ? '↑' : bend === 'down' ? '↓' : '';
                return `
                  <div class="partiture-note ${selected ? 'is-selected' : ''} ${bendCls}"
                       data-note-id="${n.id}"
                       style="left:${left}px;width:${width}px;background:${meta.color};">
                    <span class="note-pill-text">${meta.ootButton}${bendBadge}</span>
                    <span class="note-resize-handle" data-resize-note="${n.id}" title="Drag to resize"></span>
                  </div>
                `;
              })
              .join('')}
          </div>
        </div>
      `;
    }).join('');

    timeline.style.width = `${widthPx + 84}px`;
    timeline.innerHTML = `
      <div class="partiture-ruler" style="width:${widthPx}px">${rulerTicks}</div>
      <div class="partiture-lanes-wrap">
        ${lanesHtml}
        <div class="selection-marquee" id="selection-marquee"></div>
        <div class="partiture-playhead" id="partiture-playhead" style="left:${84 + this.playheadBeat * PX_PER_BEAT}px"></div>
      </div>
    `;

    if (viewport) {
      viewport.scrollLeft = prevScrollLeft;
    }

    this.bindTimelineInteractions();
  }

  private bindTimelineInteractions(): void {
    const timeline = this.container.querySelector<HTMLElement>('#partiture-timeline');
    const lanesWrap = this.container.querySelector<HTMLElement>('.partiture-lanes-wrap');
    const marquee = this.container.querySelector<HTMLElement>('#selection-marquee');
    if (!timeline || !lanesWrap) return;

    // Empty grid: short click inserts a note; drag (>6px) draws a marquee selection box!
    timeline.querySelectorAll<HTMLElement>('.lane-grid').forEach((grid) => {
      grid.addEventListener('pointerdown', (e) => {
        if ((e.target as HTMLElement).closest('.partiture-note')) return;
        const startClientX = e.clientX;
        const startClientY = e.clientY;
        const wrapRect = lanesWrap.getBoundingClientRect();
        let isDraggingMarquee = false;

        const onMove = (me: PointerEvent) => {
          const dist = Math.hypot(me.clientX - startClientX, me.clientY - startClientY);
          if (dist > 6) {
            isDraggingMarquee = true;
            if (marquee) {
              const x1 = Math.min(startClientX, me.clientX) - wrapRect.left;
              const y1 = Math.min(startClientY, me.clientY) - wrapRect.top;
              const x2 = Math.max(startClientX, me.clientX) - wrapRect.left;
              const y2 = Math.max(startClientY, me.clientY) - wrapRect.top;
              marquee.style.display = 'block';
              marquee.style.left = `${x1}px`;
              marquee.style.top = `${y1}px`;
              marquee.style.width = `${x2 - x1}px`;
              marquee.style.height = `${y2 - y1}px`;

              const selRect = {
                left: Math.min(startClientX, me.clientX),
                right: Math.max(startClientX, me.clientX),
                top: Math.min(startClientY, me.clientY),
                bottom: Math.max(startClientY, me.clientY),
              };
              const nextSel = new Set<string>();
              timeline.querySelectorAll<HTMLElement>('.partiture-note').forEach((nEl) => {
                const nr = nEl.getBoundingClientRect();
                const intersects = !(
                  nr.right < selRect.left ||
                  nr.left > selRect.right ||
                  nr.bottom < selRect.top ||
                  nr.top > selRect.bottom
                );
                if (intersects && nEl.dataset.noteId) {
                  nextSel.add(nEl.dataset.noteId);
                }
                nEl.classList.toggle('is-selected', intersects);
              });
              this.selectedNoteIds = nextSel;
              this.updateDeleteButtonState();
            }
          }
        };

        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          if (marquee) marquee.style.display = 'none';

          if (!isDraggingMarquee) {
            const rect = grid.getBoundingClientRect();
            const x = Math.max(0, startClientX - rect.left);
            const rawBeat = x / PX_PER_BEAT;
            const startBeat = Math.max(0, this.snap(rawBeat));
            const holeId = grid.dataset.gridHole as HoleId;
            const note: PartitureNote = {
              id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              holeId,
              startBeat,
              durationBeats: Math.max(0.5, this.snapBeats || 0.5),
              pitchBend: 'normal',
            };
            this.currentTrack.notes.push(note);
            this.selectedNoteIds = new Set([note.id]);
            ocarinaSynth.playOneShot(getBentFrequency(holeId, 'normal'), 0.25, 0.7);
            haptics.pressHole();
            this.renderTimelineOnly();
            this.updateDeleteButtonState();
          }
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      });
    });

    // Note click (Ctrl+Click toggles multi-select; regular click selects; drag moves/resizes all selected)
    timeline.querySelectorAll<HTMLElement>('.partiture-note').forEach((el) => {
      const noteId = el.dataset.noteId!;
      const note = this.currentTrack.notes.find((n) => n.id === noteId);
      if (!note) return;

      el.addEventListener('pointerdown', (e) => {
        e.stopPropagation();

        if (e.ctrlKey || e.metaKey) {
          if (this.selectedNoteIds.has(noteId)) {
            this.selectedNoteIds.delete(noteId);
          } else {
            this.selectedNoteIds.add(noteId);
          }
          this.updateDeleteButtonState();
          timeline.querySelectorAll<HTMLElement>('.partiture-note').forEach((nEl) => {
            nEl.classList.toggle('is-selected', this.selectedNoteIds.has(nEl.dataset.noteId || ''));
          });
          return;
        }

        if (!this.selectedNoteIds.has(noteId)) {
          this.selectedNoteIds = new Set([noteId]);
          this.updateDeleteButtonState();
          timeline.querySelectorAll<HTMLElement>('.partiture-note').forEach((nEl) => {
            nEl.classList.toggle('is-selected', this.selectedNoteIds.has(nEl.dataset.noteId || ''));
          });
        }

        const isResize = (e.target as HTMLElement).classList.contains('note-resize-handle');
        const startX = e.clientX;
        const startY = e.clientY;
        const targets = this.currentTrack.notes.filter((n) => this.selectedNoteIds.has(n.id));
        const origState = targets.map((n) => ({
          note: n,
          beat: n.startBeat,
          dur: n.durationBeats,
          laneIdx: LANES_TOP_TO_BOTTOM.indexOf(n.holeId),
          el: timeline.querySelector<HTMLElement>(`.partiture-note[data-note-id="${n.id}"]`),
        }));

        const onMove = (me: PointerEvent) => {
          const dxBeats = (me.clientX - startX) / PX_PER_BEAT;
          const dyLanes = Math.round((me.clientY - startY) / 42);
          for (const item of origState) {
            if (isResize) {
              item.note.durationBeats = Math.max(0.25, this.snap(item.dur + dxBeats));
              if (item.el) item.el.style.width = `${Math.max(18, item.note.durationBeats * PX_PER_BEAT)}px`;
            } else {
              item.note.startBeat = Math.max(0, this.snap(item.beat + dxBeats));
              if (item.el) item.el.style.left = `${item.note.startBeat * PX_PER_BEAT}px`;
              const nextIdx = Math.max(0, Math.min(LANES_TOP_TO_BOTTOM.length - 1, item.laneIdx + dyLanes));
              item.note.holeId = LANES_TOP_TO_BOTTOM[nextIdx];
            }
          }
        };

        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          this.currentTrack.updatedAt = Date.now();
          this.renderTimelineOnly();
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      });
    });
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
      this.onToast(`🎼 Loaded sample: ${sample.title}`);
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
      this.dockLeft.querySelector('#btn-comp-auto-bpm')?.classList.remove('is-on');
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
      btn.textContent = `✍️ Input ${this.ocarinaToPartiture ? 'On' : 'Off'}`;
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
        this.onToast('🎧 MP3 exported!');
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
      this.onToast('📄 Partiture .txt downloaded!');
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
      this.onToast(`📥 Loaded "${parsed.title}" (${parsed.notes.length} notes)!`);
      this.render();
    });
  }

  private startPlayback(): void {
    this.isPlaying = true;
    const secPerBeat = 60 / this.currentTrack.bpm;
    this.playStartPerf = performance.now() - this.playheadBeat * secPerBeat * 1000;
    this.lastMetronomeBeat = Math.floor(this.playheadBeat) - 1;

    const btn = this.dockRight.querySelector('#btn-comp-play');
    if (btn) btn.textContent = '⏸ Pause';

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

      const playheadEl = this.container.querySelector<HTMLElement>('#partiture-playhead');
      if (playheadEl) {
        playheadEl.style.left = `${84 + this.playheadBeat * PX_PER_BEAT}px`;
      }

      this.ensureBeatVisibleSmooth(this.playheadBeat, true);

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
    if (btn) btn.textContent = '▶ Play';
  }

  private stopPlayback(): void {
    this.pausePlayback();
    this.playheadBeat = 0;
    this.playedNoteIds.clear();
    this.lastMetronomeBeat = -1;
    const playheadEl = this.container.querySelector<HTMLElement>('#partiture-playhead');
    if (playheadEl) playheadEl.style.left = '84px';
    const viewport = this.getScrollViewport();
    if (viewport) viewport.scrollTo({ left: 0, behavior: 'smooth' });
  }

  private slugify(s: string): string {
    return (s || 'ocarina-song').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'ocarina-song';
  }

  private escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}
