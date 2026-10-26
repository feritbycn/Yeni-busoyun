// Prosedürel 3D modeller: otobüsler, yolcular, çevre. Harici model dosyası yoktur (lisans sorunu yok).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { COLORS } from '../core/colors.js';
import { SKINS } from '../core/catalog.js';

// ------------------------------------------------------------ simge dokuları (renk körlüğü desteği)
const glyphCache = new Map();

function drawGlyph(ctx, kind, s) {
  const c = s / 2;
  const r = s * 0.32;
  ctx.beginPath();
  if (kind === 'circle') ctx.arc(c, c, r, 0, Math.PI * 2);
  else if (kind === 'square') ctx.rect(c - r, c - r, r * 2, r * 2);
  else if (kind === 'triangle') { ctx.moveTo(c, c - r * 1.1); ctx.lineTo(c + r * 1.1, c + r * 0.85); ctx.lineTo(c - r * 1.1, c + r * 0.85); ctx.closePath(); }
  else if (kind === 'diamond') { ctx.moveTo(c, c - r * 1.2); ctx.lineTo(c + r, c); ctx.lineTo(c, c + r * 1.2); ctx.lineTo(c - r, c); ctx.closePath(); }
  else if (kind === 'star') {
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI) / 5 - Math.PI / 2;
      const rr = i % 2 === 0 ? r * 1.15 : r * 0.5;
      ctx[i === 0 ? 'moveTo' : 'lineTo'](c + Math.cos(a) * rr, c + Math.sin(a) * rr);
    }
    ctx.closePath();
  } else { // plus
    const t = r * 0.42;
    ctx.rect(c - t, c - r, t * 2, r * 2);
    ctx.rect(c - r, c - t, r * 2, t * 2);
  }
  ctx.fill();
}

/** Beyaz simge + koyu kenar çizgisi, saydam zemin. */
export function glyphTexture(colorIdx) {
  if (glyphCache.has(colorIdx)) return glyphCache.get(colorIdx);
  const s = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d');
  ctx.lineWidth = 10;
  ctx.strokeStyle = 'rgba(10,14,24,0.9)';
  ctx.fillStyle = '#ffffff';
  // kenar: aynı şekli kalın çizgiyle çiz
  const kind = COLORS[colorIdx].glyph;
  ctx.save();
  ctx.beginPath();
  drawGlyph(ctx, kind, s);
  ctx.restore();
  ctx.fillStyle = 'rgba(10,14,24,0.9)';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  drawGlyph(ctx, kind, s);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  drawGlyph(ctx, kind, s);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  glyphCache.set(colorIdx, tex);
  return tex;
}

// ------------------------------------------------------------ sayaç etiketi (otobüs doluluk sayısı)
export function makeCountLabel(colorIdx) {
  const s = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(0.62, 0.62, 1);
  sp.renderOrder = 10;
  sp.userData.set = (n) => {
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, s, s);
    ctx.fillStyle = 'rgba(12,16,28,0.88)';
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, 52, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.strokeStyle = COLORS[colorIdx].css;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 64px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), s / 2, s / 2 + 3);
    tex.needsUpdate = true;
  };
  return sp;
}

// ------------------------------------------------------------ otobüs
const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x0d1a26, metalness: 0.85, roughness: 0.06, clearcoat: 1, envMapIntensity: 1.4 });
const rubberMat = new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.9 });
const rimMat = new THREE.MeshStandardMaterial({ color: 0xcfd6df, metalness: 1, roughness: 0.25 });
const trimMat = new THREE.MeshStandardMaterial({ color: 0x20242b, roughness: 0.6, metalness: 0.4 });
const headMat = new THREE.MeshStandardMaterial({ color: 0xfff6d0, emissive: 0xffe8a0, emissiveIntensity: 1.6 });
const tailMat = new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff1010, emissiveIntensity: 1.2 });
const arrowMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

const arrowGeo = (() => {
  const s = new THREE.Shape();
  s.moveTo(0.3, 0); s.lineTo(-0.02, 0.21); s.lineTo(-0.02, 0.085); s.lineTo(-0.3, 0.085);
  s.lineTo(-0.3, -0.085); s.lineTo(-0.02, -0.085); s.lineTo(-0.02, -0.21); s.closePath();
  const g = new THREE.ShapeGeometry(s);
  g.rotateX(-Math.PI / 2);
  return g;
})();
const wheelGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.13, 20).rotateX(Math.PI / 2);
const rimGeo = new THREE.CylinderGeometry(0.095, 0.095, 0.14, 14).rotateX(Math.PI / 2);

/**
 * Yerel ileri yönü +X olan otobüs. Uzunluk 2 -> şehir otobüsü (yüksek camlı), 3 -> uzun turizm otobüsü.
 * Dönen grup: userData.busId, userData.paints (vurgu için boya materyalleri)
 */
