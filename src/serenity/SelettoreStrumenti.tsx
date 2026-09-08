/**
 * SelettoreStrumenti — MUSE/METER/SENZA STRUMENTI, la pillola unica con le tre icone (o un
 * solo pallino aggregato in BASIC finché non si tocca) — quarto pezzo staccato
 * dall'intestazione di `Serenity.tsx` (dopo `LogoSerenity.tsx`/`BottoniStoricoProcessus.tsx`/
 * `ChiAuditaAssetto.tsx`).
 *
 * ── COME RESTA SICURO ────────────────────────────────────────────────────────────────────────
 * Riceve gli hook `muse`/`theta`/`museGate` TALI E QUALI (gli stessi oggetti che
 * `Serenity.tsx` ottiene da `useMuseConnection`/`useThetaMeter`/`useMuseContactGate`) — non ne
 * ricalcola i campi, li legge soltanto, esattamente come faceva `Serenity.tsx` prima
 * dell'estrazione. `LetturaIntegrita` (il numero "INT xx%") viveva come componente locale di
 * `Serenity.tsx`, usato SOLO qui — si è spostata con lui.
 *
 * @see docs/serenity-refonte.md — giro di scomposizione, 2026-09-07.
 */
import React, { useSyncExternalStore } from 'react';
import { Headphones, Gauge, MessageSquareOff } from 'lucide-react';
import { integrityTracker } from '../runtime/SmoothingEngine';
import { useI18n } from '../i18n';
import { COLORE_PUNTO, type StatoConnessione } from './IndicatoreConnessione';
import type { useMuseConnection } from '../hooks/useMuseConnection';
import type { useThetaMeter } from '../hooks/useThetaMeter';
import type { useMuseContactGate } from '../hooks/useMuseContactGate';

/** Vedi la nota grande nel file: era un componente locale di `Serenity.tsx`, usato solo qui —
 *  isolato nel proprio `React.memo` perché aggiorna spesso (non deve ridisegnare l'intestazione
 *  intera) e legge `integrityTracker` (un tracker condiviso, non uno stato di questo file).
 *  ⚠️ CORRETTO — segnalato nella revisione completa: durante l'estrazione il `React.memo` era
 *  rimasto solo nel commento, non nel codice — senza argomenti (nessuna prop), il memo non
 *  serviva a NIENTE per evitare re-render da genitore, ma qui il punto è un altro: senza,
 *  `SelettoreStrumenti` (il genitore) ridisegnava anche questo span ad ogni suo stesso
 *  re-render, invece di lasciare che sia SOLO `integrityTracker.subscribe` a deciderlo. */
const LetturaIntegrita = React.memo(function LetturaIntegrita() {
  const pct = useSyncExternalStore(integrityTracker.subscribe, integrityTracker.getCurrent);
  return (
    <span style={{ fontFamily: 'var(--s-mono)', fontVariantNumeric: 'tabular-nums' }}>
      {Math.round(pct)}%
    </span>
  );
});

export interface SelettoreStrumentiProps {
  muse: ReturnType<typeof useMuseConnection>;
  theta: ReturnType<typeof useThetaMeter>;
  museGate: ReturnType<typeof useMuseContactGate>;
  /** `theta.status === 'connected'` — già calcolato da chi monta questo componente (usato
   *  anche altrove in `Serenity.tsx`), non ricalcolato qui una seconda volta. */
  meterC: boolean;
  batteryLevel: number | null;
  senzaStrumenti: boolean;
  onSenzaStrumenti: (v: boolean) => void;
  /** `avvio?.esperto` — tri-stato: `!== true` conta come BASIC. */
  espertoAttivo: boolean | null | undefined;
  strumentiEspansi: boolean;
  onEspandi: () => void;
  mostraBiometria: boolean;
  museOk: boolean;
  LC: (it: string, fr: string, en: string, es: string, sv: string) => string;
}

