import { describe, it, expect } from 'vitest';
import {
  AVVIO_VUOTO, passoCorrente, pronto, restano, rispondi, indietro,
  ascolta, normalizza, MODO_AUTO, MODO_AUTO_MS,
} from '../flussoAvvio';

/** Una scorciatoia per arrivare a un punto qualunque del flusso. */
const con = (...risposte: Array<[Parameters<typeof rispondi>[1], string | boolean]>) =>
  risposte.reduce((a, [p, v]) => rispondi(a, p, v), AVVIO_VUOTO);

describe('l ordine delle domande', () => {
  it('si comincia da CHI AUDITA: senza di lui nessuna delle altre ha senso', () => {
    expect(passoCorrente(AVVIO_VUOTO)).toBe('auditor');
  });

  it('con un preclear si chiede QUALE, e si arriva in fondo in cinque risposte', () => {
    let a = con(['auditor', 'a1'], ['chi', 'preclear']);
    expect(passoCorrente(a)).toBe('preclear');
    a = rispondi(a, 'preclear', 'p1');
    expect(passoCorrente(a)).toBe('dove');
    a = rispondi(a, 'dove', 'qui');
    expect(passoCorrente(a)).toBe('modo');
    a = rispondi(a, 'modo', 'normale');
    expect(passoCorrente(a)).toBe('pronto');
    expect(pronto(a)).toBe(true);
  });

  it('⚠️ in SOLO il preclear E LA DISTANZA non esistono, non sono saltati', () => {
    // Segnalato in seduta: « quando scegli solo, ti chiede se auditor e PC sono nella stessa
    // stanza — è il ciclo a distanza, non solo ». In SOLO l'auditor È il preclear: non c'è
    // nessuno da mettere altrove, e la distanza è una proprietà del legame fra DUE persone.
    const a = con(['auditor', 'a1'], ['chi', 'solo']);
    expect(passoCorrente(a)).toBe('modo');   // NON 'preclear' e NON 'dove'
    expect(restano(a)).toBe(1);              // resta solo il modo
  });

  it('e in SOLO la distanza vale FALSO, non « non chiesta »', () => {
    // Chi legge deve trovare un valore, non un null da interpretare: audire sé stessi
    // avviene per forza dove si è.
    const a = con(['auditor', 'a1'], ['chi', 'solo']);
    expect(a.distanza).toBe(false);
  });

  it('in SOLO si apre la seduta con DUE risposte', () => {
    const a = con(['auditor', 'a1'], ['chi', 'solo'], ['modo', 'normale']);
    expect(pronto(a)).toBe(true);
  });

  it('quante ne restano lo dice senza contare i passi', () => {
    expect(restano(AVVIO_VUOTO)).toBe(5);   // il cammino più lungo, finché non si sa
    expect(restano(con(['auditor', 'a1']))).toBe(4);
    expect(restano(con(['auditor', 'a1'], ['chi', 'preclear']))).toBe(3);
    expect(restano(con(['auditor', 'a1'], ['chi', 'solo']))).toBe(1);
    expect(restano(con(['auditor', 'a1'], ['chi', 'solo'], ['modo', 'normale']))).toBe(0);
  });

  it('⚠️ e il conto NON SALE MAI, comunque si risponda', () => {
    // Contando solo le domande certe faceva 3 all'inizio e 3 di nuovo dopo « con un preclear »,
    // che ne aggiunge due. Un conto alla rovescia che sale non lo si crede più.
    const cammini: Array<Array<[Parameters<typeof rispondi>[1], string | boolean]>> = [
      [['auditor', 'a1'], ['chi', 'solo'], ['modo', 'normale']],
      [['auditor', 'a1'], ['chi', 'preclear'], ['preclear', 'p1'], ['dove', 'distanza'], ['modo', 'esperto']],
    ];
    for (const cammino of cammini) {
      let a = AVVIO_VUOTO, prima = restano(a);
      for (const [p, v] of cammino) {
        a = rispondi(a, p, v);
        const ora = restano(a);
        expect(ora).toBeLessThanOrEqual(prima);
        prima = ora;
      }
      expect(prima).toBe(0);
    }
  });
});

describe('le risposte', () => {
  it('non toccano quella di prima: chi tiene il vecchio lo ritrova intero', () => {
    const a = con(['auditor', 'a1']);
    const b = rispondi(a, 'chi', 'solo');
    expect(a.solo).toBeNull();
    expect(b.solo).toBe(true);
  });

  it('capiscono sia la parola sia il vero/falso', () => {
    expect(rispondi(AVVIO_VUOTO, 'chi', 'solo').solo).toBe(true);
    expect(rispondi(AVVIO_VUOTO, 'chi', true).solo).toBe(true);
    expect(rispondi(AVVIO_VUOTO, 'chi', 'preclear').solo).toBe(false);
    expect(rispondi(AVVIO_VUOTO, 'dove', 'distanza').distanza).toBe(true);
    expect(rispondi(AVVIO_VUOTO, 'modo', 'esperto').esperto).toBe(true);
    expect(rispondi(AVVIO_VUOTO, 'modo', 'normale').esperto).toBe(false);
  });

  it('⚠️ passando a SOLO il preclear scelto prima si SCORDA', () => {
    // Se restasse, si finirebbe in seduta SOLO con un preclear appeso, e il rapporto
    // direbbe due persone dove ce n'è una.
    const a = con(['auditor', 'a1'], ['chi', 'preclear'], ['preclear', 'p1']);
    expect(a.pcId).toBe('p1');
    expect(rispondi(a, 'chi', 'solo').pcId).toBeNull();
  });
});

