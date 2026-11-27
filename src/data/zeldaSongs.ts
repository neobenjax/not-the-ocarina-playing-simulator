import { HoleId, PartitureTrack } from '../types';

export interface ZeldaSongChart extends PartitureTrack {
  subtitle: string;
  level: number;
}

function makeNotes(
  songId: string,
  seq: Array<[HoleId, number, number]>
) {
  return seq.map(([holeId, startBeat, durationBeats], idx) => ({
    id: `${songId}-n${idx}`,
    holeId,
    startBeat,
    durationBeats,
  }));
}

export const ZELDA_SONGS: ZeldaSongChart[] = [
  {
    id: 'zelda-lullaby',
    title: "Zelda's Lullaby",
    artist: 'Koji Kondo · Hyrule Royal Family',
    subtitle: '3/4 Waltz · Gentle Starter',
    bpm: 92,
    level: 2,
    createdAt: 0,
    updatedAt: 0,
    notes: makeNotes('zelda-lullaby', [
      ['hole-left', 0, 1.5], ['hole-up', 1.5, 0.5], ['hole-right', 2, 1.5],
      ['hole-left', 4, 1.5], ['hole-up', 5.5, 0.5], ['hole-right', 6, 1.5],
      ['hole-left', 8, 1.5], ['hole-up', 9.5, 0.5], ['hole-right', 10, 1.0], ['hole-up', 11, 1.0],
      ['hole-left', 12, 1.5], ['hole-right', 13.5, 0.5], ['hole-down', 14, 2.0],
      ['hole-left', 16, 1.5], ['hole-up', 17.5, 0.5], ['hole-right', 18, 2.0],
    ]),
  },
  {
    id: 'song-of-storms',
    title: 'Song of Storms',
    artist: 'Koji Kondo · Kakariko Windmill',
    subtitle: 'Energetic Triple-Meter Whirlwind',
    bpm: 136,
    level: 6,
    createdAt: 0,
    updatedAt: 0,
    notes: makeNotes('song-of-storms', [
      ['hole-a', 0, 0.5], ['hole-down', 0.5, 0.5], ['hole-up', 1, 1.5],
      ['hole-a', 3, 0.5], ['hole-down', 3.5, 0.5], ['hole-up', 4, 1.5],
      ['hole-up', 6, 0.5], ['hole-left', 6.5, 0.5], ['hole-up', 7, 0.5], ['hole-left', 7.5, 0.5],
      ['hole-right', 8, 0.5], ['hole-down', 8.5, 0.5], ['hole-a', 9, 1.5],
      ['hole-a', 11, 0.5], ['hole-down', 11.5, 0.5], ['hole-right', 12, 1.0], ['hole-a', 13, 1.5],
      ['hole-a', 15, 0.5], ['hole-down', 15.5, 0.5], ['hole-up', 16, 2.0],
    ]),
  },
  {
    id: 'sarias-song',
    title: "Saria's Song (Lost Woods)",
    artist: 'Koji Kondo · Kokiri Forest',
    subtitle: 'Bouncy Syncopated Woods Groove',
    bpm: 140,
    level: 7,
    createdAt: 0,
    updatedAt: 0,
    notes: makeNotes('sarias-song', [
      ['hole-down', 0, 0.5], ['hole-right', 0.5, 0.5], ['hole-left', 1, 1.0],
      ['hole-down', 2, 0.5], ['hole-right', 2.5, 0.5], ['hole-left', 3, 1.0],
      ['hole-down', 4, 0.5], ['hole-right', 4.5, 0.5], ['hole-left', 5, 0.5], ['hole-up', 5.5, 0.5],
      ['hole-left', 6, 1.0], ['hole-right', 7, 0.5], ['hole-down', 7.5, 0.5],
      ['hole-right', 8, 0.5], ['hole-down', 8.5, 0.5], ['hole-a', 9, 1.5],
      ['hole-down', 11, 0.5], ['hole-right', 11.5, 0.5], ['hole-left', 12, 1.0],
      ['hole-right', 13, 0.5], ['hole-down', 13.5, 0.5], ['hole-a', 14, 2.0],
    ]),
  },
  {
    id: 'song-of-time',
    title: 'Song of Time',
    artist: 'Koji Kondo · Temple of Time',
    subtitle: 'Solemn Sacred Door Motif',
    bpm: 96,
    level: 3,
    createdAt: 0,
    updatedAt: 0,
    notes: makeNotes('song-of-time', [
      ['hole-right', 0, 1.0], ['hole-a', 1, 1.5], ['hole-down', 2.5, 0.5],
      ['hole-right', 3, 1.0], ['hole-a', 4, 1.5], ['hole-down', 5.5, 0.5],
      ['hole-right', 6, 0.5], ['hole-left', 6.5, 0.5], ['hole-right', 7, 1.0],
      ['hole-down', 8, 1.0], ['hole-a', 9, 1.0], ['hole-down', 10, 0.5], ['hole-right', 10.5, 0.5],
      ['hole-a', 11, 2.0],
    ]),
  },
  {
    id: 'eponas-song',
    title: "Epona's Song",
    artist: 'Koji Kondo · Lon Lon Ranch',
    subtitle: 'Warm Prairie Melody',
    bpm: 108,
    level: 3,
    createdAt: 0,
    updatedAt: 0,
    notes: makeNotes('eponas-song', [
      ['hole-up', 0, 0.5], ['hole-left', 0.5, 0.5], ['hole-right', 1, 2.0],
      ['hole-up', 3, 0.5], ['hole-left', 3.5, 0.5], ['hole-right', 4, 2.0],
      ['hole-up', 6, 0.5], ['hole-left', 6.5, 0.5], ['hole-right', 7, 1.0], ['hole-left', 8, 1.0],
      ['hole-right', 9, 1.0], ['hole-down', 10, 1.0], ['hole-a', 11, 2.0],
    ]),
  },
  {
    id: 'suns-song',
    title: "Sun's Song",
    artist: 'Koji Kondo · Royal Tomb',
    subtitle: 'Crisp Dawn-to-Dusk Arpeggio',
    bpm: 112,
    level: 4,
    createdAt: 0,
    updatedAt: 0,
    notes: makeNotes('suns-song', [
      ['hole-right', 0, 0.5], ['hole-down', 0.5, 0.5], ['hole-up', 1, 1.5],
      ['hole-right', 3, 0.5], ['hole-down', 3.5, 0.5], ['hole-up', 4, 1.5],
      ['hole-a', 6, 0.5], ['hole-down', 6.5, 0.5], ['hole-right', 7, 0.5], ['hole-left', 7.5, 0.5],
      ['hole-up', 8, 2.0],
    ]),
  },
  {
    id: 'bolero-of-fire',
    title: 'Bolero of Fire',
    artist: 'Koji Kondo · Death Mountain Crater',
    subtitle: 'Passionate Flamenco Rhythm',
    bpm: 116,
    level: 6,
    createdAt: 0,
    updatedAt: 0,
    notes: makeNotes('bolero-of-fire', [
      ['hole-down', 0, 0.5], ['hole-a', 0.5, 0.5], ['hole-down', 1, 0.5], ['hole-a', 1.5, 0.5],
      ['hole-right', 2, 0.5], ['hole-down', 2.5, 0.5], ['hole-right', 3, 0.5], ['hole-down', 3.5, 0.5],
      ['hole-right', 4, 1.0], ['hole-left', 5, 1.0], ['hole-up', 6, 1.5],
      ['hole-left', 8, 0.5], ['hole-right', 8.5, 0.5], ['hole-down', 9, 0.5], ['hole-a', 9.5, 1.5],
    ]),
  },
  {
    id: 'serenade-of-water',
    title: 'Serenade of Water',
    artist: 'Koji Kondo · Ice Cavern',
    subtitle: 'Flowing Crystal Ballad',
    bpm: 88,
    level: 4,
    createdAt: 0,
    updatedAt: 0,
    notes: makeNotes('serenade-of-water', [
      ['hole-a', 0, 1.0], ['hole-down', 1, 1.0], ['hole-right', 2, 1.0],
      ['hole-right', 3, 1.0], ['hole-left', 4, 2.0],
      ['hole-a', 6, 0.5], ['hole-down', 6.5, 0.5], ['hole-right', 7, 1.0],
      ['hole-left', 8, 1.0], ['hole-up', 9, 2.0],
    ]),
  },
  {
    id: 'nocturne-of-shadow',
    title: 'Nocturne of Shadow',
    artist: 'Koji Kondo · Kakariko Graveyard',
    subtitle: 'Syncopated Twilight Challenge',
    bpm: 104,
    level: 8,
    createdAt: 0,
    updatedAt: 0,
    notes: makeNotes('nocturne-of-shadow', [
      ['hole-left', 0, 1.0], ['hole-right', 1, 1.0], ['hole-right', 2, 0.5], ['hole-a', 2.5, 0.5],
      ['hole-left', 3, 0.5], ['hole-right', 3.5, 0.5], ['hole-down', 4, 2.0],
      ['hole-down', 6, 0.5], ['hole-right', 6.5, 0.5], ['hole-left', 7, 0.5], ['hole-up', 7.5, 0.5],
      ['hole-left', 8, 1.0], ['hole-right', 9, 1.0], ['hole-a', 10, 2.0],
    ]),
  },
];
