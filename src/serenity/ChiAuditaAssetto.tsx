/**
 * ChiAuditaAssetto — la pillola "chi audita / chi si audita / dove" e il suo popover "assetto"
 * (livello, cambia persone, salva configurazione) — secondo pezzo staccato dall'intestazione di
 * `Serenity.tsx` (dopo `LogoSerenity.tsx`).
 *
 * ── PERCHÉ, E COME RESTA SICURO ──────────────────────────────────────────────────────────────
 * A differenza di `LogoSerenity.tsx` (puramente presentazionale), il popover "assetto" QUI
 * dentro tocca stato che non è solo suo — cambia il livello BASIC/EXPERT (`avvio.esperto`),
 * ricomincia la scelta di auditor/preclear, salva una configurazione. La stessa cautela che ha
 * tenuto questo pezzo rimandato in un giro precedente resta — ma solo COME lo si estrae: ogni
 * azione composta (« cambia livello », « salva la configurazione »…) resta una funzione decisa
 * da `Serenity.tsx` — questo componente riceve SOLO "cosa succede quando premo questo bottone",
 * mai la logica di COSA succede davvero. Lo stato che regge il pannello (`assettoAperto`,
 * `salvaConfigAperto`, `configSalvata`, `nomeConfigDaSalvare`) vive ancora in `Serenity.tsx`.
 *
 * @see docs/serenity-refonte.md — giro di scomposizione, 2026-09-07.
 */
import { User, Users, Wifi, SlidersHorizontal, Wrench, CircleUser, UserCog, Save } from 'lucide-react';
import { useI18n } from '../i18n';
import type { Avvio } from './flussoAvvio';

export interface ChiAuditaAssettoProps {
  avvio: Avvio;
  nomeAuditor: string;
  nomePreclear: string;
  /** Seduta già aperta — « cambia persone »/« salva configurazione » restano possibili SOLO
   *  prima (`ricomincia` chiuderebbe anche la rete a distanza a metà seduta). */
  aperta: boolean;
  assettoAperto: boolean;
  onToggleAssetto: () => void;
  onCambiaLivello: () => void;
  onCambiaPersone: () => void;
  salvaConfigAperto: boolean;
  onToggleSalvaConfig: () => void;
  configSalvata: boolean;
  nomeConfigDaSalvare: string;
  onCambiaNomeConfig: (v: string) => void;
  onSalvaConfig: () => void;
  LC: (it: string, fr: string, en: string, es: string, sv: string) => string;
}

export function ChiAuditaAssetto({
  avvio, nomeAuditor, nomePreclear, aperta, assettoAperto, onToggleAssetto,
  onCambiaLivello, onCambiaPersone, salvaConfigAperto, onToggleSalvaConfig,
  configSalvata, nomeConfigDaSalvare, onCambiaNomeConfig, onSalvaConfig, LC,
}: ChiAuditaAssettoProps) {
  const { t } = useI18n();

  return (
    <span className="s-glass" style={{
      fontSize: 'var(--s-fs-base)', color: 'var(--s-ink-soft)', display: 'flex', alignItems: 'center', gap: 10,
      background: 'var(--s-disc)', padding: '5px 12px', borderRadius: 999,
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        {avvio.solo
          ? <User size={24} strokeWidth={1.8} aria-hidden="true" />
          : <Users size={24} strokeWidth={1.8} aria-hidden="true" />}
        {nomeAuditor}{avvio.solo ? ` · ${t('ser_alone_tag')}` : ` · ${nomePreclear}`}
      </span>
      {avvio.distanza && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Wifi size={24} strokeWidth={1.8} aria-hidden="true" />
          {t('ser_remote_tag')}
        </span>
      )}
      <div style={{ position: 'relative' }}>
        <button
          className="s-glass-btn"
          onClick={onToggleAssetto}
          title={LC('assetto della seduta — livello, e chi audita', 'réglages de la séance — niveau, et qui audite',
            'session setup — level, and who is auditing', 'ajustes de la sesión — nivel, y quién audita',
            'sessionsinställningar — nivå, och vem som auditerar')}
          data-help={LC('assetto della seduta — livello, e chi audita', 'réglages de la séance — niveau, et qui audite',
            'session setup — level, and who is auditing', 'ajustes de la sesión — nivel, y quién audita',
            'sessionsinställningar — nivå, och vem som auditerar')}
          style={{
            display: 'flex', alignItems: 'center', border: 'none', background: 'none',
            cursor: 'pointer', padding: 2, color: 'var(--s-ink-faint)', lineHeight: 0,
          }}>
          <SlidersHorizontal size={22} strokeWidth={1.8} aria-hidden="true" />
        </button>
        {assettoAperto && (
          <div className="s-glass s-glass-lift" style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 8, zIndex: 40,
            display: 'flex', flexDirection: 'column', gap: 4, padding: 8,
            borderRadius: 12, background: 'var(--s-disc)', minWidth: 260,
          }}>
            <button
              onClick={onCambiaLivello}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, border: 'none', background: 'none',
                cursor: 'pointer', padding: '8px 6px', borderRadius: 8, textAlign: 'left',
                fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', color: 'var(--s-ink)',
              }}>
              {avvio.esperto
                ? <Wrench size={20} strokeWidth={1.8} aria-hidden="true" />
                : <CircleUser size={20} strokeWidth={1.8} aria-hidden="true" />}
              {avvio.esperto ? t('ser_expert_tag') : t('ser_normal_tag')}
              <span style={{ marginLeft: 'auto', fontSize: 'var(--s-fs-sm)', color: 'var(--s-ink-faint)' }}>
                {LC('cambia', 'changer', 'change', 'cambiar', 'ändra')}
              </span>
            </button>
            {!aperta && (
              <button
                onClick={onCambiaPersone}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, border: 'none', background: 'none',
                  cursor: 'pointer', padding: '8px 6px', borderRadius: 8, textAlign: 'left',
                  fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', color: 'var(--s-ink)',
                }}>
                <UserCog size={20} strokeWidth={1.8} aria-hidden="true" />
                {t('ser_change_people')}
              </button>
            )}
            {!aperta && (
              <>
                <button
                  onClick={onToggleSalvaConfig}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, border: 'none', background: 'none',
                    cursor: 'pointer', padding: '8px 6px', borderRadius: 8, textAlign: 'left',
                    fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', color: 'var(--s-ink)',
                  }}>
                  <Save size={20} strokeWidth={1.8} aria-hidden="true" />
                  {LC('salva questa configurazione', 'sauvegarder cette configuration',
                    'save this configuration', 'guardar esta configuración', 'spara denna konfiguration')}
                </button>
                {salvaConfigAperto && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 6px 8px' }}>
                    <span style={{ fontSize: 'var(--s-fs-sm)', lineHeight: 1.5, color: 'var(--s-ink-faint)' }}>
                      {LC('auditor, preclear, locale/distanza, e gli strumenti connessi in questo momento — tutto insieme.',
                        'auditeur, préclair, local/distance, et les instruments connectés en ce moment — le tout ensemble.',
                        'auditor, preclear, local/distance, and the instruments connected right now — all together.',
                        'auditor, preclear, local/distancia, y los instrumentos conectados ahora mismo — todo junto.',
                        'auditor, preclear, lokal/distans, och instrumenten som är anslutna just nu — allt tillsammans.')}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        autoFocus
                        value={nomeConfigDaSalvare}
                        onChange={e => onCambiaNomeConfig(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && nomeConfigDaSalvare.trim()) onSalvaConfig(); }}
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
                        onClick={onSalvaConfig}
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
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </span>
  );
}
