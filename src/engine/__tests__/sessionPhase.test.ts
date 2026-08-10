import { describe, it, expect } from 'vitest';
import { derivePhase, phaseFamily, isCyclePhase, type PhaseSignals } from '../sessionPhase';

/**
 * La base: seduta in corso, CONTACT, niente armato, nessuna trasversale aperta. Ogni test
 * cambia SOLO i segnali che gli servono — così quel che prova si legge nell'override.
 */
const base: PhaseSignals = {
  splashOpen: false,
  sessionState: 'running',
  hasInstrument: true,
  preflightOpen: false,
  epWindowOpen: false,
  reportOpen: false,
  mode: 'contact',
  cycleArmed: false,
  asIsPending: false,
  nullPhase: 'neutral',
  mirrorArmed: false,
  itemNamed: true,   // caso normale: l'item è stato scritto prima di premere
  mirrorLocked: false,
  mirrorReached: false,
  tonePhase: 'locate',
};
const s = (o: Partial<PhaseSignals>): PhaseSignals => ({ ...base, ...o });

describe('la precedenza fra le fasi', () => {
  it('la finestra EP scavalca TUTTO: è il momento della realizzazione del preclear', () => {
    expect(derivePhase(s({
      epWindowOpen: true,
      mode: 'tone', tonePhase: 'raise',   // un ciclo in pieno corso
      cycleArmed: true, asIsPending: true,
    }))).toBe('ep_window');
  });

  it('ma non fuori seduta: una finestra EP rimasta aperta non blocca la fine', () => {
    expect(derivePhase(s({ epWindowOpen: true, sessionState: 'ended' }))).toBe('debrief');
  });

  it('il rapporto vince sul ciclo: la seduta è finita', () => {
    expect(derivePhase(s({ reportOpen: true, cycleArmed: true }))).toBe('debrief');
  });

  it('la pausa vince sul ciclo, e il ciclo resta dov era', () => {
    expect(derivePhase(s({ sessionState: 'paused', cycleArmed: true }))).toBe('paused');
  });

  it('lo splash copre lo schermo: sta sopra il preflight', () => {
    expect(derivePhase(s({
      splashOpen: true, preflightOpen: true, sessionState: 'idle',
    }))).toBe('boot');
  });

  it('il preflight vince su ready e su instruments', () => {
    expect(derivePhase(s({ preflightOpen: true, sessionState: 'idle' }))).toBe('preflight');
    expect(derivePhase(s({
      preflightOpen: true, sessionState: 'idle', hasInstrument: false,
    }))).toBe('preflight');
  });
});

describe('fuori seduta', () => {
  it('senza strumenti si sceglie che cosa collegare', () => {
    expect(derivePhase(s({ sessionState: 'idle', hasInstrument: false }))).toBe('instruments');
  });

  it('con gli strumenti a posto si aspetta lo START', () => {
    expect(derivePhase(s({ sessionState: 'idle' }))).toBe('ready');
  });
});

describe('CONTACT — tre tempi, non quattro', () => {
  it('1 · dai l item', () => {
    expect(derivePhase(s({}))).toBe('contact.item');
  });

  it('2 · chiedi un mock-up, poi il ciclo avanza da sé', () => {
    expect(derivePhase(s({ cycleArmed: true }))).toBe('contact.mockup');
  });

  it('3 · AS-IS proposto — valida l auditor, mai l app', () => {
    expect(derivePhase(s({ cycleArmed: true, asIsPending: true }))).toBe('contact.asis');
  });

  it('la dissoluzione NON è un tempo: è quel che si misura mentre il 2 dura', () => {
    // Non esiste alcuna fase « discharge »: fra mockup e asis non c'è nulla in mezzo.
    const armato = derivePhase(s({ cycleArmed: true }));
    const finito = derivePhase(s({ cycleArmed: true, asIsPending: true }));
    expect([armato, finito]).toEqual(['contact.mockup', 'contact.asis']);
  });
});

describe('NULL — il ciclo speculare', () => {
  const n = (o: Partial<PhaseSignals>) => derivePhase(s({ mode: 'null', ...o }));

  it('1 · dai l item che NON legge', () => {
    expect(n({})).toBe('null.item');
  });

  it('2 · chiedi un mock-up', () => {
    expect(n({ cycleArmed: true, nullPhase: 'null' })).toBe('null.mockup');
  });

  it('3 · la carica sale: il null era genuino', () => {
    expect(n({ cycleArmed: true, nullPhase: 'rise' })).toBe('null.rise');
  });

  it('EQUILIBRIUM: tornato alla base, si valida coi VGI s', () => {
    expect(n({ cycleArmed: true, nullPhase: 'clear_read' })).toBe('null.equilibrium');
  });

  it('non armato, la fase interna della FSM non conta', () => {
    expect(n({ cycleArmed: false, nullPhase: 'rise' })).toBe('null.item');
  });
});

describe('MIRROR — il metodo del raddoppio', () => {
  const m = (o: Partial<PhaseSignals>) => derivePhase(s({ mode: 'mirror', ...o }));

  it('1 · dai l item', () => {
    expect(m({})).toBe('mirror.item');
  });

  it('2 · premuto col campo vuoto, si aspetta la voce', () => {
    expect(m({ mirrorArmed: true, itemNamed: false })).toBe('mirror.say_item');
  });

  it('3 · contatto: il valore 1–10 non si è ancora fissato', () => {
    expect(m({ mirrorArmed: true, itemNamed: true })).toBe('mirror.contact');
  });

  it('4 · porta al doppio', () => {
    expect(m({
      mirrorArmed: true, itemNamed: true, mirrorLocked: true,
    })).toBe('mirror.doubling');
  });

  it('OTTENUTO: lo smaltito ha raggiunto il doppio', () => {
    expect(m({
      mirrorArmed: true, itemNamed: true, mirrorLocked: true, mirrorReached: true,
    })).toBe('mirror.reached');
  });

  it('l item viene prima dell aggancio: nominarlo non si salta', () => {
    // Agganciato ma senza item nominato → si resta a « dì l'item », non si passa a contatto.
    expect(m({ mirrorArmed: true, mirrorLocked: true, itemNamed: false })).toBe('mirror.say_item');
  });
});

