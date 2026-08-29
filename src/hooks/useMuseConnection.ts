/**
 * useMuseConnection — LA CUFFIA, dall'accensione alla riconnessione silenziosa.
 *
 * ── PERCHÉ ESISTE ───────────────────────────────────────────────────────────────────────────
 * Fase 2 della refonte SERENITY, sul modello di `useThetaMeter`: l'e-meter USB aveva già il suo
 * modulo, il MUSE no — stava in `App.tsx` in mezzo all'interfaccia, e una seconda interfaccia
 * avrebbe dovuto riscrivere trecento righe di protocollo Bluetooth per accendere la stessa
 * cuffia. Qui non c'è JSX e non ci sono decisioni nuove: è LO STESSO CODICE, spostato.
 *
 * ⚠️ E qui c'è una differenza importante rispetto alla fase 1: questo modulo NON SI PUÒ PROVARE
 * SENZA LA CUFFIA. Ogni riga gira solo quando un MUSE è davvero appaiato. Le prove che servono
 * sono in `docs/da-provare.md`, e il punto di ritorno è l'etichetta `serenity-fase1`.
 *
 * ── LE TRE COSE DELICATE, CHE NON VANNO TOCCATE ─────────────────────────────────────────────
 *
 * 1. IL GETTONE (`museTokenRef`). Ogni connessione e ogni disconnessione lo incrementa. I lavori
 *    asincroni — `connect()`, `start()`, i timer della riconnessione — se lo copiano all'avvio e
 *    si fermano se non combacia più al risveglio. Senza, una ricerca annullata tornava viva
 *    trenta secondi dopo e riapriva una connessione che nessuno voleva più.
 *
 * 2. IL RICABLAGGIO (`wireStreams`). Alla riconnessione muse-js riprende caratteristiche GATT
 *    NUOVE: le vecchie sottoscrizioni restano vive ma non ricevono più nulla. L'apparecchio dice
 *    « connesso » e l'ago è fermo. Per questo i flussi si smontano e si riattaccano ogni volta.
 *
 * 3. IL DISPOSITIVO TRATTENUTO (`museDeviceRef`). muse-js azzera il suo `gatt` alla caduta, e
 *    `connect()` senza argomento rifà `requestDevice()`, che PRETENDE un gesto dell'utente —
 *    impossibile dentro un timer. Tenendo il dispositivo si può riaprire il GATT da soli e
 *    passarlo a `connect(gatt)`: è tutta la riconnessione silenziosa.
 *
 * ── COSA NON STA QUI ────────────────────────────────────────────────────────────────────────
 * Il TRATTAMENTO del segnale. Quel che esce dalla cuffia va al worker EEG e ai motori, che
 * stanno altrove e non sanno da dove arrivano i campioni — è per questo che una seduta a
 * distanza funziona: gli stessi campioni entrano dalla rete invece che dal Bluetooth.
 *
 * @see docs/serenity-refonte.md — le fasi della refonte.
 */

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { MuseClient } from 'muse-js';
import { networkManager } from '../lib/networkManager';
import { sessionRecorder } from '../engine/SessionRecorder';

export type MuseConnectionState = 'disconnected' | 'searching' | 'connected';

/** Quanto si aspetta prima di dire che la cuffia è persa DAVVERO. La riconnessione è
 *  silenziosa, quindi un singhiozzo BLE non deve far gridare: si grida dopo. */
const MUSE_LOST_GRACE_MS = 10000;

