import React, { useState } from 'react';
import { useI18n } from '../i18n';
import { linearitaResidua, buildTaScale, taFromRaw, type ThetaTaPoint, type ThetaTaScale } from '../engine/thetaTaScale';

/**
 * ThetaTaCalibration — taratura del TONE ARM con l'ARTEFATTO FISICO del Theta-Meter.
 *
 * L'artefatto si attacca al posto delle lattine e ha un pulsante per ciascun valore di TA
 * (2, 3, 4, 5). Premendone uno, il meter legge la resistenza corrispondente a QUEL TA: si
 * registra il grezzo, e con quattro coppie il TA diventa un numero VERO sulla scala del meter
 * invece di una grandezza relativa.
 *
 * La lettura finale interpola FRA i punti, quindi non serve che il legame sia una retta. Lo
 * scarto dalla retta viene comunque mostrato: è un'informazione sull'apparecchio, e se è grande
 * dice che tarare due soli punti non sarebbe bastato.
 */

/** I valori incisi sull'artefatto. */
const VALORI_TA = [2, 3, 4, 5];

export interface ThetaTaCalibrationProps {
  /** Il grezzo in questo istante — si legge quando l'utente conferma un punto. */
  captureRaw: () => number;
  /** Fissa la scala. Restituisce false se i punti sono inutilizzabili. */
  applyTaPoints: (points: ThetaTaPoint[], now: number) => boolean;
  clearTaCalibration: () => void;
  /** La taratura già in uso, se c'è. */
  taScale: ThetaTaScale | null;
  /** Il meter è collegato? Senza, non c'è nulla da leggere. */
  connected: boolean;
  /** Il TA della lettura ISTANTANEA con la taratura SALVATA. `null` se non ancora tarato. */
  taNow: number | null;
  /** La lettura grezza in questo istante — serve a verificare con la scala in ANTEPRIMA,
   *  cioè con i punti appena registrati, prima ancora di salvare. */
  rawNow: number;
  onClose: () => void;
}

