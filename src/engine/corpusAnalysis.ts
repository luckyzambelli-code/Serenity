/**
 * ANALISI DEL CORPUS — mettere a confronto i DUE aghi.
 *
 * Risponde alle tre domande poste in seduta (01/08/2026):
 *   · quali reazioni prende il MUSE e quali il METER;
 *   · di quale ampiezza;
 *   · la corrispondenza fra le due è quella che avevamo stabilito?
 *
 * ── PERCHÉ CONTEGGI E NON IMPRESSIONI ───────────────────────────────────────────────────────
 * Guardare due aghi affiancati dà un'impressione, e le impressioni su questo progetto si sono
 * già rivelate sbagliate quattro volte in tre giorni. Qui si contano le coincidenze e si guarda
 * la DISPERSIONE, non la media: una media di 300 ms non dice niente se i valori vanno da −2 s a
 * +3 s, mentre dice molto se stanno tutti fra 200 e 400.
 *
 * ── L'IPOTESI CHE QUESTO SERVE A FALSIFICARE ────────────────────────────────────────────────
 * « Il MUSE ha più reazioni perché lavora a un livello superiore di percezione. » Se è vero, si
 * vedranno molte reazioni EEG senza compagna sul meter. Ma quel risultato ha DUE letture: o
 * percezione superiore, o classificatore EEG che legge troppo — e i conteggi da soli non le
 * distinguono. A distinguerle è `profiloSolitarie`: le reazioni che solo il MUSE vede devono
 * cadere SUBITO DOPO gli item. Se sono sparse nel tempo, sono rumore.
 *
 * Puro TS: nessun accesso al disco, nessuna dipendenza. La lettura dei file sta nello script.
 */
import type { CorpusRecord, ReactionRecord, ItemRecord } from './corpus';

/** Due reazioni, una per ago, che descrivono lo STESSO momento. */
export interface Coppia {
  eeg: ReactionRecord;
  theta: ReactionRecord;
  /** `theta.tSec − eeg.tSec`: positivo = l'EEG ha visto PRIMA. */
  leadSec: number;
}

export interface Appaiamento {
  coppie: Coppia[];
  /** Viste SOLO dall'EEG. */
  soloEeg: ReactionRecord[];
  /** Viste SOLO dall'ago vero. */
  soloTheta: ReactionRecord[];
}

/**
 * Appaia le reazioni dei due aghi.
 *
 * Si prendono PRIMA le coppie più vicine nel tempo, non le prime che capitano: con item ogni
 * due secondi, procedere in ordine di apparizione appaierebbe una reazione EEG con la reazione
 * theta dell'item precedente solo perché la incontra prima. Ogni reazione si usa una volta sola.
 *
 * `finestraSec` è stretta (2 s) di proposito: si parla di instant read, non di vicinanza vaga.
 *
 * ⚠️ SOLO DENTRO LA STESSA SEDUTA. `tSec` è il tempo dall'inizio della seduta, non un'ora: senza
 * questo controllo una reazione del meter a 45 s si appaiava con una reazione MUSE a 45 s di
 * un'ALTRA seduta. Con tredici sedute e ~60 reazioni MUSE ciascuna, ogni reazione del meter
 * trovava sempre una compagna — da cui « solo METER 0 », un anticipo mediano esattamente zero, e
 * una corrispondenza che sembrava misurata e non lo era. Difetto trovato il 01/08/2026: aveva
 * viziato TUTTI i rapporti precedenti.
 */
