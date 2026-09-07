/**
 * GruppoBasso — la pista del ciclo (o del procedimento) e la scelta del metodo, il fratello di
 * `GruppoAlto` sotto il perno dell'ago. Tredicesimo pezzo staccato dal corpo di `Serenity.tsx`
 * (v. `docs/serenity-refonte.md` per la cronologia completa). Copiato verbatim dal blocco che i
 * commenti storici del file chiamano già "gruppoBasso" — ogni commento preservato, nessuna riga
 * di logica toccata.
 *
 * ── COSA RESTA FUORI DI PROPOSITO ────────────────────────────────────────────────────────────
 * `comandiSottoAgo` — calcolato dalla stessa IIFE che avvolge questo componente insieme al suo
 * fratello `GruppoAlto`, in `Serenity.tsx` — arriva già pronto come prop, non ricalcolato qui.
 * Ogni azione COMPOSTA (`committaRispostaProcedimento`, `dichiaraItemDetto`, gli `onClick` dei
 * cinque cerchi…) resta costruita in `Serenity.tsx`, passata giù come callback. `t`/`LC` sono
 * presi QUI, internamente — stessa ragione già scritta in `Intestazione.tsx`/`BarraLaterale.tsx`/
 * `GruppoAlto.tsx`.
 *
 * @see docs/serenity-refonte.md — giro di scomposizione, 2026-09-07.
 */
import { useI18n } from '../i18n';
import { pick5 } from '../i18n5';
import { Crosshair, Scale, FlipHorizontal2, AudioWaveform, Lightbulb } from 'lucide-react';
import { PistaProcedimento } from './PistaProcedimento';
import { PistaCiclo } from './PistaCiclo';
import type { SessionMode } from '../engine/sessionMode';
import type { SessionPhase } from '../engine/sessionPhase';
import type { Procedimento } from '../lib/procedimenti';
import type { useToneCycle } from '../session/useToneCycle';
import type { useMirrorCycle } from '../session/useMirrorCycle';
import type { useContactNullCycle } from '../session/useContactNullCycle';
import type { useTruthCycle } from '../session/useTruthCycle';

export interface GruppoBassoProps {
  /** Calcolato insieme a `GruppoAlto` dalla stessa IIFE in `Serenity.tsx` — non ricalcolato qui. */
  comandiSottoAgo: boolean;
  aperta: boolean;
  senzaMisura: boolean;
  procedimentoAttivo: Procedimento | null;
  setProcedimentoAttivo: (p: Procedimento | null) => void;
  committaRispostaProcedimento: (indice: number) => void;
  fuocoProcedimento: number;
  impostaFuocoProcedimento: (indice: number) => void;
  risposteProcedimento: Record<number, { auditor: string; pc: string; modificato: boolean }>;
  scriviRispostaProcedimento: (indice: number, valore: string) => void;
  apriRispostaProcedimento: (indice: number) => void;
  mode: SessionMode;
  faseCiclo: SessionPhase;
  item: string;
  setItemManuale: (v: string) => void;
  dichiaraItemDetto: () => void;
  spiegazioneCiclo: { titolo: string; comando?: string | null; come: string; avviso?: string | null; fatto?: boolean };
  bottoniCiclo: React.ReactNode;
  cycles: ReturnType<typeof useContactNullCycle>;
  mirror: ReturnType<typeof useMirrorCycle>;
  toneAttivo: boolean;
  truth: ReturnType<typeof useTruthCycle>;
  tone: ReturnType<typeof useToneCycle>;
  confermaItemSePresente: () => void;
  setToneAttivo: (v: boolean) => void;
  setTonoScelto: (v: boolean) => void;
}

