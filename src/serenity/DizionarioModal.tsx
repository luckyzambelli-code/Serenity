import { useEffect, useMemo, useState } from 'react';
import { pick5 } from '../i18n5';

/**
 * DizionarioModal — IL DIZIONARIO TECNICO DI DIANETICS E SCIENTOLOGY, RICERCABILE.
 *
 * ── PERCHÉ ESISTE ────────────────────────────────────────────────────────────────────────────
 * Segnalato: « si potrebbe integrare il dizionario tecnico? ». Due fonti, entrambe FUORI dal
 * deposito (come la guida — v. `scripts/copy-guide.cjs`, `GuideModal.tsx`): il "Dizionario
 * Tecnico" italiano completo (808 pagine, PDF, con testo vero estraibile — nessun OCR) e un
 * "Technical Dictionary" inglese (file .htm, dichiarato dalla fonte stessa "fair use quotes",
 * non il libro intero). Estratti UNA VOLTA in JSON con due script Python (fuori dal deposito,
 * non richiesti a ogni build come la guida — il libro non cambia) e copiati qui:
 * `public/dizionario/dizionario-it.json` (2408 voci) e `dizionario-en.json` (2567 voci).
 *
 * ⚠️ COPYRIGHT — segnalato dall'utente: per ora la distribuzione resta a due persone, per il
 * collaudo del programma; la distribuzione più ampia resta da decidere. Non è compito di
 * questo componente deciderlo — solo mostrare il dizionario a chi ha già l'app.
 *
 * ── LA RICERCA BILINGUE (SOLO ITALIANO) ─────────────────────────────────────────────────────
 * Segnalato: « per l'italiano, la ricerca deve potersi fare sia in italiano che con la parola
 * corrispondente in inglese ». Molte voci italiane portano già il proprio equivalente inglese
 * (`termine_en`, es. "ATTUABILITÀ - WORKABILITY") — la ricerca in italiano confronta la parola
 * digitata con ENTRAMBI i campi, non solo col termine italiano.
 *
 * Elenco cliccabile (di sole parole, leggero) più campo di ricerca — SOLO SERENITY, nessun
 * dato né logica di ciclo qui dentro.
 */

interface VoceGrezza { termine: string; termine_en?: string | null; definizione: string }
interface Voce { termine: string; termineEn?: string | null; definizione: string }

