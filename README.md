# LUXURY BUS MASTER 3D

Mobil 3D otobüs bulmaca oyunu. **Sürüm 0.2** – Oynanabilir prototip + 100 seviye + ekonomi, otopark/garaj, görevler. Reklam ve Premium **yalnızca TEST modunda** (gerçek reklam/ödeme yok).
Ayrıntılı durum için: [`docs/DURUM_RAPORU.md`](docs/DURUM_RAPORU.md), eksikler için: [`docs/BILINEN_SORUNLAR.md`](docs/BILINEN_SORUNLAR.md).

## Nasıl oynanır
1. Izgaradaki bir otobüse dokun. Üstündeki ok yönünde gidip ızgaradan çıkar. Yolunda başka otobüs varsa **hareket etmez** (hata sayılır).
2. Çıkan otobüs **park alanına** girer. Alttaki **yolcu sırasının** başındaki yolcu, aynı renk ve simgedeki otobüse biner.
3. Uygun otobüs yoksa yolcu **bekleme alanına** geçer. Bekleme alanı doluysa sıra bekler.
4. Otobüs dolunca park alanından ayrılır. Tüm yolcular binince seviye biter.
5. Hamle kalmazsa (park alanı dolup kilitlenme / hamle limiti bitmesi) seviye kaybedilir.

Yıldızlar: 1★ tamamla · 2★ en çok 2 hata ve 1 ipucu · 3★ hatasız, ipuçsuz, ekstra park yeri kullanmadan.
Yardımcılar (seviye başına): Geri al ×3, İpucu ×3 (çözücü gerçek bir sonraki hamleyi bulur), +1 park yeri ×1.

## Hızlı başlangıç
Gereksinim: Node.js 20+ (Node 22 ile geliştirildi ve test edildi).

