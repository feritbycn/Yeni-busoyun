// LUXURY BUS MASTER 3D - ana oyun: sahne, giriş, animasyonlar ve ekran akışı.
// Oyun KURALLARI src/core/engine.js içindedir; bu dosya yalnızca onların görsel/arayüz karşılığıdır.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import levelData from '../../data/levels.json';
import { Game, prepare, stopsOf } from '../core/engine.js';
import { solve } from '../core/solver.js';
import { COLORS } from '../core/colors.js';
import { claimLevelResult, accountLevel } from '../core/economy.js';
import { systemClock } from '../core/timeutil.js';
import { Analytics } from '../core/analytics.js';
import { adsLeft } from '../core/ads.js';
import { AD_LIMITS } from '../core/catalog.js';
import { createShowroom, THEME_LOOK } from './showroom.js';
import { createMeta, reasonText } from './meta.js';
import { loadSave, writeSave, clearSave } from '../core/save.js';
import { makeBus, makePassenger, makeCountLabel, buildWorld, makeDecor } from './models.js';
import { sfx, setSound, setVibration, vibrate } from './audio.js';

const LEVELS = levelData.levels;
const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------------ kayıt
const storage = (() => {
  try {
    localStorage.setItem('__t', '1');
    localStorage.removeItem('__t');
    return localStorage;
  } catch {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  }
})();
let save = loadSave(storage).save;
const persist = () => { try { writeSave(storage, save); } catch (e) { console.error('kayıt yazılamadı', e); } };
let clockNow = () => systemClock.now();
const analytics = new Analytics(storage);
window.addEventListener('error', (e) => { analytics.error(e.error || e.message); analytics.flush(); });
window.addEventListener('unhandledrejection', (e) => { analytics.error(e.reason); analytics.flush(); });

// ------------------------------------------------------------------ three.js kurulumu
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  $('webgl-error').classList.remove('hidden');
  throw e;
}
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x30333f, 0.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe2bd, 2.3);
sun.position.set(6, 13, 7);
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -10; sun.shadow.camera.right = 10; sun.shadow.camera.top = 14; sun.shadow.camera.bottom = -10;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 40;
sun.shadow.bias = -0.0004;
sun.target.position.set(0, 0, 3);
scene.add(sun, sun.target);

const highQ = () => save.settings.quality === 'high';
function applyQuality() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, highQ() ? 2 : 1));
  renderer.shadowMap.enabled = highQ();
  sun.castShadow = highQ();
  scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => (m.needsUpdate = true)); });
  resize();
}
let world = buildWorld(scene, { shadows: true });
const skyBg = scene.background, skyFog = scene.fog;
const showroom = createShowroom(scene);
let mode = 'game'; // 'game' | 'showroom'

// ------------------------------------------------------------------ tween sistemi
let epoch = 0;
const tweens = [];
const ease = {
  io: (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2),
  out: (k) => 1 - Math.pow(1 - k, 3),
  in: (k) => k * k * k,
  back: (k) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); },
  lin: (k) => k,
};
function tween(sec, update, e = ease.io) {
  return new Promise((res) => tweens.push({ t0: performance.now(), dur: Math.max(1, sec * 1000), update, e, res }));
}
function stepTweens(now) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    const k = Math.min(1, (now - tw.t0) / tw.dur);
    tw.update(tw.e(k));
    if (k >= 1) { tweens.splice(i, 1); tw.res(); }
  }
}
function killTweens() { epoch++; while (tweens.length) tweens.pop().res(); }
const wait = (sec) => tween(sec, () => {}, ease.lin);

// ------------------------------------------------------------------ düzen sabitleri ve görünüm durumu
const SLOT_W = 1.08;
const WAIT_W = 0.95;
const Q_W = 0.74;
const QV = 7; // kuyrukta görünen yolcu sayısı

let game = null;
let view = null; // seviyeye özel sahne nesneleri
let levelGroup = null;
let chain = Promise.resolve();
let hintBusId = null;
let hintUntil = 0;
let flash = new Map(); // busId -> bitiş zamanı (hata uyarısı)
let paused = false;
let handled = null;

function disposeGroup(g) {
  if (!g) return;
  g.traverse((o) => {
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    if (o.material && !o.material.userData.shared) [].concat(o.material).forEach((m) => m.dispose());
  });
  scene.remove(g);
}

/** Kilitli durak rozeti: altın daire, oynat simgesi ve "AÇ" yazısı (reklamla açılır). */
let lockTex = null;
function lockBadge() {
  if (!lockTex) {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 160;
    const c = cv.getContext('2d');
    c.fillStyle = '#ffcf4a'; c.strokeStyle = 'rgba(8,12,24,0.9)'; c.lineWidth = 6;
    c.beginPath(); c.arc(64, 60, 48, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = '#2a1d00'; c.beginPath(); c.moveTo(48, 36); c.lineTo(48, 84); c.lineTo(88, 60); c.closePath(); c.fill();
    c.font = '800 34px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 7; c.strokeText('AÇ', 64, 134); c.fillStyle = '#ffffff'; c.fillText('AÇ', 64, 134);
    lockTex = new THREE.CanvasTexture(cv); lockTex.colorSpace = THREE.SRGBColorSpace;
  }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: lockTex, transparent: true, depthTest: false }));
  sp.scale.set(0.8, 1.0, 1); sp.renderOrder = 6;
  return sp;
}

function labelSprite(text, w = 1.5) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const ctx = cv.getContext('2d');
  ctx.font = '700 30px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(8,12,24,0.85)'; ctx.strokeText(text, 128, 34);
  ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
  sp.scale.set(w, w / 4, 1);
  sp.renderOrder = 5;
  return sp;
}