// Kozmetik görünüm malzemeleri (görünüm başına bir kez üretilir, paylaşılır). Oynanışı etkilemez.
const skinCache = new Map();
function skinMats(id) {
  const k = SKINS[id] || SKINS.classic;
  const key = SKINS[id] ? id : 'classic';
  if (!skinCache.has(key)) {
    const m = {
      trim: new THREE.MeshStandardMaterial({ color: k.trim, roughness: 0.6, metalness: 0.4 }),
      rim: new THREE.MeshStandardMaterial({ color: k.rim, metalness: 1, roughness: 0.25, emissive: key === 'electric' || key === 'aurora' ? k.rim : 0x000000, emissiveIntensity: 0.25 }),
      glass: new THREE.MeshPhysicalMaterial({ color: k.glass, metalness: 0.85, roughness: 0.06, clearcoat: 1, envMapIntensity: 1.4 }),
      head: new THREE.MeshStandardMaterial({ color: k.head, emissive: k.head, emissiveIntensity: 1.6 }),
    };
    Object.values(m).forEach((x) => (x.userData.shared = true));
    skinCache.set(key, m);
  }
  return skinCache.get(key);
}

export function makeBus(bus, { shadows = true, skin = 'classic' } = {}) {
  const g = new THREE.Group();
  const S = skinMats(skin);
  const long = bus.len >= 3;
  const L = bus.len - 0.14;
  const W = 0.8;
  const paint = new THREE.MeshPhysicalMaterial({
    color: COLORS[bus.color].hex, metalness: 0.55, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08,
    emissive: COLORS[bus.color].hex, emissiveIntensity: 0,
  });
  const add = (mesh, x, y, z, cast = true) => {
    mesh.position.set(x, y, z);
    mesh.castShadow = shadows && cast;
    g.add(mesh);
    return mesh;
  };

  add(new THREE.Mesh(new RoundedBoxGeometry(L, 0.5, W, 3, 0.1), paint), 0, 0.36, 0);
  // alt şerit (gövde altında koyu koruma)
  add(new THREE.Mesh(new RoundedBoxGeometry(L * 0.98, 0.1, W * 1.01, 2, 0.04), S.trim), 0, 0.17, 0, false);
  const cabinH = long ? 0.3 : 0.36;
  add(new THREE.Mesh(new RoundedBoxGeometry(L * 0.95, cabinH, W * 0.94, 3, 0.07), S.glass), 0, 0.61 + cabinH / 2 - 0.02, 0);
  const roofY = 0.61 + cabinH - 0.02 + cabinH * 0 + 0.035;
  add(new THREE.Mesh(new RoundedBoxGeometry(L * 0.98, 0.07, W * 0.97, 3, 0.03), paint), 0, roofY + 0.03, 0);
  // cam sütunları
  const pillars = long ? 5 : 3;
  for (let i = 0; i <= pillars; i++) {
    const x = -L * 0.45 + (L * 0.9 * i) / pillars;
    for (const sz of [-1, 1]) add(new THREE.Mesh(new THREE.BoxGeometry(0.035, cabinH, 0.02), paint), x, 0.59 + cabinH / 2, sz * W * 0.47, false);
  }
  // tamponlar, farlar
  add(new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.1, W * 0.96, 2, 0.03), S.trim), L / 2 + 0.005, 0.25, 0, false);
  add(new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.1, W * 0.96, 2, 0.03), S.trim), -L / 2 - 0.005, 0.25, 0, false);
  for (const sz of [-1, 1]) {
    add(new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.075, 0.15, 2, 0.02), S.head), L / 2 + 0.01, 0.4, sz * 0.26, false);
    add(new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.075, 0.15, 2, 0.02), tailMat), -L / 2 - 0.01, 0.4, sz * 0.26, false);
  }
  // tekerlekler
  const axles = long ? [-0.34, 0.12, 0.36] : [-0.3, 0.3];
  for (const ax of axles) for (const sz of [-1, 1]) {
    const w = new THREE.Mesh(wheelGeo, rubberMat);
    add(w, ax * L, 0.17, sz * (W / 2 - 0.02), false);
    add(new THREE.Mesh(rimGeo, S.rim), ax * L, 0.17, sz * (W / 2 - 0.015), false);
  }
  // çatı yön oku + renk simgesi
  const arrow = new THREE.Mesh(arrowGeo, arrowMat);
  arrow.position.set(L * 0.2, roofY + 0.075, 0);
  arrow.scale.setScalar(long ? 1.05 : 0.9);
  g.add(arrow);
  const glyph = new THREE.Mesh(
    new THREE.PlaneGeometry(0.4, 0.4).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: glyphTexture(bus.color), transparent: true }),
  );
  glyph.position.set(-L * 0.24, roofY + 0.078, 0);
  g.add(glyph);

  g.userData = { busId: bus.id, paints: [paint], bus };
  return g;
}

