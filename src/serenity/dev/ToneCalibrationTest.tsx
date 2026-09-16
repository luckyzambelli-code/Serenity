/**
 * ToneCalibrationTest — TEST TEMPORANEO, DA RIMUOVERE a calibrazione conclusa.
 *
 * ── PERCHÉ ESISTE ───────────────────────────────────────────────────────────────────────────
 * `TONE_MUSE_ESCURSIONE` (tuning.ts) non è "ancora una misura verificata sul campo" — lo dice
 * il commento sopra la costante stessa. Serve un log di `qL` nel tempo, con marcati gli istanti
 * di LOCALIZZA e di CIMA RAGGIUNTA, su resistenze vere fatte in auto-processing (non una seduta
 * con un secondo, per cui al momento non c'è modo corretto di procedere).
 *
 * Terzo marcatore, MINIMO: verifica se il momento auto-riportato come "minima quantità di
 * pensiero-emozione-sforzo" (v. l'appendice del documento QCS/Q sulla comunicazione di Ron
 * dell'11-12/10/2025) corrisponde a un pattern di `qL` distinguibile — P(M|minimo) ≠ P(M).
 * Marcatore libero: non avanza la resistenza, può cadere più volte sulla stessa.
 *
 * ── PERCHÉ È UN PANNELLO GALLEGGIANTE, NON UNA SCHERMATA A PARTE ──────────────────────────────
 * `qL` nasce da `useChargeEngine`, cablato dentro `Serenity()` con un'altra dozzina di motori a
 * modulo singolo (v. l'intestazione di `useChargeEngine.ts`). Ricablarli in un file a parte
 * avrebbe rischiato di produrre un `qL` DIVERSO da quello vero — inutile per tarare una costante
 * che si userà poi sul `qL` reale. Qui si passano solo `qL`, lo stato del MUSE e se la seduta è
 * aperta: il resto (appaiare la cuffia, aprire la seduta) resta ai controlli normali di
 * SERENITY, visibili intorno a questo pannello.
 *
 * ── COME SI TOGLIE ──────────────────────────────────────────────────────────────────────────
 * Basta cancellare questo file e le poche righe in `Serenity.tsx` marcate
 * "TEST TEMPORANEO TONE/MUSE" (import + il blocco JSX che monta questo componente). Nessun'altra
 * parte dell'app lo referenzia.
 *
 * Puro React, nessuno stato globale: tutto quel che serve arriva come prop.
 */
import { useEffect, useRef, useState } from 'react';
import type { MuseConnectionState } from '../../hooks/useMuseConnection';
import { TONE_SMOOTH } from '../../engine/tuning';

interface Props {
  qL: number;
  museState: MuseConnectionState;
  sessionOpen: boolean;
}

type EventKind = 'locate' | 'top' | 'minimo';
interface LogRow { tSec: number; qL: number; qLSmooth: number; evento: EventKind | ''; resistenza: number }

const MUSE_LABEL: Record<MuseConnectionState, string> = {
  connected: 'MUSE connesso',
  searching: 'MUSE — ricerca…',
  disconnected: 'MUSE disconnesso',
};
const MUSE_COLOR: Record<MuseConnectionState, string> = {
  connected: '#2e7d32',
  searching: '#b8860b',
  disconnected: '#b00020',
};

