import test from 'node:test';
import assert from 'node:assert/strict';
import { claimLevelResult, defaultSave, accountLevel, levelReward } from '../src/core/economy.js';
import { loadSave, writeSave, clearSave, fnv1a } from '../src/core/save.js';
import { MemStorage, tinyLevel } from './helpers.mjs';

const L = tinyLevel();

test('ilk tamamlama temel ödül + deneyim verir, sonraki seviyeyi açar', () => {
  const { save, reward } = claimLevelResult(defaultSave(), L, { stars: 1, runId: 'a' });
  assert.equal(reward.coins, 100);
  assert.equal(reward.xp, 20);
  assert.equal(save.coins, 100);
  assert.equal(save.unlocked, 2);
});

test('aynı run ikinci kez ödül vermez', () => {
  const r1 = claimLevelResult(defaultSave(), L, { stars: 3, runId: 'x' });
  const r2 = claimLevelResult(r1.save, L, { stars: 3, runId: 'x' });
  assert.equal(r2.reward.duplicate, true);
  assert.equal(r2.reward.coins, 0);
  assert.equal(r2.save.coins, r1.save.coins);
});

test('tekrar oynama para üretmez (farm engeli); 3 yıldız bonusu yalnızca bir kez', () => {
  let s = claimLevelResult(defaultSave(), L, { stars: 1, runId: '1' }).save; // 100
  const again = claimLevelResult(s, L, { stars: 1, runId: '2' });
  assert.equal(again.reward.coins, 0);
  const three = claimLevelResult(again.save, L, { stars: 3, runId: '3' });
  assert.equal(three.reward.coins, 20);
  assert.equal(three.reward.base, 0);
  const three2 = claimLevelResult(three.save, L, { stars: 3, runId: '4' });
  assert.equal(three2.reward.coins, 0);
  assert.equal(three2.save.coins, 120);
});

test('düşük yıldızla tekrar oynamak en iyi sonucu düşürmez', () => {
  let s = claimLevelResult(defaultSave(), L, { stars: 3, runId: '1' }).save;
  s = claimLevelResult(s, L, { stars: 1, runId: '2' }).save;
  assert.equal(s.levels[1].stars, 3);
});

test('ödül tablosu: tier ve hesap seviyesi', () => {
  assert.equal(levelReward(1).tier, 'easy');
  assert.equal(levelReward(33).tier, 'medium');
  assert.equal(levelReward(60).tier, 'special');
  assert.equal(levelReward(77).tier, 'hard');
  assert.equal(accountLevel(0), 1);
  assert.ok(accountLevel(5000) > accountLevel(500));
});

test('kayıt: yaz/oku, uygulama yeniden açılınca ilerleme korunur', () => {
  const st = new MemStorage();
  let { save } = loadSave(st);
  save = claimLevelResult(save, L, { stars: 2, runId: 'r' }).save;
  writeSave(st, save);
  const re = loadSave(st); // "uygulamayı yeniden aç"
  assert.equal(re.source, 'primary');
  assert.equal(re.save.coins, 100);
  assert.equal(re.save.levels[1].stars, 2);
});

test('bozuk ana kayıt yedekten kurtarılır; ikisi de bozuksa temiz başlanır', () => {
  const st = new MemStorage();
  let s = defaultSave();
  s.coins = 50; writeSave(st, s);
  s.coins = 75; writeSave(st, s); // yedek: 50
  st.setItem('lbm3d.save', st.getItem('lbm3d.save').replace('75', '9999')); // sağlama toplamı bozulur
  const r = loadSave(st);
  assert.equal(r.source, 'backup');
  assert.equal(r.save.coins, 50);
  st.setItem('lbm3d.save.bak', 'çöp');
  assert.equal(loadSave(st).source, 'fresh');
  st.setItem('lbm3d.save', '{bozuk json');
  assert.equal(loadSave(st).save.coins, 0);
});

test('mantıksız değerler düzeltilir', () => {
  const st = new MemStorage();
  const bad = { ...defaultSave(), coins: -5, unlocked: 'x', xp: NaN };
  const d = JSON.stringify(bad);
  st.setItem('lbm3d.save', JSON.stringify({ d, h: fnv1a(d) }));
  const r = loadSave(st).save;
  assert.equal(r.coins, 0);
  assert.equal(r.unlocked, 1);
  assert.equal(r.xp, 0);
});

test('kayıt temizleme', () => {
  const st = new MemStorage();
  writeSave(st, defaultSave());
  clearSave(st);
  assert.equal(loadSave(st).source, 'fresh');
});
