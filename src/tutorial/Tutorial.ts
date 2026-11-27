import { HOLE_MAP, HoleId, KeyMapping } from '../types';
import { formatKeyCode } from '../storage/persistence';
import { isTouchPrimaryDevice } from '../components/OcarinaSvg';

export interface TutorialCallbacks {
  /** Marks a hole as the one to play next (null clears it). */
  onHint: (holeId: HoleId | null) => void;
  /** Plays a note through the instrument for `ms` milliseconds (demo playback). */
  onDemoNote: (holeId: HoleId, ms: number) => void;
  onFinish: () => void;
}

type Step =
  | { kind: 'learn'; hole: HoleId }
  | { kind: 'echo'; phrase: HoleId[] }
  | { kind: 'done' };

const LEARN_ORDER: HoleId[] = ['hole-a', 'hole-down', 'hole-right', 'hole-left', 'hole-up'];
const STEPS: Step[] = [
  ...LEARN_ORDER.map((hole) => ({ kind: 'learn', hole }) as Step),
  { kind: 'echo', phrase: ['hole-a', 'hole-down', 'hole-right'] },
  { kind: 'echo', phrase: ['hole-right', 'hole-left', 'hole-up', 'hole-left'] },
  { kind: 'done' },
];

/** The closing melody the ocarina plays on its own: [hole, beats]. */
const FINALE: Array<[HoleId, number]> = [
  ['hole-a', 1], ['hole-down', 1], ['hole-right', 2],
  ['hole-right', 1], ['hole-left', 1], ['hole-up', 2],
  ['hole-left', 1], ['hole-right', 1], ['hole-down', 1], ['hole-right', 1], ['hole-a', 3],
];
const FINALE_BEAT_MS = 330;

const DEMO_NOTE_MS = 420;
const DEMO_GAP_MS = 140;

/**
 * First-run lesson: learn each hole, then repeat two short phrases by ear.
 * Input arrives through `onNote`, so keyboard and touch both work.
 */
export class Tutorial {
  private stepIndex = 0;
  private echoProgress = 0;
  private listening = false;
  private timers: number[] = [];
  private readonly touch = isTouchPrimaryDevice();

  constructor(
    private panel: HTMLElement,
    private keyMapping: KeyMapping,
    private breathMode: boolean,
    private cb: TutorialCallbacks,
    startDelayMs = 0
  ) {
    this.later(() => this.showStep(), startDelayMs);
  }

  destroy(): void {
    this.clearTimers();
    this.cb.onHint(null);
  }

  get isFinished(): boolean {
    return STEPS[this.stepIndex].kind === 'done';
  }

  /** Skipping still ends on the melody: jump straight to the closing song. */
  skipToFinale(): void {
    if (this.isFinished) return;
    this.clearTimers();
    this.stepIndex = STEPS.length - 1;
    this.cb.onHint(null);
    this.panel.classList.remove('is-correct', 'is-wrong');
    this.setText('Listen.', 'This is the ocarina’s song.');
    this.playFinale();
  }

  onNote(holeId: HoleId): void {
    const step = STEPS[this.stepIndex];
    if (step.kind === 'learn') {
      if (holeId !== step.hole) return;
      this.cb.onHint(null);
      this.flash('is-correct');
      this.later(() => this.advance(), 520);
      return;
    }
    if (step.kind === 'echo') {
      if (this.listening) return;
      if (holeId === step.phrase[this.echoProgress]) {
        this.echoProgress += 1;
        this.renderDots(step.phrase.length);
        if (this.echoProgress === step.phrase.length) {
          this.listening = true;
          this.flash('is-correct');
          this.later(() => this.advance(), 700);
        }
      } else {
        this.echoProgress = 0;
        this.listening = true;
        this.setText('Not quite.', 'Listen once more.');
        this.flash('is-wrong');
        this.later(() => this.playPhrase(step.phrase), 900);
      }
    }
  }

  private advance(): void {
    this.stepIndex = Math.min(this.stepIndex + 1, STEPS.length - 1);
    this.showStep();
  }

  private keyFor(hole: HoleId): string {
    return formatKeyCode(this.keyMapping[hole]);
  }

  private showStep(): void {
    this.clearTimers();
    const step = STEPS[this.stepIndex];
    const learnTotal = LEARN_ORDER.length;

    if (step.kind === 'learn') {
      const n = this.stepIndex + 1;
      const how = this.touch
        ? 'Tap the glowing hole.'
        : `Press <kbd>${this.keyFor(step.hole)}</kbd> to cover the glowing hole.`;
      const breath =
        this.breathMode && !this.touch && n === 1
          ? ` Hold <kbd>${formatKeyCode(this.keyMapping.blow)}</kbd> to blow while you play.`
          : '';
      const lead = n === 1 ? 'Every hole sings its own note.' : `Note ${n} of ${learnTotal} · ${HOLE_MAP[step.hole].noteName}`;
      this.setText(lead, how + breath);
      this.renderDots(0);
      this.cb.onHint(step.hole);
      return;
    }

    if (step.kind === 'echo') {
      this.echoProgress = 0;
      this.renderDots(step.phrase.length);
      this.later(() => this.playPhrase(step.phrase), 500);
      return;
    }

    this.cb.onHint(null);
    this.setText('You played your first melody.', 'Now listen to it whole.');
    this.playFinale();
  }

  private playFinale(): void {
    let at = 700;
    for (const [hole, beats] of FINALE) {
      const ms = beats * FINALE_BEAT_MS;
      this.later(() => this.cb.onDemoNote(hole, ms - 40), at);
      at += ms;
    }
    this.later(() => this.cb.onFinish(), at + 600);
  }

  private playPhrase(phrase: HoleId[]): void {
    this.listening = true;
    this.echoProgress = 0;
    this.renderDots(phrase.length);
    this.setText('Listen…', 'Then play it back.');
    phrase.forEach((hole, i) => {
      this.later(() => this.cb.onDemoNote(hole, DEMO_NOTE_MS), i * (DEMO_NOTE_MS + DEMO_GAP_MS));
    });
    this.later(() => {
      this.listening = false;
      const keys = this.touch ? '' : ` <span class="tutorial-keys">${phrase.map((h) => `<kbd>${this.keyFor(h)}</kbd>`).join('')}</span>`;
      this.setText('Your turn.', `Play the same notes back.${keys}`);
    }, phrase.length * (DEMO_NOTE_MS + DEMO_GAP_MS) + 120);
  }

  private setText(lead: string, body: string): void {
    this.panel.innerHTML = `
      <p class="tutorial-lead">${lead}</p>
      <p class="tutorial-body">${body}</p>
      <div class="tutorial-dots" aria-hidden="true"></div>
    `;
  }

  private renderDots(total: number): void {
    const el = this.panel.querySelector('.tutorial-dots');
    if (!el) return;
    el.innerHTML = Array.from({ length: total }, (_, i) =>
      `<span class="${i < this.echoProgress ? 'is-filled' : ''}"></span>`
    ).join('');
  }

  private flash(cls: 'is-correct' | 'is-wrong'): void {
    this.panel.classList.remove('is-correct', 'is-wrong');
    void this.panel.offsetWidth;
    this.panel.classList.add(cls);
  }

  private later(fn: () => void, ms: number): void {
    this.timers.push(window.setTimeout(fn, ms));
  }

  private clearTimers(): void {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers = [];
  }
}
