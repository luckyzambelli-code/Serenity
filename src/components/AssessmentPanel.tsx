import React from 'react';
import { GlassCollapseToggle } from './GlassCollapseToggle';
import { useUiStore } from '../store/uiStore';
import { glassSurface } from '../ui/panel3d';

/**
 * READ & INDICATION — un modulo, due viste.
 *
 * ASSESSMENT: l'auditor dà gli item a voce, le parole si iscrivono qui con la loro lettura e
 * restano tutta la seduta.
 *
 * INDICAZIONE: la domanda che l'assessment non pone — « questa reazione INDICA al preclear? ».
 * È l'R&I di sempre, e serve perché è l'unico criterio ESTERNO ai due aghi: misurato il
 * 02/08/2026 su 89 item, MUSE e METER hanno letto lo STESSO item una volta (κ di Cohen −0,09).
 * Non possono validarsi a vicenda; il preclear sì.
 *
 * Per questo, in vista INDICAZIONE, le due letture si mostrano SEPARATE: leggono item diversi, e
 * un verdetto unico nasconderebbe proprio il dato che si cerca.
 *
 * Le righe non sono solo gli item: in seduta l'ago reagisce anche fuori dall'assessment — sul
 * processo, su ciò che il preclear dice — e l'auditor indica QUELLE reazioni. Ogni reazione
 * mostrata apre quindi una riga validabile (`kind: 'reaction'`).
 */
export interface AssessmentItem {
  id: string;
  time: number;
  item: string;
  reaction: string;
  beforeMs?: number;
  /** `item` = dato a voce in assessment · `reaction` = l'ago ha reagito in seduta, senza item. */
  kind?: 'item' | 'reaction';
  /** Le due letture prese SEPARATAMENTE. Non si fondono: vedi sopra. */
  readMuse?: string;
  readMeter?: string;
  /** Il preclear ha confermato? `undefined` = non ancora validata. */
  indica?: boolean;
  /** Prova cieca: il preclear aveva dichiarato carica su questo item. */
  pcCarico?: boolean;
}

type Vista = 'assess' | 'ri';

interface AssessmentPanelProps {
  items:    AssessmentItem[];
  onHide:   () => void;
  t:        (key: string) => string;
  readMeta: (reaction: string) => { short: string; color: string; border: string };
  /** Contatore che sale a ogni avvio di ASSESSMENT: il pannello si APRE. Si avvia un
   *  assessment per vedere gli item e le loro letture — trovarlo chiuso obbligava ad aprirlo a
   *  mano mentre il preclear stava già parlando. Resta richiudibile: è un invito, non un blocco. */
  openSignal?: number;
  /** L'auditor registra la risposta del preclear. */
  onIndica?: (id: string, indica: boolean) => void;
  /** Ci sono entrambi gli strumenti: solo allora ha senso mostrare due colonne. */
  dueAghi?: boolean;
}

