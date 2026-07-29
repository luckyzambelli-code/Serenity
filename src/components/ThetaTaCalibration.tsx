import React, { useState } from 'react';
import { useI18n } from '../i18n';
import { linearitaResidua, buildTaScale, taFromRaw, type ThetaTaPoint, type ThetaTaScale } from '../engine/thetaTaScale';
import { SQUEEZE_TARGET_OFFSET, type ElectrodeConfig, type ThetaSetup } from '../engine/thetaSetup';

/**
 * ThetaTaCalibration — taratura del TONE ARM con l'ARTEFATTO FISICO del Theta-Meter.
 *
 * Il programma Theta-Meter può restare APERTO: i due leggono il dispositivo insieme, ed è anzi
 * il modo migliore di verificare — quadranti affiancati.
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

/** I valori INCISI sull'artefatto — solo i valori di partenza dei campi.
 *  Il TA che il Theta-Meter MOSTRA premendo un pulsante può non coincidere: il suo programma
 *  applica correzioni sue (nelle preferenze ci sono correction/booster/gain). Ancorare la
 *  scala ai valori nominali invece che a quelli letti produce un errore che VARIA lungo la
 *  scala — misurato in seduta: +0,40 in una zona e −0,67 in un'altra, segno ribaltato.
 *  Quindi i valori sono MODIFICABILI: si scrive quello che mostra il meter vero. */
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
  /** Che dispositivo si è agganciato (nome · VID:PID), per capire cosa sta succedendo. */
  info?: string | null;
  /** Per collegarlo direttamente da qui, senza dover chiudere e cercare il badge. */
  onConnect?: () => void;
  /** Il TA della lettura ISTANTANEA con la taratura SALVATA. `null` se non ancora tarato. */
  taNow: number | null;
  /** La lettura grezza in questo istante — serve a verificare con la scala in ANTEPRIMA,
   *  cioè con i punti appena registrati, prima ancora di salvare. */
  rawNow: number;
  /** Assetto: configurazione elettrodi + sensibilità. */
  setup: ThetaSetup;
  setConfig: (c: ElectrodeConfig) => void;
  addPointFromReference: (taRiferimento: number) => void;
  startSqueezeTest: () => void;
  startBreathTest: () => void;
  testing: null | 'squeeze' | 'breath';
  testPeak: number;
  breathOk: boolean | null;
  onClose: () => void;
}

