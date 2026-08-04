import React from 'react';
import { pick5 } from '../i18n5';
import { useI18n } from '../i18n';
import { useMetric } from '../store/metricsStore';
import { useTZone } from '../store/tzoneStore';

/**
 * CycleStatusBar — the cycle read-outs (COMM LAG Δt*, % dissolution, AS-IS? validate)
 * grouped in a row DIRECTLY UNDER the auditing question, so the auditor reads them where
 * they type instead of down under the arc. The AS-IS? chip is itself the VALIDATE button
 * (user choice). The tone-arm value stays central on the dial; only the cycle status moved
 * up here. Subscribes to metricsStore/tzoneStore itself so App doesn't re-render at 10 Hz.
 */
export const CycleStatusBar = React.memo(function CycleStatusBar({
  armed = false, asIsPending = false, manualReady = false, asIsFalse = false,
  deltaStar = 0, deltaStarN = 0, onValidate, isLightTheme = false, signalOk = true,
  cycleKind = 'charge', nullPhase = 'neutral',
  nullSinceMock = 0, noReadSignal = false, taBase = 2, taAtNullStart = 0, onValidateClearRead,
}: {
  armed?: boolean; asIsPending?: boolean; manualReady?: boolean; asIsFalse?: boolean;
  deltaStar?: number; deltaStarN?: number; onValidate?: () => void; isLightTheme?: boolean;
  /** MUSE éteint OU pas de contact → false : on n'affiche NI le comm lag NI la % dissolution
   *  (aucun signal EEG réel → ces valeurs n'ont pas de sens). Demande utilisateur. */
  signalOk?: boolean;
  // ── CYCLE NULL (miroir) : NULL → RISE → EQUILIBRIUM ──
  //
  // ⚠️ LE NOM À L'ÉCRAN EST « EQUILIBRIUM » — les IDENTIFIANTS restent `clear_read` /
  // `clearRead` / `onValidateClearRead` À DESSEIN : ce champ est ÉCRIT dans les séances
  // enregistrées et dans l'archive CORPUS. Le renommer rendrait illisibles toutes les
  // séances déjà sauvegardées. Le libellé se change, la donnée ne se renomme pas.
  cycleKind?: 'charge' | 'null';
  nullPhase?: 'neutral' | 'null' | 'rise' | 'clear_read';
  /** Secondes depuis l'armement du NULL — INFO seulement (pas un compte à rebours). */
  nullSinceMock?: number;
  /** Base constitutionnelle du TA (3 homme / 2 femme). */
  taBase?: number;
  /** TA au DÉMARRAGE du cycle NULL — l'ancre de la mesure du cycle. */
  taAtNullStart?: number;
  /** Cycle CONTACT : le moteur n'a vu AUCUNE lecture dans la fenêtre du comm lag → « sembra NULL ».
   *  Simple INDICATION (l'auditeur presse NULL s'il le décide) — aucune bascule automatique. */
  noReadSignal?: boolean;
  /** Valide le EQUILIBRIUM en INSCRIVANT les VGI's (oui/non). */
  onValidateClearRead?: (vgi: boolean) => void;
}) {
  const { t, lang } = useI18n();
  // Les TERMES D'AUDITION (CONTACT, NULL, RISE, EQUILIBRIUM, AS-IS, VGIs, MOCK-UP, recharging /
  // no recharging) restent EN L'ÉTAT dans toutes les langues : c'est le vocabulaire du métier.
  // On ne traduit que le reste (libellés courants, infobulles).
  const L = (it: string, fr: string, en: string, es: string, sv: string) => pick5(lang as string, it, fr, en, es, sv);
  const qL = useMetric(m => m.qL);
  const toneArm = useMetric(m => m.toneArm);
  const { cyclePeakQ } = useTZone();
  const pct = cyclePeakQ > 0.001
    ? Math.round(Math.max(0, Math.min(1, (cyclePeakQ - Math.max(0, qL)) / cyclePeakQ)) * 100)
    : 0;
  // TRAVAIL DU CYCLE NULL = écart entre le TA au DÉMARRAGE du null et le TA courant, en sens
  // INVERSÉ (3.5 → 3.1 = +0.4). Correction utilisateur : l'ancien `TA − base(3/2)` mesurait la
  // DISTANCE À UNE CONVENTION, pas le cycle — il affichait +0.50 même quand rien ne se passait,
  // juste parce que le PC était assis à 3.5. Et il dépendait de la valeur ABSOLUE du TA, dont les
  // tests ont prouvé qu'elle n'est pas fiable. Ancré au départ du cycle, c'est RELATIF donc immunisé.
  //   • valeur NÉGATIVE = le TA est AU-DESSUS du départ → le mock-up CRÉE de la masse (ça recharge)
  //   • valeur POSITIVE = le TA est REDESCENDU sous le départ → c'est l'exemple 3.5 → 3.1 = +0.4
  void taBase;
  const taDelta = taAtNullStart > 0 ? taAtNullStart - toneArm : 0;
  const hasLag = deltaStarN > 0;
  const pending = asIsPending && armed;
  // AS-IS PROBABILE éliminé (pas utile en séance, choix utilisateur) : on ne propose la
  // validation QUE sur l'AS-IS CONFIRMÉ (F/N). `manualReady` n'affiche plus de chip.
  void manualReady;
  const manualOk = false;
  // Le cycle NULL a sa PROPRE fin (EQUILIBRIUM validé avec les VGI's) → pas de bouton AS-IS ici.
  const isNull = cycleKind === 'null' && armed;
  const validatable = pending && !isNull;

  // SAME colour as the AS-IS zone label under the arc (ClearDial phaseColorOf('asis')):
  // #d6ffff on dark, #0e7490 on light. A weak/false AS-IS keeps amber (a warning).
  // MONOCHROME glass : CONFERMATO = blanc vif · PROBABILE = blanc froid plus discret (contour).
  const hexRgba = (hex: string, a: number): string => {
    const h = hex.replace('#', '');
    return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
  };

  const chip: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6, height: 28, padding: '0 10px',
    borderRadius: 8, fontFamily: 'monospace', whiteSpace: 'nowrap',
  };
  const lbl: React.CSSProperties = { fontFamily: 'var(--font-sans)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase' };

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-start', flexWrap: 'wrap', width: '100%', marginTop: 6, pointerEvents: 'auto' }}>
      {/* STYLE B monochrome (thème sombre) : chip comm-lag en blanc/gris, plus de cyan.
          Masquée si MUSE éteint / pas de contact (pas de signal → valeur sans objet). */}
      {signalOk && (
      <div style={{ ...chip, background: isLightTheme ? 'rgba(34,211,238,0.08)' : 'rgba(255,255,255,0.06)', border: `1px solid ${isLightTheme ? 'rgba(34,211,238,0.30)' : 'rgba(255,255,255,0.22)'}` }}>
        <span style={{ ...lbl, color: isLightTheme ? 'rgba(159,246,255,0.65)' : 'rgba(226,238,255,0.60)' }}>{t('comm_lag_label') as string}</span>
        {/* Toujours VISIBLE : baseline (~450 = Pre-Read) tant qu'aucun cycle ne l'a personnalisé
            (N=0 → préfixe « ~ » + légère atténuation), puis la valeur mesurée nette. */}
        <span style={{ fontSize: 13, color: isLightTheme ? '#0e7490' : 'rgba(240,246,255,0.92)', opacity: hasLag ? 1 : 0.7 }}>{deltaStar > 0 ? `${hasLag ? '' : '~'}${deltaStar}` : '—'}<span style={{ fontSize: 10 }}> ms</span></span>
      </div>
      )}

      {/* « diss » n'appartient QU'AU cycle CONTACT (on dissout de la masse). Le cycle NULL a son
          propre indicateur : « recharging » (on en CRÉE) — voir plus bas. */}
      {armed && signalOk && !isNull && (
        <div style={{ ...chip, background: isLightTheme ? 'rgba(34,211,238,0.08)' : 'rgba(255,255,255,0.06)', border: `1px solid ${isLightTheme ? 'rgba(34,211,238,0.30)' : 'rgba(255,255,255,0.22)'}` }}>
          <span style={{ ...lbl, color: isLightTheme ? 'rgba(159,246,255,0.65)' : 'rgba(226,238,255,0.60)' }}>diss</span>
          <span style={{ fontSize: 13, color: isLightTheme ? '#0e7490' : 'rgba(240,246,255,0.92)' }}>{pct}%</span>
        </div>
      )}

      {/* SIGNAL du moteur sur un cycle CONTACT : aucune lecture dans la fenêtre du comm lag.
          INDICATION seulement — c'est l'auditeur qui presse NULL s'il le décide. */}
      {armed && !isNull && noReadSignal && (
        <div style={{ ...chip, background: 'rgba(148,163,184,0.10)', border: '1px solid rgba(148,163,184,0.45)' }}>
          <span style={{ fontSize: 12, letterSpacing: '0.06em', color: isLightTheme ? '#475569' : 'rgba(226,238,255,0.85)' }}>
            ○ {L('nessuna lettura', 'aucune lecture', 'no read', 'sin lectura', 'ingen avläsning')}
          </span>
        </div>
      )}

      {/* ── CYCLE NULL ────────────────────────────────────────────────────────────
          Pas d'étiquette de PHASE ici (le dial la montre déjà) ni de bouton « no recharging »
          (demande utilisateur : s'il voit que ça ne recharge pas, l'auditeur met simplement FIN au
          cycle — pas besoin d'un bouton, qui en plus sautait à chaque reflow). On montre juste
          l'écart de TA depuis le départ du null + la validation du EQUILIBRIUM avec les VGI's. */}
      {isNull && (
        <div style={{ ...chip, background: isLightTheme ? 'rgba(34,211,238,0.08)' : 'rgba(255,255,255,0.06)', border: `1px solid ${isLightTheme ? 'rgba(34,211,238,0.30)' : 'rgba(255,255,255,0.22)'}` }}>
          <span style={{ ...lbl, color: isLightTheme ? 'rgba(159,246,255,0.65)' : 'rgba(226,238,255,0.60)' }}>recharging</span>
          {/* Écart depuis le DÉPART du null (négatif = ça monte = ça recharge ; positif = redescendu). */}
          <span style={{ fontSize: 13, color: isLightTheme ? '#0e7490' : 'rgba(240,246,255,0.92)' }}>
            <span style={{ fontSize: 10, opacity: 0.7, letterSpacing: '0.08em' }}>TA </span>{taDelta >= 0 ? '+' : ''}{taDelta.toFixed(2)}
          </span>
          <span style={{ fontSize: 10, opacity: 0.55, color: isLightTheme ? '#0e7490' : 'rgba(240,246,255,0.92)' }}>· {nullSinceMock}s</span>
        </div>
      )}

      {isNull && nullPhase === 'clear_read' && (
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => onValidateClearRead?.(true)} title={L("Valida il EQUILIBRIUM — VGI's presenti",
                   "Valide le EQUILIBRIUM — VGI's présents",
                   "Validate the EQUILIBRIUM — VGI's present",
                   "Valida el EQUILIBRIUM — VGI's presentes",
                   "Validera EQUILIBRIUM — VGI's närvarande")}
            style={{ ...chip, cursor: 'pointer', fontWeight: 700,
              background: isLightTheme ? 'rgba(34,211,238,0.08)' : 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(110,231,183,0.7)', color: isLightTheme ? '#0e7490' : '#6ee7b7' }}>
            <span style={{ fontSize: 12, letterSpacing: '0.06em' }}>▸ EQUILIBRIUM · VGIs</span>
          </button>
          <button onClick={() => onValidateClearRead?.(false)} title={L('Valida il EQUILIBRIUM — nessun VGI',
                   'Valide le EQUILIBRIUM — aucun VGI',
                   'Validate the EQUILIBRIUM — no VGI',
                   'Valida el EQUILIBRIUM — ningún VGI',
                   'Validera EQUILIBRIUM — inga VGI')}
            style={{ ...chip, cursor: 'pointer',
              background: isLightTheme ? 'rgba(34,211,238,0.08)' : 'rgba(255,255,255,0.06)',
              border: `1px solid ${isLightTheme ? 'rgba(34,211,238,0.30)' : 'rgba(255,255,255,0.22)'}`,
              color: isLightTheme ? '#0e7490' : 'rgba(240,246,255,0.75)' }}>
            <span style={{ fontSize: 12, letterSpacing: '0.06em' }}>no VGIs</span>
          </button>
        </div>
      )}

      {validatable && (
        <button onClick={onValidate} title={t('cd_validate') as string}
          style={{
            ...chip, cursor: 'pointer', fontWeight: 700,
            // MÊME couleur STANDARD que le chip comm-lag (blanc/gris · teal en clair).
            background: isLightTheme ? 'rgba(34,211,238,0.08)' : 'rgba(255,255,255,0.06)',
            border: `1px solid ${isLightTheme ? 'rgba(34,211,238,0.30)' : 'rgba(255,255,255,0.22)'}`,
            color: isLightTheme ? '#0e7490' : 'rgba(240,246,255,0.92)',
          }}>
          <span style={{ fontSize: 13, letterSpacing: '0.06em' }}>
            AS-IS {t('asis_confirmed') as string}
          </span>
        </button>
      )}
    </div>
  );
});
