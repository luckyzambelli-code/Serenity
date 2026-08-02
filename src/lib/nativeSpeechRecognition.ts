// nativeSpeechRecognition — renderer-side wrapper around the macOS native STT
// sidecar (SFSpeechRecognizer), exposed by the Electron main process via
// window.electronAPI.stt. Mirrors the interface of OfflineSpeechRecognition so
// App.tsx can swap engines transparently.
//
// Only usable in Electron-on-macOS (where electronAPI.stt exists). Elsewhere
// init() returns false and the caller falls back to the WASM Whisper engine.

interface SttApi {
  start: (locale: string) => Promise<{ ok: boolean; error?: string }>;
  stop: () => Promise<unknown>;
  onData: (cb: (p: { type: string; text?: string; value?: string; msg?: string }) => void) => () => void;
}

function getApi(): SttApi | null {
  const api = (typeof window !== 'undefined') ? (window as any).electronAPI?.stt : null;
  return api && typeof api.start === 'function' ? api as SttApi : null;
}

export class NativeSpeechRecognition {
  private locale = 'en-US';
  private unsub: (() => void) | null = null;
  private listening = false;

  /** `speechEndMs` (su `isFinal`) è l'istante — in `performance.now()` — in cui la parola è
   *  FINITA, che non è quello in cui la frase viene dichiarata: fra i due c'è il silenzio di
   *  900 ms che il riconoscitore aspetta prima di chiudere. */
  onresult:      ((e: { results: { transcript: string; isFinal: boolean }[];
                        speechEndMs?: number }) => void) | null = null;
  onerror:       ((e: { error: string }) => void) | null = null;
  onmodelstatus: ((status: 'loading' | 'ready' | 'error', message?: string) => void) | null = null;

  /** Accept a BCP-47 locale ('fr-FR') — same setter shape as the Whisper engine. */
  set lang(code: string) { this.locale = code || 'en-US'; }

  /** True only when the OS is actually listening (permission granted, engine up).
   *  Returns false when native STT is unavailable or permission is denied → the
   *  caller then falls back to the offline Whisper engine. */
  async init(): Promise<boolean> {
    const api = getApi();
    if (!api) return false; // not Electron-on-macOS

    // Subscribe before starting so we don't miss the first status/result.
    this.attach(api);
    this.onmodelstatus?.('loading');

    const res = await api.start(this.locale).catch(() => ({ ok: false }));
    if (!res || !res.ok) { this.detach(); return false; }

    // Wait for the sidecar to confirm it's listening (or report failure).
    return await new Promise<boolean>((resolve) => {
      let settled = false;
      const done = (ok: boolean) => { if (!settled) { settled = true; resolve(ok); } };
      const offProbe = api.onData((p) => {
        if (p.type === 'status') {
          if (p.value === 'listening') { this.listening = true; this.onmodelstatus?.('ready'); done(true); offProbe(); }
          else if (['denied', 'unavailable', 'error', 'exited'].includes(p.value || '')) { done(false); offProbe(); }
        }
      });
      // Safety timeout: if no 'listening' within 6 s, give up → Whisper fallback.
      setTimeout(() => { done(false); offProbe(); }, 6000);
    });
  }

  /** No-op: init() already started the engine. Kept for interface parity. */
  start(): void { /* already listening after init() */ }

  stop(): void {
    const api = getApi();
    try { api?.stop(); } catch (_) {}
    this.listening = false;
    this.detach();
  }

  private attach(api: SttApi): void {
    this.detach();
    this.unsub = api.onData((p) => {
      if (p.type === 'final' && p.text) {
        // `speechEndMs` = quando la PAROLA è finita davvero, non quando la frase è stata
        // dichiarata. Il riconoscitore aspetta 900 ms di silenzio prima di dire « final »:
        // datare l'item a quel momento lo sposta di quasi un secondo, e l'instant read
        // dell'ago — che avviene alla fine della parola — finisce fuori dalla sua finestra.
        // L'ultimo `partial` è l'ultima volta che si sono riconosciute parole: è quella la fine.
        this.onresult?.({ results: [{ transcript: p.text, isFinal: true }],
                          speechEndMs: this.lastPartialMs || performance.now() });
        this.lastPartialMs = 0;
      } else if (p.type === 'partial' && p.text) {
        this.lastPartialMs = performance.now();
        // Interim hypothesis — App ignores non-final results, but forward it so a
        // future live-caption feature can use it.
        this.onresult?.({ results: [{ transcript: p.text, isFinal: false }] });
      } else if (p.type === 'status' && ['denied', 'unavailable', 'error', 'exited'].includes(p.value || '')) {
        this.listening = false;
        this.onerror?.({ error: p.value || 'native stt error' });
      }
    });
  }

  /** Quando è arrivata l'ultima ipotesi parziale = quando si è smesso di parlare. */
  private lastPartialMs = 0;

  private detach(): void {
    if (this.unsub) { try { this.unsub(); } catch (_) {} this.unsub = null; }
  }
}

export const nativeSpeechRecognition = new NativeSpeechRecognition();
