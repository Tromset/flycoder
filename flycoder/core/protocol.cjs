'use strict';
const ROLES = { h: 'Contrôleur', p: 'Architecte', c: 'Codeur', r: 'Relecteur', v: 'Vérificateur' };
const KINDS = { task: 'Mission', report: 'Rapport', check: 'Tests', reward: 'Récompense', error: 'Erreur' };
function encode(seq, from, to, kind, payload) {
  const packet = [1, seq, from, to, kind, payload]; decode(packet); return packet;
}
function decode(packet) {
  if (typeof packet === 'string') packet = JSON.parse(packet);
  if (!Array.isArray(packet) || packet.length !== 6 || packet[0] !== 1 || !Number.isSafeInteger(packet[1]) || packet[1] < 0 ||
      !Object.hasOwn(ROLES, packet[2]) || !Object.hasOwn(ROLES, packet[3]) || !Object.hasOwn(KINDS, packet[4])) throw new Error('Invalid FlyLink v1 packet');
  return { version: 1, sequence: packet[1], from: ROLES[packet[2]], to: ROLES[packet[3]], kind: KINDS[packet[4]], payload: packet[5] };
}
function transcript(packet) { const p = decode(packet); return `${p.from} → ${p.to} · ${p.kind}\n${typeof p.payload === 'string' ? p.payload : JSON.stringify(p.payload, null, 2)}`; }
function sizes(packet) { return { compactBytes: Buffer.byteLength(JSON.stringify(packet)), expandedBytes: Buffer.byteLength(JSON.stringify(decode(packet))) }; }
module.exports = { encode, decode, transcript, sizes, ROLES };
