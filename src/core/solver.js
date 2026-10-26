// Çözücü: seviyenin çözülebilirliğini kanıtlar ve ipucu üretir. Oyun motorunun kendi geçiş fonksiyonlarını kullanır.
import { initialState, applyExit, canExit, legalMoves, isWon, stateKey, cloneState } from './engine.js';

/** Çözüm varsa hamle id dizisi, yoksa (veya düğüm limiti aşıldıysa) null. Ayrım için solveDetailed kullanın. */
export function solve(L, startState = null, movesUsed = 0, opts = {}) {
  return solveDetailed(L, startState, movesUsed, opts).path;
}

/**
 * Derinlik öncelikli arama + durum hafızası. { solvable, path, unknown }:
 * unknown=true, düğüm limiti aşıldığı için sonucun bilinmediğini (çözümsüz kanıtlanmadığını) gösterir.
 */
export function solveDetailed(L, startState = null, movesUsed = 0, opts = {}) {
  const maxNodes = opts.maxNodes ?? 400000;
  const st0 = startState ? cloneState(startState) : initialState(L);
  const dead = new Set();
  let nodes = 0;
  let aborted = false;
  const dfs = (st, depth) => {
    if (isWon(L, st)) return [];
    if (L.moveLimit && movesUsed + depth >= L.moveLimit) return null;
    if (++nodes > maxNodes) {
      aborted = true;
      return null;
    }
    const key = stateKey(st);
    if (dead.has(key)) return null;
    const moves = legalMoves(L, st);
    if (!moves.length) {
      dead.add(key);
      return null;
    }
    const want = new Set(st.waiting);
    if (st.qi < L.queue.length) want.add(L.queue[st.qi]);
    moves.sort((a, b) => (want.has(L.buses[b].color) ? 1 : 0) - (want.has(L.buses[a].color) ? 1 : 0));
    for (const m of moves) {
      const r = dfs(applyExit(L, st, m, null), depth + 1);
      if (r) return [m, ...r];
      if (aborted) return null;
    }
    dead.add(key);
    return null;
  };
  const path = dfs(st0, 0);
  return { solvable: !!path, path, unknown: !path && aborted, nodes };
}

/** Rastgele oynayan bir oyuncunun kazanma oranı; seviye zorluğunu ölçmek için kullanılır (düşük = zor). */
export function randomWinRate(L, rng, trials = 200) {
  let wins = 0;
  for (let t = 0; t < trials; t++) {
    let st = initialState(L);
    for (let step = 0; step < 64; step++) {
      if (isWon(L, st)) {
        wins++;
        break;
      }
      const mv = legalMoves(L, st);
      if (!mv.length) break;
      if (L.moveLimit && step >= L.moveLimit) break;
      st = applyExit(L, st, mv[rng.int(mv.length)], null);
    }
  }
  return wins / trials;
}

/** Izgarada tıklanabilir (yolu açık) otobüs sayısı: oyuncunun başlangıçtaki seçenek sayısı. */
export function initialFreeMoves(L) {
  const st = initialState(L);
  let n = 0;
  for (let i = 0; i < L.buses.length; i++) if (canExit(L, st, i).ok) n++;
  return n;
}
