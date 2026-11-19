# CO2Trace dev backlog

Prioritised checklist for the daily Cursor run. Build APPROVED items first, top to bottom.
`[major]` items need an `approve P-…` line in `.dev/approvals.txt` (see `.cursor/rules/co2trace-context.mdc`).

## Day 1 (2026-11-17) – requested by Jorge, approved (P-20261117-1 … 4)
Build these in order. Today the runner repeats plan → build → verify up to 6 times, one item per cycle.

- [x] APPROVED (P-20261117-3 legal wording) [major] Link `privacy.html` and `terms.html` from the footer (Company column; nav not required). Drop the draft banner and `noindex` meta on both pages; retitle / reword so they are no longer “draft / not linked”. Keep substantive privacy/terms content. EN + ES stay in step.
- [x] APPROVED (P-20261117-1) [major] Plans back on the site: remove the `no-plans` class from `<html>` (index.html line 2) so `#plans`, its nav/footer links and the help chat prices show again. Check the three plans (Small / Medium / Large, monthly ↔ yearly toggle, MXN in Spanish, USD in English) render and the toggle works, and that the plans cards stack cleanly at 390 px. Keep prices exactly as they are. Run `python3 tools/security/csp.py` (the b27273c edit needed fresh hashes, see 2e848d4).
- [x] APPROVED (P-20261117-2) [major] Phone use, part 1 – public pages: at 360, 390 and 430 px wide (with and without `?demo`) there is no sideways page scroll; the header menu (`#menu`) opens and closes and every link is reachable; hero, how-it-works, examples, plans, about and footer stack in one column; tap targets ≥ 44 px; inputs/selects use font-size ≥ 16 px (no iOS zoom); safe-area padding (`viewport-fit=cover` is already set). Add a web app manifest + theme-color so it can be added to the home screen (icons from `brand/`; `manifest-src 'self'` is already in the CSP).
- [x] APPROVED (P-20261117-2) [major] Phone use, part 2 – the app: activity ledger and other wide tables scroll inside their own container (or switch to stacked cards under 600 px) instead of widening the page; Evidence and other dialogs fit the screen (full-screen sheet under 600 px, close button reachable); the charts (`#c-scope`, `#c-hot`, `#c-tgt`, `#c-unc`, `#c-sup`, `#c-gantt`, `#c-comp`) resize to the width and their hover readouts also work on tap; setup/onboarding steps are usable one-handed; the help chat does not cover the content.
- [x] [minor] Bug sweep: serve the site, load `index.html` and `index.html?demo` and `inventory.html` with Playwright at 1280 px and 390 px, collect console errors and failed requests; check every `href="#…"` has a matching `id`; check visible strings missing a Spanish `data-es`/`L()`; check switching EN↔ES and back; fix what you find with small edits (calculation results must not change). List anything not fixed in `docs/dev-log.md`.
- [x] APPROVED (P-20261117-3) [major] Missing pages, part 1: FAQ section built from the help-chat answers (index.html ~6600–6900), a Contact/Support block (support@co2trace.io, response time, what to include), and `404.html` in the site style (EN/ES, link home). Add them to the nav/footer.
- [x] APPROVED (P-20261117-3) [major] Missing pages, part 2: `privacy.html` and `terms.html` drafts in the site style (EN/ES) describing what the site really does today (data saved only in this browser, no tracking, contact address). Mark both visibly "Draft – pending review" and add `<meta name="robots" content="noindex">`; do NOT link them from the nav until Jorge approves the wording.
- [x] APPROVED (P-20261117-4) [major] User ideas: write `docs/user-ideas.md` – 12–15 features users would want, grouped by user (SME owner, sustainability/EHS manager, consultant managing several clients, supplier answering a customer request, auditor/verifier), each with one line of why, size, and `[minor]`/`[major]`. Then build the top two `[minor]` ideas that are page-only (examples: first-run "getting started" checklist with progress, downloadable CSV import template per category, monthly data-entry reminder via .ics file, print-friendly one-page summary). Add the rest to this backlog under "Later"; for majors write proposals (max 2 today).

## Later
<!-- From docs/user-ideas.md (2026-11-19); ~45 min each where possible. Shipped: checklist + monthly .ics. -->
- [x] [minor] Print-friendly one-page summary (A4: total, scopes, top lines, evidence %) without the full ISO report.
- [x] [minor] Base-year vs current % badge on the total KPI tile.
- [ ] [minor] Board-pack uncertainty blurb (plain-language paragraph under `#c-unc` for copy).
- [ ] [minor] Consultant-branded report cover (optional local name/logo on print cover).
- [ ] [minor] One-click customer-request reply pack (sheet + CSV + cover note as browser zip).
- [ ] [minor] Portal-ready CDP Supply Chain CSV columns from existing `crAlloc()`.
- [ ] [minor] Materiality filter on the Checks card (hide items under materiality %).
- [ ] AWAITING APPROVAL (P-20261119-1) [major] Multi-client workspace switcher for consultants (cloud + data shape).
- [ ] AWAITING APPROVAL (P-20261119-2) [major] Evidence completeness trail export for auditors/verifiers.
- [ ] [major] Guided first-inventory wizard (company → fuels → electricity → materials).
- [ ] [major] Supplier chase list from Scope 3 hotspots (mailto drafts).
- [ ] [major] Side-by-side client comparison (depends on P-20261119-1).
- [ ] [major] Line-level change log since last review (needs history storage).
