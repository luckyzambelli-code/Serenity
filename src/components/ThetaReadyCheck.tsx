import React from 'react';
import { useI18n } from '../i18n';
import { SQUEEZE_TARGET_OFFSET, BREATH_MIN_OFFSET } from '../engine/thetaSetup';
import { LAYER } from "../ui/layers";

/**
 * ThetaReadyCheck — « PRONTO PER LA SEDUTA » quando si audita con le sole BOÎTES.
 *
 * Sorella di MetabolicCheck, non un suo modo: quella è costruita attorno alla timeline del
 * respiro guidato del Muse (baseline, inspira/espira, valutazione metabolica dall'EEG). Qui
 * non c'è EEG, e le due prove sono quelle del meter — infilarle in quella timeline avrebbe
 * significato attraversarla di condizioni per due percorsi che non hanno nulla in comune.
 *
 * ── LE DUE PROVE, nell'ordine della procedura ──────────────────────────────────────────────
 *   1. STRETTA — stringendo le boîtes l'ago deve cadere di UN TERZO di quadrante. È questa che
 *      fissa la sensibilità: senza, tutto il resto si legge su una scala sbagliata.
 *   2. RESPIRO — poi, respirando a fondo e RILASCIANDO, si deve ottenere almeno una **FALL**.
 *      Non un accenno: una fall vera. Se non arriva, **il metabolismo del preclear non è a
 *      posto** ed è inutile cominciare — è precisamente ciò che questa schermata accerta.
 *
 * Si può procedere lo stesso: la decisione resta dell'auditor, che magari sa perché quel
 * preclear oggi non reagisce. Ma glielo si dice, invece di lasciarlo partire alla cieca.
 *
 * ── PERCHÉ A COLONNA E NON A TUTTO SCHERMO ─────────────────────────────────────────────────
 * Le due prove si giudicano GUARDANDO L'AGO: « un terzo di quadrante » e « almeno una fall »
 * sono ampiezze sul quadrante vero, con la sua scala. Un velo a tutto schermo lo copriva, e il
 * test diventava impossibile — segnalato in seduta. Sta quindi in una colonna a sinistra, senza
 * oscurare il resto: il quadrante resta scoperto e a grandezza piena.
 */

export interface ThetaReadyCheckProps {
  /** Sensibilità già misurata in QUESTA seduta (la stretta è stata fatta). */
  scaleMeasured: boolean;
  /** Esito dell'ultimo respiro: null = non fatto, false = sotto la fall. */
  breathOk: boolean | null;
  /** Esito dell'ultima stretta: la caduta corrisponde al terzo di quadrante? */
  squeezeOk: boolean | null;
  /** Quale prova è in corso. */
  testing: null | 'squeeze' | 'breath';
  /** Deviazione di picco della prova in corso, in unità di quadrante — si vede salire. */
  peakOffset: number;
  startSqueezeTest: () => void;
  startBreathTest: () => void;
  /** La MANOPOLA della sensibilità, −10..+10. Sta qui perché è QUI che serve: la stretta esiste
   *  proprio per tarare l'ago, e se non dà un terzo di quadrante si corregge sul posto invece di
   *  dover chiudere, aprire un altro pannello e tornare. */
  sensTrim: number;
  setSensTrim: (v: number) => void;
  /** Come sono tenute le boîtes. Va scelto PRIMA delle prove: la geometria degli elettrodi
   *  cambia la resistenza, quindi la sensibilità misurata con due boîtes non vale per una
   *  boîte sola — si tarerebbe su una configurazione e si auditerebbe su un'altra. */
  config: 'two-cans' | 'solo-can';
  setConfig: (c: 'two-cans' | 'solo-can') => void;
  /** L'apparecchio trasmette ma non è del modello che sappiamo leggere. */
  unknownFormat?: boolean;
  /** I suoi report grezzi, da copiare e mandare per farne scrivere la decodifica. */
  rawSamples?: string[];
  onProceed: () => void;
  onCancel: () => void;
}

