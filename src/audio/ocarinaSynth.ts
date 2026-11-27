/**
 * Procedural Polyphonic Web Audio Ocarina Synthesizer
 * Produces an authentic ceramic transverse ocarina tone with:
 * - Warm sine + soft triangle harmonic blend
 * - Bandpass-filtered breath airflow noise
 * - Gentle 5.2 Hz vibrato LFO
 * - Polyphonic voice mixing so multiple simultaneous holes blend naturally
 * - Distorted miss tone for rhythm errors
 */

let sharedAudioCtx: AudioContext | null = null;

export function getSharedAudioContext(): AudioContext {
  if (!sharedAudioCtx) {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedAudioCtx = new Ctx();
  }
  if (sharedAudioCtx.state === 'suspended') {
    void sharedAudioCtx.resume();
  }
  return sharedAudioCtx;
}

interface ActiveVoice {
  osc1: OscillatorNode;
  osc2: OscillatorNode;
  lfo: OscillatorNode;
  voiceGain: GainNode;
  breathSrc: AudioBufferSourceNode;
  breathGain: GainNode;
  frequency: number;
}

class OcarinaSynth {
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private voices = new Map<string, ActiveVoice>();
  private noiseBuffer: AudioBuffer | null = null;
  private volume = 0.85;

  private ensureGraph(): { ctx: AudioContext; out: AudioNode } {
    const ctx = getSharedAudioContext();
    if (!this.compressor) {
      this.compressor = ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -16;
      this.compressor.ratio.value = 4;
      this.compressor.attack.value = 0.005;
      this.compressor.release.value = 0.15;

      this.masterGain = ctx.createGain();
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(this.compressor);
      this.compressor.connect(ctx.destination);
    }
    if (!this.noiseBuffer) {
      const len = ctx.sampleRate * 2;
      this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      let lastOut = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        lastOut = (lastOut + 0.04 * white) / 1.04;
        data[i] = lastOut * 2.5;
      }
    }
    return { ctx, out: this.masterGain! };
  }

  setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && sharedAudioCtx) {
      this.masterGain.gain.setTargetAtTime(this.volume, sharedAudioCtx.currentTime, 0.02);
    }
  }

  /**
   * Start or update a polyphonic voice for a specific hole/key.
   * Multiple voices blend through the shared compressor to form harmonies/chords.
   */
  startVoice(voiceId: string, frequency: number, gainScale = 1.0): void {
    const { ctx, out } = this.ensureGraph();
    const now = ctx.currentTime;
    const existing = this.voices.get(voiceId);

    // Scale gain slightly down when multiple voices are active to prevent clipping
    const polyScale = gainScale * (this.voices.size >= 2 ? 0.75 : 1.0);

    if (existing) {
      existing.osc1.frequency.setTargetAtTime(frequency, now, 0.012);
      existing.osc2.frequency.setTargetAtTime(frequency, now, 0.012);
      existing.voiceGain.gain.setTargetAtTime(0.32 * polyScale, now, 0.02);
      existing.frequency = frequency;
      return;
    }

    const voiceGain = ctx.createGain();
    voiceGain.gain.setValueAtTime(0.0001, now);
    voiceGain.gain.linearRampToValueAtTime(0.32 * polyScale, now + 0.032);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2600, now);
    filter.Q.value = 1.1;

    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(frequency, now);

    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(frequency, now);
    const osc2Gain = ctx.createGain();
    osc2Gain.gain.value = 0.16;

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(5.2, now);
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(0, now);
    lfoGain.gain.linearRampToValueAtTime(4.5, now + 0.25);
    lfo.connect(lfoGain);
    lfoGain.connect(osc1.frequency);
    lfoGain.connect(osc2.frequency);

    const breathSrc = ctx.createBufferSource();
    breathSrc.buffer = this.noiseBuffer!;
    breathSrc.loop = true;
    const breathFilter = ctx.createBiquadFilter();
    breathFilter.type = 'bandpass';
    breathFilter.frequency.setValueAtTime(frequency * 1.4, now);
    breathFilter.Q.value = 2.5;
    const breathGain = ctx.createGain();
    breathGain.gain.setValueAtTime(0.0001, now);
    breathGain.gain.linearRampToValueAtTime(0.045 * polyScale, now + 0.03);

    osc1.connect(filter);
    osc2.connect(osc2Gain);
    osc2Gain.connect(filter);
    filter.connect(voiceGain);
    voiceGain.connect(out);

    breathSrc.connect(breathFilter);
    breathFilter.connect(breathGain);
    breathGain.connect(out);

    osc1.start(now);
    osc2.start(now);
    lfo.start(now);
    breathSrc.start(now);

    this.voices.set(voiceId, {
      osc1,
      osc2,
      lfo,
      voiceGain,
      breathSrc,
      breathGain,
      frequency,
    });
  }

  stopVoice(voiceId: string): void {
    const voice = this.voices.get(voiceId);
    if (!voice || !sharedAudioCtx) return;
    this.voices.delete(voiceId);

    const ctx = sharedAudioCtx;
    const now = ctx.currentTime;

    voice.voiceGain.gain.cancelScheduledValues(now);
    voice.voiceGain.gain.setValueAtTime(Math.max(0.0001, voice.voiceGain.gain.value), now);
    voice.voiceGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

    voice.breathGain.gain.cancelScheduledValues(now);
    voice.breathGain.gain.setValueAtTime(Math.max(0.0001, voice.breathGain.gain.value), now);
    voice.breathGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);

    const stopAt = now + 0.11;
    voice.osc1.stop(stopAt);
    voice.osc2.stop(stopAt);
    voice.lfo.stop(stopAt);
    voice.breathSrc.stop(stopAt);
  }

  stopAllVoices(): void {
    for (const id of Array.from(this.voices.keys())) {
      this.stopVoice(id);
    }
  }

  startNote(frequency: number, gainScale = 1.0): void {
    this.startVoice('default', frequency, gainScale);
  }

  stopNote(): void {
    this.stopVoice('default');
  }

  /**
   * One-shot note playback (used for guide track, playback preview, and arcade hits)
   */
  playOneShot(frequency: number, durationSec: number, gainScale = 0.7, whenOffsetSec = 0): void {
    const { ctx, out } = this.ensureGraph();
    const start = ctx.currentTime + whenOffsetSec;
    const dur = Math.max(0.06, durationSec);

    const voiceGain = ctx.createGain();
    voiceGain.gain.setValueAtTime(0.0001, start);
    voiceGain.gain.linearRampToValueAtTime(0.32 * gainScale, start + 0.02);
    voiceGain.gain.setValueAtTime(0.28 * gainScale, start + Math.max(0.025, dur - 0.05));
    voiceGain.gain.exponentialRampToValueAtTime(0.0001, start + dur + 0.06);

    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(frequency, start);

    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(frequency, start);
    const osc2Gain = ctx.createGain();
    osc2Gain.gain.value = 0.15;

    osc1.connect(voiceGain);
    osc2.connect(osc2Gain);
    osc2Gain.connect(voiceGain);
    voiceGain.connect(out);

    osc1.start(start);
    osc2.start(start);
    osc1.stop(start + dur + 0.08);
    osc2.stop(start + dur + 0.08);
  }

  /**
   * Distorted note noise for rhythm misses
   */
  playDistortedMiss(frequency: number): void {
    const { ctx, out } = this.ensureGraph();
    const now = ctx.currentTime;

    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i * 2) / 256 - 1;
      curve[i] = ((3 + 22) * x * 20 * (Math.PI / 180)) / (Math.PI + 22 * Math.abs(x));
    }
    shaper.curve = curve;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.26, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(frequency * 0.47, now);
    osc.frequency.linearRampToValueAtTime(frequency * 0.39, now + 0.2);

    osc.connect(shaper);
    shaper.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.24);
  }

  getActiveCount(): number {
    return this.voices.size;
  }
}

export const ocarinaSynth = new OcarinaSynth();
