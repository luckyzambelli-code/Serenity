// @vitest-environment jsdom
/**
 * useMediaRelayFallback — il ripiego video/audio sul relay WebSocket (CONN-33/CONN-39).
 *
 * ── PERCHÉ QUESTO TEST ESISTE ────────────────────────────────────────────────────────────────
 * Segnalato nella revisione completa del codice di SERENITY: questo hook — l'INTERO meccanismo
 * che fa vedere/sentire qualcosa quando il WebRTC non riesce a stabilirsi — non aveva NESSUN
 * test. Non è un dettaglio: è esattamente la classe di bug appena trovata dal vivo (« non vedo
 * né la video a distanza né quella del PC ») — `useMediaRelayFallback()` esisteva da tempo in
 * `App.tsx`, ma non era mai stato MONTATO in `Serenity.tsx`/`VistaPartecipante.tsx`, e nessun
 * test lo avrebbe mai potuto scoprire perché nessun test lo esercitava affatto, in nessuna
 * delle due applicazioni. Questo file colma quel buco per l'hook stesso — un test che verifica
 * DAVVERO "quando la bandiera è alzata e c'è una camera, i fotogrammi partono", non solo che
 * l'hook non esploda.
 *
 * ── COSA SI MOCKA E PERCHÉ ───────────────────────────────────────────────────────────────────
 * jsdom non implementa un vero canvas 2D (serve il pacchetto nativo `canvas`, non installato
 * qui) né `HTMLMediaElement.play()` — entrambi sostituiti con stub minimi. `readyState`/
 * `videoWidth`/`videoHeight` sono normalmente 0 in jsdom (nessuna decodifica video reale):
 * forzati sul prototipo per la durata di questo file, l'unico modo di simulare "il video è
 * pronto" senza un vero elemento `<video>` che riproduce qualcosa. `networkManager` è il
 * singleton REALE (stesso principio di `useMuseConnection.test.tsx`) — solo `sendVideoFrame`/
 * `sendAudioChunk` sono spiate, il resto (buffer, stato) non serve a questo test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useMediaRelayFallback } from '../useMediaRelayFallback';
import { networkManager } from '../../lib/networkManager';
import { useNetworkStore } from '../../store/networkStore';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function fakeStream(video: boolean, audio: boolean): MediaStream {
  return {
    getVideoTracks: () => (video ? [{} as MediaStreamTrack] : []),
    getAudioTracks: () => (audio ? [{} as MediaStreamTrack] : []),
    getTracks: () => [
      ...(video ? [{} as MediaStreamTrack] : []),
      ...(audio ? [{} as MediaStreamTrack] : []),
    ],
  } as unknown as MediaStream;
}

function setLocalStream(stream: MediaStream | null) {
  (networkManager as unknown as { localStream: MediaStream | null }).localStream = stream;
}

function Harness() {
  useMediaRelayFallback();
  return null;
}

let container: HTMLDivElement;
let root: Root;
let drawImageSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  // « Il video è pronto » — jsdom non decodifica mai un flusso reale, quindi questi tre
  // restano fermi a 0/HAVE_NOTHING di default: senza forzarli, la guardia dell'hook
  // (`video.readyState < 2 || video.videoWidth === 0`) scarterebbe OGNI fotogramma.
  Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { configurable: true, get: () => 4 });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 640 });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 480 });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);

  drawImageSpy = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: drawImageSpy,
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,FAKE');
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
  setLocalStream(null);
  useNetworkStore.getState().setVideoFallbackActive(false);
  useNetworkStore.getState().setIsConnected(false);
  Reflect.deleteProperty(HTMLMediaElement.prototype, 'readyState');
  Reflect.deleteProperty(HTMLVideoElement.prototype, 'videoWidth');
  Reflect.deleteProperty(HTMLVideoElement.prototype, 'videoHeight');
});

function mount() {
  act(() => { root.render(<Harness />); });
}

describe('useMediaRelayFallback — video', () => {
  it('bandiera spenta: non cattura nulla, anche con una camera pronta', () => {
    setLocalStream(fakeStream(true, false));
    useNetworkStore.getState().setIsConnected(true);
    useNetworkStore.getState().setVideoFallbackActive(false); // ⚠️ il caso appena trovato dal vivo
    const spy = vi.spyOn(networkManager, 'sendVideoFrame');
    mount();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(spy).not.toHaveBeenCalled();
  });

  it('connesso ma non ancora dichiarato in ripiego: non cattura (isConnected da solo non basta)', () => {
    setLocalStream(fakeStream(true, false));
    useNetworkStore.getState().setIsConnected(false);
    useNetworkStore.getState().setVideoFallbackActive(true);
    const spy = vi.spyOn(networkManager, 'sendVideoFrame');
    mount();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(spy).not.toHaveBeenCalled();
  });

  it('nessuna camera locale: non cattura nulla da mandare', () => {
    setLocalStream(fakeStream(false, false));
    useNetworkStore.getState().setIsConnected(true);
    useNetworkStore.getState().setVideoFallbackActive(true);
    const spy = vi.spyOn(networkManager, 'sendVideoFrame');
    mount();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(spy).not.toHaveBeenCalled();
  });

  it('bandiera accesa + camera pronta + connesso: cattura DAVVERO e manda i fotogrammi JPEG', () => {
    setLocalStream(fakeStream(true, false));
    useNetworkStore.getState().setIsConnected(true);
    useNetworkStore.getState().setVideoFallbackActive(true);
    const spy = vi.spyOn(networkManager, 'sendVideoFrame');
    mount();
    // ~6 fps, un intervallo ogni 160ms — 500ms ne fa scattare almeno 3.
    act(() => { vi.advanceTimersByTime(500); });
    expect(drawImageSpy).toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith('data:image/jpeg;base64,FAKE');
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('lo smontaggio ferma la cattura — nessun fotogramma dopo lo smontaggio', () => {
    setLocalStream(fakeStream(true, false));
    useNetworkStore.getState().setIsConnected(true);
    useNetworkStore.getState().setVideoFallbackActive(true);
    const spy = vi.spyOn(networkManager, 'sendVideoFrame');
    mount();
    act(() => { vi.advanceTimersByTime(200); });
    const callsPrima = spy.mock.calls.length;
    expect(callsPrima).toBeGreaterThan(0);
    act(() => { root.unmount(); });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(spy.mock.calls.length).toBe(callsPrima); // nessuna chiamata in più dopo lo smontaggio
  });

  it('il video catturato è agganciato al documento (mobile Chrome non produce frame da un video invisibile)', () => {
    setLocalStream(fakeStream(true, false));
    useNetworkStore.getState().setIsConnected(true);
    useNetworkStore.getState().setVideoFallbackActive(true);
    mount();
    // FIX CONN-37 (v. il commento nell'hook): un <video> scollegato dal DOM non produce
    // fotogrammi su Chrome mobile — deve essere DAVVERO nel document, non solo creato.
    const video = document.body.querySelector('video');
    expect(video).not.toBeNull();
    expect(video!.muted).toBe(true);
  });
});

describe('useMediaRelayFallback — audio', () => {
  it('nessuna traccia audio locale: non tocca affatto Web Audio (niente AudioContext creato)', () => {
    setLocalStream(fakeStream(true, false)); // video sì, audio no
    useNetworkStore.getState().setIsConnected(true);
    useNetworkStore.getState().setVideoFallbackActive(true);
    const AudioContextSpy = vi.fn();
    (window as unknown as { AudioContext: unknown }).AudioContext = AudioContextSpy;
    mount();
    act(() => { vi.advanceTimersByTime(200); });
    expect(AudioContextSpy).not.toHaveBeenCalled();
    Reflect.deleteProperty(window, 'AudioContext');
  });

  it('una traccia audio locale con la bandiera accesa: apre DAVVERO un canale Web Audio', () => {
    setLocalStream(fakeStream(false, true));
    useNetworkStore.getState().setIsConnected(true);
    useNetworkStore.getState().setVideoFallbackActive(true);

    const gain = { connect: vi.fn(), gain: { value: 0 } };
    const processor = { connect: vi.fn(), disconnect: vi.fn(), onaudioprocess: null as unknown };
    const source = { connect: vi.fn(), disconnect: vi.fn() };
    // ⚠️ `function`, non una freccia — `vi.fn()` rende costruibile via `new` solo un
    // mock la cui implementazione è una vera `function`/`class` (avviso di vitest stesso).
    const FakeAudioContext = vi.fn(function AudioContextStub(this: Record<string, unknown>) {
      this.state = 'running';
      this.sampleRate = 48000;
      this.currentTime = 0;
      this.createMediaStreamSource = vi.fn(() => source);
      this.createScriptProcessor = vi.fn(() => processor);
      this.createGain = vi.fn(() => gain);
      this.close = vi.fn().mockResolvedValue(undefined);
    });
    (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;

    mount();
    expect(FakeAudioContext).toHaveBeenCalledTimes(1);
    expect(source.connect).toHaveBeenCalledWith(processor);
    expect(processor.connect).toHaveBeenCalledWith(gain);
    expect(gain.connect).toHaveBeenCalled();

    Reflect.deleteProperty(window, 'AudioContext');
  });
});
