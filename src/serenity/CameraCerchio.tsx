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
 * torna: cliccare il cerchio lo COLLASSA — ricliccare lo riporta alla taglia intera — stesso
 * stato di `isVisible`, che NON ferma lo stream (a differenza di CONFIG, che lo chiude davvero).
 *
 * ── SEGNALATO DI NUOVO: « quand on cache la camm il faut que apparaisse un cercle vide » ──────
 * Prima versione: collassata mostrava lo STESSO video, solo più piccolo e attenuato — un
 * quadratino con dentro ancora un volto in movimento, che a quella taglia si legge più come un
 * difetto (« perché è diventato minuscolo e sfocato? ») che come un gesto voluto. Un cerchio
 * VUOTO — affondato, lo stesso linguaggio di `Cerchio.tsx`'s `spenta` — dice SUBITO "nascosta
 * apposta", senza lasciar intuire un guasto. Lo stream resta agganciato e vivo (si rimette a
 * vedersi appena si riclicca): a sparire è solo il disegno, non il collegamento.
 *
 * ⚠️ SEGNALATO ANCORA: « le camm se nascoste devono apparire come un bottone liquid glass
 * anche lui ». `Cerchio`'s `spenta` di proposito NON prende il vetro (la sua stessa nota: « un
 * disco previsto ma spento non deve luccicare come acceso ») — giusto per un modulo non ancora
 * montato, sbagliato QUI: una camm nascosta resta un BOTTONE vero (ricliccarlo la riespande),
 * non un segnaposto muto. Quindi qui non si passa `spenta` a `Cerchio`: da collassata si
 * disegna il cerchio da sé, sunk come sempre (`--s-disc-sunk`) ma con le classi del vetro
 * (`s-glass s-glass-btn`) — resta "affondato", ma torna un bottone di vetro come tutti gli
 * altri, non un'eccezione opaca.
 *
 * @see docs/serenity-refonte.md — fase 6.
 */

import { useEffect, useRef, useState } from 'react';
import { attachAudioBoost } from '../lib/audioBoost';
import { Cerchio } from './Cerchio';

