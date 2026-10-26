// Yerel analitik/hata günlüğü. Ağa HİÇBİR ŞEY GÖNDERMEZ; halka tampon olarak bellekte ve (isteğe bağlı) depoda tutulur.
export class Analytics {
  constructor(storage = null, max = 200) { this.storage = storage; this.max = max; this.buf = []; this.key = 'lbm3d.log'; this.load(); }
  load() { try { const r = this.storage && this.storage.getItem(this.key); if (r) this.buf = JSON.parse(r).slice(-this.max); } catch { this.buf = []; } }
  track(name, props = {}, t = Date.now()) {
    this.buf.push({ t, name, ...props });
    if (this.buf.length > this.max) this.buf.shift();
    return this;
  }
  error(err, t = Date.now()) { return this.track('error', { msg: String((err && err.message) || err).slice(0, 200) }, t); }
  flush() { try { this.storage && this.storage.setItem(this.key, JSON.stringify(this.buf)); } catch { /* depolama dolu */ } }
  export() { return JSON.stringify(this.buf); }
}
