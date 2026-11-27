import { HOLE_MAP, HoleId, PartitureNote, PartitureTrack, PitchBend } from '../../types';

const LABEL_TO_HOLE: Record<string, HoleId> = {
  'a': 'hole-a',
  'hole-a': 'hole-a',
  'd5': 'hole-a',
  '▼': 'hole-down',
  'v': 'hole-down',
  'c-down': 'hole-down',
  'c▼': 'hole-down',
  'hole-down': 'hole-down',
  'f5': 'hole-down',
  '▶': 'hole-right',
  '►': 'hole-right',
  '>': 'hole-right',
  'c-right': 'hole-right',
  'c▶': 'hole-right',
  'hole-right': 'hole-right',
  'a5': 'hole-right',
  '◀': 'hole-left',
  '◄': 'hole-left',
  '<': 'hole-left',
  'c-left': 'hole-left',
  'c◀': 'hole-left',
  'hole-left': 'hole-left',
  'b5': 'hole-left',
  '▲': 'hole-up',
  '^': 'hole-up',
  'c-up': 'hole-up',
  'c▲': 'hole-up',
  'hole-up': 'hole-up',
  'd6': 'hole-up',
};

function formatTokenWithBend(holeId: HoleId, bend?: PitchBend): string {
  const btn = HOLE_MAP[holeId].ootButton;
  if (bend === 'up') return `${btn}(Up)`;
  if (bend === 'down') return `${btn}(Down)`;
  return btn;
}

function parseHoleToken(rawToken: string): { holeId: HoleId; pitchBend: PitchBend } | null {
  let token = rawToken.trim();
  let pitchBend: PitchBend = 'normal';

  const bendMatch = token.match(/\((up|down|normal)\)$/i);
  if (bendMatch) {
    pitchBend = bendMatch[1].toLowerCase() as PitchBend;
    token = token.slice(0, bendMatch.index).trim();
  } else if (token.endsWith('+')) {
    pitchBend = 'up';
    token = token.slice(0, -1).trim();
  } else if (token.endsWith('-')) {
    pitchBend = 'down';
    token = token.slice(0, -1).trim();
  }

  const key = token.toLowerCase().replace(/\s+/g, '');
  const holeId = LABEL_TO_HOLE[key];
  if (!holeId) return null;
  return { holeId, pitchBend };
}

/**
 * Universal Plain-Text Partiture Export (v2)
 * Includes beat-accurate table with pitch-bend column AND a human-readable arrow summary.
 */
export function serializePartitureText(track: PartitureTrack): string {
  const lines = [
    '# OCARINA PARTITURE v2',
    `TITLE: ${track.title}`,
    `ARTIST: ${track.artist || 'Unknown'}`,
    `BPM: ${Math.round(track.bpm)}`,
    '---',
    '# BEAT | HOLE | DURATION | PITCH | NOTE',
  ];

  const sorted = [...track.notes].sort((a, b) => a.startBeat - b.startBeat);
  for (const n of sorted) {
    const meta = HOLE_MAP[n.holeId];
    const bend = n.pitchBend ?? 'normal';
    lines.push(
      `${n.startBeat.toFixed(2)} | ${formatTokenWithBend(n.holeId, bend)} | ${n.durationBeats.toFixed(2)} | ${bend} | ${meta.noteName}`
    );
  }
  return lines.join('\n') + '\n';
}

/**
 * Universal Plain-Text Partiture Import
 * Supports both structured v1/v2 pipe rows (`BEAT | HOLE | DURATION | PITCH`)
 * and inline arrow notation (`▼  ▼(Up)  ◄  —  ▲`).
 */
export function parsePartitureText(raw: string): PartitureTrack {
  const lines = raw.split(/\r?\n/);
  let title = 'Imported Partiture';
  let artist = 'Traveler';
  let bpm = 110;
  const notes: PartitureNote[] = [];
  let seqBeat = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed === '---' || trimmed.startsWith('[')) continue;

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

    if (trimmed.includes('|')) {
      const parts = trimmed.split('|').map((p) => p.trim());
      if (parts.length >= 2) {
        const startBeat = parseFloat(parts[0]);
        const parsedHole = parseHoleToken(parts[1]);
        const durationBeats = parts[2] ? Math.max(0.25, parseFloat(parts[2]) || 0.5) : 0.5;
        let pitchBend: PitchBend = parsedHole?.pitchBend ?? 'normal';
        if (parts[3] && /^(up|down|normal)$/i.test(parts[3])) {
          pitchBend = parts[3].toLowerCase() as PitchBend;
        }
        if (!Number.isNaN(startBeat) && startBeat >= 0 && parsedHole) {
          notes.push({
            id: `imp-${Date.now()}-${notes.length}`,
            holeId: parsedHole.holeId,
            startBeat,
            durationBeats,
            pitchBend,
          });
        }
      }
      continue;
    }

    // Inline universal arrow/tab notation fallback (space-separated tokens, `—` or `-` for rest)
    const tokens = trimmed.split(/\s+/);
    for (const tok of tokens) {
      if (tok === '—' || tok === '--' || tok === '-') {
        seqBeat += 0.5;
        continue;
      }
      const parsedHole = parseHoleToken(tok);
      if (parsedHole) {
        notes.push({
          id: `imp-${Date.now()}-${notes.length}`,
          holeId: parsedHole.holeId,
          startBeat: seqBeat,
          durationBeats: 0.5,
          pitchBend: parsedHole.pitchBend,
        });
        seqBeat += 0.5;
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
