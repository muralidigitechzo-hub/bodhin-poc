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
    async def go(path, ms=1500):
      await pg.evaluate(f"history.pushState({{}},'', '{path}'); dispatchEvent(new PopStateEvent('popstate'))"); await pg.wait_for_timeout(ms)
    async def body(): return await pg.inner_text('body')

    await pg.goto(u); await pg.wait_for_timeout(1500)
    await pg.evaluate("localStorage.clear(); localStorage.setItem('bodhin.onboarded','1')")
    await pg.goto(u); await pg.wait_for_timeout(2200)

    # ── 1. tutor sign up (as Udhay did) ──
    t = await body()
    ok('Sign In' in t or 'Welcome' in t, 'app loads to sign-in')
    # go to create account
    await pg.get_by_text('Sign Up', exact=True).last.evaluate('e=>e.click()'); await pg.wait_for_timeout(1500)
    await pg.screenshot(path='t-1.png')
    await pg.get_by_text('Tutor / Educator', exact=False).first.evaluate('e=>e.click()'); await pg.wait_for_timeout(400)
    await pg.get_by_label('Full name').fill('Udhay Test Tutor')
    await pg.get_by_label('Email').fill('udhaytutor@test.in')
    await pg.get_by_label('Mobile number').fill('9876012345')
    await pg.get_by_label('Password', exact=False).first.fill('demo1234')
    # agree to terms (checkbox role)
    await pg.get_by_role('checkbox').first.evaluate('e=>e.click()'); await pg.wait_for_timeout(300)
    await pg.screenshot(path='t-2.png')
    await pg.get_by_role('button', name='Continue as Educator', exact=False).last.evaluate('e=>e.click()'); await pg.wait_for_timeout(2000)
    t = await body()
    ok('code' in t.lower() or 'verif' in t.lower(), 'OTP screen shown')
    # enter OTP 123456 into the OTP field (auto-submits at 6 digits)
    await pg.get_by_label('Verification code').locator('input').fill('123456')
    await pg.wait_for_timeout(2500)
    await pg.screenshot(path='t-3.png')
    t = await body()
    ok('academy' in t.lower(), 'apply form shown after OTP')
    await pg.get_by_label('Academy name').locator('visible=true').last.fill('Udhay Maths Academy')
    await pg.get_by_label('Subjects you teach').fill('Maths, Physics')
    await pg.get_by_label('Experience (years)').fill('6')
    await pg.get_by_label('Students planned').fill('120')
    await pg.get_by_label('City').fill('Madurai')
    await pg.get_by_label('Teaching sample (optional)').fill('https://youtube.com/@udhay-teaches')
    await pg.get_by_role('button', name='Verify', exact=True).last.evaluate('e=>e.click()'); await pg.wait_for_timeout(1800)
    t = await body()
    ok('ID verified' in t, 'ID verification simulated')
    await pg.get_by_role('button', name='Submit application', exact=False).last.evaluate('e=>e.click()'); await pg.wait_for_timeout(2000)
    t = await body()
    await pg.screenshot(path='t-4.png')
    ok('Under review' in t or 'Application submitted' in t, 'application-status timeline shown')
    st = await pg.evaluate("(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('bodhin.mockdb'));if(!k)return 'NO DB';const d=JSON.parse(localStorage.getItem(k));return JSON.stringify((d.applications||[]).map(a=>({u:a.userId,s:a.status,w:a.workspaceName})))})()")
    res.append('APPLICATIONS ' + st)
    ok('Udhay Maths Academy' in st, 'application has academy details in db')

    # ── 2. sign out → admin sign-in → inbox ──
    await pg.get_by_text('Sign out', exact=False).last.evaluate('e=>e.click()'); await pg.wait_for_timeout(1500)
    await pg.get_by_label('Email or mobile number').locator('visible=true').last.fill('admin@demo.in')
    await pg.locator('input[aria-label="Password"]:visible').last.fill('demo123')
    await pg.get_by_text('Sign In', exact=True).locator('visible=true').last.click(); await pg.wait_for_timeout(2200)
    t = await body()
    await pg.screenshot(path='t-5.png')
    if 'verification' in t.lower() or 'Demo code' in t:
      await pg.get_by_label('Verification code').locator('input').last.fill('123456')
      await pg.wait_for_timeout(800)
      try:
        await pg.get_by_role('button', name='Verify', exact=False).last.evaluate('e=>e.click()')
      except Exception: pass
      await pg.wait_for_timeout(2000)
    await go('/admin', 2500)
    t = await body()
    ok('Today' in t or 'Inbox' in t or 'Approvals' in t, 'admin portal opens')
    await go('/admin/inbox', 2500)
    t = await body()
    await pg.screenshot(path='t-6.png', full_page=False)
    ok('Udhay Test Tutor' in t or 'udhaytutor' in t, 'new application visible in admin Inbox')
    res.append('INBOX SNIPPET: ' + t[:300].replace('\n', ' | '))
    # ── 3. open the new application and approve it ──
    await pg.get_by_text('Udhay Maths Academy', exact=False).first.evaluate('e=>e.click()'); await pg.wait_for_timeout(2000)
    t = await body()
    await pg.screenshot(path='t-7.png')
    ok('Maths' in t and ('Approve' in t or 'approve' in t), 'review screen shows details')
    await pg.get_by_role('button', name='Approve', exact=False).last.evaluate('e=>e.click()'); await pg.wait_for_timeout(1200)
    t = await body()
    # confirm sheet (slug + trial) if shown
    for name in ['Approve & create workspace', 'Confirm', 'Approve']:
      try:
        await pg.get_by_role('button', name=name, exact=False).last.evaluate('e=>e.click()'); await pg.wait_for_timeout(1500); break
      except Exception: pass
    st2 = await pg.evaluate("(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('bodhin.mockdb'));const d=JSON.parse(localStorage.getItem(k));const a=(d.applications||[]).find(a=>a.workspaceName==='Udhay Maths Academy');const t=(d.tenants||[]).find(t=>t.ownerUserId===a.userId);return JSON.stringify({s:a.status,tenant:!!t,plan:t?.subscription?.plan,status:t?.subscription?.status})})()")
    res.append('AFTER APPROVE ' + st2)
    ok('"s": "approved"' in st2 or '"s":"approved"' in st2, 'application approved')
    ok('"status": "trialing"' in st2 or '"status":"trialing"' in st2, 'workspace created on Growth trial')
    # ── 4. tutor signs back in → opens workspace ──
    await go('/sign-in', 1500)
    await pg.get_by_label('Email or mobile number').locator('visible=true').last.fill('udhaytutor@test.in')
    await pg.locator('input[aria-label="Password"]:visible').last.fill('demo1234')
    await pg.get_by_text('Sign In', exact=True).locator('visible=true').last.click(); await pg.wait_for_timeout(2200)
    t = await body()
    await pg.screenshot(path='t-8.png')
    if 'Open my educator workspace' in t:
      await pg.get_by_role('button', name='Open my educator workspace', exact=False).last.evaluate('e=>e.click()'); await pg.wait_for_timeout(2200)
      t = await body()
    ok('Udhay Maths Academy' in t or 'educator' in t.lower() or 'Dashboard' in t, 'approved tutor reaches educator home')
    await pg.screenshot(path='t-9.png')

    for r in res: print(r)
    print('ERRORS', [e for e in errs if 'favicon' not in e][:6])
    await b.close()

asyncio.run(main())
