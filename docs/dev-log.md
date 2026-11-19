# Dev log

## 2026-11-19
- Publish privacy/terms (P-20261117-3 legal wording): footer Company → Privacy / Terms (Privacidad / Términos); dropped `noindex` + draft banner; live EN+ES titles; Contact (not drafts) on terms.
- Verify: CSP OK; scripts `node --check` OK; Playwright `/?demo` + `/privacy.html` + `/terms.html` at 1280+390 — footer hrefs, no banner/noindex, titles clean, no H-scroll, no console errors.
- P-20261117-4 user ideas: `docs/user-ideas.md` (15 ideas); `#start` checklist + monthly `.ics`; Later backlog + P-20261119-1/2 proposals.
- Verify P-4: CSP OK; scripts `node --check` OK; Playwright `/?demo` 1280+390 US/MX — checklist + `.ics` EN↔ES, 12 events, progress persists, examples locked, no H-scroll, no console errors.
- One-page summary: `#repTypes` card `sum` + `sumHtml` (total, scopes, top 10, evidence %); print via `#repView`.
- Verify one-page: CSP OK; scripts OK; Playwright `/?demo` 1280+390 US/MX — card, A4 content, Print, EN↔ES, examples locked, no H-scroll, no console errors.
- Base-year % badge on Total KPI: `renderKpis` pill + “vs base year” subline via `chg`/`baseYear`/`baseTotal` (same as `#c-base`).
- Verify base-year badge: CSP OK; scripts OK; Playwright `/?demo` 1280+390 US/MX — `−4.3 %` pill matches `#c-base`, EN↔ES subline, examples locked, no H-scroll, no console errors.

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
- Verify P-3 part 2: CSP OK; scripts OK; Playwright `/privacy.html` + `/terms.html` at 390 px — draft banner, noindex, EN+ES, home ≥44 px, no H-scroll, no console errors; index has zero privacy/terms links.
