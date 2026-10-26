// LUXURY BUS MASTER 3D - çekirdek oyun mantığı (render'dan bağımsız, saf JS).
//
// KURALLAR
//  * Izgarada (w x h) uzunluğu 2-3 hücre olan otobüsler durur. Her otobüsün bir yönü (N/S/E/W) vardır.
//  * Dokunulan otobüs yönünde ızgaradan çıkmaya çalışır. Yol üzerinde başka otobüs varsa HAREKET ETMEZ (hata sayılır).
//  * Çıkan otobüs "park alanına" (bay) girer. Park alanı doluysa çıkış yapılamaz.
//  * Yolcu kuyruğunun başındaki yolcu, park alanında aynı renkte ve boş yeri olan otobüse biner.
//    Böyle bir otobüs yoksa "bekleme alanına" geçer. Bekleme alanı doluysa kuyruk bekler.
//  * Bekleyen yolcular, uygun otobüs gelince sırayla biner. Dolan otobüs park alanından ayrılır.
//  * Tüm yolcular bindiğinde seviye kazanılır. Hamle yapılamıyorsa (veya hamle limiti bittiyse) kaybedilir.

export const DIRS = {
  N: [0, -1],
  S: [0, 1],
  E: [1, 0],
  W: [-1, 0],
};
/** Seviyedeki toplam durak (açık + reklamla açılabilir). Eski seviyelerde açık durak + 1. */
export const stopsOf = (L) => Math.max(L.bay, L.stops ?? L.bay + 1);
export const isHorizontal = (dir) => dir === 'E' || dir === 'W';

export function busCells(b) {
  const out = [];
  for (let i = 0; i < b.len; i++) out.push(isHorizontal(b.dir) ? [b.x + i, b.y] : [b.x, b.y + i]);
  return out;
}

const prepCache = new WeakMap();

/** Seviye için hızlı arama tabloları: her otobüsün yolunu kapatan otobüslerin bit maskesi ve çıkış mesafesi. */
export function prepare(L) {
  let p = prepCache.get(L);
  if (p) return p;
  const n = L.buses.length;
  const occ = new Map();
  L.buses.forEach((b, i) => busCells(b).forEach(([cx, cy]) => occ.set(cx + ',' + cy, i)));
  const blk = new Array(n).fill(0);
  const shift = new Array(n).fill(0);
  L.buses.forEach((b, i) => {
    let mask = 0;
    const add = (cx, cy) => {
      const o = occ.get(cx + ',' + cy);
      if (o !== undefined && o !== i) mask |= 1 << o;
    };
    if (b.dir === 'E') {
      for (let xx = b.x + b.len; xx < L.w; xx++) add(xx, b.y);
      shift[i] = L.w - b.x;
    } else if (b.dir === 'W') {
      for (let xx = 0; xx < b.x; xx++) add(xx, b.y);
      shift[i] = b.x + b.len;
    } else if (b.dir === 'S') {
      for (let yy = b.y + b.len; yy < L.h; yy++) add(b.x, yy);
      shift[i] = L.h - b.y;
    } else {
      for (let yy = 0; yy < b.y; yy++) add(b.x, yy);
      shift[i] = b.y + b.len;
    }
    blk[i] = mask;
  });
  p = { n, blk, shift };
  prepCache.set(L, p);
  return p;
}

export function validateLevel(L) {
  const errors = [];
  if (!L.buses.length) errors.push('otobüs yok');
  if (L.buses.length > 30) errors.push('en fazla 30 otobüs desteklenir');
  const seen = new Set();
  L.buses.forEach((b, i) => {
    if (b.id !== i) errors.push(`otobüs id=${b.id} dizi sırasıyla (${i}) aynı olmalı`);
    if (!DIRS[b.dir]) errors.push(`otobüs ${i}: geçersiz yön`);
    for (const [cx, cy] of busCells(b)) {
      if (cx < 0 || cy < 0 || cx >= L.w || cy >= L.h) errors.push(`otobüs ${i}: ızgara dışında`);
      const k = cx + ',' + cy;
      if (seen.has(k)) errors.push(`otobüs ${i}: çakışma ${k}`);
      seen.add(k);
    }
  });
  const cap = {};
  L.buses.forEach((b) => (cap[b.color] = (cap[b.color] || 0) + b.cap));
  const cnt = {};
  L.queue.forEach((c) => (cnt[c] = (cnt[c] || 0) + 1));
  for (const c of new Set([...Object.keys(cap), ...Object.keys(cnt)])) {
    if ((cap[c] || 0) !== (cnt[c] || 0)) errors.push(`renk ${c}: kapasite ${cap[c] || 0} != yolcu ${cnt[c] || 0}`);
  }
  if (L.bay < 1) errors.push('park alanı en az 1 olmalı');
  return errors;
}

