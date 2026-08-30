import React from 'react';
import { BookOpen } from 'lucide-react';
import { GlassCollapseToggle } from './GlassCollapseToggle';
import {
  isServerAvailable,
  serverSaveProcessus, serverDeleteProcessus, serverProcessusUrl,
} from '../lib/serverStorage';
import { saveProcessusFile, deleteProcessusFile } from '../lib/storage';
import { useUiStore } from '../store/uiStore';
import { useI18n } from '../i18n';
import { pick5 } from '../i18n5';
import type { Procedimento } from '../lib/procedimenti';

export interface ProcessusEntry {
  name: string;
  url:  string;
  tag:  string;
  _id?: string;
}

interface ProcessusModalProps {
  processusPdfs:     ProcessusEntry[];
  setProcessusPdfs:  React.Dispatch<React.SetStateAction<ProcessusEntry[]>>;
  pendingFiles:      { name: string; url: string }[];
  setPendingFiles:   React.Dispatch<React.SetStateAction<{ name: string; url: string }[]>>;
  pendingTagInput:   string;
  setPendingTagInput: React.Dispatch<React.SetStateAction<string>>;
  processusTagFilter: string;
  setProcessusTagFilter: React.Dispatch<React.SetStateAction<string>>;
  editingTag:        string | null;
  setEditingTag:     React.Dispatch<React.SetStateAction<string | null>>;
  editingTagValue:   string;
  setEditingTagValue: React.Dispatch<React.SetStateAction<string>>;
  onSelectProcessus: (entry: { id: number; name: string; url: string }) => void;
  onClose:           () => void;
  t: (key: string) => string;
  /** ⚠️ SOLO SERENITY — segnalato: « consenti la selezione di procedimenti presenti nella
   *  cartella COMANDI/Procedimenti ». Tre prop opzionali, tutte assenti di default: senza di
   *  loro (App.tsx/EQUILIBRIUM non le passa) questo componente resta TALE E QUALE a prima,
   *  nessuna sezione nuova nel suo schermo. Con `procedimenti` presente (anche vuoto),
   *  compare la riga PROCEDIMENTI sopra la griglia dei PDF. */
  procedimenti?: Procedimento[];
  onSelectProcedimento?: (p: Procedimento) => void;
  onApriCartellaProcedimenti?: () => void;
}

