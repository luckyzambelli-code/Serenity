import { describe, it, expect } from 'vitest';
import { decideNeedle, type NeedleInputs } from '../needleDecision';
import {
  KICK_MS, KICK_FLYBACK_MS, LABEL_HOLD_FN_MS, LABEL_HOLD_QUIET_MS,
  FN_EPISODE_GAP_S, FALL_ZONE_OFFSET, KICK_ESCALATE_MARGIN,
} from '../tuning';

/**
 * DECISIONE dell'ago. Questi test FISSANO il comportamento attuale — quello tarato in seduta —
 * prima di qualunque spostamento di codice. Se un refactor lo cambia, qui si vede subito.
 */
const base = (over: Partial<NeedleInputs> = {}): NeedleInputs => ({
  reactionKey: 'reaction_none',
  reactionLabel: 'Set',
  rawTarget: -0.35,
  nowMs: 100_000,
  timeS: 100,
  shownKey: 'reaction_none',
  holdUntilMs: 0,
  activeKickRaw: null,
  needleInMotion: false,
  needleLocked: false,
  itemInterruptUntilMs: 0,
  curVirtualOffset: -0.35,
  lastFnShownAtS: -Infinity,
  ...over,
});

describe('falso kick durante un hold F/N', () => {
  it('il rientro dopo un float NON interrompe la F/N (non è una caduta)', () => {
    const d = decideNeedle(base({
      reactionKey: 'reaction_fall', reactionLabel: 'Fall', rawTarget: 0.2,
      shownKey: 'reaction_fn', holdUntilMs: 105_000,      // F/N ancora tenuta
      curVirtualOffset: FALL_ZONE_OFFSET - 0.1,           // ago ancora a sinistra
    }));
    expect(d.path).toBe('suppress');
    expect(d.startKick).toBe(false);
    expect(d.commitLabel).toBe(false);
    expect(d.idleTarget).toBe(null);        // non si tocca NIENTE
  });

  it('un piccolo SF non interrompe la F/N nemmeno nella zona di caduta', () => {
    const d = decideNeedle(base({
      reactionKey: 'reaction_sf', reactionLabel: 'SF', rawTarget: 0.1,
      shownKey: 'reaction_fn', holdUntilMs: 105_000,
      curVirtualOffset: 0,                                // dentro la zona di caduta
    }));
    expect(d.path).toBe('suppress');
  });

  it('MA una VERA caduta interrompe la F/N', () => {
    const d = decideNeedle(base({
      reactionKey: 'reaction_fall', reactionLabel: 'Fall', rawTarget: 0.2,
      shownKey: 'reaction_fn', holdUntilMs: 105_000,
      curVirtualOffset: FALL_ZONE_OFFSET + 0.1,           // davvero in caduta
    }));
    expect(d.path).toBe('kick');
    expect(d.startKick).toBe(true);
  });
});

describe('oscillazione (kick)', () => {
  it('parte quando l ago è libero, e blocca la scritta per tutto il ciclo', () => {
    const d = decideNeedle(base({ reactionKey: 'reaction_fall', reactionLabel: 'Fall', rawTarget: 0.2 }));
    expect(d.startKick).toBe(true);
    expect(d.kickMs).toBe(KICK_MS['reaction_fall']);
    expect(d.commitLabel).toBe(true);
    expect(d.holdUntilMs).toBe(100_000 + KICK_MS['reaction_fall'] + KICK_FLYBACK_MS);
  });

  it('NON parte se l ago è già in movimento (lettura avallata)', () => {
    const d = decideNeedle(base({
      reactionKey: 'reaction_fall', reactionLabel: 'Fall', rawTarget: 0.2,
      needleInMotion: true, activeKickRaw: 0.2,
    }));
    expect(d.startKick).toBe(false);
    expect(d.commitLabel).toBe(false);       // ago ed etichetta restano sulla lettura in corso
  });

  it('una lettura PIÙ PROFONDA rimpiazza quella in volo (escalation)', () => {
    const d = decideNeedle(base({
      reactionKey: 'reaction_long_fall_blow_down', reactionLabel: 'LF Blow Down',
      rawTarget: 0.9, needleInMotion: true, activeKickRaw: 0.2,
    }));
    expect(d.startKick).toBe(true);
  });

  it('una lettura equivalente NON rimpiazza (serve un margine)', () => {
    const d = decideNeedle(base({
      reactionKey: 'reaction_fall', reactionLabel: 'Fall',
      rawTarget: 0.2 + KICK_ESCALATE_MARGIN / 2, needleInMotion: true, activeKickRaw: 0.2,
    }));
    expect(d.startKick).toBe(false);
  });

  it('un NUOVO ITEM permette alla sua lettura di interrompere il swing in corso', () => {
    const d = decideNeedle(base({
      reactionKey: 'reaction_fall', reactionLabel: 'Fall', rawTarget: 0.2,
      needleInMotion: true, activeKickRaw: 0.9,        // swing precedente più profondo
      itemInterruptUntilMs: 101_000,                   // finestra aperta da un nuovo item
    }));
    expect(d.startKick).toBe(true);
    expect(d.interruptPrevious).toBe(true);
  });

  it('fuori dalla finestra dell item, niente interruzione', () => {
    const d = decideNeedle(base({
      reactionKey: 'reaction_fall', reactionLabel: 'Fall', rawTarget: 0.2,
      needleInMotion: true, activeKickRaw: 0.9,
      itemInterruptUntilMs: 99_000,                    // finestra già scaduta
    }));
    expect(d.startKick).toBe(false);
  });
});

