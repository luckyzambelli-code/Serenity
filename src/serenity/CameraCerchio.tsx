/**
 * CameraCerchio — le camere di EQUILIBRIUM (CAM 1 auditor, CAM 2 PC), in un cerchio.
 *
 * ── PERCHÉ ESISTE ───────────────────────────────────────────────────────────────────────────
 * Segnalato: « Auditor/PC camera feeds » assente dalla revisione completa. In EQUILIBRIUM
 * `CameraFeed` fa due cose — CAM 1 è sempre la webcam locale (l'auditor, senza overlay); CAM 2
 * mostra lo stream REMOTO del PC quando la seduta è a distanza, altrimenti la webcam locale.
 * In una seduta a distanza SERENITY riceve già `remote.remoteStream` (fase 7, WebRTC) ma non lo
 * mostrava da nessuna parte — l'auditor non poteva VEDERE il preclear collegato.
 *
 * ── STESSA LOGICA DI ATTACCO, GRAFICA PROPRIA ────────────────────────────────────────────────
 * L'aggancio dello stream (callback ref, retry su play(), muto imperativo, boost audio via
 * `attachAudioBoost`) è lo STESSO di `components/CameraFeed.tsx` — non si reinventa il modo in
 * cui un MediaStream finisce in un <video>, si ridisegna solo il contorno: un `Cerchio`, non un
 * riquadro con barra del titolo e badge — la dottrina di questo file (vedi `Cerchio.tsx`).
 *
 * ── SEGNALATO: TROPPO PICCOLE ────────────────────────────────────────────────────────────────
 * Prima versione: 44 px nell'intestazione, fra il tema e la lingua — leggibile come icona, non
 * come volto. « L'auditor deve vedere il PC correttamente » non è un dettaglio estetico: è
 * l'unico modo di cogliere un'espressione durante la seduta. Ora la dimensione è un parametro
 * vero (chi chiama decide, non più un default minuscolo), e la didascalia sotto il cerchio è
 * SEMPRE visibile — non più solo un `title` che si legge al passaggio del mouse.
 *
 * ── SEGNALATO: LA CAMM NON PUÒ ESSERE « SEMPLICEMENTE NASCOSTA » ────────────────────────────
 * In EQUILIBRIUM `CameraFeed` ha DUE controlli distinti, non uno: `isVisible`/`onToggle` la
 * RIMPICCIOLISCE (il video resta agganciato e vivo, a un quarto d'opacità, con l'etichetta che
 * gira di lato) — un gesto rapido, reversibile, che l'auditor fa IN SEDUTA; `onDisable` la
 * TOGLIE dal layout — quello che qui fa CONFIG → moduli (`moduleVis`). La prima versione di
 * questo file aveva SOLO il secondo: spegnere da CONFIG o niente, il gesto rapido spariva. Qui
 * torna: cliccare il cerchio lo COLLASSA a una taglia minore (video ancora vivo, attenuato),
 * ricliccare lo riporta alla taglia intera — stessa funzione di `isVisible`, stesso stato che
 * NON ferma lo stream (a differenza di CONFIG, che lo chiude per davvero).
 *
 * @see docs/serenity-refonte.md — fase 6.
 */

import { useEffect, useRef, useState } from 'react';
import { attachAudioBoost } from '../lib/audioBoost';
import { Cerchio } from './Cerchio';

export function CameraCerchio({
  dimensione = 160, titolo, externalStream, forceMuted = false, fallbackFrame, offlineLabel, opacita,
  collassata = false, onToggleCollasso,
}: {
  dimensione?: number;
  titolo: string;
  /** Uno stream remoto (seduta a distanza) — `undefined` = camera locale del dispositivo. */
  externalStream?: MediaStream | null;
  forceMuted?: boolean;
  /** CONN-33 lato SERENITY: un fotogramma JPEG di scorta se il video WebRTC non arriva. */
  fallbackFrame?: string | null;
  offlineLabel: string;
  /** CONFIG → Trasparenza — vedi `Cerchio.tsx`. */
  opacita?: number;
  /** Lo stesso `isVisible` (invertito) di `CameraFeed.tsx` — piccola, non spenta: lo stream
   *  resta agganciato. Chi possiede lo stato lo passa da fuori (un gesto per seduta, non per
   *  componente montato/smontato). */
  collassata?: boolean;
  onToggleCollasso?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  const attach = (el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (!el || externalStream === undefined) return;
    el.muted = forceMuted;
    if (el.srcObject !== externalStream) el.srcObject = externalStream ?? null;
    if (externalStream) {
      el.play().catch(() => { requestAnimationFrame(() => { el.play().catch(() => {}); }); });
    }
  };

  useEffect(() => {
    if (externalStream === undefined) return;
    attach(videoRef.current);
    setErrore(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalStream]);

  useEffect(() => {
    if (!externalStream || forceMuted) return;
    return attachAudioBoost(videoRef.current as HTMLMediaElement, externalStream, 4.0);
  }, [externalStream, forceMuted]);

  // Camera locale — solo quando non c'è uno stream remoto da mostrare.
  useEffect(() => {
    if (externalStream !== undefined) return;
    let attivo: MediaStream | null = null;
    (async () => {
      try {
        attivo = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) videoRef.current.srcObject = attivo;
        setErrore(null);
      } catch {
        setErrore(offlineLabel);
      }
    })();
    return () => { attivo?.getTracks().forEach(tr => tr.stop()); };
  }, [externalStream, offlineLabel]);

  const dimEffettiva = collassata ? Math.max(48, Math.round(dimensione * 0.35)) : dimensione;
  const opacitaEffettiva = (opacita ?? 1) * (collassata ? 0.62 : 1);

  return (
    <div style={{ display: 'grid', justifyItems: 'center', gap: 8 }}>
      <div
        onClick={onToggleCollasso}
        title={onToggleCollasso ? (collassata ? titolo : titolo) : undefined}
        style={{ cursor: onToggleCollasso ? 'pointer' : 'default', transition: 'width var(--s-slow) var(--s-ease), height var(--s-slow) var(--s-ease)' }}
      >
        <Cerchio dimensione={dimEffettiva} viva={!errore} opacita={opacitaEffettiva}>
          <div title={titolo} style={{
            width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', position: 'relative',
          }}>
            {errore ? (
              <div style={{
                width: '100%', height: '100%', display: 'grid', placeItems: 'center', textAlign: 'center',
                fontFamily: 'var(--s-mono)', fontSize: Math.max(9, dimEffettiva * 0.07), color: 'var(--s-ink-soft)', padding: 8,
              }}>
                {collassata ? '' : errore}
              </div>
            ) : fallbackFrame ? (
              <img src={fallbackFrame} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <video ref={attach} autoPlay playsInline muted={!externalStream || forceMuted}
                     style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            )}
            {externalStream && !collassata && (
              <span style={{
                position: 'absolute', bottom: 6, left: '50%', transform: 'translateX(-50%)',
                fontSize: 9, letterSpacing: '0.06em', color: 'var(--s-still)',
                fontFamily: 'var(--s-mono)', fontWeight: 700,
              }}>
                ●
              </span>
            )}
          </div>
        </Cerchio>
      </div>
      {/* La didascalia — SEMPRE leggibile, non solo al passaggio del mouse (segnalato). */}
      <span style={{
        fontFamily: 'var(--s-sans)', fontSize: collassata ? 10.5 : 12.5, color: 'var(--s-ink-soft)', letterSpacing: '0.02em',
      }}>
        {titolo}
      </span>
    </div>
  );
}
