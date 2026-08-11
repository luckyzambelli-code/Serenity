import React, { useEffect, useState } from 'react';
import { X, ExternalLink } from 'lucide-react';
import { pick5 } from '../i18n5';
import { LAYER } from '../ui/layers';

/**
 * GuideModal — LA GUIDA, dentro l'applicazione.
 *
 * ── PERCHÉ QUI E NON IN UN BROWSER ──────────────────────────────────────────────────────────
 * Il manuale è sempre esistito, ma viveva fuori: un file HTML in una cartella, da aprire a
 * parte. Chi ha un dubbio a metà seduta non va a cercare una cartella — quindi in pratica non
 * si consultava mai, ed è come non averlo scritto.
 *
 * ── UNA SOLA SORGENTE ───────────────────────────────────────────────────────────────────────
 * Il documento NON è duplicato: `scripts/copy-guide.cjs` lo copia in `public/guide/` a ogni
 * build. Si continua a scriverlo dov'era — si rilegge in un browser senza far girare l'app — e
 * l'applicazione ne mostra sempre l'ultima versione. Due copie tenute a mano divergerebbero
 * alla prima modifica, e l'app mostrerebbe la vecchia senza che nessuno se ne accorga.
 *
 * ── SE NON C'È ──────────────────────────────────────────────────────────────────────────────
 * Chi clona il repo senza la cartella della guida non trova il file: il build non si ferma per
 * questo (vedi lo script), e qui compare una riga che dice dove cercarlo. Un pannello che
 * spiega vale più di un riquadro bianco.
 *
 * ⚠️ La guida ha la SUA lingua, scelta dentro di lei: non si passa `lang` all'iframe. Sono due
 * scelte diverse — quella dell'interfaccia e quella del documento — e legarle vorrebbe dire
 * togliere la seconda.
 */
export function GuideModal({ onClose, lang }: { onClose: () => void; lang: string }) {
  const L = (it: string, fr: string, en: string, es: string, sv: string) => pick5(lang, it, fr, en, es, sv);
  const [mancante, setMancante] = useState(false);
  const SRC = '/guide/EQUILIBRIUM-manuale.html';

  /**
   * ESC CHIUDE — e senza questo il bottone prometteva una scorciatoia che non esisteva.
   *
   * ⚠️ Il tasto si ascolta sulla FINESTRA, non sul riquadro: la guida sta dentro un iframe, e
   * quando il fuoco è lì dentro il documento esterno non riceve più i tasti. Quello che si può
   * fare è tenerlo per quando il fuoco è fuori — dentro l'iframe resta il bottone, che è
   * comunque visibile in cima.
   */
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: LAYER.modalTop,
               background: 'rgba(2,6,23,0.82)', backdropFilter: 'blur(6px)',
               display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(1180px, 96vw)', height: 'min(860px, 92vh)',
                 display: 'flex', flexDirection: 'column',
                 borderRadius: 16, overflow: 'hidden',
                 background: '#0b0f14', border: '1px solid rgba(255,255,255,0.16)',
                 boxShadow: '0 30px 90px rgba(0,0,0,0.6)' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.12)',
                      flexShrink: 0 }}>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700,
                         letterSpacing: '0.2em', textTransform: 'uppercase',
                         color: 'rgba(240,246,255,0.9)' }}>
            {L('Guida', 'Guide', 'Guide', 'Guía', 'Guide')} · EQUILIBRIUM
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* A TUTTO SCHERMO, in una finestra a parte: la guida è lunga, e leggerla mentre si
                conduce vuol dire poterla mettere di fianco all'app invece che sopra. */}
            <button type="button" onClick={() => window.open(SRC, '_blank')}
              title={L('Apri in una finestra a parte', 'Ouvrir dans une fenêtre à part',
                       'Open in a separate window', 'Abrir en una ventana aparte',
                       'Öppna i ett separat fönster')}
              style={{ width: 30, height: 30, borderRadius: 8, cursor: 'pointer',
                       display: 'flex', alignItems: 'center', justifyContent: 'center',
                       background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.2)',
                       color: 'rgba(240,246,255,0.8)' }}>
              <ExternalLink size={14} />
            </button>
            {/* ── L'USCITA, DETTA A PAROLE ──────────────────────────────────────────────
                Era una crocetta di 30 px in un angolo, e la guida è a tutto schermo: aprendola
                non si capiva come tornare all'app (segnalato). Adesso il bottone porta il nome
                di dove si torna, e l'ESC è scritto sopra — chi cerca un'uscita cerca prima
                quello. */}
            <button type="button" onClick={onClose}
              title={L('Torna a EQUILIBRIUM — o premi ESC', 'Retour à EQUILIBRIUM — ou touche ESC',
                       'Back to EQUILIBRIUM — or press ESC', 'Volver a EQUILIBRIUM — o pulsa ESC',
                       'Tillbaka till EQUILIBRIUM — eller ESC')}
              style={{ height: 32, padding: '0 14px', borderRadius: 8, cursor: 'pointer',
                       display: 'flex', alignItems: 'center', gap: 7,
                       fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700,
                       letterSpacing: '0.04em',
                       background: 'rgba(52,211,153,0.16)', border: '1px solid rgba(52,211,153,0.6)',
                       color: '#34d399' }}>
              <X size={15} />
              {L('Torna all\'app', 'Retour à l\'app', 'Back to the app', 'Volver a la app', 'Tillbaka till appen')}
              <span style={{ fontSize: 9, opacity: 0.7, letterSpacing: '0.1em' }}>ESC</span>
            </button>
          </div>
        </div>

        {mancante ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                        justifyContent: 'center', gap: 10, padding: 32, textAlign: 'center' }}>
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 700,
                           color: 'rgba(240,246,255,0.9)' }}>
              {L('La guida non è in questa copia dell\'app.',
                 'Le guide n\'est pas dans cette copie de l\'app.',
                 'The guide is not in this copy of the app.',
                 'La guía no está en esta copia de la app.',
                 'Guiden finns inte i denna kopia av appen.')}
            </span>
            <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(226,238,255,0.6)' }}>
              ~/Downloads/Guide Static Meter/EQUILIBRIUM-manuale.html
            </span>
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, lineHeight: 1.5,
                           maxWidth: 460, color: 'rgba(226,238,255,0.55)' }}>
              {L('Si copia dentro l\'app a ogni build. Se il file c\'è, rigenera l\'applicazione.',
                 'Il est copié dans l\'app à chaque build. Si le fichier existe, régénère l\'application.',
                 'It is copied into the app at each build. If the file exists, rebuild the application.',
                 'Se copia en la app en cada build. Si el archivo existe, regenera la aplicación.',
                 'Den kopieras in i appen vid varje build. Om filen finns, bygg om applikationen.')}
            </span>
          </div>
        ) : (
          <iframe
            src={SRC}
            title="EQUILIBRIUM"
            onError={() => setMancante(true)}
            onLoad={(e) => {
              // Un 404 servito come pagina d'errore carica lo stesso: si guarda se dentro c'è
              // davvero la guida. Senza questo, l'assenza si vedrebbe come una pagina bianca.
              try {
                const d = (e.currentTarget as HTMLIFrameElement).contentDocument;
                if (d && !d.querySelector('body')?.textContent?.trim()) setMancante(true);
              } catch (_) { /* altra origine: allora si è caricata davvero */ }
            }}
            style={{ flex: 1, width: '100%', border: 'none', background: '#fff' }}
          />
        )}
      </div>
    </div>
  );
}
