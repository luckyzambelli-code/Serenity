/**
 * ZonaCamere — CAM 1 (auditor) + CAM 2 (PC/preclear), staccate da `Serenity.tsx`.
 *
 * ── PERCHÉ ESISTE ────────────────────────────────────────────────────────────────────────────
 * Segnalato nella revisione completa del codice: `Serenity.tsx` (7000+ righe, 89 `useState`, 51
 * `useEffect`) è un "componente Dio" — la stessa taglia di `App.tsx`, ereditata da lì, non
 * inventata qui. Non si scompone in un colpo solo (rischio troppo alto su un file di quella
 * taglia, zero test propri): un dominio alla volta, il più isolato per primo. Questo — le due
 * `CameraCerchio` e la loro cornice — è il primo: riceve SOLO valori già calcolati da chi lo
 * monta (`statoCamPc`, `cam1Mostrata`/`cam2Mostrata`, i booleani della connessione remota), non
 * ricalcola nulla di suo — un'estrazione di JSX, non una riscrittura di logica. Il file
 * originale (v. `docs/serenity-refonte.md`) resta la fonte per capire OGNI segnalazione che ha
 * formato questo disegno — spostate qui perché appartengono a QUESTO pezzo, non lasciate
 * indietro.
 *
 * @see docs/serenity-refonte.md — giro di scomposizione, 2026-09-07.
 */
import { useI18n } from '../i18n';
import { CameraCerchio } from './CameraCerchio';

export interface ZonaCamereProps {
  /** Seduta aperta — le camere non hanno senso prima che lo sia. */
  aperta: boolean;
  cam1Mostrata: boolean;
  cam2Mostrata: boolean;
  /** `avvio.distanza` — vera seduta a distanza (non satellite/locale). */
  avvioDistanza: boolean;
  /** Un telefono "collega il telefono del PC" è connesso in una seduta LOCALE. */
  telefonoPcCollegato: boolean;
  remoteStream: MediaStream | null;
  remoteVideoFrame: string | null;
  remoteVideoFallbackActive: boolean;
  remoteIsConnected: boolean;
  /** CONFIG → Trasparenza. */
  uiAlpha: number;
  cam1Collassata: boolean;
  cam2Collassata: boolean;
  onToggleCam1: () => void;
  onToggleCam2: () => void;
  /** Già un testo pronto (batteria/stato Muse del preclear, o lo stato locale) — calcolato da
   *  chi monta questo componente, non ricalcolato qui: dipende da troppo altro (ep, tono,
   *  metricsStore) per appartenere a una zona che parla solo di camere. */
  statoCamPc: string;
}

export function ZonaCamere({
  aperta, cam1Mostrata, cam2Mostrata, avvioDistanza, telefonoPcCollegato,
  remoteStream, remoteVideoFrame, remoteVideoFallbackActive, remoteIsConnected,
  uiAlpha, cam1Collassata, cam2Collassata, onToggleCam1, onToggleCam2, statoCamPc,
}: ZonaCamereProps) {
  const { t } = useI18n();

  // ⚠️ BUG TROVATO — segnalato: « non trovo più la camm PC ». CAM 2 era ristretta a
  // `avvio.distanza || avvio.solo` — spariva del tutto nel caso più comune, una seduta LOCALE
  // con un preclear vero. App.tsx non ha QUESTA condizione: mostra CAM 2 ogni volta che
  // `moduleVis.cam2` è acceso, punto — la webcam locale generica quando non c'è un flusso
  // remoto (`CameraCerchio` chiama `getUserMedia` da sé), lo stream vero solo quando
  // `avvio.distanza` lo fornisce. La restrizione qui era un'invenzione, non una scelta di
  // EQUILIBRIUM: tolta, per la stessa regola di sempre — riprodurre la stessa logica, non una
  // più prudente inventata qui. (`cam1Mostrata`/`cam2Mostrata` arrivano già calcolate da chi
  // monta questo componente — quella regola vive lì, non qui.)
  if (!aperta || (!cam2Mostrata && !cam1Mostrata)) return null;

  // Decide se CAM 2 mostra il flusso locale o quello remoto/del telefono.
  const daRemoto = avvioDistanza || telefonoPcCollegato;

  return (
    <div style={{
      position: 'absolute', top: -8, right: 32, zIndex: 5,
      display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 16,
      pointerEvents: 'none',
    }}>
      {cam2Mostrata && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <CameraCerchio
            dimensione={255}
            dimensioneCollassata={88}
            titolo={t('cam2')}
            externalStream={daRemoto ? (remoteStream ?? null) : undefined}
            // CONN-33 lato SERENITY: quando il WebRTC non arriva, questo è il fotogramma JPEG
            // di scorta che il telefono manda sullo stesso canale dei dati — `CameraCerchio`
            // sapeva già disegnarlo (fase 6), mancava solo chi lo passasse (v.
            // `useMediaRelayFallback` in `Serenity.tsx`).
            fallbackFrame={daRemoto && remoteVideoFallbackActive ? remoteVideoFrame : undefined}
            offlineLabel={t('camera_offline')}
            opacita={uiAlpha}
            collassata={cam2Collassata}
            onToggleCollasso={onToggleCam2}
            statoTesto={statoCamPc}
            // ⚠️ CORRETTO — segnalato dal vivo: « la cam PC indica LIVE, ma niente immagine ».
            // `daRemoto` da solo dice solo "un telefono è connesso" (canale dati/segnalazione)
            // — completamente separato dalla chiamata media WebRTC che porta il VIDEO. Un
            // telefono può risultare connesso e "LIVE" senza che il suo video sia mai arrivato
            // — mostrare LIVE in quel momento era un falso positivo. Richiede anche un vero
            // fotogramma in arrivo (stream WebRTC O fotogramma di scorta), non solo una
            // connessione aperta.
            inDiretta={daRemoto && !!(remoteStream || (remoteVideoFallbackActive && remoteVideoFrame))}
          />
        </div>
      )}
      {cam1Mostrata && (
        // `inDiretta` — segnalato dal vivo: « un indicatore per dire che la CAM dell'auditor
        // sta mandando segnale, quando c'è una sessione a distanza ». `cam1Mostrata` è già vero
        // SOLO con `avvio.distanza`, quindi basta `remoteIsConnected`: non "a distanza è stato
        // scelto" ma "il preclear è davvero collegato e sta ricevendo questa camera".
        <CameraCerchio
          dimensione={158}
          dimensioneCollassata={88}
          titolo={t('cam1')}
          offlineLabel={t('camera_offline')}
          opacita={uiAlpha}
          collassata={cam1Collassata}
          onToggleCollasso={onToggleCam1}
          inDiretta={remoteIsConnected}
        />
      )}
    </div>
  );
}
