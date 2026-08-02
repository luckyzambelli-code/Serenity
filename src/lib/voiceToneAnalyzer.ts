export interface ToneResult {
  label: 'calm' | 'neutral' | 'tense' | 'stressed';
  pitch: number;
  energy: number;
}

const SILENCE_THRESHOLD = 0.008;
const NORM = 0.20; // RMS voix normale ≈ 0.03-0.08, cri ≈ 0.20+

export class VoiceToneAnalyzer {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private buffer: Float32Array | null = null;
  // Buffer circulaire 4s (80 frames × 50ms) — on garde TOUT, silence inclus
  private samples: number[] = [];
  private frameTimer: ReturnType<typeof setInterval> | null = null;

  async init(): Promise<boolean> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.buffer = new Float32Array(this.analyser.fftSize);
      this.source = this.ctx.createMediaStreamSource(this.stream);
      this.source.connect(this.analyser);
      this.frameTimer = setInterval(() => this._sampleFrame(), 50);
      return true;
    } catch {
      return false;
    }
  }

  private _sampleFrame() {
    if (!this.analyser || !this.buffer) return;
    this.analyser.getFloatTimeDomainData(this.buffer);
    let sum = 0;
    for (let i = 0; i < this.buffer.length; i++) sum += this.buffer[i] ** 2;
    const rms = Math.sqrt(sum / this.buffer.length);
    // QUANDO SI È SMESSO DI PARLARE. Il riconoscitore vocale non lo dice: consegna la frase a
    // pausa finita, cioè quasi un secondo dopo. Ma l'instant read dell'ago avviene alla FINE
    // DELLA PAROLA, e datare l'item all'arrivo della trascrizione lo sposta fuori finestra —
    // misurato in seduta: letture a −600, −1000, −1200 ms dall'item, tutte scartate.
    // Il microfono invece lo sa: l'ultimo istante con voce è la fine della parola.
    if (rms > SILENCE_THRESHOLD) this.lastVoiceMs = performance.now();
    this.samples.push(rms);
    if (this.samples.length > 80) this.samples.shift(); // garder 4s
  }

  /** Ultimo istante (performance.now()) in cui si è sentita voce: la FINE della parola.
   *  0 se non si è ancora sentito niente. */
  lastVoiceMs = 0;

  /** La fine della parola, per chi deve datare un item. Vale per QUALUNQUE motore di
   *  trascrizione, perché non viene dal motore ma dal microfono. */
  speechEndMs(): number { return this.lastVoiceMs; }

  analyze(): ToneResult | null {
    if (!this.analyser || !this.buffer) return null;

    // Filtrer uniquement les frames avec de la voix (non-silence)
    const voiced = this.samples.filter(s => s > SILENCE_THRESHOLD);
    console.log('[VoiceTone] samples:', this.samples.length, 'voiced:', voiced.length);
    if (voiced.length < 3) return null; // pas assez de parole détectée

    const avgRms = voiced.reduce((a, b) => a + b, 0) / voiced.length;
    const peakRms = Math.max(...voiced);

    const energy = Math.min(1, peakRms / NORM);
    const avgEnergy = Math.min(1, avgRms / NORM);

    // Reset après lecture pour la prochaine phrase
    this.samples = [];

    let label: ToneResult['label'];
    if (avgEnergy < 0.40) {
      label = 'calm';
    } else if (avgEnergy < 0.60) {
      label = 'neutral';
    } else if (avgEnergy < 0.80) {
      label = 'tense';
    } else {
      label = 'stressed';
    }

    return { label, pitch: 0, energy: parseFloat(energy.toFixed(2)) };
  }

  stop() {
    if (this.frameTimer) { clearInterval(this.frameTimer); this.frameTimer = null; }
    this.samples = [];
    this.source?.disconnect();
    this.stream?.getTracks().forEach(t => t.stop());
    this.ctx?.close();
    this.ctx = null;
    this.analyser = null;
    this.source = null;
    this.stream = null;
    this.buffer = null;
  }

  // Méthode publique pour vérifier et réactiver l'AudioContext
  async ensureAudioContextActive(): Promise<boolean> {
    if (!this.ctx) return false;
    
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
        console.log('AudioContext réactivé depuis état suspended');
        return true;
      } catch (error) {
        console.error('Erreur lors de la réactivation de l\'AudioContext:', error);
        return false;
      }
    }
    return this.ctx.state === 'running';
  }

  /** Satellite redundancy detector reuses the already-open auditor mic stream
   *  (avoids a 2nd getUserMedia). Null until init() has succeeded. */
  getMicStream(): MediaStream | null {
    return this.stream;
  }

  // Méthode publique pour obtenir les détails de l'AudioContext
  getAudioContextDetails() {
    if (!this.ctx) return null;
    
    return {
      state: this.ctx.state,
      sampleRate: this.ctx.sampleRate,
      baseLatency: this.ctx.baseLatency
    };
  }
}

export const voiceToneAnalyzer = new VoiceToneAnalyzer();
