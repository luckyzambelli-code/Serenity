/**
 * CAN METER — pilotaggio della scheda audio (generazione dei due toni + cattura dell'ingresso).
 *
 * Il CALCOLO non sta qui: sta in engine/impedanceMeter.ts, che è puro e collaudato. Qui c'è
 * solo il contorno hardware — aprire i dispositivi, generare i toni, raccogliere i campioni.
 *
 * ⚠️ NON COLLAUDATO: nessuno dei percorsi di questo file è mai stato eseguito contro una
 * scheda audio vera. La matematica sotto ha 31 test verdi; questo strato no, e non può averli
 * finché non c'è il ferro. Da verificare al primo collegamento seguendo docs/can-meter-cablaggio.md §9.
 */
import {
  CanMeter, solveTwoPointCalibration, type Calibration, type CanReading,
} from '../engine/impedanceMeter';
import { CAN_TONE_AMPLITUDE, CAN_CAL_R1, CAN_CAL_R2 } from '../engine/tuning';

/**
 * Worklet minimale: gira sul THREAD AUDIO e si limita a inoltrare i campioni.
 *
 * Perché non un ScriptProcessorNode (più semplice): quello gira sul thread principale e, se
 * l'interfaccia impunta, SALTA dei blocchi. Un buco nei campioni spezza la continuità di fase
 * dentro la finestra del lock-in e corrompe la misura in modo silenzioso — il tipo di errore
 * peggiore, perché produce un numero plausibile e sbagliato.
 */
const WORKLET_SRC = `
class CanTapProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch && ch.length) this.port.postMessage(new Float32Array(ch));
    return true;
  }
}
registerProcessor('can-tap', CanTapProcessor);
`;

/** Vincoli d'ingresso. Ognuno di questi, se lasciato attivo, DISTRUGGE la misura. */
const INPUT_CONSTRAINTS: MediaTrackConstraints = {
  // Cambierebbe il guadagno sotto i piedi mentre misuriamo l'ampiezza: la scala non sarebbe
  // più la stessa fra un istante e l'altro, e la taratura diventerebbe carta straccia.
  autoGainControl: false,
  // Mangia i toni continui, che è esattamente il nostro segnale.
  noiseSuppression: false,
  // Sottrae dall'ingresso quello che sta uscendo — cioè proprio i nostri due toni.
  echoCancellation: false,
};

export interface CanMeterOptions {
  /** deviceId dell'ingresso (dal dongle USB). Se assente, il dispositivo predefinito. */
  inputDeviceId?: string;
  /** Chiamata ad ogni lettura completata (~10/s). */
  onReading?: (r: CanReading) => void;
  /** Errore non recuperabile (dispositivo staccato, permesso negato…). */
  onError?: (e: Error) => void;
}

/** Ingressi audio disponibili — per far scegliere il dongle nel pannello di configurazione. */
export const listAudioInputs = async (): Promise<MediaDeviceInfo[]> => {
  const all = await navigator.mediaDevices.enumerateDevices();
  return all.filter(d => d.kind === 'audioinput');
};

export class CanMeterAudio {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private oscLow: OscillatorNode | null = null;
  private oscHigh: OscillatorNode | null = null;
  private meter: CanMeter | null = null;
  /** Quando è valorizzato, i campioni vanno alla raccolta di taratura invece che alle letture. */
  private capture: { low: number[]; high: number[] } | null = null;

  constructor(private readonly opts: CanMeterOptions = {}) {}

  get running(): boolean { return this.ctx !== null; }
  get sampleRate(): number { return this.ctx?.sampleRate ?? 0; }
  get frequencies() { return this.meter?.frequencies ?? null; }
  get calibrated(): boolean { return this.meter?.calibrated ?? false; }

