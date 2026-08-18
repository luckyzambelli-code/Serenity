/**
 * PannelloMeter — LA CONFIGURAZIONE DEL THETA-METER, in SERENITY.
 *
 * ── PERCHÉ MANCAVA, E PERCHÉ NON È UN PROBLEMA DEL MOTORE ───────────────────────────────────
 * Segnalato: « non vedo dove posso connettere il METER, e non vedo i test meter e muse, il TA
 * doppia lattina e solo ». Vero — mancava del tutto: `Serenity.tsx` chiamava già
 * `useThetaMeter` (fase 5, l'ago si disegna) ma nessun bottone chiamava mai `theta.connect()`,
 * `theta.startSqueezeTest()` o `theta.addPointFromReference()`. Il motore (driver WebHID,
 * modello dell'ago, taratura TA) è LO STESSO di App.tsx, mai toccato — qui c'era solo il vuoto
 * dove sarebbe dovuto stare il pulsante.
 *
 * ── SEGNALATO DI NUOVO: « comment peux-tu mettre la connexion METER EN BAS, le MUSE en
 * haut... il faut que SERENITY soit un CHEMIN DE FACILITÉ et de COMPRÉHENSION » ─────────────
 * Aveva ragione: la prima versione di questo pannello portava con sé un SECONDO bottone di
 * connessione (« Collega il meter », con lo stesso testo di quello vero) piantato in fondo alla
 * pagina — mentre MUSE si connette da UN punto solo, in intestazione. Due strumenti, due
 * abitudini diverse da imparare: esattamente il contrario di un cammino facile.
 *
 * La connessione ORA vive SOLO nell'indicatore d'intestazione di `Serenity.tsx` (identico a
 * quello del MUSE, stesso componente `IndicatoreConnessione`) — questo file non se ne occupa
 * più. Resta SOLO la configurazione (due lattine/lattina sola, le due prove, la taratura TA): un
 * pannello ANCORATO SOTTO quello stesso indicatore, aperto da una freccia lì accanto — non un
 * secondo posto lontano da imparare, un'ESPANSIONE dello stesso posto.
 *
 * ⚠️ ZERO LOGICA QUI DENTRO — solo chiamate dirette alle funzioni che `useThetaMeter` espone
 * già. Se una soglia comparisse in questo file, sarebbe di nuovo la regola che vive in due
 * posti.
 *
 * @see docs/serenity-refonte.md
 */

import { useState } from 'react';
import { useI18n } from '../i18n';
import { pick5 } from '../i18n5';
import { compareReady, soloTaOffset } from '../engine/canTest';
import type { useThetaMeter } from '../hooks/useThetaMeter';

const pillola = (piena: boolean): React.CSSProperties => ({
  border: 'none', cursor: 'pointer', borderRadius: 999, padding: '7px 16px',
  fontFamily: 'var(--s-sans)', fontSize: 12, letterSpacing: '0.04em',
  background: piena ? 'var(--s-disc)' : 'var(--s-disc-sunk)',
  color: 'var(--s-ink)', boxShadow: piena ? 'var(--s-shadow)' : 'none',
  transition: 'background var(--s-slow) var(--s-ease), box-shadow var(--s-slow) var(--s-ease)',
});

/** Chi monta questo pannello (`Serenity.tsx`) lo fa SOLO a meter connesso — niente stato di
 *  "non connesso" da disegnare qui dentro: quella parola la dice già l'indicatore sopra. */
