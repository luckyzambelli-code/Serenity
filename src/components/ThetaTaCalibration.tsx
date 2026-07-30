import React, { useState } from 'react';
import { useI18n } from '../i18n';
import {
  linearitaResidua, buildTaScale, taFromRaw, isFactoryScale,
  type ThetaTaPoint, type ThetaTaScale,
} from '../engine/thetaTaScale';

/**
 * E-METER TESTER — taratura della scala del TA con l'ARTEFATTO FISICO.
 *
 * L'artefatto si attacca al posto delle boîtes e ha un pulsante per ciascun valore di TA.
 * Premendone uno, il meter legge la resistenza corrispondente: si registra, e con più coppie
 * il TA diventa un numero VERO sulla scala del meter.
 *
 * ── PERCHÉ DIETRO UN BOTTONE ────────────────────────────────────────────────────────────────
 * È uno strumento da laboratorio, non un comando di seduta: un auditor che non sa cosa sia
 * l'artefatto non deve trovarsi davanti quattro campi numerici senza contesto. Si apre solo
 * chiedendolo. Chi non ce l'ha non ne ha bisogno: la taratura di fabbrica è già dentro il
 * programma, e si affina dal pannello TRIM confrontandosi col Theta-Meter.
 *
 * Qui NON stanno più: la configurazione degli elettrodi, il punto dal meter di riferimento e
 * le due prove di inizio seduta. Le prime due sono regolazioni, e vivono nel TRIM accanto a
 * quella dell'ago; le prove stanno nella schermata di prontezza, dove si guarda il quadrante.
 */

/** I valori INCISI sull'artefatto — solo i valori di partenza dei campi.
 *  Il TA che il Theta-Meter MOSTRA premendo un pulsante può non coincidere: il suo programma
 *  applica correzioni sue. Ancorare la scala ai nominali invece che ai valori letti produce un
 *  errore che VARIA lungo la scala e ne inverte pure il segno — misurato: +0,40 in una zona e
 *  −0,67 in un'altra. Quindi i campi sono MODIFICABILI: si scrive ciò che mostra il meter. */
const VALORI_TA = [2, 3, 4, 5];

export interface ThetaTaCalibrationProps {
  /** La lettura in questo istante — si registra quando l'utente conferma un punto. */
  captureRaw: () => number;
  applyTaPoints: (points: ThetaTaPoint[], now: number) => boolean;
  clearTaCalibration: () => void;
  taScale: ThetaTaScale | null;
  connected: boolean;
  /** Che dispositivo si è agganciato (nome · VID:PID). */
  info?: string | null;
  /** Letture valide e scartate: « collegato » e « riceve » sono due cose diverse. */
  counters?: { ok: number; rejected: number };
  onConnect?: () => void;
  /** Il TA istantaneo con la taratura salvata. */
  taNow: number | null;
  /** La lettura grezza lisciata in questo istante. */
  rawNow: number;
  onClose: () => void;
}

