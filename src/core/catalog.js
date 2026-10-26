// Tüm fiyatlar ve içerik tanımları tek yerde. Değerler başlangıç değerleridir; insan testiyle dengelenmedi.
// Kozmetikler oynanışı ETKİLEMEZ: bulmaca rengi (gövde boyası) her zaman seviye verisinden gelir.

export const PARKING = {
  baseSlots: 3,
  maxSlots: 9,
  slotCosts: { 4: 500, 5: 800, 6: 1200, 7: 1800, 8: 2500, 9: 3500 },
};

export const THEMES = {
  day: { name: 'Gündüz', cost: 0 },
  night: { name: 'Gece', cost: 800 },
  rain: { name: 'Yağmurlu', cost: 1200 },
  neon: { name: 'Neon VIP', cost: 0, premium: true },
};

export const DECOR = {
  plants: { name: 'Bitkiler', cost: 300 },
  signs: { name: 'Tabelalar', cost: 400 },
  platforms: { name: 'Sergileme platformları', cost: 900 },
  neon_lights: { name: 'Neon ışıklar', cost: 600 },
  terminal: { name: 'Modern terminal', cost: 2000, minSlots: 5 },
  vip_lane: { name: 'VIP park şeridi', cost: 1500, minSlots: 5 },
  collection_room: { name: 'Koleksiyon odası', cost: 2500, minSlots: 6 },
};

// trim: şerit rengi, rim: jant, glass: cam tonu, head: far rengi
export const SKINS = {
  classic: { name: 'Klasik', cost: 0, trim: 0x20242c, rim: 0xc9ced6, glass: 0x1b2a3a, head: 0xfff4c2 },
  graphite: { name: 'Grafit', cost: 900, minLevel: 8, trim: 0x111318, rim: 0x6b7280, glass: 0x0e1520, head: 0xe8f1ff },
  gold: { name: 'Altın Jant', cost: 1500, minLevel: 15, trim: 0x2a2110, rim: 0xe0b341, glass: 0x1b2a3a, head: 0xffe6a0 },
  electric: { name: 'Elektrik', cost: 1200, minLevel: 25, trim: 0x0c2a33, rim: 0x35e0ff, glass: 0x123a4a, head: 0x9ff4ff },
  sunset: { name: 'Gün Batımı', crystals: 40, trim: 0x3a1620, rim: 0xff8a5c, glass: 0x3a1f2f, head: 0xffc79a },
  vip_black: { name: 'VIP Siyah', premium: true, trim: 0x050506, rim: 0xd4af37, glass: 0x05080c, head: 0xffffff },
  aurora: { name: 'Aurora', premium: true, trim: 0x0b1f2a, rim: 0x7dffb8, glass: 0x0b2a35, head: 0xb8fff0 },
};

export const PREMIUM_SKUS = {
  premium_monthly: { name: 'Premium Aylık', days: 30, price: '₺— (test)' },
  premium_yearly: { name: 'Premium Yıllık', days: 365, price: '₺— (test)' },
  cosmetic_pack_1: { name: 'Lüks Kozmetik Paketi', days: 0, grants: ['gold', 'electric'], price: '₺— (test)' },
};

// Sunucuda doğrulanana kadar hiçbir ürün gerçek satın alma sayılmaz (bkz. premium.js).
export const MONETIZATION = {
  mode: 'test', // 'test' | 'live' — live için gerçek mağaza SDK'sı + sunucu doğrulaması gerekir
  childDirected: false, // true ise reklam sağlayıcıda çocuk yönelimli işleme etiketi açılmalı
};

export const DAILY_LOGIN = [
  { coins: 100 }, { coins: 150 }, { coins: 200 }, { crystals: 5 }, { coins: 300 }, { coins: 400 }, { crystals: 15, coins: 500 },
];

export const AD_LIMITS = {
  dailyTotal: 12,
  placements: {
    double_reward: { daily: 10, perRun: 1 },
    extra_move: { daily: 5, perRun: 1, moves: 3 },
    extra_hint: { daily: 5, perRun: 1 },
    temp_slot: { daily: 5, perRun: 1 },
    daily_coins: { daily: 3, perRun: 0, coins: 100 },
  },
  interstitial: { everyLevels: 4, minGapMs: 180000, minLevel: 6 },
};

export const QUEST_POOL = {
  daily: [
    { id: 'win3', ev: 'level_won', target: 3, text: '3 seviye tamamla', reward: { coins: 150 } },
    { id: 'win5', ev: 'level_won', target: 5, text: '5 seviye tamamla', reward: { coins: 300 } },
    { id: 'buses15', ev: 'bus_exit', target: 15, text: '15 otobüsü çıkar', reward: { coins: 120 } },
    { id: 'board40', ev: 'passenger', target: 40, text: '40 yolcu taşı', reward: { coins: 120 } },
    { id: 'star2', ev: 'star', target: 3, text: '3 yıldız topla', reward: { coins: 200 } },
    { id: 'three1', ev: 'three_star', target: 1, text: 'Bir seviyeyi 3 yıldızla bitir', reward: { coins: 200, crystals: 2 } },
    { id: 'spend', ev: 'coins_spent', target: 300, text: '300 para harca', reward: { coins: 100 } },
  ],
  weekly: [
    { id: 'wwin20', ev: 'level_won', target: 20, text: 'Hafta içinde 20 seviye tamamla', reward: { coins: 800, crystals: 10 } },
    { id: 'wstar15', ev: 'star', target: 15, text: '15 yıldız topla', reward: { coins: 600, crystals: 8 } },
    { id: 'wup', ev: 'upgrade', target: 2, text: '2 otopark/garaj geliştirmesi al', reward: { coins: 500, crystals: 6 } },
    { id: 'wbus100', ev: 'bus_exit', target: 100, text: '100 otobüs çıkar', reward: { coins: 700, crystals: 8 } },
  ],
  premiumDaily: { id: 'pdaily', ev: 'level_won', target: 2, text: 'Premium: 2 seviye tamamla', reward: { crystals: 3 }, premium: true },
};

export const ACHIEVEMENTS = [
  { id: 'clear10', text: '10 seviye tamamla', check: (s) => cleared(s) >= 10, reward: { crystals: 5 } },
  { id: 'clear50', text: '50 seviye tamamla', check: (s) => cleared(s) >= 50, reward: { crystals: 15 } },
  { id: 'clear100', text: '100 seviye tamamla', check: (s) => cleared(s) >= 100, reward: { crystals: 40 } },
  { id: 'stars30', text: '30 yıldız topla', check: (s) => totalStars(s) >= 30, reward: { crystals: 5 } },
  { id: 'stars150', text: '150 yıldız topla', check: (s) => totalStars(s) >= 150, reward: { crystals: 20 } },
  { id: 'slots6', text: '6 park yeri aç', check: (s) => s.parking.slots >= 6, reward: { crystals: 8 } },
  { id: 'garage4', text: '4 otobüs görünümü topla', check: (s) => s.garage.owned.length >= 4, reward: { crystals: 8 } },
];
export const cleared = (s) => Object.values(s.levels).filter((l) => l.stars > 0).length;
export const totalStars = (s) => Object.values(s.levels).reduce((a, l) => a + l.stars, 0);
