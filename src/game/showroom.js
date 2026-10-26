// 3D otopark vitrini: sahip olunan otobüsler, park yeri sayısı, tema ve dekor görsel olarak burada kurulur.
// Bulmaca park alanından AYRI bir sistemdir (yalnızca sergileme/koleksiyon).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { makeBus } from './models.js';
import { SKINS } from '../core/catalog.js';

const COLS = 3, CELL_X = 2.45, CELL_Z = 1.6;

export const THEME_LOOK = {
  day: { bg: 0x7fb6ff, fog: 0xa9cdf5, sun: 2.3, hemi: 0.6, ground: 0x2a303d, env: 0.55 },
  night: { bg: 0x0d1638, fog: 0x101a42, sun: 0.7, hemi: 0.4, ground: 0x1a2030, env: 0.3 },
  rain: { bg: 0x4b5668, fog: 0x5a6578, sun: 0.9, hemi: 0.45, ground: 0x1c2029, env: 0.3, rain: true },
  neon: { bg: 0x16053a, fog: 0x1e0850, sun: 0.6, hemi: 0.35, ground: 0x151129, env: 0.28, neon: true },
};

export function createShowroom(scene) {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);
  let content = null, rain = null, bounds = null;

  function clear() {
    if (!content) return;
    content.traverse((o) => {
      if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
      if (o.material && !o.material.userData.shared) [].concat(o.material).forEach((m) => m.dispose());
    });
    group.remove(content);
    content = null; rain = null;
  }

  function slotPos(i, rows) {
    const c = i % COLS, r = Math.floor(i / COLS);
    return new THREE.Vector3((c - (COLS - 1) / 2) * CELL_X, 0, (r - (rows - 1) / 2) * CELL_Z);
  }

  /** state: { slots, theme, decor[], owned[], skin } */
  function build(state) {
    clear();
    content = new THREE.Group();
    const look = THEME_LOOK[state.theme] || THEME_LOOK.day;
    const rows = Math.ceil(state.slots / COLS);
    const W = COLS * CELL_X + 0.6, D = rows * CELL_Z + 0.8;
    const gr = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: look.ground, roughness: look.rain ? 0.3 : 0.95 }));
    gr.rotation.x = -Math.PI / 2; gr.position.y = -0.15; gr.receiveShadow = true; content.add(gr);
    const floor = new THREE.Mesh(new RoundedBoxGeometry(W, 0.14, D, 3, 0.06), new THREE.MeshStandardMaterial({ color: state.decor.includes('vip_lane') ? 0x2b2340 : 0x353b49, roughness: look.rain ? 0.25 : 0.85, metalness: 0.1 }));
    floor.position.y = -0.07; floor.receiveShadow = true; content.add(floor);

    const owned = state.owned.slice();
    // vitrin sırası: seçili görünüm önce
    owned.sort((a, b) => (a === state.skin ? -1 : b === state.skin ? 1 : 0));
    const palette = [0, 1, 2, 3, 4, 5];
    for (let i = 0; i < state.slots; i++) {
      const p = slotPos(i, rows);
      if (state.decor.includes('platforms')) {
        const pl = new THREE.Mesh(new RoundedBoxGeometry(2.2, 0.12, 1.25, 2, 0.04), new THREE.MeshStandardMaterial({ color: 0x59616f, roughness: 0.4, metalness: 0.5 }));
        pl.position.set(p.x, 0.06, p.z); pl.receiveShadow = true; content.add(pl);
      }
      const line = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.006, 1.2), new THREE.MeshBasicMaterial({ color: look.neon ? 0xff4df0 : 0xffffff, transparent: true, opacity: 0.22 }));
      line.position.set(p.x, state.decor.includes('platforms') ? 0.125 : 0.005, p.z); content.add(line);
      const sk = owned[i];
      if (sk) {
        const bus = makeBus({ id: i, color: palette[i % palette.length], len: i % 3 === 2 ? 3 : 2, dir: 'E' }, { shadows: false, skin: sk });
        bus.position.set(p.x, state.decor.includes('platforms') ? 0.12 : 0, p.z);
        bus.rotation.y = -0.35; // hafif açı
        bus.userData.spin = true;
        content.add(bus);
      }
    }
    // dekor
    const mat = (c, e = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, emissive: c, emissiveIntensity: e });
    if (state.decor.includes('plants')) for (const sx of [-1, 1]) for (let r = 0; r < rows; r++) {
      const t = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 1), mat(0x2f8a4d)); t.position.set(sx * (W / 2 + 0.3), 0.45, (r - (rows - 1) / 2) * CELL_Z); content.add(t);
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.25, 10), mat(0x7a4a2a)); pot.position.set(t.position.x, 0.12, t.position.z); content.add(pot);
    }
    if (state.decor.includes('signs')) {
      const sg = new THREE.Mesh(new RoundedBoxGeometry(2.2, 0.5, 0.08, 2, 0.03), mat(0x1c4fa8, 0.5)); sg.position.set(0, 1.3, -D / 2 - 0.1); content.add(sg);
      for (const sx of [-0.9, 0.9]) { const po = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 8), mat(0x888d99)); po.position.set(sx, 0.55, -D / 2 - 0.1); content.add(po); }
    }
    if (state.decor.includes('neon_lights')) {
      for (const [x, z, w, d] of [[0, -D / 2 + 0.02, W, 0.05], [0, D / 2 - 0.02, W, 0.05], [-W / 2 + 0.02, 0, 0.05, D], [W / 2 - 0.02, 0, 0.05, D]]) {
        const n = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), new THREE.MeshBasicMaterial({ color: 0x35e0ff })); n.position.set(x, 0.1, z); content.add(n);
      }
    }
    if (state.decor.includes('terminal')) {
      const tb = new THREE.Mesh(new RoundedBoxGeometry(W * 0.8, 1.2, 0.9, 3, 0.08), new THREE.MeshPhysicalMaterial({ color: 0x9fb4c9, metalness: 0.6, roughness: 0.2 }));
      tb.position.set(0, 0.6, -D / 2 - 1.1); content.add(tb);
      const gl = new THREE.Mesh(new THREE.BoxGeometry(W * 0.72, 0.5, 0.02), mat(0x66d9ff, 0.6)); gl.position.set(0, 0.7, -D / 2 - 0.64); content.add(gl);
    }
    if (state.decor.includes('collection_room')) {
      const cr = new THREE.Mesh(new RoundedBoxGeometry(1.4, 1.5, 1.4, 3, 0.08), mat(0x4a3a6b, 0.15)); cr.position.set(W / 2 + 1.1, 0.75, -D / 2 - 0.6); content.add(cr);
    }
    if (look.neon) {
      for (let k = 0; k < 6; k++) { const n = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.4, 0.08), new THREE.MeshBasicMaterial({ color: k % 2 ? 0xff4df0 : 0x35e0ff })); n.position.set(-W / 2 - 0.4 + k * ((W + 0.8) / 5), 1.2, -D / 2 - 0.5); content.add(n); }
    }
    // kilitli sonraki yer
    if (state.slots < 9) {
      const p = slotPos(state.slots, Math.ceil((state.slots + 1) / COLS));
      void p; // bilgi arayüzde (sonraki yer fiyatı) gösterilir
    }
    if (look.rain) {
      const n = 260, pos = new Float32Array(n * 6);
      for (let i = 0; i < n; i++) { const x = (Math.random() - 0.5) * 14, y = Math.random() * 7, z = (Math.random() - 0.5) * 9; pos.set([x, y, z, x - 0.04, y - 0.35, z], i * 6); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xbcd4ff, transparent: true, opacity: 0.55 }));
      content.add(rain);
    }
    group.add(content);
    bounds = { w: W + 2.4, d: D + 3 };
    return look;
  }

  /** Alttaki panel ekranın bottomFrac kadarını kapattığı için sahne üst kısma kaydırılır (görüş ofseti). */
  function fitCamera(camera, aspect, bottomFrac = 0.48) {
    if (!bounds) return;
    const pitch = THREE.MathUtils.degToRad(50);
    const dir = new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch));
    const vh = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const usable = 1 - bottomFrac; // sahne için kullanılabilir yükseklik oranı
    const dist = Math.max((bounds.d + 1.5) / (vh * usable), bounds.w / (vh * aspect), 6);
    const target = new THREE.Vector3(0, 0, 0);
    camera.position.copy(target).addScaledVector(dir, dist);
    camera.lookAt(target);
    const H = 1000, Wd = Math.round(H * aspect);
    camera.setViewOffset(Wd, H, 0, Math.round(H * bottomFrac * 0.5), Wd, H);
    camera.updateProjectionMatrix();
  }

  function tick(t) {
    if (!group.visible || !content) return;
    content.children.forEach((c) => { if (c.userData.spin) c.rotation.y = -0.35 + Math.sin(t * 0.6 + c.id) * 0.12; });
    if (rain) {
      const a = rain.geometry.attributes.position;
      for (let i = 0; i < a.count; i += 2) { const dy = 0.16; a.setY(i, a.getY(i) - dy); a.setY(i + 1, a.getY(i + 1) - dy); if (a.getY(i + 1) < 0) { a.setY(i, 6.8 + 0.35); a.setY(i + 1, 6.8); } }
      a.needsUpdate = true;
    }
  }

  return { group, build, fitCamera, tick, show: () => (group.visible = true), hide: () => (group.visible = false), clear, SKINS };
}
