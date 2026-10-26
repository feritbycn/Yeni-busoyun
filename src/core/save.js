// Bozulmaya dayanıklı yerel kayıt: sağlama toplamı + yedek anahtar + sürüm göçü.
// storage: { getItem, setItem, removeItem } (localStorage veya testlerde sahte depolama).
import { defaultSave } from './economy.js';

const KEY = 'lbm3d.save';
const BACKUP = 'lbm3d.save.bak';

export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function encode(data) {
  const d = JSON.stringify(data);
  return JSON.stringify({ d, h: fnv1a(d) });
}

function decode(raw) {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    if (typeof o.d !== 'string' || o.h !== fnv1a(o.d)) return null;
    const data = JSON.parse(o.d);
    return sanitize(data);
  } catch {
    return null;
  }
}

/** Eksik/yanlış tipli alanları varsayılanlarla düzeltir; geçersizse null. */
function sanitize(d) {
  if (!d || typeof d !== 'object' || (d.v !== 1 && d.v !== 2)) return null;
  const def = defaultSave();
  const out = { ...def, ...d, v: 2, settings: { ...def.settings, ...(d.settings || {}) } };
  for (const k of ['parking', 'garage', 'quests', 'login', 'ads']) out[k] = { ...def[k], ...(d[k] && typeof d[k] === 'object' ? d[k] : {}) };
  if (!Array.isArray(out.parking.themes) || !out.parking.themes.includes('day')) out.parking.themes = ['day', ...(Array.isArray(out.parking.themes) ? out.parking.themes : [])];
  if (!Array.isArray(out.parking.decor)) out.parking.decor = [];
  out.parking.slots = Math.min(9, Math.max(3, Number.isFinite(out.parking.slots) ? Math.floor(out.parking.slots) : 3));
  if (!Array.isArray(out.garage.owned) || !out.garage.owned.includes('classic')) out.garage.owned = ['classic', ...(Array.isArray(out.garage.owned) ? out.garage.owned : [])];
  if (!out.garage.owned.includes(out.garage.skin)) out.garage.skin = 'classic';
  if (!Array.isArray(out.ads.tokens)) out.ads.tokens = [];
  if (!out.achievements || typeof out.achievements !== 'object') out.achievements = {};
  out.crystals = Number.isFinite(out.crystals) && out.crystals >= 0 ? Math.floor(out.crystals) : 0;
  out.lastSeen = Number.isFinite(out.lastSeen) ? out.lastSeen : 0;
  const num = (x, dflt, min = 0) => (Number.isFinite(x) && x >= min ? Math.floor(x) : dflt);
  out.coins = num(out.coins, 0);
  out.xp = num(out.xp, 0);
  out.unlocked = num(out.unlocked, 1, 1);
  if (typeof out.levels !== 'object' || !out.levels) out.levels = {};
  if (!Array.isArray(out.claimedRuns)) out.claimedRuns = [];
  return out;
}

export function loadSave(storage) {
  const primary = decode(storage.getItem(KEY));
  if (primary) return { save: primary, source: 'primary' };
  const backup = decode(storage.getItem(BACKUP));
  if (backup) return { save: backup, source: 'backup' };
  return { save: defaultSave(), source: 'fresh' };
}

export function writeSave(storage, data) {
  const prev = storage.getItem(KEY);
  if (prev && decode(prev)) storage.setItem(BACKUP, prev); // yalnızca geçerli kaydı yedekle
  storage.setItem(KEY, encode(data));
}

export function clearSave(storage) {
  storage.removeItem(KEY);
  storage.removeItem(BACKUP);
}
