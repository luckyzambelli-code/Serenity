/**
 * LA CONNESSIONE A DISTANZA — fase 7.
 *
 * ── PERCHÉ QUI, E NON UNA FINESTRA SOPRA TUTTO ─────────────────────────────────────────────
 * `ConnectionModal` di EQUILIBRIUM è un vetro scuro che si apre SOPRA la seduta — coerente con
 * un'interfaccia che tiene tutto a schermo insieme. SERENITY non impila pannelli: finché non
 * ci si è uniti non c'è ancora seduta da coprire, quindi questa È la schermata, non una sopra
 * un'altra. Si passa dalle quattro domande dell'avvio a questa esattamente allo stesso modo —
 * un gesto, un cambio di schermata intera.
 *
 * ── IL MOTORE È QUELLO DI SEMPRE, QUI C'È SOLO IL DISEGNO ──────────────────────────────────
 * Tutta la logica — link, tunnel, WebRTC, riconnessione del preclear — resta in
 * `lib/networkManager` e in `hooks/useRemoteSession`. Questo file legge `remote`, non decide
 * nulla: nessuna soglia, nessun protocollo, nessuna decisione di rete.
 *
 * ⚠️ IL PRECLEAR NON APRE SERENITY. Il link porta sempre alla pagina web di EQUILIBRIUM —
 * `server-core.cjs` serve `index.html` per qualunque richiesta arrivi dal tunnel, qualunque
 * applicazione desktop l'auditor abbia aperto. Il preclear ritrova quindi lo stesso
 * `ParticipantView` già collaudato: questa fase non ne costruisce un secondo.
 *
 * @see docs/serenity-refonte.md — fase 7.
 */

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useI18n } from '../i18n';
import type { useRemoteSession } from '../hooks/useRemoteSession';

const bottone = (pieno: boolean): React.CSSProperties => ({
  border: 'none', cursor: 'pointer',
  background: pieno ? 'var(--s-disc)' : 'var(--s-disc-sunk)',
  color: 'var(--s-ink)', boxShadow: 'var(--s-shadow)',
  borderRadius: 999, padding: '10px 24px',
  fontSize: 12.5, letterSpacing: '0.08em', textTransform: 'uppercase',
  fontFamily: 'var(--s-sans)',
});

export function Connessione({ remote, onAnnulla, onPronti }: {
  remote: ReturnType<typeof useRemoteSession>;
  onAnnulla: () => void;
  onPronti: () => void;
}) {
  const { t } = useI18n();
  const [copiato, setCopiato] = useState(false);
  const [qr, setQr] = useState('');

  // Comincia da sé al montaggio — l'auditor non deve toccare nulla per vedere il link.
  // ⚠️ Guardia su `peerId`, non su un ref "già fatto": se `avvia()` ha già un peer in piedi
  // (es. tornando qui dopo un tunnel fallito) rigenera solo il link, non tutto da capo — è
  // `avvia()` stessa a saperlo, qui basta chiamarla.
  useEffect(() => {
    if (!remote.peerId) remote.avvia();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Il QR — comodo quanto quello di EQUILIBRIUM: il link scritto è lungo e pieno di segni,
  // leggerlo a voce per farlo scrivere al preclear è un modo sicuro di sbagliarlo.
  useEffect(() => {
    let annullato = false;
    if (!remote.connectionLink) { setQr(''); return; }
    const bersaglio = /^https?:\/\//.test(remote.connectionLink)
      ? remote.connectionLink : `https://${remote.connectionLink}`;
    QRCode.toDataURL(bersaglio, { width: 220, margin: 1, errorCorrectionLevel: 'M' })
      .then(u => { if (!annullato) setQr(u); })
      .catch(() => { if (!annullato) setQr(''); });
    return () => { annullato = true; };
  }, [remote.connectionLink]);

  const copia = async () => {
    if (!remote.connectionLink) return;
    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(remote.connectionLink);
        ok = true;
      }
    } catch { /* proviamo il fallback sotto */ }
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = remote.connectionLink;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch { /* nessun clipboard disponibile — il link resta comunque selezionabile */ }
    }
    if (ok) { setCopiato(true); setTimeout(() => setCopiato(false), 2200); }
  };

  return (
    <section style={{ height: '100%', display: 'grid', placeItems: 'center', padding: '38px 44px' }}>
      <div style={{ display: 'grid', justifyItems: 'center', gap: 24, maxWidth: 460, textAlign: 'center' }}>
        <h1 style={{
          margin: 0, fontFamily: 'var(--s-serif)', fontWeight: 400, fontSize: 27,
          letterSpacing: '-0.01em', color: 'var(--s-ink)',
        }}>
          {t('conn_auditor_title')}
        </h1>
        <p style={{ margin: '-10px 0 0', fontSize: 13, color: 'var(--s-ink-soft)', lineHeight: 1.6 }}>
          {t('conn_auditor_subtitle')}
        </p>

        {remote.connectionLink ? (
          <div style={{ display: 'grid', justifyItems: 'center', gap: 14 }}>
            {qr && (
              <img src={qr} alt="" width={172} height={172} style={{
                borderRadius: 12, background: '#fff', padding: 10, boxShadow: 'var(--s-shadow)',
              }} />
            )}
            <div
              onClick={copia}
              title={t('tip_copy') as string}
              style={{
                cursor: 'pointer', padding: '12px 16px', borderRadius: 10,
                background: 'var(--s-disc)', boxShadow: 'var(--s-shadow)',
                fontFamily: 'var(--s-mono)', fontSize: 12.5, color: 'var(--s-ink-soft)',
                wordBreak: 'break-all', userSelect: 'all', maxWidth: 420,
              }}>
              {remote.connectionLink}
            </div>
            <button onClick={copia} style={bottone(false)}>
              {t(copiato ? 'conn_copied' : 'conn_copy')}
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', justifyItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, color: remote.errore ? 'var(--s-reserve)' : 'var(--s-ink-faint)' }}>
              {remote.errore ? `⚠ ${remote.errore}` : t(remote.tunnelLoading ? 'conn_internet_loading' : 'conn_generating')}
            </span>
            {remote.errore && (
              <button onClick={() => remote.avvia()} style={bottone(false)}>
                {t('conn_internet_btn')}
              </button>
            )}
          </div>
        )}

        <div style={{
          display: 'flex', alignItems: 'center', gap: 9, fontSize: 13,
          color: remote.isConnected ? 'var(--s-still)' : 'var(--s-ink-faint)',
        }}>
          <span style={{
            width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
            background: remote.isConnected ? 'var(--s-still)' : 'var(--s-reserve)',
          }} />
          {t(remote.isConnected ? 'conn_preclear_connected_status' : 'conn_waiting_preclear')}
        </div>

        <div style={{ display: 'flex', gap: 22, alignItems: 'center' }}>
          <button onClick={onAnnulla} style={{
            border: 'none', background: 'none', cursor: 'pointer',
            fontFamily: 'var(--s-sans)', fontSize: 12.5, color: 'var(--s-ink-faint)',
          }}>
            ← {t('ser_back')}
          </button>
          {remote.isConnected && (
            <button onClick={onPronti} style={bottone(true)}>
              {t('conn_go_session')}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
