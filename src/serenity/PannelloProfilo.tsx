/**
 * CREARE, MODIFICARE, ELIMINARE — un auditor o un preclear, in SERENITY.
 *
 * ── STESSA LOGICA, ALTRA SUPERFICIE ─────────────────────────────────────────────────────────
 * Il nome, il RITRATTO (dalla camera o da un file, ridotto a 320 px) e il SESSO sono gli stessi
 * campi di EQUILIBRIUM, e passano per le stesse funzioni: `lib/profiloEdit`. Un profilo creato
 * o modificato qui è indistinguibile da uno creato di là, si sincronizza allo stesso modo, e
 * compare nell'altra applicazione — è la verifica scritta per la fase 4.
 *
 * ⚠️ SEGNALATO IN SEDUTA: « on ne peut pas éditer les auditeurs et PC existants ». La prima
 * versione di questo pannello sapeva solo creare. Adesso lo stesso modulo fa le tre cose che
 * EQUILIBRIUM fa da sempre in `ProfileRoster` — perché sono la stessa cosa, non due moduli
 * paralleli che potrebbero divergere su cosa vuol dire « modificare un profilo ».
 *
 * ⚠️ IL SESSO NON È ANAGRAFICA. Decide il TA di clear — 3,0 uomo, 2,0 donna — cioè l'origine
 * della scala del tono di quella persona. Lasciarlo vuoto non è neutro: si ripiega su 2,0, il
 * più prudente. Per questo la domanda è qui e non fra le impostazioni.
 *
 * @see docs/serenity-refonte.md — fase 4.
 */

import { useEffect, useRef, useState } from 'react';
import { UserRound, Eye } from 'lucide-react';
import {
  fotoDaVideo, fotoDaFile, salvaAuditor, salvaPreclear,
  eliminaAuditor, eliminaPreclear, type DatiProfilo,
} from '../lib/profiloEdit';
import { useI18n } from '../i18n';

export type Tipo = 'auditor' | 'preclear';

