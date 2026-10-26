# Durum raporu — v0.2 (Aşama 1–2 tamam, Aşama 4–5 test modunda)

Tarih: 2026-10-26. Tüm sayılar bu oturumda çalıştırılan komutlardan alınmıştır.

## Çalıştırılan testler
| Test | Sonuç |
|---|---|
| `npm test` (node:test; motor, çözücü, 100 seviyenin çözülebilirliği, ekonomi, kayıt, **yeni:** göç, otopark/garaj, görev, günlük giriş, başarı, reklam, premium, analitik) | 42 / 42 geçti |
| `tools/e2e_play.py` (Aşama 1–2 tarayıcı akışı, 390×844, yazılımsal WebGL) | 15 / 15 geçti |
| `tools/e2e_meta.py` (otopark, garaj, görev, Premium TEST, ödüllü/ara reklam, ödül ikileme, kalıcılık) | 27 / 27 geçti |

## Aşama durumu
| Aşama | Durum |
|---|---|
| 1 Çalışan prototip | Tamam (tarayıcıda test edildi, cihazda değil) |
| 2 Seviye sistemi (100 seviye, yıldız, ödül) | Tamam; zorluk dengesi insan testi görmedi |
| 3 Lüks görseller | Kısmen: prosedürel modeller, ışık, 4 otopark teması, 7 görünüm. Hazır profesyonel model/ses yok |
| 4 Ekonomi ve ilerleme | Tamam (kristal yalnızca kazanılır): görevler, günlük giriş, başarılar, otopark (3→9 yer, tema, dekor), garaj |
| 5 Reklam ve Premium | **Yalnızca TEST modu.** Gerçek SDK/ödeme/sunucu doğrulaması yok (bkz. BILINEN_SORUNLAR) |
| 6 Test ve dağıtım | Kısmen: belgeler ve testler var; APK, cihaz testi, performans ölçümü yok |

## Bu sürümde eklenenler
- Kayıt v2 (v1'den göç eder, bozuk değerleri sınırlar).
- Merkezi katalog (`src/core/catalog.js`): tüm fiyat/limit/ödül değerleri tek yerde.
- Otopark vitrini (3D): park yeri sayısı, gündüz/gece/yağmur/neon teması, dekor, sahip olunan görünümler.
- Garaj: kozmetik görünümler (para, kristal, seviye veya Premium ile). Oynanışı etkilemez.
- Görevler: günlük 3 (+Premium'a 1), haftalık 2, 7 günlük giriş ödülü, başarı rozetleri.
- Reklam: ödüllü (2× ödül, +3 hamle, +1 ipucu, geçici park yeri, günlük para) ve seviyeler arası ara reklam; günlük/seviye limitli; **ödül yalnızca sağlayıcıdan "tamamlandı + benzersiz token" gelirse**; token tekrarı reddedilir; Premium'da ara reklam yok.
- Premium: aylık/yıllık/kozmetik paket; makbuz doğrulanmadan hak verilmez; geri yükleme; üyelik bitince kozmetikler kalır, üyelik hakları kapanır.
- Yerel analitik/hata günlüğü (ağa göndermez).

## Sonraki adımlar (öncelik sırasıyla)
1. Gerçek cihazda (Android) deneme ve FPS ölçümü; Capacitor ile APK.
2. İnsan oyuncu testiyle zorluk ve ekonomi dengesi.
3. Gerçek reklam SDK'sı ve Play Billing + sunucu doğrulaması (ürün kimlikleri gerekir).
4. Yarım kalan seviyeyi saklama, etkinlikler, ek otobüs modelleri, gerçek ses.
