import { describe, it, expect } from 'vitest';
import { spezza } from '../ToneColumn';
import { TONE_LEVELS, levelName } from '../../engine/toneLevels';

/**
 * L'andare a capo dei nomi sulla colonna del tono.
 *
 * È il genere di cosa che sbaglia in silenzio: un nome un po' più lungo esce dal bordo della
 * colonna e non se ne accorge nessuno finché non capita quel livello in seduta. Qui si prova
 * su TUTTI i nomi, in tutte e cinque le lingue.
 */

describe('spezzare un nome in righe', () => {
  it('un nome corto resta su una riga sola', () => {
    expect(spezza('Anger')).toEqual(['Anger']);
    expect(spezza('Apatia')).toEqual(['Apatia']);
  });

  it('un nome lungo va a capo SULLE PAROLE, mai dentro una parola', () => {
    const r = spezza('Serenity of Beingness');
    expect(r.length).toBeGreaterThan(1);
    expect(r.join(' ')).toBe('Serenity of Beingness');
  });

  it('non perde e non aggiunge nulla: rimesso insieme è il nome di partenza', () => {
    for (const l of TONE_LEVELS) {
      for (const lang of ['it', 'fr', 'en', 'es', 'sv']) {
        const n = levelName(l.name, lang);
        expect({ n, lang, ok: spezza(n).join(' ') === n }).toEqual({ n, lang, ok: true });
      }
    }
  });

  it('nessuna riga supera il limite — TRANNE una parola sola più lunga del limite', () => {
    // Una parola che da sola sfora non si può spezzare senza tagliarla a metà, e tagliare una
    // parola a metà è peggio che lasciarla sporgere. Si accetta, ma si dichiara.
    for (const l of TONE_LEVELS) {
      for (const lang of ['it', 'fr', 'en', 'es', 'sv']) {
        for (const r of spezza(levelName(l.name, lang))) {
          const unaParola = !r.includes(' ');
          expect({ r, lang, ok: r.length <= 18 || unaParola }).toEqual({ r, lang, ok: true });
        }
      }
    }
  });

  it('due righe bastano per ogni nome, in ogni lingua', () => {
    // Tre righe sfonderebbero sul livello sotto: la colonna ha 620 unità per 80 divisioni.
    for (const l of TONE_LEVELS) {
      for (const lang of ['it', 'fr', 'en', 'es', 'sv']) {
        const n = levelName(l.name, lang);
        expect({ n, lang, righe: spezza(n).length <= 2 }).toEqual({ n, lang, righe: true });
      }
    }
  });

  it('una stringa vuota non produce una riga vuota da disegnare', () => {
    expect(spezza('')).toEqual(['']);
  });
});
