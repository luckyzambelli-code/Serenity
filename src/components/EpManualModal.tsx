import React, { type Dispatch, type SetStateAction } from 'react';
import { useI18n } from '../i18n';
import { GlassCollapseToggle } from './GlassCollapseToggle';
import { LAYER } from '../ui/layers';

/**
 * EpManualModal — saisie MANUELLE de l'EP par l'auditeur : type de réaction, réalisation du
 * préclair, VGI/VVGI, note. Sortie de App.tsx où elle vivait au milieu du panneau central.
 *
 * Tout son état vient du hook `useEpValidation` : il reste dans App (une seule instance) et
 * descend ici en props. Déplacée telle quelle — aucun changement de comportement.
 */
export interface EpManualModalProps {
  reactionType: string;
  setReactionType: Dispatch<SetStateAction<string>>;
  realization: string;
  setRealization: Dispatch<SetStateAction<string>>;
  vgi: boolean;
  setVgi: Dispatch<SetStateAction<boolean>>;
  vvgi: boolean;
  setVvgi: Dispatch<SetStateAction<boolean>>;
  auditorNote: string;
  setAuditorNote: Dispatch<SetStateAction<string>>;
  timestamp: number | null;
  onClose: () => void;
  onValidate: () => void;
}

export function EpManualModal({
  reactionType, setReactionType, realization, setRealization,
  vgi, setVgi, vvgi, setVvgi, auditorNote, setAuditorNote,
  timestamp, onClose, onValidate,
}: EpManualModalProps) {
  const { t } = useI18n();
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-auto"
      style={{ zIndex: LAYER.modal, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)' }}>
      <div className="rounded-2xl p-6 flex flex-col gap-4"
        style={{ background: 'rgba(26,26,30,0.96)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.14)', boxShadow: '0 24px 60px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.12)', minWidth: 420, maxWidth: 520 }}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="font-mono font-bold text-lg tracking-widest" style={{ color: 'rgba(240,246,255,0.95)', textShadow: '0 0 12px rgba(255,255,255,0.6)' }}>✦ {t('ep_modal_title')}</div>
            <div className="text-[10px] font-mono opacity-50 mt-0.5" style={{ color: 'rgba(240,246,255,0.95)' }}>
              {timestamp !== null ? `${String(Math.floor(timestamp / 60)).padStart(2,'0')}:${String(Math.floor(timestamp % 60)).padStart(2,'0')}` : ''}
              {' '}— {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
          </div>
          {/* Fermeture EP en MINI TOGGLE (cohérence graphique) : on = panneau ouvert. */}
          <GlassCollapseToggle on onToggle={() => onClose()} title={t('tip_close') as string} />
        </div>

        {/* Réaction aiguille */}
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest opacity-60 block mb-1" style={{ color: 'rgba(240,246,255,0.95)' }}>{t('ep_needle_reaction')}</label>
          <select value={reactionType} onChange={e => setReactionType(e.target.value)}
            className="w-full px-3 py-2 rounded outline-none tracking-normal"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.30)', color: 'rgba(240,246,255,0.95)', fontSize: 13, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', letterSpacing: '0' }}>
            {['F/N (Floating)','LF Blow Down','Long Fall','Fall','SF'].map(r => (
              <option key={r} value={r} style={{ background: '#040e1e' }}>{r}</option>
            ))}
          </select>
        </div>

        {/* Réalisation du PC */}
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest opacity-60 block mb-1" style={{ color: 'rgba(240,246,255,0.95)' }}>{t('ep_pc_realization')}</label>
          <textarea
            value={realization} onChange={e => setRealization(e.target.value)}
            placeholder={t('ep_realization_placeholder')}
            rows={3}
            className="w-full px-3 py-2 rounded outline-none resize-none tracking-normal"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.30)',
              color: 'rgba(240,246,255,0.95)',
              fontSize: 14,
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              lineHeight: '1.6',
              letterSpacing: '0',
              wordSpacing: 'normal' }}
          />
        </div>

        {/* Indicatori del PC — chip cliccabili, mutuamente esclusive (niente
            etichetta separata: la scritta È il bottone). VVGI = PC troppo contento
            (indicatori ancora migliori di VGI). */}
        <div className="flex items-center gap-2">
          <button onClick={() => { setVgi(v => !v); setVvgi(false); }}
            className="px-4 py-2 rounded font-mono text-[12px] font-bold transition-all"
            style={{
              background: vgi ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${vgi ? 'rgba(255,255,255,0.60)' : 'rgba(255,255,255,0.15)'}`,
              color: vgi ? 'rgba(240,246,255,0.95)' : 'rgba(255,255,255,0.45)',
              cursor: 'pointer' }}>
            {vgi ? '✓ VGI' : 'VGI'}
          </button>
          <button onClick={() => { setVvgi(v => !v); setVgi(false); }}
            className="px-4 py-2 rounded font-mono text-[12px] font-bold transition-all"
            style={{
              background: vvgi ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${vvgi ? 'rgba(255,255,255,0.60)' : 'rgba(255,255,255,0.15)'}`,
              color: vvgi ? 'rgba(240,246,255,0.95)' : 'rgba(255,255,255,0.45)',
              cursor: 'pointer' }}>
            {vvgi ? '✓ VVGI' : 'VVGI'}
          </button>
        </div>

        {/* Note auditeur */}
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest opacity-60 block mb-1" style={{ color: 'rgba(240,246,255,0.95)' }}>{t('ep_auditor_note_label')}</label>
          <input type="text"
            value={auditorNote} onChange={e => setAuditorNote(e.target.value)}
            placeholder={t('ep_observations')}
            className="w-full px-3 py-2 rounded outline-none"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.30)',
              color: 'rgba(240,246,255,0.95)',
              fontSize: 13,
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              letterSpacing: '0',
              wordSpacing: 'normal' }}
          />
        </div>

        {/* Boutons */}
        <div className="flex gap-3 pt-1">
          <button onClick={() => onClose()}
            className="flex-1 py-2 rounded font-mono text-[11px] uppercase tracking-widest"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.40)', cursor: 'pointer' }}>
            {t('cancel')}
          </button>
          <button
            onClick={onValidate}
            className="flex-1 py-2 rounded font-mono text-[11px] uppercase tracking-widest font-bold transition-all"
            style={{ background: 'rgba(255,255,255,0.25)', border: '1px solid rgba(255,255,255,0.70)', color: 'rgba(240,246,255,0.95)', boxShadow: '0 0 16px rgba(255,255,255,0.30)', cursor: 'pointer' }}>
            {t('ep_validate_btn')}
          </button>
        </div>
      </div>
    </div>
  );
}
