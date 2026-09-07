/**
 * ControlloProntezza — la sequenza di prontezza prima di aprire una seduta (stretta/respiro
 * delle boîtes del Meter, poi il respiro del MUSE). Settimo pezzo staccato dal corpo di
 * `Serenity.tsx` (v. `docs/serenity-refonte.md` per la cronologia completa). Copiato verbatim —
 * ogni commento storico preservato, nessuna riga di logica toccata.
 *
 * ── COSA RESTA FUORI DI PROPOSITO ────────────────────────────────────────────────────────────
 * Ogni azione COMPOSTA (`avviaSeduta`, `avviaSedutaConProntezza`) resta costruita in
 * `Serenity.tsx`, passata giù come callback. `t`/`lang` sono presi QUI, internamente (via
 * `useI18n`) — stessa ragione già scritta in `Intestazione.tsx`/`BarraLaterale.tsx`/
 * `GruppoAlto.tsx`/`GruppoBasso.tsx`. Il gate `{metabolicOpen && (...)}` resta in `Serenity.tsx`
 * — questo componente si monta solo quando serve, non decide da sé quando montarsi.
 *
 * @see docs/serenity-refonte.md — giro di scomposizione, 2026-09-07.
 */
import { useI18n } from '../i18n';
import { ThetaReadyCheck } from '../components/ThetaReadyCheck';
import { MetabolicCheck } from '../components/MetabolicCheck';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { Avvio } from './flussoAvvio';
import type { MetabAssessment } from '../engine/MetabolicBaseline';
import type { useRemoteSession } from '../hooks/useRemoteSession';
import type { useMuseConnection } from '../hooks/useMuseConnection';
import type { useThetaMeter } from '../hooks/useThetaMeter';
import type { useMuseContactGate } from '../hooks/useMuseContactGate';

export interface ControlloProntezzaProps {
  avvio: Avvio;
  remote: ReturnType<typeof useRemoteSession>;
  museOk: boolean;
  muse: ReturnType<typeof useMuseConnection>;
  meterC: boolean;
  thetaReadyDone: boolean;
  setThetaReadyDone: (v: boolean) => void;
  theta: ReturnType<typeof useThetaMeter>;
  provaTa: { two: number | null; solo: number | null };
  setProvaTa: Dispatch<SetStateAction<{ two: number | null; solo: number | null }>>;
  museGate: ReturnType<typeof useMuseContactGate>;
  avviaSeduta: () => void;
  avviaSedutaConProntezza: (a: MetabAssessment | null) => void;
  setMetabolicOpen: (v: boolean) => void;
  metabolicPhaseRef: MutableRefObject<'idle' | 'baseline' | 'breath' | 'result'>;
  needleTrim: number;
  setNeedleTrim: Dispatch<SetStateAction<number>>;
  needleInertia: number;
  setNeedleInertia: Dispatch<SetStateAction<number>>;
}