  /** Apre ingresso e uscita e comincia a emettere i due toni. */
  async start(): Promise<void> {
    if (this.ctx) return;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: this.opts.inputDeviceId
          ? { ...INPUT_CONSTRAINTS, deviceId: { exact: this.opts.inputDeviceId } }
          : INPUT_CONSTRAINTS,
      });

      const ctx = new AudioContext();
      this.ctx = ctx;
      this.meter = new CanMeter(ctx.sampleRate);

      // ── USCITA : i due toni sommati, alla frequenza EFFETTIVA del meter (agganciata al bin) ──
      const { lowHz, highHz } = this.meter.frequencies;
      const somma = ctx.createGain();
      somma.gain.value = 1;
      this.oscLow = this.makeTone(ctx, lowHz, somma);
      this.oscHigh = this.makeTone(ctx, highHz, somma);
      somma.connect(ctx.destination);

      // ── INGRESSO : il worklet inoltra i campioni, il calcolo avviene qui ──
      const blob = new Blob([WORKLET_SRC], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      try {
        await ctx.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }

      this.node = new AudioWorkletNode(ctx, 'can-tap');
      this.node.port.onmessage = (e: MessageEvent<Float32Array>) => this.consume(e.data);
      ctx.createMediaStreamSource(this.stream).connect(this.node);
      // Il worklet non produce suono, ma senza destinazione alcuni motori non lo schedulano.
      this.node.connect(ctx.createGain());

      this.oscLow.start();
      this.oscHigh.start();
    } catch (e) {
      await this.stop();
      const err = e instanceof Error ? e : new Error(String(e));
      this.opts.onError?.(err);
      throw err;
    }
  }

  private makeTone(ctx: AudioContext, freqHz: number, dest: AudioNode): OscillatorNode {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freqHz;
    const g = ctx.createGain();
    // Due toni sommati: ciascuno sotto metà fondo scala, altrimenti l'uscita satura e la
    // distorsione riversa energia sull'altro canale.
    g.gain.value = CAN_TONE_AMPLITUDE;
    osc.connect(g).connect(dest);
    return osc;
  }

  private consume(block: Float32Array): void {
    const meter = this.meter;
    if (!meter) return;

    if (this.capture) {
      for (let i = 0; i < block.length; i++) {
        const raw = meter.pushRaw(block[i]);
        if (raw) {
          this.capture.low.push(raw.low.amplitude);
          this.capture.high.push(raw.high.amplitude);
        }
      }
      return;
    }

    for (let i = 0; i < block.length; i++) {
      const r = meter.push(block[i]);
      if (r) this.opts.onReading?.(r);
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════════════════
  // CALIBRAZIONE — vedi docs/can-meter-cablaggio.md §6
  // ═════════════════════════════════════════════════════════════════════════════════════════

  /**
   * Raccoglie le ampiezze grezze per `ms`, con al posto delle lattine una resistenza NOTA.
   * Media su molte finestre: la calibrazione si fa una volta sola, tanto vale farla bene.
   */
  async measureRaw(ms = 3000): Promise<{ low: number; high: number }> {
    if (!this.meter) throw new Error('CanMeter: measureRaw prima di start()');
    this.capture = { low: [], high: [] };
    try {
      await new Promise(r => setTimeout(r, ms));
      const { low, high } = this.capture;
      if (!low.length) throw new Error('CanMeter: nessun campione — ingresso muto o non collegato');
      const media = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
      return { low: media(low), high: media(high) };
    } finally {
      this.capture = null;
    }
  }

  /**
   * Procedura completa a due punti. Il chiamante mostra le istruzioni e attende che l'utente
   * abbia effettivamente messo la resistenza al suo posto, poi risolve `onSwapTo`.
   *
   * Ciascun tono ha la SUA taratura: la risposta della scheda non è piatta in frequenza,
   * quindi il guadagno k a 40 Hz e a 990 Hz non è lo stesso.
   */
  async runTwoPointCalibration(
    onSwapTo: (ohm: number) => Promise<void>,
    r1 = CAN_CAL_R1,
    r2 = CAN_CAL_R2,
  ): Promise<{ low: Calibration; high: Calibration }> {
    if (!this.meter) throw new Error('CanMeter: calibrazione prima di start()');

    await onSwapTo(r1);
    const m1 = await this.measureRaw();
    await onSwapTo(r2);
    const m2 = await this.measureRaw();

    const low = solveTwoPointCalibration(m1.low, r1, m2.low, r2);
    const high = solveTwoPointCalibration(m1.high, r1, m2.high, r2);
    if (!low || !high) {
      throw new Error(
        'CanMeter: taratura rifiutata — punti degeneri. Verifica il cablaggio (il ritorno ' +
        'va a MASSA, non all ingresso) e usa due resistenze ben distanti fra loro.',
      );
    }

    this.meter.setCalibration(low, high);
    return { low, high };
  }

  /** Ricarica una taratura salvata (per non rifarla ad ogni avvio). */
  applyCalibration(low: Calibration, high: Calibration): void {
    this.meter?.setCalibration(low, high);
  }

  async stop(): Promise<void> {
    this.oscLow?.stop();
    this.oscHigh?.stop();
    this.node?.port.close();
    this.node?.disconnect();
    this.stream?.getTracks().forEach(t => t.stop());
    await this.ctx?.close().catch(() => {});
    this.ctx = null; this.stream = null; this.node = null;
    this.oscLow = null; this.oscHigh = null; this.meter = null; this.capture = null;
  }
}
