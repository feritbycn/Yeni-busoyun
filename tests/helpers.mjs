import { readFileSync } from 'node:fs';
export const loadLevels = () => JSON.parse(readFileSync(new URL('../data/levels.json', import.meta.url))).levels;
export class MemStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}
// Küçük elle yazılmış seviye: 4x3 ızgara
export function tinyLevel(over = {}) {
  return {
    id: 1, w: 4, h: 3, bay: 2, wait: 2, moveLimit: null,
    buses: [
      { id: 0, color: 0, x: 0, y: 0, len: 2, dir: 'E', cap: 2 }, // (0,0)-(1,0) doğuya, yolunu 1 numara kapatıyor
      { id: 1, color: 1, x: 2, y: 0, len: 2, dir: 'E', cap: 2 }, // (2,0)-(3,0) doğuya, serbest
      { id: 2, color: 0, x: 0, y: 2, len: 2, dir: 'W', cap: 2 }, // batıya, serbest
    ],
    queue: [0, 1, 0, 1, 0, 0],
    rewards: { tier: 'easy', coins: 100, starBonusCoins: 20, xp: 20 },
    stars: { two: { maxMistakes: 2, maxHints: 1 }, three: { maxMistakes: 0, maxHints: 0, noExtraSlot: true } },
    helpers: { undo: 3, hint: 3, extraSlot: 1 },
    ...over,
  };
}
