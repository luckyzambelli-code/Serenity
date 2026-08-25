import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { stepsOf, currentStep, stepDone, type StepId } from '../engine/cycleSteps';
import type { SessionMode } from '../engine/sessionMode';
import type { SessionPhase } from '../engine/sessionPhase';
import { pick5 } from '../i18n5';

/**
 * PistaCiclo — LA PROCEDURA A FUOCO, SOVRAPPOSTA AL LATO SINISTRO DELL'ARCO.
 *
 * ── PERCHÉ ESISTE ───────────────────────────────────────────────────────────────────────────
 * Segnalato: « le steps devono stare a sinistra dell'arco, senza ridurlo, sovrapposte con
 * trasparenza — il comando in corso grande e al centro, i vicini più piccoli e smorzati, in
 * modo da guidare l'attenzione, con l'ago sempre leggibile sotto ». `CycleSteps` (orizzontale,
 * nella barra comandi sopra il quadrante) resta la pista "di servizio", compatta; questa ne è
 * la lettura estesa, pensata per restare sovrapposta all'arco per tutta la durata del ciclo —
 * non solo un'occhiata nella barra.
 *
 * ── PERCHÉ IL CLIC NON SPOSTA MAI IL TEMPO REALE ────────────────────────────────────────────
 * Il clic su un tempo NON avanza né riporta indietro il ciclo — non esiste, e non deve esistere,
 * un motore che sappia "salta al tempo 2": il ciclo lo fa avanzare solo un gesto vero (dare
 * l'item, validare l'AS-IS, dichiarare raggiunto...). Il clic qui è una lente: mette a fuoco
 * visivamente un tempo passato o futuro per rileggerlo, poi torna da solo al tempo vero appena
 * il ciclo avanza davvero (v. l'`useEffect` sotto, agganciato a `cur`). Un clic che "spostasse"
 * il tempo reale mentirebbe sullo stato dell'audit — proprio quello che questa pista non deve
 * mai fare.
 *
 * Dati puri da `engine/cycleSteps` (`stepsOf`/`currentStep`/`stepDone`), le STESSE funzioni che
 * legge `components/CycleSteps.tsx`: nessuna logica nuova, solo una resa diversa dello stesso
 * dato — non può divergere da lui su quanti tempi ci sono o a quale si è.
 */
