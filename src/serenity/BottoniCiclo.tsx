/**
 * BottoniCiclo — i bottoni/l'interazione di TONE SCALE, MIRROR, CONTACT/NULL, TRUTH quando un
 * metodo è armato — il pezzo più denso finora staccato da `Serenity.tsx` (dopo i nove
 * dell'intestazione e `ZonaMna.tsx`).
 *
 * ── PERCHÉ QUESTO PEZZO, COSÌ COM'ERA ────────────────────────────────────────────────────────
 * Non un blocco JSX qualunque isolato per l'occasione: era già un `const bottoniCiclo = (...)`
 * a sé in `Serenity.tsx`, usato IDENTICO in due punti diversi della resa (con un metodo scelto,
 * e nel fratello per "nessun metodo ancora scelto") — chi lo ha scritto aveva già riconosciuto
 * il confine, solo non gli aveva ancora dato un file/un nome proprio. Questa estrazione lo
 * completa: STESSO testo, STESSI commenti (la cronologia di ogni bug trovato — `itemConfirmedRef`,
 * l'ordine `resetTone()`/`localizzaTone()`, il blocco del ratchet…), zero riga di logica
 * riscritta. I quattro hook di ciclo (`tone`/`mirror`/`cycles`/`truth`) arrivano TALI E QUALI —
 * gli stessi oggetti che `useToneCycle`/`useMirrorCycle`/`useContactNullCycle`/`useTruthCycle`
 * restituiscono a `Serenity.tsx` — non se ne ricalcola né se ne re-imposta nessun campo.
 *
 * @see docs/serenity-refonte.md — giro di scomposizione, 2026-09-07.
 */
import type { MutableRefObject } from 'react';
import { useI18n } from '../i18n';
import { CycleStatusBar } from '../components/CycleStatusBar';
import type { useToneCycle } from '../session/useToneCycle';
import type { useMirrorCycle } from '../session/useMirrorCycle';
import type { useContactNullCycle } from '../session/useContactNullCycle';
import type { useTruthCycle } from '../session/useTruthCycle';

export interface BottoniCicloProps {
  aperta: boolean;
  toneAttivo: boolean;
  setToneAttivo: (v: boolean) => void;
  tone: ReturnType<typeof useToneCycle>;
  /** `noInstruments({ muse: museOk, theta: meterC })` — già calcolato da chi monta. */
  senzaMisura: boolean;
  tonoScelto: boolean;
  setTonoScelto: (v: boolean) => void;
  itemConfirmedRef: MutableRefObject<boolean>;
  mirror: ReturnType<typeof useMirrorCycle>;
  museOk: boolean;
  cycles: ReturnType<typeof useContactNullCycle>;
  deltaStar: number;
  deltaStarN: number;
  isLightTheme: boolean;
  museContact: boolean;
  truth: ReturnType<typeof useTruthCycle>;
  LC: (it: string, fr: string, en: string, es: string, sv: string) => string;
}

