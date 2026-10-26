"""Aşama 4/5 tarayıcı testi: otopark, garaj, görevler, premium (TEST), ödüllü/ara reklam, ödül ikileme.
Kullanım: python3 tools/e2e_meta.py [ekran_goruntusu_klasoru]   (önce: npm run build)"""
import asyncio, sys, pathlib
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'docs' / 'screenshots'
OUT.mkdir(parents=True, exist_ok=True)
res = []

def check(name, cond, extra=''):
    res.append(bool(cond))
    print(('TAMAM ' if cond else 'HATA  ') + name + (f'  [{extra}]' if extra else ''), flush=True)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=1, has_touch=True, is_mobile=True)
        page = await ctx.new_page()
        errs = []
        page.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: errs.append(str(e)))
        await page.goto((ROOT / 'index.html').as_uri())
        await page.wait_for_timeout(800)
        ev = page.evaluate
        await ev("window.__lbm.fastAds()")
        S = "window.__lbm.save()"
        give = lambda c, k: ev(f"window.__lbm.meta.commit({{...{S}, coins: {S}.coins + {c}, crystals: {S}.crystals + {k}}}); window.__lbm.meta.render()")

        # --- otopark
        await give(6000, 0)
        await page.click('[data-open=parking]'); await page.wait_for_timeout(1200)
        check('Otopark paneli açıldı (vitrin modu)', await page.is_visible('#panel') and not await page.is_visible('#screen-title'))
        await page.click('[data-act=slot]'); await page.wait_for_timeout(300)
        r = await ev(f"({S}.parking.slots, {{slots: {S}.parking.slots, coins: {S}.coins}})")
        check('Park yeri satın alındı: 3->4, 500 para düştü', r['slots'] == 4 and r['coins'] == 5500, r)
        await page.click('[data-act="buy-theme:night"]'); await page.wait_for_timeout(200)
        await page.click('[data-act="use-theme:night"]'); await page.wait_for_timeout(1500)
        check('Gece teması seçildi', await ev(f"{S}.parking.theme") == 'night')
        await page.click('[data-act="buy-decor:plants"]'); await page.wait_for_timeout(300)
        await page.screenshot(path=str(OUT / 'otopark.png'), timeout=120000)
        await page.click('[data-act="buy-theme:neon"]', force=True) if False else None
        neon_disabled = await ev("document.querySelector('[data-act=\"buy-theme:neon\"]').disabled")
        check('Premium tema üye değilken kilitli', neon_disabled)
        # --- garaj
        await ev("window.__lbm.meta.close()"); await page.wait_for_timeout(300)
        await page.click('[data-open=garage]'); await page.wait_for_timeout(1000)
        vip_dis = await ev("document.querySelector('[data-act=\"acq-skin:vip_black\"]').disabled")
        check('Premium görünüm üye değilken kilitli', vip_dis)
        await give(0, 50)
        await page.click('[data-act="acq-skin:sunset"]'); await page.wait_for_timeout(300)
        await page.click('[data-act="use-skin:sunset"]'); await page.wait_for_timeout(1500)
        r = await ev(f"({{skin: {S}.garage.skin, c: {S}.crystals}})")
        check('Kristalle görünüm alındı ve seçildi', r['skin'] == 'sunset' and r['c'] == 10, r)
        await page.screenshot(path=str(OUT / 'garaj.png'), timeout=120000)
        await ev("window.__lbm.meta.close()")

        # --- günlük giriş + görev
        await page.click('[data-open=quests]'); await page.wait_for_timeout(500)
        before = await ev(f"{S}.coins")
        await page.click('[data-act=login]'); await page.wait_for_timeout(300)
        after = await ev(f"{S}.coins")
        check('Günlük giriş ödülü alındı (+100)', after - before == 100, f'{before}->{after}')
        dis = await ev("document.querySelector('[data-act=login]').disabled")
        check('Aynı gün ikinci kez alınamaz', dis)
        # reklam ile günlük bonus (3 kez, 4. reddedilir)
        coins0 = await ev(f"{S}.coins")
        for i in range(3):
            await page.click('[data-act=ad-coins]'); await page.wait_for_selector('#ad-done:not([disabled])', timeout=5000); await page.click('#ad-done'); await page.wait_for_timeout(300)
        coins1 = await ev(f"{S}.coins")
        check('3 ödüllü reklam = +300; sonra düğme kilitli', coins1 - coins0 == 300 and await ev("document.querySelector('[data-act=ad-coins]').disabled"), f'{coins0}->{coins1}')
        # reklam atlanırsa ödül yok
        await ev("window.__lbm.setNow(() => Date.now() + 86400000)")  # ertesi gün: limit sıfırlanır
        await ev("window.__lbm.meta.render()")
        c2 = await ev(f"{S}.coins")
        await page.click('[data-act=ad-coins]'); await page.wait_for_selector('#ad-skip'); await page.click('#ad-skip'); await page.wait_for_timeout(300)
        check('Reklam kapatılırsa ödül verilmez', await ev(f"{S}.coins") == c2)
        await page.screenshot(path=str(OUT / 'gorevler.png'), timeout=120000)
        await ev("window.__lbm.setNow(() => Date.now())")
        await ev("window.__lbm.meta.close()")

        # --- premium (TEST)
        await page.click('[data-open=shop]'); await page.wait_for_timeout(400)
        check('Mağazada TEST MODU uyarısı var', 'TEST MODU' in await ev("document.getElementById('panel-body').innerText"))
        await page.click('[data-act="buy:premium_monthly"]'); await page.wait_for_timeout(500)
        check('Test satın alması premium yaptı', await ev("window.__lbm.meta.premium()"))
        await page.screenshot(path=str(OUT / 'premium.png'), timeout=120000)
        await ev("window.__lbm.meta.close()")
        await page.click('[data-open=garage]'); await page.wait_for_timeout(500)
        await page.click('[data-act="acq-skin:vip_black"]'); await page.wait_for_timeout(300)
        check('Premium görünüm üyeyken edinildi', await ev(f"{S}.garage.owned.includes('vip_black')"))
        await ev("window.__lbm.meta.close()")
        # üyelik bitti: kozmetik kalır, premium durumu kapanır
        await ev(f"window.__lbm.meta.commit({{...{S}, premium: {{...{S}.premium, expiresAt: 1}}}})")
        check('Üyelik bitince premium kapanır, kozmetik kalır', not await ev("window.__lbm.meta.premium()") and await ev(f"{S}.garage.owned.includes('vip_black')"))

        # --- oyun içi: ödüllü reklamla ipucu / park yeri, ödül ikileme, ara reklam
        await ev("window.__lbm.start(18)"); await page.wait_for_timeout(2500)   # 18. seviyede hamle limiti
        await page.click('#tool-ad'); await page.wait_for_timeout(300)
        opts = await ev("document.querySelectorAll('#sheet-options button').length")
        check('Reklam seçenekleri açıldı (hamle limiti olan seviyede 3 seçenek)', opts == 3, opts)
        await page.click('#sheet-options button:nth-child(1)')
        await page.wait_for_selector('#ad-done:not([disabled])', timeout=5000); await page.click('#ad-done'); await page.wait_for_timeout(300)
        check('Reklamla +1 ipucu verildi', await ev("window.__lbm.game().bonusHints") == 1)
        await page.click('#tool-ad'); await page.click('#sheet-options button:nth-child(2)')
        await page.wait_for_selector('#ad-done:not([disabled])', timeout=5000); await page.click('#ad-done'); await page.wait_for_timeout(300)
        g = await ev("({adSlots: window.__lbm.game().adSlots, stars: window.__lbm.game().starsNow()})")
        check('Reklamla durak açıldı ve 3★ engellendi', g['adSlots'] == 1 and g['stars'] < 3, g)
        await page.click('#tool-ad'); await page.wait_for_timeout(200)
        check('Aynı seviyede aynı reklam ödülü ikinci kez kapalı', await ev("document.querySelector('#sheet-options button:nth-child(1)').disabled"))
        await page.click('#sheet-close')

        # --- kilitli duraklar ve kilitlenme kurtarma
        await ev("window.__lbm.start(30)"); await page.wait_for_timeout(2500)
        lv = await ev("({locked: window.__lbm.lockedVisible(), cap: window.__lbm.game().st.cap, stops: window.__lbm.game().L.stops})")
        check('Tüm duraklar görünür; kilitli olanlar reklam simgeli', lv['locked'] == lv['stops'] - lv['cap'] and lv['locked'] >= 2, lv)
        await ev("(window.__lbm.stopAd(), 0)"); await page.wait_for_selector('#ad-done:not([disabled])', timeout=5000); await page.click('#ad-done'); await page.wait_for_timeout(400)
        lv2 = await ev("({locked: window.__lbm.lockedVisible(), cap: window.__lbm.game().st.cap})")
        check('Kilitli durağa dokunma (reklam) bir durak açtı', lv2['cap'] == lv['cap'] + 1 and lv2['locked'] == lv['locked'] - 1, lv2)
        lost = await ev("""(async () => { for (let t = 0; t < 40; t++) { window.__lbm.start(30);
          const g = () => window.__lbm.game(); let guard = 0;
          while (g().status === 'playing' && guard++ < 60) { const P = window.__lbm.prepare(g().L); const ids = g().L.buses.map((_, i) => i).filter((i) => !(g().st.mask & (1 << i)) && !(P.blk[i] & ~g().st.mask));
            if (!ids.length) break; window.__lbm.tap(ids[Math.floor(Math.random() * ids.length)]); }
          if (g().status === 'lost') return true; } return false; })()""")
        check('Rastgele oyunla kilitlenme oluştu (test hazırlığı)', lost)
        if lost:
            await page.wait_for_selector('#modal-lose:not(.hidden)', timeout=15000)
            check('Kilitlenince "Yeni durak aç" düğmesi görünür', await page.is_visible('#lose-stop'))
            await page.click('#lose-stop'); await page.wait_for_selector('#ad-done:not([disabled])', timeout=5000); await page.click('#ad-done'); await page.wait_for_timeout(600)
            check('Reklamla durak açılınca seviye kurtarıldı, kayıp ekranı kapandı', await ev("window.__lbm.game().status") == 'playing' and not await page.is_visible('#modal-lose'))

        # kazan -> ödül ikileme
        await ev("window.__lbm.start(7)"); await page.wait_for_timeout(2500)
        await ev("""(async () => { const sol = window.__lbm.solve(); for (const id of sol) { window.__lbm.tap(id); await window.__lbm.idle(); } })()""")
        await page.wait_for_selector('#modal-win:not(.hidden)', timeout=60000)
        c0 = await ev(f"{S}.coins")
        vis = await page.is_visible('#win-double')
        check('Kazanma ekranında 2× ödül düğmesi (ilk tamamlama)', vis)
        if vis:
            await page.click('#win-double'); await page.wait_for_selector('#ad-done:not([disabled])', timeout=5000); await page.click('#ad-done'); await page.wait_for_timeout(400)
            c1 = await ev(f"{S}.coins")
            check('Ödül ikilendi', c1 > c0, f'{c0}->{c1}')
            check('İkileme düğmesi tekrar kullanılamaz', not await page.is_visible('#win-double'))
        qd = await ev(f"Object.keys({S}.quests.daily.progress).length")
        check('Görev ilerlemesi oyundan güncellendi', qd >= 1, qd)
        await page.screenshot(path=str(OUT / 'kazanma2.png'), timeout=120000)

        # ara reklam: premium değilken, 4 seviye sonrası, geçiş sırasında
        await ev(f"window.__lbm.meta.commit({{...{S}, premium: null, ads: {{...{S}.ads, levelsSince: 4, lastInterstitialAt: 0}}}})")
        await page.click('#win-next')
        await page.wait_for_selector('#modal-ad:not(.hidden)', timeout=5000)
        check('Ara reklam seviyeler arasında gösterildi (zorunlu: atla yok)', not await page.is_visible('#ad-skip'))
        await page.wait_for_selector('#ad-done:not([disabled])', timeout=5000); await page.click('#ad-done'); await page.wait_for_timeout(1500)
        check('Reklamdan sonra sonraki seviye başladı', await ev("window.__lbm.game().L.id") == 8)
        # premium iken gösterilmez
        await ev(f"window.__lbm.meta.commit({{...{S}, ads: {{...{S}.ads, levelsSince: 9, lastInterstitialAt: 0}}}})")
        due = await ev(f"window.__lbm.meta.ads.interstitialDue({S}, Date.now(), true, 20)")
        check('Premium üyede ara reklam gösterilmez', due is False)

        # --- profil + kayıt kalıcılığı
        await ev("window.__lbm.start(1)"); await ev("document.getElementById('pause-menu').click()")
        await page.click('[data-open=profile]'); await page.wait_for_timeout(400)
        await page.screenshot(path=str(OUT / 'profil.png'), timeout=120000)
        await ev("window.__lbm.meta.close()")
        snap = await ev(f"({{slots: {S}.parking.slots, skin: {S}.garage.skin, owned: {S}.garage.owned.length}})")
        await page.reload(); await page.wait_for_timeout(800)
        snap2 = await ev(f"({{slots: {S}.parking.slots, skin: {S}.garage.skin, owned: {S}.garage.owned.length}})")
        check('Yenilemeden sonra otopark/garaj korundu', snap == snap2 and snap['slots'] == 4, snap2)
        check('Konsolda hata yok', not errs, errs[:3])
        await b.close()
    ok = sum(res); print(f'\n{ok}/{len(res)} kontrol başarılı'); sys.exit(0 if ok == len(res) else 1)

asyncio.run(main())
