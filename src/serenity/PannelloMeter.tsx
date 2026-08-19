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
 * ── SEGNALATO UNA TERZA VOLTA: « les inscriptions sont incompréhensibles... la possibilité de
 * sortir du test des boîtes » ─────────────────────────────────────────────────────────────────
 * Due difetti distinti, corretti insieme: `theta.cancelTest()` aggiunto al motore condiviso
 * (`useThetaMeter`, mai toccato prima da SERENITY), e ogni sezione ha una spiegazione SEMPRE
 * visibile — non più solo un `title` al passaggio del mouse.
 *
 * ── SEGNALATO UNA QUARTA VOLTA: « la gestione di configurare il METER è troppo complicata.
 * Bisogna farla come all'inizio della sessione, PASSO A PASSO » ──────────────────────────────
 * Vero: quattro blocchi (configurazione, stretta, respiro, taratura) stavano tutti insieme
 * nello stesso pannello — leggibile per chi già sa cosa sta facendo, un muro per chi apre
 * questo cassetto la prima volta. Ristrutturato come `Avvio.tsx`: UN passo alla volta, un
 * "avanti"/"indietro" a fondo pagina, un punto per passo in testa. ZERO LOGICA NUOVA — le
 * stesse quattro sezioni, nello stesso ordine in cui la prova ha senso (config → stretta →
 * respiro → taratura), solo una alla volta invece che tutte insieme.
 *
 * @see docs/serenity-refonte.md
 */

import { useState } from 'react';
import { useI18n } from '../i18n';
import { pick5 } from '../i18n5';
import { compareReady, soloTaOffset } from '../engine/canTest';
import type { useThetaMeter } from '../hooks/useThetaMeter';

const pillola = (piena: boolean): React.CSSProperties => ({
  cursor: 'pointer', borderRadius: 999, padding: '8px 18px',
  fontFamily: 'var(--s-sans)', fontSize: 15, letterSpacing: '0.04em',
  background: piena ? 'var(--s-disc)' : 'var(--s-disc-sunk)',
  color: 'var(--s-ink)',
});

const PASSI = ['config', 'stretta', 'respiro', 'taratura'] as const;
type Passo = typeof PASSI[number];

/** Chi monta questo pannello (`Serenity.tsx`) lo fa SOLO a meter connesso — niente stato di
 *  "non connesso" da disegnare qui dentro: quella parola la dice già l'indicatore sopra. */
