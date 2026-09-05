import { describe, it, expect } from 'vitest';
import {
  sessionRecord, reactionRecord, cycleRecord, toLine, corpusFileName,
  parseCorpus, eegLeadSeconds, CORPUS_VERSION,
  fnRecord, toneRecord,
  fnConcordance,
} from '../corpus';

const AT = '2026-07-30T09:15:00.000Z';

describe('righe del corpus', () => {
  it('ogni riga porta versione, ora assoluta e seduta', () => {
    // L'ora ASSOLUTA serve a fondere file di macchine diverse; la seduta a legare le righe.
    const r = sessionRecord('s1', AT, { inst: { muse: true, theta: true } });
    expect(r.v).toBe(CORPUS_VERSION);
    expect(r.at).toBe(AT);
    expect(r.s).toBe('s1');
  });

  it('i campi non definiti NON finiscono nella riga', () => {
    const r = reactionRecord('s1', AT, { src: 'theta', key: 'reaction_fall', tSec: 12.5 });
    const o = JSON.parse(toLine(r));
    expect('ql' in o).toBe(false);      // nessun EEG: il campo non esiste, non è null
    expect(o.tSec).toBe(12.5);
  });

  it('una riga NON contiene ritorni a capo: una riga = un evento', () => {
    const r = sessionRecord('s1', AT, { inst: { muse: false, theta: true }, proc: 'Ligne du temps' });
    expect(toLine(r)).not.toContain('\n');
  });

  it('il PROCEDIMENTO si registra: senza, le reazioni sono numeri senza contesto', () => {
    const r = sessionRecord('s1', AT, { inst: { muse: true, theta: true }, proc: 'S&D' });
    expect(r.proc).toBe('S&D');
  });

  it('un file al MESE', () => {
    expect(corpusFileName(AT)).toBe('2026-07.jsonl');
  });

  // ⚠️ AGGIUNTO — v. la nota grande su `ToneRecord` in `corpus.ts`: DUE sorgenti, mai tre — il
  // dichiarato ('assessed') include già la domanda al PC, non un campo a parte.
  it('un ciclo TONE dichiarato non porta né TA né qL: nessuno strumento li ha misurati', () => {
    const r = toneRecord('s1', AT, {
      durSec: 42, toneStart: -8, toneEnd: 12, repeats: 3, source: 'assessed', asIs: true,
    });
    expect('ta' in r).toBe(false);
    expect('ql' in r).toBe(false);
  });

  it('un ciclo TONE misurato porta il dato grezzo dietro il numero', () => {
    const r = toneRecord('s1', AT, {
      durSec: 30, toneStart: 0, toneEnd: 30, repeats: 1, source: 'meter+eeg', asIs: false,
      ta: 2.4, ql: 0.62,
    });
    expect(r.ta).toBe(2.4);
    expect(r.ql).toBe(0.62);
  });
});

describe('parseCorpus', () => {
  it('legge le righe valide', () => {
    const testo = [
      toLine(sessionRecord('s1', AT, { inst: { muse: true, theta: true } })),
      toLine(reactionRecord('s1', AT, { src: 'eeg', key: 'reaction_fall', tSec: 10 })),
    ].join('\n');
    expect(parseCorpus(testo)).toHaveLength(2);
  });

  it('SALTA una riga troncata invece di perdere tutto il file', () => {
    // Un archivio in aggiunta può avere l'ultima riga tagliata a metà (spegnimento durante la
    // scrittura): perdere quella è accettabile, perdere il resto no.
    const testo = toLine(reactionRecord('s1', AT, { src: 'eeg', key: 'reaction_fall', tSec: 10 }))
      + '\n{"t":"reaction","tSec":1' ;
    expect(parseCorpus(testo)).toHaveLength(1);
  });

  it('ignora le righe vuote', () => {
    expect(parseCorpus('\n\n  \n')).toHaveLength(0);
  });
});

