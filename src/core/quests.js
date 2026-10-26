// Görev, günlük giriş ve başarı sistemi. Saf fonksiyonlar; zaman dışarıdan verilir.
import { QUEST_POOL, DAILY_LOGIN, ACHIEVEMENTS } from './catalog.js';
import { dayKey, weekKey, dayDiff, clockTampered } from './timeutil.js';
import { hash32 } from './rng.js';

const clone = (s) => JSON.parse(JSON.stringify(s));

function pick(pool, key, n) {
  const arr = pool.map((q) => ({ q, h: hash32(key + q.id) })).sort((a, b) => a.h - b.h || (a.q.id < b.q.id ? -1 : 1));
  return arr.slice(0, n).map((x) => x.q);
}

export function activeQuests(save, now, premium) {
  const d = pick(QUEST_POOL.daily, dayKey(now), 3);
  if (premium) d.push(QUEST_POOL.premiumDaily);
  const w = pick(QUEST_POOL.weekly, weekKey(now), 2);
  return { daily: d, weekly: w };
}

/** Gün/hafta değiştiyse ilerlemeyi sıfırlar. */
export function rollover(save, now) {
  if (clockTampered(save, now)) return save;
  const dk = dayKey(now), wk = weekKey(now);
  if (save.quests.daily.key === dk && save.quests.weekly.key === wk) return save;
  const s = clone(save);
  if (s.quests.daily.key !== dk) s.quests.daily = { key: dk, progress: {}, claimed: {} };
  if (s.quests.weekly.key !== wk) s.quests.weekly = { key: wk, progress: {}, claimed: {} };
  return s;
}

/** Oyun olayını görevlere işler. ev: level_won | bus_exit | passenger | star | three_star | coins_spent | upgrade */
export function recordEvent(save, now, premium, ev, amount = 1) {
  if (clockTampered(save, now)) return save;
  const s = rollover(save, now);
  const out = s === save ? clone(save) : s;
  const act = activeQuests(out, now, premium);
  for (const [scope, list] of [['daily', act.daily], ['weekly', act.weekly]]) {
    for (const q of list) {
      if (q.ev !== ev || out.quests[scope].claimed[q.id]) continue;
      out.quests[scope].progress[q.id] = Math.min(q.target, (out.quests[scope].progress[q.id] || 0) + amount);
    }
  }
  return out;
}

export function claimQuest(save, now, premium, scope, id) {
  if (clockTampered(save, now)) return { ok: false, save, reason: 'clock' };
  const s = rollover(save, now);
  const act = activeQuests(s, now, premium)[scope];
  const q = act && act.find((x) => x.id === id);
  if (!q) return { ok: false, save, reason: 'not_active' };
  if (s.quests[scope].claimed[id]) return { ok: false, save, reason: 'claimed' };
  if ((s.quests[scope].progress[id] || 0) < q.target) return { ok: false, save, reason: 'incomplete' };
  const out = clone(s);
  out.quests[scope].claimed[id] = true;
  out.coins += q.reward.coins || 0;
  out.crystals += q.reward.crystals || 0;
  return { ok: true, save: out, reward: q.reward };
}

// --- günlük giriş
export function loginStatus(save, now) {
  const dk = dayKey(now);
  if (clockTampered(save, now)) return { canClaim: false, reason: 'clock', day: save.login.streak % 7 };
  const last = save.login.lastKey;
  const canClaim = last !== dk;
  const streak = !last ? 0 : dayDiff(last, dk) === 1 ? save.login.streak : canClaim ? 0 : save.login.streak;
  return { canClaim, day: streak % 7, streak };
}

export function claimLogin(save, now) {
  const st = loginStatus(save, now);
  if (!st.canClaim) return { ok: false, save, reason: st.reason || 'claimed' };
  const reward = DAILY_LOGIN[st.day];
  const s = clone(save);
  s.coins += reward.coins || 0;
  s.crystals += reward.crystals || 0;
  s.login = { lastKey: dayKey(now), streak: st.streak + 1, claimedTotal: (s.login.claimedTotal || 0) + 1 };
  return { ok: true, save: s, reward, day: st.day };
}

// --- başarılar
export function checkAchievements(save) {
  const s = clone(save);
  const gained = [];
  for (const a of ACHIEVEMENTS) {
    if (!s.achievements[a.id] && a.check(s)) {
      s.achievements[a.id] = true;
      s.crystals += a.reward.crystals || 0;
      s.coins += a.reward.coins || 0;
      gained.push(a);
    }
  }
  return { save: gained.length ? s : save, gained };
}
