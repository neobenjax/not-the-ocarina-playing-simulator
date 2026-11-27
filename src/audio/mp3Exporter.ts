import { Mp3Encoder } from '@breezystack/lamejs';
import { HOLE_MAP, PartitureTrack } from '../types';

/**
 * Offline-renders a PartitureTrack with procedural Ocarina synthesis
 * and encodes the PCM audio into a downloadable .mp3 file via lamejs.
 */
export async function exportTrackToMp3(track: PartitureTrack): Promise<Blob> {
  const sampleRate = 44100;
  const secPerBeat = 60 / Math.max(40, track.bpm);
  const maxBeat = track.notes.reduce(
    (max, n) => Math.max(max, n.startBeat + n.durationBeats),
    4
  );
  const totalSec = Math.max(2, maxBeat * secPerBeat + 0.8);
  const totalSamples = Math.ceil(totalSec * sampleRate);

  const offline = new OfflineAudioContext(1, totalSamples, sampleRate);

  const comp = offline.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 3.5;
  comp.connect(offline.destination);

  for (const note of track.notes) {
    const meta = HOLE_MAP[note.holeId];
    if (!meta) continue;
    const start = note.startBeat * secPerBeat;
    const dur = Math.max(0.08, note.durationBeats * secPerBeat);

    const voiceGain = offline.createGain();
    voiceGain.gain.setValueAtTime(0.0001, start);
    voiceGain.gain.linearRampToValueAtTime(0.42, start + 0.025);
    voiceGain.gain.setValueAtTime(0.36, start + Math.max(0.03, dur - 0.05));
    voiceGain.gain.exponentialRampToValueAtTime(0.0001, start + dur + 0.07);

    const osc1 = offline.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(meta.frequency, start);

    const osc2 = offline.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(meta.frequency, start);
    const osc2Gain = offline.createGain();
    osc2Gain.gain.value = 0.16;

    const lfo = offline.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(5.2, start);
    const lfoGain = offline.createGain();
    lfoGain.gain.setValueAtTime(3.5, start);
    lfo.connect(lfoGain);
    lfoGain.connect(osc1.frequency);

    osc1.connect(voiceGain);
    osc2.connect(osc2Gain);
    osc2Gain.connect(voiceGain);
    voiceGain.connect(comp);

    osc1.start(start);
    osc2.start(start);
    lfo.start(start);
    osc1.stop(start + dur + 0.09);
    osc2.stop(start + dur + 0.09);
    lfo.stop(start + dur + 0.09);
  }

  const renderedBuffer = await offline.startRendering();
  const floatSamples = renderedBuffer.getChannelData(0);

  // Convert Float32 [-1..1] to Int16 PCM
  const pcm = new Int16Array(floatSamples.length);
  for (let i = 0; i < floatSamples.length; i++) {
    const s = Math.max(-1, Math.min(1, floatSamples[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  const encoder = new Mp3Encoder(1, sampleRate, 128);
  const mp3Chunks: Uint8Array[] = [];
  const blockSize = 1152;
  for (let i = 0; i < pcm.length; i += blockSize) {
    const slice = pcm.subarray(i, i + blockSize);
    const buf = encoder.encodeBuffer(slice);
    if (buf.length > 0) mp3Chunks.push(new Uint8Array(buf));
  }
  const endBuf = encoder.flush();
  if (endBuf.length > 0) mp3Chunks.push(new Uint8Array(endBuf));

  return new Blob(mp3Chunks as BlobPart[], { type: 'audio/mpeg' });
}
