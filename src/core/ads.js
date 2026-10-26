// Reklam yöneticisi. Ödüllü reklam yalnızca sağlayıcı "tamamlandı + benzersiz token" bildirirse ödül verir.
// Gerçek reklam SDK'sı (AdMob vb.) bu depoda YOKTUR; TestAdProvider açıkça simülasyondur ve arayüzde "TEST REKLAMI" yazar.
// Gerçek SDK için aynı arayüz (isReady/show) uygulanmalı; ödül doğrulaması için sunucu tarafı (SSV) önerilir.
import { AD_LIMITS } from './catalog.js';
import { dayKey, clockTampered } from './timeutil.js';

const clone = (s) => JSON.parse(JSON.stringify(s));

export class TestAdProvider {
  constructor(presenter) { this.presenter = presenter; this.n = 0; this.ready = true; this.nextResult = null; }
  get name() { return 'TEST REKLAMI (simülasyon)'; }
  isReady() { return this.ready; }
  /** presenter: arayüzün gösterdiği sahte reklam; kullanıcı izlerse true, kapatırsa false döner. */
  async show(placement, kind) {
    if (this.nextResult) { const r = this.nextResult; this.nextResult = null; return r; }
    const watched = this.presenter ? await this.presenter(placement, kind) : true;
    return watched ? { completed: true, token: `testad-${Date.now()}-${++this.n}` } : { completed: false };
  }
}

function rolled(save, now) {
  const dk = dayKey(now);
  if (save.ads.day === dk) return save;
  const s = clone(save);
  s.ads = { ...s.ads, day: dk, counts: {} };
  return s;
}

export function adsLeft(save, now, placement) {
  const s = rolled(save, now);
  const lim = AD_LIMITS.placements[placement];
  if (!lim) return 0;
  const total = Object.values(s.ads.counts).reduce((a, b) => a + b, 0);
  return Math.max(0, Math.min(lim.daily - (s.ads.counts[placement] || 0), AD_LIMITS.dailyTotal - total));
}

export class AdManager {
  constructor(provider) { this.provider = provider; this.pending = false; }

  /** Ödüllü reklam isteği. runCount: bu seviye denemesinde bu yerleşim için daha önce alınan hak sayısı. */
  async requestReward(save, now, placement, runCount = 0) {
    const lim = AD_LIMITS.placements[placement];
    if (!lim) return { ok: false, save, reason: 'unknown' };
    if (clockTampered(save, now)) return { ok: false, save, reason: 'clock' };
    if (this.pending) return { ok: false, save, reason: 'busy' };
    if (lim.perRun && runCount >= lim.perRun) return { ok: false, save, reason: 'run_limit' };
    if (adsLeft(save, now, placement) <= 0) return { ok: false, save, reason: 'daily_limit' };
    if (!this.provider.isReady(placement)) return { ok: false, save, reason: 'not_ready' };
    this.pending = true;
    let res;
    try { res = await this.provider.show(placement, 'rewarded'); } catch { res = { completed: false }; } finally { this.pending = false; }
    if (!res || res.completed !== true || !res.token) return { ok: false, save, reason: 'not_completed' };
    const s = rolled(save, now);
    if (s.ads.tokens.includes(res.token)) return { ok: false, save, reason: 'duplicate' };
    const out = clone(s);
    out.ads.tokens = [...out.ads.tokens, res.token].slice(-100);
    out.ads.counts[placement] = (out.ads.counts[placement] || 0) + 1;
    const reward = {};
    if (placement === 'daily_coins') { out.coins += lim.coins; reward.coins = lim.coins; }
    if (placement === 'extra_move') reward.moves = lim.moves;
    if (placement === 'extra_hint') reward.hints = 1;
    if (placement === 'temp_slot') reward.slots = 1;
    if (placement === 'double_reward') reward.double = true; // ödemeyi çağıran yapar (aynı run'a bir kez)
    return { ok: true, save: out, reward };
  }

  /** Seviye bitişinde (arada, asla oyun sırasında) gösterilecek zorunlu reklam zamanı geldi mi? */
  interstitialDue(save, now, premium, levelId) {
    const c = AD_LIMITS.interstitial;
    if (premium || levelId < c.minLevel || clockTampered(save, now)) return false;
    return save.ads.levelsSince >= c.everyLevels && now - save.ads.lastInterstitialAt >= c.minGapMs;
  }
  noteLevelDone(save) {
    const s = clone(save);
    s.ads.levelsSince++;
    return s;
  }
  async showInterstitial(save, now) {
    if (this.pending || !this.provider.isReady('interstitial')) return { shown: false, save };
    this.pending = true;
    try { await this.provider.show('interstitial', 'interstitial'); } catch { /* reklam hatası oyunu bloklamaz */ } finally { this.pending = false; }
    const s = clone(save);
    s.ads.levelsSince = 0;
    s.ads.lastInterstitialAt = now;
    return { shown: true, save: s };
  }
}
