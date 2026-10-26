"""Tarayıcı uçtan uca duman testi (Playwright + Chromium, yazılımsal WebGL ile de çalışır).

Kullanım:  python3 tools/e2e_play.py [ekran_goruntusu_klasoru]
Önkoşul:   npm run build ; pip install playwright ; playwright install chromium

Doğruladığı akışlar: menü -> seviye başlat -> hatalı dokunuş -> ipucu -> geri al -> çözümü oyna -> kazanma ekranı ->
ödül/kayıt -> sayfa yenileme sonrası ilerleme -> kaybetme ekranı -> seviye listesi -> ayarlar.
Sonuçları 'TAMAM'/'HATA' olarak yazar; herhangi bir HATA varsa çıkış kodu 1 olur.
"""
import asyncio, json, os, sys, pathlib
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'docs' / 'screenshots'
OUT.mkdir(parents=True, exist_ok=True)
results = []


def check(name, cond, extra=''):
    results.append((name, bool(cond)))
    print(('TAMAM ' if cond else 'HATA  ') + name + (f'  [{extra}]' if extra else ''), flush=True)


async def shot(page, name):
    await page.screenshot(path=str(OUT / name), timeout=120000)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=1.5, has_touch=True, is_mobile=True)
        page = await ctx.new_page()
        errors = []
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: errors.append(str(e)))
        await page.goto((ROOT / 'index.html').as_uri())
        await page.wait_for_timeout(800)
        check('Ana menü görünür', await page.is_visible('#screen-title'))
        await page.click('#btn-play')
        await page.wait_for_timeout(2500)
        check('Oyna -> HUD görünür, menü gizli', await page.is_visible('#hud') and not await page.is_visible('#screen-title'))

        # --- 5. seviye: hatalı dokunuş, ipucu, geri al
        await page.evaluate("window.__lbm.start(5)")
        await page.wait_for_timeout(2500)
        blocked = await page.evaluate("""(() => { const g = window.__lbm.game(); const P = window.__lbm.prepare(g.L);
          for (let i = 0; i < g.L.buses.length; i++) if (P.blk[i] & ~g.st.mask) return i; return -1; })()""")
        if blocked >= 0:
            await page.evaluate(f"window.__lbm.tap({blocked})")
            await page.wait_for_timeout(500)
            r = await page.evaluate("({m: window.__lbm.game().mistakes, s: window.__lbm.game().starsNow(), mask: window.__lbm.game().st.mask})")
            check('Yolu kapalı otobüs hareket etmedi ve hata sayıldı', r['m'] == 1 and r['mask'] == 0, r)
            check('Hata sonrası yıldız önizlemesi 2', r['s'] == 2)
        else:
            check('(5. seviyede kapalı otobüs yok, atlandı)', True)
        await page.click('#tool-hint')
        await page.wait_for_timeout(300)
        h = await page.evaluate("window.__lbm.game().hintsUsed")
        check('İpucu hakkı harcandı', h == 1, h)
        sol = await page.evaluate("window.__lbm.solve()")
        await page.evaluate(f"window.__lbm.tap({sol[0]})")
        await page.wait_for_timeout(300)
        await page.evaluate(f"window.__lbm.tap({sol[1]})")
        await page.wait_for_timeout(3500)
        await shot(page, 'oyun_ici.png')
        await page.click('#tool-undo')
        await page.wait_for_timeout(500)
        u = await page.evaluate("({u: window.__lbm.game().undosUsed, mask: window.__lbm.game().st.mask})")
        check('Geri al son hamleyi geri aldı', u['u'] == 1 and bin(u['mask']).count('1') == 1, u)

        # --- çözümü baştan oyna -> kazanma
        await page.evaluate("window.__lbm.start(5)")
        await page.wait_for_timeout(2000)
        sol = await page.evaluate("window.__lbm.solve()")
        for m in sol:
            await page.evaluate(f"window.__lbm.tap({m})")
            await page.wait_for_timeout(200)
        await page.evaluate("window.__lbm.idle()")
        await page.wait_for_timeout(3500)
        st = await page.evaluate("({s: window.__lbm.game().status, stars: window.__lbm.game().stars(), coins: window.__lbm.save().coins})")
        check('Çözüm oynanınca seviye kazanıldı (3 yıldız)', st['s'] == 'won' and st['stars'] == 3, st)
        check('Kazanma ekranı açıldı', await page.is_visible('#modal-win'))
        check('Ödül kaydedildi', st['coins'] > 0)
        await shot(page, 'kazanma.png')
        coins_before = st['coins']

        # --- sayfa yenile: ilerleme korunur
        await page.reload()
        await page.wait_for_timeout(1000)
        sv = await page.evaluate("({coins: window.__lbm.save().coins, unlocked: window.__lbm.save().unlocked, st: window.__lbm.save().levels[5]})")
        check('Yenilemeden sonra para ve açılan seviye korundu', sv['coins'] == coins_before and sv['unlocked'] >= 6 and sv['st']['stars'] == 3, sv)

        # --- aynı seviyeyi tekrar kazan: ek para verilmemeli
        await page.evaluate("window.__lbm.start(5)")
        await page.wait_for_timeout(2000)
        sol = await page.evaluate("window.__lbm.solve()")
        for m in sol:
            await page.evaluate(f"window.__lbm.tap({m})")
            await page.wait_for_timeout(200)
        await page.evaluate("window.__lbm.idle()")
        await page.wait_for_timeout(3500)
        c2 = await page.evaluate("window.__lbm.save().coins")
        check('Tekrar oynamada para artmadı (farm engeli)', c2 == coins_before, f'{coins_before}->{c2}')

        # --- kaybetme: rastgele geçerli hamlelerle kilitlenene dek oyna (zor seviye)
        await page.evaluate("window.__lbm.start(60)")
        await page.wait_for_timeout(2000)
        lost = await page.evaluate("""(() => { const g = window.__lbm.game(); const P = window.__lbm.prepare(g.L);
          for (let guard = 0; guard < 40 && g.status === 'playing'; guard++) {
            const mv = []; for (let i = 0; i < g.L.buses.length; i++) if (!(g.st.mask & (1 << i)) && !(P.blk[i] & ~g.st.mask)) mv.push(i);
            if (!mv.length) break; window.__lbm.tap(mv[Math.floor(Math.random() * mv.length)]); }
          return g.status; })()""")
        await page.evaluate("window.__lbm.idle()")
        await page.wait_for_timeout(4000)
        if lost == 'lost':
            check('Kilitlenince kaybetme ekranı açıldı', await page.is_visible('#modal-lose'))
            await shot(page, 'kaybetme.png')
        else:
            check('(rastgele oyun kazandı/devam etti; kaybetme ekranı bu koşuda denenmedi)', True, lost)

        # --- seviye listesi ve ayarlar
        await page.evaluate("document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'))")
        await page.evaluate("document.getElementById('screen-title').classList.add('hidden')")
        await page.reload()
        await page.wait_for_timeout(800)
        await page.click('#btn-levels')
        await page.wait_for_timeout(500)
        n_lv = await page.evaluate("document.querySelectorAll('#level-grid .lv').length")
        n_lock = await page.evaluate("document.querySelectorAll('#level-grid .lv.locked').length")
        check('Seviye haritasında 100 seviye, kilitliler işaretli', n_lv == 100 and n_lock > 0, f'{n_lv} seviye, {n_lock} kilitli')
        await shot(page, 'seviyeler.png')
        await page.click('#screen-levels [data-back]')
        await page.click('#btn-settings')
        await page.wait_for_timeout(300)
        await page.click('#set-quality button[data-q=low]')
        q = await page.evaluate("window.__lbm.save().settings.quality")
        check('Ayar değişikliği kaydedildi (kalite=low)', q == 'low')
        await shot(page, 'ayarlar.png')

        check('Konsolda hata yok', not errors, json.dumps(errors, ensure_ascii=False)[:300])
        await b.close()
    bad = [n for n, ok in results if not ok]
    print(f"\n{len(results) - len(bad)}/{len(results)} kontrol başarılı")
    sys.exit(1 if bad else 0)


asyncio.run(main())
