/**
 * VistaPartecipante — LO SCHERMO DEL TELEFONO, DENTRO SERENITY. Fase 9 della refonte.
 *
 * ── PERCHÉ ESISTE ────────────────────────────────────────────────────────────────────────────
 * Segnalato dal vivo, con insistenza crescente: « non deve più esserci EQUILIBRIUM sul
 * telefonino — d'ora in poi solo SERENITY deve esistere ». Fino a qui, un telefono che apriva
 * un link/QR di SERENITY veniva rimandato (`src/serenity/main.tsx`) a `index.html` — il bundle
 * di EQUILIBRIUM, l'unico che sapesse fare da PARTECIPANTE. Questo componente È quell'altrove:
 * lo stesso protocollo (via `useParticipantSession`, il suo hook gemello), disegnato con la
 * grafica di SERENITY invece che con quella scura di EQUILIBRIUM.
 *
 * ── COSA RESTA FUORI DI PROPOSITO, PER ORA ──────────────────────────────────────────────────
 * V. la nota grande in `useParticipantSession.ts`: nessuno specchio del respiro guidato
 * (`READINESS`), nessun MUSE sul telefono (irrilevante per il satellite — « MUSE sul Mac », lo
 * stesso avviso di sempre — ma vero limite per una VERA seduta a distanza), nessun tono
 * neuro-acustico. Il satellite (l'unico caso provato dal vivo finora) ha piena parità.
 *
 * @see docs/serenity-refonte.md — fase 9.
 */

import { useEffect, useState } from 'react';
import { Power, Mic } from 'lucide-react';
import { useI18n, type Language } from '../i18n';
import { useParticipantSession } from '../hooks/useParticipantSession';
import { CameraCerchio } from './CameraCerchio';

