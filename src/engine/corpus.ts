/**
 * CORPUS — l'archivio delle esperienze, in JSON Lines.
 *
 * Non è un rapporto per umani: è **materiale per un'AI**. Ogni riga è un evento completo in sé,
 * scritto in aggiunta e mai riscritto. Da lì:
 *   · si accumula senza rileggere né riscrivere niente;
 *   · si fondono più macchine CONCATENANDO i file;
 *   · si legge a pezzi, senza caricare tutto in memoria.
 * Un unico JSON che cresce andrebbe riscritto intero ogni volta e diventerebbe ingestibile.
 *
 * ── LE DUE MARCHE TEMPORALI SEPARATE ────────────────────────────────────────────────────────
 * Sui due aghi la lettura che conta è l'INSTANT READ: alla fine esatta della parola, per
 * entrambi. Ci si aspetta quindi che coincidano — ma è proprio questo che va MISURATO, non
 * dato per buono. Ogni reazione porta il PROPRIO istante e la PROPRIA sorgente, e lo scarto si
 * calcola dopo, sui dati: un solo « tempo di reazione » medio cancellerebbe la differenza che
 * si vuole vedere, ammesso che ce ne sia una.
 *
 * ── COSA NON CI VA ──────────────────────────────────────────────────────────────────────────
 * Nessun nome, nessuna parola detta, nessun contenuto d'item. Solo numeri, tempi e il nome del
 * PROCEDIMENTO — che è tecnico, non personale. Così il file si può spedire, fondere e dare in
 * pasto a un modello senza portarsi dietro nulla di privato.
 *
 * Puro TS: qui si COSTRUISCONO le righe, non si scrivono. La scrittura sta in lib/corpusWriter.
 */

/**
 * Versione del formato. La regola è « si aggiungono campi, non se ne cambia il significato » —
 * e il 01/08/2026 quella regola è stata rotta, consapevolmente, su `peak`:
 *
 *   v1 — eeg.peak   = `REACTION_OFFSETS[etichetta]`, cioè un numero ricavato dal NOME
 *        theta.peak = distanza da SET (dipende da dove sta il braccio)
 *   v2 — eeg.peak   = `moveR`, la corsa MISURATA dell'ago virtuale in 0,5 s
 *        theta.peak = la corsa MISURATA dell'ago vero dal punto in cui era posato
 *
 * Le due sono ora la stessa grandezza e si possono confrontare. Ma una v1 e una v2 non si
 * mescolano: il rapporto le tiene separate, altrimenti la correlazione non vuol dire niente.
 */
export const CORPUS_VERSION = 2;

/** Da quale ago viene una lettura. */
export type ReadSource = 'eeg' | 'theta';

interface Base {
  /** Versione del formato. */
  v: number;
  /** Quando, in ora assoluta ISO — serve a fondere file di macchine diverse. */
  at: string;
  /** Identificativo della seduta: lega fra loro le righe di una stessa seduta. */
  s: string;
}

/** Apertura di seduta: la CONFIGURAZIONE con cui va letto tutto il resto. */
export interface SessionRecord extends Base {
  t: 'session';
  /** Strumenti collegati. Senza questo, una riga non si sa interpretare. */
  inst: { muse: boolean; theta: boolean };
  /** Come sono tenute le boîtes: cambia la resistenza, quindi i numeri. */
  cans?: 'two-cans' | 'solo-can';
  /** Sensibilità dell'ago delle boîtes in uso (unità grezze → quadrante) e il suo trim. */
  sens?: number;
  sensTrim?: number;
  /** Punti della scala del TA e se è quella di fabbrica: due sedute tarate diversamente non
   *  sono confrontabili sui valori assoluti, e questo permette di accorgersene. */
  taPoints?: number;
  taFactory?: boolean;
  /** Il PROCEDIMENTO che si sta facendo girare. È il contesto senza cui le reazioni sono un
   *  mucchio di numeri: con esso si può chiedere « questo processo dà blowdown e quest'altro
   *  F/N? », che è conoscenza clinica. */
  proc?: string;
}

