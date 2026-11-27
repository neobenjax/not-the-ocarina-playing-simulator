/**
 * Small hand-drawn icon set: 20px grid, 1.5 stroke, round caps.
 * Every icon inherits currentColor so it follows the text it sits beside.
 */
const wrap = (paths: string) =>
  `<svg class="ui-icon" viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const icons = {
  /** keyboard: a few keycaps */
  controls: wrap(
    '<rect x="2.5" y="5" width="15" height="10" rx="2"/><path d="M5.5 8h.01M8.5 8h.01M11.5 8h.01M14.5 8h.01M6.5 12h7"/>'
  ),
  /** ocarina finish: a small ocarina with a glaze drip */
  finish: wrap(
    '<path d="M2.5 12.5c2-2.6 6.5-4 10.5-3.8 2.6.2 4.4 1.4 4.4 3s-2.2 2.8-5.4 2.8c-4.2 0-7.6-.6-9.5-2z"/><path d="M12.6 8.6l.6-3.1h2l.3 3.4"/><circle cx="8" cy="11.3" r=".6"/><circle cx="10.6" cy="11" r=".6"/>'
  ),
  /** sound & timing: speaker with a wave and a tick */
  sound: wrap('<path d="M3.5 8v4h3l4 3V5l-4 3z"/><path d="M13.5 7.5a3.5 3.5 0 010 5M15.8 5.5a6.4 6.4 0 010 9"/>'),
  /** music: a single eighth note */
  music: wrap('<path d="M8 14.5V4.5l7-1.5v9.5"/><circle cx="6.2" cy="14.5" r="1.8"/><circle cx="13.2" cy="12.5" r="1.8"/>'),
  musicOff: wrap(
    '<path d="M8 14.5V4.5l7-1.5v9.5"/><circle cx="6.2" cy="14.5" r="1.8"/><circle cx="13.2" cy="12.5" r="1.8"/><path d="M3 3l14 14"/>'
  ),
  fullscreen: wrap('<path d="M3.5 7.5v-4h4M16.5 7.5v-4h-4M3.5 12.5v4h4M16.5 12.5v4h-4"/>'),
  install: wrap('<path d="M10 3.5v9M6.5 9l3.5 3.5L13.5 9"/><path d="M4 14.5v2h12v-2"/>'),
  lesson: wrap('<path d="M10 5.5c-2-1.3-4.5-1.6-6.5-1v10.5c2-.6 4.5-.3 6.5 1 2-1.3 4.5-1.6 6.5-1V4.5c-2-.6-4.5-.3-6.5 1zM10 5.5v10.5"/>'),
  /** iOS share sheet glyph: box with an up arrow */
  share: wrap('<path d="M10 2.5v10M6.5 6L10 2.5 13.5 6"/><path d="M6 9H4.5v8.5h11V9H14"/>'),
  back: wrap('<path d="M11.5 5L6.5 10l5 5"/>'),
  play: '<svg class="ui-icon" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M6.5 4.5v11l9-5.5z" fill="currentColor"/></svg>',
  pause: '<svg class="ui-icon" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><rect x="5.5" y="4.5" width="3" height="11" rx="1" fill="currentColor"/><rect x="11.5" y="4.5" width="3" height="11" rx="1" fill="currentColor"/></svg>',
  stop: '<svg class="ui-icon" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><rect x="5" y="5" width="10" height="10" rx="1.5" fill="currentColor"/></svg>',
  record: '<svg class="ui-icon" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><circle cx="10" cy="10" r="5" fill="currentColor"/></svg>',
  /** metronome: a pyramid with a swinging arm */
  metronome: wrap('<path d="M7.5 3.5h5l3 13h-11z"/><path d="M10 13.5l3.5-7"/><path d="M5.2 13.5h9.6"/>'),
  /** write notes while playing: quill */
  quill: wrap('<path d="M16 3.5c-5 1-9 5-10.5 11.5M16 3.5c-.5 4-3 7.5-7.5 9"/><path d="M4 16.5l1.5-1.5"/>'),
  trash: wrap('<path d="M4 6h12M8 6V4h4v2M5.5 6l.8 10h7.4l.8-10"/>'),
  /** clear all: eraser */
  eraser: wrap('<path d="M8.5 16.5h8M3.8 12.3l7.5-7.5a1.5 1.5 0 012.1 0l2.8 2.8a1.5 1.5 0 010 2.1l-6.4 6.4H6.8l-3-3a1.5 1.5 0 010-.8z"/><path d="M7.5 8.6l4.6 4.6"/>'),
  /** songbook: closed book with a ribbon */
  songbook: wrap('<path d="M5 3.5h9.5v13H5a1.5 1.5 0 01-1.5-1.5V5A1.5 1.5 0 015 3.5z"/><path d="M3.5 15a1.5 1.5 0 011.5-1.5h9.5"/><path d="M11.5 3.5v5l-1.25-1-1.25 1v-5"/>'),
  save: wrap('<path d="M4.5 3.5h9l2 2v11h-11z"/><path d="M7 3.5v4h5.5v-4M7 16.5v-4.5h6v4.5"/>'),
  upload: wrap('<path d="M10 13V3.5M6.5 7L10 3.5 13.5 7"/><path d="M4 13.5v3h12v-3"/>'),
  restart: wrap('<path d="M4.5 10a5.5 5.5 0 109.4-3.9"/><path d="M14.5 3v3.5H11"/>'),
  menu: wrap('<path d="M4 6h12M4 10h12M4 14h12"/>'),
  close: wrap('<path d="M5 5l10 10M15 5L5 15"/>'),
};
