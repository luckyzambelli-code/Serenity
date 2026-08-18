/**
 * PannelloMeter — IL THETA-METER, in SERENITY.
 *
 * ── PERCHÉ MANCAVA, E PERCHÉ NON È UN PROBLEMA DEL MOTORE ───────────────────────────────────
 * Segnalato: « non vedo dove posso connettere il METER, e non vedo i test meter e muse, il TA
 * doppia lattina e solo ». Vero — mancava del tutto: `Serenity.tsx` chiamava già
 * `useThetaMeter` (fase 5, l'ago si disegna) ma nessun bottone chiamava mai `theta.connect()`,
 * `theta.startSqueezeTest()` o `theta.addPointFromReference()`. Il motore (driver WebHID,
 * modello dell'ago, taratura TA) è LO STESSO di App.tsx, mai toccato — qui c'era solo il vuoto
 * dove sarebbe dovuto stare il pulsante.
 *
 * ── COSA C'È QUI, DELIBERATAMENTE COMPATTO ──────────────────────────────────────────────────
 * Connessione, configurazione (due lattine / lattina sola), prova della stretta (fissa la
 * sensibilità), prova del respiro, e la taratura TA a due punti — le STESSE funzioni di
 * App.tsx (`hooks/useThetaMeter`), non riscritte. La guida passo-passo di
 * `ThetaTaCalibration.tsx`/`ThetaReadyCheck.tsx` resta più ricca; questo è il minimo perché il
 * meter si possa usare da qui, non la sua sostituzione.
 *
 * ⚠️ ZERO LOGICA QUI DENTRO — solo chiamate dirette alle funzioni che `useThetaMeter` espone
 * già. Se una soglia comparisse in questo file, sarebbe di nuovo la regola che vive in due
 * posti.
 *
 * @see docs/serenity-refonte.md
 */

import { useState } from 'react';
import { useI18n } from '../i18n';
import type { useThetaMeter } from '../hooks/useThetaMeter';

const pillola = (piena: boolean): React.CSSProperties => ({
  border: 'none', cursor: 'pointer', borderRadius: 999, padding: '7px 16px',
  fontFamily: 'var(--s-sans)', fontSize: 12, letterSpacing: '0.04em',
  background: piena ? 'var(--s-disc)' : 'var(--s-disc-sunk)',
  color: 'var(--s-ink)', boxShadow: piena ? 'var(--s-shadow)' : 'none',
  transition: 'background var(--s-slow) var(--s-ease), box-shadow var(--s-slow) var(--s-ease)',
});

export function PannelloMeter({ theta }: { theta: ReturnType<typeof useThetaMeter> }) {
  const { t } = useI18n();
  const [aperto, setAperto] = useState(false);
  const [riferimento, setRiferimento] = useState('2.0');

  const stato = theta.unavailable ? t('theta_uncalibrated')
    : theta.status === 'connected' ? t('ser_meter_connected')
    : theta.status === 'connecting' ? '…'
    : t('theta_connect');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          disabled={theta.unavailable}
          onClick={() => (theta.status === 'connected' ? theta.disconnect() : theta.connect())}
          style={pillola(theta.status === 'connected')}
        >
          {stato}
        </button>
        {theta.status === 'connected' && (
          <button onClick={() => setAperto(a => !a)} style={{
            border: 'none', background: 'none', cursor: 'pointer',
            fontFamily: 'var(--s-sans)', fontSize: 12, color: 'var(--s-ink-faint)',
          }}>
            {aperto ? '▴' : '▾'} {t('theta_setup')}
          </button>
        )}
      </div>

      {aperto && theta.status === 'connected' && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 12, padding: '14px 16px',
          background: 'var(--s-disc)', borderRadius: 12, boxShadow: 'var(--s-shadow)',
          maxWidth: 420,
        }}>
          {/* ── CONFIGURAZIONE — due lattine, o una sola ──────────────────────────────────── */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={() => theta.setConfig('two-cans')}
              style={pillola(theta.setup.config === 'two-cans')}>
              {t('theta_two_cans')}
            </button>
            <button onClick={() => theta.setConfig('solo-can')}
              style={pillola(theta.setup.config === 'solo-can')}>
              {t('theta_solo_can')}
            </button>
          </div>

          {/* ── LE DUE PROVE — stretta (sensibilità) e respiro ────────────────────────────── */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => theta.startSqueezeTest()} disabled={theta.testing !== null}
              style={pillola(false)} title={t('theta_squeeze_hint') as string}>
              {t('theta_squeeze')}
            </button>
            {theta.squeezeOk !== null && (
              <span style={{ fontSize: 12, color: theta.squeezeOk ? 'var(--s-still)' : 'var(--s-reserve)' }}>
                {theta.squeezeOk ? '✓' : '⚠'}
              </span>
            )}
            <button onClick={() => theta.startBreathTest()} disabled={theta.testing !== null}
              style={pillola(false)} title={t('theta_breath_hint') as string}>
              {t('theta_breath')}
            </button>
            {theta.breathOk !== null && (
              <span style={{ fontSize: 12, color: theta.breathOk ? 'var(--s-still)' : 'var(--s-reserve)' }}>
                {theta.breathOk ? '✓' : '⚠'}
              </span>
            )}
            {theta.testing && (
              <span style={{ fontSize: 12, color: 'var(--s-alive)' }}>{t('theta_test_running')}</span>
            )}
          </div>

          {/* ── TARATURA TA — un punto per volta, con l'artefatto o col programma Theta-Meter.
              Stesso metodo di App.tsx (`addPointFromReference`): si impugna il riferimento a un
              TA noto, si lascia stabilizzare la lettura, si registra il punto. Due punti a
              livelli diversi bastano. */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--s-ink-faint)' }}>{t('theta_ref_label')}</span>
            <span style={{ fontFamily: 'var(--s-mono)', fontSize: 13 }}>{theta.rawSmooth.toFixed(0)}</span>
            <input
              type="number" step="0.1" value={riferimento}
              onChange={e => setRiferimento(e.target.value)}
              style={{
                width: 56, border: 'none', borderBottom: '1px solid var(--s-ink-ghost)',
                background: 'none', outline: 'none', fontFamily: 'var(--s-mono)', fontSize: 13,
                color: 'var(--s-ink)', padding: '2px 4px',
              }}
            />
            <button onClick={() => {
              const v = parseFloat(riferimento);
              if (Number.isFinite(v)) theta.addPointFromReference(v);
            }} style={pillola(false)}>
              {t('theta_cal_record')}
            </button>
            <span style={{ fontSize: 11.5, color: 'var(--s-ink-faint)' }}>
              {theta.taScale ? `${theta.taScale.points.length} · ${theta.taScale.madeAt === 0 ? t('theta_scale_factory') : t('theta_scale_own')}` : ''}
            </span>
            {theta.taScale && theta.taScale.madeAt !== 0 && (
              <button onClick={() => theta.clearTaCalibration()} style={{
                border: 'none', background: 'none', cursor: 'pointer',
                fontFamily: 'var(--s-sans)', fontSize: 11.5, color: 'var(--s-ink-faint)',
              }}>
                {t('theta_cal_clear')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
