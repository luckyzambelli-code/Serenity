/**
 * networkManager — parsing pur + comportement du buffer sortant.
 *
 * ── PÉRIMÈTRE ────────────────────────────────────────────────────────────────────────────────
 * Signalé lors de l'analyse de code : `networkManager.ts` (1166 lignes, la couche P2P/WebRTC)
 * n'avait AUCUN test. Ici : les deux fonctions de parsing exportées (pures, aucune dépendance
 * externe) + le comportement de `send()`/buffer sur une instance JAMAIS connectée — ces chemins
 * ne touchent ni PeerJS ni WebSocket (`this.dataConnection` reste `null`, `this._relayConnected`
 * reste `false`), donc testables sans mocker le réseau réel. Le reste de la classe (connexion
 * PeerJS, heartbeat, ICE, relais WebSocket) demande un mock de `peerjs`/`WebSocket` — laissé pour
 * un prochain passage, plus lourd.
 *
 * `NetworkManager` est maintenant exportée EN PLUS du singleton `networkManager` (v.
 * networkManager.ts) — un ajout, pas un changement de comportement — pour instancier une copie
 * PROPRE par test au lieu de partager l'état du singleton entre les tests.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { NetworkManager, parseSignalingUrl, parseConnectionLink } from '../networkManager';

describe('parseSignalingUrl', () => {
  it('IP LAN nue → non sécurisé, port par défaut 7893', () => {
    const cfg = parseSignalingUrl('192.168.1.42');
    expect(cfg).toEqual({ host: '192.168.1.42', port: 7893, path: '/peerjs', secure: false });
  });

  it('IP LAN avec port explicite', () => {
    const cfg = parseSignalingUrl('192.168.1.42:7893');
    expect(cfg).toMatchObject({ host: '192.168.1.42', port: 7893, secure: false });
  });

  it('.local / .lan → traité comme LAN (mDNS), pas comme domaine distant', () => {
    expect(parseSignalingUrl('macbook.local').secure).toBe(false);
    expect(parseSignalingUrl('nas.lan').secure).toBe(false);
    expect(parseSignalingUrl('localhost').secure).toBe(false);
  });

  it('domaine distant → sécurisé, port par défaut 443', () => {
    const cfg = parseSignalingUrl('abc123.trycloudflare.com');
    expect(cfg).toEqual({ host: 'abc123.trycloudflare.com', port: 443, path: '/peerjs', secure: true });
  });

  it("tolère un préfixe http(s):// et des espaces", () => {
    expect(parseSignalingUrl('  https://abc.trycloudflare.com  ').host).toBe('abc.trycloudflare.com');
    expect(parseSignalingUrl('http://192.168.1.42:7893').secure).toBe(false);
  });
});

describe('parseConnectionLink', () => {
  it('format ancien (sans auth) : "serveur#peerId"', () => {
    const r = parseConnectionLink('192.168.0.106:7893#abc123xyz');
    expect(r).not.toBeNull();
    expect(r!.peerId).toBe('abc123xyz');
    expect(r!.relayToken).toBeUndefined();
    expect(r!.config.peerKey).toBeUndefined();
    expect(r!.satellite).toBe(false);
  });

  it('format nouveau : "serveur#peerId:relayToken:peerKey"', () => {
    const r = parseConnectionLink('abc.trycloudflare.com#abc123:relaytoken:peerkey');
    expect(r).not.toBeNull();
    expect(r!.peerId).toBe('abc123');
    expect(r!.relayToken).toBe('relaytoken');
    expect(r!.config.peerKey).toBe('peerkey');
    expect(r!.config.secure).toBe(true);
  });

  it('marqueur satellite (téléphone co-localisé) en 4e position', () => {
    const r = parseConnectionLink('abc.trycloudflare.com#abc123:relaytoken:peerkey:sat');
    expect(r!.satellite).toBe(true);
  });

  it('lien invalide (sans "#") → null', () => {
    expect(parseConnectionLink('192.168.0.106:7893')).toBeNull();
  });

  it('lien vide des deux côtés du "#" → null', () => {
    expect(parseConnectionLink('#abc123')).toBeNull();
    expect(parseConnectionLink('192.168.0.106#')).toBeNull();
  });
});

describe('NetworkManager — buffer sortant (instance jamais connectée)', () => {
  let nm: NetworkManager;
  beforeEach(() => { nm = new NetworkManager(); });

  it('un paquet régulier, sans connexion, part dans le buffer (send retourne false)', () => {
    const sent = nm.send({ type: 'EEG', v: 1 });
    expect(sent).toBe(false);
    expect(nm.getBufferSize()).toBe(1);
  });

  it('les paquets haute-priorité du même type sont DÉDUPLIQUÉS (le plus récent gagne)', () => {
    nm.send({ type: 'BATTERY', level: 80 }, true);
    nm.send({ type: 'BATTERY', level: 60 }, true);
    nm.send({ type: 'BATTERY', level: 40 }, true);
    expect(nm.getBufferSize()).toBe(1);
  });

  it('les paquets réguliers NE sont PAS dédupliqués (un par tick EEG/PPG)', () => {
    nm.send({ type: 'EEG', v: 1 }, false);
    nm.send({ type: 'EEG', v: 2 }, false);
    expect(nm.getBufferSize()).toBe(2);
  });

  it('le buffer régulier est borné (MAX_BUFFER_SIZE=600) — les plus vieux sont évincés', () => {
    for (let i = 0; i < 650; i++) nm.send({ type: 'EEG', v: i }, false);
    expect(nm.getBufferSize()).toBe(600);
  });

  it('clearBuffer() vide le buffer', () => {
    nm.send({ type: 'EEG', v: 1 });
    nm.clearBuffer();
    expect(nm.getBufferSize()).toBe(0);
  });

  it("isConnected()/getStatus()/getPeerId() sur une instance neuve : déconnectée", () => {
    expect(nm.isConnected()).toBe(false);
    expect(nm.getStatus()).toBe('idle');
    expect(nm.getPeerId()).toBeNull();
  });

  it('notifyLeaving() sans connexion active ne lève jamais (best-effort)', () => {
    expect(() => nm.notifyLeaving()).not.toThrow();
  });

  it('disconnect() sur une instance jamais connectée ne lève jamais et repasse à "idle"', () => {
    expect(() => nm.disconnect()).not.toThrow();
    expect(nm.getStatus()).toBe('idle');
  });
});
