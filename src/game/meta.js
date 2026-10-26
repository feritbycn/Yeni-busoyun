// Meta oyun arayüzü: Otopark, Garaj, Görevler, Premium mağaza, Profil + reklam sahnesi.
// Kurallar src/core/* içindedir (test edilir); bu dosya yalnızca onları çağırır ve çizer.
import { PARKING, THEMES, DECOR, SKINS, PREMIUM_SKUS, MONETIZATION, DAILY_LOGIN, ACHIEVEMENTS, AD_LIMITS } from '../core/catalog.js';
import { buyParkingSlot, buyTheme, selectTheme, buyDecor, acquireSkin, selectSkin, nextSlotCost, effectiveTheme } from '../core/shop.js';
import { activeQuests, rollover, recordEvent, claimQuest, loginStatus, claimLogin, checkAchievements } from '../core/quests.js';
import { AdManager, TestAdProvider, adsLeft } from '../core/ads.js';
import { PremiumManager, TestBillingProvider, TestVerifier, isPremium } from '../core/premium.js';
import { accountLevel, levelReward } from '../core/economy.js';
import { touch } from '../core/timeutil.js';
import { cleared, totalStars } from '../core/catalog.js';

const $ = (id) => document.getElementById(id);
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const REASON = {
  no_coins: 'Yeterli paran yok.', no_crystals: 'Yeterli kristalin yok.', owned: 'Zaten sahipsin.', max: 'En üst seviyedesin.',
  premium_only: 'Premium üyelere özel.', need_level: 'Daha ilerideki bir seviye gerekiyor.', need_slots: 'Önce daha fazla park yeri aç.',
  not_owned: 'Sahip değilsin.', clock: 'Cihaz saati geri alınmış görünüyor; zaman bağlı ödüller verilmedi.', claimed: 'Zaten alındı.',
  incomplete: 'Görev henüz tamamlanmadı.', unverified: 'Satın alma doğrulanamadı; hiçbir hak verilmedi.', cancelled: 'Satın alma iptal edildi.',
  error: 'Satın alma tamamlanamadı.', daily_limit: 'Bugünkü reklam ödülü limitine ulaştın.', run_limit: 'Bu seviyede bu ödülü zaten aldın.',
  not_ready: 'Şu an gösterilecek reklam yok. Daha sonra tekrar dene.', not_completed: 'Reklam tamamlanmadı; ödül verilmedi.',
  duplicate: 'Bu ödül zaten işlendi.', busy: 'Başka bir reklam açık.',
};
export const reasonText = (r) => REASON[r] || 'İşlem yapılamadı.';

