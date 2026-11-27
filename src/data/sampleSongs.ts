import { HoleId, PartitureTrack, PitchBend } from '../types';

export interface SampleSongChart extends PartitureTrack {
  subtitle: string;
  category: string;
}

function makeNotes(
  songId: string,
  seq: Array<[HoleId, number, number, PitchBend?]>
) {
  return seq.map(([holeId, startBeat, durationBeats, pitchBend], idx) => ({
    id: `${songId}-n${idx}`,
    holeId,
    startBeat,
    durationBeats,
    pitchBend: pitchBend ?? 'normal',
  }));
}

export const SAMPLE_SONGS: SampleSongChart[] = [
  {
    id: 'royal-snooze-waltz',
    title: 'Princess Nap Time',
    artist: 'Court Sleepyhead · Castle Bedroom',
    subtitle: '3/4 Waltz · Gentle Starter',
    category: 'Classics',
    bpm: 92,
    createdAt: 0,
    updatedAt: 0,
    notes: makeNotes('royal-snooze-waltz', [
      ['hole-left', 0, 1.5], ['hole-up', 1.5, 0.5], ['hole-right', 2, 1.5],
      ['hole-left', 4, 1.5], ['hole-up', 5.5, 0.5], ['hole-right', 6, 1.5],
      ['hole-left', 8, 1.5], ['hole-up', 9.5, 0.5], ['hole-right', 10, 1.0], ['hole-up', 11, 1.0],
      ['hole-left', 12, 1.5], ['hole-right', 13.5, 0.5], ['hole-down', 14, 2.0],
      ['hole-left', 16, 1.5], ['hole-up', 17.5, 0.5], ['hole-right', 18, 2.0],
    ]),
  },
  {
    id: 'mild-drizzle-forecast',
    title: 'Windmill Weather Forecast',
    artist: 'Grumpy Musician · Spinny Tower',
    subtitle: 'Energetic Triple-Meter Whirlwind',
    category: 'Upbeat',
    bpm: 136,
    createdAt: 0,
    updatedAt: 0,
    notes: makeNotes('mild-drizzle-forecast', [
      ['hole-a', 0, 0.5], ['hole-down', 0.5, 0.5], ['hole-up', 1, 1.5],
      ['hole-a', 3, 0.5], ['hole-down', 3.5, 0.5], ['hole-up', 4, 1.5],
      ['hole-up', 6, 0.5], ['hole-left', 6.5, 0.5], ['hole-up', 7, 0.5], ['hole-left', 7.5, 0.5],
      ['hole-right', 8, 0.5], ['hole-down', 8.5, 0.5], ['hole-a', 9, 1.5],
      ['hole-a', 11, 0.5], ['hole-down', 11.5, 0.5], ['hole-right', 12, 1.0], ['hole-a', 13, 1.5],
      ['hole-a', 15, 0.5], ['hole-down', 15.5, 0.5], ['hole-up', 16, 2.0],
    ]),
  },
  {
    id: 'gps-lost-woods',
    title: 'Bestie Jam (GPS Lost)',
    artist: 'Treehouse DJ · Foggy Pines',
    subtitle: 'Bouncy Syncopated Woods Groove',
    category: 'Upbeat',
    bpm: 140,
    createdAt: 0,
    updatedAt: 0,
    notes: makeNotes('gps-lost-woods', [
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
    id: 'clock-in-anthem',
    title: 'Overdue Deadline Tune',
    artist: 'Chrono Intern · Bell Tower',
    subtitle: 'Solemn Sacred Alarm Motif',
    category: 'Classics',
    bpm: 96,
    createdAt: 0,
    updatedAt: 0,
    notes: makeNotes('clock-in-anthem', [
      ['hole-right', 0, 1.0], ['hole-a', 1, 1.5], ['hole-down', 2.5, 0.5],
      ['hole-right', 3, 1.0], ['hole-a', 4, 1.5], ['hole-down', 5.5, 0.5],
      ['hole-right', 6, 0.5], ['hole-left', 6.5, 0.5], ['hole-right', 7, 1.0],
      ['hole-down', 8, 1.0], ['hole-a', 9, 1.0], ['hole-down', 10, 0.5], ['hole-right', 10.5, 0.5],
      ['hole-a', 11, 2.0],
    ]),
  },
  {
    id: 'pony-express-ballad',
    title: "Horse Girl's Whistle",
    artist: 'Barn Band · Carrot Ranch',
    subtitle: 'Warm Prairie Melody',
    category: 'Classics',
    bpm: 108,
    createdAt: 0,
    updatedAt: 0,
    notes: makeNotes('pony-express-ballad', [
      ['hole-up', 0, 0.5], ['hole-left', 0.5, 0.5], ['hole-right', 1, 2.0],
      ['hole-up', 3, 0.5], ['hole-left', 3.5, 0.5], ['hole-right', 4, 2.0],
      ['hole-up', 6, 0.5], ['hole-left', 6.5, 0.5], ['hole-right', 7, 1.0], ['hole-left', 8, 1.0],
      ['hole-right', 9, 1.0], ['hole-down', 10, 1.0], ['hole-a', 11, 2.0],
    ]),
  },
  {
    id: 'daylight-savings-tune',
    title: 'Daylight Savings Song',
    artist: 'Solar Guard · Sundial Plaza',
    subtitle: 'Crisp Dawn-to-Dusk Arpeggio',
    category: 'Classics',
    bpm: 112,
    createdAt: 0,
    updatedAt: 0,
    notes: makeNotes('daylight-savings-tune', [
      ['hole-right', 0, 0.5], ['hole-down', 0.5, 0.5], ['hole-up', 1, 1.5],
      ['hole-right', 3, 0.5], ['hole-down', 3.5, 0.5], ['hole-up', 4, 1.5],
      ['hole-a', 6, 0.5], ['hole-down', 6.5, 0.5], ['hole-right', 7, 0.5], ['hole-left', 7.5, 0.5],
      ['hole-up', 8, 2.0],
    ]),
  },
  {
    id: 'spicy-taco-tango',
    title: 'Spicy Taco Tango',
    artist: 'Chef Magma · Volcano Sauna',
    subtitle: 'Passionate Flamenco Rhythm + Chords',
    category: 'Upbeat',
    bpm: 116,
    createdAt: 0,
    updatedAt: 0,
    notes: makeNotes('spicy-taco-tango', [
      ['hole-down', 0, 0.5], ['hole-a', 0.5, 0.5], ['hole-down', 1, 0.5], ['hole-a', 1.5, 0.5],
      ['hole-right', 2, 0.5], ['hole-down', 2.5, 0.5], ['hole-right', 3, 0.5], ['hole-down', 3.5, 0.5],
      ['hole-right', 4, 1.0], ['hole-left', 5, 1.0], ['hole-up', 6, 1.5],
      ['hole-left', 8, 0.5], ['hole-right', 8.5, 0.5], ['hole-down', 9, 0.5],
      ['hole-a', 9.5, 1.5], ['hole-right', 9.5, 1.5],
    ]),
  },
  {
    id: 'hydration-reminder-waltz',
    title: 'Hydration Reminder Waltz',
    artist: 'Aqua Bard · Chilly Fountain',
    subtitle: 'Flowing Crystal Ballad',
    category: 'Chill',
    bpm: 88,
    createdAt: 0,
    updatedAt: 0,
    notes: makeNotes('hydration-reminder-waltz', [
      ['hole-a', 0, 1.0], ['hole-down', 1, 1.0], ['hole-right', 2, 1.0],
      ['hole-right', 3, 1.0], ['hole-left', 4, 2.0],
      ['hole-a', 6, 0.5], ['hole-down', 6.5, 0.5], ['hole-right', 7, 1.0],
      ['hole-left', 8, 1.0], ['hole-up', 9, 2.0],
    ]),
  },
  {
    id: 'fridge-raid-nocturne',
    title: '3 AM Fridge Raid',
    artist: 'Midnight Snacker · Pantry Hall',
    subtitle: 'Syncopated Twilight Challenge + Harmony',
    category: 'Chill',
    bpm: 104,
    createdAt: 0,
    updatedAt: 0,
    notes: makeNotes('fridge-raid-nocturne', [
      ['hole-left', 0, 1.0], ['hole-right', 1, 1.0], ['hole-right', 2, 0.5], ['hole-a', 2.5, 0.5],
      ['hole-left', 3, 0.5], ['hole-right', 3.5, 0.5], ['hole-down', 4, 2.0],
      ['hole-down', 6, 0.5], ['hole-right', 6.5, 0.5], ['hole-left', 7, 0.5], ['hole-up', 7.5, 0.5],
      ['hole-left', 8, 1.0], ['hole-right', 9, 1.0],
      ['hole-a', 10, 2.0], ['hole-up', 10, 2.0],
    ]),
  },
  {
    id: 'never-gonna-give-you-up',
    title: 'Never Gonna Give You Up (Chorus)',
    artist: 'Rick Astley · Pitch-Bend Edition',
    subtitle: 'Classic 80s Chorus with Pitch Bending',
    category: 'Pop',
    bpm: 113,
    createdAt: 0,
    updatedAt: 0,
    notes: makeNotes('never-gonna-give-you-up', [
      // Never gonna give you up: ▼ ▼(Up) ◄ ▼(Up) ▲ ▲ ◄
      ['hole-down', 0, 0.5], ['hole-down', 0.5, 0.5, 'up'], ['hole-left', 1, 0.5], ['hole-down', 1.5, 0.5, 'up'],
      ['hole-up', 2, 0.75], ['hole-up', 2.75, 0.75], ['hole-left', 3.5, 1.0],
      // Never gonna let you down: ▼ ▼(Up) ◄ ▼(Up) ◄(Up) ◄ ► ▼(Up) ▼
      ['hole-down', 5, 0.5], ['hole-down', 5.5, 0.5, 'up'], ['hole-left', 6, 0.5], ['hole-down', 6.5, 0.5, 'up'],
      ['hole-left', 7, 0.75, 'up'], ['hole-left', 7.75, 0.75], ['hole-right', 8.5, 0.5], ['hole-down', 9, 0.5, 'up'], ['hole-down', 9.5, 1.0],
      // Never gonna run around and desert you: ▼ ▼(Up) ◄ ▼(Up) ◄(Up) ◄ ► ▼ ▼ ► ▼(Down) A
      ['hole-down', 11, 0.5], ['hole-down', 11.5, 0.5, 'up'], ['hole-left', 12, 0.5], ['hole-down', 12.5, 0.5, 'up'],
      ['hole-left', 13, 0.5, 'up'], ['hole-left', 13.5, 0.5], ['hole-right', 14, 0.5], ['hole-down', 14.5, 0.5],
      ['hole-down', 15, 0.5], ['hole-right', 15.5, 0.5], ['hole-down', 16, 0.5, 'down'], ['hole-a', 16.5, 1.0],
      // Never gonna make you cry: ▼ ▼(Up) ◄ ▼(Up) ▲ ▲ ◄
      ['hole-down', 18, 0.5], ['hole-down', 18.5, 0.5, 'up'], ['hole-left', 19, 0.5], ['hole-down', 19.5, 0.5, 'up'],
      ['hole-up', 20, 0.75], ['hole-up', 20.75, 0.75], ['hole-left', 21.5, 1.0],
      // Never gonna say goodbye: ▼ ▼(Up) ◄ ▼(Up) ▲(Up) ► ▼(Up) ▼(Down) A
      ['hole-down', 23, 0.5], ['hole-down', 23.5, 0.5, 'up'], ['hole-left', 24, 0.5], ['hole-down', 24.5, 0.5, 'up'],
      ['hole-up', 25, 0.75, 'up'], ['hole-right', 25.75, 0.5], ['hole-down', 26.25, 0.5, 'up'], ['hole-down', 26.75, 0.5, 'down'], ['hole-a', 27.25, 1.0],
      // Never gonna tell a lie and hurt you: ▼ ▼(Up) ◄ ▼(Up) ◄(Up) ◄ ► ▼ ▼ ► ▼(Down) A
      ['hole-down', 29, 0.5], ['hole-down', 29.5, 0.5, 'up'], ['hole-left', 30, 0.5], ['hole-down', 30.5, 0.5, 'up'],
      ['hole-left', 31, 0.5, 'up'], ['hole-left', 31.5, 0.5], ['hole-right', 32, 0.5], ['hole-down', 32.5, 0.5],
      ['hole-down', 33, 0.5], ['hole-right', 33.5, 0.5], ['hole-down', 34, 0.5, 'down'], ['hole-a', 34.5, 1.5],
    ]),
  },
  {
    id: 'darude-sandstorm',
    title: 'Darude - Sandstorm',
    artist: 'Sandstorm · Pitch-Bend Edition',
    subtitle: 'High-Speed Synth Riff with Pitch Up',
    category: 'Upbeat',
    bpm: 136,
    createdAt: 0,
    updatedAt: 0,
    notes: makeNotes('darude-sandstorm', [
      // ◄ ◄ ◄ ◄ ◄ — ◄ ◄ ◄ ◄ ◄ ◄ ◄
      ['hole-left', 0, 0.25], ['hole-left', 0.25, 0.25], ['hole-left', 0.5, 0.25], ['hole-left', 0.75, 0.25], ['hole-left', 1, 0.5],
      ['hole-left', 2, 0.25], ['hole-left', 2.25, 0.25], ['hole-left', 2.5, 0.25], ['hole-left', 2.75, 0.25],
      ['hole-left', 3, 0.25], ['hole-left', 3.25, 0.25], ['hole-left', 3.5, 0.5],
      // ▲(Up) ▲(Up) ▲(Up) ▲(Up) ▲(Up) ▲(Up) ▲(Up)
      ['hole-up', 4, 0.25, 'up'], ['hole-up', 4.25, 0.25, 'up'], ['hole-up', 4.5, 0.25, 'up'], ['hole-up', 4.75, 0.25, 'up'],
      ['hole-up', 5, 0.25, 'up'], ['hole-up', 5.25, 0.25, 'up'], ['hole-up', 5.5, 0.5, 'up'],
      // ▲ ▲ ▲ ▲ ▲ ▲ ▲ ► ►
      ['hole-up', 6, 0.25], ['hole-up', 6.25, 0.25], ['hole-up', 6.5, 0.25], ['hole-up', 6.75, 0.25],
      ['hole-up', 7, 0.25], ['hole-up', 7.25, 0.25], ['hole-up', 7.5, 0.5],
      ['hole-right', 8, 0.5], ['hole-right', 8.5, 0.5],
      // ◄ ◄ ◄ ◄ ◄ — ◄ ◄ ◄ ◄ ◄ ◄ ◄ ▲(Up) ▲(Up)
      ['hole-left', 9, 0.25], ['hole-left', 9.25, 0.25], ['hole-left', 9.5, 0.25], ['hole-left', 9.75, 0.25], ['hole-left', 10, 0.5],
      ['hole-left', 11, 0.25], ['hole-left', 11.25, 0.25], ['hole-left', 11.5, 0.25], ['hole-left', 11.75, 0.25],
      ['hole-left', 12, 0.25], ['hole-left', 12.25, 0.25], ['hole-left', 12.5, 0.5],
      ['hole-up', 13, 0.5, 'up'], ['hole-up', 13.5, 0.5, 'up'],
    ]),
  },
  {
    id: 'all-star-chorus',
    title: 'All Star (Chorus)',
    artist: 'Swamp Rockers · Pitch-Bend Edition',
    subtitle: 'Iconic Chorus with Up & Down Bends',
    category: 'Pop',
    bpm: 104,
    createdAt: 0,
    updatedAt: 0,
    notes: makeNotes('all-star-chorus', [
      // ▼(Up) ▲ ◄ ◄ ► ▼(Up) ▼(Up) ◄(Up)
      ['hole-down', 0, 0.5, 'up'], ['hole-up', 0.5, 0.5], ['hole-left', 1, 0.5], ['hole-left', 1.5, 0.5],
      ['hole-right', 2, 0.5], ['hole-down', 2.5, 0.5, 'up'], ['hole-down', 3, 0.5, 'up'], ['hole-left', 3.5, 0.75, 'up'],
      // ◄ ◄ ► ► ▼(Up) ▼(Up) ▲ ◄ ◄ ► ► ▼(Up) ▼(Up) ▼(Down)
      ['hole-left', 4.5, 0.5], ['hole-left', 5, 0.5], ['hole-right', 5.5, 0.5], ['hole-right', 6, 0.5],
      ['hole-down', 6.5, 0.5, 'up'], ['hole-down', 7, 0.5, 'up'], ['hole-up', 7.5, 0.75],
      ['hole-left', 8.5, 0.5], ['hole-left', 9, 0.5], ['hole-right', 9.5, 0.5], ['hole-right', 10, 0.5],
      ['hole-down', 10.5, 0.5, 'up'], ['hole-down', 11, 0.5, 'up'], ['hole-down', 11.5, 1.5, 'down'],
    ]),
  },
];
