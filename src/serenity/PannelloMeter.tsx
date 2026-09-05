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
  fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', letterSpacing: '0.04em',
  background: piena ? 'var(--s-disc)' : 'var(--s-disc-sunk)',
  color: 'var(--s-ink)',
});

/**
 * scelta — LA STESSA PILLOLA, MA PER UNA SCELTA PERSISTENTE fra due opzioni (non un'azione
 * a un colpo solo come « avanti »/« stringi »).
 *
 * ── PERCHÉ NON BASTAVA `pillola` ────────────────────────────────────────────────────────────
 * Segnalato: « configurer le METER, il faut montrer davantage quand on a cliqué sur un bouton
 * de choix » — vero: « due lattine »/« lattina sola » (passo 1) usava `pillola`, che distingue
 * piena/non-piena SOLO nell'opacità di `--s-disc`/`--s-disc-sunk` — nel vetro liquido i due
 * valori sono `rgba(255,255,255,0.42)` e `rgba(236,234,230,0.34)` in chiaro (`rgba(52,53,57,
 * 0.36)`/`rgba(28,29,31,0.36)` in scuro): una differenza di qualche punto di opacità sullo
 * STESSO quasi-bianco/quasi-nero, quasi invisibile a colpo d'occhio. Bene per un bottone
 * d'azione (lo si preme e basta), non per due opzioni che restano lì e dovrebbero dire QUALE
 * delle due è attiva ADESSO.
 *
 * ── LA STESSA SCELTA, IN EQUILIBRIUM ────────────────────────────────────────────────────────
 * `ThetaReadyCheck.tsx` (lo stesso identico toggle, motore condiviso) marca l'opzione attiva a
 * colore — fondo/bordo/testo in ambra (`#f59e0b`) contro un grigio neutro per quella inattiva.
 * Stessa logica qui: `--s-reserve` è l'ambra di SERENITY (la stessa del terzo segnale di
 * sistema e del bottone "chiudi la seduta"), non un colore nuovo inventato per l'occasione.
 */
const scelta = (selezionata: boolean): React.CSSProperties => ({
  cursor: 'pointer', borderRadius: 999, padding: '8px 18px',
  fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', letterSpacing: '0.04em',
  fontWeight: selezionata ? 700 : 500,
  background: selezionata ? 'color-mix(in srgb, var(--s-reserve) 20%, var(--s-disc))' : 'var(--s-disc-sunk)',
  border: `1.5px solid ${selezionata ? 'color-mix(in srgb, var(--s-reserve) 65%, transparent)' : 'var(--s-ink-ghost)'}`,
  color: selezionata ? 'var(--s-reserve)' : 'var(--s-ink-faint)',
  transition: 'background var(--s-slow) var(--s-ease), color var(--s-slow) var(--s-ease), border-color var(--s-slow) var(--s-ease)',
});

/**
 * pillolaTest — IL BOTTONE CHE FA LA PROVA VERA (stretta/respiro), DISTINTO da "avanti"/
 * "indietro".
 *
 * ── PERCHÉ ────────────────────────────────────────────────────────────────────────────────
 * Segnalato: « il bottone per fare i test mettilo più evidenziato degli altri (indietro/
 * avanti) ». Prima usava `pillola(true)`, IDENTICO al bottone "avanti": stesso fondo
 * (`--s-disc`), stesso colore (`--s-ink`) — nessuna differenza fra "vai al passo successivo"
 * e "fai la stretta/il respiro adesso", che sono gesti di natura opposta (uno naviga, l'altro
 * agisce sul preclear). Stessa ricetta cromatica di `scelta(true)` qui sopra — l'ambra
 * `--s-reserve` è già il colore che SERENITY usa per "questo è ciò che conta qui", non un
 * terzo colore inventato per l'occasione.
 */
const pillolaTest: React.CSSProperties = {
  cursor: 'pointer', borderRadius: 999, padding: '8px 18px',
  fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', fontWeight: 700, letterSpacing: '0.04em',
  background: 'color-mix(in srgb, var(--s-reserve) 22%, var(--s-disc))',
  border: '1.5px solid color-mix(in srgb, var(--s-reserve) 65%, transparent)',
  color: 'var(--s-reserve)',
};

const PASSI = ['config', 'stretta', 'respiro', 'taratura'] as const;
type Passo = typeof PASSI[number];

/** Chi monta questo pannello (`Serenity.tsx`) lo fa SOLO a meter connesso — niente stato di
 *  "non connesso" da disegnare qui dentro: quella parola la dice già l'indicatore sopra. */
