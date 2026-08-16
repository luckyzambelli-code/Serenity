/**
 * CREARE E MODIFICARE UN PROFILO — auditor o preclear, per tutte e due le applicazioni.
 *
 * ── PERCHÉ ESISTE ───────────────────────────────────────────────────────────────────────────
 * Questa logica stava dentro `components/ProfileRoster.tsx`, cioè dentro un pannello scuro di
 * EQUILIBRIUM. Da quando SERENITY crea gli stessi profili (fase 4 della refonte), rifarla di là
 * vorrebbe dire due creazioni che possono divergere — e divergerebbero proprio sui dettagli che
 * non si vedono, che sono quelli che qui contano:
 *
 *   • IL RIDIMENSIONAMENTO DELLA FOTO. Una foto a piena risoluzione in base64 pesa MEGABYTE e
 *     fa saltare la quota di `localStorage`: il salvataggio fallisce e la modifica torna
 *     indietro DA SOLA, senza un messaggio — « ritrovo quello che c'era prima ». Ridotta a un
 *     quadrato di 320 px sta in 20–40 KB e passa anche nella sincronizzazione.
 *   • IL SESSO, che non è anagrafica: decide il TA di clear (3,0 uomo · 2,0 donna), cioè
 *     l'origine della scala del tono di quella persona.
 *   • LA SPINTA AL SERVER, perché l'altro cliente (Electron ↔ Chrome) veda il profilo nuovo in
 *     pochi secondi invece che al prossimo giro di venticinque.
 *
 * ⚠️ Qui non c'è disegno: né JSX, né colori, né testi tradotti. Le due applicazioni chiedono la
 * foto e il nome come vogliono, e poi passano di qui.
 */

import {
  saveProfile, savePcProfile, type UserProfile, type PcProfile,
} from './storage';
import {
  isServerAvailable, serverSaveProfiles, serverSavePcProfiles,
} from './serverStorage';

/** Il lato del quadrato in cui si riduce ogni ritratto, e la qualità del JPEG. Vedi in cima:
 *  è la differenza fra un profilo che si salva e uno che sparisce senza dirlo. */
export const FOTO_LATO = 320;
export const FOTO_QUALITA = 0.85;

/** Ritaglia al centro e riduce: da un'immagine qualunque a un quadrato di `FOTO_LATO`. */
function quadrato(
  sorgente: CanvasImageSource, larghezza: number, altezza: number,
): string | null {
  const c = document.createElement('canvas');
  c.width = FOTO_LATO; c.height = FOTO_LATO;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const lato = Math.min(larghezza, altezza) || FOTO_LATO;
  ctx.drawImage(sorgente, (larghezza - lato) / 2, (altezza - lato) / 2, lato, lato,
                0, 0, FOTO_LATO, FOTO_LATO);
  return c.toDataURL('image/jpeg', FOTO_QUALITA);
}

/** Uno scatto dalla camera. `null` se il fotogramma non è utilizzabile. */
export function fotoDaVideo(v: HTMLVideoElement): string | null {
  return quadrato(v, v.videoWidth, v.videoHeight);
}

/**
 * Una foto da un file scelto sul disco.
 *
 * ⚠️ Se il ridimensionamento non riesce si rende comunque l'immagine INTERA, non `null`: una
 * foto grande che forse non si salva è meglio di nessuna foto — e chi salva se ne accorge.
 */
export function fotoDaFile(f: File): Promise<string | null> {
  return new Promise(risolvi => {
    const r = new FileReader();
    r.onerror = () => risolvi(null);
    r.onload = () => {
      const grezza = String(r.result);
      const img = new Image();
      img.onerror = () => risolvi(grezza);
      img.onload = () => {
        try { risolvi(quadrato(img, img.width, img.height) ?? grezza); }
        catch { risolvi(grezza); }
      };
      img.src = grezza;
    };
    r.readAsDataURL(f);
  });
}

/** La spinta al server: non blocca e non fa rumore se il server non c'è. Un profilo salvato in
 *  locale è già salvato — questa è solo la scorciatoia perché l'altro cliente lo veda subito. */
function spingi(obj: UserProfile | PcProfile, tipo: 'auditor' | 'pc'): void {
  void (async () => {
    try {
      if (!(await isServerAvailable())) return;
      if (tipo === 'auditor') await serverSaveProfiles([obj as UserProfile]);
      else await serverSavePcProfiles([obj as PcProfile]);
    } catch (_) { /* la copia locale basta */ }
  })();
}

export interface DatiProfilo {
  /** Assente = si crea. Presente = si modifica quello. */
  id?: string;
  nome: string;
  foto?: string;
  sesso?: 'm' | 'f';
}

/**
 * SALVA UN AUDITOR. Rende il profilo scritto, o `null` se il nome è vuoto — un profilo senza
 * nome non si può più ritrovare, e le sedute che gli si appendono restano senza padrone.
 *
 * `precedente` serve a NON perdere le preferenze e la data di creazione quando si modifica:
 * riscriverle da zero azzererebbe la lingua e il modo SOLO scelti da quella persona.
 */
export function salvaAuditor(
  d: DatiProfilo, precedente?: UserProfile | null, lingua = 'fr',
): UserProfile | null {
  const nome = d.nome.trim();
  if (!nome) return null;
  const p: UserProfile = {
    id: d.id || Date.now().toString(),
    name: nome,
    photo: d.foto,
    sex: d.sesso,   // in SOLO è l'auditor a essere il preclear: da qui esce il TA di clear
    preferences: precedente?.preferences || { lang: lingua, soloMode: false },
    createdAt: precedente?.createdAt || Date.now(),
  };
  saveProfile(p);
  spingi(p, 'auditor');
  return p;
}

/** SALVA UN PRECLEAR. Stessa regola sul nome vuoto. */
export function salvaPreclear(d: DatiProfilo, precedente?: PcProfile | null): PcProfile | null {
  const nome = d.nome.trim();
  if (!nome) return null;
  const p: PcProfile = {
    id: d.id || ('pc_' + Date.now()),
    name: nome,
    photo: d.foto,
    sex: d.sesso,
    createdAt: precedente?.createdAt || Date.now(),
  };
  savePcProfile(p);
  spingi(p, 'pc');
  return p;
}
