import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSave } from '../src/core/economy.js';
import { loadSave, writeSave } from '../src/core/save.js';
import { buyParkingSlot, buyTheme, selectTheme, buyDecor, acquireSkin, selectSkin, effectiveTheme } from '../src/core/shop.js';
import { activeQuests, recordEvent, claimQuest, loginStatus, claimLogin, checkAchievements } from '../src/core/quests.js';
import { AdManager, TestAdProvider, adsLeft } from '../src/core/ads.js';
import { PremiumManager, TestBillingProvider, TestVerifier, RejectingVerifier, isPremium } from '../src/core/premium.js';
import { Analytics } from '../src/core/analytics.js';
import { Game } from '../src/core/engine.js';
import { dayKey } from '../src/core/timeutil.js';
import { MemStorage, tinyLevel } from './helpers.mjs';

const T0 = new Date(2026, 9, 26, 10, 0, 0).getTime();
const DAY = 86400000;
const rich = (o = {}) => ({ ...defaultSave(), coins: 20000, crystals: 100, unlocked: 50, ...o });

test('v1 kaydı v2\'ye göç eder ve ilerleme korunur', () => {
  const st = new MemStorage();
  const old = { v: 1, coins: 250, xp: 40, unlocked: 7, levels: { 1: { stars: 3, threeStarPaid: true } }, claimedRuns: [], settings: { sound: false, vibration: true, quality: 'low' } };
  const d = JSON.stringify(old);
  st.setItem('lbm3d.save', JSON.stringify({ d, h: (await_h(d)) }));
  const { save, source } = loadSave(st);
  assert.equal(source, 'primary');
  assert.equal(save.v, 2);
  assert.equal(save.coins, 250);
  assert.equal(save.parking.slots, 3);
  assert.deepEqual(save.garage.owned, ['classic']);
  assert.equal(save.settings.quality, 'low');
});
import { fnv1a } from '../src/core/save.js';
function await_h(d) { return fnv1a(d); }

test('bozuk kayıtta kapasite/sahiplik değerleri güvenli aralığa çekilir', () => {
  const st = new MemStorage();
  const s = defaultSave(); s.parking.slots = 99; s.garage.owned = ['gold']; s.garage.skin = 'nope'; s.crystals = -5;
  writeSave(st, s);
  const r = loadSave(st).save;
  assert.equal(r.parking.slots, 9);
  assert.ok(r.garage.owned.includes('classic'));
  assert.equal(r.garage.skin, 'classic');
  assert.equal(r.crystals, 0);
});

test('otopark: yer açma sırayla, yetersiz parada reddedilir, 9\'da durur', () => {
  let s = defaultSave();
  assert.equal(buyParkingSlot(s).reason, 'no_coins');
  s = rich();
  for (let want = 4; want <= 9; want++) {
    const r = buyParkingSlot(s);
    assert.ok(r.ok); s = r.save; assert.equal(s.parking.slots, want);
  }
  assert.equal(buyParkingSlot(s).reason, 'max');
  assert.ok(s.coins < 20000 && s.coins >= 0);
});

test('tema/dekor: premium tema yalnızca üyeye, dekor şartları, çift satın alma yok', () => {
  const s = rich();
  assert.equal(buyTheme(s, 'neon', false).reason, 'premium_only');
  const n = buyTheme(s, 'neon', true);
  assert.ok(n.ok);
  assert.equal(n.save.coins, s.coins); // premium tema para harcamaz
  assert.equal(buyTheme(n.save, 'neon', true).reason, 'owned');
  // üyelik bitti: sahiplik kalır, kullanım gündüze düşer
  const sel = selectTheme(n.save, 'neon', true).save;
  assert.equal(effectiveTheme(sel, true), 'neon');
  assert.equal(effectiveTheme(sel, false), 'day');
  assert.ok(sel.parking.themes.includes('neon'));
  assert.equal(buyDecor(s, 'terminal').reason, 'need_slots');
  assert.ok(buyDecor(s, 'plants').ok);
});

test('garaj: para/kristal/seviye şartı, premium görünüm üyelikte alınırsa kalıcı', () => {
  const low = { ...rich(), unlocked: 1 };
  assert.equal(acquireSkin(low, 'gold', false).reason, 'need_level');
  assert.equal(acquireSkin({ ...rich(), crystals: 10 }, 'sunset', false).reason, 'no_crystals');
  const g = acquireSkin(rich(), 'sunset', false);
  assert.ok(g.ok); assert.equal(g.save.crystals, 60);
  assert.equal(acquireSkin(rich(), 'vip_black', false).reason, 'premium_only');
  const v = acquireSkin(rich(), 'vip_black', true).save;
  assert.ok(v.garage.owned.includes('vip_black'));
  assert.equal(selectSkin(v, 'vip_black').save.garage.skin, 'vip_black');
  assert.equal(selectSkin(v, 'aurora').reason, 'not_owned');
});

