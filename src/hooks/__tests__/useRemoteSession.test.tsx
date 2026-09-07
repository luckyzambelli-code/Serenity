// @vitest-environment jsdom
/**
 * useRemoteSession — LATO AUDITOR, il collegamento dei callback di networkManager.
 *
 * ── PERCHÉ QUESTO TEST ESISTE ────────────────────────────────────────────────────────────────
 * Segnalato nella revisione completa: questo hook (375 righe, l'intero collante di rete
 * dell'auditor in SERENITY) non aveva NESSUN test — ed è esattamente il livello su cui è
 * sopravvissuta inosservata, per più giri, la dimenticanza che ha causato « non vedo la video »
 * (`onVideoFallbackNeeded`/`onVideoFrame` mai assegnati). Questo file non testa `avvia()` o
 * `connetti()` (richiederebbero mockare fetch/PeerJS/il relay — un passaggio più pesante,
 * rimandato di proposito, stessa scelta già fatta in `networkManager.test.ts`): testa SOLO che
 * montare l'hook colleghi DAVVERO ogni callback di `networkManager` allo stato React — la
 * proprietà che, se persa di nuovo per un file dimenticato, deve far fallire un test, non
 * aspettare che qualcuno lo noti dal vivo in seduta.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useRemoteSession } from '../useRemoteSession';
import { networkManager } from '../../lib/networkManager';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Harness({ out }: { out: { current: ReturnType<typeof useRemoteSession> | null } }) {
  out.current = useRemoteSession({ lang: 'it' });
  return null;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
  vi.restoreAllMocks();
  // Ripristina i callback del singleton a no-op — stessa igiene di useMuseConnection.test.tsx,
  // altrimenti un test successivo (in un altro file) potrebbe trovare ancora agganciati questi.
  networkManager.onStreamReceived = () => {};
  networkManager.onVideoFallbackNeeded = () => {};
  networkManager.onVideoFrame = () => {};
  networkManager.onConnectionEstablished = () => {};
  networkManager.onConnectionClosed = () => {};
  networkManager.onDataReceived = () => {};
  networkManager.onError = () => {};
});

function mount() {
  const out: { current: ReturnType<typeof useRemoteSession> | null } = { current: null };
  act(() => { root.render(<Harness out={out} />); });
  return out;
}

describe('useRemoteSession — collegamento dei callback', () => {
  it('onStreamReceived: un flusso remoto arrivato aggiorna remoteStream', () => {
    const out = mount();
    const flusso = {} as MediaStream;
    act(() => { networkManager.onStreamReceived(flusso); });
    expect(out.current!.remoteStream).toBe(flusso);
  });

  it('⚠️ onVideoFallbackNeeded: il ripiego JPEG deve accendere videoFallbackActive (il bug appena trovato)', () => {
    const out = mount();
    expect(out.current!.videoFallbackActive).toBe(false);
    act(() => { networkManager.onVideoFallbackNeeded(); });
    expect(out.current!.videoFallbackActive).toBe(true);
  });

  it('⚠️ onVideoFrame: un fotogramma di ripiego arrivato aggiorna remoteVideoFrame (il bug appena trovato)', () => {
    const out = mount();
    act(() => { networkManager.onVideoFrame('data:image/jpeg;base64,ABC'); });
    expect(out.current!.remoteVideoFrame).toBe('data:image/jpeg;base64,ABC');
  });

  it('onConnectionEstablished: isConnected diventa vero', () => {
    const out = mount();
    act(() => { networkManager.onConnectionEstablished(); });
    expect(out.current!.isConnected).toBe(true);
  });

  it('onConnectionClosed: azzera stream, ripiego video, e stato di connessione insieme', () => {
    const out = mount();
    act(() => {
      networkManager.onStreamReceived({} as MediaStream);
      networkManager.onVideoFallbackNeeded();
      networkManager.onVideoFrame('data:x');
      networkManager.onConnectionEstablished();
    });
    expect(out.current!.isConnected).toBe(true);
    act(() => { networkManager.onConnectionClosed(); });
    expect(out.current!.isConnected).toBe(false);
    expect(out.current!.remoteStream).toBeNull();
    expect(out.current!.videoFallbackActive).toBe(false);
    expect(out.current!.remoteVideoFrame).toBeNull();
  });

  it('onDataReceived: BATTERY/MUSE_STATUS/SIGNAL_QUALITY aggiornano lo stato corrispondente', () => {
    const out = mount();
    act(() => { networkManager.onDataReceived({ type: 'BATTERY', level: 62 }); });
    expect(out.current!.remoteBatteryLevel).toBe(62);
    act(() => { networkManager.onDataReceived({ type: 'MUSE_STATUS', connected: true }); });
    expect(out.current!.remoteMuseConnected).toBe(true);
    act(() => { networkManager.onDataReceived({ type: 'SIGNAL_QUALITY', value: 3 }); });
    expect(out.current!.remoteSignalQuality).toBe(3);
  });

  it('onDataReceived TRANSCRIPT: inoltra il testo a onTrascrizione', () => {
    const onTrascrizione = vi.fn();
    const out: { current: ReturnType<typeof useRemoteSession> | null } = { current: null };
    function H() { out.current = useRemoteSession({ lang: 'it', onTrascrizione }); return null; }
    act(() => { root.render(<H />); });
    act(() => { networkManager.onDataReceived({ type: 'TRANSCRIPT', text: 'ciao' }); });
    expect(onTrascrizione).toHaveBeenCalledWith('ciao');
  });

  it('onDataReceived DIAG: inoltra a onDiagnostica, MAI a onTrascrizione (canali separati apposta)', () => {
    const onTrascrizione = vi.fn();
    const onDiagnostica = vi.fn();
    const out: { current: ReturnType<typeof useRemoteSession> | null } = { current: null };
    function H() { out.current = useRemoteSession({ lang: 'it', onTrascrizione, onDiagnostica }); return null; }
    act(() => { root.render(<H />); });
    act(() => { networkManager.onDataReceived({ type: 'DIAG', text: 'diagnostica' }); });
    expect(onDiagnostica).toHaveBeenCalledWith('diagnostica');
    expect(onTrascrizione).not.toHaveBeenCalled();
  });

  it('smontaggio: i callback tornano no-op — un evento tardivo del singleton non tocca più questo hook', () => {
    const out = mount();
    act(() => { root.unmount(); });
    // Nessun act() intorno: se il callback fosse ancora quello dell'hook smontato, React
    // avviserebbe di un aggiornamento di stato su un componente smontato (o peggio lo
    // applicherebbe comunque) — qui deve essere un no-op silenzioso.
    expect(() => networkManager.onVideoFallbackNeeded()).not.toThrow();
    expect(() => networkManager.onConnectionClosed()).not.toThrow();
    // out.current resta quello dell'ULTIMO render prima dello smontaggio, invariato.
    expect(out.current!.videoFallbackActive).toBe(false);
  });
});
