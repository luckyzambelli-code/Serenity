/**
 * useParticipantSession — LA SEDUTA A DISTANZA, LATO PRECLEAR/TELEFONO. Fase 9 della refonte.
 *
 * ── PERCHÉ ESISTE ────────────────────────────────────────────────────────────────────────────
 * Segnalato dal vivo, con insistenza crescente: « non deve più esserci EQUILIBRIUM sul
 * telefonino ». Fino a qui, un telefono che apriva un link/QR di SERENITY veniva rimandato
 * (`src/serenity/main.tsx`) a `index.html` — il bundle di EQUILIBRIUM — perché SOLO `App.tsx`
 * possedeva la logica da PARTECIPANTE (`autoJoinDoneRef`, `ParticipantView.tsx`, il
 * riconoscimento vocale, l'appaiamento MUSE). Ogni bug del telefono (lingua di default,
 * righe del Giornale mai arrivate, video muto) era quindi un bug DENTRO il codice di
 * EQUILIBRIUM — non perché SERENITY dipendesse da un'altra applicazione per scelta, ma perché
 * quella logica non esisteva ancora altrove.
 *
 * Questo hook È quell'altrove: la STESSA logica di connessione/trascrizione/stato-seduta di
 * `App.tsx` (lato partecipante), riscritta per essere chiamata da un componente SERENITY
 * (`VistaPartecipante.tsx`) invece che vissuta dentro `App.tsx`. Non una versione
 * "semplificata" — resta lo STESSO protocollo via dati (`LANG`, `SESSION_STATE`, `TRANSCRIPT`,
 * `CLOCK_SYNC`), la stessa gestione degli errori del riconoscitore, la stessa scelta
 * video-solo per il satellite (v. la nota su `wantAudio`, sotto) — verificata riga per riga
 * contro `App.tsx` perché un preclear su questo hook e un auditor su SERENITY (o EQUILIBRIUM)
 * devono potersi capire allo stesso modo di sempre.
 *
 * ── COSA RESTA FUORI DI PROPOSITO, PER ORA ──────────────────────────────────────────────────
 * Due cose NON sono ancora qui, esplicitamente rimandate (non dimenticate):
 *   1. Il µ-ritardo di `sttBackdateRef` (la datazione fine-parola dal microfono/tono di voce,
 *      in `App.tsx`) — qui la trascrizione usa l'ora di arrivo diretta. Rifinitura per un
 *      giro dedicato, non blocca la funzione di base (connettersi, essere visti, essere
 *      sentiti, sapere quando la seduta è aperta/chiusa).
 *   2. `READINESS`/lo specchio del respiro guidato (`MetabolicCheck mirror`) — riguarda SOLO
 *      una VERA seduta a distanza (non il satellite, l'unico caso provato finora dal vivo);
 *      lo stato arriva già (`pcReadiness`, sotto) ma senza ancora un componente che lo disegni.
 *   3. `MNA_AUDIO` (i toni neuro-acustici in cuffia) — stessa ragione del punto 2.
 * Il MUSE del preclear invece NON è stato riscritto: `useMuseConnection` (fase 2) è già
 * indifferente al ruolo di chi lo chiama (`appMode: () => 'participant'`) — lo stesso codice,
 * chiamato da qui, non una seconda copia.
 *
 * @see docs/serenity-refonte.md — fase 9.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { networkManager, parseConnectionLink } from '../lib/networkManager';
import { useNetworkStore } from '../store/networkStore';
import { voiceToneAnalyzer } from '../lib/voiceToneAnalyzer';
import type { Language } from '../i18n';

export type StatoSedutaPartecipante = 'idle' | 'running' | 'paused' | 'ended';

const VOICE_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true, noiseSuppression: true, autoGainControl: true,
};

const LINGUA_RICONOSCITORE: Record<string, string> = {
  en: 'en-US', fr: 'fr-FR', it: 'it-IT', es: 'es-ES', sv: 'sv-SE',
};

/** ⚠️ Un tipo MINIMO scritto a mano — l'API Web Speech non è nel lib DOM standard di
 *  TypeScript (`SpeechRecognition` è vendor-prefixed su gran parte dei browser). Copre solo
 *  quel che questo file legge davvero, non l'intera specifica. */
