import React, { useState } from 'react';
import { creditLines, creditCopyright, initialsOf } from '../credits';
import { useI18n } from '../i18n';
import { LAYER } from "../ui/layers";

/**
 * Portrait ROND. Si le fichier n'est pas là, on retombe sur les INITIALES : jamais l'icône
 * d'image cassée. `objectFit: cover` recadre au centre, donc une photo carrée ou rectangulaire
 * remplit le rond sans se déformer.
 */
function CreditAvatar({ src, name }: { src?: string; name: string }) {
  const [failed, setFailed] = useState(false);
  const SIZE = 46;
  const commun: React.CSSProperties = {
    width: SIZE, height: SIZE, borderRadius: '50%', flexShrink: 0,
    border: '1px solid rgba(255,255,255,0.18)',
    boxShadow: '0 2px 10px rgba(0,0,0,0.45)',
    // Le fond vaut AUSSI pour les photos : un PNG détouré (fond transparent) donnerait
    // sinon une tête flottant dans le noir du panneau, au lieu d'un portrait.
    background: 'linear-gradient(150deg, rgba(255,255,255,0.13), rgba(255,255,255,0.04))',
  };

  if (!src || failed) {
    return (
      <div style={{
        ...commun, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 700,
        letterSpacing: '0.04em', color: 'rgba(240,246,255,0.7)',
      }}>
        {initialsOf(name)}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      onError={() => setFailed(true)}
      style={{ ...commun, objectFit: 'cover', display: 'block' }}
    />
  );
}

/**
 * ONDES — le médaillon rond sous le nom du logiciel.
 *
 * ROND comme les portraits, et volontairement en sourdine : c'est un clin d'œil, pas un crédit.
 * Il s'éclaire au survol, pour qui le remarque. (Le bobtail de Claudio occupait cette place ;
 * l'image d'ondes la reprend, même cercle, même discrétion.)
 */
function Medaillon({ title }: { title: string }) {
  const [survol, setSurvol] = useState(false);
  const [rate, setRate] = useState(false);
  if (rate) return null;      // pas de vignette d'image cassée : il disparaît, simplement
  return (
    <img
      src="/credits/ondes.png"
      alt={title}
      title={title}
      onError={() => setRate(true)}
      onMouseEnter={() => setSurvol(true)}
      onMouseLeave={() => setSurvol(false)}
      style={{
        // 40 px : un peu moins que les 46 des portraits — assez pour qu'on VOIE le chien,
        // assez peu pour qu'il ne se prenne pas pour un crédit.
        width: 40, height: 40, borderRadius: '50%', flexShrink: 0, objectFit: 'cover',
        border: '1px solid rgba(255,255,255,0.18)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.45)',
        opacity: survol ? 1 : 0.8,
        transition: 'opacity 220ms ease',
      }}
    />
  );
}

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
        position: 'fixed', inset: 0, zIndex: LAYER.modalTop, cursor: 'pointer',
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
                   objectFit: 'contain', marginBottom: 10,
                   filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.5)) brightness(1.05)' }} />

        {/* Le NOM du logiciel, sous le logo de la maison. Le médaillon se tient à côté — discret,
            décalé vers le bas pour ne pas concurrencer le mot. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                      marginBottom: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 17, fontWeight: 300,
                           letterSpacing: '0.30em', textIndent: '0.30em',
                           color: 'rgba(240,246,255,0.92)',
                           textShadow: '0 0 18px rgba(180,210,255,0.20)' }}>
              EQUILIBRIUM
            </span>
            {/* La versione sta QUI, sotto il nome: è del programma, non del copyright. */}
            <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 13,
                           letterSpacing: '0.10em', color: 'rgba(226,238,255,0.62)' }}>
              v{__APP_VERSION__}
            </span>
          </div>
          <Medaillon title="Ondes" />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {lines.map(l => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
              <CreditAvatar src={l.photo} name={l.value} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 9, letterSpacing: '0.14em',
                               textTransform: 'uppercase', color: 'rgba(226,238,255,0.45)' }}>
                  {l.label}
                </span>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 600,
                               color: 'rgba(240,246,255,0.95)' }}>
                  {l.value}
                </span>
              </div>
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
