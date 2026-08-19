/**
 * LINGUA E TEMA — due selettori piccoli, condivisi da tutta SERENITY.
 *
 * ── PERCHÉ SONO QUI, E NON DENTRO Avvio.tsx ─────────────────────────────────────────────────
 * Nascevano dentro `Avvio.tsx`, dove servivano PRIMA di aprire una seduta. Segnalato: « la
 * langue doit pouvoir être changée en cours de route » — la lingua (e il tema) devono potersi
 * cambiare anche A SEDUTA APERTA, non solo alle quattro domande iniziali. Un componente locale
 * a un file non si può riusare nell'altro senza duplicarlo — ed è esattamente il difetto che
 * questa refonte esiste per togliere. Spostati qui, li importano sia `Avvio.tsx` sia
 * `Serenity.tsx`.
 *
 * ── IL TEMA È LO STESSO DI EQUILIBRIUM, DAVVERO ─────────────────────────────────────────────
 * `SelettoreTema` non tiene un proprio stato: legge e scrive `useUiStore().isLightTheme`, la
 * STESSA preferenza che governa `GlassThemeToggle` in EQUILIBRIUM (stesso `localStorage`,
 * `nest_ui_preferences`). « Toutes les fonctionnalités de EQUILIBRIUM » vale anche per il
 * tema: è una preferenza dell'auditor, non di quale delle due applicazioni ha aperto in questo
 * momento — cambiarla in SERENITY la cambia anche per la prossima apertura di EQUILIBRIUM, e
 * viceversa. Coerente con l'archivio unico, i profili unici, la lingua per-profilo.
 *
 * ⚠️ SEGNALATO DI NUOVO, con foto e .gif: « la logique est de ne pas avoir deux boutons... mais
 * un bouton qui SLIDE ». Non più due (o cinque) pillole indipendenti che si accendono a turno:
 * un solo cursore di vetro che SCIVOLA da una tappa all'altra della stessa pista —
 * `SegmentoVetro.tsx`, lo stesso componente per tema e lingua (entrambe scelte ESCLUSIVE, una
 * sola vera alla volta — l'identikit esatto di quel pattern).
 *
 * @see docs/serenity-refonte.md
 */

import { useI18n, type Language } from '../i18n';
import { useUiStore } from '../store/uiStore';
import { Sun, Moon } from 'lucide-react';
import { SegmentoVetro } from './SegmentoVetro';

const LINGUE: Language[] = ['en', 'fr', 'it', 'es', 'sv'];

/** Il codice di una lingua VALIDA, o `null`. Il profilo di un auditor può avere `lang`
 *  mancante o corrotto (import vecchio, seduta remota) — non si passa un valore a caso a
 *  `setLang`, si controlla prima. */
export const linguaValida = (l: string | undefined): Language | null =>
  (LINGUE as string[]).includes(l ?? '') ? (l as Language) : null;

/**
 * IL SELETTORE DI LINGUA — cinque codici, non cinque bandiere, su UN cursore che scivola.
 *
 * Una bandiera porta un carico politico che una scelta di lingua non ha bisogno di portare
 * (l'inglese di quale bandiera? lo spagnolo di quale?), ed è comunque un'icona da leggere —
 * contro la dottrina di SERENITY. Il codice a due lettere si legge come si legge un'etichetta:
 * di sbieco, per la sua forma.
 */
export function SelettoreLingua() {
  const { lang, setLang } = useI18n();
  return (
    <SegmentoVetro
      opzioni={LINGUE.map(l => ({ k: l, label: l.toUpperCase() }))}
      selezionato={lang}
      onChange={setLang}
      minLarghezza={30}
    />
  );
}

/**
 * IL SELETTORE DI TEMA — chiaro o scuro, su un cursore che scivola da uno all'altro.
 *
 * Governa la STESSA preferenza di EQUILIBRIUM (vedi sopra). Nel campo centrale questo decide
 * anche il fondo dietro l'ago: scuro → il pannello scuro autentico di EQUILIBRIUM; chiaro →
 * bianco perla, la superficie di SERENITY stessa — l'ago allora non ha bisogno di un pannello
 * a parte, perché i suoi colori chiari si leggono già sul fondo della pagina.
 */
export function SelettoreTema() {
  const { t } = useI18n();
  const isLightTheme = useUiStore(s => s.isLightTheme);
  const setLightTheme = useUiStore(s => s.setLightTheme);
  return (
    <SegmentoVetro
      opzioni={[
        { k: 'chiaro' as const, label: t('ser_theme_light'), icona: <Sun size={12} strokeWidth={1.8} aria-hidden="true" /> },
        { k: 'scuro' as const, label: t('ser_theme_dark'), icona: <Moon size={12} strokeWidth={1.8} aria-hidden="true" /> },
      ]}
      selezionato={isLightTheme ? 'chiaro' : 'scuro'}
      onChange={k => setLightTheme(k === 'chiaro')}
      minLarghezza={70}
    />
  );
}