export const appaia = (records: CorpusRecord[], finestraSec = 2): Appaiamento => {
  const reaz = records.filter((r): r is ReactionRecord => r.t === 'reaction');
  const eeg = reaz.filter(r => r.src === 'eeg');
  const theta = reaz.filter(r => r.src === 'theta');

  const candidate: { i: number; j: number; d: number }[] = [];
  eeg.forEach((e, i) => theta.forEach((th, j) => {
    if (th.s !== e.s) return;                       // sedute diverse: non sono confrontabili
    const d = Math.abs(th.tSec - e.tSec);
    if (d <= finestraSec) candidate.push({ i, j, d });
  }));
  candidate.sort((a, b) => a.d - b.d);

  const eegPresi = new Set<number>(), thetaPresi = new Set<number>();
  const coppie: Coppia[] = [];
  for (const c of candidate) {
    if (eegPresi.has(c.i) || thetaPresi.has(c.j)) continue;
    eegPresi.add(c.i); thetaPresi.add(c.j);
    coppie.push({ eeg: eeg[c.i], theta: theta[c.j], leadSec: theta[c.j].tSec - eeg[c.i].tSec });
  }
  coppie.sort((a, b) => a.eeg.tSec - b.eeg.tSec);

  return {
    coppie,
    soloEeg: eeg.filter((_, i) => !eegPresi.has(i)),
    soloTheta: theta.filter((_, j) => !thetaPresi.has(j)),
  };
};

/** Quante volte, quando il MUSE dice X, l'ago vero dice Y. */
export interface Matrice {
  /** chiave EEG → chiave theta → conteggio. */
  celle: Map<string, Map<string, number>>;
  totale: number;
  /** Coppie in cui i due dicono la STESSA cosa. */
  uguali: number;
  /** Quante ne darebbe il CASO, a parità di distribuzioni. Senza questo, `uguali` non si sa
   *  leggere: vedi `ugualiPerCaso`. */
  uguali_perCaso: number;
}

export const matriceCorrispondenza = (coppie: Coppia[]): Matrice => {
  const celle = new Map<string, Map<string, number>>();
  let uguali = 0;
  for (const c of coppie) {
    if (!celle.has(c.eeg.key)) celle.set(c.eeg.key, new Map());
    const riga = celle.get(c.eeg.key)!;
    riga.set(c.theta.key, (riga.get(c.theta.key) ?? 0) + 1);
    if (c.eeg.key === c.theta.key) uguali++;
  }
  return { celle, totale: coppie.length, uguali, uguali_perCaso: ugualiPerCaso(coppie) };
};

/**
 * Quante coppie sarebbero IDENTICHE per puro caso.
 *
 * « 15 % identiche » da solo non vuol dire niente: dipende da quanto sono sbilanciate le due
 * distribuzioni. Se il MUSE dice « tick » metà delle volte e il meter « fall » un terzo, un po'
 * di coincidenze arrivano gratis. Il numero che conta è OSSERVATO contro QUESTO.
 *
 * Si tengono le due distribuzioni marginali e si sganciano l'una dall'altra:
 * attese = Σ_k  n_muse(k) · n_meter(k) / n. (È l'atteso della diagonale in un test χ².)
 */
export const ugualiPerCaso = (coppie: Coppia[]): number => {
  const n = coppie.length;
  if (!n) return NaN;
  const cMuse = new Map<string, number>(), cMeter = new Map<string, number>();
  for (const c of coppie) {
    cMuse.set(c.eeg.key, (cMuse.get(c.eeg.key) ?? 0) + 1);
    cMeter.set(c.theta.key, (cMeter.get(c.theta.key) ?? 0) + 1);
  }
  let attese = 0;
  for (const [k, a] of cMuse) attese += (a * (cMeter.get(k) ?? 0)) / n;
  return attese;
};

/** Come si distribuisce una grandezza. La MEDIA da sola inganna: 300 ms di media con valori
 *  fra −2 s e +3 s non vuol dire niente; con valori fra 200 e 400 vuol dire tutto. */
export interface Dispersione {
  n: number;
  mediana: number;
  p10: number;
  p90: number;
  media: number;
  /** Scarto quadratico medio. */
  scarto: number;
}

