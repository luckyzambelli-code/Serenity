// O1 (optimization): @xenova/transformers + onnxruntime (~2.8 MB) is now loaded
// LAZILY — only when the offline Whisper engine is actually initialised (Electron, or
// when no Web Speech is available). Chrome's Web Speech path never pulls it in, so app
// startup is much lighter. The `env` configuration that used to run at import time now
// runs ONCE inside the dynamic loader, right before the model is loaded.
//
// CONN-61: model fully bundled in public/models/Xenova/whisper-tiny/ (JSON configs,
// tokenizers, quantized .onnx encoder/decoder) → first launch is 100 % offline.
type TransformersModule = typeof import('@xenova/transformers');
let _tfPromise: Promise<TransformersModule> | null = null;

function loadTransformers(): Promise<TransformersModule> {
  if (_tfPromise) return _tfPromise;
  _tfPromise = import('@xenova/transformers').then((mod) => {
    const env = mod.env;
    env.allowLocalModels  = true;
    env.allowRemoteModels = true;       // safety net if a local .onnx is missing
    env.localModelPath    = '/models/'; // served by the local server
    env.useBrowserCache   = true;       // HuggingFace cache → single download
    // WASM backend: ort-wasm*.wasm copied into public/wasm/ at build time. Without
    // this path ONNX looks on an external CDN and fails offline/in Electron.
    try {
      const onnxWasm = (env as any).backends?.onnx?.wasm;
      if (onnxWasm) {
        onnxWasm.wasmPaths  = '/wasm/';
        // CONN-65: single-thread WASM — the threaded build loaded but `generate()`
        // produced no output. Slower but RELIABLE.
        onnxWasm.numThreads = 1;
      }
    } catch (_) {}
    return mod;
  });
  return _tfPromise;
}

const VAD_THRESHOLD = 0.01;
// CONN-65: 550 ms trailing silence — a touch snappier than the original 700 ms
// while still capturing whole utterances (450 ms risked clipping on pauses).
const SILENCE_MS    = 550;

const LANG_MAP: Record<string, string> = {
  'en':    'english',
  'en-US': 'english',
  'fr':    'french',
  'fr-FR': 'french',
  'it':    'italian',
  'it-IT': 'italian',
  'es':    'spanish',
  'es-ES': 'spanish',
  'sv':    'swedish',
  'sv-SE': 'swedish',
};

export class OfflineSpeechRecognition {
  private audioCtx:      AudioContext | null = null;
  private analyser:      AnalyserNode | null = null;
  private stream:        MediaStream  | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks:   Blob[]       = [];
  private isListening    = false;
  private isSpeechActive = false;
  private silenceTimer:  ReturnType<typeof setTimeout> | null = null;
  private vadInterval:   ReturnType<typeof setInterval> | null = null;
  private model:         any = null;
  private processor:     any = null;
  private tokenizer:     any = null;
  private modelReady     = false;
  private whisperLang    = 'french';
  private initInProgress = false;
  // CONN-83: when fed an EXTERNAL stream (e.g. the remote preclear's WebRTC
  // audio on the auditor side), we must NOT stop its tracks on cleanup — the
  // WebRTC connection owns them. Only streams we open via getUserMedia are ours.
  private ownsStream     = true;

  onresult:    ((e: { results: { transcript: string; isFinal: boolean }[] }) => void) | null = null;
  onerror:     ((e: { error: string }) => void) | null = null;
  onmodelstatus: ((status: 'loading' | 'ready' | 'error', message?: string) => void) | null = null;

  set lang(code: string) {
    this.whisperLang = LANG_MAP[code] ?? 'french';
  }

