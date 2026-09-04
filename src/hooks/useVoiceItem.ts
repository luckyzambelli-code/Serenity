/**
 * useVoiceItem — LA VOCE DELL'AUDITOR, per dare l'item senza staccare gli occhi dall'ago.
 *
 * ── PERCHÉ ESISTE ───────────────────────────────────────────────────────────────────────────
 * Segnalato: « la logica di dare l'ITEM anche a voce facendo partire l'assessment non è
 * implementata ancora ». Vero — in `Serenity.tsx` i tre motori dei cicli (`useContactNullCycle`,
 * `useMirrorCycle`, `useToneCycle`) espongono già `cycleAwaitItemRef`/`mirrorAwaitItemRef`/
 * `toneAwaitItemRef` e sanno riempire l'item da soli quando arriva una riga nel giornale — quel
 * meccanismo è stato portato fedelmente da App.tsx in una sessione precedente. Quel che mancava
 * era la SORGENTE: nessuna riga 'Aud' entrava mai nel giornale, perché nessun riconoscimento
 * vocale era mai stato avviato in SERENITY.
 *
 * ⚠️ SEGNALATO DI NUOVO, e stavolta con la prova: « in EQUILIBRIUM con CHROME funziona, ed
 * anche in Electron » — mentre qui no. Il motivo era che questo file conosceva SOLO DUE dei TRE
 * motori di App.tsx: il riconoscitore nativo macOS (via il sidecar Electron) e Whisper offline
 * (WASM) come ripiego. App.tsx ne ha un TERZO, e in un browser normale (non Electron) è
 * addirittura il PRIMO che prova: `window.SpeechRecognition`/`webkitSpeechRecognition`, il
 * riconoscitore nativo DEL BROWSER — gratuito, in tempo reale, senza bisogno del sidecar. In
 * Electron App.tsx lo SALTA del tutto (fallisce sempre lì, commento CONN-61 nel suo codice) e va
 * dritto a nativo→Whisper; fuori da Electron fa l'opposto: Web Speech prima, Whisper solo se
 * Web Speech stesso fallisce. Qui mancava interamente il ramo browser — fuori da Electron,
 * l'unica strada tentata (Whisper) restava l'unico ripiego, e se Whisper non si carica (visto
 * capitare in ambienti sandboxed) non c'era più nulla: da qui « non funziona », mentre
 * EQUILIBRIUM nello stesso Chrome ripiegava su Web Speech con successo.
 *
 * ── COSA C'È QUI ORA, LA STESSA PRECEDENZA DI App.tsx ───────────────────────────────────────
 * Elettrone (`window.electronAPI` presente): nativo macOS → Whisper se nativo fallisce.
 * Browser (nessun Electron): Web Speech del browser → Whisper SOLO se Web Speech stesso dà un
 * errore che lo rende inutilizzabile (non per un « nessun discorso », benigno e frequentissimo
 * — lì si riprova e basta, stessa regola di App.tsx CONN-81). Web Speech si riavvia da sé se il
 * browser lo interrompe dopo ogni frase (comportamento noto di Chrome) — senza riavvio si
 * sentirebbe una frase sola e poi silenzio.
 *
 * SERENITY è sempre l'auditor in locale (mai il ruolo "participant" del preclear a distanza —
 * quel canale resta il MUSE via RAW_EEG, non il microfono), quindi qui manca tutta la logica di
 * ruolo/satellite/tono-vocale/relay di rete di App.tsx: si riconosce, si retrodata la fine della
 * parola quando il motore la sa dire, si consegna il trascritto.
 *
 * ⚠️ ZERO LOGICA DI CICLO QUI DENTRO — solo la trascrizione. Che farne (riempire un item, capire
 * se è "assessabile") resta ai motori dei cicli e a `engine/assessItemFilter`, come in App.tsx.
 *
 * @see docs/serenity-refonte.md
 */

import { useEffect, useRef, useState } from 'react';
import { nativeSpeechRecognition } from '../lib/nativeSpeechRecognition';
import { offlineSpeechRecognition } from '../lib/offlineSpeechRecognition';

const LANG_MAP: Record<string, string> = {
  en: 'en-US', fr: 'fr-FR', it: 'it-IT', es: 'es-ES', sv: 'sv-SE',
};

/** Stessa condizione di App.tsx (`const isElectron = ...`): fuori da qui, mai riletta altrove. */
const isElettrone = typeof window !== 'undefined'
  && !!(window as unknown as { electronAPI?: unknown }).electronAPI;

export type StatoVoce = 'spenta' | 'avvio' | 'in-ascolto' | 'assente';