export const dispersione = (valori: number[]): Dispersione => {
  const n = valori.length;
  if (!n) return { n: 0, mediana: NaN, p10: NaN, p90: NaN, media: NaN, scarto: NaN };
  const v = [...valori].sort((a, b) => a - b);
  const q = (p: number) => v[Math.min(n - 1, Math.max(0, Math.round(p * (n - 1))))];
  const media = v.reduce((a, b) => a + b, 0) / n;
  const varianza = v.reduce((a, b) => a + (b - media) ** 2, 0) / n;
  return { n, mediana: q(0.5), p10: q(0.10), p90: q(0.90), media, scarto: Math.sqrt(varianza) };
};

/**
 * Le reazioni che UN SOLO ago ha visto — e la prova che decide se valgono.
 *
 * Una reazione che vale cade SUBITO DOPO l'item. Se le solitarie sono sparse nel tempo, non
 * sono percezione superiore: sono rumore. È questa la differenza fra « il MUSE vede di più » e
 * « il MUSE legge troppo », e nessun conteggio di quantità la può dare.
 */
export interface ProfiloSolitarie {
  n: number;
  /** Quante sono avvenute DURANTE un assessment: le sole su cui il criterio della vicinanza
   *  all'item ha senso. Le altre restano contate, ma non giudicate. */
  inAssess: number;
  /** Quante cadono VICINO a un item (entro `vicinoSec`). È il conteggio che decide: se le
   *  reazioni in più si accalcano attorno agli item valgono, se sono sparpagliate no.
   *  La mediana da sola non basta — in seduta molte reazioni avvengono nei CICLI, lontano da
   *  qualunque item, e trascinano la mediana senza dire niente sulle altre. */
  vicine: number;
  /** Quante portano la distanza dall'item (le altre sono state date fuori da un ciclo). */
  conItem: number;
  /** Come si distribuisce quella distanza (s). */
  daItem: Dispersione;
  /** Conteggio per tipo di reazione. */
  perTipo: Map<string, number>;
}

export const profiloSolitarie = (rs: ReactionRecord[], vicinoSec = 2): ProfiloSolitarie => {
  // ⚠️ SOLO le reazioni avvenute DURANTE un assessment. È l'unica situazione in cui l'item è
  // lo stimolo unico e « lontano dall'item = rumore » è un ragionamento valido. In seduta il
  // preclear pensa e risponde di suo: lì una reazione lontana da ogni item può benissimo essere
  // sua — e infatti il preclear le riconosce (osservato in seduta, 01/08/2026). Mescolare le due
  // faceva dichiarare RUMORE reazioni che nessuno aveva il diritto di chiamare così.
  const inAssess = rs.filter(r => r.assess === true);
  const conItem = inAssess.filter(r => typeof r.sinceItemSec === 'number');
  const perTipo = new Map<string, number>();
  for (const r of rs) perTipo.set(r.key, (perTipo.get(r.key) ?? 0) + 1);
  return {
    n: rs.length,
    inAssess: inAssess.length,
    conItem: conItem.length,
    vicine: conItem.filter(r => (r.sinceItemSec as number) <= vicinoSec).length,
    daItem: dispersione(conItem.map(r => r.sinceItemSec as number)),
    perTipo,
  };
};

/**
 * AMPIEZZE — due CORSE, finalmente nella stessa grandezza.
 *
 * Fino al 01/08/2026 questo confronto era impossibile, per due motivi separati:
 *   • dal lato MUSE si archiviava `REACTION_OFFSETS[etichetta]`, cioè un numero RICAVATO DAL
 *     NOME della reazione — tutte le « fall » valevano 0,42, misurate o no. Si ripiegava sulla
 *     CARICA (qL), che però è un'altra cosa ancora;
 *   • dal lato boîtes si archiviava la DISTANZA DA SET, che dipende da dove sta il braccio.
 *
 * Ora entrambi archiviano una corsa in unità di quadrante: `moveR` (quanto l'ago virtuale si è
 * mosso in 0,5 s) contro la corsa dell'ago vero. Restano due strumenti diversi e la finestra
 * temporale non è la stessa — ma sono due misure, e si possono mettere sullo stesso grafico.
 *
 * ⚠️ Le righe scritte PRIMA di quella data hanno il vecchio significato. Il rapporto le tiene
 * separate: mescolarle darebbe una correlazione che non vuol dire niente.
 */
