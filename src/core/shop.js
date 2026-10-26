// Otopark ve garaj satın alımları. Saf fonksiyonlar: { ok, save, reason }. Premium durumu çağıran tarafından verilir.
import { PARKING, THEMES, DECOR, SKINS } from './catalog.js';

const clone = (s) => JSON.parse(JSON.stringify(s));
const fail = (save, reason) => ({ ok: false, save, reason });

function spend(s, coins = 0, crystals = 0) {
  if (s.coins < coins) return 'no_coins';
  if (s.crystals < crystals) return 'no_crystals';
  s.coins -= coins;
  s.crystals -= crystals;
  return null;
}

export function nextSlotCost(save) {
  return save.parking.slots >= PARKING.maxSlots ? null : PARKING.slotCosts[save.parking.slots + 1];
}

export function buyParkingSlot(save) {
  const cost = nextSlotCost(save);
  if (cost == null) return fail(save, 'max');
  const s = clone(save);
  const err = spend(s, cost);
  if (err) return fail(save, err);
  s.parking.slots++;
  return { ok: true, save: s, spent: cost };
}

export function buyTheme(save, id, premium) {
  const t = THEMES[id];
  if (!t) return fail(save, 'unknown');
  if (save.parking.themes.includes(id)) return fail(save, 'owned');
  if (t.premium && !premium) return fail(save, 'premium_only');
  const s = clone(save);
  const err = spend(s, t.cost);
  if (err) return fail(save, err);
  s.parking.themes.push(id);
  return { ok: true, save: s, spent: t.cost };
}

export function selectTheme(save, id, premium) {
  const t = THEMES[id];
  if (!t || !save.parking.themes.includes(id)) return fail(save, 'not_owned');
  if (t.premium && !premium) return fail(save, 'premium_only'); // sahiplik kalıcı, kullanım üyeliğe bağlı
  const s = clone(save);
  s.parking.theme = id;
  return { ok: true, save: s };
}

export function buyDecor(save, id) {
  const d = DECOR[id];
  if (!d) return fail(save, 'unknown');
  if (save.parking.decor.includes(id)) return fail(save, 'owned');
  if (d.minSlots && save.parking.slots < d.minSlots) return fail(save, 'need_slots');
  const s = clone(save);
  const err = spend(s, d.cost);
  if (err) return fail(save, err);
  s.parking.decor.push(id);
  return { ok: true, save: s, spent: d.cost };
}

/** Görünüm edinme: para / kristal / seviye şartı; premium görünümler yalnızca üyeyken edinilir ve sonra kalıcıdır. */
export function acquireSkin(save, id, premium) {
  const k = SKINS[id];
  if (!k) return fail(save, 'unknown');
  if (save.garage.owned.includes(id)) return fail(save, 'owned');
  if (k.premium && !premium) return fail(save, 'premium_only');
  if (k.minLevel && save.unlocked < k.minLevel) return fail(save, 'need_level');
  const s = clone(save);
  const err = spend(s, k.cost || 0, k.crystals || 0);
  if (err) return fail(save, err);
  s.garage.owned.push(id);
  return { ok: true, save: s, spent: k.cost || 0 };
}

export function selectSkin(save, id) {
  if (!save.garage.owned.includes(id)) return fail(save, 'not_owned');
  const s = clone(save);
  s.garage.skin = id;
  return { ok: true, save: s };
}

/** Kullanılabilir tema: premium tema üyelik bittiyse gündüze düşer (sahiplik korunur). */
export function effectiveTheme(save, premium) {
  const t = THEMES[save.parking.theme];
  return t && (!t.premium || premium) ? save.parking.theme : 'day';
}