  async init(externalStream?: MediaStream): Promise<boolean> {
    if (this.initInProgress) return false;
    this.initInProgress = true;

    try {
      if (!this.modelReady) {
        // CONN-63: clear any stale/corrupt transformers cache from earlier builds
        // (the HF-download era could leave a partial model that fails session
        // creation). Bump the version key to force a one-time clear after update.
        if (typeof caches !== 'undefined' && !localStorage.getItem('whisper-cache-v9')) {
          try {
            await caches.delete('transformers-cache');
            localStorage.removeItem('whisper-cache-v8');
            localStorage.setItem('whisper-cache-v9', '1');
          } catch (_) {}
        }

        this.onmodelstatus?.('loading');
        const MODEL_ID = 'Xenova/whisper-tiny';

        // Load processor + tokenizer (JSON configs from local /models/ or cache)
        // Load model weights (.onnx) from HuggingFace on first use, then cached
        console.log('[Whisper] Chargement du modèle Xenova/whisper-tiny…');
        // O1: dynamically import transformers + onnxruntime on first use.
        const { AutoProcessor, AutoTokenizer, AutoModelForSpeechSeq2Seq } = await loadTransformers();
        this.processor = await AutoProcessor.from_pretrained(MODEL_ID, { quantized: true });
        this.tokenizer  = await AutoTokenizer.from_pretrained(MODEL_ID);
        this.model      = await AutoModelForSpeechSeq2Seq.from_pretrained(MODEL_ID, { quantized: true });
        this.modelReady = true;
        this.onmodelstatus?.('ready');
        console.log('[Whisper] Modèle prêt');
      }

      // Réinitialiser le flux audio si nécessaire (only stop tracks we own)
      if (this.ownsStream) this.stream?.getTracks().forEach(t => t.stop());
      if (this.audioCtx) { this.audioCtx.close(); this.audioCtx = null; }

      if (externalStream) {
        // CONN-83: transcribe a provided stream (the remote preclear's WebRTC
        // audio) instead of this device's microphone. Use an audio-only copy so
        // MediaRecorder doesn't also capture video.
        this.ownsStream = false;
        this.stream = new MediaStream(externalStream.getAudioTracks());
      } else {
        this.ownsStream = true;
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      this.audioCtx = new AudioContext();
      if (this.audioCtx.state === 'suspended') await this.audioCtx.resume();

      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;
      const src = this.audioCtx.createMediaStreamSource(this.stream);
      src.connect(this.analyser);

      return true;
    } catch (err) {
      // CONN-62: surface the REAL underlying cause (e.g. which wasm/model file
      // failed to load) instead of just the generic "Can't create a session".
      const base = err instanceof Error ? err.message : String(err);
      const cause = (err as any)?.cause;
      const extra = cause ? ` — cause: ${cause instanceof Error ? cause.message : String(cause)}` : '';
      const msg = base + extra;
      console.error('[Whisper] Erreur init:', msg, err);
      this.onmodelstatus?.('error', msg);
      return false;
    } finally {
      this.initInProgress = false;
    }
  }

  start(): void {
    if (!this.audioCtx || !this.analyser || this.isListening) return;
    this.isListening = true;
    this.runVAD();
  }

  stop(): void {
    this.isListening   = false;
    this.isSpeechActive = false;
    if (this.vadInterval) { clearInterval(this.vadInterval); this.vadInterval = null; }
    if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null; }
    if (this.mediaRecorder?.state === 'recording') this.mediaRecorder.stop();
    this.mediaRecorder = null;
    this.audioChunks   = [];
    // CONN-83: never stop tracks we don't own (the WebRTC-provided stream).
    if (this.ownsStream) this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    if (this.audioCtx) { this.audioCtx.close(); this.audioCtx = null; }
    this.analyser = null;
  }