export interface CoppiaAmpiezza { ql: number; peak: number; moveR?: number }

export const ampiezzeAppaiate = (coppie: Coppia[]): CoppiaAmpiezza[] =>
  coppie
    .filter(c => typeof c.eeg.ql === 'number' && typeof c.theta.peak === 'number')
    .map(c => ({ ql: c.eeg.ql as number, peak: c.theta.peak as number,
                 moveR: typeof c.eeg.peak === 'number' ? c.eeg.peak : undefined }));

/** Correlazione di Pearson. NaN se i punti sono meno di tre o una delle due grandezze è piatta
 *  — con due punti passa sempre una retta, e dire « correlazione 1 » sarebbe una bugia. */
export const correlazione = (xs: number[], ys: number[]): number => {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return NaN;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return NaN;
  return sxy / Math.sqrt(sxx * syy);
};

/**
 * QUANTO DAREBBE IL CASO — la misura senza cui « si accalcano attorno agli item » non vuol dire
 * niente.
 *
 * Con item ogni tre secondi, il 70 % di QUALUNQUE cosa cade entro due secondi da un item: anche
 * il rumore puro, per pura geometria. Confrontare la quota osservata con una soglia scelta a mano
 * — come facevo — è quindi un errore: la soglia giusta è quella che darebbe il caso, e dipende
 * da come sono spaziati gli item di QUELLA seduta.
 *
 * Si calcola così: per ogni intervallo fra due item, la frazione di esso che sta entro
 * `vicinoSec` dall'inizio. La media di quelle frazioni è la quota attesa se le reazioni cadessero
 * a caso.
 *
 * Restituisce NaN con meno di tre item: da due intervalli non si stima niente.
 */
export const quotaPerCaso = (records: CorpusRecord[], vicinoSec = 2): number => {
  // ⚠️ PER SEDUTA. Ogni seduta riparte da zero: mescolando gli istanti di sedute diverse si
  // ottengono intervalli inventati e minuscoli, e il « caso » risultava molto più alto di quello
  // vero. È stato questo a far sembrare che le reazioni cadessero MENO del caso.
  const perSeduta = new Map<string, number[]>();
  for (const r of records) {
    if (r.t !== 'item') continue;
    if (!perSeduta.has(r.s)) perSeduta.set(r.s, []);
    perSeduta.get(r.s)!.push(r.tSec);
  }
  const gap: number[] = [];
  for (const t of perSeduta.values()) {
    if (t.length < 2) continue;
    t.sort((a, b) => a - b);
    for (let i = 1; i < t.length; i++) {
      const g = t[i] - t[i - 1];
      // Intervalli assurdi (una pausa fra due assessment) non descrivono il ritmo degli item.
      if (g > 0.2 && g < 30) gap.push(g);
    }
  }
  if (gap.length < 2) return NaN;
  return gap.reduce((a, g) => a + Math.min(vicinoSec, g) / g, 0) / gap.length;
};

/**
 * SIMULAZIONE: e se il MUSE fosse MENO SENSIBILE?
 *
 * Idea dell'utente (01/08/2026), e si può provare sui dati già raccolti senza rifare sedute.
 * Il MUSE dà quindici volte le reazioni del meter. Se sta vedendo LA STESSA COSA, solo più
 * finemente, allora alzandogli la soglia — cioè tenendo solo le reazioni più forti — quelle che
 * restano dovrebbero essere PROPRIO quelle del meter. Se invece continuano a non incontrarsi,
 * i due strumenti non misurano la stessa cosa, e nessuna taratura li farà coincidere.
 *
 * È una prova che può FALLIRE, ed è per questo che vale la pena farla.
 *
 * L'F/N resta FUORI dalla scala: non è un'ampiezza, è una forma nel tempo. Metterlo in una
 * graduatoria di forza vorrebbe dire confrontare due cose che non si confrontano.
 */