export function ThetaTaCalibration({
  captureRaw, applyTaPoints, clearTaCalibration, taScale, connected, info, onConnect, taNow, rawNow,
  setup, setConfig, addPointFromReference, startSqueezeTest, startBreathTest, testing, testPeak, breathOk, onClose,
}: ThetaTaCalibrationProps) {
  const { t } = useI18n();
  const [punti, setPunti] = useState<Record<number, number>>({});
  /** Il TA effettivo di ciascun pulsante, come lo mostra il Theta-Meter. Parte dal valore
   *  inciso e si corregge se il meter vero dice altro. */
  const [taReali, setTaReali] = useState<Record<number, string>>(
    Object.fromEntries(VALORI_TA.map(v => [v, String(v)])));
  /** Il TA che legge il Theta-Meter in questo momento, digitato dall'utente. */
  const [rif, setRif] = useState('');
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
                 boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
                 // Il pannello è cresciuto sezione dopo sezione e senza questo la parte bassa
                 // finiva FUORI dallo schermo, irraggiungibile: « non vedo aggiungi punto ».
                 maxHeight: '90vh', overflowY: 'auto' }}>

        <div style={{ ...eti, color: '#f59e0b', marginBottom: 4 }}>{t('theta_cal_title') as string}</div>
        <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, lineHeight: 1.5,
                      color: 'rgba(226,238,255,0.72)', marginBottom: 16 }}>
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
          // Che cosa si è agganciato davvero. Su una macchina altrui è l'unico modo di sapere
          // se il dispositivo trovato è il meter o qualcos'altro.
          <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(226,238,255,0.45)', marginBottom: 12 }}>
            {info || '—'}
          </div>
        )}

        {/* Una riga per valore inciso sull'artefatto. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {VALORI_TA.map(ta => (
            <div key={ta} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontFamily: 'monospace', fontSize: 13, color: 'rgba(226,238,255,0.45)', width: 22 }}>{ta}</span>
              {/* Il TA che mostra il METER VERO premendo questo pulsante. Modificabile: se il
                  suo display non dice esattamente il valore inciso, è QUELLO che conta. */}
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

        {/* ── ASSETTO ─────────────────────────────────────────────────────────────────────
            La scala del TA sopra si tara UNA VOLTA e vale per chiunque. Qui invece c'è ciò che
            dipende da COME si audita, e va rifatto se cambia la disposizione degli elettrodi. */}
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.10)' }}>
          <div style={{ ...eti, marginBottom: 4 }}>{t('theta_setup') as string}</div>
          {/* La sensibilità NON è acquisita una volta per tutte: dipende da come QUEL preclear
              tiene le lattine. Va detto, o si crederebbe che una volta fatta valga sempre. */}
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 10, lineHeight: 1.5, marginBottom: 10,
                        color: setup.scaleMeasured ? 'rgba(226,238,255,0.5)' : '#fbbf24' }}>
            {setup.scaleMeasured
              ? (t('theta_setup_done') as string)
              : (t('theta_setup_todo') as string)}
          </div>

          {/* Due lattine (una per mano) oppure, in SOLO AUDITING, una lattina sola fatta di
              due mezze lattine. La geometria cambia la resistenza, quindi il TA letto. */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            {(['two-cans', 'solo-can'] as ElectrodeConfig[]).map(c => (
              <button key={c} type="button" onClick={() => setConfig(c)}
                style={{ flex: 1, height: 30, borderRadius: 8, cursor: 'pointer',
                         fontFamily: 'var(--font-sans)', fontSize: 10, fontWeight: 600,
                         letterSpacing: '0.06em', textTransform: 'uppercase',
                         background: setup.config === c ? 'rgba(245,158,11,0.18)' : 'rgba(255,255,255,0.05)',
                         border: `1px solid ${setup.config === c ? 'rgba(245,158,11,0.55)' : 'rgba(255,255,255,0.16)'}`,
                         color: setup.config === c ? '#f59e0b' : 'rgba(226,238,255,0.6)' }}>
                {t(c === 'two-cans' ? 'theta_two_cans' : 'theta_solo_can') as string}
              </button>
            ))}
          </div>

          {/* CORREZIONE contro il meter vero. I due programmi leggono il dispositivo NELLO STESSO
              momento, quindi si guardano i quadranti affiancati e si scrive qui il valore che
              legge il Theta-Meter: la correzione si ricava da sola, per questa configurazione. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ ...eti, whiteSpace: 'nowrap' }}>{t('theta_ref_label') as string}</span>
            <input value={rif} onChange={e => setRif(e.target.value)} placeholder="5.796"
              inputMode="decimal"
              style={{ width: 70, height: 26, borderRadius: 6, padding: '0 8px',
                       fontFamily: 'monospace', fontSize: 12, textAlign: 'right',
                       background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.2)',
                       color: 'rgba(240,246,255,0.92)', outline: 'none' }} />
            <button type="button"
              disabled={!connected || taNow === null || !Number.isFinite(parseFloat(rif))}
              onClick={() => { addPointFromReference(parseFloat(rif)); setRif(''); }}
              style={{ height: 26, padding: '0 10px', borderRadius: 6,
                       cursor: 'pointer', opacity: connected && taNow !== null && Number.isFinite(parseFloat(rif)) ? 1 : 0.4,
                       fontFamily: 'var(--font-sans)', fontSize: 9, letterSpacing: '0.06em',
                       textTransform: 'uppercase', background: 'rgba(255,255,255,0.05)',
                       border: '1px solid rgba(255,255,255,0.18)', color: 'rgba(226,238,255,0.75)' }}>
              {t('theta_ref_apply') as string}
            </button>
            <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(226,238,255,0.55)', minWidth: 52, textAlign: 'right' }}>
              {taScale ? `${taScale.points.length} pt` : '—'}
            </span>
          </div>
          <div style={{ marginTop: -4, marginBottom: 10, fontFamily: 'var(--font-sans)', fontSize: 9,
                        lineHeight: 1.5, color: 'rgba(226,238,255,0.45)' }}>
            {t('theta_ref_hint') as string}
          </div>

          {/* LE DUE PROVE, in sequenza. La STRETTA fissa la sensibilità (un terzo di quadrante,
              come la manopola del Theta-Meter); il RESPIRO la VERIFICA — l'ago deve cadere
              almeno un minimo. Sono cose distinte: la seconda non ritocca la sensibilità. */}
          {([
            { k: 'squeeze' as const, start: startSqueezeTest, lbl: 'theta_squeeze' as const, hint: 'theta_squeeze_hint' as const },
            { k: 'breath' as const,  start: startBreathTest,  lbl: 'theta_breath' as const,  hint: 'theta_breath_hint' as const },
          ]).map(pr => (
            <div key={pr.k} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button type="button" disabled={!connected || testing !== null} onClick={pr.start}
                  style={{ flex: 1, height: 28, borderRadius: 7,
                           cursor: connected && testing === null ? 'pointer' : 'default',
                           opacity: connected ? 1 : 0.4,
                           fontFamily: 'var(--font-sans)', fontSize: 9, fontWeight: 600,
                           letterSpacing: '0.06em', textTransform: 'uppercase',
                           background: testing === pr.k ? 'rgba(52,211,153,0.2)' : 'rgba(255,255,255,0.05)',
                           border: `1px solid ${testing === pr.k ? 'rgba(52,211,153,0.6)' : 'rgba(255,255,255,0.18)'}`,
                           color: testing === pr.k ? '#34d399' : 'rgba(226,238,255,0.75)' }}>
                  {testing === pr.k ? (t('theta_test_running') as string) : (t(pr.lbl) as string)}
                </button>
                <span style={{ fontFamily: 'monospace', fontSize: 11, minWidth: 60, textAlign: 'right',
                               color: pr.k === 'breath' && breathOk === false ? '#f87171' : 'rgba(226,238,255,0.55)' }}>
                  {pr.k === 'squeeze'
                    ? (setup.needleScale ? (SQUEEZE_TARGET_OFFSET / setup.needleScale / 1000).toFixed(0) + 'k' : '—')
                    : (breathOk === null ? '—' : breathOk ? '✓' : '✗')}
                </span>
              </div>
              <div style={{ marginTop: 4, fontFamily: 'var(--font-sans)', fontSize: 9, lineHeight: 1.5,
                            color: 'rgba(226,238,255,0.45)' }}>
                {t(pr.hint) as string}
              </div>
            </div>
          ))}
                    {testing !== null && (
            <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#34d399' }}>
              {Math.round(testPeak).toLocaleString('it')}
            </div>
          )}
        </div>

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