export function PannelloMeter({ theta, provaTa, onFatto, passoIniziale }: {
  theta: ReturnType<typeof useThetaMeter>;
  /** I due TA della prova doppia (uno per configurazione) — vive in `Serenity.tsx`, non qui:
   *  è la stessa seduta a doverli azzerare quando cambia persona, non questo pannello. */
  provaTa: { two: number | null; solo: number | null };
  /** ── Segnalato: « il test des boîtes... ne disparaît pas ». Chi monta il pannello decide
   *  cosa vuol dire "fatto, chiudi" (qui: `setMeterSetupAperto(false)`) — senza questo prop il
   *  bottone dell'ultimo passo resta testo statico, come App.tsx quando manca `onProceed`. */
  onFatto?: () => void;
  /**
   * ⚠️ AGGIUNTO (revisione dei calcoli TONE, 01/09/2026, additivo) — su QUALE passo aprirsi.
   * `undefined` (default) → 'config', come sempre. Serve al bottone « rifai la prova delle
   * lattine » vicino al TONE: senza, riaprire il pannello mandava sempre al passo 1 (« quante
   * lattine »), un giro in più per arrivare a quello che l'auditor ha appena chiesto.
   */
  passoIniziale?: Passo;
}) {
  const { t, lang } = useI18n();
  const [riferimento, setRiferimento] = useState('2.0');
  const [passo, setPasso] = useState<Passo>(passoIniziale ?? 'config');
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

      {/* ⚠️ CORRETTO — segnalato: « non si vede molto bene cosa c'è scritto (STEP 1 a 3).
          Scrivilo in nero, sarà meglio ». `--s-ink-soft` a colori invariati (`#3d4045` in
          chiaro, tarato per ≈7:1 su `--s-ground`, v. `tokens.css`) — ma questo titolo non sta
          su `--s-ground`: sta sul vetro liquido `--s-disc` del pannello, che lascia trasparire
          il quadrante sotto. `--s-ink`, il token di massimo contrasto (il "nero" di SERENITY —
          v. la nota in `tokens.css`, "nessun nero puro"), più il grassetto: la differenza da
          `--s-ink-soft` è di un solo passo di scurezza ma su un fondo instabile è quella che
          si vede. */}
      <div style={{ fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-sm)', letterSpacing: '0.1em',
                    textTransform: 'uppercase', fontWeight: 700, color: 'var(--s-ink)', textAlign: 'center' }}>
        {TITOLI[passo]}
      </div>

      {/* ── PASSO 1 — CONFIGURAZIONE ────────────────────────────────────────────────────── */}
      {passo === 'config' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
          <div style={{ fontSize: 'var(--s-fs-base)', lineHeight: 1.5, color: 'var(--s-ink-faint)', textAlign: 'center' }}>
            {LC('quante lattine impugna il preclear in mano — cambia come l\'ago legge la resistenza.',
              'combien de boîtes le préclair tient en main — change la façon dont l\'aiguille lit la résistance.',
              'how many cans the preclear holds — changes how the needle reads the resistance.',
              'cuántas latas sostiene el preclear en la mano — cambia cómo la aguja lee la resistencia.',
              'hur många burkar preclearen håller — ändrar hur nålen läser motståndet.')}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => theta.setConfig('two-cans')}
              className="s-glass s-glass-btn" style={scelta(theta.setup.config === 'two-cans')}>
              {t('theta_two_cans')}
            </button>
            <button onClick={() => theta.setConfig('solo-can')}
              className="s-glass s-glass-btn" style={scelta(theta.setup.config === 'solo-can')}>
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
              <div style={{ fontSize: 'var(--s-fs-base)', lineHeight: 1.5, color: 'var(--s-reserve)' }}>
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
          <div style={{ fontSize: 'var(--s-fs-base)', lineHeight: 1.5, color: 'var(--s-ink-faint)', textAlign: 'center' }}>
            {/* ⚠️ OTTIMIZZAZIONE — era un ternario con lo STESSO testo in entrambi i rami
                (`theta.testing === 'squeeze' ? t('theta_squeeze_hint') : t('theta_squeeze_hint')`),
                nessun comportamento diverso da preservare: collassato nella sua unica resa. */}
            {t('theta_squeeze_hint')}
          </div>
          {/* ⚠️ CORRETTO — segnalato: bottone del test più evidenziato di indietro/avanti.
              v. `pillolaTest`, sopra: stessa ricetta ambra di `scelta(true)`, non più
              indistinguibile da "avanti". */}
          <button onClick={() => theta.startSqueezeTest()} disabled={theta.testing !== null}
            className="s-glass s-glass-btn" style={pillolaTest}>
            {t('theta_squeeze')}
          </button>
          {theta.testing === 'squeeze' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="ser-pulse" style={{ fontSize: 'var(--s-fs-base)', color: 'var(--s-alive)' }}>{t('theta_test_running')}</span>
              <button className="s-glass s-glass-btn" onClick={() => theta.cancelTest()} style={{
                cursor: 'pointer', borderRadius: 999, padding: '4px 12px', background: 'var(--s-disc)',
                fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', color: 'var(--s-ink-faint)',
              }}>
                {LC('annulla', 'annuler', 'cancel', 'cancelar', 'avbryt')}
              </button>
            </div>
          )}
          {theta.squeezeOk !== null && theta.testing === null && (
            <span style={{ fontSize: 'var(--s-fs-base)', fontWeight: 700, color: theta.squeezeOk ? 'var(--s-still)' : 'var(--s-reserve)' }}>
              {theta.squeezeOk ? `✓ ${LC('fatta', 'faite', 'done', 'hecha', 'klart')}` : `⚠ ${LC('da rifare', 'à refaire', 'try again', 'a repetir', 'gör om')}`}
            </span>
          )}
          {/* ── LA MANOPOLA DELLA SENSIBILITÀ — segnalato: « le test du meter lors de la
              connexion ne présente pas la possibilité de gérer la sensibilité ». Mancava del
              tutto — eppure `theta.setup.sensTrim`/`theta.setSensTrim` esistevano già nel
              motore condiviso (li usa `ThetaReadyCheck`, App.tsx). STESSO controllo di lì,
              stesso posto (sotto la stretta: è la prova che TARA la sensibilità, quindi se la
              caduta non arriva a un terzo di quadrante si corregge qui, guardando l'ago) —
              non una manopola inventata per SERENITY. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
            <span style={{ fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-sm)', letterSpacing: '0.1em',
                          textTransform: 'uppercase', color: 'var(--s-ink-faint)' }}>
              {t('theta_sensitivity')}
            </span>
            {([-1, 1] as const).map(v => (
              <button key={v} type="button" onClick={() => theta.setSensTrim(theta.setup.sensTrim + v)}
                className="s-glass s-glass-btn" style={{
                  width: 42, height: 36, borderRadius: 10, cursor: 'pointer',
                  fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-xl)', fontWeight: 700, lineHeight: 1,
                  background: 'var(--s-disc)', color: 'var(--s-ink-soft)',
                }}>
                {v > 0 ? '+' : '−'}
              </button>
            ))}
            <span style={{ fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-base)', fontWeight: 700,
                          color: 'var(--s-ink)', minWidth: 28, textAlign: 'right' }}>
              {theta.setup.sensTrim > 0 ? '+' : ''}{theta.setup.sensTrim}
            </span>
          </div>
        </div>
      )}

      {/* ── PASSO 3 — LA PROVA DEL RESPIRO ──────────────────────────────────────────────── */}
      {passo === 'respiro' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
          <div style={{ fontSize: 'var(--s-fs-base)', lineHeight: 1.5, color: 'var(--s-ink-faint)', textAlign: 'center' }}>
            {t('theta_breath_hint')}
          </div>
          {/* ⚠️ CORRETTO — stessa ragione del bottone della stretta, sopra. */}
          <button onClick={() => theta.startBreathTest()} disabled={theta.testing !== null}
            className="s-glass s-glass-btn" style={pillolaTest}>
            {t('theta_breath')}
          </button>
          {theta.testing === 'breath' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="ser-pulse" style={{ fontSize: 'var(--s-fs-base)', color: 'var(--s-alive)' }}>{t('theta_test_running')}</span>
              <button className="s-glass s-glass-btn" onClick={() => theta.cancelTest()} style={{
                cursor: 'pointer', borderRadius: 999, padding: '4px 12px', background: 'var(--s-disc)',
                fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', color: 'var(--s-ink-faint)',
              }}>
                {LC('annulla', 'annuler', 'cancel', 'cancelar', 'avbryt')}
              </button>
            </div>
          )}
          {theta.breathOk !== null && theta.testing === null && (
            <span style={{ fontSize: 'var(--s-fs-base)', fontWeight: 700, color: theta.breathOk ? 'var(--s-still)' : 'var(--s-reserve)' }}>
              {theta.breathOk ? `✓ ${LC('fatta', 'faite', 'done', 'hecha', 'klart')}` : `⚠ ${LC('da rifare', 'à refaire', 'try again', 'a repetir', 'gör om')}`}
            </span>
          )}
        </div>
      )}

      {/* ── PASSO 4 — LA TARATURA TA ────────────────────────────────────────────────────── */}
      {passo === 'taratura' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* ── BLOCCO A — LO SCARTO DUE LATTINE / LATTINA SOLA — segnalato: « la définition
              des deux TA n'est pas claire, on ne sait pas s'il faut serrer les boîtes des deux
              cans ou solo pour avoir la différence de TA ». Vero: prima questo riquadro
              compariva SOLO quando entrambe le prove erano GIÀ fatte, senza dire come farle —
              bisognava indovinare che si torna al passo 1 per cambiare configurazione, poi al
              passo 2 per stringere, due volte. Ora è una sequenza guidata, DENTRO questo
              stesso passo: cambia la configurazione da qui, stringi da qui, senza uscirne.
              Zero logica nuova — `theta.setConfig`/`theta.startSqueezeTest`/`provaTa` sono
              esattamente quelli dei passi 1 e 2, solo richiamati nell'ordine giusto. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-sm)', letterSpacing: '0.1em',
                          textTransform: 'uppercase', color: 'var(--s-ink-soft)', textAlign: 'center' }}>
              {LC('lo scarto due lattine / lattina sola', 'l\'écart deux boîtes / une boîte', 'the two-cans / solo-can offset',
                'la diferencia dos latas / una lata', 'skillnaden två burkar / en burk')}
            </div>
            <div style={{ fontSize: 'var(--s-fs-sm)', lineHeight: 1.5, color: 'var(--s-ink-faint)', textAlign: 'center' }}>
              {LC('due lattine e una sola leggono un TA diverso — la geometria delle lattine in mano cambia la resistenza. Stringi prima con due, poi con una sola: la differenza fra le due letture corregge automaticamente tutte le sedute in lattina sola.',
                'deux boîtes et une seule lisent un TA différent — la géométrie des boîtes en main change la résistance. Serre d\'abord avec deux, puis avec une seule : la différence entre les deux lectures corrige automatiquement toutes les séances en boîte seule.',
                'two cans and one solo can read a different TA — the geometry of the cans in hand changes the resistance. Squeeze first with two, then with one alone: the difference between the two readings automatically corrects every solo-can session.',
                'dos latas y una sola leen un TA distinto — la geometría de las latas en la mano cambia la resistencia. Aprieta primero con dos, luego con una sola: la diferencia entre las dos lecturas corrige automáticamente todas las sesiones con una sola lata.',
                'två burkar och en ensam burk läser olika TA — geometrin på burkarna i handen ändrar motståndet. Kläm först med två, sedan med en ensam: skillnaden mellan de två avläsningarna korrigerar automatiskt alla sessioner med en ensam burk.')}
            </div>
            {/* ── SOTTOPASSO 1 · DUE LATTINE ────────────────────────────────────────────── */}
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px',
              borderRadius: 10, background: 'var(--s-disc-sunk)',
              border: `1px solid ${provaTa.two !== null ? 'var(--s-still)' : 'var(--s-ink-ghost)'}`,
              opacity: provaTa.two !== null ? 0.7 : 1,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 'var(--s-fs-sm)', fontWeight: 700, color: 'var(--s-ink)' }}>
                  1 · {LC('con DUE lattine', 'avec DEUX boîtes', 'with TWO cans', 'con DOS latas', 'med TVÅ burkar')}
                </span>
                {provaTa.two !== null && (
                  <span style={{ fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-base)', fontWeight: 700, color: 'var(--s-still)' }}>
                    ✓ {provaTa.two.toFixed(2)}
                  </span>
                )}
              </div>
              {provaTa.two === null && (
                theta.setup.config !== 'two-cans' ? (
                  <button className="s-glass s-glass-btn" onClick={() => theta.setConfig('two-cans')} style={pillola(true)}>
                    {LC('metti due lattine', 'mets deux boîtes', 'set two cans', 'pon dos latas', 'sätt två burkar')}
                  </button>
                ) : theta.testing === 'squeeze' ? (
                  /* ⚠️ OTTIMIZZAZIONE — mancava il bottone annulla che le altre copie di
                     questo stesso blocco (« PASSO 2 », più su) hanno: senza, chi stringeva
                     per errore non aveva modo di uscirne se non aspettando la prova. */
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="ser-pulse" style={{ fontSize: 'var(--s-fs-base)', color: 'var(--s-alive)' }}>{t('theta_test_running')}</span>
                    <button className="s-glass s-glass-btn" onClick={() => theta.cancelTest()} style={{
                      cursor: 'pointer', borderRadius: 999, padding: '4px 12px', background: 'var(--s-disc)',
                      fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', color: 'var(--s-ink-faint)',
                    }}>
                      {LC('annulla', 'annuler', 'cancel', 'cancelar', 'avbryt')}
                    </button>
                  </div>
                ) : (
                  // ⚠️ CORRETTO — stessa ragione del bottone della stretta al passo 2.
                  <button className="s-glass s-glass-btn" onClick={() => theta.startSqueezeTest()} style={pillolaTest}>
                    {LC('stringi le due lattine', 'serre les deux boîtes', 'squeeze the two cans', 'aprieta las dos latas', 'kläm de två burkarna')}
                  </button>
                )
              )}
            </div>
            {/* ── SOTTOPASSO 2 · LATTINA SOLA — sbloccato solo dopo il primo, l'ordine conta:
                la prima stretta è il RIFERIMENTO, la seconda si confronta con lei. */}
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px',
              borderRadius: 10, background: 'var(--s-disc-sunk)',
              border: `1px solid ${provaTa.solo !== null ? 'var(--s-still)' : 'var(--s-ink-ghost)'}`,
              opacity: provaTa.two === null ? 0.35 : provaTa.solo !== null ? 0.7 : 1,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 'var(--s-fs-sm)', fontWeight: 700, color: 'var(--s-ink)' }}>
                  2 · {LC('con la LATTINA SOLA', 'avec la BOÎTE SEULE', 'with the SOLO can', 'con la LATA SOLA', 'med den ENSAMMA burken')}
                </span>
                {provaTa.solo !== null && (
                  <span style={{ fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-base)', fontWeight: 700, color: 'var(--s-still)' }}>
                    ✓ {provaTa.solo.toFixed(2)}
                  </span>
                )}
              </div>
              {provaTa.two !== null && provaTa.solo === null && (
                theta.setup.config !== 'solo-can' ? (
                  <button className="s-glass s-glass-btn" onClick={() => theta.setConfig('solo-can')} style={pillola(true)}>
                    {LC('passa a lattina sola', 'passe à une boîte', 'switch to solo can', 'pasa a una lata', 'byt till en burk')}
                  </button>
                ) : theta.testing === 'squeeze' ? (
                  /* ⚠️ OTTIMIZZAZIONE — stessa mancanza della copia sopra (due lattine):
                     aggiunto il bottone annulla, prima assente qui. */
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="ser-pulse" style={{ fontSize: 'var(--s-fs-base)', color: 'var(--s-alive)' }}>{t('theta_test_running')}</span>
                    <button className="s-glass s-glass-btn" onClick={() => theta.cancelTest()} style={{
                      cursor: 'pointer', borderRadius: 999, padding: '4px 12px', background: 'var(--s-disc)',
                      fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', color: 'var(--s-ink-faint)',
                    }}>
                      {LC('annulla', 'annuler', 'cancel', 'cancelar', 'avbryt')}
                    </button>
                  </div>
                ) : (
                  // ⚠️ CORRETTO — stessa ragione del bottone della stretta al passo 2.
                  <button className="s-glass s-glass-btn" onClick={() => theta.startSqueezeTest()} style={pillolaTest}>
                    {LC('stringi la lattina sola', 'serre la boîte seule', 'squeeze the solo can', 'aprieta la lata sola', 'kläm den ensamma burken')}
                  </button>
                )
              )}
            </div>
            {/* Il confronto — appena entrambe le strette sono state fatte, qui compare la
                differenza da applicare. Stesse funzioni pure di App.tsx. */}
            {compareReady({ taTwo: provaTa.two, taSolo: provaTa.solo }) && (
              <div style={{
                padding: '10px 12px', borderRadius: 10, background: 'var(--s-disc-sunk)',
                border: `1px solid ${scarto === null ? 'var(--s-reserve)' : 'var(--s-still)'}`,
              }}>
                {/* ⚠️ SEGNALATO: « IN LIGHT TA 1 cans vs 2 non si vede, è troppo chiaro ».
                    "2 ·"/"1 ·" scolorivano con `opacity:0.6` sul colore EREDITATO (`--s-ink`)
                    invece di un token dedicato: un'opacità frazionaria sfuma verso lo sfondo
                    SOTTOSTANTE, non verso un grigio fisso — su `--s-disc-sunk` chiaro (questo
                    riquadro) il risultato è più tenue di quanto sembri nello scuro, dove lo
                    stesso 0.6 sfuma verso un fondo comunque scuro. `--s-ink-faint`, tarato per
                    contrasto in ENTRAMBI i temi (v. `tokens.css`), non dipende dal fondo dietro. */}
                <div style={{ display: 'flex', gap: 16, alignItems: 'baseline', justifyContent: 'center', fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-base)', color: 'var(--s-ink)' }}>
                  <span><span style={{ fontSize: 'var(--s-fs-sm)', color: 'var(--s-ink-faint)' }}>2 · </span>{provaTa.two!.toFixed(2)}</span>
                  <span><span style={{ fontSize: 'var(--s-fs-sm)', color: 'var(--s-ink-faint)' }}>1 · </span>{provaTa.solo!.toFixed(2)}</span>
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
                  <div style={{ marginTop: 6, fontSize: 'var(--s-fs-sm)', fontWeight: 700, color: 'var(--s-still)', textAlign: 'center' }}>
                    ✓ {LC('applicata', 'appliqué', 'applied', 'aplicada', 'tillämpad')}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── BLOCCO B — LA TARATURA DELLA SCALA, CONTRO IL THETA-METER VERO — separata
              apposta dal blocco sopra: quella corregge lo SCARTO fra due configurazioni con LO
              STESSO strumento, questa corregge la SCALA dello strumento stesso contro un
              riferimento esterno. Due tarature diverse, due riquadri diversi. */}
          {/* ⚠️ CORRETTO — segnalato tre cose insieme, dopo aver visto il mockup:
              1. il titolo diventa CALIBRATION (era "la taratura della scala"/l'étalonnage);
              2. il numero grezzo ("Theta-Meter reads · 2 188 340") è tolto — confondeva,
                 resta solo il campo dove scrivere il TA letto sul Theta-Meter vero;
              3. il testo lungo (`t('theta_ref_hint')`, il perché del blocco) è accorciato.
              Locale con `LC`, non più le chiavi condivise `t('theta_ref_hint')`/
              `t('theta_ref_label')`: quelle le usa anche `ThetaReadyCheck.tsx` in EQUILIBRIUM
              (verificato) — cambiarle lì avrebbe spostato un testo mai chiesto per
              EQUILIBRIUM. Qui restano SOLO parole di questo pannello. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4, borderTop: '1px solid var(--s-ink-ghost)' }}>
            <div style={{ fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-sm)', letterSpacing: '0.1em',
                          textTransform: 'uppercase', color: 'var(--s-ink-soft)', textAlign: 'center' }}>
              {LC('calibrazione', 'calibration', 'calibration', 'calibración', 'kalibrering')}
            </div>
          <div style={{ fontSize: 'var(--s-fs-base)', lineHeight: 1.5, color: 'var(--s-ink-faint)', textAlign: 'center' }}>
            {LC('impugna le lattine, leggi il Theta-Meter e aggiungi il punto',
                'tenez les boîtes, lisez le Theta-Meter et ajoutez le point',
                'hold the cans, read the Theta-Meter and add the point',
                'sujeta las latas, lee el Theta-Meter y añade el punto',
                'håll burkarna, läs Theta-Meter och lägg till punkten')}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 'var(--s-fs-base)', color: 'var(--s-ink-faint)' }}>
              {LC('TA sul Theta-Meter', 'TA sur le Theta-Meter', 'TA on the Theta-Meter', 'TA en el Theta-Meter', 'TA på Theta-Meter')}
            </span>
            <input
              type="number" step="0.1" value={riferimento}
              onChange={e => setRiferimento(e.target.value)}
              style={{
                width: 56, border: 'none', borderBottom: '1px solid var(--s-ink-ghost)',
                background: 'none', outline: 'none', fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-base)',
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
            fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', color: 'var(--s-ink-soft)',
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
          <span style={{ fontSize: 'var(--s-fs-base)', color: 'var(--s-still)', fontWeight: 700 }}>
            ✓ {LC('fatto', 'terminé', 'done', 'hecho', 'klart')}
          </span>
        )}
      </div>
    </div>
  );
}
