import React from 'react';
import { Check } from 'lucide-react';
import { useUiStore } from '../store/uiStore';
import { stepsOf, currentStep, stepDone, type StepId } from '../engine/cycleSteps';
import type { SessionMode } from '../engine/sessionMode';
import type { SessionPhase } from '../engine/sessionPhase';
import { pick5 } from '../i18n5';

/**
 * CycleSteps — LA PISTA DEI TEMPI: quanti sono, a quale sei, cosa viene dopo.
 *
 * ── PERCHÉ ESISTE ───────────────────────────────────────────────────────────────────────────
 * L'istruzione diceva « 1 · DAI L'ITEM » e il « 1 · » prometteva una sequenza che non si vedeva
 * mai: non si sapeva quanti tempi ci fossero né che cosa venisse dopo. In TONE il tempo 2
 * (« positivo o negativo? ») compariva di colpo premendo LOCALIZZA, e sembrava un salto —
 * mentre era semplicemente il secondo di quattro, che nessuno aveva annunciato.
 *
 * Vedere la sequenza intera toglie la domanda « quanto manca » senza scrivere una parola in più:
 * il tempo in corso è acceso, quelli fatti sono spuntati, quelli davanti sono smorzati.
 *
 * ── MONOCROMO ───────────────────────────────────────────────────────────────────────────────
 * Nessuna tinta: il colore nell'app è riservato alla CARICA e all'ambra dell'avviso
 * (docs/refonte-fasi.md §2). Qui bastano il peso del testo e l'opacità — e il traguardo, che
 * è l'unico momento che merita un segno, prende la spunta.
 *
 * Rendering puro: quanti tempi e a quale si è lo dice `engine/cycleSteps`, che si prova da solo.
 */
export function CycleSteps({ mode, phase, lang, compact = false }: {
  mode: SessionMode;
  phase: SessionPhase;
  lang: string;
  /** Compatto: solo i pallini, senza le parole. Per quando lo spazio è poco. */
  compact?: boolean;
}) {
  const isLightTheme = useUiStore(s => s.isLightTheme);
  const L = (it: string, fr: string, en: string, es: string, sv: string) => pick5(lang, it, fr, en, es, sv);

  const steps = stepsOf(mode);
  const cur = currentStep(phase, mode);
  // APERTO non ha sequenza, e fuori dal ciclo non c'è un tempo: in nessuno dei due casi si
  // disegna una pista — una pista spenta è un'altra cosa da leggere e non dice nulla.
  if (!steps.length || cur < 0) return null;

  const ETICHETTA: Record<StepId, string> = {
    item:        L('ITEM', 'ITEM', 'ITEM', 'ÍTEM', 'ITEM'),
    mockup:      L('MOCK-UP', 'MOCK-UP', 'MOCK-UP', 'MOCK-UP', 'MOCK-UP'),
    asis:        'AS-IS',
    equilibrium: 'EQUILIBRIUM',
    value:       L('VALORE', 'VALEUR', 'VALUE', 'VALOR', 'VÄRDE'),
    double:      L('DOPPIO', 'DOUBLE', 'DOUBLE', 'DOBLE', 'DUBBEL'),
    obtained:    L('OTTENUTO', 'OBTENU', 'OBTAINED', 'OBTENIDO', 'UPPNÅTT'),
    locate:      L('LOCALIZZA', 'LOCALISE', 'LOCATE', 'LOCALIZA', 'LOKALISERA'),
    sign:        L('SEGNO', 'SIGNE', 'SIGN', 'SIGNO', 'TECKEN'),
    magnitude:   L('AMPIEZZA', 'AMPLEUR', 'MAGNITUDE', 'AMPLITUD', 'STORLEK'),
    tonemockup:  L('MOCK-UP', 'MOCK-UP', 'MOCK-UP', 'MOCK-UP', 'MOCK-UP'),
  };

  const fatto  = isLightTheme ? 'rgba(58,58,64,0.55)'  : 'rgba(226,238,255,0.45)';
  const acceso = isLightTheme ? '#1a1a1f'              : 'rgba(240,246,255,0.98)';
  const avanti = isLightTheme ? 'rgba(58,58,64,0.30)'  : 'rgba(226,238,255,0.26)';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap' }}>
      {steps.map((s, i) => {
        // L'ULTIMO TEMPO si spunta solo quando il ciclo è davvero concluso: essere ARRIVATI
        // all'AS-IS non è averlo validato, ed è tutta la differenza (l'app propone, l'auditor
        // valida). Vedi `stepDone`.
        const concluso = i < cur || (i === cur && stepDone(phase));
        const inCorso  = i === cur && !concluso;
        const colore   = concluso ? fatto : inCorso ? acceso : avanti;
        return (
          <React.Fragment key={s}>
            {i > 0 && (
              <span aria-hidden style={{ width: 10, height: 1, flexShrink: 0,
                background: i <= cur ? fatto : avanti }} />
            )}
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <span style={{
                width: 15, height: 15, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-sans)', fontSize: 9, fontWeight: 800, lineHeight: 1,
                color: inCorso ? (isLightTheme ? '#f2f3f6' : '#12141a') : colore,
                background: inCorso ? acceso : 'transparent',
                border: `1px solid ${inCorso ? acceso : colore}` }}>
                {concluso ? <Check size={9} strokeWidth={3.2} /> : i + 1}
              </span>
              {!compact && (
                <span style={{
                  fontFamily: 'var(--font-sans)', fontSize: 9, letterSpacing: '0.1em',
                  fontWeight: inCorso ? 800 : 600, color: colore, whiteSpace: 'nowrap' }}>
                  {ETICHETTA[s]}
                </span>
              )}
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
}
