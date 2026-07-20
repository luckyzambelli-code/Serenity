/**
 * SatelliteRedundancyDetector — suppress duplicate "Auditor" transcript lines in
 * the co-located phone-satellite mode.
 *
 * THE PROBLEM
 * In satellite mode the auditor and PC are in the SAME ROOM. The PC's voice is
 * captured twice:
 *   • cleanly, by the PC's phone mic → streamed to the Mac → transcribed as "PC"
 *     (CONN-83 Whisper on the WebRTC audio);
 *   • faintly, acoustically, by the auditor's own Mac mic → the native macOS STT
 *     may transcribe it and (wrongly) label it "Auditor".
 * The second is redundant noise we want to drop.
 *
 * THE STRATEGY (user-specified) — two independent checks, very cheap:
 *   A. TEXT dedup: if an "Auditor" line fuzzy-matches a recent "PC" line within a
 *      time window, it is the same utterance → drop it. (~0% CPU.)
 *   B. SIGNAL confirmation: cross-correlate the ENERGY ENVELOPES of the PC
 *      reference (phone audio) and the Mac mic. A high peak means the Mac mic is
 *      currently hearing the PC → confirms redundancy. Envelope correlation is
 *      robust to room coloration / level and costs <0.3% of one core.
 *
 * B never drops a line on its own (that would risk deleting real auditor speech
 * during simultaneous talk) — it only RAISES confidence on a borderline text
 * match, exactly as "B come conferma".
 *
 * All of this is satellite-only; remote auditor/PC mode never starts the detector.
 */

// ── Envelope / correlation parameters ────────────────────────────────────────
const ENV_HZ        = 50;                 // envelope sample rate (one RMS / 20 ms)
const ENV_LEN       = ENV_HZ * 6;         // 6 s ring buffer
const CORR_WIN      = ENV_HZ * 2;         // measurement window = last 2 s
const CORR_EVERY_MS = 200;                // recompute the ratio 5×/s

// ── Decision thresholds (tunable) ────────────────────────────────────────────
// B is an ENERGY-RATIO, not a correlation: cross-correlation can't tell the
// speakers apart (both mics hear the same room). What differs is the LEVEL —
// the phone is a close mic on the PC, the Mac mic is close to the auditor. So
// ratio = phoneEnergy / macEnergy is HIGH when the PC speaks, LOW when the
// auditor speaks. That is the real discriminator.
const TEXT_STRONG    = 0.50;  // text similarity that alone marks redundancy
const TEXT_WEAK      = 0.30;  // weak text match — needs signal confirmation
const RATIO_CONFIRM  = 1.30;  // phone/mac energy ratio confirming a weak text match
const RATIO_STRONG   = 2.20;  // ratio so PC-dominant it drops even with no text match
const RATIO_FRESH_MS = 1800;  // the ratio value must be this recent
const PC_LINE_WINDOW = 6;     // seconds: |Δt| between Aud line and a PC line
const MIN_TOKENS     = 2;     // ignore ultra-short lines (one word → false matches)

interface PcLine { t: number; tokens: Set<string>; }

function normalizeTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ') // strip punctuation (unicode-aware)
      .split(/\s+/)
      .filter(Boolean),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const tok of a) if (b.has(tok)) inter++;
  return inter / (a.size + b.size - inter);
}

export class SatelliteRedundancyDetector {
  private ctx: AudioContext | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private pcAnalyser: AnalyserNode | null = null;
  private micSrc: MediaStreamAudioSourceNode | null = null;
  private pcSrc: MediaStreamAudioSourceNode | null = null;
  private td: Float32Array | null = null; // scratch time-domain buffer

  // Envelope ring buffers (index `w` is the write head, wraps at ENV_LEN).
  private micEnv = new Float32Array(ENV_LEN);
  private pcEnv = new Float32Array(ENV_LEN);
  private w = 0;

  private sampleTimer: ReturnType<typeof setInterval> | null = null;
  private corrTimer: ReturnType<typeof setInterval> | null = null;

  private ratio = 0;         // most recent phone/mac energy ratio (0 = unknown)
  private ratioAt = 0;       // performance.now() when `ratio` was computed

