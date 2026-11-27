import { getSharedAudioContext } from './ocarinaSynth';

/**
 * Sound Effects & Menu BGM generated via Sound Machine Generator WebMCP
 * (https://neobenjax.github.io/sound-machine-generator/)
 * Zero-dependency Native Web Audio API recipes.
 */

let sfxVolume = 0.75;
let masterVolume = 0.85;
let cachedImpulse: AudioBuffer | null = null;

export function setSfxVolumes(master: number, sfx: number): void {
  masterVolume = Math.max(0, Math.min(1, master));
  sfxVolume = Math.max(0, Math.min(1, sfx));
}

function getEffectiveSfxGain(): number {
  return masterVolume * sfxVolume;
}

function createStereoImpulse(ctx: AudioContext, decaySec: number): AudioBuffer {
  if (cachedImpulse && Math.abs(cachedImpulse.duration - decaySec) < 0.05) {
    return cachedImpulse;
  }
  const len = Math.max(1, Math.floor(ctx.sampleRate * decaySec));
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let smooth = 0;
    for (let i = 0; i < len; i++) {
      const p = i / len;
      const env = Math.pow(1 - p, 2.4) * Math.exp(-2.2 * p);
      smooth = smooth * 0.48 + (Math.random() * 2 - 1) * 0.52;
      data[i] = smooth * env * 0.65;
    }
  }
  cachedImpulse = buf;
  return buf;
}

function createMasterBus(ctx: AudioContext, reverbMix: number, reverbDecaySec: number): GainNode {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 3.5;
  comp.connect(ctx.destination);

  const master = ctx.createGain();
  master.gain.value = 0.794 * getEffectiveSfxGain();
  master.connect(comp);

  if (reverbMix > 0) {
    const convolver = ctx.createConvolver();
    convolver.buffer = createStereoImpulse(ctx, reverbDecaySec);
    const reverbWet = ctx.createGain();
    reverbWet.gain.value = reverbMix;
    master.connect(reverbWet);
    reverbWet.connect(convolver);
    convolver.connect(comp);
  }
  return master;
}

/** Sound Machine Recipe: Ocarina UI Click */
export function playUiClick(): void {
  const gainScale = getEffectiveSfxGain();
  if (gainScale <= 0.01) return;
  const ctx = getSharedAudioContext();
  const master = createMasterBus(ctx, 0.15, 0.3);
  const now = ctx.currentTime + 0.005;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2400, now);
  filter.Q.setValueAtTime(1.2, now);
  filter.frequency.exponentialRampToValueAtTime(800, now + 0.12);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, now);
  env.gain.linearRampToValueAtTime(0.32, now + 0.004);
  env.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(880, now);

  const mod = ctx.createOscillator();
  mod.type = 'sine';
  mod.frequency.setValueAtTime(1760, now);
  const modGain = ctx.createGain();
  modGain.gain.setValueAtTime(2640, now);
  modGain.gain.exponentialRampToValueAtTime(105.6, now + 0.045);

  mod.connect(modGain);
  modGain.connect(osc.frequency);
  osc.connect(filter);
  filter.connect(env);
  env.connect(master);

  mod.start(now);
  osc.start(now);
  mod.stop(now + 0.18);
  osc.stop(now + 0.18);
}