interface RiconoscitoreVocale {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: RisultatoRiconoscimento) => void) | null;
  onaudiostart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onstart: (() => void) | null;
  onend: (() => void) | null;
}
interface RisultatoRiconoscimento {
  resultIndex: number;
  results: { length: number; [i: number]: { isFinal: boolean; [i: number]: { transcript: string } } };
}

export interface RichiestaPronti {
  phase: string; inhale: boolean; assessment: unknown;
}

export function useParticipantSession(opts: {
  /** La lingua CORRENTE — usata per la lingua del riconoscitore vocale. `LANG` in arrivo
   *  dall'auditor la aggiorna da sé (v. sotto) tramite `setLingua`, che il chiamante deve
   *  passare: lo stesso pattern di `useRemoteSession`, il preclear segue l'auditor. */
  lang: Language;
  setLang: (l: Language) => void;
}) {
  const setPeerId          = useNetworkStore(s => s.setPeerId);
  const setIsConnected     = useNetworkStore(s => s.setIsConnected);
  const setRemoteStream    = useNetworkStore(s => s.setRemoteStream);
  const isConnected        = useNetworkStore(s => s.isConnected);
  const remoteStream       = useNetworkStore(s => s.remoteStream);
  // ⚠️ AGGIUNTI — stessa correzione gemella di `useRemoteSession.ts` (v. la sua nota grande):
  // « non vedo né la video a distanza dell'auditor né quella del PC ». Senza questi due, quando
  // il WebRTC non arriva (rete che blocca ICE/TURN — la causa più probabile, la stessa già
  // documentata in `networkManager.ts`, CONN-29) il telefono non aveva NESSUN ripiego: né
  // riceveva i fotogrammi di scorta dell'auditor, né mandava i propri.
  const setVideoFallbackActive = useNetworkStore(s => s.setVideoFallbackActive);
  const setRemoteVideoFrame    = useNetworkStore(s => s.setRemoteVideoFrame);
  const videoFallbackActive    = useNetworkStore(s => s.videoFallbackActive);
  const remoteVideoFrame       = useNetworkStore(s => s.remoteVideoFrame);

  const [connecting, setConnecting] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [satellite, setSatellite] = useState(false);
  const satelliteRef = useRef(false);
  const [sessionState, setSessionState] = useState<StatoSedutaPartecipante>('idle');
  const sessionStateRef = useRef<StatoSedutaPartecipante>('idle');
  const [micArmed, setMicArmed] = useState(false);
  const micArmedRef = useRef(false);
  const [pcReadiness, setPcReadiness] = useState<RichiestaPronti | null>(null);
  const timeRef = useRef(0);
  const auditorPeerIdRef = useRef('');
  const isConnectingRef = useRef(false);
  const lastSeqRef = useRef(0);

  const langRef = useRef(opts.lang);
  langRef.current = opts.lang;
  const setLangRef = useRef(opts.setLang);
  setLangRef.current = opts.setLang;

  // ── IL RICONOSCITORE VOCALE — v. `App.tsx`, lo stesso motore, senza il ramo Electron (un
  //    telefono non lo è mai: niente STT nativo/Whisper da scegliere qui). ─────────────────
  const recognitionRef = useRef<RiconoscitoreVocale | null>(null);
  const recognitionActiveRef = useRef(false);
  const audioStartLoggedRef = useRef(false);
  const speechStartLoggedRef = useRef(false);

  const fermaRiconoscimento = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) { /* già fermo */ }
    }
  }, []);

  useEffect(() => {
    const SpeechRecognitionCtor = (window as unknown as {
      SpeechRecognition?: new () => RiconoscitoreVocale;
      webkitSpeechRecognition?: new () => RiconoscitoreVocale;
    }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: new () => RiconoscitoreVocale }).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;
    const eng = new SpeechRecognitionCtor();
    recognitionRef.current = eng;
    eng.continuous = true;
    eng.interimResults = true;
    eng.lang = LINGUA_RICONOSCITORE[langRef.current] || 'en-US';

    eng.onresult = (event: RisultatoRiconoscimento) => {
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (!event.results[i].isFinal) continue;
        const transcript = String(event.results[i][0].transcript || '').trim();
        if (!transcript) continue;
        const tono = voiceToneAnalyzer.analyze() || undefined;
        try {
          networkManager.send({ type: 'TRANSCRIPT', speaker: 'PC', text: transcript, time: timeRef.current, tone: tono }, true);
        } catch (_) { /* canale non pronto, la prossima frase ci riprova */ }
      }
    };
    // CONN-82 (stessa ragione di App.tsx): sapere se il microfono è davvero libero (non
    // conteso dal WebRTC) e se l'audio arriva al riconoscitore — una volta sola per seduta.
    eng.onaudiostart = () => {
      if (micArmedRef.current && !audioStartLoggedRef.current) {
        audioStartLoggedRef.current = true;
        try { networkManager.send({ type: 'TRANSCRIPT', speaker: 'PC', text: '🔊 [PC micro ouvert]', time: timeRef.current }, true); } catch (_) {}
      }
    };
    eng.onspeechstart = () => {
      if (micArmedRef.current && !speechStartLoggedRef.current) {
        speechStartLoggedRef.current = true;
        try { networkManager.send({ type: 'TRANSCRIPT', speaker: 'PC', text: '🗣️ [PC voix détectée]', time: timeRef.current }, true); } catch (_) {}
      }
    };
    eng.onerror = (event: { error?: string }) => {
      const safeError = String(event.error || '').replace(/[\r\n\t]/g, ' ').slice(0, 100);
      // CONN-81: benigni e frequentissimi su Android Chrome — onend li riavvia da sé.
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      if (micArmedRef.current) {
        try { networkManager.send({ type: 'TRANSCRIPT', speaker: 'PC', text: `⚠️ [PC mic: ${safeError}]`, time: timeRef.current }, true); } catch (_) {}
      }
      // Nessun ripiego su un motore offline (Whisper) qui — v. la nota grande in cima al
      // file: un telefono non ha alternative locali sensate, l'errore resta visibile e
      // `onend` riprova da solo.
    };
    eng.onstart = () => { recognitionActiveRef.current = true; };
    eng.onend = () => {
      recognitionActiveRef.current = false;
      if (sessionStateRef.current === 'running' || micArmedRef.current) {
        setTimeout(() => {
          if (!recognitionRef.current) return;
          if (sessionStateRef.current !== 'running' && !micArmedRef.current) return;
          try { recognitionRef.current.start(); } catch (_) { /* già avviato / transitorio */ }
        }, 300);
      }
    };

    return () => { try { eng.stop(); } catch (_) {} recognitionRef.current = null; };
  }, [opts.lang]);

  // Guardia periodica (stessa ragione di App.tsx, CHRONIC-FIX): se il riconoscitore muore
  // senza che `onend` se ne accorga, questa lo rianima entro 8s invece di restare muto.
  useEffect(() => {
    const id = setInterval(() => {
      if ((sessionStateRef.current === 'running' || micArmedRef.current)
          && recognitionRef.current && !recognitionActiveRef.current) {
        try { recognitionRef.current.start(); } catch (_) { /* già avviato */ }
      }
    }, 8000);
    return () => clearInterval(id);
  }, []);

  // ── I CALLBACK DEL MOTORE — assegnati UNA volta. Un telefono che apre questa vista non fa
  //    MAI anche da auditor: nessun conflitto con `useRemoteSession` (gira su un altro
  //    dispositivo, un altro `networkManager` singleton). ────────────────────────────────────
  useEffect(() => {
    networkManager.onError = (msg) => setErrore(msg);

    networkManager.onStreamReceived = (stream) => setRemoteStream(stream);

    networkManager.onVideoFallbackNeeded = () => setVideoFallbackActive(true);
    networkManager.onVideoFrame = (dataUrl) => setRemoteVideoFrame(dataUrl);

    networkManager.onConnectionEstablished = () => {
      setIsConnected(true);
      setErrore(null);
      isConnectingRef.current = false;
      // FIX CONN-11 (stessa ragione di App.tsx): tenere lo schermo acceso mentre si è
      // connessi, altrimenti Chrome Android/iOS Safari sospendono la scheda e la relay SSE
      // cade da sola.
      const nav = navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<unknown> } };
      nav.wakeLock?.request('screen')
        .then(lock => { (window as unknown as { _smWakeLockPartecipante?: unknown })._smWakeLockPartecipante = lock; })
        .catch(() => { /* gesto utente non ancora concesso, o non supportato */ });
    };

    networkManager.onConnectionClosed = () => {
      setIsConnected(false);
      setRemoteStream(null);
      setVideoFallbackActive(false);
      setRemoteVideoFrame(null);
    };

    networkManager.onDataReceived = (data: unknown) => {
      if (!data || typeof data !== 'object' || typeof (data as { type?: unknown }).type !== 'string') return;
      const msg = data as { type: string; lang?: string; state?: string; seq?: number; time?: number; open?: boolean; phase?: string; inhale?: boolean; assessment?: unknown };
      switch (msg.type) {
        case 'LANG':
          if (typeof msg.lang === 'string' && ['en', 'fr', 'it', 'es', 'sv'].includes(msg.lang)) {
            setLangRef.current(msg.lang as Language);
          }
          break;
        case 'SESSION_STATE': {
          if (!['idle', 'running', 'paused', 'ended'].includes(msg.state as string)) return;
          const nuovo = msg.state as StatoSedutaPartecipante;
          // FIX #6 (stessa ragione di App.tsx): un 'ended' si applica SEMPRE, anche fuori
          // sequenza — altrimenti un riavvio dell'auditor (contatore azzerato) lo scarterebbe
          // come "vecchio" e il preclear resterebbe bloccato su una seduta già chiusa.
          if (typeof msg.seq === 'number' && nuovo !== 'ended') {
            if (msg.seq <= lastSeqRef.current) return;
            lastSeqRef.current = msg.seq;
          }
          if (typeof msg.time === 'number') timeRef.current = msg.time;
          sessionStateRef.current = nuovo;
          setSessionState(nuovo);
          if (nuovo === 'running') {
            micArmedRef.current = true; setMicArmed(true);
            if (recognitionRef.current) { try { recognitionRef.current.start(); } catch (_) {} }
          } else if (nuovo === 'paused' || nuovo === 'ended') {
            if (nuovo === 'ended') { micArmedRef.current = false; setMicArmed(false); }
            fermaRiconoscimento();
          }
          break;
        }
        case 'READINESS':
          setPcReadiness(msg.open ? { phase: msg.phase as string, inhale: !!msg.inhale, assessment: msg.assessment ?? null } : null);
          break;
        case 'CLOCK_SYNC':
          if (typeof msg.time === 'number' && isFinite(msg.time)) timeRef.current = msg.time;
          break;
        // MNA_AUDIO: rimandato — v. la nota grande in cima al file.
        default:
          break;
      }
    };

    return () => {
      networkManager.onError = () => {};
      networkManager.onStreamReceived = () => {};
      networkManager.onVideoFallbackNeeded = () => {};
      networkManager.onVideoFrame = () => {};
      networkManager.onConnectionEstablished = () => {};
      networkManager.onConnectionClosed = () => {};
      networkManager.onDataReceived = () => {};
    };
  }, [setIsConnected, setRemoteStream, fermaRiconoscimento, setVideoFallbackActive, setRemoteVideoFrame]);

  /** CONNETTITI — un link (`peerId:relayToken:peerKey[:sat[:lang]]`, senza schema/host: quello
   *  arriva già incollato nel campo o rilevato dal QR). Un SOLO gesto dell'utente lo scatena
   *  (lo stesso motivo di sempre: `getUserMedia` su mobile pretende un tap reale). */
  const connetti = useCallback(async (link: string) => {
    if (isConnectingRef.current) return;
    const parsed = parseConnectionLink(link);
    if (!parsed || !parsed.peerId) { setErrore('link non valido'); return; }
    isConnectingRef.current = true;
    setConnecting(true);
    setErrore(null);
    satelliteRef.current = !!parsed.satellite;
    setSatellite(!!parsed.satellite);
    try { networkManager.disconnect(); } catch (_) {}
    setPeerId(''); setIsConnected(false); setRemoteStream(null);
    setVideoFallbackActive(false); setRemoteVideoFrame(null);

    try {
      // SATELLITE (co-locato): SOLO video. Chiedere anche il microfono qui entrerebbe in
      // conflitto con il riconoscitore vocale di QUESTO stesso hook (stesso dispositivo,
      // stesso microfono) — le parole del PC viaggiano come TESTO (`TRANSCRIPT`), non
      // servono in uno stream audio. Una seduta VERA a distanza chiede invece anche l'audio.
      const wantAudio = !parsed.satellite;
      await navigator.mediaDevices.getUserMedia({ video: true, audio: wantAudio ? VOICE_AUDIO_CONSTRAINTS : false })
        .catch(() => wantAudio ? navigator.mediaDevices.getUserMedia({ video: false, audio: VOICE_AUDIO_CONSTRAINTS }) : Promise.reject(new Error('no camera')))
        .then(s => { (networkManager as unknown as { localStream: MediaStream | null }).localStream = s; })
        .catch(() => { /* negato — si procede solo-dati */ });
    } catch (_) { /* getUserMedia non disponibile — si procede solo-dati */ }

    auditorPeerIdRef.current = parsed.peerId;
    if (parsed.relayToken) networkManager.setRelayToken(parsed.relayToken);
    networkManager.setSignalingServer(parsed.config);

    try {
      const myId = await networkManager.init('participant', undefined, true);
      setPeerId(myId);
      await networkManager.connectToAuditor(parsed.peerId);
    } catch (err: unknown) {
      try { networkManager.disconnect(); } catch (_) {}
      setPeerId('');
      auditorPeerIdRef.current = '';
      setErrore(err instanceof Error ? err.message : String(err));
    } finally {
      setConnecting(false);
      isConnectingRef.current = false;
    }
  }, [setPeerId, setIsConnected, setRemoteStream, setVideoFallbackActive, setRemoteVideoFrame]);

  /** LASCIA LA SEDUTA — stesso "reset completo" di `App.tsx` (#7/#8, Roger): il preclear non
   *  deve mai poter far ricadere la seduta dell'auditor in uno stato incoerente. */
  const lascia = useCallback(() => {
    auditorPeerIdRef.current = '';
    fermaRiconoscimento();
    try { networkManager.disconnect(); } catch (_) {}
    micArmedRef.current = false; setMicArmed(false);
    sessionStateRef.current = 'idle'; setSessionState('idle');
    setPeerId(''); setIsConnected(false); setRemoteStream(null);
    setVideoFallbackActive(false); setRemoteVideoFrame(null);
    setPcReadiness(null);
  }, [fermaRiconoscimento, setPeerId, setIsConnected, setRemoteStream, setVideoFallbackActive, setRemoteVideoFrame]);

  return {
    connetti, lascia,
    isConnected, connecting, errore,
    satellite, remoteStream, sessionState, micArmed, pcReadiness,
    videoFallbackActive, remoteVideoFrame,
  };
}