export function ProcessusModal({
  processusPdfs, setProcessusPdfs,
  pendingFiles, setPendingFiles,
  pendingTagInput, setPendingTagInput,
  processusTagFilter, setProcessusTagFilter,
  editingTag, setEditingTag,
  editingTagValue, setEditingTagValue,
  onSelectProcessus, onClose, t,
  procedimenti, onSelectProcedimento, onApriCartellaProcedimenti,
}: ProcessusModalProps) {
  // La lingua non arrivava fra le props: il segnaposto del campo restava in francese per tutti.
  const { lang } = useI18n();
  const L = (it: string, fr: string, en: string, es: string, sv: string) =>
    pick5(lang as string, it, fr, en, es, sv);
  const allTags      = Array.from(new Set(processusPdfs.map(p => p.tag || 'General'))).sort();
  const visiblePdfs  = processusTagFilter === 'all'
    ? processusPdfs
    : processusPdfs.filter(p => (p.tag || 'General') === processusTagFilter);

  // FIX #3: the modal ignored the theme and stayed dark in Light mode. Read the
  // theme and resolve the main surfaces from a small palette below.
  const lt = useUiStore(s => s.isLightTheme);
  const th = {
    overlay: lt ? 'radial-gradient(ellipse at 50% 30%, rgba(226,236,248,0.97) 0%, rgba(203,216,236,0.99) 100%)'
                : 'radial-gradient(ellipse at 50% 28%, rgba(42,42,48,0.96) 0%, rgba(20,20,24,0.99) 100%)',
    panel:   lt ? 'linear-gradient(160deg, #f3f7fc 0%, #e6eef8 100%)'
                : 'linear-gradient(160deg, rgba(44,44,50,0.62) 0%, rgba(30,30,34,0.72) 100%)',
    panelBorder: lt ? 'rgba(8,145,178,0.35)' : 'rgba(255,255,255,0.12)',
    panelShadow: lt ? '0 0 40px rgba(8,145,178,0.18)' : '0 24px 60px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.10)',
    divider: lt ? 'rgba(8,145,178,0.18)' : 'rgba(255,255,255,0.15)',
    accent:  lt ? '#0e7490' : 'rgba(240,246,255,0.95)',          // readable cyan on each bg
    accentSoft: lt ? 'rgba(8,145,178,0.10)' : 'rgba(255,255,255,0.06)',
    accentBorder: lt ? 'rgba(8,145,178,0.35)' : 'rgba(255,255,255,0.25)',
    text:    lt ? '#0f172a' : 'rgba(255,255,255,0.85)',
    textDim: lt ? '#64748b' : 'rgba(255,255,255,0.45)',
    card:    lt ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.05)',
    cardBorder: lt ? 'rgba(8,145,178,0.20)' : 'rgba(255,255,255,0.1)',
  };
  const tagCount = (tag: string) => processusPdfs.filter(p => (p.tag || 'General') === tag).length;

  const groupedByTag: Record<string, ProcessusEntry[]> = {};
  visiblePdfs.forEach(p => {
    const tag = p.tag || 'General';
    if (!groupedByTag[tag]) groupedByTag[tag] = [];
    groupedByTag[tag].push(p);
  });

  /** Save pending files after tag is confirmed */
  const commitPendingFiles = async (tag: string) => {
    if (pendingFiles.length === 0) return;
    const serverUp = await isServerAvailable();
    const newEntries: ProcessusEntry[] = [];
    for (const f of pendingFiles) {
      const id = `proc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      if (serverUp) {
        await serverSaveProcessus(id, f.name, tag, f.url).catch(() => {});
        newEntries.push({ name: f.name, tag, url: serverProcessusUrl(id), _id: id });
      } else {
        try {
          const res2 = await fetch(f.url);
          const buf  = await res2.arrayBuffer();
          await saveProcessusFile(id, f.name, tag, buf);
        } catch (_) {}
        newEntries.push({ ...f, tag, _id: id });
      }
    }
    setProcessusPdfs(prev => [...prev, ...newEntries]);
    setPendingFiles([]);
    setPendingTagInput('');
  };

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center"
      style={{
        background: th.overlay,
        backdropFilter: 'blur(24px)',
      }}
    >
      {/* Ambient grid */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }} />

      {/* Main panel */}
      <div
        className="relative w-full max-w-5xl mx-6 flex flex-col rounded-2xl overflow-hidden"
        style={{
          border: `1px solid ${th.panelBorder}`,
          boxShadow: th.panelShadow,
          background: th.panel,
          maxHeight: '90vh',
        }}
      >
        {/* Top accent line */}
        <div className="h-px w-full" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), rgba(100,180,255,0.6), transparent)' }} />

        {/* Header */}
        <div className="px-6 py-4 border-b flex flex-col gap-3" style={{ borderColor: th.divider }}>
          {/* Top row: title + close */}
          <div className="flex items-center gap-3">
            <div className="relative w-9 h-9 flex items-center justify-center rounded-lg flex-shrink-0"
              style={{ background: lt ? 'linear-gradient(135deg, rgba(8,145,178,0.18), rgba(8,145,178,0.08))' : 'linear-gradient(135deg, rgba(255,255,255,0.2), rgba(0,100,200,0.1))', border: `1px solid ${th.accentBorder}`, boxShadow: lt ? 'none' : '0 0 12px rgba(255,255,255,0.3)' }}>
              <BookOpen size={18} style={{ color: th.accent }} />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-mono font-bold tracking-[0.3em] uppercase" style={{ color: th.accent, textShadow: lt ? 'none' : '0 0 12px rgba(255,255,255,0.6)' }}>
                {t('processus_modal_title')}
              </h3>
              <p className="text-[10px] font-mono tracking-widest uppercase" style={{ color: th.textDim }}>
                {processusPdfs.length} PROCESSUS · {allTags.length} TAG{allTags.length !== 1 ? 'S' : ''}
              </p>
            </div>
            {/* Fermeture en MINI TOGGLE (cohérence graphique) : on = panneau ouvert. */}
            <GlassCollapseToggle on onToggle={() => { onClose(); setPendingFiles([]); setPendingTagInput(''); }} title={t('tip_close')} />
          </div>

          {/* FIX #2: tag chips on their OWN full-width row — bigger, themed, with per-tag counts */}
          <div className="flex items-center gap-2 flex-wrap">
            {(() => {
              const chipStyle = (active: boolean): React.CSSProperties => ({
                border: `1px solid ${active ? th.accent : th.accentBorder}`,
                background: active ? (lt ? 'rgba(8,145,178,0.14)' : 'rgba(255,255,255,0.15)') : th.accentSoft,
                color: active ? th.accent : th.textDim,
                boxShadow: active && !lt ? '0 0 10px rgba(255,255,255,0.3)' : 'none',
              });
              const countBadge = { background: lt ? 'rgba(8,145,178,0.12)' : 'rgba(255,255,255,0.15)' };
              return (<>
                <button onClick={() => setProcessusTagFilter('all')}
                  title={L('mostra tutti i processus', 'afficher tous les processus', 'show all processus',
                    'mostrar todos los processus', 'visa alla processus')}
                  className="px-3.5 py-1.5 rounded-full text-[11px] font-mono tracking-widest uppercase transition-all flex items-center gap-1.5"
                  style={chipStyle(processusTagFilter === 'all')}>
                  ◈ ALL
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={countBadge}>{processusPdfs.length}</span>
                </button>
                {allTags.map(tag => (
                  <div key={tag} className="relative group/tagchip">
                    {editingTag === tag ? (
                      <input
                        autoFocus
                        value={editingTagValue}
                        onChange={e => setEditingTagValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            const newTag = editingTagValue.trim() || tag;
                            if (newTag !== tag) {
                              setProcessusPdfs(prev => prev.map(p =>
                                (p.tag || 'General') === tag ? { ...p, tag: newTag } : p
                              ));
                              isServerAvailable().then(async up => {
                                if (!up) return;
                                const toRename = processusPdfs.filter(p => (p.tag || 'General') === tag);
                                for (const f of toRename) {
                                  if (f._id) await serverSaveProcessus(f._id, f.name, newTag, serverProcessusUrl(f._id)).catch(() => {});
                                }
                              });
                              if (processusTagFilter === tag) setProcessusTagFilter(newTag);
                            }
                            setEditingTag(null);
                          }
                          if (e.key === 'Escape') setEditingTag(null);
                        }}
                        onBlur={() => setEditingTag(null)}
                        className="px-3.5 py-1.5 rounded-full text-[11px] font-mono tracking-widest uppercase outline-none"
                        style={{ border: `1px solid ${th.accent}`, background: lt ? 'rgba(8,145,178,0.14)' : 'rgba(255,255,255,0.15)', color: th.accent, width: `${Math.max(70, editingTagValue.length * 9)}px` }}
                      />
                    ) : (
                      <button
                        onClick={() => setProcessusTagFilter(tag)}
                        onDoubleClick={() => { setEditingTag(tag); setEditingTagValue(tag); }}
                        title={t('tip_filter_rename')}
                        className="px-3.5 py-1.5 rounded-full text-[11px] font-mono tracking-widest uppercase transition-all flex items-center gap-1.5"
                        style={chipStyle(processusTagFilter === tag)}>
                        ⬡ {tag}
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={countBadge}>{tagCount(tag)}</span>
                        <span className="opacity-0 group-hover/tagchip:opacity-60 text-[9px] transition-opacity ml-0.5">✎</span>
                      </button>
                    )}
                  </div>
                ))}
              </>);
            })()}
          </div>
        </div>

        {/* Pending file tag-input overlay */}
        {pendingFiles.length > 0 && (
          <div className="px-6 py-4 border-b flex items-center gap-4" style={{ borderColor: th.divider, background: lt ? 'rgba(8,145,178,0.08)' : 'rgba(0,50,120,0.3)' }}>
            <div className="flex-1">
              <p className="text-[11px] font-mono mb-2" style={{ color: th.accent }}>
                ◈ {pendingFiles.length} FILE{pendingFiles.length > 1 ? 'S' : ''} SELECTED — ASSIGN TAG FAMILY
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={pendingTagInput}
                  onChange={e => setPendingTagInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') commitPendingFiles(pendingTagInput.trim() || 'General'); }}
                  placeholder={L('es: SUPPRESSION · LISTE · ARC · DIANETICS', "ex : SUPPRESSION · LISTE · ARC · DIANÉTIQUE", 'e.g. SUPPRESSION · LIST · ARC · DIANETICS', 'p. ej.: SUPPRESSION · LISTE · ARC · DIANETICS', 't.ex. SUPPRESSION · LISTE · ARC · DIANETICS')}
                  autoFocus
                  className="flex-1 bg-transparent border-b px-2 py-1 text-xs font-mono outline-none placeholder:opacity-30"
                  style={{ borderColor: 'rgba(255,255,255,0.4)', color: 'rgba(240,246,255,0.95)' }}
                />
                {allTags.map(tag => (
                  <button key={tag} onClick={() => setPendingTagInput(tag)}
                    className="px-2 py-1 rounded text-[10px] font-mono transition-all hover:bg-cyan-500/20"
                    style={{ border: '1px solid rgba(255,255,255,0.25)', color: 'rgba(255,255,255,0.6)' }}>
                    {tag}
                  </button>
                ))}
                <button
                  onClick={() => commitPendingFiles(pendingTagInput.trim() || 'General')}
                  className="px-4 py-1 rounded text-xs font-mono font-bold transition-all"
                  style={{ background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.6)', color: 'rgba(240,246,255,0.95)', boxShadow: '0 0 8px rgba(255,255,255,0.2)' }}>
                  ADD ↵
                </button>
                <button
                  onClick={() => { setPendingFiles([]); setPendingTagInput(''); }}
                  title={L('annulla', 'annuler', 'cancel', 'cancelar', 'avbryt')}
                  className="px-2 py-1 rounded text-[10px] font-mono transition-all hover:bg-red-500/20"
                  style={{ color: 'rgba(255,80,80,0.6)', border: '1px solid rgba(255,80,80,0.2)' }}>
                  ✕
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── PROCEDIMENTI — SOLO SERENITY (v. la nota sulla prop `procedimenti`, sopra).
            Diversi dai PDF sopra: non un file da aprire in un iframe, ma un testo strutturato
            (`~/EQUILIBRIUM/COMANDI/Procedimenti/*.txt`, un comando per riga) da versare,
            selezionandolo, nello spazio comandi dei cicli. `procedimenti !== undefined` è la
            guardia: `undefined` (EQUILIBRIUM, che non passa la prop) non disegna nulla qui.
            ⚠️ MESSA IN EVIDENZA — segnalato: « il Bottone Processus... deve aprire processus in
            generale, ma mettere in evidenza la zona Processu Command ». Il bottone accanto a EP
            (rinominato COMMANDS, v. `Serenity.tsx`) apre questo STESSO modale generale, PDF
            compresi — non un secondo popup — ma chi arriva da lì cerca quasi sempre questa
            sezione, non l'archivio PDF sotto. Prima era un blocco fra tanti, stesso bordo
            sottile (`border-b`) del resto: ora una card a sé, fondo/bordo dell'accento invece
            del grigio neutro, un lieve alone (`boxShadow`) — la stessa lingua visiva che già
            marca "selezionato"/"attivo" altrove nel modale (v. `chipStyle`, sopra), non un
            colore nuovo inventato qui. */}
        {procedimenti !== undefined && (
          <div className="px-6 py-4 border-b flex flex-col gap-2" style={{ borderColor: th.divider }}>
            <div className="rounded-xl px-4 py-3 flex flex-col gap-2" style={{
              background: th.accentSoft, border: `1.5px solid ${th.accent}`,
              boxShadow: lt ? '0 0 0 1px rgba(8,145,178,0.08)' : '0 0 16px rgba(255,255,255,0.10)',
            }}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono font-bold tracking-[0.35em] uppercase" style={{ color: th.accent, textShadow: lt ? 'none' : '0 0 10px rgba(255,255,255,0.4)' }}>
                  ◆ {L('COMANDI PROCEDIMENTI', 'COMMANDES DE PROCÉDÉS', 'PROCEDURES COMMANDS', 'COMANDOS DE PROCEDIMIENTOS', 'PROCEDURKOMMANDON')}
                </span>
                {onApriCartellaProcedimenti && (
                  <button onClick={onApriCartellaProcedimenti}
                    title={L('apri (o crea) la cartella dei procedimenti', 'ouvrir (ou créer) le dossier des procédés',
                      'open (or create) the procedures folder', 'abrir (o crear) la carpeta de procedimientos',
                      'öppna (eller skapa) mappen med procedurer') as string}
                    className="text-[10px] font-mono tracking-widest uppercase px-2.5 py-1 rounded-full transition-all"
                    style={{ border: `1px solid ${th.accent}`, color: th.accent, background: 'transparent' }}>
                    {L('apri cartella', 'ouvrir le dossier', 'open folder', 'abrir carpeta', 'öppna mapp')}
                  </button>
                )}
              </div>
              {procedimenti.length === 0 ? (
                <p className="text-[11px] font-mono" style={{ color: th.text }}>
                  {L('nessun procedimento — un file .txt per procedimento, un comando per riga',
                    'aucun procédé — un fichier .txt par procédé, une commande par ligne',
                    'no procedures — one .txt file per procedure, one command per line',
                    'ningún procedimiento — un archivo .txt por procedimiento, un comando por línea',
                    'inga procedurer — en .txt-fil per procedur, ett kommando per rad')}
                </p>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  {procedimenti.map(p => (
                    <button key={p.nome} onClick={() => onSelectProcedimento?.(p)}
                      title={`${p.comandi.length} ${L('comandi', 'commandes', 'commands', 'comandos', 'kommandon')}`}
                      className="px-3.5 py-1.5 rounded-full text-[11px] font-mono tracking-widest uppercase transition-all flex items-center gap-1.5"
                      style={{ border: `1px solid ${th.accent}`, background: lt ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.08)', color: th.text }}>
                      ▸ {p.nome}
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: lt ? 'rgba(8,145,178,0.12)' : 'rgba(255,255,255,0.15)' }}>
                        {p.comandi.length}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Content — grouped by tag */}
        <div className="flex-1 overflow-y-auto px-6 py-4" style={{ minHeight: 0 }}>
          {processusPdfs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{ border: `1px solid ${th.accentBorder}`, background: th.accentSoft }}>
                <BookOpen size={28} style={{ color: th.accent }} />
              </div>
              <p className="text-xs font-mono tracking-widest uppercase" style={{ color: th.textDim }}>
                {t('processus_empty')}
              </p>
            </div>
          )}

          {Object.entries(groupedByTag).map(([tag, pdfs]) => (
            <div key={tag} className="mb-8">
              {/* Tag section header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center gap-2 px-3 py-1 rounded-full"
                  style={{ background: th.accentSoft, border: `1px solid ${th.accentBorder}`, boxShadow: lt ? 'none' : '0 0 10px rgba(255,255,255,0.1)' }}>
                  <span className="text-[10px] font-mono font-bold tracking-[0.35em] uppercase" style={{ color: th.accent }}>
                    ⬡ {tag}
                  </span>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full"
                    style={{ background: lt ? 'rgba(8,145,178,0.12)' : 'rgba(255,255,255,0.15)', color: th.accent }}>
                    {pdfs.length}
                  </span>
                </div>
                <div className="flex-1 h-px" style={{ background: lt ? 'linear-gradient(90deg, rgba(8,145,178,0.3), transparent)' : 'linear-gradient(90deg, rgba(255,255,255,0.3), transparent)' }} />
              </div>

              {/* PDF cards grid */}
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
                {pdfs.map((p, i) => {
                  const globalIdx = processusPdfs.indexOf(p);
                  return (
                    <div
                      key={i}
                      title={p.name}
                      className="relative group cursor-pointer flex flex-col items-center gap-2 p-3 rounded-xl transition-all duration-200"
                      style={{
                        background: th.card,
                        border: `1px solid ${th.cardBorder}`,
                        boxShadow: lt ? '0 4px 16px rgba(30,60,100,0.12)' : '0 4px 20px rgba(0,0,0,0.4)',
                        transform: 'perspective(600px) rotateX(2deg)',
                      }}
                      onMouseEnter={e => {
                        const el = e.currentTarget as HTMLDivElement;
                        el.style.transform = 'perspective(600px) rotateX(0deg) translateY(-4px) scale(1.04)';
                        el.style.boxShadow = lt ? '0 8px 26px rgba(8,145,178,0.20), 0 0 0 1px rgba(8,145,178,0.35)' : '0 8px 30px rgba(0,180,255,0.25), 0 0 0 1px rgba(255,255,255,0.4)';
                        el.style.background = lt ? 'rgba(255,255,255,0.97)' : 'rgba(0,40,90,0.7)';
                      }}
                      onMouseLeave={e => {
                        const el = e.currentTarget as HTMLDivElement;
                        el.style.transform = 'perspective(600px) rotateX(2deg)';
                        el.style.boxShadow = lt ? '0 4px 16px rgba(30,60,100,0.12)' : '0 4px 20px rgba(0,0,0,0.4)';
                        el.style.background = th.card;
                      }}
                      onClick={() => {
                        onSelectProcessus({ id: Date.now(), name: p.name, url: p.url });
                        onClose();
                      }}
                    >
                      {/* 3D book spine */}
                      <div className="relative flex-shrink-0" style={{ width: 56, height: 72 }}>
                        <div className="absolute inset-0 rounded-sm flex items-center justify-center"
                          style={{
                            background: 'linear-gradient(135deg, rgba(0,60,140,0.8), rgba(0,20,60,0.9))',
                            border: '1px solid rgba(255,255,255,0.25)',
                          }}>
                          <BookOpen size={22} style={{ color: 'rgba(255,255,255,0.6)' }} />
                        </div>
                        {/* Spine shadow */}
                        <div className="absolute left-0 top-1 bottom-1 w-2 rounded-l-sm"
                          style={{ background: 'rgba(0,0,0,0.4)', borderRight: '1px solid rgba(255,255,255,0.1)' }} />
                      </div>

                      {/* File name */}
                      <span className="text-center text-[10px] font-mono leading-tight line-clamp-2"
                        style={{ color: th.text, maxWidth: '100%', wordBreak: 'break-word' }}>
                        {p.name}
                      </span>

                      {/* Tag badge — theme-aware so it stays readable in Light mode */}
                      <span className="text-[8px] font-mono px-1.5 py-0.5 rounded-full"
                        style={{ background: lt ? 'rgba(8,145,178,0.12)' : 'rgba(255,255,255,0.1)', border: `1px solid ${th.accentBorder}`, color: th.accent }}>
                        {p.tag}
                      </span>

                      {/* Delete button */}
                      <button
                        onClick={e2 => {
                          e2.stopPropagation();
                          const entry = processusPdfs[globalIdx];
                          if (entry?._id) {
                            isServerAvailable().then(up => {
                              if (up) serverDeleteProcessus(entry._id!).catch(() => {});
                              else    deleteProcessusFile(entry._id!).catch(() => {});
                            });
                          }
                          setProcessusPdfs(prev => prev.filter((_, j) => j !== globalIdx));
                        }}
                        title={L('elimina', 'supprimer', 'delete', 'eliminar', 'ta bort')}
                        className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ background: 'rgba(200,0,0,0.5)', border: '1px solid rgba(255,60,60,0.4)', color: 'rgba(255,180,180,0.9)' }}>
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer — upload zone */}
        <div className="px-6 pb-5 pt-3 border-t" style={{ borderColor: th.divider }}>
          <label
            className="flex items-center justify-center gap-3 py-4 rounded-xl cursor-pointer transition-all"
            style={{ border: `1px dashed ${th.accentBorder}`, background: th.accentSoft, color: th.accent }}
            onMouseEnter={e => { const el = e.currentTarget as HTMLLabelElement; el.style.background = lt ? 'rgba(8,145,178,0.14)' : 'rgba(255,255,255,0.08)'; el.style.borderColor = th.accent; }}
            onMouseLeave={e => { const el = e.currentTarget as HTMLLabelElement; el.style.background = th.accentSoft; el.style.borderColor = th.accentBorder; }}
          >
            <input
              type="file"
              accept="application/pdf"
              multiple
              className="hidden"
              onChange={e2 => {
                const files  = Array.from(e2.target.files || []) as File[];
                const mapped = files.map(f => ({ name: f.name.replace(/\.pdf$/i, ''), url: URL.createObjectURL(f) }));
                setPendingFiles(mapped);
                setPendingTagInput('');
                e2.target.value = '';
              }}
            />
            <span className="text-xs font-mono tracking-[0.3em] uppercase">⊕ {t('processus_add_button')}</span>
          </label>
        </div>

        {/* Bottom accent line */}
        <div className="h-px w-full" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)' }} />
      </div>
    </div>
  );
}