/** Sound Machine Recipe: Ocarina Modal Open */
export function playModalOpen(): void {
  if (getEffectiveSfxGain() <= 0.01) return;
  const ctx = getSharedAudioContext();
  const master = createMasterBus(ctx, 0.3, 0.7);
  const now = ctx.currentTime + 0.005;

  for (const offset of [-0.05, 0.05]) {
    const pan = ctx.createStereoPanner();
    pan.pan.setValueAtTime(offset * 4, now);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(0.22, now + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(659.25, now);
    osc.detune.setValueAtTime(offset * 100, now);

    osc.connect(env);
    env.connect(pan);
    pan.connect(master);
    osc.start(now);
    osc.stop(now + 0.25);
  }
}

/** Sound Machine Recipe: Woodblock Rim Tick (Metronome) */
export function playMetronomeTick(accent = false): void {
  if (getEffectiveSfxGain() <= 0.01) return;
  const ctx = getSharedAudioContext();
  const master = createMasterBus(ctx, 0.05, 0.15);
  const now = ctx.currentTime + 0.002;

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, now);
  env.gain.linearRampToValueAtTime(accent ? 0.42 : 0.26, now + 0.002);
  env.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);

  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(accent ? 1480 : 1120, now);

  const mod = ctx.createOscillator();
  mod.type = 'sine';
  mod.frequency.setValueAtTime(accent ? 2220 : 1680, now);
  const modGain = ctx.createGain();
  modGain.gain.setValueAtTime(1800, now);
  modGain.gain.exponentialRampToValueAtTime(40, now + 0.025);

  mod.connect(modGain);
  modGain.connect(osc.frequency);
  osc.connect(env);
  env.connect(master);
  mod.start(now);
  osc.start(now);
  mod.stop(now + 0.07);
  osc.stop(now + 0.07);
}

/** Sound Machine Recipe: Secret Discovery Chime */
export function playMelodyChime(): void {
  if (getEffectiveSfxGain() <= 0.01) return;
  const ctx = getSharedAudioContext();
  const master = createMasterBus(ctx, 0.4, 1.2);
  const now = ctx.currentTime + 0.01;
  const notes = [783.99, 739.99, 622.25, 440.0, 415.3, 659.25, 830.61, 1046.5];

  notes.forEach((freq, idx) => {
    const t = now + idx * 0.095;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(0.24, t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);

    osc.connect(env);
    env.connect(master);
    osc.start(t);
    osc.stop(t + 0.38);
  });
}

/** Sound Machine Recipe: Stage Clear Fanfare */
export function playStageClear(): void {
  if (getEffectiveSfxGain() <= 0.01) return;
  const ctx = getSharedAudioContext();
  const master = createMasterBus(ctx, 0.45, 1.4);
  const now = ctx.currentTime + 0.01;
  const chord = [587.33, 739.99, 880.0, 1174.66];

  chord.forEach((freq, i) => {
    const t = now + i * 0.08;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(0.28, t + 0.015);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    osc.connect(env);
    env.connect(master);
    osc.start(t);
    osc.stop(t + 0.95);
  });
}

/** Sound Machine Recipe: Game Over Fail */
export function playGameOver(): void {
  if (getEffectiveSfxGain() <= 0.01) return;
  const ctx = getSharedAudioContext();
  const master = createMasterBus(ctx, 0.35, 1.0);
  const now = ctx.currentTime + 0.01;
  const notes = [293.66, 261.63, 220.0, 146.83];

  notes.forEach((freq, i) => {
    const t = now + i * 0.22;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(0.28, t + 0.015);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, t);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, t);

    osc.connect(filter);
    filter.connect(env);
    env.connect(master);
    osc.start(t);
    osc.stop(t + 0.45);
  });
}

/**
 * Menu BGM Loop (inspired by Sound Machine Generator DAW 92 BPM pattern)
 */
class MenuBgmPlayer {
  private timer: number | null = null;
  private step = 0;
  private running = false;

  // Ambient mystic harp/chime arpeggio pattern (16 steps)
  private readonly pattern = [
    587.33, 0, 880.0, 0, 1046.5, 0, 880.0, 0,
    523.25, 0, 783.99, 0, 987.77, 0, 783.99, 0,
  ];

  start(): void {
    if (this.running) return;
    this.running = true;
    const stepMs = (60 / 92 / 2) * 1000;
    this.timer = window.setInterval(() => {
      if (!this.running) return;
      const freq = this.pattern[this.step % this.pattern.length];
      this.step++;
      if (freq > 0 && getEffectiveSfxGain() > 0.01) {
        const ctx = getSharedAudioContext();
        const now = ctx.currentTime;
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.0001, now);
        env.gain.linearRampToValueAtTime(0.055 * getEffectiveSfxGain(), now + 0.02);
        env.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);

        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);
        osc.connect(env);
        env.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.6);
      }
    }, stepMs);
  }

  stop(): void {
    this.running = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export const menuBgm = new MenuBgmPlayer();
