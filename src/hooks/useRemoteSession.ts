import { useCallback, useEffect, useRef, useState } from 'react';
import { networkManager, parseSignalingUrl, VOICE_AUDIO_CONSTRAINTS } from '../lib/networkManager';
import { useNetworkStore } from '../store/networkStore';
import type { Language } from '../i18n';

/**
 * useRemoteSession — LA SEDUTA A DISTANZA, LATO AUDITOR. Fase 7 della refonte.
 *
 * ── PERCHÉ SOLO IL LATO AUDITOR ──────────────────────────────────────────────────────────────
 * Il link generato qui porta SEMPRE alla pagina web di EQUILIBRIUM: `server-core.cjs` serve
 * `index.html` per qualunque richiesta che arriva dal tunnel, indipendentemente da quale delle
 * due applicazioni desktop l'auditor ha aperto. Il preclear che apre il link sul telefono
 * ritrova quindi lo stesso `ParticipantView` già collaudato — questa fase non ne costruisce un
 * secondo, sarebbe esattamente la duplicazione che la refonte esiste per evitare. SERENITY
 * costruisce SOLO il pannello dell'auditor: generare il link, sapere quando il preclear si è
 * unito, e leggere lo stato del suo Muse.
 *
 * ── IL MOTORE NON SI TOCCA ───────────────────────────────────────────────────────────────────
 * `lib/networkManager` è la stessa istanza — WebRTC, tunnel, riconnessione del preclear — usata
 * da `App.tsx`. Le due applicazioni non girano mai insieme (l'archivio è unico, un solo
 * `userData`), quindi non c'è conflitto ad assegnare qui gli stessi callback. Questo hook è il
 * collante SERENITY per quel motore, non un secondo motore: stesso protocollo via dati (`BATTERY`,
 * `MUSE_STATUS`, `SIGNAL_QUALITY`, `LANG`, `SESSION_STATE`, `TRANSCRIPT`), verificato riga per
 * riga contro `App.tsx` perché un preclear su EQUILIBRIUM e un auditor su SERENITY devono potersi
 * capire.
 *
 * ── QUEL CHE NON C'È ANCORA, DI PROPOSITO ───────────────────────────────────────────────────
 * `RAW_EEG` / `RAW_PPG` / `RAW_GYRO` non sono cablati: il quadrante di SERENITY (fase 5) legge
 * solo il Theta-Meter USB fisico (`useThetaMeter`), non ancora un ago EEG — quella pipeline
 * (worker, buffer, badge di qualità del segnale per elettrodo) è materia della fase 6, insieme
 * al resto del motore di seduta. Instradare qui l'EEG remoto senza un ago locale che lo mostri
 * sarebbe un tubo che non arriva in nessun posto. Restano invece cablati BATTERY/MUSE_STATUS/
 * SIGNAL_QUALITY: dicono onestamente all'auditor se il Muse del preclear È connesso, anche prima
 * che ci sia un ago per disegnarne le letture.
 *
 * @see docs/serenity-refonte.md — fase 7.
 */

export type StatoSedutaRemota = 'idle' | 'running' | 'paused' | 'ended';

function generaToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/** La chiave del server (PeerJS) da `/api/server-info` — senza, il link generato non autentica
 *  nessuno. `undefined` (non un errore bloccante) se il server non gira in questo momento: si
 *  prova comunque, e il tunnel fallirà da sé con un messaggio leggibile. */
async function otteniChiaveServer(): Promise<string | undefined> {
  try {
    const r = await fetch('/api/server-info');
    if (!r.ok) return undefined;
    const data = await r.json();
    return typeof data?.peerKey === 'string' ? data.peerKey : undefined;
  } catch { return undefined; }
}

