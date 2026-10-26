// Seviye üreteci. Her seviye: deterministik tohum -> adaylar -> çözücüyle doğrulama -> zorluk hedefine en yakın aday.
import { makeRng } from '../core/rng.js';
import { validateLevel, busCells } from '../core/engine.js';
import { solveDetailed, randomWinRate, initialFreeMoves } from '../core/solver.js';
import { levelReward, tierOf } from '../core/economy.js';

const DIR_LIST = ['N', 'S', 'E', 'W'];

export function paramsFor(n) {
  const size = Math.min(7, 4 + Math.floor(n / 25));
  const colors = Math.min(6, 2 + Math.floor(n / 14));
  const buses = Math.min(14, 3 + Math.floor(n / 8));
  const bay = n <= 12 ? 4 : n <= 24 ? 3 : 4;
  const wait = n <= 8 ? 5 : n <= 16 ? 4 : n <= 24 ? 3 : n <= 60 ? 4 : 3;
  const long = Math.min(0.6, 0.1 + n / 200); // 3 uzunluğundaki otobüs olasılığı
  const moveLimit = n >= 14 && n % 7 === 0 ? buses + 3 : null; // bazı seviyelerde sınırlı hamle (hatalı dokunuşlar da sayılır)
  return { size, colors, buses, bay, wait, long, moveLimit };
}

/** Hedef "rastgele oyuncu kazanma oranı": 1. seviyede kolay (~0.9), 100. seviyede zor (~0.06). */
export function targetWinRate(n) {
  const t = Math.min(1, (n - 1) / 99);
  return 0.9 + (0.06 - 0.9) * Math.pow(t, 0.8);
}

export function difficultyLabel(n) {
  const t = tierOf(n);
  if (n <= 10) return 'Öğretici';
  if (t === 'special') return 'Özel';
  if (n <= 25) return 'Kolay';
  if (n <= 50) return 'Orta';
  return 'Zor';
}

function buildCandidate(n, seed) {
  const p = paramsFor(n);
  const rng = makeRng(seed);
  const w = p.size;
  const h = p.size;
  const buses = [];
  const occ = new Set();
  let tries = 0;
  while (buses.length < p.buses && tries++ < 600) {
    const len = rng.next() < p.long ? 3 : 2;
    const dir = rng.pick(DIR_LIST);
    const horiz = dir === 'E' || dir === 'W';
    const x = rng.int(horiz ? w - len + 1 : w);
    const y = rng.int(horiz ? h : h - len + 1);
    const b = { id: buses.length, color: 0, x, y, len, dir, cap: len * 2 };
    const cells = busCells(b);
    if (cells.some(([cx, cy]) => occ.has(cx + ',' + cy))) continue;
    cells.forEach(([cx, cy]) => occ.add(cx + ',' + cy));
    buses.push(b);
  }
  if (buses.length < Math.min(p.buses, 3)) return null;
  // Renkler: her renk en az bir otobüs alır
  const nc = Math.min(p.colors, buses.length);
  const colorPool = [];
  for (let i = 0; i < buses.length; i++) colorPool.push(i < nc ? i : rng.int(nc));
  rng.shuffle(colorPool);
  buses.forEach((b, i) => (b.color = colorPool[i]));
  // Kuyruk: öğretici seviyelerde kısmen gruplu, sonra tamamen karışık
  let queue = [];
  buses.forEach((b) => {
    for (let i = 0; i < b.cap; i++) queue.push(b.color);
  });
  if (n <= 3) {
    queue.sort((a, b) => a - b);
    for (let i = 0; i < queue.length / 3; i++) {
      const a = rng.int(queue.length);
      const c = rng.int(queue.length);
      [queue[a], queue[c]] = [queue[c], queue[a]];
    }
  } else {
    rng.shuffle(queue);
  }
  const rewards = levelReward(n);
  return {
    id: n,
    name: `Seviye ${n}`,
    difficulty: difficultyLabel(n),
    tier: rewards.tier,
    w,
    h,
    buses,
    queue,
    bay: p.bay,
    wait: p.wait,
    moveLimit: p.moveLimit,
    goal: 'transport_all',
    rewards,
    stars: {
      two: { maxMistakes: 2, maxHints: 1 },
      three: { maxMistakes: 0, maxHints: 0, noExtraSlot: true },
    },
    helpers: { undo: 3, hint: n < 3 ? 1 : 3, extraSlot: 1 },
    seed,
  };
}

/** Tek seviye üretir. Çözülebilirlik kanıtlanmamış hiçbir aday döndürülmez. */
export function generateLevel(n, { candidates = 10, maxAttempts = 250 } = {}) {
  const target = targetWinRate(n);
  let best = null;
  let found = 0;
  for (let attempt = 0; attempt < maxAttempts && found < candidates; attempt++) {
    const seed = (n * 100003 + attempt * 7919) >>> 0;
    const L = buildCandidate(n, seed);
    if (!L || validateLevel(L).length) continue;
    const res = solveDetailed(L, null, 0, { maxNodes: 150000 });
    if (!res.solvable) continue;
    // Başlangıçta oyuncunun en az 1 hareket edebilen otobüsü olmalı
    if (initialFreeMoves(L) < 1) continue;
    found++;
    const rate = randomWinRate(L, makeRng(seed ^ 0x9e3779b9), 120);
    const score = Math.abs(rate - target);
    if (!best || score < best.score) best = { L, score, rate, solution: res.path };
  }
  if (!best) throw new Error(`Seviye ${n} üretilemedi`);
  best.L.metrics = { randomWinRate: Number(best.rate.toFixed(3)), targetWinRate: Number(target.toFixed(3)), solutionLength: best.solution.length };
  return best.L;
}

export function generateLevels(from, to, opts) {
  const out = [];
  for (let n = from; n <= to; n++) out.push(generateLevel(n, opts));
  return out;
}
