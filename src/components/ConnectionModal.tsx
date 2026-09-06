/**
 * ConnectionModal — grande fenêtre de connexion P2P
 *
 * - Mode AUDITOR : génère un lien internet (tunnel) à partager avec le Preclear
 * - Mode PRECLEAR : colle le lien reçu de l'Auditeur et se connecte
 * - Textes traduits dans les 5 langues via useI18n()
 * - Polices grandes, interface guidée et claire
 */

import React, { useState, useEffect } from 'react';
import { X, Copy, Check, Globe, Link2, Users } from 'lucide-react';
import QRCode from 'qrcode';
import { useI18n } from '../i18n';
import { LAYER } from "../ui/layers";

type Mode = 'local' | 'auditor' | 'participant';

interface ConnectionModalProps {
  appMode: Mode;
  /** Co-located phone-satellite session (local non-solo). Uses the auditor-host
   *  networking under the hood but relabels the window as "telefono-satellite". */
  satellite?: boolean;
  /** true quando `participantLink` è già stato riempito da sé (hash della URL rilevato al
   *  caricamento, v. `autoJoinDoneRef` in App.tsx — un telefono che ha scansionato il QR) e
   *  non da un incolla manuale. Senza questo, la guida "Incolla il link qui sotto" restava
   *  scritta anche quando il campo era già pieno e il PC non aveva incollato nulla — confuso,
   *  segnalato dal vivo: "il PC potrebbe essere indotto in errore". */
  linkAutoRilevato?: boolean;
  isConnected: boolean;
  peerId: string;
  connectionLink: string;
  tunnelLoading: boolean;
  participantLink: string;
  onSetParticipantLink: (v: string) => void;
  onCreateTunnel: () => Promise<void>;
  onConnect: () => void;
  onDisconnect: () => void;
  onClose: () => void;
}

