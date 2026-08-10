import { describe, it, expect } from 'vitest';
import { visibleSet, visibleInSlot, type VisibilityInput } from '../visibleSet';
import { MODULE_REGISTRY, levelAllows, moduleById, type ModuleId } from '../moduleRegistry';

const base: VisibilityInput = {
  phase: 'contact.item',
  mode: 'contact',
  level: 'normal',
  instruments: { muse: true, theta: false, camera: true },
  pinned: new Set<ModuleId>(),
  muted:  new Set<ModuleId>(),
};
const v = (o: Partial<VisibilityInput> = {}) => visibleSet({ ...base, ...o });

describe('la tabella dei moduli', () => {
  it('non ha due righe con lo stesso id', () => {
    const ids = MODULE_REGISTRY.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('nessuna riga ripete due volte la stessa fase', () => {
    for (const m of MODULE_REGISTRY) {
      expect({ id: m.id, n: new Set(m.autoIn).size }).toEqual({ id: m.id, n: m.autoIn.length });
    }
  });

  it('NESSUN modulo si apre da sé durante la finestra EP — è la regola che non si negozia', () => {
    for (const m of MODULE_REGISTRY) expect({ id: m.id, ep: m.autoIn.includes('ep_window') })
      .toEqual({ id: m.id, ep: false });
  });

  it('sono DUE livelli, e si annidano', () => {
    expect(levelAllows('normal', 'normal')).toBe(true);
    expect(levelAllows('expert', 'normal')).toBe(false);
    expect(levelAllows('normal', 'expert')).toBe(true);
    expect(levelAllows('expert', 'expert')).toBe(true);
  });
});

describe('R1 — niente si muove alla periferia mentre l ago legge', () => {
  it('le camere spariscono dal mock-up in poi', () => {
    expect(v({ phase: 'contact.item'   }).has('cam1')).toBe(true);
    expect(v({ phase: 'contact.mockup' }).has('cam1')).toBe(false);
    expect(v({ phase: 'contact.asis'   }).has('cam1')).toBe(false);
  });

  it('il journal RESTA durante il mock-up: si congela, non sparisce (decisione §7.1)', () => {
    expect(v({ phase: 'contact.mockup' }).has('journal')).toBe(true);
  });

  it('in tone.raise resta il gesto e nient altro di laterale', () => {
    const s = v({ phase: 'tone.raise', mode: 'tone' });
    expect(s.has('journal')).toBe(false);
    expect(s.has('cam1')).toBe(false);
    expect(s.has('assessment')).toBe(false);
    expect(s.has('commandBar')).toBe(false);
  });

  it('la finestra EP non lascia NIENTE a schermo', () => {
    const s = v({ phase: 'ep_window' });
    expect([...s]).toEqual([]);
  });
});

describe('R2 — un solo gesto per fase', () => {
  it('il selettore dei metodi sparisce a ciclo armato: cambiarlo CHIUDEREBBE il ciclo', () => {
    expect(v({ phase: 'contact.item'   }).has('commandBar')).toBe(true);
    expect(v({ phase: 'contact.mockup' }).has('commandBar')).toBe(false);
    expect(v({ phase: 'null.rise'      }).has('commandBar')).toBe(false);
    expect(v({ phase: 'mirror.doubling'}).has('commandBar')).toBe(false);
  });
});

describe('R4 — allarme, non cruscotto', () => {
  it('la salute non si mostra da sé in seduta', () => {
    expect(v({ phase: 'contact.mockup' }).has('health')).toBe(false);
  });

  it('ma prima della seduta sì: è lì che serve', () => {
    expect(v({ phase: 'instruments' }).has('health')).toBe(true);
    expect(v({ phase: 'ready'       }).has('health')).toBe(true);
  });

  it('e un allarme la richiama in piena seduta', () => {
    const s = v({ phase: 'contact.mockup', alarms: new Set<ModuleId>(['health']) });
    expect(s.has('health')).toBe(true);
  });

  it('ma un allarme NON scavalca la mano dell auditor', () => {
    const s = v({
      phase: 'contact.mockup',
      alarms: new Set<ModuleId>(['health']),
      muted:  new Set<ModuleId>(['health']),
    });
    expect(s.has('health')).toBe(false);
  });

  it('la barra biometrica non si apre MAI da sé: la percentuale sta nel badge del MUSE', () => {
    for (const m of MODULE_REGISTRY) if (m.id === 'biometric') expect(m.autoIn).toEqual([]);
    expect(v({ phase: 'contact.item', level: 'expert' }).has('biometric')).toBe(true);
    expect(v({ phase: 'contact.item' }).has('biometric')).toBe(false);
  });
});

describe('l automatismo cede alla mano', () => {
  it('fissato, si vede anche dove la fase lo chiuderebbe', () => {
    const s = v({ phase: 'contact.mockup', pinned: new Set<ModuleId>(['cam1']) });
    expect(s.has('cam1')).toBe(true);
  });

  it('zittito, resta chiuso anche dove la fase lo aprirebbe', () => {
    const s = v({ phase: 'contact.item', muted: new Set<ModuleId>(['journal']) });
    expect(s.has('journal')).toBe(false);
  });

  it('anche in ESPERTO: chi tara ha il diritto di chiudere una cosa', () => {
    const s = v({ phase: 'contact.item', level: 'expert', muted: new Set<ModuleId>(['trim']) });
    expect(s.has('trim')).toBe(false);
  });
});

describe('gli strumenti e il metodo', () => {
  it('senza MUSE non compare ciò che vive di EEG', () => {
    const s = v({ phase: 'ready', instruments: { muse: false, theta: true, camera: true } });
    expect(s.has('health')).toBe(false);
  });

  it('senza camera non compaiono le camere', () => {
    const s = v({ phase: 'ready', instruments: { muse: true, theta: false, camera: false } });
    expect(s.has('cam1')).toBe(false);
    expect(s.has('cam2')).toBe(false);
  });

  it('la barra del ciclo CONTACT/NULL non si mostra in MIRROR né in TONE', () => {
    expect(v({ phase: 'contact.mockup', mode: 'contact' }).has('cycleStatus')).toBe(true);
    expect(v({ phase: 'mirror.doubling', mode: 'mirror' }).has('cycleStatus')).toBe(false);
    expect(v({ phase: 'tone.raise',      mode: 'tone'   }).has('cycleStatus')).toBe(false);
  });

  it('il pannello di calibrazione TA non esiste senza il meter, nemmeno in ESPERTO', () => {
    const s = v({ phase: 'ready', level: 'expert', instruments: { muse: true, theta: false, camera: true } });
    expect(s.has('thetaCal')).toBe(false);
  });
});

describe('ESPERTO è un altro regime, non « più roba »', () => {
  it('in ESPERTO autoIn si spegne: si vede tutto ciò che strumenti e metodo ammettono', () => {
    const s = v({ phase: 'contact.mockup', level: 'expert' });
    // In STANDARD queste due sparirebbero; qui restano perché la fase non comanda più.
    expect(s.has('cam1')).toBe(true);
    expect(s.has('trim')).toBe(true);
  });

  it('in NORMAL c e quel che serve a CONDURRE, non le manopole', () => {
    const s = v({ phase: 'contact.item' });
    expect(s.has('journal')).toBe(true);
    expect(s.has('assessment')).toBe(true);
    expect(s.has('commandBar')).toBe(true);
    // L'MNA è di conduzione (un SONIFY dentro un ciclo), quindi NORMAL lo ammette —
    // si apre comunque a mano, perché è un attrezzo.
    expect(levelAllows(moduleById('mna')!.level, 'normal')).toBe(true);
    // Le manopole no.
    expect(s.has('trim')).toBe(false);
    expect(s.has('thetaCal')).toBe(false);
    expect(s.has('biometric')).toBe(false);
  });
});

describe('gli slot', () => {
  it('restituiscono i moduli nell ordine della tabella', () => {
    expect(visibleInSlot({ ...base, phase: 'ready' }, 'left')).toEqual(['health']);
  });

  it('e uno slot vuoto è un array vuoto, non un buco', () => {
    expect(visibleInSlot({ ...base, phase: 'ep_window' }, 'right')).toEqual([]);
  });
});

describe('la ricerca per id', () => {
  it('trova quel che c è', () => {
    expect(moduleById('journal')?.slot).toBe('left');
  });
});

describe('la camera, a distanza, non e periferia: e il preclear', () => {
  it('in LOCALE sparisce nei momenti di lettura fine', () => {
    expect(v({ phase: 'contact.mockup' }).has('cam1')).toBe(false);
    expect(v({ phase: 'null.rise'      }).has('cam1')).toBe(false);
  });

  it('in REMOTO resta, in TUTTE le fasi di ciclo', () => {
    for (const p of ['contact.mockup', 'contact.asis', 'null.rise',
                     'mirror.doubling', 'tone.raise'] as const) {
      expect({ p, cam: v({ phase: p, remote: true }).has('cam1') })
        .toEqual({ p, cam: true });
    }
  });

  it('ma nemmeno a distanza durante la finestra EP: la realizzazione e sola', () => {
    expect(v({ phase: 'ep_window', remote: true }).has('cam1')).toBe(false);
  });

  it('e senza camera collegata non compare comunque', () => {
    const s = v({ phase: 'contact.mockup', remote: true,
                  instruments: { muse: true, theta: false, camera: false } });
    expect(s.has('cam1')).toBe(false);
  });
});
