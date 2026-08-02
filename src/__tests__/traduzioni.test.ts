import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * LE TRADUZIONI — guardia contro un difetto che è già tornato più volte.
 *
 * Sintomo tipico, segnalato in seduta: nel pannello dei profili il bottone « ENREGISTRER »
 * restava in francese in TUTTE le lingue. La causa non era una traduzione dimenticata nel
 * dizionario, ma un helper LOCALE che conosceva tre lingue su cinque e ripiegava sul francese.
 * Un dizionario completo non basta quindi a garantire niente: bisogna guardare anche COME i
 * componenti scelgono la lingua, e se qualcuno scrive testo a mano.
 *
 * Questi test leggono il CODICE SORGENTE. È inusuale, ed è voluto: sono difetti che non si
 * manifestano in nessuna funzione da chiamare — si vedono solo aprendo l'app nella lingua
 * giusta, cioè mai, finché un utente non lo segnala.
 */

const LINGUE = ['en', 'fr', 'it', 'es', 'sv'] as const;

const files = (dir: string, out: string[] = []): string[] => {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) { if (nome !== '__tests__') files(p, out); }
    else if (/\.tsx?$/.test(nome)) out.push(p);
  }
  return out;
};
const sorgenti = files('src');
const leggi = (p: string) => readFileSync(p, 'utf8');

describe('dizionario a cinque lingue', () => {
  it('ogni lingua ha esattamente le stesse chiavi', () => {
    const s = leggi('src/i18n.tsx');
    const inizi = [...s.matchAll(/^ {2}([a-z]{2}): \{$/gm)];
    expect(inizi.map(m => m[1]).sort()).toEqual([...LINGUE].sort());

    const chiavi = new Map<string, Set<string>>();
    inizi.forEach((m, i) => {
      const da = m.index!;
      const a = i + 1 < inizi.length ? inizi[i + 1].index! : s.length;
      chiavi.set(m[1], new Set(
        [...s.slice(da, a).matchAll(/^ {4}([A-Za-z_][A-Za-z0-9_]*):/gm)].map(x => x[1])));
    });

    const rif = chiavi.get('en')!;
    expect(rif.size).toBeGreaterThan(100);        // il dizionario esiste davvero
    for (const l of LINGUE) {
      const k = chiavi.get(l)!;
      expect({ lingua: l, mancanti: [...rif].filter(x => !k.has(x)) })
        .toEqual({ lingua: l, mancanti: [] });
      expect({ lingua: l, inPiu: [...k].filter(x => !rif.has(x)) })
        .toEqual({ lingua: l, inPiu: [] });
    }
  });
});

describe('i componenti scelgono la lingua fra CINQUE', () => {
  it('nessun helper di traduzione locale con meno di cinque lingue', () => {
    // È stata questa la causa di « ENREGISTRER » sempre in francese: un helper a tre lingue,
    // con il francese come ripiego per tutte le altre.
    const corti: string[] = [];
    for (const p of sorgenti) {
      for (const m of leggi(p).matchAll(/const L\w* = \(([^)]*)\) =>/g)) {
        const n = m[1].split(',').filter(x => x.includes(':')).length;
        if (n > 0 && n < 5) corti.push(`${p} → ${m[0].slice(0, 60)}`);
      }
    }
    expect(corti).toEqual([]);
  });

  it('i dizionari locali dei componenti hanno tutte e cinque le lingue', () => {
    const monchi: string[] = [];
    for (const p of sorgenti) {
      if (p.endsWith('i18n.tsx')) continue;
      const trovate = new Set([...leggi(p).matchAll(/^\s*(en|fr|it|es|sv):\s*\{/gm)].map(m => m[1]));
      if (trovate.size >= 2) {
        const mancano = LINGUE.filter(l => !trovate.has(l));
        if (mancano.length) monchi.push(`${p} → mancano ${mancano.join(', ')}`);
      }
    }
    expect(monchi).toEqual([]);
  });
});

describe('niente testo scritto a mano davanti all utente', () => {
  /** La riga passa da un helper di traduzione? */
  const tradotta = (riga: string) => /\b(t\(|L\(|LC\(|pick5\(|tr\(|LABELS|TXT\[|T\[)/.test(riga);

  it('nessun alert() o confirm() con una frase in chiaro', () => {
    const fuori: string[] = [];
    for (const p of sorgenti) {
      leggi(p).split('\n').forEach((riga, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(riga)) return;
        const m = riga.match(/\b(?:alert|confirm)\(\s*['"`]([^'"`]{4,})/);
        if (m && !tradotta(riga)) fuori.push(`${p}:${i + 1} « ${m[1].slice(0, 50)} »`);
      });
    }
    expect(fuori).toEqual([]);
  });

  it('nessun placeholder con una frase in chiaro', () => {
    // I segnaposto NUMERICI (« 5.80 ») restano: non sono lingua.
    const fuori: string[] = [];
    for (const p of sorgenti) {
      leggi(p).split('\n').forEach((riga, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(riga)) return;
        const m = riga.match(/\bplaceholder=\{?['"]([^'"]{4,})/);
        if (m && !tradotta(riga) && /[A-Za-z]{4}/.test(m[1])) {
          fuori.push(`${p}:${i + 1} « ${m[1].slice(0, 50)} »`);
        }
      });
    }
    expect(fuori).toEqual([]);
  });
});
