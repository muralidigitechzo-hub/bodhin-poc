import sys, asyncio, json
from playwright.async_api import async_playwright
KEY='bodhin.mockdb.v26'
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch()
    pg=await b.new_page(viewport={'width':390,'height':844},has_touch=True,is_mobile=True)
    errs=[]
    pg.on('pageerror',lambda e: errs.append(str(e)))
    pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
    u=sys.argv[1]
    res=[]
    def ok(c,n): res.append(('PASS' if c else 'FAIL')+' '+n)
    async def go(path):
      await pg.evaluate(f"history.pushState({{}},'', '{path}'); dispatchEvent(new PopStateEvent('popstate'))"); await pg.wait_for_timeout(1500)
    await pg.goto(u); await pg.wait_for_timeout(1500)
    await pg.evaluate("localStorage.clear();localStorage.setItem('bodhin.onboarded','1')")
    await pg.goto(u); await pg.wait_for_timeout(2200)
    await pg.get_by_label('Email or mobile number').fill('arjun@demo.in')
    await pg.get_by_label('Password').first.fill('demo123')
    await pg.get_by_text('Sign In',exact=True).last.click(); await pg.wait_for_timeout(1800)
    # 1. Bodhin promo on a tutor course → rejected
    await go('/checkout/c_seo_growth')
    body=await pg.inner_text('body'); ok('Checkout' in body, 'checkout opens')
    ok('Demo: BODHIN10' not in body, 'no Bodhin hint on tutor course')
    await pg.get_by_label('Have a coupon?').fill('BODHIN10')
    await pg.get_by_role('button',name='Apply').last.evaluate('e=>e.click()'); await pg.wait_for_timeout(500)
    body=await pg.inner_text('body'); ok('only valid on Bodhin' in body, 'BODHIN10 rejected on tutor course')
    await pg.screenshot(path='h-1.png')
    # 2. Bodhin course → promo works
    await pg.goto(u); await pg.wait_for_timeout(2200)
    await go('/checkout/c_career')
    body=await pg.inner_text('body'); ok('Demo: BODHIN10' in body, 'hint shown on Bodhin course')
    await pg.get_by_label('Have a coupon?').fill('BODHIN10')
    await pg.get_by_role('button',name='Apply').last.evaluate('e=>e.click()'); await pg.wait_for_timeout(500)
    body=await pg.inner_text('body'); ok('BODHIN10 applied' in body, 'BODHIN10 works on Bodhin course')
    await go('/notifications'); await pg.wait_for_timeout(800)
    for name in ['Mark all read','Mark all as read']:
      try:
        await pg.get_by_role('button',name=name,exact=False).first.evaluate('e=>e.click()',timeout=1500); break
      except Exception: pass
    await pg.wait_for_timeout(500)
    print('KEYS', await pg.evaluate("Object.keys(localStorage)"))
    # 3. Rajesh at student limit, Arjun not yet his student → banner + disabled pay
    await pg.evaluate(f"""(()=>{{const d=JSON.parse(localStorage.getItem('{KEY}'));const raj=['c_dm_ai','c_seo_growth','c_meta_ads','c_ga4'];
      d.usage.t_rajesh.activeStudents=1500; d.enrollments=d.enrollments.filter(e=>!(e.userId==='u_arjun'&&raj.includes(e.courseId)));
      localStorage.setItem('{KEY}',JSON.stringify(d));}})()""")
    await pg.goto(u); await pg.wait_for_timeout(2500)
    await go('/checkout/c_seo_growth')
    body=await pg.inner_text('body'); ok('taking new enrolments' in body, 'limit banner shown before paying')
    await pg.screenshot(path='h-2.png'); print('BODY', body[-600:].replace(chr(10),' | '))
    dis=await pg.evaluate("(()=>{const b=[...document.querySelectorAll('[role=button],button')].filter(x=>/Pay ₹/.test(x.textContent||''));return b.map(x=>[x.getAttribute('aria-disabled'),x.disabled,x.textContent].join(':'))})()")
    dis='true' if any(x.startswith('true') for x in dis) else str(dis)
    ok(dis=='true', f'pay disabled at limit ({dis})')
    await pg.screenshot(path='h-2.png')
    for r in res: print(r)
    print('ERRORS', [e for e in errs if 'favicon' not in e][:5])
    await b.close()
asyncio.run(main())