describe('tornare indietro', () => {
  it('cancella l ULTIMA risposta data, una per volta', () => {
    const a = con(['auditor', 'a1'], ['chi', 'preclear'], ['preclear', 'p1'],
                  ['dove', 'qui'], ['modo', 'esperto']);
    let b = indietro(a);   expect(passoCorrente(b)).toBe('modo');
    b = indietro(b);       expect(passoCorrente(b)).toBe('dove');
    b = indietro(b);       expect(passoCorrente(b)).toBe('preclear');
    b = indietro(b);       expect(passoCorrente(b)).toBe('chi');
    b = indietro(b);       expect(passoCorrente(b)).toBe('auditor');
  });

  it('e da SOLO risale a « chi » in un colpo: non c erano preclear né distanza da cancellare', () => {
    const a = con(['auditor', 'a1'], ['chi', 'solo'], ['modo', 'normale']);
    expect(passoCorrente(indietro(a))).toBe('modo');
    expect(passoCorrente(indietro(indietro(a)))).toBe('chi');
  });

  it('⚠️ e tornando da SOLO a « con un preclear » la distanza si RICHIEDE', () => {
    // Restando a `false` (il valore ovvio del SOLO) la domanda resterebbe saltata per sempre,
    // e una seduta a distanza si aprirebbe come se fossero nella stessa stanza.
    const a = con(['auditor', 'a1'], ['chi', 'solo']);
    const b = rispondi(a, 'chi', 'preclear');
    expect(b.distanza).toBeNull();
    expect(passoCorrente(rispondi(b, 'preclear', 'p1'))).toBe('dove');
  });

  it('dal principio non si va più indietro', () => {
    expect(indietro(AVVIO_VUOTO)).toEqual(AVVIO_VUOTO);
  });

  it('tornando su « chi » si perde anche il preclear — è la stessa ragione di prima', () => {
    const a = con(['auditor', 'a1'], ['chi', 'preclear'], ['preclear', 'p1'], ['dove', 'qui']);
    // indietro: dove → preclear → chi
    const b = indietro(indietro(indietro(a)));
    expect(b.solo).toBeNull();
    expect(b.pcId).toBeNull();
  });
});

describe('la voce', () => {
  it('toglie accenti, maiuscole e punteggiatura prima di confrontare', () => {
    expect(normalizza('  À distance,  ')).toBe('a distance');
    expect(normalizza('SOLO!')).toBe('solo');
  });

  it('capisce le tre domande a due vie, nelle varie lingue', () => {
    expect(ascolta('chi', 'solo')).toBe('solo');
    expect(ascolta('chi', 'je suis seul')).toBe('solo');
    expect(ascolta('chi', 'con un preclear')).toBe('preclear');
    expect(ascolta('dove', 'ici')).toBe('qui');
    expect(ascolta('dove', 'à distance')).toBe('distanza');
    expect(ascolta('modo', 'expert')).toBe('esperto');
    expect(ascolta('modo', 'normale')).toBe('normale');
  });

  it('⚠️ i NOMI DI PERSONA non si scelgono a orecchio', () => {
    // Un nome capito male attribuirebbe la seduta ALLA PERSONA SBAGLIATA, e lo si scopre
    // a rapporto fatto. Quelle due domande si toccano, punto.
    expect(ascolta('auditor', 'Claudio')).toBeNull();
    expect(ascolta('preclear', 'Marie')).toBeNull();
  });

  it('⚠️ una frase che contiene TUTTE E DUE le parole non decide niente', () => {
    // « non sono solo, c'è un preclear » contiene « solo »: prendendo la prima che combacia
    // si aprirebbe una seduta SOLO su una frase che diceva il contrario.
    expect(ascolta('chi', 'non sono solo, c è un preclear')).toBeNull();
    expect(ascolta('dove', 'non qui, a distanza')).toBeNull();
  });

  it('e nemmeno il silenzio o una frase che non c entra', () => {
    expect(ascolta('chi', '')).toBeNull();
    expect(ascolta('chi', '   ')).toBeNull();
    expect(ascolta('dove', 'aspetta un attimo')).toBeNull();
  });

  it('quel che si è capito si può dare a `rispondi` così com è', () => {
    // La voce e il dito devono passare per la STESSA funzione, o le due strade divergono.
    const detto = ascolta('chi', 'seul');
    expect(detto).not.toBeNull();
    expect(rispondi(AVVIO_VUOTO, 'chi', detto!).solo).toBe(true);
  });
});

describe('il modo si prende da sé', () => {
  it('dopo dieci secondi, e prende NORMALE', () => {
    expect(MODO_AUTO_MS).toBe(10_000);
    expect(MODO_AUTO).toBe('normale');
    expect(rispondi(AVVIO_VUOTO, 'modo', MODO_AUTO).esperto).toBe(false);
  });

  it('⚠️ ed è l UNICA domanda che si risponde da sola', () => {
    // Le altre tre non hanno un valore prudente da indovinare: chi è il preclear e dove si
    // audita, sbagliati, falsano la seduta. Se un giorno una di loro prendesse un valore
    // automatico, questo test deve rompersi.
    const a = con(['auditor', 'a1']);
    expect(a.solo).toBeNull();
    expect(a.distanza).toBeNull();
  });
});
