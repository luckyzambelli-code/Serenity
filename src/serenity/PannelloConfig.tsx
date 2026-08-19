/**
 * PannelloConfig — CONFIG, in SERENITY.
 *
 * ── PERCHÉ ESISTE ───────────────────────────────────────────────────────────────────────────
 * Segnalato assente dalla revisione: EQUILIBRIUM ha un intero cassetto CONFIG (aspetto, moduli
 * visibili, disposizioni salvate) raggiungibile in ogni momento dalla sidebar — SERENITY non ne
 * aveva NESSUNO. Qui la STESSA struttura funzionale (`SidebarDrawer.tsx`'s `ConfigDrawer`),
 * ridisegnata nella lingua di SERENITY: niente cassetto di vetro con interruttori a pillola,
 * un pannello a tutta pagina come `PannelloEp`/`PannelloProfilo`/`Connessione` — SERENITY non
 * impila pannelli sopra la seduta.
 *
 * ── COSA RESTA IDENTICO, E PERCHÉ ────────────────────────────────────────────────────────────
 *   • Tema, lingua, trasparenza (`uiAlpha`), sfondo (`wallpaperUrl`) — le STESSE quattro
 *     preferenze di `useUiStore`/`useI18n`, stesso `localStorage`: cambiarle qui le cambia
 *     anche per EQUILIBRIUM, esattamente come già fa `SelettoreTema` (vedi `Impostazioni.tsx`).
 *     La trasparenza non governa un vetro (SERENITY non ne ha) ma il rilievo dei cerchi
 *     satellite (`Cerchio.tsx`'s `opacita`) — la STESSA impostazione, tradotta nella grafica di
 *     SERENITY invece che in quella di EQUILIBRIUM (mandato: « cambia il design, non la
 *     logica »).
 *   • I moduli — la STESSA lista di sette che in EQUILIBRIUM (`layoutStore.ts`'s
 *     `ModuleVisibility`), non un sottoinsieme scelto qui. Solo `cam1`/`cam2` sono interruttori
 *     VERI (`serenityModuleStore.ts`) perché solo loro hanno un pannello costruito in questa
 *     fase; gli altri cinque restano nella lista — spenti, non toccabili, con la parola « in
 *     arrivo » — così la struttura resta leggibile senza fingere un controllo che non farebbe
 *     niente. Si accendono da soli, qui, quando la loro fase li costruisce.
 *
 * ── COSA NON C'È, E PERCHÉ ────────────────────────────────────────────────────────────────────
 * Il salvataggio di più disposizioni (`config_save_layout`) presuppone moduli che l'auditor
 * sposta e ridimensiona — EQUILIBRIUM li lascia liberi, SERENITY li tiene fissi (« niente
 * pannelli, niente bordi »): non c'è una disposizione da salvare perché non ce n'è che una,
 * quella del disegno stesso. Non è dimenticato: è la stessa differenza strutturale già scritta
 * per `EpValidationModal` — una funzione di EQUILIBRIUM che qui non ha un referente reale.
 *
 * @see docs/serenity-refonte.md — fase 6.
 */

import { useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { useUiStore } from '../store/uiStore';
import { SelettoreLingua, SelettoreTema } from './Impostazioni';
import { useSerenityModuleStore, type SerenityModuleVis } from './serenityModuleStore';
import { importWallpaper } from '../lib/wallpaperImport';

const MODULI_REALI: Array<{ key: keyof SerenityModuleVis; tKey: string }> = [
  { key: 'cam1', tKey: 'config_mod_cam1' },
  { key: 'cam2', tKey: 'config_mod_cam2' },
  { key: 'mna', tKey: 'config_mod_mna' },
];
/** Gli altri quattro di EQUILIBRIUM — la STRUTTURA resta, senza fingere un pannello che qui
 *  non esiste ancora. Vedi la nota in testa al file. */
const MODULI_IN_ARRIVO = ['config_mod_journal', 'config_mod_health', 'config_mod_ri',
  'config_mod_biometric'];

const etichetta: React.CSSProperties = {
  fontFamily: 'var(--s-sans)', fontSize: 13, letterSpacing: '0.14em', textTransform: 'uppercase',
  color: 'var(--s-ink-soft)', marginBottom: 10, display: 'block',
};

export function PannelloConfig({ onChiudi, needleTrim = 0, setNeedleTrim = () => {}, needleInertia = 50, setNeedleInertia = () => {}, museOk = false }: {
  onChiudi: () => void;
  /** ── LA TARATURA DELL'AGO EEG — segnalata assente nell'audit funzionale completo (« toutes
   *  les fonctions... calibrations »). Lo stesso `needleTrim`/`needleInertia` del cassetto TRIM
   *  di App.tsx, scritti sullo stesso `runtime/NeedleEngine` condiviso — vivono in
   *  `Serenity.tsx` (che possiede l'effetto che li applica al motore), qui solo la manopola.
   *  Opzionali: `Avvio.tsx` monta lo stesso pannello PRIMA che una seduta esista (nessun ago
   *  vivo da tarare ancora) — senza queste cinque prop la sezione resta chiusa (`museOk`
   *  default `false`), non un campo rotto. */
  needleTrim?: number;
  setNeedleTrim?: (v: number) => void;
  needleInertia?: number;
  setNeedleInertia?: (v: number) => void;
  /** In App.tsx questa manopola compare SOLO col Muse collegato — è la sensibilità del SUO
   *  ago, mostrarla senza dire di chi confonderebbe con quella del meter (che ha la sua, nel
   *  cassetto del meter in intestazione). */
  museOk?: boolean;
}) {
  const { t } = useI18n();
  // Le chiavi di `config_mod_*` arrivano da una LISTA (come in `ConfigDrawer` di EQUILIBRIUM),
  // non da un letterale: `t` vuole l'unione stretta, qui basta la stessa forma allentata che
  // `SidebarDrawer.tsx` passa già alle sue sotto-sezioni (`t: (key: string) => string`).
  const tt = t as (key: string) => string;
  const uiAlpha = useUiStore(s => s.uiAlpha);
  const setUiAlpha = useUiStore(s => s.setUiAlpha);
  const wallpaperUrl = useUiStore(s => s.wallpaperUrl);
  const setWallpaperUrl = useUiStore(s => s.setWallpaperUrl);
  const moduleVis = useSerenityModuleStore(s => s.moduleVis);
  const setModuleVis = useSerenityModuleStore(s => s.setModuleVis);

  const [wpInCorso, setWpInCorso] = useState(false);
  const [wpErrore, setWpErrore] = useState<'lettura' | 'troppo-grande' | null>(null);
  const inputId = useRef(`ser-config-wallpaper-${Math.random().toString(36).slice(2)}`).current;

  const rigaModulo = (accesa: boolean, disabilitata: boolean, onClick: (() => void) | undefined, testo: string) => (
    <button
      key={testo}
      onClick={onClick}
      disabled={disabilitata}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        width: '100%', padding: '10px 4px', border: 'none', background: 'none',
        cursor: disabilitata ? 'default' : 'pointer', textAlign: 'left',
        borderBottom: '1px solid var(--s-ink-ghost)',
      }}>
      <span style={{
        fontFamily: 'var(--s-sans)', fontSize: 15.5,
        color: disabilitata ? 'var(--s-ink-soft)' : 'var(--s-ink)',
      }}>
        {testo}
        {disabilitata && (
          <span style={{ fontSize: 14, color: 'var(--s-ink-faint)', marginLeft: 8 }}>
            {t('ser_config_soon')}
          </span>
        )}
      </span>
      <span style={{
        width: 30, height: 17, borderRadius: 9, flexShrink: 0, position: 'relative',
        background: disabilitata ? 'var(--s-disc-sunk)' : (accesa ? 'var(--s-ink)' : 'var(--s-disc-sunk)'),
        boxShadow: disabilitata ? 'none' : 'var(--s-shadow)',
        transition: 'background var(--s-slow) var(--s-ease)',
      }}>
        <span style={{
          position: 'absolute', top: 2, left: accesa && !disabilitata ? 15 : 2,
          width: 13, height: 13, borderRadius: '50%',
          background: disabilitata ? 'var(--s-ink-ghost)' : 'var(--s-ground-warm)',
          transition: 'left var(--s-slow) var(--s-ease)',
        }} />
      </span>
    </button>
  );

  return (
    <section style={{
      height: '100%', overflowY: 'auto', display: 'grid',
      gridTemplateRows: 'auto 1fr', padding: '38px 44px', gap: 20,
    }}>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
        <button className="s-glass s-glass-btn" onClick={onChiudi} style={{
          cursor: 'pointer', borderRadius: 999, padding: '6px 14px', background: 'var(--s-disc)',
          fontFamily: 'var(--s-sans)', fontSize: 15.5, color: 'var(--s-ink-soft)',
        }}>
          ← {t('ser_back')}
        </button>
        <h1 style={{ margin: 0, fontFamily: 'var(--s-serif)', fontWeight: 400, fontSize: 26, color: 'var(--s-ink)' }}>
          {t('config')}
        </h1>
      </header>

      <div style={{ display: 'grid', gap: 34, width: 'min(100%, 520px)', margin: '0 auto', paddingBottom: 20 }}>
        {/* ── ASPETTO ────────────────────────────────────────────────────────────────────── */}
        <div>
          <span style={etichetta}>{t('config_appearance')}</span>
          <div style={{ display: 'grid', gap: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <SelettoreTema />
              <SelettoreLingua />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, color: 'var(--s-ink-soft)', marginBottom: 4 }}>
                <span>{t('config_transparency')}</span>
                <span style={{ fontFamily: 'var(--s-mono)' }}>{Math.round(uiAlpha * 100)}%</span>
              </div>
              <input
                type="range" min={45} max={100} step={1}
                value={Math.round(uiAlpha * 100)}
                onChange={e => setUiAlpha(Number(e.target.value) / 100)}
                style={{ width: '100%', accentColor: 'var(--s-ink)', cursor: 'pointer' }}
              />
            </div>

            <div>
              <div style={{ fontSize: 15, color: 'var(--s-ink-soft)', marginBottom: 8 }}>{t('wallpaper')}</div>
              <input
                id={inputId} type="file" accept="image/*" style={{ display: 'none' }}
                onChange={async e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  e.target.value = '';
                  setWpErrore(null);
                  setWpInCorso(true);
                  const { dataUrl, errore } = await importWallpaper(file);
                  setWpInCorso(false);
                  if (!dataUrl) { setWpErrore(errore ?? 'lettura'); return; }
                  setWallpaperUrl(dataUrl);
                }}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div onClick={() => setWallpaperUrl('')} style={{
                  height: 52, borderRadius: 10, cursor: 'pointer',
                  background: 'var(--s-disc-sunk)',
                  boxShadow: !wallpaperUrl ? 'var(--s-shadow-lift)' : 'none',
                  display: 'grid', placeItems: 'center',
                  fontSize: 12.5, fontFamily: 'var(--s-mono)', color: 'var(--s-ink-faint)',
                  letterSpacing: '0.06em',
                }}>
                  DEFAULT
                </div>
                <label htmlFor={inputId} style={{
                  height: 52, borderRadius: 10, cursor: 'pointer', overflow: 'hidden', position: 'relative',
                  background: 'var(--s-disc)',
                  boxShadow: wallpaperUrl ? 'var(--s-shadow-lift)' : 'var(--s-shadow)',
                  display: 'grid', placeItems: 'center',
                  fontSize: 12.5, fontFamily: 'var(--s-mono)', color: 'var(--s-ink-faint)',
                }}>
                  {wallpaperUrl
                    ? <img src={wallpaperUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                    : t('wallpaper_import')}
                </label>
              </div>
              {(wpInCorso || wpErrore) && (
                <div style={{ marginTop: 6, fontSize: 13.5, color: wpErrore ? 'var(--s-reserve)' : 'var(--s-ink-faint)' }}>
                  {wpInCorso ? '…' : wpErrore === 'troppo-grande' ? t('wallpaper_too_big') : t('wallpaper_unreadable')}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── MODULI ─────────────────────────────────────────────────────────────────────── */}
        <div>
          <span style={etichetta}>{t('config_modules')}</span>
          <div>
            {MODULI_REALI.map(({ key, tKey }) =>
              rigaModulo(moduleVis[key], false, () => setModuleVis(v => ({ ...v, [key]: !v[key] })), tt(tKey)))}
            {MODULI_IN_ARRIVO.map(tKey => rigaModulo(false, true, undefined, tt(tKey)))}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
            <button className="s-glass s-glass-btn" onClick={() => setModuleVis({ cam1: true, cam2: true, mna: true })} style={{
              cursor: 'pointer', borderRadius: 999, padding: '4px 12px', background: 'var(--s-disc)',
              fontFamily: 'var(--s-sans)', fontSize: 13.5, letterSpacing: '0.08em', color: 'var(--s-ink-faint)',
            }}>
              {t('config_all_on')}
            </button>
            <button className="s-glass s-glass-btn" onClick={() => setModuleVis({ cam1: false, cam2: false, mna: false })} style={{
              cursor: 'pointer', borderRadius: 999, padding: '4px 12px', background: 'var(--s-disc)',
              fontFamily: 'var(--s-sans)', fontSize: 13.5, letterSpacing: '0.08em', color: 'var(--s-ink-faint)',
            }}>
              {t('config_all_off')}
            </button>
          </div>
        </div>

        {/* ── LA TARATURA DELL'AGO EEG — segnalata assente nell'audit funzionale completo:
            « toutes les fonctions... calibrations » — il cassetto TRIM di App.tsx (sensibilità
            + inerzia dell'ago MUSE) non aveva NESSUN referente qui: l'ago restava sempre alla
            taratura di fabbrica. Stesse due manopole, stesso motore condiviso
            (`runtime/NeedleEngine`, l'effetto che le applica vive in `Serenity.tsx`), stessa
            gamma (−10…+10 · 0…100) — solo col Muse collegato, come in App.tsx: è la SUA
            sensibilità, mostrarla senza dire di chi confonderebbe col meter. */}
        {museOk && (
          <div>
            <span style={etichetta}>{tt('drawer_needle_trim')}</span>
            <div style={{ display: 'grid', gap: 18 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, color: 'var(--s-ink-soft)', marginBottom: 4 }}>
                  <span>{tt('trim_sensitivity')}</span>
                  <span style={{ fontFamily: 'var(--s-mono)' }}>
                    {needleTrim > 0 ? '+' : ''}{needleTrim} {needleTrim <= -5 ? 'LOW' : needleTrim <= 0 ? 'CENTER' : 'HIGH'}
                  </span>
                </div>
                <input
                  type="range" min={-10} max={10} step={1} value={needleTrim}
                  onChange={e => setNeedleTrim(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--s-ink)', cursor: 'pointer' }}
                />
                <div style={{ fontSize: 13, color: 'var(--s-ink-faint)', lineHeight: 1.5, marginTop: 4 }}>
                  {tt('trim_centering')}
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, color: 'var(--s-ink-soft)', marginBottom: 4 }}>
                  <span>{tt('trim_inertia')}</span>
                  <span style={{ fontFamily: 'var(--s-mono)' }}>{needleInertia}</span>
                </div>
                <input
                  type="range" min={0} max={100} step={1} value={needleInertia}
                  onChange={e => setNeedleInertia(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--s-ink)', cursor: 'pointer' }}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── DISPOSIZIONI — perché non c'è, detto chiaro invece che taciuto ───────────────── */}
        <div style={{ fontSize: 14, color: 'var(--s-ink-faint)', lineHeight: 1.6 }}>
          {t('config_save_layout')}: {t('ser_config_no_layouts')}.
        </div>
      </div>
    </section>
  );
}