export function ControlloProntezza({
  avvio, remote, museOk, muse, meterC, thetaReadyDone, setThetaReadyDone, theta, provaTa,
  setProvaTa, museGate, avviaSeduta, avviaSedutaConProntezza, setMetabolicOpen, metabolicPhaseRef,
  needleTrim, setNeedleTrim, needleInertia, setNeedleInertia,
}: ControlloProntezzaProps) {
  const { t, lang } = useI18n();
  const readinessMuseOk = avvio?.distanza ? remote.remoteMuseConnected : museOk;
  // ⚠️ Calcolato QUI, non solo più giù: serve ANCHE a `onProceed` di `ThetaReadyCheck`
  // (v. la sua nota fra poco) — stesso bug, stesso rimedio, un solo posto dove chiedersi
  // « il MUSE sta ancora cercando? ». V. la nota estesa più giù, sul cancello di
  // `MetabolicCheck`.
  const museCercandoAncora = !avvio?.distanza && muse.museConnection === 'searching';
  if (meterC && !thetaReadyDone) {
    return (
      <div className="ser-ready-wrap">
      <ThetaReadyCheck
        scaleMeasured={theta.setup.scaleMeasured}
        breathOk={theta.breathOk}
        squeezeOk={theta.squeezeOk}
        testing={theta.testing}
        peakOffset={theta.testPeakOffset}
        startSqueezeTest={() => {
          // ⚠️ IL TA SI PRENDE QUI, prima che la stretta lo muova — stessa ragione di
          // App.tsx: è il riposo IN QUESTA configurazione, e la coppia dei due riposi è
          // lo scarto che si cerca al passo 4 della taratura.
          const ta = theta.ta;
          if (ta !== null) {
            setProvaTa(p => theta.setup.config === 'two-cans' ? { ...p, two: ta } : { ...p, solo: ta });
          }
          theta.startSqueezeTest();
        }}
        startBreathTest={theta.startBreathTest}
        sensTrim={theta.setup.sensTrim}
        setSensTrim={theta.setSensTrim}
        config={theta.setup.config}
        setConfig={theta.setConfig}
        soloOffsetMisurato={(theta.setup.offsets?.['solo-can'] ?? 0) !== 0}
        taTwo={provaTa.two}
        taSolo={provaTa.solo}
        onApplySoloOffset={off => theta.setSoloOffset(off)}
        unknownFormat={theta.unknownFormat}
        rawSamples={theta.rawSamples}
        noSignal={theta.noSignal}
        deviceInfo={theta.info}
        onProceed={() => {
          setThetaReadyDone(true);
          // Nessun MUSE da controllare dopo: si apre la seduta subito, come App.tsx.
          // ⚠️ BUG TROVATO — stesso della nota sul cancello di `MetabolicCheck`, qui
          // sotto: `!readinessMuseOk` da solo era vero ANCHE col MUSE ancora
          // `'searching'` (scelto insieme al meter, non ancora acceso) — apriva la
          // seduta subito invece di aspettarlo. `museCercandoAncora` lo esclude: se sta
          // ancora cercando, si passa oltre SENZA aprire — il render qui sotto monta
          // `MetabolicCheck` al giro successivo, che aspetta lui.
          if (!readinessMuseOk && !museCercandoAncora) { setMetabolicOpen(false); avviaSeduta(); }
        }}
        // ⚠️ BUG TROVATO — segnalato: « se schiacci Cancel o Start Anyway fa partire la
        // seduta comunque ». Verificato App.tsx (`onCancel={() => setMetabolicOpen(false)}`
        // per QUESTO controllo, la stretta/il respiro del Meter): ANNULLA lì chiude e
        // BASTA, non apre mai la seduta — la nota qui sopra (« nessuno dei due blocca per
        // davvero ») descriveva `MetabolicCheck` più giù (che in App.tsx SÌ apre la seduta
        // anche da ANNULLA — quello resta invariato), non `ThetaReadyCheck`: un'invenzione
        // presa in prestito dal componente sbagliato. Corretto a chiudere soltanto. */}
        onCancel={() => setMetabolicOpen(false)}
      />
      </div>
    );
  }
  // ⚠️ BUG TROVATO — segnalato: « quando il muse è scelto ma non acceso, lascia
  // iniziare lo stesso ». Prima il cancello era SOLO `readinessMuseOk` (richiede
  // `'connected'`) — mentre il MUSE è ancora `'searching'` (scelto, non ancora
  // acceso/associato) quel controllo era falso, si cadeva dritti al `return null` sotto,
  // e l'effetto accanto (v. la sua nota) scambiava « sto ancora cercando » per « ho
  // rinunciato », aprendo la seduta senza aver mai aspettato. `museCercandoAncora`
  // (calcolato in cima a questa IIFE, stessa condizione già passata a `museConnecting`)
  // tiene `MetabolicCheck` montato ANCHE durante la ricerca — lui sa già mostrare
  // "connessione in corso" (`museConnecting`, la sua prop, già cablata): il pezzo
  // mancante era che qui non lo si lasciava mai arrivare a schermo.
  if (readinessMuseOk || museCercandoAncora) {
    return (
      <div className="ser-ready-wrap">
      {/* ⚠️ BUG TROVATO — segnalato: « pronto per la session con il MUSE non dà i
          risultati anche se dice pronto ». `onPhase` era `() => {}`, un vuoto —
          `MetabolicCheck` lo chiama per dire QUANDO è nella fase `'baseline'`/`'breath'`
          (il suo stesso commento: « the engine is FED by App's METRICS_UPDATE, it reads
          the live phase via onPhase »): `useChargeEngine` (condiviso) nutre
          `metabolicBaseline` SOLO quando `metabolicPhaseRef.current` è una di quelle due
          fasi (`hooks/useChargeEngine.ts`, vicino a `METRICS_UPDATE`). Senza scrivere
          quel ref, `metabolicPhaseRef` restava fermo a `'idle'` per SEMPRE — zero
          campioni raccolti, `assess()` usciva vuoto: « pronto » (la schermata si vedeva,
          i tempi scorrevano) ma senza un solo numero vero dietro. `metabolicPhaseRef`
          esisteva già (già passato a `useChargeEngine` più sopra, `corpusSessionRef,
          tRef, metabolicPhaseRef`) — mancava solo scriverci, esattamente come App.tsx
          (`onPhase={(p) => { metabolicPhaseRef.current = p; }}`, verificato riga per
          riga). */}
      <MetabolicCheck
        lang={lang}
        meterAlreadyCalibrated={meterC && theta.setup.scaleMeasured}
        museConnected={readinessMuseOk}
        museWorn={museGate.museContact}
        museConnecting={museCercandoAncora}
        onProceed={a => avviaSedutaConProntezza(a)}
        onCancel={a => avviaSedutaConProntezza(a)}
        onPhase={p => { metabolicPhaseRef.current = p; }}
        needleTrim={{
          trim: needleTrim, setTrim: setNeedleTrim,
          inertia: needleInertia, setInertia: setNeedleInertia,
          labelSection: t('drawer_needle_trim') as string,
          labelSensitivity: t('trim_sensitivity') as string,
          labelInertia: t('trim_inertia') as string,
          labelCentering: t('trim_centering') as string,
        }}
      />
      </div>
    );
  }
  // Né meter da provare né MUSE da ascoltare (la connessione scelta è FALLITA nel
  // frattempo) — l'uscita vera è nell'effetto qui sotto, non qui: uno stato scritto
  // DURANTE il render (invece che dopo, in un effetto) è esattamente l'impurità che ha
  // già causato un falso allarme dei Hook in un giro precedente di questa stessa
  // sessione — non si ripete l'errore.
  return null;
}
