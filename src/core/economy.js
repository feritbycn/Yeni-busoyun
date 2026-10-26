// Merkezi ekonomi: ödül hesabı ve tekrar-ödül engelleme. Değerler dengeleme testleriyle ayarlanacak başlangıç değerleridir.
// NOT: Bu kod istemci tarafında çalışır; bozulmaya karşı korur, hileye karşı koruma sağlamaz.
// Premium kristal / satın alma gibi gerçek para değeri taşıyan kaynaklar bu prototipte YOKTUR (sunucu doğrulaması gerekir).

export const ECONOMY = {
  easyMaxLevel: 25,
  mediumMaxLevel: 50,
  // [min, max] oyun içi para
  coins: { easy: [100, 150], medium: [150, 250], hard: [250, 400], special: [400, 700] },
  starBonusRange: [0.2, 0.5], // 3 yıldız bonusu: temel ödülün %20-%50'si
  xpPerCoin: 0.2,
  claimedRunsKept: 25,
};

export function tierOf(n) {
  if (n >= 10 && n % 10 === 0) return 'special';
  if (n <= ECONOMY.easyMaxLevel) return 'easy';
  if (n <= ECONOMY.mediumMaxLevel) return 'medium';
  return 'hard';
}

const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));

export function levelReward(n) {
  const tier = tierOf(n);
  const [lo, hi] = ECONOMY.coins[tier];
  let t;
  if (tier === 'easy') t = (n - 1) / (ECONOMY.easyMaxLevel - 1);
  else if (tier === 'medium') t = (n - ECONOMY.easyMaxLevel - 1) / (ECONOMY.mediumMaxLevel - ECONOMY.easyMaxLevel - 1);
  else if (tier === 'hard') t = (n - ECONOMY.mediumMaxLevel - 1) / 49;
  else t = n / 100;
  const coins = Math.round(lerp(lo, hi, t));
  const bonusPct = lerp(ECONOMY.starBonusRange[0], ECONOMY.starBonusRange[1], n / 100);
  return {
    tier,
    coins,
    starBonusCoins: Math.round(coins * bonusPct),
    xp: Math.round(coins * ECONOMY.xpPerCoin),
  };
}

export function accountLevel(xp) {
  return Math.floor(Math.sqrt(xp / 50)) + 1;
}

export function defaultSave() {
  return {
    v: 2,
    coins: 0,
    crystals: 0, // yalnızca görev/başarı ile kazanılır; bu sürümde satın alınamaz
    xp: 0,
    parking: { slots: 3, theme: 'day', themes: ['day'], decor: [] },
    garage: { owned: ['classic'], skin: 'classic' },
    quests: { daily: { key: '', progress: {}, claimed: {} }, weekly: { key: '', progress: {}, claimed: {} } },
    login: { lastKey: '', streak: 0, claimedTotal: 0 },
    achievements: {},
    ads: { day: '', counts: {}, tokens: [], lastInterstitialAt: 0, levelsSince: 0 },
    premium: null, // { sku, expiresAt, verified, token }
    lastSeen: 0,
    unlocked: 1, // erişilebilen en yüksek seviye
    levels: {}, // { [n]: { stars, threeStarPaid } }
    claimedRuns: [],
    settings: { sound: true, vibration: true, quality: 'high' },
  };
}

/**
 * Seviye sonucunu kayda işler. Saf fonksiyon: yeni kayıt + ödül dökümü döndürür.
 *  - Temel ödül ve deneyim yalnızca İLK tamamlamada verilir.
 *  - 3 yıldız bonusu bir seviyede yalnızca bir kez verilir.
 *  - Aynı run (runId) ikinci kez işlenmez.
 */
export function claimLevelResult(save, level, result) {
  const reward = { coins: 0, xp: 0, base: 0, starBonus: 0, firstClear: false, duplicate: false, newBest: false };
  if (save.claimedRuns.includes(result.runId)) {
    reward.duplicate = true;
    return { save, reward };
  }
  const s = JSON.parse(JSON.stringify(save));
  const n = level.id;
  const prev = s.levels[n] || { stars: 0, threeStarPaid: false };
  const rw = level.rewards;
  if (prev.stars === 0) {
    reward.firstClear = true;
    reward.base = rw.coins;
    reward.xp = rw.xp;
  }
  if (result.stars >= 3 && !prev.threeStarPaid) {
    reward.starBonus = rw.starBonusCoins;
    prev.threeStarPaid = true;
  }
  if (result.stars > prev.stars) {
    prev.stars = result.stars;
    reward.newBest = true;
  }
  reward.coins = reward.base + reward.starBonus;
  s.levels[n] = prev;
  s.coins += reward.coins;
  s.xp += reward.xp;
  s.unlocked = Math.max(s.unlocked, n + 1);
  s.claimedRuns.push(result.runId);
  if (s.claimedRuns.length > ECONOMY.claimedRunsKept) s.claimedRuns.shift();
  return { save: s, reward };
}
