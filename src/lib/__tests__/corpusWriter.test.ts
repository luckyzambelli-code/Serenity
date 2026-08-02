import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Il pezzo che decide se l'archivio ESISTE. Le righe si costruiscono in engine/corpus (puro e
 * testato a parte); qui si verifica il ponte verso il disco — e soprattutto che, dove il disco
 * non c'è, non si finga di aver archiviato.
 */

interface Chiamata { file: string; line: string }

const setupWindow = (conApi: boolean) => {
  const chiamate: Chiamata[] = [];
  const listeners: Record<string, (() => void)[]> = {};
  (globalThis as unknown as { window: unknown }).window = {
    electronAPI: conApi ? {
      corpusAppend: (a: Chiamata) => { chiamate.push(a); return Promise.resolve({ ok: true }); },
      corpusFolder: () => Promise.resolve('/casa/EQUILIBRIUM/corpus'),
    } : undefined,
    addEventListener: (ev: string, fn: () => void) => {
      (listeners[ev] ||= []).push(fn);
    },
  };
  return { chiamate, listeners };
};

/** Import fresco a ogni prova: il modulo tiene una coda propria. */
const carica = async () => {
  vi.resetModules();
  return await import('../corpusWriter');
};

const riga = (at: string) => ({
  v: 1 as const, t: 'reaction' as const, at, s: 's1',
  src: 'theta' as const, key: 'reaction_fall', tSec: 12,
});

describe('corpusWriter', () => {
  beforeEach(() => { vi.resetModules(); });

  it('scrive la riga nel file del MESE a cui appartiene', async () => {
    const { chiamate } = setupWindow(true);
    const w = await carica();
    w.corpusWrite(riga('2026-07-30T10:00:00.000Z'));
    await w.corpusFlushNow();
    expect(chiamate).toHaveLength(1);
    expect(chiamate[0].file).toBe('2026-07.jsonl');
    expect(JSON.parse(chiamate[0].line).key).toBe('reaction_fall');
  });

  it('una riga MAI a capo: una riga = un evento, o il file non si legge più', async () => {
    const { chiamate } = setupWindow(true);
    const w = await carica();
    w.corpusWrite(riga('2026-07-30T10:00:00.000Z'));
    await w.corpusFlushNow();
    expect(chiamate[0].line).not.toContain('\n');
  });

  it('accumula e spedisce a lotti, non una chiamata per reazione', async () => {
    const { chiamate } = setupWindow(true);
    const w = await carica();
    for (let i = 0; i < 5; i++) w.corpusWrite(riga('2026-07-30T10:00:00.000Z'));
    // Prima dello svuotamento, nessuna scrittura: le reazioni arrivano a raffica e nessuno le
    // guarda in tempo reale.
    expect(chiamate).toHaveLength(0);
    await w.corpusFlushNow();
    expect(chiamate).toHaveLength(5);
  });

  it('righe di mesi diversi finiscono in file diversi', async () => {
    const { chiamate } = setupWindow(true);
    const w = await carica();
    w.corpusWrite(riga('2026-07-30T23:59:00.000Z'));
    w.corpusWrite(riga('2026-08-01T00:01:00.000Z'));
    await w.corpusFlushNow();
    expect(chiamate.map(c => c.file)).toEqual(['2026-07.jsonl', '2026-08.jsonl']);
  });

  it('senza filesystem non si scrive, e lo si può SAPERE', async () => {
    setupWindow(false);
    const w = await carica();
    expect(w.corpusAvailable()).toBe(false);
    w.corpusWrite(riga('2026-07-30T10:00:00.000Z'));
    await expect(w.corpusFlushNow()).resolves.toBeUndefined();
    expect(await w.corpusFolder()).toBeNull();
  });

  it('svuota la coda alla chiusura della finestra', async () => {
    const { chiamate, listeners } = setupWindow(true);
    const w = await carica();
    w.corpusWrite(riga('2026-07-30T10:00:00.000Z'));
    expect(listeners['pagehide']).toBeDefined();
    listeners['pagehide'].forEach(f => f());
    await new Promise(r => setTimeout(r, 0));
    expect(chiamate).toHaveLength(1);
  });

  it('conta le righe perdute: un archivio incompleto deve poterlo dire', async () => {
    const persi: Chiamata[] = [];
    (globalThis as unknown as { window: unknown }).window = {
      electronAPI: {
        corpusAppend: (a: Chiamata) => { persi.push(a); return Promise.resolve({ ok: false, error: 'disco pieno' }); },
      },
      addEventListener: () => {},
    };
    const w = await carica();
    w.corpusWrite(riga('2026-07-30T10:00:00.000Z'));
    await w.corpusFlushNow();
    expect(w.corpusLost()).toBe(1);
  });
});