```bash
npm install          # three + esbuild
npm run levels       # data/levels.json üret (varsayılan 100 seviye, ~5 sn). Daha fazlası: node tools/build-levels.mjs 1000
npm test             # 42 otomatik test (motor, ekonomi, kayıt, 100 seviyenin çözülebilirliği, otopark, görev, reklam, premium)
python3 tools/e2e_play.py && python3 tools/e2e_meta.py   # tarayıcı testleri (pip install playwright)
npm run build        # dist/bundle.js üret (tek dosya)
```
Sonra `index.html` dosyasını bir tarayıcıda açın (file:// ile çalışır) ya da `python3 -m http.server` ile yayınlayın.
Telefon boyutunda test için tarayıcı geliştirici araçlarında mobil görünümü açın.

## Mimari
```
src/core/        Render'dan bağımsız saf JS (Node'da test edilir)
  engine.js        kurallar, durum, Game sınıfı (hamle/geri al/ipucu/yıldız)
  solver.js        çözülebilirlik kanıtı (DFS + hafıza), rastgele-oyuncu zorluk ölçümü
  economy.js       ödül hesabı, ilk-tamamlama / tekrar-ödül engeli
  save.js          sağlama toplamlı kayıt + yedek + sürüm doğrulama
  colors.js, rng.js
src/levels/generator.js   seviye üretimi (tohumlu, çözücüyle doğrulanır)
src/game/        three.js sahnesi, modeller (prosedürel), ses (WebAudio), arayüz akışı
data/levels.json   üretilmiş seviyeler (koddan bağımsız JSON)
tools/             build-levels.mjs, build.mjs (esbuild), e2e_play.py (tarayıcı duman testi)
tests/             node:test testleri
```
İstenen yönetici adları ile eşleşme: `LevelManager`/`PuzzleManager`/`BusController`/`ParkingManager`/`PassengerManager` işlevleri
`engine.js` (`Game`) içindedir; `EconomyManager`+`RewardManager` → `economy.js`; `SaveManager` → `save.js`; `AudioManager` → `audio.js`;
`UIManager` → `main.js` + `meta.js`; `AdManager` → `ads.js`; `PremiumManager` → `premium.js`; `AnalyticsManager` → `analytics.js`; otopark/garaj → `shop.js`, `catalog.js`; görevler → `quests.js`.
Gerçek reklam/ödeme **bağlı değildir**: `TestAdProvider` ve `TestBillingProvider` simülasyondur (bkz. `docs/BILINEN_SORUNLAR.md`).

### Seviye formatı (`data/levels.json`)
Her seviye: `id, w, h, buses[{id,color,x,y,len,dir,cap}], queue[renk...], bay, wait, moveLimit, rewards, stars, helpers, difficulty, metrics`.
`x,y` otobüsün sol-üst hücresi; `dir` N/S/E/W; `cap = len*2`. Yolcu sayısı renk başına toplam otobüs kapasitesine eşittir (`validateLevel` denetler).

### Seviye üretimi ve zorluk
`generateLevel(n)`: tohumlu adaylar üretir, çözücüyle **çözülebilirliği kanıtlar** (kanıtlanamayan aday atılır), rastgele oynayan
bir oyuncunun kazanma oranını ölçüp hedef zorluk eğrisine en yakın adayı seçer. Eğri sayısal olarak ayarlıdır;
**insan oyuncuyla denge testi yapılmadı** (bkz. bilinen sorunlar).

## Android APK (GitHub Actions ile)
Android projesi (`android/`, Capacitor 8) ve iş akışı (`.github/workflows/android.yml`) hazırdır. **APK bu ZIP'in içinde yoktur**;
GitHub depoya yüklediğinizde kendisi derler (bu geliştirme ortamında Android SDK olmadığı için APK burada üretilemedi ve cihazda denenmedi).

1. GitHub'da boş bir depo açın (ör. `luxury-bus-master`).
2. ZIP'i açın, klasörün içinde:
   ```bash
   git init -b main && git add . && git commit -m "Luxury Bus Master 3D v0.2"
   git remote add origin https://github.com/<kullanici>/luxury-bus-master.git
   git push -u origin main
   ```
   (Web arayüzünden "Add file → Upload files" ile de yüklenebilir; `.github` gizli klasörünü de eklemeyi unutmayın.)
3. Depoda **Actions → Android APK** sekmesine girin; iş ~5–10 dk sürer. Bitince hem çalıştırmanın **Artifacts → LuxuryBusMaster3D-apk-aab** bölümünden hem de depo ana sayfasındaki **Releases** bölümünden `LuxuryBusMaster3D-release.apk`, `-debug.apk` ve `-release.aab` dosyalarını indirin.
4. Telefonda "bilinmeyen kaynaklardan yükleme"yi açıp APK'yı kurun. AAB telefona kurulmaz; Play Console'a yüklenir.

**İmza:** Secrets (`KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`) tanımlı değilse her koşuda **geçici bir test anahtarı** üretilir; bu AAB Play Store için kalıcı güncelleme zinciri sağlamaz. Kendi anahtarınızı bir kez Secrets'a eklemeniz gerekir.

İş akışı sırası: `npm ci` → seviye üretimi (100 seviye) → 42 test → `esbuild paketi → `cap sync` → `gradlew assembleDebug` (JDK 21).
Testler başarısız olursa APK üretilmez.

Yerelde derlemek isterseniz (Android Studio/SDK + JDK 21 gerekir): `npm ci && npm run android:sync && cd android && ./gradlew assembleDebug`
→ `android/app/build/outputs/apk/debug/app-debug.apk`.

**Debug APK** yayına uygun değildir (debug anahtarıyla imzalıdır). Play Store için imzalı release gerekir; anahtar dosyalarını (`*.jks`) depoya **eklemeyin** (`.gitignore` engeller),
GitHub Secrets kullanın. Paket kimliği `com.luxurybus.master3d` (`capacitor.config.json`) örnektir; yayından önce kendi kimliğinizle değiştirin.
Reklam ve satın alma TEST modundadır; canlıya çıkmadan önce `window.__lbm` hata ayıklama kancasını da kaldırın.

## Lisans / varlıklar
Tüm 3D modeller kodla üretilir, ses efektleri WebAudio ile sentezlenir, harici telifli varlık yoktur. Üçüncü taraf: [three.js](https://threejs.org) (MIT).
Referans oyunlardan marka, görsel veya içerik kopyalanmamıştır; yalnızca "çıkış yolu açık araçları sırayla çıkar + renkli yolcuları eşleştir" tür mantığı kullanılmıştır.
