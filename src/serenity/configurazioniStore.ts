/**
 * configurazioniStore — LE CONFIGURAZIONI REGISTRATE.
 *
 * ── PERCHÉ ESISTE ───────────────────────────────────────────────────────────────────────────
 * Chiesto direttamente: « un sistema di configurazioni registrate che memorizzi le scelte
 * iniziali... alla sessione successiva l'Auditor deve poter richiamare una configurazione
 * salvata e ritrovare automaticamente tutte le impostazioni, evitando di ripetere ogni
 * passaggio iniziale ». Le quattro domande di `flussoAvvio.ts` (AUDITOR/PC/A distanza/
 * Esperto-Normale) più la scelta strumenti di `Serenity.tsx` (fatta DOPO l'avvio, al primo
 * APRI UNA SEDUTA) sono le "scelte iniziali": una configurazione è un'istantanea di ENTRAMBE.
 *
 * ── PERCHÉ È UN ARCHIVIO A PARTE, NON DENTRO UN PROFILO ────────────────────────────────────
 * Un profilo (`lib/storage`) è UNA persona — auditor o preclear — condivisa con EQUILIBRIUM.
 * Una configurazione è una COMBINAZIONE (auditor + preclear + dove + strumenti): lo stesso
 * auditor lavora "in remoto con Marco e le lattine" e "in locale con Elena e il MUSE" — due
 * configurazioni, una persona. Incollarla dentro il profilo dell'auditor obbligherebbe a
 * scegliere UNA combinazione preferita per persona, che è esattamente il problema segnalato.
 *
 * ── PERCHÉ localStorage, come `serenityModuleStore`/`uiStore` ──────────────────────────────
 * Preferenze di MACCHINA — "su questo computer, per questo auditor, queste sono le
 * combinazioni pronte" — non dati di seduta: niente CORPUS, niente sincronizzazione fra
 * dispositivi. Stessa scelta già fatta per `serenityModuleStore.ts`.
 *
 * Puro TS, nessun React: la stessa forma di `engine/canTest.ts`.
 *
 * @see docs/serenity-refonte.md
 */

import type { Avvio } from './flussoAvvio';

/** La stessa scelta del pannello « con che cosa si audita? » in `Serenity.tsx` (`connSel`). */
export interface SceltaStrumenti {
  muse: boolean;
  theta: boolean;
  none: boolean;
}

export interface ConfigurazioneSalvata {
  id: string;
  nome: string;
  /** Le quattro risposte dell'avvio, TUTTE valorizzate — una configurazione richiamabile non
   *  può avere una domanda ancora aperta. */
  avvio: Avvio;
  strumenti: SceltaStrumenti;
  salvataIl: string;   // ISO — per ordinarle, la più recente prima.
}

const CHIAVE = 'serenity_configurazioni';

export function leggiConfigurazioni(): ConfigurazioneSalvata[] {
  try {
    const grezzo = localStorage.getItem(CHIAVE);
    if (!grezzo) return [];
    const elenco = JSON.parse(grezzo);
    if (!Array.isArray(elenco)) return [];
    return elenco.sort((a, b) => (b.salvataIl || '').localeCompare(a.salvataIl || ''));
  } catch {
    return [];
  }
}

function scrivi(elenco: ConfigurazioneSalvata[]): void {
  try { localStorage.setItem(CHIAVE, JSON.stringify(elenco)); } catch { /* noop — niente archivio, niente seduta persa */ }
}

/** Salva (o sovrascrive, passando lo stesso `idEsistente`) una configurazione. */
export function salvaConfigurazione(
  nome: string, avvio: Avvio, strumenti: SceltaStrumenti, idEsistente?: string,
): ConfigurazioneSalvata {
  const cfg: ConfigurazioneSalvata = {
    id: idEsistente ?? `cfg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    nome: nome.trim() || 'senza nome',
    avvio, strumenti,
    salvataIl: new Date().toISOString(),
  };
  scrivi([...leggiConfigurazioni().filter(c => c.id !== cfg.id), cfg]);
  return cfg;
}

export function eliminaConfigurazione(id: string): void {
  scrivi(leggiConfigurazioni().filter(c => c.id !== id));
}