/** Una reazione dell'ago, con la SUA sorgente e il SUO istante. */
export interface ReactionRecord extends Base {
  t: 'reaction';
  /** Da quale ago. */
  src: ReadSource;
  /** Chiave di reazione (reaction_fall, reaction_blow_down…). */
  key: string;
  /** Ampiezza del picco in unità di quadrante — l'ampiezza è il dato, non l'etichetta. */
  peak?: number;
  /** Istante di seduta in cui il movimento è PARTITO (s). */
  tSec: number;
  /** Durata dell'episodio (s). */
  durSec?: number;
  /** Tone Arm al momento della reazione, se disponibile. */
  ta?: number;
  /** Carica (qL) al momento, se c'è l'EEG. */
  ql?: number;
  /** La persona si stava muovendo: la lettura è sospetta. Registrata comunque — scartarla qui
   *  vorrebbe dire decidere adesso una cosa che si può decidere meglio dopo, sui dati. */
  motion?: boolean;
  /** Da quanti secondi era stato dato l'ultimo item: è la latenza item→reazione. */
  sinceItemSec?: number;
  /** Un ASSESSMENT era in corso.
   *
   *  ⚠️ Distinzione decisiva per l'analisi. In assessment l'ITEM è l'unico stimolo: una reazione
   *  lontana dall'item non ha spiegazione, e il criterio « vicino all'item o è rumore » vale.
   *  In seduta NO: il preclear pensa, risponde, ha cognizioni, e la carica arriva quando arriva.
   *  Applicare lì lo stesso criterio faceva passare per rumore reazioni che il preclear
   *  RICONOSCE come proprie (osservato in seduta, 01/08/2026). Senza questo campo le due
   *  situazioni erano indistinguibili nell'archivio. */
  assess?: boolean;
}

/** Un ciclo concluso. */
export interface CycleRecord extends Base {
  t: 'cycle';
  kind: string;
  /** Durata del ciclo (s). */
  durSec: number;
  /** Carica al contatto e TA a inizio/fine: quanto c'era e quanto se n'è andato. */
  qlAtContact?: number;
  taStart?: number;
  taEnd?: number;
  /** Portato a termine, o abbandonato. */
  done: boolean;
  /** AS-IS messo in dubbio (« verifica »). */
  falseAsIs?: boolean;
  proc?: string;
}

/**
 * Un FLOATING NEEDLE, con la sorgente che l'ha visto.
 *
 * È la riga più importante dell'archivio: l'F/N è l'indicatore di AS-IS, e la domanda è se i due
 * aghi lo vedano nello stesso momento. Un F/N dell'EEG che l'ago vero non conferma — o il
 * contrario — è esattamente il caso da cui si impara. Si scrive quindi UNA riga per sorgente,
 * senza decidere qui se concordano: l'accordo si calcola dopo, sui dati.
 */
export interface FnRecord extends Base {
  t: 'fn';
  src: ReadSource;
  /** Quando è cominciato lo spazzare (s di seduta). */
  tSec: number;
  /** Quanto è durato (s), se si è visto finire. */
  durSec?: number;
  /** Ampiezza media dello spazzare (unità di quadrante): un F/N largo non è come uno stretto. */
  width?: number;
  /** Periodo di una spazzata intera (s). */
  periodSec?: number;
  /** Tone Arm al momento. */
  ta?: number;
  /** Il corpo si muoveva: F/N da guardare con sospetto. Registrato, non scartato. */
  motion?: boolean;
  /** L'auditor ha DICHIARATO l'AS-IS su questo F/N. È il legame fra l'indicatore e la decisione:
   *  senza di esso non si può dire se un AS-IS dichiarato fosse confermato dall'ago vero. */
  asIs?: boolean;
  proc?: string;
}

/**
 * Un ITEM dato in assessment — SOLO l'istante, mai la parola.
 *
 * Serve a una cosa sola, e indispensabile: sapere ogni quanto arrivano gli item. Senza, dire
 * « le reazioni si accalcano attorno agli item » non significa niente — con item ogni tre
 * secondi, il 70 % di QUALUNQUE cosa cade entro due secondi da un item, anche il rumore puro.
 * Il confronto va fatto contro il CASO, e il caso si calcola da questi intervalli.
 *
 * ⚠️ Nessun testo: la riservatezza dell'archivio resta intatta, un istante non è un contenuto.
 */