export function PistaCiclo({ mode, phase, lang }: {
  mode: SessionMode;
  phase: SessionPhase;
  lang: string;
}) {
  const L = (it: string, fr: string, en: string, es: string, sv: string) => pick5(lang, it, fr, en, es, sv);
  const steps = stepsOf(mode);
  const cur = currentStep(phase, mode);

  // Il fuoco manuale (clic su un tempo diverso da quello reale) si spegne da sé appena il ciclo
  // avanza davvero — mai restare a leggere un tempo vecchio mentre l'audit è già oltre.
  const [fuoco, setFuoco] = useState<number | null>(null);
  useEffect(() => { setFuoco(null); }, [cur]);

  // Stessa guardia di `CycleSteps`: APERTO non ha sequenza, e fuori da un ciclo non c'è un
  // tempo — in nessuno dei due casi si disegna qualcosa che non direbbe nulla di vero.
  if (!steps.length || cur < 0) return null;

  const ETICHETTA: Record<StepId, string> = {
    item:        L('ITEM', 'ITEM', 'ITEM', 'ÍTEM', 'ITEM'),
    mockup:      L('MOCK-UP', 'MOCK-UP', 'MOCK-UP', 'MOCK-UP', 'MOCK-UP'),
    asis:        'AS-IS',
    equilibrium: 'EQUILIBRIUM',
    value:       L('VALORE', 'VALEUR', 'VALUE', 'VALOR', 'VÄRDE'),
    double:      L('DOPPIO', 'DOUBLE', 'DOUBLE', 'DOBLE', 'DUBBEL'),
    obtained:    L('OTTENUTO', 'OBTENU', 'OBTAINED', 'OBTENIDO', 'UPPNÅTT'),
    tone40:      L('TONO 40', 'TON 40', 'TONE 40', 'TONO 40', 'TON 40'),
  };
  const titoloRileggi = L('fatto — clic per rileggerlo', 'fait — clic pour le relire',
    'done — click to reread it', 'hecho — clic para releerlo', 'klart — klicka för att läsa igen') as string;

  const principale = fuoco ?? cur;

  return (
    <div style={{
      // Il vero bordo sinistro del disegno dell'arco è x=320 (v. la nota accanto a
      // `ToneColumn`, misurata sullo stesso quadrante) — 300 lo sfiora da fuori e la larghezza
      // (250) lo attraversa per circa 230px: sovrapposto per davvero, non solo accostato,
      // com'era richiesto, senza toccare UN pixel della geometria dell'arco stesso (nessuna
      // riga di `QuantumSphere`/`ClearDial` cambia — questo è un livello a parte sopra di
      // loro, `pointerEvents:'none'` sul contenitore, `'auto'` solo sui singoli bottoni: non
      // ruba clic al quadrante nei punti dove non c'è testo).
      position: 'absolute', left: 300, top: '50%', transform: 'translateY(-50%)',
      width: 250, display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
      gap: 14, pointerEvents: 'none', zIndex: 5,
    }}>
      {steps.map((s, i) => {
        const distanza = Math.abs(i - principale);
        const inFuoco = i === principale;
        const concluso = i < cur || (i === cur && stepDone(phase));
        // Taglia e chiarezza calano con la distanza dal tempo a fuoco: a colpo d'occhio si
        // vede QUALE comando conta adesso, senza dover leggere l'intera lista — è la « guida
        // dell'attenzione » segnalata, non una decorazione.
        const fs = inFuoco ? 'var(--s-fs-xl)' : distanza === 1 ? 'var(--s-fs-base)' : 'var(--s-fs-sm)';
        const opacita = inFuoco ? 1 : distanza === 1 ? 0.55 : 0.26;
        const colore = inFuoco ? 'var(--s-ink)' : concluso ? 'var(--s-still)' : 'var(--s-ink-soft)';
        return (
          <button key={s} type="button" onClick={() => setFuoco(i)} title={concluso ? titoloRileggi : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, border: 'none',
              cursor: 'pointer', padding: '3px 10px', borderRadius: 999, textAlign: 'left',
              pointerEvents: 'auto', opacity: opacita,
              transition: 'opacity 0.25s ease, font-size 0.25s ease, background 0.25s ease',
              // Solo il tempo a fuoco porta un fondo — le sue lettere devono staccarsi
              // dall'arco sotto; gli altri restano puro testo, per non impilare più riquadri
              // semitrasparenti uno sull'altro (l'ago ci perderebbe leggibilità, il punto (4)
              // della richiesta). Trasparenza calibrata a mano: abbastanza fondo da leggere il
              // testo su qualunque colore dell'arco sotto, abbastanza poco (42%) perché l'ago
              // — che passa anche dietro al tempo a fuoco — resti tracciabile.
              background: inFuoco ? 'color-mix(in srgb, var(--s-ground) 42%, transparent)' : 'none',
            }}>
            <span aria-hidden style={{
              width: inFuoco ? 26 : 18, height: inFuoco ? 26 : 18, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--s-sans)', fontSize: inFuoco ? 12 : 9, fontWeight: 800, lineHeight: 1,
              color: inFuoco ? 'var(--s-ground)' : colore,
              background: inFuoco ? 'var(--s-ink)' : 'transparent',
              border: `1px solid ${colore}`,
            }}>
              {concluso ? <Check size={inFuoco ? 14 : 10} strokeWidth={3.2} /> : i + 1}
            </span>
            <span style={{
              fontFamily: 'var(--s-sans)', fontSize: fs, fontWeight: inFuoco ? 800 : 600,
              letterSpacing: '0.06em', color: colore, whiteSpace: 'nowrap',
            }}>
              {ETICHETTA[s]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