describe('TONE SCALE — i DUE comandi di Ron', () => {
  const tn = (o: Partial<PhaseSignals>) => derivePhase(s({ mode: 'tone', ...o }));

  it('1 · dai l item — « locate resistance on your case »', () => {
    expect(tn({ tonePhase: 'locate' })).toBe('tone.item');
  });

  it('premuto col campo vuoto, si aspetta la voce — NON si dà il secondo comando', () => {
    // Era il difetto: premuto ASSESSA senza aver detto la resistenza, comparivano già
    // POSITIVO / NEGATIVO. Quelle due fasi non ci sono più, ma la regola resta: si porta a
    // tono 40 QUALCOSA, e quel qualcosa va nominato prima.
    expect(tn({ tonePhase: 'raise', itemNamed: false })).toBe('tone.say_item');
  });

  it('vale anche a ciclo compiuto: senza item non si è compiuto niente', () => {
    expect(tn({ tonePhase: 'done', itemNamed: false })).toBe('tone.say_item');
  });

  it('il PRIMO tempo resta raggiungibile senza item: è il tempo in cui lo si dà', () => {
    expect(tn({ tonePhase: 'locate', itemNamed: false })).toBe('tone.item');
  });

  it('2 · portalo a tono 40 — il comando che si ripete', () => {
    expect(tn({ tonePhase: 'raise' })).toBe('tone.raise');
  });

  it('detta la resistenza, si passa al secondo comando: il ciclo NON resta bloccato', () => {
    expect(tn({ tonePhase: 'raise', itemNamed: true })).toBe('tone.raise');
  });

  it('compiuto: tono quaranta raggiunto', () => {
    expect(tn({ tonePhase: 'done' })).toBe('tone.done');
  });
});

describe('LIBERO — solo l ago', () => {
  it('nessun ciclo', () => {
    expect(derivePhase(s({ mode: 'free' }))).toBe('free');
  });

  it('con un ciclo armato ricade su CONTACT, come mostra l interfaccia oggi', () => {
    // MODE_SPEC.free.arms === false, quindi non dovrebbe accadere. Se accade, non si inventa
    // una fase nuova: si conserva quel che l'auditor vede già.
    expect(derivePhase(s({ mode: 'free', cycleArmed: true }))).toBe('contact.mockup');
  });
});

describe('no recharging non è una fase', () => {
  it('nessuna fase lo nomina: è un modificatore, e deve poter CONTRADDIRE la fase', () => {
    // Il commento della FSM chiede che l'ago salito DOPO la dichiarazione resti visibile
    // insieme al verdetto. Se « norecharging » fosse una fase, inghiottirebbe null.rise.
    const tutte = [
      derivePhase(s({ mode: 'null', cycleArmed: true, nullPhase: 'null' })),
      derivePhase(s({ mode: 'null', cycleArmed: true, nullPhase: 'rise' })),
      derivePhase(s({ mode: 'null', cycleArmed: true, nullPhase: 'clear_read' })),
    ];
    expect(tutte).toEqual(['null.mockup', 'null.rise', 'null.equilibrium']);
    expect(tutte.some(p => p.includes('recharg'))).toBe(false);
  });
});

describe('le utilità di lettura', () => {
  it('riconosce le fasi di ciclo', () => {
    expect(isCyclePhase('contact.mockup')).toBe(true);
    expect(isCyclePhase('free')).toBe(true);
    expect(isCyclePhase('ready')).toBe(false);
    expect(isCyclePhase('ep_window')).toBe(false);
  });

  it('dice la famiglia di ciascuna fase', () => {
    expect(phaseFamily('contact.asis')).toBe('contact');
    expect(phaseFamily('null.rise')).toBe('null');
    expect(phaseFamily('mirror.reached')).toBe('mirror');
    expect(phaseFamily('tone.raise')).toBe('tone');
    expect(phaseFamily('free')).toBe('free');
    expect(phaseFamily('preflight')).toBe('cross');
  });
});


describe('ARMATO MA SENZA ITEM — l ordine contraddittorio che non deve piu accadere', () => {
  it('CONTACT: premuto col campo vuoto si aspetta la VOCE, non si chiede il mock-up', () => {
    expect(derivePhase(s({ cycleArmed: true, itemNamed: false }))).toBe('contact.say_item');
    expect(derivePhase(s({ cycleArmed: true, itemNamed: true  }))).toBe('contact.mockup');
  });

  it('NULL: idem', () => {
    expect(derivePhase(s({ mode: 'null', cycleArmed: true, itemNamed: false }))).toBe('null.say_item');
    expect(derivePhase(s({ mode: 'null', cycleArmed: true, itemNamed: true, nullPhase: 'null' }))).toBe('null.mockup');
  });

  it('MIRROR lo faceva gia: ora i tre cicli si comportano allo stesso modo', () => {
    expect(derivePhase(s({ mode: 'mirror', mirrorArmed: true, itemNamed: false }))).toBe('mirror.say_item');
  });

  it('ma l AS-IS proposto VINCE su « dì l item »: il ciclo è arrivato in fondo comunque', () => {
    expect(derivePhase(s({ cycleArmed: true, itemNamed: false, asIsPending: true }))).toBe('contact.asis');
  });
});
