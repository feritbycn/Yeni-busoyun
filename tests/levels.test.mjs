import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, validateLevel } from '../src/core/engine.js';
import { solveDetailed } from '../src/core/solver.js';
import { loadLevels } from './helpers.mjs';

const levels = loadLevels();

test('en az 100 seviye var ve numaraları ardışık', () => {
  assert.ok(levels.length >= 100);
  levels.forEach((l, i) => assert.equal(l.id, i + 1));
});

test('tüm seviyeler yapısal olarak geçerli', () => {
  for (const L of levels) assert.deepEqual(validateLevel(L), [], `seviye ${L.id}`);
});

test('her seviye için bağımsız çözüm bulunur ve Game üzerinden yeniden oynatılınca KAZANILIR', () => {
  for (const L of levels) {
    const r = solveDetailed(L, null, 0, { maxNodes: 400000 });
    assert.ok(r.solvable, `seviye ${L.id} çözülemedi (bilinmiyor=${r.unknown})`);
    const g = new Game(L);
    for (const id of r.path) {
      const t = g.tap(id);
      assert.ok(t.ok, `seviye ${L.id}: çözüm hamlesi ${id} reddedildi (${t.reason})`);
    }
    assert.equal(g.status, 'won', `seviye ${L.id} kazanılamadı`);
    assert.equal(g.mistakes, 0);
    assert.equal(g.stars(), 3, `seviye ${L.id}: kusursuz oyun 3 yıldız olmalı`);
    if (L.moveLimit) assert.ok(g.taps <= L.moveLimit, `seviye ${L.id}: hamle limiti`);
  }
});

test('ödül değerleri belirlenen aralıklarda', () => {
  const ranges = { easy: [100, 150], medium: [150, 250], hard: [250, 400], special: [400, 700] };
  for (const L of levels) {
    const [lo, hi] = ranges[L.rewards.tier];
    assert.ok(L.rewards.coins >= lo && L.rewards.coins <= hi, `seviye ${L.id}: ${L.rewards.coins}`);
    const pct = L.rewards.starBonusCoins / L.rewards.coins;
    assert.ok(pct >= 0.19 && pct <= 0.51, `seviye ${L.id}: yıldız bonusu %${(pct * 100).toFixed(0)}`);
  }
});

test('zorluk eğrisi: ilk 20 seviyenin ortalama rastgele-kazanma oranı son 20 seviyeden belirgin yüksek', () => {
  const avg = (a) => a.reduce((s, l) => s + l.metrics.randomWinRate, 0) / a.length;
  assert.ok(avg(levels.slice(0, 20)) > avg(levels.slice(-20)) + 0.3);
});
