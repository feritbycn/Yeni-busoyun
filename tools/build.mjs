// dist/bundle.js üretir (tek dosya, klasik script): file:// ile açılabilir, Capacitor/Android WebView'da çalışır.
import { build } from 'esbuild';
import { statSync } from 'node:fs';
await build({
  entryPoints: ['src/game/main.js'],
  bundle: true,
  format: 'iife',
  minify: true,
  target: ['es2020', 'chrome90', 'safari15'],
  outfile: 'dist/bundle.js',
  loader: { '.json': 'json' },
  legalComments: 'none',
  logLevel: 'info',
});
console.log(`dist/bundle.js: ${(statSync('dist/bundle.js').size / 1024).toFixed(0)} KB`);
