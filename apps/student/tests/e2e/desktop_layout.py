"""Desktop (1440x900) functional smoke: sidebar nav, purchase flow, dialog, educator header action, player panel, auth split."""
import sys, asyncio
from playwright.async_api import async_playwright

async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch()
    pg = await b.new_page(viewport={'width': 1440, 'height': 900})
    errs = []
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.on('console', lambda m: errs.append('CONSOLE ' + m.text) if m.type == 'error' else None)
    u = sys.argv[1]; res = []
    def ok(c, n):
      line=('PASS ' if c else 'FAIL ') + n; res.append(line); print(line, flush=True)
    async def go(path, ms=2000):
      await pg.evaluate(f"history.pushState({{}},'', '{path}'); dispatchEvent(new PopStateEvent('popstate'))"); await pg.wait_for_timeout(ms)
    async def body(): return await pg.inner_text('body')
    async def signin(email):
      await go('/sign-in', 1500)
      await pg.get_by_label('Email or mobile number').locator('visible=true').last.fill(email)
      await pg.locator('input[aria-label="Password"]:visible').last.fill('demo123')
      await pg.get_by_text('Sign In', exact=True).locator('visible=true').last.click(); await pg.wait_for_timeout(2400)
    await pg.goto(u); await pg.wait_for_timeout(1500)
    await pg.evaluate("localStorage.clear(); localStorage.setItem('bodhin.onboarded','1')")
    await pg.goto(u); await pg.wait_for_timeout(2200)
    t = await body()
    ok('Discover what you can become.' in t, 'auth brand panel on desktop')
    await signin('arjun@demo.in')
    # sidebar present with labels, no bottom tab bar
    side = await pg.get_by_role('navigation').count()
    ok(side >= 1, 'desktop sidebar rendered')
    await pg.get_by_role('link', name='Explore').first.click(); await pg.wait_for_timeout(1800)
    t = await body()
    ok('Explore' in t and 'Featured Courses' in t, 'sidebar navigates to Explore')
    ok(await pg.get_by_label('Search courses', exact=False).count() >= 1, 'header search on desktop')
    # open a course from the grid
    await pg.get_by_role('button', name='Advanced SEO & Growth by Rajesh Kumar').first.click(); await pg.wait_for_timeout(2000)
    t = await body()
    ok('This course includes' in t and 'Enroll Now' in t, 'course page has buy card')
    box = await pg.get_by_text('This course includes').bounding_box()
    ok(box and box['x'] > 800, f'buy card is on the right column (x={box and int(box["x"])})')
    await pg.get_by_role('button', name='Enroll Now').first.click(); await pg.wait_for_timeout(2000)
    t = await body()
    ok('Pay with' in t, 'checkout opens')
    pay = await pg.get_by_role('button', name='Pay ₹', exact=False).first.bounding_box()
    ok(pay and pay['y'] < 700, f'pay button inline in summary column (y={pay and int(pay["y"])})')
    await pg.get_by_role('button', name='Pay ₹', exact=False).first.click(); await pg.wait_for_timeout(4500)
    t = await body()
    ok('enrolled' in t.lower() or 'success' in t.lower() or 'Happy learning' in t, 'desktop purchase succeeds')
    # player with outline panel
    await go('/learn/c_dm_ai', 2400)
    t = await body()
    ok('lessons done' in t and 'MODULE 1' in t, 'player shows course outline panel')
    ok('Mark done' in t and 'Next' in t, 'player nav inline')
    # dialog: speed sheet opens centered
    await pg.get_by_label('Playback speed', exact=False).first.click() if await pg.get_by_label('Playback speed', exact=False).count() else None
    # educator: header action + dialog
    await signin('rajesh@demo.in')
    await go('/educator/courses', 2200)
    btn = pg.get_by_role('button', name='New course').first
    bb = await btn.bounding_box()
    ok(bb and bb['y'] < 80, f'"New course" button in header (y={bb and int(bb["y"])})')
    await go('/edu/subscription', 2400)
    await pg.get_by_role('button', name='Add', exact=True).first.click(); await pg.wait_for_timeout(1200)
    dlg = await pg.get_by_text('Add student block').bounding_box()
    ok(dlg and dlg['y'] < 300 and 300 < dlg['x'] < 900, f'add-on opens as a dialog, not a bottom sheet (x={dlg and int(dlg["x"])}, y={dlg and int(dlg["y"])})')
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(400)
    if await pg.get_by_text('Add student block').count():
      await pg.get_by_role('button', name='Close').last.evaluate('e=>e.click()'); await pg.wait_for_timeout(800)
    print('switch elements:', await pg.get_by_text('Switch to learning').count(), await pg.get_by_label('Switch to learning').count(), flush=True)
    # switch area from sidebar
    await pg.get_by_label('Switch to learning').first.click(); await pg.wait_for_timeout(2000)
    t = await body()
    ok('Hello, Rajesh' in t or 'LEARNING' in t, 'sidebar switch to learning works')
    pass
    print('ERRORS', [e for e in errs if 'favicon' not in e][:8])
    await b.close()
asyncio.run(main())