const dirRot = { E: 0, W: Math.PI, N: Math.PI / 2, S: -Math.PI / 2 };
const dirVec = { E: [1, 0], W: [-1, 0], N: [0, -1], S: [0, 1] };

function gridPos(L, b) {
  const horiz = b.dir === 'E' || b.dir === 'W';
  return { x: b.x - (L.w - 1) / 2 + (horiz ? (b.len - 1) / 2 : 0), z: b.y - (L.h - 1) / 2 + (horiz ? 0 : (b.len - 1) / 2) };
}
const slotX = (i) => (i - (view.maxCap - 1) / 2) * SLOT_W;
const waitPos = (i) => new THREE.Vector3((i - (game.L.wait - 1) / 2) * WAIT_W, 0, view.waitZ);
const queuePos = (k) => new THREE.Vector3(-((QV - 1) / 2) * Q_W + k * Q_W, 0, view.queueZ);

function buildLevelScene(L) {
  disposeGroup(levelGroup);
  levelGroup = new THREE.Group();
  scene.add(levelGroup);
  const maxCap = Math.max(stopsOf(L), L.bay + (L.helpers.extraSlot || 0)); // tüm duraklar görünür; kilitliler reklamla açılır
  const gridMat = new THREE.MeshStandardMaterial({ color: 0x3b414d, roughness: 0.85, metalness: 0.1 });
  const slab = new THREE.Mesh(new RoundedBoxGeometry(L.w + 0.7, 0.14, L.h + 0.7, 3, 0.06), gridMat);
  slab.position.y = -0.07; slab.receiveShadow = true;
  levelGroup.add(slab);
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16 });
  for (let i = 1; i < L.w; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.004, L.h), lineMat); m.position.set(i - L.w / 2, 0.003, 0); levelGroup.add(m); }
  for (let j = 1; j < L.h; j++) { const m = new THREE.Mesh(new THREE.BoxGeometry(L.w, 0.004, 0.03), lineMat); m.position.set(0, 0.003, j - L.h / 2); levelGroup.add(m); }

  const bayZ = L.h / 2 + 0.7 + 1.7;
  const waitZ = bayZ + 1.7 + 0.35 + 0.55;
  const queueZ = waitZ + 0.55 + 0.35 + 0.5;
  view = { maxCap, bayZ, waitZ, queueZ, buses: {}, slotMats: [], stopPick: [], lockSprites: [], lockPlates: [], bayOcc: new Map(), qFigs: [], wFigs: [], qHead: 0, qLabel: null };

  // park alanı
  const bayW = maxCap * SLOT_W + 0.5;
  const bayMat = new THREE.MeshStandardMaterial({ color: 0x2c5a8c, roughness: 0.8, metalness: 0.1 });
  const bay = new THREE.Mesh(new RoundedBoxGeometry(bayW, 0.12, 3.4, 3, 0.05), bayMat);
  bay.position.set(0, -0.06, bayZ); bay.receiveShadow = true; levelGroup.add(bay);
  for (let i = 0; i < maxCap; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: i < L.bay ? 0.75 : 0.18 });
    view.slotMats.push(mat);
    const sx = slotX(i);
    for (const [w, d, ox, oz] of [[0.05, 3.0, -SLOT_W / 2 + 0.08, 0], [0.05, 3.0, SLOT_W / 2 - 0.08, 0], [SLOT_W - 0.16, 0.05, 0, 1.5]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.006, d), mat);
      m.position.set(sx + ox, 0.004, bayZ + oz); levelGroup.add(m);
    }
  }
  for (let i = 0; i < maxCap; i++) {
    const pick = new THREE.Mesh(new THREE.BoxGeometry(SLOT_W - 0.1, 0.05, 3.0), new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0 }));
    pick.position.set(slotX(i), 0.03, bayZ); pick.userData.stopIndex = i; levelGroup.add(pick); view.stopPick.push(pick);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(SLOT_W - 0.1, 0.03, 3.1), new THREE.MeshBasicMaterial({ color: 0x050914, transparent: true, opacity: 0.6 }));
    plate.position.set(slotX(i), 0.025, bayZ); plate.visible = false; levelGroup.add(plate); view.lockPlates.push(plate);
    const lk = lockBadge(); lk.position.set(slotX(i), 0.6, bayZ); lk.visible = false; levelGroup.add(lk); view.lockSprites.push(lk);
  }
  const lb1 = labelSprite('DURAKLAR', 2.4); lb1.position.set(-bayW / 2 + 1.25, 0.3, bayZ - 1.85); levelGroup.add(lb1);

  // bekleme alanı
  const wW = L.wait * WAIT_W + 0.5;
  const wMat = new THREE.MeshStandardMaterial({ color: 0x7a5a30, roughness: 0.75 });
  const wp = new THREE.Mesh(new RoundedBoxGeometry(wW, 0.12, 1.1, 3, 0.05), wMat);
  wp.position.set(0, -0.06, waitZ); wp.receiveShadow = true; levelGroup.add(wp);
  const cellMat = new THREE.MeshBasicMaterial({ color: 0xfff1cf, transparent: true, opacity: 0.35 });
  for (let i = 0; i < L.wait; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.006, 20), cellMat); const p = waitPos(i); c.position.set(p.x, 0.005, waitZ); levelGroup.add(c); }
  const lb2 = labelSprite('BEKLEME', 1.9); lb2.position.set(-wW / 2 + 0.95, 0.3, waitZ - 0.78); levelGroup.add(lb2);

  // yolcu sırası
  const qW = QV * Q_W + 0.7;
  const qp = new THREE.Mesh(new RoundedBoxGeometry(qW, 0.1, 0.95, 3, 0.05), new THREE.MeshStandardMaterial({ color: 0x4b5163, roughness: 0.8 }));
  qp.position.set(0, -0.05, queueZ); qp.receiveShadow = true; levelGroup.add(qp);
  view.qLabel = labelSprite('', 1.6);
  view.qLabel.position.set(qW / 2 - 0.55, 0.85, queueZ + 0.05);
  const lb3 = labelSprite('YOLCU SIRASI', 2.2); lb3.position.set(-qW / 2 + 1.15, 0.3, queueZ - 0.62); levelGroup.add(lb3);
  levelGroup.add(view.qLabel);

  // otobüsler
  L.buses.forEach((b) => {
    const m = makeBus(b, { shadows: highQ(), skin: save.garage.skin });
    const gp = gridPos(L, b);
    m.position.set(gp.x, 0, gp.z);
    m.rotation.y = dirRot[b.dir];
    const lbl = makeCountLabel(b.color);
    lbl.position.set(0, 1.5, 0); lbl.visible = false;
    m.add(lbl);
    m.userData.label = lbl;
    levelGroup.add(m);
    view.buses[b.id] = m;
  });

  // kamera sınırları
  const halfW = Math.max(L.w / 2 + 0.5, bayW / 2 + 0.2, qW / 2 + 0.1);
  view.bounds = { minX: -halfW, maxX: halfW, minZ: -L.h / 2 - 0.5, maxZ: queueZ + 0.7 };
  levelGroup.add(makeDecor(halfW, -L.h / 2 - 0.3, queueZ, { shadows: highQ() }));
  world.position.z = 4 - L.h / 2;
  fitCamera();
}

