import { pick5 } from '../i18n5';
import type { Avvio as StatoAvvio } from './flussoAvvio';

/**
 * PannelloScegliStrumento — « con che cosa si audita? », prima di aprire la seduta.
 *
 * ── PERCHÉ ESISTE ────────────────────────────────────────────────────────────────────────────
 * Equivalente SERENITY di `components/InstrumentHintPanel.tsx` (EQUILIBRIUM) — stessa scelta
 * (MUSE / boîtes / senza strumenti), linguaggio visivo suo proprio (vetro `s-glass`, non i
 * colori scuri di EQUILIBRIUM — v. "principio dimensionale" in `docs/serenity-refonte.md`), MAI
 * lo stesso componente. Primo pezzo della frammentazione di `Serenity.tsx` (segnalato: « si
 * possono frammentare per ciclo o altro? »).
 *
 * ── UN PO' PIÙ GROSSO DEL SUO EQUIVALENTE EQUILIBRIUM ───────────────────────────────────────
 * Porta con sé anche il salvataggio della configurazione (nome + INVIO/bottone) — qui, non a
 * parte, perché è lo stesso pannello che lo mostra. Resta comunque presentazionale: nessuno
 * `useState` nuovo, `salvaConfigurazione`/`pick5` sono funzioni pure importate direttamente
 * (non dipendono da altro stato di `Serenity.tsx`), tutto il resto arriva come prop.
 */
export function PannelloScegliStrumento({
  open, onClose, connSel, onToggleConn, thetaUnavailable, lang, t,
  nomeConfigDaSalvare, onNomeConfigChange, configSalvata, onSalvaConfigurazione,
  avvio, onStart,
}: {
  open: boolean;
  onClose: () => void;
  connSel: { muse: boolean; theta: boolean; none: boolean };
  onToggleConn: (k: 'muse' | 'theta' | 'none') => void;
  thetaUnavailable: boolean;
  lang: string;
  t: (key: string) => string;
  nomeConfigDaSalvare: string;
  onNomeConfigChange: (v: string) => void;
  configSalvata: boolean;
  onSalvaConfigurazione: () => void;
  /** Le risposte del primo avvio (auditor/PC/dove/esperto) — `null` finché non sono ancora
   *  complete: solo allora ha senso proporre di salvare la configurazione (v. la nota qui
   *  sotto, dove compare per la prima volta). */
  avvio: StatoAvvio | null;
  onStart: () => void;
}) {
  const LC = (it: string, fr: string, en: string, es: string, sv: string) => pick5(lang, it, fr, en, es, sv) as string;
  if (!open) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: 'color-mix(in srgb, var(--s-ground) 80%, transparent)',
    }}>
      <div className="s-glass s-glass-lift" style={{
        display: 'flex', flexDirection: 'column', gap: 16, padding: '28px 32px',
        borderRadius: 16, background: 'var(--s-disc)',
        minWidth: 320,
      }}>
        <span style={{ fontFamily: 'var(--s-serif)', fontSize: 'var(--s-fs-lg)', color: 'var(--s-ink)' }}>
          {LC('con che cosa si audita?', 'avec quoi audite-t-on ?', 'what will you audit with?',
              '¿con qué se audita?', 'vad ska du auditera med?')}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {([
            { k: 'muse' as const, on: connSel.muse, label: 'MUSE', show: true },
            { k: 'theta' as const, on: connSel.theta, label: t('theta_cans'), show: !thetaUnavailable },
            { k: 'none' as const, on: connSel.none, label: t('no_instruments_mode'), show: true },
          ]).filter(o => o.show).map(o => (
            <button key={o.k} onClick={() => onToggleConn(o.k)} style={{
              display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
              border: 'none', cursor: 'pointer', borderRadius: 10, padding: '10px 14px',
              fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', letterSpacing: '0.02em',
              background: o.on ? 'var(--s-disc-sunk)' : 'transparent',
              color: 'var(--s-ink)', boxShadow: o.on ? 'var(--s-shadow)' : 'none',
            }}>
              <span style={{ fontFamily: 'var(--s-mono)', width: 14 }}>{o.on ? '✓' : '·'}</span>
              {o.label}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 'var(--s-fs-base)', color: 'var(--s-ink-faint)', maxWidth: 280, lineHeight: 1.5 }}>
          {connSel.none ? t('no_instruments_hint') : t('connect_either_hint')}
        </span>
        {/* ── SALVA QUESTA COMBINAZIONE — chiesto direttamente: « un sistema di
            configurazioni registrate... alla sessione successiva l'Auditor deve poter
            richiamarla ». Qui, non prima: solo ORA le cinque scelte (auditor/PC/dove/
            esperto, già in `avvio`, più strumenti, appena scelti sopra) sono TUTTE
            disponibili insieme — è il primo momento in cui c'è una configurazione intera da
            salvare, non quattro pezzi sparsi lungo l'avvio. */}
        {(connSel.muse || connSel.theta || connSel.none) && avvio && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              value={nomeConfigDaSalvare}
              onChange={e => onNomeConfigChange(e.target.value)}
              // ⚠️ Segnalato: « non è chiaro che devi schiacciare su save ». INVIO salva —
              // il gesto naturale dopo aver scritto un nome, invece di dover trovare il
              // piccolo bottone testuale accanto (che resta, per chi preferisce il mouse).
              onKeyDown={e => { if (e.key === 'Enter' && nomeConfigDaSalvare.trim()) onSalvaConfigurazione(); }}
              placeholder={LC('nome di questa configurazione…', 'nom de cette configuration…',
                'name for this configuration…', 'nombre de esta configuración…', 'namn för denna konfiguration…')}
              style={{
                flex: 1, border: 'none', borderBottom: '1px solid var(--s-ink-ghost)', background: 'none',
                outline: 'none', fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', color: 'var(--s-ink)',
                padding: '2px 4px',
              }}
            />
            <button
              disabled={!nomeConfigDaSalvare.trim()}
              onClick={onSalvaConfigurazione}
              style={{
                border: 'none', background: 'none', cursor: nomeConfigDaSalvare.trim() ? 'pointer' : 'default',
                opacity: nomeConfigDaSalvare.trim() ? 1 : 0.4,
                fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', color: 'var(--s-ink-soft)', whiteSpace: 'nowrap',
              }}>
              {configSalvata
                ? LC('salvata ✓', 'enregistrée ✓', 'saved ✓', 'guardada ✓', 'sparad ✓')
                : LC('salva', 'enregistrer', 'save', 'guardar', 'spara')}
            </button>
          </div>
        )}
        <div style={{ display: 'flex', gap: 14, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            border: 'none', background: 'none', cursor: 'pointer',
            fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', color: 'var(--s-ink-ghost)',
          }}>
            {t('cancel')}
          </button>
          <button
            disabled={!connSel.muse && !connSel.theta && !connSel.none}
            onClick={onStart}
            className="s-glass s-glass-btn"
            style={{
              borderRadius: 999, padding: '9px 22px',
              cursor: (connSel.muse || connSel.theta || connSel.none) ? 'pointer' : 'default',
              opacity: (connSel.muse || connSel.theta || connSel.none) ? 1 : 0.4,
              fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', letterSpacing: '0.06em', textTransform: 'uppercase',
              background: 'var(--s-ink)', color: 'var(--s-ground)',
            }}>
            {t('ser_open_session')}
          </button>
        </div>
      </div>
    </div>
  );
}
