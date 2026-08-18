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
 * ── COSA C'È QUI, DELIBERATAMENTE COMPATTO ──────────────────────────────────────────────────
 * Gli STESSI due motori di App.tsx (`lib/nativeSpeechRecognition` — il riconoscitore nativo
 * macOS via il sidecar Electron — con fallback su `lib/offlineSpeechRecognition`, Whisper WASM
 * offline): non un terzo motore, le stesse due istanze singleton. SERENITY è sempre l'auditor in
 * locale (mai il ruolo "participant" del preclear a distanza — quel canale resta il MUSE via
 * RAW_EEG, non il microfono) quindi qui manca tutta la logica di ruolo/satellite di App.tsx: si
 * riconosce, si retrodata la fine della parola quando il motore la sa dire, si consegna il
 * trascritto.
 *
 * ⚠️ ZERO LOGICA DI CICLO QUI DENTRO — solo la trascrizione. Che farne (riempire un item, capire
 * se è "assessabile") resta ai motori dei cicli e a `engine/assessItemFilter`, come in App.tsx.
 *
 * @see docs/serenity-refonte.md
 */

import { useEffect, useRef } from 'react';
import { nativeSpeechRecognition } from '../lib/nativeSpeechRecognition';
import { offlineSpeechRecognition } from '../lib/offlineSpeechRecognition';

const LANG_MAP: Record<string, string> = {
  en: 'en-US', fr: 'fr-FR', it: 'it-IT', es: 'es-ES', sv: 'sv-SE',
};

export function useVoiceItem({ active, lang, onTranscript }: {
  /** Riconosce SOLO a seduta aperta — fuori seduta non c'è item da riempire. */
  active: boolean;
  lang: string;
  onTranscript: (text: string, speechEndMs?: number) => void;
}) {
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const inCorsoRef = useRef(false);

  useEffect(() => {
    if (!active) return;
    let annullato = false;

    const wireHandlers = (engine: { onresult: any; onerror: any }) => {
      engine.onresult = (event: { results?: { transcript: string; isFinal: boolean }[]; speechEndMs?: number }) => {
        const r = event.results?.[0];
        if (r?.isFinal && r.transcript) onTranscriptRef.current(r.transcript.trim(), event.speechEndMs);
      };
      // Un errore qui non deve fermare la seduta — solo la dettatura tace, come App.tsx.
      engine.onerror = () => {};
    };

    (async () => {
      if (inCorsoRef.current) return;
      inCorsoRef.current = true;
      try {
        // ── NATIVO PRIMA — in tempo reale, l'unico accurato abbastanza per l'audit (stessa
        // scelta di App.tsx). Serve il permesso macOS "Riconoscimento vocale" + "Microfono".
        nativeSpeechRecognition.lang = LANG_MAP[lang] || 'en-US';
        nativeSpeechRecognition.onresult = null;
        nativeSpeechRecognition.onerror = () => {};
        const nativoOk = await nativeSpeechRecognition.init();
        if (annullato) return;
        if (nativoOk) {
          wireHandlers(nativeSpeechRecognition);
          nativeSpeechRecognition.start();
          return;
        }
        // ── RIPIEGO: Whisper offline (WASM) ────────────────────────────────────────────────
        const offlineOk = await offlineSpeechRecognition.init();
        if (annullato) { if (offlineOk) offlineSpeechRecognition.stop(); return; }
        if (offlineOk) {
          wireHandlers(offlineSpeechRecognition);
          offlineSpeechRecognition.lang = LANG_MAP[lang] || 'en-US';
          offlineSpeechRecognition.start();
        } else {
          inCorsoRef.current = false;
        }
      } catch {
        inCorsoRef.current = false;
      }
    })();

    return () => {
      annullato = true;
      try { nativeSpeechRecognition.stop(); } catch { /* noop */ }
      try { offlineSpeechRecognition.stop(); } catch { /* noop */ }
      inCorsoRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, lang]);
}