export function ThetaTaCalibration({
  captureRaw, applyTaPoints, clearTaCalibration, taScale, connected, taNow, rawNow, onClose,
}: ThetaTaCalibrationProps) {
  const { t } = useI18n();
  const [punti, setPunti] = useState<Record<number, number>>({});
  const [errore, setErrore] = useState<string | null>(null);

  const registra = (ta: number) => {
    const raw = captureRaw();
    if (!raw) { setErrore(t('theta_cal_no_signal') as string); return; }
    setErrore(null);
    setPunti(p => ({ ...p, [ta]: raw }));
  };

  const elenco: ThetaTaPoint[] = Object.entries(punti).map(([ta, raw]) => ({ ta: Number(ta), raw }));
  // Si costruisce la scala SUBITO, per poter mostrare lo scarto dalla retta prima di salvare.
  const anteprima = elenco.length >= 2 ? buildTaScale(elenco, 0) : null;
  const scarto = anteprima ? linearitaResidua(anteprima) : 0;
  // Si preferisce l'ANTEPRIMA alla scala salvata: durante la taratura si vuole vedere l'effetto
  // dei punti che si stanno registrando, non di quelli vecchi.
  const vivo = anteprima ? taFromRaw(rawNow, anteprima) : taNow;

  const salva = () => {
    if (!applyTaPoints(elenco, Date.now())) {
      // Il caso tipico: l'artefatto non era attaccato, quindi due punti hanno la stessa lettura.
      setErrore(t('theta_cal_bad_points') as string);
      return;
    }
    onClose();
  };

  const eti: React.CSSProperties = {
    fontFamily: 'var(--font-sans)', fontSize: 9, letterSpacing: '0.14em',
    textTransform: 'uppercase', color: 'rgba(226,238,255,0.45)',
  };

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 9998, cursor: 'pointer',
               background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)',
               display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ cursor: 'default', minWidth: 380, maxWidth: 460, padding: '24px 26px 20px',
                 borderRadius: 16, border: '1px solid rgba(245,158,11,0.35)',
                 background: 'linear-gradient(160deg, #2c2c31 0%, #1c1c20 100%)',
                 boxShadow: '0 24px 60px rgba(0,0,0,0.6)' }}>

        <div style={{ ...eti, color: '#f59e0b', marginBottom: 4 }}>{t('theta_cal_title') as string}</div>
        <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, lineHeight: 1.5,
                      color: 'rgba(226,238,255,0.72)', marginBottom: 16 }}>
          {t('theta_cal_intro') as string}
        </div>

        {!connected && (
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: '#f87171', marginBottom: 12 }}>
            {t('theta_cal_not_connected') as string}
          </div>
        )}

        {/* Una riga per valore inciso sull'artefatto. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {VALORI_TA.map(ta => (
            <div key={ta} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700,
                             color: '#f59e0b', width: 34 }}>TA {ta}</span>
              <button type="button" disabled={!connected} onClick={() => registra(ta)}
                style={{ fontFamily: 'var(--font-sans)', fontSize: 10, fontWeight: 600,
                         letterSpacing: '0.06em', textTransform: 'uppercase',
                         padding: '5px 11px', borderRadius: 7,
                         cursor: connected ? 'pointer' : 'default', opacity: connected ? 1 : 0.4,
                         background: punti[ta] ? 'rgba(52,211,153,0.16)' : 'rgba(255,255,255,0.07)',
                         border: `1px solid ${punti[ta] ? 'rgba(52,211,153,0.5)' : 'rgba(255,255,255,0.2)'}`,
                         color: punti[ta] ? '#34d399' : 'rgba(235,244,255,0.85)' }}>
                {punti[ta] ? (t('theta_cal_again') as string) : (t('theta_cal_record') as string)}
              </button>
              <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(226,238,255,0.5)' }}>
                {punti[ta] ? Math.round(punti[ta]).toLocaleString('it') : '—'}
              </span>
            </div>
          ))}
        </div>

        {/* VERIFICA DAL VIVO — che TA legge l'artefatto ADESSO.
            Usa la scala in ANTEPRIMA (i punti appena registrati) appena ce ne sono due, e
            ricade su quella salvata altrimenti: serve MENTRE si tara, non solo dopo. Prima la
            si mostrava solo a taratura salvata, cioè proprio quando non serviva.
            È la lettura ISTANTANEA, non il braccio: premuto un pulsante deve rispondere SUBITO. */}
        {connected && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.10)',
                        display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={eti}>{t('theta_cal_live') as string}</span>
            <span style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 700, color: '#34d399' }}>
              {vivo !== null ? vivo.toFixed(2) : '—'}
            </span>
            <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(226,238,255,0.4)' }}>
              {Math.round(rawNow).toLocaleString('it')}
            </span>
            {anteprima && <span style={eti}>{t('theta_cal_preview') as string}</span>}
          </div>
        )}

        {/* Lo scarto dalla retta: informazione sull'apparecchio, non un ostacolo. */}
        {anteprima && elenco.length >= 3 && (
          <div style={{ marginTop: 14, fontFamily: 'var(--font-sans)', fontSize: 10,
                        color: scarto > 0.05 ? '#fbbf24' : 'rgba(226,238,255,0.5)' }}>
            {(t('theta_cal_linearity') as string).replace('{v}', scarto.toFixed(3))}
          </div>
        )}

        {errore && (
          <div style={{ marginTop: 12, fontFamily: 'var(--font-sans)', fontSize: 11, color: '#f87171' }}>
            {errore}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button type="button" onClick={onClose}
            style={{ flex: 1, height: 32, borderRadius: 9, cursor: 'pointer',
                     fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '0.1em',
                     textTransform: 'uppercase', background: 'rgba(255,255,255,0.06)',
                     border: '1px solid rgba(255,255,255,0.16)', color: 'rgba(226,238,255,0.6)' }}>
            {t('cancel') as string}
          </button>
          <button type="button" disabled={elenco.length < 2} onClick={salva}
            style={{ flex: 1, height: 32, borderRadius: 9,
                     cursor: elenco.length < 2 ? 'default' : 'pointer',
                     opacity: elenco.length < 2 ? 0.4 : 1,
                     fontFamily: 'var(--font-sans)', fontSize: 10, fontWeight: 700,
                     letterSpacing: '0.1em', textTransform: 'uppercase',
                     background: 'rgba(245,158,11,0.2)', border: '1px solid rgba(245,158,11,0.6)',
                     color: '#f59e0b' }}>
            {t('theta_cal_save') as string}
          </button>
        </div>

        {taScale && (
          <button type="button" onClick={() => { clearTaCalibration(); setPunti({}); }}
            style={{ marginTop: 10, width: '100%', height: 26, borderRadius: 7, cursor: 'pointer',
                     fontFamily: 'var(--font-sans)', fontSize: 9, letterSpacing: '0.1em',
                     textTransform: 'uppercase', background: 'transparent',
                     border: '1px solid rgba(248,113,113,0.3)', color: 'rgba(248,113,113,0.75)' }}>
            {t('theta_cal_clear') as string}
          </button>
        )}
      </div>
    </div>
  );
}