export const ConnectionModal: React.FC<ConnectionModalProps> = ({
  appMode,
  satellite = false,
  linkAutoRilevato = false,
  isConnected,
  peerId,
  connectionLink,
  tunnelLoading,
  participantLink,
  onSetParticipantLink,
  onCreateTunnel,
  onConnect,
  onDisconnect,
  onClose,
}) => {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  // Phone-satellite: render the connection link as a QR code so the Preclear can
  // scan it with their phone camera and join instantly — no typing/copy-paste
  // across devices. Ideal for in-room ("same room") local auditing where the PC's
  // phone acts as a close-up mic + camera.
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  useEffect(() => {
    let cancelled = false;
    if (!connectionLink) { setQrDataUrl(''); return; }
    // CRITICAL: connectionLink is "tunnelHost#peerId:token:key" WITHOUT a scheme
    // (it's built scheme-less so it can be pasted into the paste-link field).
    // A QR must encode a real https:// URL, otherwise the phone camera treats it
    // as plain text / a search query and never OPENS the app → no auto-join, no
    // connection. Prefix https:// so scanning launches the page directly.
    const qrTarget = /^https?:\/\//.test(connectionLink) ? connectionLink : `https://${connectionLink}`;
    QRCode.toDataURL(qrTarget, { width: 240, margin: 1, errorCorrectionLevel: 'M' })
      .then(url => { if (!cancelled) setQrDataUrl(url); })
      .catch(() => { if (!cancelled) setQrDataUrl(''); });
    return () => { cancelled = true; };
  }, [connectionLink]);

  // FIX CONN-50: the copy button did nothing in the Electron build. The async
  // Clipboard API (`navigator.clipboard`) is often unavailable or blocked in
  // the Electron renderer, and the `?.` made the call silently no-op (no copy,
  // no feedback). We now try the async API first, then fall back to a hidden
  // <textarea> + execCommand('copy') which works reliably inside Electron.
  const handleCopy = async () => {
    if (!connectionLink) return;
    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(connectionLink);
        ok = true;
      }
    } catch (_) { ok = false; }
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = connectionLink;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, ta.value.length);
        ok = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch (_) { ok = false; }
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  };

  const isAuditor = appMode === 'auditor';

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: LAYER.connection,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* ── Card ── */}
      <div style={{
        width: '100%', maxWidth: 560,
        background: 'linear-gradient(170deg, rgba(40,40,46,0.7) 0%, rgba(26,26,30,0.85) 100%)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        border: `1px solid ${isAuditor ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.30)'}`,
        borderRadius: 20,
        boxShadow: isAuditor
          ? '0 0 70px rgba(255,255,255,0.14), 0 8px 40px rgba(0,0,0,0.6)'
          : '0 0 70px rgba(255,255,255,0.14), 0 8px 40px rgba(0,0,0,0.6)',
        overflow: 'hidden',
      }}>

        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '22px 28px',
          background: isAuditor
            ? 'linear-gradient(90deg, rgba(255,255,255,0.16) 0%, transparent 100%)'
            : 'linear-gradient(90deg, rgba(255,255,255,0.16) 0%, transparent 100%)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 46, height: 46, borderRadius: '50%', flexShrink: 0,
              background: isAuditor ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.14)',
              border: `1px solid ${isAuditor ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.45)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {isAuditor
                ? <Users size={20} style={{ color: 'rgba(240,246,255,0.95)' }} />
                : <Link2 size={20} style={{ color: 'rgba(240,246,255,0.95)' }} />}
            </div>
            <div>
              <div style={{
                fontSize: 17, fontWeight: 'bold', letterSpacing: '0.20em',
                textTransform: 'uppercase',
                color: isAuditor ? 'rgba(240,246,255,0.95)' : 'rgba(240,246,255,0.95)',
              }}>
                {satellite
                  ? '📱 ' + t('sat_title')
                  : t(isAuditor ? 'conn_auditor_title' : 'conn_preclear_title')}
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                {satellite
                  ? t('sat_subtitle')
                  : t(isAuditor ? 'conn_auditor_subtitle' : 'conn_preclear_subtitle')}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#475569', padding: 6, display: 'flex', borderRadius: 8,
          }}>
            <X size={20} />
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{ padding: '28px 28px 32px', display: 'flex', flexDirection: 'column', gap: 22 }}>

          {/* ═══════════════════ MODE AUDITOR ═══════════════════ */}
          {isAuditor && (
            <>
              {/* Lien internet — tunnel */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: 'rgba(255,255,255,0.18)',
                    border: '1px solid rgba(255,255,255,0.50)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 'bold', color: 'rgba(240,246,255,0.95)', flexShrink: 0,
                  }}>1</div>
                  <div style={{ fontSize: 14, fontWeight: 'bold', color: '#94a3b8', letterSpacing: '0.10em', textTransform: 'uppercase' }}>
                    <Globe size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
                    {t('conn_internet_step_title')}
                  </div>
                </div>

                {/* Si le lien est déjà généré */}
                {connectionLink ? (
                  <div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      {/* Lien — cliquable */}
                      <div
                        onClick={handleCopy}
                        title={t('tip_copy') as string}
                        style={{
                          flex: 1, padding: '16px 18px',
                          background: 'rgba(0,0,0,0.5)',
                          border: '1px solid rgba(255,255,255,0.35)',
                          borderRadius: 10, fontFamily: 'monospace',
                          fontSize: 14, color: '#e2e8f0',
                          wordBreak: 'break-all', lineHeight: 1.55,
                          cursor: 'pointer', userSelect: 'all',
                        }}>
                        {connectionLink}
                      </div>
                      {/* Bouton COPIER */}
                      <button
                        onClick={handleCopy}
                        style={{
                          padding: '0 20px', borderRadius: 10, cursor: 'pointer',
                          background: copied ? 'rgba(34,197,94,0.18)' : 'rgba(255,255,255,0.18)',
                          border: `1px solid ${copied ? 'rgba(34,197,94,0.55)' : 'rgba(255,255,255,0.55)'}`,
                          color: copied ? '#4ade80' : 'rgba(240,246,255,0.95)',
                          display: 'flex', flexDirection: 'column',
                          alignItems: 'center', justifyContent: 'center', gap: 5,
                          minWidth: 72, flexShrink: 0, transition: 'all 0.2s',
                        }}>
                        {copied ? <Check size={18} /> : <Copy size={18} />}
                        <span style={{ fontSize: 11, fontWeight: 'bold', letterSpacing: '0.06em' }}>
                          {t(copied ? 'conn_copied' : 'conn_copy')}
                        </span>
                      </button>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 12, color: '#475569' }}>
                      → {t('conn_internet_hint')}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 12, color: '#f59e0b' }}>
                      ⚠ Ce lien expire si l'application est fermée ou redémarrée.
                    </div>

                    {/* Phone-satellite QR — scan with the PC's phone to join instantly */}
                    {qrDataUrl && (
                      <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 16, padding: 14, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.25)' }}>
                        <img src={qrDataUrl} alt="QR" width={120} height={120}
                          style={{ borderRadius: 8, background: '#fff', padding: 6, flexShrink: 0 }} />
                        <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.5 }}>
                          <div style={{ fontWeight: 700, color: 'rgba(240,246,255,0.95)', marginBottom: 4 }}>📱 {t('sat_scan_title')}</div>
                          {t('sat_scan_desc')}
                          <div style={{ marginTop: 6, fontSize: 12, color: '#93c5fd', fontWeight: 600 }}>{t('sat_scan_steps')}</div>
                          <div style={{ marginTop: 4, fontSize: 11, color: '#64748b' }}>{t('sat_scan_hint')}</div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Bouton pour générer le lien */
                  <div>
                    <button
                      disabled={tunnelLoading || !peerId}
                      onClick={onCreateTunnel}
                      style={{
                        width: '100%', padding: '16px', borderRadius: 10,
                        border: `1px solid ${(tunnelLoading || !peerId) ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.50)'}`,
                        background: (tunnelLoading || !peerId) ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.16)',
                        color: (tunnelLoading || !peerId) ? '#475569' : 'rgba(240,246,255,0.95)',
                        fontSize: 14, fontWeight: 'bold', letterSpacing: '0.08em',
                        cursor: (tunnelLoading || !peerId) ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                        transition: 'all 0.2s',
                      }}>
                      <Globe size={16} />
                      {tunnelLoading
                        ? t('conn_internet_loading')
                        : (!peerId ? t('conn_generating') : t('conn_internet_btn'))}
                    </button>
                    <div style={{ marginTop: 8, fontSize: 12, color: '#475569' }}>
                      → {t('conn_internet_hint')}
                    </div>
                  </div>
                )}
              </div>

              {/* Séparateur */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }} />

              {/* Statut */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: isConnected ? 'rgba(34,197,94,0.18)' : 'rgba(251,191,36,0.18)',
                  border: `1px solid ${isConnected ? 'rgba(34,197,94,0.50)' : 'rgba(251,191,36,0.50)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 'bold',
                  color: isConnected ? '#4ade80' : '#fbbf24', flexShrink: 0,
                }}>2</div>
                <div style={{ fontSize: 14, fontWeight: 'bold', color: '#94a3b8', letterSpacing: '0.10em', textTransform: 'uppercase' }}>
                  {isConnected ? t('conn_preclear_connected_status') : t('conn_waiting_preclear')}
                </div>
              </div>

              <div style={{
                padding: '18px 20px', borderRadius: 12,
                background: isConnected ? 'rgba(34,197,94,0.10)' : 'rgba(251,191,36,0.07)',
                border: `1.5px solid ${isConnected ? 'rgba(34,197,94,0.40)' : 'rgba(251,191,36,0.25)'}`,
                display: 'flex', alignItems: 'center', gap: 14,
              }}>
                <div style={{
                  width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                  background: isConnected ? '#4ade80' : '#fbbf24',
                  boxShadow: `0 0 12px ${isConnected ? '#4ade80' : '#fbbf24'}`,
                  animation: isConnected ? 'none' : 'pulse 1.5s infinite',
                }} />
                <div>
                  <div style={{ fontSize: 15, fontWeight: 'bold', color: isConnected ? '#4ade80' : '#fbbf24' }}>
                    {isConnected ? t('conn_preclear_connected_status') : t('conn_waiting_preclear')}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                    {isConnected ? t('conn_connected_detail') : t('conn_waiting_detail')}
                  </div>
                </div>
              </div>

              {isConnected && (
                <button onClick={onClose} style={{
                  width: '100%', padding: '16px',
                  borderRadius: 10,
                  background: 'rgba(34,197,94,0.18)',
                  border: '1px solid rgba(34,197,94,0.45)',
                  color: '#4ade80', fontSize: 15, fontWeight: 'bold',
                  letterSpacing: '0.10em', cursor: 'pointer',
                }}>
                  ✓  {t('conn_close_start')}
                </button>
              )}
            </>
          )}

          {/* ═══════════════════ MODE PRECLEAR ═══════════════════ */}
          {!isAuditor && (
            <>
              {!isConnected ? (
                <>
                  {/* Guide — DUE testi diversi: chi ha incollato il link a mano ha bisogno dei
                      passi (deve sapere cosa fare); chi l'ha già ricevuto da un QR scansionato
                      (`linkAutoRilevato`) l'ha già FATTO, quei passi sarebbero una domanda a cui
                      si è già risposto, e "incolla il link" apparirebbe falso — il campo sotto è
                      già pieno. */}
                  {linkAutoRilevato ? (
                    <div style={{
                      padding: '16px 20px',
                      background: 'rgba(34,197,94,0.10)',
                      border: '1px solid rgba(34,197,94,0.35)',
                      borderRadius: 12,
                    }}>
                      <div style={{ fontSize: 14, color: '#4ade80', fontWeight: 'bold', marginBottom: 6 }}>
                        📱 {t('conn_qr_detected_title')}
                      </div>
                      <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6 }}>
                        {t('conn_qr_detected_desc')}
                      </div>
                    </div>
                  ) : (
                    <div style={{
                      padding: '16px 20px',
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.25)',
                      borderRadius: 12,
                    }}>
                      <div style={{ fontSize: 14, color: 'rgba(240,246,255,0.95)', fontWeight: 'bold', marginBottom: 10 }}>
                        {t('conn_how_title')}
                      </div>
                      <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#94a3b8', lineHeight: 2.0 }}>
                        <li>{t('conn_how_step1')}</li>
                        <li>{t('conn_how_step2')}</li>
                        <li><strong style={{ color: '#e2e8f0' }}>{t('conn_how_step3')}</strong></li>
                      </ol>
                    </div>
                  )}

                  {/* Champ de saisie */}
                  <div>
                    <div style={{
                      fontSize: 12, color: '#94a3b8',
                      letterSpacing: '0.14em', textTransform: 'uppercase',
                      marginBottom: 10, fontWeight: 'bold',
                    }}>
                      🔗  {t('conn_link_label')}
                    </div>
                    {/* FIX CONN-9: mobile Chrome paste sometimes doesn't fire
                        `onChange` reliably on a controlled input — the user
                        sees the text in the field but React state stays empty
                        and the Connect button never enables. We add:
                          • `onPaste`  — reads clipboardData directly
                          • `onInput`  — catches the change even when onChange
                                        misses (HTMLInputElement specific)
                          • inputMode=url — better mobile keyboard
                          • spellCheck=false — prevents autocorrect from messing
                                              with the hex tokens */}
                    <input
                      type="text"
                      value={participantLink}
                      onChange={e => onSetParticipantLink(e.target.value)}
                      onInput={e => onSetParticipantLink((e.target as HTMLInputElement).value)}
                      onPaste={e => {
                        const pasted = e.clipboardData?.getData('text');
                        if (pasted) {
                          e.preventDefault();
                          onSetParticipantLink(pasted.trim());
                        }
                      }}
                      placeholder={t('conn_link_placeholder') as string}
                      autoFocus
                      inputMode="url"
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                      style={{
                        width: '100%', padding: '16px 18px', boxSizing: 'border-box',
                        background: 'rgba(0,0,0,0.50)',
                        border: '1px solid rgba(255,255,255,0.45)',
                        borderRadius: 10, color: '#e2e8f0',
                        fontSize: 14, fontFamily: 'monospace',
                        outline: 'none', transition: 'border-color 0.2s',
                      }}
                      onFocus={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.85)'; }}
                      onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.45)'; }}
                      onKeyDown={e => { if (e.key === 'Enter' && participantLink.trim()) onConnect(); }}
                    />
                    {/* Helper buttons: paste-from-clipboard + clear. The
                        paste button uses navigator.clipboard.readText() which
                        on Android Chrome works without user gesture inside an
                        already-tapped onClick context — useful when the
                        regular paste fails or the keyboard hides the input. */}
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button
                        type="button"
                        onClick={async () => {
                          // CONN-76: try the web Clipboard API, then fall back to
                          // Electron's native clipboard (the web API is blocked in
                          // the Electron renderer, so paste did nothing there).
                          let txt = '';
                          try { txt = await navigator.clipboard.readText(); } catch (_) { /* blocked */ }
                          if (!txt) {
                            try { txt = await (window as any).electronAPI?.readClipboard?.() || ''; } catch (_) {}
                          }
                          if (txt) onSetParticipantLink(txt.trim());
                        }}
                        style={{
                          flex: 1, padding: '8px 12px', borderRadius: 8,
                          background: 'rgba(255,255,255,0.10)',
                          border: '1px solid rgba(255,255,255,0.35)',
                          color: 'rgba(240,246,255,0.95)', fontSize: 12, fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        📋 Paste from clipboard
                      </button>
                      {participantLink && (
                        <button
                          type="button"
                          onClick={() => onSetParticipantLink('')}
                          style={{
                            padding: '8px 14px', borderRadius: 8,
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.12)',
                            color: '#94a3b8', fontSize: 12, cursor: 'pointer',
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Bouton CONNECTER */}
                  <button
                    disabled={!participantLink.trim() || tunnelLoading}
                    onClick={onConnect}
                    style={{
                      width: '100%', padding: '18px',
                      borderRadius: 10,
                      background: (!participantLink.trim() || tunnelLoading)
                        ? 'rgba(100,116,139,0.12)'
                        : 'linear-gradient(135deg, rgba(255,255,255,0.38) 0%, rgba(255,255,255,0.38) 100%)',
                      border: `1.5px solid ${(!participantLink.trim() || tunnelLoading)
                        ? 'rgba(255,255,255,0.08)'
                        : 'rgba(255,255,255,0.55)'}`,
                      color: (!participantLink.trim() || tunnelLoading) ? '#475569' : '#e2e8f0',
                      fontSize: 16, fontWeight: 'bold', letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      cursor: (!participantLink.trim() || tunnelLoading) ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s',
                    }}>
                    {tunnelLoading ? t('conn_connecting') : `📡  ${t('conn_connect_btn')}`}
                  </button>
                </>
              ) : (
                /* ── Preclear connecté ── */
                <div style={{ textAlign: 'center', padding: '14px 0' }}>
                  <div style={{ fontSize: 56, marginBottom: 14 }}>✅</div>
                  <div style={{ fontSize: 20, fontWeight: 'bold', color: '#4ade80', marginBottom: 10 }}>
                    {t('conn_preclear_ok_title')}
                  </div>
                  <div style={{ fontSize: 14, color: '#64748b', marginBottom: 28 }}>
                    {t('conn_preclear_ok_detail')}
                  </div>
                  <button onClick={onClose} style={{
                    padding: '16px 40px', borderRadius: 10,
                    background: 'rgba(34,197,94,0.18)',
                    border: '1px solid rgba(34,197,94,0.45)',
                    color: '#4ade80', fontSize: 15, fontWeight: 'bold',
                    letterSpacing: '0.10em', cursor: 'pointer', marginBottom: 16,
                  }}>
                    ✓  {t('conn_go_session')}
                  </button>
                  <div>
                    <button onClick={onDisconnect} style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: 12, color: '#475569', textDecoration: 'underline',
                    }}>
                      {t('conn_disconnect')}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