// ⚠️ `results` OBBLIGATORIO, non opzionale — trovato attivando `strict`: le due classi vere
// (`OfflineSpeechRecognition`, `NativeSpeechRecognition`) lo dichiarano entrambe obbligatorio
// e lo passano SEMPRE (mai omesso) ai propri `this.onresult(...)`. Un'astrazione più larga di
// quella reale non è più sicura, solo scorretta — TypeScript lo segnalava a ragione.
interface MotoreSemplice {
  onresult: ((e: { results: { transcript: string; isFinal: boolean }[]; speechEndMs?: number }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}

export function useVoiceItem({ active, lang, onTranscript }: {
  /** Riconosce SOLO a seduta aperta — fuori seduta non c'è item da riempire. */
  active: boolean;
  lang: string;
  onTranscript: (text: string, speechEndMs?: number) => void;
}): StatoVoce {
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const inCorsoRef = useRef(false);
  const [stato, setStato] = useState<StatoVoce>('spenta');

  useEffect(() => {
    if (!active) { setStato('spenta'); return; }
    setStato('avvio');
    let annullato = false;
    // ⚠️ `any`: `SpeechRecognition` (Web Speech) non ha un tipo DOM stabile in TS — stessa
    // scelta di App.tsx (`recognitionRef = useRef<any>(null)`), non un'imprecisione nuova qui.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let webRecognizer: any = null;
    let webInterimMs = 0;
    let restartTimer: ReturnType<typeof setTimeout> | null = null;

    const wireHandlers = (engine: MotoreSemplice) => {
      engine.onresult = event => {
        const r = event.results?.[0];
        if (r?.isFinal && r.transcript) onTranscriptRef.current(r.transcript.trim(), event.speechEndMs);
      };
      // Un errore qui non deve fermare la seduta — solo la dettatura tace, come App.tsx.
      engine.onerror = () => {};
    };

    const avviaWhisper = async () => {
      const offlineOk = await offlineSpeechRecognition.init();
      if (annullato) { if (offlineOk) offlineSpeechRecognition.stop(); return; }
      if (offlineOk) {
        wireHandlers(offlineSpeechRecognition);
        offlineSpeechRecognition.lang = LANG_MAP[lang] || 'en-US';
        offlineSpeechRecognition.start();
        setStato('in-ascolto');
      } else {
        inCorsoRef.current = false;
        setStato('assente');
      }
    };

    /**
     * ── WEB SPEECH — il motore che mancava ──────────────────────────────────────────────────
     * Stessa logica di App.tsx (righe della sua `useEffect` "Initialize Speech Recognition"):
     * frasi continue, esiti intermedi accesi SOLO per sapere quando la parola è finita (si
     * scartano, non si scrivono mai), riavvio automatico a ogni `onend` — Chrome interrompe il
     * riconoscitore dopo ogni frase, senza riavvio si sentirebbe una frase sola e poi silenzio.
     */
    const avviaWebSpeech = () => {
      const SpeechRecognition =
        (window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown })
          .SpeechRecognition
        ?? (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition;
      if (!SpeechRecognition) { void avviaWhisper(); return; }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r: any = new (SpeechRecognition as any)();
      webRecognizer = r;
      r.continuous = true;
      r.interimResults = true;
      r.lang = LANG_MAP[lang] || 'en-US';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      r.onresult = (event: any) => {
        let soloIntermedi = true;
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) soloIntermedi = false;
        }
        if (soloIntermedi) { webInterimMs = performance.now(); return; }
        // Fine della parola = ultimo esito intermedio, non l'istante in cui il riconoscitore
        // dichiara la frase (quasi un secondo dopo — stessa nota di App.tsx).
        const fineParolaMs = webInterimMs || performance.now();
        webInterimMs = 0;
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            const transcript = event.results[i][0].transcript.trim();
            if (transcript) onTranscriptRef.current(transcript, fineParolaMs);
          }
        }
      };
      r.onstart = () => setStato('in-ascolto');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      r.onerror = (event: any) => {
        // Benigni e frequentissimi (una pausa, un riavvio del motore): `onend` riprova da sé,
        // stessa regola di App.tsx — NON devono far cadere a Whisper un motore che funziona.
        if (event.error === 'no-speech' || event.error === 'aborted') return;
        // Microfono negato: l'UNICO errore terminale — Whisper ha bisogno dello stesso
        // microfono, quindi non c'è ripiego possibile.
        if (event.error === 'not-allowed' || event.error === 'audio-capture') {
          webRecognizer = null;
          setStato('assente');
          return;
        }
        // Ogni altro errore (rete, servizio non permesso...) → il motore cloud non è
        // disponibile, si passa a Whisper offline.
        try { r.stop(); } catch { /* noop */ }
        webRecognizer = null;
        void avviaWhisper();
      };
      r.onend = () => {
        if (annullato || webRecognizer !== r) return;
        restartTimer = setTimeout(() => {
          if (annullato || webRecognizer !== r) return;
          try { r.start(); } catch { /* già in avvio — transitorio */ }
        }, 300);
      };
      try { r.start(); } catch { /* transitorio */ }
    };

    (async () => {
      if (inCorsoRef.current) return;
      inCorsoRef.current = true;
      try {
        if (isElettrone) {
          // ── NATIVO PRIMA, SOLO IN ELECTRON — stessa scelta di App.tsx (fuori da Electron
          // Web Speech fallisce sempre lì, CONN-61). Serve il permesso macOS "Riconoscimento
          // vocale" + "Microfono".
          nativeSpeechRecognition.lang = LANG_MAP[lang] || 'en-US';
          nativeSpeechRecognition.onresult = null;
          nativeSpeechRecognition.onerror = () => {};
          const nativoOk = await nativeSpeechRecognition.init();
          if (annullato) return;
          if (nativoOk) {
            wireHandlers(nativeSpeechRecognition);
            nativeSpeechRecognition.start();
            setStato('in-ascolto');
            return;
          }
          await avviaWhisper();
        } else {
          // ── FUORI DA ELECTRON: Web Speech del browser prima, Whisper come suo ripiego.
          avviaWebSpeech();
        }
      } catch {
        inCorsoRef.current = false;
        setStato('assente');
      }
    })();

    return () => {
      annullato = true;
      if (restartTimer) clearTimeout(restartTimer);
      if (webRecognizer) { try { webRecognizer.stop(); } catch { /* noop */ } webRecognizer = null; }
      try { nativeSpeechRecognition.stop(); } catch { /* noop */ }
      try { offlineSpeechRecognition.stop(); } catch { /* noop */ }
      inCorsoRef.current = false;
    };
  }, [active, lang]);

  return stato;
}
