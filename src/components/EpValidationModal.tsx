import React from 'react';
import type { EpValidationConditions } from '../hooks/useEpValidation';
import { GlassCollapseToggle } from './GlassCollapseToggle';

interface EpValidationModalProps {
  epValidationConditions: EpValidationConditions;
  recentPcPhrases: string[];
  epValidationStartTime: number | null;
  onValidate: () => void;
  onClose: () => void;
}

export function EpValidationModal({
  epValidationConditions, recentPcPhrases, epValidationStartTime,
  onValidate, onClose,
}: EpValidationModalProps) {
  return (
    <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6">
      <div
        className="w-full max-w-md rounded-2xl border border-white/14 flex flex-col gap-4 p-6"
        style={{ background: 'rgba(26,26,30,0.96)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', boxShadow: '0 24px 60px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.12)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg text-white/90 tracking-widest uppercase flex items-center gap-2">
            <div className="w-3 h-3 bg-white/80 rounded-full animate-pulse" />
            EP VALIDATION
          </h3>
          <GlassCollapseToggle on onToggle={onClose} title="Fermer" />
        </div>

        {/* Conditions Status */}
        <div className="space-y-2">
          <div className="text-xs font-mono text-white/55 uppercase">Conditions:</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {([
              ['cognitionDetected', 'Cognition'],
              ['epSomatic',         'EP Somatic'],
              ['emotionalConfirm',  'Émotionnel'],
              ['noArtifacts',       "Pas d'artefacts"],
            ] as [keyof EpValidationConditions, string][]).map(([key, label]) => (
              <div key={key} className={`flex items-center gap-1 ${epValidationConditions[key] ? 'text-white/90' : 'text-white/35'}`}>
                <div className={`w-2 h-2 rounded-full ${epValidationConditions[key] ? 'bg-white/85' : 'bg-white/25'}`} />
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* Recent PC Phrases */}
        <div className="space-y-2">
          <div className="text-xs font-mono text-white/55 uppercase">Dernières phrases PC:</div>
          <div className="bg-black/40 rounded-lg p-3 max-h-32 overflow-y-auto">
            {recentPcPhrases.length > 0 ? (
              recentPcPhrases.slice(-3).map((phrase, i) => (
                <div key={i} className="text-xs text-gray-300 mb-1">"{phrase}"</div>
              ))
            ) : (
              <div className="text-xs text-gray-500 italic">Aucune phrase récente</div>
            )}
          </div>
        </div>

        {/* Countdown timer */}
        {epValidationStartTime && (
          <div className="text-center">
            <div className="text-xs font-mono text-white/55 uppercase">Temps restant:</div>
            <div className="text-lg font-mono text-white">
              {Math.max(0, 120 - Math.floor((Date.now() - epValidationStartTime) / 1000))}s
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          <button onClick={onValidate} className="glass-btn flex-1 px-4 py-2 text-sm">
            Valider EP
          </button>
          <button onClick={onClose} className="glass-btn px-4 py-2 text-sm">
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
