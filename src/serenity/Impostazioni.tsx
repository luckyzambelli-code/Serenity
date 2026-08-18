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
 * ⚠️ SEGNALATO: « met un icone pour clair/dark ». La parola restava la sola fonte
 * dell'informazione (dottrina di SERENITY: « i colori dicono, non gridano », e vale anche per
 * le icone) — qui un piccolo sole/luna la ANTICIPA, di sbieco, senza sostituirla: tolto il testo
 * l'icona da sola non basterebbe a dire "chiaro" da "scuro" con la stessa certezza.
 *
 * @see docs/serenity-refonte.md
 */

import { useI18n, type Language } from '../i18n';
import { useUiStore } from '../store/uiStore';
import { Sun, Moon } from 'lucide-react';

const LINGUE: Language[] = ['en', 'fr', 'it', 'es', 'sv'];

/** Il codice di una lingua VALIDA, o `null`. Il profilo di un auditor può avere `lang`
 *  mancante o corrotto (import vecchio, seduta remota) — non si passa un valore a caso a
 *  `setLang`, si controlla prima. */
export const linguaValida = (l: string | undefined): Language | null =>
  (LINGUE as string[]).includes(l ?? '') ? (l as Language) : null;

const bottone = (attivo: boolean): React.CSSProperties => ({
  border: 'none', background: 'none', cursor: 'pointer', padding: 2,
  fontFamily: 'var(--s-mono)', fontSize: 11, letterSpacing: '0.04em',
  color: attivo ? 'var(--s-ink)' : 'var(--s-ink-ghost)',
  fontWeight: attivo ? 600 : 400,
  display: 'flex', alignItems: 'center', gap: 5,
});

/**
 * IL SELETTORE DI LINGUA — cinque codici, non cinque bandiere.
 *
 * Una bandiera porta un carico politico che una scelta di lingua non ha bisogno di portare
 * (l'inglese di quale bandiera? lo spagnolo di quale?), ed è comunque un'icona da leggere —
 * contro la dottrina di SERENITY. Il codice a due lettere si legge come si legge un'etichetta:
 * di sbieco, per la sua forma.
 */
export function SelettoreLingua() {
  const { lang, setLang } = useI18n();
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      {LINGUE.map(l => (
        <button key={l} onClick={() => setLang(l)} style={bottone(l === lang)}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

/**
 * IL SELETTORE DI TEMA — chiaro o scuro, in parole.
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
    <div style={{ display: 'flex', gap: 10 }}>
      <button onClick={() => setLightTheme(true)} style={bottone(isLightTheme)}>
        <Sun size={12} strokeWidth={1.8} aria-hidden="true" />
        {t('ser_theme_light')}
      </button>
      <button onClick={() => setLightTheme(false)} style={bottone(!isLightTheme)}>
        <Moon size={12} strokeWidth={1.8} aria-hidden="true" />
        {t('ser_theme_dark')}
      </button>
    </div>
  );
}
