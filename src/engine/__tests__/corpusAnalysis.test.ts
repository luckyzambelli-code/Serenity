import { describe, it, expect } from 'vitest';
import {
  appaia, matriceCorrispondenza, dispersione, profiloSolitarie,
  ampiezzeAppaiate, correlazione, ripetizioni, ugualiPerCaso, resaAgo,
} from '../corpusAnalysis';
import { reactionRecord, itemRecord, chiaveItem, type CorpusRecord } from '../corpus';

/**
 * Il confronto fra i due aghi. Serve a rispondere con CONTEGGI a domande su cui, su questo
 * progetto, le impressioni si sono già rivelate sbagliate quattro volte in tre giorni.
 */

const r = (src: 'eeg' | 'theta', key: string, tSec: number,
           extra: Record<string, unknown> = {}): CorpusRecord =>
  reactionRecord('s1', '2026-08-01T10:00:00.000Z', { src, key, tSec, ...extra });

describe('appaia — quale reazione dell uno corrisponde a quale dell altro', () => {
  it('mette insieme le due reazioni dello stesso momento', () => {
    const a = appaia([r('eeg', 'reaction_fall', 10), r('theta', 'reaction_fall', 10.4)]);
    expect(a.coppie).toHaveLength(1);
    expect(a.coppie[0].leadSec).toBeCloseTo(0.4, 6);   // >0 = l'EEG ha visto prima
    expect(a.soloEeg).toHaveLength(0);
    expect(a.soloTheta).toHaveLength(0);
  });

  it('prende PRIMA le coppie più vicine, non le prime che incontra', () => {
    // In assessment gli item si susseguono: procedere in ordine di apparizione appaierebbe la
    // reazione EEG con la theta dell'item PRECEDENTE, solo perché la incontra prima.
    const a = appaia([
      r('eeg', 'reaction_fall', 10),
      r('eeg', 'reaction_sf', 11.5),
      r('theta', 'reaction_sf', 11.4),      // vicinissima alla SECONDA
      r('theta', 'reaction_fall', 10.2),    // vicinissima alla PRIMA
    ]);
    expect(a.coppie).toHaveLength(2);
    for (const c of a.coppie) expect(Math.abs(c.leadSec)).toBeLessThan(0.3);
  });

  it('ogni reazione si usa UNA volta sola', () => {
    const a = appaia([
      r('eeg', 'reaction_fall', 10), r('eeg', 'reaction_fall', 10.1),
      r('theta', 'reaction_fall', 10.05),
    ]);
    expect(a.coppie).toHaveLength(1);
    expect(a.soloEeg).toHaveLength(1);
  });

  it('fuori finestra non si appaia: resta solitaria', () => {
    const a = appaia([r('eeg', 'reaction_fall', 10), r('theta', 'reaction_fall', 30)]);
    expect(a.coppie).toHaveLength(0);
    expect(a.soloEeg).toHaveLength(1);
    expect(a.soloTheta).toHaveLength(1);
  });

  it('MAI FRA SEDUTE DIVERSE — `tSec` è un tempo di seduta, non un orario', () => {
    // Il difetto che ha viziato tutti i rapporti fino al 01/08/2026: con tredici sedute e ~60
    // reazioni MUSE ciascuna, ogni reazione del meter trovava una compagna a pochi millisecondi
    // in QUALCHE altra seduta. Ne uscivano « solo METER 0 » e un anticipo mediano di zero —
    // numeri che sembravano misurati e non lo erano.
    const s2 = (src: 'eeg' | 'theta', key: string, tSec: number): CorpusRecord =>
      reactionRecord('s2', '2026-08-02T10:00:00.000Z', { src, key, tSec });
    const a = appaia([r('eeg', 'reaction_fall', 10), s2('theta', 'reaction_fall', 10.05)]);
    expect(a.coppie).toHaveLength(0);
    expect(a.soloEeg).toHaveLength(1);
    expect(a.soloTheta).toHaveLength(1);
  });
});

describe('matriceCorrispondenza — la corrispondenza è quella che credevamo?', () => {
  it('conta cosa dice l uno quando l altro dice X', () => {
    const { coppie } = appaia([
      r('eeg', 'reaction_fall', 10),      r('theta', 'reaction_fall', 10.2),
      r('eeg', 'reaction_fall', 20),      r('theta', 'reaction_sf', 20.2),
      r('eeg', 'reaction_long_fall', 30), r('theta', 'reaction_fall', 30.2),
    ]);
    const m = matriceCorrispondenza(coppie);
    expect(m.totale).toBe(3);
    expect(m.uguali).toBe(1);
    expect(m.celle.get('reaction_fall')?.get('reaction_fall')).toBe(1);
    expect(m.celle.get('reaction_fall')?.get('reaction_sf')).toBe(1);
    expect(m.celle.get('reaction_long_fall')?.get('reaction_fall')).toBe(1);
  });
});

