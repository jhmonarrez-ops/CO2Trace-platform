# LCA Carbon Ledger — notes for Claude

- Single static page: `index.html` (inline CSS + JS, no build). Fonts from Google Fonts only.
- Data model: `state = { company, year, fuName, fuQty, boundary, isExample, rows[] }`; each row `{ id, stage, key, supplier, note, qty, unit, ef (kg CO2e/unit), scope, evidence: { doc, ref, period, verified, files[{fid,name,size,type,added}] } }`. Evidence file blobs live in IndexedDB db `lca-evidence`, store `files`, keyed by fid.
- `STAGES`, `FACTORS`, `CATS` (emission categories = factor kind) and `DOCS` (evidence document types) are defined at the top of the script. Defaults: `defaultScope()`, `defaultDoc()`.
- Persisted in localStorage key `lca-ledger-v1`.
- Published copy (claude.ai artifact): https://claude.ai/artifact/84bMVNrhpBWEaeDiyyib1K
- Theme tokens on `:root` with dark-mode overrides; keep colors as tokens.