/** Quel che la cuffia ha bisogno di sapere — e di far fare — al resto dell'applicazione. */
export interface MuseConnectionDeps {
  /** I buffer dei sensori. Stanno fuori perché hanno DUE sorgenti: questa cuffia, e in seduta
   *  a distanza i campioni che arrivano dalla rete. Chi legge non deve sapere quale delle due. */
  eegBuffer: MutableRefObject<{ [channel: number]: number[] }>;
  gyroBuffer: MutableRefObject<{ x: number[]; y: number[]; z: number[] }>;
  /** I mucchietti in partenza verso l'auditor, quando questa macchina è quella del preclear. */
  eegBatchRef: MutableRefObject<Array<{ ts: number; s: number[] }>>;
  ppgBatchRef: MutableRefObject<Array<{ ts: number; s: number[] }>>;
  gyroBatchRef: MutableRefObject<Array<{ x: number; y: number; z: number }>>;
  /** Il worker EEG — è lui che trasforma i campioni in carica. */
  postToWorker: (msg: any) => void;
  /** Chi siamo in questo momento: 'local' | 'participant' | 'auditor', e il modo satellite. */
  appMode: () => string;
  satelliteMode: () => boolean;
  sessionRunning: () => boolean;
  /** Il tempo di seduta, vivo (per le vie asincrone). */
  nowSec: () => number;
  /** Il tempo mostrato, al secondo — quello che l'interfaccia aveva sotto mano. */
  uiTime: () => number;
  addLog: (entry: { time: number; speaker: string; text: string; type?: string }) => void;
  /** La traduzione, per chiave. */
  tr: (key: string) => string;
  setBatteryLevel: (v: number | null) => void;
  /** Riconnessione fallita a seduta aperta → si mette in pausa, i dati restano. */
  pauseOnLoss: () => void;
}