export function createMeta(ctx) {
  const { getSave, setSave, now, toast, sfx, showroom } = ctx;
  let panel = null; // geçerli panel adı
  let adResolve = null, adTimer = 0;

  // ------------------------------------------------------------ servisler
  const premium = () => isPremium(getSave(), now());
  const adProvider = new TestAdProvider(presentAd);
  const ads = new AdManager(adProvider);
  const billing = new TestBillingProvider();
  try { const r = JSON.parse(ctx.storage.getItem('lbm3d.testreceipts') || '[]'); billing.owned = r; billing.n = r.length; } catch { /* boş */ }
  const pm = new PremiumManager(billing, new TestVerifier(MONETIZATION.mode));
  const persistReceipts = () => { try { ctx.storage.setItem('lbm3d.testreceipts', JSON.stringify(billing.owned)); } catch { /* depolama dolu */ } };

  /** Tek giriş noktası: yeni kaydı yazar, saat damgası ve başarıları işler. */
  function commit(ns) {
    let s = touch(ns, now());
    const a = checkAchievements(s);
    s = a.save;
    a.gained.forEach((g) => toast(`🏅 Başarı: ${g.text} (+${g.reward.crystals} 💎)`, 2600));
    setSave(s);
    return s;
  }
  function event(ev, amount = 1) {
    const s = getSave();
    const ns = recordEvent(s, now(), premium(), ev, amount);
    if (ns !== s) setSave(ns);
    updateDots();
  }
  const spentEvents = (cost) => { if (cost > 0) event('coins_spent', cost); event('upgrade'); };

  // ------------------------------------------------------------ reklam sahnesi (TEST)
  function presentAd(placement, kind) {
    return new Promise((res) => {
      const rewarded = kind === 'rewarded';
      $('ad-title').textContent = rewarded ? 'Ödüllü reklam' : 'Reklam';
      $('ad-desc').textContent = rewarded
        ? 'Bu bir TEST simülasyonudur. Gerçek reklam SDK\'sı bağlı değil. Süre dolunca ödülü alırsın.'
        : 'Bu bir TEST simülasyonudur (seviyeler arasında, sınırlı sıklıkta gösterilir). Premium üyelerde görünmez.';
      $('ad-skip').classList.toggle('hidden', !rewarded);
      const done = $('ad-done'); done.disabled = true;
      const fill = $('ad-fill'); fill.style.width = '0%';
      $('modal-ad').classList.remove('hidden');
      const total = api.adSeconds ?? 3;
      const t0 = performance.now();
      clearInterval(adTimer);
      const finish = (ok) => { clearInterval(adTimer); $('modal-ad').classList.add('hidden'); adResolve = null; res(ok); };
      adResolve = finish;
      const tick = () => {
        const k = Math.min(1, (performance.now() - t0) / (total * 1000));
        fill.style.width = k * 100 + '%';
        done.textContent = k < 1 ? `Bekle… ${Math.ceil(total - k * total)}` : rewarded ? 'Ödülü al' : 'Kapat';
        done.disabled = k < 1;
        if (k >= 1) clearInterval(adTimer);
      };
      adTimer = setInterval(tick, 100); tick();
      done.onclick = () => finish(true);
      $('ad-skip').onclick = () => finish(false);
    });
  }

  /** Ödüllü reklam: sonuç { ok, reward, reason } — kayıt güncellemesi dahil. */
  async function rewarded(placement, runCount = 0) {
    const r = await ads.requestReward(getSave(), now(), placement, runCount);
    if (!r.ok) { if (r.reason !== 'not_completed') toast(reasonText(r.reason)); else toast('Ödül verilmedi (reklam tamamlanmadı).'); return r; }
    setSave(touch(r.save, now()));
    event('ad_watched');
    sfx.coin();
    return r;
  }

  function noteWin() { setSave(ads.noteLevelDone(getSave())); }
  async function interstitialIfDue(levelId) {
    const s = getSave();
    if (!ads.interstitialDue(s, now(), premium(), levelId)) return false;
    const r = await ads.showInterstitial(s, now());
    if (r.shown) setSave(r.save);
    return r.shown;
  }

  // ------------------------------------------------------------ panel altyapısı
  function showroomState() {
    const s = getSave();
    return { slots: s.parking.slots, theme: effectiveTheme(s, premium()), decor: s.parking.decor, owned: s.garage.owned, skin: s.garage.skin };
  }
  function open(name) {
    panel = name;
    const p = $('panel');
    const isRoom = name === 'parking' || name === 'garage';
    p.classList.remove('hidden', 'full', 'sheet');
    p.classList.add(isRoom ? 'sheet' : 'full');
    $('panel-title').textContent = { parking: 'Otopark', garage: 'Otobüs Garajı', quests: 'Görevler', shop: 'Premium', profile: 'Profil' }[name];
    const s = rollover(getSave(), now());
    if (s !== getSave()) setSave(s);
    ctx.onOpen(isRoom, isRoom ? showroomState() : null);
    render();
  }
  function close() {
    panel = null;
    $('panel').classList.add('hidden');
    ctx.onClose();
  }
  function render() {
    if (!panel) return;
    ctx.refreshCoins();
    if (panel === 'parking' || panel === 'garage') ctx.refreshShowroom(showroomState());
    $('panel-body').innerHTML = { parking: renderParking, garage: renderGarage, quests: renderQuests, shop: renderShop, profile: renderProfile }[panel]();
    updateDots();
  }
  function updateDots() {
    const s = getSave();
    const st = loginStatus(s, now());
    const act = activeQuests(s, now(), premium());
    const ready = [['daily', act.daily], ['weekly', act.weekly]].some(([sc, l]) => l.some((q) => {
      const sv = s.quests[sc];
      return sv.key && (sv.progress[q.id] || 0) >= q.target && !sv.claimed[q.id];
    }));
    $('dot-quests').classList.toggle('hidden', !(st.canClaim || ready));
  }

  const money = (c) => (c > 0 ? `🪙 ${c}` : 'Ücretsiz');
  const btn = (label, act, extra = '', cls = '') => `<button class="btn ${cls}" data-act="${act}" ${extra}>${label}</button>`;

  // ------------------------------------------------------------ sayfalar
  function renderParking() {
    const s = getSave(), prem = premium();
    const next = nextSlotCost(s);
    let h = `<div class="item"><div class="sw">🅿️</div><div class="tx">Park yerleri: ${s.parking.slots} / ${PARKING.maxSlots}<small>Sergileme alanıdır; bulmacadaki geçici park alanından ayrıdır.</small></div>`
      + (next == null ? '' : btn(`🪙 ${next}`, 'slot', s.coins < next ? 'disabled' : '', 'primary')) + '</div>';
    h += '<div class="sec">Tema</div>';
    for (const [id, t] of Object.entries(THEMES)) {
      const own = s.parking.themes.includes(id), cur = s.parking.theme === id;
      const lock = t.premium && !prem;
      const label = cur ? 'Seçili' : own ? (lock ? '⭐ Üyelik gerekli' : 'Kullan') : lock ? '⭐ Premium' : money(t.cost);
      const act = own ? `use-theme:${id}` : `buy-theme:${id}`;
      h += `<div class="item ${cur ? 'on' : ''}"><div class="sw" style="background:${{ day: '#7fb6ff', night: '#0b1230', rain: '#4b5668', neon: '#7a1fa8' }[id]}"></div><div class="tx">${t.name}${t.premium ? ' ⭐' : ''}<small>${own ? 'Sahipsin' : ''}</small></div>${btn(label, act, cur || (lock && !own) || (!own && s.coins < t.cost && !t.premium) ? 'disabled' : '')}</div>`;
    }
    h += '<div class="sec">Dekorasyon</div>';
    for (const [id, d] of Object.entries(DECOR)) {
      const own = s.parking.decor.includes(id);
      const need = d.minSlots && s.parking.slots < d.minSlots;
      h += `<div class="item ${own ? 'on' : ''}"><div class="tx">${d.name}<small>${need ? `${d.minSlots} park yeri gerekir` : own ? 'Sahipsin' : ''}</small></div>${own ? '<span class="pill">✓</span>' : btn(money(d.cost), `buy-decor:${id}`, need || s.coins < d.cost ? 'disabled' : '')}</div>`;
    }
    return h;
  }

  function renderGarage() {
    const s = getSave(), prem = premium();
    let h = '<div class="note" style="margin:0">Görünümler yalnızca kozmetiktir; bulmaca renklerini ve oynanışı değiştirmez.</div>';
    for (const [id, k] of Object.entries(SKINS)) {
      const own = s.garage.owned.includes(id), cur = s.garage.skin === id;
      let label, dis = false;
      if (cur) { label = 'Seçili'; dis = true; }
      else if (own) label = 'Kullan';
      else if (k.premium) { label = prem ? 'Edin (Ücretsiz)' : '⭐ Premium'; dis = !prem; }
      else if (k.minLevel && s.unlocked < k.minLevel) { label = `Seviye ${k.minLevel}`; dis = true; }
      else if (k.crystals) { label = `💎 ${k.crystals}`; dis = s.crystals < k.crystals; }
      else { label = money(k.cost); dis = s.coins < k.cost; }
      h += `<div class="item ${cur ? 'on' : ''}"><div class="sw" style="background:${hex(k.rim)};color:#000">🚌</div><div class="tx">${k.name}${k.premium ? ' ⭐' : ''}<small>${own ? 'Sahipsin' : k.premium ? 'Üyeyken edinilirse kalıcıdır' : ''}</small></div>${btn(label, own ? `use-skin:${id}` : `acq-skin:${id}`, dis ? 'disabled' : '')}</div>`;
    }
    return h;
  }

  function renderQuests() {
    const s = getSave(), prem = premium(), t = now();
    const st = loginStatus(s, t);
    let h = '<div class="sec">Günlük giriş ödülü</div><div class="login-days">';
    DAILY_LOGIN.forEach((r, i) => {
      const got = i < st.day && !st.canClaim ? true : false;
      const cur = i === st.day;
      h += `<div class="${cur ? 'now' : ''} ${i < st.day ? 'got' : ''}">Gün ${i + 1}<br>${r.coins ? '🪙' + r.coins : ''}${r.crystals ? '<br>💎' + r.crystals : ''}</div>`;
      void got;
    });
    h += '</div>' + btn(st.canClaim ? 'Bugünkü ödülü al' : st.reason === 'clock' ? 'Saat hatası' : 'Bugün alındı ✓', 'login', st.canClaim ? '' : 'disabled', 'primary');
    const act = activeQuests(s, t, prem);
    const sec = (title, scope, list) => {
      let x = `<div class="sec">${title}</div>`;
      for (const q of list) {
        const pr = Math.min(q.target, s.quests[scope].progress[q.id] || 0), done = pr >= q.target, cl = s.quests[scope].claimed[q.id];
        const rw = [q.reward.coins ? '🪙' + q.reward.coins : '', q.reward.crystals ? '💎' + q.reward.crystals : ''].filter(Boolean).join(' ');
        x += `<div class="item"><div class="tx">${q.text}<small>${pr}/${q.target} · Ödül: ${rw}</small><div class="prog ${done ? 'done' : ''}"><i style="width:${(pr / q.target) * 100}%"></i></div></div>${cl ? '<span class="pill">✓</span>' : btn('Al', `claim:${scope}:${q.id}`, done ? '' : 'disabled', done ? 'primary' : '')}</div>`;
      }
      return x;
    };
    h += sec('Günlük görevler', 'daily', act.daily) + sec('Haftalık görevler', 'weekly', act.weekly);
    const left = adsLeft(s, t, 'daily_coins');
    h += `<div class="sec">Ücretsiz bonus</div><div class="item"><div class="tx">📺 Günlük para bonusu<small>Test reklamı · bugün kalan hak: ${left}</small></div>${btn(`+${AD_LIMITS.placements.daily_coins.coins} 🪙`, 'ad-coins', left ? '' : 'disabled', 'gold')}</div>`;
    return h;
  }

  function renderShop() {
    const s = getSave(), prem = premium(), p = s.premium;
    const exp = p && p.expiresAt > now() ? new Date(p.expiresAt).toLocaleDateString('tr-TR') : null;
    let h = `<div class="banner">${MONETIZATION.mode === 'test' ? '<b>TEST MODU:</b> Gerçek ödeme alınmaz ve gerçek mağaza (Google Play Billing) bağlı değildir. Aşağıdaki satın almalar yalnızca bu cihazda simüle edilir; sunucu doğrulaması olmadığı için gerçek bir aboneliği temsil etmez.' : 'Satın alma doğrulayıcı bağlı değil; satın alma kapalı.'}</div>`;
    h += `<div class="banner ${prem ? 'ok' : ''}">${prem ? `⭐ Premium aktif (test) · bitiş: ${exp}` : 'Premium üye değilsin.'}</div>`;
    h += '<div class="note" style="margin:0">Premium: zorunlu reklam yok, özel görünümler/tema, ek günlük görev, profil rozeti. Bulmacaları otomatik çözmez; zafer garantisi vermez. Üyelik bitse de edindiğin kozmetikler kalır.</div>';
    for (const [sku, d] of Object.entries(PREMIUM_SKUS)) {
      h += `<div class="item"><div class="tx">${d.name}<small>${d.days ? d.days + ' gün' : 'Tek seferlik · Altın Jant + Elektrik görünümü'} · ${d.price}</small></div>${btn('Satın al (test)', `buy:${sku}`, '', 'primary')}</div>`;
    }
    h += btn('Satın almaları geri yükle', 'restore') + '<div id="shop-msg"></div>';
    h += `<div class="sec">Reklam durumu</div><div class="note" style="margin:0">${prem ? 'Premium: zorunlu reklam gösterilmez. İstersen ödüllü reklam izleyebilirsin.' : `Seviyeler arasında her ${AD_LIMITS.interstitial.everyLevels}. seviyede (en az ${AD_LIMITS.interstitial.minGapMs / 60000} dk arayla, ${AD_LIMITS.interstitial.minLevel}. seviyeden sonra) kısa bir test reklamı görünür.`} Oyun sırasında reklam gösterilmez.</div>`;
    return h;
  }

  function renderProfile() {
    const s = getSave(), prem = premium();
    const lv = accountLevel(s.xp), cur = 50 * (lv - 1) ** 2, nxt = 50 * lv ** 2;
    let h = `<div class="item"><div class="sw" style="background:${prem ? '#d4af37' : '#3a4a78'}">${prem ? '⭐' : '👤'}</div><div class="tx">Hesap seviyesi ${lv}${prem ? ' · Premium' : ''}<small>${s.xp} XP · sonraki seviye ${nxt} XP</small><div class="prog"><i style="width:${Math.min(100, ((s.xp - cur) / (nxt - cur)) * 100)}%"></i></div></div></div>`;
    h += `<div class="item"><div class="tx">İstatistikler<small>Tamamlanan seviye: ${cleared(s)} · Yıldız: ${totalStars(s)}<br>Park yeri: ${s.parking.slots} · Görünüm: ${s.garage.owned.length}/${Object.keys(SKINS).length}</small></div></div>`;
    h += '<div class="sec">Başarı rozetleri</div>';
    for (const a of ACHIEVEMENTS) {
      const got = s.achievements[a.id];
      h += `<div class="item ${got ? 'on' : ''}"><div class="sw">${got ? '🏅' : '🔒'}</div><div class="tx">${a.text}<small>Ödül: 💎${a.reward.crystals}</small></div></div>`;
    }
    return h;
  }

  // ------------------------------------------------------------ eylemler
  $('panel-body').addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const [act, a1, a2] = b.dataset.act.split(':');
    const s = getSave(), prem = premium(), t = now();
    const fail = (r) => { sfx.bump(); toast(reasonText(r)); };
    if (act === 'slot') { const r = buyParkingSlot(s); if (!r.ok) return fail(r.reason); commit(r.save); spentEvents(r.spent); sfx.coin(); }
    else if (act === 'buy-theme') { const r = buyTheme(s, a1, prem); if (!r.ok) return fail(r.reason); commit(r.save); spentEvents(r.spent); sfx.coin(); }
    else if (act === 'use-theme') { const r = selectTheme(s, a1, prem); if (!r.ok) return fail(r.reason); commit(r.save); sfx.click(); }
    else if (act === 'buy-decor') { const r = buyDecor(s, a1); if (!r.ok) return fail(r.reason); commit(r.save); spentEvents(r.spent); sfx.coin(); }
    else if (act === 'acq-skin') { const r = acquireSkin(s, a1, prem); if (!r.ok) return fail(r.reason); commit(r.save); spentEvents(r.spent); sfx.coin(); }
    else if (act === 'use-skin') { const r = selectSkin(s, a1); if (!r.ok) return fail(r.reason); commit(r.save); ctx.onSkinChange(); sfx.click(); }
    else if (act === 'login') { const r = claimLogin(s, t); if (!r.ok) return fail(r.reason); commit(r.save); sfx.coin(); toast(`Günlük ödül: ${[r.reward.coins ? '🪙' + r.reward.coins : '', r.reward.crystals ? '💎' + r.reward.crystals : ''].filter(Boolean).join(' ')}`); }
    else if (act === 'claim') { const r = claimQuest(s, t, prem, a1, a2); if (!r.ok) return fail(r.reason); commit(r.save); sfx.coin(); toast('Görev ödülü alındı'); }
    else if (act === 'ad-coins') { const r = await rewarded('daily_coins'); if (r.ok) toast('+' + AD_LIMITS.placements.daily_coins.coins + ' 🪙'); }
    else if (act === 'buy') {
      b.disabled = true;
      const r = await pm.buy(s, a1, t);
      persistReceipts();
      if (!r.ok) { $('shop-msg').innerHTML = `<div class="banner">${reasonText(r.reason)} ${btn('Tekrar dene', 'buy:' + a1)}</div>`; b.disabled = false; return fail(r.reason); }
      commit(r.save); sfx.win(); toast('Test satın alması tamamlandı (gerçek ödeme yok)');
    } else if (act === 'restore') {
      const r = await pm.restore(s, t);
      commit(r.save); toast(r.restored ? `${r.restored} satın alma geri yüklendi (test)` : 'Geri yüklenecek satın alma bulunamadı');
    }
    render();
  });

  document.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => { sfx.click(); open(b.dataset.open); }));
  $('panel-back').addEventListener('click', () => { sfx.click(); close(); });

  const api = { adSeconds: undefined, open, close, render, premium, rewarded, noteWin, interstitialIfDue, event, updateDots, commit, adProvider, ads, pm, billing, get panel() { return panel; }, cancelAd: () => adResolve && adResolve(false) };
  return api;
}
