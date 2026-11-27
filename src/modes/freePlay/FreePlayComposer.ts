import { HOLE_MAP, HoleId, PartitureNote, PartitureTrack, Playlist } from '../../types';
import { haptics } from '../../haptics/hapticEngine';
import { ocarinaSynth } from '../../audio/ocarinaSynth';
import { playMelodyChime, playMetronomeTick, playUiClick } from '../../audio/soundMachineSfx';
import { exportTrackToMp3 } from '../../audio/mp3Exporter';
import { detectZeldaMotif, parsePartitureText, serializePartitureText } from './partitureFormat';

const LANES_TOP_TO_BOTTOM: HoleId[] = ['hole-up', 'hole-left', 'hole-right', 'hole-down', 'hole-a'];
const PX_PER_BEAT = 64;

export class FreePlayComposer {
  private container: HTMLElement;
  private playlists: Playlist[];
  private activePlaylistId: string;
  private currentTrack: PartitureTrack;
  private selectedNoteId: string | null = null;
  private snapBeats = 0.5;
  private isRecording = false;
  private isPlaying = false;
  private useMetronome = true;

  private recordStartMs = 0;
  private activeRecordingNote: { holeId: HoleId; startMs: number } | null = null;
  private recentMotifHoles: HoleId[] = [];

  private playTimer: number | null = null;
  private playStartPerf = 0;
  private playheadBeat = 0;
  private lastMetronomeBeat = -1;
  private playedNoteIds = new Set<string>();

  private onPlaylistsChange: (playlists: Playlist[]) => void;
  private onToast: (msg: string) => void;
  private onHighlightHole: (holeId: HoleId, active: boolean) => void;

