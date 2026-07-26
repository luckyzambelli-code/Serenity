import React from 'react';
import { creditLines, creditCopyright } from '../credits';
import { useI18n } from '../i18n';

/**
 * CreditsModal — s'ouvre au clic sur le logo Alternative Scientology (barre du haut).
 * PRÉSENTATION SEULE : aucun état métier, aucun calcul. Les textes viennent de `credits.ts`,
 * la MÊME source que ceux dessinés pendant l'animation d'ouverture.
 */
export function CreditsModal({ onClose }: { onClose: () => void }) {
  const { t, lang } = useI18n();
  const lines = creditLines(lang);
  const cr = creditCopyright(lang);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9998, cursor: 'pointer',
        background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          cursor: 'default', minWidth: 320, maxWidth: 420, padding: '26px 30px 22px',
          borderRadius: 16, border: '1px solid rgba(255,255,255,0.14)',
          background: 'linear-gradient(160deg, #2c2c31 0%, #1c1c20 100%)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
        }}
      >
        <img src="/logo-alt-scientology.png" alt="Alternative Scientology"
          style={{ display: 'block', width: '100%', height: 'auto', maxHeight: 54,
                   objectFit: 'contain', marginBottom: 20,
                   filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.5)) brightness(1.05)' }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          {lines.map(l => (
            <div key={l.label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 9, letterSpacing: '0.14em',
                             textTransform: 'uppercase', color: 'rgba(226,238,255,0.45)' }}>
                {l.label}
              </span>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 600,
                             color: 'rgba(240,246,255,0.95)' }}>
                {l.value}
              </span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.10)',
                      display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 9, letterSpacing: '0.14em',
                         color: 'rgba(226,238,255,0.45)' }}>
            {cr.label}
          </span>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
                         letterSpacing: '0.06em', color: 'rgba(240,246,255,0.95)' }}>
            {cr.value}
          </span>
        </div>

        <button
          type="button"
          onClick={onClose}
          title={t('tip_close') as string}
          style={{
            marginTop: 18, width: '100%', height: 32, borderRadius: 9, cursor: 'pointer',
            border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.06)',
            color: 'rgba(240,246,255,0.9)', fontFamily: 'var(--font-sans)', fontSize: 11,
            letterSpacing: '0.1em', textTransform: 'uppercase',
          }}
        >
          {t('tip_close') as string}
        </button>
      </div>
    </div>
  );
}
