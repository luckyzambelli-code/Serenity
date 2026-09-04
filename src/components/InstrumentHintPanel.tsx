import { Headphones, Gauge, MessageSquare } from 'lucide-react';
import { LAYER } from '../ui/layers';

/**
 * InstrumentHintPanel — « NESSUNO STRUMENTO: si SCEGLIE quale collegare ».
 *
 * ── PERCHÉ ESISTE ────────────────────────────────────────────────────────────────────────────
 * Primo pezzo di una frammentazione più ampia di `App.tsx` (7000+ righe) — segnalato: « si
 * possono frammentare per ciclo o altro? ». La logica per ciclo era già stata estratta in hook
 * a sé (fase 6 della refonte SERENITY); quel che restava dentro `App.tsx` era soprattutto
 * l'ALBERO JSX, mai davvero spezzato in componenti. Questo pannello — un overlay auto-contenuto,
 * aperto da UNA sola condizione booleana, senza stato proprio — è il blocco più isolato e
 * meccanico da tirare fuori: nessuna logica cambiata, solo spostata, esattamente come il
 * commento in cima a `useChargeEngine.ts` descrive per l'estrazione degli hook.
 *
 * ── PRESENTAZIONALE, NON PROPRIETARIO ───────────────────────────────────────────────────────
 * Nessun `useState` qui dentro: `connSel` (quali strumenti sono spuntati) resta in `App.tsx`,
 * che lo passa insieme al suo mutatore (`onToggle`). `onStart` resta UNA funzione sola passata
 * da fuori — il suo corpo (che tocca `senzaStrumentiRef`, `handleConnectMuse`, `theta.connect`,
 * `handleStart`) non è stato spostato qui: dipende da troppe altre cose di `App.tsx` per
 * guadagnarci separandolo, mentre il PANNELLO (100 righe di JSX) non dipende da nessuna di
 * quelle.
 */
export function InstrumentHintPanel({
  connSel, onToggle, onClose, onStart, thetaUnavailable, t,
}: {
  connSel: { muse: boolean; theta: boolean; none: boolean };
  onToggle: (k: 'muse' | 'theta' | 'none') => void;
  onClose: () => void;
  onStart: () => void;
  /** Il Theta-Meter non è disponibile su questa macchina (v. `useThetaMeter().unavailable`) —
   *  la sua voce nell'elenco non si mostra affatto, invece di mostrarsi disabilitata. */
  thetaUnavailable: boolean;
  t: (key: string) => string;
}) {
  return (
    <div style={{
      position: 'fixed', top: 70, left: '50%', transform: 'translateX(-50%)',
      zIndex: LAYER.session, display: 'flex', flexDirection: 'column', gap: 12,
      padding: '18px 22px', borderRadius: 12, minWidth: 340,
      background: 'rgba(2,6,23,0.96)', border: '1px solid rgba(251,191,36,0.45)',
      backdropFilter: 'blur(8px)', boxShadow: '0 10px 34px rgba(0,0,0,0.5)',
      animation: 'smFadeIn 0.3s ease-out' }}>
      {/* ── LA VIA D'USCITA ────────────────────────────────────────────────────────────────
          Il pannello non ne aveva alcuna: aperto per sbaglio, si restava dentro senza modo di
          tornare indietro (segnalato). Una croce, e ESC — perché chi vuole annullare cerca
          ESC prima di cercare una croce. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ flex: 1, fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
                       letterSpacing: '0.03em', color: '#fbbf24' }}>
          {t('connect_an_instrument')}
        </span>
        <button type="button" onClick={onClose}
          title={`${t('cancel')} · ESC`}
          style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 6, cursor: 'pointer',
                   background: 'transparent', border: '1px solid rgba(255,255,255,0.18)',
                   color: 'rgba(226,238,255,0.65)', fontSize: 14, lineHeight: 1, padding: 0 }}>
          ✕
        </button>
      </div>

      {/* ── TRE VOCI SULLO STESSO PIANO ────────────────────────────────────────────────────
          « Senza strumenti » era un bottone sotto CONNETTI, con una riga di spiegazione: e
          così sembrava una didascalia, non una possibilità. Ora è la TERZA VOCE, con la sua
          icona e la sua spunta come le altre due — perché è quel che è: un modo di condurre
          la seduta, non l'assenza degli altri due.

          È ESCLUSIVA (vedi `scegliConn` in App.tsx): spuntandola si spengono MUSE e boîtes, e
          viceversa. Un « senza strumenti » spuntato insieme al MUSE non vorrebbe dire niente. */}
      {([
        { k: 'muse' as const, on: connSel.muse, label: 'MUSE', icon: <Headphones size={17} strokeWidth={2} />,
          col: 'rgba(240,246,255,0.95)', bg: 'rgba(255,255,255,0.10)', bd: 'rgba(255,255,255,0.45)', show: true },
        { k: 'theta' as const, on: connSel.theta, label: t('theta_cans'), icon: <Gauge size={17} strokeWidth={2} />,
          col: '#f59e0b', bg: 'rgba(245,158,11,0.16)', bd: 'rgba(245,158,11,0.6)', show: !thetaUnavailable },
        { k: 'none' as const, on: connSel.none, label: t('no_instruments_mode'),
          icon: <MessageSquare size={17} strokeWidth={2} />,
          col: 'rgba(240,246,255,0.95)', bg: 'rgba(255,255,255,0.10)', bd: 'rgba(255,255,255,0.45)', show: true },
      ]).filter(o => o.show).map(o => (
        <button key={o.k} type="button"
          onClick={() => onToggle(o.k)}
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                   borderRadius: 9, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                   fontSize: 13, fontWeight: 700, letterSpacing: '0.05em', textAlign: 'left',
                   background: o.on ? o.bg : 'rgba(255,255,255,0.04)',
                   border: `1px solid ${o.on ? o.bd : 'rgba(255,255,255,0.16)'}`,
                   color: o.on ? o.col : 'rgba(226,238,255,0.55)' }}>
          <span style={{ fontFamily: 'monospace', fontSize: 15, width: 16 }}>{o.on ? '✓' : '·'}</span>
          {o.icon} {o.label}
        </button>
      ))}

      {/* ── UN SOLO BOTTONE, E DICE START ──────────────────────────────────────────────────
          Diceva CONNETTI, e collegava soltanto: bisognava poi premere START a parte. Due
          gesti per una intenzione. Ora è uno, e dice quel che fa.

          Collegare può ancora fallire (il selettore di dispositivo annullato), e in quel caso
          `handleStart` (in App.tsx) ritrova il suo controllo « nessuno strumento » e riapre
          questo pannello: non serve gestirlo qui, si corregge da sé. */}
      <button type="button"
        disabled={!connSel.muse && !connSel.theta && !connSel.none}
        onClick={onStart}
        style={{ height: 38, borderRadius: 9,
                 cursor: (connSel.muse || connSel.theta || connSel.none) ? 'pointer' : 'default',
                 opacity: (connSel.muse || connSel.theta || connSel.none) ? 1 : 0.4,
                 fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 700,
                 letterSpacing: '0.1em', textTransform: 'uppercase',
                 background: 'rgba(52,211,153,0.18)', border: '1px solid rgba(52,211,153,0.6)',
                 color: '#34d399' }}>
        START
      </button>

      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10, lineHeight: 1.5,
                     color: 'rgba(226,238,255,0.5)' }}>
        {connSel.none ? t('no_instruments_hint') : t('connect_either_hint')}
      </span>
    </div>
  );
}
