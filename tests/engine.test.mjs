import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, validateLevel, canExit, initialState, busCells } from '../src/core/engine.js';
import { tinyLevel } from './helpers.mjs';

test('geçerli seviye doğrulanır, çakışan seviye reddedilir', () => {
  assert.deepEqual(validateLevel(tinyLevel()), []);
  const bad = tinyLevel();
  bad.buses[1].x = 1; // 0 numaralı otobüsle çakışır
  assert.ok(validateLevel(bad).some((e) => e.includes('çakışma')));
  const bad2 = tinyLevel({ queue: [0, 0, 0, 0, 0, 1] });
  assert.ok(validateLevel(bad2).some((e) => e.includes('kapasite')));
});

test('yolu kapalı otobüs hareket etmez ve hata sayılır', () => {
  const g = new Game(tinyLevel());
  const r = g.tap(0);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'blocked');
  assert.equal(g.mistakes, 1);
  assert.equal(g.st.mask, 0);
});

test('serbest otobüs çıkar, yol açılınca engellenen otobüs de çıkabilir', () => {
  const g = new Game(tinyLevel());
  assert.equal(g.tap(1).ok, true);
  assert.equal(g.tap(0).ok, true);
});

test('yolcu renk eşleştirmesi: bekleyen ve kuyruktaki yalnızca aynı renkli otobüse biner', () => {
  const g = new Game(tinyLevel());
  // Başlangıç: kuyruk [0,1,0,1,0,0], bekleme kapasitesi 2 -> bekleyenler [0,1], kuyruk indeksi 2
  assert.deepEqual(g.st.waiting, [0, 1]);
  assert.equal(g.st.qi, 2);
  const r = g.tap(1); // renk 1 otobüsü gelir
  const boards = r.events.filter((e) => e.type === 'board');
  assert.ok(boards.length === 2 && boards.every((e) => e.color === 1 && e.busId === 1), 'yalnızca renk-1 yolcular binmeli');
  assert.equal(boards[0].from, 'waiting'); // önce bekleyen yolcu biner
  assert.equal(boards[1].from, 'queue');
  assert.ok(r.events.some((e) => e.type === 'depart' && e.busId === 1)); // dolan otobüs ayrılır
  assert.deepEqual(g.st.waiting, [0, 0]); // renk-0 yolcular beklemeye geçti
});

test('otobüs kapasitesi aşılmaz ve dolan otobüs ayrılır', () => {
  const g = new Game(tinyLevel());
  g.tap(1);
  g.tap(2);
  g.tap(0);
  assert.equal(g.status, 'won');
  assert.equal(g.st.bay.length, 0);
});

test('park alanı dolup hiçbir otobüs ilerleyemezse kilitlenme = kayıp; sonraki dokunuş reddedilir', () => {
  // bekleme [0,0] dolu, kuyruk başı 1: renk-1 otobüsü gelince bir yolcu biner, sonraki 0 binemez -> otobüs yarı dolu kalır
  const L = tinyLevel({ bay: 1, queue: [0, 0, 1, 0, 0, 1] });
  const g = new Game(L);
  const r1 = g.tap(1);
  assert.equal(r1.ok, true);
  assert.equal(g.st.bay.length, 1);
  assert.equal(g.st.bay[0].left, 1); // yarı dolu, ayrılmadı
  assert.equal(g.status, 'lost'); // park alanı dolu -> hamle kalmadı
  assert.equal(g.tap(2).ok, false);
  // motor seviyesinde de aynı otobüs çıkış denemesi park doluluğu nedeniyle reddedilir
  assert.equal(canExit(L, g.st, 2).reason, 'bay_full');
});

test('çıkış hamlesi kalmayınca seviye kaybedilir', () => {
  // park alanı 1, kuyruk başı hiçbir otobüsle eşleşmiyor -> kilitlenir
  const L = tinyLevel({ bay: 1, wait: 0, queue: [0, 0, 1, 1, 0, 0] });
  const g = new Game(L);
  const r = g.tap(1); // renk 1 girer, kuyruk başı 0 bekleyemez ve binemez
  assert.equal(r.ok, true);
  assert.equal(g.status, 'lost');
});

test('hamle limiti dolunca kaybedilir (hatalı dokunuşlar da sayılır)', () => {
  const g = new Game(tinyLevel({ moveLimit: 2 }));
  g.tap(0); // hatalı
  g.tap(0); // hatalı
  assert.equal(g.status, 'lost');
});

test('geri al: durum geri döner, sınır uygulanır, hata sayacı geri alınmaz', () => {
  const g = new Game(tinyLevel());
  g.tap(0); // hata
  g.tap(1);
  const maskAfter = g.st.mask;
  assert.ok(g.undo());
  assert.notEqual(g.st.mask, maskAfter);
  assert.equal(g.mistakes, 1);
  g.undosUsed = 3;
  g.tap(1);
  assert.equal(g.undo(), false);
});

test('ekstra park yeri bir kez kullanılabilir', () => {
  const g = new Game(tinyLevel());
  const cap = g.st.cap;
  assert.ok(g.addSlot());
  assert.equal(g.st.cap, cap + 1);
  assert.equal(g.addSlot(), false);
});

test('yıldız hesabı: hatasız=3, 2 hata=2, çok hata=1', () => {
  const play = (mistakes) => {
    const g = new Game(tinyLevel());
    for (let i = 0; i < mistakes; i++) g.tap(0);
    g.tap(1); g.tap(2); g.tap(0);
    assert.equal(g.status, 'won');
    return g.stars();
  };
  assert.equal(play(0), 3);
  assert.equal(play(2), 2);
  assert.equal(play(5), 1);
});

test('canExit ızgara dışına bakan otobüsü doğru değerlendirir', () => {
  const L = tinyLevel();
  const st = initialState(L);
  assert.equal(canExit(L, st, 0).reason, 'blocked');
  assert.equal(canExit(L, st, 1).ok, true);
  assert.deepEqual(busCells(L.buses[2]), [[0, 2], [1, 2]]);
});
