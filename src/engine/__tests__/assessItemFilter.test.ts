import { describe, it, expect } from 'vitest';
import { isAssessableItem, normalizeItem } from '../assessItemFilter';

/**
 * Il filtro decide quali frasi dell'auditor diventano ITEM.
 * REGOLA DI FONDO: è PRUDENTE — nel dubbio l'item passa. Perdere un item vero è molto peggio
 * che tenere una riga di troppo.
 */
describe('normalizeItem', () => {
  it('toglie accenti, punteggiatura e maiuscole', () => {
    expect(normalizeItem("D'accord !")).toBe('d accord');
    expect(normalizeItem('Affinité ?')).toBe('affinite');
    expect(normalizeItem('  OK.  ')).toBe('ok');
  });
});

describe('isAssessableItem', () => {
  it('TIENE i veri item d auditing', () => {
    expect(isAssessableItem('Affinità?')).toBe(true);
    expect(isAssessableItem('Realtà?')).toBe(true);
    expect(isAssessableItem('Comunicazione?')).toBe(true);
    expect(isAssessableItem('Tua madre')).toBe(true);
    expect(isAssessableItem('Un problema di lavoro')).toBe(true);
  });

  it('SCARTA gli intercalari nelle 5 lingue', () => {
    ['ok', 'OK.', 'bene', 'allora', "d'accord", 'oui', 'yes', 'thank you', 'vale', 'tack']
      .forEach(f => expect(isAssessableItem(f), f).toBe(false));
  });

  it('SCARTA il vuoto e la sola punteggiatura', () => {
    expect(isAssessableItem('')).toBe(false);
    expect(isAssessableItem('   ')).toBe(false);
    expect(isAssessableItem('...')).toBe(false);
    expect(isAssessableItem('?')).toBe(false);      // troppo corto
  });

  it('SCARTA i monologhi (commento, non item)', () => {
    const monologo = 'allora adesso ti spiego bene come funziona questa cosa perche e importante capirla';
    expect(isAssessableItem(monologo)).toBe(false);
  });

  it('MA tiene una domanda lunga (finisce con ?) — resta una domanda d auditing', () => {
    const domandaLunga = 'ce qualcosa nella tua vita di tutti i giorni che non hai ancora detto a nessuno?';
    expect(isAssessableItem(domandaLunga)).toBe(true);
  });

  it('una parola che CONTIENE un intercalare non viene scartata', () => {
    expect(isAssessableItem('okkupazione')).toBe(true);   // non è "ok"
    expect(isAssessableItem('Bene comune')).toBe(true);   // non è "bene" da solo
  });
});