export function useRemoteSession(opts: {
  /** La lingua CORRENTE della seduta — la stessa che App.tsx spinge al preclear alla
   *  connessione, perché il telefono segua l'auditor e non resti sul default inglese. */
  lang: Language;
  /** Una riga di TRANSCRIPT arrivata dal preclear (il suo device la trascrive e la inoltra).
   *  Facoltativo: senza, quelle righe si scartano invece di finire in un giornale che nessuno
   *  ha chiesto di scrivere. */
  onTrascrizione?: (testo: string) => void;
  /** ⚠️ AGGIUNTO — una riga diagnostica di sistema (es. « camera del PC: N video, N audio »)
   *  DEVE finire nel Giornale sempre e comunque, mai dentro l'accumulo di risposta di un
   *  comando (v. `onTrascrizione`, sopra, quando `procedimentoAttivo`): non è una parola del
   *  PC, è un rapporto tecnico sulla connessione. Un canale a parte, non un caso speciale
   *  dentro `onTrascrizione`. */
  onDiagnostica?: (testo: string) => void;
}) {
  const setAppMode             = useNetworkStore(s => s.setAppMode);
  const setPeerId              = useNetworkStore(s => s.setPeerId);
  const setConnectionLink      = useNetworkStore(s => s.setConnectionLink);
  const setIsConnected         = useNetworkStore(s => s.setIsConnected);
  const setRemoteStream        = useNetworkStore(s => s.setRemoteStream);
  const setRemoteBatteryLevel  = useNetworkStore(s => s.setRemoteBatteryLevel);
  const setRemoteMuseConnected = useNetworkStore(s => s.setRemoteMuseConnected);
  const setRemoteSignalQuality = useNetworkStore(s => s.setRemoteSignalQuality);
  // ⚠️ AGGIUNTI — segnalato dal vivo: « non vedo né la video a distanza dell'auditor né quella
  // del PC ». Trovato leggendo il codice (non un altro tentativo alla cieca): `App.tsx` ha da
  // sempre un intero ripiego per quando il video WebRTC non arriva (`onVideoFallbackNeeded`/
  // `onVideoFrame`, alimentati da `useMediaRelayFallback` — fotogrammi JPEG sullo stesso canale
  // WS dei dati EEG, per reti dove ICE/TURN non passa mai: 5G, NAT simmetrico, o semplicemente
  // il TURN gratuito sovraccarico già descritto nel commento CONN-29 di `networkManager.ts`).
  // `useRemoteSession`/`useParticipantSession` non collegavano NESSUNO dei due callback: quando
  // il WebRTC falliva (probabile causa reale, non ipotesi — è la stessa rete su cui EQUILIBRIUM
  // mostrerebbe comunque qualcosa) SERENITY restava semplicemente muta, senza nessun ripiego.
  // `CameraCerchio` sa già disegnare un `fallbackFrame` (fase 6) — mancava solo chi lo riempisse.
  const setVideoFallbackActive = useNetworkStore(s => s.setVideoFallbackActive);
  const setRemoteVideoFrame    = useNetworkStore(s => s.setRemoteVideoFrame);

  const peerId          = useNetworkStore(s => s.peerId);
  const connectionLink  = useNetworkStore(s => s.connectionLink);
  const isConnected     = useNetworkStore(s => s.isConnected);
  const remoteStream        = useNetworkStore(s => s.remoteStream);
  const remoteBatteryLevel  = useNetworkStore(s => s.remoteBatteryLevel);
  const remoteMuseConnected = useNetworkStore(s => s.remoteMuseConnected);
  const remoteSignalQuality = useNetworkStore(s => s.remoteSignalQuality);
  const videoFallbackActive = useNetworkStore(s => s.videoFallbackActive);
  const remoteVideoFrame    = useNetworkStore(s => s.remoteVideoFrame);

  const [tunnelLoading, setTunnelLoading] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  // Riferimenti "ultimo valore", come altrove in questo progetto (appModeRef in App.tsx): la
  // callback di networkManager si assegna UNA volta al montaggio, e deve poter leggere lingua e
  // stato-seduta CORRENTI senza dover essere ricreata a ogni loro cambiamento.
  const langRef         = useRef(opts.lang);
  langRef.current = opts.lang;
  const onTrascrizioneRef = useRef(opts.onTrascrizione);
  onTrascrizioneRef.current = opts.onTrascrizione;
  const onDiagnosticaRef = useRef(opts.onDiagnostica);
  onDiagnosticaRef.current = opts.onDiagnostica;
  const statoSedutaRef  = useRef<StatoSedutaRemota>('idle');
  const seqRef          = useRef(0);
  const peerKeyRef      = useRef<string | undefined>(undefined);
  const relayTokenRef   = useRef<string | null>(null);
  // FIX: marcatore satellite — v. `avvia(satellite)` qui sotto. Senza, un link generato per
  // "collega il telefono del PC" (co-locato, SOLO camera/microfono d'appoggio) e un link per
  // una VERA seduta a distanza erano indistinguibili una volta arrivati sul telefono: stesso
  // formato di App.tsx (`parseConnectionLink`/`parsed.satellite`) sarebbe rimasto sempre
  // `false`, e il telefono si sarebbe comportato da preclear remoto anche quando è solo un
  // occhio in più nella stessa stanza.
  const satelliteRef    = useRef(false);
  // FIX: token di cancellazione per `avvia()` — stesso pattern di `museTokenRef` in
  // useMuseConnection. Senza, un `disconnetti()` durante l'attesa di
  // `otteniChiaveServer()`/`networkManager.init()` poteva essere superato da quella
  // stessa promise che si risolve DOPO e fa ripartire la connessione appena chiusa.
  const avviaTokenRef   = useRef(0);

  /** GENERA (O RIGENERA) IL LINK — il secondo passo, separato dall'inizializzazione del peer
   *  perché possa fallire e riprovarsi da solo senza rifare tutta la connessione. */
  const generaLink = useCallback(async () => {
    const id = useNetworkStore.getState().peerId;
    if (!id) return;
    setTunnelLoading(true);
    setErrore(null);
    try {
      const r = await fetch('/api/tunnel', { method: 'POST' });
      const data = await r.json();
      if (!data.url) { setErrore(data.error || 'tunnel'); return; }
      const tunnelHost = String(data.url).replace(/^https?:\/\//, '');
      const token = relayTokenRef.current;
      const key   = peerKeyRef.current;
      const sat   = satelliteRef.current;
      // ⚠️ AGGIUNTO `lang` (5° segmento) — segnalato dal vivo: « quando ci si connette come PC
      // locale col telefono, deve apparire la lingua dell'auditor, non l'inglese di default ».
      // Il pacchetto `LANG` via dati arriva SOLO a connessione stabilita — troppo tardi per la
      // primissima schermata ("link rilevato dal QR"), che l'auditor vede PRIMA di concedere
      // fotocamera/microfono. Scritta qui nel link stesso, l'unica cosa già disponibile a quel
      // momento. `langRef.current` è sempre valorizzata (mai vuota) — a differenza di `sat`,
      // qui non serve un controllo "se serve": va scritta sempre, è sempre nota.
      // FIX: `:sat` e `:lang` sono rispettivamente il 4° e 5° segmento POSIZIONALE di
      // `parseConnectionLink` (`peerId:relayToken:peerKey:sat:lang`) — ora che il 5° è sempre
      // scritto, anche i tre che lo precedono vanno sempre scritti (pure vuoti), altrimenti
      // "lang" scivolerebbe in una posizione sbagliata quando uno degli altri manca.
      const parte = `:${token ?? ''}:${key ?? ''}:${sat ? 'sat' : ''}:${langRef.current}`;
      setConnectionLink(`${tunnelHost}#${id}${parte}`);
    } catch (err: unknown) {
      setErrore(err instanceof Error ? err.message : String(err));
    } finally {
      setTunnelLoading(false);
    }
  }, [setConnectionLink]);

  /** COMINCIA COME AUDITOR — pre-richiede camera/microfono, apre il peer, genera il link. Se
   *  chiamata di nuovo mentre un peer è già in piedi (es. il tunnel era fallito), rigenera solo
   *  il link invece di ricominciare tutto da capo. */
  const avvia = useCallback(async (satellite = false) => {
    satelliteRef.current = satellite;
    // ⚠️ AGGIUNTO — stessa chiamata di App.tsx (`handleModeChange`), stessa ragione: una seconda
    // barriera, dentro `networkManager` stesso, che impedisce l'invio di media in uscita per il
    // caso satellite anche se un flusso locale esistesse già per un altro motivo — non basta non
    // richiederlo qui sotto (v. il blocco `getUserMedia`), perché quello copre solo QUESTA
    // chiamata a `avvia()`, non ogni punto di `networkManager` che potrebbe allegare un flusso a
    // una risposta futura.
    networkManager.setSuppressOutgoingMedia(satellite);
    if (useNetworkStore.getState().peerId) { await generaLink(); return; }
    // ⚠️ AGGIUNTO — mancava rispetto a `App.tsx` (`handleModeChange`), che chiama SEMPRE
    // `networkManager.disconnect()` prima di aprire una connessione nuova, qualunque sia lo
    // stato precedente. Qui non c'era: un secondo "collega il telefono del PC" nella stessa
    // seduta (l'auditor annulla e riprova, o disconnette e ricollega) partiva senza smontare
    // prima l'eventuale peer/connessione media residua — esattamente il genere di stato sporco
    // che la stessa nota di App.tsx (#8, Roger) descrive per la seduta a distanza. Innocuo se
    // non c'è nulla da smontare (nessun peer ancora aperto).
    try { networkManager.disconnect(); } catch (_) {}
    // FIX: token catturato all'ingresso — v. avviaTokenRef. Nome diverso da `token`
    // (già usato più sotto per il relay token generato da `generaToken()`).
    avviaTokenRef.current++;
    const avvioToken = avviaTokenRef.current;
    setErrore(null);
    setAppMode('auditor');
    setIsConnected(false);
    setPeerId(''); setConnectionLink('');
    setRemoteStream(null); setRemoteMuseConnected(false);
    setRemoteBatteryLevel(null); setRemoteSignalQuality(0);
    setVideoFallbackActive(false); setRemoteVideoFrame(null);

    // FIX CONN-15 (stessa ragione di App.tsx): quando il preclear chiama, la callback
    // `peer.on('call')` deve poter rispondere con un MediaStream VERO, non vuoto. Chiederlo
    // solo dopo la chiamata sarebbe già tardi.
    // ⚠️ CORRETTO — segnalato dal vivo: « la CAM dell'auditor appare solo come scritta [sul
    // telefono] — non è necessario che ci sia il video dell'auditor, si è in locale ». Questo
    // `getUserMedia` mancava della STESSA condizione già scritta in `App.tsx` (righe vicino a
    // `handleModeChange('auditor', {satellite})`, commento identico): « il Mac non manda
    // camera/microfono al telefono — l'auditor è nella stanza » — risparmia banda e toglie
    // l'anello di Larsen. Qui mancava perché `avvia()` non sapeva ancora distinguere satellite
    // da vera seduta a distanza quando fu scritta; ora che lo sa (`satellite`, v. sopra), la
    // stessa condizione si applica: nessuna richiesta di camera/microfono per il caso satellite.
    if (!satellite) {
      navigator.mediaDevices?.getUserMedia?.({ video: true, audio: VOICE_AUDIO_CONSTRAINTS })
        .catch(() => navigator.mediaDevices.getUserMedia({ video: false, audio: VOICE_AUDIO_CONSTRAINTS }))
        .then(s => { (networkManager as unknown as { localStream: MediaStream | null }).localStream = s; })
        .catch(() => { /* negato: seduta senza video/audio in uscita, il resto funziona comunque */ });
    }

    peerKeyRef.current = await otteniChiaveServer();
    const token = generaToken();
    relayTokenRef.current = token;
    networkManager.setRelayToken(token);
    const config = parseSignalingUrl('127.0.0.1:7893');
    if (peerKeyRef.current) config.peerKey = peerKeyRef.current;
    networkManager.setSignalingServer(config);

    try {
      const id = await networkManager.init('auditor', undefined, true);
      // FIX: se un `disconnetti()` è arrivato mentre si attendeva `init()`, questo
      // token non è più quello corrente — non si applica una connessione che
      // l'utente ha già chiuso. `networkManager.disconnect()` (dentro `disconnetti()`)
      // ha già chiuso la connessione appena aperta da `init()`; qui si evita solo di
      // farla ricomparire nello store (setPeerId/generaLink).
      if (avvioToken !== avviaTokenRef.current) return;
      setPeerId(id);
      await generaLink();
    } catch (err: unknown) {
      if (avvioToken !== avviaTokenRef.current) return;
      setErrore(err instanceof Error ? err.message : String(err));
    }
  }, [generaLink, setAppMode, setIsConnected, setPeerId, setConnectionLink,
      setRemoteStream, setRemoteMuseConnected, setRemoteBatteryLevel, setRemoteSignalQuality,
      setVideoFallbackActive, setRemoteVideoFrame]);

  /** CHIUDE LA CONNESSIONE. Torna 'local': non è più una seduta a distanza finché non se ne
   *  avvia un'altra con `avvia()`. */
  const disconnetti = useCallback(() => {
    // FIX: invalida qualunque `avvia()` ancora in corso — v. avviaTokenRef.
    avviaTokenRef.current++;
    try { networkManager.disconnect(); } catch (_) {}
    setIsConnected(false); setPeerId(''); setConnectionLink('');
    setRemoteStream(null); setRemoteMuseConnected(false);
    setRemoteBatteryLevel(null); setRemoteSignalQuality(0);
    setVideoFallbackActive(false); setRemoteVideoFrame(null);
    setAppMode('local');
    statoSedutaRef.current = 'idle'; seqRef.current = 0;
    peerKeyRef.current = undefined; relayTokenRef.current = null;
    satelliteRef.current = false;
    setErrore(null);
  }, [setIsConnected, setPeerId, setConnectionLink, setRemoteStream,
      setRemoteMuseConnected, setRemoteBatteryLevel, setRemoteSignalQuality, setAppMode,
      setVideoFallbackActive, setRemoteVideoFrame]);

  /** APRI/CHIUDI SEDUTA, RIPORTATO AL PRECLEAR — stesso pacchetto `SESSION_STATE` che
   *  `App.tsx` invia: il device del preclear si arma/disarma la trascrizione da questo, non da
   *  un pulsante che lui preme. Rimandato di nuovo appena la connessione si (ri)stabilisce
   *  (`onConnectionEstablished` sotto), o un preclear che si riconnette a metà seduta resterebbe
   *  fermo su 'idle'. */
  const impostaStatoSeduta = useCallback((stato: StatoSedutaRemota, tempo = 0) => {
    statoSedutaRef.current = stato;
    networkManager.send({ type: 'SESSION_STATE', state: stato, time: tempo, seq: ++seqRef.current }, true);
  }, []);

  // ── I CALLBACK DEL MOTORE — assegnati UNA volta ────────────────────────────────────────────
  // Le funzioni-azione di uno store Zustand hanno identità stabile: l'array delle dipendenze
  // qui sotto non fa mai ripartire l'effetto dopo il primo montaggio.
  useEffect(() => {
    networkManager.onError = (msg) => setErrore(msg);

    networkManager.onStreamReceived = (stream) => setRemoteStream(stream);

    // CONN-33 lato SERENITY: se il WebRTC non arriva, il preclear inizia a mandare fotogrammi
    // JPEG sullo stesso canale (v. `useMediaRelayFallback`, montato in `Serenity.tsx`) — qui si
    // riceve solo, esattamente come `onStreamReceived` sopra riceve il video vero.
    networkManager.onVideoFallbackNeeded = () => setVideoFallbackActive(true);
    networkManager.onVideoFrame = (dataUrl) => setRemoteVideoFrame(dataUrl);

    networkManager.onConnectionEstablished = () => {
      setIsConnected(true);
      setErrore(null);
      // Lingua della seduta → il telefono del preclear la segue invece di restare sul default.
      try { networkManager.send({ type: 'LANG', lang: langRef.current }, true); } catch (_) {}
      // Se una seduta era già aperta (il preclear si RI-connette), rimanda lo stato corrente:
      // altrimenti il suo orologio e la sua trascrizione restano fermi a prima del blip.
      if (statoSedutaRef.current !== 'idle') {
        try {
          networkManager.send({
            type: 'SESSION_STATE', state: statoSedutaRef.current, time: 0,
            seq: ++seqRef.current,
          }, true);
        } catch (_) {}
      }
    };

    networkManager.onConnectionClosed = () => {
      setIsConnected(false);
      setRemoteStream(null);
      setRemoteBatteryLevel(null);
      setRemoteMuseConnected(false);
      setRemoteSignalQuality(0);
      setVideoFallbackActive(false);
      setRemoteVideoFrame(null);
      // Nessuna riconnessione attiva qui: è il DEVICE DEL PRECLEAR a richiamare (lo stesso
      // meccanismo di App.tsx) — il peer dell'auditor resta semplicemente in ascolto.
    };

    networkManager.onDataReceived = (data: unknown) => {
      if (!data || typeof data !== 'object' || typeof (data as { type?: unknown }).type !== 'string') return;
      const msg = data as { type: string; level?: number; connected?: boolean; value?: number; text?: string };
      switch (msg.type) {
        case 'BATTERY':
          setRemoteBatteryLevel(typeof msg.level === 'number' ? msg.level : null);
          break;
        case 'MUSE_STATUS':
          setRemoteMuseConnected(!!msg.connected);
          break;
        case 'SIGNAL_QUALITY':
          setRemoteSignalQuality(typeof msg.value === 'number' ? msg.value : 0);
          break;
        case 'TRANSCRIPT':
          if (typeof msg.text === 'string' && msg.text.trim()) {
            onTrascrizioneRef.current?.(msg.text.trim().slice(0, 2000));
          }
          break;
        // ⚠️ AGGIUNTO — un tipo A PARTE, non 'TRANSCRIPT': `networkManager.send(...,true)`
        // deduplica i pacchetti "highPriority" ANCORA in coda per TIPO — una riga diagnostica
        // spedita con lo stesso tipo 'TRANSCRIPT' del microfono (« [PC mic: ... ] », « [PC voix
        // détectée] », la trascrizione vera) veniva rimpiazzata in coda dalla prima di quelle
        // che arrivava subito dopo, se il canale non era ancora aperto in quel preciso istante
        // — sparita PRIMA di essere spedita, non dopo. Confermato dal vivo: la riga diagnostica
        // non è MAI comparsa nel Giornale, mentre le righe del microfono (spedite più tardi,
        // stesso canale) arrivavano sempre tutte.
        case 'DIAG':
          if (typeof msg.text === 'string' && msg.text.trim()) {
            onDiagnosticaRef.current?.(msg.text.trim().slice(0, 2000));
          }
          break;
        // RAW_EEG / RAW_PPG / RAW_GYRO / MNA_AUDIO / READINESS / CLOCK_SYNC / LATENCY:
        // materia della fase 6 (vedi la nota in cima al file) — ignorati, non persi: il
        // preclear continua a inviarli, saranno agganciati quando ci sarà un ago a leggerli.
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
  }, [setIsConnected, setRemoteStream, setRemoteBatteryLevel, setRemoteMuseConnected, setRemoteSignalQuality,
      setVideoFallbackActive, setRemoteVideoFrame]);

  return {
    peerId, connectionLink, isConnected, tunnelLoading, errore,
    remoteStream, remoteBatteryLevel, remoteMuseConnected, remoteSignalQuality,
    videoFallbackActive, remoteVideoFrame,
    avvia, disconnetti, impostaStatoSeduta,
  };
}
