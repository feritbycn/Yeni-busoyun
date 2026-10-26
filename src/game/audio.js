// Sentezlenmiş ses efektleri (WebAudio). Harici ses dosyası kullanılmaz; gerçek ses paketi Aşama 3'te eklenecek.
let ctx = null;
let enabled = true;
let vibrationOn = true;

export function setSound(on) { enabled = on; }
export function setVibration(on) { vibrationOn = on; }
export function vibrate(ms) {
  if (vibrationOn && navigator.vibrate) { try { navigator.vibrate(ms); } catch { /* yoksay */ } }
}

function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, dur, { type = 'sine', vol = 0.12, to = null, delay = 0 } = {}) {
  if (!enabled) return;
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(dur, { vol = 0.08, freq = 400, delay = 0 } = {}) {
  if (!enabled) return;
  const c = ac();
  if (!c) return;
  const n = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(c.destination);
  src.start(c.currentTime + delay);
}

export const sfx = {
  click: () => tone(520, 0.06, { type: 'triangle', vol: 0.08 }),
  go: () => { tone(90, 0.45, { type: 'sawtooth', vol: 0.06, to: 190 }); noise(0.4, { vol: 0.05, freq: 700 }); },
  bump: () => { tone(120, 0.14, { type: 'square', vol: 0.07, to: 70 }); },
  park: () => { noise(0.25, { vol: 0.06, freq: 900 }); tone(300, 0.12, { type: 'triangle', vol: 0.07, to: 220 }); },
  board: () => tone(700 + Math.random() * 160, 0.07, { type: 'sine', vol: 0.07 }),
  wait: () => tone(360, 0.06, { type: 'sine', vol: 0.05 }),
  depart: () => { tone(330, 0.12, { type: 'square', vol: 0.05 }); tone(440, 0.2, { type: 'square', vol: 0.05, delay: 0.1 }); },
  hint: () => { tone(660, 0.12, { vol: 0.08 }); tone(880, 0.16, { vol: 0.08, delay: 0.1 }); },
  undo: () => tone(440, 0.18, { type: 'triangle', vol: 0.08, to: 260 }),
  win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.28, { type: 'triangle', vol: 0.1, delay: i * 0.11 })),
  lose: () => [330, 262, 196].forEach((f, i) => tone(f, 0.3, { type: 'sawtooth', vol: 0.06, delay: i * 0.14 })),
  coin: () => { tone(988, 0.08, { type: 'square', vol: 0.05 }); tone(1319, 0.2, { type: 'square', vol: 0.05, delay: 0.07 }); },
};