function fitCamera() {
  if (!view) return;
  const b = view.bounds;
  const target = new THREE.Vector3((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
  const pitch = THREE.MathUtils.degToRad(57);
  const dirv = new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch));
  const H = window.innerHeight;
  const yMax = 1 - (2 * (88 + 8)) / H;
  const yMin = -1 + (2 * 96) / H;
  const pts = [];
  for (const x of [b.minX, b.maxX]) for (const z of [b.minZ, b.maxZ]) for (const y of [0, 1.1]) pts.push(new THREE.Vector3(x, y, z));
  const fits = (d) => {
    camera.position.copy(target).addScaledVector(dirv, d);
    camera.lookAt(target);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    return pts.every((p) => { const v = p.clone().project(camera); return Math.abs(v.x) <= 0.95 && v.y <= yMax && v.y >= yMin; });
  };
  let lo = 5, hi = 120;
  for (let i = 0; i < 22; i++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
  fits(hi);
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (mode === 'showroom') showroom.fitCamera(camera, camera.aspect); else fitCamera();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 150));

// ------------------------------------------------------------------ sahneyi oyun durumundan kur (başlangıç, geri al, yeniden başlat)
function clearFigs() {
  [...view.qFigs, ...view.wFigs].forEach((f) => levelGroup.remove(f));
  view.qFigs = []; view.wFigs = [];
}
function placeQueueFig(f, k, instant = true) {
  const p = queuePos(k);
  if (instant) f.position.copy(p);
  return p;
}

function updateStops() {
  if (!view || !game) return;
  view.slotMats.forEach((m, i) => { m.opacity = i < game.st.cap ? 0.75 : 0.18; });
  view.lockSprites.forEach((sp, i) => { sp.visible = i >= game.st.cap; });
  view.lockPlates.forEach((p, i) => { p.visible = i >= game.st.cap; });
}
function flashStops() {
  view.stopPick.forEach((p, i) => { if (i < game.st.cap) tween(0.5, (k) => { p.material.opacity = 0.55 * Math.sin(Math.PI * k); }, ease.lin); });
}

function rebuildFromState() {
  killTweens();
  chain = Promise.resolve();
  const L = game.L, st = game.st;
  view.bayOcc.clear();
  // slot işaretleri
  updateStops();
  L.buses.forEach((b) => {
    const m = view.buses[b.id];
    m.scale.setScalar(1);
    m.userData.inBay = false;
    m.userData.label.visible = false;
    const inBay = st.bay.find((x) => x.id === b.id);
    if (!(st.mask & (1 << b.id))) {
      const gp = gridPos(L, b);
      m.visible = true; m.position.set(gp.x, 0, gp.z); m.rotation.y = dirRot[b.dir];
    } else if (inBay) {
      m.visible = true; m.position.set(slotX(inBay.slot), 0, view.bayZ); m.rotation.y = Math.PI / 2;
      m.userData.inBay = true; m.userData.label.visible = true; m.userData.label.userData.set(inBay.left);
      view.bayOcc.set(inBay.slot, b.id);
    } else m.visible = false;
  });
  clearFigs();
  view.qHead = st.qi;
  for (let k = 0; k < QV && st.qi + k < L.queue.length; k++) {
    const f = makePassenger(L.queue[st.qi + k]);
    f.position.copy(queuePos(k)); levelGroup.add(f); view.qFigs.push(f);
  }
  st.waiting.forEach((c, i) => { const f = makePassenger(c); f.position.copy(waitPos(i)); levelGroup.add(f); view.wFigs.push(f); });
  updateQueueLabel();
  updateHud();
}

function updateQueueLabel() {
  const rest = game.L.queue.length - view.qHead;
  const extra = rest - view.qFigs.length;
  const sp = view.qLabel;
  const cv = sp.material.map.image;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  if (extra > 0 || rest > 0) {
    const text = extra > 0 ? `+${extra}` : '';
    ctx.font = '800 46px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(8,12,24,0.9)'; ctx.strokeText(text, 128, 34);
    ctx.fillStyle = '#ffd84a'; ctx.fillText(text, 128, 34);
  }
  sp.material.map.needsUpdate = true;
}

