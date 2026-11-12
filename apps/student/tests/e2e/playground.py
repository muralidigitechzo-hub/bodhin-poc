"""Playground end-to-end (real Chromium): every browser stack runs real code, challenges are graded, sandbox holds, server stacks degrade honestly.
Usage: python3 playground.py http://localhost:8765/bodhin-preview.html [RT_DIR]
RT_DIR = folder with pyodide/, sqljs/, react.production.min.js, react-dom.production.min.js (built automatically from node_modules + npm if omitted)."""
import sys, os, asyncio, subprocess, tempfile, shutil, threading, http.server, functools, glob
from playwright.async_api import async_playwright

APP = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))

def build_rt():
    d = tempfile.mkdtemp(prefix='bodhin-rt-')
    shutil.copytree(os.path.join(APP, 'node_modules', 'pyodide'), os.path.join(d, 'pyodide'))
    shutil.copytree(os.path.join(APP, 'node_modules', 'sql.js', 'dist'), os.path.join(d, 'sqljs'))
    pk = os.path.join(d, 'pk'); os.makedirs(pk)
    subprocess.run(['npm', 'pack', 'react@18.3.1', 'react-dom@18.3.1', '--silent'], cwd=pk, check=True, capture_output=True)
    for t, f in (('react-18', 'react.production.min.js'), ('react-dom-18', 'react-dom.production.min.js')):
        tgz = glob.glob(os.path.join(pk, t + '*.tgz'))[0]
        subprocess.run(['tar', 'xzf', tgz, '-C', pk, '--one-top-level=' + t], check=True)
        shutil.copy(os.path.join(pk, t, 'package', 'umd', f), os.path.join(d, f))
    return d

