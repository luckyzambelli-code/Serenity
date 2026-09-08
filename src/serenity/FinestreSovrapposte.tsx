/**
 * FinestreSovrapposte — i modali a tutta pagina montati fratelli dell'`<header>`: la modalità
 * HELP a post-it, Guida, Crediti, l'animazione iniziale, Dizionario, Storico, Processus e il
 * visore PDF. Ottavo pezzo staccato dal corpo di `Serenity.tsx` (v. `docs/serenity-refonte.md`
 * per la cronologia completa). Copiato verbatim — ogni commento storico preservato, nessuna
 * riga di logica toccata.
 *
 * ── COSA RESTA FUORI DI PROPOSITO ────────────────────────────────────────────────────────────
 * Ogni azione COMPOSTA (`onSelectProcedimento` azzera tre stati insieme, non solo uno) resta
 * costruita QUI dentro TALE E QUALE com'era in `Serenity.tsx` — non incapsulata in un callback a
 * parte, perché non lo era nemmeno prima: i quattro `setX` che compone restano stato di
 * `Serenity.tsx`, passati giù singolarmente. `t`/`lang` sono presi QUI, internamente (via
 * `useI18n`) — stessa ragione già scritta negli ultimi giri. `AiutoOverlay` (la modalità HELP,
 * prima una funzione locale di `Serenity.tsx` usata SOLO qui) si è trasferita con lui, non
 * duplicata — stessa ragione di `Divisore`/`OraReale` nei giri precedenti.
 * ⚠️ CORRETTO — segnalato nella revisione completa: `LC` invece NON è preso qui internamente,
 * come diceva questo commento prima — era l'unico, insieme a `GruppoBasso.tsx` (v. la sua
 * nota, stessa correzione), a ricalcolarla da sé (`useI18n()` + `pick5` locali) invece di
 * riceverla come prop da `Serenity.tsx`, dove vive l'unica `const LC = ...` — come fanno
 * `Intestazione.tsx`/`BarraLaterale.tsx`/`GruppoAlto.tsx` e il resto dei fratelli.
 *
 * @see docs/serenity-refonte.md — giro di scomposizione, 2026-09-07.
 */