export function ToneCalibrationTest({ qL, museState, sessionOpen }: Props) {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [resistenza, setResistenza] = useState(1);
  const [running, setRunning] = useState(false);
  const startRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const [, forceTick] = useState(0); // solo per far vedere il timer/qL live che scorre

  /** ⚠️ BUG TROVATO leggendo il CSV col committente — segnalato indirettamente, come dato
   *  strano: dentro OGNI blocco resistenza il `qL` di sfondo era un numero SOLO, identico per
   *  decine di righe di fila — solo le righe con un evento (locate/top/minimo) mostravano un
   *  valore diverso. Causa: il `setInterval` qui sotto chiudeva su `qL` (la prop) SENZA averlo
   *  fra le dipendenze dell'effetto (disattivato apposta con l'eslint-disable, sotto) — la
   *  STESSA chiusura ferma già trovata più volte in questo deposito (v. `qLRef` in
   *  `useToneCycle.ts`, la nota su di lui). L'effetto si ricrea SOLO quando `running`/`resistenza`
   *  cambiano (cioè a un CIMA/TONO 40) — fra un cambio e l'altro, l'intervallo scrive per sempre
   *  lo stesso `qL` catturato in quel momento, mai quello vero del momento in cui la riga viene
   *  scritta. `markEvent` (sotto) non ne soffriva: legge `qL` direttamente dal corpo del
   *  componente, ricreato ad ogni render, quindi sempre fresco — da qui perché SOLO le righe con
   *  un evento portavano un numero vero.
   *
   *  Stessa correzione già collaudata altrove nel deposito: un REF tenuto sempre allineato,
   *  letto dentro l'intervallo invece della prop chiusa. Aggiungere `qL` alle dipendenze
   *  dell'effetto, l'alternativa più ovvia, era SBAGLIATA — avrebbe ricreato l'intervallo (e
   *  quindi la sua fase dei 250ms) ad OGNI variazione di `qL`, che arriva molto più spesso: mai
   *  un campionamento regolare, nella migliore delle ipotesi. */
  const qLRef = useRef(qL);
  /** ⚠️ AGGIUNTO — segnalato indirettamente: i numeri di `qL` grezzo saltano di due/tre ordini
   *  di grandezza da un campione al successivo (0,1 → 400+). Vero, ma è il grezzo: il ciclo TONE
   *  VERO non lo guarda mai così com'è — `useToneCycle.ts` gli applica PRIMA una media mobile
   *  (`qLSmoothRef`, stessa costante `TONE_SMOOTH`) apposta per questo rumore, e SOLO quella
   *  lisciata entra in `toneFromDelta`. Tarare `TONE_MUSE_ESCURSIONE` sul grezzo di questo tool
   *  significherebbe tarare una costante che verrà poi usata su un segnale diverso da quello
   *  misurato qui. Stessa identica formula (`TONE_SMOOTH`, non una copia inventata), calcolata
   *  in un ref a parte così il grezzo resta comunque nel CSV — utile per vedere quanto rumore la
   *  media toglie, non solo il risultato. */
  const qLSmoothRef = useRef(qL);
  useEffect(() => {
    qLRef.current = qL;
    qLSmoothRef.current = qLSmoothRef.current * (1 - TONE_SMOOTH) + qL * TONE_SMOOTH;
  }, [qL]);

  // Campiona qL ~4 volte al secondo mentre il test gira — indipendente da SessionRecorder,
  // apposta: non deve dipendere da (né essere azzerato da) reset/cicli di una seduta vera.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setRows(r => [...r, {
        tSec: (Date.now() - startRef.current) / 1000,
        qL: qLRef.current, qLSmooth: qLSmoothRef.current, evento: '', resistenza,
      }]);
    }, 250);
    return () => clearInterval(id);
  }, [running, resistenza]);

  // Solo per aggiornare a schermo il numero live e il cronometro senza un campionamento vero.
  useEffect(() => {
    if (!running) return;
    const loop = () => { forceTick(n => n + 1); rafRef.current = requestAnimationFrame(loop); };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [running]);

  const markEvent = (evento: EventKind) => {
    if (!running) return;
    setRows(r => [...r, {
      tSec: (Date.now() - startRef.current) / 1000,
      qL, qLSmooth: qLSmoothRef.current, evento, resistenza,
    }]);
    if (evento === 'top') setResistenza(n => n + 1);
  };

  const nuovaSessioneTest = () => {
    setRows([]);
    setResistenza(1);
    startRef.current = Date.now();
    setRunning(true);
  };

  const fermaTest = () => setRunning(false);

  const scaricaCsv = () => {
    const header = 't_s,qL,qL_smooth,evento,resistenza';
    const body = rows.map(r =>
      `${r.tSec.toFixed(2)},${r.qL.toFixed(4)},${r.qLSmooth.toFixed(4)},${r.evento},${r.resistenza}`).join('\n');
    const blob = new Blob([`${header}\n${body}\n`], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tone-calibration-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const elapsed = running ? (Date.now() - startRef.current) / 1000 : 0;
  const nLocate = rows.filter(r => r.evento === 'locate').length;
  const nTop = rows.filter(r => r.evento === 'top').length;
  const nMinimo = rows.filter(r => r.evento === 'minimo').length;

  return (
    <div style={{
      position: 'fixed', bottom: 16, right: 16, zIndex: 9999,
      width: 280, padding: 14, borderRadius: 10,
      background: 'rgba(20,20,24,0.92)', color: '#eee',
      fontFamily: 'monospace', fontSize: 13, boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
    }}>
      <div style={{ fontWeight: 'bold', marginBottom: 6 }}>TEST TONE / MUSE (temporaneo)</div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span>
          <span style={{ color: MUSE_COLOR[museState] }}>●</span> {MUSE_LABEL[museState]}
        </span>
        <span>{sessionOpen ? 'seduta aperta' : 'seduta chiusa'}</span>
      </div>

      <div style={{ fontSize: 22, margin: '8px 0' }}>qL = {qL.toFixed(4)}</div>
      <div style={{ fontSize: 13, color: '#9ab', marginTop: -6, marginBottom: 8 }}>
        lisciato (quello che TONE usa davvero) = {qLSmoothRef.current.toFixed(4)}
      </div>
      <div style={{ marginBottom: 8 }}>
        {running ? `⏱ ${elapsed.toFixed(1)}s — resistenza #${resistenza}` : 'test fermo'}
        {rows.length > 0 && ` — ${nLocate} localizza / ${nMinimo} minimo / ${nTop} cima`}
      </div>

      {!running ? (
        <button onClick={nuovaSessioneTest} style={btnStyle}>NUOVA SESSIONE DI TEST</button>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <button onClick={() => markEvent('locate')} style={btnStyle}>LOCALIZZA</button>
            <button onClick={() => markEvent('top')} style={btnStyle}>CIMA (TONO 40)</button>
          </div>
          {/* MINIMO — v. appendice del documento QCS/Q: "qual è la quantità minima di
              pensiero-emozione-sforzo in questo?" (Ron, 11-12/10/2025). Marcatore indipendente,
              non avanza la resistenza (a differenza di CIMA): può cadere in qualunque momento
              della lavorazione, anche più volte sulla stessa resistenza. */}
          <div style={{ marginBottom: 6 }}>
            <button onClick={() => markEvent('minimo')} style={{ ...btnStyle, width: '100%' }}>
              MINIMO (pensiero-emozione-sforzo)
            </button>
          </div>
          <button onClick={fermaTest} style={{ ...btnStyle, opacity: 0.7 }}>FERMA IL TEST</button>
        </>
      )}

      {rows.length > 0 && !running && (
        <button onClick={scaricaCsv} style={{ ...btnStyle, marginTop: 6, background: '#2e7d32' }}>
          SCARICA CSV ({rows.length} righe)
        </button>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  flex: 1, padding: '6px 8px', borderRadius: 6, border: 'none',
  background: '#3a3a42', color: '#fff', cursor: 'pointer', fontFamily: 'monospace', fontSize: 12,
};
