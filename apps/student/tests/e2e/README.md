# Browser end-to-end tests (Playwright, Python)

Each script drives the built web preview like a real user (mobile viewport) and prints `PASS` / `FAIL` lines.

```bash
# from apps/student
npm run export:web && node scripts/inline-web.mjs dist preview/bodhin-preview.html
cd preview && python3 -m http.server 8765 &
cd ../tests/e2e
for t in *.py; do python3 $t http://localhost:8765/bodhin-preview.html; done
```

| Script | Journey |
| --- | --- |
| `tutor_signup_to_admin_approval.py` | Tutor signs up → OTP → academy form → appears in Super Admin Inbox → approved → opens educator workspace |
| `learner_journey.py` | Learner signs up → explore → free enrol → paid checkout → Learn tab → notifications → payment history → refund request |
| `checkout_rules.py` | Bodhin promo codes only on Bodhin courses; student-limit block shown before paying |
| `pricing_and_limits.py` | Usage meters, add-on purchase, downgrade blocked at high usage, upgrade, white-label gate, trial |
| `desktop_layout.py` | Desktop 1440px: sidebar on every page, header search, 2-column course page + checkout, purchase, player outline panel, header actions, dialogs, learner ↔ educator switch |
| `playground.py` | Real Chromium: JS/TS/Python/SQL/HTML/React run for real, infinite loops are stopped, challenges graded, sandbox blocks access to the app, server stacks degrade honestly, projects saved/restored, phone layout |
| `educator_refunds.py` | Direct-sale refund request handled by the educator in Earnings; learner sees Refunded |

After the backend is connected, keep these journeys as the acceptance tests for each release.
