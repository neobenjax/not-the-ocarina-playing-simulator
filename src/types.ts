export type HoleId = 'hole-a' | 'hole-down' | 'hole-right' | 'hole-left' | 'hole-up';

export interface HoleMeta {
  id: HoleId;
  label: string;
  ootButton: string;
  noteName: string;
  frequency: number;
  color: string;
  defaultKey: string;
}

export const OCARINA_HOLES: HoleMeta[] = [
  { id: 'hole-a', label: 'A', ootButton: 'A', noteName: 'D5', frequency: 587.33, color: '#2f80ed', defaultKey: 'KeyJ' },
  { id: 'hole-down', label: '▼', ootButton: '▼', noteName: 'F5', frequency: 698.46, color: '#f2c94c', defaultKey: 'KeyK' },
  { id: 'hole-right', label: '▶', ootButton: '▶', noteName: 'A5', frequency: 880.0, color: '#27ae60', defaultKey: 'KeyL' },
  { id: 'hole-left', label: '◀', ootButton: '◀', noteName: 'B5', frequency: 987.77, color: '#ff6b35', defaultKey: 'KeyI' },
  { id: 'hole-up', label: '▲', ootButton: '▲', noteName: 'D6', frequency: 1174.66, color: '#e74c3c', defaultKey: 'KeyU' },
];

export const HOLE_MAP: Record<HoleId, HoleMeta> = Object.fromEntries(
  OCARINA_HOLES.map((h) => [h.id, h])
) as Record<HoleId, HoleMeta>;

export interface KeyMapping {
  'hole-a': string;
  'hole-down': string;
  'hole-right': string;
  'hole-left': string;
  'hole-up': string;
  blow: string;
  prevCategory: string;
  nextCategory: string;
}

export const DEFAULT_KEY_MAPPING: KeyMapping = {
  'hole-a': 'KeyJ',
  'hole-down': 'KeyK',
  'hole-right': 'KeyL',
  'hole-left': 'KeyI',
  'hole-up': 'KeyU',
  blow: 'Space',
  prevCategory: 'KeyQ',
  nextCategory: 'KeyE',
};

export interface AppSettings {
  breathMode: boolean;
  hapticsEnabled: boolean;
  bgmEnabled: boolean;
  metronomeEnabled: boolean;
  arcadeAssist: 'novice' | 'original';
  offsetMs: number;
  scrollSpeed: number;
  masterVolume: number;
  ocarinaVolume: number;
  guideVolume: number;
  sfxVolume: number;
  forceHideKeyBadges: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  breathMode: false,
  hapticsEnabled: true,
  bgmEnabled: true,
  metronomeEnabled: true,
  arcadeAssist: 'novice',
  offsetMs: 0,
  scrollSpeed: 1.5,
  masterVolume: 0.85,
  ocarinaVolume: 0.9,
  guideVolume: 0.55,
  sfxVolume: 0.75,
  forceHideKeyBadges: false,
};

export interface PartitureNote {
  id: string;
  holeId: HoleId;
  startBeat: number;
  durationBeats: number;
}

export interface PartitureTrack {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  notes: PartitureNote[];
  createdAt: number;
  updatedAt: number;
}

export interface Playlist {
  id: string;
  name: string;
  tracks: PartitureTrack[];
}

export interface CustomSvgSkin {
  id: string;
  name: string;
  svgContent: string;
  createdAt: number;
}

export interface ArcadeHighScore {
  songId: string;
  score: number;
  grade: string;
  plate: string;
  maxCombo: number;
  playCount?: number;
  correctNotes?: number;
  missedNotes?: number;
  totalNotes?: number;
  updatedAt: number;
}