export function VistaPartecipante({ linkIniziale, linguaInvito }: {
  linkIniziale: string;
  /** ⚠️ AGGIUNTO — segnalato dal vivo: « quando ci si connette come PC locale col telefono,
   *  deve apparire la lingua scelta dall'auditor, non l'inglese di default ». La stessa
   *  correzione già fatta per `App.tsx`/EQUILIBRIUM (il 5° segmento del link) — qui mancava
   *  perché questo componente non esisteva ancora in quel giro. */
  linguaInvito?: Language;
}) {
  const { t, lang, setLang } = useI18n();
  useEffect(() => {
    if (linguaInvito) setLang(linguaInvito);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const p = useParticipantSession({ lang, setLang });
  const [link, setLink] = useState(linkIniziale);
  const [uscito, setUscito] = useState(false);

  // ⚠️ Un SOLO gesto dell'utente (il tap su CONNETTI) chiede fotocamera/microfono — mai in
  // automatico al caricamento: la stessa ragione di sempre (`autoJoinDoneRef` in App.tsx,
  // mai un `getUserMedia` senza un tap reale davanti).
  const collega = () => { if (link.trim()) p.connetti(link.trim()); };

  const lascia = () => { p.lascia(); setUscito(true); };

  // ── USCITO — v. la nota grande in App.tsx sullo stesso schermo (`participantSessionEnded`):
  //    di proposito SENZA branding, né EQUILIBRIUM né SERENITY — il telefono non sa quale
  //    delle due l'auditor stia usando, e non gli serve saperlo. ──────────────────────────────
  if (uscito) {
    return (
      <div style={{
        width: '100vw', height: '100vh', background: 'var(--s-ground)', color: 'var(--s-ink)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 12, textAlign: 'center', padding: 24, fontFamily: 'var(--s-sans)',
      }}>
        <div style={{ fontSize: 40 }}>✓</div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{t('conn_participant_goodbye_title')}</div>
        <div style={{ fontSize: 13, color: 'var(--s-ink-soft)' }}>{t('conn_participant_goodbye_desc')}</div>
      </div>
    );
  }

  // ── NON ANCORA CONNESSO — stesso schema di `Connessione.tsx`: link già pieno (rilevato dal
  //    QR) o da incollare, un bottone solo. ───────────────────────────────────────────────────
  if (!p.isConnected) {
    return (
      <section style={{
        width: '100vw', height: '100vh', display: 'grid', placeItems: 'center',
        background: 'var(--s-ground)', padding: '38px 44px', boxSizing: 'border-box',
      }}>
        <div style={{ display: 'grid', justifyItems: 'center', gap: 24, maxWidth: 460, textAlign: 'center' }}>
          <h1 style={{
            margin: 0, fontFamily: 'var(--s-serif)', fontWeight: 400, fontSize: 'var(--s-fs-hero)',
            letterSpacing: '-0.01em', color: 'var(--s-ink)',
          }}>
            {t('conn_preclear_title')}
          </h1>
          <p style={{ margin: '-10px 0 0', fontSize: 'var(--s-fs-base)', color: 'var(--s-ink-soft)', lineHeight: 1.6 }}>
            {t('conn_preclear_subtitle')}
          </p>
          {/* ⚠️ Il link ARRIVA GIÀ PIENO (rilevato dal QR, v. `main.tsx`) — mostrare qui la
              guida "incolla il link" sarebbe falso, la stessa correzione già fatta per
              `ConnectionModal.tsx` (EQUILIBRIUM). Un riquadro verde, non tre passi. */}
          <div style={{
            padding: '16px 20px', borderRadius: 12, width: '100%', boxSizing: 'border-box',
            background: 'color-mix(in srgb, var(--s-still) 14%, var(--s-disc))',
            border: '1px solid color-mix(in srgb, var(--s-still) 35%, transparent)',
          }}>
            <div style={{ fontSize: 'var(--s-fs-base)', color: 'var(--s-still)', fontWeight: 700, marginBottom: 6 }}>
              📱 {t('conn_qr_detected_title')}
            </div>
            <div style={{ fontSize: 'var(--s-fs-sm)', color: 'var(--s-ink-soft)', lineHeight: 1.5 }}>
              {t('conn_qr_detected_desc')}
            </div>
          </div>
          {/* ⚠️ Un `<input>` VERO, non un'etichetta statica — segnalato per il caso gemello
              (`ConnectionModal.tsx`): un link auto-rilevato dal QR resta comunque MODIFICABILE
              a mano, per chi ricevesse un link diverso da incollare invece di scansionare. */}
          <input
            value={link}
            onChange={e => setLink(e.target.value)}
            spellCheck={false} autoCapitalize="off" autoCorrect="off" inputMode="url"
            style={{
              padding: '12px 16px', borderRadius: 10, background: 'var(--s-disc)',
              border: '1px solid var(--s-ink-ghost)', outline: 'none',
              fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-sm)', color: 'var(--s-ink)',
              width: '100%', boxSizing: 'border-box',
            }}
          />
          {p.errore && (
            <div style={{ fontSize: 'var(--s-fs-sm)', color: 'var(--s-reserve)' }}>⚠ {p.errore}</div>
          )}
          <button className="s-glass s-glass-btn" onClick={collega} disabled={p.connecting}
            style={{
              cursor: p.connecting ? 'default' : 'pointer', opacity: p.connecting ? 0.6 : 1,
              background: 'var(--s-disc)', color: 'var(--s-ink)',
              borderRadius: 999, padding: '14px 32px', width: '100%', boxSizing: 'border-box',
              fontSize: 'var(--s-fs-base)', letterSpacing: '0.08em', textTransform: 'uppercase',
              fontFamily: 'var(--s-sans)', border: 'none',
            }}>
            {p.connecting ? t('conn_connecting') : `📡 ${t('conn_connect_btn')}`}
          </button>
        </div>
      </section>
    );
  }

  // ── CONNESSO ────────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{
      width: '100vw', height: '100vh', background: 'var(--s-ground)', color: 'var(--s-ink)',
      display: 'flex', flexDirection: 'column', fontFamily: 'var(--s-sans)',
    }}>
      {/* EOS — stesso schermo di ParticipantView.tsx (EQUILIBRIUM), stesso significato:
          quando l'auditor chiude, il preclear deve saperlo SUBITO, non intuirlo. */}
      {p.sessionState === 'ended' && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
          background: 'color-mix(in srgb, var(--s-ground) 92%, transparent)', backdropFilter: 'blur(8px)',
        }}>
          <div style={{ fontSize: 'clamp(28px,9vw,64px)', fontWeight: 900, letterSpacing: '0.12em', color: 'var(--s-ink)' }}>EOS</div>
          <div style={{ fontSize: 'clamp(13px,3.4vw,20px)', fontWeight: 700, color: 'var(--s-ink-soft)', textAlign: 'center', padding: '0 20px' }}>
            {t('eos_end_of_session')}
          </div>
          <button onClick={lascia} className="s-glass s-glass-btn" style={{
            marginTop: 18, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
            fontSize: 15, fontWeight: 700, color: 'var(--s-ink)', background: 'var(--s-disc)',
            border: 'none', borderRadius: 10, padding: '12px 24px',
          }}>
            <Power size={18} strokeWidth={2.2} /> {t('conn_disconnect')}
          </button>
        </div>
      )}

      {/* Intestazione */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px',
        background: 'var(--s-disc)', borderBottom: '1px solid var(--s-ink-ghost)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--s-still)' }} />
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.06em' }}>{t('conn_badge_preclear_ok')}</span>
        </div>
        <button onClick={lascia} className="s-glass s-glass-btn" style={{
          display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, fontWeight: 700,
          color: '#fff', background: '#dc2626', border: 'none', borderRadius: 8, padding: '8px 16px',
        }}>
          <Power size={16} strokeWidth={2.2} /> {t('conn_disconnect')}
        </button>
      </div>

      {/* Il microfono trasmette — nessuna azione richiesta al PC, solo una rassicurazione. */}
      {p.micArmed && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '6px 16px', flexShrink: 0, background: 'var(--s-disc-sunk)',
          borderBottom: '1px solid var(--s-ink-ghost)', fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
        }}>
          <Mic size={13} strokeWidth={2} /> {t('pc_mic_active')}
        </div>
      )}

      {/* Il satellite non aspetta MAI un video dall'auditor (per disegno — v. la nota
          gemella in ParticipantView.tsx/EQUILIBRIUM); una vera seduta a distanza sì. */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {p.satellite ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 40 }}>📱</div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '0.06em' }}>{t('conn_satellite_headline')}</div>
            <div style={{ fontSize: 12, color: 'var(--s-ink-soft)' }}>{t('conn_satellite_no_video')}</div>
          </div>
        ) : (
          <CameraCerchio
            dimensione={260} titolo={t('cam1') as string}
            externalStream={p.remoteStream ?? null}
            offlineLabel={t('camera_offline') as string}
          />
        )}
      </div>
    </div>
  );
}