export interface ItemRecord extends Base {
  t: 'item';
  tSec: number;
  /** GRUPPO di ripetizione: gli item DATI CON LE STESSE PAROLE portano lo stesso numero.
   *
   *  Serve alla prova della ripetibilità — un item che legge continua a leggere finché non è
   *  scaricato — che è il modo classico di validare uno strumento, e l'unico che distingue
   *  « segue il significato » da « fa rumore » senza dipendere da quando cade una reazione.
   *
   *  ⚠️ È un NUMERO, non il testo: dice « questo item è lo stesso del terzo » e nient'altro.
   *  La riservatezza dell'archivio resta intatta. */
  g?: number;
  /** La lettura UFFICIALE attribuita a QUESTA occorrenza ('Fall', 'NULL'…) e il suo scarto in
   *  ms — quella dell'ago che l'auditor stava guardando.
   *  È una classificazione, non un contenuto. */
  read?: string;
  offMs?: number;
  /**
   * La lettura di CIASCUN ago, presa separatamente sullo stesso item.
   *
   * Un verdetto unico nascondeva il disaccordo: i due aghi leggono item DIVERSI. Misurato il
   * 02/08/2026 su 89 item con entrambi gli strumenti: hanno letto lo STESSO item **una volta**
   * (solo MUSE 31, solo METER 6, nessuno 51 — κ di Cohen −0,09, cioè indipendenti).
   * Tenerle separate è la sola forma in cui « quale dei due trova gli item carichi » ha una
   * risposta invece di una media.
   */
  readMuse?: string;
  readMeter?: string;
  /**
   * R&I — la reazione INDICA al preclear?
   *
   * L'auditor indica la lettura al preclear, il preclear dice se gli indica, e questo si
   * archivia. È il solo criterio ESTERNO ai due aghi: su 89 item si sono trovati d'accordo una
   * volta (κ = −0,09), quindi nessuno dei due può giudicare l'altro — il preclear sì.
   *
   * Vale anche per le righe che NON sono item — in seduta l'ago reagisce sul processo, e
   * l'auditor indica quelle reazioni.
   */
  indica?: boolean;
}

/**
 * Un ciclo TONE concluso — LE DUE VOCI A CONFRONTO.
 *
 * ⚠️ AGGIUNTO — segnalato: « questo permette di vedere chiaramente le sensazioni del PC,
 * l'osservazione dell'auditor e le misure ». Verificato PRIMA di scrivere questa riga: il ciclo
 * TONE non finiva MAI nel corpus, in nessuna forma — né il numero strumentale, né quello
 * dichiarato. Le due voci non sono tre: chiarito dall'utente, `toneStart` (quando `source` vale
 * `'assessed'`) è GIÀ il giudizio dell'auditor DOPO aver chiesto al PC — le due si fondono in un
 * solo numero nel modo in cui si conduce, non in due campi separati da inventare qui.
 *
 * Restano quindi DUE voci da confrontare, mai insieme sullo STESSO ciclo — `deveScegliereTono`
 * (SERENITY) mostra la scelta manuale solo `senzaMisura`, mai insieme a uno strumento connesso:
 *   · `source: 'assessed'` → `toneStart` è la dichiarazione (PC + obnosi dell'auditor);
 *   · `source: 'meter'/'meter+eeg'` → `toneStart`/`toneEnd` sono la misura (TA e/o bande EEG).
 * Il confronto che serve — stessa persona, sedute diverse, dichiarato vs misurato — si fa DOPO,
 * accumulando righe di entrambi i tipi nel tempo: esattamente come `eegLeadSeconds`/
 * `fnConcordance` fanno già per i due aghi.
 */
export interface ToneRecord extends Base {
  t: 'tone';
  /** Durata del ciclo, dalla localizzazione alla chiusura (s). */
  durSec: number;
  /** Tono di PARTENZA (misurato o dichiarato). `null` se chiuso prima di localizzare. */
  toneStart: number | null;
  /** Tono RAGGIUNTO alla chiusura — la stessa lettura mostrata a schermo in quel momento. */
  toneEnd: number;
  /** Quante volte è stato dato « porta questo a tono quaranta ». */
  repeats: number;
  /** Da dove viene questo ciclo — mai due sorgenti sullo stesso ciclo, v. la nota sopra. */
  source: 'meter' | 'meter+eeg' | 'assessed';
  /** Tono quaranta raggiunto. */
  asIs: boolean;
  /** Il TA (due lattine) alla chiusura, se c'è il meter — il dato grezzo dietro `toneEnd`. */
  ta?: number;
  /** La carica EEG (qL) alla chiusura, se c'è il MUSE — l'altro dato grezzo dietro `toneEnd`. */
  ql?: number;
  proc?: string;
}