// ------------------------------------------------------------------ olay animasyonları
const hop = (obj, from, to, sec, scaleEnd = 1) => tween(sec, (k) => {
  obj.position.lerpVectors(from, to, k);
  obj.position.y += Math.sin(Math.PI * k) * 0.75;
  obj.scale.setScalar(1 + (scaleEnd - 1) * k);
}, ease.io);

const slide = (obj, to, sec) => { const from = obj.position.clone(); return tween(sec, (k) => obj.position.lerpVectors(from, to, k), ease.io); };

function startExitSlide(id, cells) {
  const b = game.L.buses[id], m = view.buses[id];
  m.userData.inBay = true; // artık ızgarada dokunulamaz
  const [dx, dz] = dirVec[b.dir];
  const shift = cells + 1.4;
  const from = m.position.clone();
  sfx.go(); vibrate(15);
  return tween(0.28 + shift * 0.07, (k) => {
    m.position.set(from.x + dx * shift * k, 0, from.z + dz * shift * k);
    m.scale.setScalar(k > 0.72 ? 1 - ((k - 0.72) / 0.28) * 0.85 : 1);
  }, ease.in);
}

async function playEvents(events, e, slidePromise) {
  const alive = () => e === epoch;
  const many = events.length > 7;
  const t = many ? 0.6 : 1;
  for (const ev of events) {
    if (!alive()) return;
    if (ev.type === 'exit') {
      await slidePromise;
      if (!alive()) return;
      const m = view.buses[ev.busId];
      const bus = game.L.buses[ev.busId];
      m.position.set(slotX(ev.slot), 0, view.bayZ);
      m.rotation.y = Math.PI / 2;
      m.scale.setScalar(0.01);
      m.userData.label.visible = true; m.userData.label.userData.set(bus.cap);
      view.bayOcc.set(ev.slot, ev.busId);
      sfx.park();
      await tween(0.32 * t, (k) => m.scale.setScalar(Math.max(0.01, k)), ease.back);
    } else if (ev.type === 'board') {
      const fig = ev.from === 'queue' ? view.qFigs.shift() : view.wFigs.splice(ev.waitIndex, 1)[0];
      const m = view.buses[ev.busId];
      if (!fig || !m) continue;
      const to = m.position.clone(); to.y = 0.55;
      sfx.board();
      const p1 = hop(fig, fig.position.clone(), to, 0.22 * t, 0.15);
      shiftQueueAndWait(ev.from, 0.18 * t);
      await p1;
      if (!alive()) return;
      levelGroup.remove(fig);
      m.userData.label.userData.set(ev.left);
      m.scale.setScalar(1.06);
      tween(0.14, (k) => m.scale.setScalar(1.06 - 0.06 * k), ease.out);
    } else if (ev.type === 'wait') {
      const fig = view.qFigs.shift();
      if (!fig) continue;
      view.wFigs.push(fig);
      sfx.wait();
      const to = waitPos(ev.waitIndex);
      const p1 = hop(fig, fig.position.clone(), to, 0.2 * t);
      shiftQueueAndWait('queue', 0.16 * t);
      await p1;
    } else if (ev.type === 'depart') {
      const m = view.buses[ev.busId];
      view.bayOcc.delete(ev.slot);
      m.userData.label.visible = false;
      sfx.depart(); vibrate(20);
      await wait(0.08);
      const to = m.position.clone(); to.x += 14;
      await slide(m, to, 0.55 * t);
      if (!alive()) return;
      m.visible = false;
    }
  }
}

/** Kuyruk sola kayar, yeni yolcu sona eklenir; bekleme alanı boşluğu kapanır. */
function shiftQueueAndWait(from, sec) {
  if (from === 'queue') {
    view.qHead++;
    view.qFigs.forEach((f, k) => { const a = f.position.clone(), b = queuePos(k); tween(sec, (t) => f.position.lerpVectors(a, b, t), ease.io); });
    const idx = view.qHead + view.qFigs.length;
    if (idx < game.L.queue.length && view.qFigs.length < QV) {
      const nf = makePassenger(game.L.queue[idx]);
      nf.position.copy(queuePos(view.qFigs.length)); nf.scale.setScalar(0.01);
      levelGroup.add(nf); view.qFigs.push(nf);
      tween(sec * 1.4, (t) => nf.scale.setScalar(Math.max(0.01, t)), ease.back);
    }
  } else {
    view.wFigs.forEach((f, i) => { const a = f.position.clone(), b = waitPos(i); tween(sec, (t) => f.position.lerpVectors(a, b, t), ease.io); });
  }
  updateQueueLabel();
}

const enqueue = (fn) => { const e = epoch; chain = chain.then(() => (e === epoch ? fn(e) : null)).catch((err) => console.error(err)); return chain; };

// ------------------------------------------------------------------ giriş
const raycaster = new THREE.Raycaster();
$('c').addEventListener('pointerdown', (ev) => {
  if (!game || paused || game.status !== 'playing' || isMenuOpen()) return;
  const r = $('c').getBoundingClientRect();
  const ndc = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const targets = Object.values(view.buses).filter((m) => m.visible && !m.userData.inBay);
  const hit = raycaster.intersectObjects(targets, true)[0];
  if (!hit) {
    const sp = raycaster.intersectObjects(view.stopPick.filter((m) => m.userData.stopIndex >= game.st.cap), false)[0];
    if (sp) openStopAd();
    return;
  }
  let o = hit.object;
  while (o && o.userData.busId === undefined) o = o.parent;
  if (o) doTap(o.userData.busId);
});