// ---------------------------------------------------------------- durum
export function initialState(L) {
  const st = { mask: 0, cap: L.bay, qi: 0, bay: [], waiting: [] };
  settle(L, st, null);
  return st;
}

export function cloneState(st) {
  return {
    mask: st.mask,
    cap: st.cap,
    qi: st.qi,
    bay: st.bay.map((b) => ({ ...b })),
    waiting: st.waiting.slice(),
  };
}

export function stateKey(st) {
  return (
    st.mask +
    '|' +
    st.qi +
    '|' +
    st.waiting.join('') +
    '|' +
    st.bay
      .map((b) => b.id + ':' + b.left)
      .sort()
      .join(',')
  );
}

function findBayBus(st, color) {
  let best = null;
  for (const b of st.bay) if (b.color === color && b.left > 0 && (!best || b.left < best.left)) best = b;
  return best;
}

/** Yolcuları otobüslere yerleştirir. ev verilirse olayları (animasyon için) kaydeder. */
function settle(L, st, ev) {
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < st.waiting.length; i++) {
      const b = findBayBus(st, st.waiting[i]);
      if (b) {
        b.left--;
        ev && ev.push({ type: 'board', from: 'waiting', color: st.waiting[i], busId: b.id, waitIndex: i, left: b.left });
        st.waiting.splice(i, 1);
        i--;
        changed = true;
      }
    }
    while (st.qi < L.queue.length) {
      const c = L.queue[st.qi];
      const b = findBayBus(st, c);
      if (b) {
        b.left--;
        ev && ev.push({ type: 'board', from: 'queue', color: c, busId: b.id, queueIndex: st.qi, left: b.left });
        st.qi++;
        changed = true;
      } else if (st.waiting.length < L.wait) {
        st.waiting.push(c);
        ev && ev.push({ type: 'wait', color: c, queueIndex: st.qi, waitIndex: st.waiting.length - 1 });
        st.qi++;
        changed = true;
      } else break;
    }
    for (let i = st.bay.length - 1; i >= 0; i--) {
      if (st.bay[i].left === 0) {
        ev && ev.push({ type: 'depart', busId: st.bay[i].id, slot: st.bay[i].slot });
        st.bay.splice(i, 1);
        changed = true;
      }
    }
  }
}

export function canExit(L, st, id) {
  const P = prepare(L);
  if (st.mask & (1 << id)) return { ok: false, reason: 'gone' };
  if (P.blk[id] & ~st.mask) return { ok: false, reason: 'blocked' };
  if (st.bay.length >= st.cap) return { ok: false, reason: 'bay_full' };
  return { ok: true };
}

export function legalMoves(L, st) {
  const out = [];
  for (let i = 0; i < L.buses.length; i++) if (canExit(L, st, i).ok) out.push(i);
  return out;
}

export function isWon(L, st) {
  return st.qi >= L.queue.length && st.waiting.length === 0;
}

/** Geçerli hamleyi uygular; yeni durum döndürür (eski durum değişmez). */
export function applyExit(L, st, id, ev) {
  const ns = cloneState(st);
  ns.mask |= 1 << id;
  const b = L.buses[id];
  const used = new Set(ns.bay.map((x) => x.slot));
  let slot = 0;
  while (used.has(slot)) slot++;
  ns.bay.push({ id, color: b.color, left: b.cap, slot });
  ev && ev.push({ type: 'exit', busId: id, slot, shift: prepare(L).shift[id] });
  settle(L, ns, ev);
  return ns;
}

/** 'playing' | 'won' | 'lost'. movesUsed: hamle limiti olan seviyeler için toplam dokunma sayısı. */
export function statusOf(L, st, movesUsed = 0) {
  if (isWon(L, st)) return 'won';
  if (L.moveLimit && movesUsed >= L.moveLimit) return 'lost';
  if (legalMoves(L, st).length === 0) return 'lost';
  return 'playing';
}

// ---------------------------------------------------------------- oyun nesnesi (UI'nin kullandığı)
export class Game {
  constructor(level) {
    this.L = level;
    this.reset();
  }