// ── LA MISURA PER CUI IL CORPUS ESISTE ─────────────────────────────────────────────────────
describe('anticipo dell EEG sulle boîtes', () => {
  const reaz = (src: 'eeg' | 'theta', tSec: number) =>
    reactionRecord('s1', AT, { src, key: 'reaction_fall', tSec });

  it('misura di QUANTO l EEG arriva prima', () => {
    // Risposta elettrodermica: 1–3 s di latenza fisiologica. Se l'EEG anticipa, si vede QUI.
    const lead = eegLeadSeconds([reaz('eeg', 10), reaz('theta', 12)]);
    expect(lead).toEqual([2]);
  });

  it('un anticipo NEGATIVO significa che l EEG segue', () => {
    expect(eegLeadSeconds([reaz('eeg', 12), reaz('theta', 10)])).toEqual([-2]);
  });

  it('non accoppia reazioni troppo distanti fra loro', () => {
    expect(eegLeadSeconds([reaz('eeg', 10), reaz('theta', 40)])).toEqual([]);
  });

  it('ogni reazione delle boîtes si accoppia UNA volta sola', () => {
    // Due reazioni EEG vicine non devono rivendicare la stessa reazione delle boîtes: darebbe
    // un anticipo raddoppiato che non è mai avvenuto.
    const lead = eegLeadSeconds([reaz('eeg', 10), reaz('eeg', 10.5), reaz('theta', 12)]);
    expect(lead).toHaveLength(1);
  });

  it('accoppia la reazione PIÙ VICINA, non la prima che capita', () => {
    const lead = eegLeadSeconds([reaz('eeg', 10), reaz('theta', 14), reaz('theta', 11)]);
    expect(lead).toEqual([1]);
  });

  it('senza uno dei due aghi non c è nulla da confrontare', () => {
    expect(eegLeadSeconds([reaz('eeg', 10), reaz('eeg', 20)])).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// CONCORDANZA DEI DUE F/N — la prova di falsificabilità dell'AS-IS
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('fnConcordance', () => {
  const fn = (src: 'eeg' | 'theta', tSec: number, extra: Record<string, unknown> = {}) =>
    fnRecord('s1', '2026-07-30T10:00:00.000Z', { src, tSec, ...extra });

  it('conta come ACCORDO due F/N vicini, e ne misura lo scarto', () => {
    const c = fnConcordance([fn('eeg', 100), fn('theta', 102.5)]);
    expect(c.both).toBe(1);
    expect(c.onlyEeg).toBe(0);
    expect(c.onlyTheta).toBe(0);
    expect(c.agreement).toBe(1);
    // >0 = l'EEG ha visto PRIMA: è il numero con cui si tarerà l'ago del Muse.
    expect(c.leadSec).toEqual([2.5]);
  });

  it('separa chi ha visto solo l\'uno o solo l\'altro', () => {
    const c = fnConcordance([fn('eeg', 10), fn('eeg', 200), fn('theta', 11), fn('theta', 500)]);
    expect(c.both).toBe(1);
    expect(c.onlyEeg).toBe(1);
    expect(c.onlyTheta).toBe(1);
    expect(c.agreement).toBeCloseTo(1 / 3, 5);
  });

  it('conta gli AS-IS dichiarati su un F/N che l\'ago vero NON conferma', () => {
    const c = fnConcordance([
      fn('eeg', 10, { asIs: true }), fn('theta', 11),        // confermato
      fn('eeg', 300, { asIs: true }),                        // NON confermato → falsificabile
      fn('eeg', 400),                                        // F/N senza AS-IS: non si conta
    ]);
    expect(c.asIsUnconfirmed).toBe(1);
  });

  it('nessun F/N non vuol dire accordo perfetto: non dice niente', () => {
    expect(fnConcordance([]).agreement).toBeNaN();
  });

  it('ogni F/N dell\'ago vero si usa UNA volta sola', () => {
    // Due F/N EEG ravvicinati e uno solo delle boîtes: uno resta senza conferma.
    const c = fnConcordance([fn('eeg', 100), fn('eeg', 101), fn('theta', 100.5)]);
    expect(c.both).toBe(1);
    expect(c.onlyEeg).toBe(1);
  });
});
