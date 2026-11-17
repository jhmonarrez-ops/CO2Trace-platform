# Dev log

## 2026-11-17
- Phone use part 1 (P-20261117-2): public pages at 360/390/430 — no sideways scroll, menu sheet, 44 px taps, safe-area, one-column stacks; `site.webmanifest` + theme-color; icons in `brand/`.
- Restored Plans (P-20261117-1): removed `no-plans` from `<html>`; section, nav/footer links and help-chat prices show again; amounts unchanged.
- Verify P-1: CSP OK; scripts `node --check` OK; Playwright `?demo` — 3 cards, US/MX prices, yearly = 10/12, stack at 390 px, help “precios” → three plans, no console errors.
- Verify P-2 part 1: CSP OK; scripts OK; Playwright 360/390/430 × `/` + `/?demo` — no H-scroll, menu Esc/button, stacks, ≥44 px taps, 16 px inputs, manifest/icons, no console errors.
- Next: phone use part 2 (P-20261117-2).