const rimuoviAccenti = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function DizionarioModal({ lang, onClose }: { lang: string; onClose: () => void }) {
  const LC = (it: string, fr: string, en: string, es: string, sv: string) => pick5(lang, it, fr, en, es, sv) as string;

  const [caricamento, setCaricamento] = useState(true);
  const [erroreCaricamento, setErroreCaricamento] = useState(false);
  const [vociIt, setVociIt] = useState<Voce[]>([]);
  const [vociEn, setVociEn] = useState<Voce[]>([]);
  const [lingua, setLingua] = useState<'it' | 'en'>('it');
  const [ricerca, setRicerca] = useState('');
  const [espanso, setEspanso] = useState<string | null>(null);

  // ⚠️ CARICATO SOLO ALL'APERTURA, NON ALL'AVVIO DI SERENITY — 2 MB di JSON che servono
  // solo a chi apre il dizionario: caricarli sempre, anche per una seduta che non lo apre
  // mai, sarebbe un peso di avvio per un uso che potrebbe non capitare.
  useEffect(() => {
    let vivo = true;
    Promise.all([
      fetch('/dizionario/dizionario-it.json').then(r => r.json()).catch(() => []),
      fetch('/dizionario/dizionario-en.json').then(r => r.json()).catch(() => []),
    ]).then(([it, en]: [VoceGrezza[], VoceGrezza[]]) => {
      if (!vivo) return;
      if (!Array.isArray(it) && !Array.isArray(en)) { setErroreCaricamento(true); setCaricamento(false); return; }
      setVociIt((Array.isArray(it) ? it : []).map(v => ({ termine: v.termine, termineEn: v.termine_en ?? null, definizione: v.definizione })));
      setVociEn((Array.isArray(en) ? en : []).map(v => ({ termine: v.termine, definizione: v.definizione })));
      setCaricamento(false);
    }).catch(() => { if (vivo) { setErroreCaricamento(true); setCaricamento(false); } });
    return () => { vivo = false; };
  }, []);

  const lista = lingua === 'it' ? vociIt : vociEn;
  const filtrata = useMemo(() => {
    const q = rimuoviAccenti(ricerca.trim());
    if (!q) return lista;
    return lista.filter(v =>
      rimuoviAccenti(v.termine).includes(q) || (v.termineEn ? rimuoviAccenti(v.termineEn).includes(q) : false));
  }, [lista, ricerca]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column',
      // ⚠️ 0,72 (la stessa trasparenza del visore PDF, `processusVisualizzato` — copiata da
      // lì) lasciava TRASPARIRE l'intestazione vera di SERENITY dietro il titolo "DIZIONARIO
      // TECNICO", proprio nella sua stessa fascia — verificato dal vivo, le due scritte si
      // sovrapponevano ed erano illeggibili insieme. Il visore PDF non lo mostrava (il suo
      // titolo, il nome del file, è più corto e cade altrove) — non è un difetto suo da
      // correggere qui, solo un valore che qui non basta. Quasi opaco.
      background: 'rgba(6,9,13,0.95)', backdropFilter: 'blur(8px)', padding: 24,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        marginBottom: 14, flexShrink: 0, flexWrap: 'wrap',
      }}>
        <span style={{ fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-lg)', fontWeight: 700, color: '#fff' }}>
          {LC('DIZIONARIO TECNICO', 'DICTIONNAIRE TECHNIQUE', 'TECHNICAL DICTIONARY', 'DICCIONARIO TÉCNICO', 'TEKNISK ORDBOK')}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* ── DUE FONTI, DUE SCHEDE — l'italiano (completo, con incrocio inglese) e
              l'inglese (fonte a sé, "fair use quotes" — v. la nota in testa al file). */}
          <div style={{ display: 'flex', borderRadius: 999, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.24)' }}>
            {(['it', 'en'] as const).map(l => (
              <button key={l} onClick={() => { setLingua(l); setEspanso(null); }}
                style={{
                  border: 'none', cursor: 'pointer', padding: '6px 16px',
                  fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-sm)', fontWeight: 700,
                  background: lingua === l ? 'rgba(255,255,255,0.9)' : 'transparent',
                  color: lingua === l ? '#0b0f14' : 'rgba(255,255,255,0.75)',
                }}>
                {l === 'it'
                  ? LC('ITALIANO', 'ITALIEN', 'ITALIAN', 'ITALIANO', 'ITALIENSKA')
                  : LC('INGLESE', 'ANGLAIS', 'ENGLISH', 'INGLÉS', 'ENGELSKA')}
              </button>
            ))}
          </div>
          <button onClick={onClose} style={{
            border: 'none', background: 'rgba(255,255,255,0.12)', color: '#fff',
            borderRadius: 999, padding: '6px 16px', cursor: 'pointer',
            fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)',
          }}>
            {LC('chiudi', 'fermer', 'close', 'cerrar', 'stäng')}
          </button>
        </div>
      </div>

      <div style={{
        flex: 1, minHeight: 0, background: 'var(--s-disc)', borderRadius: 16,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--s-ink-ghost)', flexShrink: 0 }}>
          <input
            value={ricerca}
            onChange={e => setRicerca(e.target.value)}
            autoFocus
            placeholder={lingua === 'it'
              ? LC('cerca un termine, in italiano o in inglese…', 'cherche un terme, en italien ou en anglais…',
                  'search a term, in Italian or in English…', 'busca un término, en italiano o en inglés…',
                  'sök en term, på italienska eller engelska…')
              : LC('cerca un termine…', 'cherche un terme…', 'search a term…', 'busca un término…', 'sök en term…')}
            style={{
              width: '100%', border: '2px solid var(--s-reserve)', borderRadius: 10,
              background: 'transparent', outline: 'none', padding: '10px 14px',
              fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-base)', color: 'var(--s-ink)',
            }}
          />
          <div style={{
            marginTop: 8, fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-micro)',
            letterSpacing: '0.04em', color: 'var(--s-ink-faint)',
          }}>
            {caricamento
              ? LC('caricamento…', 'chargement…', 'loading…', 'cargando…', 'laddar…')
              : `${filtrata.length} / ${lista.length} ${LC('voci', 'entrées', 'entries', 'entradas', 'poster')}`}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {erroreCaricamento && (
            <div style={{ padding: 20, fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', color: 'var(--s-reserve)' }}>
              {LC('dizionario non trovato — riprova dopo aver ricostruito l\'app.',
                  'dictionnaire introuvable — réessaie après avoir reconstruit l\'app.',
                  'dictionary not found — try again after rebuilding the app.',
                  'diccionario no encontrado — vuelve a intentarlo tras reconstruir la app.',
                  'ordbok hittades inte — försök igen efter att appen byggts om.')}
            </div>
          )}
          {!caricamento && !erroreCaricamento && filtrata.length === 0 && (
            <div style={{ padding: 20, fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', color: 'var(--s-ink-faint)' }}>
              {LC('nessun termine trovato.', 'aucun terme trouvé.', 'no term found.', 'ningún término encontrado.', 'ingen term hittades.')}
            </div>
          )}
          {filtrata.map(v => {
            const aperta = espanso === v.termine;
            return (
              <div key={v.termine} style={{ borderBottom: '1px solid var(--s-ink-ghost)' }}>
                <button onClick={() => setEspanso(aperta ? null : v.termine)} style={{
                  display: 'flex', alignItems: 'baseline', gap: 10, width: '100%', textAlign: 'left',
                  border: 'none', background: 'transparent', cursor: 'pointer', padding: '9px 18px',
                  fontFamily: 'inherit',
                }}>
                  <span style={{
                    fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', fontWeight: 700,
                    color: aperta ? 'var(--s-reserve)' : 'var(--s-ink)',
                  }}>
                    {v.termine}
                  </span>
                  {v.termineEn && v.termineEn !== v.termine && (
                    <span style={{ fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-micro)', color: 'var(--s-ink-faint)' }}>
                      {v.termineEn}
                    </span>
                  )}
                </button>
                {aperta && (
                  <div style={{
                    padding: '0 18px 14px 18px', fontFamily: 'var(--s-serif)', fontSize: 'var(--s-fs-base)',
                    lineHeight: 1.55, color: 'var(--s-ink-soft)',
                  }}>
                    {v.definizione}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
