import { Headphones, Gauge, MessageSquare, Battery, Activity } from 'lucide-react';
import { TOKEN } from '../ui/tokens';
import { INTEGRITA_SOGLIA } from '../engine/tuning';
import type { MuseConnectionState } from '../hooks/useMuseConnection';
import type { ThetaStatus } from '../lib/thetaMeterHid';

/** Ambra dell'ago e dei valori delle LATTINE — deve restare identico a QuantumSphere,
 *  altrimenti l'ago sul quadrante e il numero a lato non si riconoscono come la stessa cosa. */
const THETA_AMBER = '#f59e0b';

/**
 * InstrumentBadges — i tre badge « con che cosa si audita », nella barra in alto.
 *
 * ── PERCHÉ ESISTE ────────────────────────────────────────────────────────────────────────────
 * Secondo pezzo della frammentazione di `App.tsx` (v. la nota in cima a `InstrumentHintPanel.
 * tsx` per il perché). I tre badge — MUSE, boîtes (Theta-Meter), « senza strumenti » — sono
 * SEMPRE mostrati insieme, nello stesso posto, con lo stesso schema visivo (cerchio + etichetta
 * su `TOKEN.wellBg`): un solo componente, non tre, perché è così che si leggono a schermo.
 *
 * Presentazionale: nessuno stato proprio. Ogni valore che cambia (connessione, batteria,
 * qualità del segnale…) resta in `App.tsx`, passato come prop; ogni clic richiama UNA funzione
 * passata da fuori — l'azione vera (che sa aprire/chiudere/annullare una connessione Bluetooth
 * o USB) resta dov'era.
 */