export function AssessmentPanel({ items, onHide, t, readMeta, openSignal,
                                 onIndica, dueAghi = false }: AssessmentPanelProps) {
  const isLightTheme = useUiStore(s => s.isLightTheme);
  // Collassabile: chiuso di default (solo header), si espande a richiesta.
  const [collapsed, setCollapsed] = React.useState(true);
  const [vista, setVista] = React.useState<Vista>('assess');
  // …e si apre da sé quando parte un ASSESSMENT.
  React.useEffect(() => { if (openSignal) setCollapsed(false); }, [openSignal]);

  const chiaro = isLightTheme;
  const testo = chiaro ? '#0f172a' : 'rgba(255,255,255,0.92)';
  const tenue = chiaro ? '#94a3b8' : 'rgba(255,255,255,0.4)';

  // In ASSESSMENT si guardano gli item: le reazioni sciolte di seduta sarebbero rumore. In
  // INDICAZIONE si guarda tutto, perché l'auditor indica anche fuori dall'assessment.
  const righe = vista === 'assess' ? items.filter(a => a.kind !== 'reaction') : items;
  const validate = items.filter(a => a.indica !== undefined);

  /** Quante volte la lettura di UN ago ha indicato al preclear. Il denominatore conta solo le
   *  righe in cui quell'ago aveva letto qualcosa: un ago che tace non sbaglia. */
  const resa = (leggi: (a: AssessmentItem) => string | undefined) => {
    const con = validate.filter(a => { const l = leggi(a); return l && l !== 'NULL'; });
    return { si: con.filter(a => a.indica).length, tot: con.length };
  };

  const pill = (attiva: boolean): React.CSSProperties => ({
    fontSize: 10, padding: '3px 10px', borderRadius: 6, cursor: 'pointer',
    letterSpacing: '0.06em', textTransform: 'uppercase',
    background: attiva ? (chiaro ? 'rgba(56,139,253,0.16)' : 'rgba(138,180,255,0.18)') : 'transparent',
    color: attiva ? (chiaro ? '#1d4ed8' : '#8ab4ff') : tenue,
  });

  return (
    <div
      className={`p-2 flex flex-col gap-1.5 ${collapsed ? '' : 'flex-[2] min-h-[220px]'}`}
      style={{
        ...glassSurface('right', isLightTheme, true),
        boxShadow: !collapsed ? (isLightTheme ? '0 16px 34px rgba(38,40,48,0.20), inset 0 1px 0 rgba(255,255,255,0.5)' : '0 16px 40px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.12)') : undefined,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between border-b pb-1 gap-2"
        style={{ borderColor: isLightTheme ? 'rgba(60,64,72,0.18)' : 'rgba(255,255,255,0.10)' }}
      >
        <span className={`text-xs uppercase tracking-wider shrink-0 ${collapsed ? (isLightTheme ? 'text-slate-400' : 'text-white/35') : (isLightTheme ? 'text-slate-700' : 'text-white/80')}`}>
          {vista === 'assess' ? 'ASSESSMENT' : 'R&I'}{righe.length > 0 ? ` · ${righe.length}` : ''}
        </span>
        <GlassCollapseToggle on={!collapsed} onToggle={() => setCollapsed(c => !c)} />
        {void onHide}
      </div>

      {/* Il selettore di vista sta su una RIGA SUA: accanto al titolo usciva dal pannello
          (la colonna è stretta ~250 px) e « Indicazione » restava tagliato a metà. */}
      {!collapsed && onIndica && (
        <div className="flex gap-0.5 rounded self-start" style={{ padding: 2,
               background: chiaro ? 'rgba(148,163,184,0.16)' : 'rgba(255,255,255,0.06)' }}>
          <button type="button" style={pill(vista === 'assess')} onClick={() => setVista('assess')}>
            {t('ri_view_assess')}
          </button>
          <button type="button" style={pill(vista === 'ri')} onClick={() => setVista('ri')}>
            {t('ri_view_indication')}
          </button>
        </div>
      )}

      {!collapsed && (
        <div className="flex-1 overflow-y-auto flex flex-col gap-1 min-h-0">
          {righe.length === 0 && (
            <span className="text-[11px] italic py-1" style={{ color: tenue }}>
              {vista === 'assess' ? t('assessment_empty') : t('ri_empty')}
            </span>
          )}
          {[...righe].reverse().map((a) => {   // DERNIÈRE parole prononcée = EN HAUT (demande user)
            const m = readMeta(a.reaction);
            return (
              <div
                key={a.id}
                // `items-start` e non `items-center`: con un item su due righe, il READ deve
                // restare in alto accanto alla prima, non scivolare a metà del blocco.
                // In R&I la riga va su DUE LINEE: item sopra, letture e bottoni sotto. Nella
                // colonna di destra (~250 px) affiancarli spremeva l'item fino a mandarlo a capo
                // UNA LETTERA PER RIGA — verificato in pagina.
                className={vista === 'ri'
                  ? 'flex flex-col gap-1 px-2 py-1 rounded'
                  : 'flex items-start justify-between gap-2 px-2 py-1 rounded'}
                style={{
                  background:  isLightTheme ? 'rgba(226,232,240,0.7)' : 'rgba(255,255,255,0.05)',
                  border:      `1px solid ${a.indica === true ? 'rgba(52,211,153,0.55)'
                                          : a.indica === false ? 'rgba(255,255,255,0.14)' : m.border}`,
                }}
              >
                <span className="flex items-baseline gap-1.5 min-w-0" title={a.item}>
                  <span className="text-[10px] shrink-0" style={{ color: tenue }}>
                    [{a.time.toFixed(0)}s]
                  </span>
                  {/* ── L'ITEM SI LEGGE PER INTERO ────────────────────────────────────────
                      Era TRONCATO: un item lungo finiva in « … » e l'auditor che doveva
                      RIPRENDERLO non sapeva più cosa aveva detto (segnalato in seduta). Ora va
                      a capo — leggerlo conta più che tenere le righe alte uguali — e il testo
                      completo resta anche nel titolo, per chi passa il mouse. */}
                  <span className="text-[13px] font-mono" style={{ color: testo,
                                   whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.35 }}>
                    {a.item}
                  </span>
                </span>

                {vista === 'assess' ? (
                  <span className="text-[13px] font-mono font-bold shrink-0 flex items-baseline gap-1" style={{ color: m.color }}>
                    {m.short}
                    {a.reaction !== 'NULL' && a.reaction !== '⏳' && a.beforeMs ? (
                      <span className="text-[10px] font-normal" style={{ color: isLightTheme ? '#64748b' : 'rgba(255,255,255,0.5)' }}>−{a.beforeMs}ms</span>
                    ) : null}
                  </span>
                ) : (
                  <span className="flex items-center gap-2 justify-between w-full">
                    {/* LE DUE LETTURE, SEPARATE. Con un ago solo si mostra quella che c'è. */}
                    {dueAghi ? (
                      <span className="flex items-center gap-1.5">
                        <Lettura sigla="M" valore={a.readMuse} colore="#8ab4ff" tenue={tenue} />
                        <Lettura sigla="T" valore={a.readMeter} colore="#fbbf24" tenue={tenue} />
                      </span>
                    ) : (
                      <span className="text-[12px] font-mono font-bold" style={{ color: m.color }}>{m.short}</span>
                    )}
                    {a.indica === undefined ? (
                      <span className="flex gap-1">
                        {/* Due bottoni sulla riga, non una finestra: l'auditor indica QUANDO
                            decide lui, e può validare anche tre item dopo. */}
                        <button type="button" onClick={() => onIndica?.(a.id, true)}
                          title={t('ri_indicates')}
                          className="text-[10px] px-2 py-0.5 rounded"
                          style={{ border: '1px solid rgba(52,211,153,0.5)', color: '#34d399',
                                   background: 'transparent', cursor: 'pointer' }}>
                          {t('ri_yes')}
                        </button>
                        <button type="button" onClick={() => onIndica?.(a.id, false)}
                          title={t('ri_does_not_indicate')}
                          className="text-[10px] px-2 py-0.5 rounded"
                          style={{ border: `1px solid ${chiaro ? 'rgba(100,116,139,0.5)' : 'rgba(255,255,255,0.28)'}`,
                                   color: tenue, background: 'transparent', cursor: 'pointer' }}>
                          {t('ri_no')}
                        </button>
                      </span>
                    ) : (
                      // Si può cambiare idea: un clic sulla scritta rimette i due bottoni.
                      <button type="button" onClick={() => onIndica?.(a.id, !a.indica)}
                        className="text-[10px] px-1.5 py-0.5 rounded"
                        style={{ background: 'transparent', cursor: 'pointer', border: 'none',
                                 color: a.indica ? '#34d399' : tenue }}>
                        {a.indica ? `✓ ${t('ri_indicates')}` : `✗ ${t('ri_does_not_indicate')}`}
                      </button>
                    )}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── IL CONTO ─────────────────────────────────────────────────────────────────────────
          Quante volte la lettura di ciascun ago ha indicato al preclear. È la sola forma in cui
          « quale dei due segue la carica » ha una risposta, perché il criterio non viene da
          nessuno dei due strumenti. Compare solo quando c'è qualcosa da contare. */}
      {!collapsed && vista === 'ri' && validate.length > 0 && (
        <div className="flex gap-2 pt-1 border-t"
             style={{ borderColor: chiaro ? 'rgba(60,64,72,0.18)' : 'rgba(255,255,255,0.10)' }}>
          {dueAghi ? (
            <>
              <Conto etichetta="MUSE"  colore="#8ab4ff" {...resa(a => a.readMuse)} />
              <Conto etichetta="METER" colore="#fbbf24" {...resa(a => a.readMeter)} />
            </>
          ) : (
            <Conto etichetta={t('ri_indicates')} colore="#34d399"
                   {...resa(a => a.reaction)} />
          )}
        </div>
      )}
    </div>
  );
}

/** Una lettura con la sigla del suo ago. `—` quando quell'ago non ha visto niente: è un dato,
 *  non un vuoto — su 89 item il MUSE ha letto da solo 31 volte e il meter 6. */
function Lettura({ sigla, valore, colore, tenue }:
                 { sigla: string; valore?: string; colore: string; tenue: string }) {
  const vuoto = !valore || valore === 'NULL';
  return (
    <span className="text-[10px] font-mono flex items-baseline gap-0.5"
          style={{ color: vuoto ? tenue : colore }}>
      <span style={{ opacity: 0.7 }}>{sigla}</span>
      <span style={{ fontWeight: vuoto ? 400 : 700 }}>{vuoto ? '—' : valore}</span>
    </span>
  );
}

function Conto({ etichetta, colore, si, tot }:
               { etichetta: string; colore: string; si: number; tot: number }) {
  return (
    <span className="text-[10px] font-mono flex items-baseline gap-1">
      <span style={{ color: colore, opacity: 0.85 }}>{etichetta}</span>
      <span style={{ color: colore, fontWeight: 700 }}>{si}/{tot}</span>
    </span>
  );
}