test('görevler: aynı gün sabit seçim, ilerleme, tek kez ödül, ertesi gün sıfırlanır', () => {
  const a = activeQuests(defaultSave(), T0, false), b = activeQuests(defaultSave(), T0 + 3600000, false);
  assert.deepEqual(a.daily.map((q) => q.id), b.daily.map((q) => q.id));
  assert.equal(a.daily.length, 3);
  assert.equal(activeQuests(defaultSave(), T0, true).daily.length, 4);
  const q = a.daily[0];
  let s = defaultSave();
  for (let i = 0; i < q.target + 3; i++) s = recordEvent(s, T0, false, q.ev, 1);
  assert.equal(s.quests.daily.progress[q.id], q.target); // hedefi aşmaz
  const c1 = claimQuest(s, T0, false, 'daily', q.id);
  assert.ok(c1.ok);
  assert.equal(claimQuest(c1.save, T0, false, 'daily', q.id).reason, 'claimed');
  assert.equal(claimQuest(defaultSave(), T0, false, 'daily', q.id).reason, 'incomplete');
  const next = claimQuest(c1.save, T0 + DAY, false, 'daily', q.id);
  assert.notEqual(next.reason, 'claimed'); // yeni gün: sıfırlandı
});

test('günlük giriş: günde bir, seri devam eder, boşlukta sıfırlanır, saat geri alınırsa verilmez', () => {
  let s = defaultSave();
  const r1 = claimLogin(s, T0); assert.ok(r1.ok); assert.equal(r1.day, 0);
  assert.equal(claimLogin(r1.save, T0 + 1000).reason, 'claimed');
  const r2 = claimLogin(r1.save, T0 + DAY); assert.equal(r2.day, 1);
  const r3 = claimLogin(r2.save, T0 + 4 * DAY); assert.equal(r3.day, 0); // seri bozuldu
  const tampered = { ...r2.save, lastSeen: T0 + 10 * DAY };
  assert.equal(claimLogin(tampered, T0 + 2 * DAY).reason, 'clock');
  assert.equal(r1.save.coins, 100);
});

test('başarılar bir kez verilir', () => {
  const s = defaultSave();
  for (let i = 1; i <= 10; i++) s.levels[i] = { stars: 1 };
  const a = checkAchievements(s);
  assert.ok(a.gained.some((x) => x.id === 'clear10'));
  assert.equal(a.save.crystals, 5);
  assert.equal(checkAchievements(a.save).gained.length, 0);
});

test('reklam: tamamlanmadan ödül yok; token tekrarı reddedilir; limitler çalışır', async () => {
  const prov = new TestAdProvider(async () => true);
  const ads = new AdManager(prov);
  let s = defaultSave();
  prov.nextResult = { completed: false };
  assert.equal((await ads.requestReward(s, T0, 'daily_coins')).reason, 'not_completed');
  prov.nextResult = { completed: true }; // token yok
  assert.equal((await ads.requestReward(s, T0, 'daily_coins')).reason, 'not_completed');
  prov.nextResult = { completed: true, token: 'T1' };
  const ok = await ads.requestReward(s, T0, 'daily_coins');
  assert.ok(ok.ok); assert.equal(ok.save.coins, 100);
  prov.nextResult = { completed: true, token: 'T1' };
  assert.equal((await ads.requestReward(ok.save, T0, 'daily_coins')).reason, 'duplicate');
  s = ok.save;
  for (let i = 0; i < 2; i++) { const r = await ads.requestReward(s, T0, 'daily_coins'); assert.ok(r.ok); s = r.save; }
  assert.equal(adsLeft(s, T0, 'daily_coins'), 0);
  assert.equal((await ads.requestReward(s, T0, 'daily_coins')).reason, 'daily_limit');
  assert.ok((await ads.requestReward(s, T0 + DAY, 'daily_coins')).ok); // ertesi gün
  assert.equal(s.coins, 300);
});

test('reklam yüklenmediyse ödül yok ve sahte işlem yapılmaz; run limiti', async () => {
  const prov = new TestAdProvider(async () => true);
  const ads = new AdManager(prov);
  prov.ready = false;
  const s = defaultSave();
  const r = await ads.requestReward(s, T0, 'extra_hint');
  assert.equal(r.reason, 'not_ready'); assert.deepEqual(r.save, s);
  prov.ready = true;
  assert.equal((await ads.requestReward(s, T0, 'extra_hint', 1)).reason, 'run_limit');
  const kapat = new AdManager(new TestAdProvider(async () => false));
  assert.equal((await kapat.requestReward(s, T0, 'extra_hint')).reason, 'not_completed');
});

