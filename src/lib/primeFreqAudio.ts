/**
 * primeFreqAudio.ts — Web Audio port of prime_freq.py AudioEngine
 *
 * PHASES:
 *   SONIFY    → binaural beat: L = CARRIER(200) Hz, R = CARRIER + f_d Hz
 *   CLEAN     → binaural beat: L = CLEAN_CARRIER(240) Hz, R = CLEAN_CARRIER + Δ Hz
 *               (different carrier from SONIFY/HARMONICS so Δ is acoustically distinct)
 *   HARMONICS → harmonic sequence every HARMONIC_PERIOD_MS
 *                 freq < 20 Hz → binaural beat at CARRIER(200)
 *                 freq ≥ 20 Hz → audible tone (mono L+R)
 */

import { type Zone, harmonicSequence } from './primeFreqEngine';

const CARRIER          = 200.0;   // Hz — binaural carrier for SONIFY & HARMONICS
const CLEAN_CARRIER    = 240.0;   // Hz — distinct carrier for CLEAN phase (Δ beat)
const AUDIO_VOLUME     = 0.6;     // master amplitude (raised — was too faint @0.18)
const MASTER_GAIN      = 1.6;     // makeup gain before the limiter (loudness)
const FADE_TIME_S      = 0.4;     // fade-in / fade-out duration
const HARMONIC_PERIOD_MS = 2000;  // ms between harmonic copies
// Max harmonic tones playing SIMULTANEOUSLY. Unbounded, a long HARMONICS phase
// accumulated hundreds of live oscillators (CPU climb + the limiter crushing
// the mix into mud). The newest copies carry the progression; the oldest fade
// out as new ones arrive — the sequence itself still advances to the 2 kHz cap.
const MAX_LIVE_HARMONICS = 24;

// ── Internal tone handle ───────────────────────────────────────────────────
interface Tone {
  oscL: OscillatorNode;
  oscR: OscillatorNode;
  gainL: GainNode;
  gainR: GainNode;
  merger: ChannelMergerNode;
  outGain: GainNode;
  label: string;
}