export const SCALA_FORZA = [
  'reaction_tick', 'reaction_sf', 'reaction_fall', 'reaction_long_fall', 'reaction_blow_down',
] as const;

export interface Livello {
  /** La soglia simulata: si tengono le reazioni da QUESTA in su. */
  da: string;
  /** Quante reazioni EEG sopravvivono. */
  rimaste: number;
  /** Quante del METER trovano una compagna. */
  appaiate: number;
  /** Su quante del METER in tutto. */
  suMeter: number;
  /** Di quelle appaiate, quante dicono la STESSA lettura. */
  identiche: number;
}

/**
 * Alza la soglia del MUSE un gradino per volta e guarda cosa succede all'accordo col meter.
 *
 * Il livello che conta è quello in cui i due hanno all'incirca lo STESSO numero di reazioni: lì
 * gli strumenti sono « pari sensibilità », e l'accordo che si misura è quello vero.
 */
export const simulaSensibilita = (records: CorpusRecord[]): Livello[] => {
  const reaz = records.filter((r): r is ReactionRecord => r.t === 'reaction');
  const theta = reaz.filter(r => r.src === 'theta');
  const out: Livello[] = [];
  for (let i = 0; i < SCALA_FORZA.length; i++) {
    const ammessi = new Set<string>(SCALA_FORZA.slice(i));
    const eeg = reaz.filter(r => r.src === 'eeg' && ammessi.has(r.key));
    const { coppie } = appaia([...eeg, ...theta]);
    out.push({
      da: SCALA_FORZA[i],
      rimaste: eeg.length,
      appaiate: coppie.length,
      suMeter: theta.length,
      identiche: coppie.filter(c => c.eeg.key === c.theta.key).length,
    });
  }
  return out;
};

/**
 * DISTANZA DALL'ITEM, ricalcolata QUI e non presa dall'app.
 *
 * ⚠️ Il campo `sinceItemSec` scritto durante la seduta è VIZIATO, e per una ragione che si vede
 * solo nei dati: l'app registra un item quando ne ARRIVA la trascrizione, cioè ~940 ms dopo che
 * la parola è finita. Una reazione avvenuta 200 ms dopo l'item veniva quindi confrontata con
 * l'item PRECEDENTE e riceveva una distanza enorme.
 *
 * Misurato sull'archivio: ZERO reazioni nel primo mezzo secondo dopo un item, mentre altrove due
 * reazioni possono distare 0,1 s. Quel buco È il ritardo della trascrizione — e faceva sembrare
 * che le reazioni evitassero gli item.
 *
 * Qui il conto si rifà dalle righe `item`, che portano l'istante GIÀ retrodatato: per ogni
 * reazione, l'ultimo item che la precede. Nessun ritardo, nessun buco.
 */