  reset() {
    const L = this.L;
    this.st = initialState(L);
    this.history = [];
    this.taps = 0;
    this.mistakes = 0;
    this.hintsUsed = 0;
    this.undosUsed = 0;
    this.extraSlotsUsed = 0;
    this.bonusMoves = 0;
    this.bonusHints = 0;
    this.adSlots = 0;
    this.status = statusOf(L, this.st, 0);
    this.runId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  get helpers() {
    return this.L.helpers;
  }
  get movesLeft() {
    return this.L.moveLimit ? Math.max(0, this.L.moveLimit + this.bonusMoves - this.taps) : null;
  }

  /** Başlangıç yerleşimini (yolcuların bekleme alanına otomatik geçişi) animasyon için olay olarak üretir. */
  initialEvents() {
    const st = { mask: 0, cap: this.L.bay, qi: 0, bay: [], waiting: [] };
    const ev = [];
    settle(this.L, st, ev);
    return ev;
  }

  tap(id) {
    if (this.status !== 'playing') return { ok: false, reason: 'finished', events: [] };
    const c = canExit(this.L, this.st, id);
    // Boş durak yoksa otobüs çıkamaz; bu bir hata/hamle sayılmaz (oyuncu cezalandırılmaz, uyarılır).
    if (!c.ok && (c.reason === 'bay_full' || c.reason === 'gone')) return { ok: false, reason: c.reason, events: [], status: this.status };
    this.taps++;
    if (!c.ok) {
      this.mistakes++;
      this.status = statusOf(this.L, this.st, this.taps - this.bonusMoves);
      return { ok: false, reason: c.reason, events: [], status: this.status };
    }
    this.history.push({ st: cloneState(this.st) });
    const events = [];
    this.st = applyExit(this.L, this.st, id, events);
    this.status = statusOf(this.L, this.st, this.taps - this.bonusMoves);
    return { ok: true, events, status: this.status };
  }

  canUndo() {
    return this.history.length > 0 && this.undosUsed < this.helpers.undo && this.status !== 'won';
  }
  undo() {
    if (!this.canUndo()) return false;
    const h = this.history.pop();
    const cap = Math.max(h.st.cap, this.st.cap); // eklenen park yeri geri alınmaz
    this.st = h.st;
    this.st.cap = cap;
    this.undosUsed++;
    this.status = statusOf(this.L, this.st, this.taps - this.bonusMoves);
    return true;
  }

  canAddSlot() {
    return this.status === 'playing' && this.extraSlotsUsed < this.helpers.extraSlot;
  }
  addSlot() {
    if (!this.canAddSlot()) return false;
    this.st.cap++;
    this.extraSlotsUsed++;
    this.status = statusOf(this.L, this.st, this.taps - this.bonusMoves);
    return true;
  }

  canHint() {
    return this.status === 'playing' && this.hintsUsed < this.helpers.hint + this.bonusHints;
  }
  // --- ödüllü reklamla kazanılan haklar (yalnızca doğrulanmış reklam ödülünden sonra çağrılır)
  grantMoves(n) {
    if (!this.L.moveLimit) return false;
    this.bonusMoves += n;
    this.status = statusOf(this.L, this.st, this.taps - this.bonusMoves);
    return true;
  }
  grantHint() { this.bonusHints++; return true; }
  /** Reklamla açılabilecek kalan kilitli durak sayısı. */
  get lockedStops() { return Math.max(0, stopsOf(this.L) - this.st.cap); }
  canUnlockStop() { return this.status !== 'won' && this.lockedStops > 0; }
  /** Reklam izlenince bir kilitli durak açılır (kilitlenmiş 'lost' durumu da kurtarılabilir). */
  grantAdSlot() {
    if (!this.canUnlockStop()) return false;
    this.st.cap++; this.adSlots++;
    this.status = statusOf(this.L, this.st, this.taps - this.bonusMoves);
    return true;
  }

  /** Bir sonraki iyi hamleyi döndürür; çözüm yoksa null. Hakkı yalnızca çözüm bulunursa harcanır. */
  hint(solveFn) {
    if (!this.canHint()) return { ok: false, reason: 'no_hints' };
    const sol = solveFn(this.L, this.st, this.taps);
    if (!sol || sol.length === 0) return { ok: false, reason: 'no_solution' };
    this.hintsUsed++;
    return { ok: true, busId: sol[0] };
  }

  /** Şu ana kadarki performansa göre alınabilecek en yüksek yıldız (1-3). Oyun sırasında HUD'da gösterilir. */
  starsNow() {
    const s = this.L.stars;
    if (this.mistakes <= s.three.maxMistakes && this.hintsUsed <= s.three.maxHints && (!s.three.noExtraSlot || (this.extraSlotsUsed === 0 && this.adSlots === 0))) return 3;
    if (this.mistakes <= s.two.maxMistakes && this.hintsUsed <= s.two.maxHints) return 2;
    return 1;
  }

  /** Kazanılan yıldız (kazanılmadıysa 0). */
  stars() {
    return this.status === 'won' ? this.starsNow() : 0;
  }
}