export function SelettoreStrumenti({
  muse, theta, museGate, meterC, batteryLevel, senzaStrumenti, onSenzaStrumenti,
  espertoAttivo, strumentiEspansi, onEspandi, mostraBiometria, museOk, LC,
}: SelettoreStrumentiProps) {
  const { t } = useI18n();

  const museStato: StatoConnessione =
    muse.museConnection === 'connected'
      ? (museGate.museContact ? 'connesso' : 'errore')
      : muse.museConnection === 'searching' ? 'cercando' : 'in-attesa';
  const museTitolo = `MUSE — ${
    muse.museConnection === 'connected'
      ? (museGate.museContact
          ? (batteryLevel !== null ? `${batteryLevel}%` : '✓')
          : t('muse_tip_not_worn'))
      : muse.museConnection === 'searching' ? t('searching') : t('ser_connect_muse')
  }`;
  const meterStato: StatoConnessione =
    theta.unavailable ? 'spento'
      : meterC ? 'connesso'
      : theta.status === 'connecting' ? 'cercando' : 'in-attesa';
  const meterTitolo = `METER — ${
    theta.unavailable ? t('ser_meter_unavailable')
      : meterC ? t('theta_cans')
      : theta.status === 'connecting' ? t('searching') : t('theta_connect')
  }`;
  const noneTitolo = `${LC('SENZA STRUMENTI', 'SANS INSTRUMENTS', 'NO INSTRUMENTS', 'SIN INSTRUMENTOS', 'UTAN INSTRUMENT')} — ${t('no_instruments_mode')}`;

  // `connesso` — SOLO lo stato ATTIVO/in ascolto di ciascuno strumento, non "ricerca in corso":
  // cliccare durante una ricerca la riprova/annulla, non stacca un dato che sta arrivando
  // davvero. Decide quali bottoni restano vivi durante un ciclo (il chiamante lo sa già: la
  // stessa restrizione di "modalità ciclo" vive in `Serenity.tsx`, non qui).
  const strumenti: Array<{ key: string; icona: React.ReactNode; onClick?: () => void; connesso: boolean; stato: StatoConnessione; title: string }> = [
    { key: 'muse', icona: <Headphones size={22} strokeWidth={1.8} />,
      onClick: () => { if (muse.museConnection === 'disconnected') onSenzaStrumenti(false); muse.handleConnectMuse(); },
      connesso: muse.museConnection === 'connected', stato: museStato, title: museTitolo },
    { key: 'meter', icona: <Gauge size={22} strokeWidth={1.8} />,
      onClick: theta.unavailable ? undefined : () => {
        if (!meterC) onSenzaStrumenti(false);
        (meterC ? theta.disconnect : theta.connect)();
      },
      connesso: meterC, stato: meterStato, title: meterTitolo },
    {
      key: 'none', icona: <MessageSquareOff size={22} strokeWidth={1.8} />,
      onClick: () => {
        const nuovo = !senzaStrumenti;
        onSenzaStrumenti(nuovo);
        if (nuovo) {
          if (muse.museConnection !== 'disconnected') muse.handleConnectMuse();
          if (meterC) theta.disconnect();
        }
      },
      // "NESSUNO" non attiva mai uno strumento fermo — al contrario, ne stacca due se acceso:
      // resta un gesto di DISCONNESSIONE a tutti gli effetti.
      connesso: true, stato: senzaStrumenti ? 'connesso' : 'in-attesa', title: noneTitolo,
    },
  ];

  // In BASIC, finché l'auditor non lo tocca, le tre pillole diventano UN pallino solo — non un
  // indicatore muto: resta un bottone vero, un click lo espande alla fila intera (che poi resta
  // così, niente riduzione automatica). `!== true`, non `=== false`: una configurazione salvata
  // senza questo campo (`null`/`undefined`) deve leggersi come BASIC.
  if (espertoAttivo !== true && !strumentiEspansi) {
    const ordinePriorita: Record<StatoConnessione, number> =
      { connesso: 0, errore: 1, cercando: 2, spento: 3, 'in-attesa': 4 };
    const statoAggregato = strumenti.reduce<StatoConnessione>((peggiore, s) =>
      ordinePriorita[s.stato] < ordinePriorita[peggiore] ? s.stato : peggiore, 'in-attesa');
    const IconaAggregata = strumenti.find(s => s.stato === statoAggregato)?.icona ?? strumenti[0].icona;
    return (
      <button className="s-glass s-glass-btn" onClick={onEspandi}
        data-help={LC('strumenti — tocca per scegliere MUSE/METER/senza', 'instruments — touche pour choisir MUSE/METER/sans',
          'instruments — tap to choose MUSE/METER/none', 'instrumentos — toca para elegir MUSE/METER/ninguno',
          'instrument — tryck för att välja MUSE/METER/inga')}
        title={LC('strumenti — tocca per scegliere', 'instruments — touche pour choisir',
          'instruments — tap to choose', 'instrumentos — toca para elegir',
          'instrument — tryck för att välja')}
        style={{
          position: 'relative', cursor: 'pointer', padding: 7, borderRadius: 999,
          background: 'var(--s-disc)', display: 'flex', color: 'var(--s-ink-soft)', border: 'none',
        }}>
        {IconaAggregata}
        <span aria-hidden="true" style={{
          position: 'absolute', top: 4, right: 4, width: 7, height: 7, borderRadius: '50%',
          background: COLORE_PUNTO[statoAggregato],
          boxShadow: (statoAggregato === 'connesso' || statoAggregato === 'errore')
            ? `0 0 0 2px color-mix(in srgb, ${COLORE_PUNTO[statoAggregato]} 25%, transparent)` : 'none',
        }} />
      </button>
    );
  }

  return (
    <span className="s-glass" style={{
      display: 'flex', alignItems: 'center', gap: 2, background: 'var(--s-disc)',
      borderRadius: 999, padding: '4px 6px',
    }}>
      {strumenti.map(s => {
        const clic = s.onClick;
        return (
        <button key={s.key} className="s-glass-btn" onClick={clic} title={s.title} data-help={s.title}
          style={{
            position: 'relative', border: 'none', background: 'transparent',
            cursor: clic ? 'pointer' : 'default', padding: 6, borderRadius: 999,
            display: 'flex', color: 'var(--s-ink-soft)',
          }}>
          {s.icona}
          <span aria-hidden="true" style={{
            position: 'absolute', top: 3, right: 3, width: 7, height: 7, borderRadius: '50%',
            background: COLORE_PUNTO[s.stato],
            boxShadow: (s.stato === 'connesso' || s.stato === 'errore')
              ? `0 0 0 2px color-mix(in srgb, ${COLORE_PUNTO[s.stato]} 25%, transparent)` : 'none',
            transition: 'background var(--s-slow) var(--s-ease), box-shadow var(--s-slow) var(--s-ease)',
          }} />
        </button>
        );
      })}
      {museOk && mostraBiometria && (
        <span title={t('biometric_integrity')} style={{
          display: 'flex', alignItems: 'baseline', gap: 3, padding: '0 8px 0 2px',
          fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-micro)', color: 'var(--s-ink-faint)',
        }}>
          <span style={{ fontSize: 'var(--s-fs-micro)', letterSpacing: '0.06em' }}>
            {LC('INT', 'INT', 'INT', 'INT', 'INT')}
          </span>
          <LetturaIntegrita />
        </span>
      )}
    </span>
  );
}