export function BottoniCiclo({
  aperta, toneAttivo, setToneAttivo, tone, senzaMisura, tonoScelto, setTonoScelto,
  itemConfirmedRef, mirror, museOk, cycles, deltaStar, deltaStarN, isLightTheme, museContact,
  truth, LC,
}: BottoniCicloProps) {
  const { t } = useI18n();

  /** ⚠️ `whiteSpace:'nowrap'` — segnalato: « le scritte dei comandi dobbiamo allargarle per
   *  renderle su una riga se possibile ». Un bottone-pillola è largo quanto il suo contenuto
   *  (`alignItems:'flex-start'` sul contenitore, nessuna `width` fissa) — senza `nowrap` il
   *  testo, se non ci stava nello spazio rimasto, andava a capo DENTRO la pillola invece di
   *  restare su una riga sola. */
  const pillBtn = (colore: string, dimensione = 17): React.CSSProperties => ({
    cursor: 'pointer', borderRadius: 999, padding: '5px 14px', background: 'var(--s-disc)',
    fontFamily: 'var(--s-sans)', fontSize: dimensione, color: colore, whiteSpace: 'nowrap',
  });

  return (
    <>
      {/* ── TONE SCALE, ATTIVO — locate → raise → done, si ripete per ogni resistenza ────────
          (a) LOCALIZZA: da dove si parte (misurato col meter, o dichiarato dall'auditor senza
          strumenti); (b) RAISE: il comando "portalo a tono 40" ripetuto finché non c'è più
          reazione, poi dichiarato raggiunto; (c) DONE: si riparte con un'altra resistenza, o
          si esce del tutto. Stesse chiamate al motore di App.tsx (`localizzaTone`/
          `chiudiTone`/`resetTone`), stesso testo dei tre tempi. */}
      {aperta && toneAttivo && (
        <>
          {/* ⚠️ « DAI L'ITEM » NON STA PIÙ QUI — segnalato: « le cicle TONE demande d'appuyer
              sur un bouton [...] ENLEVE LE ». Il click sul cerchio TONE (sopra, v. la sua nota)
              arma E localizza nello stesso gesto: `tonePhase` passa da 'locate' a 'raise'
              PRIMA che questo componente si riveda a schermo, quindi questo ramo non è più
              raggiunto in condizioni normali — tolto, non lasciato morto. Il valore di
              partenza senza meter si sceglie ORA prima del click (v. il selettore accanto al
              cerchio TONE), non più qui dopo. */}
          {/* ⚠️ IN CORSO O RAGGIUNTO — segnalato: « mette i due valori [...] ma come auditor
              non si sà se è già stato ottenuto, inganna averli tutti e due indicati ». Prima
              questa scritta era IDENTICA nelle due fasi (stesso `+40` in `--s-reserve`, colore
              che nella dottrina dei tre segnali non significa "raggiunto" ma "dato presente non
              sostenibile" — un quarto senso non previsto). Ora: in salita, `--s-tone-hue`
              (l'identità di TONE, non uno stato) con una freccia che pulsa; raggiunto,
              `--s-still` — LO STESSO segnale che l'AS-IS/F-N usano altrove per "arrivato" — con
              un segno di spunta, niente più pulsare. La stessa distinzione, nell'arco (v.
              `ToneDial`: `animate-pulse` sulla riga ambra solo mentre `raise`). */}
          {/* ⚠️ SEGNALATO — « NON PUÒ ESSERE AUTOMATICA senza strumenti... dice 0 vs +40 in
              corso e lampeggia ». Questa pillola pulsante (e i due bottoni "portalo a tono
              40"/"raggiunto" appena sotto) sono esattamente l'aria "automatica" segnalata:
              senza uno strumento vero, mostrarli PRIMA che l'auditor abbia scelto un livello
              vero significa mostrare un "0 → +40" che non è la misura di nessuno, solo il
              default mai toccato. `senzaMisura && !tonoScelto` li tiene spenti finché la
              scelta (il nuovo select grande, nell'overlay "senza strumenti" — v. la sua nota
              più giù) non è stata fatta davvero; con strumenti (`!senzaMisura`) restano
              esattamente come prima, nessun cambiamento. */}
          {tone.tonePhase === 'raise' && (!senzaMisura || tonoScelto) && (
            <span style={{ fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-base)', color: 'var(--s-ink-faint)' }}>
              {tone.toneAtStart !== null ? `${tone.toneAtStart > 0 ? '+' : ''}${tone.toneAtStart.toFixed(0)} ` : ''}
              <span className="animate-pulse" style={{ color: 'var(--s-tone-hue)', fontWeight: 700 }}>
                → +40 {LC('in corso…', 'en cours…', 'in progress…', 'en curso…', 'pågår…')}
              </span>
            </span>
          )}
          {tone.tonePhase === 'done' && (!senzaMisura || tonoScelto) && (
            <span style={{ fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-base)', color: 'var(--s-ink-faint)' }}>
              {tone.toneAtStart !== null ? `${tone.toneAtStart > 0 ? '+' : ''}${tone.toneAtStart.toFixed(0)} → ` : ''}
              <b style={{ color: 'var(--s-still)' }}>
                ✓ +40 {LC('raggiunto', 'atteint', 'reached', 'alcanzado', 'nådd')}
              </b>
            </span>
          )}
          {tone.tonePhase === 'raise' && (!senzaMisura || tonoScelto) && (
            <>
              <button className="s-glass s-glass-btn" onClick={() => tone.setToneRipetizioni(v => v + 1)} style={pillBtn('var(--s-ink-soft)')}>
                {LC('portalo a tono 40', 'mène-le au ton 40', 'raise it to tone 40', 'llévalo al tono 40', 'för det till ton 40')}
                {tone.toneRipetizioni > 0 ? ` ×${tone.toneRipetizioni}` : ''}
              </button>
              <button className="s-glass s-glass-btn" onClick={() => { tone.chiudiTone(true); tone.setTonePhase('done'); }} style={pillBtn('var(--s-still)')}>
                {LC('tono quaranta raggiunto', 'ton quarante atteint', 'tone forty reached', 'tono cuarenta alcanzado', 'ton fyrtio nådd')}
              </button>
              {/* ⚠️ RIMOSSO — segnalato di nuovo, con forza: « devi togliere UN SURSAUT ISOLÉ,
                  te lo avevo già chiesto in TONE ». Il bottone (« era un colpo isolato »)
                  serviva a sciogliere il pavimento del ratchet "solo salire" quando un colpo
                  isolato veniva promosso a torto — ma esporre all'auditor un dettaglio interno
                  del motore (« pavimento », « ratchet ») non è la sua richiesta: chi conduce non
                  deve capire l'implementazione per correggere una lettura sbagliata. Tolto
                  interamente, non solo nascosto — e con lui, verificato zero chiamanti rimasti
                  in tutto il deposito (SERENITY era l'unico), anche `sciogliPavimento`/
                  `tonePavimentoAttivo` in `useToneCycle.ts`. Il ratchet stesso resta: solo la
                  via per correggerlo a mano durante la salita sparisce. */}
            </>
          )}
          {tone.tonePhase === 'done' && (
            <button className="s-glass s-glass-btn" onClick={() => {
              // ⚠️ CORRETTO (segnalato: « quando dò un'altra resistenza, mi dice di dare
              // l'item... ma non si può scrivere e l'assessment non è armato, si resta
              // bloccati ») — `resetTone()` da solo riporta `tonePhase` a 'locate'
              // (`faseCiclo` diventa `'tone.item'`), ma il bottone "DAI L'ITEM" che un tempo
              // faceva uscire da quella fase è stato tolto apposta (v. la nota sul cerchio
              // TONE, sopra: « ENLEVE LE... arma E localizza nello stesso gesto ») — quel
              // click chiama `localizzaTone()` per la PRIMA resistenza, ma "altra resistenza"
              // non lo rifaceva per la successiva. `ItemDaScrivere` non mostra il bottone "l'ho
              // detta" in `tone.item` (solo in `tone.say_item`, dopo `localizzaTone()`): senza
              // di lui il campo restava un `<input>` senza modo di confermarlo — esattamente
              // bloccato. Stessa chiamata del cerchio, ripetuta qui per ogni resistenza
              // successiva, non solo la prima.
              //
              // ⚠️ SECONDO BUG TROVATO SUBITO DOPO (verificato dal vivo: con la sola riga
              // sopra si saltava DRITTI alla schermata "A CHE TONO SI TROVA?" con la
              // resistenza VECCHIA ancora scritta, senza mai passare per "dì la resistenza")
              // — `itemConfirmedRef` (poco più su in questo file: « STICKY... non deve più
              // tornare falso solo perché il campo è ritoccato ») resta vero dalla resistenza
              // APPENA CHIUSA. Si azzera da sé, ma dentro un `useEffect` che osserva `item`
              // — e quello stesso effetto richiama anche `setItemDigitando(false)`, già
              // falso a questo punto: React non ridisegna per uno stato invariato, quindi
              // l'azzeramento del ref non arriva MAI a un nuovo render finché qualcos'altro,
              // per tutt'altra ragione, non forza uno — cosa che senza strumenti può non
              // succedere mai. `itemNamed` restava quindi vero (dalla resistenza precedente)
              // nello stesso identico render in cui `resetTone()` svuota l'item, e
              // `deriveCyclePhase` saltava 'tone.say_item' passando dritto a 'tone.raise'.
              // Azzerato QUI, PRIMA che `resetTone()` svuoti l'item: il render successivo
              // legge già il ref giusto, senza aspettare l'effetto.
              itemConfirmedRef.current = false;
              // ⚠️ `localizzaTone(true)`, non `localizzaTone()` — segnalato: « in TONE, quando
              // enunci l'item è preso in considerazione ma non si scrive ». `resetTone()` (riga
              // sopra) svuota l'item con uno state React (asincrono) — `localizzaTone()`,
              // chiamata SUBITO dopo nello stesso gesto, leggerebbe ancora l'item VECCHIO dalla
              // propria chiusura (React non ha ancora ridisegnato) e crederebbe il campo non
              // vuoto — silenziando l'attesa della voce per la resistenza successiva. `true`
              // dice esplicitamente "l'ho appena svuotato io" — v. la nota grande su
              // `appenaResettato` in `useToneCycle.ts`.
              tone.resetTone(); setTonoScelto(false); tone.localizzaTone({ appenaResettato: true });
              // ⚠️ AGGIUNTO — segnalato: « quando si fa altra resistenza, devi ripristinare
              // la scala del tono al valore neutro di inizio ciclo ». Senza `localizzaTone()`
              // (senza strumenti) fissa `toneAtStart` sul vecchio `toneAssessed` — ancora
              // quello dell'ultima resistenza chiusa (0/`toneAssessed` non viene mai svuotato
              // da `resetTone()`, solo l'item lo è) — quindi la scala ripartiva già segnata
              // sull'ultima scelta invece che dal neutro. `correggiToneAtStart` scrive
              // `toneAtStart` DIRETTAMENTE (e azzera lo stesso ratchet che `localizzaTone()`
              // ha appena azzerato — nessun danno, stessa idempotenza già usata altrove);
              // `setToneAssessed(0)` allinea anche il valore che la colonna in
              // `deveScegliereTono` legge PRIMA che l'auditor scelga di nuovo.
              tone.setToneAssessed(0); tone.correggiToneAtStart(0);
            }} style={pillBtn('var(--s-still)')}>
              {LC('altra resistenza', 'autre résistance', 'another resistance', 'otra resistencia', 'annat motstånd')}
            </button>
          )}
          <button className="s-glass s-glass-btn" onClick={() => {
            if (tone.tonePhase === 'raise') tone.chiudiTone(false);
            tone.resetTone(); setToneAttivo(false); setTonoScelto(false);
          }} style={pillBtn('var(--s-ink-ghost)')}>
            {t('cancel')}
          </button>
        </>
      )}
      {/* ── MIRROR, ARMATO — tre tempi, non due ──────────────────────────────────────────
          (a) il VALORE 1–10 dell'item — dieci bottoni, la quantità di carica; (b) il
          DOPPIO da raggiungere, con la sua dichiarazione; (c) OTTENUTO → valida. Stessa
          sequenza di App.tsx (`bottoneCiclo`, ramo 'mirror'), stessi tre passi — non due,
          come una prima lettura avrebbe fatto (« dai l'item » dritto a « ottenuto », senza
          il valore in mezzo: segnalato in App.tsx stesso come l'errore da NON ripetere). */}
      {aperta && mirror.mirrorArmed && (
        <>
          {!mirror.mirrorDisp.locked ? (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', color: 'var(--s-ink-faint)', marginRight: 6 }}>
                {LC('quanta carica?', 'combien de charge ?', 'how much charge?', '¿cuánta carga?', 'hur mycket laddning?')}
              </span>
              {/* ⚠️ LA LETTURA VERA, COL MUSE, PRIMA DEL BLOCCO — segnalato: « in MIRROR deve
                  apparire col MUSE la carica ottenuta iniziale ». Prima, in attesa che
                  `mirrorCycle` si blocchi da sé, questo schermo mostrava SOLO i dieci
                  bottoni — nessun segno che il MUSE stesse leggendo qualcosa. `mirrorDisp.liveR`
                  (v. la sua nota in `useMirrorCycle.ts`) è la carica VERA, in diretta, sulla
                  stessa scala 1–10 dei bottoni accanto — pulsante finché non si blocca da
                  sola (o l'auditor sceglie a mano, che resta sempre possibile). Solo col MUSE:
                  senza, non c'è nessuna lettura da mostrare, i bottoni restano l'unica via. */}
              {museOk && (
                <span className="animate-pulse" style={{
                  fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-base)', fontWeight: 700,
                  color: 'var(--s-alive)', marginRight: 10,
                }}>
                  MUSE {mirror.mirrorDisp.liveR.toFixed(1)}
                </span>
              )}
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => (
                <button key={v} onClick={() => {
                  mirror.mirrorCycle.setManualValue(v);
                  mirror.setMirrorDisp({ contactQ: mirror.mirrorCycle.contactQ, dischargeQ: 0,
                    locked: true, reached: false, valueR: mirror.mirrorCycle.valueR, liveR: mirror.mirrorCycle.valueR });
                }} className="s-glass s-glass-btn" style={{
                  cursor: 'pointer', borderRadius: 999, width: 26, height: 26,
                  fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-base)', fontWeight: 700,
                  background: 'var(--s-disc-sunk)', color: 'var(--s-ink)',
                }}>
                  {v}
                </button>
              ))}
            </div>
          ) : !mirror.mirrorDisp.reached ? (
            <>
              {/* ⚠️ SEGNALATO: « la valeur 1–10 se fige d'elle-même quand la lecture s'est
                  retournée n'est pas clair dans MIRROR ». Il blocco è voluto (v. la nota su
                  `locked`/`turnedOver` in `MirrorCycle.ts`: il valore si ferma appena il picco
                  passa, non al massimo di sempre) — quel che mancava era DIRLO. Prima questa
                  riga passava dritta dal valore "vivo" (i dieci bottoni) al valore bloccato
                  senza una parola sul perché si è fermato: un numero che smette di muoversi,
                  senza spiegazione, si legge come un guasto. Un piccolo 🔒 con la frase basta a
                  chiudere il dubbio, senza aggiungere un secondo pannello. */}
              <span style={{
                fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-micro)', fontWeight: 700,
                color: 'var(--s-ink-faint)', marginRight: 8, display: 'inline-flex', alignItems: 'center', gap: 3,
              }} title={LC(
                'il valore si è bloccato da sé: la lettura ha superato il picco ed è tornata indietro',
                'la valeur s\'est verrouillée toute seule : la lecture a dépassé le pic et est revenue en arrière',
                'the value locked itself: the reading passed its peak and turned back',
                'el valor se bloqueó solo: la lectura pasó su pico y regresó',
                'värdet låste sig självt: avläsningen passerade sin topp och vände tillbaka')}>
                🔒 {LC('bloccato', 'verrouillé', 'locked', 'bloqueado', 'låst')}
              </span>
              <span style={{ fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', color: 'var(--s-ink-faint)' }}>
                {LC('portalo al doppio', 'mène-le au double', 'take it to the double', 'llévalo al doble', 'för det till dubbeln')}
                {' — '}{mirror.mirrorDisp.valueR.toFixed(0)} → {(2 * mirror.mirrorDisp.valueR).toFixed(0)}
              </span>
              <button className="s-glass s-glass-btn" onClick={() => {
                mirror.mirrorCycle.declareReached();
                mirror.setMirrorDisp({ contactQ: mirror.mirrorCycle.contactQ, dischargeQ: mirror.mirrorCycle.dischargeQ,
                  locked: true, reached: true, valueR: mirror.mirrorCycle.valueR, liveR: mirror.mirrorCycle.valueR });
              }} style={pillBtn('var(--s-still)')}>
                {LC('doppio raggiunto', 'double atteint', 'double reached', 'doble alcanzado', 'dubbeln nådd')}
              </button>
            </>
          ) : (
            <button className="s-glass s-glass-btn" onClick={() => mirror.stopMirror()} style={pillBtn('var(--s-still)')}>
              {LC('ottenuto — valida', 'obtenu — valider', 'obtained — validate', 'obtenido — validar', 'uppnått — validera')}
            </button>
          )}
          <button className="s-glass s-glass-btn" onClick={() => mirror.stopMirror()} style={pillBtn('var(--s-ink-ghost)')}>
            {t('cancel')}
          </button>
        </>
      )}
      {aperta && cycles.cycleArmed && (
        <>
          {/* ── IL CONTATORE DEL CICLO IN CORSO — mancante ─────────────────────────────
              In App.tsx un chip dice, per il SOLO metodo in corso (CONTACT con CONTACT,
              NULL con NULL — « due contatori confondono », scelta utente), quanti cicli
              sono stati armati e quanti portati a compimento questa seduta. `cycleStats`
              arriva già dallo stesso `useContactNullCycle` — solo non era letto qui. */}
          <span style={{ fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-base)', color: 'var(--s-ink-faint)' }}>
            {cycles.cycleKind === 'null'
              ? `${cycles.cycleStats.nStarted} · ${cycles.cycleStats.nDone} CLEAR`
              : `${cycles.cycleStats.cStarted} · ${cycles.cycleStats.cDone} AS-IS`}
          </span>
          {/* ── ANNULLA — l'uscita SENZA validare, mancante ────────────────────────────
              Segnalato nella revisione funzionale: in App.tsx chiudere un ciclo armato ha
              DUE strade — validare (uno degli esiti a destra) o ANNULLA, che chiude il
              ciclo e lo lascia « non validato » nel rapporto (`finalizeCycle(false)`,
              distinto da ogni esito). SERENITY aveva solo la prima: niente modo di uscire
              da un ciclo armato per errore senza forzare un esito che non è successo. */}
          <button className="s-glass s-glass-btn" onClick={() => cycles.finalizeCycle(false)} style={pillBtn('var(--s-ink-ghost)')}>
            {t('cancel')}
          </button>
          {cycles.cycleKind === 'null' ? (
            <>
              <button className="s-glass s-glass-btn" onClick={() => cycles.validateClearRead(true)} style={pillBtn('var(--s-still)')}>
                {t('ser_validate_equilibrium_vgi')}
              </button>
              <button className="s-glass s-glass-btn" onClick={() => cycles.validateClearRead(false)} style={pillBtn('var(--s-ink-faint)')}>
                {t('ser_validate_equilibrium_novgi')}
              </button>
              {/* ── IL TERZO ESITO, MANCANTE ────────────────────────────────────────────
                  Segnalato nella revisione funzionale: il ciclo NULL in App.tsx ha TRE
                  esiti pari (VGI · senza VGI · NON RICARICA), non due — « non ricarica » è,
                  testuale App.tsx, « il risultato diagnostico più prezioso del ciclo NULL »:
                  senza dichiararlo, il ciclo resta indistinguibile da uno abbandonato, e
                  quel ramo del rapporto/CORPUS resta irraggiungibile. SERENITY aveva SOLO i
                  primi due — un bottone intero perso, non solo uno stile. */}
              <button className="s-glass s-glass-btn" onClick={() => cycles.declareNoRecharging()} style={pillBtn('var(--s-reserve)')}>
                {t('ser_no_recharging')}
              </button>
            </>
          ) : (
            <button className="s-glass s-glass-btn" onClick={() => cycles.validateAsIs()} style={pillBtn('var(--s-still)')}>
              {t('ser_validate_asis')}
            </button>
          )}
          {/* ── LO STESSO `CycleStatusBar` DI APP.TSX — segnalato: « riproduci la logica dei
              cicli di equilibrium... stessi posizionamenti ». */}
          <div style={{ width: '100%' }}>
            <CycleStatusBar
              armed={cycles.cycleArmed}
              manualReady={cycles.manualReady}
              asIsFalse={cycles.asIsFalse}
              deltaStar={deltaStar}
              deltaStarN={deltaStarN}
              isLightTheme={isLightTheme}
              signalOk={museContact}
              cycleKind={cycles.cycleKind}
              nullSinceMock={cycles.nullSinceMock}
              noReadSignal={cycles.noReadSignal}
              taAtNullStart={cycles.taAtNullStart}
            />
          </div>
        </>
      )}
      {/* ── TRUTH, ATTIVO — v. docs/truth-cycle-proposal.md. Localizza il R/I → chiedi «What
          about this is the truth?» finché non emerge un ulteriore R/I → return to present.
          Un candidato proposto dal motore (v. `truthDisp`) NON è mai un evento confermato da
          solo — conferma/scarta restano gesti dell'auditor, mai automatici. */}
      {aperta && truth.truthPhase !== 'idle' && (
        <>
          <button className="s-glass s-glass-btn" onClick={() => truth.resetTruth()} style={pillBtn('var(--s-ink-ghost)')}>
            {t('cancel')}
          </button>
          {truth.truthPhase === 'return_present' ? (
            <button className="s-glass s-glass-btn" onClick={() => truth.chiudiTruth()} style={pillBtn('var(--s-still)')}>
              {LC('chiudi il R/I', 'clore le R/I', 'close the R/I', 'cerrar el R/I', 'stäng R/I')}
            </button>
          ) : (
            <>
              {truth.truthPhase === 'candidate' && (
                <>
                  {/* ── IL CANDIDATO — una PROPOSTA del motore, mai un evento da solo (v. la
                      nota di testa in `truthScale.ts`). L'auditor conferma o scarta. */}
                  <span style={{
                    fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-micro)', fontWeight: 700,
                    color: 'var(--s-truth-hue)', padding: '5px 10px',
                  }}>
                    {LC('candidato', 'candidat', 'candidate', 'candidato', 'kandidat')} · {(truth.truthDisp.confidence * 100).toFixed(0)}%
                  </span>
                  <button className="s-glass s-glass-btn" onClick={() => truth.confermaVerita()} style={pillBtn('var(--s-still)')}>
                    {LC('conferma verità', 'confirme vérité', 'confirm truth', 'confirma verdad', 'bekräfta sanning')}
                  </button>
                  <button className="s-glass s-glass-btn" onClick={() => truth.scartaCandidato()} style={pillBtn('var(--s-ink-faint)')}>
                    {LC('non è questo', 'ce n\'est pas ça', 'not this', 'no es esto', 'inte det här')}
                  </button>
                </>
              )}
              {truth.truthPhase !== 'candidate' && (
                <button className="s-glass s-glass-btn" onClick={() => truth.askTruth()} style={pillBtn('var(--s-alive)')}>
                  {LC('chiedi', 'demande', 'ask', 'pregunta', 'fråga')}
                  {truth.truthRepeats > 0 ? ` · ×${truth.truthRepeats}` : ''}
                </button>
              )}
              <button className="s-glass s-glass-btn" onClick={() => truth.trovatoUlterioreRI()} style={pillBtn('var(--s-reserve)')}>
                {LC('ulteriore R/I trovato', 'R/I supplémentaire trouvé', 'further R/I found', 'R/I adicional encontrado', 'ytterligare R/I hittat')}
              </button>
            </>
          )}
        </>
      )}
    </>
  );
}