  private runVAD(): void {
    if (!this.analyser || !this.isListening) return;
    const bins = this.analyser.frequencyBinCount;
    const data  = new Uint8Array(bins);

    // CONN-66: drive the VAD with a setInterval, NOT requestAnimationFrame.
    // rAF is throttled/paused when the window is occluded or backgrounded — so
    // during a real session (operator looking at another window, screen saver,
    // etc.) the rAF-based VAD silently stopped sampling and nothing was ever
    // transcribed. A 50 ms timer keeps sampling regardless of window state.
    if (this.vadInterval) clearInterval(this.vadInterval);
    let _diagTick = 0, _diagPeak = 0;
    console.log('[Whisper][VAD] started — threshold=', VAD_THRESHOLD, 'tracks=', this.stream?.getAudioTracks().map(t => `${t.label}:${t.readyState}:muted=${t.muted}:enabled=${t.enabled}`));
    this.vadInterval = setInterval(() => {
      if (!this.isListening || !this.analyser) {
        if (this.vadInterval) { clearInterval(this.vadInterval); this.vadInterval = null; }
        return;
      }
      this.analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < bins; i++) { const n = data[i] / 255; sum += n * n; }
      const rms = Math.sqrt(sum / bins);

      // DIAG (CONN-118): every ~2 s report the peak level seen, so we can tell a
      // SILENT mic (peak ≈ 0) from a too-high threshold. Remove once STT confirmed.
      if (rms > _diagPeak) _diagPeak = rms;
      if (++_diagTick >= 40) { console.log('[Whisper][VAD] peak rms over 2s =', _diagPeak.toFixed(4), '(threshold', VAD_THRESHOLD, ')'); _diagTick = 0; _diagPeak = 0; }

      if (rms > VAD_THRESHOLD) {
        if (!this.isSpeechActive) { this.isSpeechActive = true; console.log('[Whisper][VAD] ▶ speech detected, recording (rms=', rms.toFixed(4), ')'); this.startRecording(); }
        if (this.silenceTimer) clearTimeout(this.silenceTimer);
        this.silenceTimer = setTimeout(() => this.endSegment(), SILENCE_MS);
      }
    }, 50);
  }

  private startRecording(): void {
    if (!this.stream) return;
    this.audioChunks = [];
    const opts: MediaRecorderOptions = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? { mimeType: 'audio/webm;codecs=opus' }
      : {};
    this.mediaRecorder = new MediaRecorder(this.stream, opts);
    this.mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) this.audioChunks.push(e.data); };
    this.mediaRecorder.start(100);
  }

  private endSegment(): void {
    if (!this.isSpeechActive) return;
    this.isSpeechActive = false;
    if (this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.onstop = () => this.transcribe();
      this.mediaRecorder.stop();
    } else {
      this.transcribe();
    }
  }

  private async transcribe(): Promise<void> {
    // DIAG (CONN-118): confirm the segment reaches transcription.
    console.log('[Whisper] transcribe() — chunks=', this.audioChunks.length, 'modelReady=', !!this.model);
    if (!this.audioChunks.length || !this.model || !this.processor || !this.tokenizer) return;
    const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
    this.audioChunks = [];

    try {
      const float32 = await this.blobToFloat32(blob);
      const { input_features } = await this.processor(float32);
      const forced_decoder_ids = this.tokenizer.get_decoder_prompt_ids({
        language: this.whisperLang,
        task: 'transcribe',
        no_timestamps: true,
      });
      // CONN-112: speed up Whisper. Defaults let generation run up to 448 tokens
      // and (per the model's generation_config) can do beam search — on single-
      // thread WASM that is SLOW, and on noisy/long segments it stalls or loops.
      // Cap the output and force greedy decoding: auditing replies are short, so
      // this cuts latency a lot with no quality loss on normal speech.
      const generated = await this.model.generate(input_features, {
        forced_decoder_ids: forced_decoder_ids.length > 0 ? forced_decoder_ids : undefined,
        max_new_tokens: 128,
        num_beams: 1,
        do_sample: false,
      });
      const text = (this.tokenizer.batch_decode(generated, { skip_special_tokens: true }))[0]?.trim() ?? '';
      console.log('[Whisper] result text =', JSON.stringify(text), '| onresult wired=', !!this.onresult);
      if (text && this.onresult) {
        this.onresult({ results: [{ transcript: text, isFinal: true }] });
      }
    } catch (err) {
      console.error('[Whisper] Transcription error:', err);
      this.onerror?.({ error: String(err) });
    }
  }

  private async blobToFloat32(blob: Blob): Promise<Float32Array> {
    const buf      = await blob.arrayBuffer();
    const decodeCtx = new AudioContext();
    const decoded  = await decodeCtx.decodeAudioData(buf);
    await decodeCtx.close();

    if (decoded.sampleRate === 16000) return decoded.getChannelData(0);

    const len    = Math.ceil(decoded.duration * 16000);
    const offCtx = new OfflineAudioContext(1, len, 16000);
    const src    = offCtx.createBufferSource();
    src.buffer   = decoded;
    src.connect(offCtx.destination);
    src.start(0);
    const resampled = await offCtx.startRendering();
    return resampled.getChannelData(0);
  }
}

export const offlineSpeechRecognition = new OfflineSpeechRecognition();