describe('dispersione — la media da sola inganna', () => {
  it('due insiemi con la STESSA media si distinguono per la dispersione', () => {
    const stretto = dispersione([0.28, 0.30, 0.30, 0.32]);
    const largo   = dispersione([-2.0, 0.30, 0.30, 2.6]);
    expect(stretto.media).toBeCloseTo(largo.media, 1);   // stessa media…
    expect(stretto.scarto).toBeLessThan(0.05);           // …e nulla in comune
    expect(largo.scarto).toBeGreaterThan(1);
  });

  it('dà mediana e decili, non solo la media', () => {
    const d = dispersione([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(d.n).toBe(10);
    expect(d.mediana).toBeGreaterThanOrEqual(5);
    expect(d.p10).toBeLessThan(d.mediana);
    expect(d.p90).toBeGreaterThan(d.mediana);
  });

  it('nessun valore: non inventa numeri', () => {
    expect(dispersione([]).n).toBe(0);
    expect(dispersione([]).mediana).toBeNaN();
  });
});

describe('profiloSolitarie — « vede di più » o « legge troppo »?', () => {
  it('reazioni SUBITO dopo l item: raccolte', () => {
    const p = profiloSolitarie([
      r('eeg', 'reaction_sf', 10, { sinceItemSec: 0.3, assess: true }),
      r('eeg', 'reaction_sf', 20, { sinceItemSec: 0.4, assess: true }),
      r('eeg', 'reaction_sf', 30, { sinceItemSec: 0.35, assess: true }),
    ] as never[]);
    expect(p.n).toBe(3);
    expect(p.conItem).toBe(3);
    expect(p.daItem.scarto).toBeLessThan(0.1);      // raccolte = valgono
  });

  it('reazioni sparse nel tempo: è rumore, e si vede', () => {
    const p = profiloSolitarie([
      r('eeg', 'reaction_sf', 10, { sinceItemSec: 0.2, assess: true }),
      r('eeg', 'reaction_sf', 20, { sinceItemSec: 4.8, assess: true }),
      r('eeg', 'reaction_sf', 30, { sinceItemSec: 9.1, assess: true }),
    ] as never[]);
    expect(p.daItem.scarto).toBeGreaterThan(1);
  });

  it('FUORI da un assessment non si giudica: in seduta il preclear pensa di suo', () => {
    // Applicare « lontano dall'item = rumore » in seduta dichiarava rumore reazioni che il
    // preclear riconosce come proprie. Fuori assessment si contano, non si giudicano.
    const p = profiloSolitarie([
      r('eeg', 'reaction_sf', 10, { sinceItemSec: 0.2 }),
      r('eeg', 'reaction_sf', 20, { sinceItemSec: 8.8 }),
    ] as never[]);
    expect(p.n).toBe(2);
    expect(p.inAssess).toBe(0);
    expect(p.conItem).toBe(0);        // niente da giudicare
  });

  it('conta anche per tipo', () => {
    const p = profiloSolitarie([
      r('eeg', 'reaction_sf', 10), r('eeg', 'reaction_sf', 20), r('eeg', 'reaction_fall', 30),
    ] as never[]);
    expect(p.perTipo.get('reaction_sf')).toBe(2);
    expect(p.perTipo.get('reaction_fall')).toBe(1);
  });
});

describe('ampiezze — si confronta una misura con una misura', () => {
  it('prende la CARICA dell EEG e il PICCO dell ago, non le due ampiezze del quadrante', () => {
    const { coppie } = appaia([
      r('eeg', 'reaction_fall', 10, { ql: 1.2 }),
      r('theta', 'reaction_fall', 10.2, { peak: 0.5 }),
    ]);
    const a = ampiezzeAppaiate(coppie);
    expect(a).toEqual([{ ql: 1.2, peak: 0.5 }]);
  });

  it('salta le coppie a cui manca una delle due misure', () => {
    const { coppie } = appaia([
      r('eeg', 'reaction_fall', 10),                       // niente carica
      r('theta', 'reaction_fall', 10.2, { peak: 0.5 }),
    ]);
    expect(ampiezzeAppaiate(coppie)).toHaveLength(0);
  });

  it('la correlazione non si pronuncia su due punti soli', () => {
    // Con due punti passa sempre una retta: dire « correlazione 1 » sarebbe una bugia.
    expect(correlazione([1, 2], [1, 2])).toBeNaN();
    expect(correlazione([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 6);
    expect(correlazione([1, 2, 3], [6, 4, 2])).toBeCloseTo(-1, 6);
  });

  it('e nemmeno su una grandezza piatta', () => {
    expect(correlazione([1, 1, 1], [1, 2, 3])).toBeNaN();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// RIPETIBILITÀ — la prova che decide
// Un item che legge continua a leggere finché non è scaricato. Due prove dello stesso item si
// devono somigliare: è il criterio che NON dipende da quando cade una reazione — cioè da ciò
// su cui i test precedenti si sono arenati tre volte.
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('ripetizioni', () => {
  const it_ = (g: number, tSec: number, read: string): CorpusRecord =>
    itemRecord('s1', '2026-08-01T10:00:00.000Z', tSec, { g, read });

  it('un item dato una volta sola non è una ripetizione', () => {
    expect(ripetizioni([it_(1, 10, 'Fall')])).toHaveLength(0);
  });

  it('stessa lettura ogni volta: COSTANTE', () => {
    const r = ripetizioni([it_(1, 10, 'Fall'), it_(1, 30, 'Fall'), it_(1, 50, 'Fall')]);
    expect(r[0].costante).toBe(true);
    expect(r[0].letture).toEqual(['Fall', 'Fall', 'Fall']);
  });

  it('letture che calano fino a spegnersi: SI ESAURISCE', () => {
    // È il comportamento atteso da un item che si scarica: legge, legge meno, non legge più.
    const r = ripetizioni([it_(1, 10, 'Long Fall'), it_(1, 30, 'Fall'), it_(1, 50, 'NULL')]);
    expect(r[0].siEsaurisce).toBe(true);
    expect(r[0].costante).toBe(false);
  });

  it('letture che vanno su e giù: né costante né in esaurimento', () => {
    const r = ripetizioni([it_(1, 10, 'Tick'), it_(1, 30, 'Long Fall'), it_(1, 50, 'NULL')]);
    expect(r[0].costante).toBe(false);
    expect(r[0].siEsaurisce).toBe(false);   // è RISALITA: non è un esaurimento
  });

  it('le occorrenze si ordinano nel TEMPO, non nell ordine di scrittura', () => {
    const r = ripetizioni([it_(1, 50, 'NULL'), it_(1, 10, 'Long Fall'), it_(1, 30, 'Fall')]);
    expect(r[0].letture).toEqual(['Long Fall', 'Fall', 'NULL']);
  });

  it('gruppi diversi non si mescolano', () => {
    const r = ripetizioni([
      it_(1, 10, 'Fall'), it_(1, 30, 'Fall'),
      it_(2, 20, 'Tick'), it_(2, 40, 'Tick'),
    ]);
    expect(r).toHaveLength(2);
  });
});

describe('chiaveItem — due item sono « lo stesso »', () => {
  it('a meno di maiuscole, accenti e punteggiatura', () => {
    // La trascrizione vocale non restituisce mai due volte la stessa stringa esatta.
    expect(chiaveItem('Perché?')).toBe(chiaveItem('perche'));
    expect(chiaveItem('  Tu   sei ')).toBe(chiaveItem('tu sei'));
    expect(chiaveItem('È vero!')).toBe(chiaveItem('e vero'));
  });

  it('ma parole diverse restano diverse', () => {
    expect(chiaveItem('rosso')).not.toBe(chiaveItem('rossi'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// IL CASO — « 15 % identiche » da solo non vuol dire niente
// Su questo progetto un verdetto è già stato dato una volta senza baseline, e si è rivelato
// sbagliato. Una percentuale di coincidenze si legge SOLO contro quello che darebbe il caso.
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('ugualiPerCaso', () => {
  const coppia = (ke: string, kt: string, t: number) =>
    appaia([r('eeg', ke, t), r('theta', kt, t + 0.2)]).coppie[0];

  it('due aghi che dicono SEMPRE la stessa cosa: il caso le darebbe tutte lo stesso', () => {
    // Se entrambi dicono solo « fall », coincidere non è un merito: è inevitabile.
    const cs = [coppia('reaction_fall', 'reaction_fall', 10),
                coppia('reaction_fall', 'reaction_fall', 20),
                coppia('reaction_fall', 'reaction_fall', 30)];
    const m = matriceCorrispondenza(cs);
    expect(m.uguali).toBe(3);
    expect(m.uguali_perCaso).toBeCloseTo(3, 6);   // nessun merito: il caso fa altrettanto
  });

  it('distribuzioni SENZA nulla in comune: il caso non ne darebbe nessuna', () => {
    const cs = [coppia('reaction_tick', 'reaction_fall', 10),
                coppia('reaction_tick', 'reaction_fall', 20)];
    const m = matriceCorrispondenza(cs);
    expect(m.uguali).toBe(0);
    expect(m.uguali_perCaso).toBeCloseTo(0, 6);
  });

  it('un accordo VERO sta sopra il caso', () => {
    // Due gradi equiprobabili da entrambe le parti: il caso ne azzeccherebbe metà.
    const cs = [coppia('reaction_tick', 'reaction_tick', 10),
                coppia('reaction_tick', 'reaction_tick', 20),
                coppia('reaction_fall', 'reaction_fall', 30),
                coppia('reaction_fall', 'reaction_fall', 40)];
    const m = matriceCorrispondenza(cs);
    expect(m.uguali).toBe(4);
    expect(m.uguali_perCaso).toBeCloseTo(2, 6);
    expect(m.uguali).toBeGreaterThan(m.uguali_perCaso);
  });

  it('nessuna coppia: non inventa un numero', () => {
    expect(ugualiPerCaso([])).toBeNaN();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// ARRESTO OPZIONALE — perché il risultato del 01/08/2026 è stato ritratto
//
// Su due sedute, 6 gruppi su 6 finivano a NULL: permutazione 0,02 %, sembrava il primo segnale
// vero dell'indagine. Ma in quelle sedute gli item erano dati A BLOCCHI, e l'auditor passava al
// successivo **quando l'item smetteva di leggere** — procedura giusta in seduta, e regola di
// arresto in statistica. La lunghezza del gruppo era un ESITO, non un piano: il test teneva
// fisse lunghezze che erano state decise dal risultato.
//
// Con gli stessi item ALTERNATI e un numero di ripetizioni deciso prima: 0 su 4.
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('ripetizioni — riconosce l arresto opzionale', () => {
  const item = (g: number, tSec: number, read: string): CorpusRecord =>
    itemRecord('s1', '2026-08-01T10:00:00.000Z', tSec, { g, read });

  it('un BLOCCO che si chiude su NULL è segnalato', () => {
    const r = ripetizioni([
      item(1, 10, 'Long Fall'), item(1, 20, 'Fall'), item(1, 30, 'NULL'),
      item(2, 40, 'Fall'), item(2, 50, 'NULL'),
    ]);
    expect(r.every(x => x.bloccoChiusoSuNull)).toBe(true);
  });

  it('ALTERNATI non è arresto opzionale, anche finendo a NULL', () => {
    // Alternando, l'ultima lettura di ogni gruppo capita dove finisce la seduta — non dove
    // l'auditor ha deciso di smettere. La sequenza torna utilizzabile.
    const r = ripetizioni([
      item(1, 10, 'Long Fall'), item(2, 20, 'Fall'),
      item(1, 30, 'Fall'),      item(2, 40, 'Tick'),
      item(1, 50, 'NULL'),      item(2, 60, 'NULL'),
    ]);
    expect(r.every(x => x.bloccoChiusoSuNull)).toBe(false);
  });

  it('un blocco che NON finisce a NULL non è viziato', () => {
    // La regola di arresto è « smetto quando smette di leggere »: se l'ultima legge ancora,
    // a fermare non è stato il risultato.
    const r = ripetizioni([
      item(1, 10, 'Fall'), item(1, 20, 'NULL'), item(1, 30, 'Long Fall'),
      item(2, 40, 'Tick'), item(2, 50, 'Tick'),
    ]);
    expect(r.find(x => x.g === 1)!.bloccoChiusoSuNull).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// IL GIUDIZIO DEL PRECLEAR — il solo criterio esterno ai due aghi
// Su 89 item i due hanno letto lo STESSO item una volta (κ = −0,09): non possono validarsi a
// vicenda. Il preclear sì.
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('resaAgo', () => {
  const it_ = (tSec: number, d: Record<string, unknown>): CorpusRecord =>
    itemRecord('s1', '2026-08-02T10:00:00.000Z', tSec, d);

  it('conta presi, mancati e falsi', () => {
    const rs = [
      it_(10, { pcCarico: true,  readMuse: 'Fall',  readMeter: 'NULL' }),
      it_(20, { pcCarico: true,  readMuse: 'NULL',  readMeter: 'Tick' }),
      it_(30, { pcCarico: false, readMuse: 'Tick',  readMeter: 'NULL' }),
      it_(40, { pcCarico: false, readMuse: 'NULL',  readMeter: 'NULL' }),
    ];
    const M = resaAgo(rs, r => r.readMuse);
    expect(M).toEqual({ n: 4, carichi: 2, presi: 1, falsi: 1, mancati: 1 });
    const T = resaAgo(rs, r => r.readMeter);
    expect(T).toEqual({ n: 4, carichi: 2, presi: 1, falsi: 0, mancati: 1 });
  });

  it('un item SENZA giudizio del preclear non entra', () => {
    // Se il preclear non ha risposto (o la prova cieca era spenta) non c'è criterio: contarlo
    // come « scarico » regalerebbe specificità a chi non legge mai.
    const r = resaAgo([it_(10, { readMuse: 'Fall' })], x => x.readMuse);
    expect(r.n).toBe(0);
  });

  it('uno strumento ASSENTE non colleziona mancati', () => {
    // Senza il meter collegato, `readMeter` non esiste: quegli item non sono suoi fallimenti.
    const rs = [it_(10, { pcCarico: true, readMuse: 'Fall' })];
    expect(resaAgo(rs, r => r.readMeter).n).toBe(0);
    expect(resaAgo(rs, r => r.readMuse).presi).toBe(1);
  });

  it('un ago che legge TUTTO prende tutti i carichi — e tutti gli scarichi', () => {
    // È l'avvertimento che il rapporto stampa: la sensibilità da sola non dice niente.
    const rs = [
      it_(10, { pcCarico: true,  readMuse: 'Fall' }),
      it_(20, { pcCarico: false, readMuse: 'Fall' }),
      it_(30, { pcCarico: false, readMuse: 'Fall' }),
    ];
    const M = resaAgo(rs, r => r.readMuse);
    expect(M.presi).toBe(M.carichi);      // « trova il 100 % dei carichi »…
    expect(M.falsi).toBe(2);              // …e legge anche tutto il resto
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// R&I contro PROVA CIECA — due domande, due criteri, MAI sommati
// « aveva carica? » si chiede PRIMA di mostrare la lettura (esperimento); « ti indica? » si
// chiede DOPO averla indicata (procedura). Mescolarli vorrebbe dire non sapere più quale delle
// due si sta misurando.
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('resaAgo — i due criteri restano separati', () => {
  const it_ = (tSec: number, d: Record<string, unknown>): CorpusRecord =>
    itemRecord('s1', '2026-08-02T10:00:00.000Z', tSec, d);

  const righe = [
    it_(10, { pcCarico: true,  readMuse: 'Fall' }),          // solo prova cieca
    it_(20, { indica: true,    readMuse: 'Long Fall' }),     // solo R&I
    it_(30, { pcCarico: false, indica: true, readMuse: 'Tick' }),  // tutte e due, in disaccordo
  ];

  it('la prova cieca conta SOLO le righe con pcCarico', () => {
    const r = resaAgo(righe, x => x.readMuse, 'pcCarico');
    expect(r.n).toBe(2);          // la riga di solo R&I non entra
    expect(r.carichi).toBe(1);
    expect(r.falsi).toBe(1);      // la terza: scarica ma l'ago ha letto
  });

  it('l R&I conta SOLO le righe con indica', () => {
    const r = resaAgo(righe, x => x.readMuse, 'indica');
    expect(r.n).toBe(2);
    expect(r.carichi).toBe(2);    // entrambe indicano
    expect(r.presi).toBe(2);
  });

  it('la stessa riga può dire cose OPPOSTE ai due criteri', () => {
    // Terza riga: il preclear NON sentiva carica, ma la reazione gli indica. È un caso vero
    // (una lettura può indicare senza che il preclear l'avesse riconosciuta prima) e i due
    // conteggi devono poterlo mostrare invece di annullarlo.
    const sola = [righe[2]];
    expect(resaAgo(sola, x => x.readMuse, 'pcCarico').falsi).toBe(1);
    expect(resaAgo(sola, x => x.readMuse, 'indica').presi).toBe(1);
  });

  it('per difetto guarda la prova cieca', () => {
    expect(resaAgo(righe, x => x.readMuse)).toEqual(resaAgo(righe, x => x.readMuse, 'pcCarico'));
  });
});
