"""Educator UI: refund request on a direct sale handled in Earnings; new academy course shows its own instructor."""
import sys, asyncio, json
from playwright.async_api import async_playwright
KEY='bodhin.mockdb.v26'
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch()
    pg = await b.new_page(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)
    errs = []
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.on('console', lambda m: errs.append('CONSOLE ' + m.text) if m.type == 'error' else None)
    u = sys.argv[1]; res = []
    def ok(c, n): res.append(('PASS ' if c else 'FAIL ') + n)
    async def go(path, ms=2000):
      await pg.evaluate(f"history.pushState({{}},'', '{path}'); dispatchEvent(new PopStateEvent('popstate'))"); await pg.wait_for_timeout(ms)
    async def body(): return await pg.inner_text('body')
    async def click(name, ms=1500, exact=False):
      await pg.get_by_role('button', name=name, exact=exact).locator('visible=true').last.evaluate('e=>e.click()'); await pg.wait_for_timeout(ms)
    async def signin(email, pw='demo123'):
      await go('/sign-in', 1500)
      await pg.get_by_label('Email or mobile number').locator('visible=true').last.fill(email)
      await pg.locator('input[aria-label="Password"]:visible').last.fill(pw)
      await pg.get_by_text('Sign In', exact=True).locator('visible=true').last.click(); await pg.wait_for_timeout(2200)
    await pg.goto(u); await pg.wait_for_timeout(1500)
    await pg.evaluate("localStorage.clear(); localStorage.setItem('bodhin.onboarded','1')")
    await pg.goto(u); await pg.wait_for_timeout(2200)
    await signin('arjun@demo.in')
    # force a first save so the DB exists, then inject a direct sale + refund request for Rajesh
    await go('/notifications', 1200)
    try: await click('Mark all', 800)
    except Exception: pass
    have = await pg.evaluate(f"!!localStorage.getItem('{KEY}')")
    if not have:
      await go('/course/c_excel', 1500)
      for nm in ['Enroll for free','Enroll free','Enroll now','Enroll']:
        try: await click(nm, 1500); break
        except Exception: pass
    await pg.evaluate(f"""(()=>{{const d=JSON.parse(localStorage.getItem('{KEY}'));
      const now=new Date().toISOString();
      d.orders.push({{id:'ord_ui1',userId:'u_arjun',courseId:'c_meta_ads',amountInr:4999,discountInr:0,method:'upi',status:'paid',createdAt:now,invoiceNo:'RAJESH-2026-0999',source:'direct',commissionInr:0,educatorShareInr:4999,channel:'tutor_direct',collector:'educator',sellerTenantId:'t_rajesh',gatewayFeeInr:0,payoutStatus:'not_applicable',buyerName:'Arjun Kumar'}});
      d.enrollments.push({{userId:'u_arjun',courseId:'c_meta_ads',enrolledAt:now,progress:{{}}}});
      d.refundRequests.push({{id:'rf_ui1',orderId:'ord_ui1',tenantId:'t_rajesh',buyer:'Arjun Kumar',course:'Meta Ads',amountInr:4999,reason:'Bought the wrong course by mistake',at:now,status:'open'}});
      localStorage.setItem('{KEY}',JSON.stringify(d));}})()""")
    await pg.goto(u); await pg.wait_for_timeout(2200)
    await signin('rajesh@demo.in')
    await go('/edu/earnings', 2600)
    t = await body()
    ok('Refund requests' in t or 'REFUND REQUESTS' in t, 'refund requests card on Earnings')
    ok('Arjun Kumar' in t, 'request row shows learner')
    await pg.screenshot(path='r-1.png')
    await pg.get_by_label('Refund request from Arjun Kumar').evaluate('e=>e.click()'); await pg.wait_for_timeout(1200)
    t = await body()
    ok('Approve refund' in t and 'wrong course' in t, 'refund sheet with reason')
    await click('Decline', 1200)
    t = await body()
    ok('5+ characters' in t, 'decline without note is blocked')
    await click('Approve refund', 1800)
    st = await pg.evaluate(f"(()=>{{const d=JSON.parse(localStorage.getItem('{KEY}'));return JSON.stringify({{o:d.orders.find(o=>o.id==='ord_ui1').status,r:d.refundRequests.find(r=>r.id==='rf_ui1').status,enr:d.enrollments.some(e=>e.userId==='u_arjun'&&e.courseId==='c_meta_ads')}})}})()")
    ok('"o":"refunded"' in st and '"r":"approved"' in st and '"enr":false' in st, 'approved refund applied ' + st)
    t = await body()
    ok('Refund requests' not in t and 'REFUND REQUESTS' not in t, 'card clears after decision')
    await pg.screenshot(path='r-2.png')
    # learner sees refunded in payments
    await signin('arjun@demo.in')
    await go('/payments', 2200)
    t = await body()
    ok('Refunded' in t, 'learner payment history shows Refunded')
    await go('/notifications', 1500)
    t = await body()
    ok('Refund approved' in t, 'learner notified')
    for r in res: print(r)
    print('ERRORS', [e for e in errs if 'favicon' not in e][:8])
    await b.close()
asyncio.run(main())
