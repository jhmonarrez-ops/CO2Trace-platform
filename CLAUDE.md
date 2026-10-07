# LCA Carbon Ledger — notes for Claude

- Single static page: `index.html` (inline CSS + JS, no build). Fonts from Google Fonts only.
- Data model: `state = { company, year, fuName, fuQty, boundary: 'gate'|'grave', isExample, rows[] }`; each row `{ id, stage, key, note, qty, unit, ef (kg CO2e/unit), scope }`.
- `STAGES` and `FACTORS` arrays at top of the script define life-cycle stages and the emission-factor library. Scope defaults come from `defaultScope()`.
- Persisted in localStorage key `lca-ledger-v1`.
- Published copy (claude.ai artifact): https://claude.ai/artifact/84bMVNrhpBWEaeDiyyib1K
- Theme tokens on `:root` with dark-mode overrides; keep colors as tokens.
