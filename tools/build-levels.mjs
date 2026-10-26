// Kullanım: node tools/build-levels.mjs [adet=100] [başlangıç=1]
// Seviyeleri üretir ve data/levels.json dosyasına yazar. Daha fazla seviye için adet artırılabilir (örn. 1000).
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateLevel } from '../src/levels/generator.js';

const count = Number(process.argv[2] || 100);
const start = Number(process.argv[3] || 1);
const levels = [];
const t0 = Date.now();
for (let n = start; n < start + count; n++) {
  levels.push(generateLevel(n));
  if (n % 20 === 0) console.log(`  ${n} seviye hazır (${((Date.now() - t0) / 1000).toFixed(1)} sn)`);
}
mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
writeFileSync(new URL('../data/levels.json', import.meta.url), JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), levels }));
console.log(`data/levels.json yazıldı: ${levels.length} seviye, ${((Date.now() - t0) / 1000).toFixed(1)} sn`);