class CORS(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*'); super().end_headers()
    def log_message(self, *a): pass

def serve(d, port):
    h = functools.partial(CORS, directory=d)
    s = http.server.ThreadingHTTPServer(('127.0.0.1', port), h); threading.Thread(target=s.serve_forever, daemon=True).start(); return s

async def main():
    url = sys.argv[1]; rt = sys.argv[2] if len(sys.argv) > 2 else build_rt(); serve(rt, 8766)
    RT = '{"pyodide":"http://127.0.0.1:8766/pyodide/","sqljs":"http://127.0.0.1:8766/sqljs/","react":"http://127.0.0.1:8766/react.production.min.js","reactDom":"http://127.0.0.1:8766/react-dom.production.min.js"}'
    res = []
    def ok(c, n):
        line = ('PASS ' if c else 'FAIL ') + n; res.append(line); print(line, flush=True)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1440, 'height': 1000})
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        pg.on('console', lambda m: errs.append('CONSOLE ' + m.text) if m.type == 'error' and 'favicon' not in m.text else None)
        async def go(path, ms=1800):
            await pg.evaluate(f"history.pushState({{}},'', '{path}'); dispatchEvent(new PopStateEvent('popstate'))"); await pg.wait_for_timeout(ms)
        async def body(): return await pg.inner_text('body')
        async def signin(email):
            await go('/sign-in', 1500)
            await pg.get_by_label('Email or mobile number').locator('visible=true').last.fill(email)
            await pg.locator('input[aria-label="Password"]:visible').last.fill('demo123')
            await pg.get_by_text('Sign In', exact=True).locator('visible=true').last.click(); await pg.wait_for_timeout(2400)
        async def set_code(text, idx=0):
            ed = pg.locator('.cm-content').nth(idx); await ed.click(); await pg.keyboard.press('Control+A'); await pg.keyboard.insert_text(text); await pg.wait_for_timeout(250)
        async def click(name, exact=True):
            await pg.get_by_role('button', name=name, exact=exact).locator('visible=true').first.evaluate('e=>e.click()')
        async def wait_text(t, ms=45000):
            try: await pg.wait_for_function('t => document.body.innerText.includes(t)', arg=t, timeout=ms); return True
            except Exception: return False

        await pg.goto(url); await pg.wait_for_timeout(1200)
        await pg.evaluate("localStorage.clear(); localStorage.setItem('bodhin.onboarded','1'); localStorage.setItem('bodhin.rt', %r)" % RT)
        await pg.goto(url); await pg.wait_for_timeout(2000)
        await signin('arjun@demo.in')

        # ───── home ─────
        await go('/playground'); t = await body()
        ok('Playground' in t and 'Server runs left today' in t, 'playground home opens with stats')
        ok(all(x in t for x in ['HTML · CSS · JS', 'JavaScript', 'Python', 'SQL', 'Java', 'Rust', 'Kotlin']) and 'Challenges' in t, 'all stack groups + challenges are listed')
        await go('/home'); ok('Code Playground' in await body(), 'Home screen links to the Playground')
        await pg.get_by_role('link', name='Playground').first.click(); await pg.wait_for_timeout(1500); ok('Server runs left today' in await body(), 'desktop sidebar opens the Playground')

        # ───── JavaScript ─────
        await go('/playground/javascript'); await click('Run code'); ok(await wait_text('Hello, Bodhin!', 8000), 'JavaScript runs and prints')
        await set_code("while(true){}"); await click('Run code')
        ok(await wait_text('Stopped: your program ran longer', 12000), 'infinite loop is stopped after 5 seconds')
        await set_code("console.log(input().toUpperCase())")
        await pg.get_by_label('Program input').fill('bodhin'); await click('Run code'); ok(await wait_text('BODHIN', 8000), 'JavaScript reads the Input box (and the app survived the loop)')
        await set_code("throw new Error('oops')"); await click('Run code'); ok(await wait_text('oops', 8000), 'JavaScript errors are shown')

        # ───── JS challenge ─────
        await go('/playground/javascript?challenge=js-sum'); ok('Add two numbers' in await body() and 'Read two integers' in await body(), 'challenge page shows the task')
        await click('Check answer'); ok(await wait_text('0/3 tests passed', 10000), 'starter code fails the tests')
        await set_code("const [a, b] = input().split(' ').map(Number);\nconsole.log(a + b);"); await click('Check answer')
        ok(await wait_text('All tests passed!', 10000) and '3/3 tests passed' in await body() and '+10 points' in await body(), 'correct answer passes and earns points')
        await set_code("console.log(7)"); await click('Check answer'); ok(await wait_text('Expected:', 10000), 'wrong answer shows expected vs got')

        # ───── TypeScript ─────
        await go('/playground/typescript'); await set_code("const n: number = 41;\nconsole.log(`answer ${n + 1}`);"); await click('Run code'); ok(await wait_text('answer 42', 8000), 'TypeScript types are stripped and run')
        await set_code("const x: = ;"); await click('Run code'); ok(await wait_text('Syntax error', 8000), 'TypeScript syntax error is explained')

        # ───── Python ─────
        await go('/playground/python'); await click('Run code'); ok(await wait_text('Hello, Bodhin!', 170000), 'Python (Pyodide) starts and prints')
        await set_code("print(1/0)"); await click('Run code'); ok(await wait_text('ZeroDivisionError', 15000), 'Python traceback is shown')
        await go('/playground/python?challenge=py-primes'); await set_code("n = int(input())\nprint(sum(1 for k in range(2, n + 1) if all(k % d for d in range(2, int(k ** 0.5) + 1))))"); await click('Check answer')
        ok(await wait_text('All tests passed!', 60000), 'Python challenge passes')
        await go('/playground/python?challenge=py-fizzbuzz'); await set_code("while True:\n    pass"); await click('Check answer'); ok(await wait_text('Stopped', 20000), 'Python infinite loop is stopped')
        await set_code("print('hi')"); await click('Run code'); ok(await wait_text('hi', 90000), 'Python restarts cleanly after a stop')

        # ───── SQL ─────
        await go('/playground/sql'); await click('Run code'); ok(await wait_text('Digital Marketing', 40000) and 'SEO Growth' in await body(), 'SQL runs and shows a result table')
        await set_code("SELEC oops"); await click('Run code'); ok(await wait_text('SQL error', 15000), 'SQL error is explained')
        await go('/playground/sql?challenge=sql-group'); await set_code("SELECT dept, ROUND(AVG(salary)) AS avg_salary FROM staff GROUP BY dept ORDER BY dept;"); await click('Check answer')
        ok(await wait_text('All tests passed!', 40000), 'SQL challenge passes against the hidden staff table')
        await set_code("SELECT dept FROM staff"); await click('Check answer'); ok(await wait_text('0/1 tests passed', 20000) or await wait_text('Expected:', 5000), 'wrong SQL fails')

        # ───── Web ─────
        await go('/playground/web'); await click('Run code'); await pg.wait_for_timeout(1200)
        fr = pg.frame_locator('iframe[title="Live preview"]'); ok(await fr.locator('h1').inner_text() == 'Hello, Bodhin!', 'HTML preview renders in the iframe')
        await fr.locator('#btn').click(); await pg.wait_for_timeout(300); ok(await fr.locator('#title').inner_text() == 'You clicked it!', 'JavaScript inside the preview works')
        sb = await pg.locator('iframe[title="Live preview"]').get_attribute('sandbox'); ok(sb == 'allow-scripts', f'preview is sandboxed without same-origin (sandbox="{sb}")')
        await pg.get_by_role('tab', name='File script.js').first.evaluate('e=>e.click()'); await pg.wait_for_timeout(300)
        await set_code("try { parent.document.title; console.log('LEAK'); } catch (e) { console.log('blocked'); }\ntry { localStorage.getItem('x'); console.log('LEAK2'); } catch (e) { console.log('blocked2'); }"); await click('Run code')
        out = pg.get_by_label('Program output').locator('visible=true').first
        await wait_text('blocked2', 8000); o = await out.inner_text()
        ok('blocked2' in o and 'LEAK' not in o, 'student code cannot touch Bodhin’s page or storage')
        await go('/playground/web?challenge=web-list')
        await click('Check answer'); ok(await wait_text('tests passed', 10000) and 'All tests passed' not in await body(), 'empty list page fails')
        await pg.get_by_role('tab', name='File index.html').first.evaluate('e=>e.click()'); await set_code('<ul id="skills"><li>HTML</li><li>CSS</li><li>JS</li></ul>')
        await pg.get_by_role('tab', name='File style.css').first.evaluate('e=>e.click()'); await set_code('#skills li { color: red; }')
        await click('Check answer'); ok(await wait_text('All tests passed!', 10000), 'web challenge passes (structure + computed style)')
        await go('/playground/web?challenge=web-click'); await pg.get_by_role('tab', name='File script.js').first.evaluate('e=>e.click()'); await set_code("document.getElementById('out').textContent = 'Ready';")
        await click('Check answer'); ok(await wait_text('All tests passed!', 10000), 'JavaScript-driven DOM challenge passes')

        # ───── React ─────
        await go('/playground/react'); await click('Run code'); await pg.wait_for_timeout(1500)
        fr = pg.frame_locator('iframe[title="Live preview"]'); ok('Count: 0' in await fr.locator('h1').inner_text(), 'React renders App')
        await fr.get_by_role('button', name='Add one').click(); await pg.wait_for_timeout(300); ok('Count: 1' in await fr.locator('h1').inner_text(), 'React state updates on click')
        await set_code("function App() { return <div>"); await click('Run code'); ok(await wait_text('Syntax error', 8000) or await wait_text('Unexpected', 3000), 'React syntax error is reported')

        # ───── server stacks ─────
        await go('/playground/java'); ok('Runs on server' in await body(), 'Java is marked as running on the server')
        await click('Run code'); ok(await wait_text('code server is not connected', 10000), 'without a code server, Java says so honestly')
        await go('/playground'); ok('30/30' in await body(), 'nothing was charged when no code ran')

        # ───── projects ─────
        await go('/playground/python'); await set_code("print('saved one')"); await click('Save project')
        await pg.get_by_label('Project name').locator('visible=true').last.fill('My python practice'); await click('Save'); ok(await wait_text('Saved to My projects', 5000), 'project saved')
        await go('/playground'); ok('My python practice' in await body(), 'saved project is listed')
        await pg.get_by_role('button', name='Open project My python practice').first.evaluate('e=>e.click()'); await pg.wait_for_timeout(1800)
        ok("print('saved one')" in await pg.locator('.cm-content').first.inner_text(), 'opening a project restores the code')
        await go('/playground'); await pg.get_by_role('button', name='Delete project My python practice').first.evaluate('e=>e.click()'); await pg.wait_for_timeout(600); ok('My python practice' not in await body(), 'project deleted')
        await go('/playground'); t = await body(); ok('Challenges solved' in t and 'Coder' in t or 'pts' in t, 'points and level are shown after solving')

        # ───── mobile ─────
        await pg.set_viewport_size({'width': 390, 'height': 800}); await go('/playground/javascript?challenge=js-fizzbuzz')
        ok(await pg.get_by_role('tab', name='Result').count() == 1 and await pg.get_by_role('tab', name='Code').count() == 1, 'phone layout has Code / Result tabs')
        await set_code("const n = Number(input());\nfor (let i = 1; i <= n; i++) console.log(i % 15 === 0 ? 'FizzBuzz' : i % 3 === 0 ? 'Fizz' : i % 5 === 0 ? 'Buzz' : i);")
        await click('Check answer'); ok(await wait_text('All tests passed!', 10000), 'phone: challenge solved, switches to Result automatically')
        sw = await pg.evaluate('document.documentElement.scrollWidth'); ok(sw <= 392, f'phone: no horizontal page scroll (scrollWidth={sw})')

        print('ERRORS', [e for e in errs][:8])
        await b.close()
    print(f"\n{sum(r.startswith('PASS') for r in res)} passed, {sum(r.startswith('FAIL') for r in res)} failed")
asyncio.run(main())
