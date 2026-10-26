# Bilinen sorunlar ve tamamlanmayan özellikler (v0.2)

## YAPILMADI
Aşağıdakiler bu sürümde **yoktur**; arayüzde çalışıyormuş gibi gösterilmez.

| Alan | Durum |
|---|---|
| Gerçek reklam SDK'sı (AdMob vb.) | Yok. `TestAdProvider` açıkça "TEST REKLAMI · simülasyon" yazar. Gerçek SDK aynı `isReady/show` arayüzünü uygulamalı; ödül doğrulaması için sunucu tarafı (SSV) önerilir. |
| Gerçek ödeme (Google Play Billing / StoreKit) ve sunucu doğrulaması | Yok. `TestBillingProvider` ödeme ALMAZ. `MONETIZATION.mode = 'live'` yapılırsa doğrulayıcı olmadığından **her satın alma reddedilir** (testle kanıtlı). Gerçek mağaza ürün kimlikleri/imzalama anahtarları sağlanmadı. |
| Satın alınabilir kristal paketi | Yok. Kristal yalnızca görev/başarı ile kazanılır (sunucu doğrulaması olmadan para karşılığı kaynak verilmemeli). |
| Bilet/enerji sistemi | Yok (gerekli görülmedi; oyuncuyu bekletmez). |
| Süreli temalı etkinlikler / Etkinlikler ekranı | Yok. Zaman anahtarı altyapısı (`timeutil.js`) var, sunucu saati yok. |
| Oyun içi mağaza ekranı (yardımcı satın alma) | Yok. Para yalnızca otopark/garaj harcamalarında kullanılır. |
| Ağ/bağlantı hatası ekranları | Oyun tamamen çevrimdışı olduğundan yok. Yalnızca satın alma başarısızlığında "Tekrar dene" vardır. |
| Premium profil çerçevesi, özel animasyonlar, premium etkinlikleri | Yok. Premium'da yalnızca: zorunlu reklam yok, 2 özel görünüm, Neon tema, ek günlük görev, ⭐ rozeti. |
| Kişiselleştirmede çıkartma, kilit açma animasyonu, kullanıcı boya seçimi | Yok. Görünümler hazır paketlerdir (şerit, jant, cam tonu, far). |
| Bulmaca ekranında tema | Temalar (gece/yağmur/neon) yalnızca **otopark vitrininde** uygulanır; bulmaca sahnesi tek temadır. |
| Otobüs modelleri | Yalnızca 2 prosedürel gövde (len 2 şehir, len 3 uzun). Çift katlı, VIP, vb. ayrı geometri yok. |
| Çıkış animasyonu cilası | Çıkan otobüs ızgara kenarında küçülüp park yerinde belirir. |
| Gerçek ses paketi | Sesler WebAudio ile sentezlenmiş basit tonlardır. |
| LOD, nesne havuzu | Uygulanmadı/ölçülmedi. |
| Yarım kalan seviyenin saklanması | Yalnızca ilerleme saklanır; seviye ortasında çıkılırsa seviye baştan başlar. |
| Hedef çeşitliliği | Yalnızca "tüm yolcuları taşı" (+ bazı seviyelerde hamle limiti). |
| 1000 seviye / 100 sonrası yeni mekanik | Araç hazır (`node tools/build-levels.mjs 1000`), ama test edilen veri **100 seviyedir**. |

## DOĞRULANMAMIŞ
- **Gerçek cihaz:** Hiçbir Android/iOS cihazda denenmedi (dokunma, titreşim, WebView, güvenli alan).
- **Performans:** 60 FPS **ölçülmedi**; test ortamında GPU yok (yazılımsal WebGL).
- **APK:** Üretilmedi. Ortamda Java ve Gradle var, Android SDK yok. Capacitor adımları README'de, denenmedi.
- **Zorluk ve ekonomi dengesi:** Fiyatlar (park yeri 500→3500, tema 800–1200, görünüm 900–1500 vb.) ve ödüller **insan testi olmadan** yazıldı. Örnek: 100 seviye boyunca kazanılan toplam paranın tüm otopark içeriğini ne zaman aldırdığı hesaplanmadı.
- **Ekran oranları:** Yalnızca 390×844 denendi.
- **Erişilebilirlik:** Ekran okuyucu, renk körlüğü testi yapılmadı (renkler simgeyle desteklenir).

## BİLİNEN SINIRLAMALAR / HATALAR
- **Hile koruması yok:** Kayıt istemci tarafında, sağlama toplamı yalnızca bozulmaya karşıdır. Kullanıcı kaydı değiştirip para/kristal/Premium ekleyebilir. Reklam token'ı ve test makbuzu da istemcide üretilir. Gerçek değer taşıyan her şey için sunucu doğrulaması şarttır.
- **Saat güvenliği:** Cihaz saati geri alınırsa (>5 dk) günlük giriş/görev/reklam ödülleri verilmez; ancak saati *ileri* alarak günlük sıfırlamalar tetiklenebilir. Çevrimdışı çözümü yoktur.
- **Test makbuzları** `localStorage`'da tutulur; "geri yükle" bunları okur. Uygulama verisi silinirse test satın alması da gider (gerçek mağazada sunucu/mağaza geri yükler).
- **Erken kayıp tespiti yok:** Oyun yalnızca hiç hamle kalmadığında kaybı ilan eder (Geri al/İpucu ile kurtarılır).
- **Seviye ≥ 64 çok zor olabilir** (rastgele bot %0–10 kazanır). 1–15. seviyeler çok kolay olabilir.
- **Debug kancası:** `window.__lbm` konsola açıktır (saat/reklam süresi değiştirebilir); mağazaya çıkmadan önce kaldırılmalıdır.
- **Reklam çocuk politikası:** `MONETIZATION.childDirected` bayrağı yalnızca yer tutucudur; gerçek SDK'da uygulanmalıdır.
- three.js `Clock` kullanımdan kalkma uyarısı, `PCFSoftShadowMap` uyarısı. Tek bundle ~730 KB.
- **Test kapsamı:** Çekirdek mantık node testleriyle; arayüz yalnızca Playwright duman testleriyle. Ses/animasyon sırası/titreşim için test yoktur.
