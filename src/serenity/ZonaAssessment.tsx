/**
 * ZonaAssessment — l'ASSESSMENT come una zona sua, non un cassetto appeso a un bottone.
 *
 * ── PERCHÉ ESISTE ───────────────────────────────────────────────────────────────────────────
 * Segnalato: « l'assessment deve avere una sua zona, come in equilibrium ». In App.tsx
 * (`AssessmentPanel.tsx`) l'assessment è un pannello ANCORATO — una colonna vera nel layout,
 * sempre allo stesso posto, che si apre da sé quando un assessment comincia e resta lì per
 * essere ritrovato. In SERENITY era un cassetto (`position:absolute, bottom:'100%'`) che
 * usciva dal bottone stesso: spariva quando `assessAttivo` tornava falso, e la sua posizione
 * dipendeva da dove il bottone capitava a stare nella pagina — non un posto, un effetto
 * collaterale del bottone.
 *
 * ── LO STESSO STATO, SOLO UN CONTENITORE VERO ──────────────────────────────────────────────
 * Zero logica nuova: `assessAttivo`/`assessItems` restano esattamente quelli di `Serenity.tsx`
 * (l'effetto che li riempie leggendo `journal.logs` non cambia di una riga). Cambia solo DOVE
 * e COME si vedono — una colonna ancorata all'angolo, sempre presente a seduta aperta (non
 * solo quando la cattura è accesa), col suo titolo sempre leggibile anche chiusa.
 *
 * ── LA VISTA INDICAZIONE — segnalata assente nell'audit dei « moduli mancanti »: App.tsx
 * (`AssessmentPanel.tsx`) ha DUE viste — ASSESSMENT (gli item dati a voce) e INDICAZIONE
 * (« questa reazione INDICA al preclear? », l'R&I di sempre — l'unico criterio ESTERNO ai due
 * aghi, che su 89 item misurati non si sono trovati d'accordo che una volta, κ di Cohen −0,09).
 * Qui c'era SOLO la prima. Portata la seconda, STESSA logica (le tre funzioni vivono in
 * `Serenity.tsx`: `aggiungiItemManuale`/`cercaLetturaPerParola`/`segnaIndicazione`, ricopiate
 * parola per parola da App.tsx), grafica di SERENITY invece delle classi Tailwind di
 * `AssessmentPanel`.
 *
 * @see docs/serenity-refonte.md
 */

import { useState } from 'react';
import { useI18n } from '../i18n';
import { READ_NON_MISURATO } from '../engine/instantRead';
import { orologio } from './orologio';

export interface AssessItemSerenity {
  id: string; time: number; item: string; gruppo: number;
  reaction: string | null; beforeMs: number; afterMs: number; readSrc?: 'eeg' | 'theta';
  /** `undefined`/`'item'` = detto a voce durante un ASSESSMENT. `'manual'` = trovato in un
   *  ALTRO modo e scritto dall'auditor (vista INDICAZIONE). */
  kind?: 'item' | 'manual';
  /** Il preclear ha confermato che la reazione lo riguarda? `undefined` = non ancora chiesto. */
  indica?: boolean;
  /** Le due letture prese SEPARATAMENTE, quando ci sono entrambi gli strumenti. */
  readMuse?: string;
  readMeter?: string;
}

type Vista = 'assess' | 'ri';

/** Quante volte la lettura di UN ago ha indicato al preclear. Il denominatore conta solo le
 *  righe in cui quell'ago aveva letto qualcosa: un ago che tace non sbaglia — e nemmeno un ago
 *  che non poteva nemmeno guardare (`READ_NON_MISURATO`, niente strumento). */
const resa = (items: AssessItemSerenity[], leggi: (a: AssessItemSerenity) => string | undefined) => {
  const validati = items.filter(a => a.indica !== undefined);
  const con = validati.filter(a => {
    const l = leggi(a);
    return l && l !== 'NULL' && l !== READ_NON_MISURATO;
  });
  return { si: con.filter(a => a.indica).length, tot: con.length };
};

