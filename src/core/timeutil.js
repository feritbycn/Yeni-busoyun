// Gün/hafta anahtarları. Saat enjekte edilir (testlerde sahte). Çevrimdışıyken cihaz saati güvenilmezdir:
// saat geri alınırsa (now < lastSeen) zaman-bağlı ödüller verilmez. Gerçek koruma için sunucu saati gerekir.
export const systemClock = { now: () => Date.now() };

export function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function weekKey(ms) {
  const d = new Date(ms);
  const day = (d.getDay() + 6) % 7; // Pazartesi = 0
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
  return 'W' + dayKey(monday.getTime());
}
export function dayDiff(a, b) {
  const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
}
/** Saat geri alınmış mı? (lastSeen'den 5 dk'dan fazla geride) */
export const clockTampered = (save, now) => now < save.lastSeen - 5 * 60000;
export function touch(save, now) {
  return clockTampered(save, now) ? save : { ...save, lastSeen: Math.max(save.lastSeen, now) };
}