export function ThetaReadyCheck({
  scaleMeasured, breathOk, squeezeOk, testing, peakOffset,
  startSqueezeTest, startBreathTest, sensTrim, setSensTrim, config, setConfig, onProceed, onCancel,
  unknownFormat = false, rawSamples = [],
}: ThetaReadyCheckProps) {
  const { t } = useI18n();

  const prove = [
    {
      k: 'squeeze' as const,
      titolo: t('theta_squeeze') as string,
      spiega: t('theta_squeeze_hint') as string,
      soglia: SQUEEZE_TARGET_OFFSET,
      fatto: scaleMeasured && squeezeOk !== false,
      fallito: squeezeOk === false,
      start: startSqueezeTest,
      // Il respiro non si può giudicare finché la sensibilità non è fissata: si leggerebbe
      // un'ampiezza su una scala che non è ancora quella giusta.
      pronto: true,
    },
    {
      k: 'breath' as const,
      titolo: t('theta_breath') as string,
      spiega: t('theta_breath_hint') as string,
      soglia: BREATH_MIN_OFFSET,
      fatto: breathOk === true,
      fallito: breathOk === false,
      start: startBreathTest,
      pronto: scaleMeasured,
    },
  ];

  const tuttoFatto = scaleMeasured && breathOk === true;

  return (
    <div style={{ position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: LAYER.session,
                  width: 'min(420px, 34vw)', overflowY: 'auto',
                  // NIENTE velo sul resto: il quadrante deve restare visibile e leggibile.
                  background: 'linear-gradient(100deg, rgba(2,6,23,0.97) 0%, rgba(2,6,23,0.93) 100%)',
                  backdropFilter: 'blur(10px)',
                  borderRight: '1px solid rgba(245,158,11,0.3)',
                  boxShadow: '18px 0 50px rgba(0,0,0,0.5)',
                  padding: '24px 22px',
                  display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        <div>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '0.2em',
                        textTransform: 'uppercase', color: '#f59e0b', marginBottom: 6 }}>
            {t('theta_cans') as string}
          </div>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 19, fontWeight: 700,
                        letterSpacing: '0.04em', color: 'rgba(240,246,255,0.95)' }}>
            {t('ready_for_session') as string}
          </div>
          {/* Si dice esplicitamente dove guardare: il giudizio si fa sull'ago, non qui. */}
          <div style={{ marginTop: 6, fontFamily: 'var(--font-sans)', fontSize: 11, lineHeight: 1.5,
                        color: '#f59e0b' }}>
            {t('theta_watch_needle') as string}
          </div>
        </div>

        {/* ── MODELLO SCONOSCIUTO ────────────────────────────────────────────────────────
            Esistono più modelli di Theta-Meter, e il formato dei dati non è lo stesso su tutti.
            Se l'apparecchio trasmette e non capiamo niente, lo si DICE — insieme ai byte veri,
            pronti da copiare: è con quelli che si scrive la decodifica di QUEL modello. Senza
            questo riquadro, chi ha un altro modello vede solo un ago immobile e non sa perché. */}
        {unknownFormat && (
          <div style={{ border: '1px solid rgba(248,113,113,0.5)', borderRadius: 10,
                        background: 'rgba(127,29,29,0.22)', padding: '12px 14px' }}>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700,
                          color: '#fca5a5', marginBottom: 6 }}>
              {t('theta_unknown_model') as string}
            </div>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, lineHeight: 1.5,
                          color: 'rgba(240,246,255,0.8)', marginBottom: 8 }}>
              {t('theta_unknown_model_hint') as string}
            </div>
            <pre style={{ margin: 0, maxHeight: 96, overflow: 'auto', fontSize: 10,
                          fontFamily: 'ui-monospace, monospace', color: 'rgba(240,246,255,0.7)',
                          background: 'rgba(0,0,0,0.35)', borderRadius: 6, padding: '6px 8px' }}>
              {rawSamples.join('\n') || '—'}
            </pre>
            <button type="button"
              onClick={() => { try { navigator.clipboard.writeText(rawSamples.join('\n')); } catch (_) { /* niente appunti: restano leggibili sopra */ } }}
              style={{ marginTop: 8, width: '100%', height: 30, borderRadius: 8, cursor: 'pointer',
                       border: '1px solid rgba(248,113,113,0.5)', background: 'rgba(248,113,113,0.12)',
                       color: '#fca5a5', fontFamily: 'var(--font-sans)', fontSize: 11 }}>
              {t('theta_copy_raw') as string}
            </button>
          </div>
        )}

        {/* PRIMA di tutto: come sono tenute. La sensibilità misurata con due boîtes non vale
            per una boîte sola, quindi sceglierlo dopo le prove significherebbe tararsi su una
            configurazione e auditare su un'altra. */}
        <div>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 9, letterSpacing: '0.14em',
                        textTransform: 'uppercase', color: 'rgba(226,238,255,0.45)', marginBottom: 6 }}>
            {t('theta_how_held') as string}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['two-cans', 'solo-can'] as const).map(c => (
              <button key={c} type="button" onClick={() => setConfig(c)}
                style={{ flex: 1, height: 36, borderRadius: 9, cursor: 'pointer',
                         fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 600,
                         letterSpacing: '0.05em',
                         background: config === c ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.05)',
                         border: `1px solid ${config === c ? 'rgba(245,158,11,0.65)' : 'rgba(255,255,255,0.16)'}`,
                         color: config === c ? '#f59e0b' : 'rgba(226,238,255,0.65)' }}>
                {t(c === 'two-cans' ? 'theta_two_cans' : 'theta_solo_can') as string}
              </button>
            ))}
          </div>
        </div>

        {prove.map(p => (
          <div key={p.k}
            style={{ padding: '14px 16px', borderRadius: 12,
                     background: 'rgba(255,255,255,0.04)',
                     border: `1px solid ${p.fatto ? 'rgba(52,211,153,0.5)'
                                        : p.fallito ? 'rgba(248,113,113,0.5)'
                                        : 'rgba(255,255,255,0.12)'}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontFamily: 'monospace', fontSize: 18, width: 22,
                             color: p.fatto ? '#34d399' : p.fallito ? '#f87171' : 'rgba(226,238,255,0.35)' }}>
                {p.fatto ? '✓' : p.fallito ? '✕' : '·'}
              </span>
              <span style={{ flex: 1, fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 600,
                             color: 'rgba(240,246,255,0.92)' }}>
                {p.titolo}
              </span>
              <button type="button" onClick={p.start} disabled={testing !== null || !p.pronto}
                style={{ fontFamily: 'var(--font-sans)', fontSize: 10, fontWeight: 700,
                         letterSpacing: '0.08em', textTransform: 'uppercase',
                         padding: '7px 14px', borderRadius: 8,
                         cursor: testing === null && p.pronto ? 'pointer' : 'default',
                         opacity: p.pronto ? 1 : 0.35,
                         // Una volta riuscita, « rifai » va in GRIGIO: in arancione sembrava un
                         // avviso, e contraddiceva il segno di spunta verde a sinistra —
                         // segnalato in seduta come fonte di errori di lettura.
                         background: testing === p.k ? 'rgba(52,211,153,0.2)'
                                   : p.fatto ? 'rgba(255,255,255,0.06)' : 'rgba(245,158,11,0.16)',
                         border: `1px solid ${testing === p.k ? 'rgba(52,211,153,0.6)'
                                   : p.fatto ? 'rgba(255,255,255,0.2)' : 'rgba(245,158,11,0.5)'}`,
                         color: testing === p.k ? '#34d399'
                              : p.fatto ? 'rgba(226,238,255,0.6)' : '#f59e0b' }}>
                {testing === p.k ? (t('theta_test_running') as string)
                  : p.fatto ? (t('theta_cal_again') as string)
                  : (t('theta_cal_record') as string)}
              </button>
            </div>

            {/* VERDETTO esplicito: « corrisponde » o « non corrisponde ». Il segno di spunta
                da solo non bastava a dirlo, e il colore del bottone diceva il contrario. */}
            {testing !== p.k && (p.fatto || p.fallito) && (
              <div style={{ marginTop: 6, fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700,
                            letterSpacing: '0.06em', color: p.fatto ? '#34d399' : '#f87171' }}>
                {(p.fatto ? t('theta_matches') : t('theta_matches_not')) as string}
              </div>
            )}

            <div style={{ marginTop: 8, fontFamily: 'var(--font-sans)', fontSize: 11, lineHeight: 1.5,
                          color: 'rgba(226,238,255,0.5)' }}>
              {p.spiega}
            </div>

            {/* LA MANOPOLA, sotto la stretta: è la prova che TARA la sensibilità, quindi se la
                caduta non arriva a un terzo di quadrante si corregge qui, guardando l'ago, senza
                andare a cercarla altrove. La stretta la fissa da sola; questo è il ritocco. */}
            {p.k === 'squeeze' && (
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 9, letterSpacing: '0.12em',
                               textTransform: 'uppercase', color: 'rgba(226,238,255,0.45)' }}>
                  {t('theta_sensitivity') as string}
                </span>
                {([-1, 1] as const).map(v => (
                  <button key={v} type="button" onClick={() => setSensTrim(sensTrim + v)}
                    /* Erano 28×24 e non si vedevano: qui si regola guardando l'ago, quindi il
                       bersaglio dev'essere grande abbastanza da colpirlo senza guardarlo. */
                    style={{ width: 46, height: 38, borderRadius: 9, cursor: 'pointer',
                             fontFamily: 'monospace', fontSize: 22, fontWeight: 700, lineHeight: 1,
                             background: 'rgba(245,158,11,0.14)',
                             border: '1px solid rgba(245,158,11,0.5)', color: '#f59e0b' }}>
                    {v > 0 ? '+' : '−'}
                  </button>
                ))}
                <span style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700,
                               color: 'rgba(240,246,255,0.9)', minWidth: 30, textAlign: 'right' }}>
                  {sensTrim > 0 ? '+' : ''}{sensTrim}
                </span>
              </div>
            )}

            {/* Barra dell'ampiezza raggiunta, durante la prova: si VEDE se si sta arrivando
                alla soglia, invece di scoprirlo solo alla fine. */}
            {testing === p.k && (
              <div style={{ marginTop: 10, height: 6, borderRadius: 3, position: 'relative',
                            background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 0, width: `${Math.min(100, (peakOffset / p.soglia) * 100)}%`,
                              background: peakOffset >= p.soglia ? '#34d399' : '#f59e0b',
                              transition: 'width 0.1s linear' }} />
              </div>
            )}
          </div>
        ))}

        {/* Il respiro senza fall NON blocca: la decisione resta dell'auditor, che magari sa
            perché quel preclear oggi non reagisce. Ma glielo si dice. */}
        {breathOk === false && (
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, lineHeight: 1.5, color: '#f87171' }}>
            {t('theta_breath_failed') as string}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12 }}>
          <button type="button" onClick={onCancel}
            style={{ flex: 1, height: 40, borderRadius: 10, cursor: 'pointer',
                     fontFamily: 'var(--font-sans)', fontSize: 11, letterSpacing: '0.1em',
                     textTransform: 'uppercase', background: 'rgba(255,255,255,0.06)',
                     border: '1px solid rgba(255,255,255,0.16)', color: 'rgba(226,238,255,0.6)' }}>
            {t('cancel') as string}
          </button>
          <button type="button" onClick={onProceed}
            style={{ flex: 2, height: 40, borderRadius: 10, cursor: 'pointer',
                     fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 700,
                     letterSpacing: '0.1em', textTransform: 'uppercase',
                     background: tuttoFatto ? 'rgba(52,211,153,0.2)' : 'rgba(255,255,255,0.06)',
                     border: `1px solid ${tuttoFatto ? 'rgba(52,211,153,0.7)' : 'rgba(255,255,255,0.22)'}`,
                     color: tuttoFatto ? '#34d399' : 'rgba(226,238,255,0.75)' }}>
            {tuttoFatto ? (t('start') as string) : (t('theta_proceed_anyway') as string)}
          </button>
        </div>
      </div>
    </div>
  );
}
