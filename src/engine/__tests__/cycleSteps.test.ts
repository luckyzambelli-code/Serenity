import { describe, it, expect } from 'vitest';
import { stepsOf, currentStep, stepDone, type StepId } from '../cycleSteps';
import { SESSION_MODES } from '../sessionMode';
import type { SessionPhase } from '../sessionPhase';

describe('quanti tempi ha ogni metodo', () => {
  it('CONTACT e NULL tre, MIRROR quattro, TONE due — uno per comando di Ron', () => {
    expect(stepsOf('contact')).toHaveLength(3);
    expect(stepsOf('null')).toHaveLength(3);
    expect(stepsOf('mirror')).toHaveLength(4);
    expect(stepsOf('tone')).toHaveLength(2);   // i DUE comandi di Ron
  });

  it('APERTO non ha sequenza — è il suo senso, e la pista non si disegna', () => {
    expect(stepsOf('free')).toEqual([]);
    expect(currentStep('free', 'free')).toBe(-1);
  });

  it('MIRROR ha « dai l item » E « dai il valore »: sono due gesti, non uno', () => {
    expect(stepsOf('mirror')).toEqual(['item', 'value', 'double', 'obtained']);
  });

  it('nessun metodo ripete due volte lo stesso tempo', () => {
    for (const m of SESSION_MODES) {
      const s = stepsOf(m);
      expect({ m, n: new Set(s).size }).toEqual({ m, n: s.length });
    }
  });
});

describe('a quale tempo si è', () => {
  const casi: Array<[SessionPhase, 'contact' | 'null' | 'mirror' | 'tone', number]> = [
    ['contact.item', 'contact', 0], ['contact.mockup', 'contact', 1], ['contact.asis', 'contact', 2],
    ['null.item', 'null', 0], ['null.mockup', 'null', 1], ['null.equilibrium', 'null', 2],
    ['mirror.item', 'mirror', 0], ['mirror.contact', 'mirror', 1],
    ['mirror.doubling', 'mirror', 2], ['mirror.reached', 'mirror', 3],
    ['tone.item', 'tone', 0], ['tone.raise', 'tone', 1],
  ];
  for (const [fase, modo, atteso] of casi) {
    it(`${fase} → tempo ${atteso + 1}`, () => expect(currentStep(fase, modo)).toBe(atteso));
  }

  it('l indice non esce MAI dall elenco del metodo', () => {
    for (const [fase, modo] of casi) {
      const i = currentStep(fase, modo);
      expect({ fase, ok: i >= 0 && i < stepsOf(modo).length }).toEqual({ fase, ok: true });
    }
  });
});

describe('le fasi che condividono un tempo — la pista non deve avanzare a vuoto', () => {
  it('null.rise è ancora il tempo del MOCK-UP: si guarda, non si fa', () => {
    expect(currentStep('null.rise', 'null')).toBe(currentStep('null.mockup', 'null'));
  });

  it('mirror.say_item è ancora « dai l item »: si aspetta la voce', () => {
    expect(currentStep('mirror.say_item', 'mirror')).toBe(currentStep('mirror.item', 'mirror'));
  });

  it('tone.say_item è ancora il tempo dell ITEM: la resistenza non è detta', () => {
    expect(currentStep('tone.say_item', 'tone')).toBe(currentStep('tone.item', 'tone'));
  });

  it('tone.done non inventa un terzo tempo: resta sull ultimo', () => {
    expect(currentStep('tone.done', 'tone')).toBe(1);
  });
});

describe('fuori dal ciclo non c è tempo', () => {
  for (const f of ['ready', 'ep_window', 'debrief', 'paused', 'instruments'] as SessionPhase[]) {
    it(`${f} → nessun tempo`, () => expect(currentStep(f, 'contact')).toBe(-1));
  }

  it('e nemmeno se la fase è di UN ALTRO metodo — la pista non legge la fase sbagliata', () => {
    expect(currentStep('null.mockup', 'contact')).toBe(-1);
    expect(currentStep('tone.raise', 'mirror')).toBe(-1);
  });
});

describe('il ritorno al primo tempo', () => {
  it('chiuso un ciclo e ridato l item, si torna al tempo 1', () => {
    expect(currentStep('contact.asis', 'contact')).toBe(2);
    expect(currentStep('contact.item', 'contact')).toBe(0);   // riarmato
  });

  it('e il traguardo è spuntato, non « in corso »', () => {
    expect(stepDone('contact.asis')).toBe(true);
    expect(stepDone('null.equilibrium')).toBe(true);
    expect(stepDone('mirror.reached')).toBe(true);
    expect(stepDone('tone.done')).toBe(true);
    expect(stepDone('contact.mockup')).toBe(false);
    expect(stepDone('mirror.item')).toBe(false);
  });
});

describe('ogni ID ha un posto', () => {
  it('nessun ID orfano fra quelli dichiarati', () => {
    const usati = new Set<StepId>(SESSION_MODES.flatMap(m => stepsOf(m)));
    // i tre di CONTACT + equilibrium + i tre propri di MIRROR + tone40 + ri/ask_truth. `item`
    // è condiviso da CONTACT/NULL/MIRROR/TONE, e si conta una volta sola; TRUTH ha il proprio
    // primo tempo (`ri`), non condiviso — il R/I non è un item come gli altri.
    expect(usati.size).toBe(10);
  });
});