function doTap(id) {
  if (!game || game.status !== 'playing') return null;
  const res = game.tap(id);
  if (!res.ok) {
    if (res.reason === 'bay_full') {
      sfx.bump(); vibrate(40); flashStops();
      toast(game.canUnlockStop() ? 'Duraklar dolu! Bir otobüs dolup ayrılana kadar bekle ya da kilitli 📺 durağa dokunup reklamla durak aç.' : 'Duraklar dolu! Bir otobüs dolup ayrılana kadar bekle.', 3200);
    } else if (res.reason === 'blocked') {
      sfx.bump(); vibrate(40);
      bumpBus(id);
      toast('Yolu kapalı! Önce önündeki otobüsü çıkar.');
    }
    updateHud();
    if (game.status !== 'playing') enqueue(() => afterMove());
    return res;
  }
  hideTip();
  const events = res.events;
  meta.event('bus_exit');
  { const nb = events.filter((e) => e.type === 'board').length; if (nb) meta.event('passenger', nb); }
  const sp = startExitSlide(id, events[0].shift);
  enqueue((e) => playEvents(events, e, sp));
  enqueue(() => afterMove());
  updateHud();
  return res;
}

function bumpBus(id) {
  const m = view.buses[id], b = game.L.buses[id];
  const [dx, dz] = dirVec[b.dir];
  const from = m.position.clone();
  flash.set(id, performance.now() + 450);
  tween(0.3, (k) => { const s = Math.sin(k * Math.PI * 2) * (1 - k) * 0.16; m.position.set(from.x + dx * s, 0, from.z + dz * s); }, ease.lin);
}

// ------------------------------------------------------------------ bitiş akışı
function afterMove() {
  if (!game) return;
  const key = game.runId + ':' + game.status + ':' + game.st.cap;
  if (game.status === 'playing' || handled === key) return;
  handled = key;
  if (game.status === 'won') showWin(); else showLose();
}

let lastReward = 0;
function showWin() {
  sfx.win(); vibrate(60);
  const stars = game.stars();
  const { save: ns, reward } = claimLevelResult(save, game.L, { stars, runId: game.runId });
  save = ns; persist();
  meta.commit(save);
  meta.event('level_won'); if (stars) meta.event('star', stars); if (stars === 3) meta.event('three_star');
  meta.noteWin();
  analytics.track('level_won', { level: game.L.id, stars, mistakes: game.mistakes }); analytics.flush();
  lastReward = reward.coins;
  $('win-double').classList.toggle('hidden', !(reward.coins > 0));
  $('win-double').disabled = false;
  const rows = [];
  if (reward.duplicate) rows.push('<div class="zero">Bu ödül zaten alındı.</div>');
  else {
    if (reward.base) rows.push(`<div class="line"><span>Seviye ödülü</span><b>+${reward.base} 🪙</b></div>`);
    if (reward.starBonus) rows.push(`<div class="line"><span>3 yıldız bonusu</span><b>+${reward.starBonus} 🪙</b></div>`);
    if (reward.xp) rows.push(`<div class="line"><span>Deneyim</span><b>+${reward.xp} XP</b></div>`);
    if (!reward.base && !reward.starBonus) rows.push('<div class="zero">Tekrar oynamada ek para verilmez.' + (stars < 3 ? ' 3 yıldız alırsan bir kereye mahsus bonus kazanırsın.' : '') + '</div>');
  }
  rows.push(`<div class="zero">Hata: ${game.mistakes} · İpucu: ${game.hintsUsed} · Dokunuş: ${game.taps}</div>`);
  $('win-rewards').innerHTML = rows.join('');
  [...$('win-stars').children].forEach((el, i) => { el.classList.remove('on'); setTimeout(() => { if (i < stars) { el.classList.add('on'); sfx.coin(); } }, 300 + i * 320); });
  $('win-next').disabled = game.L.id >= LEVELS.length;
  setTimeout(() => $('modal-win').classList.remove('hidden'), 450);
  refreshCoins();
}

function showLose() {
  sfx.lose(); vibrate([40, 40, 40]);
  const L = game.L, st = game.st;
  let why = 'Hareket edebilecek otobüs kalmadı.';
  if (L.moveLimit && game.movesLeft === 0) why = 'Hamle hakkın bitti.';
  else if (game.movesLeft === 0 && L.moveLimit) why = 'Hamle hakkın bitti.';
  else if (st.bay.length >= st.cap) why = 'Duraklar doldu ve hiçbir otobüs çıkamıyor.' + (game.canUnlockStop() ? ' Reklam izleyerek yeni durak açabilirsin.' : '');
  $('lose-reason').textContent = why;
  analytics.track('level_lost', { level: L.id });
  $('lose-moves').classList.toggle('hidden', !(L.moveLimit && game.movesLeft === 0));
  $('lose-stop').classList.toggle('hidden', !(game.canUnlockStop() && !(L.moveLimit && game.movesLeft === 0)));
  $('lose-undo').disabled = !game.canUndo();
  $('lose-undo').textContent = game.canUndo() ? `Son hamleyi geri al (${L.helpers.undo - game.undosUsed})` : 'Geri alma hakkı kalmadı';
  setTimeout(() => $('modal-lose').classList.remove('hidden'), 350);
}

