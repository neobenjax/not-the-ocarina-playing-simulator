export interface JudgementCounts {
  perfect: number;
  great: number;
  good: number;
  bad: number;
  miss: number;
  maxCombo: number;
  totalNotes: number;
}

export interface ArcadeResult {
  score: number;          // 0 .. 1,000,000
  scoreThousand: string;  // e.g. "992.450 / 1000"
  grade: string;          // SSS+ .. F
  plate: string;          // Perfect Game .. Rough Game
}

const ARCADE_GRADES: Array<{ min: number; grade: string }> = [
  { min: 995000, grade: 'SSS+' },
  { min: 990000, grade: 'SSS' },
  { min: 985000, grade: 'SS+' },
  { min: 980000, grade: 'SS' },
  { min: 975000, grade: 'S+' },
  { min: 970000, grade: 'S' },
  { min: 960000, grade: 'AAA+' },
  { min: 950000, grade: 'AAA' },
  { min: 940000, grade: 'AA+' },
  { min: 920000, grade: 'AA' },
  { min: 900000, grade: 'A+' },
  { min: 800000, grade: 'A' },
  { min: 700000, grade: 'B' },
  { min: 600000, grade: 'C' },
  { min: 500000, grade: 'D' },
  { min: 0, grade: 'F' },
];

export function calculateArcadeScore(counts: JudgementCounts): ArcadeResult {
  const notes = Math.max(1, counts.totalNotes);
  const weighted =
    counts.perfect +
    0.6 * counts.great +
    0.2 * counts.good +
    0.1 * counts.bad;

  const raw =
    ((0.995 * weighted + 0.005 * counts.maxCombo) / notes) * 1_000_000;
  const score = Math.max(0, Math.min(1_000_000, Math.floor(raw)));
  const scoreThousand = (score / 1000).toFixed(3);

  const grade =
    ARCADE_GRADES.find((g) => score >= g.min)?.grade ?? 'F';

  let plate = 'Rough Game';
  if (counts.miss === 0 && counts.bad === 0 && counts.good === 0 && counts.great === 0) {
    plate = 'Perfect Game';
  } else if (counts.miss === 0 && counts.bad === 0 && counts.good === 0) {
    plate = 'Ultimate Game';
  } else if (counts.miss === 0 && counts.bad === 0) {
    plate = 'Extreme Game';
  } else if (counts.miss === 0) {
    plate = 'Superb Game';
  } else if (counts.miss <= 5) {
    plate = 'Marvelous Game';
  } else if (counts.miss <= 10) {
    plate = 'Talented Game';
  } else if (counts.miss <= 20) {
    plate = 'Fair Game';
  }

  return { score, scoreThousand, grade, plate };
}