export const distanzeDaItem = (records: CorpusRecord[]): number[] => {
  const perSeduta = new Map<string, { item: number[]; reaz: number[] }>();
  for (const r of records) {
    if (r.t !== 'item' && !(r.t === 'reaction' && r.src === 'eeg' && r.assess)) continue;
    if (!perSeduta.has(r.s)) perSeduta.set(r.s, { item: [], reaz: [] });
    const g = perSeduta.get(r.s)!;
    if (r.t === 'item') g.item.push(r.tSec); else g.reaz.push((r as ReactionRecord).tSec);
  }
  const out: number[] = [];
  for (const { item, reaz } of perSeduta.values()) {
    if (!item.length) continue;
    item.sort((a, b) => a - b);
    for (const t of reaz) {
      // ⚠️ Si tengono SOLO le reazioni comprese FRA DUE ITEM.
      //
      // Quelle dopo l'ultimo item cadono in una finestra che non ha fine — l'assessment resta
      // aperto mentre l'auditor parla — e producevano code di 6, 10, 20 secondi. Ma il « caso »
      // si calcola dagli INTERVALLI fra due item: confrontare quelle code con quel caso vuol
      // dire misurare in una finestra e attendersi il valore di un'altra. Misurato: 33 reazioni
      // su 91 stavano in quella coda, e da sole facevano crollare la quota osservata.
      let prec = -1, succ = -1;
      for (const i of item) {
        if (i <= t) prec = i;
        else { succ = i; break; }
      }
      if (prec >= 0 && succ >= 0) out.push(t - prec);
    }
  }
  return out;
};

/**
 * RIPETIBILITÀ — la prova che decide, e che le altre non riuscivano a fare.
 *
 * Nella tecnica un item che legge continua a leggere finché non è scaricato. Quindi: dato lo
 * STESSO item due o tre volte, uno strumento che segue il significato deve dare la STESSA
 * lettura (o una che decresce fino a spegnersi); uno che fa rumore darà letture scorrelate.
 *
 * È il criterio migliore perché NON dipende da quando cade una reazione — che è ciò su cui i
 * test precedenti si sono arenati — ma dal fatto che due prove dello stesso item si somiglino.
 *
 * E può fallire: se le ripetizioni danno letture a caso, lo dice.
 */