// ------------------------------------------------------------------ arayüz
const isMenuOpen = () => ['modal-win', 'modal-lose', 'modal-pause', 'modal-ad', 'modal-sheet'].some((id) => !$(id).classList.contains('hidden'));
let toastTimer = 0;
function toast(msg, ms = 1800) {
  const t = $('toast');
  t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
}
function hideTip() { $('tip').classList.add('hidden'); }
const TIPS = {
  5: 'Duraklar dolarsa otobüs çıkamaz (hata sayılmaz). Kilitli 📺 durağa dokunursan reklam izleyerek yeni durak açarsın; isteğe bağlıdır, tüm seviyeler reklamsız çözülebilir.',
  1: 'Yolu açık olan bir otobüse dokun: okun gösterdiği yöne gidip ızgaradan çıkar.',
  2: 'Alttaki yolcular aynı renk ve simgeli otobüse biner. Park alanına giren otobüs yolcuları bekler.',
  3: 'Bir otobüsün yolunu başkası kapatıyorsa önce onu çıkar. Kapalı yola dokunmak hata sayılır.',
  4: 'Uygun otobüs yoksa yolcu "Bekleme" alanına geçer. Bekleme ve park alanı dolarsa oyun kilitlenir.',
  8: 'Yıldız için: hatasız ve ipucu/ekstra park yeri kullanmadan bitir.',
  14: 'Bazı seviyelerde hamle sınırı vardır; hatalı dokunuşlar da hamle sayılır.',
};

function refreshCoins() {
  $('coin-count').textContent = save.coins;
  document.querySelectorAll('.coin-count').forEach((e) => (e.textContent = save.coins));
  document.querySelectorAll('.crystal-count').forEach((e) => (e.textContent = save.crystals));
}

function updateHud() {
  if (!game) return;
  const L = game.L;
  $('lvl-title').textContent = `Seviye ${L.id}`;
  const s = game.starsNow();
  $('star-preview').textContent = '★'.repeat(s) + '☆'.repeat(3 - s);
  const ml = $('moves-left');
  if (L.moveLimit) {
    ml.classList.remove('hidden');
    ml.textContent = `Hamle: ${game.movesLeft}`;
    ml.classList.toggle('warn', game.movesLeft <= 2);
  } else ml.classList.add('hidden');
  const h = L.helpers;
  $('badge-undo').textContent = h.undo - game.undosUsed;
  $('badge-hint').textContent = h.hint + game.bonusHints - game.hintsUsed;
  $('badge-slot').textContent = h.extraSlot - game.extraSlotsUsed;
  $('tool-undo').disabled = !game.canUndo();
  $('tool-hint').disabled = !game.canHint();
  $('tool-slot').disabled = !game.canAddSlot();
  $('tool-slot').classList.toggle('hidden', !h.extraSlot);
  refreshCoins();
}

function showScreen(name) {
  if (name !== 'title') $('panel').classList.add('hidden');
  ['title', 'levels', 'settings'].forEach((n) => $('screen-' + n).classList.toggle('hidden', n !== name));
  const inGame = name === null;
  ['hud', 'tools'].forEach((id) => $(id).classList.toggle('hidden', !inGame));
  if (!inGame) { hideTip(); $('toast').classList.add('hidden'); }
  if (name === 'title') { renderTitle(); meta.updateDots(); }
  if (name === 'levels') renderLevels();
  if (name === 'settings') renderSettings();
}
function closeModals() { ['modal-win', 'modal-lose', 'modal-pause'].forEach((id) => $(id).classList.add('hidden')); }

function renderTitle() {
  const lvl = Math.min(save.unlocked, LEVELS.length);
  $('btn-play').textContent = save.unlocked > 1 ? `Devam et · Seviye ${lvl}` : 'Oyna';
  $('profile-line').innerHTML = `${meta.premium() ? '⭐ ' : ''}Hesap seviyesi <b>${accountLevel(save.xp)}</b> · 🪙 <b>${save.coins}</b> · 💎 <b>${save.crystals}</b>`;
}

function renderLevels() {
  const grid = $('level-grid');
  grid.innerHTML = '';
  refreshCoins();
  LEVELS.forEach((L) => {
    const rec = save.levels[L.id];
    const locked = L.id > save.unlocked;
    const b = document.createElement('button');
    b.className = 'lv' + (locked ? ' locked' : '') + (L.id === Math.min(save.unlocked, LEVELS.length) ? ' cur' : '') + (L.tier === 'special' ? ' special' : '');
    b.innerHTML = `<span>${L.id}</span><small>${rec ? '★'.repeat(rec.stars) + '☆'.repeat(3 - rec.stars) : ''}</small>`;
    if (!locked) b.addEventListener('click', () => { sfx.click(); startLevel(L.id); });
    grid.appendChild(b);
  });
  const cur = grid.querySelector('.cur');
  if (cur) cur.scrollIntoView({ block: 'center' });
}

function renderSettings() {
  $('set-sound').checked = save.settings.sound;
  $('set-vibration').checked = save.settings.vibration;
  document.querySelectorAll('#set-quality button').forEach((b) => b.classList.toggle('on', b.dataset.q === save.settings.quality));
  const done = Object.values(save.levels).filter((l) => l.stars > 0).length;
  const stars = Object.values(save.levels).reduce((s, l) => s + l.stars, 0);
  $('profile-stats').innerHTML = `Hesap seviyesi: <b>${accountLevel(save.xp)}</b> (${save.xp} XP)<br>Tamamlanan seviye: <b>${done}</b> / ${LEVELS.length}<br>Toplam yıldız: <b>${stars}</b> · Para: <b>${save.coins}</b>`;
}

function startLevel(n) {
  const L = LEVELS[n - 1];
  if (!L || n > save.unlocked) return;
  game = new Game(L);
  game.adCounts = {};
  analytics.track('level_start', { level: n });
  handled = null; paused = false; hintBusId = null;
  closeModals();
  showScreen(null);
  buildLevelScene(L);
  // ilk yerleşim: yolcular bekleme alanına otomatik geçer (görsel olarak canlandırılır)
  const st0 = game.st;
  game.st = { mask: 0, cap: L.bay, qi: 0, bay: [], waiting: [] };
  rebuildFromState();
  game.st = st0;
  const intro = game.initialEvents();
  chain = Promise.resolve();
  enqueue((ep) => playEvents(intro, ep, null).then(() => { if (ep === epoch) updateQueueLabel(); }));
  if (TIPS[n]) { $('tip').textContent = TIPS[n]; $('tip').classList.remove('hidden'); } else hideTip();
  updateHud();
}