  constructor(
    container: HTMLElement,
    playlists: Playlist[],
    callbacks: {
      onPlaylistsChange: (playlists: Playlist[]) => void;
      onToast: (msg: string) => void;
      onHighlightHole: (holeId: HoleId, active: boolean) => void;
    }
  ) {
    this.container = container;
    this.playlists = playlists;
    this.activePlaylistId = playlists[0]?.id || '';
    const firstTrack = playlists[0]?.tracks[0];
    this.currentTrack = firstTrack
      ? structuredClone(firstTrack)
      : {
          id: `trk-${Date.now()}`,
          title: 'Untitled Hyrule Melody',
          artist: 'Hero of Time',
          bpm: 100,
          notes: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
    this.onPlaylistsChange = callbacks.onPlaylistsChange;
    this.onToast = callbacks.onToast;
    this.onHighlightHole = callbacks.onHighlightHole;
    this.render();
  }

  destroy(): void {
    this.stopPlayback();
    this.isRecording = false;
  }

  onLiveNoteStart(holeId: HoleId): void {
    this.recentMotifHoles.push(holeId);
    if (this.recentMotifHoles.length > 12) this.recentMotifHoles.shift();
    const detected = detectZeldaMotif(this.recentMotifHoles);
    if (detected) {
      this.recentMotifHoles = [];
      playMelodyChime();
      haptics.melodyDiscovered();
      this.onToast(`✨ Melody Discovered: ${detected}!`);
    }

    if (this.isRecording) {
      if (this.activeRecordingNote) {
        this.finalizeRecordingNote(performance.now());
      }
      this.activeRecordingNote = { holeId, startMs: performance.now() };
    }
  }

  onLiveNoteEnd(holeId: HoleId): void {
    if (this.isRecording && this.activeRecordingNote?.holeId === holeId) {
      this.finalizeRecordingNote(performance.now());
    }
  }

  private finalizeRecordingNote(endMs: number): void {
    if (!this.activeRecordingNote) return;
    const { holeId, startMs } = this.activeRecordingNote;
    this.activeRecordingNote = null;

    const secPerBeat = 60 / this.currentTrack.bpm;
    const rawStartBeat = Math.max(0, (startMs - this.recordStartMs) / 1000 / secPerBeat);
    const rawDurBeats = Math.max(0.25, (endMs - startMs) / 1000 / secPerBeat);

    const startBeat = this.snap(rawStartBeat);
    const durationBeats = Math.max(0.25, this.snap(rawDurBeats));

    this.currentTrack.notes.push({
      id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      holeId,
      startBeat,
      durationBeats,
    });
    this.currentTrack.updatedAt = Date.now();
    this.renderTimelineOnly();
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
      <div class="composer-shell">
        <div class="composer-top-bar">
          <div class="composer-title-group">
            <input type="text" id="comp-track-title" class="text-input comp-title-input" value="${this.escapeHtml(this.currentTrack.title)}" aria-label="Track Title" />
            <label class="bpm-pill">
              <span>BPM</span>
              <input type="number" id="comp-bpm" min="40" max="220" value="${this.currentTrack.bpm}" />
            </label>
            <label class="bpm-pill">
              <span>Snap</span>
              <select id="comp-snap">
                <option value="0.25" ${this.snapBeats === 0.25 ? 'selected' : ''}>1/4</option>
                <option value="0.5" ${this.snapBeats === 0.5 ? 'selected' : ''}>1/2</option>
                <option value="1" ${this.snapBeats === 1 ? 'selected' : ''}>1 Beat</option>
                <option value="0" ${this.snapBeats === 0 ? 'selected' : ''}>Free</option>
              </select>
            </label>
          </div>

          <div class="composer-transport">
            <button type="button" class="btn ${this.isRecording ? 'btn-danger is-recording' : 'btn-outline'}" id="btn-comp-rec">
              ${this.isRecording ? '⏹ Stop Rec' : '● Record'}
            </button>
            <button type="button" class="btn btn-primary" id="btn-comp-play">
              ${this.isPlaying ? '⏸ Pause' : '▶ Play'}
            </button>
            <button type="button" class="btn btn-secondary" id="btn-comp-stop">⏹ Stop</button>
            <button type="button" class="btn btn-secondary ${this.useMetronome ? 'is-on' : ''}" id="btn-comp-metro">🥁 Metro</button>
            <button type="button" class="btn btn-secondary" id="btn-comp-del-note" ${this.selectedNoteId ? '' : 'disabled'}>🗑️ Del Note</button>
            <button type="button" class="btn btn-secondary" id="btn-comp-clear">🧹 Clear</button>
          </div>
        </div>

        <div class="partiture-timeline-scroll" id="partiture-scroll">
          <div class="partiture-timeline" id="partiture-timeline"></div>
        </div>

        <div class="composer-bottom-bar">
          <div class="playlist-controls">
            <select id="comp-playlist-select" class="text-input" aria-label="Select Playlist">
              ${this.playlists.map((pl) => `<option value="${pl.id}" ${pl.id === activePl?.id ? 'selected' : ''}>📁 ${this.escapeHtml(pl.name)} (${pl.tracks.length})</option>`).join('')}
            </select>
            <button type="button" class="btn btn-secondary" id="btn-pl-new">+ Playlist</button>
            <button type="button" class="btn btn-secondary" id="btn-pl-rename">✏️ Rename</button>
            <button type="button" class="btn btn-gold" id="btn-comp-save">💾 Save Track</button>
          </div>

          <div class="export-controls">
            <button type="button" class="btn btn-primary" id="btn-export-mp3">🎧 Export MP3</button>
            <button type="button" class="btn btn-outline" id="btn-export-txt">📄 Partiture .txt</button>
            <label class="btn btn-secondary file-btn">
              📥 Import .txt
              <input type="file" id="input-import-txt" accept=".txt,text/plain" hidden />
            </label>
          </div>
        </div>

        ${
          activePl && activePl.tracks.length > 0
            ? `<div class="playlist-tracks-strip">
                 ${activePl.tracks
                   .map(
                     (t) => `
                   <div class="track-chip ${t.id === this.currentTrack.id ? 'is-active' : ''}">
                     <button type="button" class="track-chip-load" data-load-track="${t.id}">
                       🎵 ${this.escapeHtml(t.title)} <span class="muted-text">(${t.bpm} BPM)</span>
                     </button>
                     <button type="button" class="track-chip-del" data-del-track="${t.id}" aria-label="Delete ${this.escapeHtml(t.title)}">✕</button>
                   </div>`
                   )
                   .join('')}
               </div>`
            : `<p class="muted-text" style="margin:0;">No saved tracks in this playlist yet. Record or click the partiture grid to compose!</p>`
        }
      </div>
    `;

    this.renderTimelineOnly();
    this.bindEvents();
  }

  private renderTimelineOnly(): void {
    const timeline = this.container.querySelector<HTMLElement>('#partiture-timeline');
    if (!timeline) return;

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
                const selected = n.id === this.selectedNoteId;
                return `
                  <div class="partiture-note ${selected ? 'is-selected' : ''}"
                       data-note-id="${n.id}"
                       style="left:${left}px;width:${width}px;background:${meta.color};">
                    <span class="note-pill-text">${meta.ootButton}</span>
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
        <div class="partiture-playhead" id="partiture-playhead" style="left:${84 + this.playheadBeat * PX_PER_BEAT}px"></div>
      </div>
    `;

    this.bindTimelineInteractions();
  }

  private bindTimelineInteractions(): void {
    const timeline = this.container.querySelector<HTMLElement>('#partiture-timeline');
    if (!timeline) return;

    // Click empty lane grid to add note
    timeline.querySelectorAll<HTMLElement>('.lane-grid').forEach((grid) => {
      grid.addEventListener('pointerdown', (e) => {
        if ((e.target as HTMLElement).closest('.partiture-note')) return;
        const rect = grid.getBoundingClientRect();
        const x = Math.max(0, e.clientX - rect.left);
        const rawBeat = x / PX_PER_BEAT;
        const startBeat = Math.max(0, this.snap(rawBeat));
        const holeId = grid.dataset.gridHole as HoleId;
        const note: PartitureNote = {
          id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          holeId,
          startBeat,
          durationBeats: Math.max(0.5, this.snapBeats || 0.5),
        };
        this.currentTrack.notes.push(note);
        this.selectedNoteId = note.id;
        ocarinaSynth.playOneShot(HOLE_MAP[holeId].frequency, 0.25, 0.7);
        haptics.pressHole();
        this.renderTimelineOnly();
        this.updateDeleteButtonState();
      });
    });

    // Drag or resize existing notes
    timeline.querySelectorAll<HTMLElement>('.partiture-note').forEach((el) => {
      const noteId = el.dataset.noteId!;
      const note = this.currentTrack.notes.find((n) => n.id === noteId);
      if (!note) return;

      el.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.selectedNoteId = noteId;
        this.updateDeleteButtonState();
        timeline.querySelectorAll('.partiture-note').forEach((nEl) => {
          nEl.classList.toggle('is-selected', (nEl as HTMLElement).dataset.noteId === noteId);
        });

        const isResize = (e.target as HTMLElement).classList.contains('note-resize-handle');
        const startX = e.clientX;
        const startY = e.clientY;
        const origBeat = note.startBeat;
        const origDur = note.durationBeats;
        const origLaneIdx = LANES_TOP_TO_BOTTOM.indexOf(note.holeId);

        const onMove = (me: PointerEvent) => {
          const dxBeats = (me.clientX - startX) / PX_PER_BEAT;
          if (isResize) {
            note.durationBeats = Math.max(0.25, this.snap(origDur + dxBeats));
            el.style.width = `${Math.max(18, note.durationBeats * PX_PER_BEAT)}px`;
          } else {
            note.startBeat = Math.max(0, this.snap(origBeat + dxBeats));
            el.style.left = `${note.startBeat * PX_PER_BEAT}px`;
            const dyLanes = Math.round((me.clientY - startY) / 42);
            const nextIdx = Math.max(0, Math.min(LANES_TOP_TO_BOTTOM.length - 1, origLaneIdx + dyLanes));
            note.holeId = LANES_TOP_TO_BOTTOM[nextIdx];
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
    const delBtn = this.container.querySelector<HTMLButtonElement>('#btn-comp-del-note');
    if (delBtn) delBtn.disabled = !this.selectedNoteId;
  }

  private bindEvents(): void {
    this.container.querySelector<HTMLInputElement>('#comp-track-title')?.addEventListener('input', (e) => {
      this.currentTrack.title = (e.target as HTMLInputElement).value;
    });

    this.container.querySelector<HTMLInputElement>('#comp-bpm')?.addEventListener('change', (e) => {
      const val = Math.max(40, Math.min(220, parseInt((e.target as HTMLInputElement).value, 10) || 100));
      this.currentTrack.bpm = val;
      (e.target as HTMLInputElement).value = String(val);
    });

    this.container.querySelector<HTMLSelectElement>('#comp-snap')?.addEventListener('change', (e) => {
      this.snapBeats = parseFloat((e.target as HTMLSelectElement).value);
      playUiClick();
      haptics.tapButton();
    });

    this.container.querySelector('#btn-comp-rec')?.addEventListener('click', () => {
      playUiClick();
      haptics.tapButton();
      if (this.isRecording) {
        this.isRecording = false;
        this.activeRecordingNote = null;
        this.stopPlayback();
        this.onToast('Recording stopped!');
      } else {
        this.stopPlayback();
        this.isRecording = true;
        this.recordStartMs = performance.now();
        this.onToast('● Recording live! Play the Ocarina below.');
      }
      this.render();
    });

    this.container.querySelector('#btn-comp-play')?.addEventListener('click', () => {
      playUiClick();
      haptics.tapButton();
      if (this.isPlaying) {
        this.pausePlayback();
      } else {
        this.startPlayback();
      }
    });

    this.container.querySelector('#btn-comp-stop')?.addEventListener('click', () => {
      playUiClick();
      haptics.tapButton();
      this.stopPlayback();
    });

    this.container.querySelector('#btn-comp-metro')?.addEventListener('click', (e) => {
      this.useMetronome = !this.useMetronome;
      playUiClick();
      haptics.tapButton();
      (e.currentTarget as HTMLButtonElement).classList.toggle('is-on', this.useMetronome);
    });

    this.container.querySelector('#btn-comp-del-note')?.addEventListener('click', () => {
      if (!this.selectedNoteId) return;
      playUiClick();
      haptics.tapButton();
      this.currentTrack.notes = this.currentTrack.notes.filter((n) => n.id !== this.selectedNoteId);
      this.selectedNoteId = null;
      this.renderTimelineOnly();
      this.updateDeleteButtonState();
    });

    this.container.querySelector('#btn-comp-clear')?.addEventListener('click', () => {
      playUiClick();
      haptics.tapButton();
      this.stopPlayback();
      this.currentTrack.notes = [];
      this.selectedNoteId = null;
      this.renderTimelineOnly();
      this.updateDeleteButtonState();
      this.onToast('Partiture cleared.');
    });

    this.container.querySelector('#comp-playlist-select')?.addEventListener('change', (e) => {
      this.activePlaylistId = (e.target as HTMLSelectElement).value;
      playUiClick();
      this.render();
    });

    this.container.querySelector('#btn-pl-new')?.addEventListener('click', () => {
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

    this.container.querySelector('#btn-pl-rename')?.addEventListener('click', () => {
      const pl = this.playlists.find((p) => p.id === this.activePlaylistId);
      if (!pl) return;
      playUiClick();
      haptics.tapButton();
      const name = window.prompt('Rename Playlist:', pl.name);
      if (!name?.trim()) return;
      pl.name = name.trim();
      this.onPlaylistsChange(this.playlists);
      this.render();
    });

    this.container.querySelector('#btn-comp-save')?.addEventListener('click', () => {
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

    this.container.querySelectorAll<HTMLButtonElement>('[data-load-track]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pl = this.playlists.find((p) => p.id === this.activePlaylistId);
        const trk = pl?.tracks.find((t) => t.id === btn.dataset.loadTrack);
        if (!trk) return;
        playUiClick();
        haptics.tapButton();
        this.stopPlayback();
        this.currentTrack = structuredClone(trk);
        this.selectedNoteId = null;
        this.render();
      });
    });

    this.container.querySelectorAll<HTMLButtonElement>('[data-del-track]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pl = this.playlists.find((p) => p.id === this.activePlaylistId);
        if (!pl) return;
        playUiClick();
        haptics.tapButton();
        pl.tracks = pl.tracks.filter((t) => t.id !== btn.dataset.delTrack);
        this.onPlaylistsChange(this.playlists);
        this.render();
      });
    });

    this.container.querySelector('#btn-export-mp3')?.addEventListener('click', async () => {
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

    this.container.querySelector('#btn-export-txt')?.addEventListener('click', () => {
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

    this.container.querySelector<HTMLInputElement>('#input-import-txt')?.addEventListener('change', async (e) => {
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

    const btn = this.container.querySelector('#btn-comp-play');
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
          ocarinaSynth.playOneShot(HOLE_MAP[n.holeId].frequency, durSec, 0.8);
          this.onHighlightHole(n.holeId, true);
          window.setTimeout(() => this.onHighlightHole(n.holeId, false), Math.min(400, durSec * 900));
        }
      }

      const playheadEl = this.container.querySelector<HTMLElement>('#partiture-playhead');
      if (playheadEl) {
        playheadEl.style.left = `${84 + this.playheadBeat * PX_PER_BEAT}px`;
      }

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
    const btn = this.container.querySelector('#btn-comp-play');
    if (btn) btn.textContent = '▶ Play';
  }

  private stopPlayback(): void {
    this.pausePlayback();
    this.playheadBeat = 0;
    this.playedNoteIds.clear();
    this.lastMetronomeBeat = -1;
    const playheadEl = this.container.querySelector<HTMLElement>('#partiture-playhead');
    if (playheadEl) playheadEl.style.left = '84px';
  }

  private slugify(s: string): string {
    return (s || 'ocarina-song').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'ocarina-song';
  }

  private escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}