export type CorpusRecord = SessionRecord | ReactionRecord | CycleRecord | FnRecord | ItemRecord | ToneRecord;

// ═══════════════════════════════════════════════════════════════════════════════════════════
// COSTRUTTORI
// ═══════════════════════════════════════════════════════════════════════════════════════════

/** Toglie i campi non definiti: una riga più corta, e nessun `null` da interpretare a valle. */
const compact = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null)) as T;

export const sessionRecord = (
  s: string, at: string, d: Omit<SessionRecord, 't' | 'v' | 'at' | 's'>,
): SessionRecord => compact({ v: CORPUS_VERSION, t: 'session', at, s, ...d });

export const reactionRecord = (
  s: string, at: string, d: Omit<ReactionRecord, 't' | 'v' | 'at' | 's'>,
): ReactionRecord => compact({ v: CORPUS_VERSION, t: 'reaction', at, s, ...d });

export const cycleRecord = (
  s: string, at: string, d: Omit<CycleRecord, 't' | 'v' | 'at' | 's'>,
): CycleRecord => compact({ v: CORPUS_VERSION, t: 'cycle', at, s, ...d });

export const itemRecord = (
  s: string, at: string, tSec: number,
  d: Omit<Partial<ItemRecord>, 'v' | 't' | 'at' | 's' | 'tSec'> = {},
): ItemRecord => compact({ v: CORPUS_VERSION, t: 'item', at, s, tSec, ...d });

/** Chiave di RIPETIZIONE di un item: due item sono « lo stesso » se le parole coincidono a meno
 *  di maiuscole, accenti e punteggiatura — la trascrizione vocale non è mai identica due volte.
 *  Il testo NON esce di qui: serve solo a decidere il numero di gruppo. */
export const chiaveItem = (testo: string): string =>
  testo.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const fnRecord = (
  s: string, at: string, d: Omit<FnRecord, 't' | 'v' | 'at' | 's'>,
): FnRecord => compact({ v: CORPUS_VERSION, t: 'fn', at, s, ...d });

export const toneRecord = (
  s: string, at: string, d: Omit<ToneRecord, 't' | 'v' | 'at' | 's'>,
): ToneRecord => compact({ v: CORPUS_VERSION, t: 'tone', at, s, ...d });

/** Una riga JSON Lines. Mai a capo dentro: una riga = un evento, o il file non si legge più. */
export const toLine = (r: CorpusRecord): string => JSON.stringify(r);

/** In quale file va: uno al MESE. Un file per seduta sarebbe una pioggia di file minuscoli;
 *  uno solo per sempre diventerebbe enorme e scomodo da spedire. */
export const corpusFileName = (at: string): string => `${at.slice(0, 7)}.jsonl`;

// ═══════════════════════════════════════════════════════════════════════════════════════════
// LETTURA — serve a chi analizza, e a verificare che l'archivio sia sano
// ═══════════════════════════════════════════════════════════════════════════════════════════

/** Legge un file JSON Lines saltando le righe rotte, invece di fermarsi alla prima.
 *  Un archivio in aggiunta può avere una riga troncata in coda (spegnimento a metà scrittura):
 *  perdere quella è accettabile, perdere tutto il resto no. */
export const parseCorpus = (text: string): CorpusRecord[] => {
  const out: CorpusRecord[] = [];
  for (const line of text.split('\n')) {
    const l = line.trim();
    if (!l) continue;
    try {
      const o = JSON.parse(l) as CorpusRecord;
      if (o && typeof o.t === 'string') out.push(o);
    } catch (_) { /* riga troncata o corrotta: si salta */ }
  }
  return out;
};

/**
 * SCARTO FRA I DUE AGHI sulla stessa reazione: quanto l'EEG anticipa (positivo) o segue
 * (negativo) le boîtes, in secondi.
 *
 * Si accoppiano le reazioni delle due sorgenti che cadono entro `finestraSec` l'una dall'altra.
 * Se i due strumenti leggono davvero la stessa cosa, questi numeri devono stare intorno allo
 * zero: entrambi danno l'instant read alla fine della parola. Uno scarto sistematico direbbe che
 * uno dei due non sta leggendo quello che crediamo — ed è esattamente la ragione per cui il
 * corpus esiste. Si può misurare solo perché ogni reazione porta il proprio istante invece di
 * un tempo medio già mescolato.
 */
