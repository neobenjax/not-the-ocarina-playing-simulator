import {
  AppSettings,
  ArcadeHighScore,
  CustomSvgSkin,
  DEFAULT_KEY_MAPPING,
  DEFAULT_SETTINGS,
  KeyMapping,
  Playlist,
} from '../types';

const KEYS = {
  settings: 'ocarina_sim_settings_v2',
  keyMap: 'ocarina_sim_keymap_v1',
  skinId: 'ocarina_sim_skin_v1',
  customSkins: 'ocarina_sim_custom_skins_v1',
  playlists: 'ocarina_sim_playlists_v1',
  highScores: 'ocarina_sim_scores_v1',
};

function safeRead<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWrite<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadSettings(): AppSettings {
  return { ...DEFAULT_SETTINGS, ...safeRead<Partial<AppSettings>>(KEYS.settings, {}) };
}

export function saveSettings(settings: AppSettings): void {
  safeWrite(KEYS.settings, settings);
}

export function loadKeyMapping(): KeyMapping {
  return { ...DEFAULT_KEY_MAPPING, ...safeRead<Partial<KeyMapping>>(KEYS.keyMap, {}) };
}

export function saveKeyMapping(mapping: KeyMapping): void {
  safeWrite(KEYS.keyMap, mapping);
}

export function loadSelectedSkinId(): string {
  const id = localStorage.getItem(KEYS.skinId);
  if (!id || id === 'ocarina-of-time') return 'royal-sapphire';
  return id;
}

export function saveSelectedSkinId(skinId: string): void {
  try {
    localStorage.setItem(KEYS.skinId, skinId);
  } catch {
    // Ignore
  }
}

export function loadCustomSkins(): CustomSvgSkin[] {
  return safeRead<CustomSvgSkin[]>(KEYS.customSkins, []);
}

export function saveCustomSkins(skins: CustomSvgSkin[]): void {
  safeWrite(KEYS.customSkins, skins);
}

export function loadPlaylists(): Playlist[] {
  const existing = safeRead<Playlist[] | null>(KEYS.playlists, null);
  if (existing && existing.length > 0) return existing;
  const defaultPlaylists: Playlist[] = [
    {
      id: 'pl-starter-compositions',
      name: 'My Compositions',
      tracks: [
        {
          id: 'trk-demo-snooze',
          title: 'My First Waltz',
          artist: 'Wandering Bard',
          bpm: 100,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          notes: [
            { id: 'n1', holeId: 'hole-left', startBeat: 0, durationBeats: 1.5 },
            { id: 'n2', holeId: 'hole-up', startBeat: 1.5, durationBeats: 0.5 },
            { id: 'n3', holeId: 'hole-right', startBeat: 2, durationBeats: 2 },
            { id: 'n4', holeId: 'hole-left', startBeat: 4, durationBeats: 1.5 },
            { id: 'n5', holeId: 'hole-up', startBeat: 5.5, durationBeats: 0.5 },
            { id: 'n6', holeId: 'hole-right', startBeat: 6, durationBeats: 2 },
          ],
        },
      ],
    },
  ];
  savePlaylists(defaultPlaylists);
  return defaultPlaylists;
}

export function savePlaylists(playlists: Playlist[]): void {
  safeWrite(KEYS.playlists, playlists);
}

export function loadHighScores(): Record<string, ArcadeHighScore> {
  return safeRead<Record<string, ArcadeHighScore>>(KEYS.highScores, {});
}

export function saveHighScore(entry: ArcadeHighScore): void {
  const all = loadHighScores();
  const prev = all[entry.songId];
  const playCount = (prev?.playCount ?? 0) + 1;
  if (!prev || entry.score >= prev.score) {
    all[entry.songId] = { ...entry, playCount };
  } else {
    all[entry.songId] = { ...prev, playCount };
  }
  safeWrite(KEYS.highScores, all);
}

export function formatKeyCode(code: string): string {
  if (code === 'Space') return 'SPACE';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Arrow')) return code.slice(5).toUpperCase();
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'SHIFT';
  if (code === 'BracketLeft') return '[';
  if (code === 'BracketRight') return ']';
  return code.toUpperCase();
}