export function PannelloMeter({ theta, provaTa }: {
  theta: ReturnType<typeof useThetaMeter>;
  /** I due TA della prova doppia (uno per configurazione) — vive in `Serenity.tsx`, non qui:
   *  è la stessa seduta a doverli azzerare quando cambia persona, non questo pannello. */
  provaTa: { two: number | null; solo: number | null };
}) {
  const { t, lang } = useI18n();
  const [riferimento, setRiferimento] = useState('2.0');
  const LC = (it: string, fr: string, en: string, es: string, sv: string) => pick5(lang as string, it, fr, en, es, sv);

  const scarto = soloTaOffset({ taTwo: provaTa.two, taSolo: provaTa.solo });
  const scartoMisurato = (theta.setup.offsets?.['solo-can'] ?? 0) !== 0;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 12, padding: '14px 16px',
      background: 'var(--s-disc)', borderRadius: 12, boxShadow: 'var(--s-shadow-lift)',
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

      {/* ── « LATTINA SOLA » SENZA LO SCARTO — segnalato: « le réglage est incompréhensible,
          fonctionne seulement les deux boîtes ». Non era rotto: mancava il modo di misurare la
          correzione che questa scelta richiede. Stesso avviso di `ThetaReadyCheck.tsx`
          (App.tsx): senza la prova a due lattine come riferimento, il TA in solo resta
          sistematicamente spostato — sembra un guasto, è solo un dato mancante. */}
      {theta.setup.config === 'solo-can' && !scartoMisurato && (
        <div style={{
          padding: '10px 12px', borderRadius: 10, background: 'var(--s-disc-sunk)',
          border: '1px solid var(--s-reserve)',
        }}>
          <div style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--s-reserve)' }}>
            {LC(
              'per misurare il TA come si deve, fai la stretta con DUE lattine — è il riferimento. Poi torna a una sola e ripeti: la differenza fra le due letture corregge tutta la seduta.',
              'pour mesurer le TA correctement, fais la pression avec DEUX boîtes — c\'est la référence. Reviens ensuite à une seule et répète : la différence entre les deux lectures corrige toute la séance.',
              'to measure the TA properly, do the squeeze with TWO cans — that is the reference. Then go back to one and repeat: the difference between the two readings corrects the whole session.',
              'para medir el TA correctamente, haz la presión con DOS latas — es la referencia. Luego vuelve a una sola y repite: la diferencia entre las dos lecturas corrige toda la sesión.',
              'för att mäta TA korrekt, gör trycket med TVÅ burkar — det är referensen. Gå sedan tillbaka till en och upprepa: skillnaden mellan de två avläsningarna korrigerar hela sessionen.',
            )}
          </div>
          <button onClick={() => theta.setConfig('two-cans')} style={{ ...pillola(false), marginTop: 8 }}>
            {LC('passa a DUE lattine e fai la prova', 'passe à DEUX boîtes et fais le test',
              'switch to TWO cans and run the test', 'pasa a DOS latas y haz la prueba',
              'byt till TVÅ burkar och kör testet')}
          </button>
        </div>
      )}

      {/* ── IL CONFRONTO — fatte tutte e due le strette, qui si vede la differenza ──────────
          Stessa coppia di funzioni pure di App.tsx (`engine/canTest.ts`'s `compareReady`/
          `soloTaOffset`), non ricalcolata qui: la prova della stretta tara la SENSIBILITÀ
          dell'ago, ma la correzione che serve al TA è quanto QUESTO preclear legge diverso con
          una lattina invece di due — e quella non si deduce da una prova sola. */}
      {compareReady({ taTwo: provaTa.two, taSolo: provaTa.solo }) && (
        <div style={{
          padding: '10px 12px', borderRadius: 10, background: 'var(--s-disc-sunk)',
          border: `1px solid ${scarto === null ? 'var(--s-reserve)' : 'var(--s-still)'}`,
        }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'baseline', fontFamily: 'var(--s-mono)', fontSize: 13, color: 'var(--s-ink)' }}>
            <span><span style={{ fontSize: 10, opacity: 0.6 }}>2 · </span>{provaTa.two!.toFixed(2)}</span>
            <span><span style={{ fontSize: 10, opacity: 0.6 }}>1 · </span>{provaTa.solo!.toFixed(2)}</span>
            <span style={{ color: scarto === null ? 'var(--s-reserve)' : 'var(--s-still)', fontWeight: 700 }}>
              {scarto === null ? '—' : `${scarto > 0 ? '+' : ''}${scarto.toFixed(2)}`}
            </span>
          </div>
          <div style={{ fontSize: 11, lineHeight: 1.5, marginTop: 6, color: 'var(--s-ink-faint)' }}>
            {scarto === null
              ? LC('lo scarto è troppo grande per essere una configurazione — è una lettura presa male. Rifai le due prove.',
                  'l\'écart est trop grand pour être une configuration — c\'est une lecture mal prise. Refais les deux tests.',
                  'the gap is too large to be a configuration — it is a badly taken reading. Redo both tests.',
                  'la diferencia es demasiado grande para ser de configuración — es una lectura mal tomada. Rehaz las dos pruebas.',
                  'skillnaden är för stor för att vara en konfiguration — avläsningen är dåligt tagen. Gör om båda testen.')
              : LC('quanto QUESTO preclear legge diverso con una lattina. Applicandolo, il TA in solo torna alle due lattine.',
                  'de combien CE préclair lit différemment avec une seule boîte. En l\'appliquant, le TA en solo revient aux deux boîtes.',
                  'how much THIS preclear reads differently with one can. Applied, the solo TA comes back to two cans.',
                  'cuánto lee distinto ESTE preclear con una lata. Aplicándolo, el TA en solo vuelve a dos latas.',
                  'hur mycket DENNA preclear läser annorlunda med en burk. Tillämpat återförs TA i solo till två burkar.')}
          </div>
          {scarto !== null && !scartoMisurato && (
            <button onClick={() => theta.setSoloOffset(scarto)} style={{ ...pillola(false), marginTop: 8 }}>
              {LC('usa questa differenza', 'utilise cet écart', 'use this offset', 'usa esta diferencia', 'använd denna skillnad')}
            </button>
          )}
          {scartoMisurato && (
            <div style={{ marginTop: 6, fontSize: 11, fontWeight: 700, color: 'var(--s-still)' }}>
              ✓ {LC('applicata', 'appliqué', 'applied', 'aplicada', 'tillämpad')}
            </div>
          )}
        </div>
      )}

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
  );
}