describe('riposo / fluttuazione', () => {
  it('una F/N fa FLUTTUARE l ago', () => {
    const d = decideNeedle(base({ reactionKey: 'reaction_fn', reactionLabel: 'F/N (Floating)' }));
    expect(d.idleTarget).toBe('float');
  });

  it('gli stati calmi riportano l ago a RIPOSO', () => {
    expect(decideNeedle(base()).idleTarget).toBe('rest');
  });

  it('EN PHASE: durante il blocco l ago segue ciò che è MOSTRATO, non il live', () => {
    // in alto c'è ancora « F/N », il classificatore è già passato a calmo
    const d = decideNeedle(base({
      reactionKey: 'reaction_none', reactionLabel: 'Set',
      shownKey: 'reaction_fn', holdUntilMs: 105_000,
    }));
    expect(d.idleTarget).toBe('float');     // l ago continua a fluttuare, in fase con la scritta
    expect(d.commitLabel).toBe(false);      // e la scritta non cambia ancora
  });

  it('non si tocca l ago se il motore è bloccato o in movimento', () => {
    expect(decideNeedle(base({ needleInMotion: true })).idleTarget).toBe(null);
    expect(decideNeedle(base({ needleLocked: true })).idleTarget).toBe(null);
  });

  it('la scritta si aggiorna solo a blocco scaduto, con la durata giusta', () => {
    const fn = decideNeedle(base({ reactionKey: 'reaction_fn', reactionLabel: 'F/N (Floating)' }));
    expect(fn.commitLabel).toBe(true);
    expect(fn.holdUntilMs).toBe(100_000 + LABEL_HOLD_FN_MS);      // la F/N resta ben visibile

    const quiet = decideNeedle(base());
    expect(quiet.holdUntilMs).toBe(100_000 + LABEL_HOLD_QUIET_MS);
  });
});

describe('registrazione della lettura (fonte dell ASSESSMENT)', () => {
  it('si registra un vero CAMBIAMENTO verso una lettura valida', () => {
    const d = decideNeedle(base({ reactionKey: 'reaction_fall', reactionLabel: 'Fall', rawTarget: 0.2 }));
    expect(d.recordShownRead).toBe(true);
  });

  it('NON si registra se la reazione mostrata non cambia', () => {
    const d = decideNeedle(base({
      reactionKey: 'reaction_fall', reactionLabel: 'Fall', rawTarget: 0.2,
      shownKey: 'reaction_fall',
    }));
    expect(d.recordShownRead).toBe(false);
  });

  it('NON si registra uno stato che non è una lettura (Set)', () => {
    expect(decideNeedle(base({ shownKey: 'reaction_fn' })).recordShownRead).toBe(false);
  });

  it('AGO NULLO: una F/N che riprende nello STESSO episodio non si registra', () => {
    const d = decideNeedle(base({
      reactionKey: 'reaction_fn', reactionLabel: 'F/N (Floating)',
      shownKey: 'reaction_none',
      timeS: 100, lastFnShownAtS: 100 - (FN_EPISODE_GAP_S / 2),   // ha sfarfallato poco fa
    }));
    expect(d.commitLabel).toBe(true);         // la scritta sì
    expect(d.recordShownRead).toBe(false);    // ma NON è una reazione all'item → NULL
  });

  it('una F/N di un NUOVO episodio invece si registra', () => {
    const d = decideNeedle(base({
      reactionKey: 'reaction_fn', reactionLabel: 'F/N (Floating)',
      shownKey: 'reaction_none',
      timeS: 100, lastFnShownAtS: 100 - (FN_EPISODE_GAP_S + 1),   // episodio chiuso da tempo
    }));
    expect(d.recordShownRead).toBe(true);
  });

  it('durante il blocco della scritta non si registra nulla', () => {
    const d = decideNeedle(base({
      reactionKey: 'reaction_fn', reactionLabel: 'F/N (Floating)',
      shownKey: 'reaction_none', holdUntilMs: 105_000,     // blocco ancora attivo
    }));
    expect(d.commitLabel).toBe(false);
    expect(d.recordShownRead).toBe(false);
  });
});