export function ZonaAssessment({ attivo, onToggle, items, LC, dueAghi = false,
                                 onIndica, onAggiungiItem, cercaLettura }: {
  /** La cattura è accesa? Stesso `assessAttivo` di `Serenity.tsx` — anche il toggle qui è
   *  quello stesso, non un secondo interruttore. */
  attivo: boolean;
  onToggle: () => void;
  items: AssessItemSerenity[];
  LC: (it: string, fr: string, en: string, es: string, sv: string) => string;
  /** Entrambi gli strumenti connessi — solo allora ha senso mostrare due colonne di lettura. */
  dueAghi?: boolean;
  onIndica?: (id: string, indica: boolean) => void;
  onAggiungiItem?: (testo: string, quandoSec?: number) => void;
  cercaLettura?: (testo: string) => { tSec: number; frase: string; read?: string; readMuse?: string; readMeter?: string } | null;
}) {
  const { t } = useI18n();
  const [vista, setVista] = useState<Vista>('assess');
  const [bozza, setBozza] = useState('');
  /** ── APERTA/CHIUSA, DIVERSO DA ATTIVA/DISATTIVA — segnalato: « assessment deve poter
   *  essere disattivato ma lasciando vedere gli item con le reazioni, poiché utili
   *  all'auditor. Separa la chiusura dalla disattivazione ». Prima un solo booleano
   *  (`attivo`) faceva le DUE cose insieme: fermava la cattura E nascondeva tutto, item già
   *  raccolti compresi — spegnere la cattura per un momento cancellava dalla vista un
   *  riferimento che l'auditor voleva ancora consultare. Ora `espansa` (qui, locale: la vista
   *  non serve fuori da questo componente) decide SOLO se il contenuto si vede; `attivo`
   *  (sopra, di `Serenity.tsx`) decide SOLO se arriva un item nuovo. Default aperta: quando
   *  l'assessment si arma (a mano o col ciclo) l'auditor la vuole vedere subito, non un
   *  secondo gesto in più. */
  const [espansa, setEspansa] = useState(true);

  const righe = vista === 'assess'
    ? items.filter(a => a.kind === undefined || a.kind === 'item')
    : items.filter(a => a.kind === 'manual');
  const proposta = vista === 'ri' && bozza.trim().length >= 2 ? cercaLettura?.(bozza.trim()) ?? null : null;
  const aggiungi = () => {
    const w = bozza.trim();
    if (!w) return;
    onAggiungiItem?.(w, proposta?.tSec);
    setBozza('');
  };

  return (
    // ⚠️ Segnalato: « la zone assessment doit être aussi à gauche... mais tous en dehors de la
    // zone arc, qui se réduit dès qu'un module apparaît ». Prima galleggiava `position:absolute`
    // SUL quadrante (un angolo a sé, senza toccare la taglia di nessun altro) — ora vive IN
    // FLUSSO, in una colonna vera che `Serenity.tsx` gli riserva accanto all'arco (che si
    // restringe per farle posto): niente più `position`/`top`/`left` qui, la taglia e il posto
    // li decide chi la monta, come ogni altro elemento normale del layout.
    // ⚠️ Segnalato: « la zone ARC doit avoir le même fond que le fond général... et les zones
    // également, juste un petit liseré très fin de séparation ». `--s-zone-bg`/`--s-zone-border`
    // (v. `tokens.css`): trasparente per davvero in chiaro, con un bordo sottile.
    // ⚠️ Segnalato ANCORA, dopo Santé (che già funzionava): « ASSESSEMENT, GIORNALE, MNA con un
    // fondo proprio ». Il colpevole non era il fondo (già trasparente) ma `className="s-glass
    // s-glass-lift"`: `.s-glass` porta il SUO `backdrop-filter` (30px di sfocatura+saturazione
    // di quel che sta DIETRO) e la sua ombra — anche con `background` trasparente, sfocare lo
    // sfondo dietro il pannello lo fa leggere come "una lastra a sé", esattamente l'effetto
    // segnalato. Santé (`HealthPanel`) non porta MAI questa classe, solo lo stile in linea — qui
    // lo stesso: via la classe, resta solo `--s-zone-bg`/`--s-zone-border` inline.
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 8,
      width: '100%', maxHeight: espansa ? '100%' : 'auto', overflowY: 'auto',
      borderRadius: 16, background: 'var(--s-zone-bg)', border: '1px solid var(--s-zone-border)',
      padding: '12px 14px',
      pointerEvents: 'auto',
    }}>
      {/* ── L'INTESTAZIONE — SEMPRE VISIBILE, come in App.tsx: si trova la zona anche chiusa,
          non solo quando sta già catturando.
          ⚠️ Segnalato: « la gestione dell'assessment come funziona? Voglio che ci sia un
          bottone di attivazione quando non è armato automaticamente da un ciclo ». Il
          meccanismo esisteva già — `onToggle` qui SOTTO `attivo`/`assessAttivo`, lo stesso
          interruttore che arma/disarma davvero la cattura in `Serenity.tsx` — ma si leggeva
          come una freccia d'accordion (▸/▾), non come un interruttore ON/OFF: sostituito con
          un vero interruttore (l'anello vuoto/pieno sotto).
          ⚠️ Segnalato DI NUOVO: « assessment deve poter essere disattivato ma lasciando
          vedere gli item con le reazioni... separa la chiusura dalla disattivazione ». I DUE
          gesti erano lo STESSO click — spegnere la cattura nascondeva anche gli item già
          raccolti. Ora sono DUE bottoni distinti, non uno annidato nell'altro: il TITOLO
          (a sinistra, con la freccia ▸/▾) apre/chiude la VISTA — `espansa`, sopra, mai tocca
          la cattura; l'ANELLO (a destra) resta SOLO l'interruttore della cattura — mai tocca
          la vista. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <button
          className="s-glass-btn"
          onClick={() => setEspansa(v => !v)}
          title={(espansa
            ? LC('chiudi la vista', 'fermer la vue', 'close the view', 'cerrar la vista', 'stäng vyn')
            : LC('apri la vista', 'ouvrir la vue', 'open the view', 'abrir la vista', 'öppna vyn')) as string}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1,
            border: 'none', borderRadius: 10, background: 'transparent', cursor: 'pointer',
            /* ⚠️ +1/3 — segnalato: « aumenta di 1/3 l'altezza dei bottoni ASSESSMENT e ATTIVA ».
               Misurato dal vivo: 19px veri. 19 × 4/3 ≈ 25. */
            padding: '2px 2px', minHeight: 25, fontFamily: 'var(--s-sans)', textAlign: 'left',
          }}>
          <span style={{ fontSize: 'var(--s-fs-micro)', color: 'var(--s-ink-ghost)', flexShrink: 0 }}>
            {espansa ? '▾' : '▸'}
          </span>
          <span style={{
            fontSize: 'var(--s-fs-sm)', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700,
            color: attivo ? 'var(--s-still)' : 'var(--s-ink-faint)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {vista === 'assess' ? LC('assessment', 'assessment', 'assessment', 'assessment', 'assessment') : t('ri_title_manual')}
            {righe.length > 0 ? ` · ${righe.length}` : ''}
          </span>
        </button>
        <button
          className="s-glass-btn"
          onClick={onToggle}
          title={(attivo
            ? LC('disattiva la cattura (gli item restano visibili)', 'désactiver la capture (les items restent visibles)',
                 'deactivate capture (items stay visible)', 'desactivar la captura (los ítems siguen visibles)',
                 'inaktivera insamling (objekten förblir synliga)')
            : LC('attiva la cattura', 'activer la capture', 'activate capture', 'activar la captura', 'aktivera insamling')) as string}
          style={{
            display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
            border: 'none', borderRadius: 10, background: 'transparent', cursor: 'pointer',
            /* ⚠️ +1/3 — segnalato: « aumenta di 1/3 l'altezza dei bottoni ASSESSMENT e ATTIVA ».
               Misurato dal vivo: 18px veri. 18 × 4/3 = 24. */
            padding: '2px 2px', minHeight: 24, fontFamily: 'var(--s-sans)',
          }}>
          {/* ⚠️ LA SCRITTA C'ERA SOLO SPENTA — segnalato: « quando schiacci ACTIVER, si deve
              vedere DESACTIVER ». Prima, da accesa, non restava NESSUNA parola (solo
              l'anello) — chi guardava non sapeva più cosa avrebbe fatto il click. Ora la
              scritta resta SEMPRE, e cambia parola con lo stato: esattamente la stessa
              logica del pallino appena sotto (pieno/vuoto), non una seconda invenzione. */}
          <span style={{
            fontSize: 'var(--s-fs-micro)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 700,
            color: attivo ? 'var(--s-still)' : 'var(--s-ink-faint)',
          }}>
            {attivo
              ? LC('disattiva', 'désactiver', 'deactivate', 'desactivar', 'inaktivera')
              : LC('attiva', 'activer', 'activate', 'activar', 'aktivera')}
          </span>
          {/* ── L'INTERRUTTORE — un anello: pieno e colorato se `attivo`, vuoto se no. Stessa
              famiglia visiva dei pallini di stato della pillola strumenti in `Serenity.tsx`,
              non un'invenzione a sé. */}
          <span aria-hidden="true" style={{
            width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
            border: `1.5px solid ${attivo ? 'var(--s-still)' : 'var(--s-ink-ghost)'}`,
            background: attivo ? 'var(--s-still)' : 'transparent',
            transition: 'background var(--s-calm) var(--s-ease), border-color var(--s-calm) var(--s-ease)',
          }} />
        </button>
      </div>
      {espansa && (
        <>
          {/* ── IL SELETTORE DI VISTA — solo se `onIndica` è stato dato: senza (assessment
              ancora non collegato all'R&I) la seconda vista non avrebbe niente da fare. */}
          {onIndica && (
            <div style={{ display: 'flex', gap: 3, borderRadius: 8, padding: 2, background: 'var(--s-disc-sunk)', alignSelf: 'flex-start' }}>
              {(['assess', 'ri'] as const).map(v => (
                <button key={v} onClick={() => setVista(v)} style={{
                  border: 'none', cursor: 'pointer', borderRadius: 6, padding: '3px 10px',
                  fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-micro)', letterSpacing: '0.04em',
                  textTransform: 'uppercase', fontWeight: 700,
                  background: vista === v ? 'var(--s-disc)' : 'transparent',
                  color: vista === v ? 'var(--s-still)' : 'var(--s-ink-faint)',
                }}>
                  {v === 'assess' ? t('ri_view_assess') : t('ri_view_indication')}
                </button>
              ))}
            </div>
          )}

          {/* ── SCRIVERE UN ITEM TROVATO IN UN ALTRO MODO — solo in vista INDICAZIONE. */}
          {vista === 'ri' && onAggiungiItem && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  value={bozza}
                  onChange={e => setBozza(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') aggiungi(); }}
                  placeholder={t('ri_write_item') as string}
                  style={{
                    flex: 1, minWidth: 0, border: '1px solid var(--s-ink-ghost)', borderRadius: 8,
                    background: 'var(--s-disc-sunk)', outline: 'none', padding: '5px 8px',
                    fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-sm)', color: 'var(--s-ink)',
                  }}
                />
                <button onClick={aggiungi} disabled={!bozza.trim()} className="s-glass-btn" style={{
                  border: 'none', borderRadius: 8, padding: '0 12px', flexShrink: 0,
                  cursor: bozza.trim() ? 'pointer' : 'default', opacity: bozza.trim() ? 1 : 0.4,
                  background: 'var(--s-disc)', color: 'var(--s-ink)', fontSize: 'var(--s-fs-base)',
                }}>+</button>
              </div>
              {/* LA PROPOSTA — quella parola è già stata detta in seduta: eccola, con la lettura
                  di quel momento. Cliccarla accetta l'istante vero invece di ADESSO. */}
              {proposta && (
                <button onClick={aggiungi} style={{
                  textAlign: 'left', border: '1px solid var(--s-reserve)', borderRadius: 8,
                  background: 'var(--s-disc-sunk)', cursor: 'pointer', padding: '6px 8px',
                }}>
                  <span style={{ fontSize: 'var(--s-fs-micro)', color: 'var(--s-reserve)' }}>
                    {t('ri_said_at')} {proposta.tSec.toFixed(0)}s · <b>{proposta.read === 'NULL' ? t('ri_no_read') : proposta.read}</b>
                  </span>
                  <span style={{ display: 'block', marginTop: 2, fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-micro)', color: 'var(--s-ink-faint)' }}>
                    « {proposta.frase} »
                  </span>
                </button>
              )}
            </div>
          )}

          {/* ── « INDICATE », UNA SOLA VOLTA IN CIMA — segnalato: due correzioni sullo stesso
              punto. Prima: « OUI/NON deve avere l'indicazione di cosa è » — risposto scrivendo
              la frase intera su OGNI bottone (`✓ indica`/`✗ non indica`), ma quella frase
              ripetuta a ogni riga non ci stava nello spazio stretto di questa colonna: « does
              not... non si vede, è fuori campo ». Ora l'etichetta vive UNA volta sola, come
              intestazione di colonna — i bottoni tornano corti (`ri_yes`/`ri_no`, "Sì"/"No")
              e ci stanno. Allineata con `justifyContent:'flex-end'`, lo STESSO bordo destro a
              cui la riga dei bottoni si allinea (`justifyContent:'space-between'` sotto): non
              serve calcolare una posizione, i due bordi combaciano da soli. */}
          {onIndica && righe.some(a => a.reaction !== null) && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingRight: 2 }}>
              <span style={{ fontSize: 'var(--s-fs-micro)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--s-ink-faint)' }}>
                {t('ri_indicates')}
              </span>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', minHeight: 0 }}>
            {righe.length === 0 ? (
              vista === 'assess' ? (
                // ⚠️ « in ascolto… » diceva sempre la stessa cosa anche a cattura SPENTA —
                // ora distingue: pulsa solo se `attivo` sta davvero ascoltando, altrimenti
                // dice che è ferma (nessuna animazione: non c'è nulla in corso da notare).
                <span className={attivo ? 'ser-pulse' : undefined} style={{ fontSize: 'var(--s-fs-base)', color: 'var(--s-ink-faint)' }}>
                  {attivo
                    ? LC('in ascolto…', 'à l\'écoute…', 'listening…', 'escuchando…', 'lyssnar…')
                    : LC('cattura disattivata', 'capture désactivée', 'capture off', 'captura desactivada', 'insamling avstängd')}
                </span>
              ) : (
                <span style={{ fontSize: 'var(--s-fs-sm)', fontStyle: 'italic', color: 'var(--s-ink-faint)' }}>
                  {t('ri_empty')}
                </span>
              )
            ) : righe.slice().reverse().map(it => {
              const inAttesa = it.reaction === null;
              const colore = inAttesa ? 'var(--s-ink-faint)'
                : it.reaction === 'NULL' ? 'var(--s-ink-faint)'
                : it.reaction === READ_NON_MISURATO ? 'var(--s-reserve)'
                : 'var(--s-still)';
              return (
                <div key={it.id} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                    <span style={{ fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-sm)', color: 'var(--s-ink-faint)', flexShrink: 0 }}>
                      {orologio(it.time)}
                    </span>
                    <span style={{ fontFamily: 'var(--s-serif)', fontSize: 'var(--s-fs-base)', color: 'var(--s-ink)' }}>
                      {it.item}
                    </span>
                    {righe.filter(a => a.gruppo === it.gruppo).length > 1 && (
                      <span style={{ fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-sm)', color: 'var(--s-ink-ghost)' }}>
                        ×{righe.filter(a => a.gruppo === it.gruppo && a.time <= it.time).length}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginLeft: 62 }}>
                    {/* La lettura — un verdetto unico (ASSESSMENT) o due colonne separate
                        (INDICAZIONE con entrambi gli strumenti: leggono item diversi, un
                        verdetto solo nasconderebbe proprio il dato che si cerca). */}
                    {vista === 'assess' || !dueAghi ? (
                      <span className={inAttesa ? 'ser-pulse' : undefined} style={{
                        fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-sm)', color: colore, display: 'flex', gap: 6, alignItems: 'baseline',
                      }}>
                        {dueAghi && it.readSrc && (
                          <span style={{ fontSize: 'var(--s-fs-micro)', color: 'var(--s-ink-ghost)' }}>
                            {it.readSrc === 'eeg' ? 'MUSE' : 'METER'}
                          </span>
                        )}
                        {inAttesa
                          ? LC('in lettura…', 'en lecture…', 'reading…', 'leyendo…', 'läser…')
                          : it.reaction === 'NULL'
                            ? LC('nessuna reazione', 'aucune réaction', 'no reaction', 'sin reacción', 'ingen reaktion')
                            : it.reaction === READ_NON_MISURATO
                              ? LC('non misurato', 'non mesuré', 'not measured', 'no medido', 'inte mätt')
                              : `${it.reaction}${it.beforeMs > 0 ? ` −${it.beforeMs}ms` : it.afterMs > 0 ? ` +${it.afterMs}ms` : ''}`}
                      </span>
                    ) : (
                      <span style={{ display: 'flex', gap: 10, fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-sm)' }}>
                        <span style={{ color: it.readMuse && it.readMuse !== 'NULL' ? 'var(--s-still)' : 'var(--s-ink-ghost)' }}>
                          M {it.readMuse && it.readMuse !== 'NULL' ? it.readMuse : '—'}
                        </span>
                        <span style={{ color: it.readMeter && it.readMeter !== 'NULL' ? 'var(--s-reserve)' : 'var(--s-ink-ghost)' }}>
                          T {it.readMeter && it.readMeter !== 'NULL' ? it.readMeter : '—'}
                        </span>
                      </span>
                    )}

                    {/* ── L'INDICAZIONE — sulla riga dell'item, in ENTRAMBE le viste (App.tsx:
                        « è lì che l'auditor la dà »). La lettura non ancora decisa non si può
                        indicare: niente ancora da confermare. */}
                    {onIndica && !inAttesa && (
                      it.indica === undefined ? (
                        // ⚠️ SEGNALATO DI NUOVO — due correzioni sullo stesso punto. Prima:
                        // « OUI/NON deve avere l'indicazione di cosa è » (risposto scrivendo la
                        // frase intera su ogni bottone). Poi: « INDICATE sembra già scelto —
                        // mettili tutti e due grigi e cambia colore quando è scelto » (il verde
                        // su "indica" PRIMA di cliccare lo faceva sembrare già selezionato) e
                        // « does not... non si vede, fuori campo — scrivi Sì/No e sopra
                        // un'intestazione INDICATE » (la frase intera non ci stava nello
                        // spazio stretto). Ora: `ri_yes`/`ri_no` corti (l'intestazione qui
                        // sopra spiega cosa vogliono dire), ENTRAMBI grigi finché non scelti —
                        // il colore arriva SOLO dopo, nel bottone singolo che li sostituisce
                        // (sotto), mai prima.
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <button onClick={() => onIndica(it.id, true)} title={t('ri_indicates') as string} style={{
                            border: '1px solid var(--s-ink-ghost)', borderRadius: 999, padding: '2px 9px',
                            background: 'transparent', cursor: 'pointer', fontSize: 'var(--s-fs-micro)',
                            color: 'var(--s-ink-faint)', fontFamily: 'var(--s-sans)',
                          }}>
                            {t('ri_yes')}
                          </button>
                          <button onClick={() => onIndica(it.id, false)} title={t('ri_does_not_indicate') as string} style={{
                            border: '1px solid var(--s-ink-ghost)', borderRadius: 999, padding: '2px 9px',
                            background: 'transparent', cursor: 'pointer', fontSize: 'var(--s-fs-micro)',
                            color: 'var(--s-ink-faint)', fontFamily: 'var(--s-sans)',
                          }}>
                            {t('ri_no')}
                          </button>
                        </span>
                      ) : (
                        <button onClick={() => onIndica(it.id, !it.indica)} style={{
                          border: 'none', background: 'transparent', cursor: 'pointer',
                          fontSize: 'var(--s-fs-micro)', fontFamily: 'var(--s-sans)',
                          color: it.indica ? 'var(--s-still)' : 'var(--s-ink-faint)',
                        }}>
                          {it.indica ? `✓ ${t('ri_indicates')}` : `✗ ${t('ri_does_not_indicate')}`}
                        </button>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── IL CONTO — quante volte la lettura di ciascun ago ha indicato al preclear. La
              sola forma in cui « quale dei due segue la carica » ha una risposta, perché il
              criterio non viene da nessuno dei due strumenti. Compare solo a validazioni
              presenti. */}
          {onIndica && items.some(a => a.indica !== undefined) && (
            <div style={{ display: 'flex', gap: 14, paddingTop: 6, borderTop: '1px solid var(--s-ink-ghost)' }}>
              {dueAghi ? (
                <>
                  {(() => { const r = resa(items, a => a.readMuse); return (
                    <span style={{ fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-micro)', color: 'var(--s-still)' }}>MUSE {r.si}/{r.tot}</span>
                  ); })()}
                  {(() => { const r = resa(items, a => a.readMeter); return (
                    <span style={{ fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-micro)', color: 'var(--s-reserve)' }}>METER {r.si}/{r.tot}</span>
                  ); })()}
                </>
              ) : (() => { const r = resa(items, a => a.reaction ?? undefined); return (
                <span style={{ fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-micro)', color: 'var(--s-still)' }}>{t('ri_indicates')} {r.si}/{r.tot}</span>
              ); })()}
            </div>
          )}
        </>
      )}
    </div>
  );
}