export function InstrumentBadges({
  appMode, satelliteMode, t,
  museConnection, museContact, museEverConnected, batteryLevel, smoothPct, onToggleMuse,
  thetaUnavailable, thetaStatus, onToggleTheta,
  senzaMisura, senzaStrumenti, sessionRunning, onToggleSenzaStrumenti,
}: {
  appMode: string;
  satelliteMode: boolean;
  t: (key: string) => string;
  // ── MUSE ──
  museConnection: MuseConnectionState;
  museContact: boolean;
  museEverConnected: boolean;
  batteryLevel: number | null;
  /** Qualità del segnale biometrico (0-100) — v. `integrityTracker`. */
  smoothPct: number;
  onToggleMuse: () => void;
  // ── THETA-METER ──
  thetaUnavailable: boolean;
  thetaStatus: ThetaStatus;
  onToggleTheta: () => void;
  // ── SENZA STRUMENTI ──
  senzaMisura: boolean;
  senzaStrumenti: boolean;
  sessionRunning: boolean;
  onToggleSenzaStrumenti: () => void;
}) {
  return (
    <>
      {/* FIX CONN-58: local-mode MUSE badge. In a local (single-machine)
          session there is no P2P badge, so the auditor had no top-bar cue
          that the headset was paired (only the HEALTH panel showed it). Mirror
          the remote "MUSE ✓" indicator here for consistency. */}
      {/* MUSE badge: plain local = the Mac's own headset. In satellite the
          headset is the PC's (paired to the Mac) — show it only once the PC
          (phone) is connected, otherwise it's confusing before the session. */}
      {((appMode === 'local' && !satelliteMode) || satelliteMode) && (
        <div
          // COMMUTA, come quello del METER: collega se staccato, SCOLLEGA se collegato,
          // annulla se sta cercando. Prima collegava soltanto, quindi un clic per sbaglio
          // non si poteva disfare. (`handleConnectMuse` sa già gestire i tre stati.)
          onClick={onToggleMuse}
          title={museConnection === 'connected'
                 ? (museContact ? t('muse_tip_disconnect') : t('muse_tip_not_worn'))
               : museConnection === 'searching' ? t('muse_tip_searching')
               : t('muse_tip_connect')}
          style={{
          display: 'flex', alignItems: 'center', gap: 9,
          padding: '3px 14px 3px 3px', borderRadius: 999,
          cursor: 'pointer',
          // MINI TOGGLE monochrome : piste en creux + pouce en verre (cuffie), texte actuel.
          background: TOKEN.wellBg,
          boxShadow: TOKEN.wellShadow }}>
          {/* ── PARLA L'ANOMALIA, NON LA NORMALITÀ ───────────────────────────────────
              La distinzione resta necessaria: un casco appaiato ma posato sul tavolo non
              fa contatto, non produce carica, e l'ago non reagisce — sapere se è INDOSSATO
              è tutt'altra cosa che sapere se è collegato.

              Ma era il caso BUONO a essere colorato (verde = indossato), e il caso da
              correggere restava bianco: al contrario di R4, e con un terzo verde in più
              a schermo. Adesso indossato = chiaro monocromo, NON indossato = ambra, come
              ogni altro avviso dell'app. Il verde torna libero. */}
          <span style={{
            width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            background: museConnection !== 'connected' ? 'rgba(255,255,255,0.10)'
              : museContact ? 'rgba(240,246,255,0.94)' : TOKEN.warn,
            border: '1px solid rgba(255,255,255,0.3)',
            boxShadow: '0 4px 10px rgba(0,0,0,0.45), inset 0 2px 4px rgba(255,255,255,0.55)',
            animation: museConnection !== 'connected' ? 'pulse 1.5s infinite' : 'none' }}>
            <Headphones size={16} strokeWidth={1.8}
              style={{ color: museConnection === 'connected' ? '#1a1a1a' : '#ffffff' }} />
          </span>
          <span style={{
            fontSize: 13, fontWeight: 'bold', letterSpacing: '0.08em',
            color: TOKEN.ink, whiteSpace: 'nowrap' }}>
            {museConnection === 'connected' ? (museContact ? 'MUSE ✓' : `MUSE · ${t('muse_not_worn')}`)
              : museConnection === 'searching' ? `${t('searching') || 'Recherche'}…`
              : museEverConnected ? `⚠ ${t('muse_reconnect')}` : t('muse_connect')}
          </span>
          {/* ── DUE PERCENTUALI AFFIANCATE VOGLIONO DUE ICONE ──────────────────────────
              « 87% 62% » di fila non dice quale sia quale: due numeri della stessa forma,
              nello stesso corpo, a due centimetri l'uno dall'altro. La pila è la CARICA
              del casco, l'onda è la QUALITÀ di quel che manda — cose senza rapporto fra
              loro, e senza icona l'auditor deve ricordarsi l'ordine. */}
          {museConnection === 'connected' && batteryLevel !== null && (
            <span title={t('muse_battery_tip')}
              style={{
                display: 'flex', alignItems: 'center', gap: 3,
                fontSize: 13, fontWeight: 'bold', fontVariantNumeric: 'tabular-nums',
                color: TOKEN.ink, opacity: 0.62 }}>
              <Battery size={15} strokeWidth={1.9} />
              {batteryLevel.toFixed(0)}%
            </span>
          )}
          {/* ── L'INTEGRITÀ STA SUL CASCO, NON IN UN PANNELLO A PARTE ──────────────────
              « Il MUSE mi sta dando dati buoni? » è UNA domanda, e si leggeva in due
              posti opposti dello schermo: il badge qui in alto per lo stato, il pannello
              in basso a destra per la qualità. Ma la qualità è LA QUALITÀ DI QUESTO
              CASCO: appartiene allo stesso oggetto, e va detta qui.

              NON è verde. Il verde qui accanto vuol già dire « indossato », e nel resto
              dell'app « traguardo raggiunto »: un terzo verde non aggiungerebbe un
              significato, ne toglierebbe uno. Inchiostro normale finché il dato è
              utilizzabile, AMBRA sotto la soglia — tace quando va bene, parla quando no.

              La barra (l'andamento) non sparisce: resta nel pannello, che diventa roba
              da modo ESPERTO. Chi conduce guarda il numero; chi tara guarda la curva. */}
          {museConnection === 'connected' && (
            <span title={t('biometric_integrity')}
              style={{
                display: 'flex', alignItems: 'center', gap: 3,
                fontSize: 13, fontWeight: 'bold', fontVariantNumeric: 'tabular-nums',
                color: smoothPct < INTEGRITA_SOGLIA ? TOKEN.warn : TOKEN.ink,
                opacity: smoothPct < INTEGRITA_SOGLIA ? 1 : 0.62 }}>
              <Activity size={15} strokeWidth={1.9} />
              {Math.round(smoothPct)}%
            </span>
          )}
        </div>
      )}
      {/* ── BADGE THETA-METER, accanto a quello del MUSE ─────────────────────────────
          Gli strumenti da collegare stanno TUTTI qui, in un unico posto: prima il meter
          si collegava da sotto il TONE ARM, cioè da tutt'altra parte. Ciò che riguarda le
          boîtes compare solo quando il meter è collegato — e altrettanto per il MUSE. */}
      {/* SATELLITE: il preclear è nella STESSA stanza, il telefono fa solo camera/micro —
          le lattine sono nelle sue mani e il meter va collegato qui come in locale. Prima
          la condizione era il solo `appMode === 'local'`, e siccome il satellite gira sul
          ruolo 'auditor' il badge spariva: non c'era ALCUN modo di collegare il meter in
          una seduta satellite. A distanza vera resta nascosto (vedi `instruments`). */}
      {!thetaUnavailable && (appMode === 'local' || satelliteMode) && (
        <div
          // Il badge COMMUTA: collega se staccato, SCOLLEGA se collegato. Prima collegava
          // soltanto, quindi un clic per sbaglio era senza ritorno.
          onClick={onToggleTheta}
          title={thetaStatus === 'connected' ? t('theta_tip_disconnect')
               : thetaStatus === 'connecting' ? t('theta_tip_searching')
               : t('theta_tip_connect')}
          style={{
            display: 'flex', alignItems: 'center', gap: 9,
            padding: '3px 14px 3px 3px', borderRadius: 999,
            cursor: thetaStatus === 'connecting' ? 'default' : 'pointer',
            background: TOKEN.wellBg,
            boxShadow: TOKEN.wellShadow }}>
          <span style={{
            width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center',
            justifyContent: 'center', flexShrink: 0,
            background: thetaStatus === 'connected' ? THETA_AMBER : 'rgba(255,255,255,0.10)',
            border: '1px solid rgba(255,255,255,0.3)',
            boxShadow: '0 4px 10px rgba(0,0,0,0.45), inset 0 2px 4px rgba(255,255,255,0.55)' }}>
            <Gauge size={16} strokeWidth={1.8}
              style={{ color: thetaStatus === 'connected' ? '#1a1a1a' : '#ffffff' }} />
          </span>
          <span style={{
            fontSize: 13, fontWeight: 'bold', letterSpacing: '0.08em',
            color: TOKEN.ink, whiteSpace: 'nowrap' }}>
            {thetaStatus === 'connected' ? `${t('theta_cans')} ✓`
              : thetaStatus === 'connecting' ? `${t('searching')}…`
              : t('theta_connect')}
          </span>
        </div>
      )}

      {/* ── « SENZA STRUMENTI », TERZO BADGE ACCANTO AI DUE STRUMENTI ───────────────────
          Stava scritto in giallo al centro, ripetuto per tutta la seduta — stancava la
          vista. Il posto giusto è QUI, accanto a MUSE e alle boîtes: è la stessa scelta,
          CON CHE COSA si audita. Visibile SEMPRE quando la seduta è locale, come gli altri
          due — anche prima di cominciare (richiesta utente):
            • prima dello START → clic = avvia la seduta senza strumenti;
            • a seduta avviata senza strumenti → resta acceso, non cliccabile;
            • se un ago è collegato, non ha senso → sparisce (lo dice `senzaMisura`). */}
      {(appMode === 'local' || satelliteMode) && senzaMisura && (() => {
        // Si COMMUTA come i badge degli strumenti: cliccato = si sceglie « senza strumenti »
        // (verde), ri-cliccato = si deseleziona. NON avvia da sé — la seduta parte da START,
        // come quando si collega un ago. A seduta avviata resta acceso e non commuta.
        const attivo = senzaStrumenti;
        // Commuta ogni volta che la seduta NON è in corso: da fermi e a seduta finita.
        // Con `=== 'idle'` restava bloccato dopo FIN, che è proprio quando si vuole
        // cambiare per la seduta dopo (segnalato).
        const commutabile = !sessionRunning;
        return (
        <div
          onClick={commutabile ? onToggleSenzaStrumenti : undefined}
          title={t('no_instruments_hint')}
          style={{
            display: 'flex', alignItems: 'center', gap: 9,
            padding: '3px 14px 3px 3px', borderRadius: 999,
            cursor: commutabile ? 'pointer' : 'default',
            opacity: attivo || commutabile ? 1 : 0.5,
            background: TOKEN.wellBg, boxShadow: TOKEN.wellShadow }}>
          <span style={{
            width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center',
            justifyContent: 'center', flexShrink: 0,
            background: attivo ? '#34d399' : 'rgba(255,255,255,0.10)',
            border: '1px solid rgba(255,255,255,0.3)',
            boxShadow: '0 4px 10px rgba(0,0,0,0.45), inset 0 2px 4px rgba(255,255,255,0.55)' }}>
            <MessageSquare size={16} strokeWidth={1.8} style={{ color: attivo ? '#0b0f14' : '#ffffff' }} />
          </span>
          <span style={{
            fontSize: 13, fontWeight: 'bold', letterSpacing: '0.08em',
            color: TOKEN.ink, whiteSpace: 'nowrap' }}>
            {t('no_instruments_mode')}
          </span>
        </div>
        );
      })()}
    </>
  );
}