import React, { Suspense, lazy, useEffect, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { useI18n } from '../i18n';
import { GuideModal } from '../components/GuideModal';
import { CreditsModal } from '../components/CreditsModal';
import { SplashScreen } from '../components/SplashScreen';
import { DizionarioModal } from './DizionarioModal';
import { ProcessusModal, type ProcessusEntry } from '../components/ProcessusModal';
import { apriCartellaProcedimenti, type Procedimento } from '../lib/procedimenti';
import type { UserProfile } from '../lib/storage';

/** ── HISTORY, CARICATA A RICHIESTA — v. la nota originale in `Serenity.tsx`: lo stesso
 *  `HistoryModal` di App.tsx, TALE E QUALE (i suoi `getSessionsByProfile`/`getSessionPdfAsync`
 *  leggono l'ARCHIVIO UNICO — le sedute chiuse qui compaiono anche dall'altra parte, e
 *  viceversa). `lazy`, come App.tsx: legge `jspdf`/blob helpers che non servono finché nessuno
 *  apre lo storico. SPOSTATO QUI da `Serenity.tsx`: il suo unico uso vero viveva dentro. */
const HistoryModal = lazy(() => import('../components/HistoryModal').then(m => ({ default: m.HistoryModal })));

/**
 * AiutoOverlay — LA MODALITÀ HELP, A POST-IT.
 *
 * ── PERCHÉ ESISTE ───────────────────────────────────────────────────────────────────────────
 * Segnalato: « vorrei che cliccando su HELP appaiano sui bottoni e zone le spiegazioni di cosa
 * sono, sotto forma di post-it ». Bozzetto mostrato con due varianti (tutti insieme vs uno per
 * volta al passaggio) — scelta esplicita: « option A », tutti insieme con un solo click.
 *
 * ── PERCHÉ `data-help`, NON UN COMPONENTE CHE AVVOLGE OGNI BOTTONE ─────────────────────────
 * I controlli da spiegare sono sparsi per migliaia di righe (barra in alto, i cinque cerchi,
 * CONFIG...). Avvolgere ciascuno in un contenitore `position:relative` + un componente
 * post-it sarebbe stata una modifica invasiva ripetuta decine di volte. Invece: un attributo
 * `data-help="testo"` in più su ogni bottone già esistente (una riga, il testo quasi sempre
 * già scritto per il suo `title` — non un'invenzione), e QUESTO componente, montato una sola
 * volta, che li trova tutti da solo (`querySelectorAll('[data-help]')`) e disegna un post-it
 * sotto ciascuno, in un livello `position:fixed` sopra tutto. Aggiungere una spiegazione a un
 * bottone nuovo, domani, vuol dire aggiungere un attributo — non toccare questo componente.
 *
 * ── RICALCOLO, NON OSSERVAZIONE ─────────────────────────────────────────────────────────────
 * Le posizioni cambiano poco (resize, scroll) — un intervallo blando (400ms) invece di un
 * `ResizeObserver` per bottone: più semplice, e la differenza non si vede a occhio per
 * un'etichetta che deve solo restare vicina al suo bottone, non seguirlo pixel a pixel.
 */
// Larghezza/altezza presunte di un post-it — servono solo a stimare le sovrapposizioni
// (v. `impila`, sotto), non sono un valore rigido: `maxWidth` nel disegno resta la stessa.
const POSTIT_W = 168, POSTIT_H = 44;
/**
 * ⚠️ BUG TROVATO — segnalato: « l'HELP sovrappone i post-it e non si legge nulla ». Ogni
 * post-it si piazzava SEMPRE alla stessa altezza (subito sotto il suo bottone) — due bottoni
 * vicini (es. MUSE/METER/SANS INSTRUMENTS, tre pillole a un dito di distanza) producevano due
 * riquadri uno sopra l'altro, illeggibili insieme. `impila` è un ripiano a righe: ordina i
 * post-it da sinistra a destra, e per ciascuno cerca la prima riga (dall'alto) dove non tocca
 * un altro già piazzato — se la trova libera resta alla sua altezza naturale, se le prime
 * righe sono già occupate scende a quella dopo. Un gruppo fitto di bottoni finisce così su
 * più righe impilate invece che sovrapposto nello stesso rettangolo.
 */
function impila(grezzi: { x: number; y: number; text: string }[]): { x: number; yBottone: number; y: number; text: string }[] {
  const ordinati = [...grezzi].sort((a, b) => a.x - b.x);
  const righeOccupate: Array<Array<{ min: number; max: number }>> = [];
  return ordinati.map(p => {
    const min = p.x - POSTIT_W / 2, max = p.x + POSTIT_W / 2;
    let riga = 0;
    while (righeOccupate[riga]?.some(o => min < o.max + 6 && max > o.min - 6)) riga++;
    (righeOccupate[riga] ??= []).push({ min, max });
    return { ...p, yBottone: p.y, y: p.y + riga * POSTIT_H };
  });
}
function AiutoOverlay({ attivo }: { attivo: boolean }) {
  const [postIt, setPostIt] = useState<{ x: number; yBottone: number; y: number; text: string }[]>([]);
  useEffect(() => {
    if (!attivo) { setPostIt([]); return; }
    const ricalcola = () => {
      const nodi = Array.from(document.querySelectorAll<HTMLElement>('[data-help]'));
      const grezzi = nodi.map(n => {
        const r = n.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.bottom, text: n.getAttribute('data-help') || '' };
      }).filter(p => p.text);
      setPostIt(impila(grezzi));
    };
    ricalcola();
    window.addEventListener('resize', ricalcola);
    window.addEventListener('scroll', ricalcola, true);
    const id = window.setInterval(ricalcola, 400);
    return () => { window.removeEventListener('resize', ricalcola); window.removeEventListener('scroll', ricalcola, true); window.clearInterval(id); };
  }, [attivo]);
  if (!attivo) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, pointerEvents: 'none' }}>
      {/* ⚠️ CORRETTO — segnalato nella revisione completa (stessa famiglia della correzione in
          `GiornaleSeduta.tsx`, v. la sua nota): `key={i}` qui è meno rischioso (l'array è
          RICALCOLATO da zero ogni giro da `querySelectorAll`, che restituisce sempre lo stesso
          ordine — quello del DOM — non un elenco che cresce), ma resta un indice, non
          un'identità. Il testo del post-it (`p.text`, unico per bottone spiegato) più la sua Y
          di ancoraggio è già stabile e specifico per QUEL post-it, a prova anche del caso raro
          di due bottoni con la stessa spiegazione a altezze diverse. */}
      {postIt.map((p) => (
        <React.Fragment key={`${p.text}-${Math.round(p.yBottone)}`}>
          {/* ⚠️ AGGIUNTO — segnalato: « i post-it non sono posizionati correttamente, devi
              mettere un qualcosa che li collega alla zona che spiegano ». Un post-it "impilato"
              (`impila`, sopra: righe successive per non sovrapporsi ai vicini) può finire
              lontano dal suo bottone — senza un segno, non si capisce più QUALE bottone spiega.
              Una lineetta verticale sottile dal vero bordo del bottone (`p.yBottone`) fino al
              post-it (`p.y`) quando sono stati separati (`p.y > p.yBottone`, cioè impilato su
              una riga successiva) — un filo, non una freccia elaborata: basta a dire "questo
              qui sotto parla di quel bottone lassù". */}
          {p.y > p.yBottone && (
            <div style={{
              position: 'fixed', left: p.x - 1, top: p.yBottone, width: 2, height: p.y - p.yBottone,
              background: 'rgba(253,230,138,0.55)',
            }} />
          )}
          {/* Il "codino" — un piccolo triangolo che punta verso il bottone, come nei fumetti:
              collega il post-it al SUO punto (che sia appena sotto il bottone, o in fondo alla
              lineetta quando impilato più in basso) senza bisogno di leggere le coordinate. */}
          <div style={{
            position: 'fixed', left: p.x - 5, top: p.y, width: 0, height: 0,
            borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
            borderBottom: '5px solid #fde68a',
          }} />
          <div style={{
            position: 'fixed', left: p.x, top: p.y + 5, transform: 'translateX(-50%)',
            maxWidth: POSTIT_W, padding: '7px 10px', borderRadius: 3,
            background: '#fde68a', color: '#78350f', fontSize: 11, fontWeight: 600,
            lineHeight: 1.35, textAlign: 'center', fontFamily: 'var(--s-sans)',
            boxShadow: '2px 3px 8px rgba(0,0,0,0.35)',
          }}>
            {p.text}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

export interface FinestreSovrapposteProps {
  helpAttivo: boolean;
  guidaAperta: boolean;
  setGuidaAperta: (v: boolean) => void;
  creditiAperti: boolean;
  setCreditiAperti: (v: boolean) => void;
  showSplash: boolean;
  setShowSplash: (v: boolean) => void;
  dizionarioAperto: boolean;
  setDizionarioAperto: (v: boolean) => void;
  historyAperto: boolean;
  setHistoryAperto: (v: boolean) => void;
  profiliAuditor: UserProfile[];
  auditorId: string | null | undefined;
  processusAperto: boolean;
  setProcessusAperto: (v: boolean) => void;
  processusPdfs: ProcessusEntry[];
  setProcessusPdfs: (v: ProcessusEntry[] | ((v: ProcessusEntry[]) => ProcessusEntry[])) => void;
  pendingFiles: { name: string; url: string }[];
  setPendingFiles: (v: { name: string; url: string }[] | ((v: { name: string; url: string }[]) => { name: string; url: string }[])) => void;
  pendingTagInput: string;
  setPendingTagInput: Dispatch<SetStateAction<string>>;
  processusTagFilter: string;
  setProcessusTagFilter: Dispatch<SetStateAction<string>>;
  editingTag: string | null;
  setEditingTag: Dispatch<SetStateAction<string | null>>;
  editingTagValue: string;
  setEditingTagValue: Dispatch<SetStateAction<string>>;
  processusVisualizzato: { name: string; url: string } | null;
  setProcessusVisualizzato: (v: { name: string; url: string } | null) => void;
  procedimenti: Procedimento[];
  setProcedimentoAttivo: (p: Procedimento | null) => void;
  setFuocoProcedimentoStato: (v: number) => void;
  setRisposteProcedimento: (v: Record<number, { auditor: string; pc: string; modificato: boolean }>) => void;
  domandeLoggateRef: MutableRefObject<Set<number>>;
  processusSoloComandi: boolean;
  LC: (it: string, fr: string, en: string, es: string, sv: string) => string;
}

export function FinestreSovrapposte({
  helpAttivo, guidaAperta, setGuidaAperta, creditiAperti, setCreditiAperti,
  showSplash, setShowSplash, dizionarioAperto, setDizionarioAperto, historyAperto, setHistoryAperto,
  profiliAuditor, auditorId, processusAperto, setProcessusAperto, processusPdfs, setProcessusPdfs,
  pendingFiles, setPendingFiles, pendingTagInput, setPendingTagInput, processusTagFilter,
  setProcessusTagFilter, editingTag, setEditingTag, editingTagValue, setEditingTagValue,
  processusVisualizzato, setProcessusVisualizzato, procedimenti, setProcedimentoAttivo,
  setFuocoProcedimentoStato, setRisposteProcedimento, domandeLoggateRef, processusSoloComandi, LC,
}: FinestreSovrapposteProps) {
  const { t, lang } = useI18n();

  return (
    <>
      {guidaAperta && <GuideModal lang={lang} app="serenity" onClose={() => setGuidaAperta(false)} />}
      <AiutoOverlay attivo={helpAttivo} />
      {creditiAperti && (
        <CreditsModal onClose={() => setCreditiAperti(false)}
          appName="SERENITY" appVersion={__SERENITY_VERSION__} />
      )}
      {/* ── L'ANIMAZIONE INIZIALE — v. la nota su `showSplash`, sopra. */}
      {showSplash && <SplashScreen onDismiss={() => setShowSplash(false)} appName="SERENITY" />}
      {/* ⚠️ BUG TROVATO — segnalato: « quand on clique sur Historique rien apparaît et on ne
          peut pas sortir ». `HistoryModal` (App.tsx) disegna sé stesso con `absolute inset-0`
          (una classe Tailwind: relativo all'ANTENATO posizionato più vicino), non `fixed`
          come `GuideModal`/`CreditsModal` (`position:'fixed', inset:0`, relativo alla
          FINESTRA). In App.tsx quell'antenato più vicino è già grande quanto lo schermo; qui
          era `<main>`, che ha il suo `padding: '38px 44px'` — il pannello restava chiuso in
          quella cornice piccola, il testo si accavallava, e il bottone "Fermer" (che
          FUNZIONA — non era lui il guasto) si perdeva dentro il disordine, sembrando
          irraggiungibile. Non si può cambiare `HistoryModal` stesso (è condiviso, cambierebbe
          anche EQUILIBRIUM): un involucro `fixed` qui gli dà l'antenato che si aspetta. */}
      {/* ⚠️ SPOSTATO QUI — segnalato con screenshot: il titolo "DIZIONARIO TECNICO" si
          sovrapponeva, illeggibile, all'intestazione vera di SERENITY. Non era la trasparenza
          dello sfondo (corretta comunque, v. `DizionarioModal.tsx`): il montaggio viveva
          dentro `.ser-comandi` (`zIndex:8`, accanto al bottone che lo apre) — un `position:
          fixed, zIndex:200` DENTRO un contenitore con `zIndex` più basso di `<header>`
          (`zIndex:10`) non vince MAI contro di lui: lo z-index di un elemento conta solo
          dentro il proprio contesto di impilamento, non può "scavalcare" quello del genitore.
          Qui, fratello di `<header>` e degli altri modali (`historyAperto`/`processusAperto`,
          sotto), il suo `zIndex:200` fa davvero da solo sopra tutto. */}
      {dizionarioAperto && <DizionarioModal lang={lang} onClose={() => setDizionarioAperto(false)} />}
      {historyAperto && (
        <div className="ser-history-wrap" style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
          <Suspense fallback={null}>
            <HistoryModal
              activeProfile={profiliAuditor.find(p => p.id === auditorId) ?? null}
              onClose={() => setHistoryAperto(false)}
              lang={lang as never}
            />
          </Suspense>
        </div>
      )}
      {/* ── PROCESSUS — stesso involucro `fixed`, stessa ragione di `HistoryModal` sopra:
          `ProcessusModal` disegna sé stesso con `absolute inset-0`, e senza un antenato
          grande quanto lo schermo resterebbe chiuso nella cornice piccola di `<main>`. */}
      {processusAperto && (
        <div className="ser-processus-wrap" style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
          <ProcessusModal
            processusPdfs={processusPdfs}
            setProcessusPdfs={setProcessusPdfs}
            pendingFiles={pendingFiles}
            setPendingFiles={setPendingFiles}
            pendingTagInput={pendingTagInput}
            setPendingTagInput={setPendingTagInput}
            processusTagFilter={processusTagFilter}
            setProcessusTagFilter={setProcessusTagFilter}
            editingTag={editingTag}
            setEditingTag={setEditingTag}
            editingTagValue={editingTagValue}
            setEditingTagValue={setEditingTagValue}
            onSelectProcessus={entry => { setProcessusVisualizzato({ name: entry.name, url: entry.url }); setProcessusAperto(false); }}
            onClose={() => setProcessusAperto(false)}
            t={k => t(k as never) as string}
            procedimenti={procedimenti}
            onSelectProcedimento={p => {
              // ⚠️ AGGIUNTO — un procedimento NUOVO riparte pulito: fuoco al primo comando,
              // nessuna risposta/domanda ereditata da un giro precedente (anche con lo STESSO
              // procedimento riaperto — v. la nota grande sulle tre variabili, sopra).
              setProcedimentoAttivo(p); setProcessusAperto(false);
              setFuocoProcedimentoStato(0); setRisposteProcedimento({}); domandeLoggateRef.current.clear();
            }}
            onApriCartellaProcedimenti={() => { apriCartellaProcedimenti(); }}
            soloComandi={processusSoloComandi}
          />
        </div>
      )}
      {/* ── IL VISORE — un PDF alla volta, non le finestre multiple trascinabili di App.tsx
          (`activeProcessus`, dichiarato un raffinamento ancora aperto). Un `<iframe>` sul PDF
          scelto, chiudibile: quel che serve per LEGGERE il processo durante la seduta. */}
      {processusVisualizzato && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column',
          background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)', padding: 24,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 10, flexShrink: 0,
          }}>
            <span style={{ fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', color: '#fff' }}>
              {processusVisualizzato.name}
            </span>
            <button onClick={() => setProcessusVisualizzato(null)} style={{
              border: 'none', background: 'rgba(255,255,255,0.12)', color: '#fff',
              borderRadius: 999, padding: '6px 16px', cursor: 'pointer',
              fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)',
            }}>
              {LC('chiudi', 'fermer', 'close', 'cerrar', 'stäng')}
            </button>
          </div>
          <iframe src={processusVisualizzato.url} title={processusVisualizzato.name}
            style={{ flex: 1, border: 'none', borderRadius: 12, background: '#fff' }} />
        </div>
      )}
    </>
  );
}
