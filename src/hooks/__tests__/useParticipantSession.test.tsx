// @vitest-environment jsdom
/**
 * useParticipantSession — LATO PRECLEAR/TELEFONO, il collegamento dei callback di networkManager.
 *
 * ── PERCHÉ QUESTO TEST ESISTE ────────────────────────────────────────────────────────────────
 * Gemello di `useRemoteSession.test.tsx` (v. la sua nota grande) per l'ALTRO lato della stessa
 * seduta a distanza. Questo hook (fase 9 della refonte) non aveva NESSUN test — proprio il
 * livello su cui è passata inosservata la dimenticanza del ripiego video. Come nel gemello:
 * NON si testa `connetti()` (richiederebbe mockare `getUserMedia`/PeerJS/il relay — rimandato
 * di proposito), si testa che montare l'hook colleghi DAVVERO ogni callback allo stato React.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useParticipantSession } from '../useParticipantSession';
import { networkManager } from '../../lib/networkManager';
import type { Language } from '../../i18n';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Harness({ out, setLang }: { out: { current: ReturnType<typeof useParticipantSession> | null }; setLang: (l: Language) => void }) {
  out.current = useParticipantSession({ lang: 'it', setLang });
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
  networkManager.onStreamReceived = () => {};
  networkManager.onVideoFallbackNeeded = () => {};
  networkManager.onVideoFrame = () => {};
  networkManager.onConnectionEstablished = () => {};
  networkManager.onConnectionClosed = () => {};
  networkManager.onDataReceived = () => {};
  networkManager.onError = () => {};
});

function mount(setLang: (l: Language) => void = () => {}) {
  const out: { current: ReturnType<typeof useParticipantSession> | null } = { current: null };
  act(() => { root.render(<Harness out={out} setLang={setLang} />); });
  return out;
}

describe('useParticipantSession — collegamento dei callback', () => {
  it('onStreamReceived: il video dell\'auditor arrivato aggiorna remoteStream', () => {
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

  it('⚠️ onVideoFrame: un fotogramma di scorta dell\'auditor aggiorna remoteVideoFrame (il bug appena trovato)', () => {
    const out = mount();
    act(() => { networkManager.onVideoFrame('data:image/jpeg;base64,XYZ'); });
    expect(out.current!.remoteVideoFrame).toBe('data:image/jpeg;base64,XYZ');
  });

  it('onConnectionEstablished: isConnected diventa vero', () => {
    const out = mount();
    act(() => { networkManager.onConnectionEstablished(); });
    expect(out.current!.isConnected).toBe(true);
  });

  it('onConnectionClosed: azzera stream, ripiego video e stato di connessione insieme', () => {
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

  it('onDataReceived LANG: segue la lingua imposta dall\'auditor', () => {
    const setLang = vi.fn();
    mount(setLang);
    act(() => { networkManager.onDataReceived({ type: 'LANG', lang: 'fr' }); });
    expect(setLang).toHaveBeenCalledWith('fr');
  });

  it('onDataReceived LANG con una lingua non riconosciuta: ignorata, nessuna chiamata', () => {
    const setLang = vi.fn();
    mount(setLang);
    act(() => { networkManager.onDataReceived({ type: 'LANG', lang: 'zz' }); });
    expect(setLang).not.toHaveBeenCalled();
  });

  it('onDataReceived SESSION_STATE "running": arma il microfono', () => {
    const out = mount();
    act(() => { networkManager.onDataReceived({ type: 'SESSION_STATE', state: 'running', seq: 1 }); });
    expect(out.current!.sessionState).toBe('running');
    expect(out.current!.micArmed).toBe(true);
  });

  it('onDataReceived SESSION_STATE "ended": disarma il microfono anche fuori sequenza (seq vecchio)', () => {
    const out = mount();
    act(() => { networkManager.onDataReceived({ type: 'SESSION_STATE', state: 'running', seq: 5 }); });
    expect(out.current!.micArmed).toBe(true);
    // seq=1 è "vecchio" rispetto a 5 — ma 'ended' si applica SEMPRE (v. il commento nell'hook).
    act(() => { networkManager.onDataReceived({ type: 'SESSION_STATE', state: 'ended', seq: 1 }); });
    expect(out.current!.sessionState).toBe('ended');
    expect(out.current!.micArmed).toBe(false);
  });

  it('onDataReceived READINESS: apre e chiude lo specchio del respiro guidato', () => {
    const out = mount();
    act(() => { networkManager.onDataReceived({ type: 'READINESS', open: true, phase: 'inhale', inhale: true }); });
    expect(out.current!.pcReadiness).toEqual({ phase: 'inhale', inhale: true, assessment: null });
    act(() => { networkManager.onDataReceived({ type: 'READINESS', open: false }); });
    expect(out.current!.pcReadiness).toBeNull();
  });

  it('smontaggio: i callback tornano no-op — un evento tardivo del singleton non tocca più questo hook', () => {
    const out = mount();
    act(() => { root.unmount(); });
    expect(() => networkManager.onVideoFallbackNeeded()).not.toThrow();
    expect(() => networkManager.onConnectionClosed()).not.toThrow();
    expect(out.current!.videoFallbackActive).toBe(false);
  });
});