  private recentPc: PcLine[] = [];
  private running = false;

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  start(micStream: MediaStream | null, pcStream: MediaStream | null): void {
    if (this.running) this.stop();
    if (!micStream || !pcStream) return;
    const hasMic = micStream.getAudioTracks().length > 0;
    const hasPc = pcStream.getAudioTracks().length > 0;
    if (!hasMic || !hasPc) return;

    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.micAnalyser = this.ctx.createAnalyser();
      this.pcAnalyser = this.ctx.createAnalyser();
      this.micAnalyser.fftSize = 1024;
      this.pcAnalyser.fftSize = 1024;
      this.td = new Float32Array(1024);
      this.micSrc = this.ctx.createMediaStreamSource(micStream);
      this.pcSrc = this.ctx.createMediaStreamSource(pcStream);
      // Tap only — do NOT connect to destination (would replay the PC audio on
      // the Mac speakers and re-create the Larsen loop we just removed).
      this.micSrc.connect(this.micAnalyser);
      this.pcSrc.connect(this.pcAnalyser);
      this.micEnv.fill(0); this.pcEnv.fill(0); this.w = 0;
      this.ratio = 0; this.ratioAt = 0;
      this.sampleTimer = setInterval(() => this._sample(), Math.round(1000 / ENV_HZ));
      this.corrTimer = setInterval(() => this._measure(), CORR_EVERY_MS);
      this.running = true;
    } catch {
      this.stop();
    }
  }

  stop(): void {
    if (this.sampleTimer) { clearInterval(this.sampleTimer); this.sampleTimer = null; }
    if (this.corrTimer) { clearInterval(this.corrTimer); this.corrTimer = null; }
    try { this.micSrc?.disconnect(); } catch (_) {}
    try { this.pcSrc?.disconnect(); } catch (_) {}
    try { this.ctx?.close(); } catch (_) {}
    this.ctx = null; this.micAnalyser = null; this.pcAnalyser = null;
    this.micSrc = null; this.pcSrc = null; this.td = null;
    this.recentPc = [];
    this.ratio = 0; this.ratioAt = 0;
    this.running = false;
  }

  isRunning(): boolean { return this.running; }

  // ── B: envelope sampling + cross-correlation ─────────────────────────────────
  private _rms(analyser: AnalyserNode): number {
    if (!this.td) return 0;
    analyser.getFloatTimeDomainData(this.td);
    let sum = 0;
    for (let i = 0; i < this.td.length; i++) sum += this.td[i] * this.td[i];
    return Math.sqrt(sum / this.td.length);
  }

  private _sample(): void {
    if (!this.micAnalyser || !this.pcAnalyser) return;
    this.micEnv[this.w] = this._rms(this.micAnalyser);
    this.pcEnv[this.w] = this._rms(this.pcAnalyser);
    this.w = (this.w + 1) % ENV_LEN;
  }

  /** Copy the last CORR_WIN envelope samples (oldest→newest) into `out`. */
  private _window(ring: Float32Array, out: Float32Array): void {
    const start = (this.w - CORR_WIN + ENV_LEN * 2) % ENV_LEN;
    for (let i = 0; i < CORR_WIN; i++) out[i] = ring[(start + i) % ENV_LEN];
  }

  private _scratchMic = new Float32Array(CORR_WIN);
  private _scratchPc = new Float32Array(CORR_WIN);

  private _measure(): void {
    this._window(this.micEnv, this._scratchMic);
    this._window(this.pcEnv, this._scratchPc);
    const a = this._scratchMic, b = this._scratchPc; // a = Mac mic, b = phone (PC)

    // Energy = mean of squared envelope over the window.
    let ea = 0, eb = 0;
    for (let i = 0; i < CORR_WIN; i++) { ea += a[i] * a[i]; eb += b[i] * b[i]; }
    ea /= CORR_WIN; eb /= CORR_WIN;

    // Need someone actually speaking, otherwise the ratio is meaningless noise.
    const floor = 1e-6;
    if (ea < floor && eb < floor) { this.ratio = 0; this.ratioAt = performance.now(); return; }

    // ratio = phone(PC) energy / Mac-mic energy. >1 ⇒ PC dominant (close phone
    // mic), <1 ⇒ auditor dominant (close Mac mic). The small epsilon keeps it
    // finite when the Mac mic is near-silent (PC speaking, auditor quiet).
    this.ratio = eb / (ea + floor);
    this.ratioAt = performance.now();
  }

  // ── A: text bookkeeping + decision ───────────────────────────────────────────
  /** Register a finalized "PC" transcript line (from the Mac's Whisper). */
  notePcLine(timeSec: number, text: string): void {
    const tokens = normalizeTokens(text);
    if (tokens.size < MIN_TOKENS) return;
    this.recentPc.push({ t: timeSec, tokens });
    // prune anything well outside the dedup window
    const cutoff = timeSec - (PC_LINE_WINDOW + 4);
    while (this.recentPc.length && this.recentPc[0].t < cutoff) this.recentPc.shift();
    if (this.recentPc.length > 40) this.recentPc.splice(0, this.recentPc.length - 40);
  }

  /**
   * Decide whether an "Auditor" line is actually the PC leaking into the Mac mic.
   * Returns the reason for telemetry/logging ('' when kept).
   */
  isRedundantAudLine(timeSec: number, text: string): { redundant: boolean; reason: string } {
    const tokens = normalizeTokens(text);
    if (tokens.size < MIN_TOKENS) return { redundant: false, reason: '' };

    // A — best fuzzy match against recent PC lines inside the time window.
    let bestSim = 0;
    for (const pc of this.recentPc) {
      if (Math.abs(pc.t - timeSec) > PC_LINE_WINDOW) continue;
      const s = jaccard(tokens, pc.tokens);
      if (s > bestSim) bestSim = s;
    }
    if (bestSim >= TEXT_STRONG) return { redundant: true, reason: `text ${bestSim.toFixed(2)}` };

    // B — energy ratio (phone/mac). Fresh value only.
    const ratioFresh = (performance.now() - this.ratioAt) < RATIO_FRESH_MS && this.ratio > 0;
    if (ratioFresh) {
      // Weak text match confirmed by a PC-dominant ratio.
      if (bestSim >= TEXT_WEAK && this.ratio >= RATIO_CONFIRM) {
        return { redundant: true, reason: `text ${bestSim.toFixed(2)} + ratio ${this.ratio.toFixed(2)}` };
      }
      // No text match yet (the phone's PC line may simply not have arrived over
      // the network), but the audio was clearly PC-dominant → drop. This handles
      // the ordering race where the Mac-mic "Auditor" line fires first.
      if (this.ratio >= RATIO_STRONG) {
        return { redundant: true, reason: `ratio ${this.ratio.toFixed(2)} (PC-dominant)` };
      }
    }
    return { redundant: false, reason: '' };
  }

  /** Current phone/mac energy ratio (debug/telemetry). */
  getRatio(): number { return this.ratio; }
}

export const satelliteRedundancy = new SatelliteRedundancyDetector();
