import { HOLE_MAP, HoleId, PartitureNote, PartitureTrack } from '../../types';

const LABEL_TO_HOLE: Record<string, HoleId> = {
  'a': 'hole-a',
  'hole-a': 'hole-a',
  'd5': 'hole-a',
  '▼': 'hole-down',
  'c-down': 'hole-down',
  'c▼': 'hole-down',
  'hole-down': 'hole-down',
  'f5': 'hole-down',
  '▶': 'hole-right',
  'c-right': 'hole-right',
  'c▶': 'hole-right',
  'hole-right': 'hole-right',
  'a5': 'hole-right',
  '◀': 'hole-left',
  'c-left': 'hole-left',
  'c◀': 'hole-left',
  'hole-left': 'hole-left',
  'b5': 'hole-left',
  '▲': 'hole-up',
  'c-up': 'hole-up',
  'c▲': 'hole-up',
  'hole-up': 'hole-up',
  'd6': 'hole-up',
};

export function serializePartitureText(track: PartitureTrack): string {
  const lines = [
    '# OCARINA PARTITURE v1',
    `TITLE: ${track.title}`,
    `ARTIST: ${track.artist || 'Unknown'}`,
    `BPM: ${Math.round(track.bpm)}`,
    '---',
    '# BEAT | HOLE | DURATION | NOTE',
  ];

  const sorted = [...track.notes].sort((a, b) => a.startBeat - b.startBeat);
  for (const n of sorted) {
    const meta = HOLE_MAP[n.holeId];
    lines.push(
      `${n.startBeat.toFixed(2)} | ${meta.ootButton} | ${n.durationBeats.toFixed(2)} | ${meta.noteName}`
    );
  }
  return lines.join('\n') + '\n';
}

export function parsePartitureText(raw: string): PartitureTrack {
  const lines = raw.split(/\r?\n/);
  let title = 'Imported Partiture';
  let artist = 'Traveler';
  let bpm = 110;
  const notes: PartitureNote[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed === '---') continue;

    if (trimmed.toUpperCase().startsWith('TITLE:')) {
      title = trimmed.slice(6).trim() || title;
      continue;
    }
    if (trimmed.toUpperCase().startsWith('ARTIST:')) {
      artist = trimmed.slice(7).trim() || artist;
      continue;
    }
    if (trimmed.toUpperCase().startsWith('BPM:')) {
      const parsed = parseFloat(trimmed.slice(4).trim());
      if (!Number.isNaN(parsed) && parsed >= 40 && parsed <= 240) bpm = parsed;
      continue;
    }

    const parts = trimmed.split('|').map((p) => p.trim());
    if (parts.length >= 2) {
      const startBeat = parseFloat(parts[0]);
      const holeKey = parts[1].toLowerCase().replace(/\s+/g, '');
      const holeId = LABEL_TO_HOLE[holeKey] || LABEL_TO_HOLE[parts[1].toLowerCase()];
      const durationBeats = parts[2] ? Math.max(0.25, parseFloat(parts[2]) || 0.5) : 0.5;
      if (!Number.isNaN(startBeat) && startBeat >= 0 && holeId) {
        notes.push({
          id: `imp-${Date.now()}-${notes.length}`,
          holeId,
          startBeat,
          durationBeats,
        });
      }
    }
  }

  return {
    id: `trk-${Date.now()}`,
    title,
    artist,
    bpm,
    notes: notes.sort((a, b) => a.startBeat - b.startBeat),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export interface SecretMotif {
  name: string;
  sequence: HoleId[];
}

export const SECRET_MOTIFS: SecretMotif[] = [
  { name: 'Princess Nap Time', sequence: ['hole-left', 'hole-up', 'hole-right', 'hole-left', 'hole-up', 'hole-right'] },
  { name: "Horse Girl's Whistle", sequence: ['hole-up', 'hole-left', 'hole-right', 'hole-up', 'hole-left', 'hole-right'] },
  { name: 'Bestie Jam (GPS Lost)', sequence: ['hole-down', 'hole-right', 'hole-left', 'hole-down', 'hole-right', 'hole-left'] },
  { name: 'Daylight Savings Song', sequence: ['hole-right', 'hole-down', 'hole-up', 'hole-right', 'hole-down', 'hole-up'] },
  { name: 'Overdue Deadline Tune', sequence: ['hole-right', 'hole-a', 'hole-down', 'hole-right', 'hole-a', 'hole-down'] },
  { name: 'Windmill Weather Forecast', sequence: ['hole-a', 'hole-down', 'hole-up', 'hole-a', 'hole-down', 'hole-up'] },
];

export function detectSecretMotif(recentHoles: HoleId[]): string | null {
  for (const motif of SECRET_MOTIFS) {
    const len = motif.sequence.length;
    if (recentHoles.length >= len) {
      const slice = recentHoles.slice(-len);
      if (slice.every((h, idx) => h === motif.sequence[idx])) {
        return motif.name;
      }
    }
  }
  return null;
}
