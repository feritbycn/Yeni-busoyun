// Capacitor için www/ klasörünü hazırlar: index.html + style.css + dist/bundle.js (önce npm run build çalışmış olmalı).
import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs';
if (!existsSync('dist/bundle.js')) throw new Error('dist/bundle.js yok: önce "npm run build"');
rmSync('www', { recursive: true, force: true });
mkdirSync('www/dist', { recursive: true });
cpSync('index.html', 'www/index.html');
cpSync('style.css', 'www/style.css');
cpSync('dist/bundle.js', 'www/dist/bundle.js');
console.log('www/ hazır');