export function ThetaTaCalibration({
  captureRaw, applyTaPoints, clearTaCalibration, taScale, connected, info, counters,
  onConnect, taNow, rawNow, onClose,
}: ThetaTaCalibrationProps) {
  const { t } = useI18n();
  const [punti, setPunti] = useState<Record<number, number>>({});
  const [taReali, setTaReali] = useState<Record<number, string>>(
    Object.fromEntries(VALORI_TA.map(v => [v, String(v)])));
  const [errore, setErrore] = useState<string | null>(null);

  const registra = (ta: number) => {
    const raw = captureRaw();
    if (!raw) { setErrore(t('theta_cal_no_signal') as string); return; }
    setErrore(null);
    setPunti(p => ({ ...p, [ta]: raw }));
  };

  // Si usa il TA EFFETTIVO digitato, non quello inciso sul pulsante.
  const elenco: ThetaTaPoint[] = Object.entries(punti)
    .map(([k, raw]) => ({ ta: parseFloat(taReali[Number(k)] ?? k), raw }))
    .filter(p => Number.isFinite(p.ta));
  // Si costruisce la scala SUBITO, per mostrare l'effetto prima di salvare.
  const anteprima = elenco.length >= 2 ? buildTaScale(elenco, 0) : null;
  const scarto = anteprima ? linearitaResidua(anteprima) : 0;
  const vivo = anteprima ? taFromRaw(rawNow, anteprima) : taNow;

  const salva = () => {
    if (!applyTaPoints(elenco, Date.now())) {
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
                 boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
                 maxHeight: '90vh', overflowY: 'auto' }}>

        <div style={{ ...eti, color: '#f59e0b', marginBottom: 4 }}>{t('theta_tester') as string}</div>
        <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, lineHeight: 1.5,
                      color: 'rgba(226,238,255,0.72)', marginBottom: 14 }}>
          {t('theta_cal_intro') as string}
        </div>

        {!connected ? (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: '#f87171', marginBottom: 8 }}>
              {t('theta_cal_not_connected') as string}
            </div>
            {onConnect && (
              <button type="button" onClick={onConnect}
                style={{ fontFamily: 'var(--font-sans)', fontSize: 10, fontWeight: 700,
                         letterSpacing: '0.08em', textTransform: 'uppercase',
                         padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
                         background: 'rgba(245,158,11,0.18)', border: '1px solid rgba(245,158,11,0.6)',
                         color: '#f59e0b' }}>
                {t('theta_connect') as string}
              </button>
            )}
          </div>
        ) : (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(226,238,255,0.45)' }}>
              {info || (t('theta_no_name') as string)}
            </div>
            {/* « Collegato » e « riceve » sono due cose diverse: senza questo numero un
                « non funziona » su una macchina altrui non è diagnosticabile. */}
            <div style={{ fontFamily: 'monospace', fontSize: 11, marginTop: 3,
                          color: (counters?.ok ?? 0) > 0 ? '#34d399' : '#f87171' }}>
              {(counters?.ok ?? 0) > 0
                ? `${counters!.ok} ✓${counters!.rejected ? ` · ${counters!.rejected} ✕` : ''}`
                : (t('theta_no_reading') as string)}
            </div>
          </div>
        )}

        {/* Una riga per pulsante dell'artefatto. Il campo ambra è il TA che mostra il METER,
            non quello inciso: è quello che conta. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {VALORI_TA.map(ta => (
            <div key={ta} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontFamily: 'monospace', fontSize: 13, color: 'rgba(226,238,255,0.45)', width: 22 }}>{ta}</span>
              <input value={taReali[ta] ?? ''} onChange={e => setTaReali(p => ({ ...p, [ta]: e.target.value }))}
                inputMode="decimal"
                style={{ width: 54, height: 24, borderRadius: 5, padding: '0 6px',
                         fontFamily: 'monospace', fontSize: 12, textAlign: 'right',
                         background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(245,158,11,0.4)',
                         color: '#f59e0b', outline: 'none' }} />
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

        {/* VERIFICA DAL VIVO — usa i punti appena registrati (anteprima) appena ce ne sono due:
            serve MENTRE si tara, non solo dopo. */}
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
          <div style={{ marginTop: 12, fontFamily: 'var(--font-sans)', fontSize: 10,
                        color: scarto > 0.05 ? '#fbbf24' : 'rgba(226,238,255,0.5)' }}>
            {(t('theta_cal_linearity') as string).replace('{v}', scarto.toFixed(3))}
          </div>
        )}

        <div style={{ marginTop: 12, fontFamily: 'var(--font-sans)', fontSize: 9,
                      color: isFactoryScale(taScale) ? 'rgba(226,238,255,0.45)' : '#34d399' }}>
          {(isFactoryScale(taScale) ? t('theta_scale_factory') : t('theta_scale_own')) as string}
          {taScale ? ` · ${taScale.points.length} pt` : ''}
        </div>

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

        {!isFactoryScale(taScale) && (
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