export function PannelloMeter({ theta, provaTa, onFatto }: {
  theta: ReturnType<typeof useThetaMeter>;
  /** I due TA della prova doppia (uno per configurazione) — vive in `Serenity.tsx`, non qui:
   *  è la stessa seduta a doverli azzerare quando cambia persona, non questo pannello. */
  provaTa: { two: number | null; solo: number | null };
  /** ── Segnalato: « il test des boîtes... ne disparaît pas ». Chi monta il pannello decide
   *  cosa vuol dire "fatto, chiudi" (qui: `setMeterSetupAperto(false)`) — senza questo prop il
   *  bottone dell'ultimo passo resta testo statico, come App.tsx quando manca `onProceed`. */
  onFatto?: () => void;
}) {
  const { t, lang } = useI18n();
  const [riferimento, setRiferimento] = useState('2.0');
  const [passo, setPasso] = useState<Passo>('config');
  const idx = PASSI.indexOf(passo);
  const LC = (it: string, fr: string, en: string, es: string, sv: string) => pick5(lang as string, it, fr, en, es, sv);

  const scarto = soloTaOffset({ taTwo: provaTa.two, taSolo: provaTa.solo });
  const scartoMisurato = (theta.setup.offsets?.['solo-can'] ?? 0) !== 0;

  const TITOLI: Record<Passo, string> = {
    config: LC('1 · quante lattine', '1 · combien de boîtes', '1 · how many cans', '1 · cuántas latas', '1 · hur många burkar'),
    stretta: LC('2 · la prova della stretta', '2 · le test de la pression', '2 · the squeeze test', '2 · la prueba de presión', '2 · klämtestet'),
    respiro: LC('3 · la prova del respiro', '3 · le test de la respiration', '3 · the breath test', '3 · la prueba de respiración', '3 · andningstestet'),
    taratura: LC('4 · la taratura TA', '4 · l\'étalonnage TA', '4 · TA calibration', '4 · el calibrado TA', '4 · TA-kalibrering'),
  };

  return (
    <div className="s-glass s-glass-lift" style={{
      display: 'flex', flexDirection: 'column', gap: 14, padding: '16px 18px',
      background: 'var(--s-disc)', borderRadius: 14,
      width: 380,
    }}>
      {/* ── I PUNTI DEL PERCORSO — lo stesso principio di `CycleSteps` (i passi del ciclo, sopra
          nel quadrante): si vede quanti passi ci sono e a che punto si è, senza doverlo
          ricordare a memoria. Cliccabili: si
          torna indietro anche saltando, non solo un passo alla volta. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        {PASSI.map((p, i) => (
          <button key={p} onClick={() => setPasso(p)} title={TITOLI[p]} style={{
            border: 'none', cursor: 'pointer', padding: 4, background: 'none', display: 'flex',
          }}>
            <span style={{
              width: i === idx ? 20 : 7, height: 7, borderRadius: 999,
              background: i <= idx ? 'var(--s-still)' : 'var(--s-ink-ghost)',
              transition: 'width var(--s-slow) var(--s-ease), background var(--s-slow) var(--s-ease)',
            }} />
          </button>
        ))}
      </div>

      <div style={{ fontFamily: 'var(--s-sans)', fontSize: 13, letterSpacing: '0.1em',
                    textTransform: 'uppercase', color: 'var(--s-ink-soft)', textAlign: 'center' }}>
        {TITOLI[passo]}
      </div>

      {/* ── PASSO 1 — CONFIGURAZIONE ────────────────────────────────────────────────────── */}
      {passo === 'config' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
          <div style={{ fontSize: 14.5, lineHeight: 1.5, color: 'var(--s-ink-faint)', textAlign: 'center' }}>
            {LC('quante lattine impugna il preclear in mano — cambia come l\'ago legge la resistenza.',
              'combien de boîtes le préclair tient en main — change la façon dont l\'aiguille lit la résistance.',
              'how many cans the preclear holds — changes how the needle reads the resistance.',
              'cuántas latas sostiene el preclear en la mano — cambia cómo la aguja lee la resistencia.',
              'hur många burkar preclearen håller — ändrar hur nålen läser motståndet.')}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => theta.setConfig('two-cans')}
              className="s-glass s-glass-btn" style={pillola(theta.setup.config === 'two-cans')}>
              {t('theta_two_cans')}
            </button>
            <button onClick={() => theta.setConfig('solo-can')}
              className="s-glass s-glass-btn" style={pillola(theta.setup.config === 'solo-can')}>
              {t('theta_solo_can')}
            </button>
          </div>
          {/* ── « LATTINA SOLA » SENZA LO SCARTO — segnalato: senza la prova a due lattine come
              riferimento, il TA in solo resta sistematicamente spostato — sembra un guasto, è
              solo un dato mancante (si misura al passo 4). */}
          {theta.setup.config === 'solo-can' && !scartoMisurato && (
            <div style={{
              padding: '10px 12px', borderRadius: 10, background: 'var(--s-disc-sunk)',
              border: '1px solid var(--s-reserve)', width: '100%',
            }}>
              <div style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--s-reserve)' }}>
                {LC('per misurare il TA come si deve, fai la stretta con DUE lattine al passo 2 — è il riferimento. Torna qui per passare a una sola e ripeti: al passo 4 la differenza corregge tutta la seduta.',
                  'pour mesurer le TA correctement, fais la pression avec DEUX boîtes à l\'étape 2 — c\'est la référence. Reviens ici pour passer à une seule et répète : à l\'étape 4 la différence corrige toute la séance.',
                  'to measure the TA properly, do the squeeze with TWO cans at step 2 — that is the reference. Come back here to switch to one and repeat: at step 4 the difference corrects the whole session.',
                  'para medir el TA correctamente, haz la presión con DOS latas en el paso 2 — es la referencia. Vuelve aquí para pasar a una sola y repite: en el paso 4 la diferencia corrige toda la sesión.',
                  'för att mäta TA korrekt, gör trycket med TVÅ burkar i steg 2 — det är referensen. Kom tillbaka hit för att byta till en och upprepa: i steg 4 korrigerar skillnaden hela sessionen.')}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── PASSO 2 — LA PROVA DELLA STRETTA ────────────────────────────────────────────── */}
      {passo === 'stretta' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
          <div style={{ fontSize: 14.5, lineHeight: 1.5, color: 'var(--s-ink-faint)', textAlign: 'center' }}>
            {theta.testing === 'squeeze' ? t('theta_squeeze_hint') : t('theta_squeeze_hint')}
          </div>
          <button onClick={() => theta.startSqueezeTest()} disabled={theta.testing !== null}
            className="s-glass s-glass-btn" style={pillola(true)}>
            {t('theta_squeeze')}
          </button>
          {theta.testing === 'squeeze' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="ser-pulse" style={{ fontSize: 14.5, color: 'var(--s-alive)' }}>{t('theta_test_running')}</span>
              <button className="s-glass s-glass-btn" onClick={() => theta.cancelTest()} style={{
                cursor: 'pointer', borderRadius: 999, padding: '4px 12px', background: 'var(--s-disc)',
                fontFamily: 'var(--s-sans)', fontSize: 14, color: 'var(--s-ink-faint)',
              }}>
                {LC('annulla', 'annuler', 'cancel', 'cancelar', 'avbryt')}
              </button>
            </div>
          )}
          {theta.squeezeOk !== null && theta.testing === null && (
            <span style={{ fontSize: 14.5, fontWeight: 700, color: theta.squeezeOk ? 'var(--s-still)' : 'var(--s-reserve)' }}>
              {theta.squeezeOk ? `✓ ${LC('fatta', 'faite', 'done', 'hecha', 'klart')}` : `⚠ ${LC('da rifare', 'à refaire', 'try again', 'a repetir', 'gör om')}`}
            </span>
          )}
        </div>
      )}

      {/* ── PASSO 3 — LA PROVA DEL RESPIRO ──────────────────────────────────────────────── */}
      {passo === 'respiro' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
          <div style={{ fontSize: 14.5, lineHeight: 1.5, color: 'var(--s-ink-faint)', textAlign: 'center' }}>
            {t('theta_breath_hint')}
          </div>
          <button onClick={() => theta.startBreathTest()} disabled={theta.testing !== null}
            className="s-glass s-glass-btn" style={pillola(true)}>
            {t('theta_breath')}
          </button>
          {theta.testing === 'breath' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="ser-pulse" style={{ fontSize: 14.5, color: 'var(--s-alive)' }}>{t('theta_test_running')}</span>
              <button className="s-glass s-glass-btn" onClick={() => theta.cancelTest()} style={{
                cursor: 'pointer', borderRadius: 999, padding: '4px 12px', background: 'var(--s-disc)',
                fontFamily: 'var(--s-sans)', fontSize: 14, color: 'var(--s-ink-faint)',
              }}>
                {LC('annulla', 'annuler', 'cancel', 'cancelar', 'avbryt')}
              </button>
            </div>
          )}
          {theta.breathOk !== null && theta.testing === null && (
            <span style={{ fontSize: 14.5, fontWeight: 700, color: theta.breathOk ? 'var(--s-still)' : 'var(--s-reserve)' }}>
              {theta.breathOk ? `✓ ${LC('fatta', 'faite', 'done', 'hecha', 'klart')}` : `⚠ ${LC('da rifare', 'à refaire', 'try again', 'a repetir', 'gör om')}`}
            </span>
          )}
        </div>
      )}

      {/* ── PASSO 4 — LA TARATURA TA ────────────────────────────────────────────────────── */}
      {passo === 'taratura' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 14.5, lineHeight: 1.5, color: 'var(--s-ink-faint)', textAlign: 'center' }}>
            {t('theta_ref_hint')}
          </div>
          {/* Il confronto — appena entrambe le strette (due lattine e una sola) sono state
              fatte, qui compare la differenza da applicare. Stesse funzioni pure di App.tsx. */}
          {compareReady({ taTwo: provaTa.two, taSolo: provaTa.solo }) && (
            <div style={{
              padding: '10px 12px', borderRadius: 10, background: 'var(--s-disc-sunk)',
              border: `1px solid ${scarto === null ? 'var(--s-reserve)' : 'var(--s-still)'}`,
            }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'baseline', justifyContent: 'center', fontFamily: 'var(--s-mono)', fontSize: 15.5, color: 'var(--s-ink)' }}>
                <span><span style={{ fontSize: 12.5, opacity: 0.6 }}>2 · </span>{provaTa.two!.toFixed(2)}</span>
                <span><span style={{ fontSize: 12.5, opacity: 0.6 }}>1 · </span>{provaTa.solo!.toFixed(2)}</span>
                <span style={{ color: scarto === null ? 'var(--s-reserve)' : 'var(--s-still)', fontWeight: 700 }}>
                  {scarto === null ? '—' : `${scarto > 0 ? '+' : ''}${scarto.toFixed(2)}`}
                </span>
              </div>
              {scarto !== null && !scartoMisurato && (
                <div style={{ textAlign: 'center' }}>
                  <button className="s-glass s-glass-btn" onClick={() => theta.setSoloOffset(scarto)} style={{ ...pillola(false), marginTop: 8 }}>
                    {LC('usa questa differenza', 'utilise cet écart', 'use this offset', 'usa esta diferencia', 'använd denna skillnad')}
                  </button>
                </div>
              )}
              {scartoMisurato && (
                <div style={{ marginTop: 6, fontSize: 13.5, fontWeight: 700, color: 'var(--s-still)', textAlign: 'center' }}>
                  ✓ {LC('applicata', 'appliqué', 'applied', 'aplicada', 'tillämpad')}
                </div>
              )}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14.5, color: 'var(--s-ink-faint)' }}>{t('theta_ref_label')}</span>
            <span style={{ fontFamily: 'var(--s-mono)', fontSize: 15.5 }}>{theta.rawSmooth.toFixed(0)}</span>
            <input
              type="number" step="0.1" value={riferimento}
              onChange={e => setRiferimento(e.target.value)}
              style={{
                width: 56, border: 'none', borderBottom: '1px solid var(--s-ink-ghost)',
                background: 'none', outline: 'none', fontFamily: 'var(--s-mono)', fontSize: 15.5,
                color: 'var(--s-ink)', padding: '2px 4px',
              }}
            />
            <button onClick={() => {
              const v = parseFloat(riferimento);
              if (Number.isFinite(v)) theta.addPointFromReference(v);
            }} className="s-glass s-glass-btn" style={pillola(false)}>
              {t('theta_cal_record')}
            </button>
          </div>
          <div style={{ fontSize: 14, color: 'var(--s-ink-faint)', textAlign: 'center' }}>
            {theta.taScale ? `${theta.taScale.points.length} · ${theta.taScale.madeAt === 0 ? t('theta_scale_factory') : t('theta_scale_own')}` : ''}
            {theta.taScale && theta.taScale.madeAt !== 0 && (
              <button className="s-glass s-glass-btn" onClick={() => theta.clearTaCalibration()} style={{
                cursor: 'pointer', borderRadius: 999, padding: '4px 12px', marginLeft: 8, background: 'var(--s-disc)',
                fontFamily: 'var(--s-sans)', fontSize: 14, color: 'var(--s-ink-faint)',
              }}>
                {t('theta_cal_clear')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── AVANTI / INDIETRO — lo stesso gesto di `Avvio.tsx` ─────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
        <button
          className="s-glass s-glass-btn"
          onClick={() => setPasso(PASSI[Math.max(0, idx - 1)])}
          disabled={idx === 0}
          style={{
            cursor: idx === 0 ? 'default' : 'pointer', borderRadius: 999, padding: '6px 14px',
            background: 'var(--s-disc)', opacity: idx === 0 ? 0.35 : 1,
            fontFamily: 'var(--s-sans)', fontSize: 14.5, color: 'var(--s-ink-soft)',
          }}>
          ← {LC('indietro', 'précédent', 'back', 'atrás', 'tillbaka')}
        </button>
        {idx < PASSI.length - 1 ? (
          <button onClick={() => setPasso(PASSI[idx + 1])} className="s-glass s-glass-btn" style={pillola(true)}>
            {LC('avanti', 'suivant', 'next', 'siguiente', 'nästa')} →
          </button>
        ) : onFatto ? (
          /* ── SEGNALATO: « le test des boîtes est bien fait, mais il ne disparaît pas ».
              In App.tsx questo stesso percorso (`ThetaReadyCheck`) è una schermata che SPARISCE
              da sé quando l'auditor preme "prosegui" (`onProceed`) — qui restava un cassetto
              aperto per sempre, senza un gesto che lo chiuda: fatte le prove, il "✓ fatto" era
              muto, non un bottone. Stesso gesto di App.tsx, un bottone vero al posto del testo
              statico: chiude il cassetto (`meterSetupAperto`, in `Serenity.tsx`). */
          <button onClick={onFatto} className="s-glass s-glass-btn" style={{ ...pillola(true), color: 'var(--s-still)' }}>
            ✓ {LC('fatto — chiudi', 'terminé — fermer', 'done — close', 'hecho — cerrar', 'klart — stäng')}
          </button>
        ) : (
          <span style={{ fontSize: 14.5, color: 'var(--s-still)', fontWeight: 700 }}>
            ✓ {LC('fatto', 'terminé', 'done', 'hecho', 'klart')}
          </span>
        )}
      </div>
    </div>
  );
}