export function GruppoBasso({
  comandiSottoAgo, aperta, senzaMisura, procedimentoAttivo, setProcedimentoAttivo,
  committaRispostaProcedimento, fuocoProcedimento, impostaFuocoProcedimento, risposteProcedimento,
  scriviRispostaProcedimento, apriRispostaProcedimento, mode, faseCiclo, item, setItemManuale,
  dichiaraItemDetto, spiegazioneCiclo, bottoniCiclo, cycles, mirror, toneAttivo, truth, tone,
  confermaItemSePresente, setToneAttivo, setTonoScelto,
}: GruppoBassoProps) {
  const { t, lang } = useI18n();
  const LC = (it: string, fr: string, en: string, es: string, sv: string) => pick5(lang as string, it, fr, en, es, sv);

  return (
        <div style={{ flex: comandiSottoAgo ? '1 1 0%' : '0 0 0%', minHeight: 0, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: 16, overflow: comandiSottoAgo ? 'auto' : 'visible' }}>
        {/* ── LA PISTA DEL CICLO, SOTTO IL PUNTO DI ANCORAGGIO DELL'AGO ─────────────────────────
            Segnalato: « i comandi e le indicazioni dei cicli, per più leggibilità, sotto il
            punto di ancoraggio dell'ago, in uno spazio che permetta il più possibile le
            scritte su una riga ». ⚠️ BUG TROVATO spostando: prima questo blocco viveva DENTRO
            il riquadro dell'arco (`overflow:'hidden'`, per i bordi arrotondati del pannello) —
            posizionarlo `position:absolute` con un `top` che supera l'altezza del pannello lo
            tagliava via, invisibile, anche se il DOM (e il testo di pagina) lo conteneva per
            davvero. Qui è un FRATELLO del pannello — non un suo figlio — dentro lo stesso
            involucro `flex:1 column` che li impila: nessuna misura, nessun ref, nessun `top`
            calcolato — il flusso normale della colonna lo mette esattamente dove serve, senza
            poter mai finire tagliato via da un contenitore che non lo aspettava. */}
        {/* ⚠️ BUG TROVATO — segnalato: « senza strumenti i comandi di COMMANDS non appaiono ».
            `!senzaMisura` avvolgeva l'INTERO ramo, `PistaProcedimento` compreso — corretto per
            `PistaCiclo` (la sua guida, senza strumenti, la dà il pannello assoluto "DONNE
            L'ITEM" qui sopra, mostrarlo due volte sarebbe stato ridondante) ma sbagliato per
            `PistaProcedimento`: un procedimento è testo puro letto dall'auditor, senza alcun
            legame con MUSE/METER — nascondersi senza strumenti gli toglieva l'unico posto in
            cui vivere, proprio quando "senza strumenti" è la scelta più comune per chi segue
            un procedimento a voce. `procedimentoAttivo ||` in più: quando un procedimento è
            scelto, si mostra SEMPRE; altrimenti resta la stessa regola di prima per `PistaCiclo`. */}
        {(procedimentoAttivo || !senzaMisura) && (
          procedimentoAttivo
            ? <PistaProcedimento nome={procedimentoAttivo.nome} comandi={procedimentoAttivo.comandi}
                onChiudi={() => {
                  // ⚠️ AGGIUNTO — chiudere non deve perdere l'ultima risposta rimasta aperta:
                  // stesso commit che avviene passando a un altro comando (v.
                  // `impostaFuocoProcedimento`), qui per il comando su cui si stava quando si
                  // preme CHIUDI.
                  committaRispostaProcedimento(fuocoProcedimento);
                  setProcedimentoAttivo(null);
                }} lang={lang}
                fuoco={fuocoProcedimento} onImpostaFuoco={impostaFuocoProcedimento}
                risposte={risposteProcedimento} onScriviRisposta={scriviRispostaProcedimento}
                onApriRisposta={apriRispostaProcedimento} />
            : <PistaCiclo mode={mode} phase={faseCiclo} lang={lang}
                item={item} setItem={setItemManuale} itemPlaceholder={t('ser_item_placeholder') as string}
                spiegazione={spiegazioneCiclo} onDichiaraDetto={dichiaraItemDetto}>
                {bottoniCiclo}
              </PistaCiclo>
        )}
        {/* ── NESSUN METODO ANCORA SCELTO — il fratello di `PistaCiclo` per questo stato ──────
            Segnalato: « perché c'è sempre uno spazio con "type or say the item" in alto a
            sinistra? ». Perché viveva SEPARATO dal resto dei comandi del ciclo: prima di
            armare un metodo l'item si scriveva nella barra laterale, in alto a sinistra —
            dopo aver armato, il ciclo (e il SUO item, sola lettura) comparivano altrove (ora,
            sotto il quadrante). Due posti diversi per la STESSA cosa, a due passi di distanza
            uno dall'altro: da qui la sensazione di uno spazio isolato, senza un perché visibile.
            Ora un solo posto, sempre lo stesso: quando NESSUN metodo è armato, questa fascia
            (stessa larghezza/riga di `PistaCiclo`, stesso posto sotto il perno) mostra i
            quattro cerchi dei metodi; appena armato, `PistaCiclo` (sopra) prende il suo posto
            — mai i due insieme, mai una fascia vuota che segnala "manca qualcosa".
            ⚠️ IL CAMPO ITEM, TOLTO DI QUI — segnalato: « quando non ho armato nessun ciclo
            appare sempre ECRIS OU DIS L'ITEM, se scrivi non lo prende e poi non serve. Deve
            apparire quando armi un ciclo. Tanto se vuoi un item lo scrivi in R&I o
            ASSESSMENT ». Vero, e il « non lo prende » aveva una causa precisa: premere Invio
            qui chiamava `setItem('')` SUBITO dopo averlo loggato — svuotava il campo prima
            ancora che l'auditor potesse cliccare CONTACT/NULL/MIRROR/TONE, che a quel punto
            lo trovava già vuoto e ripartiva in modalità voce come se non fosse mai stato
            scritto. Tolto — l'item si scrive ora DENTRO `PistaCiclo`, un `<input>` vero al
            posto del vecchio `<span>` di sola lettura (v. la nota lì), disponibile appena un
            metodo è armato: non prima, perché prima l'auditor ha già R&I/ASSESSMENT per
            annotare un item, un terzo posto per la stessa cosa non aggiungeva nulla. */}
        {/* ⚠️ ANCHE SENZA STRUMENTI — segnalato: « senza strumenti non appaiono i cicli, invece
            devono apparire ». `!senzaMisura` qui escludeva TUTTA questa fascia — quindi anche
            i quattro cerchi di scelta del metodo — proprio nel caso "séance sans instruments"
            dove servono di più: senza di loro, l'auditor non aveva ALCUN modo di armare un
            ciclo (il blocco "senza strumenti" poco sopra mostra solo le SCRITTE di un ciclo
            già armato, `bottoniCiclo` — vuoto finché nessuno lo è). Tolta l'esclusione: i
            cerchi restano identici (`armCycle`/`armMirror`/`setToneAttivo`, mai toccati),
            semplicemente raggiungibili anche senza MUSE/METER connessi. */}
        {/* ⚠️ SEGNALATO E RITIRATO — provato un `|| senzaMisura` per mostrare i cerchi anche a
            procedimento aperto (« nasconde i bottoni dei cicli »), poi corretto dall'auditor
            stesso: « lasci stare, è giusto ». Un procedimento aperto prende il posto di
            `PistaCiclo` di proposito — la stessa esclusività vale con o senza strumenti. */}
        {aperta && !cycles.cycleArmed && !mirror.mirrorArmed && !toneAttivo && truth.truthPhase === 'idle' && !procedimentoAttivo && (
          <>
          {/* ── LA RIGA-GUIDA, ANCHE A RIPOSO — segnalato: « una riga-guida sempre in cima
              anche a riposo » (una delle quattro proposte accettate, « tutti »). Prima,
              a ciclo libero, questi cinque cerchi comparivano SENZA una parola sopra —
              l'unica indicazione era la loro stessa presenza, muta finché non se ne
              armava uno (`spiegazioneCiclo`, il testo che guida DURANTE un ciclo, non
              esiste ancora qui: nessun metodo è scelto). Una riga sola, la stessa idea
              di `spiegazioneCiclo` ma per il momento PRIMA di tutti gli altri: dice cosa
              fare anche quando non c'è ancora niente in corso.
              ⚠️ BUG TROVATO — segnalato: « senza strumenti scrive "scegli un metodo" ma non
              si vede nulla ». `!senzaMisura` qui, aggiunto SUBITO dopo: senza strumenti
              questo intero gruppo (riga + cinque cerchi) vive nel FLUSSO normale del
              documento, sotto il blocco `senzaMisura && aperta` (poco più su) che invece è
              `position:absolute` — quel blocco mostra GIÀ la sua propria guida grande
              ("DONNE L'ITEM" ecc., `spiegazioneCiclo`), quindi la riga qui sarebbe stata
              doppia anche a schermo pieno. Verificato dal vivo: `document.body.scrollHeight`
              (1096px) superava `window.innerHeight` (720px) — la riga in più, sommata al
              resto, spingeva i cinque cerchi sotto al bordo visibile, invisibili benché
              presenti nel DOM. Con strumenti (dove non c'è il blocco `senzaMisura` a
              contendersi lo spazio) la riga resta, verificata correttamente a schermo. */}
          {!senzaMisura && (
          <span style={{
            width: '100%', textAlign: 'center', flexShrink: 0,
            fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', fontWeight: 600,
            letterSpacing: '0.02em', color: 'var(--s-ink-faint)', marginBottom: 2,
          }}>
            {LC('scegli un metodo qui sotto', 'choisis une méthode ci-dessous', 'choose a method below',
                'elige un método aquí abajo', 'välj en metod nedan')}
          </span>
          )}
          <div style={{
            width: 'min(96%, 2200px)', maxWidth: '100%', flexShrink: 0,
            display: 'flex', flexDirection: 'row', flexWrap: 'wrap',
            alignItems: 'center', justifyContent: 'center',
            rowGap: 10, columnGap: 18,
          }}>
            {/* ⚠️ SEGNALATO: « i bottoni dei cicli devono essere meglio differenziati senza
                essere troppo vistosi ». Tre dei quattro usavano già `--s-still`/`--s-alive`/
                `--s-reserve` — I TRE SEGNALI del sistema (v. `tokens.css`: « tre e non dieci,
                un linguaggio di colore che l'auditor deve ricordare è un linguaggio che non
                guarderà »). TONE restava `hue: null` — nessun colore affatto, lo stesso grigio
                spento di un bottone "niente di speciale": non "meno vistoso" degli altri tre,
                semplicemente MENO RICONOSCIBILE, l'opposto di quel che serviva. Dargli uno dei
                tre segnali esistenti gli avrebbe rubato un significato che quel segnale porta
                altrove (vivo/quiete/riserva sono stati, non nomi di metodo) — una QUARTA
                tinta, `--s-tone-hue`, locale a questi quattro cerchi (non un ottavo colore nel
                sistema, non usata altrove): stessa desaturazione/luminosità delle altre tre
                (una via di mezzo fra `--s-reserve` e `--s-alive` sulla ruota, non un colore
                acceso nuovo) — appartiene alla STESSA famiglia quieta, non la rompe.
                ⚠️ « meglio differenziati » anche per i primi tre: prima SOLO il bordo (2px)
                portava la tinta — a un'occhiata veloce sui quattro cerchi vicini, bordi sottili
                di colori tenui si confondono. Aggiunta una tinta di FONDO leggerissima
                (`color-mix`, 12%) oltre al bordo — la stessa idea già usata altrove in
                SERENITY per marcare "questa zona/stato ha un colore" senza riempirla a tinta
                unita: più superficie colorata senza alzare la saturazione di un solo grado. */}
            {([
              { k: 'contact', hue: 'var(--s-still)', label: 'CONTACT', Icona: Crosshair,
                desc: LC('contatto diretto con la carica dell\'item', 'contact direct avec la charge de l\'item',
                  'direct contact with the item\'s charge', 'contacto directo con la carga del ítem',
                  'direktkontakt med objektets laddning') as string,
                onClick: () => { confermaItemSePresente(); cycles.armCycle('charge'); } },
              { k: 'null', hue: 'var(--s-alive)', label: 'NULL', Icona: Scale,
                desc: LC('ciclo speculare: NULL → RISE → EQUILIBRIUM', 'cycle miroir : NULL → RISE → EQUILIBRIUM',
                  'mirror cycle: NULL → RISE → EQUILIBRIUM', 'ciclo espejo: NULL → RISE → EQUILIBRIUM',
                  'spegelcykel: NULL → RISE → EQUILIBRIUM') as string,
                onClick: () => { confermaItemSePresente(); cycles.armCycle('null'); } },
              { k: 'mirror', hue: 'var(--s-reserve)', label: 'MIRROR', Icona: FlipHorizontal2,
                desc: LC('raddoppia il valore fino ad annullarlo', 'double la valeur jusqu\'à l\'annuler',
                  'doubles the value until it cancels out', 'duplica el valor hasta anularlo',
                  'fördubblar värdet tills det upphävs') as string,
                onClick: () => { confermaItemSePresente(); mirror.armMirror(); } },
              // ⚠️ TONE ARMAVA IN DUE TEMPI, GLI ALTRI TRE IN UNO — segnalato: « le cicle TONE
              // contrairement aux autres demande d'appuyer sur un bouton pour donner l'item.
              // ENLEVE LE et fais comme pour les autres cycles ». `armCycle`/`armMirror` (sopra)
              // armano E aprono la cattura dell'item nello STESSO click; TONE apriva solo il
              // pannello (`setToneAttivo(true)`) e aspettava un secondo click, "DAI L'ITEM"
              // (`tone.localizzaTone()`, sotto in `tonePhase==='locate'`) — la stessa asimmetria
              // esiste anche in App.tsx (non un'invenzione di questa sessione), ma qui è
              // un'esplicita richiesta di NON riprodurla. Un click solo, come gli altri tre.
              { k: 'tone', hue: 'var(--s-tone-hue)', label: 'TONE', Icona: AudioWaveform,
                desc: LC('porta la resistenza al tono 40', 'mène la résistance au ton 40',
                  'raises the resistance to tone 40', 'lleva la resistencia al tono 40',
                  'för motståndet till ton 40') as string,
                onClick: () => { confermaItemSePresente(); setToneAttivo(true); setTonoScelto(false); tone.localizzaTone(); } },
              // TRUTH — il protocollo di Ron (v. docs/truth-cycle-proposal.md). Un click solo,
              // come gli altri quattro: `locateRI()` arma E apre la cattura del R/I nello
              // stesso gesto (campo vuoto → si aspetta la voce, come tutti gli altri).
              { k: 'truth', hue: 'var(--s-truth-hue)', label: 'TRUTH', Icona: Lightbulb,
                desc: LC('localizza un R/I fino alla verità', 'localise un R/I jusqu\'à la vérité',
                  'locates an R/I until the truth', 'localiza un R/I hasta la verdad',
                  'lokaliserar en R/I till sanningen') as string,
                onClick: () => { confermaItemSePresente(); truth.locateRI(); } },
            ]).map(c => (
              <div key={c.k} style={{ display: 'grid', justifyItems: 'center', gap: 4, flexShrink: 0 }}>
                {/* ⚠️ 50px, non più 54 — segnalato: « non vedo il 5 ciclo ». Con TRUTH il quinto
                    cerchio, cinque a 54px (+ i gap) non stavano più in una riga sola nella
                    colonna centrale a schermi non larghissimi: `flexWrap` (sul contenitore,
                    sopra) mandava il quinto da solo su una seconda riga, dove leggeva come un
                    elemento perso invece che "il quinto metodo accanto agli altri". Un taglio
                    piccolo (54→50px, gap 24→18) basta a farceli stare tutti e cinque insieme. */}
                <button className="s-glass s-glass-btn" onClick={c.onClick} title={c.label} data-help={c.desc} style={{
                  width: 50, height: 50, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: `1.5px solid ${c.hue}`, cursor: 'pointer',
                  borderRadius: '50%', background: `color-mix(in srgb, ${c.hue} 12%, var(--s-disc))`, color: c.hue,
                }}>
                  <c.Icona size={20} strokeWidth={1.8} aria-hidden="true" />
                </button>
                <span style={{
                  fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-micro)', fontWeight: 700, letterSpacing: '0.04em',
                  color: c.hue,
                }}>{c.label}</span>
                {/* ── DA DOVE SI PARTE SENZA METER — questo select viveva QUI, PRIMA del click
                    su TONE. TOLTO — segnalato di nuovo, stavolta anche CON gli strumenti:
                    « quand on démarre la séance avec les instruments, le cycle TON fait
                    apparaître sous le bouton l'échelle des tons pour choisir un ton. C'est
                    erroné, puisque le ton est trouvé via les instruments ». La condizione
                    `!tone.toneHasMeter` restava vera anche con SOLO il MUSE connesso (nessun
                    meter vero — `toneHasMeter` è specifico del Theta-Meter, v. la sua nota in
                    `useToneCycle.ts`): un giro precedente aveva già tolto questo select per la
                    seduta COMPLETAMENTE senza strumenti (spostato come "secondo comando", dopo
                    la resistenza — v. `deveScegliereTono` più giù), ma l'aveva lasciato qui
                    per il caso MUSE-solo, credendolo non la lamentela. Lo era: con QUALUNQUE
                    strumento connesso (anche solo il MUSE) l'auditor non deve più scegliere
                    nulla a mano PRIMA di armare — tolto anche per lui. Un MUSE-solo che arma
                    TONE parte ora da `toneAssessed` (il default, 0) senza modo di correggerlo:
                    accettato, non un dimenticato — la scelta esplicita di NON offrire più
                    nessuna scala manuale quando uno strumento c'è, qualunque esso sia. */}
              </div>
            ))}
          </div>
          </>
        )}
        {/* chiude qui `gruppoBasso`. */}
        </div>
  );
}