// ------------------------------------------------------------ yolcu
const skinMat = new THREE.MeshStandardMaterial({ color: 0xf0c8a0, roughness: 0.7 });
const bodyGeo = new THREE.CapsuleGeometry(0.15, 0.25, 4, 10);
const headGeo = new THREE.SphereGeometry(0.115, 14, 12);
const bodyMats = COLORS.map((c) => new THREE.MeshStandardMaterial({ color: c.hex, roughness: 0.55, metalness: 0.1 }));
const spriteMats = new Map();

export function makePassenger(colorIdx) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(bodyGeo, bodyMats[colorIdx]);
  body.position.y = 0.3;
  const head = new THREE.Mesh(headGeo, skinMat);
  head.position.y = 0.67;
  body.castShadow = true;
  g.add(body, head);
  if (!spriteMats.has(colorIdx)) spriteMats.set(colorIdx, new THREE.SpriteMaterial({ map: glyphTexture(colorIdx), transparent: true, depthTest: false }));
  const sp = new THREE.Sprite(spriteMats.get(colorIdx));
  sp.position.y = 1.0;
  sp.scale.set(0.3, 0.3, 1);
  sp.renderOrder = 9;
  g.add(sp);
  g.userData = { color: colorIdx, body };
  return g;
}

// ------------------------------------------------------------ çevre (bir kez kurulur)
function skyTexture() {
  const cv = document.createElement('canvas');
  cv.width = 8; cv.height = 256;
  const ctx = cv.getContext('2d');
  const gr = ctx.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#0d1b3a'); gr.addColorStop(0.55, '#2b4a7a'); gr.addColorStop(1, '#e9a56f');
  ctx.fillStyle = gr; ctx.fillRect(0, 0, 8, 256);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function windowsTexture(rows, cols) {
  const cv = document.createElement('canvas');
  cv.width = cols * 16; cv.height = rows * 16;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#1b2233'; ctx.fillRect(0, 0, cv.width, cv.height);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    ctx.fillStyle = Math.random() < 0.55 ? (Math.random() < 0.5 ? '#ffd98a' : '#9fd3ff') : '#2a3248';
    ctx.fillRect(c * 16 + 3, r * 16 + 3, 10, 10);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildWorld(scene, { shadows = true } = {}) {
  const world = new THREE.Group();
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(0x4a5f86, 28, 70);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x1f2430, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.13;
  ground.receiveShadow = shadows;
  world.add(ground);

  // arka plan binaları: iki sıra, kameranın üst kısmını dolduracak şekilde sık
  const rng = (() => { let s = 12345; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const tower = (x, z, bw, rows, cols) => {
    const bh = rows * 0.62;
    const tex = windowsTexture(rows, cols);
    const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bw), new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.8 }));
    m.position.set(x, bh / 2 - 0.13, z);
    world.add(m);
  };
  for (let i = 0; i < 11; i++) tower(-15 + i * 3, -8 - rng() * 2.5, 2.3 + rng() * 0.7, 4 + Math.floor(rng() * 6), 3 + Math.floor(rng() * 2));
  for (let i = 0; i < 9; i++) tower(-17 + i * 4.2, -17 - rng() * 4, 3 + rng(), 9 + Math.floor(rng() * 8), 4);
  scene.add(world);
  return world;
}

/** Park alanının iki yanına ağaç ve sokak lambası dizer (seviye genişliğine göre). */
export function makeDecor(halfW, zMin, zMax, { shadows = true } = {}) {
  const g = new THREE.Group();
  const trunkM = new THREE.MeshStandardMaterial({ color: 0x4b3424, roughness: 1 });
  const leafM = new THREE.MeshStandardMaterial({ color: 0x2f7d46, roughness: 0.9 });
  const lampM = new THREE.MeshStandardMaterial({ color: 0x2a2f3a, metalness: 0.6, roughness: 0.4 });
  const bulbM = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffd98a, emissiveIntensity: 2.2 });
  let i = 0;
  for (let z = zMin; z <= zMax; z += 3.6, i++) {
    for (const side of [-1, 1]) {
      if ((i + (side > 0 ? 1 : 0)) % 2 === 0) {
        const x = side * (halfW + 0.55);
        const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.7, 8), trunkM);
        tr.position.set(x, 0.22, z); tr.castShadow = shadows;
        const lf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), leafM);
        lf.position.set(x, 0.92, z); lf.castShadow = shadows;
        g.add(tr, lf);
      } else {
        const x = side * (halfW + 0.45);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.9, 8), lampM);
        pole.position.set(x, 0.82, z);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), bulbM);
        bulb.position.set(x, 1.8, z);
        g.add(pole, bulb);
      }
    }
  }
  return g;
}