export function useMuseConnection(d: MuseConnectionDeps) {
  const [museConnection, setMuseConnection] = useState<MuseConnectionState>('disconnected');
  /**
   * ⚠️ LO SPECCHIO DELLO STATO, e non è un vezzo.
   *
   * In `App.tsx` `handleConnectMuse` era una funzione RICREATA a ogni render: leggeva sempre il
   * `museConnection` di adesso. Qui è un `useCallback` a dipendenze vuote — l'identità non deve
   * cambiare sotto chi se l'è già preso — e senza questo specchio leggerebbe per sempre lo stato
   * del PRIMO render, cioè « disconnected »: i due rami « annulla la ricerca » e « disconnetti »
   * non sarebbero MAI entrati, e il bottone avrebbe aperto una connessione nuova ogni volta.
   */
  const museConnectionRef = useRef<MuseConnectionState>('disconnected');
  museConnectionRef.current = museConnection;
  /** Si è mai connessa in questo avvio? Decide la parola sul bottone: mai → « CONNETTI »,
   *  dopo una caduta → « RICONNETTI » (prima diceva sempre « riconnetti »). */
  const [museEverConnected, setMuseEverConnected] = useState(false);
  /** PERSA IN SEDUTA: se n'è andata e non torna. Si mostra davanti all'arco delle reazioni,
   *  perché l'auditor lo veda — ma solo passato il tempo di grazia. */
  const [museLostLong, setMuseLostLong] = useState(false);

  const museClientRef = useRef<MuseClient | null>(null);
  const eegSubscriptionRef = useRef<any>(null);
  const telemetrySubscriptionRef = useRef<any>(null);
  /** TUTTE le sottoscrizioni, per poterle smontare e riattaccare alla riconnessione. */
  const museSubsRef = useRef<any[]>([]);
  /** FIX: sottoscrizione a `connectionStatus` — a differenza delle altre sopra, si crea
   *  UNA sola volta per client (non ad ogni `wireStreams`), quindi vive in un ref suo,
   *  fuori da `museSubsRef` (che `wireStreams` smonta e riattacca a ogni riconnessione:
   *  ci finirebbe dentro solo alla prima connessione e non verrebbe mai ricreata dopo).
   *  Prima non era mai smessa: sopravviveva alla disconnessione esplicita e poteva
   *  riscrivere lo stato a 'searching' da un evento GATT tardivo. */
  const connectionStatusSubRef = useRef<{ unsubscribe: () => void } | null>(null);
  const museTokenRef = useRef(0);
  const museReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const museDeviceRef = useRef<any>(null);
  /** Quando è arrivato l'ULTIMO campione EEG dalla cuffia locale. È il battito su cui la
   *  sorveglianza qui sotto corregge il badge da sé, nei due sensi. */
  const lastLocalEegAtRef = useRef(0);
  /** Diagnostica lato preclear: la cuffia produce davvero EEG? Una riga per connessione. */
  const af7StreamLoggedRef = useRef(false);
  /** A DISTANZA: quale elettrodo si TRASMETTE all'auditor. AF7 (1) finché è buono; se la
   *  fronte non fa contatto (piatto o saturo) si passa al migliore dei quattro, se no
   *  l'auditor non riceve NIENTE e l'ago resta fermo. */
  const bestEegElectrodeRef = useRef(1);

  useEffect(() => {
    const lost = museConnection !== 'connected' && museEverConnected;
    if (!lost) { setMuseLostLong(false); return; }
    const t0 = Date.now();
    setMuseLostLong(false);
    const id = setInterval(() => {
      if (Date.now() - t0 >= MUSE_LOST_GRACE_MS) setMuseLostLong(true);
    }, 1000);
    return () => clearInterval(id);
  }, [museConnection, museEverConnected]);
  useEffect(() => { if (museConnection === 'connected') setMuseEverConnected(true); }, [museConnection]);

  // Allo smontaggio si spegne il timer della riconnessione: se no un tentativo silenzioso si
  // risveglierebbe su un componente che non c'è più. Stava nella pulizia generale di App;
  // adesso appartiene a chi quel timer lo accende.
  useEffect(() => () => {
    if (museReconnectTimerRef.current) clearTimeout(museReconnectTimerRef.current);
  }, []);

  // MUSE status self-correction from real data — BIDIRECTIONAL:
  //  • upgrade: data flowing but badge stale on 'disconnected' → 'connected';
  //  • downgrade: badge says 'connected' but no EEG samples for >6 s → 'disconnected'
  //    (silent BLE death: battery, out of range, driver freeze — muse-js' own disconnect
  //    event doesn't always fire, so the badge would otherwise lie forever).
  // Only acts in local/satellite mode where lastLocalEegAtRef is authoritative; in
  // network-PC mode the auditor reads the remote PC's badge instead.
  useEffect(() => {
    const id = setInterval(() => {
      // FIX MUSE-REMOTE: also runs in PARTICIPANT mode. Previously only local/satellite
      // self-corrected, so a preclear whose headset was silently dead or held by another
      // Equilibrium instance kept broadcasting "connected" → auditor saw a frozen needle
      // under a green "MUSE ✓". Now the participant downgrades on real data-flow loss and
      // tells the auditor the truth.
      const isParticipant = d.appMode() === 'participant';
      if (d.appMode() !== 'local' && !d.satelliteMode() && !isParticipant) return;
      const age = Date.now() - lastLocalEegAtRef.current;
      const alive = age < 3000 && lastLocalEegAtRef.current > 0;
      if (age < 3000 && museConnection !== 'connected') setMuseConnection('connected');
      else if (age > 6000 && museConnection === 'connected' && lastLocalEegAtRef.current > 0) {
        // Real data was flowing once (lastLocalEegAtRef > 0) and now stopped — flag it.
        setMuseConnection('disconnected');
        d.setBatteryLevel(null);
        if (isParticipant) {
          // Tell the auditor the headset actually stopped streaming (truthful badge).
          try { networkManager.send({ type: 'MUSE_STATUS', connected: false }, true); } catch (_) {}
        }
        d.addLog({ time: d.nowSec(), speaker: 'SYS',
          text: (d.tr('log_muse_link_lost')) || '⊘ MUSE link lost (no data 6 s)', type: 'highlight' });
      }
      // HEARTBEAT MUSE-REMOTE : le préclair RE-diffuse périodiquement son vrai statut MUSE
      // « connecté » tant que des données arrivent. L'envoi unique au moment du connect peut
      // être raté par l'auditeur (join tardif, ou reconnexion qui remet remoteMuseConnected=false)
      // → sans ce battement, l'auditeur reste bloqué sur « MUSE : non » alors que le PC est
      // bien connecté et streame. Message minuscule sur le canal fiable → convergence rapide.
      if (isParticipant && alive) {
        try { networkManager.send({ type: 'MUSE_STATUS', connected: true }, true); } catch (_) {}
      }
      // À DISTANCE : choisir l'électrode EEG à transmettre = un électrode dont le RMS est dans la
      // bande physiologique plausible. On PRÉFÈRE AF7 (1) tant qu'il est bon ; s'il est plat
      // (<2 : pas de contact) ou saturé (>320 : flottement), on bascule sur le meilleur des 4.
      if (isParticipant) {
        const rmsOf = (ch: number): number => {
          const s = d.eegBuffer.current[ch] || [];
          if (s.length < 32) return -1;
          const win = s.slice(-128);
          let acc = 0; for (let k = 0; k < win.length; k++) acc += win[k] * win[k];
          return Math.sqrt(acc / win.length);
        };
        const plausible = (r: number) => r >= 2 && r <= 320;
        const af7 = rmsOf(1);
        if (plausible(af7)) bestEegElectrodeRef.current = 1;
        else {
          let bestCh = -1, bestRms = 0;
          for (let ch = 0; ch < 4; ch++) { const r = rmsOf(ch); if (plausible(r) && r > bestRms) { bestRms = r; bestCh = ch; } }
          if (bestCh >= 0) bestEegElectrodeRef.current = bestCh;
        }
      }
    }, 1500);
    return () => clearInterval(id);
    // Le dipendenze erano [appMode, satelliteMode, museConnection, t]: le prime tre venivano
    // lette dal corpo dell'effetto, e adesso passano dai getter, che sono sempre vivi. Resta
    // `museConnection`, che il corpo confronta davvero.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [museConnection]);

  const MUSE_CONNECT_TIMEOUT_MS = 20000;   // ricerca+connessione iniziale
  const MUSE_GATT_TIMEOUT_MS = 4000;       // singolo tentativo di riconnessione silenziosa
  const withTimeout = <T,>(pr: Promise<T>, ms: number, label: string): Promise<T> =>
    Promise.race([pr, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(label)), ms))]);
  const bleCancel = () => { try { (window as any).electronAPI?.bleCancel?.(); } catch (_) {} };

  const handleConnectMuse = useCallback(async (): Promise<boolean> => {
    // `time` era la variabile di render di App: qui si prende una volta all'ingresso,
    // esattamente come faceva la chiusura di allora. Le vie ASINCRONE (riconnessione
    // silenziosa) usano `d.nowSec()`, che è vivo — come prima usavano `timeRef`.
    const time = d.uiTime();
    if (museConnectionRef.current === 'searching') {
      // Annulation explicite de la recherche en cours
      // FIX C-02/C-03: bump token to invalidate any in-flight connect()/start()
      // promises and cancel any pending silent-reconnect timeouts.
      museTokenRef.current++;
      if (museReconnectTimerRef.current) {
        clearTimeout(museReconnectTimerRef.current);
        museReconnectTimerRef.current = null;
      }
      if (museClientRef.current) {
        try { museClientRef.current.disconnect(); } catch (_) {}
        museClientRef.current = null;
      }
      // FIX: smetti anche la sottoscrizione a connectionStatus — altrimenti sopravvive
      // alla disconnessione esplicita e un evento GATT tardivo può riscrivere lo stato.
      if (connectionStatusSubRef.current) {
        try { connectionStatusSubRef.current.unsubscribe(); } catch (_) {}
        connectionStatusSubRef.current = null;
      }
      bleCancel();   // risolve la richiesta Bluetooth pendente nel main (altrimenti resta appesa)
      setMuseConnection('disconnected');
      d.addLog({ time, speaker: 'SYS', text: '⊘ Recherche MUSE annulée.' });
      return false;
    }
    if (museConnectionRef.current === 'connected') {
      // FIX C-03: cancel silent reconnect loop when user explicitly disconnects
      museTokenRef.current++;
      if (museReconnectTimerRef.current) {
        clearTimeout(museReconnectTimerRef.current);
        museReconnectTimerRef.current = null;
      }
      if (museClientRef.current) {
        try { museClientRef.current.disconnect(); } catch (_) {}
        museClientRef.current = null;
      }
      // FIX: idem — la sottoscrizione a connectionStatus non era mai nella lista
      // smessa qui sotto (museSubsRef non la contiene, v. dichiarazione del ref).
      if (connectionStatusSubRef.current) {
        try { connectionStatusSubRef.current.unsubscribe(); } catch (_) {}
        connectionStatusSubRef.current = null;
      }
      // CONN-105: tear down the data-stream subscriptions on explicit disconnect
      museSubsRef.current.forEach(s => { try { s.unsubscribe(); } catch (_) {} });
      museSubsRef.current = [];
      museDeviceRef.current = null; // FIX MUSE-RC: drop retained device on explicit disconnect
      setMuseConnection('disconnected');
      return false;
    }

    // FIX C-02: capture token at start; abort if it changes during async work
    museTokenRef.current++;
    const token = museTokenRef.current;

    setMuseConnection('searching');
    d.addLog({ time, speaker: 'SYS', text: '> muselsl stream --ppg --acc --gyro' });
    d.addLog({ time, speaker: 'SYS', text: d.tr('log_searching') });

    if (!navigator.bluetooth) {
      d.addLog({ time, speaker: 'SYS', text: d.tr('log_error_bt'), type: 'highlight' });
      setMuseConnection('disconnected');
      return false;
    }

    try {
      const client = new MuseClient();
      client.enablePpg = true;
      client.enableAux = true;
      museClientRef.current = client;

      await withTimeout(client.connect(), MUSE_CONNECT_TIMEOUT_MS, 'MUSE connect timeout');
      await withTimeout(client.start(), MUSE_CONNECT_TIMEOUT_MS, 'MUSE start timeout');

      // FIX C-02: bail out if the user cancelled during await
      if (token !== museTokenRef.current) {
        try { client.disconnect(); } catch (_) {}
        return false;
      }

      // FIX MUSE-RC: retain the paired device so silent reconnect can re-open the
      // GATT without a user gesture (see museDeviceRef declaration).
      museDeviceRef.current = (client as any).gatt?.device ?? null;

      d.addLog({ time, speaker: 'SYS', text: (d.tr('log_found')).replace('{name}', client.deviceName || 'Muse') });
    
      setMuseConnection('connected');
      d.addLog({ time, speaker: 'SYS', text: d.tr('log_connected') });
      d.addLog({ time, speaker: 'SYS', text: d.tr('log_streaming_eeg') });
      d.addLog({ time, speaker: 'SYS', text: d.tr('log_streaming_ppg') });
      d.addLog({ time, speaker: 'SYS', text: d.tr('log_streaming_acc') });
      d.addLog({ time, speaker: 'SYS', text: d.tr('log_streaming_gyro'), type: 'success' });

      // FIX CONN-19: explicitly broadcast Muse status to the auditor instead
      // of relying on the connectionStatus.subscribe path. The ReplaySubject
      // emission can race with the relay setup or be missed if the relay
      // wasn't yet connected at subscribe time. A direct send here, plus the
      // queued bufferable send() guarantees the auditor sees the latest status.
      if (d.appMode() === 'participant') {
        networkManager.send({ type: 'MUSE_STATUS', connected: true }, true);
        af7StreamLoggedRef.current = false; // ré-armer le diagnostic AF7 pour cette connexion MUSE
      }
    
      const pushCsv = (type: string, ...data: any[]) => {
        if (d.sessionRunning()) {
          sessionRecorder.pushCsv(`${d.nowSec().toFixed(3)},${type},${data.join(',')}`);
        }
      };

      // CONN-105: wire ALL data streams as a re-callable unit. On a silent
      // reconnect muse-js re-acquires fresh GATT characteristics, so the old
      // subscriptions stop receiving — we must tear them down and re-subscribe,
      // otherwise the device reads "connected" but no data flows (frozen needle).
      const wireStreams = (client: MuseClient) => {
      // Tear down any previous subscriptions first (avoid duplicate handlers)
      museSubsRef.current.forEach(s => { try { s.unsubscribe(); } catch (_) {} });
      museSubsRef.current = [];
      // Subscribe to EEG data
      eegSubscriptionRef.current = client.eegReadings.subscribe(reading => {
        // Data Router: use ref so mode changes after Muse connect are respected
        // LOCAL / SATELLITE : Muse câblé DIRECTEMENT sur ce Mac → on alimente le worker local
        // avec AF7 (électrode 1), comme avant. Le téléphone n'envoie pas d'EEG dans ce mode.
        if (reading.electrode === 1 && (d.appMode() === 'local' || d.satelliteMode())) {
          lastLocalEegAtRef.current = Date.now(); // FIX #4: local Muse is alive
          d.postToWorker({ type: 'RAW_EEG', payload: reading.samples });
        } else if (d.appMode() === 'participant' && reading.electrode === bestEegElectrodeRef.current) {
          // À DISTANCE : on transmet le MEILLEUR électrode EEG (AF7 par défaut ; bascule
          // automatiquement si le front n'a pas de contact — AF7 plat/saturé). Sans ça
          // l'auditeur ne recevait qu'un EEG PLAT → aiguille figée (seuls PPG/BPM + Gyro passaient).
          lastLocalEegAtRef.current = Date.now();
          d.eegBatchRef.current.push({ ts: d.nowSec(), s: reading.samples });
          if (!af7StreamLoggedRef.current) {
            af7StreamLoggedRef.current = true;
            d.addLog({ time: d.nowSec(), speaker: 'SYS', text: `✅ MUSE : EEG capté (électrode ${bestEegElectrodeRef.current}) — envoi à l'auditeur`, type: 'success' });
          }
        }
      
        // Store for visualization
        if (reading.electrode >= 0 && reading.electrode <= 3) {
          d.eegBuffer.current[reading.electrode].push(...reading.samples);
          // Keep only last 256 samples (approx 1 second)
          if (d.eegBuffer.current[reading.electrode].length > 256) {
            d.eegBuffer.current[reading.electrode] = d.eegBuffer.current[reading.electrode].slice(-256);
          }
        }

        if (d.sessionRunning()) {
          pushCsv('EEG', reading.electrode, ...reading.samples);
        }
      });

      // Subscribe to PPG data
      const ppgSub = client.ppgReadings.subscribe(reading => {
        // FIX CONN-55: the Muse 2 streams THREE PPG channels (0=ambient,
        // 1=infrared, 2=red). Only the INFRARED channel carries a clean
        // pulse waveform for heart-rate. Previously all three were interleaved
        // into the BPM buffer → corrupted signal + bogus BPM. Feed the worker
        // (and the relay batch) with the infrared channel ONLY.
        const isHrChannel = reading.ppgChannel === 1;
        // Data Router: instrada dati PPG basato sulla modalità
        if (isHrChannel) {
          if (d.appMode() === 'local' || d.satelliteMode()) {
            d.postToWorker({ type: 'RAW_PPG', payload: reading.samples });
          } else if (d.appMode() === 'participant') {
            // Accumulate in batch buffer with session-time timestamp
            d.ppgBatchRef.current.push({ ts: d.nowSec(), s: reading.samples });
          }
        }
        // In auditor mode, PPG arrives from networkManager

        if (d.sessionRunning()) {
          pushCsv('PPG', reading.ppgChannel, ...reading.samples);
        }
      });

      // Subscribe to Accelerometer
      const accSub = client.accelerometerData.subscribe(reading => {
        if (d.sessionRunning()) {
          reading.samples.forEach(sample => {
            pushCsv('ACC', sample.x, sample.y, sample.z);
          });
        }
      });

      // Subscribe to Gyroscope
      const gyroSub = client.gyroscopeData.subscribe(reading => {
        reading.samples.forEach(sample => {
          d.gyroBuffer.current.x.push(sample.x);
          d.gyroBuffer.current.y.push(sample.y);
          d.gyroBuffer.current.z.push(sample.z);
          if (d.gyroBuffer.current.x.length > 256) d.gyroBuffer.current.x = d.gyroBuffer.current.x.slice(-256);
          if (d.gyroBuffer.current.y.length > 256) d.gyroBuffer.current.y = d.gyroBuffer.current.y.slice(-256);
          if (d.gyroBuffer.current.z.length > 256) d.gyroBuffer.current.z = d.gyroBuffer.current.z.slice(-256);
        });
        // O4: RAW_GYRO post to the worker removed (worker never handled it). The
        // gyroBuffer above still feeds HealthPanel's GyroRadar, and the batch below
        // still streams gyro to the auditor (CONN-30).
        // FIX CONN-30: accumulate gyro for transmission to the auditor.
        if (d.appMode() === 'participant') {
          for (const sample of reading.samples) {
            d.gyroBatchRef.current.push({ x: sample.x, y: sample.y, z: sample.z });
          }
        }
        if (d.sessionRunning()) {
          reading.samples.forEach(sample => pushCsv('GYRO', sample.x, sample.y, sample.z));
        }
      });

      // Subscribe to Telemetry
      telemetrySubscriptionRef.current = client.telemetryData.subscribe(telemetry => {
        d.setBatteryLevel(telemetry.batteryLevel);
        // Transmit battery to auditor — use ref so mode changes are respected
        if (d.appMode() === 'participant') {
          networkManager.send({ type: 'BATTERY', level: telemetry.batteryLevel }, true);
        }
      });

      // Track all subscriptions so a reconnect can tear them down + re-wire
      museSubsRef.current = [
        eegSubscriptionRef.current, ppgSub, accSub, gyroSub, telemetrySubscriptionRef.current,
      ];
      };

      // Initial wiring of the data streams
      wireStreams(client);

      // FIX: salvata nel suo ref (non più "fire and forget") così la disconnessione
      // esplicita sopra può effettivamente smetterla — v. connectionStatusSubRef.
      connectionStatusSubRef.current = client.connectionStatus.subscribe(status => {
        // Transmit Muse status to auditor — use ref so mode changes are respected
        if (d.appMode() === 'participant') {
          networkManager.send({ type: 'MUSE_STATUS', connected: !!status }, true);
        }
        if (!status) {
          // ── Silent Reconnect Protocol ──────────────────────────────────────
          // GATT dropped: on tente la reconnexion silencieuse pendant 30s
          // sans toucher à la session ni aux données accumulées
          let reconnectAttempts = 0;
          const MAX_ATTEMPTS = 6;
          const ATTEMPT_INTERVAL = 5000; // 5s entre chaque tentative

          // Il badge non deve MENTIRE: durante la riconnessione silenziosa lo stato è 'searching'
          // (prima restava 'connected' su un GATT morto, e il bottone faceva la cosa sbagliata).
          setMuseConnection('searching');
          d.addLog({ time: d.nowSec(), speaker: 'SYS',
            text: (d.tr('log_muse_signal_lost')) || '⚠ MUSE signal lost — reconnexion silencieuse…', type: 'highlight' });

          // FIX C-03: capture token so any in-flight reconnect aborts when
          // the user explicitly disconnects or starts a new connection.
          const reconnectToken = token;

          const tryReconnect = async () => {
            if (reconnectToken !== museTokenRef.current) return; // cancelled
            reconnectAttempts++;
            try {
              // FIX MUSE-RC: re-open the GATT ourselves on the retained device.
              // muse-js nulled its own `gatt` on disconnect, and connect() with no
              // arg would pop the device chooser (needs a user gesture → fails in
              // this timer). Re-establishing the GATT first, then passing it to
              // connect(gatt), reconnects silently to the already-paired Muse.
              const dev = museDeviceRef.current;
              if (!dev || !dev.gatt) throw new Error('no retained Muse device');
              // gatt.connect() su un device che non trasmette può PENDERE per sempre → timeout,
              // e prima di riprovare si ABORTISCE il tentativo pendente (disconnect).
              let server;
              try {
                server = await withTimeout(dev.gatt.connect(), MUSE_GATT_TIMEOUT_MS, 'gatt timeout');
              } catch (e) {
                try { dev.gatt.disconnect(); } catch (_) {}
                throw e;
              }
              await withTimeout(client.connect(server), MUSE_GATT_TIMEOUT_MS, 'muse connect timeout');
              await withTimeout(client.start(), MUSE_GATT_TIMEOUT_MS, 'muse start timeout');
              if (reconnectToken !== museTokenRef.current) {
                try { client.disconnect(); } catch (_) {}
                return;
              }
              // CONN-105: re-wire the data streams. muse-js re-acquires fresh
              // GATT characteristics on reconnect, so the previous subscriptions
              // no longer receive — without this the needle stays frozen even
              // though the device reports "connected".
              wireStreams(client);
              setMuseConnection('connected');
              d.addLog({ time: d.nowSec(), speaker: 'SYS',
                text: ((d.tr('log_muse_reconnected')) || '✓ MUSE reconnecté').replace('{n}', String(reconnectAttempts)), type: 'success' });
            } catch {
              if (reconnectToken !== museTokenRef.current) return;
              if (reconnectAttempts < MAX_ATTEMPTS) {
                museReconnectTimerRef.current = setTimeout(tryReconnect, ATTEMPT_INTERVAL);
              } else {
                // FIX: la riconnessione silenziosa ha rinunciato — smetti anche
                // connectionStatus del client ormai morto, altrimenti un suo evento
                // tardivo può ancora riscrivere lo stato dopo che si è dato per persa.
                if (connectionStatusSubRef.current) {
                  try { connectionStatusSubRef.current.unsubscribe(); } catch (_) {}
                  connectionStatusSubRef.current = null;
                }
                setMuseConnection('disconnected');
                d.setBatteryLevel(null);
                d.pauseOnLoss();
                d.addLog({ time: d.nowSec(), speaker: 'SYS',
                  text: (d.tr('log_muse_reconnect_failed')) || '✗ Reconnexion MUSE échouée — session mise en pause, données préservées.', type: 'highlight' });
              }
            }
          };

          // Premier essai après 5s (grace period Bluetooth)
          museReconnectTimerRef.current = setTimeout(() => {
            if (reconnectToken !== museTokenRef.current) return;
            if (museClientRef.current?.connectionStatus.value === false) {
              tryReconnect();
            }
          }, ATTEMPT_INTERVAL);
        }
      });

      return true;
    } catch (error) {
      console.warn("Muse connection error:", error);
      bleCancel();   // il timeout può lasciare una richiesta pendente nel main: si risolve qui
      if (museClientRef.current) { try { museClientRef.current.disconnect(); } catch (_) {} museClientRef.current = null; }
      setMuseConnection('disconnected');
      d.setBatteryLevel(null);
      d.addLog({ time, speaker: 'SYS', text: d.tr('log_not_found'), type: 'highlight' });
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    museConnection, setMuseConnection, museEverConnected, museLostLong,
    handleConnectMuse,
    museClientRef, lastLocalEegAtRef, bestEegElectrodeRef,
  };
}
