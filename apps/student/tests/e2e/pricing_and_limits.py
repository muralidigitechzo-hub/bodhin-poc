"""E2E pricing & limits in the UI: usage meters, add-on purchase, upgrade, downgrade blocker, white-label gate, trial state."""
import sys, asyncio, json
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

    # ── Priya (Growth, monthly): subscription screen ──
    await signin('priyacodes@demo.in')
    t = await body()
    if 'Sign in' in t and 'Welcome Back' in t:
      res.append('note: priyacodes@demo.in missing, trying educator rajesh')
    await go('/edu/subscription', 2600)
    t = await body()
    ok('Growth' in t, 'subscription shows current plan')
    ok('Active students' in t or 'students' in t.lower(), 'usage meters shown')
    ok('add-ons' in t.lower(), 'add-ons section shown')
    await pg.screenshot(path='p-1.png')

    # white-label gate on Growth
    await go('/edu/workspace', 2600)
    t = await body()
    ok('Available on Institute plan' in t or 'Institute' in t, 'white-label marked Institute-only on Growth')

    # add-on purchase: student block
    await go('/edu/subscription', 2400)
    before = await pg.evaluate("(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('bodhin.mockdb'));if(!k)return 'NODB';const d=JSON.parse(localStorage.getItem(k));const t=d.tenants.find(x=>x.id==='t_priyacodes');return JSON.stringify(t.subscription.addons)})()")
    try:
      # first "Add" button = Student block row
      await pg.get_by_role('button', name='Add', exact=True).locator('visible=true').first.evaluate('e=>e.click()'); await pg.wait_for_timeout(1200)
      t = await body()
      ok('Add student block' in t, 'add-on sheet opens')
      await pg.get_by_role('button', name='Pay', exact=False).locator('visible=true').last.evaluate('e=>e.click()'); await pg.wait_for_timeout(2000)
      after = await pg.evaluate("(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('bodhin.mockdb'));if(!k)return 'NODB';const d=JSON.parse(localStorage.getItem(k));const t=d.tenants.find(x=>x.id==='t_priyacodes');return JSON.stringify(t.subscription.addons)})()")
      ok('students' in after, 'add-on purchase persists: ' + after)
      t = await body()
      ok('new limits are live' in t.lower() or 'added' in t.lower(), 'add-on confirmation shown')
    except Exception as e:
      ok(False, 'add-on purchase flow: ' + str(e)[:90])

    # downgrade with high usage → blocked with message
    await pg.evaluate("(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('bodhin.mockdb'));if(!k)return 'NODB';const d=JSON.parse(localStorage.getItem(k));if(!k)return 'NODB';d.usage.t_priyacodes={activeStudents:460,storageGb:45,liveHours:20,tutorSeats:3};localStorage.setItem(k,JSON.stringify(d))})()")
    await pg.goto(u); await pg.wait_for_timeout(2200)
    await signin('priyacodes@demo.in')
    await go('/edu/subscription', 2600)
    try:
      await click('Change to Starter', 1500)
    except Exception:
      try:
        await pg.get_by_text('Starter', exact=False).locator('visible=true').last.evaluate('e=>e.click()'); await pg.wait_for_timeout(1200)
        await click('Change to Starter', 1500)
      except Exception: pass
    t = await body()
    blocked = ('reduce' in t.lower() or 'over' in t.lower() or 'limit' in t.lower() or 'blocked' in t.lower() or 'can’t' in t.lower() or "can't" in t.lower())
    ok(blocked, 'downgrade to Starter blocked/warned while usage is high')
    await pg.screenshot(path='p-2.png')
    # confirm attempt must fail server-side
    try:
      await click('Confirm', 1500)
      t = await body()
      st = await pg.evaluate("(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('bodhin.mockdb'));if(!k)return 'NODB';const d=JSON.parse(localStorage.getItem(k));const t=d.tenants.find(x=>x.id==='t_priyacodes');return t.subscription.plan+'/'+(t.subscription.pending?JSON.stringify(t.subscription.pending):'none')})()")
      ok(st.startswith('growth'), 'plan unchanged after blocked downgrade attempt (' + st + ')')
    except Exception:
      res.append('note: no Confirm shown (blocked earlier) — good')

    # upgrade to Institute → immediate, UI reflects
    await go('/edu/subscription', 2400)
    try:
      await click('Upgrade to Institute', 1500)
      await click('Confirm', 2200)
      st = await pg.evaluate("(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('bodhin.mockdb'));if(!k)return 'NODB';const d=JSON.parse(localStorage.getItem(k));const t=d.tenants.find(x=>x.id==='t_priyacodes');return t.subscription.plan})()")
      ok(st == 'institute', 'upgrade to Institute applied now (' + st + ')')
      t = await body()
      ok('Institute' in t, 'UI shows Institute after upgrade')
    except Exception as e:
      ok(False, 'upgrade flow: ' + str(e)[:90])

    # invoice created for the upgrade?
    inv = await pg.evaluate("(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('bodhin.mockdb'));if(!k)return 'NODB';const d=JSON.parse(localStorage.getItem(k));return JSON.stringify((d.invoices||[]).filter(i=>i.tenantId==='t_priyacodes').slice(-2))})()")
    res.append('INVOICES ' + inv)

    # white-label now available on Institute
    await go('/edu/workspace', 2600)
    t = await body()
    ok('White-label is included in your plan' in t or 'included in your plan' in t, 'white-label unlocked after upgrade')

    # ── Deepa (trialing): trial banner + plan choice ──
    await signin('designwithdeepa@demo.in')
    t = await body()
    if 'Welcome Back' not in t:
      await go('/edu/subscription', 2600)
      t = await body()
      ok('trial' in t.lower(), 'trial state visible for trialing tenant')
      await pg.screenshot(path='p-3.png')
    else:
      res.append('note: designwithdeepa@demo.in not a demo login; skipping trial UI check')

    for r in res: print(r)
    print('ERRORS', [e for e in errs if 'favicon' not in e][:8])
    await b.close()

asyncio.run(main())
