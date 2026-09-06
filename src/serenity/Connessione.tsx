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
 * ⚠️ IL PRECLEAR NON APRE SERENITY — anche se, quando gira Serenity.app, `server-core.cjs`
 * serve `serenity.html` alla radice del tunnel (non più sempre `index.html`: v. il giro che
 * l'ha reso così, « fai in modo che 127.0.0.1:7893 sia SERENITY »). Chi tiene fede a questa
 * frase È `src/serenity/main.tsx`: riconosce un link d'invito nel proprio frammento e rimanda
 * subito a `index.html` PRIMA di montare qualunque interfaccia — così il preclear ritrova
 * comunque lo stesso `ParticipantView` già collaudato, senza che questa fase ne costruisca
 * un secondo. (Bug reale, corretto dopo un test dal vivo: senza quel rimando, il telefono
 * mostrava la prima domanda di SERENITY, « Chi audisce? », invece della seduta in corso.)
 *
 * @see docs/serenity-refonte.md — fase 7.
 */

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useI18n } from '../i18n';
import type { useRemoteSession } from '../hooks/useRemoteSession';

// ⚠️ Niente `boxShadow` qui — segnalato nell'audit funzionale: « i bottoni non ancora
// vetrati di Connessione ». Uno stile inline vince sempre su una classe CSS per la stessa
// proprietà: un `boxShadow` qui cancellerebbe in silenzio quello di `.s-glass-btn` (lo
// stesso bug già trovato e corretto altrove in questo file all'inizio della refonte).
const bottone = (pieno: boolean): React.CSSProperties => ({
  cursor: 'pointer',
  background: pieno ? 'var(--s-disc)' : 'var(--s-disc-sunk)',
  color: 'var(--s-ink)',
  borderRadius: 999, padding: '10px 24px',
  fontSize: 'var(--s-fs-base)', letterSpacing: '0.08em', textTransform: 'uppercase',
  fontFamily: 'var(--s-sans)',
});

export function Connessione({ remote, onAnnulla, onPronti, satellite = false }: {
  remote: ReturnType<typeof useRemoteSession>;
  onAnnulla: () => void;
  onPronti: () => void;
  /** true quando questa schermata si apre per "collega il telefono del PC" — una seduta LOCALE
   *  a cui si aggiunge solo una camera/microfono d'appoggio, non una vera seduta a distanza. Va
   *  al link generato (v. `useRemoteSession.avvia`) come marcatore `:sat`, lo stesso che
   *  `App.tsx` scrive per il caso equivalente in EQUILIBRIUM — senza, il telefono che si unisce
   *  verrebbe trattato come un preclear remoto vero e proprio. */
  satellite?: boolean;
}) {
  const { t } = useI18n();
  const [copiato, setCopiato] = useState(false);
  const [qr, setQr] = useState('');

  // Comincia da sé al montaggio — l'auditor non deve toccare nulla per vedere il link.
  // ⚠️ Guardia su `peerId`, non su un ref "già fatto": se `avvia()` ha già un peer in piedi
  // (es. tornando qui dopo un tunnel fallito) rigenera solo il link, non tutto da capo — è
  // `avvia()` stessa a saperlo, qui basta chiamarla.
  useEffect(() => {
    if (!remote.peerId) remote.avvia(satellite);
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
          margin: 0, fontFamily: 'var(--s-serif)', fontWeight: 400, fontSize: 'var(--s-fs-hero)',
          letterSpacing: '-0.01em', color: 'var(--s-ink)',
        }}>
          {t('conn_auditor_title')}
        </h1>
        <p style={{ margin: '-10px 0 0', fontSize: 'var(--s-fs-base)', color: 'var(--s-ink-soft)', lineHeight: 1.6 }}>
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
              className="s-glass"
              onClick={copia}
              title={t('tip_copy') as string}
              style={{
                cursor: 'pointer', padding: '12px 16px', borderRadius: 10,
                background: 'var(--s-disc)',
                fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-base)', color: 'var(--s-ink-soft)',
                wordBreak: 'break-all', userSelect: 'all', maxWidth: 420,
              }}>
              {remote.connectionLink}
            </div>
            <button className="s-glass s-glass-btn" onClick={copia} style={bottone(false)}>
              {t(copiato ? 'conn_copied' : 'conn_copy')}
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', justifyItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 'var(--s-fs-base)', color: remote.errore ? 'var(--s-reserve)' : 'var(--s-ink-faint)' }}>
              {remote.errore ? `⚠ ${remote.errore}` : t(remote.tunnelLoading ? 'conn_internet_loading' : 'conn_generating')}
            </span>
            {remote.errore && (
              <button className="s-glass s-glass-btn" onClick={() => remote.avvia(satellite)} style={bottone(false)}>
                {t('conn_internet_btn')}
              </button>
            )}
          </div>
        )}

        {/* ⚠️ INGRANDITO — segnalato dal vivo: « quando il PC chiude, IN ATTESA DEL PRECLEAR è
            troppo piccolo, mettilo in grande, magari che pulsa ». Era alla taglia del testo
            normale (`--s-fs-base`, 15px) — la stessa indicazione che l'auditor deve notare
            SUBITO, anche da lontano dallo schermo, restava un dettaglio fra tanti. `--s-fs-xl`
            (21px, la stessa del nome SERENITY) e `.ser-pulse` (già scritta per lo stesso scopo
            altrove — « il ciclo sta ASPETTANDO una risposta, deve farsi notare ») SOLO mentre
            si aspetta: una volta connesso, l'attesa è finita, non deve più pulsare. */}
        <div className={remote.isConnected ? undefined : 'ser-pulse'} style={{
          display: 'flex', alignItems: 'center', gap: 12, fontSize: 'var(--s-fs-xl)', fontWeight: 700,
          color: remote.isConnected ? 'var(--s-still)' : 'var(--s-reserve)',
        }}>
          <span style={{
            width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
            background: remote.isConnected ? 'var(--s-still)' : 'var(--s-reserve)',
          }} />
          {t(remote.isConnected ? 'conn_preclear_connected_status' : 'conn_waiting_preclear')}
        </div>

        <div style={{ display: 'flex', gap: 22, alignItems: 'center' }}>
          <button className="s-glass s-glass-btn" onClick={onAnnulla} style={{
            cursor: 'pointer', borderRadius: 999, padding: '6px 14px', background: 'var(--s-disc)',
            fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', color: 'var(--s-ink-faint)',
          }}>
            ← {t('ser_back')}
          </button>
          {remote.isConnected && (
            <button className="s-glass s-glass-btn" onClick={onPronti} style={bottone(true)}>
              {t('conn_go_session')}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