export const eegLeadSeconds = (
  records: CorpusRecord[], finestraSec = 5,
): number[] => {
  const reaz = records.filter((r): r is ReactionRecord => r.t === 'reaction');
  const eeg = reaz.filter(r => r.src === 'eeg').sort((a, b) => a.tSec - b.tSec);
  const theta = reaz.filter(r => r.src === 'theta').sort((a, b) => a.tSec - b.tSec);
  const usati = new Set<number>();
  const out: number[] = [];

  for (const e of eeg) {
    let migliore = -1, minDist = Infinity;
    theta.forEach((th, i) => {
      if (usati.has(i)) return;
      const d = Math.abs(th.tSec - e.tSec);
      if (d <= finestraSec && d < minDist) { minDist = d; migliore = i; }
    });
    if (migliore >= 0) {
      usati.add(migliore);
      out.push(theta[migliore].tSec - e.tSec);   // >0 = l'EEG è arrivato PRIMA
    }
  }
  return out;
};

/** Esito del confronto fra i due F/N. */
export interface FnConcordance {
  /** F/N visto da ENTRAMBI gli aghi entro la finestra: concordano. */
  both: number;
  /** Visto solo dall'EEG: l'ago vero non conferma. Se qui c'è stato un AS-IS, è il caso da
   *  studiare — l'AS-IS potrebbe essere stato dichiarato su un F/N che non c'era. */
  onlyEeg: number;
  /** Visto solo dall'ago vero: l'EEG l'ha mancato. */
  onlyTheta: number;
  /** Quota di accordo: both / (both + onlyEeg + onlyTheta). NaN se non c'è nessun F/N — una
   *  seduta senza F/N non dice « accordo perfetto », non dice niente. */
  agreement: number;
  /** Scarti dei soli F/N concordanti (s, >0 = l'EEG ha visto prima). Con questi si TARA l'ago
   *  del Muse su quello del Meter: dicono di quanto anticipa e con che dispersione. */
  leadSec: number[];
  /** AS-IS dichiarati su un F/N dell'EEG che l'ago vero NON ha confermato. È il conteggio della
   *  falsificabilità: se resta a zero su molte sedute, l'AS-IS dell'EEG tiene. */
  asIsUnconfirmed: number;
}

/**
 * CONCORDANZA FRA I DUE F/N — la prova di falsificabilità dell'AS-IS.
 *
 * Si accoppiano gli F/N delle due sorgenti che cadono entro `finestraSec` l'uno dall'altro. La
 * finestra è larga (6 s) di proposito: la risposta elettrodermica ha 1–3 s di latenza propria e
 * un F/N non è un colpo ma una condizione che si instaura — pretendere la coincidenza al decimo
 * conterebbe come « disaccordo » due aghi che dicono la stessa cosa.
 */
export const fnConcordance = (
  records: CorpusRecord[], finestraSec = 6,
): FnConcordance => {
  const fns = records.filter((r): r is FnRecord => r.t === 'fn');
  const eeg = fns.filter(r => r.src === 'eeg').sort((a, b) => a.tSec - b.tSec);
  const theta = fns.filter(r => r.src === 'theta').sort((a, b) => a.tSec - b.tSec);
  const usati = new Set<number>();
  const leadSec: number[] = [];
  let both = 0, asIsUnconfirmed = 0;

  for (const e of eeg) {
    let migliore = -1, minDist = Infinity;
    theta.forEach((th, i) => {
      if (usati.has(i)) return;
      const d = Math.abs(th.tSec - e.tSec);
      if (d <= finestraSec && d < minDist) { minDist = d; migliore = i; }
    });
    if (migliore >= 0) {
      usati.add(migliore);
      both++;
      leadSec.push(theta[migliore].tSec - e.tSec);
    } else if (e.asIs) {
      asIsUnconfirmed++;
    }
  }
  const onlyEeg = eeg.length - both;
  const onlyTheta = theta.length - both;
  const tot = both + onlyEeg + onlyTheta;
  return { both, onlyEeg, onlyTheta, leadSec, asIsUnconfirmed,
           agreement: tot > 0 ? both / tot : NaN };
};