export class PrimeFreqAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private tones: Tone[] = [];
  private harmonicTimer: ReturnType<typeof setInterval> | null = null;
  private harmonicIndex = 0;
  private harmonicSeq: Array<{ p: number; freq: number }> = [];
  // callback fired each time a new harmonic copy is added
  onHarmonicCopy?: (p: number, freq: number, index: number) => void;

  // ── Lifecycle ──────────────────────────────────────────────────────────

  init(): void {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = MASTER_GAIN;
      // Brick-wall limiter so we can push the makeup gain hard (loud, audible
      // binaural tone) without the accumulating harmonic copies clipping/harshing.
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -3;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.12;
      this.masterGain.connect(limiter);
      limiter.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  // ── Phase entry points ─────────────────────────────────────────────────

  /** SONIFY: binaural beat at f_d Hz — carrier 200 Hz. */
  startSonify(fd: number): void {
    this.killAll();
    this._addBinaural(fd, AUDIO_VOLUME, 'sonify', CARRIER);
  }

  /**
   * CLEAN: binaural beat at Δ Hz — carrier 240 Hz (distinct from SONIFY/HARMONICS).
   * If zone === PRIME, Δ ≈ 0 → no tone needed.
   */
  startClean(delta: number, zone: Zone): void {
    this.killAll();
    if (zone !== 'PRIME' && delta > 0.01) {
      this._addBinaural(delta, AUDIO_VOLUME * 0.8, 'clean', CLEAN_CARRIER);
    }
  }

  /**
   * HARMONICS: kill clean tone, play harmonic sequence every 2 s.
   * All binaural harmonics use CARRIER (200 Hz).
   */
  startHarmonics(pStar: number): void {
    this.killAll();
    // No pMax limit — only the 2000 Hz cap stops the sequence (~300 copies)
    this.harmonicSeq = harmonicSequence(1.0, undefined, 2000);
    this.harmonicIndex = 0;
    this._addNextHarmonic();
    this.harmonicTimer = setInterval(() => this._addNextHarmonic(), HARMONIC_PERIOD_MS);
  }

  /** Kill all tones and stop the harmonic timer. */
  killAll(): void {
    this._stopHarmonicTimer();
    const snapshot = [...this.tones];
    this.tones = [];
    for (const tone of snapshot) {
      this._fadeOut(tone.outGain);
    }
  }

  // ── Internal helpers ───────────────────────────────────────────────────

  /**
   * Add a binaural beat: L = carrierHz, R = carrierHz + freqBeat.
   * @param carrierHz  Base carrier frequency (default CARRIER = 200 Hz)
   */
  private _addBinaural(freqBeat: number, amp: number, label: string, carrierHz = CARRIER): void {
    if (!this.ctx || !this.masterGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const oscL = ctx.createOscillator();
    const oscR = ctx.createOscillator();
    oscL.type = 'sine';
    oscR.type = 'sine';
    oscL.frequency.value = carrierHz;
    oscR.frequency.value = carrierHz + freqBeat;

    const gainL = ctx.createGain();
    const gainR = ctx.createGain();
    gainL.gain.value = amp;
    gainR.gain.value = amp;

    const merger = ctx.createChannelMerger(2);
    oscL.connect(gainL);
    oscR.connect(gainR);
    gainL.connect(merger, 0, 0);   // left channel
    gainR.connect(merger, 0, 1);   // right channel

    const outGain = ctx.createGain();
    outGain.gain.setValueAtTime(0.0001, now);
    outGain.gain.linearRampToValueAtTime(1.0, now + FADE_TIME_S);
    merger.connect(outGain);
    outGain.connect(this.masterGain!);

    oscL.start(now);
    oscR.start(now);

    this.tones.push({ oscL, oscR, gainL, gainR, merger, outGain, label });
  }

  private _addAudible(freq: number, amp: number, label: string): void {
    if (!this.ctx || !this.masterGain) return;
    // Mono: same frequency in both ears, using CARRIER as base then override
    this._addBinaural(0, amp, label, CARRIER);
    // Override: set both oscillators to the audible freq
    const tone = this.tones[this.tones.length - 1];
    tone.oscL.frequency.value = freq;
    tone.oscR.frequency.value = freq;
  }

  private _addNextHarmonic(): void {
    if (this.harmonicIndex >= this.harmonicSeq.length) {
      this._stopHarmonicTimer();
      return;
    }
    const { p, freq } = this.harmonicSeq[this.harmonicIndex];
    const amp = freq > 500
      ? AUDIO_VOLUME * 0.5
      : freq > 20
        ? AUDIO_VOLUME * 0.7
        : AUDIO_VOLUME;

    if (freq < 20) {
      this._addBinaural(freq, amp, `harm_${p}`, CARRIER);
    } else {
      this._addAudible(freq, amp, `harm_${p}`);
    }

    // Sliding window: fade out the OLDEST harmonic tones beyond the cap.
    const live = this.tones.filter(t => t.label.startsWith('harm_'));
    for (let i = 0; i < live.length - MAX_LIVE_HARMONICS; i++) {
      const old = live[i];
      const idx = this.tones.indexOf(old);
      if (idx !== -1) this.tones.splice(idx, 1);
      this._fadeOut(old.outGain);
    }

    this.onHarmonicCopy?.(p, freq, this.harmonicIndex);
    this.harmonicIndex++;
  }

  private _stopHarmonicTimer(): void {
    if (this.harmonicTimer !== null) {
      clearInterval(this.harmonicTimer);
      this.harmonicTimer = null;
    }
  }

  private _fadeOut(outGain: GainNode): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    outGain.gain.cancelScheduledValues(now);
    outGain.gain.setValueAtTime(outGain.gain.value, now);
    outGain.gain.linearRampToValueAtTime(0.0001, now + FADE_TIME_S);
    // Disconnect after fade
    setTimeout(() => {
      try { outGain.disconnect(); } catch (_) {}
    }, (FADE_TIME_S + 0.1) * 1000);
  }
}

export const primeFreqAudio = new PrimeFreqAudio();
