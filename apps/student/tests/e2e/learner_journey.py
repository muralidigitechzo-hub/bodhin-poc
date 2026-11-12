"""E2E learner journey: fresh signup → explore → free enrol → paid checkout with coupon → learn → payments → refund → review → notifications."""
import sys, asyncio
from playwright.async_api import async_playwright

async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch()
    pg = await b.new_page(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)
    errs = []
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.on('console', lambda m: errs.append('CONSOLE ' + m.text) if m.type == 'error' else None)
    u = sys.argv[1]
    res = []
    def ok(c, n): res.append(('PASS ' if c else 'FAIL ') + n)
    async def go(path, ms=1800):
      await pg.evaluate(f"history.pushState({{}},'', '{path}'); dispatchEvent(new PopStateEvent('popstate'))"); await pg.wait_for_timeout(ms)
    async def body(): return await pg.inner_text('body')
    async def click(name, ms=1500, exact=False):
      await pg.get_by_role('button', name=name, exact=exact).locator('visible=true').last.evaluate('e=>e.click()'); await pg.wait_for_timeout(ms)

    await pg.goto(u); await pg.wait_for_timeout(1500)
    await pg.evaluate("localStorage.clear(); localStorage.setItem('bodhin.onboarded','1')")
    await pg.goto(u); await pg.wait_for_timeout(2200)

    # ── 1. learner sign up with OTP ──
    await pg.get_by_text('Sign Up', exact=True).last.evaluate('e=>e.click()'); await pg.wait_for_timeout(1500)
    await pg.get_by_label('Full name').fill('Lakshmi Learner')
    await pg.get_by_label('Email').fill('lakshmi@test.in')
    await pg.get_by_label('Mobile number').fill('9876098760')
    await pg.get_by_label('Password', exact=False).locator('visible=true').first.fill('demo1234')
    await pg.get_by_role('checkbox').first.evaluate('e=>e.click()'); await pg.wait_for_timeout(300)
    await click('Create Account', 2000)
    await pg.get_by_label('Verification code').locator('input').fill('123456'); await pg.wait_for_timeout(2500)
    t = await body()
    ok('Lakshmi' in t or 'Home' in t or 'Explore' in t, 'learner lands on home after OTP')
    await pg.screenshot(path='l-1.png')

    # ── 2. explore → course detail ──
    await go('/explore', 2200)
    t = await body()
    ok('Explore' in t or 'Categories' in t or 'courses' in t.lower(), 'explore opens')
    await go('/course/c_seo_growth', 2200)
    t = await body()
    ok('SEO' in t, 'course detail opens')
    ok('Enroll' in t or 'Buy' in t or '₹' in t, 'price/CTA visible')

    # ── 3. free course enrolment (c_excel is free in the seed) ──
    await go('/course/c_excel', 2200)
    t = await body()
    ok('Excel' in t and ('Free' in t or 'Enroll' in t), 'free course page shows')
    for nm in ['Enroll for free', 'Enroll free', 'Start learning', 'Enroll now', 'Enroll']:
      try:
        await click(nm, 2000); break
      except Exception: pass
    t = await body()
    ok('enrolled' in t.lower() or 'Happy learning' in t or 'Continue' in t, 'free enrolment works')

    # ── 4. paid checkout with the tutor coupon ──
    await go('/checkout/c_seo_growth', 2200)
    t = await body()
    ok('Checkout' in t and 'UPI' in t, 'checkout opens with UPI')
    ok('Sold by' in t or 'Payment, GST invoice' in t, 'seller/MoR line shown')
    # coupon: create RAJ20 exists only if seeded; use quote error tolerance
    await pg.get_by_label('Have a coupon?').locator('visible=true').last.fill('WELCOME5')
    await click('Apply', 800)
    t = await body()
    ok('not valid' in t or 'only valid on Bodhin' in t, 'Bodhin code rejected on tutor course (message shown)')
    await pg.screenshot(path='l-2.png')
    await click('Pay', 4500)
    t = await body()
    ok('enrolled' in t.lower() or 'success' in t.lower() or 'Happy learning' in t, 'payment success screen')
    await pg.screenshot(path='l-3.png')

    # ── 5. appears in Learn + player opens ──
    await go('/learn', 2200)
    t = await body()
    ok('SEO' in t, 'course appears in Learn tab')
    await go('/notifications', 1800)
    t = await body()
    ok('enrolled' in t.lower() or 'invoice' in t.lower() or 'You’re enrolled' in t, 'enrolment notification present')

    # ── 6. payments history + invoice + refund request ──
    await go('/account/payments', 2200)
    t = await body()
    if 'Payments' not in t and 'Order' not in t:
      await go('/payments', 2000); t = await body()
    ok('SEO' in t and '₹' in t, 'order listed in payment history')
    # open the order row → sheet with refund section
    await pg.get_by_text('SEO', exact=False).locator('visible=true').last.evaluate('e=>e.click()'); await pg.wait_for_timeout(1500)
    t = await body()
    ok('Payment details' in t, 'payment details sheet opens')
    ok('refund' in t.lower() and 'window' in t.lower(), 'refund window text shown')
    await pg.get_by_label('Reason').locator('visible=true').last.fill('Not what I expected, too basic for me')
    await click('Request refund', 1800)
    t = await body()
    ok('under review' in t.lower(), 'refund request submitted + under review shown')
    await pg.screenshot(path='l-4.png')
    # short reason should have errored first? (validated server-side) — try again on same order: should say already reviewed
    
    st = await pg.evaluate("(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('bodhin.mockdb'));const d=JSON.parse(localStorage.getItem(k));return JSON.stringify({orders:(d.orders||[]).filter(o=>o.userId&&o.userId.startsWith('u_')&&(d.users.find(u=>u.id===o.userId)||{}).email==='lakshmi@test.in').map(o=>({st:o.status,ch:o.channel,inv:o.invoiceNo})),refunds:(d.refundRequests||[]).length})})()")
    res.append('DB ' + st)

    # ── 7. review after enrolment ──
    await go('/course/c_seo_growth', 2200)
    t = await body()
    has_rate = 'Rate' in t or 'review' in t.lower()
    res.append('note: review entry visible = ' + str(has_rate))

    for r in res: print(r)
    print('ERRORS', [e for e in errs if 'favicon' not in e][:8])
    await b.close()

asyncio.run(main())