export function CameraCerchio({
  dimensione = 160, dimensioneCollassata, titolo, externalStream, forceMuted = false, fallbackFrame, offlineLabel, opacita,
  collassata = false, onToggleCollasso, statoTesto, inDiretta = false,
}: {
  dimensione?: number;
  /** ⚠️ Segnalato: « quando la chiudi [CAM 2] deve essere della stessa dimensione di quella
   *  dell'auditor ». Di default il collasso era proporzionale a `dimensione` (35%) — due
   *  camere di taglia diversa collassavano a taglie diverse. Chi monta ENTRAMBE le camere
   *  passa qui lo STESSO numero per le due, e il collasso smette di "ricordare" quanto erano
   *  grandi prima. */
  dimensioneCollassata?: number;
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
  /** ── LA STESSA INDICAZIONE DI `CameraFeed.tsx`'s `massStatus` — segnalato: « nella cam PC
   *  devi mettere le indicazioni che hai già in equilibrium ». Un testo scritto da fuori (chi
   *  chiama sa a che punto è la carica, o se il MUSE del preclear è collegato): questo
   *  componente lo mostra soltanto, non lo calcola. */
  statoTesto?: string;
  /** Lo stesso badge « LIVE » di `CameraFeed.tsx` — solo quando lo stream è remoto davvero. */
  inDiretta?: boolean;
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

  const dimEffettiva = collassata
    ? (dimensioneCollassata ?? Math.max(48, Math.round(dimensione * 0.35)))
    : dimensione;

  return (
    <div style={{ display: 'grid', justifyItems: 'center', gap: 8, pointerEvents: 'auto' }}>
      <div
        onClick={onToggleCollasso}
        title={onToggleCollasso ? (collassata ? titolo : titolo) : undefined}
        style={{ cursor: onToggleCollasso ? 'pointer' : 'default', transition: 'width var(--s-slow) var(--s-ease), height var(--s-slow) var(--s-ease)' }}
      >
        {/* ── UN SOLO ALBERO, SEMPRE ──────────────────────────────────────────────────────
            Segnalato prima: collassata deve mostrare un cerchio VUOTO, non il video
            rimpicciolito — risolto tenendo `<video>` montato e solo invisibile (sotto), perché
            smontarlo lo scollegherebbe e andrebbe riagganciato da capo alla riespansione.
            Segnalato ORA: quel cerchio vuoto deve apparire come un bottone di vetro, non un
            segnaposto opaco — `Cerchio`'s `spenta` di proposito non prende il vetro (giusto
            per un modulo non ancora montato), quindi qui si passa `vetroDaSpenta`: l'eccezione
            esplicita, resta "affondata" (si legge "nascosta apposta") ma torna un bottone di
            vetro come tutti gli altri — SENZA biforcare l'albero, che avrebbe rismontato il
            video. */}
        <Cerchio dimensione={dimEffettiva} viva={!errore && !collassata} spenta={collassata}
                 vetroDaSpenta opacita={opacita} className={collassata ? 's-glass-btn' : undefined}>
          <div title={titolo} style={{
            width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', position: 'relative',
          }}>
            <div style={{
              width: '100%', height: '100%', opacity: collassata ? 0 : 1,
              transition: 'opacity var(--s-slow) var(--s-ease)',
              pointerEvents: collassata ? 'none' : undefined,
            }}>
              {errore ? (
                <div style={{
                  width: '100%', height: '100%', display: 'grid', placeItems: 'center', textAlign: 'center',
                  fontFamily: 'var(--s-mono)', fontSize: Math.max(9, dimEffettiva * 0.07), color: 'var(--s-ink-soft)', padding: 8,
                }}>
                  {errore}
                </div>
              ) : fallbackFrame ? (
                <img src={fallbackFrame} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <video ref={attach} autoPlay playsInline muted={!externalStream || forceMuted}
                       style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              )}
              {/* ── LIVE + LO STATO — segnalato: « nella cam PC devi mettere le indicazioni
                  che hai già in equilibrium ». Stesso badge verde e stesso testo di stato di
                  `CameraFeed.tsx` (`massStatus`), solo su un cerchio invece che su un
                  riquadro: LIVE in alto, lo stato in una fascia in basso — leggibili senza
                  coprire il volto al centro. */}
              {inDiretta && (
                <span style={{
                  position: 'absolute', top: '10%', left: '50%', transform: 'translateX(-50%)',
                  fontSize: Math.max(8, dimEffettiva * 0.045), letterSpacing: '0.08em', fontWeight: 700,
                  padding: '1px 7px', borderRadius: 999,
                  background: 'rgba(52,211,153,0.85)', color: '#04140d',
                  fontFamily: 'var(--s-sans)',
                }}>
                  LIVE
                </span>
              )}
              {statoTesto && (
                <span style={{
                  position: 'absolute', bottom: '9%', left: '50%', transform: 'translateX(-50%)',
                  maxWidth: '82%', textAlign: 'center',
                  fontSize: Math.max(8, dimEffettiva * 0.042), letterSpacing: '0.02em', fontWeight: 700,
                  color: '#f4f7ff', textShadow: '0 1px 3px rgba(0,0,0,0.65)',
                  fontFamily: 'var(--s-sans)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {statoTesto}
                </span>
              )}
            </div>
          </div>
        </Cerchio>
      </div>
      {/* La didascalia — SEMPRE leggibile, non solo al passaggio del mouse (segnalato). */}
      <span style={{
        fontFamily: 'var(--s-sans)', fontSize: collassata ? 12 : 14, color: 'var(--s-ink-soft)', letterSpacing: '0.02em',
      }}>
        {titolo}
      </span>
    </div>
  );
}