// ------------------------------------------------------------------ düğmeler
$('btn-play').addEventListener('click', () => { sfx.click(); startLevel(Math.min(save.unlocked, LEVELS.length)); });
$('btn-levels').addEventListener('click', () => { sfx.click(); showScreen('levels'); });
$('btn-settings').addEventListener('click', () => { sfx.click(); showScreen('settings'); });
document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => { sfx.click(); showScreen('title'); }));

$('btn-pause').addEventListener('click', () => { if (!game) return; sfx.click(); paused = true; $('modal-pause').classList.remove('hidden'); });
$('pause-resume').addEventListener('click', () => { sfx.click(); paused = false; $('modal-pause').classList.add('hidden'); });
$('pause-restart').addEventListener('click', () => { sfx.click(); startLevel(game.L.id); });
$('pause-levels').addEventListener('click', () => { sfx.click(); closeModals(); showScreen('levels'); });
$('pause-menu').addEventListener('click', () => { sfx.click(); closeModals(); showScreen('title'); });

async function afterWin(fn) {
  sfx.click();
  $('modal-win').classList.add('hidden');
  await meta.interstitialIfDue(game.L.id); // oyun dışında, seviyeler arasında; premium'da gösterilmez
  fn();
}
$('win-next').addEventListener('click', () => afterWin(() => startLevel(game.L.id + 1)));
$('win-retry').addEventListener('click', () => afterWin(() => startLevel(game.L.id)));
$('win-levels').addEventListener('click', () => afterWin(() => { closeModals(); showScreen('levels'); }));
$('win-double').addEventListener('click', async () => {
  const r = await meta.rewarded('double_reward', game.adCounts.double_reward || 0);
  if (!r.ok) return;
  game.adCounts.double_reward = 1;
  $('win-double').classList.add('hidden');
  meta.commit({ ...save, coins: save.coins + lastReward });
  $('win-rewards').insertAdjacentHTML('afterbegin', `<div class="line"><span>Reklam bonusu (2×)</span><b>+${lastReward} 🪙</b></div>`);
  refreshCoins();
});
$('lose-moves').addEventListener('click', async () => {
  const r = await meta.rewarded('extra_move', game.adCounts.extra_move || 0);
  if (!r.ok) return;
  game.adCounts.extra_move = 1;
  game.grantMoves(r.reward.moves);
  handled = null; closeModals(); updateHud();
});
function applyAdReward(placement, reward) {
  game.adCounts[placement] = (game.adCounts[placement] || 0) + 1;
  if (placement === 'extra_hint') game.grantHint();
  else if (placement === 'unlock_stop') { game.grantAdSlot(); updateStops(); toast('Yeni durak açıldı'); }
  else if (placement === 'extra_move') game.grantMoves(reward.moves);
  updateHud();
}
function openAdSheet() {
  if (!game || game.status !== 'playing') return;
  const L = game.L, box = $('sheet-options');
  const opts = [['extra_hint', '💡 +1 ipucu'], ['unlock_stop', '🅿️ Yeni durak aç (3★ vermez)']];
  if (L.moveLimit) opts.push(['extra_move', '👣 +3 hamle']);
  box.innerHTML = '';
  opts.forEach(([pl, label]) => {
    const left = adsLeft(save, clockNow(), pl), used = game.adCounts[pl] || 0;
    const b = document.createElement('button');
    b.className = 'btn gold'; b.textContent = `${label} · bugün ${left} hak`;
    const cap = AD_LIMITS.placements[pl].perRun;
    b.disabled = left <= 0 || used >= cap || (pl === 'unlock_stop' && !game.canUnlockStop());
    b.addEventListener('click', async () => {
      $('modal-sheet').classList.add('hidden');
      const r = await meta.rewarded(pl, used);
      if (r.ok) applyAdReward(pl, r.reward);
    });
    box.appendChild(b);
  });
  $('modal-sheet').classList.remove('hidden');
}
async function openStopAd() {
  if (!game || !game.canUnlockStop()) { toast('Açılacak kilitli durak kalmadı'); return; }
  const used = game.adCounts.unlock_stop || 0;
  if (used >= AD_LIMITS.placements.unlock_stop.perRun) { toast('Bu seviyede en fazla ' + AD_LIMITS.placements.unlock_stop.perRun + ' durak açabilirsin'); return; }
  const r = await meta.rewarded('unlock_stop', used);
  if (!r.ok) return;
  applyAdReward('unlock_stop', r.reward);
  if (game.status === 'playing') { handled = null; closeModals(); }
  updateHud();
}
$('lose-stop').addEventListener('click', openStopAd);
$('tool-ad').addEventListener('click', () => { sfx.click(); openAdSheet(); });
$('sheet-close').addEventListener('click', () => $('modal-sheet').classList.add('hidden'));
$('lose-retry').addEventListener('click', () => { sfx.click(); startLevel(game.L.id); });
$('lose-levels').addEventListener('click', () => { sfx.click(); closeModals(); showScreen('levels'); });
$('lose-undo').addEventListener('click', () => {
  if (!game.undo()) return;
  sfx.undo(); handled = null; closeModals(); rebuildFromState();
});

