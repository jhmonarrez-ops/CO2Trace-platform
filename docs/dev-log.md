# Dev log

## 2026-11-17
- Phone use part 1 (P-20261117-2): public pages at 360/390/430 — no sideways scroll, menu sheet, 44 px taps, safe-area, one-column stacks; `site.webmanifest` + theme-color; icons in `brand/`.
- Restored Plans (P-20261117-1): removed `no-plans` from `<html>`; section, nav/footer links and help-chat prices show again; amounts unchanged.
- Verify P-1: CSP OK; scripts `node --check` OK; Playwright `?demo` — 3 cards, US/MX prices, yearly = 10/12, stack at 390 px, help “precios” → three plans, no console errors.
- Verify P-2 part 1: CSP OK; scripts OK; Playwright 360/390/430 × `/` + `/?demo` — no H-scroll, menu Esc/button, stacks, ≥44 px taps, 16 px inputs, manifest/icons, no console errors.
- Phone use part 2 (P-20261117-2): app at 360–430 — ledger cards, contained table/traj/unc scroll, full-screen dialogs/viewer, chart tip + traj on tap, help pad, ≥44 px taps; fixed `.acct.db` width specificity.
- Verify P-2 part 2: CSP OK; scripts OK; Playwright 360/390/430 × `/?demo` — acceptance pass, no console errors.
- Bug sweep: Playwright 1280+390 × `/`, `/?demo`, `/inventory.html` — no console errors / failed requests; all `href="#…"` resolve; US↔MX (menu sheet on phone) OK. Fixes: sheet `.nav-tools` pills ≥44 px; region `data-es-title`; `#clearAll` `data-es`; method notes “Gantt” → Emissions by month. Left as-is: US-only goal labels (EN), social brand names, `inventory.html` draft (load-only, no rewrite).

- Verify bug sweep: CSP OK; scripts OK; Playwright 1280+390 × `/`, `/?demo`, `/inventory.html` — acceptance pass (nav-tools ≥44 px, region titles, Start blank ES, no Gantt); mp4 abort ignored (media absent).
- Missing pages part 1 (P-20261117-3): `#faq` (12 static Q&As), expanded `#support` (reply time + what to include), root `404.html` EN/ES; menu 04 + footer links. Privacy/terms left for part 2.
- Verify P-3 part 1: CSP OK; scripts OK; Playwright `/?demo` + `/404.html` + 390 px — FAQ 12 opens, support mailto/EN↔ES, menu/footer links, no H-scroll, no console errors.
- Missing pages part 2 (P-20261117-3): root `privacy.html` + `terms.html` drafts (EN/ES, draft banner, `noindex`, browser-local storage / no tracking / support@; unlinked). Linking stays AWAITING.
