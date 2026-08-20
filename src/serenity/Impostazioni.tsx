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
 * ⚠️ SEGNALATO UNA TERZA VOLTA, oltre lo scivolo (`SegmentoVetro.tsx`): « i bottoni DARK/LIGHT
 * devono essere solo UNO, che si trasforma » e « i bottoni delle lingue... deve essere un solo
 * bottone ». Un passo oltre: non più le tappe visibili fianco a fianco con un cursore che le
 * attraversa — UN bottone solo, che mostra SEMPRE e SOLO lo stato attuale, e al click si
 * TRASFORMA nel prossimo (`BottoneCiclico.tsx`).
 *
 * @see docs/serenity-refonte.md
 */

import { useI18n, type Language } from '../i18n';
import { useUiStore } from '../store/uiStore';
import { Sun, Moon } from 'lucide-react';
import { BottoneCiclico } from './BottoneCiclico';

const LINGUE: Language[] = ['en', 'fr', 'it', 'es', 'sv'];

/** Il codice di una lingua VALIDA, o `null`. Il profilo di un auditor può avere `lang`
 *  mancante o corrotto (import vecchio, seduta remota) — non si passa un valore a caso a
 *  `setLang`, si controlla prima. */
export const linguaValida = (l: string | undefined): Language | null =>
  (LINGUE as string[]).includes(l ?? '') ? (l as Language) : null;

/**
 * IL SELETTORE DI LINGUA — un bottone solo, che mostra il codice attuale e si trasforma nel
 * prossimo al click (ciclico: EN→FR→IT→ES→SV→EN…). Codici a due lettere, non bandiere — vedi
 * la nota in testa al file.
 */
export function SelettoreLingua() {
  const { lang, setLang } = useI18n();
  return (
    <BottoneCiclico
      opzioni={LINGUE.map(l => ({ k: l, label: l.toUpperCase() }))}
      selezionato={lang}
      onChange={setLang}
      minLarghezza={40}
      elencoCompleto
    />
  );
}

/**
 * IL SELETTORE DI TEMA — un bottone solo (sole/luna), che si trasforma nell'altro stato al
 * click. Governa la STESSA preferenza di EQUILIBRIUM (vedi sopra).
 */
export function SelettoreTema() {
  const { t } = useI18n();
  const isLightTheme = useUiStore(s => s.isLightTheme);
  const setLightTheme = useUiStore(s => s.setLightTheme);
  return (
    <BottoneCiclico
      opzioni={[
        { k: 'chiaro' as const, label: t('ser_theme_light'), icona: <Sun size={24} strokeWidth={1.8} aria-hidden="true" /> },
        { k: 'scuro' as const, label: t('ser_theme_dark'), icona: <Moon size={24} strokeWidth={1.8} aria-hidden="true" /> },
      ]}
      selezionato={isLightTheme ? 'chiaro' : 'scuro'}
      onChange={k => setLightTheme(k === 'chiaro')}
      minLarghezza={80}
    />
  );
}