$('tool-undo').addEventListener('click', () => {
  if (!game || !game.canUndo()) return;
  game.undo(); sfx.undo(); handled = null; rebuildFromState(); toast('Son hamle geri alındı');
});
$('tool-restart').addEventListener('click', () => { if (game) { sfx.click(); startLevel(game.L.id); } });
$('tool-slot').addEventListener('click', () => {
  if (!game || !game.canAddSlot()) return;
  game.addSlot(); sfx.coin();
  updateStops();
  toast('Ek durak açıldı'); updateHud();
  if (game.status !== 'playing') enqueue(() => afterMove());
});
$('tool-hint').addEventListener('click', () => {
  if (!game || !game.canHint()) return;
  const r = game.hint((L, st, taps) => solve(L, st, taps));
  if (!r.ok) {
    toast(r.reason === 'no_solution' ? 'Bu durumdan çözüm yok. Geri almayı dene.' : 'İpucu hakkın bitti');
    return;
  }
  sfx.hint(); hintBusId = r.busId; hintUntil = performance.now() + 3500;
  toast('Parlayan otobüse dokun'); updateHud();
});

$('set-sound').addEventListener('change', (e) => { save.settings.sound = e.target.checked; setSound(e.target.checked); persist(); sfx.click(); });
$('set-vibration').addEventListener('change', (e) => { save.settings.vibration = e.target.checked; setVibration(e.target.checked); persist(); vibrate(30); });
document.querySelectorAll('#set-quality button').forEach((b) => b.addEventListener('click', () => {
  save.settings.quality = b.dataset.q; persist(); applyQuality(); renderSettings(); sfx.click();
}));
let resetArmed = 0;
$('btn-reset').addEventListener('click', () => {
  if (performance.now() - resetArmed < 3500) {
    clearSave(storage);
    save = loadSave(storage).save;
    game = null; persist(); renderSettings(); $('btn-reset').textContent = 'İlerlemeyi sıfırla'; resetArmed = 0; toast('İlerleme sıfırlandı');
  } else { resetArmed = performance.now(); $('btn-reset').textContent = 'Emin misin? Tekrar dokun'; setTimeout(() => { if (performance.now() - resetArmed >= 3500) $('btn-reset').textContent = 'İlerlemeyi sıfırla'; }, 3600); }
});

document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });
window.addEventListener('pagehide', persist);

// ------------------------------------------------------------------ ana döngü
const clock = new THREE.Clock();
function frame(now) {
  requestAnimationFrame(frame);
  stepTweens(now);
  const t = clock.getElapsedTime();
  if (mode === 'showroom') showroom.tick(t);
  if (mode === 'game' && view && game) {
    // yolcu bekleme animasyonu
    [...view.qFigs, ...view.wFigs].forEach((f, i) => { f.userData.body.position.y = 0.3 + Math.sin(t * 3 + i) * 0.015; });
    // ipucu ve hata vurgusu
    Object.entries(view.buses).forEach(([id, m]) => {
      let v = 0;
      if (+id === hintBusId && now < hintUntil) v = 0.35 + 0.35 * Math.sin(t * 9);
      const fe = flash.get(+id);
      if (fe && now < fe) v = Math.max(v, 0.5);
      m.userData.paints[0].emissiveIntensity = v;
      m.userData.paints[0].emissive.setHex(fe && now < fe ? 0xff2020 : COLORS[m.userData.bus.color].hex);
    });
  }
  renderer.render(scene, camera);
}

// ------------------------------------------------------------------ meta (otopark, garaj, görevler, premium, profil)
function applyLook(look) {
  scene.background = new THREE.Color(look.bg);
  scene.fog = new THREE.Fog(look.fog, 28, 70);
  sun.intensity = look.sun; hemi.intensity = look.hemi; scene.environmentIntensity = look.env;
  world.visible = false;
}
function restoreLook() {
  scene.background = skyBg; scene.fog = skyFog;
  sun.intensity = 2.3; hemi.intensity = 0.6; scene.environmentIntensity = 0.55;
  world.visible = true; camera.clearViewOffset(); camera.updateProjectionMatrix();
}
function fitShowroom() { showroom.fitCamera(camera, camera.aspect); }
const meta = createMeta({
  storage,
  getSave: () => save,
  setSave: (s) => { save = s; persist(); refreshCoins(); },
  now: () => clockNow(),
  toast, sfx, showroom, refreshCoins,
  onOpen: (isRoom, state) => {
    $('screen-title').classList.add('hidden');
    $('panel').classList.toggle('full', !isRoom);
    if (isRoom && mode !== 'showroom') {
      mode = 'showroom';
      if (levelGroup) levelGroup.visible = false;
      applyLook(showroom.build(state)); showroom.show(); fitShowroom();
    } else if (!isRoom && mode === 'showroom') leaveShowroom();
  },
  refreshShowroom: (state) => { applyLook(showroom.build(state)); fitShowroom(); },
  onSkinChange: () => {},
  onClose: () => { leaveShowroom(); showScreen('title'); },
});
function leaveShowroom() {
  if (mode !== 'showroom') return;
  mode = 'game'; showroom.hide(); showroom.clear(); restoreLook();
  if (levelGroup) levelGroup.visible = true;
}

// ------------------------------------------------------------------ test/hata ayıklama kancası (oyuncuya görünmez)
window.__lbm = {
  start: (n) => { save.unlocked = Math.max(save.unlocked, n); startLevel(n); },
  tap: (id) => doTap(id),
  game: () => game,
  save: () => save,
  idle: () => chain,
  solve: () => solve(game.L, game.st, game.taps),
  prepare,
  meta,
  analytics,
  setNow: (fn) => { clockNow = fn; },
  lockedVisible: () => (view ? view.lockSprites.filter((x) => x.visible).length : -1),
  stopAd: () => openStopAd(),
  fastAds: () => { meta.adSeconds = 0.3; },
};

// ------------------------------------------------------------------ başlat
setSound(save.settings.sound);
setVibration(save.settings.vibration);
applyQuality();
refreshCoins();
showScreen('title');
requestAnimationFrame(frame);
