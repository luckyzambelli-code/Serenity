import { describe, it, expect } from 'vitest';
import { computeInstantRead, readWaitSeconds, readWindow} from '../instantRead';
import { READ_WINDOW_BEFORE_S, READ_WINDOW_AFTER_S } from '../tuning';

/**
 * LETTURA ISTANTANEA di un item (ASSESSMENT / R&I).
 * Qui si bloccano le regole che sono costate di più in seduta:
 *   • la fonte è SOLO ciò che è stato MOSTRATO all'auditor;
 *   • nessuna reazione → NULL;
 *   • niente letture LATENTI (dopo l'item);
 *   • un item non ruba la lettura dell'item PRECEDENTE;
 *   • il ritardo è « quanto PRIMA » (sempre ≥ 0, mostrato col segno −).
 */
const shown = (...pairs: [number, string][]) => pairs.map(([time, reaction]) => ({ time, reaction }));

describe('computeInstantRead', () => {
  it('nessuna reazione mostrata → NULL', () => {
    expect(computeInstantRead([], 10).read).toBe('NULL');
    expect(computeInstantRead(shown([10, 'Fall']), 10).read).not.toBe('NULL'); // sanity
  });

  it('prende la reazione avvenuta appena PRIMA dell item', () => {
    const r = computeInstantRead(shown([9.6, 'Fall']), 10);
    expect(r.read).toBe('Fall');
    expect(r.beforeMs).toBe(400);            // 0,4 s prima
  });

  it('il ritardo non è mai negativo (si mostra sempre col segno meno)', () => {
    const r = computeInstantRead(shown([10.05, 'Fall']), 10);   // dentro la tolleranza dopo
    expect(r.beforeMs).toBeGreaterThanOrEqual(0);
  });

  it('IGNORA le letture LATENTI (troppo dopo l item)', () => {
    const late = 10 + READ_WINDOW_AFTER_S + 0.5;
    expect(computeInstantRead(shown([late, 'Long Fall']), 10).read).toBe('NULL');
  });

  it('IGNORA ciò che è troppo indietro nel tempo', () => {
    const old = 10 - READ_WINDOW_BEFORE_S - 0.5;
    expect(computeInstantRead(shown([old, 'Long Fall']), 10).read).toBe('NULL');
  });

  it('NON ruba la lettura dell item PRECEDENTE (limite notBefore)', () => {
    // Fall a 9.2 = reazione dell item precedente (dato a 9.0). L item corrente è a 10.
    const reads = shown([9.2, 'Fall']);
    expect(computeInstantRead(reads, 10).read).toBe('Fall');          // senza limite: la ruba
    expect(computeInstantRead(reads, 10, 9.5).read).toBe('NULL');     // con limite: corretto
  });

  it('a parità di finestra sceglie la reazione PIÙ FORTE', () => {
    const r = computeInstantRead(shown([9.7, 'SF'], [9.8, 'LF Blow Down'], [9.9, 'Tick']), 10);
    expect(r.read).toBe('LF Blow Down');
  });

  it('ignora voci che non sono letture valide', () => {
    expect(computeInstantRead(shown([9.8, 'Set'], [9.9, 'rumore']), 10).read).toBe('NULL');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// L'INSTANT READ — alla fine ESATTA della parola
// La lettura che conta avviene alla fine del major thought. Una reazione che arriva dopo è
// LATENTE e NON VALE: è la definizione stessa dell'instant read. Avevo aperto 3,5 s in avanti
// « per la latenza elettrodermica » — quella finestra fabbricava letture false invece di
// recuperarne di vere. Correzione dell'utente, che qui è l'autorità sulla tecnica.
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('computeInstantRead — instant read, non latente', () => {
  it('la reazione delle boîtes alla fine della parola VALE', () => {
    const r = computeInstantRead([{ time: 10.2, reaction: 'Fall', src: 'theta' }], 10);
    expect(r.read).toBe('Fall');
    expect(r.afterMs).toBe(200);
  });

  it('una reazione LATENTE (2 s dopo) NON vale, da nessuno dei due aghi', () => {
    expect(computeInstantRead([{ time: 12, reaction: 'Fall', src: 'theta' }], 10).read).toBe('NULL');
    expect(computeInstantRead([{ time: 12, reaction: 'Fall', src: 'eeg' }], 10).read).toBe('NULL');
  });

  it('l\'EEG continua a essere letto PRIMA dell\'item', () => {
    const r = computeInstantRead([{ time: 9.5, reaction: 'Long Fall', src: 'eeg' }], 10);
    expect(r.read).toBe('Long Fall');
    expect(r.beforeMs).toBe(500);
    expect(r.afterMs).toBe(0);
  });

  it('senza sorgente si comporta come l\'EEG: nessuna regressione', () => {
    expect(computeInstantRead([{ time: 9.5, reaction: 'Fall' }], 10).read).toBe('Fall');
    expect(computeInstantRead([{ time: 12, reaction: 'Fall' }], 10).read).toBe('NULL');
  });

  it('l\'item SEGUENTE chiude comunque la finestra in avanti', () => {
    const reads = [{ time: 10.3, reaction: 'Fall', src: 'theta' as const }];
    expect(computeInstantRead(reads, 10, -Infinity, 10.2).read).toBe('NULL');
    expect(computeInstantRead(reads, 10, -Infinity, Infinity).read).toBe('Fall');
  });

  it('a parità di finestra vince la lettura più FORTE, da qualunque ago', () => {
    const r = computeInstantRead([
      { time: 9.8, reaction: 'Tick', src: 'eeg' },
      { time: 10.2, reaction: 'Long Fall', src: 'theta' },
    ], 10);
    expect(r.read).toBe('Long Fall');
    expect(r.src).toBe('theta');
  });
});

describe('readWaitSeconds — quando si GUARDA, non che cosa si accetta', () => {
  it('col meter si dà tempo all\'episodio di chiudersi, senza no', () => {
    // Non allarga la finestra: una reazione latente resta scartata comunque (prova sopra).
    expect(readWaitSeconds(true)).toBeGreaterThanOrEqual(1.5);
    expect(readWaitSeconds(false)).toBeLessThan(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// COL MUSE L'EEG PRODUCE UNA RAFFICA
// Misurato in seduta a due strumenti (01/08/2026): fino a sei reazioni EEG attorno a una sola
// parola. Con « vince la più forte » un blowdown di mezzo secondo prima batteva la lettura che
// stava sulla parola — e l'instant read è quella sulla parola.
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('computeInstantRead — con una raffica, vince la più VICINA', () => {
  it('una reazione più forte ma LONTANA non batte quella sulla parola', () => {
    const r = computeInstantRead([
      { time: 9.55, reaction: 'LF Blow Down', src: 'eeg' },   // −450 ms, la più forte
      { time: 10.02, reaction: 'Tick', src: 'eeg' },          // +20 ms, sulla parola
    ], 10);
    expect(r.read).toBe('Tick');
  });

  it('ma allo STESSO istante vince la più forte', () => {
    const r = computeInstantRead([
      { time: 10.02, reaction: 'Tick', src: 'eeg' },
      { time: 10.08, reaction: 'Long Fall', src: 'eeg' },     // 60 ms più in là: stesso istante
    ], 10);
    expect(r.read).toBe('Long Fall');
  });

  it('la raffica vera della seduta: si tiene quella sulla parola', () => {
    // « avons-nous mangé » — le letture EEG realmente registrate attorno all'item.
    const r = computeInstantRead([
      { time: 10 - 2.769, reaction: 'Tick', src: 'eeg' },
      { time: 10 - 2.269, reaction: 'SF', src: 'eeg' },
      { time: 10 - 0.769, reaction: 'F/N (Floating)', src: 'eeg' },
      { time: 10 + 0.131, reaction: 'LF Blow Down', src: 'eeg' },
      { time: 10 + 1.631, reaction: 'Tick', src: 'eeg' },
    ], 10);
    expect(r.read).toBe('LF Blow Down');
    expect(r.afterMs).toBe(131);
  });

  it('la finestra AVANTI è ora la stessa per i due aghi', () => {
    // Era 0,15 s per l'EEG, tarata quando l'item veniva datato all'arrivo della trascrizione.
    // Con la fine parola misurata dal microfono, quell'asimmetria buttava via le reazioni EEG
    // a +281 e +332 ms mentre teneva quelle del meter a +181 ms.
    expect(readWindow('eeg').after).toBe(readWindow('theta').after);
    expect(computeInstantRead([{ time: 10.28, reaction: 'Long Fall', src: 'eeg' }], 10).read)
      .toBe('Long Fall');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// UN AGO SOLO — la lettura viene dall'ago che l'auditor GUARDA
//
// Misurato il 02/08/2026 su 89 item con MUSE e METER insieme: hanno letto lo STESSO item una
// volta (solo MUSE 31, solo METER 6, nessuno 51 — κ di Cohen −0,09). Con due aghi sullo stesso
// quadrante e un verdetto unico, la scritta poteva raccontare un movimento che l'auditor non
// aveva davanti agli occhi. Ora la lettura si prende dall'ago mostrato, e quella dell'altro si
// archivia a parte (`readMuse` / `readMeter`) invece di essere fusa in una media.
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('computeInstantRead — soloSrc', () => {
  const reads = [
    { time: 10.0, reaction: 'Long Fall', src: 'eeg' as const },
    { time: 10.1, reaction: 'Tick', src: 'theta' as const },
  ];

  it('senza vincolo sceglie fra tutti e due', () => {
    const r = computeInstantRead(reads, 10.05);
    expect(['eeg', 'theta']).toContain(r.src);
  });

  it('col METER mostrato, la lettura è quella del METER — anche se l EEG ne ha una più forte', () => {
    const r = computeInstantRead(reads, 10.05, -Infinity, Infinity, 'theta');
    expect(r.read).toBe('Tick');
    expect(r.src).toBe('theta');
  });

  it('col MUSE mostrato, la lettura è quella del MUSE', () => {
    const r = computeInstantRead(reads, 10.05, -Infinity, Infinity, 'eeg');
    expect(r.read).toBe('Long Fall');
    expect(r.src).toBe('eeg');
  });

  it('se l ago mostrato non ha visto niente: NULL, non la lettura dell altro', () => {
    // È il caso più frequente: 31 item su 89 letti dal solo MUSE. Ripiegare sull'altro ago
    // riempirebbe l'assessment di letture che non stanno sul quadrante che si guarda.
    const soloEeg = [{ time: 10.0, reaction: 'Long Fall', src: 'eeg' as const }];
    expect(computeInstantRead(soloEeg, 10.05, -Infinity, Infinity, 'theta').read).toBe('NULL');
    expect(computeInstantRead(soloEeg, 10.05, -Infinity, Infinity, 'eeg').read).toBe('Long Fall');
  });

  it('una lettura senza `src` conta come EEG (righe vecchie)', () => {
    const senza = [{ time: 10.0, reaction: 'Fall' }];
    expect(computeInstantRead(senza, 10.05, -Infinity, Infinity, 'eeg').read).toBe('Fall');
    expect(computeInstantRead(senza, 10.05, -Infinity, Infinity, 'theta').read).toBe('NULL');
  });
});