export interface Ripetizione {
  /** Il gruppo (il numero, non le parole). */
  g: number;
  /** Le letture nell'ordine in cui l'item è stato dato. */
  letture: string[];
  /** Tutte uguali? */
  costante: boolean;
  /** Decrescono fino a spegnersi — il comportamento atteso da un item che si scarica. */
  siEsaurisce: boolean;
  /**
   * ⚠️ ARRESTO OPZIONALE — l'item è stato dato in un BLOCCO ininterrotto, e l'auditor è passato
   * al successivo subito dopo. Allora la lunghezza del gruppo non era decisa in anticipo: era
   * decisa dal risultato, perché si smette di dare un item **quando smette di leggere**.
   *
   * È la procedura giusta in seduta, e rende la sequenza INUTILIZZABILE come prova: qualunque
   * test su « come finisce » troverà quello che la regola di arresto ci ha messo.
   *
   * Misurato il 02/08/2026, e ritratta la conclusione del giorno prima: su due sedute a blocchi
   * 6 gruppi su 6 finivano a NULL (permutazione: 0,02 %). Su una seduta con gli stessi item
   * ALTERNATI — nessuna regola di arresto — **0 su 4**. Non era lo strumento: era il protocollo.
   */
  bloccoChiusoSuNull: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// IL GIUDIZIO DEL PRECLEAR — il solo criterio esterno ai due aghi
//
// Su 89 item con entrambi gli strumenti i due aghi hanno letto lo STESSO item **una volta**
// (κ di Cohen −0,09: indipendenti). Nessuno dei due può quindi validare l'altro. Il preclear
// invece sa se un item lo ha smosso, e il suo giudizio non viene da nessuna delle due catene
// di misura: è l'unico modo di chiedere « quale dei due trova gli item CARICHI ».
// ═══════════════════════════════════════════════════════════════════════════════════════════
export interface ResaAgo {
  /** Item su cui il preclear si è pronunciato. */
  n: number;
  /** Quanti aveva dichiarato carichi. */
  carichi: number;
  /** Ha letto un item CARICO (vero positivo). */
  presi: number;
  /** Ha letto un item che il preclear dice SCARICO (falso positivo). */
  falsi: number;
  /** Item carichi che ha mancato. */
  mancati: number;
}

/**
 * Come si comporta UN ago rispetto al giudizio del preclear. `leggi` estrae la sua lettura.
 *
 * `criterio` sceglie QUALE giudizio si usa, e i due NON si mescolano:
 *   'pcCarico' — prova cieca: il preclear dichiara la carica PRIMA di vedere la lettura;
 *   'indica'   — R&I: l'auditor indica la reazione e il preclear dice se gli indica.
 * Sono due domande diverse poste in due momenti diversi. Sommarle vorrebbe dire non sapere più
 * quale delle due si sta misurando.
 */
export const resaAgo = (
  records: CorpusRecord[],
  leggi: (it: ItemRecord) => string | undefined,
  criterio: 'pcCarico' | 'indica' = 'pcCarico',
): ResaAgo => {
  const out: ResaAgo = { n: 0, carichi: 0, presi: 0, falsi: 0, mancati: 0 };
  for (const r of records) {
    if (r.t !== 'item') continue;
    const giudizio = criterio === 'indica' ? r.indica : r.pcCarico;
    if (giudizio === undefined) continue;
    const l = leggi(r);
    if (l === undefined) continue;          // quello strumento non c'era: non è un mancato
    out.n++;
    const letto = l !== 'NULL';
    if (giudizio) {
      out.carichi++;
      if (letto) out.presi++; else out.mancati++;
    } else if (letto) out.falsi++;
  }
  return out;
};

/** Forza di una lettura, per dire se una sequenza DECRESCE. NULL vale zero: è lo spegnimento. */
const FORZA: Record<string, number> = {
  'NULL': 0, 'Tick': 1, 'F/N (Floating)': 1, 'SF': 2, 'Dirty Needle': 2,
  'Fall': 3, 'Long Fall': 4, 'LF Blow Down': 5,
};

export const ripetizioni = (records: CorpusRecord[]): Ripetizione[] => {
  const per = new Map<string, ItemRecord[]>();
  // La SEQUENZA di tutti gli item di ogni seduta: serve a sapere se un gruppo è stato dato in
  // un blocco ininterrotto (arresto opzionale) o alternato con gli altri.
  const perSeduta = new Map<string, ItemRecord[]>();
  for (const r of records) {
    if (r.t !== 'item' || r.g === undefined || !r.read) continue;
    const k = `${r.s}#${r.g}`;
    if (!per.has(k)) per.set(k, []);
    per.get(k)!.push(r);
    if (!perSeduta.has(r.s)) perSeduta.set(r.s, []);
    perSeduta.get(r.s)!.push(r);
  }
  for (const v of perSeduta.values()) v.sort((a, b) => a.tSec - b.tSec);

  const out: Ripetizione[] = [];
  for (const [k, rs] of per) {
    if (rs.length < 2) continue;          // una volta sola non è una ripetizione
    rs.sort((a, b) => a.tSec - b.tSec);
    const letture = rs.map(r => r.read as string);
    const f = letture.map(x => FORZA[x] ?? 0);
    // Blocco = le occorrenze del gruppo sono CONTIGUE nella sequenza della seduta. Se lo sono e
    // il blocco si chiude su un NULL, l'auditor ha smesso perché l'item ha smesso di leggere:
    // la lunghezza è un esito, non un piano.
    const seq = perSeduta.get(rs[0].s) ?? [];
    const pos = seq.map((x, i) => (x.g === rs[0].g ? i : -1)).filter(i => i >= 0);
    const contigue = pos.length > 1 && pos[pos.length - 1] - pos[0] === pos.length - 1;
    out.push({
      g: Number(k.split('#')[1]),
      letture,
      costante: letture.every(x => x === letture[0]),
      // « Si esaurisce » = non risale mai, e finisce più in basso di dove è partita.
      siEsaurisce: f.every((v, i) => i === 0 || v <= f[i - 1]) && f[f.length - 1] < f[0],
      bloccoChiusoSuNull: contigue && letture[letture.length - 1] === 'NULL',
    });
  }
  return out;
};
