import { describe, it, expect } from 'vitest';
import { SESSION_MODES, MODE_SPEC, availableModes, fallbackMode, cycleIsAutomatic } from '../sessionMode';

describe('i modi di seduta', () => {
  it('sono sei, e i cicli vengono prima dei metodi di Ron', () => {
    expect([...SESSION_MODES]).toEqual(['contact', 'null', 'mirror', 'tone', 'truth', 'free']);
  });

  it('ognuno ha la sua riga: nessun modo senza specifica', () => {
    for (const m of SESSION_MODES) expect(MODE_SPEC[m]).toBeDefined();
  });
});

describe('quale ago impone ciascun modo', () => {
  it('i tre che girano sulla carica EEG impongono il MUSE', () => {
    expect(MODE_SPEC.contact.needle).toBe('eeg');
    expect(MODE_SPEC.null.needle).toBe('eeg');
    expect(MODE_SPEC.mirror.needle).toBe('eeg');
  });

  it('TONE impone il METER: è lui che misura la resistenza', () => {
    expect(MODE_SPEC.tone.needle).toBe('theta');
  });

  it('solo in LIBERO la scelta resta all auditor', () => {
    expect(MODE_SPEC.free.needle).toBeNull();
    const conScelta = SESSION_MODES.filter(m => MODE_SPEC[m].needle === null);
    expect(conScelta).toEqual(['free']);
  });
});

describe('quali modi si possono usare con quel che è collegato', () => {
  it('col MUSE ci sono tutti', () => {
    expect(availableModes(true, true)).toEqual([...SESSION_MODES]);
  });

  it('senza MUSE i tre cicli EEG RESTANO — non spariscono piu', () => {
    // Regola rovesciata a mano, e con una ragione: `needsEeg` diceva « nascondi senza MUSE »,
    // ma la sorgente di un ciclo non e l'ago. Senza EEG restano la percezione del preclear e
    // l'obnosi dell'auditor; quel che manca e l'AUTOMATISMO (vedi `cycleIsAutomatic`).
    expect(availableModes(false, true)).toContain('contact');
    expect(availableModes(false, true)).toContain('null');
    expect(availableModes(false, true)).toContain('mirror');
  });

  it('LIBERO non sparisce mai: un ago da guardare c è comunque', () => {
    expect(availableModes(true, true)).toContain('free');
    expect(availableModes(false, true)).toContain('free');
  });

  it('un modo che arma un ciclo ha sempre bisogno dell EEG', () => {
    for (const m of SESSION_MODES) {
      if (MODE_SPEC[m].arms) expect(MODE_SPEC[m].needsEeg).toBe(true);
    }
  });
});

describe('il ripiego quando uno strumento se ne va', () => {
  it('col MUSE si torna a CONTACT', () => {
    expect(fallbackMode(true, true)).toBe('contact');
    expect(fallbackMode(true, false)).toBe('contact');
  });

  it('senza MUSE ma col meter si va su TONE', () => {
    expect(fallbackMode(false, true)).toBe('tone');
  });

  it('senza niente si va su CONTACT: senza ago il ciclo resta, LIBERO no', () => {
    // LIBERO vuol dire « solo l'ago »: senza strumenti non mostrerebbe nulla. I cicli invece
    // si conducono sulla percezione del preclear e sull'obnosi dell'auditor.
    expect(fallbackMode(false, false)).toBe('contact');
  });

  it('il ripiego è SEMPRE un modo disponibile — mai una scelta impossibile', () => {
    for (const hasEeg of [true, false]) {
      for (const hasTheta of [true, false]) {
        expect(availableModes(hasEeg, hasTheta)).toContain(fallbackMode(hasEeg, hasTheta));
      }
    }
  });
});

describe('I CICLI CI SONO SEMPRE — l ago decide solo chi li spinge', () => {
  it('con qualunque strumento: tutti e cinque', () => {
    expect(availableModes(true,  true )).toEqual([...SESSION_MODES]);
    expect(availableModes(true,  false)).toEqual([...SESSION_MODES]);
    expect(availableModes(false, true )).toEqual([...SESSION_MODES]);
  });

  it('col METER solo NON si è più poveri che senza niente — era l incoerenza da correggere', () => {
    expect(availableModes(false, true).length)
      .toBeGreaterThanOrEqual(availableModes(false, false).length);
  });

  it('senza NIENTE cade il solo LIBERO: « solo l ago » senza ago non mostra niente', () => {
    expect(availableModes(false, false)).toEqual(['contact', 'null', 'mirror', 'tone', 'truth']);
  });
});

describe('automatico o a mano', () => {
  it('coi cicli EEG e il MUSE, la macchina a stati li porta da sola', () => {
    expect(cycleIsAutomatic('contact', true)).toBe(true);
    expect(cycleIsAutomatic('null',    true)).toBe(true);
    expect(cycleIsAutomatic('mirror',  true)).toBe(true);
  });

  it('senza EEG lo stesso ciclo resta, ma lo fa avanzare l auditor', () => {
    expect(cycleIsAutomatic('contact', false)).toBe(false);
    expect(cycleIsAutomatic('null',    false)).toBe(false);
    expect(cycleIsAutomatic('mirror',  false)).toBe(false);
  });

  it('TONE e LIBERO non armano nulla: non sono automatici in nessun caso', () => {
    expect(cycleIsAutomatic('tone', true)).toBe(false);
    expect(cycleIsAutomatic('free', true)).toBe(false);
  });
});
