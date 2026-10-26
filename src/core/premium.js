// Premium üyelik ve tek seferlik ürünler.
//
// GÜVENLİK MODELİ: İstemci tek başına "satın aldım" diyemez. Her satın alma bir makbuz (receipt) üretir ve
// bir Verifier tarafından doğrulanmadan hiçbir hak verilmez. Bu depoda yalnızca:
//   * TestBillingProvider  – ödeme ALMAZ, açıkça "TEST" olarak işaretli makbuz üretir
//   * TestVerifier         – yalnızca MONETIZATION.mode === 'test' iken test makbuzunu kabul eder
//   * RejectingVerifier    – 'live' modda sunucu doğrulayıcı bağlanana kadar HER ŞEYİ reddeder
// vardır. Google Play Billing / StoreKit + sunucu doğrulaması YAZILMADI; bağlanması için arayüz hazırdır.
import { PREMIUM_SKUS, MONETIZATION } from './catalog.js';

const clone = (s) => JSON.parse(JSON.stringify(s));

export class TestBillingProvider {
  constructor() { this.owned = []; this.n = 0; this.failNext = null; }
  get name() { return 'TEST (gerçek ödeme alınmaz)'; }
  async purchase(sku, now) {
    if (this.failNext) { const f = this.failNext; this.failNext = null; return { status: f }; }
    if (!PREMIUM_SKUS[sku]) return { status: 'error' };
    const r = { status: 'purchased', sku, token: `test-${sku}-${++this.n}`, at: now, test: true };
    this.owned.push(r);
    return r;
  }
  async restore() { return this.owned.slice(); }
}

export class TestVerifier {
  constructor(mode = MONETIZATION.mode) { this.mode = mode; }
  async verify(receipt, now) {
    if (this.mode !== 'test' || !receipt || receipt.test !== true) return { valid: false };
    const sku = PREMIUM_SKUS[receipt.sku];
    if (!sku) return { valid: false };
    return { valid: true, sku: receipt.sku, token: receipt.token, expiresAt: sku.days ? receipt.at + sku.days * 86400000 : 0, verified: 'test' };
  }
}

export class RejectingVerifier {
  async verify() { return { valid: false }; }
}

export function isPremium(save, now) {
  const p = save.premium;
  return !!(p && p.verified && p.expiresAt > now);
}

export class PremiumManager {
  constructor(provider, verifier) { this.provider = provider; this.verifier = verifier; }

  /** Makbuzu doğrular ve kayda işler. Aynı token iki kez uygulanmaz (uzatma yalnızca yeni token ile). */
  async applyReceipt(save, receipt, now) {
    const v = await this.verifier.verify(receipt, now);
    if (!v.valid) return { ok: false, save, reason: 'unverified' };
    const spent = save.purchases || [];
    if (spent.includes(v.token)) return { ok: false, save, reason: 'duplicate' };
    const s = clone(save);
    s.purchases = [...spent, v.token].slice(-50);
    const def = PREMIUM_SKUS[v.sku];
    if (def.days) {
      const base = s.premium && s.premium.expiresAt > now ? s.premium.expiresAt : now;
      s.premium = { sku: v.sku, expiresAt: base + def.days * 86400000, verified: v.verified, token: v.token };
    }
    for (const id of def.grants || []) if (!s.garage.owned.includes(id)) s.garage.owned.push(id); // kalıcı kozmetik
    return { ok: true, save: s, sku: v.sku };
  }

  async buy(save, sku, now) {
    const r = await this.provider.purchase(sku, now);
    if (r.status !== 'purchased') return { ok: false, save, reason: r.status || 'error' };
    return this.applyReceipt(save, r, now);
  }

  async restore(save, now) {
    const list = await this.provider.restore();
    let s = save, n = 0;
    for (const r of list) {
      const res = await this.applyReceipt(s, r, now);
      if (res.ok) { s = res.save; n++; }
    }
    return { ok: true, save: s, restored: n };
  }
}