test('ara reklam: premium muaf, erken seviye ve sık gösterim yok, oyun sırasında değil (yalnızca sıra/aralık)', async () => {
  const ads = new AdManager(new TestAdProvider(async () => true));
  let s = defaultSave();
  for (let i = 0; i < 4; i++) s = ads.noteLevelDone(s);
  assert.equal(ads.interstitialDue(s, T0, false, 3), false); // 6. seviyeden önce yok
  assert.equal(ads.interstitialDue(s, T0, true, 10), false); // premium
  assert.equal(ads.interstitialDue(s, T0, false, 10), true);
  const sh = await ads.showInterstitial(s, T0);
  assert.ok(sh.shown);
  for (let i = 0; i < 4; i++) sh.save = ads.noteLevelDone(sh.save);
  assert.equal(ads.interstitialDue(sh.save, T0 + 60000, false, 10), false); // aralık dolmadı
  assert.equal(ads.interstitialDue(sh.save, T0 + 200000, false, 10), true);
});

test('premium: test modunda doğrulanır, canlı modda doğrulayıcı yoksa hiçbir şey açılmaz', async () => {
  const pm = new PremiumManager(new TestBillingProvider(), new TestVerifier('test'));
  const r = await pm.buy(defaultSave(), 'premium_monthly', T0);
  assert.ok(r.ok);
  assert.ok(isPremium(r.save, T0 + DAY));
  assert.ok(!isPremium(r.save, T0 + 31 * DAY)); // süre bitti
  const live = new PremiumManager(new TestBillingProvider(), new RejectingVerifier());
  const x = await live.buy(defaultSave(), 'premium_yearly', T0);
  assert.equal(x.reason, 'unverified'); assert.equal(isPremium(x.save, T0), false);
  const liveMode = new PremiumManager(new TestBillingProvider(), new TestVerifier('live'));
  assert.equal((await liveMode.buy(defaultSave(), 'premium_monthly', T0)).reason, 'unverified');
});

test('premium: iptal/başarısız ödeme hak vermez; geri yükleme; çift uygulama yok; kozmetik kalıcı', async () => {
  const prov = new TestBillingProvider();
  const pm = new PremiumManager(prov, new TestVerifier('test'));
  prov.failNext = 'cancelled';
  assert.equal((await pm.buy(defaultSave(), 'premium_monthly', T0)).reason, 'cancelled');
  const a = await pm.buy(defaultSave(), 'premium_monthly', T0);
  // yeni cihaz: kayıt boş, geri yükle
  const rest = await pm.restore(defaultSave(), T0 + DAY);
  assert.equal(rest.restored, 1);
  assert.ok(isPremium(rest.save, T0 + DAY));
  const again = await pm.restore(rest.save, T0 + DAY);
  assert.equal(again.restored, 0); // aynı makbuz ikinci kez uygulanmaz
  const pack = await pm.buy(a.save, 'cosmetic_pack_1', T0);
  assert.ok(pack.save.garage.owned.includes('gold'));
  assert.ok(!isPremium({ ...pack.save, premium: { ...pack.save.premium, expiresAt: T0 - 1 } }, T0));
  assert.ok(pack.save.garage.owned.includes('gold')); // üyelik bitse de kozmetik kalır
});

test('oyun içi reklam hakları: ek hamle, ek ipucu, geçici park yeri', () => {
  const g = new Game(tinyLevel({ moveLimit: 2 }));
  g.tap(1); g.tap(0);
  assert.equal(g.movesLeft, 0);
  assert.ok(g.grantMoves(3));
  assert.equal(g.movesLeft, 3);
  const g2 = new Game(tinyLevel());
  g2.hintsUsed = 3;
  assert.equal(g2.canHint(), false);
  g2.grantHint();
  assert.equal(g2.canHint(), true);
  const cap = g2.st.cap;
  assert.ok(g2.grantAdSlot()); assert.equal(g2.st.cap, cap + 1);
  assert.equal(g2.grantAdSlot(), false); // yalnızca bir kez
  assert.equal(new Game(tinyLevel()).grantMoves(3), false); // limitsiz seviyede anlamsız
});

test('analitik: halka tampon sınırı, hata kaydı, ağ yok', () => {
  const a = new Analytics(new MemStorage(), 5);
  for (let i = 0; i < 9; i++) a.track('x', { i });
  a.error(new Error('boom'));
  assert.equal(a.buf.length, 5);
  assert.equal(a.buf.at(-1).name, 'error');
  a.flush();
  assert.equal(new Analytics(a.storage, 5).buf.length, 5);
});

test('dayKey yerel tarihle çalışır', () => assert.equal(dayKey(T0), '2026-10-26'));