export function PannelloProfilo({ tipo, esistente, onFatto, onEliminato, onAnnulla }: {
  tipo: Tipo;
  /** Assente = si crea un profilo nuovo. Presente = si modifica QUESTO. */
  esistente?: DatiProfilo;
  /** Rende l'id del profilo scritto (nuovo o modificato). */
  onFatto: (id: string) => void;
  /** Il profilo È STATO eliminato. */
  onEliminato: () => void;
  onAnnulla: () => void;
}) {
  const { t } = useI18n();
  const modifica = !!esistente;
  const [nome, setNome] = useState(esistente?.nome ?? '');
  const [foto, setFoto] = useState<string | undefined>(esistente?.foto);
  const [sesso, setSesso] = useState<'m' | 'f' | undefined>(esistente?.sesso);
  const [camera, setCamera] = useState(false);
  const [errore, setErrore] = useState('');
  /** Eliminare chiede conferma con un secondo tocco, non con una finestra del sistema che
   *  romperebbe la superficie: si preme una volta e il bottone stesso diventa la domanda. */
  const [confermaElimina, setConfermaElimina] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const flussoRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const spegniCamera = () => {
    flussoRef.current?.getTracks().forEach(t => t.stop());
    flussoRef.current = null;
    setCamera(false);
  };
  // La camera si spegne SEMPRE allo smontaggio: una spia accesa dopo che la schermata è
  // sparita è la cosa peggiore che un'applicazione possa lasciarsi dietro.
  useEffect(() => spegniCamera, []);
  // E riparte da capo se si passa a modificare un'ALTRA persona senza smontare il pannello
  // (la macchina resta la stessa, cambia solo `esistente`): senza questo, il nome della prima
  // persona restava scritto sopra quello della seconda.
  useEffect(() => {
    setNome(esistente?.nome ?? ''); setFoto(esistente?.foto); setSesso(esistente?.sesso);
    setErrore(''); setConfermaElimina(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esistente?.id]);

  const accendiCamera = async () => {
    try {
      const st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      flussoRef.current = st; setCamera(true); setErrore('');
      requestAnimationFrame(() => {
        if (videoRef.current) { videoRef.current.srcObject = st; void videoRef.current.play().catch(() => {}); }
      });
    } catch { setErrore(t('ser_camera_unavailable')); }
  };

  const scatta = () => {
    if (videoRef.current) { const f = fotoDaVideo(videoRef.current); if (f) setFoto(f); }
    spegniCamera();
  };

  const salva = () => {
    const dati: DatiProfilo = { id: esistente?.id, nome, foto, sesso };
    const p = tipo === 'auditor' ? salvaAuditor(dati) : salvaPreclear(dati);
    // `null` = nome vuoto. Un profilo senza nome non si ritrova più, e le sedute che gli si
    // appendono restano senza padrone.
    if (!p) { setErrore(t('ser_need_name')); return; }
    spegniCamera();
    onFatto(p.id);
  };

  const elimina = () => {
    if (!esistente?.id) return;
    if (!confermaElimina) { setConfermaElimina(true); return; }
    // ⚠️ NON tocca le sedute già archiviate di questa persona: restano, col nome che avevano.
    // Un rapporto già consegnato non si può disfare per un ripensamento sull'anagrafica.
    (tipo === 'auditor' ? eliminaAuditor : eliminaPreclear)(esistente.id);
    onEliminato();
  };

  const disco: React.CSSProperties = {
    width: 132, height: 132, borderRadius: '50%', overflow: 'hidden',
    display: 'grid', placeItems: 'center',
    background: 'var(--s-disc)', boxShadow: 'var(--s-shadow)',
  };
  const testo: React.CSSProperties = {
    border: 'none', borderBottom: '1px solid var(--s-ink-ghost)',
    background: 'none', outline: 'none',
    fontFamily: 'var(--s-serif)', fontSize: 22, color: 'var(--s-ink)',
    textAlign: 'center', padding: '4px 8px', width: 260,
  };
  const pillola = (attiva: boolean): React.CSSProperties => ({
    border: 'none', cursor: 'pointer', borderRadius: 999, padding: '8px 20px',
    fontFamily: 'var(--s-sans)', fontSize: 13.5, letterSpacing: '0.06em',
    background: attiva ? 'var(--s-ink)' : 'var(--s-disc)',
    color: attiva ? 'var(--s-ground-warm)' : 'var(--s-ink-soft)',
    boxShadow: attiva ? 'none' : 'var(--s-shadow)',
    transition: 'background var(--s-slow) var(--s-ease), color var(--s-slow) var(--s-ease)',
  });

  return (
    <section style={{ height: '100%', display: 'grid', gridTemplateRows: 'auto 1fr auto',
                      alignItems: 'center', gap: 24, justifyItems: 'center' }}>
      <h1 style={{ margin: 0, fontFamily: 'var(--s-serif)', fontWeight: 400, fontSize: 28 }}>
        {modifica
          ? t('ser_edit_title').replace('{nome}', esistente!.nome)
          : t(tipo === 'auditor' ? 'ser_new_auditor_title' : 'ser_new_preclear_title')}
      </h1>

      <div style={{ display: 'grid', justifyItems: 'center', gap: 22 }}>
        <div style={disco}>
          {camera
            ? <video ref={videoRef} playsInline muted
                     style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : foto
              ? <img src={foto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              /* Stessa distinzione del pannello di modifica in `ProfileRoster.tsx`: `Eye` per
                 l'auditor (chi osserva), `UserRound` per il preclear (la persona) — non
                 un'icona generica ripetuta identica per i due ruoli. */
              : (tipo === 'auditor'
                  ? <Eye strokeWidth={1.4} size={48} style={{ color: 'var(--s-ink-faint)' }} />
                  : <UserRound strokeWidth={1.4} size={48} style={{ color: 'var(--s-ink-faint)' }} />)}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          {camera
            ? <>
                <button onClick={scatta} className="s-glass s-glass-btn" style={pillola(true)}>{t('ser_shoot')}</button>
                <button onClick={spegniCamera} className="s-glass s-glass-btn" style={pillola(false)}>{t('ser_cancel')}</button>
              </>
            : <>
                <button onClick={accendiCamera} className="s-glass s-glass-btn" style={pillola(false)}>{t('ser_camera')}</button>
                <button onClick={() => fileRef.current?.click()} className="s-glass s-glass-btn" style={pillola(false)}>{t('ser_from_file')}</button>
                {foto && <button onClick={() => setFoto(undefined)} className="s-glass s-glass-btn" style={pillola(false)}>{t('ser_remove')}</button>}
              </>}
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
                 onChange={e => {
                   const f = e.target.files?.[0];
                   if (f) void fotoDaFile(f).then(x => { if (x) setFoto(x); });
                 }} />
        </div>

        <input
          value={nome} onChange={e => { setNome(e.target.value); setErrore(''); }}
          placeholder={t('ser_name_placeholder')} style={testo} autoFocus
          onKeyDown={e => { if (e.key === 'Enter') salva(); }}
        />

        {/* ⚠️ IL SESSO DECIDE IL TA DI CLEAR — 3,0 uomo, 2,0 donna. Non è anagrafica: è
            l'origine della scala del tono di questa persona, e si scrive qui perché senza
            l'applicazione ripiega su 2,0, che è la scelta prudente ma non è la sua. */}
        <div style={{ display: 'grid', justifyItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setSesso('m')} className="s-glass s-glass-btn" style={pillola(sesso === 'm')}>{t('ser_man')}</button>
            <button onClick={() => setSesso('f')} className="s-glass s-glass-btn" style={pillola(sesso === 'f')}>{t('ser_woman')}</button>
          </div>
          <span style={{ fontSize: 12.5, color: 'var(--s-ink-faint)' }}>
            {sesso === 'm' ? t('ser_clear_male')
              : sesso === 'f' ? t('ser_clear_female')
              : t('ser_clear_undecided')}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 18, minHeight: 40 }}>
        <button onClick={onAnnulla} style={{
          border: 'none', background: 'none', cursor: 'pointer',
          fontFamily: 'var(--s-sans)', fontSize: 13.5, color: 'var(--s-ink-faint)',
        }}>← {t('ser_back')}</button>
        <button onClick={salva} className="s-glass s-glass-btn" style={pillola(true)}>{t('ser_save')}</button>
        {/* ⚠️ ELIMINARE SOLO SU UN PROFILO ESISTENTE, e con la conferma DENTRO il bottone
            stesso — un secondo tocco, non una finestra di sistema che romperebbe la
            superficie. Il colore passa alla riserva (ambra) solo quando chiede conferma:
            non è un rosso d'allarme, è « stai per fare una cosa che non si disfa ». */}
        {modifica && (
          <button onClick={elimina} style={{
            border: 'none', cursor: 'pointer', borderRadius: 999, padding: '8px 20px',
            fontFamily: 'var(--s-sans)', fontSize: 13.5, letterSpacing: '0.06em',
            background: confermaElimina ? 'var(--s-reserve)' : 'none',
            color: confermaElimina ? 'var(--s-ground-warm)' : 'var(--s-ink-faint)',
            transition: 'background var(--s-slow) var(--s-ease), color var(--s-slow) var(--s-ease)',
          }}>
            {confermaElimina ? t('ser_confirm_delete') : t('ser_delete')}
          </button>
        )}
        {errore && <span style={{ fontSize: 13, color: 'var(--s-reserve)' }}>{errore}</span>}
      </div>
    </section>
  );
}
